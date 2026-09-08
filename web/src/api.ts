export interface Citation {
  id: string;
  /** Position in the turn's source list; the marker shown beside a claim. */
  number: number;
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
      /** The answer without citation markers or the source list. Read aloud. */
      spokenAnswer?: string;
      outcome: "answered" | "refused" | "upstream_failure";
      claims: Claim[];
      unanswered: string[];
      refusal: { trigger: string; explanation: string } | null;
      citations: Citation[];
      /** Cited chunk id to display number, including ids merged onto one source. */
      claimCitationNumbers?: Record<string, number>;
      latencyMs: Record<string, number>;
    }
  | { type: "rate_limited"; message: string }
  | {
      type: "offer_callback";
      question: string;
      planContext: string;
      documentsSearched: string[];
      refusalTrigger: string | null;
    }
  | { type: "error"; message: string; detail?: string };

export interface CallbackDraft {
  question: string;
  planContext: string;
  documentsSearched: string[];
  refusalTrigger: string | null;
}

/** FR-22. Validates, stores and confirms; nothing is sent anywhere. */
export async function requestCallback(
  draft: CallbackDraft,
  note: string,
): Promise<{ ok: boolean; message: string }> {
  const response = await fetch("/api/callback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...draft, note }),
  });
  const body = (await response.json()) as { error?: string };
  return response.ok
    ? { ok: true, message: "Your request is saved. A person will pick this up." }
    : { ok: false, message: body.error ?? "The request could not be saved." };
}

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
