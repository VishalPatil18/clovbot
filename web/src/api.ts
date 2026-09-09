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

export interface Headline {
  label: string;
  amount: string;
  citationIds: string[];
}

export interface PlanOption {
  contractId: string;
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
      outcome: "answered" | "refused" | "upstream_failure" | "needs_login";
      claims: Claim[];
      unanswered: string[];
      refusal: { trigger: string; explanation: string } | null;
      headline: Headline | null;
      /** Non-null once the calendar has passed the corpus plan year. FR-P2-17. */
      staleness: string | null;
      citations: Citation[];
      /** Cited chunk id to display number, including ids merged onto one source. */
      claimCitationNumbers?: Record<string, number>;
      latencyMs: Record<string, number>;
    }
  | { type: "turn"; turnId: string }
  | { type: "rate_limited"; message: string }
  | {
      type: "offer_callback";
      question: string;
      planContext: string;
      planName: string;
      documentsSearched: string[];
      refusalTrigger: string | null;
    }
  | { type: "error"; message: string; detail?: string };

export interface CallbackDraft {
  question: string;
  planContext: string;
  planName: string;
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

/** FR-27. Recorded against the turn, so a "no" can be traced to its answer. */
export async function sendFeedback(turnId: string, resolved: boolean): Promise<boolean> {
  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ turnId, resolved }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export interface PlansResponse {
  plans: PlanOption[];
  planYear: number;
  corpus: { documentsFetchedAt: string; ingestedAt: string; planYear: number } | null;
}

/** What the corpus covers and when it was collected. FR-P2-16. */
export async function fetchPlans(): Promise<PlansResponse | null> {
  try {
    const response = await fetch("/api/plans");
    if (!response.ok) return null;
    return (await response.json()) as PlansResponse;
  } catch {
    // The picker still works from the needs_plan event; only the date is lost.
    return null;
  }
}

/** Reads the server-sent stream one event at a time. */
export async function ask(
  question: string,
  plan: PlanOption | null,
  onEvent: (event: AskEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, planId: plan?.id ?? null, contractId: plan?.contractId ?? null }),
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

export interface SessionState {
  signedInAs: string | null;
}

/** FR-P2-37. Asked on load so the indicator is right in every state. */
export async function fetchSession(): Promise<SessionState> {
  try {
    const response = await fetch("/api/session");
    if (!response.ok) return { signedInAs: null };
    return (await response.json()) as SessionState;
  } catch {
    return { signedInAs: null };
  }
}

/** The reply is the same whether or not the address is enrolled. */
export async function requestLoginCode(email: string): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch("/api/login/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (response.ok) return { ok: true };
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: body.error ?? "Could not send a code. Try again in a moment." };
}

export async function verifyLoginCode(
  email: string,
  code: string,
): Promise<{ ok: boolean; signedInAs?: string; error?: string }> {
  const response = await fetch("/api/login/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    signedInAs?: string;
    error?: string;
  };
  if (response.ok) return { ok: true, ...(body.signedInAs === undefined ? {} : { signedInAs: body.signedInAs }) };
  return { ok: false, error: body.error ?? "That did not work. Ask for a new code." };
}

export async function signOut(): Promise<void> {
  await fetch("/api/logout", { method: "POST" }).catch(() => undefined);
}
