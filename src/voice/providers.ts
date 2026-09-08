import { runChain, type Attempt, type ChainResult } from "./chain.ts";

/**
 * Request shapes verified against the live specs on 2026-09-08:
 * api.elevenlabs.io/openapi.json and api.fish.audio/openapi.json. Both were read
 * rather than recalled, because this project has already been bitten once by a
 * provider tier that had changed since it was last looked at.
 */

const optional = (name: string): string | null => {
  const value = process.env[name];
  return value === undefined || value.length === 0 ? null : value;
};

const required = (name: string): string => {
  const value = optional(name);
  if (value === null) throw new Error(`${name} is not set`);
  return value;
};

const TIMEOUT_MS = 20_000;

async function post(url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${(await response.text()).slice(0, 160)}`);
  }
  return response;
}

// --- Text to speech ---------------------------------------------------------

async function elevenLabsSpeak(text: string): Promise<Uint8Array> {
  const voice = required("ELEVENLABS_VOICE_ID");
  const response = await post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": required("ELEVENLABS_API_KEY"), "content-type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: optional("ELEVENLABS_TTS_MODEL") ?? "eleven_flash_v2_5",
      }),
    },
  );
  return new Uint8Array(await response.arrayBuffer());
}

async function fishAudioSpeak(text: string): Promise<Uint8Array> {
  const reference = optional("FISH_AUDIO_VOICE_ID");
  const response = await post("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      authorization: `Bearer ${required("FISH_AUDIO_API_KEY")}`,
      "content-type": "application/json",
      model: "s1",
    },
    body: JSON.stringify({
      text,
      format: "mp3",
      ...(reference === null ? {} : { reference_id: reference }),
    }),
  });
  return new Uint8Array(await response.arrayBuffer());
}

export type SpeechResult = ChainResult<Uint8Array | null>;

/**
 * FR-20. Falls through to the browser synthesiser, which is returned as a null
 * body: there is nothing to send, and the page speaks the text itself. That tier
 * cannot run out of credits, which is the point of it.
 */
export function speak(text: string): Promise<SpeechResult> {
  const attempts: Attempt<Uint8Array | null>[] = [];

  if (optional("ELEVENLABS_API_KEY") !== null) {
    attempts.push({ provider: "elevenlabs", run: () => elevenLabsSpeak(text) });
  }
  if (optional("FISH_AUDIO_API_KEY") !== null) {
    attempts.push({ provider: "fishaudio", run: () => fishAudioSpeak(text) });
  }
  attempts.push({ provider: "browser", run: async () => null });

  return runChain(attempts);
}

// --- Speech to text ---------------------------------------------------------

async function elevenLabsTranscribe(audio: Uint8Array, mime: string): Promise<string> {
  const form = new FormData();
  form.append("model_id", optional("ELEVENLABS_STT_MODEL") ?? "scribe_v1");
  form.append("file", new Blob([audio.slice()], { type: mime }), "speech.webm");

  const response = await post("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": required("ELEVENLABS_API_KEY") },
    body: form,
  });
  const body = (await response.json()) as { text?: string };
  const text = body.text?.trim() ?? "";
  if (text.length === 0) throw new Error("empty transcript");
  return text;
}

async function fishAudioTranscribe(audio: Uint8Array, mime: string): Promise<string> {
  const form = new FormData();
  form.append("audio", new Blob([audio.slice()], { type: mime }), "speech.webm");
  form.append("language", "en");

  const response = await post("https://api.fish.audio/v1/asr", {
    method: "POST",
    headers: { authorization: `Bearer ${required("FISH_AUDIO_API_KEY")}` },
    body: form,
  });
  const body = (await response.json()) as { text?: string };
  const text = body.text?.trim() ?? "";
  if (text.length === 0) throw new Error("empty transcript");
  return text;
}

/**
 * No browser tier here. The page's own SpeechRecognition sends audio to a third
 * party, which is the objection D-034 raised about free-tier training, so a
 * failed transcription asks the member to type instead.
 */
export function transcribe(audio: Uint8Array, mime: string): Promise<ChainResult<string>> {
  const attempts: Attempt<string>[] = [];

  if (optional("ELEVENLABS_API_KEY") !== null) {
    attempts.push({ provider: "elevenlabs", run: () => elevenLabsTranscribe(audio, mime) });
  }
  if (optional("FISH_AUDIO_API_KEY") !== null) {
    attempts.push({ provider: "fishaudio", run: () => fishAudioTranscribe(audio, mime) });
  }
  return runChain(attempts);
}
