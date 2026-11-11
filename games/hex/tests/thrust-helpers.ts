import {
  specialtyBattle,
  newCharacter,
  advanceSpecialty,
} from "./new-class-helpers";
import { beginRound } from "../src/character/rounds";
import type { ClassId, Participant } from "../src/character/types";
import type { Coord } from "../src/game/types";
import { stats } from "../src/character/roster";
export const soldier = (
  id: string,
  classId: ClassId,
  coord: Coord,
  owner: "player" | "cpu" = "cpu",
): Participant => ({
  character: newCharacter(classId, id),
  coord,
  owner,
  hp: stats(newCharacter(classId)).hp,
  alive: true,
  killsThisBattle: 0,
});
export function thrustBattle(counter = false) {
  const b = specialtyBattle(counter ? "archer" : "spearman");
  if (counter) {
    b.participants = [
      soldier("actor", "archer", { q: 2, r: 0 }, "player"),
      soldier("ally", "knight", { q: 1, r: 0 }, "player"),
      soldier("enemy", "spearman", { q: 0, r: 0 }),
      soldier("other-enemy", "knight", { q: 4, r: -1 }),
    ];
  } else {
    b.participants = [
      soldier("actor", "spearman", { q: 0, r: 0 }, "player"),
      soldier("ally", "knight", { q: 0, r: 1 }, "player"),
      soldier("enemy", "knight", { q: 1, r: 0 }),
      soldier("other-enemy", "spearman", { q: 2, r: 0 }),
    ];
  }
  beginRound(b);
  return advanceSpecialty(b, "actor");
}
