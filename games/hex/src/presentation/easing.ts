export function easeProgress(t: number, curve: string) {
  const p = Math.max(0, Math.min(1, t));
  if (curve === "linear") return p;
  if (curve === "ease-in") return p * p;
  if (curve === "ease-out") return 1 - (1 - p) * (1 - p);
  return p * p * (3 - 2 * p);
}
