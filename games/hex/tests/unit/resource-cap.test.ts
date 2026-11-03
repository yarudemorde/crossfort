import { describe, expect, it } from "vitest";
import {
  createGame,
  applyAction,
  endTurn,
  resolveCombat,
  startTurn,
} from "../../src/game/engine";
import { defaultConfig, defaultDeck } from "../../src/game/data";
import { getObservation } from "../../src/game/selectors/observation";
import { getLegalActions } from "../../src/game/selectors/legal";
import { add, terrain } from "../helpers";
import type { GameState } from "../../src/game/types";

function withLandmarks(n: number) {
  const s = createGame(1103, "crossing");
  for (let i = 0; i < n; i++)
    add(
      s,
      `landmark_${i}`,
      "player",
      { q: i - 2, r: -1 },
      10,
      "landmark_basic",
    );
  return s;
}
function ready(s: GameState) {
  Object.assign(s.players.player, {
    deck: [...defaultDeck],
    hand: [],
    resourceCards: [],
    playedCards: [],
  });
  return startTurn(s, "player");
}
describe("公開資源上限5枚", () => {
  it.each([
    [0, 2],
    [1, 3],
    [2, 4],
    [3, 5],
    [4, 5],
    [5, 5],
  ])(
    "生存ランドマーク%s基で%s枚、本城と相手の施設は数えない",
    (n, expected) => {
      const s = withLandmarks(n);
      add(s, "enemy_landmark", "cpu", { q: 3, r: -1 }, 10, "landmark_basic");
      const p = ready(s).players.player;
      expect(p.hand).toHaveLength(3);
      expect(p.resourceCards).toHaveLength(expected);
      expect(p.resourceTotal).toBe(
        p.resourceCards.reduce(
          (total, id) => total + s.config.cards[id].resource,
          0,
        ),
      );
      expect(p.resourceRemaining).toBe(p.resourceTotal);
      expect(p.deck).toHaveLength(16 - 3 - expected);
    },
  );
  it("💎3のカード5枚の合計は15で、カードごとの上限3は変わらない", () => {
    const config = structuredClone(defaultConfig);
    for (const card of Object.values(config.cards)) card.resource = 3;
    const s = createGame(
      1103,
      "crossing",
      undefined,
      undefined,
      "player",
      config,
    );
    for (let i = 0; i < 4; i++)
      add(
        s,
        `landmark_${i}`,
        "player",
        { q: i - 2, r: -1 },
        10,
        "landmark_basic",
      );
    const p = ready(s).players.player;
    expect(p.resourceCards).toHaveLength(5);
    expect(p.resourceTotal).toBe(15);
    for (const c of Object.values(defaultConfig.cards))
      expect(c.resource).toBeGreaterThanOrEqual(1);
    for (const c of Object.values(defaultConfig.cards))
      expect(c.resource).toBeLessThanOrEqual(3);
  });
  it.each([
    [3, 4],
    [4, 5],
  ])("%s基から1基破壊後、次ターンは%s枚", (n, expected) => {
    let s = ready(withLandmarks(n));
    expect(s.players.player.resourceCards).toHaveLength(5);
    const target = s.pieces.find((p) => p.instanceId === "landmark_0")!;
    add(s, "siege", "cpu", { q: -2, r: 0 }, 20);
    terrain(s, { q: -2, r: 0 }, "plain");
    s = endTurn(s, "player").state;
    const attack = resolveCombat(s, "siege", target.instanceId);
    expect(attack.error).toBeUndefined();
    s = attack.state;
    expect(s.pieces.some((p) => p.instanceId === target.instanceId)).toBe(
      false,
    );
    // Previously revealed cards were recycled; the next reveal uses survivors.
    expect(s.players.player.resourceCards).toHaveLength(0);
    s = endTurn(s, "cpu").state;
    expect(s.players.player.resourceCards).toHaveLength(expected);
    expect(s.players.player.hand).toHaveLength(3);
  });
  it("5枚公開・カード使用後も回収束だけを混ぜ、16枚16種を循環", () => {
    let s = ready(withLandmarks(3));
    const legal = getLegalActions(getObservation(s, "player"), s.config);
    const play = legal.find(
      (a) => a.type === "play" && a.cardId.startsWith("unit_"),
    );
    expect(play).toBeDefined();
    const result = applyAction(s, play!);
    expect(result.error).toBeUndefined();
    s = result.state;
    const prefix = [...s.players.player.deck];
    s = endTurn(s, "player").state;
    expect(s.players.player.deck.slice(0, prefix.length)).toEqual(prefix);
    expect(s.players.player.deck).toHaveLength(16);
    for (let i = 0; i < 40; i++) {
      s = endTurn(s, s.activePlayer).state;
      for (const p of Object.values(s.players)) {
        const pile = [
          ...p.deck,
          ...p.hand,
          ...p.resourceCards,
          ...p.playedCards,
        ];
        expect(pile).toHaveLength(16);
        expect(new Set(pile).size).toBe(16);
        expect(p.resourceCards.length).toBeLessThanOrEqual(5);
        expect(p.resourceTotal).toBeLessThanOrEqual(15);
      }
      if (s.activePlayer === "player") {
        expect(s.players.player.hand).toHaveLength(3);
        expect(s.players.player.resourceCards).toHaveLength(5);
      }
    }
  });
});
