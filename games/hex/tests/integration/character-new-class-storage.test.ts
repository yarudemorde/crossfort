import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import {
  loadSave,
  updateSave,
  validateSave,
} from "../../src/character/storage";
import {
  recruitReplacement,
  stats,
  scoutChance,
} from "../../src/character/roster";
import {
  beginReward,
  commitVictory,
  decideScout,
  promote,
} from "../../src/character/reward";
import { reconcileFormationDraft } from "../../src/app/formation";
import { newCharacter } from "../new-class-helpers";
import { CharacterSession } from "../../src/character/session";
import { maps } from "../../src/game/data";
import { neighbors } from "../../src/game/rules/hex";
import { headquartersFor } from "../../src/character/combat";

it("旧セーブはそのまま復元し、旧CPU編成の進行中対戦も変化しない", async () => {
  const save = await loadSave(123);
  const original = structuredClone(save);
  expect(await loadSave(999)).toEqual(original);
  const map = maps[0],
    team = save.roster.filter((_, i) => [0, 1, 3, 4, 6, 7].includes(i)),
    slots = neighbors(headquartersFor(map).player);
  const legacy = new CharacterSession({
    id: "old-jobs-save",
    seed: 7,
    mapId: map.id,
    team,
    placements: Object.fromEntries(
      team.map((c, i) => [c.characterId, slots[i]]),
    ),
  });
  const snapshot = legacy.snapshot();
  expect(snapshot.config.encounterVersion).toBeUndefined();
  const resumed = CharacterSession.restore(
    JSON.parse(JSON.stringify(snapshot)),
  );
  expect(resumed.snapshot()).toEqual(snapshot);
  expect(
    resumed
      .snapshot()
      .battle.participants.filter((p) => p.owner === "cpu")
      .map((p) => p.character.classId),
  ).toEqual(["knight", "knight", "archer", "archer", "scout", "scout"]);
});
it("新職の補充→スカウト→成長→死亡除外→次戦の編成を保存し、二重報酬を防止", async () => {
  await updateSave(0, (s) => ({
    ...s,
    roster: [
      newCharacter("medic", "own-medic"),
      newCharacter("spearman", "own-spear"),
    ],
  }));
  await updateSave(0, (s) => recruitReplacement(s, "cavalry", "own-cavalry"));
  let save = await loadSave(0);
  expect(save.roster.map((c) => stats(c).cost)).toEqual([2, 2, 3]);
  const scout = {
    ...newCharacter("spearman", "enemy-spear"),
    hpDelta: -3,
    attackDelta: -1,
    level: 2 as const,
    growthHistory: [{ hp: 4, attack: 1, initiative: 1, counterTenths: 1 }],
  };
  expect(scoutChance(scout)).toBe(90);
  await updateSave(0, (s) =>
    beginReward(
      s,
      {
        id: "new-class-reward",
        winner: "player",
        reason: "headquartersDestroyed",
        participants: [
          ...s.roster.map((character, i) => ({
            character,
            owner: "player" as const,
            coord: { q: i, r: 0 },
            hp: i === 1 ? 0 : 1,
            alive: i !== 1,
            killsThisBattle: 0,
          })),
          {
            character: scout,
            owner: "cpu",
            coord: { q: 3, r: 0 },
            hp: 1,
            alive: true,
            killsThisBattle: 0,
          },
        ],
      },
      0,
    ),
  );
  await updateSave(0, (s) => decideScout(s, scout.characterId));
  expect((await loadSave(0)).pendingReward?.scoutStatus).toBe("succeeded");
  await updateSave(0, (s) => promote(s, "own-medic"));
  const chosen = (await loadSave(0)).pendingReward!;
  expect(chosen.promotionResult?.gain.counterTenths).toBe(0);
  await expect(updateSave(0, (s) => promote(s, "own-medic"))).rejects.toThrow();
  await updateSave(0, commitVictory);
  save = await loadSave(0);
  validateSave(save);
  expect(save.roster.find((c) => c.characterId === "own-medic")).toMatchObject({
    level: 2,
    battlesParticipated: 1,
  });
  expect(
    stats(save.roster.find((c) => c.characterId === "own-medic")!)
      .counterTenths,
  ).toBe(0);
  expect(
    save.roster.find((c) => c.characterId === scout.characterId),
  ).toMatchObject({ ...scout, acquisitionSource: "scout" });
  expect(save.archive.some((c) => c.characterId === "own-spear")).toBe(true);
  const draft = reconcileFormationDraft(
    {
      formation: ["own-medic", "own-spear", "own-cavalry"],
      placements: {},
      pick: "own-spear",
    },
    save.roster,
  );
  expect(draft.formation).toEqual(["own-medic", "own-cavalry"]);
  expect(draft.pick).toBeUndefined();
  expect(await loadSave(999)).toEqual(save);
  await expect(updateSave(0, commitVictory)).rejects.toThrow();
});
