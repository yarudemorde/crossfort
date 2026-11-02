import type { GameState, Owner, Piece, Terrain, Coord } from "../types";
import { hexDistance, hexId } from "./hex";
export const terrainAt = (s: GameState, c: Coord): Terrain =>
  s.config.maps[s.mapId].hexes.find((h) => hexId(h) === hexId(c))?.terrain ??
  "plain";
export function stats(s: GameState, p: Piece) {
  if (p.kind === "headquarters") {
    const h = s.config.rules.headquarters;
    return {
      vision: h.vision,
      range: h.attackRange,
      movement: 0,
      territory: h.territory,
    };
  }
  const c = s.config.cards[p.definitionId];
  return {
    vision: c.vision ?? 0,
    range: p.kind === "landmark" ? (c.territory ?? 0) : (c.range ?? 0),
    movement: c.movement ?? 0,
    territory: c.territory ?? 0,
  };
}
export function calculateEffectivePower(
  p: Piece,
  terrain: Terrain,
  config: Pick<GameState["config"], "rules">,
): number {
  const raw = p.basePower + p.temporaryBonus - p.accumulatedDamage;
  if (raw <= 0) return 0;
  const rule = config.rules.terrain[terrain] as {
    effectivePowerModifier?: number;
    minEffectivePower?: number;
  };
  return Math.max(
    rule.minEffectivePower ?? 0,
    raw + (rule.effectivePowerModifier ?? 0),
  );
}
export const powerOf = (s: GameState, p: Piece) =>
  calculateEffectivePower(p, terrainAt(s, p.coord), s.config);
export function calculateMovement(
  base: number,
  terrain: Terrain,
  config: Pick<GameState["config"], "rules">,
): number {
  if (base === 0) return 0;
  const t = config.rules.terrain[terrain] as {
    movementFixed?: number;
    moveModifier?: number;
    floorIfPositiveBase?: number;
  };
  return (
    t.movementFixed ??
    Math.max(t.floorIfPositiveBase ?? 0, base + (t.moveModifier ?? 0))
  );
}
export function calculateTerritory(s: GameState): Record<string, Owner | null> {
  const result: Record<string, Owner | null> = {};
  const structures = s.pieces
    .filter((p) => p.kind !== "unit")
    .sort((a, b) => a.placementOrder - b.placementOrder);
  for (const h of s.config.maps[s.mapId].hexes)
    result[hexId(h)] =
      structures.find((p) => hexDistance(p.coord, h) <= stats(s, p).territory)
        ?.owner ?? null;
  return result;
}
export function calculateVisibleHexes(s: GameState, owner: Owner): string[] {
  const own = s.pieces.filter((p) => p.owner === owner);
  return s.config.maps[s.mapId].hexes
    .filter((h) =>
      own.some((p) => hexDistance(h, p.coord) <= stats(s, p).vision),
    )
    .map(hexId);
}
/** Internal helper: callers mutate only a fresh draft owned by applyAction. */
export function recordExploration(
  s: GameState,
  owner: Owner,
  extra: Coord[] = [],
): void {
  const explored = new Set(s.players[owner].exploredHexIds);
  for (const id of calculateVisibleHexes(s, owner)) explored.add(id);
  for (const c of extra) explored.add(hexId(c));
  s.players[owner].exploredHexIds = [...explored].sort();
}

/** Public immutable selector/update API. */
export function updateExploration(
  state: GameState,
  owner: Owner,
  visitedPath: Coord[] = [],
): GameState {
  const draft = structuredClone(state);
  const own = draft.pieces.filter((piece) => piece.owner === owner);
  // Movement records the moving piece at each actual path step in the engine.
  // Explicit coordinates here represent additional explored terrain (reveal).
  if (own.length || visitedPath.length)
    recordExploration(draft, owner, visitedPath);
  return draft;
}
