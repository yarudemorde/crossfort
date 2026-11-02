import { describe, it, expect } from "vitest";
import {
  createGame,
  applyAction,
  endTurn,
  exchangeHandCard,
  startTurn,
  replay,
  resolveCombat,
} from "../../src/game/engine";
import {
  defaultDeck,
  defaultConfig,
  validateDeck,
  validateConfig,
} from "../../src/game/data";
import {
  calculateEffectivePower,
  calculateMovement,
  calculateTerritory,
  calculateVisibleHexes,
  powerOf,
  stats,
} from "../../src/game/rules/board";
import { getObservation } from "../../src/game/selectors/observation";
import { getLegalActions } from "../../src/game/selectors/legal";
import { hexId, hexDistance } from "../../src/game/rules/hex";
import { add, fixture, terrain, refresh } from "../helpers";
import type { Coord, Terrain } from "../../src/game/types";

describe("A デッキ・資源・循環", () => {
  it("D01–03 16枚16種だけ開始し、3枚→2枚の順で引く", () => {
    expect(validateDeck(defaultDeck)).toBeUndefined();
    for (const d of [
      defaultDeck.slice(1),
      [...defaultDeck, "x"],
      defaultDeck.map(() => defaultDeck[0]),
    ])
      expect(() => createGame(1, "crossing", d)).toThrow();
    const s = createGame(1, "crossing");
    expect([
      s.players.player.hand.length,
      s.players.player.resourceCards.length,
      s.players.player.deck.length,
    ]).toEqual([3, 2, 11]);
  });
  it.each([0, 1, 2, 3])(
    "D04–07,L15 ランドマーク%s基だけを資源に数える",
    (n) => {
      const s = fixture();
      for (let i = 0; i < n; i++)
        add(s, `l${i}`, "player", { q: i, r: -2 }, 10, "landmark_basic");
      s.players.player.deck.push(
        ...s.players.player.hand,
        ...s.players.player.resourceCards,
      );
      s.players.player.hand = [];
      s.players.player.resourceCards = [];
      const next = startTurn(s, "player");
      expect(next.players.player.resourceCards).toHaveLength(
        Math.min(4, 2 + n),
      );
      expect(next.players.player.resourceTotal).toBe(
        next.players.player.resourceCards.reduce(
          (a, id) => a + next.config.cards[id].resource,
          0,
        ),
      );
    },
  );
  it("D07 公開資源1+3は4", () => {
    const s = fixture();
    s.players.player.deck = [
      "unit_cavalry",
      "unit_cavalry",
      "unit_cavalry",
      "unit_cavalry",
      "unit_militia",
    ];
    const next = startTurn(s, "player");
    expect(next.players.player.resourceTotal).toBe(4);
  });
  it("D08 資源不足は同一状態を返す", () => {
    const s = fixture();
    s.players.player.hand = ["unit_archers"];
    s.players.player.resourceRemaining = 2;
    const r = applyAction(s, {
      type: "play",
      cardId: "unit_archers",
      coord: { q: -3, r: 0 },
    });
    expect(r.error).toContain("資源不足");
    expect(r.state).toBe(s);
  });
  it("D09–12 交換1回、残り山札の順を保持して回収束だけを末尾へ", () => {
    const s = fixture();
    const id = s.players.player.hand[0],
      top = s.players.player.deck[0];
    const r = exchangeHandCard(s, "player", id);
    expect(r.state.players.player.deck.at(-1)).toBe(id);
    expect(r.state.players.player.hand).toContain(top);
    expect(exchangeHandCard(r.state, "player", top).error).toBeTruthy();
    const prefix = [...r.state.players.player.deck];
    const e = endTurn(r.state, "player").state.players.player;
    expect(e.deck.slice(0, prefix.length)).toEqual(prefix);
    expect(e.deck.filter((c) => c === id)).toHaveLength(1);
    expect(e.deck).toHaveLength(16);
    expect(e.hand).toHaveLength(0);
  });
  it("D13,A03 不変条件とリプレイ決定性", () => {
    let s = createGame(7, "crossing");
    for (let i = 0; i < 20; i++) {
      s = applyAction(s, { type: "endTurn" }).state;
      for (const p of Object.values(s.players))
        expect(
          new Set([...p.deck, ...p.hand, ...p.playedCards, ...p.resourceCards])
            .size,
        ).toBe(16);
    }
    expect(replay(7, "crossing", s.commands)).toEqual(s);
  });
  it("D14–15 カード循環から独立した複数インスタンス", () => {
    let s = fixture();
    s.players.player.hand = ["unit_militia"];
    s.players.player.resourceRemaining = 10;
    s = applyAction(s, {
      type: "play",
      cardId: "unit_militia",
      coord: { q: -3, r: 0 },
    }).state;
    const first = s.pieces.at(-1)!;
    s = applyAction(s, { type: "endTurn" }).state;
    s = applyAction(s, { type: "endTurn" }).state;
    expect(s.pieces).toContainEqual({ ...first, actedThisTurn: false });
    s.players.player.hand = ["unit_militia"];
    s.players.player.resourceRemaining = 10;
    s = applyAction(s, {
      type: "play",
      cardId: "unit_militia",
      coord: { q: -3, r: -1 },
    }).state;
    const duplicates = s.pieces.filter(
      (p) => p.definitionId === "unit_militia",
    );
    expect(duplicates).toHaveLength(2);
    expect(new Set(duplicates.map((p) => p.instanceId)).size).toBe(2);
  });
  it("定義データの不正な効果・数値を拒否", () => {
    const c = structuredClone(defaultConfig);
    c.cards.unit_militia.resource = 4;
    expect(() => validateConfig(c)).toThrow();
  });
});

describe("B 配置・移動", () => {
  it("M01–03 本城/ランドマーク隣接だけに配置", () => {
    const s = fixture();
    s.players.player.hand = ["unit_militia"];
    s.players.player.resourceRemaining = 10;
    expect(
      applyAction(s, {
        type: "play",
        cardId: "unit_militia",
        coord: { q: -3, r: 0 },
      }).error,
    ).toBeUndefined();
    expect(
      applyAction(s, {
        type: "play",
        cardId: "unit_militia",
        coord: { q: -2, r: 0 },
      }).error,
    ).toBeTruthy();
    add(s, "base", "player", { q: 0, r: 0 }, 10, "landmark_basic");
    expect(
      applyAction(s, {
        type: "play",
        cardId: "unit_militia",
        coord: { q: 1, r: 0 },
      }).error,
    ).toBeUndefined();
  });
  it("M04–06,L12–13 配置ターン不可、次ターン可、二重行動不可", () => {
    let s = fixture();
    const p = add(s, "u", "player", { q: 0, r: 0 });
    p.summonedOnOwnTurn = 2;
    terrain(s, p.coord, "plain");
    const action = {
      type: "act" as const,
      pieceId: "u",
      path: [{ q: 1, r: 0 }],
    };
    expect(applyAction(s, action).error).toContain("配置");
    s = startTurn(s, "player");
    s = applyAction(s, action).state;
    expect(s.pieces.find((p) => p.instanceId === "u")!.coord).toEqual({
      q: 1,
      r: 0,
    });
    expect(
      applyAction(s, { ...action, path: [{ q: 2, r: 0 }] }).error,
    ).toContain("行動済み");
  });
  it.each([
    ["mountain", 2, 1],
    ["swamp", 2, 1],
    ["river", 3, 1],
    ["plain", 2, 2],
    ["forest", 3, 3],
    ["desert", 2, 2],
  ] as [Terrain, number, number][])(
    "M07–10 %s 移動%s→%s",
    (t, base, expected) => {
      expect(calculateMovement(base, t, defaultConfig)).toBe(expected);
      expect(calculateMovement(0, t, defaultConfig)).toBe(0);
    },
  );
  it("M11–13 味方通過可、停止不可、味方施設と同居可", () => {
    const s = fixture();
    add(s, "u", "player", { q: 0, r: 0 });
    add(s, "ally", "player", { q: 1, r: 0 });
    terrain(s, { q: 0, r: 0 }, "plain");
    expect(
      applyAction(s, { type: "act", pieceId: "u", path: [{ q: 1, r: 0 }] })
        .error,
    ).toBeTruthy();
    add(s, "base", "player", { q: 2, r: 0 }, 10, "landmark_basic");
    expect(
      applyAction(s, {
        type: "act",
        pieceId: "u",
        path: [
          { q: 1, r: 0 },
          { q: 2, r: 0 },
        ],
      }).error,
    ).toBeUndefined();
  });
  it("M12 可視の敵は通過不可・状態不変", () => {
    const s = fixture();
    add(s, "u", "player", { q: 0, r: 0 });
    add(s, "e", "cpu", { q: 1, r: 0 });
    expect(
      applyAction(s, { type: "act", pieceId: "u", path: [{ q: 1, r: 0 }] })
        .state,
    ).toBe(s);
  });
  it("M14–15 移動→攻撃は1行動、攻撃後移動不可", () => {
    const s = fixture();
    add(s, "u", "player", { q: 0, r: 0 }, 7);
    add(s, "e", "cpu", { q: 2, r: 0 }, 2);
    add(s, "vision", "player", { q: 1, r: -1 });
    terrain(s, { q: 0, r: 0 }, "plain");
    const r = applyAction(s, {
      type: "act",
      pieceId: "u",
      path: [{ q: 1, r: 0 }],
      targetId: "e",
    });
    expect(r.error).toBeUndefined();
    expect(r.state.pieces.some((p) => p.instanceId === "e")).toBe(false);
    expect(
      applyAction(r.state, {
        type: "act",
        pieceId: "u",
        path: [{ q: 0, r: 0 }],
      }).error,
    ).toContain("行動済み");
  });
  it("M16 隠れた敵の前で停止、行動消費、発見", () => {
    const s = fixture();
    add(s, "u", "player", { q: -1, r: 0 }, 4, "unit_cavalry");
    terrain(s, { q: -1, r: 0 }, "plain");
    add(s, "e", "cpu", { q: 2, r: 0 });
    expect(
      getObservation(s, "player").pieces.some((p) => p.instanceId === "e"),
    ).toBe(false);
    const r = applyAction(s, {
      type: "act",
      pieceId: "u",
      path: [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 2, r: 0 },
      ],
    });
    expect(r.error).toBeUndefined();
    expect(r.state.pieces.find((p) => p.instanceId === "u")!.coord).toEqual({
      q: 1,
      r: 0,
    });
    expect(r.events.some((e) => e.type === "discovery")).toBe(true);
    expect(
      r.state.pieces.find((p) => p.instanceId === "u")!.actedThisTurn,
    ).toBe(true);
  });
});

describe("C 戦闘とスペル", () => {
  it.each([
    ["plain", 4, 6, 2, 2],
    ["forest", 3, 5, 0, 2],
    ["mountain", 3, 5, 0, 2],
    ["plain", 5, 4, 5, 0],
    ["forest", 5, 3, 5, 0],
  ] as [Terrain, number, number, number, number][])(
    "B01–02,05–07 %s %s vs %s",
    (t, a, b, remainingA, remainingB) => {
      const s = fixture();
      add(s, "a", "player", { q: 0, r: 0 }, a);
      add(s, "b", "cpu", { q: 1, r: 0 }, b);
      terrain(s, { q: 0, r: 0 }, "plain");
      terrain(s, { q: 1, r: 0 }, t);
      const r = resolveCombat(s, "a", "b");
      expect(r.error).toBeUndefined();
      expect(
        r.state.pieces.find((p) => p.instanceId === "a")
          ? powerOf(
              r.state,
              r.state.pieces.find((p) => p.instanceId === "a")!,
            )
          : 0,
      ).toBe(remainingA);
      expect(
        r.state.pieces.find((p) => p.instanceId === "b")
          ? powerOf(
              r.state,
              r.state.pieces.find((p) => p.instanceId === "b")!,
            )
          : 0,
      ).toBe(remainingB);
    },
  );
  it("B03–04 遠距離攻撃、射程外拒否、反撃射程", () => {
    const s = fixture();
    add(s, "a", "player", { q: 0, r: 0 }, 3, "unit_archers");
    add(s, "b", "cpu", { q: 2, r: 0 }, 6);
    terrain(s, { q: 0, r: 0 }, "plain");
    terrain(s, { q: 2, r: 0 }, "plain");
    const r = resolveCombat(s, "a", "b");
    expect(r.error).toBeUndefined();
    expect(r.events.some((e) => e.type === "counter")).toBe(false);
    s.pieces.find((p) => p.instanceId === "a")!.definitionId = "unit_infantry";
    add(s, "v", "player", { q: 1, r: -1 });
    expect(resolveCombat(s, "a", "b").state).toBe(s);
  });
  it("B08–10 砂漠の補正と致死判定", () => {
    const s = fixture();
    const p = add(s, "a", "player", { q: 0, r: 0 }, 4);
    p.accumulatedDamage = 1;
    expect(calculateEffectivePower(p, "desert", s.config)).toBe(2);
    expect(calculateEffectivePower(p, "plain", s.config)).toBe(3);
    terrain(s, p.coord, "desert");
    s.players.player.hand = ["spell_damage"];
    s.players.player.resourceRemaining = 4;
    s.activePlayer = "cpu";
    s.players.cpu.hand = ["spell_damage"];
    s.players.cpu.resourceRemaining = 4;
    add(s, "v", "cpu", { q: 1, r: 0 });
    expect(
      applyAction(s, {
        type: "play",
        cardId: "spell_damage",
        targetId: "a",
      }).state.pieces.some((x) => x.instanceId === "a"),
    ).toBe(false);
  });
  it("B11 受動反撃は行動数を消費しない", () => {
    const s = fixture();
    add(s, "a", "player", { q: 0, r: 0 }, 2);
    add(s, "b", "cpu", { q: 1, r: 0 }, 10);
    terrain(s, { q: 0, r: 0 }, "plain");
    terrain(s, { q: 1, r: 0 }, "plain");
    const r = resolveCombat(s, "a", "b");
    expect(
      r.state.pieces.find((p) => p.instanceId === "b")!.actedThisTurn,
    ).toBe(false);
  });
  it("B12 同居駒の対象指定とB15持続ダメージ", () => {
    const s = fixture();
    add(s, "a", "player", { q: 0, r: 0 }, 3);
    add(s, "b", "cpu", { q: 1, r: 0 }, 10, "landmark_basic");
    add(s, "c", "cpu", { q: 1, r: 0 }, 2);
    terrain(s, { q: 1, r: 0 }, "plain");
    terrain(s, { q: 0, r: 0 }, "plain");
    const r = resolveCombat(s, "a", "c");
    expect(
      r.state.pieces.find((p) => p.instanceId === "b")!.accumulatedDamage,
    ).toBe(0);
    const next = startTurn(resolveCombat(s, "a", "b").state, "cpu");
    expect(
      next.pieces.find((p) => p.instanceId === "b")!.accumulatedDamage,
    ).toBe(3);
  });
  it("B14 本城破壊直後勝利、以降操作不可", () => {
    const s = fixture();
    add(s, "a", "player", { q: 3, r: 0 }, 20);
    terrain(s, { q: 3, r: 0 }, "plain");
    const r = resolveCombat(s, "a", "hq_cpu");
    expect(r.state.outcome?.winner).toBe("player");
    expect(applyAction(r.state, { type: "endTurn" }).state).toBe(r.state);
  });
  it("回復上限・強化終了時死亡・効果ダメージは反撃なし", () => {
    const s = fixture();
    const p = add(s, "a", "player", { q: 0, r: 0 }, 4);
    p.accumulatedDamage = 1;
    s.players.player.hand = ["spell_heal", "spell_boost"];
    s.players.player.resourceRemaining = 10;
    const healed = applyAction(s, {
      type: "play",
      cardId: "spell_heal",
      targetId: "a",
    });
    expect(
      healed.state.pieces.find((p) => p.instanceId === "a")!.accumulatedDamage,
    ).toBe(0);
    const boosted = applyAction(healed.state, {
      type: "play",
      cardId: "spell_boost",
      targetId: "a",
    }).state;
    boosted.pieces.find((p) => p.instanceId === "a")!.accumulatedDamage = 4;
    expect(
      endTurn(boosted, "player").state.pieces.some((p) => p.instanceId === "a"),
    ).toBe(false);
  });
});

describe("D 視野・非公開情報", () => {
  it.each([
    ["unit_infantry", 7],
    ["unit_archers", 19],
  ] as const)("V01–02 %s の視野 %s", (id, count) => {
    const s = fixture();
    s.pieces = [];
    add(s, "v", "player", { q: 0, r: 0 }, 4, id);
    expect(calculateVisibleHexes(s, "player")).toHaveLength(count);
  });
  it("V03–04 通過点の探索は永続、V07両軍独立", () => {
    const s = fixture();
    add(s, "u", "player", { q: -1, r: 0 }, 4, "unit_cavalry");
    terrain(s, { q: -1, r: 0 }, "plain");
    const before = [...s.players.cpu.exploredHexIds];
    const r = applyAction(s, {
      type: "act",
      pieceId: "u",
      path: [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
        { q: 2, r: 0 },
      ],
    }).state;
    expect(r.players.player.exploredHexIds).toContain("0,-1");
    expect(r.players.cpu.exploredHexIds).toEqual(before);
    expect(
      getObservation(r, "player").hexes.find((h) => hexId(h) === "0,-1")
        ?.terrain,
    ).toBeDefined();
  });
  it("V05–08,B13 UI/CPU/合法候補/ログに隠れた駒・地形・手札がない", () => {
    const s = fixture();
    add(s, "secret", "cpu", { q: 2, r: 1 }, 4, "landmark_fort");
    s.players.player.exploredHexIds.push("2,1");
    const o = getObservation(s, "player");
    expect(o.pieces.some((p) => p.instanceId === "secret")).toBe(false);
    expect(o.hexes.find((h) => hexId(h) === "2,1")!.territory).toBeUndefined();
    expect(
      o.hexes.filter((h) => !h.explored).every((h) => h.terrain === undefined),
    ).toBe(true);
    expect("hand" in o.opponent).toBe(false);
    expect(
      getLegalActions(o, s.config).some(
        (a) => "targetId" in a && a.targetId === "secret",
      ),
    ).toBe(false);
    expect(resolveCombat(s, "hq_player", "secret").state).toBe(s);
  });
  it("V09–10 味方共有視野、地形は遮らない", () => {
    const s = fixture();
    add(s, "a", "player", { q: 0, r: 0 }, 4, "unit_archers");
    add(s, "v", "player", { q: 1, r: 0 });
    add(s, "e", "cpu", { q: 2, r: 0 });
    terrain(s, { q: 1, r: 0 }, "mountain");
    expect(resolveCombat(s, "a", "e").error).toBeUndefined();
  });
  it("revealは地形探索のみで持続視野や敵ピンを作らない", () => {
    const s = fixture();
    add(s, "a", "player", { q: 0, r: 0 });
    add(s, "secret", "cpu", { q: 3, r: 0 });
    s.players.player.hand = ["spell_reveal"];
    s.players.player.resourceRemaining = 3;
    const r = applyAction(s, {
      type: "play",
      cardId: "spell_reveal",
      coord: { q: 1, r: 0 },
    }).state;
    const o = getObservation(r, "player");
    expect(o.hexes.find((h) => hexId(h) === "3,0")!.explored).toBe(true);
    expect(o.pieces.some((p) => p.instanceId === "secret")).toBe(false);
  });
});

describe("E ランドマーク・領土", () => {
  it.each([
    ["neutral", { q: 1, r: 0 }],
    ["friendly", { q: -3, r: 0 }],
  ] as [string, Coord][])("L01–02 %sへ建設可", (_, coord) => {
    const s = fixture();
    add(s, "u", "player", { q: coord.q - 1, r: coord.r });
    s.players.player.hand = ["landmark_basic"];
    s.players.player.resourceRemaining = 10;
    expect(
      applyAction(s, { type: "play", cardId: "landmark_basic", coord }).error,
    ).toBeUndefined();
  });
  it("L03–04 敵領土/距離2建設不可", () => {
    const s = fixture();
    add(s, "u", "player", { q: 2, r: 0 });
    s.players.player.hand = ["landmark_basic"];
    s.players.player.resourceRemaining = 10;
    expect(
      applyAction(s, {
        type: "play",
        cardId: "landmark_basic",
        coord: { q: 3, r: 0 },
      }).error,
    ).toContain("敵領土");
    expect(
      applyAction(s, {
        type: "play",
        cardId: "landmark_basic",
        coord: { q: 0, r: 0 },
      }).error,
    ).toBeTruthy();
  });
  it.each([
    ["landmark_basic", 7],
    ["landmark_fort", 19],
  ] as const)("L05–06 %sの本来領土%s", (id, n) => {
    const s = fixture();
    s.pieces = [];
    add(s, "base", "player", { q: 0, r: 0 }, 10, id);
    expect(
      Object.values(calculateTerritory(s)).filter((x) => x === "player"),
    ).toHaveLength(n);
  });
  it("L07–10 配置順優先、破壊後再拡張、視野と射程独立", () => {
    const s = fixture();
    s.pieces = [];
    const a = add(s, "a", "player", { q: 0, r: 0 }, 10, "landmark_basic");
    const b = add(s, "b", "cpu", { q: 2, r: 0 }, 7, "landmark_fort");
    expect(calculateTerritory(s)["1,0"]).toBe("player");
    expect(stats(s, b)).toMatchObject({ vision: 2, range: 2 });
    expect(calculateVisibleHexes(s, "cpu")).toContain("0,0");
    s.pieces = s.pieces.filter((x) => x !== a);
    expect(calculateTerritory(s)["1,0"]).toBe("cpu");
  });
  it("L11 射程内侵入だけで自動攻撃しない", () => {
    const s = fixture();
    add(s, "u", "player", { q: 0, r: 0 });
    add(s, "e", "cpu", { q: 2, r: 0 }, 10, "landmark_basic");
    terrain(s, { q: 0, r: 0 }, "plain");
    const r = applyAction(s, {
      type: "act",
      pieceId: "u",
      path: [{ q: 1, r: 0 }],
    });
    expect(
      r.state.pieces.find((p) => p.instanceId === "u")!.accumulatedDamage,
    ).toBe(0);
  });
  it("L13 新施設も反撃、L14破壊後の資源減少", () => {
    const s = fixture();
    const l = add(s, "base", "cpu", { q: 1, r: 0 }, 10, "landmark_basic");
    l.summonedOnOwnTurn = 2;
    l.actedThisTurn = true;
    add(s, "a", "player", { q: 0, r: 0 }, 2);
    terrain(s, { q: 0, r: 0 }, "plain");
    terrain(s, { q: 1, r: 0 }, "plain");
    expect(
      resolveCombat(s, "a", "base").events.some((e) => e.type === "counter"),
    ).toBe(true);
    s.pieces = s.pieces.filter((p) => p.instanceId !== "base");
    refresh(s);
    expect(startTurn(s, "cpu").players.cpu.resourceCards).toHaveLength(2);
  });
  it("61マス×2、すべての本城距離8", () => {
    for (const m of Object.values(defaultConfig.maps)) {
      expect(m.hexes).toHaveLength(61);
      expect(new Set(m.hexes.map(hexId)).size).toBe(61);
      expect(hexDistance(m.headquarters.player, m.headquarters.cpu)).toBe(8);
    }
  });
});
