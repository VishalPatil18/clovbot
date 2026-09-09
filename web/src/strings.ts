import type { Speech } from "./api.ts";

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
  print: ["Print", "Imprimir"],
  clearSaved: ["Clear saved", "Borrar lo guardado"],
  ask: ["Ask", "Preguntar"],
  askPlaceholder: [
    "Ask about costs, drugs, providers or appeals",
    "Pregunte sobre costos, medicamentos, proveedores o apelaciones",
  ],
  copy: ["Copy", "Copiar"],
  didThisAnswer: ["Did this answer your question?", "¿Esto respondió su pregunta?"],
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
  openFullPage: ["Open full page", "Abrir a pantalla completa"],
  closeAssistant: ["Close the assistant", "Cerrar el asistente"],
  switchToVoice: ["Switch to voice", "Cambiar a voz"],
  switchToText: ["Switch to text", "Cambiar a texto"],
  workingOnIt: ["Working on it", "Trabajando en ello"],
  readingAloud: ["Reading this answer aloud", "Leyendo esta respuesta en voz alta"],
  signInAndAnswer: ["Sign in and answer this", "Inicie sesión y responda esto"],
} as const satisfies Record<string, readonly [string, string]>;

export type StringKey = keyof typeof STRINGS;

export const s = (key: StringKey, speech: Speech): string =>
  STRINGS[key][speech === "es" ? 1 : 0];
