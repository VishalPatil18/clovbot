import type { Speech } from "./api.ts";
export type { Speech };
export type VoiceMode = "text" | "voice";

const MODE_KEY = "clovbot_mode";

/** FR-16. The choice persists across sessions. */
export function readMode(): VoiceMode {
  try {
    return window.localStorage.getItem(MODE_KEY) === "voice" ? "voice" : "text";
  } catch {
    // Private browsing can throw on access; text is the safe default.
    return "text";
  }
}

export function writeMode(mode: VoiceMode): void {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Losing the preference is survivable; failing to switch mode is not.
  }
}

/**
 * A press shorter than this is a tap, which starts recording and leaves it
 * running. A longer press is a hold, which stops when released. FR-17 requires
 * both paths to work at all times, so the gesture is inferred rather than set.
 */
export const TAP_THRESHOLD_MS = 400;

export const isTap = (heldMs: number): boolean => heldMs < TAP_THRESHOLD_MS;

export interface Recording {
  stop: () => Promise<Blob>;
  /** 0 to 1, for the level meter that stands in for a live transcript. D-045. */
  level: () => number;
}

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  recorder.start();

  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Uint8Array(analyser.frequencyBinCount);

  return {
    level: () => {
      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128));
      return Math.min(1, peak / 96);
    },
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.addEventListener("stop", () => {
          for (const track of stream.getTracks()) track.stop();
          void context.close();
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        });
        recorder.stop();
      }),
  };
}

export interface Transcription {
  text: string;
  notice: string | null;
}

export async function transcribe(audio: Blob): Promise<Transcription> {
  const response = await fetch("/api/transcribe", {
    method: "POST",
    headers: { "content-type": audio.type || "audio/webm" },
    body: audio,
  });
  const body = (await response.json()) as { text?: string; notice?: string | null; error?: string };
  if (!response.ok) throw new Error(body.error ?? "Transcription failed.");
  return { text: body.text ?? "", notice: body.notice ?? null };
}

export interface Spoken {
  play: () => void;
  stop: () => void;
  /** Fires when playback finishes or is stopped, so the interface can settle. */
  onStateChange: (handler: (speaking: boolean) => void) => void;
  notice: string | null;
}

/**
 * FR-19. Audio never replaces the written answer; it accompanies it. The browser
 * tier speaks the text locally when the remote chain is exhausted. FR-20.
 */
export async function speak(text: string): Promise<Spoken> {
  const response = await fetch("/api/speak", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });

  const type = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "The answer could not be read aloud.");
  }

  if (type.includes("application/json")) {
    const body = (await response.json()) as { notice?: string | null };
    const utterance = new SpeechSynthesisUtterance(text);
    let notify: (speaking: boolean) => void = () => {};
    utterance.addEventListener("end", () => notify(false));
    return {
      notice: body.notice ?? null,
      onStateChange: (handler) => {
        notify = handler;
      },
      play: () => {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        notify(true);
      },
      stop: () => {
        window.speechSynthesis.cancel();
        notify(false);
      },
    };
  }

  const encoded = response.headers.get("x-voice-notice");
  const audio = new Audio(URL.createObjectURL(await response.blob()));
  let notify: (speaking: boolean) => void = () => {};
  audio.addEventListener("ended", () => notify(false));
  audio.addEventListener("pause", () => notify(false));

  return {
    notice: encoded === null ? null : decodeURIComponent(encoded),
    onStateChange: (handler) => {
      notify = handler;
    },
    play: () => {
      audio.currentTime = 0;
      void audio.play();
      notify(true);
    },
    stop: () => {
      audio.pause();
      audio.currentTime = 0;
      notify(false);
    },
  };
}


const LANGUAGE_KEY = "clovbot_language";

/** FR-P3-34. Detection seeds it on the first Spanish question; this remembers it. */
export function readLanguage(): Speech {
  try {
    return window.localStorage.getItem(LANGUAGE_KEY) === "es" ? "es" : "en";
  } catch {
    return "en";
  }
}

export function writeLanguage(speech: Speech): void {
  try {
    window.localStorage.setItem(LANGUAGE_KEY, speech);
  } catch {
    // Losing the preference is survivable; failing to switch language is not.
  }
}
