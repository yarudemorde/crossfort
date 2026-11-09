import { CharacterSession } from "../src/character/session";
import { maps } from "../src/game/data";
import { neighbors } from "../src/game/rules/hex";
import { headquartersFor } from "../src/character/combat";
import { newCharacter, advanceSpecialty } from "./new-class-helpers";
import type { ClassId } from "../src/character/types";
export function specialtySession(classId: ClassId, seed = 7) {
  const map = maps.find((m) => m.id === "highlands-large")!;
  const team = [newCharacter(classId, "actor"), newCharacter("knight", "ally")];
  const slots = neighbors(headquartersFor(map).player);
  const game = new CharacterSession({
    id: `class-session-${classId}-${seed}`,
    seed,
    mapId: map.id,
    encounterVersion: 2,
    team,
    placements: Object.fromEntries(
      team.map((c, i) => [c.characterId, slots[i]]),
    ),
  });
  const snapshot = game.snapshot();
  const own = snapshot.battle.participants.filter((p) => p.owner === "player");
  own[0].coord = classId === "cavalry" ? { q: -2, r: 0 } : { q: 0, r: 0 };
  own[1].coord = classId === "cavalry" ? { q: 0, r: 1 } : { q: 1, r: 0 };
  own[1].hp = 5;
  const coords =
    classId === "medic"
      ? [
          { q: 5, r: -3 },
          { q: 5, r: -4 },
          { q: 4, r: -4 },
          { q: 4, r: -3 },
          { q: 3, r: -4 },
          { q: 3, r: -5 },
        ]
      : [
          { q: 2, r: 0 },
          { q: 3, r: -1 },
          { q: 4, r: -1 },
          { q: 5, r: -2 },
          { q: 3, r: 1 },
          { q: 4, r: 1 },
        ];
  snapshot.battle.participants
    .filter((p) => p.owner === "cpu")
    .forEach((p, i) => (p.coord = coords[i]));
  snapshot.battle = advanceSpecialty(snapshot.battle, "actor");
  return CharacterSession.restore(snapshot);
}
