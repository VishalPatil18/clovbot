import { AutoModelForSequenceClassification, AutoTokenizer } from "@huggingface/transformers";
import type { RetrievedChunk } from "./store.ts";

/** Local, so the confidence signal has no rate limit and cannot be withdrawn. */
export const DEFAULT_MODEL = "Xenova/ms-marco-MiniLM-L-6-v2";

export interface RerankedChunk extends RetrievedChunk {
  rerankScore: number;
}

type Ranker = (query: string, passages: string[]) => Promise<number[]>;

const cache = new Map<string, Promise<Ranker>>();

async function load(modelId: string): Promise<Ranker> {
  const [tokenizer, model] = await Promise.all([
    AutoTokenizer.from_pretrained(modelId),
    AutoModelForSequenceClassification.from_pretrained(modelId, { dtype: "q8" }),
  ]);

  return async (query: string, passages: string[]): Promise<number[]> => {
    const inputs = tokenizer(Array(passages.length).fill(query), {
      text_pair: passages,
      padding: true,
      truncation: true,
    });
    const { logits } = await model(inputs);
    // A cross-encoder emits one relevance logit per pair; sigmoid puts it in 0..1
    // so a single floor can be compared across question types.
    return [...logits.data].map((logit) => 1 / (1 + Math.exp(-Number(logit))));
  };
}

export function ranker(modelId: string = DEFAULT_MODEL): Promise<Ranker> {
  const existing = cache.get(modelId);
  if (existing !== undefined) return existing;
  const created = load(modelId);
  cache.set(modelId, created);
  return created;
}

/** Reranks in place of fusion order. The top score becomes the confidence signal. */
export async function rerank(
  query: string,
  chunks: RetrievedChunk[],
  modelId: string = DEFAULT_MODEL,
): Promise<RerankedChunk[]> {
  if (chunks.length === 0) return [];
  const score = await ranker(modelId);
  const scores = await score(
    query,
    chunks.map((chunk) => `${chunk.section}\n${chunk.content}`),
  );

  return chunks
    .map((chunk, index) => ({ ...chunk, rerankScore: scores[index] ?? 0 }))
    .sort((a, b) => b.rerankScore - a.rerankScore || (a.id < b.id ? -1 : 1));
}
