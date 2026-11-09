import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { reconcileFormationDraft } from "../../src/app/formation";
import {
  loadSave,
  updateSave,
  persistBattle,
  readBattle,
} from "../../src/character/storage";
import {
  beginReward,
  promote,
  commitVictory,
} from "../../src/character/reward";
import {
  recruitReplacement,
  stats,
  validateFormation,
} from "../../src/character/roster";
import { headquartersFor } from "../../src/character/combat";
import { neighbors } from "../../src/game/rules/hex";
import { maps } from "../../src/game/data";
import { CharacterSession } from "../../src/character/session";

it("一戦目の5名戦死を保存し、残った1名を補充して6名で次戦を開始・再開できる", async () => {
  const original = await loadSave(123);
  const team = original.roster.filter((_, i) => [0, 1, 3, 4, 6, 7].includes(i));
  const map = maps.find((m) => m.id === "crossing-small")!;
  const slots = neighbors(headquartersFor(map).player);
  const draft = {
    formation: team.map((c) => c.characterId),
    placements: Object.fromEntries(
      team.map((c, i) => [c.characterId, slots[i]]),
    ),
    pick: team[1].characterId,
  };
  await updateSave(0, (s) =>
    beginReward(
      s,
      {
        id: "formation-regression-win",
        winner: "player",
        reason: "allUnitsKilled",
        participants: team.map((character, i) => ({
          character,
          owner: "player",
          coord: slots[i],
          hp: i === 0 ? 1 : 0,
          alive: i === 0,
          killsThisBattle: i === 0 ? 2 : 0,
        })),
      },
      7,
    ),
  );
  await updateSave(0, (s) => promote(s, team[0].characterId));
  await updateSave(0, commitVictory);
  const committed = await loadSave(999);
  const next = reconcileFormationDraft(draft, committed.roster);
  expect(next.formation).toEqual([team[0].characterId]);
  expect(
    stats(committed.roster.find((c) => c.characterId === next.formation[0])!)
      .cost,
  ).toBe(2);
  expect(committed.archive).toHaveLength(5);
  expect(committed.roster).toHaveLength(4);
  const survivor = committed.roster.find(
    (c) => c.characterId === team[0].characterId,
  )!;
  expect(survivor).toMatchObject({
    level: 2,
    battlesParticipated: 1,
    kills: 2,
  });
  expect(survivor.growthHistory).toHaveLength(1);
  expect(reconcileFormationDraft(next, (await loadSave(0)).roster)).toEqual(
    next,
  );
  await expect(updateSave(0, commitVictory)).rejects.toThrow();
  await updateSave(0, (s) => recruitReplacement(s, "scout", "refill-1"));
  await updateSave(0, (s) => recruitReplacement(s, "scout", "refill-2"));
  const refilled = await loadSave(0);
  const formation = [
    ...next.formation,
    ...refilled.roster
      .map((c) => c.characterId)
      .filter((id) => !next.formation.includes(id)),
  ];
  expect(formation).toHaveLength(6);
  expect(validateFormation(formation, refilled.roster)).toBeUndefined();
  expect(
    formation.some((id) => refilled.archive.some((c) => c.characterId === id)),
  ).toBe(false);
  const game = new CharacterSession({
    id: "formation-regression-next-battle",
    seed: 42,
    mapId: map.id,
    team: formation.map((id) =>
      refilled.roster.find((c) => c.characterId === id)!,
    ),
    placements: Object.fromEntries(formation.map((id, i) => [id, slots[i]])),
  });
  await persistBattle(game.snapshot());
  const restored = CharacterSession.restore((await readBattle())!);
  expect(
    restored
      .view()
      .observation.participants.filter((p) => p.owner === "player"),
  ).toHaveLength(6);
  expect(restored.snapshot()).toEqual(game.snapshot());
  expect((await loadSave(0)).roster).toEqual(refilled.roster);
});
