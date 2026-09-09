import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEED_MEMBERS, seededStages } from "../../src/members/seed.ts";
import { partDStage } from "../../src/members/stage.ts";

const thresholds = (m: (typeof SEED_MEMBERS)[number]) => ({
  drugDeductible: m.drugDeductible,
  outOfPocketLimit: m.outOfPocketLimit,
});

describe("seeded members [FR-P2-24, FR-P2-25, D-047]", () => {
  it("seeds the five the stage requires, with unique ids and addresses", () => {
    expect(SEED_MEMBERS).toHaveLength(5);
    expect(new Set(SEED_MEMBERS.map((m) => m.id)).size).toBe(5);
    expect(new Set(SEED_MEMBERS.map((m) => m.email)).size).toBe(5);
  });

  // FR-P2-25: deep enough for four distinct question types.
  it("gives every member a claim, a prior authorisation, an appointment and a provider", () => {
    for (const m of SEED_MEMBERS) {
      expect(m.claims.length, `member ${m.id}`).toBeGreaterThanOrEqual(1);
      expect(m.priorAuthorizations.length, `member ${m.id}`).toBeGreaterThanOrEqual(1);
      expect(m.appointments.length, `member ${m.id}`).toBeGreaterThanOrEqual(1);
      expect(m.assignedProvider.length, `member ${m.id}`).toBeGreaterThan(0);
    }
  });

  // D-047. An address that could reach a real inbox is real-world contact data.
  it("uses addresses that cannot leave the machine", () => {
    for (const m of SEED_MEMBERS) expect(m.email).toMatch(/@example\.invalid$/);
  });

  // Every provider comes from the DEMO DATA roster, so no real practice is named.
  it("names only providers from the demonstration roster", () => {
    const roster = readFileSync("src/corpus/synthetic.ts", "utf8");
    const named = SEED_MEMBERS.flatMap((m) => [
      m.assignedProvider,
      ...m.claims.map((c) => c.provider),
      ...m.appointments.map((a) => a.provider),
    ]);
    for (const provider of named) expect(roster, provider).toContain(provider);
  });

  // A record that contradicts itself is the failure D-081 exists to prevent.
  it("keeps every accumulator's remainder inside its limit", () => {
    for (const m of SEED_MEMBERS) {
      const { dental, otc, hearing, vision, oopMaxUsedYtd, oopMaxLimit } = m.accumulators;
      for (const [limit, remaining] of [dental, otc, hearing, vision]) {
        expect(remaining, `member ${m.id}`).toBeGreaterThanOrEqual(0);
        expect(remaining, `member ${m.id}`).toBeLessThanOrEqual(limit);
      }
      expect(oopMaxUsedYtd).toBeLessThanOrEqual(oopMaxLimit);
    }
  });

  it("keeps each claim's split adding up to what was billed", () => {
    for (const m of SEED_MEMBERS) {
      for (const c of m.claims) {
        expect(c.planPaid + c.memberOwes, `${m.id} ${c.id}`).toBeCloseTo(c.billed, 2);
      }
    }
  });

  it("gives a decided prior authorisation a decision date, and an open one none", () => {
    for (const m of SEED_MEMBERS) {
      for (const pa of m.priorAuthorizations) {
        const decided = pa.status === "approved" || pa.status === "denied";
        expect(pa.decisionDate === null, `${m.id} ${pa.id}`).toBe(!decided);
      }
    }
  });

  // The corpus states a Part D deductible for these two plans only. D-081.
  it("only seeds plans whose drug thresholds the corpus states", () => {
    for (const m of SEED_MEMBERS) {
      expect(`${m.contractId}-${m.planId}`).toMatch(/^H5141-(004|007)$/);
      expect(m.drugDeductible).toBe(m.planId === "004" ? 150 : 220);
      expect(m.outOfPocketLimit).toBe(2_100);
    }
  });

  // A demo that only ever shows one stage does not exercise the derivation.
  it("covers all three drug payment stages across the five", () => {
    const stages = seededStages((m) => partDStage(m.accumulators.drugSpendYtd, thresholds(m)));
    expect(stages).toEqual(new Set(["deductible", "initial", "catastrophic"]));
  });
});
