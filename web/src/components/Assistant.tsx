import { MEMBER_SERVICES_DISPLAY, help, s, type StringKey } from "../strings.ts";
import { useIsPhone } from "../viewport.ts";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ask,
  fetchPlans,
  fetchSession,
  signOut,
  sendFeedback,
  type FeedbackReason,
  type AskEvent,
  type CallbackDraft,
  type Citation,
  type Claim,
  type Headline,
  type PlanOption,
} from "../api.ts";
import {
  IoCall,
  IoCashOutline,
  IoChatbubbleEllipses,
  IoCheckmark,
  IoDocumentTextOutline,
  IoMedkitOutline,
  IoShieldCheckmarkOutline,
  IoClose,
  IoCopy,
  IoExpand,
  IoHelpCircleOutline,
  IoLockClosedOutline,
  IoLanguage,
  IoMic,
  IoMicOff,
  IoDownloadOutline,
  IoRefresh,
  IoTrash,
  IoPlay,
  IoSend,
  IoPause,
  IoThumbsDown,
  IoThumbsUp,
  IoVolumeHigh,
  IoWarning,
} from "react-icons/io5";
import { AnswerBody } from "./AnswerBody.tsx";
import { DictateButton } from "./DictateButton.tsx";
import { CallbackPanel } from "./CallbackPanel.tsx";
import { VoiceComposer } from "./VoiceComposer.tsx";
import {
  readLanguage,
  readMode,
  speak,
  writeLanguage,
  writeMode,
  type Spoken,
  type Speech,
  type VoiceMode,
} from "../voice.ts";
import { clearHistory, clearMemberTurns, readHistory, writeHistory } from "../history.ts";
import { transcriptBlocks, transcriptFilename } from "../transcript.ts";
import { SignIn } from "./SignIn.tsx";
import { answerAsText } from "../copy.ts";
import { STEP_MS, progressMessage, type Stage } from "../progress.ts";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/** One per kind of question, so the set teaches what this is for. */
/** Paired with the copy keys so the wire value and the label cannot drift. */
const REASONS = [
  { value: "wrong_plan", key: "reasonWrongPlan" },
  { value: "not_what_i_asked", key: "reasonNotAsked" },
  { value: "hard_to_understand", key: "reasonHardToRead" },
  { value: "think_it_is_covered", key: "reasonThinkCovered" },
] as const satisfies readonly { value: FeedbackReason; key: StringKey }[];

const STARTERS = [
  {
    // A card that sends something other than what it shows is a small lie.
    question: "What is my specialist copay?",
    caption: "Costs for visits, urgent care and the emergency room.",
    icon: IoCashOutline,
    driver: "A-02",
  },
  {
    question: "What tier is my drug on?",
    caption: "Drug coverage, tiers, and any limits on a prescription.",
    icon: IoMedkitOutline,
    driver: "A-04",
  },
  {
    question: "Is a hearing aid covered?",
    caption: "Dental, vision, hearing and your other extra benefits.",
    icon: IoShieldCheckmarkOutline,
    driver: "A-01",
  },
  {
    question: "How does the appeals process work?",
    caption: "Appeals, referrals and prior authorisation, step by step.",
    icon: IoDocumentTextOutline,
    driver: "A-11",
  },
];

export { MEMBER_SERVICES_DISPLAY };

interface Turn {
  id: number;
  question: string;
  answer: string;
  claims: Claim[];
  citations: Citation[];
  citationNumbers: Record<string, number>;
  unanswered: string[];
  headline: Headline | null;
  staleness: string | null;
  outcome: "answered" | "refused" | "upstream_failure" | "needs_login" | "pending";
  feedback: "yes" | "no" | null;
  /** Why they said no, once they have said. */
  feedbackReason: FeedbackReason | null;
  /** Server id, so feedback can name the turn it answers. */
  turnId: string | null;
}

interface Props {
  /** Element id the full-page layout wants the tools rendered into. */
  railId?: string;
  /** Held by the shell so a closed panel does not discard a typed question. */
  draft?: string;
  onDraftChange?: (value: string) => void;
  /** The panel and the full-page route share this component. */
  variant: "panel" | "page";
  onExpand?: () => void;
  onClose?: () => void;
}

export function Assistant({
  variant,
  railId,
  draft: draftProp,
  onDraftChange,
  onExpand,
  onClose,
}: Props): React.JSX.Element {
  const [turns, setTurns] = useState<Turn[]>(() => readHistory());
  const [ownDraft, setOwnDraft] = useState("");
  const draft = draftProp ?? ownDraft;
  const setDraft = (value: string): void => {
    if (onDraftChange !== undefined) onDraftChange(value);
    else setOwnDraft(value);
  };
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<PlanOption | null>(null);
  const [planPrompt, setPlanPrompt] = useState<{
    plans: PlanOption[];
    question: string;
  } | null>(null);
  const [status, setStatus] = useState("");
  const [callback, setCallback] = useState<CallbackDraft | null>(null);
  const [limited, setLimited] = useState<string | null>(null);
  const [mode, setMode] = useState<VoiceMode>(() => readMode());
  const [language, setLanguage] = useState<Speech>(() => readLanguage());
  const isPhone = useIsPhone();
  /** Panel chrome follows the answer's language, not a separate setting. */
  const say = useCallback((key: StringKey): string => s(key, language), [language]);
  const [spoken, setSpoken] = useState<Spoken | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [dictateError, setDictateError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [corpusDate, setCorpusDate] = useState<string | null>(null);
  const [voiceReset, setVoiceReset] = useState(0);
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  /**
   * The turn the sign-in was asked for, so the form sits under that question.
   */
  const [signingInFor, setSigningInFor] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [stageElapsed, setStageElapsed] = useState(0);
  const reduceMotion = useReducedMotion();
  const [speakingTurn, setSpeakingTurn] = useState<number | null>(null);
  /** Distinct from "not speaking": paused audio still has a place to return to. */
  const [paused, setPaused] = useState(false);
  const threadEnd = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    // Scrolling an empty thread pushed its own heading off a phone screen.
    if (turns.length === 0 && planPrompt === null) return;
    threadEnd.current?.scrollIntoView({ block: "end" });
  }, [turns, planPrompt]);

  useEffect(() => {
    if (stage === null) return;
    setStageElapsed(0);
    const started = Date.now();
    const tick = setInterval(
      () => setStageElapsed(Date.now() - started),
      STEP_MS,
    );
    return () => clearInterval(tick);
  }, [stage]);

  const progress = stage === null ? "" : progressMessage(stage, stageElapsed);

  const submit = useCallback(
    async (question: string, chosen: PlanOption | null) => {
      const trimmed = question.trim();
      if (trimmed.length === 0 || busy) return;

      const id = nextId.current;
      nextId.current += 1;
      setBusy(true);
      setPlanPrompt(null);
      setCallback(null);
      setLimited(null);
      setSigningInFor(null);
      setStage("retrieving");
      setTurns((previous) => [
        ...previous,
        {
          id,
          question: trimmed,
          answer: "",
          claims: [],
          citations: [],
          citationNumbers: {},
          unanswered: [],
          headline: null,
          staleness: null,
          outcome: "pending",
          feedback: null,
          feedbackReason: null,
          turnId: null,
        },
      ]);

      const apply = (event: AskEvent): void => {
        if (event.type === "answer" && event.language !== undefined && event.language !== language) {
          setLanguage(event.language);
          writeLanguage(event.language);
        }
        if (event.type === "answer" && event.outcome === "needs_login") {
          setSigningInFor(id);
        }
        if (event.type === "needs_plan") {
          setPlanOptions(event.plans);
          setTurns((previous) => previous.filter((turn) => turn.id !== id));
          setPlanPrompt({ plans: event.plans, question: event.question });
          setStage(null);
          setStatus(say("whichPlan"));
          return;
        }
        if (event.type === "progress") {
          setStage("writing");
          return;
        }
        if (event.type === "turn") {
          setTurns((previous) =>
            previous.map((turn) =>
              turn.id === id ? { ...turn, turnId: event.turnId } : turn,
            ),
          );
          return;
        }
        if (event.type === "rate_limited") {
          setTurns((previous) => previous.filter((turn) => turn.id !== id));
          setLimited(event.message);
          return;
        }
        // After two refusals in a row, stop offering to try again.
        if (event.type === "offer_callback") {
          setCallback({
            question: event.question,
            planContext: event.planContext,
            planName: event.planName,
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
        // Audio is never the only copy, and the source list is read, not spoken.
        const toSpeak = (event.spokenAnswer ?? event.answer).trim();
        if (mode === "voice" && toSpeak.length > 0) {
          void speak(toSpeak)
            .then((audio) => {
              setSpoken(audio);
              setVoiceNotice(audio.notice);
              // The border follows the audio, so it never marks a stale answer.
              audio.onStateChange((speaking) =>
                setSpeakingTurn(speaking ? id : null),
              );
              audio.play();
            })
            .catch((caught: unknown) => {
              setVoiceNotice(
                caught instanceof Error
                  ? caught.message
                  : "The answer could not be read aloud.",
              );
            });
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
                  headline: event.headline,
                  staleness: event.staleness,
                  outcome: event.outcome,
                }
              : turn,
          ),
        );
      };

      try {
        await ask(trimmed, chosen, apply, undefined, language);
      } catch {
        apply({
          type: "error",
          message: "The assistant could not be reached.",
        });
      } finally {
        setBusy(false);
        setStage(null);
        setStatus("");
      }
    },
    [busy, language, mode],
  );

  const [planOptions, setPlanOptions] = useState<PlanOption[]>([]);

  // Answers keep the plan they were given under; switching rewrites nothing.
  const changePlan = (): void => {
    setPlanPrompt({ plans: planOptions, question: "" });
  };

  // Dismissing hands the question back: a close should not cost what they typed.
  const dismissPlanPrompt = (): void => {
    const pending = planPrompt?.question ?? "";
    setPlanPrompt(null);
    if (pending.length > 0 && draft.trim().length === 0) setDraft(pending);
  };

  const choosePlan = (option: PlanOption): void => {
    setPlan(option);
    const pending = planPrompt?.question ?? "";
    setPlanPrompt(null);
    if (pending.length > 0) void submit(pending, option);
  };

  // Loaded before any plan-scoped question, so both controls exist first.
  useEffect(() => {
    void fetchSession().then((state) => setSignedInAs(state.signedInAs));
  }, []);

  useEffect(() => {
    void fetchPlans().then((response) => {
      if (response === null) return;
      setPlanOptions(response.plans);
      setCorpusDate(response.corpus?.documentsFetchedAt.slice(0, 10) ?? null);
    });
  }, []);

  // On every settled turn: mobile browsers do not reliably fire unload.
  useEffect(() => {
    writeHistory(turns);
  }, [turns]);

  // The member never retypes: the gated question is asked again on return.
  const resumeAfterLogin = (name: string): void => {
    setSignedInAs(name);
    const pending = turns.find((turn) => turn.id === signingInFor)?.question ?? null;
    setSigningInFor(null);
    if (pending === null) return;
    setTurns((previous) => previous.filter((turn) => turn.outcome !== "needs_login"));
    void submit(pending, plan);
  };

  const leave = async (): Promise<void> => {
    await signOut();
    setSignedInAs(null);
    setTurns(clearMemberTurns());
  };

  const resetVoice = (): void => {
    spoken?.stop();
    setSpoken(null);
    setSpeakingTurn(null);
    setVoiceNotice(null);
    setDictateError(null);
    // Remounts the composer, which owns its own listening and review phases.
    setVoiceReset((token) => token + 1);
  };

  const startOver = (): void => {
    resetVoice();
    setTurns([]);
    setPlan(null);
    setPlanPrompt(null);
    setCallback(null);
    setStatus("");
  };

  const forgetHistory = (): void => {
    resetVoice();
    clearHistory();
    setTurns([]);
  };

  const copyAnswer = (turn: Turn): void => {
    const text = answerAsText(
      { ...turn, staleness: turn.staleness },
      plan?.name ?? "No plan selected",
      corpusDate ?? "unknown",
    );
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(turn.id);
        setTimeout(() => setCopied(null), 3_000);
      },
      () =>
        setStatus("Could not copy. Select the answer and copy it yourself."),
    );
  };

  const heading = "Clovbot - Member Assistant";

  // Panel header, or the full page's rail. One markup, two homes.
  const modeControl = (
            <button
              type="button"
              className="assistant__mode"
              aria-pressed={mode === "voice"}
              onClick={() => {
                const next: VoiceMode = mode === "voice" ? "text" : "voice";
                spoken?.stop();
                setSpeakingTurn(null);
                setMode(next);
                writeMode(next);
              }}
            >
              {mode === "voice" ? (
                <IoMicOff aria-hidden="true" />
              ) : (
                <IoMic aria-hidden="true" />
              )}
              {mode === "voice"
                ? say(isPhone ? "switchToTextShort" : "switchToText")
                : say(isPhone ? "switchToVoiceShort" : "switchToVoice")}
            </button>
  );

  /** Named in the language it switches to, so either member can read it. */
  const languageControl = (
    <button
      type="button"
      className="assistant__mode"
      lang={language === "es" ? "en" : "es"}
      onClick={() => {
        const next: Speech = language === "es" ? "en" : "es";
        spoken?.stop();
        setSpeakingTurn(null);
        setLanguage(next);
        writeLanguage(next);
      }}
    >
      <IoLanguage aria-hidden="true" />
      {language === "es" ? "English" : "Español"}
    </button>
  );

  const helpControl = (
    <button
      type="button"
      className={railId === undefined || isPhone ? "assistant__icon-button" : "assistant__mode"}
      aria-expanded={helpOpen}
      aria-controls="assistant-help"
      onClick={() => setHelpOpen((open) => !open)}
    >
      <IoHelpCircleOutline aria-hidden="true" />
      {/* Icon-only beside the close control; labelled in the rail, where it sits
          with the other named tools. */}
      {railId === undefined || isPhone ? (
        <span className="visually-hidden">{helpOpen ? "Hide help" : "Show help"}</span>
      ) : (
        <>{helpOpen ? "Hide help" : "Show help"}</>
      )}
    </button>
  );

  const startOverChip = (
    <button type="button" className="chip" onClick={startOver}>
      <IoRefresh aria-hidden="true" /> {say("startOver")}
    </button>
  );
  /** On the device: posting a member's answer would put their record on the wire. */
  const saveTranscript = async (): Promise<void> => {
    const savedOn = new Date();
    const context = {
      planName: plan?.name ?? null,
      documentDate: corpusDate,
      language,
      savedOn,
    };
    try {
      const { renderTranscript } = await import("../pdf.ts");
      const bytes = await renderTranscript(transcriptBlocks(turns, context), language);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = transcriptFilename(context);
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // The print view is still a clean page, and silence is worse.
      setStatus(say("transcriptFailed"));
      window.print();
    }
  };

  const savePdfChip = (
    <button type="button" className="chip chip--compact" onClick={() => void saveTranscript()}>
      <IoDownloadOutline aria-hidden="true" /> {say("savePdf")}
    </button>
  );
  const clearChip = (
    <button type="button" className="chip chip--compact" onClick={forgetHistory}>
      <IoTrash aria-hidden="true" /> {say("clearSaved")}
    </button>
  );

  const chips = (
    <div className="chips" aria-label="Quick actions">
      {/* FR-13. The human path is here in every state; the header carries only
            icon controls now. Help lives in the header and is not repeated. */}
      <a className="chip chip--human" href={`tel:${MEMBER_SERVICES_DISPLAY}`}>
        <IoCall aria-hidden="true" /> {say("talkToPerson")}
      </a>
      {startOverChip}
      {turns.length > 0 && (
        <>
          {savePdfChip}
          {clearChip}
        </>
      )}
    </div>
  );

  // Explicit order: what changes the conversation, then the destructive pair, then help.
  const railTools = (
    <div className="rail__tools">
      {modeControl}
      {languageControl}
      {startOverChip}
      {turns.length > 0 && (
        <>
          {clearChip}
          {savePdfChip}
        </>
      )}
      {helpControl}
    </div>
  );

  // A column on the full page, pinned above the composer in the panel.
  const controls = (
    <>
      {modeControl}
      {languageControl}
      {helpControl}
    </>
  );

  // A phone has no column, so the controls go beside Back and the actions stay put.
  const railTarget =
    railId === undefined ? null : document.getElementById(railId);
  const tools =
    railTarget === null
      ? chips
      : createPortal(isPhone ? controls : railTools, railTarget);

  return (
    <section
      className={`assistant assistant--${variant}${
        turns.length === 0 && planPrompt === null ? " assistant--empty" : ""
      }`}
      aria-labelledby="assistant-heading"
    >
      <header className="assistant__header">
        {/* Two rows, not four: title and controls share the top line, and the
            plan context sits on one quiet line beneath it. */}
        <div className="assistant__bar">
          <h2 id="assistant-heading" className="assistant__title">
            {heading}
          </h2>
          {/* FR-16. The choice persists across sessions. Labelled rather than
              icon-only: switching how you talk to the assistant is the one
              header control worth naming. */}
          <div className="assistant__corner">
            {railId === undefined && modeControl}
            {railId === undefined && languageControl}
            {railId === undefined && helpControl}
            {variant === "panel" && onExpand !== undefined && (
              <button
                type="button"
                className="assistant__icon-button"
                onClick={onExpand}
              >
                <IoExpand aria-hidden="true" />
                <span className="visually-hidden">{say("openFullPage")}</span>
              </button>
            )}
            {variant === "panel" && onClose !== undefined && (
              <button
                type="button"
                className="assistant__icon-button"
                onClick={onClose}
              >
                <IoClose aria-hidden="true" />
                <span className="visually-hidden">{say("closeAssistant")}</span>
              </button>
            )}
          </div>
        </div>

        <div className="assistant__meta">
          <span className="meta-chip">2026</span>
          <span className="meta-chip">New Jersey</span>
          <span className="meta-chip">
            {plan === null ? "No plan selected" : plan.name}
            {plan !== null && planOptions.length > 1 && (
              <>
                {" "}
                <button
                  type="button"
                  className="assistant__plan-change"
                  onClick={changePlan}
                >
                  Change
                </button>
              </>
            )}
          </span>
          {signedInAs === null ? (
            <span className="meta-chip meta-chip--quiet">{say("notSignedIn")}</span>
          ) : (
            <span className="meta-chip meta-chip--signed">
              Signed in as {signedInAs}{" "}
              <button type="button" className="assistant__plan-change" onClick={() => void leave()}>
                {say("signOut")}
              </button>
            </span>
          )}
        </div>
      </header>

      <div className="assistant__scroll">
        {helpOpen && (
          <section
            id="assistant-help"
            className="help"
            aria-label={say("whatYouCanAsk")}
          >
            <div className="help__head">
              <h3 className="help__title">{say("whatYouCanAsk")}</h3>
              <button
                type="button"
                className="assistant__icon-button"
                onClick={() => setHelpOpen(false)}
              >
                <IoClose aria-hidden="true" />
                <span className="visually-hidden">{say("closeHelp")}</span>
              </button>
            </div>
            <ul className="help__list">
              {help("canAsk", language).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <h3 className="help__title">{say("whatItCannotDo")}</h3>
            <ul className="help__list">
              {help("cannotDo", language).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="help__note">{say("syntheticNotice")}</p>
            <h3 className="help__title">{say("theButtons")}</h3>
            <ul className="help__list">
              <li>
                <strong>Talk to a person</strong> calls Member Services at{" "}
                {MEMBER_SERVICES_DISPLAY}.
              </li>
              <li>
                <strong>Start over</strong> empties this conversation and
                forgets the plan you chose.
              </li>
              <li>
                <strong>Save as PDF</strong> downloads this whole conversation,
                with every source, as a file you can keep or print.
              </li>
              <li>
                <strong>Copy</strong> puts one answer and its sources on the
                clipboard.
              </li>
            </ul>
          </section>
        )}

        <div
          className="assistant__thread"
          role="log"
          aria-live="polite"
          aria-label="Conversation"
        >
          {turns.length === 0 && planPrompt === null && (
            <div className="empty">
              <h3 className="empty__title">
                Your plan, explained.
                <span className="empty__ask">What would you like to know?</span>
              </h3>
              <ul className="starters" aria-label="Suggested questions">
                {STARTERS.map((starter) => {
                  const Icon = starter.icon;
                  return (
                    <li key={starter.question}>
                      <button
                        type="button"
                        className="starter"
                        onClick={() => void submit(starter.question, plan)}
                      >
                        <span className="starter__icon" aria-hidden="true">
                          <Icon />
                        </span>
                        <span className="starter__title">
                          {starter.question}
                        </span>
                        <span className="starter__caption">
                          {starter.caption}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="empty__body">
                You do not need to pick a plan first. I will ask only if the
                answer depends on it.
              </p>
            </div>
          )}

          {turns.map((turn) => (
            <article
              key={turn.id}
              className="turn"
              aria-label={`Question and answer ${turn.id}`}
            >
              <p className="turn__question">{turn.question}</p>

              {turn.outcome === "pending" ? (
                /* Where the answer will appear, which is where they are looking. */
                <p className="turn__pending" role="status" aria-live="polite">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={progress}
                      className="turn__pending-text"
                      initial={reduceMotion === true ? { opacity: 1 } : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion === true ? { opacity: 1 } : { opacity: 0, y: -8 }}
                      transition={{ duration: reduceMotion === true ? 0 : 0.26, ease: "easeOut" }}
                    >
                      {progress || say("workingOnIt")}
                    </motion.span>
                  </AnimatePresence>
                </p>
              ) : turn.outcome === "needs_login" ? (
                <div className="turn__answer turn__answer--needs-login">
                  <p>{turn.answer}</p>
                  {/* FR-P2-23. An expandable region under the question that needs
                      it, not a dialog: tab passes through and out, so nothing is
                      trapped and Escape is unnecessary. D-071. */}
                  {signedInAs === null &&
                    (signingInFor === turn.id ? (
                      <SignIn
                        onSignedIn={resumeAfterLogin}
                        onCancel={() => setSigningInFor(null)}
                      />
                    ) : (
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={() => setSigningInFor(turn.id)}
                      >
                        <IoLockClosedOutline aria-hidden="true" /> {say("signInAndAnswer")}
                      </button>
                    ))}
                </div>
              ) : (
                <div
                  className={`turn__answer turn__answer--${turn.outcome}${speakingTurn === turn.id ? " turn__answer--speaking" : ""}`}
                >
                  {speakingTurn === turn.id && (
                    <p className="turn__reading" role="status">
                      <IoVolumeHigh aria-hidden="true" /> Reading this answer
                      aloud
                    </p>
                  )}
                  <AnswerBody
                    turnId={turn.id}
                    claims={turn.claims}
                    citations={turn.citations}
                    citationNumbers={turn.citationNumbers}
                    unanswered={turn.unanswered}
                    headline={turn.headline}
                    staleness={turn.staleness}
                    fallback={turn.answer}
                    sourcesTitle={say("sourcesTitle")}
                  />

                  {/* FR-27, on answered turns only. */}
                  {turn.outcome === "answered" && (
                    <>
                      <div className="feedback">
                        <span id={`fb-${turn.id}`}>
                          {say("didThisAnswer")}
                        </span>
                        <div role="group" aria-labelledby={`fb-${turn.id}`}>
                          {(["yes", "no"] as const).map((value) => (
                            <button
                              key={value}
                              type="button"
                              className="button button--quiet"
                              aria-pressed={turn.feedback === value}
                              onClick={() => {
                                setTurns((previous) =>
                                  previous.map((item) =>
                                    item.id === turn.id
                                      ? { ...item, feedback: value }
                                      : item,
                                  ),
                                );
                                // Sent straight away: the reason is an offer, not a toll.
                                if (turn.turnId !== null)
                                  void sendFeedback(
                                    turn.turnId,
                                    value === "yes",
                                  );
                              }}
                            >
                              {value === "yes" ? (
                                <IoThumbsUp aria-hidden="true" />
                              ) : (
                                <IoThumbsDown aria-hidden="true" />
                              )}
                              {value === "yes" ? "Yes" : "No"}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="assistant__icon-button feedback__copy"
                          onClick={() => copyAnswer(turn)}
                        >
                          {copied === turn.id ? (
                            <IoCheckmark aria-hidden="true" />
                          ) : (
                            <IoCopy aria-hidden="true" />
                          )}
                          <span className="visually-hidden">
                            {copied === turn.id
                              ? "Answer copied"
                              : "Copy this answer and its sources"}
                          </span>
                        </button>
                      </div>

                      {/*
                        * Fixed reasons, never a text box: free text is the one
                        * surface that could put a diagnosis into the store.
                        */}
                      {turn.feedback === "no" && turn.feedbackReason === null && (
                        <div className="feedback__why">
                          <span id={`why-${turn.id}`}>{say("whatWentWrong")}</span>
                          <div role="group" aria-labelledby={`why-${turn.id}`}>
                            {REASONS.map(({ value, key }) => (
                              <button
                                key={value}
                                type="button"
                                className="chip"
                                onClick={() => {
                                  setTurns((previous) =>
                                    previous.map((item) =>
                                      item.id === turn.id
                                        ? { ...item, feedbackReason: value }
                                        : item,
                                    ),
                                  );
                                  if (turn.turnId !== null)
                                    void sendFeedback(turn.turnId, false, value);
                                }}
                              >
                                {say(key)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {turn.feedbackReason !== null && (
                        <p className="feedback__thanks" role="status">
                          {say("thanksForTelling")}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </article>
          ))}

          {limited !== null && (
            <div className="notice notice--limit" role="alert">
              <p>
                <IoWarning aria-hidden="true" /> {limited}
              </p>
              <a
                className="button button--quiet"
                href={`tel:${MEMBER_SERVICES_DISPLAY}`}
              >
                <IoCall aria-hidden="true" /> Call {MEMBER_SERVICES_DISPLAY}
              </a>
            </div>
          )}

          {callback !== null && <CallbackPanel draft={callback} />}

          {planPrompt !== null && (
            <div className="plan-prompt">
              <div className="plan-prompt__head">
                <h3 className="plan-prompt__title">{say("whichPlan")}</h3>
                <button
                  type="button"
                  className="assistant__icon-button"
                  onClick={dismissPlanPrompt}
                >
                  <IoClose aria-hidden="true" />
                  <span className="visually-hidden">Close, and answer without a plan</span>
                </button>
              </div>
              <p>
                Costs differ between plans, so I need this one before I answer.
              </p>
              <ul className="plan-prompt__options">
                {planPrompt.plans.map((option) => (
                  <li key={`${option.contractId}-${option.id}`}>
                    <button
                      type="button"
                      className="starter"
                      aria-current={
                        plan?.contractId === option.contractId &&
                        plan.id === option.id
                          ? "true"
                          : undefined
                      }
                      onClick={() => choosePlan(option)}
                    >
                      {option.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div ref={threadEnd} />
        </div>
      </div>

      <div className="assistant__foot">
        {railId !== undefined && isPhone && chips}
        {/* FR-P2-22, D-070: the three commands ideas.md P2-06 names. Contextual
          follow-ups are not built; D-069 measured what touching the prompt costs. */}
        {tools}
        {mode === "voice" ? (
          <>
            <VoiceComposer
              key={voiceReset}
              busy={busy}
              responding={speakingTurn !== null}
              onSend={(question) => void submit(question, plan)}
            />
            {spoken !== null && (
              <div className="voice__playback">
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => {
                    setPaused(false);
                    spoken.play();
                  }}
                >
                  <IoPlay aria-hidden="true" /> {say("playAgain")}
                </button>
                {/*
                  * Pause holds the place; Stop only reset it, which the button
                  * beside it already does. Two fixed controls, never one that relabels.
                  */}
                <button
                  type="button"
                  className="button button--quiet"
                  disabled={speakingTurn === null && !paused}
                  onClick={() => {
                    if (paused) {
                      spoken.resume();
                      setPaused(false);
                      return;
                    }
                    spoken.pause();
                    setPaused(true);
                  }}
                >
                  {paused ? (
                    <>
                      <IoPlay aria-hidden="true" /> {say("resumeAnswer")}
                    </>
                  ) : (
                    <>
                      <IoPause aria-hidden="true" /> {say("pauseAnswer")}
                    </>
                  )}
                </button>
              </div>
            )}
            {voiceNotice !== null && (
              <p className="voice__notice" role="status">
                {voiceNotice}
              </p>
            )}
          </>
        ) : (
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              const question = draft;
              setDraft("");
              void submit(question, plan);
            }}
          >
            <label className="visually-hidden" htmlFor="composer-input">
              Ask a question about your plan
            </label>
            {/* Grows to four lines, then scrolls. Enter sends; Shift+Enter
                starts a new line, which is what a textarea otherwise steals. */}
            <textarea
              id="composer-input"
              className="composer__input"
              value={draft}
              rows={1}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey) return;
                event.preventDefault();
                const question = draft;
                setDraft("");
                void submit(question, plan);
              }}
              placeholder={isPhone ? say("askPlaceholderShort") : say("askPlaceholder")}
              autoComplete="off"
              maxLength={3_000}
            />
            <DictateButton
              disabled={busy}
              onError={setDictateError}
              onTranscript={(text) => {
                setDictateError(null);
                // Placed, never sent. The member reads it back and presses Ask.
                setDraft(
                  draft.trim().length === 0 ? text : `${draft.trim()} ${text}`,
                );
                document.getElementById("composer-input")?.focus();
              }}
            />
            <button
              type="submit"
              className="button button--primary"
              disabled={busy || draft.trim().length === 0}
            >
              <IoSend aria-hidden="true" /> {busy ? "Working" : "Ask"}
            </button>
          </form>
        )}

        {dictateError !== null && (
          <p className="voice__error" role="alert">
            <IoWarning aria-hidden="true" /> {dictateError}
          </p>
        )}

        <p className="assistant__status" role="status">
          {status}
        </p>

        {/* FR-15: scope disclosure, visible rather than buried. */}
        <p className="assistant__scope">
          Not a clinician. For medical concerns see a professional. It never
          decides coverage.
        </p>
      </div>
    </section>
  );
}
