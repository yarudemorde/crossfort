import { it, expect } from "vitest";
import { applyAction, resolveCombat } from "../../src/game/engine";
import {
  calculateTerritory,
  updateExploration,
} from "../../src/game/rules/board";
import { getObservation } from "../../src/game/selectors/observation";
import { getLegalActions } from "../../src/game/selectors/legal";
import { add, fixture, terrain } from "../helpers";
it("L08 施設の撃破が即座に重複領土を再計算する", () => {
  const s = fixture();
  add(s, "first", "cpu", { q: 0, r: 0 }, 2, "landmark_basic");
  add(s, "second", "player", { q: 2, r: 0 }, 7, "landmark_fort");
  add(s, "attacker", "player", { q: 1, r: 0 }, 5);
  terrain(s, { q: 1, r: 0 }, "plain");
  s.territoryOwner = calculateTerritory(s);
  expect(s.territoryOwner["1,0"]).toBe("cpu");
  const r = resolveCombat(s, "attacker", "first");
  expect(r.error).toBeUndefined();
  expect(r.state.territoryOwner["1,0"]).toBe("player");
});
it("L12 施設も能動攻撃は1ターン1回", () => {
  const s = fixture();
  add(s, "fort", "player", { q: 0, r: 0 }, 10, "landmark_fort");
  add(s, "a", "cpu", { q: 1, r: 0 }, 2);
  add(s, "b", "cpu", { q: 0, r: 1 }, 2);
  const r = resolveCombat(s, "fort", "a");
  expect(r.error).toBeUndefined();
  expect(resolveCombat(r.state, "fort", "b").error).toContain("行動済み");
});
it("不正な移動後攻撃は、移動・探索・イベントも丸ごと取り消す", () => {
  const s = fixture();
  add(s, "u", "player", { q: 0, r: 0 }, 5);
  terrain(s, { q: 0, r: 0 }, "plain");
  const before = structuredClone(s);
  const r = applyAction(s, {
    type: "act",
    pieceId: "u",
    path: [{ q: 1, r: 0 }],
    targetId: "nonexistent",
  });
  expect(r.error).toBeTruthy();
  expect(r.state).toBe(s);
  expect(s).toEqual(before);
});
it("探索更新の公開APIは入力を変更しない", () => {
  const s = fixture();
  const before = structuredClone(s);
  const next = updateExploration(s, "player", [{ q: 4, r: -4 }]);
  expect(s).toEqual(before);
  expect(next.players.player.exploredHexIds).toContain("4,-4");
});
it("相手の手札・資源カードと双方の山札順を観測に含めない", () => {
  const s = fixture();
  const o = getObservation(s, "cpu");
  expect("hand" in o.opponent).toBe(false);
  expect("resourceCards" in o.opponent).toBe(false);
  expect("deck" in o.self).toBe(false);
  expect("config" in o).toBe(false);
});
it("合法手生成には全マップや隠れた地形を渡さない", () => {
  const s = fixture();
  const o = getObservation(s, "player");
  const decision = { cards: s.config.cards, rules: s.config.rules };
  expect(getLegalActions(o, decision).length).toBeGreaterThan(0);
});
