export interface Citation {
  id: string;
  label: string;
  documentId: string;
}

export interface Claim {
  text: string;
  citationIds: string[];
}

export interface PlanOption {
  id: string;
  name: string;
}

export type AskEvent =
  | { type: "needs_plan"; plans: PlanOption[]; question: string }
  | { type: "progress" }
  | {
      type: "answer";
      answer: string;
      outcome: "answered" | "refused" | "upstream_failure";
      claims: Claim[];
      unanswered: string[];
      refusal: { trigger: string; explanation: string } | null;
      citations: Citation[];
      latencyMs: Record<string, number>;
    }
  | { type: "error"; message: string; detail?: string };

/** Reads the server-sent stream one event at a time. */
export async function ask(
  question: string,
  planId: string | null,
  onEvent: (event: AskEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, planId }),
    ...(signal === undefined ? {} : { signal }),
  });

  if (!response.ok || response.body === null) {
    onEvent({ type: "error", message: "The assistant could not be reached." });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        onEvent(JSON.parse(line.slice(6)) as AskEvent);
      } catch {
        // Ignore a partial frame; the next read completes it.
      }
    }
  }
}
