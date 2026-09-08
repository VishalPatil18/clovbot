import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { latestSnapshotId } from "./corpus/snapshot.ts";
import { redactIdentifiers } from "./logging.ts";
import { answerTurn } from "./rag/answer-turn.ts";
import { citationLabel, citationNumbers, numberCitations, spokenAnswer } from "./rag/payload.ts";
import { needsPlanContext } from "./rag/plan-scope.ts";
import {
  checkRate,
  connect,
  consecutiveRefusals,
  writeCallback,
  writeTurn,
} from "./rag/store.ts";
import { shouldPresentCallbackForm } from "./session.ts";
import { audioKey, findCachedAudio, writeAudio } from "./voice/cache.ts";
import { degradeNotice } from "./voice/chain.ts";
import { speak, transcribe } from "./voice/providers.ts";

const PORT = Number(process.env["PORT"] ?? "5174");
const CONTRACT_ID = process.env["CORPUS_CONTRACT_ID"] ?? "H5141";
const PLAN_YEAR = Number(process.env["CORPUS_PLAN_YEAR"] ?? "2026");

/** Names come from the Stage 1 catalog, not from the mock's invented placeholders. */
export const PLANS = [
  { id: "004", name: "Clover Health Choice (PPO)" },
  { id: "007", name: "Clover Health Choice Value (PPO)" },
] as const;

const MAX_QUESTION = 500;
const MAX_NOTE = 1_000;

/** FR-30, NFR-SEC-02. Generous enough for a demo, low enough to bound cost. */
const SESSION_LIMIT = 20;
const SESSION_WINDOW = "1 hour";
const IP_LIMIT = 60;
const IP_WINDOW = "1 hour";

const SESSION_COOKIE = "clovbot_sid";

/** Opaque and server-issued. Carries no member identity. NFR-SEC-01. */
function sessionId(req: IncomingMessage, res: ServerResponse): string {
  const existing = /clovbot_sid=([0-9a-f-]{36})/.exec(req.headers.cookie ?? "")?.[1];
  if (existing !== undefined) return existing;

  const created = randomUUID();
  res.setHeader(
    "set-cookie",
    `${SESSION_COOKIE}=${created}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
  );
  return created;
}

const clientIp = (req: IncomingMessage): string => {
  const forwarded = req.headers["x-forwarded-for"];
  const header = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (header ?? req.socket.remoteAddress ?? "unknown").split(",")[0]?.trim() ?? "unknown";
};

const send = (res: ServerResponse, event: unknown): void => {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
};

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/plans") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ plans: PLANS, planYear: PLAN_YEAR, contractId: CONTRACT_ID }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/speak") {
    collect(req, (body) => void handleSpeak(body, res));
    return;
  }

  if (req.method === "POST" && req.url === "/api/transcribe") {
    collectBinary(req, (audio, mime) => void handleTranscribe(audio, mime, res));
    return;
  }

  if (req.method !== "POST" || (req.url !== "/api/ask" && req.url !== "/api/callback")) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  const route = req.url;
  const session = sessionId(req, res);
  const ip = clientIp(req);

  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString("utf8");
    if (body.length > 10_000) req.destroy();
  });

  req.on("end", () => {
    if (route === "/api/callback") {
      void handleCallback(body, res, session);
      return;
    }
    void handleAsk(body, res, session, ip);
  });
});

function collect(req: IncomingMessage, done: (body: string) => void): void {
  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString("utf8");
    if (body.length > 200_000) req.destroy();
  });
  req.on("end", () => done(body));
}

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

function collectBinary(
  req: IncomingMessage,
  done: (audio: Uint8Array, mime: string) => void,
): void {
  const parts: Buffer[] = [];
  let size = 0;
  req.on("data", (chunk: Buffer) => {
    size += chunk.byteLength;
    if (size > MAX_AUDIO_BYTES) {
      req.destroy();
      return;
    }
    parts.push(chunk);
  });
  req.on("end", () =>
    done(new Uint8Array(Buffer.concat(parts)), String(req.headers["content-type"] ?? "audio/webm")),
  );
}

/** FR-19, FR-20. Synthesis runs here so the provider keys stay off the page. */
async function handleSpeak(body: string, res: ServerResponse): Promise<void> {
  let text = "";
  try {
    const parsed = JSON.parse(body) as { text?: unknown };
    text = typeof parsed.text === "string" ? parsed.text.slice(0, 5_000).trim() : "";
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "malformed request" }));
    return;
  }
  if (text.length === 0) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "nothing to read aloud" }));
    return;
  }

  // Cache before the chain: a repeated answer is never synthesised twice. FR-20.
  // Every provider is checked, because a recording made while the chain was
  // degraded is still a valid recording of the same words.
  const voice = process.env["ELEVENLABS_VOICE_ID"] ?? "default";
  const cached = findCachedAudio(text, voice, ["elevenlabs", "fishaudio"]);
  if (cached !== null) {
    res.writeHead(200, {
      "content-type": "audio/mpeg",
      "x-voice-provider": cached.provider,
      "x-voice-cached": "1",
    });
    res.end(cached.audio);
    return;
  }

  try {
    const result = await speak(text);
    const notice = degradeNotice(result);

    if (result.value === null) {
      // The browser tier: nothing to send, the page speaks it. FR-20.
      res.writeHead(200, { "content-type": "application/json", "x-voice-provider": result.provider });
      res.end(JSON.stringify({ provider: result.provider, useBrowserVoice: true, notice }));
      return;
    }

    writeAudio(audioKey(text, voice, result.provider), result.value);
    res.writeHead(200, {
      "content-type": "audio/mpeg",
      "x-voice-provider": result.provider,
      "x-voice-cached": "0",
      ...(notice === null ? {} : { "x-voice-notice": encodeURIComponent(notice) }),
    });
    res.end(Buffer.from(result.value));
  } catch (error) {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "The answer could not be read aloud. It is on screen above.",
        detail: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

/** FR-18. Returns a transcript the member edits before it is sent. */
async function handleTranscribe(
  audio: Uint8Array,
  mime: string,
  res: ServerResponse,
): Promise<void> {
  if (audio.byteLength === 0) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "no audio received" }));
    return;
  }
  try {
    const result = await transcribe(audio, mime);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        text: result.value,
        provider: result.provider,
        notice: degradeNotice(result),
      }),
    );
  } catch (error) {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Your words could not be transcribed. Please type the question instead.",
        detail: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

/** FR-22. Stores the pre-filled request and confirms. Nothing is sent anywhere. */
async function handleCallback(
  body: string,
  res: ServerResponse,
  session: string,
): Promise<void> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "malformed request" }));
    return;
  }

  const question = typeof parsed["question"] === "string" ? parsed["question"].slice(0, MAX_QUESTION) : "";
  if (question.trim().length === 0) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "A question is required so a person knows what to call about." }));
    return;
  }

  const client = connect();
  try {
    await client.connect();
    const id = await writeCallback(client, {
      // FR-31 applies here too: this text is persisted.
      question: redactIdentifiers(question),
      planContext: typeof parsed["planContext"] === "string" ? parsed["planContext"] : null,
      documentsSearched: Array.isArray(parsed["documentsSearched"])
        ? parsed["documentsSearched"].filter((entry): entry is string => typeof entry === "string")
        : [],
      refusalTrigger: typeof parsed["refusalTrigger"] === "string" ? parsed["refusalTrigger"] : null,
      note: typeof parsed["note"] === "string" ? redactIdentifiers(parsed["note"].slice(0, MAX_NOTE)) : null,
      sessionId: session,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id, confirmed: true }));
  } catch (error) {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: "The request could not be saved. Please call Member Services instead.",
        detail: error instanceof Error ? error.message : String(error),
      }),
    );
  } finally {
    await client.end().catch(() => {});
  }
}

async function handleAsk(
  body: string,
  res: ServerResponse,
  session: string,
  ip: string,
): Promise<void> {
  let question = "";
  let planId: string | null = null;
  try {
    const parsed = JSON.parse(body) as { question?: unknown; planId?: unknown };
    question = typeof parsed.question === "string" ? parsed.question.slice(0, MAX_QUESTION).trim() : "";
    planId = typeof parsed.planId === "string" ? parsed.planId : null;
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "malformed request" }));
    return;
  }

  if (question.length === 0) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "question is required" }));
    return;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });

  // FR-10, D-022: ask for plan only when the answer depends on it, and only
  // once per session. The member may ask anything before choosing.
  if (planId === null && needsPlanContext(question)) {
    send(res, { type: "needs_plan", plans: PLANS, question });
    res.end();
    return;
  }

  const client = connect();
  try {
    await client.connect();

    // FR-30, NFR-SEC-02. A clear message, never a hang or a stack trace.
    for (const [key, limit, window, scope] of [
      [`s:${session}`, SESSION_LIMIT, SESSION_WINDOW, "this session"],
      [`i:${ip}`, IP_LIMIT, IP_WINDOW, "this network"],
    ] as const) {
      const verdict = await checkRate(client, key, limit, window);
      if (!verdict.allowed) {
        send(res, {
          type: "rate_limited",
          message:
            `That is the limit of questions for ${scope} in the last hour. ` +
            "Please try again later, or call Member Services now.",
        });
        return;
      }
    }

    const turn = await answerTurn(
      client,
      question,
      { contractId: CONTRACT_ID, planId: planId ?? PLANS[0].id, planYear: PLAN_YEAR },
      { onToken: () => send(res, { type: "progress" }) },
    );

    send(res, {
      type: "answer",
      answer: turn.answer,
      // The written answer carries the source list; the spoken one must not.
      spokenAnswer: turn.payload === null ? turn.answer : spokenAnswer(turn.payload),
      outcome: turn.outcome,
      claims: turn.payload?.claims ?? [],
      unanswered: turn.payload?.unanswered ?? [],
      refusal: turn.payload?.refusal ?? null,
      // Numbered in order of first appearance, so a claim marker maps to the list.
      citations:
        turn.payload === null
          ? []
          : numberCitations(turn.payload, turn.retrieved).map((entry) => ({
              id: entry.chunk.id,
              number: entry.number,
              label: citationLabel(entry.chunk),
              documentId: entry.chunk.documentId,
            })),
      // Every cited id, including ones merged onto a shared number, so a claim
      // marker resolves even when two chunks render the same citation.
      claimCitationNumbers:
        turn.payload === null ? {} : Object.fromEntries(citationNumbers(turn.payload, turn.retrieved)),
      latencyMs: turn.latencyMs,
    });

    await writeTurn(client, {
      question: turn.question,
      planContext: `${CONTRACT_ID}-${planId ?? PLANS[0].id}`,
      chunkIds: turn.retrieved.map((chunk) => chunk.id),
      corpusSnapshotId: latestSnapshotId(),
      outcome: turn.outcome,
      provider: turn.provider,
      latencyMs: {
        ...turn.latencyMs,
        rerankTopScore: Math.round(turn.rerankTopScore * 10_000) / 10_000,
        confidenceFloor: turn.confidenceFloor,
      },
      sessionId: session,
      refusalTrigger: turn.refusalTrigger,
    });

    // FR-23. After two consecutive refusals, stop offering to try again.
    const refusals = await consecutiveRefusals(client, session);
    if (shouldPresentCallbackForm({ consecutiveRefusals: refusals })) {
      send(res, {
        type: "offer_callback",
        question: turn.question,
        planContext: `${CONTRACT_ID}-${planId ?? PLANS[0].id}`,
        documentsSearched: [...new Set(turn.retrieved.map((chunk) => chunk.documentId))],
        refusalTrigger: turn.refusalTrigger,
      });
    }
  } catch (error) {
    // FR-25: an upstream failure is an explicit error state with the human path,
    // never a silent degrade into an uncited answer.
    send(res, {
      type: "error",
      message: "Something went wrong reaching the plan documents.",
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await client.end().catch(() => {});
    res.end();
  }
}

server.listen(PORT, () => {
  console.log(`api listening on http://localhost:${PORT}`);
});
