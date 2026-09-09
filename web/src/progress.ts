/**
 * What to say while an answer is written. Driven by what the server reports,
 * never a timer: later lines fill a long step but never run ahead of it.
 */
export type Stage = "retrieving" | "writing";

const LINES: Record<Stage, string[]> = {
  // Everything here happens before the first token: the question is embedded
  // routed, searched and reranked. The lines follow that order.
  retrieving: [
    "Understanding your question",
    "Looking through your plan documents",
    "Finding the sections that answer this",
    "Reading the Evidence of Coverage",
  ],
  writing: ["Formulating your answer", "Checking every fact against its source"],
};

/** How long one line holds before the next appears within the same stage. */
export const STEP_MS = 2_500;

export function progressMessage(stage: Stage, elapsedMs: number): string {
  const lines = LINES[stage];
  const index = Math.min(Math.floor(elapsedMs / STEP_MS), lines.length - 1);
  return lines[index] ?? lines[0] ?? "";
}

export const stageLineCount = (stage: Stage): number => LINES[stage].length;
