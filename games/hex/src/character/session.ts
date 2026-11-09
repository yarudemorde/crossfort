import rules from "../../data/ruleset.characters.json";
import { validRoundState } from "./rounds";
import { createCpuTeam } from "./encounters";
import { sameCharacter } from "./reward";
import { validCharacter } from "./validation";
import { hexId } from "../game/rules/hex";
import type { CharacterFrame, PresentationEvent } from "./presentation";
import { stats } from "./roster";
import type { Coord, Owner } from "../game/types";
import { maps } from "../game/data";
import { neighbors } from "../game/rules/hex";
import { shuffle } from "../game/rng";
import { headquartersFor } from "./combat";
import {
  applyBattleAction,
  battleResult,
  beginMovement,
  legalActions,
  observation,
  publicParticipant,
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
  /** Deprecated v2 metadata. Initiative always determines the first actor. */
  first?: Owner;
  /** Absent in old saves: preserve their original CPU roster. New UI games use version 2. */
  encounterVersion?: 1 | 2;
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
    if (
      config.encounterVersion !== undefined &&
      ![1, 2].includes(config.encounterVersion)
    )
      throw Error("未対応の敵編成バージョンです。");
    const cpu = createCpuTeam(
      config.seed,
      config.id,
      config.encounterVersion ?? 1,
    );
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
      schemaVersion: 3 as const,
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
      snapshot.schemaVersion !== 3 ||
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
        b.headquarters[owner].hp > rules.headquarters.hp ||
        !Array.isArray(b.explored?.[owner]) ||
        b.explored[owner].some((c) => !tiles.has(c))
      )
        throw Error("戦闘セーブの地図が不正です。");
    if (!validRoundState(b)) throw Error("戦闘セーブの行動順が不正です。");
    if (
      b.pendingMovedHexes !== undefined &&
      (!b.pendingActorId ||
        !Number.isInteger(b.pendingMovedHexes) ||
        b.pendingMovedHexes < 0 ||
        b.pendingMovedHexes > 3)
    )
      throw Error("戦闘セーブの移動情報が不正です。");
    const result = new CharacterSession(snapshot.config);
    if (
      b.participants.length !== result.battle.participants.length ||
      b.participants.some(
        (p) =>
          !result.battle.participants.some(
            (initial) =>
              initial.character.characterId === p.character.characterId &&
              initial.owner === p.owner &&
              initial.initiativeKey === p.initiativeKey &&
              sameCharacter(initial.character, p.character),
          ),
      )
    )
      throw Error("戦闘開始時の兵士と保存内容が一致しません。");
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
                participants: [
                  ...next.participants,
                  { ...publicParticipant(dead), hp: 0 },
                ],
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
            `${event.type === "heal" ? "回復" : event.type === "counter" ? "反撃" : event.charge ? "突撃" : "攻撃"}：${actorName} → ${victim ? `${victim.owner === "player" ? "自軍" : "敵軍"} ${victim.character.displayName}` : "本城"} ${event.type === "heal" ? "+" : "−"}${event.type === "heal" ? event.amount : Math.min(event.amount, victim?.hp ?? event.amount)}`,
          ].slice(-60);
          frames.push({
            kind: event.type === "heal" ? "heal" : "hit",
            before: previous,
            after: impact,
            source,
            target,
            actorId: source ? event.actorId : undefined,
            targetId: event.targetId,
            amount:
              event.type === "heal"
                ? event.amount
                : Math.min(
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
            charge: !!event.charge,
            range: actor ? stats(actor.character).range : undefined,
          });
          if (dead)
            frames.push({
              kind: "destroy",
              before: {
                ...next,
                participants: [
                  ...next.participants,
                  { ...publicParticipant(dead), hp: 0 },
                ],
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
    const capture = this.capture(frames);
    do {
      this.battle = playCpuTurn(
        this.battle,
        (this.battle.seed + ++this.step) >>> 0,
        capture,
      );
      // Collapse invisible CPU actions. No actor IDs, list gaps or per-action
      // responses reveal how many hidden troops acted between visible turns.
    } while (
      !this.battle.outcome &&
      this.battle.activePlayer === "cpu" &&
      !observation(this.battle, "player").currentActorId
    );
    return { ...this.view(), frames };
  }
}
