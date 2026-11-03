import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "../../src/app/protocol";
import { chooseCpuAction } from "../../src/game/cpu/ai";
import { defaultConfig, maps } from "../../src/game/data";

describe("画面と同じWorker境界で完走・再戦", () => {
  it.each(maps)(
    "$id：開始→交互行動→結果→同条件再戦、返す情報は人間の観測だけ",
    async (map) => {
      vi.resetModules();
      let received: Response | undefined;
      const scope: {
        onmessage?: (event: MessageEvent<Request>) => void;
        postMessage: (r: Response) => void;
      } = {
        postMessage: (r) => {
          received = r;
        },
      };
      Object.defineProperty(globalThis, "self", {
        value: scope,
        configurable: true,
      });
      await import("../../src/app/game.worker");
      const send = (data: Request) => {
        scope.onmessage!({ data } as MessageEvent<Request>);
        expect(received).toBeDefined();
        expect(received!.error).toBeUndefined();
        return received!;
      };
      const initial = send({
        type: "new",
        seed: 1102,
        mapId: map.id,
        first: "cpu",
      });
      expect(initial.cpuBusy).toBe(true);
      expect(initial.observation.radius).toBe(map.radius);
      expect(initial.observation.hexes).toHaveLength(map.hexes.length);
      expect(initial.legal).toHaveLength(0);
      let response = initial;
      let i = 0;
      while (!response.observation.outcome && i++ < 1500) {
        const o = response.observation;
        expect(o.owner).toBe("player");
        expect("hand" in o.opponent).toBe(false);
        expect("deck" in o.self).toBe(false);
        response =
          o.activePlayer === "cpu"
            ? send({ type: "cpu" })
            : send({
                type: "action",
                action: chooseCpuAction(
                  o,
                  response.legal,
                  o.seed + i,
                  defaultConfig,
                ),
              });
      }
      expect(response.observation.phase).toBe("finished");
      expect(response.legal).toHaveLength(0);
      expect(response.observation.outcome).toBeDefined();
      const next = send({
        type: "new",
        seed: 1102,
        mapId: map.id,
        first: "cpu",
      });
      expect(next.observation).toEqual(initial.observation);
      delete (globalThis as { self?: unknown }).self;
    },
    30000,
  );
});
