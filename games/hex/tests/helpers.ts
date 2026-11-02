import { createGame } from "../src/game/engine";
import { calculateTerritory, recordExploration } from "../src/game/rules/board";
import type {
  Coord,
  GameState,
  Owner,
  Piece,
  Terrain,
} from "../src/game/types";
import { hexId } from "../src/game/rules/hex";
export function fixture(): GameState {
  const s = createGame(123, "crossing");
  s.players.player.ownTurnNumber = 2;
  s.players.cpu.ownTurnNumber = 2;
  return s;
}
export function add(
  s: GameState,
  id: string,
  owner: Owner,
  coord: Coord,
  power = 4,
  definitionId = "unit_infantry",
): Piece {
  const kind = definitionId.startsWith("landmark") ? "landmark" : "unit";
  const p: Piece = {
    instanceId: id,
    definitionId,
    owner,
    kind,
    coord,
    basePower: power,
    accumulatedDamage: 0,
    temporaryBonus: 0,
    summonedOnOwnTurn: 0,
    actedThisTurn: false,
    placementOrder: s.nextPlacementOrder++,
  };
  s.pieces.push(p);
  refresh(s);
  return p;
}
export function refresh(s: GameState) {
  s.territoryOwner = calculateTerritory(s);
  recordExploration(s, "player");
  recordExploration(s, "cpu");
}
export function terrain(s: GameState, c: Coord, t: Terrain) {
  s.config.maps[s.mapId].hexes.find((h) => hexId(h) === hexId(c))!.terrain = t;
}
