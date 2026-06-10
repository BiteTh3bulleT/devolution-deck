/** Thin wrapper around crypto.randomUUID() for consistent usage. */
export function v4(): string {
  return crypto.randomUUID();
}
