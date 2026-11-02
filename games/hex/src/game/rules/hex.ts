import type { Coord } from "../types";
export const hexId = (c: Coord) => `${c.q},${c.r}`;
export const sameHex = (a: Coord, b: Coord) => a.q === b.q && a.r === b.r;
export const hexDistance = (a: Coord, b: Coord) =>
  (Math.abs(a.q - b.q) +
    Math.abs(a.r - b.r) +
    Math.abs(a.q - b.q + a.r - b.r)) /
  2;
export const neighbors = (c: Coord): Coord[] =>
  [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ].map(([q, r]) => ({ q: c.q + q, r: c.r + r }));
