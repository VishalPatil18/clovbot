import type { Speech } from "./api.ts";

/** Lives here rather than in a component so non-React modules can reach it. */
export const MEMBER_SERVICES_DISPLAY = "1-555-0100";

/**
 * Panel chrome in both languages. FR-P3-43.
 *
 * Authored, never machine-translated at runtime. A Spanish answer surrounded by
 * English buttons is the half-measure this exists to avoid: the reading is the
 * easy half, and the tapping is the half this audience struggles with.
 */
const STRINGS = {
  talkToPerson: ["Talk to a person", "Hablar con una persona"],
  startOver: ["Start over", "Empezar de nuevo"],
  savePdf: ["Save as PDF", "Guardar en PDF"],
  clearSaved: ["Clear saved", "Borrar lo guardado"],
  ask: ["Ask", "Preguntar"],
  askPlaceholder: [
    "Ask about costs, drugs, providers or appeals",
    "Pregunte sobre costos, medicamentos, proveedores o apelaciones",
  ],
  // The long one wraps to two lines in a 48px field on a phone and clips.
  askPlaceholderShort: ["Ask about your plan", "Pregunte sobre su plan"],
  copy: ["Copy", "Copiar"],
  sourcesTitle: ["Where this comes from", "De dónde viene esto"],
  // Was "it holds no member data", which stopped being true when sign-in
  // shipped. What is true, and what NFR-SEC-01 wants stated, is that every
  // record here is invented.
  syntheticNotice: [
    "Every member record here is demonstration data. No real member data is held.",
    "Todo registro de miembro aquí son datos de demostración. No se guardan datos reales de ningún miembro.",
  ],
  didThisAnswer: ["Did this answer your question?", "¿Esto respondió su pregunta?"],
  whatWentWrong: ["What was wrong with it?", "¿Qué estuvo mal?"],
  reasonWrongPlan: ["It is not about my plan", "No es sobre mi plan"],
  reasonNotAsked: ["Not what I asked", "No es lo que pregunté"],
  reasonHardToRead: ["Hard to understand", "Difícil de entender"],
  reasonThinkCovered: ["I think this is covered", "Creo que esto sí está cubierto"],
  thanksForTelling: ["Thank you. That helps us fix it.", "Gracias. Eso nos ayuda a corregirlo."],
  yes: ["Yes", "Sí"],
  no: ["No", "No"],
  notSignedIn: ["Not signed in", "Sin iniciar sesión"],
  signedInAs: ["Signed in as", "Sesión iniciada como"],
  signOut: ["Sign out", "Cerrar sesión"],
  change: ["Change", "Cambiar"],
  whichPlan: ["Which plan are you on?", "¿En qué plan está usted?"],
  closeWithoutPlan: [
    "Close, and answer without a plan",
    "Cerrar y responder sin un plan",
  ],
  whatWouldYouLike: ["What would you like to know?", "¿Qué le gustaría saber?"],
  whatYouCanAsk: ["What you can ask", "Lo que puede preguntar"],
  whatItCannotDo: ["What it cannot do", "Lo que no puede hacer"],
  theButtons: ["The buttons", "Los botones"],
  closeHelp: ["Close help", "Cerrar la ayuda"],
  playAgain: ["Play the answer again", "Reproducir la respuesta otra vez"],
  pauseAnswer: ["Pause", "Pausar"],
  resumeAnswer: ["Resume", "Continuar"],
  openFullPage: ["Open full page", "Abrir a pantalla completa"],
  closeAssistant: ["Close the assistant", "Cerrar el asistente"],
  switchToVoice: ["Switch to voice", "Cambiar a voz"],
  switchToText: ["Switch to text", "Cambiar a texto"],
  // Beside Back in a 393px bar, the long forms do not fit and the bar becomes
  // the page's width floor. The icon carries the rest of the meaning.
  switchToVoiceShort: ["Voice", "Voz"],
  switchToTextShort: ["Text", "Texto"],
  workingOnIt: ["Working on it", "Trabajando en ello"],
  readingAloud: ["Reading this answer aloud", "Leyendo esta respuesta en voz alta"],
  signInAndAnswer: ["Sign in and answer this", "Inicie sesión y responda esto"],
  transcriptTitle: [
    "Your conversation with the Clover assistant",
    "Su conversación con el asistente de Clover",
  ],
  transcriptSaved: ["Saved", "Guardado"],
  transcriptPlan: ["Plan", "Plan"],
  transcriptNoPlan: ["No plan chosen", "Ningún plan elegido"],
  transcriptDocuments: ["Plan documents collected", "Documentos del plan recopilados"],
  youAsked: ["You asked", "Usted preguntó"],
  notAnswered: [
    "Not answered from the plan documents",
    "Sin respuesta en los documentos del plan",
  ],
  // The file can be opened by anyone holding the device, long after the
  // session that made it ended.
  transcriptMemberNotice: [
    "This file contains information from your own member record. Keep it somewhere private.",
    "Este archivo contiene información de su propio registro de miembro. Guárdelo en un lugar privado.",
  ],
  transcriptNotOfficial: [
    "This is not an official plan document. For a decision about your coverage, call Member Services.",
    "Este no es un documento oficial del plan. Para una decisión sobre su cobertura, llame a Servicios para Miembros.",
  ],
  transcriptFailed: [
    "The file could not be made. Opening the print view instead.",
    "No se pudo crear el archivo. Abriendo la vista de impresión.",
  ],
  pageOf: ["Page $1 of $2", "Página $1 de $2"],
} as const satisfies Record<string, readonly [string, string]>;

/**
 * The help panel's prose. Lists rather than single strings, because splitting a
 * bulleted list into numbered keys makes it impossible to see the whole thing
 * in one language while translating it.
 */
const HELP = {
  canAsk: [
    [
      "What a service costs under your plan: copays, coinsurance, the out-of-pocket maximum.",
      "Cuánto cuesta un servicio bajo su plan: copagos, coseguro y el máximo de gastos de bolsillo.",
    ],
    [
      "Whether a service or a drug is covered, and what tier a drug is on.",
      "Si un servicio o un medicamento está cubierto, y en qué nivel está un medicamento.",
    ],
    [
      "How a process works: prior authorization, referrals, appeals and grievances.",
      "Cómo funciona un trámite: autorización previa, referencias, apelaciones y quejas.",
    ],
    [
      "What your supplemental benefits include: dental, vision, hearing, over-the-counter.",
      "Qué incluyen sus beneficios complementarios: dental, visión, audición y de venta libre.",
    ],
    [
      "Your own record, once you sign in: a claim, a prior authorisation, what is left of an allowance.",
      "Su propio registro, una vez que inicie sesión: un reclamo, una autorización previa, cuánto queda de una asignación.",
    ],
  ],
  cannotDo: [
    [
      "Medical advice, or deciding whether something will be covered for you.",
      "Consejos médicos, ni decidir si algo estará cubierto para usted.",
    ],
    [
      "Change anything on your record, or act on someone else's behalf.",
      "Cambiar algo en su registro, ni actuar en nombre de otra persona.",
    ],
    [
      "Tell you whether a named doctor is in network. That directory is demonstration data.",
      "Decirle si un médico específico está en la red. Ese directorio son datos de demostración.",
    ],
    [
      "Answer in a language other than English or Spanish. A person can help in yours.",
      "Responder en un idioma que no sea inglés o español. Una persona puede ayudarle en el suyo.",
    ],
  ],
} as const satisfies Record<string, readonly (readonly [string, string])[]>;

export type HelpKey = keyof typeof HELP;

export const help = (key: HelpKey, speech: Speech): readonly string[] =>
  HELP[key].map((pair) => pair[speech === "es" ? 1 : 0]);

export type StringKey = keyof typeof STRINGS;

export const s = (key: StringKey, speech: Speech): string =>
  STRINGS[key][speech === "es" ? 1 : 0];
