import { it, expect } from "vitest";
import { maps } from "../../src/game/data";
import { neighbors } from "../../src/game/rules/hex";
import { createInitialRoster } from "../../src/character/roster";
import { headquartersFor } from "../../src/character/combat";
import {
  startBattle,
  observation,
  legalActions,
} from "../../src/character/battle";
import { chooseAction, playCpuTurn } from "../../src/character/cpu";

it.each(
  maps.flatMap((m) =>
    [1, 2, 3].flatMap((seed) =>
      (["player", "cpu"] as const).flatMap((first) =>
        [1, 5, 6].map((count) => ({ id: m.id, seed, first, count })),
      ),
    ),
  ),
)(
  "$id/$seed/$first/$count名 CPU同士が合法手で決着する",
  ({ id, seed, first, count }) => {
    const map = maps.find((m) => m.id === id)!;
    const indices =
      count === 1 ? [6] : count === 5 ? [0, 1, 2, 3, 4] : [0, 1, 3, 4, 6, 7];
    const one = createInitialRoster(seed).roster.filter((_, i) =>
      indices.includes(i),
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
      s = playCpuTurn(s, seed + i + 1);
    }
    expect(s.outcome, `${id}: ${s.events.length} events`).toBeDefined();
  },
  30000,
);
