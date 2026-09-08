import { useEffect, useRef, useState } from "react";
import { IoMic, IoStop } from "react-icons/io5";
import { isTap, startRecording, transcribe, type Recording } from "../voice.ts";

type Phase = "idle" | "listening" | "processing";

interface Props {
  disabled: boolean;
  /** The transcript is placed in the composer, never sent. The member presses send. */
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
}

/**
 * Dictation from the text composer, so voice is available without changing mode.
 * The result lands in the input box: FR-18 requires the member to be able to fix
 * a mis-heard word before the question is asked, and that protection matters more
 * here than the saved tap.
 */
export function DictateButton({ disabled, onTranscript, onError }: Props): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>("idle");
  const [level, setLevel] = useState(0);
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
    try {
      recording.current = await startRecording();
      setPhase("listening");
      const tick = (): void => {
        setLevel(recording.current?.level() ?? 0);
        meter.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      onError("I could not reach your microphone. Check the browser's permission, or type instead.");
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
      onTranscript(result.text);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Your words could not be transcribed.");
    } finally {
      setPhase("idle");
    }
  };

  const label =
    phase === "listening"
      ? "Stop recording and put the words in the box"
      : phase === "processing"
        ? "Writing down what you said"
        : "Hold to talk, or tap to start. The words go in the box so you can change them.";

  return (
    <button
      type="button"
      className={`dictate dictate--${phase}`}
      aria-pressed={phase === "listening"}
      aria-label={label}
      title={label}
      disabled={disabled || phase === "processing"}
      style={{ ["--level" as string]: level.toFixed(2) }}
      onPointerDown={() => {
        if (phase === "listening") {
          void finish();
          return;
        }
        pressedAt.current = Date.now();
        void begin();
      }}
      onPointerUp={() => {
        if (isTap(Date.now() - pressedAt.current)) return;
        if (phase === "listening") void finish();
      }}
    >
      {phase === "listening" ? <IoStop aria-hidden="true" /> : <IoMic aria-hidden="true" />}
    </button>
  );
}
