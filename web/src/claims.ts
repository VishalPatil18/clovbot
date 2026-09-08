import type { Citation, Claim } from "./api.ts";

export interface ClaimGroup {
  /** The section the group's shared source came from, or null when unknown. */
  heading: string | null;
  claims: Claim[];
}

export interface GroupedClaims {
  /** False when the answer renders as it always has: one flat run of claims. */
  grouped: boolean;
  groups: ClaimGroup[];
}

/** Below this an answer is not a wall, and headings would add nothing. */
const MIN_CLAIMS_TO_GROUP = 3;

const key = (claim: Claim): string => claim.citationIds.join("|");

/** citationLabel builds "Document year · Plan · Section"; the section is last. */
const sectionOf = (citations: Citation[], claim: Claim): string | null => {
  const first = claim.citationIds[0];
  const citation = citations.find((candidate) => candidate.id === first);
  if (citation === undefined) return null;
  const section = citation.label.split("·").at(-1)?.trim() ?? "";
  return section.length === 0 ? null : section;
};

/**
 * Groups neighbouring claims that cite the same sources, so a long answer reads
 * as a few labelled parts rather than one run of equal sentences.
 *
 * The grouping is a fact the payload already carries - which claim cites what -
 * rather than anything inferred from the words. Order is never changed: the
 * model returned these in a sequence and reordering them changes the answer.
 */
export function groupClaims(claims: Claim[], citations: Citation[]): GroupedClaims {
  const flat: GroupedClaims = { grouped: false, groups: [{ heading: null, claims }] };
  if (claims.length < MIN_CLAIMS_TO_GROUP) return flat;

  const groups: ClaimGroup[] = [];
  for (const claim of claims) {
    const last = groups.at(-1);
    if (last !== undefined && key(last.claims[0] as Claim) === key(claim)) {
      last.claims.push(claim);
      continue;
    }
    groups.push({ heading: sectionOf(citations, claim), claims: [claim] });
  }

  // One group per claim is the same wall with headings added to it.
  return groups.length === claims.length ? flat : { grouped: true, groups };
}
