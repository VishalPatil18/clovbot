/**
 * Removes identifier-shaped strings before a question is persisted. FR-31.
 * Conservative by design: the surrounding question must survive, because the
 * turn log drives corpus expansion.
 */
export function redactIdentifiers(_text: string): string {
  throw new Error("not implemented");
}
