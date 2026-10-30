/** CSS minifiers may express a duration in seconds even when the source uses ms. */
export function durationMilliseconds(value: string, fallback: number) {
  const match = value.trim().match(/^(\d*\.?\d+)(ms|s)$/);
  return match ? Number(match[1]) * (match[2] === 's' ? 1000 : 1) : fallback;
}
