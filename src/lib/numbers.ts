/** Parses a user-typed decimal string; null when blank/invalid. Dot is the decimal mark. */
export function parseNumber(value: string | undefined | null): number | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}
