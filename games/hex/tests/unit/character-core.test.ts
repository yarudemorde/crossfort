import { describe, expect, it } from "vitest";
import {
  createInitialRoster,
  recruitReplacement,
  retire,
  rename,
  scoutChance,
  stats,
  validateFormation,
} from "../../src/character/roster";
import {
  beginReward,
  commitVictory,
  decideScout,
  promote,
} from "../../src/character/reward";
import {
  damage,
  headquartersFor,
  movement,
  resolveCombat,
  validateDeployment,
} from "../../src/character/combat";
import { maps } from "../../src/game/data";
import { neighbors } from "../../src/game/rules/hex";
import type {
  BattleResult,
  Character,
  Participant,
} from "../../src/character/types";

describe("v2 キャラクターの基礎", () => {
  it("初期9名・各職業3名、固有ID、再現可能な個体差", () => {
    const a = createInitialRoster(123),
      b = createInitialRoster(123);
    expect(a).toEqual(b);
    expect(a.roster).toHaveLength(9);
    expect(new Set(a.roster.map((c) => c.characterId)).size).toBe(9);
    for (const cls of ["knight", "archer", "scout"])
      expect(a.roster.filter((c) => c.classId === cls)).toHaveLength(3);
    for (const c of a.roster) {
      expect(c.level).toBe(1);
      expect(c.hpDelta).toBeGreaterThanOrEqual(-3);
      expect(c.hpDelta).toBeLessThanOrEqual(3);
      expect(stats(c).attack).toBeGreaterThanOrEqual(1);
    }
    expect(
      a.roster
        .filter((c) => c.classId === "scout")
        .every((c) => c.attackDelta >= -1),
    ).toBe(true);
  });
  it("初回1回の名前変更・除隊と6名未満の最低値補充", () => {
    let s = createInitialRoster(123);
    const id = s.roster[0].characterId;
    s = rename(s, id, "<b>騎士</b>");
    expect(s.roster[0].displayName).toBe("騎士");
    expect(() => rename(s, id, "別名")).toThrow();
    for (const c of s.roster.slice(0, 4)) s = retire(s, c.characterId);
    s = recruitReplacement(s, "scout", "replacement-1");
    expect(stats(s.roster.at(-1)!)).toMatchObject({
      hp: 15,
      attack: 5,
      movement: 2,
    });
    expect(() => recruitReplacement(s, "knight", "replacement-2")).toThrow();
    expect(s.archive.some((c) => c.characterId === id)).toBe(true);
  });
  it("1〜6名かつ10コスト以内のみ編成", () => {
    const s = createInitialRoster(123);
    const ids = s.roster.map((c) => c.characterId);
    expect(validateFormation([], s.roster)).toBeTruthy();
    expect(validateFormation(ids.slice(0, 5), s.roster)).toBeUndefined();
    expect(validateFormation(ids.slice(0, 6), s.roster)).toBeTruthy();
    expect(
      validateFormation(
        [ids[0], ids[1], ids[2], ids[3], ids[6], ids[7]],
        s.roster,
      ),
    ).toBeUndefined();
    expect(validateFormation([ids[0], ids[0]], s.roster)).toBeTruthy();
  });
  it("個体差だけで勧誘率を決定し、レベル補正を含まない", () => {
    const c = createInitialRoster(1).roster[0];
    expect(
      scoutChance({ ...c, hpDelta: 2, attackDelta: 1, level: "MAX" }),
    ).toBe(20);
    expect(
      scoutChance({ ...c, hpDelta: -3, attackDelta: -1, level: "MAX" }),
    ).toBe(90);
    expect(scoutChance({ ...c, hpDelta: 0, attackDelta: 0, level: 1 })).toBe(
      50,
    );
  });
  it("全6マップで両本城の隣接6マスが存在し重ならない", () => {
    for (const map of maps) {
      const hq = headquartersFor(map),
        ids = Array.from({ length: 6 }, (_, i) => `p${i}`);
      const placements = Object.fromEntries(
        neighbors(hq.player).map((coord, i) => [ids[i], coord]),
      );
      expect(
        validateDeployment(map, hq.player, ids, placements),
      ).toBeUndefined();
      placements.p1 = placements.p0;
      expect(validateDeployment(map, hq.player, ids, placements)).toBeTruthy();
    }
  });
  it("HPと攻撃を分離し、生存時だけ射程内に反撃", () => {
    const knight: Character = {
      ...createInitialRoster(1).roster[0],
      hpDelta: 0,
      attackDelta: 0,
    };
    const p: Participant = {
      character: knight,
      owner: "player",
      coord: { q: 0, r: 0 },
      hp: 30,
      alive: true,
      killsThisBattle: 0,
    };
    const enemy: Participant = {
      ...p,
      character: { ...knight, characterId: "enemy" },
      owner: "cpu",
      coord: { q: 1, r: 0 },
    };
    const r = resolveCombat(p, enemy, "plain", "plain");
    expect([r.defender.hp, r.attacker.hp, r.hit, r.counter]).toEqual([
      18, 18, 12, 12,
    ]);
    const killed = resolveCombat(p, { ...enemy, hp: 4 }, "plain", "plain");
    expect(killed.defender.alive).toBe(false);
    expect(killed.counter).toBe(0);
    expect(killed.attacker.killsThisBattle).toBe(1);
    expect(stats(r.defender.character).attack).toBe(12);
    expect(movement(1, "swamp")).toBe(1);
    expect(damage(6, "forest", true)).toBe(7);
    expect(damage(0, "forest", true)).toBe(0);
  });
  it("勝利結果は一度だけ昇格・死亡除外・戦績更新を確定", () => {
    let s = createInitialRoster(77);
    const [a, b] = s.roster;
    const result: BattleResult = {
      id: "match-1",
      winner: "player",
      reason: "allUnitsKilled",
      participants: [
        {
          character: a,
          owner: "player",
          coord: { q: 0, r: 0 },
          hp: 2,
          alive: true,
          killsThisBattle: 2,
        },
        {
          character: b,
          owner: "player",
          coord: { q: 1, r: 0 },
          hp: 0,
          alive: false,
          killsThisBattle: 1,
        },
      ],
    };
    s = beginReward(s, result, 42);
    expect(s.pendingReward?.scoutStatus).toBe("skipped");
    s = promote(s, a.characterId);
    expect(() => promote(s, a.characterId)).toThrow();
    const committed = commitVictory(s),
      updated = committed.roster.find((c) => c.characterId === a.characterId)!;
    expect(updated.level).toBe(2);
    expect(updated.battlesParticipated).toBe(1);
    expect(updated.kills).toBe(2);
    expect(committed.roster.some((c) => c.characterId === b.characterId)).toBe(
      false,
    );
    expect(() => commitVictory(committed)).toThrow();
    expect(() => beginReward(committed, result, 42)).toThrow();
    expect(() => decideScout(s, "enemy")).toThrow();
  });
});
