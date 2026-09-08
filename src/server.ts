import { createServer, type ServerResponse } from "node:http";
import { latestSnapshotId } from "./corpus/snapshot.ts";
import { answerTurn } from "./rag/answer-turn.ts";
import { citationLabel } from "./rag/payload.ts";
import { needsPlanContext } from "./rag/plan-scope.ts";
import { connect, writeTurn } from "./rag/store.ts";

const PORT = Number(process.env["PORT"] ?? "5174");
const CONTRACT_ID = process.env["CORPUS_CONTRACT_ID"] ?? "H5141";
const PLAN_YEAR = Number(process.env["CORPUS_PLAN_YEAR"] ?? "2026");

/** Names come from the Stage 1 catalog, not from the mock's invented placeholders. */
export const PLANS = [
  { id: "004", name: "Clover Health Choice (PPO)" },
  { id: "007", name: "Clover Health Choice Value (PPO)" },
] as const;

const MAX_QUESTION = 500;

const send = (res: ServerResponse, event: unknown): void => {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
};

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/plans") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ plans: PLANS, planYear: PLAN_YEAR, contractId: CONTRACT_ID }));
    return;
  }

  if (req.method !== "POST" || req.url !== "/api/ask") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  let body = "";
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString("utf8");
    if (body.length > 10_000) req.destroy();
  });

  req.on("end", () => {
    void handleAsk(body, res);
  });
});

async function handleAsk(body: string, res: ServerResponse): Promise<void> {
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
    const turn = await answerTurn(
      client,
      question,
      { contractId: CONTRACT_ID, planId: planId ?? PLANS[0].id, planYear: PLAN_YEAR },
      { onToken: () => send(res, { type: "progress" }) },
    );

    send(res, {
      type: "answer",
      answer: turn.answer,
      outcome: turn.outcome,
      claims: turn.payload?.claims ?? [],
      unanswered: turn.payload?.unanswered ?? [],
      refusal: turn.payload?.refusal ?? null,
      citations: turn.retrieved
        .filter((chunk) => turn.citedIds.includes(chunk.id))
        .map((chunk) => ({ id: chunk.id, label: citationLabel(chunk), documentId: chunk.documentId })),
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
    });
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
