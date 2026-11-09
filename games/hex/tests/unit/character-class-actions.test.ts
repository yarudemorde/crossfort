import { describe, expect, it } from "vitest";
import { specialtyBattle, advanceSpecialty } from "../new-class-helpers";
import {
  applyBattleAction,
  beginMovement,
  legalActions,
  observation,
} from "../../src/character/battle";
import { stats } from "../../src/character/roster";
import { hexDistance } from "../../src/game/rules/hex";
import { chooseAction } from "../../src/character/cpu";

describe("衛生兵の行動・CPU・視野", () => {
  it("攻撃/HQ攻撃を生成せず、毎ラウンド回復で行動終了する", () => {
    let s = specialtyBattle("medic");
    s.participants[1].coord = { q: 1, r: 0 };
    s.participants[1].hp = 1;
    for (let i = 0; i < 3; i++) {
      const beforeRound = s.roundNumber,
        o = observation(s, "player"),
        actions = legalActions(o);
      const heal = actions.find(
        (a) =>
          a.type === "act" &&
          a.effect === "heal" &&
          !a.path.length &&
          a.targetId === "ally",
      )!;
      expect(heal).toBeDefined();
      expect(
        actions
          .filter((a) => a.type === "act" && a.targetId)
          .every((a) => a.type === "act" && a.effect === "heal"),
      ).toBe(true);
      const selected = chooseAction(o, 7);
      expect(selected.type === "act" && selected.effect).toBe("heal");
      const previousHp = s.participants[1].hp;
      s = applyBattleAction(s, heal, "player");
      expect(s.participants[1].hp).toBe(
        Math.min(stats(s.participants[1].character).hp, previousHp + 10),
      );
      expect(s.currentActorId).not.toBe("actor");
      s = advanceSpecialty(s, "actor");
      expect(s.roundNumber).toBeGreaterThan(beforeRound);
    }
  });
  it("移動で近づいたあと回復を選択でき、移動だけでは行動順を進めない", () => {
    let s = specialtyBattle("medic");
    s.participants[1].coord = { q: 2, r: -1 };
    s.participants[1].hp = 1;
    const o = observation(s, "player");
    expect(
      legalActions(o).some(
        (a) => a.type === "act" && !a.path.length && a.effect === "heal",
      ),
    ).toBe(false);
    s = beginMovement(s, "player", "actor", [{ q: 1, r: -1 }]);
    expect(s.currentActorId).toBe("actor");
    expect(s.pendingActorId).toBe("actor");
    const action = legalActions(observation(s, "player")).find(
      (a) => a.type === "act" && a.effect === "heal",
    )!;
    s = applyBattleAction(s, action, "player");
    expect(s.participants[1].hp).toBe(11);
    expect(s.pendingActorId).toBeUndefined();
  });
  it("敵/自身/距離2/死亡者への偽造回復と通常攻撃を拒否", () => {
    const s = specialtyBattle("medic");
    s.participants[1].hp = 1;
    s.participants[1].coord = { q: 2, r: 0 };
    for (const targetId of ["enemy", "actor", "ally", "hq_cpu"]) {
      expect(() =>
        applyBattleAction(
          s,
          { type: "act", actorId: "actor", path: [], targetId, effect: "heal" },
          "player",
        ),
      ).toThrow();
    }
    s.participants[1].coord = { q: 1, r: 0 };
    expect(() =>
      applyBattleAction(
        s,
        { type: "act", actorId: "actor", path: [], targetId: "ally" },
        "player",
      ),
    ).toThrow();
  });
});

describe("騎兵の移動・突撃の行動コンテキスト", () => {
  it.each([0, 1, 2, 3])(
    "%dマスを通過した攻撃は対応する威力だけになる",
    (steps) => {
      let s = specialtyBattle("cavalry");
      s.participants[0].coord = { q: -steps, r: 0 };
      s.participants[2].coord = { q: 1, r: 0 };
      s.participants[1].coord = { q: 0, r: 1 };
      const path = Array.from({ length: steps }, (_, i) => ({
        q: -steps + i + 1,
        r: 0,
      }));
      s = beginMovement(s, "player", "actor", path);
      expect(s.currentActorId).toBe("actor");
      expect(observation(s, "player").pendingMovedHexes).toBe(steps);
      expect(observation(s, "cpu").pendingMovedHexes).toBeUndefined();
      const oldAttack = stats(s.participants[0].character).attack;
      s = applyBattleAction(
        s,
        { type: "act", actorId: "actor", path: [], targetId: "enemy" },
        "player",
      );
      expect(s.participants[2].hp).toBe(30 - (steps === 3 ? 18 : 15));
      expect(stats(s.participants[0].character).attack).toBe(oldAttack);
      expect(s.pendingMovedHexes).toBeUndefined();
      s = advanceSpecialty(s, "actor");
      expect(observation(s, "player").pendingMovedHexes).toBeUndefined();
    },
  );
  it("3マスの一括行動でも突撃。3マス移動後に待機すると失効", () => {
    const original = specialtyBattle("cavalry");
    original.participants[0].coord = { q: -2, r: 0 };
    const path = [
      { q: -1, r: 0 },
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ];
    const charged = applyBattleAction(
      original,
      { type: "act", actorId: "actor", path, targetId: "enemy" },
      "player",
    );
    expect(charged.participants[2].hp).toBe(12);
    let waiting = beginMovement(original, "player", "actor", path);
    waiting = applyBattleAction(waiting, { type: "pass" }, "player");
    waiting = advanceSpecialty(waiting, "actor");
    const result = applyBattleAction(
      waiting,
      { type: "act", actorId: "actor", path: [], targetId: "enemy" },
      "player",
    );
    expect(result.participants[2].hp).toBe(15);
  });
  it.each([
    ["mountain", 2],
    ["swamp", 1],
    ["river", 1],
  ] as const)("開始地形%sは移動%dまで", (terrain, max) => {
    const s = specialtyBattle("cavalry");
    s.map.hexes.find(
      (h) => hexDistance(h, s.participants[0].coord) === 0,
    )!.terrain = terrain;
    const paths = legalActions(observation(s, "player")).flatMap((a) =>
      a.type === "act" ? [a.path.length] : [],
    );
    expect(Math.max(...paths)).toBe(max);
  });
  it("視野外の敵で経路が中断した場合、未通過のマス数で突撃しない", () => {
    let s = specialtyBattle("cavalry");
    s.participants[0].coord = { q: -2, r: 0 };
    s.participants[1].coord = { q: -4, r: 1 };
    s.participants[2].coord = { q: 0, r: 0 };
    const before = observation(s, "player");
    expect(
      before.participants.some((p) => p.character.characterId === "enemy"),
    ).toBe(false);
    s = beginMovement(s, "player", "actor", [
      { q: -1, r: 0 },
      { q: 0, r: 0 },
      { q: 1, r: 0 },
    ]);
    expect(s.pendingMovedHexes).toBe(1);
    expect(s.participants[0].coord).toEqual({ q: -1, r: 0 });
    s = applyBattleAction(
      s,
      { type: "act", actorId: "actor", path: [], targetId: "enemy" },
      "player",
    );
    expect(s.participants[2].hp).toBe(15);
  });
});

it("騎兵が3マス移動しても本城へ突撃ボーナスは付かない", () => {
  let s = specialtyBattle("cavalry");
  s.participants[0].coord = { q: 0, r: 0 };
  s.participants[1].coord = { q: -1, r: 1 };
  s.participants[2].coord = { q: 3, r: -2 };
  s.participants[3].coord = { q: 3, r: 1 };
  s = beginMovement(s, "player", "actor", [
    { q: 1, r: 0 },
    { q: 2, r: 0 },
    { q: 3, r: 0 },
  ]);
  s = applyBattleAction(
    s,
    { type: "act", actorId: "actor", path: [], targetId: "hq_cpu" },
    "player",
  );
  expect(s.headquarters.cpu.hp).toBe(45);
});
