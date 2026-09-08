/**
 * FR-24. Detects that a question is not English so the assistant can say so in
 * English and hand over, rather than attempting a partial answer.
 *
 * Deliberately conservative: a false "other" refuses a member who wrote English,
 * which is worse than passing an unusual English question through to retrieval.
 * Detection is by function words and diacritics, which separate the Romance
 * languages a New Jersey service area most plausibly sees.
 */
const NON_ENGLISH_MARKERS =
  /\b(cual|cuál|como|cómo|qué|que|donde|dónde|cuanto|cuánto|para|pero|porque|mi|mis|el|la|los|las|una|uno|del|por|con|es|son|está|estoy|tengo|puedo|necesito|gracias|hola|seguro|medico|médico|salud|cuenta|comment|pourquoi|quel|quelle|mon|ma|mes|avec|pour|je|vous|nous|est|sont|santé|assurance|bonjour|merci|quanto|perche|perché|mio|mia|sono|salute|grazie|ciao)\b/gi;

const DIACRITICS = /[áéíóúñüàèìòùâêîôûçãõäöß]/i;

const ENGLISH_MARKERS =
  /\b(the|is|are|what|how|when|where|why|which|my|your|do|does|did|can|could|would|should|will|a|an|of|to|in|for|and|or|not|covered|copay|plan|doctor|drug|cost|pay)\b/gi;

export function detectLanguage(text: string): "en" | "other" {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "en";

  if (DIACRITICS.test(trimmed)) return "other";

  const foreign = (trimmed.match(NON_ENGLISH_MARKERS) ?? []).length;
  const english = (trimmed.match(ENGLISH_MARKERS) ?? []).length;

  // Several shared tokens ("para", "que", "mi") also appear in English text, so
  // a verdict of "other" needs foreign markers to outweigh English ones.
  return foreign >= 2 && foreign > english ? "other" : "en";
}
