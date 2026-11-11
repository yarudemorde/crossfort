import { attackDamage, resolveBoardCombat } from "./combat";
import { hasThrust, thrustRay } from "./targeting";
import { stats } from "./roster";
import { sameHex } from "../game/rules/hex";
import type { Coord, Terrain } from "../game/types";
import type { BattleAction, BattleObservation } from "./battle";

export type AttackForecast = {
  requestedTargetId: string;
  hitTargetId: string;
  counterTargetId?: string;
  hit: number;
  counter: number;
  attackerHpAfter: number;
  hitTargetHpAfter: number;
  counterTargetHpAfter?: number;
  directional: boolean;
  uncertain: boolean;
  aim: Coord;
  ray: Coord[];
};

/** UI and CPU share this observation-only projection. No private state is accepted. */
export function forecastAttack(
  o: BattleObservation,
  action: BattleAction,
): AttackForecast | undefined {
  if (action.type !== "act" || !action.targetId || action.effect === "heal")
    return;
  const source = o.participants.find(
    (p) => p.character.characterId === action.actorId && p.alive,
  );
  if (!source) return;
  const enemy = o.owner === "player" ? "cpu" : "player";
  const requested = o.participants.find(
    (p) =>
      p.character.characterId === action.targetId &&
      p.alive &&
      p.owner !== source.owner,
  );
  const home =
    action.targetId === `hq_${enemy}` ? o.headquarters[enemy] : undefined;
  if ((!requested && !home) || (home?.hp === undefined && !requested)) return;
  const aim = requested?.coord ?? home!.coord;
  const board = structuredClone(o.participants),
    attacker = board.find((p) => p.character.characterId === action.actorId)!;
  attacker.coord = action.path.at(-1) ?? attacker.coord;
  const terrain = (coord: Coord): Terrain =>
    o.hexes.find((h) => sameHex(h, coord))?.terrain ?? "plain";
  const exchange = resolveBoardCombat(
    attacker,
    aim,
    board,
    terrain,
    o.pendingMovedHexes ?? action.path.length,
  );
  const recipient = exchange?.participants.find(
    (p) => p.character.characterId === exchange.hitTargetId,
  );
  const counterRecipient = exchange?.participants.find(
    (p) => p.character.characterId === exchange.counterTargetId,
  );
  const hit =
    exchange?.hit ??
    attackDamage(
      attacker.character,
      terrain(attacker.coord),
      o.pendingMovedHexes ?? action.path.length,
      false,
    );
  const ray = hasThrust(attacker.character)
    ? thrustRay(attacker.coord, aim, stats(attacker.character).range)
    : [];
  const defender =
    exchange &&
    board.find((p) => p.character.characterId === exchange.hitTargetId);
  const counterRay =
    defender && hasThrust(defender.character) && exchange.counter > 0
      ? thrustRay(
          defender.coord,
          attacker.coord,
          stats(defender.character).range,
        )
      : [];
  // This flag depends only on public visibility, never on hidden occupants.
  const uncertain = [...ray, ...counterRay].some(
    (c) => !o.hexes.some((h) => sameHex(h, c) && h.visible),
  );
  return {
    requestedTargetId: action.targetId,
    hitTargetId: exchange?.hitTargetId ?? action.targetId,
    counterTargetId: exchange?.counterTargetId,
    hit,
    counter: exchange?.counter ?? 0,
    attackerHpAfter:
      exchange?.participants.find(
        (p) => p.character.characterId === action.actorId,
      )!.hp ?? attacker.hp,
    hitTargetHpAfter: recipient?.hp ?? Math.max(0, (home?.hp ?? 0) - hit),
    counterTargetHpAfter: counterRecipient?.hp,
    directional: hasThrust(attacker.character),
    uncertain,
    aim,
    ray,
  };
}
