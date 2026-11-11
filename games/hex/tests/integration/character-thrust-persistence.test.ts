import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import {
  loadSave,
  updateSave,
  validateSave,
} from "../../src/character/storage";
import {
  beginReward,
  promote,
  commitVictory,
} from "../../src/character/reward";
import {
  startBattle,
  applyBattleAction,
  battleResult,
} from "../../src/character/battle";
import { beginRound } from "../../src/character/rounds";
import { headquartersFor } from "../../src/character/combat";
import { stats, scoutChance } from "../../src/character/roster";
import { CharacterSession } from "../../src/character/session";
import { maps } from "../../src/game/data";
import { neighbors } from "../../src/game/rules/hex";
import { newCharacter } from "../new-class-helpers";

it("反撃が第三者を撃破し、その後の勝敗と勝利時の撃破記録を正しく保存する", async () => {
  const own = newCharacter("spearman", "own-spear"),
    archer = newCharacter("archer", "enemy-archer"),
    front = newCharacter("knight", "enemy-front");
  await updateSave(0, (s) => ({ ...s, roster: [own] }));
  const map = structuredClone(maps.find((m) => m.id === "highlands-large")!);
  for (const h of map.hexes) h.terrain = "plain";
  const hq = headquartersFor(map),
    homes = neighbors(hq.cpu);
  let b = startBattle(
    "third-party-win",
    77,
    map,
    { player: [own], cpu: [archer, front] },
    {
      player: { [own.characterId]: neighbors(hq.player)[0] },
      cpu: { [archer.characterId]: homes[0], [front.characterId]: homes[1] },
    },
  );
  b.participants[0].coord = { q: 0, r: 0 };
  b.participants[1].coord = { q: 2, r: 0 };
  b.participants[2].coord = { q: 1, r: 0 };
  b.participants[2].hp = 1;
  beginRound(b);
  b = applyBattleAction(
    b,
    {
      type: "act",
      actorId: archer.characterId,
      path: [],
      targetId: own.characterId,
    },
    "cpu",
  );
  expect(b.participants[2]).toMatchObject({ alive: false, hp: 0 });
  expect(b.participants[0].killsThisBattle).toBe(1);
  expect(b.participants[1].hp).toBe(22);
  expect(b.outcome).toBeUndefined();
  b = applyBattleAction(
    b,
    {
      type: "act",
      actorId: own.characterId,
      path: [],
      targetId: archer.characterId,
    },
    "player",
  );
  b = applyBattleAction(
    b,
    {
      type: "act",
      actorId: archer.characterId,
      path: [],
      targetId: own.characterId,
    },
    "cpu",
  );
  b = applyBattleAction(
    b,
    {
      type: "act",
      actorId: own.characterId,
      path: [],
      targetId: archer.characterId,
    },
    "player",
  );
  expect(b.outcome).toEqual({ winner: "player", reason: "allUnitsKilled" });
  expect(b.participants[0]).toMatchObject({ hp: 2, killsThisBattle: 2 });
  const result = battleResult(b);
  await updateSave(0, (s) => beginReward(s, result, 5));
  await updateSave(0, (s) => promote(s, own.characterId));
  await updateSave(0, commitVictory);
  const saved = await loadSave(0);
  validateSave(saved);
  expect(saved.roster[0]).toMatchObject({
    characterId: own.characterId,
    kills: 2,
    battlesParticipated: 1,
  });
  await expect(updateSave(0, commitVictory)).rejects.toThrow();
});

it("既存の槍兵の個体差・履歴・名前・戦績を変更せず、新基本値を導出し旧対戦も復元する", async () => {
  const c = {
    ...newCharacter("spearman", "existing-spear"),
    displayName: "古参の槍兵",
    hpDelta: 2,
    attackDelta: -1,
    level: 2 as const,
    growthHistory: [{ hp: 4, attack: 1, initiative: 0, counterTenths: 1 }],
    battlesParticipated: 7,
    kills: 9,
    nameEditUsed: true,
  };
  await updateSave(0, (s) => ({ ...s, roster: [c] }));
  const before = await loadSave(0);
  const chance = scoutChance(c);
  expect(stats(c)).toMatchObject({ attack: 9, counterTenths: 14, hp: 31 });
  const map = maps.find((m) => m.id === "crossing-small")!,
    slot = neighbors(headquartersFor(map).player)[0];
  const legacy = new CharacterSession({
    id: "legacy-spear-save",
    seed: 17,
    mapId: map.id,
    team: [c],
    placements: { [c.characterId]: slot },
  });
  const snapshot = JSON.parse(JSON.stringify(legacy.snapshot()));
  const resumed = CharacterSession.restore(snapshot);
  expect(resumed.snapshot()).toEqual(snapshot);
  expect((await loadSave(999)).roster).toEqual(before.roster);
  expect(scoutChance((await loadSave(999)).roster[0])).toBe(chance);
});
