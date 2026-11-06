import { migratedGrowth } from "../../src/character/growth";
import { validateSave } from "../../src/character/storage";
import { expect, it } from "vitest";
import {
  createInitialRoster,
  stats,
  scoutChance,
} from "../../src/character/roster";
import {
  beginReward,
  decideScout,
  promote,
  commitVictory,
} from "../../src/character/reward";
import type { Participant, Character } from "../../src/character/types";
const soldier = (
  c: Character,
  owner: "player" | "cpu",
  alive = true,
): Participant => ({
  character: c,
  owner,
  alive,
  hp: alive ? 1 : 0,
  killsThisBattle: 2,
  coord: { q: owner === "player" ? 0 : 1, r: 0 },
});
it("保存した成長履歴を累積し、職業固定値を保つ", () => {
  const c = { ...createInitialRoster(1).roster[0], hpDelta: 0, attackDelta: 0 };
  expect(
    ([1, 2, 3, "MAX"] as const).map((level) => {
      const s = stats({
        ...c,
        level,
        growthHistory: Array.from(
          { length: level === "MAX" ? 3 : level - 1 },
          () => ({ hp: 4, attack: 1, initiative: 0, counterTenths: 1 }),
        ),
      });
      return [s.hp, s.attack, s.range, s.movement, s.cost, s.vision];
    }),
  ).toEqual([
    [30, 12, 1, 1, 2, 2],
    [34, 13, 1, 1, 2, 2],
    [38, 14, 1, 1, 2, 2],
    [42, 15, 1, 1, 2, 2],
  ]);
});
it("勧誘は死亡者を除いた所持枠で判定し、所属・Lv・個体差を保持する", () => {
  let s = createInitialRoster(1);
  s.roster = Array.from({ length: 15 }, (_, i) => ({
    ...s.roster[i % 9],
    characterId: `own-${i}`,
  }));
  const enemy = {
    ...createInitialRoster(2).roster[0],
    characterId: "enemy",
    level: "MAX" as const,
    growthHistory: migratedGrowth("enemy", "MAX"),
    hpDelta: -3,
    attackDelta: -1,
  };
  const result = {
    id: "capacity-win",
    winner: "player" as const,
    reason: "headquartersDestroyed" as const,
    participants: [
      soldier(s.roster[0], "player"),
      soldier(s.roster[1], "player", false),
      soldier(enemy, "cpu"),
    ],
  };
  s = beginReward(s, result, 0);
  s = decideScout(s, "enemy");
  expect(s.pendingReward?.scoutStatus).toBe("succeeded");
  expect(s.pendingReward?.scouted).toMatchObject({
    level: "MAX",
    hpDelta: -3,
    attackDelta: -1,
    affiliationId: enemy.affiliationId,
  });
  expect(() => decideScout(s, "enemy")).toThrow();
  s = promote(s, s.roster[0].characterId);
  const saved = commitVictory(s);
  validateSave(saved);
  expect(
    saved.roster.find((c) => c.characterId === "enemy")?.growthHistory,
  ).toEqual(enemy.growthHistory);
  expect(saved.roster).toHaveLength(15);
  expect(saved.archive).toHaveLength(1);
  expect(saved.roster.find((c) => c.characterId === "enemy")?.level).toBe(
    "MAX",
  );
});
it("満員・死亡敵・全滅勝利では勧誘できず、控え・MAX・死亡者は強化できない", () => {
  let s = createInitialRoster(5);
  s.roster = Array.from({ length: 15 }, (_, i) => ({
    ...s.roster[i % 9],
    characterId: `p-${i}`,
  }));
  const e = { ...s.roster[0], characterId: "enemy" };
  s = beginReward(
    s,
    {
      id: "full",
      winner: "player",
      reason: "headquartersDestroyed",
      participants: [soldier(s.roster[0], "player"), soldier(e, "cpu")],
    },
    0,
  );
  expect(() => decideScout(s, "enemy")).toThrow();
  s = decideScout(s);
  expect(() => promote(s, s.roster[1].characterId)).toThrow();
  const base = createInitialRoster(7);
  const max = {
    ...base.roster[0],
    level: "MAX" as const,
    growthHistory: migratedGrowth(base.roster[0].characterId, "MAX"),
  };
  base.roster[0] = max;
  const noScout = beginReward(
    base,
    {
      id: "annihilation",
      winner: "player",
      reason: "allUnitsKilled",
      participants: [soldier(max, "player"), soldier(e, "cpu", false)],
    },
    1,
  );
  expect(noScout.pendingReward).toMatchObject({
    scoutStatus: "skipped",
    promotionStatus: "skipped",
  });
  expect(() => decideScout(noScout, "enemy")).toThrow();
  expect(() => promote(noScout, max.characterId)).toThrow();
  expect(scoutChance({ ...e, hpDelta: 3, attackDelta: 1, level: "MAX" })).toBe(
    10,
  );
});
