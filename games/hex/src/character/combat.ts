import type { Coord, MapDefinition, Terrain } from "../game/types";
import { hexDistance, hexId, neighbors } from "../game/rules/hex";
import { stats } from "./roster";
import type { Participant } from "./types";

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
  if (attack <= 0) return 0;
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
/** Combat preserves attack when HP is reduced and attributes counter-kills. */
export function resolveCombat(
  attacker: Participant,
  defender: Participant,
  attackerTerrain: Terrain,
  defenderTerrain: Terrain,
) {
  if (!attacker.alive || !defender.alive || attacker.owner === defender.owner)
    throw Error("攻撃対象が不正です。");
  const a = structuredClone(attacker),
    d = structuredClone(defender),
    as = stats(a.character),
    ds = stats(d.character);
  const distance = hexDistance(a.coord, d.coord);
  if (distance < 1 || distance > as.range) throw Error("射程外です。");
  const hit = damage(as.attack, attackerTerrain);
  d.hp = Math.max(0, d.hp - hit);
  d.alive = d.hp > 0;
  if (!d.alive) a.killsThisBattle++;
  let counter = 0;
  if (d.alive && distance <= ds.range) {
    counter = damage(ds.attack, defenderTerrain, true, ds.counterTenths);
    a.hp = Math.max(0, a.hp - counter);
    a.alive = a.hp > 0;
    if (!a.alive) d.killsThisBattle++;
  }
  return { attacker: a, defender: d, hit, counter };
}
