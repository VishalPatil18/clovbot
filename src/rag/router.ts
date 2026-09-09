export type RoutePath = "structured" | "rag" | "member";

export interface RouteDecision {
  paths: RoutePath[];
  /** Drug names matched, longest first. Empty when no drug was named. */
  drugs: string[];
  reason: string;
}

/** Normalized drug names currently indexed. */
export type DrugIndex = Set<string>;

/**
 * Words that make a question about a rule rather than about a number, so a drug
 * question carrying one still needs prose. FR-P2-10.
 */
const RULE_WORDS =
  /\b(appeal|appeals|grievance|exception|deny|denied|denial|prior authorization|prior auth|process|how do i|why|step therapy|coverage determination|refill|pharmacy|mail.order)\b/i;

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");

/**
 * Which retrieval paths run. Deterministic: the structured path is selected when
 * the question names a drug the table actually holds, so a tier question about an
 * indexed drug cannot degrade to prose search. D-061.
 *
 * Paths are additive. A question that is both a lookup and a rules question keeps
 * both, so neither half can be dropped. D-062.
 */
export function chooseRoute(
  question: string,
  index: DrugIndex,
  /**
   * Set when the member is identified AND the question needs their record.
   * Identity alone is not enough: a signed-in member asking a plan-document
   * question must not have their record read to answer it. D-091.
   */
  needsRecord = false,
): RouteDecision {
  const haystack = question.toLowerCase();

  const matched: { canonical: string; text: string }[] = [];
  for (const canonical of index) {
    // A member types "atorvastatin" where the row reads "atorvastatin calcium",
    // so any leading run of the name's words counts. Longest run wins.
    const words = canonical.split(" ");
    for (let take = words.length; take >= 1; take -= 1) {
      const text = words.slice(0, take).join(" ");
      if (!new RegExp(`(^|[^a-z0-9])${escape(text)}([^a-z0-9]|$)`).test(haystack)) continue;
      matched.push({ canonical, text });
      break;
    }
  }
  matched.sort((a, b) => b.text.length - a.text.length);

  // A combination product's name contains its components, and their tiers differ.
  // Keep the most specific match and drop the ones it swallows.
  const drugs = matched
    .filter((hit, at) => !matched.slice(0, at).some((longer) => longer.text.includes(hit.text)))
    .map((hit) => hit.canonical);

  const withMember = (paths: RoutePath[]): RoutePath[] =>
    needsRecord ? [...paths, "member"] : paths;

  if (drugs.length === 0) {
    return {
      paths: withMember(["rag"]),
      drugs,
      reason: needsRecord ? "question needs the member record, no indexed drug named" : "no indexed drug named",
    };
  }

  const named = drugs.join(", ");
  if (RULE_WORDS.test(question)) {
    return {
      paths: withMember(["structured", "rag"]),
      drugs,
      reason: `named ${named} and asked about a rule`,
    };
  }
  // A pure lookup stays pure unless a member is in play, in which case their
  // record may hold the other half of the answer. D-062 keeps paths additive.
  return { paths: withMember(["structured"]), drugs, reason: `named ${named}` };
}
