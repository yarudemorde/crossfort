import { stats } from "../../src/character/roster";
import { applyBattleAction } from "../../src/character/battle";
import { describe, expect, it } from "vitest";
import { maps } from "../../src/game/data";
import { neighbors } from "../../src/game/rules/hex";
import { CharacterSession } from "../../src/character/session";
import { headquartersFor } from "../../src/character/combat";
import { createInitialRoster } from "../../src/character/roster";

function session(seed = 41) {
  const map = maps.find((m) => m.id === "highlands-large")!;
  const team = createInitialRoster(seed).roster.filter((_, i) =>
    [0, 1, 3, 4, 6, 7].includes(i),
  );
  const placements = Object.fromEntries(
    team.map((c, i) => [
      c.characterId,
      neighbors(headquartersFor(map).player)[i],
    ]),
  );
  return new CharacterSession({
    id: "session-1",
    seed,
    mapId: map.id,
    first: "player",
    team,
    placements,
  });
}
describe("キャラクター戦闘の通信境界", () => {
  it("開始直後に未発見の敵、敵本城HP、未知の地形、seedを画面へ渡さない", () => {
    const view = session().view();
    expect(
      view.observation.participants.every((p) => p.owner === "player"),
    ).toBe(true);
    expect(view.observation.headquarters.cpu.hp).toBeUndefined();
    expect(
      view.observation.hexes.some(
        (h) => !h.explored && h.terrain === undefined,
      ),
    ).toBe(true);
    expect(view.observation).not.toHaveProperty("seed");
    expect(view).not.toHaveProperty("result");
  });
  it("プレイヤー以外の手番や不正な操作を拒否し、同じ条件を再現する", () => {
    const a = session(),
      b = session();
    expect(a.view()).toEqual(b.view());
    const turn = a.snapshot().battle.activePlayer;
    if (turn === "player") expect(() => a.cpu()).toThrow();
    else expect(() => a.act({ type: "pass" })).toThrow();
    expect(() => a.move("unknown", [])).toThrow();
    expect(a.view()).toEqual(b.view());
    if (turn === "player") a.act({ type: "pass" });
    else a.cpu();
    expect(a.snapshot().battle.actionNumber).toBeGreaterThan(1);
  });
  it("複数マス移動は各マスの観測を順に返し、未探索地形を含めない", () => {
    const game = session();
    while (game.view().observation.activePlayer === "cpu") game.cpu();
    const before = game.view();
    const action = before.legal.find(
      (a) => a.type === "act" && a.path.length === 2 && !a.targetId,
    );
    expect(action?.type).toBe("act");
    if (!action || action.type !== "act") throw Error("移動先なし");
    const result = game.move(action.actorId, action.path);
    expect(result.frames).toHaveLength(2);
    for (let i = 0; i < result.frames.length; i++) {
      expect(
        result.frames[i].after.participants.find(
          (p) => p.character.characterId === action.actorId,
        )?.coord,
      ).toEqual(action.path[i]);
      expect(
        result.frames[i].after.hexes.every(
          (h) => h.explored || h.terrain === undefined,
        ),
      ).toBe(true);
      expect(result.frames[i]).not.toHaveProperty("seed");
    }
  });
});

it("演出は攻撃→HP更新→反撃の順で、確定状態と一致する", () => {
  const initial = session().snapshot();
  const a = initial.battle.participants.find(
    (p) => p.owner === "player" && p.character.classId === "knight",
  )!;
  const d = initial.battle.participants.find(
    (p) => p.owner === "cpu" && p.character.classId === "knight",
  )!;
  a.hp = Math.min(30, stats(a.character).hp);
  a.coord = { q: 0, r: 0 };
  d.hp = Math.min(30, stats(d.character).hp);
  d.coord = { q: 1, r: 0 };
  initial.battle.map.hexes.find((h) => h.q === 0 && h.r === 0)!.terrain =
    "plain";
  // Use the canonical map's terrain: both relevant hexes are plain on this map.
  const terrain = maps.find((m) => m.id === initial.config.mapId)!;
  initial.battle.map = structuredClone(terrain);
  let fixture = initial.battle;
  for (
    let i = 0;
    i < 24 && fixture.currentActorId !== a.character.characterId;
    i++
  )
    fixture = applyBattleAction(
      fixture,
      { type: "pass" },
      fixture.activePlayer,
    );
  initial.battle = fixture;
  const game = CharacterSession.restore(initial);
  const result = game.act({
    type: "act",
    actorId: a.character.characterId,
    path: [],
    targetId: d.character.characterId,
  });
  const hits = result.frames.filter((f) => f.kind === "hit");
  expect(hits).toHaveLength(2);
  expect(hits[0].counter).toBe(false);
  expect(hits[1].counter).toBe(true);
  expect(
    hits[0].before.participants.find(
      (p) => p.character.characterId === a.character.characterId,
    )?.hp,
  ).toBe(a.hp);
  expect(
    hits[0].after.participants.find(
      (p) => p.character.characterId === a.character.characterId,
    )?.hp,
  ).toBe(a.hp);
  expect(
    hits[1].after.participants.find(
      (p) => p.character.characterId === a.character.characterId,
    )?.hp,
  ).toBe(
    result.observation.participants.find(
      (p) => p.character.characterId === a.character.characterId,
    )?.hp,
  );
});
