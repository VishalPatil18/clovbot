export type MemberTopic = "claim" | "prior_authorization" | "balance" | "appointment" | "provider";

export interface LoginRequired {
  topic: MemberTopic;
  /** Said to the member. Names why, and offers the way forward. */
  explanation: string;
}

interface Rule {
  topic: MemberTopic;
  match: RegExp;
  /** Phrasing that looks like the topic but the plan documents answer. */
  unless?: RegExp;
}

/**
 * Whether answering needs a stored value: the test is where the answer lives,
 * not how possessive the wording sounds. Rules, never a classifier.
 */
const RULES: Rule[] = [
  {
    topic: "claim",
    match: /\b(my|our)\b[^.?]*\b(claim|claims|bill|bills|explanation of benefits|eob)\b|\bmy (last |recent )?(bill|claim)\b/i,
    // Filing one is a process; the plan documents describe it.
    unless: /\b(how (do|can) i|how to|where do i|what is|process for)\b[^.?]*\b(file|submit|appeal)\b/i,
  },
  {
    topic: "prior_authorization",
    // The possessive must sit on the noun: "my prior auth" is theirs, "my plan
    // needs prior authorization" is the rule in general.
    match: /\b(my|our)\s+(prior[- ]?auth\w*|pre-?auth\w*|authorization|authorisation)\b/i,
  },
  {
    topic: "balance",
    // A limit is public; what is left of it is not.
    match: /\b(left|remaining|used|spent|so far|balance|to date|this year|drug payment stage|which stage)\b/i,
    unless: /\b(what|how much) (is|are) (my |the )?(copay|coinsurance|premium|deductible|out[- ]of[- ]pocket (maximum|limit))\b(?![^.?]*\b(left|remaining|used|spent|so far|balance)\b)/i,
  },
  {
    topic: "appointment",
    // "my last visit" is theirs; "my copay for a specialist visit" is a price.
    // Only an adjacent possessive, optionally with a time word, counts.
    match: /\b(my|our)\s+(last |next |recent |upcoming |previous )?(appointment|appointments)\b|\b(my|our)\s+(last|next|recent|upcoming|previous)\s+visits?\b|\bwhen (was|did) (my|i)\b/i,
  },
  {
    topic: "provider",
    // Who theirs is, as opposed to how to find one.
    match: /\bwho is my\b|\b(my|our) (assigned|primary care) (provider|doctor|physician)\b/i,
    unless: /\bhow (do|can) i (find|choose|change)\b/i,
  },
];

const EXPLANATION: Record<MemberTopic, string> = {
  claim: "That answer is in your own record, so I need to know who you are first.",
  prior_authorization:
    "The status of your own request is in your record, so I need to know who you are first.",
  balance: "How much you have used is in your own record, so I need to know who you are first.",
  appointment: "Your own visits are in your record, so I need to know who you are first.",
  provider: "Who you are assigned to is in your record, so I need to know who you are first.",
};

export function needsMemberData(question: string): LoginRequired | null {
  for (const rule of RULES) {
    if (!rule.match.test(question)) continue;
    if (rule.unless?.test(question) === true) continue;
    return { topic: rule.topic, explanation: EXPLANATION[rule.topic] };
  }
  return null;
}
