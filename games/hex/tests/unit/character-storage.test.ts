import { expect, it } from "vitest";
import { createInitialRoster } from "../../src/character/roster";
import {
  beginReward,
  decideScout,
  renameScout,
} from "../../src/character/reward";
import { validateSave } from "../../src/character/storage";

it("旧形式、破損データ、IDの重複は新規データとして扱わない", () => {
  const save = createInitialRoster(123);
  expect(() => validateSave(save)).not.toThrow();
  expect(() => validateSave({ schemaVersion: 1, roster: [] })).toThrow();
  expect(() =>
    validateSave({ ...save, roster: [save.roster[0], save.roster[0]] }),
  ).toThrow();
  expect(() =>
    validateSave({
      ...save,
      roster: [{ ...save.roster[0], classId: "scout", attackDelta: -1 }],
    }),
  ).toThrow();
});
it("勧誘成功後の名前編集も報酬中に保存でき、変更は1回だけ", () => {
  const save = createInitialRoster(22),
    own = save.roster[0];
  const enemy = { ...own, characterId: "enemy", hpDelta: -3, attackDelta: -1 };
  let pending = beginReward(
    save,
    {
      id: "win",
      winner: "player",
      reason: "headquartersDestroyed",
      participants: [
        {
          character: own,
          owner: "player",
          coord: { q: 0, r: 0 },
          hp: 1,
          alive: true,
          killsThisBattle: 0,
        },
        {
          character: enemy,
          owner: "cpu",
          coord: { q: 1, r: 0 },
          hp: 1,
          alive: true,
          killsThisBattle: 0,
        },
      ],
    },
    0,
  );
  pending = decideScout(pending, "enemy");
  expect(pending.pendingReward?.scoutStatus).toBe("succeeded");
  pending = renameScout(pending, "<b>新しい名</b>");
  expect(pending.pendingReward?.scouted?.displayName).toBe("新しい名");
  expect(() => validateSave(JSON.parse(JSON.stringify(pending)))).not.toThrow();
  expect(() => renameScout(pending, "再変更")).toThrow();
});
it("報酬途中の状態を再読込でき、破損した候補や重複受領を検知する", () => {
  const save = createInitialRoster(123),
    c = save.roster[0];
  const reward = beginReward(
    save,
    {
      id: "match-123",
      winner: "player",
      reason: "allUnitsKilled",
      participants: [
        {
          character: c,
          owner: "player",
          coord: { q: 0, r: 0 },
          hp: 1,
          alive: true,
          killsThisBattle: 1,
        },
      ],
    },
    7,
  );
  expect(() => validateSave(JSON.parse(JSON.stringify(reward)))).not.toThrow();
  const changed = structuredClone(reward);
  changed.pendingReward!.result.participants[0].character.level = "MAX";
  expect(() => validateSave(changed)).toThrow();
  expect(() => beginReward(save, changed.pendingReward!.result, 7)).toThrow();
  expect(() =>
    validateSave({ ...reward, completedRewardIds: ["match-123"] }),
  ).toThrow();
  expect(() =>
    validateSave({
      ...reward,
      pendingReward: {
        ...reward.pendingReward,
        promotionStatus: "chosen",
        promotedId: "unknown",
      },
    }),
  ).toThrow();
});
