import { expect, it } from "vitest";
import { maps } from "../../src/game/data";
import { neighbors } from "../../src/game/rules/hex";
import { CharacterSession } from "../../src/character/session";
import { headquartersFor } from "../../src/character/combat";
import { createInitialRoster } from "../../src/character/roster";
import { chooseAction } from "../../src/character/cpu";
import {
  beginReward,
  commitVictory,
  decideScout,
  promote,
} from "../../src/character/reward";

it("画面と同じセッションで勝利から報酬確定まで進み、二重受領を防ぐ", () => {
  let victories = 0;
  for (let seed = 1; seed <= 20 && !victories; seed++) {
    const save = createInitialRoster(seed);
    const team = save.roster.filter((_, i) => [0, 1, 3, 4, 6, 7].includes(i));
    const map = maps.find((m) => m.id === "crossing-small")!;
    const slots = neighbors(headquartersFor(map).player);
    const placements = Object.fromEntries(
      team.map((c, i) => [c.characterId, slots[i]]),
    );
    const game = new CharacterSession({
      id: `lifecycle-${seed}`,
      seed,
      mapId: map.id,
      first: "player",
      team,
      placements,
    });
    let state = game.view();
    for (let step = 0; step < 800 && !state.observation.outcome; step++) {
      if (state.observation.activePlayer === "cpu") state = game.cpu();
      else {
        const a = chooseAction(state.observation, seed + step);
        if (a.type === "pass") state = game.act(a);
        else {
          state = game.move(a.actorId, a.path);
          const next = chooseAction(state.observation, seed + step + 1);
          state = game.act(next);
        }
      }
    }
    expect(state.observation.outcome).toBeDefined();
    if (!state.result) continue;
    victories++;
    let s = beginReward(save, state.result, seed);
    s = JSON.parse(JSON.stringify(s));
    if (s.pendingReward!.scoutStatus === "pending") s = decideScout(s);
    const candidate = s.pendingReward!.result.participants.find(
      (p) => p.owner === "player" && p.alive && p.character.level !== "MAX",
    );
    if (candidate) s = promote(s, candidate.character.characterId);
    s = commitVictory(s);
    expect(s.completedRewardIds).toContain(state.result.id);
    expect(() => beginReward(s, state.result!, seed)).toThrow();
    expect(() => commitVictory(s)).toThrow();
  }
  expect(victories).toBe(1);
}, 30000);
