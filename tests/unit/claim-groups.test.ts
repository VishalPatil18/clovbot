import { describe, expect, it } from "vitest";
import { groupClaims } from "../../web/src/claims.ts";

const cite = (id: string, section: string) => ({
  id,
  number: Number(id.replace("c", "")),
  label: `Evidence of Coverage 2026 · Plan H5141-004 · ${section}`,
  documentId: "d",
});

const claim = (text: string, ...ids: string[]) => ({ text, citationIds: ids });

const citations = [
  cite("c1", "How to make a Level 1 appeal"),
  cite("c2", "How to make a Level 2 appeal"),
  cite("c3", "Dental Coverage"),
];

describe("groupClaims", () => {
  // Two claims are not a wall. Grouping them adds a heading and no clarity.
  it("leaves a short answer ungrouped", () => {
    const result = groupClaims([claim("a", "c1"), claim("b", "c2")], citations);
    expect(result.grouped).toBe(false);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.claims).toHaveLength(2);
  });

  it("groups consecutive claims that cite the same source", () => {
    const result = groupClaims(
      [claim("a", "c1"), claim("b", "c1"), claim("c", "c2"), claim("d", "c2")],
      citations,
    );
    expect(result.grouped).toBe(true);
    expect(result.groups.map((g) => g.claims.length)).toEqual([2, 2]);
  });

  it("names each group after the section its source came from", () => {
    const result = groupClaims(
      [claim("a", "c1"), claim("b", "c1"), claim("c", "c2"), claim("d", "c2")],
      citations,
    );
    expect(result.groups[0]?.heading).toBe("How to make a Level 1 appeal");
    expect(result.groups[1]?.heading).toBe("How to make a Level 2 appeal");
  });

  // One group per claim is the same wall with headings added to it.
  it("stays ungrouped when no two neighbours share a source", () => {
    const result = groupClaims(
      [claim("a", "c1"), claim("b", "c2"), claim("c", "c3")],
      citations,
    );
    expect(result.grouped).toBe(false);
  });

  it("keeps claims in the order the model returned them", () => {
    const result = groupClaims(
      [claim("first", "c1"), claim("second", "c1"), claim("third", "c2"), claim("fourth", "c2")],
      citations,
    );
    expect(result.groups.flatMap((g) => g.claims.map((c) => c.text))).toEqual([
      "first",
      "second",
      "third",
      "fourth",
    ]);
  });

  // Never merges non-adjacent claims: reordering an answer changes its meaning.
  it("does not merge claims that are not neighbours", () => {
    const result = groupClaims(
      [claim("a", "c1"), claim("b", "c1"), claim("c", "c2"), claim("d", "c1")],
      citations,
    );
    expect(result.groups.map((g) => g.claims.length)).toEqual([2, 1, 1]);
  });

  it("treats a different set of sources as a different group", () => {
    const result = groupClaims(
      [claim("a", "c1"), claim("b", "c1", "c2"), claim("c", "c1", "c2")],
      citations,
    );
    expect(result.groups.map((g) => g.claims.length)).toEqual([1, 2]);
  });

  it("falls back to no heading when the cited source is unknown", () => {
    const result = groupClaims(
      [claim("a", "gone"), claim("b", "gone"), claim("c", "c1"), claim("d", "c1")],
      citations,
    );
    expect(result.groups[0]?.heading).toBeNull();
  });

  it("never drops or duplicates a claim", () => {
    const claims = [claim("a", "c1"), claim("b", "c1"), claim("c", "c2"), claim("d", "c3")];
    const result = groupClaims(claims, citations);
    expect(result.groups.flatMap((g) => g.claims)).toHaveLength(claims.length);
  });
});
