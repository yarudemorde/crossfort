import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialRoster, stats } from "../../src/character/roster";
import {
  levelSteps,
  migratedGrowth,
  rollGrowth,
  totalGrowth,
} from "../../src/character/growth";
import { migrateSave } from "../../src/character/migration";
import {
  beginReward,
  commitVictory,
  promote,
} from "../../src/character/reward";
import { validateSave } from "../../src/character/storage";
import { GrowthResult } from "../../src/components/tactics/GrowthResult";
import type { RosterSave } from "../../src/character/types";

export function oldSave() {
  const s = createInitialRoster(17);
  const legacy = (c: (typeof s.roster)[0]) => {
    const { growthHistory: ignored, ...rest } = c;
    void ignored;
    return rest;
  };
  return {
    schemaVersion: 2,
    roster: s.roster.map(legacy),
    archive: [],
    completedRewardIds: [],
  };
}
describe("独立ランダム成長", () => {
  it("指定範囲の4抽選を再現し、全組合せと等確率候補を得られる", () => {
    const counts = {
      hp: new Map<number, number>(),
      attack: new Map<number, number>(),
      initiative: new Map<number, number>(),
      counterTenths: new Map<number, number>(),
    };
    const pairs = new Set<string>();
    let rng = 983172;
    for (let i = 0; i < 10000; i++) {
      const r = rollGrowth(rng);
      expect(rollGrowth(rng)).toEqual(r);
      rng = r.rngState;
      const g = r.gain;
      expect([3, 4, 5]).toContain(g.hp);
      expect([0, 1, 2]).toContain(g.attack);
      expect([0, 1]).toContain(g.initiative);
      expect([0, 1]).toContain(g.counterTenths);
      for (const key of Object.keys(counts) as (keyof typeof counts)[])
        counts[key].set(g[key], (counts[key].get(g[key]) ?? 0) + 1);
      pairs.add(`${g.hp}/${g.attack}/${g.initiative}/${g.counterTenths}`);
    }
    expect(pairs.size).toBe(36);
    for (const map of Object.values(counts))
      for (const value of map.values())
        expect(value / 10000).toBeCloseTo(1 / map.size, 1);
  });
  it("3回とも同じ方式で成長しMAX以降は強化できない", () => {
    let save = createInitialRoster(9);
    const id = save.roster[0].characterId;
    for (let n = 0; n < 3; n++) {
      const c = save.roster[0];
      save = beginReward(
        save,
        {
          id: `grow-${n}`,
          winner: "player",
          reason: "allUnitsKilled",
          participants: [
            {
              character: c,
              owner: "player",
              coord: { q: 0, r: 0 },
              hp: 1,
              alive: true,
              killsThisBattle: 0,
            },
          ],
        },
        n + 111,
      );
      const before = structuredClone(save);
      save = promote(save, id);
      expect(() => promote(save, id)).toThrow();
      const loaded = JSON.parse(JSON.stringify(save)) as RosterSave;
      validateSave(loaded);
      expect(loaded.pendingReward?.promotionResult).toEqual(
        save.pendingReward?.promotionResult,
      );
      expect(promote(before, id)).toEqual(save);
      save = commitVictory(loaded);
      expect(save.roster[0].growthHistory).toHaveLength(n + 1);
      expect(stats(save.roster[0]).hp).toBeGreaterThanOrEqual(stats(c).hp + 3);
    }
    const c = save.roster[0];
    expect(c.level).toBe("MAX");
    expect(totalGrowth(c.growthHistory).hp).toBeGreaterThanOrEqual(9);
    expect(totalGrowth(c.growthHistory).hp).toBeLessThanOrEqual(15);
    save = beginReward(
      save,
      {
        id: "max",
        winner: "player",
        reason: "allUnitsKilled",
        participants: [
          {
            character: c,
            owner: "player",
            coord: { q: 0, r: 0 },
            hp: 1,
            alive: true,
            killsThisBattle: 0,
          },
        ],
      },
      1,
    );
    expect(save.pendingReward?.promotionStatus).toBe("skipped");
    expect(() => promote(save, id)).toThrow();
  });
  it("+0を省略せず、保存済みの4項目の前後を表示する", () => {
    const c = {
      ...createInitialRoster(1).roster[0],
      hpDelta: 0,
      attackDelta: 0,
    };
    const result = {
      characterId: c.characterId,
      fromLevel: 1 as const,
      toLevel: 2 as const,
      gain: { hp: 4, attack: 1, initiative: 0, counterTenths: 1 },
    };
    const html = renderToStaticMarkup(
      <GrowthResult character={c} result={result} />,
    );
    expect(html).toContain("34");
    expect(html).toContain("13");
    expect(html).toContain("×1.1");
    expect(html).toContain("+0");
    expect(html).toContain("保存済み");
  });
});
describe("v2からの一度だけの移行", () => {
  it("ID・全メタデータ・Lv・除隊アーカイブを保ち、累計成長を決定的に生成する", () => {
    const old = oldSave();
    old.roster[0].level = "MAX";
    old.roster[1].level = 3;
    old.roster[2].level = 2;
    const archived = old.roster.pop()!;
    const original = {
      ...old,
      archive: [archived],
      completedRewardIds: ["old-win"],
    };
    const next = migrateSave(original);
    validateSave(next);
    expect(next.schemaVersion).toBe(3);
    for (let i = 0; i < next.roster.length; i++) {
      const { growthHistory, ...identity } = next.roster[i];
      expect(identity).toEqual(original.roster[i]);
      expect(growthHistory).toEqual(
        migratedGrowth(identity.characterId, identity.level),
      );
      expect(growthHistory).toHaveLength(levelSteps(identity.level));
    }
    expect(next.archive[0].characterId).toBe(archived.characterId);
    expect(next.completedRewardIds).toEqual(["old-win"]);
    expect(migrateSave(next)).toEqual(next);
    expect(migrateSave(original)).toEqual(next);
  });
  it("旧強化選択済み報酬を対象固定の成長結果へ移行し、再移行・再読込で変えない", () => {
    const old = oldSave(),
      c = old.roster[0];
    const value = {
      ...old,
      pendingReward: {
        id: "old-reward",
        rngState: 911,
        scoutStatus: "skipped",
        promotionStatus: "chosen",
        promotedId: c.characterId,
        result: {
          id: "old-reward",
          winner: "player",
          reason: "allUnitsKilled",
          participants: [
            {
              character: c,
              owner: "player",
              coord: { q: 0, r: 0 },
              hp: 4,
              alive: true,
              killsThisBattle: 1,
            },
          ],
        },
      },
    };
    const converted = migrateSave(value);
    validateSave(converted);
    expect(converted.pendingReward?.promotionResult?.gain).toEqual(
      rollGrowth(911).gain,
    );
    const committed = commitVictory(migrateSave(converted));
    expect(committed.roster[0].level).toBe(2);
    expect(committed.roster[0].growthHistory).toHaveLength(1);
    expect(() => commitVictory(committed)).toThrow();
  });
  it("破損した新形式の履歴・レベル不一致・旧形式の不正データを再抽選で修復しない", () => {
    const valid = createInitialRoster(1);
    expect(() =>
      validateSave({
        ...valid,
        roster: [
          {
            ...valid.roster[0],
            growthHistory: [
              { hp: 100, attack: 1, initiative: 0, counterTenths: 0 },
            ],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      validateSave({ ...valid, roster: [{ ...valid.roster[0], level: 2 }] }),
    ).toThrow();
    expect(() =>
      migrateSave({
        ...oldSave(),
        roster: [{ ...oldSave().roster[0], classId: "unknown" }],
      }),
    ).toThrow();
  });
});
