import { specialtySession } from "../tests/class-session-helpers";
import { advanceSpecialty } from "../tests/new-class-helpers";
import { beginRound } from "../src/character/rounds";
import { CharacterSession } from "../src/character/session";

/** Development-only, actual map/session fixtures. No production seed or roster changes. */
export function thrustFixture(scenario: "attack" | "counter" | "diagonal") {
  for (let seed = 1; seed <= 64; seed++) {
    const snapshot = specialtySession(
      scenario === "counter" ? "archer" : "spearman",
      seed,
    ).snapshot();
    const b = snapshot.battle,
      own = b.participants.filter((p) => p.owner === "player"),
      cpu = b.participants.filter((p) => p.owner === "cpu");
    if (
      cpu[0].character.classId !== "knight" ||
      cpu[1].character.classId !== "spearman"
    )
      continue;
    const sourceName = scenario === "counter" ? "弓兵ミラ" : "槍兵エルド";
    for (const record of [snapshot.config.team[0], own[0].character])
      record.displayName = sourceName;
    for (const record of [snapshot.config.team[1], own[1].character]) {
      record.displayName = scenario === "counter" ? "前衛ガルド" : "衛生兵リオ";
      if (scenario !== "counter") record.classId = "medic";
    }
    own[0].coord = scenario === "counter" ? { q: 2, r: 0 } : { q: 0, r: 0 };
    own[1].coord =
      scenario === "counter"
        ? { q: 1, r: 0 }
        : scenario === "diagonal"
          ? { q: -1, r: 0 }
          : { q: 0, r: 1 };
    own[1].hp = scenario === "counter" ? 30 : 20;
    const far = [
      { q: 4, r: -3 },
      { q: 4, r: -4 },
      { q: 5, r: -3 },
      { q: 5, r: -4 },
      { q: 3, r: -5 },
    ];
    if (scenario === "counter") {
      cpu[1].coord = { q: 0, r: 0 };
      cpu.filter((p) => p !== cpu[1]).forEach((p, i) => (p.coord = far[i]));
    } else {
      cpu[0].coord = scenario === "diagonal" ? { q: 0, r: 1 } : { q: 1, r: 0 };
      cpu[1].coord = scenario === "diagonal" ? { q: 1, r: 0 } : { q: 2, r: 0 };
      cpu
        .slice(2)
        .forEach(
          (p, i) =>
            (p.coord =
              scenario === "diagonal" && i === 0 ? { q: 1, r: 1 } : far[i]),
        );
    }
    beginRound(b);
    if (
      scenario !== "counter" &&
      cpu.some(
        (p) =>
          p.character.classId === "spearman" &&
          b.turnOrder.indexOf(p.character.characterId) >
            b.turnOrder.indexOf("actor"),
      )
    )
      continue;
    snapshot.battle = advanceSpecialty(b, "actor");
    return CharacterSession.restore(snapshot);
  }
  throw Error("検証用の行動順を準備できません。");
}
