import {
  beginReward,
  commitVictory,
  promote,
} from "../../src/character/reward";
import { describe, expect, it } from "vitest";
import rules from "../../data/ruleset.characters.json";
import {
  canAttack,
  chargeBonus,
  healingPower,
  resolveHealing,
} from "../../src/character/abilities";
import {
  attackDamage,
  counterDamage,
  damage,
  movement,
  resolveCombat,
} from "../../src/character/combat";
import { rollGrowth } from "../../src/character/growth";
import {
  createInitialRoster,
  stats,
  validateFormation,
  classIds,
} from "../../src/character/roster";
import { validCharacter } from "../../src/character/validation";
import type {
  Character,
  ClassId,
  Participant,
} from "../../src/character/types";

export const character = (
  classId: ClassId,
  id: string = classId,
): Character => ({
  ...createInitialRoster(123).roster[0],
  characterId: id,
  classId,
  hpDelta: 0,
  attackDelta: 0,
});
export const piece = (
  classId: ClassId,
  q = 0,
  owner: "player" | "cpu" = "player",
  id: string = classId,
): Participant => ({
  character: character(classId, id),
  owner,
  coord: { q, r: 0 },
  hp: stats(character(classId)).hp,
  alive: true,
  killsThisBattle: 0,
});

describe("6職業の基礎値と生成", () => {
  it.each([
    ["knight", 2, 2, 1, 1, 12, 30, 10, 10],
    ["archer", 2, 2, 2, 1, 9, 22, 12, 5],
    ["scout", 1, 3, 1, 2, 6, 18, 16, 20],
    ["spearman", 2, 2, 2, 1, 9, 25, 9, 13],
    ["medic", 2, 2, 1, 1, 8, 20, 8, 0],
    ["cavalry", 3, 1, 1, 3, 15, 30, 5, 2],
  ] as const)(
    "%s の正式な基礎値",
    (cls, cost, vision, range, move, attack, hp, initiative, counter) => {
      expect(stats(character(cls))).toMatchObject({
        cost,
        vision,
        range,
        movement: move,
        attack,
        hp,
        initiative,
        counterTenths: counter,
      });
      expect(validCharacter(character(cls))).toBe(true);
    },
  );
  it("既存初期9名は変わらず、6職の編成コスト制限を維持", () => {
    expect(createInitialRoster(123).roster.map((c) => c.classId)).toEqual([
      "knight",
      "knight",
      "knight",
      "archer",
      "archer",
      "archer",
      "scout",
      "scout",
      "scout",
    ]);
    const roster = classIds.map((cls) => character(cls));
    expect(
      validateFormation(
        roster.map((c) => c.characterId),
        roster,
      ),
    ).toBeTruthy();
    expect(
      validateFormation(["cavalry", "spearman", "medic", "scout"], roster),
    ).toBeUndefined();
    for (const team of rules.cpuFormations)
      expect(
        team.reduce((n, c) => n + rules.classes[c as ClassId].cost, 0),
      ).toBeLessThanOrEqual(10);
  });
});

describe("槍兵", () => {
  it("距離2へ通常攻撃し、距離3へは不可", () => {
    expect(
      resolveCombat(
        piece("spearman"),
        piece("knight", 2, "cpu"),
        "plain",
        "plain",
      ).hit,
    ).toBe(9);
    expect(() =>
      resolveCombat(
        piece("spearman"),
        piece("knight", 3, "cpu"),
        "plain",
        "plain",
      ),
    ).toThrow();
  });
  it("生存・射程内だけ反撃×1.3、砂漠→倍率→切上げ→地形の順", () => {
    expect(
      resolveCombat(
        piece("archer"),
        piece("spearman", 2, "cpu"),
        "plain",
        "plain",
      ).counter,
    ).toBe(12);
    expect(counterDamage(character("spearman"), "desert")).toBe(11);
    expect(counterDamage(character("spearman"), "forest")).toBe(13);
    expect(
      resolveCombat(
        piece("archer"),
        { ...piece("spearman", 2, "cpu"), hp: 1 },
        "plain",
        "plain",
      ).counter,
    ).toBe(0);
    expect(
      resolveCombat(
        piece("archer"),
        piece("knight", 2, "cpu"),
        "plain",
        "plain",
      ).counter,
    ).toBe(0);
  });
});

describe("衛生兵の独立した回復", () => {
  it.each([
    [8, 10],
    [9, 11],
    [10, 12],
  ])("攻撃%dを基準に%d回復", (attack, amount) => {
    const healer = {
      ...piece("medic"),
      character: { ...character("medic"), attackDelta: attack - 8 },
    };
    const target = { ...piece("knight", 1), hp: 1 };
    expect(healingPower(healer.character)).toBe(amount);
    expect(resolveHealing(healer, target).target.hp).toBe(1 + amount);
    expect(target.hp).toBe(1);
  });
  it("成長攻撃を回復に使い、最大HPで打ち止め。他の衛生兵も回復可能", () => {
    const c = {
      ...character("medic"),
      level: 2 as const,
      growthHistory: [{ hp: 3, attack: 2, initiative: 1, counterTenths: 0 }],
    };
    expect(healingPower(c)).toBe(12);
    const healed = resolveHealing(
      { ...piece("medic"), character: c },
      { ...piece("medic", 1, "player", "other"), hp: 19 },
    );
    expect(healed.amount).toBe(1);
    expect(healed.target.hp).toBe(20);
  });
  it("敵・自身・距離2・死亡・満タン・非衛生兵からの回復を拒否", () => {
    const healer = piece("medic"),
      target = { ...piece("knight", 1), hp: 1 };
    for (const invalid of [
      { ...target, owner: "cpu" as const },
      healer,
      { ...target, coord: { q: 2, r: 0 } },
      { ...target, hp: 0, alive: false },
      piece("knight", 1),
    ])
      expect(() => resolveHealing(healer, invalid)).toThrow();
    expect(() => resolveHealing(piece("knight"), target)).toThrow();
  });
  it("地形・成長にかかわらず攻撃・反撃不可、4抽選の乱数進行は維持", () => {
    const c = {
      ...character("medic"),
      level: "MAX" as const,
      growthHistory: Array.from({ length: 3 }, () => ({
        hp: 5,
        attack: 2,
        initiative: 1,
        counterTenths: 1,
      })),
    };
    expect(canAttack(c)).toBe(false);
    expect(stats(c).counterTenths).toBe(0);
    for (const terrain of ["plain", "forest", "mountain", "desert"] as const) {
      expect(counterDamage(c, terrain)).toBe(0);
      expect(attackDamage(c, terrain)).toBe(0);
      expect(
        resolveCombat(
          piece("knight"),
          { ...piece("medic", 1, "cpu"), character: c, hp: 30 },
          "plain",
          terrain,
        ).counter,
      ).toBe(0);
    }
    expect(() =>
      resolveCombat(
        piece("medic"),
        piece("knight", 1, "cpu"),
        "plain",
        "plain",
      ),
    ).toThrow();
    expect(damage(8, "forest", true, 0)).toBe(0);
    for (let seed = 0; seed < 100; seed++) {
      const a = rollGrowth(seed, "medic"),
        b = rollGrowth(seed);
      expect(a).toEqual({ ...b, gain: { ...b.gain, counterTenths: 0 } });
    }
  });
});

describe("騎兵の一行動だけの突撃", () => {
  it.each([0, 1, 2, 3])("%dマス移動後の攻撃と反撃", (steps) => {
    const c = character("cavalry");
    expect(chargeBonus(c, steps)).toBe(steps === 3 ? 3 : 0);
    expect(attackDamage(c, "plain", steps)).toBe(steps === 3 ? 18 : 15);
    expect(
      resolveCombat(
        piece("cavalry"),
        piece("knight", 1, "cpu"),
        "plain",
        "plain",
        steps,
      ).hit,
    ).toBe(steps === 3 ? 18 : 15);
    expect(counterDamage(c, "plain")).toBe(3);
    expect(attackDamage(c, "plain", steps, false)).toBe(15);
    expect(stats(c).attack).toBe(15);
  });
  it("成長後も+3固定。地形は移動と攻撃へ既存順序で適用", () => {
    const c = {
      ...character("cavalry"),
      level: 2 as const,
      growthHistory: [{ hp: 3, attack: 2, initiative: 0, counterTenths: 1 }],
    };
    expect(attackDamage(c, "desert", 3)).toBe(19);
    expect(counterDamage(c, "plain")).toBe(6);
    expect(
      ["plain", "mountain", "swamp", "river"].map((t) =>
        movement(3, t as "plain"),
      ),
    ).toEqual([3, 2, 1, 1]);
  });
});

it("衛生兵も3回成長してMAXへ進み、各回の反撃成長は0として保存", () => {
  let s = createInitialRoster(1);
  s.roster[0] = { ...s.roster[0], classId: "medic" };
  const id = s.roster[0].characterId;
  for (let stage = 0; stage < 3; stage++) {
    const c = s.roster[0];
    s = beginReward(
      s,
      {
        id: `medic-growth-${stage}`,
        winner: "player",
        reason: "allUnitsKilled",
        participants: [{ ...piece("medic"), character: c, hp: 1 }],
      },
      stage + 1,
    );
    s = promote(s, id);
    expect(s.pendingReward!.promotionResult!.gain.counterTenths).toBe(0);
    s = commitVictory(s);
    expect(stats(s.roster[0]).counterTenths).toBe(0);
  }
  expect(s.roster[0].level).toBe("MAX");
  expect(s.roster[0].growthHistory).toHaveLength(3);
});
