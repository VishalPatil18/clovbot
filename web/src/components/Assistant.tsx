import { useCallback, useEffect, useRef, useState } from "react";
import { ask, type AskEvent, type CallbackDraft, type Citation, type Claim, type PlanOption } from "../api.ts";
import { AnswerBody } from "./AnswerBody.tsx";
import { CallbackPanel } from "./CallbackPanel.tsx";

/** FR-14. Drawn from the highest-volume bucket A drivers in docs/call-drivers.md. */
const STARTERS = [
  { title: "What is my specialist copay?", driver: "A-02" },
  { title: "Is a hearing aid covered?", driver: "A-01" },
  { title: "What tier is my drug on?", driver: "A-04" },
  { title: "How does the appeals process work?", driver: "A-11" },
  { title: "What is my out-of-pocket maximum?", driver: "A-03" },
  { title: "Do I need a referral to see a specialist?", driver: "A-13" },
];

export const MEMBER_SERVICES_DISPLAY = "1-555-0100";

interface Turn {
  id: number;
  question: string;
  answer: string;
  claims: Claim[];
  citations: Citation[];
  citationNumbers: Record<string, number>;
  unanswered: string[];
  outcome: "answered" | "refused" | "upstream_failure" | "pending";
  feedback: "yes" | "no" | null;
}

interface Props {
  /** The panel and the full-page route share this component. */
  variant: "panel" | "page";
  onExpand?: () => void;
  onClose?: () => void;
}

export function Assistant({ variant, onExpand, onClose }: Props): React.JSX.Element {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<PlanOption | null>(null);
  const [planPrompt, setPlanPrompt] = useState<{ plans: PlanOption[]; question: string } | null>(null);
  const [status, setStatus] = useState("");
  const [callback, setCallback] = useState<CallbackDraft | null>(null);
  const [limited, setLimited] = useState<string | null>(null);
  const threadEnd = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: "end" });
  }, [turns, planPrompt]);

  const submit = useCallback(
    async (question: string, planId: string | null) => {
      const trimmed = question.trim();
      if (trimmed.length === 0 || busy) return;

      const id = nextId.current;
      nextId.current += 1;
      setBusy(true);
      setPlanPrompt(null);
      setCallback(null);
      setLimited(null);
      setStatus("Searching your plan documents");
      setTurns((previous) => [
        ...previous,
        { id, question: trimmed, answer: "", claims: [], citations: [], citationNumbers: {}, unanswered: [], outcome: "pending", feedback: null },
      ]);

      const apply = (event: AskEvent): void => {
        if (event.type === "needs_plan") {
          setTurns((previous) => previous.filter((turn) => turn.id !== id));
          setPlanPrompt({ plans: event.plans, question: event.question });
          setStatus("Which plan are you on?");
          return;
        }
        if (event.type === "progress") {
          setStatus("Writing your answer");
          return;
        }
        if (event.type === "rate_limited") {
          setTurns((previous) => previous.filter((turn) => turn.id !== id));
          setLimited(event.message);
          return;
        }
        // FR-23: after two refusals in a row, stop offering to try again.
        if (event.type === "offer_callback") {
          setCallback({
            question: event.question,
            planContext: event.planContext,
            documentsSearched: event.documentsSearched,
            refusalTrigger: event.refusalTrigger,
          });
          return;
        }
        if (event.type === "error") {
          setTurns((previous) =>
            previous.map((turn) =>
              turn.id === id
                ? {
                    ...turn,
                    outcome: "upstream_failure",
                    answer: `${event.message} Please call Member Services at ${MEMBER_SERVICES_DISPLAY} (TTY 711).`,
                  }
                : turn,
            ),
          );
          return;
        }
        setTurns((previous) =>
          previous.map((turn) =>
            turn.id === id
              ? {
                  ...turn,
                  answer: event.answer,
                  claims: event.claims,
                  citations: event.citations,
                  citationNumbers: event.claimCitationNumbers ?? {},
                  unanswered: event.unanswered,
                  outcome: event.outcome,
                }
              : turn,
          ),
        );
      };

      try {
        await ask(trimmed, planId, apply);
      } catch {
        apply({ type: "error", message: "The assistant could not be reached." });
      } finally {
        setBusy(false);
        setStatus("");
      }
    },
    [busy],
  );

  const choosePlan = (option: PlanOption): void => {
    setPlan(option);
    const pending = planPrompt?.question ?? "";
    setPlanPrompt(null);
    void submit(pending, option.id);
  };

  const heading = variant === "page" ? "Member Assistant" : "Member Assistant";

  return (
    <section className={`assistant assistant--${variant}`} aria-labelledby="assistant-heading">
      <header className="assistant__header">
        <div>
          <h2 id="assistant-heading" className="assistant__title">
            {heading}
          </h2>
          <p className="assistant__context">
            Plan year 2026 · New Jersey · {plan === null ? "No plan selected" : plan.name}
          </p>
          <p className="assistant__context">Not signed in. This assistant holds no member data.</p>
        </div>
        <div className="assistant__header-actions">
          {variant === "panel" && onExpand !== undefined && (
            <button type="button" className="button button--quiet" onClick={onExpand}>
              Open full page
            </button>
          )}
          {variant === "panel" && onClose !== undefined && (
            <button type="button" className="button button--quiet" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </header>

      {/* FR-13: present in every state, including while an answer is generating. */}
      <a className="button button--human" href={`tel:${MEMBER_SERVICES_DISPLAY}`}>
        Talk to a person
      </a>

      <div className="assistant__thread" role="log" aria-live="polite" aria-label="Conversation">
        {turns.length === 0 && planPrompt === null && (
          <div className="empty">
            <h3 className="empty__title">Ask anything about your plan</h3>
            <p className="empty__body">
              You do not need to pick a plan first. I will ask only if the answer depends on it.
            </p>
            <ul className="starters" aria-label="Suggested questions">
              {STARTERS.map((starter) => (
                <li key={starter.title}>
                  <button
                    type="button"
                    className="starter"
                    onClick={() => void submit(starter.title, plan?.id ?? null)}
                  >
                    {starter.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {turns.map((turn) => (
          <article key={turn.id} className="turn" aria-label={`Question and answer ${turn.id}`}>
            <p className="turn__question">{turn.question}</p>

            {turn.outcome === "pending" ? (
              <p className="turn__pending">{status || "Working on it"}</p>
            ) : (
              <div className={`turn__answer turn__answer--${turn.outcome}`}>
                <AnswerBody
                  turnId={turn.id}
                  claims={turn.claims}
                  citations={turn.citations}
                  citationNumbers={turn.citationNumbers}
                  unanswered={turn.unanswered}
                  fallback={turn.answer}
                />

                {/* FR-27, on answered turns only. */}
                {turn.outcome === "answered" && (
                  <div className="feedback">
                    <span id={`fb-${turn.id}`}>Did this answer your question?</span>
                    <div role="group" aria-labelledby={`fb-${turn.id}`}>
                      {(["yes", "no"] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          className="button button--quiet"
                          aria-pressed={turn.feedback === value}
                          onClick={() =>
                            setTurns((previous) =>
                              previous.map((item) =>
                                item.id === turn.id ? { ...item, feedback: value } : item,
                              ),
                            )
                          }
                        >
                          {value === "yes" ? "Yes" : "No"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </article>
        ))}

        {limited !== null && (
          <div className="notice notice--limit" role="alert">
            <p>{limited}</p>
            <a className="button button--quiet" href={`tel:${MEMBER_SERVICES_DISPLAY}`}>
              Call {MEMBER_SERVICES_DISPLAY}
            </a>
          </div>
        )}

        {callback !== null && <CallbackPanel draft={callback} />}

        {planPrompt !== null && (
          <div className="plan-prompt">
            <h3 className="plan-prompt__title">Which plan are you on?</h3>
            <p>Costs differ between plans, so I need this one before I answer.</p>
            <ul className="plan-prompt__options">
              {planPrompt.plans.map((option) => (
                <li key={option.id}>
                  <button type="button" className="starter" onClick={() => choosePlan(option)}>
                    {option.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div ref={threadEnd} />
      </div>

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          const question = draft;
          setDraft("");
          void submit(question, plan?.id ?? null);
        }}
      >
        <label className="visually-hidden" htmlFor="composer-input">
          Ask a question about your plan
        </label>
        <input
          id="composer-input"
          className="composer__input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about costs, drugs, providers or appeals"
          autoComplete="off"
          maxLength={500}
        />
        <button type="submit" className="button button--primary" disabled={busy || draft.trim().length === 0}>
          {busy ? "Working" : "Ask"}
        </button>
      </form>

      <p className="assistant__status" role="status">
        {status}
      </p>

      {/* FR-15: scope disclosure, visible rather than buried. */}
      <p className="assistant__scope">
        An assistant, not a clinician. It answers only from 2026 plan documents and never decides
        coverage. Phone number and hours shown here are placeholders for this case study.
      </p>
    </section>
  );
}
