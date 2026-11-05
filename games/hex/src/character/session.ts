import { validCharacter } from "./storage";
import { hexId } from "../game/rules/hex";
import type { CharacterFrame, PresentationEvent } from "./presentation";
import { stats } from "./roster";
import type { Coord, Owner } from "../game/types";
import { maps } from "../game/data";
import { neighbors } from "../game/rules/hex";
import { shuffle } from "../game/rng";
import { headquartersFor } from "./combat";
import { createInitialRoster } from "./roster";
import {
  applyBattleAction,
  battleResult,
  beginMovement,
  legalActions,
  observation,
  startBattle,
  type Battle,
  type BattleAction,
  type BattleObservation,
} from "./battle";
import { playCpuTurn } from "./cpu";
import type { Character } from "./types";

export type NewBattle = {
  id: string;
  seed: number;
  mapId: string;
  first: Owner;
  team: Character[];
  placements: Record<string, Coord>;
};

/** The full battle remains inside the session; the UI only receives player observations. */
export class CharacterSession {
  private battle: Battle;
  private step = 0;
  private config: NewBattle;
  private revision = 0;
  private chronicle: string[] = [];
  constructor(config: NewBattle) {
    this.config = structuredClone(config);
    const map = maps.find((m) => m.id === config.mapId);
    if (!map) throw Error("マップが見つかりません。");
    if (!config.id) throw Error("戦闘IDが必要です。");
    const cpu = createInitialRoster(config.seed ^ 0x7f4a7c15)
      .roster.filter((_, i) => [0, 1, 3, 4, 6, 7].includes(i))
      .map((c) => ({ ...c, characterId: `cpu-${config.id}-${c.characterId}` }));
    const slots = shuffle(
      neighbors(headquartersFor(map).cpu),
      config.seed ^ 0x51633e2d,
    ).items;
    const placements = Object.fromEntries(
      cpu.map((c, i) => [c.characterId, slots[i]]),
    );
    this.battle = startBattle(
      config.id,
      config.seed,
      map,
      { player: config.team, cpu },
      { player: config.placements, cpu: placements },
      config.first,
    );
  }
  snapshot() {
    return structuredClone({
      config: this.config,
      battle: this.battle,
      step: this.step,
      revision: this.revision,
      chronicle: this.chronicle,
    });
  }
  static restore(snapshot: ReturnType<CharacterSession["snapshot"]>) {
    const b = snapshot?.battle;
    const map = maps.find((m) => m.id === snapshot?.config?.mapId);
    if (
      !b ||
      !map ||
      b.id !== snapshot.config.id ||
      JSON.stringify(b.map) !== JSON.stringify(map) ||
      !Number.isInteger(snapshot.step) ||
      !Number.isInteger(snapshot.revision) ||
      snapshot.revision < 0 ||
      !["player", "cpu"].includes(b.activePlayer) ||
      !Array.isArray(b.participants) ||
      b.participants.length > 12 ||
      !b.participants.length
    )
      throw Error("戦闘セーブが破損しています。");
    const tiles = new Set(map.hexes.map(hexId));
    if (
      b.participants.some(
        (p) =>
          !validCharacter(p.character) ||
          !["player", "cpu"].includes(p.owner) ||
          !tiles.has(hexId(p.coord)) ||
          !Number.isInteger(p.hp) ||
          p.hp < 0 ||
          p.hp > stats(p.character).hp ||
          p.alive !== p.hp > 0,
      ) ||
      new Set(b.participants.map((p) => p.character.characterId)).size !==
        b.participants.length
    )
      throw Error("戦闘セーブの部隊が不正です。");
    const homes = headquartersFor(map);
    for (const owner of ["player", "cpu"] as const)
      if (
        !b.headquarters?.[owner] ||
        hexId(b.headquarters[owner].coord) !== hexId(homes[owner]) ||
        !Number.isInteger(b.headquarters[owner].hp) ||
        b.headquarters[owner].hp < 0 ||
        b.headquarters[owner].hp > 15 ||
        !Array.isArray(b.explored?.[owner]) ||
        b.explored[owner].some((c) => !tiles.has(c))
      )
        throw Error("戦闘セーブの地図が不正です。");
    const result = new CharacterSession(snapshot.config);
    result.battle = structuredClone(snapshot.battle);
    result.battle.actionNumber ??= 1;
    result.step = snapshot.step;
    result.revision = snapshot.revision;
    result.chronicle = snapshot.chronicle ?? [];
    return result;
  }
  advanceRevision() {
    this.revision++;
  }
  view() {
    const view = observation(this.battle, "player");
    return {
      observation: view,
      chronicle: [...this.chronicle],
      config: structuredClone(this.config),
      legal: legalActions(view),
      ...(this.battle.outcome?.winner === "player"
        ? { result: battleResult(this.battle) }
        : {}),
    };
  }
  move(actorId: string, path: Coord[]) {
    const frames: CharacterFrame[] = [];
    const capture = this.capture(frames);
    this.battle = beginMovement(this.battle, "player", actorId, path, capture);
    return { ...this.view(), frames };
  }
  act(action: BattleAction) {
    const frames: CharacterFrame[] = [];
    this.battle = applyBattleAction(
      this.battle,
      action,
      "player",
      this.capture(frames),
    );
    return { ...this.view(), frames };
  }
  private capture(frames: CharacterFrame[]) {
    let previous = observation(this.battle, "player");
    return (state: Battle, event?: PresentationEvent) => {
      const next = observation(state, "player");
      if (event) {
        const find = (o: BattleObservation, id: string) =>
          id.startsWith("hq_")
            ? id === "hq_player" || o.headquarters.cpu.hp !== undefined
              ? o.headquarters[id === "hq_player" ? "player" : "cpu"].coord
              : undefined
            : o.participants.find((p) => p.character.characterId === id)?.coord;
        const source = find(previous, event.actorId),
          target = find(previous, event.targetId);
        if (target) {
          const actor = previous.participants.find(
            (p) => p.character.characterId === event.actorId,
          );
          const dead = state.participants.find(
            (p) => p.character.characterId === event.targetId && !p.alive,
          );
          const impact = dead
            ? {
                ...next,
                participants: [...next.participants, { ...dead, hp: 0 }],
              }
            : next;
          const victim = previous.participants.find(
            (p) => p.character.characterId === event.targetId,
          );
          const actorName = actor
            ? `${actor.owner === "player" ? "自軍" : "敵軍"} ${actor.character.displayName}`
            : "視野外からの攻撃";
          this.chronicle = [
            ...this.chronicle,
            `${event.type === "counter" ? "反撃" : "攻撃"}：${actorName} → ${victim ? `${victim.owner === "player" ? "自軍" : "敵軍"} ${victim.character.displayName}` : "本城"} −${Math.min(event.amount, victim?.hp ?? event.amount)}`,
          ].slice(-60);
          frames.push({
            kind: "hit",
            before: previous,
            after: impact,
            source,
            target,
            actorId: source ? event.actorId : undefined,
            targetId: event.targetId,
            amount: Math.min(
              event.amount,
              previous.participants.find(
                (p) => p.character.characterId === event.targetId,
              )?.hp ??
                previous.headquarters[
                  event.targetId === "hq_player" ? "player" : "cpu"
                ].hp ??
                event.amount,
            ),
            counter: event.type === "counter",
            range: actor ? stats(actor.character).range : undefined,
          });
          if (dead)
            frames.push({
              kind: "destroy",
              before: {
                ...next,
                participants: [...next.participants, { ...dead, hp: 0 }],
              },
              after: next,
              target,
              targetId: event.targetId,
            });
          if (
            event.targetId.startsWith("hq_") &&
            state.headquarters[
              event.targetId === "hq_player" ? "player" : "cpu"
            ].hp === 0
          )
            frames.push({
              kind: "destroy",
              before: next,
              after: next,
              target,
              targetId: event.targetId,
            });
        }
      } else if (JSON.stringify(next) !== JSON.stringify(previous))
        frames.push({ kind: "move", before: previous, after: next });
      previous = next;
    };
  }
  cpu() {
    if (this.battle.activePlayer !== "cpu" || this.battle.outcome)
      throw Error("CPUの手番ではありません。");
    const frames: CharacterFrame[] = [];
    this.battle = playCpuTurn(
      this.battle,
      (this.battle.seed + ++this.step) >>> 0,
      this.capture(frames),
    );
    return { ...this.view(), frames };
  }
}
