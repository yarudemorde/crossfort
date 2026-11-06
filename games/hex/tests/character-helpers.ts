import { maps } from "../src/game/data";
import { neighbors } from "../src/game/rules/hex";
import { createInitialRoster } from "../src/character/roster";
import { headquartersFor } from "../src/character/combat";
import {
  startBattle,
  applyBattleAction,
  type Battle,
} from "../src/character/battle";

export function roundBattle(mapId = "highlands-large", seed = 123) {
  const map = maps.find((m) => m.id === mapId)!;
  const indices = [0, 1, 3, 4, 6, 7];
  const player = createInitialRoster(seed).roster.filter((_, i) =>
    indices.includes(i),
  );
  const cpu = createInitialRoster(seed + 99)
    .roster.filter((_, i) => indices.includes(i))
    .map((c) => ({ ...c, characterId: `cpu-${c.characterId}` }));
  const hq = headquartersFor(map);
  const place = (team: typeof player, home: typeof hq.player) =>
    Object.fromEntries(team.map((c, i) => [c.characterId, neighbors(home)[i]]));
  return startBattle(
    "round-test",
    seed,
    map,
    { player, cpu },
    { player: place(player, hq.player), cpu: place(cpu, hq.cpu) },
  );
}
export function advanceTo(state: Battle, id: string): Battle {
  let s = state;
  for (let i = 0; i < 24 && s.currentActorId !== id; i++)
    s = applyBattleAction(s, { type: "pass" }, s.activePlayer);
  if (s.currentActorId !== id) throw Error("fixture actor missing");
  return s;
}
