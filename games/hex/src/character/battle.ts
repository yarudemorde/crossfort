import type { Coord, MapDefinition, Owner, Terrain } from "../game/types";
import { hexDistance, hexId, neighbors, sameHex } from "../game/rules/hex";
import {
  headquartersFor,
  validateDeployment,
  movement,
  damage,
  resolveCombat,
} from "./combat";
import { stats, validateFormation } from "./roster";
import type { BattleResult, Character, Participant } from "./types";

export type BattleAction =
  | { type: "pass" }
  | { type: "act"; actorId: string; path: Coord[]; targetId?: string };
export type Battle = {
  id: string;
  seed: number;
  map: MapDefinition;
  activePlayer: Owner;
  pendingActorId?: string;
  participants: Participant[];
  headquarters: Record<Owner, { coord: Coord; hp: number }>;
  explored: Record<Owner, string[]>;
  outcome?: {
    winner: Owner;
    reason: "headquartersDestroyed" | "allUnitsKilled";
  };
  events: {
    type: string;
    actorId?: string;
    targetId?: string;
    amount?: number;
    coord?: Coord;
  }[];
};
export type BattleObservation = {
  id: string;
  mapId: string;
  radius: number;
  owner: Owner;
  activePlayer: Owner;
  pendingActorId?: string;
  headquarters: Record<Owner, { coord: Coord; hp?: number }>;
  participants: Participant[];
  hexes: (Coord & { terrain?: Terrain; visible: boolean; explored: boolean })[];
  outcome?: Battle["outcome"];
};
const other = (owner: Owner): Owner => (owner === "player" ? "cpu" : "player");
const terrainAt = (state: Battle, c: Coord): Terrain =>
  state.map.hexes.find((h) => sameHex(h, c))?.terrain ?? "plain";
function visible(state: Battle, owner: Owner) {
  const sources = [
    { coord: state.headquarters[owner].coord, range: 2 },
    ...state.participants
      .filter((p) => p.owner === owner && p.alive)
      .map((p) => ({ coord: p.coord, range: stats(p.character).vision })),
  ];
  return new Set(
    state.map.hexes
      .filter((h) => sources.some((s) => hexDistance(h, s.coord) <= s.range))
      .map(hexId),
  );
}
function reveal(state: Battle) {
  for (const owner of ["player", "cpu"] as const)
    state.explored[owner] = [
      ...new Set([...state.explored[owner], ...visible(state, owner)]),
    ];
}
export function observation(state: Battle, owner: Owner): BattleObservation {
  const sight = visible(state, owner),
    explored = new Set(state.explored[owner]),
    enemy = other(owner);
  return structuredClone({
    id: state.id,
    mapId: state.map.id,
    radius: state.map.radius,
    owner,
    activePlayer: state.activePlayer,
    pendingActorId:
      owner === state.activePlayer ? state.pendingActorId : undefined,
    headquarters: {
      [owner]: state.headquarters[owner],
      [enemy]: {
        coord: state.headquarters[enemy].coord,
        ...(sight.has(hexId(state.headquarters[enemy].coord))
          ? { hp: state.headquarters[enemy].hp }
          : {}),
      },
    } as BattleObservation["headquarters"],
    participants: state.participants.filter(
      (p) => p.alive && (p.owner === owner || sight.has(hexId(p.coord))),
    ),
    hexes: state.map.hexes.map((h) => ({
      q: h.q,
      r: h.r,
      visible: sight.has(hexId(h)),
      explored: explored.has(hexId(h)),
      ...(explored.has(hexId(h)) ? { terrain: h.terrain } : {}),
    })),
    outcome: state.outcome,
  });
}
export function startBattle(
  id: string,
  seed: number,
  map: MapDefinition,
  teams: Record<Owner, Character[]>,
  placements: Record<Owner, Record<string, Coord>>,
  first: Owner,
): Battle {
  const hq = headquartersFor(map);
  for (const owner of ["player", "cpu"] as const) {
    const ids = teams[owner].map((c) => c.characterId);
    const error =
      validateFormation(ids, teams[owner]) ??
      validateDeployment(map, hq[owner], ids, placements[owner]);
    if (error) throw Error(error);
  }
  const all = [...teams.player, ...teams.cpu];
  if (new Set(all.map((c) => c.characterId)).size !== all.length)
    throw Error("キャラクターIDが重複しています。");
  const s: Battle = {
    id,
    seed: seed >>> 0,
    map: structuredClone(map),
    activePlayer: first,
    headquarters: {
      player: { coord: hq.player, hp: 15 },
      cpu: { coord: hq.cpu, hp: 15 },
    },
    explored: { player: [], cpu: [] },
    events: [],
    participants: (["player", "cpu"] as const).flatMap((owner) =>
      teams[owner].map((character) => ({
        character: structuredClone(character),
        owner,
        coord: { ...placements[owner][character.characterId] },
        hp: stats(character).hp,
        alive: true,
        killsThisBattle: 0,
      })),
    ),
  };
  reveal(s);
  return s;
}
/** Only observation data may be used by this function or the CPU. */
export function legalActions(o: BattleObservation): BattleAction[] {
  if (o.outcome || o.owner !== o.activePlayer) return [];
  const out: BattleAction[] = [{ type: "pass" }],
    tiles = new Map(o.hexes.map((h) => [hexId(h), h]));
  const enemies = o.participants.filter((p) => p.owner !== o.owner),
    own = o.participants.filter((p) => p.owner === o.owner),
    hqs = Object.values(o.headquarters).map((h) => h.coord);
  for (const p of own) {
    if (o.pendingActorId && o.pendingActorId !== p.character.characterId)
      continue;
    const limit = movement(
      stats(p.character).movement,
      tiles.get(hexId(p.coord))?.terrain ?? "plain",
    );
    const queue: { coord: Coord; path: Coord[] }[] = [
        { coord: p.coord, path: [] },
      ],
      seen = new Set([hexId(p.coord)]);
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i],
        occupied = own.some(
          (x) =>
            x.character.characterId !== p.character.characterId &&
            sameHex(x.coord, node.coord),
        );
      if (!occupied) {
        if (node.path.length)
          out.push({
            type: "act",
            actorId: p.character.characterId,
            path: node.path,
          });
        for (const e of enemies) {
          const d = hexDistance(node.coord, e.coord);
          if (d >= 1 && d <= stats(p.character).range)
            out.push({
              type: "act",
              actorId: p.character.characterId,
              path: node.path,
              targetId: e.character.characterId,
            });
        }
        const enemyHq = o.headquarters[other(o.owner)],
          d = hexDistance(node.coord, enemyHq.coord);
        if (enemyHq.hp !== undefined && d >= 1 && d <= stats(p.character).range)
          out.push({
            type: "act",
            actorId: p.character.characterId,
            path: node.path,
            targetId: `hq_${other(o.owner)}`,
          });
      }
      if (o.pendingActorId || node.path.length >= limit) continue;
      for (const n of neighbors(node.coord)) {
        const key = hexId(n);
        if (
          !tiles.has(key) ||
          seen.has(key) ||
          hqs.some((h) => sameHex(h, n)) ||
          enemies.some((e) => sameHex(e.coord, n))
        )
          continue;
        seen.add(key);
        queue.push({ coord: n, path: [...node.path, n] });
      }
    }
  }
  return out;
}
/** Commit movement before choosing an attack, so newly revealed enemies become valid targets. */
export function beginMovement(
  state: Battle,
  owner: Owner,
  actorId: string,
  path: Coord[],
  onStep?: (state: Battle) => void,
): Battle {
  if (state.outcome || state.activePlayer !== owner || state.pendingActorId)
    throw Error("現在の手番ではありません。");
  const o = observation(state, owner);
  const actor = o.participants.find(
    (p) => p.owner === owner && p.character.characterId === actorId,
  );
  if (
    !actor ||
    (path.length > 0 &&
      !legalActions(o).some(
        (a) =>
          a.type === "act" &&
          a.actorId === actorId &&
          !a.targetId &&
          a.path.length === path.length &&
          a.path.every((c, i) => sameHex(c, path[i])),
      ))
  )
    throw Error("移動できません。");
  const s = structuredClone(state);
  const p = s.participants.find((x) => x.character.characterId === actorId)!;
  moveAlong(s, p, path, onStep);
  s.pendingActorId = actorId;
  return s;
}
function moveAlong(
  s: Battle,
  p: Participant,
  path: Coord[],
  onStep?: (state: Battle) => void,
): boolean {
  let lastFree = { ...p.coord };
  const traversed: Coord[] = [];
  for (const c of path) {
    if (
      s.participants.some(
        (x) => x.alive && x.owner !== p.owner && sameHex(x.coord, c),
      )
    ) {
      // Retrace through occupied friendly hexes rather than teleporting.
      for (const previous of traversed.slice(0, -1).reverse()) {
        if (sameHex(p.coord, lastFree)) break;
        p.coord = previous;
        reveal(s);
        s.events.push({
          type: "move",
          actorId: p.character.characterId,
          coord: { ...previous },
        });
        onStep?.(s);
      }
      if (!sameHex(p.coord, lastFree)) {
        p.coord = lastFree;
        reveal(s);
        s.events.push({
          type: "move",
          actorId: p.character.characterId,
          coord: { ...lastFree },
        });
        onStep?.(s);
      }
      return true;
    }
    p.coord = { ...c };
    traversed.push({ ...c });
    reveal(s);
    s.events.push({
      type: "move",
      actorId: p.character.characterId,
      coord: { ...c },
    });
    onStep?.(s);
    if (
      !s.participants.some(
        (x) =>
          x.alive &&
          x.character.characterId !== p.character.characterId &&
          sameHex(x.coord, c),
      )
    )
      lastFree = { ...c };
  }
  return false;
}
export function applyBattleAction(
  state: Battle,
  action: BattleAction,
  owner: Owner,
  onStep?: (state: Battle) => void,
): Battle {
  if (state.outcome || state.activePlayer !== owner)
    throw Error("現在の手番ではありません。");
  const o = observation(state, owner);
  if (
    !legalActions(o).some((a) =>
      a.type === "pass" || action.type === "pass"
        ? a.type === action.type
        : a.actorId === action.actorId &&
          a.targetId === action.targetId &&
          a.path.length === action.path.length &&
          a.path.every((c, i) => sameHex(c, action.path[i])),
    )
  )
    throw Error("行動できません。");
  const s = structuredClone(state);
  if (action.type === "act") {
    const p = s.participants.find(
      (x) =>
        x.character.characterId === action.actorId &&
        x.alive &&
        x.owner === owner,
    )!;
    const blocked = moveAlong(s, p, action.path, onStep);
    // A hidden enemy may interrupt an otherwise legal path without revealing its identity.
    if (!blocked && action.targetId) {
      const enemy = other(owner);
      if (action.targetId === `hq_${enemy}`) {
        const amount = damage(stats(p.character).attack, terrainAt(s, p.coord));
        s.headquarters[enemy].hp = Math.max(
          0,
          s.headquarters[enemy].hp - amount,
        );
        s.events.push({
          type: "attack",
          actorId: action.actorId,
          targetId: action.targetId,
          amount,
        });
      } else {
        const target = s.participants.find(
          (x) =>
            x.character.characterId === action.targetId &&
            x.owner === enemy &&
            x.alive,
        );
        if (!target || !visible(s, owner).has(hexId(target.coord)))
          throw Error("攻撃対象が見えません。");
        const r = resolveCombat(
          p,
          target,
          terrainAt(s, p.coord),
          terrainAt(s, target.coord),
        );
        Object.assign(p, r.attacker);
        Object.assign(target, r.defender);
        s.events.push({
          type: "attack",
          actorId: action.actorId,
          targetId: action.targetId,
          amount: r.hit,
        });
        if (r.counter)
          s.events.push({
            type: "counter",
            actorId: action.targetId,
            targetId: action.actorId,
            amount: r.counter,
          });
      }
    }
  }
  reveal(s);
  delete s.pendingActorId;
  // If both sides are eliminated after one action, the acting side loses.
  const enemy = other(owner);
  if (
    s.headquarters[owner].hp <= 0 ||
    !s.participants.some((p) => p.owner === owner && p.alive)
  )
    s.outcome = {
      winner: enemy,
      reason:
        s.headquarters[owner].hp <= 0
          ? "headquartersDestroyed"
          : "allUnitsKilled",
    };
  else if (
    s.headquarters[enemy].hp <= 0 ||
    !s.participants.some((p) => p.owner === enemy && p.alive)
  )
    s.outcome = {
      winner: owner,
      reason:
        s.headquarters[enemy].hp <= 0
          ? "headquartersDestroyed"
          : "allUnitsKilled",
    };
  if (!s.outcome) s.activePlayer = enemy;
  return s;
}
export function battleResult(s: Battle): BattleResult {
  if (!s.outcome) throw Error("戦闘が終了していません。");
  return {
    id: s.id,
    ...s.outcome,
    participants: structuredClone(s.participants),
  };
}
