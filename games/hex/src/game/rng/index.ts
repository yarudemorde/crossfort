export function nextRandom(seed: number): [number, number] {
  let n = seed >>> 0;
  n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
  return [n / 4294967296, n];
}
export function shuffle<T>(
  items: readonly T[],
  seed: number,
): { items: T[]; seed: number } {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    let r;
    [r, seed] = nextRandom(seed);
    const j = Math.floor(r * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return { items: result, seed };
}
