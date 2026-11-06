import { describe, expect, it } from "vitest";
import { maps } from "../../src/game/data";
import { neighbors } from "../../src/game/rules/hex";
import { createInitialRoster } from "../../src/character/roster";
import { headquartersFor } from "../../src/character/combat";
import {
  applyBattleAction,
  beginMovement,
  legalActions,
  observation,
  startBattle,
} from "../../src/character/battle";
import { advanceTo } from "../character-helpers";
import { chooseAction } from "../../src/character/cpu";

function create(mapId: string) {
  const map = maps.find((m) => m.id === mapId)!;
  const ids = [0, 1, 3, 4, 6, 7];
  const own = createInitialRoster(123).roster.filter((_, i) => ids.includes(i));
  const enemy = createInitialRoster(456)
    .roster.filter((_, i) => ids.includes(i))
    .map((c) => ({ ...c, characterId: `cpu-${c.characterId}` }));
  const hq = headquartersFor(map);
  const placement = (team: typeof own, home: typeof hq.player) =>
    Object.fromEntries(neighbors(home).map((c, i) => [team[i].characterId, c]));
  return startBattle(
    `match-${mapId}`,
    123,
    map,
    { player: own, cpu: enemy },
    { player: placement(own, hq.player), cpu: placement(enemy, hq.cpu) },
    "player",
  );
}
describe("キャラクター戦闘のラウンド手番", () => {
  it.each(maps.map((m) => m.id))("%s の初期配置は各6名、本城HP60", (id) => {
    const s = create(id);
    expect(s.participants).toHaveLength(12);
    expect(s.headquarters.player.hp).toBe(60);
    expect(observation(s, "player").hexes).toHaveLength(s.map.hexes.length);
  });
  it("視野外の敵と地形を観測やCPU入力に含めない", () => {
    const s = create("highlands-large"),
      o = observation(s, "player");
    expect(o.participants.some((p) => p.owner === "cpu")).toBe(false);
    expect(o.headquarters.cpu.hp).toBeUndefined();
    expect(o.hexes.some((h) => !h.explored && h.terrain === undefined)).toBe(
      true,
    );
    const changed = structuredClone(s);
    changed.participants.find((p) => p.owner === "cpu")!.character.displayName =
      "秘密の名前";
    expect(observation(changed, "player")).toEqual(o);
  });
  it("1ラウンド中は同じ部隊を再行動できず、次ラウンドで再び行動できる", () => {
    let s = create("crossing");
    const actor = s.currentActorId,
      owner = s.activePlayer;
    s = applyBattleAction(s, { type: "pass" }, owner);
    expect(s.currentActorId).not.toBe(actor);
    expect(
      legalActions(observation(s, owner))
        .filter((a) => a.type === "act")
        .every((a) => a.type === "act" && a.actorId !== actor),
    ).toBe(true);
    s = advanceTo(s, actor);
    expect(s.roundNumber).toBe(2);
    expect(
      legalActions(observation(s, owner)).some(
        (a) => a.type === "act" && a.actorId === actor,
      ),
    ).toBe(true);
  });
  it("CPUは観測から合法手を選び、同じ入力で再現する", () => {
    let s = create("crossing");
    while (s.activePlayer !== "cpu")
      s = applyBattleAction(s, { type: "pass" }, s.activePlayer);
    const o = observation(s, "cpu");
    const action = chooseAction(o, 44);
    expect(legalActions(o)).toContainEqual(action);
    expect(chooseAction(o, 44)).toEqual(action);
    expect(() => applyBattleAction(s, action, "cpu")).not.toThrow();
  });
  it("移動して初めて見えた敵を同じ手番に攻撃でき、別の部隊は選べない", () => {
    let s = create("highlands-large");
    const archer = s.participants.find(
      (p) => p.owner === "player" && p.character.classId === "archer",
    )!;
    s = advanceTo(s, archer.character.characterId);
    s.participants.find(
      (p) => p.character.characterId === archer.character.characterId,
    )!.coord = { q: 0, r: 0 };
    const enemy = s.participants.find((p) => p.owner === "cpu")!;
    enemy.coord = { q: 3, r: 0 };
    expect(
      observation(s, "player").participants.some(
        (p) => p.character.characterId === enemy.character.characterId,
      ),
    ).toBe(false);
    const moved = beginMovement(s, "player", archer.character.characterId, [
      { q: 1, r: 0 },
    ]);
    const actions = legalActions(observation(moved, "player"));
    expect(moved.activePlayer).toBe("player");
    expect(
      actions
        .filter((a) => a.type === "act")
        .every(
          (a) =>
            a.type === "act" &&
            a.actorId === archer.character.characterId &&
            !a.path.length,
        ),
    ).toBe(true);
    const attack = actions.find(
      (a) => a.type === "act" && a.targetId === enemy.character.characterId,
    );
    expect(attack).toBeDefined();
    expect(applyBattleAction(moved, attack!, "player").currentActorId).not.toBe(
      archer.character.characterId,
    );
  });
});
