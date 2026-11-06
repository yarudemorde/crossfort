import { it, expect, afterAll } from "vitest";
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

const results: {
  map: string;
  count: number;
  winner: string;
  rounds: number;
  actions: number;
  firstActorOwner: string;
}[] = [];
it.each(
  maps.flatMap((m) =>
    [1, 2, 3].flatMap((seed) =>
      (["a", "b"] as const).flatMap((tieVariant) =>
        [1, 5, 6].map((count) => ({ id: m.id, seed, tieVariant, count })),
      ),
    ),
  ),
)(
  "$id/$seed/$tieVariant/$count名 CPU同士が合法手で決着する",
  ({ id, seed, tieVariant, count }) => {
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
      seed ^ (tieVariant === "a" ? 0 : 0x6d2b79f5),
      map,
      { player: one, cpu: two },
      { player: place(one, hq.player), cpu: place(two, hq.cpu) },
    );
    const firstActorOwner = s.activePlayer;
    for (let i = 0; i < 800 && !s.outcome; i++) {
      const o = observation(s, s.activePlayer),
        a = chooseAction(o, seed + i + 1);
      expect(legalActions(o)).toContainEqual(a);
      s = playCpuTurn(s, seed + i + 1);
    }
    results.push({
      map: id,
      count,
      winner: s.outcome?.winner ?? "unresolved",
      rounds: s.roundNumber,
      actions: s.actionNumber,
      firstActorOwner,
    });
    expect(s.outcome, `${id}: ${s.events.length} events`).toBeDefined();
  },
  30000,
);

afterAll(() => {
  const even = results.filter((r) => r.count === 6),
    rounds = even.map((r) => r.rounds).sort((a, b) => a - b);
  console.log(
    "ROUND_BALANCE " +
      JSON.stringify({
        conditions: results.length,
        unresolved: results.filter((r) => r.winner === "unresolved").length,
        firstPlayer: results.filter((r) => r.firstActorOwner === "player")
          .length,
        firstCpu: results.filter((r) => r.firstActorOwner === "cpu").length,
        sixVsSix: {
          conditions: even.length,
          playerWins: even.filter((r) => r.winner === "player").length,
          cpuWins: even.filter((r) => r.winner === "cpu").length,
          minRounds: rounds[0],
          medianRounds: rounds[Math.floor(rounds.length / 2)],
          maxRounds: rounds.at(-1),
        },
      }),
  );
});
