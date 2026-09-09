import type { RefusalTrigger } from "./types.ts";
import type { Speech } from "./i18n.ts";

export type GuardrailKind = "refuse" | "emergency";

export interface GuardrailHit {
  trigger: RefusalTrigger;
  kind: GuardrailKind;
  /** Stated to the member. Names the boundary rather than stonewalling. */
  explanation: string;
}

interface Rule {
  trigger: RefusalTrigger;
  kind: GuardrailKind;
  match: RegExp;
  /** Phrasing that looks like the trigger but is the answerable driver beside it. */
  unless?: RegExp;
  explanation: string;
  /**
   * Authored, not translated at runtime. A guardrail that speaks the wrong
   * language is a guardrail the member cannot act on.
   */
  explanationEs: string;
}

/**
 * Ten triggers as rules, not a classifier: the same question must refuse on every
 * run. Emergencies are checked first, before any other boundary applies.
 */
const RULES: Rule[] = [
  {
    trigger: "C-06",
    kind: "emergency",
    // "emergency room copay" is a benefit question, so the bare word cannot fire.
    match:
      /\b(911|chest pain|can'?t breathe|cannot breathe|trouble breathing|shortness of breath|stroke|heart attack|unconscious|bleeding heavily|overdose|suicidal|kill myself|want to die)\b|\b(i am|i'?m|having|this is|it'?s)\b[^.?!]{0,24}\b(an? )?(medical )?emergency\b|\b(dolor en el pecho|no puedo respirar|dificultad para respirar|falta de aire|derrame cerebral|infarto|ataque al coraz[oó]n|inconsciente|sangrando mucho|sobredosis|quiero morir(me)?|suicid\\w*)\b|\bes una emergencia\b|\btengo una emergencia\b/i,
    explanation:
      "If this is a medical emergency, call 911 or go to the nearest emergency room now. " +
      "Emergency care is covered anywhere in the United States and worldwide, and you do not " +
      "need prior approval or a referral.",
    explanationEs:
      "Si esto es una emergencia médica, llame al 911 o vaya ahora a la sala de emergencias más " +
      "cercana. La atención de emergencia está cubierta en todo Estados Unidos y en el extranjero, " +
      "y no necesita aprobación previa ni una referencia.",
  },
  {
    trigger: "C-02",
    kind: "refuse",
    match:
      /\b(should i take|what medication should|which medicine|what should i do about my|diagnose|is it serious|are these symptoms|do i need to see a doctor|is this normal|dosage|side effects?|stop taking|symptoms?)\b|\b(qu[eé] debo hacer|qu[eé] medicamento debo|debo tomar|es grave|estos s[ií]ntomas|s[ií]ntomas?|dosis|efectos secundarios|dejar de tomar|necesito ver a un m[eé]dico|es normal esto)\b/i,
    explanation:
      "I am not a clinician and cannot give medical advice or comment on symptoms or medication.",
    explanationEs:
      "No soy profesional de la salud y no puedo dar consejos médicos ni opinar sobre síntomas o medicamentos.",
  },
  {
    trigger: "C-03",
    kind: "refuse",
    match:
      /\b(wait (a few|some|several) (weeks?|days?|months?)|put ?off|delay|hold off|skip (the|my) (appointment|visit)|avoid going|save money by not|cheaper to wait)\b/i,
    explanation:
      "I cannot advise on whether to delay or skip care. That decision belongs with you and a clinician.",
    explanationEs:
      "No puedo aconsejarle sobre retrasar u omitir atención médica. Esa decisión es suya y de su profesional de la salud.",
  },
  {
    trigger: "C-01",
    kind: "refuse",
    match:
      /\b(was (that|this|my|the) (denial|claim|decision)|denial correct|denied correctly|should (it|this|that) have been covered|why was (it|this|my) denied|was i denied|overturn|is (this|that) covered for me specifically|will (my|this) .* be approved|be approved)\b|\b(puede aprobar|puede autorizar|va a (aprobar|autorizar)|fue correcta la (denegaci[oó]n|negaci[oó]n)|por qu[eé] (me lo |lo )?(denegaron|negaron)|me lo van a aprobar|aprobar mi cobertura)\b/i,
    explanation:
      "I cannot decide coverage or judge whether a denial was correct. Those are coverage " +
      "determinations, and only the plan can make them.",
    explanationEs:
      "No puedo decidir la cobertura ni juzgar si una denegación fue correcta. Esas son " +
      "determinaciones de cobertura y solo el plan puede tomarlas.",
  },
  {
    trigger: "C-05",
    kind: "refuse",
    // A-11 explains the process; actually filing routes to a person every time.
    match: /\b(file|submit|start|open|lodge|send)\b.{0,24}\b(appeal|grievance|complaint)\b/i,
    // A-11 asks how filing works, including its deadlines. Only doing the filing
    // routes to a person.
    unless:
      /\b(how (do|does|to|can|long|many)|when (do|does|can|must)|what is|what are|explain|process|steps?|deadline|timeline|time limit|rules?|window)\b/i,
    explanation: "I cannot file an appeal or a grievance for you.",
    explanationEs: "No puedo presentar una apelación ni una queja por usted.",
  },
  {
    trigger: "C-04",
    kind: "refuse",
    match:
      /\b(which plan should|what plan should|should i (enroll|switch|change|join|pick|choose)|help me (choose|pick|select)|compare (the )?plans?|which is better|best plan for me|disenroll|drop (my|this) plan)\b/i,
    explanation:
      "I cannot help choose, compare, join or leave a plan. Plan selection has to go through a licensed person.",
    explanationEs:
      "No puedo ayudarle a elegir, comparar, inscribirse ni darse de baja de un plan. La selección de plan tiene que hacerla una persona con licencia.",
  },
  {
    trigger: "C-07",
    kind: "refuse",
    match: /\b(fraud|scam|waste and abuse|abuse of medicare|report someone|stealing|identity theft)\b/i,
    explanation: "Reports of fraud, waste or abuse have to go to a person. Please do not send details here.",
    explanationEs:
      "Los reportes de fraude, desperdicio o abuso tienen que ir a una persona. Por favor no envíe detalles aquí.",
  },
  {
    trigger: "C-08",
    kind: "refuse",
    match:
      /\b(complain about|complaint about|rude|mistreated|quality of care|bad (doctor|experience|service)|report (my|a) (doctor|provider)|malpractice)\b/i,
    explanation: "Complaints about care or about a provider have to be handled by a person.",
    explanationEs: "Las quejas sobre la atención o sobre un proveedor tiene que atenderlas una persona.",
  },
  {
    trigger: "C-09",
    kind: "refuse",
    match:
      /\b(change|update|correct|fix)\b.{0,24}\b(my |the )?(address|phone|email|name|contact|record|details|bank)\b|\b(i am (calling|asking) (for|on behalf of)|my (mother|father|husband|wife|parent|spouse)'?s? (account|plan|coverage))\b/i,
    explanation:
      "I cannot change anything on a member record, and I cannot act on someone else's behalf.",
    explanationEs:
      "No puedo cambiar nada en el registro de un miembro y no puedo actuar en nombre de otra persona.",
  },
];

/**
 * Runs before retrieval. A bucket C question never reaches the model, so it
 * cannot leak a partial answer on the way to being refused.
 */
export function checkGuardrails(question: string, speech: Speech = "en"): GuardrailHit | null {
  const text = question.trim();
  if (text.length === 0) return null;

  for (const rule of RULES) {
    if (!rule.match.test(text)) continue;
    if (rule.unless?.test(text) === true) continue;
    return {
      trigger: rule.trigger,
      kind: rule.kind,
      explanation: speech === "es" ? rule.explanationEs : rule.explanation,
    };
  }
  return null;
}

export const GUARDED_TRIGGERS = RULES.map((rule) => rule.trigger);
