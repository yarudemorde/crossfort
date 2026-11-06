import { createInitialRoster } from "../src/character/roster";
import { migratedGrowth } from "../src/character/growth";
import { CharacterSession } from "../src/character/session";
import { headquartersFor } from "../src/character/combat";
import { maps } from "../src/game/data";
import { neighbors } from "../src/game/rules/hex";
document.querySelector<HTMLButtonElement>("#prepare")!.onclick = async () => {
  const save = createInitialRoster(41);
  save.roster[0].level = 2;
  save.roster[0].displayName = "継承のアルト";
  save.roster[0].growthHistory = migratedGrowth(save.roster[0].characterId, 2);
  const team = save.roster.filter((_, i) => [0, 1, 3, 4, 6, 7].includes(i)),
    map = maps.find((m) => m.id === "crossing-large")!,
    slots = neighbors(headquartersFor(map).player);
  const session = new CharacterSession({
    id: "legacy-fixture",
    seed: 99,
    mapId: map.id,
    team,
    placements: Object.fromEntries(
      team.map((c, i) => [c.characterId, slots[i]]),
    ),
  });
  const legacy = JSON.parse(JSON.stringify(save)),
    battle = JSON.parse(JSON.stringify(session.snapshot()));
  legacy.schemaVersion = 2;
  delete battle.schemaVersion;
  for (const c of legacy.roster) delete c.growthHistory;
  for (const c of battle.config.team) delete c.growthHistory;
  for (const p of battle.battle.participants) {
    delete p.character.growthHistory;
    delete p.initiativeKey;
    p.hp =
      ({ knight: 12, archer: 8, scout: 6 } as Record<string, number>)[
        p.character.classId
      ] +
      p.character.hpDelta +
      (p.character.level === 2 ? 1 : 0);
  }
  for (const key of [
    "roundNumber",
    "turnOrder",
    "turnIndex",
    "actedIds",
    "currentActorId",
  ])
    delete battle.battle[key];
  battle.battle.headquarters.player.hp = 15;
  battle.battle.headquarters.cpu.hp = 15;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("crossfort-hex-characters-v2", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("saves");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction("saves", "readwrite"),
      s = t.objectStore("saves"),
      a = s.get("active"),
      b = s.get("battle");
    b.onsuccess = () => {
      s.put(
        { save: a.result, battle: b.result },
        "qaBackupBeforeLegacyFixture",
      );
      s.put(legacy, "active");
      s.put(battle, "battle");
    };
    t.oncomplete = () => resolve();
    t.onabort = () => reject(t.error);
  });
  db.close();
  document.querySelector("output")!.textContent =
    "旧形式を保存しました。編成6名・渡河戦91マス・seed99・継承のアルトLv.2をゲームで確認できます。";
};
