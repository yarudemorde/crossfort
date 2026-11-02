import { describe, it, expect } from "vitest";
import { applyAction } from "../../src/game/engine";
import { applyObservedAction } from "../../src/app/visualFrames";
import { getObservation } from "../../src/game/selectors/observation";
import { hexDistance, sameHex } from "../../src/game/rules/hex";
import { add, fixture, terrain, refresh } from "../helpers";
const c = (q: number, r = 0) => ({ q, r });
function plains(s: ReturnType<typeof fixture>) {
  for (const h of s.config.maps[s.mapId].hexes) h.terrain = "plain";
  refresh(s);
}
describe("構造化された演出と公開範囲", () => {
  it("3マス移動は隣接する3フレーム、各到着時に探索と発見を更新", () => {
    const s = fixture();
    plains(s);
    add(s, "scout", "player", c(-3), 2, "unit_scout");
    add(s, "enemy", "cpu", c(1));
    const r = applyObservedAction(
      s,
      { type: "act", pieceId: "scout", path: [c(-2), c(-1), c(0)] },
      "player",
    );
    expect(r.error).toBeUndefined();
    const moves = r.frames.filter((f) => f.kind === "move");
    expect(moves).toHaveLength(3);
    expect(
      getObservation(s, "player").pieces.some((p) => p.instanceId === "enemy"),
    ).toBe(false);
    for (const [i, f] of moves.entries()) {
      expect(hexDistance(f.from, f.to)).toBe(1);
      expect(
        f.after.pieces.find((p) => p.instanceId === "scout")?.coord,
      ).toEqual(c(i - 2));
      expect(f.after.pieces.some((p) => p.instanceId === "enemy")).toBe(true);
      const old = f.before.hexes.filter((h) => h.explored);
      expect(
        old.every((h) =>
          f.after.hexes.some((n) => sameHex(h, n) && n.explored),
        ),
      ).toBe(true);
    }
    expect(r.state).toEqual(
      applyAction(s, {
        type: "act",
        pieceId: "scout",
        path: [c(-2), c(-1), c(0)],
      }).state,
    );
  });
  it("視野外だけのCPU移動はフレームも駒IDも送らない", () => {
    const s = fixture();
    plains(s);
    s.activePlayer = "cpu";
    add(s, "SECRET_CPU", "cpu", c(3, -2));
    const r = applyObservedAction(
      s,
      { type: "act", pieceId: "SECRET_CPU", path: [c(2, -2)] },
      "cpu",
    );
    expect(r.error).toBeUndefined();
    expect(r.frames).toEqual([]);
    expect(JSON.stringify(r.frames)).not.toContain("SECRET_CPU");
  });
  it("視野への出入りは公開境界だけ、非公開の経路と終点を渡さない", () => {
    const s = fixture();
    plains(s);
    s.activePlayer = "cpu";
    add(s, "observer", "player", c(0));
    add(s, "crossing", "cpu", c(2, -1), 5, "unit_cavalry");
    const r = applyObservedAction(
      s,
      { type: "act", pieceId: "crossing", path: [c(1, -1), c(1), c(2)] },
      "cpu",
    );
    expect(r.error).toBeUndefined();
    expect(r.frames.map((f) => f.kind)).toEqual(["appear", "move", "vanish"]);
    expect(r.frames[0]).not.toHaveProperty("from");
    expect(r.frames[2]).not.toHaveProperty("to");
    for (const f of r.frames)
      for (const view of [f.before, f.after]) {
        for (const p of view.pieces.filter((p) => p.owner === "cpu"))
          expect(view.hexes.some((h) => h.visible && sameHex(h, p.coord))).toBe(
            true,
          );
        for (const h of view.hexes.filter((h) => !h.explored))
          expect(h.terrain).toBeUndefined();
        expect(view).not.toHaveProperty("opponent");
        expect(view).not.toHaveProperty("self");
      }
  });
  it("攻撃と反撃は別々の命中フレーム、6→2と4→2を順に渡す", () => {
    const s = fixture();
    plains(s);
    add(s, "a", "player", c(0), 4);
    add(s, "t", "cpu", c(1), 6);
    const r = applyObservedAction(
      s,
      { type: "act", pieceId: "a", path: [], targetId: "t" },
      "player",
    );
    const hits = r.frames.filter((f) => f.kind === "hit");
    expect(
      hits.map((f) => [
        f.mode,
        f.sourceId,
        f.targetId,
        f.amount,
        f.powerBefore,
        f.powerAfter,
      ]),
    ).toEqual([
      ["attack", "a", "t", 4, 6, 2],
      ["counter", "t", "a", 2, 4, 2],
    ]);
    expect(hits[0].after.pieces.find((p) => p.instanceId === "a")?.power).toBe(
      4,
    );
    expect(hits[1].before.pieces.find((p) => p.instanceId === "t")?.power).toBe(
      2,
    );
    expect(r.state).toEqual(
      applyAction(s, { type: "act", pieceId: "a", path: [], targetId: "t" })
        .state,
    );
  });
  it("森林の反撃ボーナスを含む計算済みダメージを使用する", () => {
    const s = fixture();
    plains(s);
    add(s, "a", "player", c(0), 4);
    add(s, "t", "cpu", c(1), 6);
    terrain(s, c(1), "forest");
    const r = applyObservedAction(
      s,
      { type: "act", pieceId: "a", path: [], targetId: "t" },
      "player",
    );
    const counter = r.frames.find(
      (f) => f.kind === "hit" && f.mode === "counter",
    );
    expect(counter?.kind === "hit" && counter.amount).toBe(3);
    expect(counter?.kind === "hit" && counter.powerAfter).toBe(1);
  });
  it("致死ダメージ→0表示→破壊→領土更新の順、反撃なし", () => {
    const s = fixture();
    plains(s);
    add(s, "a", "player", c(0), 8);
    add(s, "tower", "cpu", c(1), 2, "landmark_basic");
    const r = applyObservedAction(
      s,
      { type: "act", pieceId: "a", path: [], targetId: "tower" },
      "player",
    );
    const hit = r.frames.findIndex((f) => f.kind === "hit"),
      death = r.frames.findIndex((f) => f.kind === "destroy"),
      territory = r.frames.findIndex((f) => f.kind === "territory");
    expect(hit).toBeLessThan(death);
    expect(death).toBeLessThan(territory);
    expect(
      r.frames[hit].after.pieces.find((p) => p.instanceId === "tower")?.power,
    ).toBe(0);
    expect(
      r.frames[death].before.pieces.some((p) => p.instanceId === "tower"),
    ).toBe(true);
    expect(
      r.frames[death].after.pieces.some((p) => p.instanceId === "tower"),
    ).toBe(false);
    expect(
      r.frames[death].after.hexes.find((h) => sameHex(h, c(1)))?.territory,
    ).toBe("cpu");
    expect(
      r.frames[territory].after.hexes.find((h) => sameHex(h, c(1)))?.territory,
    ).toBeNull();
    expect(r.frames.filter((f) => f.kind === "hit")).toHaveLength(1);
  });
  it("見えない射手からの被弾で発射元IDや射程を漏らさない", () => {
    const s = fixture();
    plains(s);
    s.activePlayer = "cpu";
    add(s, "target", "player", c(0), 6);
    add(s, "SECRET_ARCHER", "cpu", c(2), 3, "unit_archers");
    const r = applyObservedAction(
      s,
      { type: "act", pieceId: "SECRET_ARCHER", path: [], targetId: "target" },
      "cpu",
    );
    const hit = r.frames.find((f) => f.kind === "hit");
    expect(hit?.kind).toBe("hit");
    expect(hit).not.toHaveProperty("sourceId");
    expect(hit).not.toHaveProperty("sourceRange");
    expect(JSON.stringify(r.frames)).not.toContain("SECRET_ARCHER");
  });
  it("スペルは発射元を作らず、実回復量も構造化する", () => {
    const s = fixture();
    plains(s);
    const own = add(s, "own", "player", c(0), 4);
    own.accumulatedDamage = 2;
    add(s, "enemy", "cpu", c(1), 5);
    s.players.player.hand = ["spell_damage", "spell_heal"];
    s.players.player.resourceRemaining = 10;
    const attack = applyObservedAction(
      s,
      { type: "play", cardId: "spell_damage", targetId: "enemy" },
      "player",
    );
    const h = attack.frames.find((f) => f.kind === "hit");
    expect(
      h?.kind === "hit" && [h.mode, h.amount, h.powerBefore, h.powerAfter],
    ).toEqual(["spell", 2, 5, 3]);
    expect(h).not.toHaveProperty("sourceId");
    const heal = applyObservedAction(
      s,
      { type: "play", cardId: "spell_heal", targetId: "own" },
      "player",
    ).frames.find((f) => f.kind === "hit");
    expect(
      heal?.kind === "hit" && [
        heal.mode,
        heal.amount,
        heal.powerBefore,
        heal.powerAfter,
      ],
    ).toEqual(["heal", 2, 2, 4]);
  });
  it("探索スペルは地形のみ広げ、視野外の敵を追加しない", () => {
    const s = fixture();
    plains(s);
    add(s, "own", "player", c(0));
    add(s, "SECRET", "cpu", c(2));
    s.players.player.hand = ["spell_reveal"];
    s.players.player.resourceRemaining = 10;
    const r = applyObservedAction(
      s,
      { type: "play", cardId: "spell_reveal", coord: c(1) },
      "player",
    );
    expect(r.error).toBeUndefined();
    expect(r.frames.some((f) => f.kind === "reveal")).toBe(true);
    expect(JSON.stringify(r.frames)).not.toContain("SECRET");
  });
  it("途中まで記録しても不正な行動のフレームは破棄", () => {
    const s = fixture();
    plains(s);
    add(s, "a", "player", c(-3), 4);
    const before = structuredClone(s);
    const r = applyObservedAction(
      s,
      { type: "act", pieceId: "a", path: [c(-2)], targetId: "hq_cpu" },
      "player",
    );
    expect(r.error).toBeTruthy();
    expect(r.frames).toEqual([]);
    expect(r.state).toEqual(before);
  });
  it("観測者による変更や例外が権威状態に影響しない", () => {
    const s = fixture();
    plains(s);
    add(s, "a", "player", c(0));
    const action = { type: "act" as const, pieceId: "a", path: [c(1)] };
    const expected = applyAction(s, action);
    const actual = applyAction(s, action, "player", (draft) => {
      draft.pieces = [];
      draft.rngState = 0;
      throw Error("display only");
    });
    expect(actual).toEqual(expected);
  });
  it("不可視の敵に阻まれた戻りも隣接マスを逆順に通る", () => {
    const s = fixture();
    plains(s);
    s.config.cards.unit_scout.vision = 0;
    add(s, "a", "player", c(-3), 2, "unit_scout");
    add(s, "friend", "player", c(-2));
    add(s, "friend2", "player", c(-1));
    add(s, "hidden", "cpu", c(0));
    s.config.cards.unit_infantry.vision = 0;
    refresh(s);
    const r = applyObservedAction(
      s,
      { type: "act", pieceId: "a", path: [c(-2), c(-1), c(0)] },
      "player",
    );
    expect(r.error).toBeUndefined();
    const moves = r.frames.filter((f) => f.kind === "move");
    expect(moves.map((f) => f.to)).toEqual([c(-2), c(-1), c(-2), c(-3)]);
    expect(moves.every((f) => hexDistance(f.from, f.to) === 1)).toBe(true);
  });
});
