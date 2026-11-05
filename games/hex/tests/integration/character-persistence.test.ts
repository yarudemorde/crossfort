import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { CharacterSession } from "../../src/character/session";
import {
  loadSave,
  updateSave,
  persistBattle,
  readBattle,
  discardBattle,
} from "../../src/character/storage";
import { headquartersFor } from "../../src/character/combat";
import { neighbors } from "../../src/game/rules/hex";
import { maps } from "../../src/game/data";
import { chooseAction } from "../../src/character/cpu";
import {
  commitVictory,
  decideScout,
  promote,
} from "../../src/character/reward";
it("実際のIndexedDB取引で手番復帰・競合拒否・勝利報酬の一括保存と再読込を保証", async () => {
  const save = await loadSave(1);
  const team = save.roster.filter((_, i) => [0, 1, 3, 4, 6, 7].includes(i));
  const map = maps.find((m) => m.id === "crossing-small")!;
  const slots = neighbors(headquartersFor(map).player);
  let game = new CharacterSession({
    id: "atomic-win",
    seed: 1,
    mapId: map.id,
    first: "player",
    team,
    placements: Object.fromEntries(
      team.map((c, i) => [c.characterId, slots[i]]),
    ),
  });
  await persistBattle(game.snapshot());
  expect((await loadSave(99)).roster).toEqual(save.roster);
  expect(await readBattle()).toEqual(game.snapshot());
  await expect(updateSave(0, (s) => ({ ...s, roster: [] }))).rejects.toThrow();
  game = CharacterSession.restore((await readBattle())!);
  for (let i = 0; i < 800 && !game.view().observation.outcome; i++) {
    const rev = game.snapshot().revision;
    const view = game.view().observation;
    if (view.activePlayer === "cpu") game.cpu();
    else {
      const a = chooseAction(view, 1 + i);
      if (a.type === "pass") game.act(a);
      else {
        game.move(a.actorId, a.path);
        game.act(chooseAction(game.view().observation, 2 + i));
      }
    }
    game.advanceRevision();
    await persistBattle(game.snapshot(), rev);
    if (i === 0)
      await expect(persistBattle(game.snapshot(), rev)).rejects.toThrow();
  }
  expect(game.view().observation.outcome?.winner).toBe("player");
  if (game.view().observation.outcome?.winner === "player") {
    expect(await readBattle()).toBeUndefined();
    const pending = await loadSave(99);
    expect(pending.pendingReward?.id).toBe("atomic-win");
    expect(pending.roster).toEqual(save.roster);
    await updateSave(0, (s) =>
      s.pendingReward?.scoutStatus === "pending" ? decideScout(s) : s,
    );
    const next = await loadSave(0),
      candidate = next.pendingReward!.result.participants.find(
        (p) => p.owner === "player" && p.alive && p.character.level !== "MAX",
      );
    if (candidate)
      await updateSave(0, (s) => promote(s, candidate.character.characterId));
    await updateSave(0, commitVictory);
    expect((await loadSave(0)).completedRewardIds).toContain("atomic-win");
    await expect(updateSave(0, commitVictory)).rejects.toThrow();
  } else {
    expect((await loadSave(0)).roster).toEqual(save.roster);
    await discardBattle();
  }
});
