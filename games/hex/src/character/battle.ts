import rules from "../../data/ruleset.characters.json";
import { beginRound, finishActor } from "./rounds";
import type { PresentationEvent } from "./presentation";
import type { Coord, MapDefinition, Owner, Terrain } from "../game/types";
import { hexDistance, hexId, neighbors, sameHex } from "../game/rules/hex";
import {
  headquartersFor,
  validateDeployment,
  movement,
  attackDamage,
  resolveBoardCombat,
} from "./combat";
import { canAttack, resolveHealing } from "./abilities";
import { stats, validateFormation } from "./roster";
import type { BattleResult, Character, Participant } from "./types";

export type BattleAction =
  | { type: "pass" }
  | {
      type: "act";
      actorId: string;
      path: Coord[];
      targetId?: string;
      effect?: "heal";
    };
export type Battle = {
  id: string;
  seed: number;
  map: MapDefinition;
  activePlayer: Owner;
  actionNumber: number;
  roundNumber: number;
  turnOrder: string[];
  turnIndex: number;
  actedIds: string[];
  currentActorId: string;
  pendingActorId?: string;
  pendingMovedHexes?: number;
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
  roundNumber: number;
  currentActorId?: string;
  timeline: {
    characterId: string;
    owner: Owner;
    acted: boolean;
    current: boolean;
  }[];
  pendingActorId?: string;
  /** Own pending action only; hidden enemy routes are never exposed. */
  pendingMovedHexes?: number;
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
    {
      coord: state.headquarters[owner].coord,
      range: rules.headquarters.vision,
    },
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
export function publicParticipant(participant: Participant): Participant {
  const copy = { ...participant };
  delete copy.initiativeKey;
  return copy;
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
    roundNumber: state.roundNumber,
    currentActorId: state.participants.some(
      (p) =>
        p.character.characterId === state.currentActorId &&
        (p.owner === owner || sight.has(hexId(p.coord))),
    )
      ? state.currentActorId
      : undefined,
    timeline: state.turnOrder.flatMap((id) => {
      const p = state.participants.find(
        (p) =>
          p.character.characterId === id &&
          p.alive &&
          (p.owner === owner || sight.has(hexId(p.coord))),
      );
      return p
        ? [
            {
              characterId: id,
              owner: p.owner,
              acted: state.actedIds.includes(id),
              current: id === state.currentActorId,
            },
          ]
        : [];
    }),
    pendingActorId:
      owner === state.activePlayer ? state.pendingActorId : undefined,
    ...(owner === state.activePlayer && state.pendingActorId
      ? { pendingMovedHexes: state.pendingMovedHexes ?? 0 }
      : {}),
    headquarters: {
      [owner]: state.headquarters[owner],
      [enemy]: {
        coord: state.headquarters[enemy].coord,
        ...(sight.has(hexId(state.headquarters[enemy].coord))
          ? { hp: state.headquarters[enemy].hp }
          : {}),
      },
    } as BattleObservation["headquarters"],
    participants: state.participants
      .filter(
        (p) => p.alive && (p.owner === owner || sight.has(hexId(p.coord))),
      )
      .map(publicParticipant),
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
  _legacyFirst?: Owner,
): Battle {
  void _legacyFirst; // Retained only for v2 configuration compatibility; initiative determines the first actor.
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
    activePlayer: "player",
    actionNumber: 1,
    roundNumber: 1,
    turnOrder: [],
    turnIndex: 0,
    actedIds: [],
    currentActorId: "",
    headquarters: {
      player: { coord: hq.player, hp: rules.headquarters.hp },
      cpu: { coord: hq.cpu, hp: rules.headquarters.hp },
    },
    explored: { player: [], cpu: [] },
    events: [],
    participants: (["player", "cpu"] as const).flatMap((owner) =>
      teams[owner].map((character, index) => ({
        initiativeKey:
          owner === "cpu" ? `cpu-slot-${index}` : character.characterId,
        character: structuredClone(character),
        owner,
        coord: { ...placements[owner][character.characterId] },
        hp: stats(character).hp,
        alive: true,
        killsThisBattle: 0,
      })),
    ),
  };
  beginRound(s);
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
    if (
      o.currentActorId !== p.character.characterId ||
      (o.pendingActorId && o.pendingActorId !== p.character.characterId)
    )
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
        for (const e of canAttack(p.character)
          ? enemies
          : own.filter(
              (ally) =>
                ally.character.characterId !== p.character.characterId &&
                ally.hp < stats(ally.character).hp,
            )) {
          const d = hexDistance(node.coord, e.coord);
          if (d >= 1 && d <= stats(p.character).range)
            out.push({
              type: "act",
              actorId: p.character.characterId,
              path: node.path,
              targetId: e.character.characterId,
              ...(!canAttack(p.character) ? { effect: "heal" as const } : {}),
            });
        }
        const enemyHq = o.headquarters[other(o.owner)],
          d = hexDistance(node.coord, enemyHq.coord);
        if (
          canAttack(p.character) &&
          enemyHq.hp !== undefined &&
          d >= 1 &&
          d <= stats(p.character).range
        )
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
  onStep?: (state: Battle, event?: PresentationEvent) => void,
): Battle {
  if (state.outcome || state.activePlayer !== owner || state.pendingActorId)
    throw Error("現在の手番ではありません。");
  const o = observation(state, owner);
  const actor = o.participants.find(
    (p) => p.owner === owner && p.character.characterId === actorId,
  );
  if (
    !actor ||
    actorId !== state.currentActorId ||
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
  const moved = moveAlong(s, p, path, onStep);
  s.pendingActorId = actorId;
  s.pendingMovedHexes = moved.movedHexes;
  return s;
}
function moveAlong(
  s: Battle,
  p: Participant,
  path: Coord[],
  onStep?: (state: Battle, event?: PresentationEvent) => void,
): { blocked: boolean; movedHexes: number } {
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
      return { blocked: true, movedHexes: traversed.length };
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
  return { blocked: false, movedHexes: traversed.length };
}
export function applyBattleAction(
  state: Battle,
  action: BattleAction,
  owner: Owner,
  onStep?: (state: Battle, event?: PresentationEvent) => void,
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
          a.effect === action.effect &&
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
    const moved = moveAlong(s, p, action.path, onStep);
    const movedHexes = state.pendingActorId
      ? (state.pendingMovedHexes ?? 0)
      : moved.movedHexes;
    // A hidden enemy may interrupt an otherwise legal path without revealing its identity.
    if (!moved.blocked && action.targetId) {
      const enemy = other(owner);
      if (action.effect === "heal") {
        const target = s.participants.find(
          (x) => x.character.characterId === action.targetId,
        )!;
        const healing = resolveHealing(p, target);
        Object.assign(target, healing.target);
        const event = {
          type: "heal" as const,
          actorId: action.actorId,
          targetId: action.targetId,
          amount: healing.amount,
        };
        s.events.push(event);
        onStep?.(s, event);
      } else {
        const isHeadquarters = action.targetId === `hq_${enemy}`;
        const requested = s.participants.find(
          (x) =>
            x.character.characterId === action.targetId &&
            x.owner === enemy &&
            x.alive,
        );
        if (
          !isHeadquarters &&
          (!requested || !visible(s, owner).has(hexId(requested.coord)))
        )
          throw Error("攻撃対象が見えません。");
        const aim = isHeadquarters
          ? s.headquarters[enemy].coord
          : requested!.coord;
        const exchange = resolveBoardCombat(
          p,
          aim,
          s.participants,
          (coord) => terrainAt(s, coord),
          movedHexes,
        );
        if (exchange) {
          for (const stage of exchange.stages) {
            for (const updated of stage.participants) {
              Object.assign(
                s.participants.find(
                  (x) =>
                    x.character.characterId === updated.character.characterId,
                )!,
                updated,
              );
            }
            s.events.push(stage.event);
            onStep?.(s, stage.event);
          }
        } else if (isHeadquarters) {
          const amount = attackDamage(
            p.character,
            terrainAt(s, p.coord),
            movedHexes,
            false,
          );
          s.headquarters[enemy].hp = Math.max(
            0,
            s.headquarters[enemy].hp - amount,
          );
          const event = {
            type: "attack" as const,
            actorId: action.actorId,
            targetId: action.targetId,
            amount,
          };
          s.events.push(event);
          onStep?.(s, event);
        } else throw Error("命中対象が見つかりません。");
      }
    }
  }
  reveal(s);
  delete s.pendingActorId;
  delete s.pendingMovedHexes;
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
  if (!s.outcome) {
    finishActor(s);
    s.actionNumber++;
  }
  return s;
}
export function battleResult(s: Battle): BattleResult {
  if (!s.outcome) throw Error("戦闘が終了していません。");
  return {
    id: s.id,
    ...s.outcome,
    participants: structuredClone(s.participants.map(publicParticipant)),
  };
}
