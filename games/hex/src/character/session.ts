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
  constructor(config: NewBattle) {
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
  view() {
    const view = observation(this.battle, "player");
    return {
      observation: view,
      legal: legalActions(view),
      ...(this.battle.outcome?.winner === "player"
        ? { result: battleResult(this.battle) }
        : {}),
    };
  }
  move(actorId: string, path: Coord[]) {
    const frames: BattleObservation[] = [];
    const capture = this.capture(frames);
    this.battle = beginMovement(this.battle, "player", actorId, path, capture);
    return { ...this.view(), frames };
  }
  act(action: BattleAction) {
    const frames: BattleObservation[] = [];
    this.battle = applyBattleAction(
      this.battle,
      action,
      "player",
      this.capture(frames),
    );
    return { ...this.view(), frames };
  }
  private capture(frames: BattleObservation[]) {
    let previous = JSON.stringify(observation(this.battle, "player"));
    return (state: Battle) => {
      const next = observation(state, "player"),
        serial = JSON.stringify(next);
      if (serial !== previous) frames.push(next);
      previous = serial;
    };
  }
  cpu() {
    if (this.battle.activePlayer !== "cpu" || this.battle.outcome)
      throw Error("CPUの手番ではありません。");
    const frames: BattleObservation[] = [];
    this.battle = playCpuTurn(
      this.battle,
      (this.battle.seed + ++this.step) >>> 0,
      this.capture(frames),
    );
    return { ...this.view(), frames };
  }
}
