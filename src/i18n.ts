/** Authored, never machine-translated: a translated refusal is still a claim. */
export type Speech = "en" | "es";

/** The corpus tags documents with the full word; the interface uses the code. */
export const corpusLanguage = (speech: Speech): "english" | "spanish" =>
  speech === "es" ? "spanish" : "english";

interface Copy {
  en: string;
  es: string;
}

const say = (en: string, es: string): Copy => ({ en, es });

export const COPY = {
  /** Appended to the human path on every refusal. */
  toAPerson: say(
    "To speak with a person, call Member Services at",
    "Para hablar con una persona, llame a Servicios para Miembros al",
  ),
  forThat: say("For that, call Member Services at", "Para eso, llame a Servicios para Miembros al"),
  notFound: say(
    "I could not find an answer to that in the plan documents I searched.",
    "No encontré una respuesta a eso en los documentos del plan que consulté.",
  ),
  upstream: say(
    "I am having trouble reaching the plan documents right now, so I cannot answer safely.",
    "Ahora mismo no puedo acceder a los documentos del plan, así que no puedo responder con seguridad.",
  ),
  noAnswer: say(
    "I could not produce an answer right now.",
    "No pude generar una respuesta en este momento.",
  ),
  /** Every language except these two still hands over to a person. */
  unsupportedLanguage: say(
    "I can only answer in English and Spanish today. A person at the plan can help you in your language.",
    "Solo puedo responder en inglés y español hoy. Una persona del plan puede ayudarle en su idioma.",
  ),
  afterEmergency: say(
    "Once you are safe, Member Services can help with anything about your plan:",
    "Cuando esté a salvo, Servicios para Miembros puede ayudarle con cualquier duda sobre su plan:",
  ),
  sources: say("Where this comes from", "De dónde viene esto"),
  /**
   * The drug list is English only, so a Spanish answer citing it says so.
   */
  englishDrugList: say(
    "",
    "La lista de medicamentos del plan se publica solo en inglés, así que la fuente citada está en inglés.",
  ),
} as const satisfies Record<string, Copy>;

export const t = (key: keyof typeof COPY, speech: Speech): string => COPY[key][speech];
