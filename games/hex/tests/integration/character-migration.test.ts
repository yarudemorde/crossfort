import { IDBFactory } from "fake-indexeddb";
import { beforeEach, expect, it } from "vitest";
import {
  loadSave,
  readBattle,
  updateSave,
  validateSave,
} from "../../src/character/storage";
import { createInitialRoster } from "../../src/character/roster";
import { CharacterSession } from "../../src/character/session";
import { maps } from "../../src/game/data";
import { headquartersFor } from "../../src/character/combat";
import { neighbors } from "../../src/game/rules/hex";
import {
  beginReward,
  promote,
  commitVictory,
} from "../../src/character/reward";
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("crossfort-hex-characters-v2", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("saves");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function put(values: Record<string, unknown>) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction("saves", "readwrite");
    for (const [k, v] of Object.entries(values))
      t.objectStore("saves").put(v, k);
    t.oncomplete = () => resolve();
    t.onabort = () => reject(t.error);
  });
  db.close();
}
async function get(key: string) {
  const db = await database();
  const out = await new Promise<unknown>((resolve, reject) => {
    const r = db.transaction("saves").objectStore("saves").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  db.close();
  return out;
}
it("所持と旧対戦を一括移行し、旧データをバックアップして編成・配置・シードへ戻す", async () => {
  const save = createInitialRoster(41),
    team = save.roster.filter((_, i) => [0, 1, 3, 4, 6, 7].includes(i)),
    map = maps[0],
    slots = neighbors(headquartersFor(map).player);
  const game = new CharacterSession({
    id: "legacy",
    seed: 99,
    mapId: map.id,
    first: "cpu",
    team,
    placements: Object.fromEntries(
      team.map((c, i) => [c.characterId, slots[i]]),
    ),
  });
  const old = JSON.parse(JSON.stringify(save));
  old.schemaVersion = 2;
  for (const c of old.roster) delete c.growthHistory;
  const battle = JSON.parse(JSON.stringify(game.snapshot()));
  delete battle.schemaVersion;
  for (const c of battle.config.team) delete c.growthHistory;
  await put({ active: old, battle });
  const migrated = await loadSave(100);
  validateSave(migrated);
  expect(migrated.roster.map((c) => c.characterId)).toEqual(
    save.roster.map((c) => c.characterId),
  );
  expect(migrated.deploymentRecovery).toEqual({
    mapId: map.id,
    seed: 99,
    teamIds: team.map((c) => c.characterId),
    placements: battle.config.placements,
  });
  expect(await readBattle()).toBeUndefined();
  expect(await get("legacyBackupV2")).toEqual({ save: old, battle });
  expect(await loadSave(9999)).toEqual(migrated);
});
it("成長抽選・対象の保存失敗では一切更新せず、再試行でも同じ結果を確定する", async () => {
  const initial = await loadSave(1),
    c = initial.roster[0];
  await updateSave(0, (s) =>
    beginReward(
      s,
      {
        id: "atomic-growth",
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
      789,
    ),
  );
  const before = await loadSave(0),
    expected = promote(before, c.characterId);
  await expect(
    updateSave(0, (s) => {
      promote(s, c.characterId);
      throw Error("forced storage transition failure");
    }),
  ).rejects.toThrow();
  expect(await loadSave(0)).toEqual(before);
  const actual = await updateSave(0, (s) => promote(s, c.characterId));
  expect(actual).toEqual(expected);
  expect(await loadSave(1)).toEqual(expected);
  await expect(
    updateSave(0, (s) => promote(s, c.characterId)),
  ).rejects.toThrow();
  const committed = await updateSave(0, commitVictory);
  expect(committed.roster[0].growthHistory).toEqual([
    expected.pendingReward!.promotionResult!.gain,
  ]);
  await expect(updateSave(0, commitVictory)).rejects.toThrow();
});
