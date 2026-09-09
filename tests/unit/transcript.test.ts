import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  transcriptBlocks,
  transcriptFilename,
  type TranscriptTurn,
} from "../../web/src/transcript.ts";
import { renderTranscript } from "../../web/src/pdf.ts";

const publicTurn: TranscriptTurn = {
  question: "what is my specialist copay",
  answer: "You pay $10.",
  claims: [
    { text: "You pay $10 for an in-network specialist.", citationIds: ["c1"] },
    { text: "Out of network is $45.", citationIds: ["c2"] },
  ],
  citations: [
    { id: "c1", number: 1, label: "Summary of Benefits 2026 · Plan H5141-004 · Doctor's Office", documentId: "d1" },
    { id: "c2", number: 2, label: "Evidence of Coverage 2026 · Plan H5141-004 · Out of network", documentId: "d2" },
  ],
  unanswered: [],
  staleness: null,
};

const memberTurn: TranscriptTurn = {
  question: "what did my last claim cost",
  answer: "You owe $32.40.",
  claims: [{ text: "You owe $32.40 on claim CLM-0031.", citationIds: ["m1"] }],
  citations: [
    { id: "m1", number: 1, label: "Your member record · Claim CLM-0031 · What you owe", documentId: "m" },
  ],
  unanswered: [],
  staleness: null,
};

const context = {
  planName: "Clover Health Choice (PPO)",
  documentDate: "2026-09-08",
  language: "en" as const,
  savedOn: new Date("2026-09-09T14:00:00Z"),
};

const text = (blocks: { text: string }[]): string => blocks.map((block) => block.text).join("\n");

describe("transcript document [FR-P3-72]", () => {
  const blocks = transcriptBlocks([publicTurn], context);

  it("carries the question and every claim", () => {
    expect(text(blocks)).toContain("what is my specialist copay");
    expect(text(blocks)).toContain("You pay $10 for an in-network specialist.");
    expect(text(blocks)).toContain("Out of network is $45.");
  });

  // A source list renumbered by the exporter sends the reader to the wrong row.
  it("numbers the sources as the member saw them", () => {
    const sources = blocks.filter((block) => block.kind === "item").map((block) => block.text);
    expect(sources[0]).toMatch(/^\[1\] Summary of Benefits/);
    expect(sources[1]).toMatch(/^\[2\] Evidence of Coverage/);
  });

  it("falls back to the prose when there are no claims", () => {
    const refusal = { ...publicTurn, claims: [], answer: "I could not find that." };
    expect(text(transcriptBlocks([refusal], context))).toContain("I could not find that.");
  });

  it("carries the unanswered gaps", () => {
    const partial = { ...publicTurn, unanswered: ["whether a referral is needed"] };
    expect(text(transcriptBlocks([partial], context))).toContain("whether a referral is needed");
  });

  it("keeps the turns in the order they were asked", () => {
    const both = text(transcriptBlocks([publicTurn, memberTurn], context));
    expect(both.indexOf("specialist copay")).toBeLessThan(both.indexOf("last claim cost"));
  });
});

describe("transcript context [FR-P3-73]", () => {
  const all = text(transcriptBlocks([publicTurn], context));

  it("names the plan, the document date and the day it was saved", () => {
    expect(all).toContain("Clover Health Choice (PPO)");
    expect(all).toContain("2026-09-08");
    expect(all).toContain("2026-09-09");
  });

  // The file outlives the panel that explained itself.
  it("carries the synthetic-data notice and a number to call", () => {
    expect(all).toContain("demonstration data");
    expect(all).toContain("1-555-0100");
  });

  // Present only once the panel has heard from the API.
  it("leaves out the document date when it is not known", () => {
    const blocks = transcriptBlocks([publicTurn], { ...context, documentDate: null });
    expect(text(blocks)).not.toContain("Plan documents collected");
  });

  it("carries the headline amount, which is cited in its own right", () => {
    const priced = { ...publicTurn, headline: { label: "Specialist copay", amount: "$10" } };
    expect(text(transcriptBlocks([priced], context))).toContain("Specialist copay: $10");
  });

  it("says the answers were not scoped to a plan when none was chosen", () => {
    const none = text(transcriptBlocks([publicTurn], { ...context, planName: null }));
    expect(none).toMatch(/No plan chosen/i);
  });
});

describe("member data notice [FR-P3-74]", () => {
  const notices = (turns: TranscriptTurn[], language: "en" | "es" = "en"): string[] =>
    transcriptBlocks(turns, { ...context, language })
      .filter((block) => block.kind === "notice")
      .map((block) => block.text);

  it("warns when a turn cites the member's own record", () => {
    expect(notices([publicTurn, memberTurn]).join(" ")).toMatch(/member record/i);
  });

  it("stays quiet when nothing came from the record", () => {
    expect(notices([publicTurn]).join(" ")).not.toMatch(/member record/i);
  });

  // The Spanish citation reads "Su registro de miembro"; matching only the
  // English label left a Spanish member with no warning at all.
  it("recognises the Spanish label too", () => {
    const spanish = {
      ...memberTurn,
      citations: [{ ...memberTurn.citations[0]!, label: "Su registro de miembro · Reclamo CLM-0031" }],
    };
    expect(notices([spanish], "es").join(" ")).toMatch(/registro de miembro/i);
  });

  it("puts the notice before the first question", () => {
    const blocks = transcriptBlocks([memberTurn], context);
    const notice = blocks.findIndex((block) => block.kind === "notice");
    const question = blocks.findIndex((block) => block.kind === "question");
    expect(notice).toBeGreaterThanOrEqual(0);
    expect(notice).toBeLessThan(question);
  });
});

describe("transcript language [FR-P3-75]", () => {
  const spanish = text(transcriptBlocks([publicTurn], { ...context, language: "es" }));

  it("writes its chrome in Spanish", () => {
    expect(spanish).toContain("De dónde viene esto");
    expect(spanish).toContain("Usted preguntó");
  });

  it("leaves the answer itself alone", () => {
    expect(spanish).toContain("You pay $10 for an in-network specialist.");
  });

  it("names the file in the language it was written in", () => {
    expect(transcriptFilename({ ...context, language: "es" })).toBe("clovbot-conversacion-2026-09-09.pdf");
    expect(transcriptFilename(context)).toBe("clovbot-conversation-2026-09-09.pdf");
  });
});

describe("rendered file [FR-P3-70]", () => {
  it("is a PDF", async () => {
    const bytes = await renderTranscript(transcriptBlocks([publicTurn], context), context.language);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("keeps Spanish accents readable", async () => {
    const turn = { ...publicTurn, claims: [{ text: "Usted paga $10 por un especialista de la red.", citationIds: ["c1"] }] };
    const bytes = await renderTranscript(
      transcriptBlocks([turn], { ...context, language: "es" }),
      "es",
    );
    expect(Buffer.from(bytes).toString("latin1")).toContain("especialista");
  });

  it("runs to more than one page when the conversation is long", async () => {
    const many = Array.from({ length: 30 }, () => publicTurn);
    const bytes = await renderTranscript(transcriptBlocks(many, context), "en");
    const pages = Buffer.from(bytes).toString("latin1").match(/\/Type \/Page[^s]/g) ?? [];
    expect(pages.length).toBeGreaterThan(1);
  });
});

describe("the control [FR-P3-70, FR-P3-76, FR-P3-77]", () => {
  const assistant = readFileSync("web/src/components/Assistant.tsx", "utf8");
  const css = readFileSync("web/src/app.css", "utf8");

  it("no longer sends the member to the print dialog", () => {
    expect(assistant).not.toContain("onClick={() => window.print()}");
  });

  // A member who never exports should not download a PDF library to ask a question.
  it("fetches the renderer only when pressed", () => {
    expect(assistant).toMatch(/await import\("\.\.\/pdf\.ts"\)/);
  });

  it("keeps the print stylesheet as the fallback", () => {
    expect(css).toContain("@media print");
  });
});
