import { it, expect } from "vitest";
import { createGame, applyAction } from "../../src/game/engine";
import { getObservation } from "../../src/game/selectors/observation";
import { getLegalActions } from "../../src/game/selectors/legal";
import { chooseCpuAction } from "../../src/game/cpu/ai";
import { maps } from "../../src/game/data";
it.each(Array.from({ length: 12 }, (_, i) => i + 1))(
  "シード%s：全種類・サイズ・両手番の循環と完走",
  (seed) => {
    let s = createGame(
      seed,
      maps[(seed - 1) % maps.length].id,
      undefined,
      undefined,
      seed % 3 ? "player" : "cpu",
    );
    for (let i = 0; i < 1800 && !s.outcome; i++) {
      const o = getObservation(s, s.activePlayer);
      const config = { cards: s.config.cards, rules: s.config.rules };
      const action = chooseCpuAction(
        o,
        getLegalActions(o, config),
        s.seed + s.commands.length,
        config,
      );
      const r = applyAction(s, action);
      expect(r.error).toBeUndefined();
      s = r.state;
      for (const p of Object.values(s.players)) {
        expect(p.resourceRemaining).toBeGreaterThanOrEqual(0);
        expect(p.resourceCards.length).toBeLessThanOrEqual(5);
        expect(p.resourceTotal).toBeLessThanOrEqual(15);
        expect([
          ...p.deck,
          ...p.hand,
          ...p.resourceCards,
          ...p.playedCards,
        ]).toHaveLength(16);
      }
    }
    expect(
      s.outcome,
      `seed ${seed}, ${s.commands.length} actions`,
    ).toBeDefined();
  },
  30000,
);
