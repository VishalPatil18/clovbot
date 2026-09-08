import { useEffect, useRef, useState } from "react";
import { IoCheckmark, IoMic, IoRefresh, IoStop } from "react-icons/io5";
import { isTap, startRecording, transcribe, type Recording } from "../voice.ts";

type Phase = "idle" | "listening" | "processing" | "review";

interface Props {
  busy: boolean;
  onSend: (question: string) => void;
}

/**
 * FR-17: press-and-hold and tap-to-start both work, always, and neither is a
 * setting. The gesture is inferred from how long the press lasted.
 * FR-18 as amended by D-045: no live partial transcript, so the listening and
 * processing states carry the wait, and the transcript is editable before sending.
 */
export function VoiceComposer({ busy, onSend }: Props): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const recording = useRef<Recording | null>(null);
  const pressedAt = useRef(0);
  const meter = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (meter.current !== null) cancelAnimationFrame(meter.current);
      void recording.current?.stop();
    },
    [],
  );

  const begin = async (): Promise<void> => {
    setError(null);
    setNotice(null);
    try {
      recording.current = await startRecording();
      setPhase("listening");
      const tick = (): void => {
        setLevel(recording.current?.level() ?? 0);
        meter.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setError("I could not reach your microphone. Check the browser's permission, or type instead.");
      setPhase("idle");
    }
  };

  const finish = async (): Promise<void> => {
    if (meter.current !== null) cancelAnimationFrame(meter.current);
    const active = recording.current;
    recording.current = null;
    if (active === null) return;

    setPhase("processing");
    setLevel(0);
    try {
      const result = await transcribe(await active.stop());
      setTranscript(result.text);
      setNotice(result.notice);
      setPhase("review");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your words could not be transcribed.");
      setPhase("idle");
    }
  };

  const onPointerDown = (): void => {
    if (phase === "listening") {
      void finish();
      return;
    }
    pressedAt.current = Date.now();
    void begin();
  };

  const onPointerUp = (): void => {
    // A tap leaves it recording; a hold stops when released. FR-17.
    if (isTap(Date.now() - pressedAt.current)) return;
    if (phase === "listening") void finish();
  };

  const spoken =
    phase === "listening"
      ? "Listening. Tap to stop."
      : phase === "processing"
        ? "Writing down what you said"
        : "Hold to talk, or tap to start";

  return (
    <div className="voice">
      {phase !== "review" && (
        <div className="voice__stage">
          <div className="mic-well">
            {/* Rings read as sound leaving the microphone. Scaled by the measured
                level so they respond to the voice rather than looping blindly. */}
            {phase === "listening" && (
              <span className="mic-rings" aria-hidden="true" style={{ ["--level" as string]: level.toFixed(2) }}>
                <span className="mic-ring" />
                <span className="mic-ring" />
                <span className="mic-ring" />
              </span>
            )}
            <button
              type="button"
              className={`mic mic--${phase}`}
              aria-pressed={phase === "listening"}
              disabled={busy || phase === "processing"}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onKeyDown={(event) => {
                if (event.key !== " " && event.key !== "Enter") return;
                event.preventDefault();
                if (phase === "listening") void finish();
                else void begin();
              }}
            >
              {phase === "listening" ? (
                <IoStop className="mic__icon" aria-hidden="true" />
              ) : (
                <IoMic className="mic__icon" aria-hidden="true" />
              )}
              <span className="visually-hidden">{spoken}</span>
            </button>
          </div>

          <p className="voice__state">{spoken}</p>
          <p className="voice__hint">
            Hold to talk, or tap to start and tap to stop. You can change the words before they are
            sent.
          </p>
        </div>
      )}

      {phase === "review" && (
        <form
          className="voice__review"
          onSubmit={(event) => {
            event.preventDefault();
            const text = transcript.trim();
            if (text.length === 0) return;
            setPhase("idle");
            setTranscript("");
            onSend(text);
          }}
        >
          <label className="voice__label" htmlFor="voice-transcript">
            This is what I heard. Change anything that is wrong, then send it.
          </label>
          <textarea
            id="voice-transcript"
            className="voice__transcript"
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            rows={3}
            autoFocus
          />
          <div className="voice__actions">
            <button type="submit" className="button button--primary" disabled={busy || transcript.trim().length === 0}>
              <IoCheckmark aria-hidden="true" /> Send this question
            </button>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => {
                setTranscript("");
                setPhase("idle");
              }}
            >
              <IoRefresh aria-hidden="true" /> Start again
            </button>
          </div>
        </form>
      )}

      <p className="voice__status" role="status">
        {phase === "listening" || phase === "processing" ? spoken : ""}
      </p>

      {notice !== null && (
        <p className="voice__notice" role="status">
          {notice}
        </p>
      )}
      {error !== null && (
        <p className="voice__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
