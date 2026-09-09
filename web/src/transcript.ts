import type { Citation, Claim, Speech } from "./api.ts";
import { isMemberTurn } from "./history.ts";
import { MEMBER_SERVICES_DISPLAY, s } from "./strings.ts";

export interface TranscriptTurn {
  question: string;
  answer: string;
  /** The single amount, when the answer is one. Cited in its own right. */
  headline?: { label: string; amount: string } | null;
  claims: Claim[];
  citations: Citation[];
  unanswered: string[];
  staleness: string | null;
}

export type BlockKind =
  /** The document's one heading. */
  | "title"
  /** Plan, dates and the standing notices under the title. */
  | "meta"
  /** Set apart: the member needs to see it before they file this anywhere. */
  | "notice"
  | "question"
  | "body"
  /** A run-in heading over the sources or the gaps. */
  | "label"
  /** A numbered source or an unanswered gap. */
  | "item";

export interface Block {
  kind: BlockKind;
  text: string;
}

export interface TranscriptContext {
  planName: string | null;
  /** When the plan documents behind these answers were collected. */
  documentDate: string | null;
  language: Speech;
  savedOn: Date;
}

const day = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * The conversation as flat data, so the file's content is asserted without
 * parsing a PDF. Source numbers are the member's: renumbering misdirects a marker.
 */
export function transcriptBlocks(
  turns: readonly TranscriptTurn[],
  context: TranscriptContext,
): Block[] {
  const say = (key: Parameters<typeof s>[0]): string => s(key, context.language);
  const blocks: Block[] = [
    { kind: "title", text: say("transcriptTitle") },
    { kind: "meta", text: `${say("transcriptSaved")}: ${day(context.savedOn)}` },
    {
      kind: "meta",
      text: `${say("transcriptPlan")}: ${context.planName ?? say("transcriptNoPlan")}`,
    },
  ];

  if (context.documentDate !== null) {
    blocks.push({
      kind: "meta",
      text: `${say("transcriptDocuments")}: ${context.documentDate}`,
    });
  }

  blocks.push({
    kind: "meta",
    text: `${say("transcriptNotOfficial")} ${MEMBER_SERVICES_DISPLAY} (TTY 711).`,
  });
  blocks.push({ kind: "meta", text: say("syntheticNotice") });

  if (turns.some(isMemberTurn)) {
    blocks.push({ kind: "notice", text: say("transcriptMemberNotice") });
  }

  for (const turn of turns) {
    blocks.push({ kind: "question", text: `${say("youAsked")}: ${turn.question}` });

    // Set as a sentence rather than dropped: the model returns it as its own
    // cited assertion, and the claims do not always restate the figure.
    if (turn.headline != null) {
      blocks.push({ kind: "body", text: `${turn.headline.label}: ${turn.headline.amount}` });
    }

    const body = turn.claims.length > 0 ? turn.claims.map((claim) => claim.text) : [turn.answer];
    for (const line of body) {
      if (line.trim().length > 0) blocks.push({ kind: "body", text: line });
    }

    if (turn.unanswered.length > 0) {
      blocks.push({ kind: "label", text: `${say("notAnswered")}:` });
      for (const gap of turn.unanswered) blocks.push({ kind: "item", text: gap });
    }

    if (turn.staleness !== null) blocks.push({ kind: "body", text: turn.staleness });

    if (turn.citations.length > 0) {
      blocks.push({ kind: "label", text: say("sourcesTitle") });
      for (const [index, citation] of turn.citations.entries()) {
        blocks.push({ kind: "item", text: `[${citation.number ?? index + 1}] ${citation.label}` });
      }
    }
  }

  return blocks;
}

export const transcriptFilename = (context: Pick<TranscriptContext, "language" | "savedOn">): string =>
  `clovbot-${context.language === "es" ? "conversacion" : "conversation"}-${day(context.savedOn)}.pdf`;
