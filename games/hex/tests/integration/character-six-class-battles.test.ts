import { afterAll, expect, it } from "vitest";
import { maps } from "../../src/game/data";
import { neighbors } from "../../src/game/rules/hex";
import {
  startBattle,
  legalActions,
  observation,
} from "../../src/character/battle";
import { chooseAction, playCpuTurn } from "../../src/character/cpu";
import { createCpuTeam } from "../../src/character/encounters";
import { headquartersFor } from "../../src/character/combat";
import { validateFormation } from "../../src/character/roster";
import { newCharacter } from "../new-class-helpers";
import type { ClassId } from "../../src/character/types";
const results: {
  map: string;
  seed: number;
  rounds: number;
  winner: string;
  heals: number;
}[] = [];
it.each(
  maps.flatMap((m) => [1, 2, 3, 4].map((seed) => ({ mapId: m.id, seed }))),
)(
  "$mapId / seed $seed 新職業入りCPU戦が合法手で決着する",
  ({ mapId, seed }) => {
    const map = maps.find((m) => m.id === mapId)!;
    const player = (
      ["cavalry", "spearman", "medic", "scout", "scout"] as ClassId[]
    ).map((cls, i) => newCharacter(cls, `player-${i}`));
    const cpu = createCpuTeam(seed, `new-jobs-${seed}`, 2);
    expect(
      validateFormation(
        cpu.map((c) => c.characterId),
        cpu,
      ),
    ).toBeUndefined();
    const hq = headquartersFor(map);
    const place = (team: typeof player, owner: "player" | "cpu") =>
      Object.fromEntries(
        team.map((c, i) => [c.characterId, neighbors(hq[owner])[i]]),
      );
    let s = startBattle(
      `new-jobs-${seed}`,
      seed,
      map,
      { player, cpu },
      { player: place(player, "player"), cpu: place(cpu, "cpu") },
    );
    for (let i = 0; i < 1000 && !s.outcome; i++) {
      const view = observation(s, s.activePlayer);
      expect(legalActions(view)).toContainEqual(chooseAction(view, seed + i));
      s = playCpuTurn(s, seed + i);
    }
    results.push({
      map: mapId,
      seed,
      rounds: s.roundNumber,
      winner: s.outcome?.winner ?? "unresolved",
      heals: s.events.filter((e) => e.type === "heal").length,
    });
    expect(s.outcome, JSON.stringify(results.at(-1))).toBeDefined();
  },
  30000,
);
afterAll(() => console.log("SIX_CLASS_PROBE " + JSON.stringify(results)));
