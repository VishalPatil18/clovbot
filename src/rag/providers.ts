import type { Prompt } from "./prompt.ts";

export interface GeneratedAnswer {
  text: string;
  provider: "azure" | "gemini";
}

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`missing ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const MAX_ATTEMPTS = 6;

/**
 * Azure returns 429 with a Retry-After when the per-minute quota is spent, which
 * a full-corpus ingest hits routinely. Honour the header rather than guessing.
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let wait = 2_000;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, init);
    if (response.status !== 429 && response.status < 500) return response;
    if (attempt === MAX_ATTEMPTS) return response;

    const header = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(header) && header > 0 ? header * 1_000 : wait;
    console.warn(`  HTTP ${response.status}, retrying in ${Math.round(delay / 1000)}s`);
    await sleep(delay + 500);
    wait = Math.min(wait * 2, 60_000);
  }
  throw new Error("unreachable");
}

const azureUrl = (deployment: string, path: string): string =>
  `${required("AZURE_OPENAI_ENDPOINT").replace(/\/$/, "")}/openai/deployments/` +
  `${deployment}/${path}?api-version=${required("AZURE_OPENAI_API_VERSION")}`;

/** No fallback: another provider's vector space returns valid, meaningless chunks. */
export async function embed(texts: string[]): Promise<number[][]> {
  const response = await fetchWithRetry(
    azureUrl(required("AZURE_OPENAI_EMBEDDING_DEPLOYMENT"), "embeddings"),
    {
      method: "POST",
      headers: { "api-key": required("AZURE_OPENAI_API_KEY"), "content-type": "application/json" },
      body: JSON.stringify({ input: texts }),
    },
  );
  if (!response.ok) {
    throw new Error(`Azure embeddings failed: HTTP ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { data?: { embedding?: number[]; index?: number }[] };
  const rows = body.data ?? [];
  if (rows.length !== texts.length) {
    throw new Error(`Azure embeddings returned ${rows.length} vectors for ${texts.length} inputs`);
  }
  return [...rows]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((row) => {
      if (row.embedding === undefined) throw new Error("Azure embeddings returned a row with no vector");
      return row.embedding;
    });
}

/** Streams tokens as they arrive; the caller sees first token immediately. */
export async function generateStream(
  prompt: Prompt,
  onToken: (token: string) => void,
): Promise<GeneratedAnswer> {
  const response = await fetchWithRetry(azureUrl(required("AZURE_OPENAI_DEPLOYMENT"), "chat/completions"), {
    method: "POST",
    headers: { "api-key": required("AZURE_OPENAI_API_KEY"), "content-type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: 0,
      stream: true,
    }),
  });
  if (!response.ok || response.body === null) {
    throw new Error(`HTTP ${response.status} ${await response.text()}`);
  }

  let text = "";
  let buffer = "";
  const decoder = new TextDecoder();
  for await (const bytes of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(bytes, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;
      try {
        const token = (JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] })
          .choices?.[0]?.delta?.content;
        if (token !== undefined && token.length > 0) {
          text += token;
          onToken(token);
        }
      } catch {
        // A malformed chunk is skipped; the stream carries keep-alive frames too.
      }
    }
  }
  if (text.length === 0) throw new Error("Azure returned an empty answer");
  return { text, provider: "azure" };
}

export async function generate(prompt: Prompt): Promise<GeneratedAnswer> {
  try {
    return { text: await azureChat(prompt), provider: "azure" };
  } catch (azureError) {
    const reason = azureError instanceof Error ? azureError.message : String(azureError);
    console.warn(`azure generation failed, falling back to gemini: ${reason}`);
    return { text: await geminiChat(prompt), provider: "gemini" };
  }
}

async function azureChat(prompt: Prompt): Promise<string> {
  const response = await fetchWithRetry(azureUrl(required("AZURE_OPENAI_DEPLOYMENT"), "chat/completions"), {
    method: "POST",
    headers: { "api-key": required("AZURE_OPENAI_API_KEY"), "content-type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: 0,
    }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${await response.text()}`);
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content;
  if (text === undefined || text.length === 0) throw new Error("Azure returned an empty answer");
  return text;
}

/**
 * Fallback only. Google may train on free-tier input, so the question reaching
 * here has already been redacted.
 */
async function geminiChat(prompt: Prompt): Promise<string> {
  const model = process.env["GEMINI_MODEL"] ?? "gemini-2.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": required("GEMINI_API_KEY"), "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: [{ parts: [{ text: prompt.user }] }],
        generationConfig: { temperature: 0 },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Gemini fallback failed: HTTP ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (text === undefined || text.length === 0) throw new Error("Gemini returned an empty answer");
  return text;
}
