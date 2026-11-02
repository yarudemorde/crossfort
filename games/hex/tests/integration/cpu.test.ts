import { describe, it, expect } from "vitest";
import { createGame, applyAction, replay } from "../../src/game/engine";
import { getObservation } from "../../src/game/selectors/observation";
import { getLegalActions } from "../../src/game/selectors/legal";
import { chooseCpuAction } from "../../src/game/cpu/ai";
import { add, fixture, terrain } from "../helpers";
import type { Owner } from "../../src/game/types";

describe("CPUと最後までの対戦", () => {
  it("A02 敵本城を破壊できる攻撃を最優先する", () => {
    const s = fixture();
    add(s, "attacker", "player", { q: 3, r: 0 }, 20);
    terrain(s, { q: 3, r: 0 }, "plain");
    const o = getObservation(s, "player");
    const action = chooseCpuAction(
      o,
      getLegalActions(o, s.config),
      99,
      s.config,
    );
    expect(action.type).toBe("act");
    expect("targetId" in action && action.targetId).toBe("hq_cpu");
  });
  it("観測上同じなら、隠れた敵の位置によらず同じ候補と判断になる", () => {
    const s = fixture();
    add(s, "secret", "cpu", { q: 3, r: 0 }, 4);
    const a = getObservation(s, "player");
    const other = structuredClone(s);
    other.pieces.find((p) => p.instanceId === "secret")!.coord = {
      q: 3,
      r: -3,
    };
    const b = getObservation(other, "player");
    expect(a).toEqual(b);
    expect("deck" in a.self).toBe(false);
    expect(
      chooseCpuAction(a, getLegalActions(a, s.config), 42, s.config),
    ).toEqual(chooseCpuAction(b, getLegalActions(b, s.config), 42, s.config));
  });
  for (const mapId of ["crossing", "highlands"])
    for (const first of ["player", "cpu"] as Owner[])
      it(`A01,A03 ${mapId} ${first}先攻、合法手で本城破壊まで完走`, () => {
        let s = createGame(1102, mapId, undefined, undefined, first);
        let turns = 0;
        for (let i = 0; i < 1500 && !s.outcome; i++) {
          const o = getObservation(s, s.activePlayer);
          const legal = getLegalActions(o, s.config);
          const action = chooseCpuAction(
            o,
            legal,
            s.seed + s.commands.length,
            s.config,
          );
          expect(legal).toContainEqual(action);
          const r = applyAction(s, action);
          expect(r.error).toBeUndefined();
          s = r.state;
          if (action.type === "endTurn") turns++;
          for (const p of Object.values(s.players)) {
            expect(
              p.deck.length +
                p.hand.length +
                p.resourceCards.length +
                p.playedCards.length,
            ).toBe(16);
            expect(p.resourceRemaining).toBeGreaterThanOrEqual(0);
          }
          expect(
            new Set(
              s.pieces
                .filter((p) => p.kind === "unit")
                .map((p) => `${p.owner}/${p.coord.q}/${p.coord.r}`),
            ).size,
          ).toBe(s.pieces.filter((p) => p.kind === "unit").length);
        }
        expect(s.outcome).toBeDefined();
        expect(s.phase).toBe("finished");
        expect(turns).toBeLessThan(150);
        expect(replay(1102, mapId, s.commands, first)).toEqual(s);
        console.info(
          `${mapId}, first=${first}: ${s.commands.length} actions / ${turns} turns / winner=${s.outcome?.winner}`,
        );
      });
});
