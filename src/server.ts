import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { latestSnapshotId } from "./corpus/snapshot.ts";
import { redactIdentifiers } from "./logging.ts";
import { answerTurn } from "./rag/answer-turn.ts";
import { citationLabel, citationNumbers, numberCitations, spokenAnswer } from "./rag/payload.ts";
import { needsPlanContext } from "./rag/plan-scope.ts";
import {
  CORPUS_SCOPE,
  formatPlanRef,
  planDisplayName,
  resolveIndexedPlan,
  toPlanChoices,
  type PlanChoice,
} from "./corpus/scope.ts";
import type { PlanRef } from "./types.ts";
import { stalenessWarning } from "./freshness.ts";
import type { Speech } from "./i18n.ts";
import { sendLoginCode } from "./auth/mail.ts";
import {
  currentSession,
  endSession,
  issueCode,
  memberByEmail,
  redeemCode,
  startSession,
} from "./auth/store.ts";
import {
  checkRate,
  connect,
  consecutiveRefusals,
  indexedPlans,
  readCorpusFreshness,
  FEEDBACK_REASONS,
  recordFeedback,
  type FeedbackReason,
  writeCallback,
  writeTurn,
} from "./rag/store.ts";
import { shouldPresentCallbackForm } from "./session.ts";
import { readAudio, writeAudio } from "./cache.ts";
import { degradeNotice } from "./voice/chain.ts";
import { speak, transcribe } from "./voice/providers.ts";

const PORT = Number(process.env["PORT"] ?? "5174");
const PLAN_YEAR = CORPUS_SCOPE.planYear;

/** Loaded at boot from the index, so the picker cannot outrun the corpus. */
export let PLANS: PlanChoice[] = [];

/** Read from the index, never from a disk the container may lack. */
export let CORPUS: { documentsFetchedAt: string; ingestedAt: string; planYear: number } | null = null;

/** Audio cannot be scrolled back to, so the warning is spoken too. */
const withStaleness = (spoken: string, warning: string | null): string =>
  warning === null ? spoken : `${spoken} ${warning}`;

/** Used when a question needs no plan. Retrieval scopes regardless. */
function firstIndexedPlan(): PlanRef {
  const first = PLANS[0];
  if (first === undefined) throw new Error("no plans are indexed");
  return { contractId: first.contractId, planId: first.id, planYear: first.planYear };
}


const MAX_QUESTION = 500;
const MAX_NOTE = 1_000;

/** Generous enough for a demo, low enough to bound cost. */
const SESSION_LIMIT = 20;
const SESSION_WINDOW = "1 hour";
const IP_LIMIT = 60;
const IP_WINDOW = "1 hour";

const SESSION_COOKIE = "clovbot_sid";
/* Separate from the anonymous session, and rotated on every sign-in. */
const MEMBER_COOKIE = "clovbot_member";

/** Opaque and server-issued. Carries no member identity. */
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

const memberCookie = (req: IncomingMessage): string | null =>
  new RegExp(`${MEMBER_COOKIE}=([0-9a-f-]{36})`).exec(req.headers.cookie ?? "")?.[1] ?? null;

const setMemberCookie = (res: ServerResponse, value: string, maxAge: number): void => {
  res.setHeader(
    "set-cookie",
    `${MEMBER_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${String(maxAge)}`,
  );
};

const json = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

/** Ten codes an hour per address, thirty per address family. */
const CODE_LIMIT_PER_EMAIL = 10;
const CODE_LIMIT_PER_IP = 30;

/** The cookie outlives neither cap. */
const MEMBER_COOKIE_MAX_AGE = 8 * 60 * 60;

/** Same reply either way, so this cannot enumerate enrolled addresses. */
const CODE_SENT = { sent: true } as const;

async function handleLoginRequest(body: string, res: ServerResponse, ip: string): Promise<void> {
  let email = "";
  try {
    const parsed = JSON.parse(body) as { email?: unknown };
    email = typeof parsed.email === "string" ? parsed.email.trim().slice(0, 254) : "";
  } catch {
    json(res, 400, { error: "malformed request" });
    return;
  }
  if (email.length === 0) {
    json(res, 400, { error: "email is required" });
    return;
  }

  const client = connect();
  await client.connect();
  try {
    const byEmail = await checkRate(client, `otp:${email.toLowerCase()}`, CODE_LIMIT_PER_EMAIL, "1 hour");
    const byIp = await checkRate(client, `otp-ip:${ip}`, CODE_LIMIT_PER_IP, "1 hour");
    if (!byEmail.allowed || !byIp.allowed) {
      json(res, 429, {
        error: "Too many codes requested. Wait an hour, or call Member Services.",
      });
      return;
    }

    const member = await memberByEmail(client, email);
    if (member !== null) {
      const code = await issueCode(client, member);
      const delivery = await sendLoginCode(member.email, code);
      // Never the code, and never whether the address matched anyone.
      console.log(`login code requested: delivery ${delivery.detail}`);
    }
    json(res, 200, CODE_SENT);
  } finally {
    await client.end();
  }
}

async function handleLoginVerify(body: string, res: ServerResponse): Promise<void> {
  let email = "";
  let code = "";
  try {
    const parsed = JSON.parse(body) as { email?: unknown; code?: unknown };
    email = typeof parsed.email === "string" ? parsed.email.trim().slice(0, 254) : "";
    code = typeof parsed.code === "string" ? parsed.code.slice(0, 32) : "";
  } catch {
    json(res, 400, { error: "malformed request" });
    return;
  }

  const client = connect();
  await client.connect();
  try {
    const { result, memberId } = await redeemCode(client, email, code, new Date());
    if (result.kind !== "ok" || memberId === null) {
      json(res, 401, { error: SIGN_IN_MESSAGE[result.kind] });
      return;
    }
    const sessionId = await startSession(client, memberId);
    setMemberCookie(res, sessionId, MEMBER_COOKIE_MAX_AGE);
    const { session } = await currentSession(client, sessionId, new Date());
    json(res, 200, { signedInAs: session?.displayName ?? null });
  } finally {
    await client.end();
  }
}

/** Signed in a minute ago and not now reads as a fault; say why. */
const SESSION_ENDED: Record<"idle" | "expired", string> = {
  idle: "You were signed out after 30 minutes without activity. Sign in again to see your own details.",
  expired: "Your sign-in lasted its full 8 hours and has ended. Sign in again to see your own details.",
};

/** Plain language, and never a raw error. */
const SIGN_IN_MESSAGE: Record<string, string> = {
  wrong: "That code did not match. Check it and try again, or ask for a new one.",
  expired: "That code has expired. Ask for a new one and it will arrive in a moment.",
  used: "That code has already been used. Ask for a new one to sign in again.",
  locked: "Too many tries with that code. Ask for a new one to start again.",
  ok: "",
};

async function handleLogout(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const existing = memberCookie(req);
  if (existing !== null) {
    const client = connect();
    await client.connect();
    try {
      await endSession(client, existing);
    } finally {
      await client.end();
    }
  }
  setMemberCookie(res, "", 0);
  json(res, 200, { signedOut: true });
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/plans") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ plans: PLANS, planYear: PLAN_YEAR, corpus: CORPUS }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/feedback") {
    collect(req, (body) => void handleFeedback(body, res));
    return;
  }

  if (req.method === "POST" && req.url === "/api/speak") {
    collect(req, (body) => void handleSpeak(body, res));
    return;
  }

  if (req.method === "GET" && req.url === "/api/session") {
    void (async (): Promise<void> => {
      const client = connect();
      await client.connect();
      try {
        const { session, ended } = await currentSession(client, memberCookie(req), new Date());
        // Expiry is told apart from never having signed in, so the panel can explain.
        json(res, 200, { signedInAs: session?.displayName ?? null, sessionEnded: ended });
      } finally {
        await client.end();
      }
    })();
    return;
  }

  if (req.method === "POST" && req.url === "/api/login/request") {
    collect(req, (body) => void handleLoginRequest(body, res, clientIp(req)));
    return;
  }

  if (req.method === "POST" && req.url === "/api/login/verify") {
    collect(req, (body) => void handleLoginVerify(body, res));
    return;
  }

  if (req.method === "POST" && req.url === "/api/logout") {
    void handleLogout(req, res);
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
  const memberToken = memberCookie(req);

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
    void handleAsk(body, res, session, ip, memberToken);
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

/** Logged against the turn it answers. */
async function handleFeedback(body: string, res: ServerResponse): Promise<void> {
  let turnId = "";
  let resolved: boolean | null = null;
  let reason: FeedbackReason | null = null;
  try {
    const parsed = JSON.parse(body) as {
      turnId?: unknown;
      resolved?: unknown;
      reason?: unknown;
    };
    turnId = typeof parsed.turnId === "string" ? parsed.turnId : "";
    resolved = typeof parsed.resolved === "boolean" ? parsed.resolved : null;
    // Dropped rather than stored, so this cannot become a free-text channel.
    reason = FEEDBACK_REASONS.find((allowed) => allowed === parsed.reason) ?? null;
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "malformed request" }));
    return;
  }
  if (turnId.length === 0 || resolved === null) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "turnId and resolved are required" }));
    return;
  }

  const client = connect();
  try {
    await client.connect();
    const recorded = await recordFeedback(client, turnId, resolved, reason);
    res.writeHead(recorded ? 200 : 404, { "content-type": "application/json" });
    res.end(JSON.stringify(recorded ? { recorded: true } : { error: "no such turn" }));
  } catch (error) {
    res.writeHead(503, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  } finally {
    await client.end().catch(() => {});
  }
}

/** Runs here so the provider keys stay off the page. */
async function handleSpeak(body: string, res: ServerResponse): Promise<void> {
  let text = "";
  let speech: Speech = "en";
  try {
    const parsed = JSON.parse(body) as { text?: unknown; language?: unknown };
    text = typeof parsed.text === "string" ? parsed.text.slice(0, 5_000).trim() : "";
    speech = parsed.language === "es" ? "es" : "en";
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

  // Every provider is checked: one recorded while degraded is still valid.
  const client = connect();
  await client.connect();
  try {
    const voice =
      (speech === "es" ? process.env["ELEVENLABS_VOICE_ID_SPANISH"] : undefined) ??
      process.env["ELEVENLABS_VOICE_ID"] ??
      "default";
    const cached = await readAudio(client, text, voice, ["elevenlabs", "fishaudio"]);
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
    const result = await speak(text, speech);
    const notice = degradeNotice(result);

    if (result.value === null) {
      // The browser tier: nothing to send, the page speaks it.
      res.writeHead(200, { "content-type": "application/json", "x-voice-provider": result.provider });
      res.end(JSON.stringify({ provider: result.provider, useBrowserVoice: true, notice }));
      return;
    }

    await writeAudio(client, text, voice, result.provider, result.value);
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
  } finally {
    await client.end().catch(() => {});
  }
}

/** Returns a transcript the member edits before it is sent. */
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

/** Stores the request and confirms. Nothing is sent anywhere. */
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
      // Persisted, so it is redacted like everything else.
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
  /** Resolved to a session row, never trusted as an id. */
  memberToken: string | null,
): Promise<void> {
  let question = "";
  let planId: string | null = null;
  let contractId: string | null = null;
  let language: Speech = "en";
  try {
    const parsed = JSON.parse(body) as {
      question?: unknown;
      planId?: unknown;
      contractId?: unknown;
      language?: unknown;
    };
    language = parsed.language === "es" ? "es" : "en";
    question = typeof parsed.question === "string" ? parsed.question.slice(0, MAX_QUESTION).trim() : "";
    planId = typeof parsed.planId === "string" ? parsed.planId : null;
    contractId = typeof parsed.contractId === "string" ? parsed.contractId : null;
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

  // An unindexed plan retrieves nothing and would read as a refusal.
  const planRef = planId === null ? null : resolveIndexedPlan(PLANS, contractId, planId);
  if (planId !== null && planRef === null) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unknown plan" }));
    return;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });

  // Asked only when the answer depends on it, and only once.
  if (planRef === null && needsPlanContext(question)) {
    send(res, { type: "needs_plan", plans: PLANS, question });
    res.end();
    return;
  }

  const client = connect();
  // A failure logging must not replace an answer already on screen.
  let delivered = false;
  try {
    await client.connect();

    // A clear message, never a hang or a stack trace.
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

    // From a live session row and nowhere else, so no classifier can widen it.
    const { session: member, ended } = await currentSession(client, memberToken, new Date());
    if (ended !== null) send(res, { type: "session_ended", message: SESSION_ENDED[ended] });

    const turn = await answerTurn(
      client,
      question,
      planRef ?? firstIndexedPlan(),
      {
        onToken: () => send(res, { type: "progress" }),
        language,
        ...(member === null
          ? {}
          : { memberId: member.memberId, sessionId: member.sessionId }),
      },
    );

    // Computed once so the written, spoken and saved copies agree.
    const stale = stalenessWarning(CORPUS?.planYear ?? PLAN_YEAR, new Date());

    send(res, {
      type: "answer",
      answer: turn.answer,
      // The written answer carries the source list; the spoken one must not.
      spokenAnswer: withStaleness(
        turn.payload === null ? turn.answer : spokenAnswer(turn.payload),
        stale,
      ),
      outcome: turn.outcome,
      language: turn.language,
      claims: turn.payload?.claims ?? [],
      unanswered: turn.payload?.unanswered ?? [],
      refusal: turn.payload?.refusal ?? null,
      // Ordered by first appearance, so a claim marker maps to the list.
      citations:
        turn.payload === null
          ? []
          : numberCitations(turn.payload, turn.retrieved).map((entry) => ({
              id: entry.chunk.id,
              number: entry.number,
              label: citationLabel(entry.chunk, turn.language),
              documentId: entry.chunk.documentId,
            })),
      // Includes ids merged onto a shared number, so every marker resolves.
      claimCitationNumbers:
        turn.payload === null ? {} : Object.fromEntries(citationNumbers(turn.payload, turn.retrieved)),
      headline: turn.payload?.headline ?? null,
      staleness: stale,
      latencyMs: turn.latencyMs,
    });
    delivered = true;

    const turnId = await writeTurn(client, {
      question: turn.question,
      planContext: formatPlanRef(planRef ?? firstIndexedPlan()),
      route: turn.route.paths.join("+"),
      routeReason: turn.route.reason,
      chunkIds: turn.retrieved.map((chunk) => chunk.id),
      corpusSnapshotId: latestSnapshotId(),
      outcome: turn.outcome,
      // A member's answer holds their record, and this table has no policy.
      answer: member === null ? turn.answer : null,
      provider: turn.provider,
      latencyMs: {
        ...turn.latencyMs,
        rerankTopScore: Math.round(turn.rerankTopScore * 10_000) / 10_000,
        confidenceFloor: turn.confidenceFloor,
      },
      sessionId: session,
      refusalTrigger: turn.refusalTrigger,
    });

    // After two consecutive refusals, stop offering to try again.
    send(res, { type: "turn", turnId });

    const refusals = await consecutiveRefusals(client, session);
    if (shouldPresentCallbackForm({ consecutiveRefusals: refusals })) {
      send(res, {
        type: "offer_callback",
        question: turn.question,
        planContext: formatPlanRef(planRef ?? firstIndexedPlan()),
        // The record keeps the id; the member reads the name.
        planName: planDisplayName(planRef ?? firstIndexedPlan()),
        documentsSearched: [...new Set(turn.retrieved.map((chunk) => chunk.documentId))],
        refusalTrigger: turn.refusalTrigger,
      });
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // An explicit error with the human path, never a silent uncited answer.
    if (delivered) console.error(`turn instrumentation failed: ${detail}`);
    else send(res, { type: "error", message: "Something went wrong reaching the plan documents.", detail });
  } finally {
    await client.end().catch(() => {});
    res.end();
  }
}

/**
 * Constructing a client checks only the URL, so this query is the real probe.
 * An empty result is a deploy with nothing to answer from.
 */
async function boot(): Promise<void> {
  const client = connect();
  await client.connect();
  try {
    const refs = await indexedPlans(client);
    if (refs.length === 0) throw new Error("no plans are indexed; run npm run ingest");
    PLANS = toPlanChoices(refs);
    const freshness = await readCorpusFreshness(client, latestSnapshotId());
    if (freshness !== null) {
      CORPUS = {
        documentsFetchedAt: freshness.documentsFetchedAt,
        ingestedAt: freshness.ingestedAt,
        planYear: freshness.planYear,
      };
    }
    console.log(`indexed plans: ${PLANS.map((p) => `${p.contractId}-${p.id}`).join(", ")}`);
  } finally {
    await client.end();
  }
}

await boot();

server.listen(PORT, () => {
  console.log(`api listening on http://localhost:${PORT}`);
});
