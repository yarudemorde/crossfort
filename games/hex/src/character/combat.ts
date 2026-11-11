import type { Coord, MapDefinition, Terrain } from "../game/types";
import { hexDistance, hexId, neighbors, sameHex } from "../game/rules/hex";
import { stats } from "./roster";
import { canAttack, canCounter, chargeBonus } from "./abilities";
import type { Character, Participant } from "./types";
import { resolveHitTarget } from "./targeting";
import type { PresentationEvent } from "./presentation";

/** Public placement rule; does not require map terrain. */
export function headquartersForRadius(radius: number) {
  const distance = radius - 1;
  return {
    player: { q: -distance, r: 0 },
    cpu: { q: distance, r: 0 },
  };
}
/** Place headquarters one hex inside each edge so all six adjacent slots exist. */
export function headquartersFor(map: MapDefinition) {
  const headquarters = headquartersForRadius(map.radius);
  const tiles = new Set(map.hexes.map(hexId));
  const player = neighbors(headquarters.player),
    cpu = neighbors(headquarters.cpu);
  if (
    !tiles.has(hexId(headquarters.player)) ||
    !tiles.has(hexId(headquarters.cpu)) ||
    [...player, ...cpu].some((c) => !tiles.has(hexId(c))) ||
    player.some((c) => cpu.some((d) => hexId(c) === hexId(d))) ||
    player.some((c) => hexId(c) === hexId(headquarters.cpu)) ||
    cpu.some((c) => hexId(c) === hexId(headquarters.player))
  )
    throw Error("本城と配置マスが不正です。");
  return headquarters;
}
export function validateDeployment(
  map: MapDefinition,
  home: Coord,
  ids: string[],
  placements: Record<string, Coord>,
): string | undefined {
  if (!ids.length || ids.length > 6 || new Set(ids).size !== ids.length)
    return "出撃者が不正です。";
  const tiles = new Set(map.hexes.map(hexId));
  const entries = Object.entries(placements);
  if (
    entries.length !== ids.length ||
    entries.some(([id]) => !ids.includes(id))
  )
    return "全員を配置してください。";
  const coords = entries.map(([, c]) => c);
  if (
    coords.some((c) => !tiles.has(hexId(c)) || hexDistance(c, home) !== 1) ||
    new Set(coords.map(hexId)).size !== coords.length
  )
    return "配置先が不正です。";
}
export function movement(base: number, terrain: Terrain): number {
  if (base <= 0) return 0;
  if (terrain === "river") return 1;
  if (terrain === "mountain") return Math.max(1, base - 1);
  if (terrain === "swamp") return Math.max(1, base - 2);
  return base;
}
export function damage(
  attack: number,
  terrain: Terrain,
  counter = false,
  counterTenths = 10,
): number {
  if (attack <= 0 || (counter && counterTenths <= 0)) return 0;
  return (
    (counter
      ? Math.ceil(
          (Math.max(1, attack - (terrain === "desert" ? 1 : 0)) *
            counterTenths) /
            10,
        )
      : Math.max(1, attack - (terrain === "desert" ? 1 : 0))) +
    (counter && (terrain === "forest" || terrain === "mountain") ? 1 : 0)
  );
}
export function attackDamage(
  character: Character,
  terrain: Terrain,
  movedHexes = 0,
  unitTarget = true,
) {
  return canAttack(character)
    ? damage(
        stats(character).attack +
          chargeBonus(character, movedHexes, unitTarget),
        terrain,
      )
    : 0;
}
export function counterDamage(character: Character, terrain: Terrain) {
  return canCounter(character)
    ? damage(
        stats(character).attack,
        terrain,
        true,
        stats(character).counterTenths,
      )
    : 0;
}
export type CombatStage = {
  event: PresentationEvent;
  participants: Participant[];
};

/** Select each actual recipient before applying damage. There is at most one counter.
 * Authoritative play supplies all soldiers; previews/CPU supply only observations.
 */
export function resolveBoardCombat(
  attacker: Participant,
  aim: Coord,
  participants: readonly Participant[],
  terrainAt: (coord: Coord) => Terrain,
  movedHexes = 0,
) {
  if (!canAttack(attacker.character) || !attacker.alive)
    throw Error("攻撃対象が不正です。");
  const distance = hexDistance(attacker.coord, aim);
  if (distance < 1 || distance > stats(attacker.character).range)
    throw Error("射程外です。");
  const board = structuredClone([...participants]);
  const a = board.find(
    (p) => p.character.characterId === attacker.character.characterId,
  );
  if (!a) throw Error("攻撃者が見つかりません。");
  const d = resolveHitTarget(a, aim, board);
  if (!d) return;
  const stages: CombatStage[] = [];
  const hit = attackDamage(a.character, terrainAt(a.coord), movedHexes);
  d.hp = Math.max(0, d.hp - hit);
  d.alive = d.hp > 0;
  if (!d.alive) a.killsThisBattle++;
  stages.push({
    event: {
      type: "attack",
      actorId: a.character.characterId,
      targetId: d.character.characterId,
      amount: hit,
      charge: chargeBonus(a.character, movedHexes) > 0,
    },
    participants: structuredClone(board),
  });
  let counter = 0,
    counterTargetId: string | undefined;
  if (
    d.alive &&
    canCounter(d.character) &&
    hexDistance(d.coord, a.coord) <= stats(d.character).range
  ) {
    const recipient = resolveHitTarget(d, a.coord, board);
    if (recipient) {
      counter = counterDamage(d.character, terrainAt(d.coord));
      if (counter > 0) {
        counterTargetId = recipient.character.characterId;
        recipient.hp = Math.max(0, recipient.hp - counter);
        recipient.alive = recipient.hp > 0;
        if (!recipient.alive) d.killsThisBattle++;
        stages.push({
          event: {
            type: "counter",
            actorId: d.character.characterId,
            targetId: counterTargetId,
            amount: counter,
          },
          participants: structuredClone(board),
        });
      }
    }
  }
  return {
    participants: board,
    stages,
    hit,
    counter,
    hitTargetId: d.character.characterId,
    counterTargetId,
  };
}

/** Compatible two-soldier API, backed by the same board combat resolver. */
export function resolveCombat(
  attacker: Participant,
  defender: Participant,
  attackerTerrain: Terrain,
  defenderTerrain: Terrain,
  movedHexes = 0,
) {
  if (!defender.alive || attacker.owner === defender.owner)
    throw Error("攻撃対象が不正です。");
  const r = resolveBoardCombat(
    attacker,
    defender.coord,
    [attacker, defender],
    (coord) =>
      sameHex(coord, attacker.coord) ? attackerTerrain : defenderTerrain,
    movedHexes,
  );
  if (!r) throw Error("攻撃対象が不正です。");
  return {
    ...r,
    attacker: r.participants.find(
      (p) => p.character.characterId === attacker.character.characterId,
    )!,
    defender: r.participants.find(
      (p) => p.character.characterId === defender.character.characterId,
    )!,
  };
}
