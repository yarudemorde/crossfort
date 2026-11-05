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
    expect(() => a.cpu()).toThrow();
    expect(() => a.move("unknown", [])).toThrow();
    expect(a.view()).toEqual(b.view());
    a.act({ type: "pass" });
    expect(() => a.act({ type: "pass" })).toThrow();
    const after = a.cpu();
    expect(
      after.observation.activePlayer === "player" || after.observation.outcome,
    ).toBeTruthy();
  });
});
