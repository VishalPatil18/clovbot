import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const doc = readFileSync("docs/real-phi.md", "utf8");
const sources = doc.slice(doc.indexOf("## Sources"));
const body = doc.slice(0, doc.indexOf("## Sources"));
const research = readFileSync("docs/research-init.md", "utf8");

describe("the writeup separates what exists from what does not [FR-P3-26]", () => {
  it("gives every control both halves", () => {
    const controls = [...body.matchAll(/^### 2\.\d+ (.+)$/gm)].map((match) => match[1]);
    expect(controls.length).toBeGreaterThanOrEqual(8);
    for (const section of body.split(/^### 2\.\d+ /m).slice(1)) {
      const title = section.split("\n")[0] ?? "";
      expect(section, title).toMatch(/\*\*Today[,:]?/);
      expect(section, title).toMatch(/\*\*Still owed/);
    }
  });

  it("covers every control the plan names", () => {
    for (const control of [
      "BAA-eligible model tier",
      "Zero data retention",
      "Encryption in transit and at rest",
      "Minimum necessary",
      "Role-based access control",
      "Audit logging",
      "Disclosure accounting",
      "Retention and deletion",
      "Incident response",
      "Identity proofing",
    ]) {
      expect(body, control).toContain(control);
    }
  });
});

describe("no invented regulatory requirements [FR-P3-29]", () => {
  // The failure mode this stage exists to avoid: a plausible citation nobody
  // can trace. Every regulation named in the body must appear in Sources.
  it("lists every regulation it cites", () => {
    const cited = new Set([
      ...[...body.matchAll(/45 CFR §164\.\d+/g)].map((m) => m[0]),
      ...[...body.matchAll(/42 CFR 422\.\d+-\d+/g)].map((m) => m[0]),
      ...[...body.matchAll(/CMS-\d+-F/g)].map((m) => m[0]),
    ]);
    expect(cited.size).toBeGreaterThan(0);
    for (const citation of cited) expect(sources, citation).toContain(citation);
  });

  it("says its section numbers are pointers, not quotations", () => {
    expect(doc).toMatch(/not a quotation from anything held in this repository/);
    expect(sources).toMatch(/no text from these is held in this repository/);
  });

  it("keeps the claims it takes from the briefing traceable to it", () => {
    // The five conditions are the briefing's own list, not this document's.
    expect(body).toMatch(/docs\/research-init\.md.{0,20}§2/);
    expect(research).toContain("BAA-eligible tier");
    expect(research).toContain("zero-data-retention");
  });

  // Deliberately not asserted anywhere: the Azure abuse-monitoring retention
  // period, which this project never checked.
  it("states no retention period it did not verify", () => {
    const retention = body.slice(body.indexOf("### 2.2"), body.indexOf("### 2.3"));
    expect(retention).not.toMatch(/\b\d+\s*(day|days|hours)\b/);
    expect(retention).toContain("not verified");
  });
});

describe("the identity-proofing gap is explicit [FR-P3-27]", () => {
  it("says the code is adequate for reads and inadequate for writes", () => {
    expect(body).toMatch(/adequate for \*\*reads of synthetic data\*\*/);
    expect(body).toMatch(/\*\*inadequate\*\* for a write to a real record/);
  });

  it("says what an emailed code actually proves", () => {
    expect(body).toContain("Control of an inbox is not identity");
  });
});

describe("P3's own controls are assessed, not assumed [FR-P3-28]", () => {
  it("says which carry over and which need strengthening", () => {
    expect(body).toContain("Carries over unchanged");
    expect(body).toContain("Needs strengthening before real data");
  });

  // The most important admission in the document: RLS moved the trust boundary
  // rather than removing it.
  it("names the limit of what row-level security achieved", () => {
    expect(body).toMatch(/identity is set by application code/);
    expect(body).toMatch(/did not leave the application|not the same thing as the database deciding/);
  });
});

describe("three failure scenarios are answered [FR-P3-30]", () => {
  it("covers a disclosure, a lost session and an audit request", () => {
    for (const scenario of ["### A disclosure", "### A lost session", "### An audit request"]) {
      expect(body, scenario).toContain(scenario);
    }
  });

  it("says what cannot be done as well as what can", () => {
    const scenarios = body.slice(body.indexOf("## 4. What if this happened"));
    expect(scenarios).toMatch(/What we cannot do|The gap:|What is missing/);
  });
});

describe("the synthetic boundary is restated, not implied [NFR-P3-05]", () => {
  it("opens by saying nothing here is real", () => {
    expect(doc.slice(0, 600)).toMatch(/no real member data|records are invented|invented/i);
    expect(doc).toContain("D-047");
  });
});
