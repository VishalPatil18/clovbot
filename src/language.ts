/**
 * English, Spanish or other, so anything else still gets the handover rather
 * than half an answer. Conservative in both directions: a wrong call either
 * refuses an English member or answers from the wrong corpus.
 */
export type QuestionLanguage = "en" | "es" | "other";

/** Shared with French and Italian in places, which is why the split below exists. */
const SPANISH_MARKERS =
  /\b(cual|cuál|como|cómo|qué|que|donde|dónde|cuanto|cuánto|cuánta|para|pero|porque|mi|mis|el|la|los|las|del|por|con|es|son|está|estoy|tengo|puedo|necesito|gracias|hola|seguro|médico|salud|cuenta|copago|receta|medicamento|cobertura|plan|año|mes|especialista|dentista|farmacia|reclamo|cita)\b/gi;

const OTHER_ROMANCE_MARKERS =
  /\b(comment|pourquoi|quel|quelle|mon|ma|mes|avec|pour|je|vous|nous|est|sont|santé|assurance|bonjour|merci|remboursement|ordonnance|quanto|perche|perché|mio|mia|sono|salute|grazie|ciao|farmaco|copertura|dal|dalla|della|degli|il|gli|quale|cosa|costa|specialista|medico|una|uno)\b/gi;

/** Inverted punctuation is Spanish and nothing else in this set. */
const SPANISH_ONLY = /[¿¡ñ]/i;
const DIACRITICS = /[áéíóúñüàèìòùâêîôûçãõäöß]/i;

const ENGLISH_MARKERS =
  /\b(the|is|are|what|how|when|where|why|which|my|your|do|does|did|can|could|would|should|will|a|an|of|to|in|for|and|or|not|covered|copay|plan|doctor|drug|cost|pay)\b/gi;

const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length;

export function detectLanguage(text: string): QuestionLanguage {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "en";

  const spanish = count(trimmed, SPANISH_MARKERS);
  const other = count(trimmed, OTHER_ROMANCE_MARKERS);
  const english = count(trimmed, ENGLISH_MARKERS);

  // Inverted punctuation and the eñe settle it on their own.
  if (SPANISH_ONLY.test(trimmed)) return "es";

  if (DIACRITICS.test(trimmed)) return spanish >= other ? "es" : "other";

  // Several shared tokens ("para", "que", "mi") also appear in English text, so
  // a foreign verdict needs foreign markers to outweigh English ones.
  const foreign = spanish + other;
  if (foreign < 2 || foreign <= english) return "en";
  return spanish > other ? "es" : "other";
}
