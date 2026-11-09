import { maps } from "../src/game/data";
import { hexId, neighbors } from "../src/game/rules/hex";
import {
  startBattle,
  applyBattleAction,
  type Battle,
} from "../src/character/battle";
import { beginRound } from "../src/character/rounds";
import { createInitialRoster, stats } from "../src/character/roster";
import { headquartersFor } from "../src/character/combat";
import type { ClassId, Character } from "../src/character/types";
export const newCharacter = (
  classId: ClassId,
  id: string = classId,
): Character => ({
  ...createInitialRoster(123).roster[0],
  characterId: id,
  displayName: id,
  classId,
  hpDelta: 0,
  attackDelta: 0,
});
export function specialtyBattle(classId: ClassId) {
  const map = structuredClone(maps.find((m) => m.id === "highlands-large")!);
  for (const tile of map.hexes) tile.terrain = "plain";
  const teams = {
    player: [newCharacter(classId, "actor"), newCharacter("knight", "ally")],
    cpu: [
      newCharacter("knight", "enemy"),
      newCharacter("spearman", "other-enemy"),
    ],
  };
  const hq = headquartersFor(map);
  const place = (team: Character[], owner: "player" | "cpu") =>
    Object.fromEntries(
      team.map((c, i) => [c.characterId, neighbors(hq[owner])[i]]),
    );
  const s = startBattle("specialty", 7, map, teams, {
    player: place(teams.player, "player"),
    cpu: place(teams.cpu, "cpu"),
  });
  const coordinates = [
    { q: 0, r: 0 },
    { q: 0, r: 1 },
    { q: 2, r: 0 },
    { q: 3, r: 0 },
  ];
  s.participants.forEach((p, i) => {
    p.coord = coordinates[i];
    p.hp = stats(p.character).hp;
  });
  s.explored = { player: map.hexes.map(hexId), cpu: map.hexes.map(hexId) };
  beginRound(s);
  return advanceSpecialty(s, "actor");
}
export function advanceSpecialty(state: Battle, id: string) {
  let s = state;
  for (let i = 0; i < 24 && s.currentActorId !== id; i++)
    s = applyBattleAction(s, { type: "pass" }, s.activePlayer);
  if (s.currentActorId !== id) throw Error("fixture actor missing");
  return s;
}
