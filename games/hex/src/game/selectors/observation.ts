import type { GameState, Observation, Owner } from "../types";
import { calculateVisibleHexes, powerOf, stats } from "../rules/board";
import { hexId } from "../rules/hex";
export function getObservation(s: GameState, owner: Owner): Observation {
  const visible = new Set(calculateVisibleHexes(s, owner));
  const explored = new Set(s.players[owner].exploredHexIds);
  const { deck, ...self } = s.players[owner];
  const enemy = s.players[owner === "player" ? "cpu" : "player"];
  const map = s.config.maps[s.mapId];
  return structuredClone({
    version: s.version,
    seed: s.seed,
    mapId: s.mapId,
    mapName: map.name,
    radius: map.radius,
    headquarters: map.headquarters,
    owner,
    activePlayer: s.activePlayer,
    phase: s.phase,
    self: { ...self, deckCount: deck.length },
    opponent: {
      ownTurnNumber: enemy.ownTurnNumber,
      handCount: enemy.hand.length,
      deckCount: enemy.deck.length,
      resourceTotal: enemy.resourceTotal,
      resourceRemaining: enemy.resourceRemaining,
    },
    hexes: map.hexes.map((h) => ({
      q: h.q,
      r: h.r,
      terrain: explored.has(hexId(h)) ? h.terrain : undefined,
      visible: visible.has(hexId(h)),
      explored: explored.has(hexId(h)),
      territory: visible.has(hexId(h)) ? s.territoryOwner[hexId(h)] : undefined,
    })),
    pieces: s.pieces
      .filter((p) => p.owner === owner || visible.has(hexId(p.coord)))
      .map((p) => ({ ...p, power: powerOf(s, p), ...stats(s, p) })),
    outcome: s.outcome,
    events: s.actionLog.filter((e) => e.audience.includes(owner)),
  });
}
