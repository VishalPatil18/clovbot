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

const azureUrl = (deployment: string, path: string): string =>
  `${required("AZURE_OPENAI_ENDPOINT").replace(/\/$/, "")}/openai/deployments/` +
  `${deployment}/${path}?api-version=${required("AZURE_OPENAI_API_VERSION")}`;

/**
 * Embeddings have no fallback on purpose. A second provider embeds into a
 * different vector space, so retrieval would return numerically valid and
 * semantically meaningless chunks rather than failing. D-034.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  const response = await fetch(
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
  const response = await fetch(azureUrl(required("AZURE_OPENAI_DEPLOYMENT"), "chat/completions"), {
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
 * here has already been redacted. D-034.
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
