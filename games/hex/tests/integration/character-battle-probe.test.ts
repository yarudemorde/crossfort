import { it, expect } from "vitest";
import { maps } from "../../src/game/data";
import { neighbors } from "../../src/game/rules/hex";
import { createInitialRoster } from "../../src/character/roster";
import { headquartersFor } from "../../src/character/combat";
import {
  startBattle,
  observation,
  applyBattleAction,
  legalActions,
} from "../../src/character/battle";
import { chooseAction } from "../../src/character/cpu";

it.each(
  maps.flatMap((m) =>
    [1, 2, 3].flatMap((seed) =>
      (["player", "cpu"] as const).map((first) => ({ id: m.id, seed, first })),
    ),
  ),
)(
  "$id/$seed/$first CPU同士が合法手で決着する",
  ({ id, seed, first }) => {
    const map = maps.find((m) => m.id === id)!;
    const one = createInitialRoster(seed).roster.filter((_, i) =>
      [0, 1, 3, 4, 6, 7].includes(i),
    );
    const two = createInitialRoster(seed + 100)
      .roster.filter((_, i) => [0, 1, 3, 4, 6, 7].includes(i))
      .map((c) => ({ ...c, characterId: "cpu-" + c.characterId }));
    const hq = headquartersFor(map);
    const place = (team: typeof one, pos: typeof hq.player) =>
      Object.fromEntries(
        team.map((c, i) => [c.characterId, neighbors(pos)[i]]),
      );
    let s = startBattle(
      "test",
      seed,
      map,
      { player: one, cpu: two },
      { player: place(one, hq.player), cpu: place(two, hq.cpu) },
      first,
    );
    for (let i = 0; i < 800 && !s.outcome; i++) {
      const o = observation(s, s.activePlayer),
        a = chooseAction(o, seed + i + 1);
      expect(legalActions(o)).toContainEqual(a);
      s = applyBattleAction(s, a, s.activePlayer);
    }
    expect(s.outcome, `${id}: ${s.events.length} events`).toBeDefined();
  },
  30000,
);
