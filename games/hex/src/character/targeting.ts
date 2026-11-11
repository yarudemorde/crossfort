import type { Coord } from "../game/types";
import { hexDistance, neighbors, sameHex } from "../game/rules/hex";
import { ability } from "./abilities";
import { stats } from "./roster";
import type { Character, Participant } from "./types";

type Fraction = { n: number; d: number };
const compare = (a: Fraction, b: Fraction) => a.n * b.d - b.n * a.d;
const dot = (a: Coord, b: Coord) =>
  2 * a.q * b.q + a.q * b.r + a.r * b.q + 2 * a.r * b.r;
const relative = (a: Coord, origin: Coord): Coord => ({
  q: a.q - origin.q,
  r: a.r - origin.r,
});
const cross = (a: Coord, b: Coord) => a.q * b.r - a.r * b.q;
const directions = neighbors({ q: 0, r: 0 });

/** Exact clipping against the six Voronoi half-planes of a regular axial hex.
 * Integer fractions include both cells on a shared edge, without epsilon nudges.
 */
function entryOnSegment(
  from: Coord,
  to: Coord,
  cell: Coord,
): Fraction | undefined {
  const delta = relative(to, from),
    center = relative(cell, from);
  let low: Fraction = { n: 0, d: 1 },
    high: Fraction = { n: 1, d: 1 };
  for (const normal of directions) {
    const a = dot(delta, normal),
      b = 1 + dot(center, normal);
    if (a === 0) {
      if (b < 0) return;
      continue;
    }
    if (a > 0) {
      const upper = { n: b, d: a };
      if (compare(upper, high) < 0) high = upper;
    } else {
      const lower = { n: -b, d: -a };
      if (compare(lower, low) > 0) low = lower;
    }
    if (compare(low, high) > 0) return;
  }
  return low;
}
export const hasThrust = (character: Character) =>
  ability(character).targeting === "thrust";

/** Nearest hex distance, then entry distance, then clockwise side (r grows down).
 * The last axial-coordinate tie break is geometric, never roster/array order.
 */
export function thrustRay(from: Coord, to: Coord, range: number): Coord[] {
  const distance = hexDistance(from, to);
  if (distance < 1 || distance > range) return [];
  const delta = relative(to, from),
    cells: { coord: Coord; entry: Fraction }[] = [];
  for (let q = -range; q <= range; q++)
    for (let r = -range; r <= range; r++) {
      const coord = { q: from.q + q, r: from.r + r },
        d = hexDistance(from, coord);
      if (d < 1 || d > range) continue;
      const entry = entryOnSegment(from, to, coord);
      if (entry) cells.push({ coord, entry });
    }
  return cells
    .sort(
      (a, b) =>
        hexDistance(from, a.coord) - hexDistance(from, b.coord) ||
        compare(a.entry, b.entry) ||
        cross(delta, relative(b.coord, from)) -
          cross(delta, relative(a.coord, from)) ||
        a.coord.q - b.coord.q ||
        a.coord.r - b.coord.r,
    )
    .map((c) => c.coord);
}

/** Both attack and counter use this. The caller chooses full state or an observation. */
export function resolveHitTarget(
  source: Participant,
  aim: Coord,
  participants: readonly Participant[],
): Participant | undefined {
  const range = stats(source.character).range,
    distance = hexDistance(source.coord, aim);
  if (!source.alive || distance < 1 || distance > range) return;
  const enemies = participants.filter(
    (p) => p.alive && p.owner !== source.owner,
  );
  if (!hasThrust(source.character))
    return enemies.find((p) => sameHex(p.coord, aim));
  for (const coord of thrustRay(source.coord, aim, range)) {
    const onHex = enemies.filter((p) => sameHex(p.coord, coord));
    // Duplicate occupancy is invalid in play; keep malformed inputs deterministic too.
    onHex.sort((a, b) =>
      a.character.characterId < b.character.characterId
        ? -1
        : a.character.characterId > b.character.characterId
          ? 1
          : 0,
    );
    if (onHex.length) return onHex[0];
  }
}
