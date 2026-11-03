import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import golden from "../fixtures/pre-animation-replays.json";
import { createGame } from "../../src/game/engine";
import { applyObservedAction } from "../../src/app/visualFrames";
import { getObservation } from "../../src/game/selectors/observation";
import { getLegalActions } from "../../src/game/selectors/legal";
import { chooseCpuAction } from "../../src/game/cpu/ai";
import type { Owner } from "../../src/game/types";
import { defaultConfig } from "../../src/game/data";
// Historical fixtures include the complete config in their hash. Keep the
// original two maps and cap 4 here; the new cap 5 is tested with current rules.
const legacyConfig = structuredClone(defaultConfig);
legacyConfig.maps = Object.fromEntries(
  Object.entries(legacyConfig.maps).filter(([, map]) => map.radius === 4),
);
legacyConfig.rules.resources.publicCardCap = 4;
describe("旧設定（中サイズ・資源上限4）の完全リプレイと一致", () => {
  for (const test of golden)
    it(`${test.mapId}/${test.first}：操作数・勝者・状態のSHA256が同一`, () => {
      let state = createGame(
        test.seed,
        test.mapId,
        undefined,
        undefined,
        test.first as Owner,
        legacyConfig,
      );
      let frameCount = 0;
      for (let i = 0; i < 1500 && !state.outcome; i++) {
        const o = getObservation(state, state.activePlayer);
        const action = chooseCpuAction(
          o,
          getLegalActions(o, state.config),
          state.seed + state.commands.length,
          state.config,
        );
        const result = applyObservedAction(state, action, state.activePlayer);
        expect(result.error).toBeUndefined();
        frameCount += result.frames.length;
        state = result.state;
      }
      expect(frameCount).toBeGreaterThan(0);
      expect(state.commands).toHaveLength(test.actions);
      expect(state.outcome?.winner).toBe(test.winner);
      expect(
        createHash("sha256").update(JSON.stringify(state)).digest("hex"),
      ).toBe(test.sha256);
    }, 20000);
});
