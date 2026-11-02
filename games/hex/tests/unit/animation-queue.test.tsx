import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AnimationQueue,
  frameTiming,
} from "../../src/presentation/AnimationQueue";
import type {
  VisualFrame,
  ActiveAnimation,
} from "../../src/presentation/types";
import { BoardScene } from "../../src/components/map/BoardScene";
import { fixture, add, terrain } from "../helpers";
import { applyObservedAction } from "../../src/app/visualFrames";
import { getObservation } from "../../src/game/selectors/observation";
const empty = { hexes: [], pieces: [] };
function clock() {
  let now = 0,
    id = 0;
  const jobs = new Map<number, (t: number) => void>();
  return {
    scheduler: {
      now: () => now,
      request: (fn: (t: number) => void) => {
        jobs.set(++id, fn);
        return id;
      },
      cancel: (id: number) => {
        jobs.delete(id);
      },
    },
    advance: async (ms: number) => {
      for (let left = ms; left > 0;) {
        const step = Math.min(10, left);
        now += step;
        left -= step;
        const work = [...jobs.values()];
        jobs.clear();
        work.forEach((fn) => fn(now));
        await Promise.resolve();
        await Promise.resolve();
      }
    },
    jump: async (ms: number) => {
      now += ms;
      const work = [...jobs.values()];
      jobs.clear();
      work.forEach((fn) => fn(now));
      await Promise.resolve();
      await Promise.resolve();
    },
    pending: () => jobs.size,
  };
}
function hit(mode: "attack" | "counter"): VisualFrame {
  return {
    kind: "hit",
    mode,
    targetId: "t",
    sourceId: "a",
    sourceRange: 1,
    amount: 4,
    powerBefore: 6,
    powerAfter: 2,
    before: empty,
    after: empty,
  };
}
describe("表示キューの順序・キャンセル・単一アイコン", () => {
  it("命中前に戦力を更新せず、通常攻撃が終わってから反撃を開始", async () => {
    const c = clock(),
      q = new AnimationQueue(c.scheduler),
      calls: string[] = [];
    const task = q.play([hit("attack"), hit("counter")], {
      start: (a) =>
        calls.push("start:" + (a.frame.kind === "hit" ? a.frame.mode : "")),
      impact: (a) =>
        calls.push("impact:" + (a.frame.kind === "hit" ? a.frame.mode : "")),
    });
    expect(calls).toEqual(["start:attack"]);
    await c.advance(frameTiming(hit("attack")).impactMs - 1);
    expect(calls).toEqual(["start:attack"]);
    await c.advance(1);
    expect(calls).toEqual(["start:attack", "impact:attack"]);
    await c.advance(
      frameTiming(hit("attack")).durationMs -
        frameTiming(hit("attack")).impactMs,
    );
    expect(calls).toEqual(["start:attack", "impact:attack", "start:counter"]);
    await c.advance(frameTiming(hit("counter")).durationMs);
    expect(await task).toBe(true);
    expect(calls.at(-1)).toBe("impact:counter");
    expect(c.pending()).toBe(0);
  });
  it("描画が遅れても命中を描画してから次のイベントへ進む", async () => {
    const c = clock(),
      q = new AnimationQueue(c.scheduler),
      calls: string[] = [];
    const task = q.play([hit("attack"), hit("counter")], {
      start: (a) =>
        calls.push("start:" + (a.frame.kind === "hit" ? a.frame.mode : "")),
      impact: (a) =>
        calls.push("impact:" + (a.frame.kind === "hit" ? a.frame.mode : "")),
    });
    await c.jump(5000);
    expect(calls).toEqual(["start:attack", "impact:attack"]);
    await c.advance(599);
    expect(calls).toHaveLength(2);
    await c.advance(1);
    expect(calls.at(-1)).toBe("start:counter");
    q.cancel();
    expect(await task).toBe(false);
  });
  it("再戦・離脱で破棄したキューは命中や次イベントを再生しない", async () => {
    const c = clock(),
      q = new AnimationQueue(c.scheduler),
      calls: string[] = [];
    const task = q.play([hit("attack"), hit("counter")], {
      start: () => calls.push("start"),
      impact: () => calls.push("impact"),
    });
    q.cancel();
    await c.advance(5000);
    expect(await task).toBe(false);
    expect(calls).toEqual(["start"]);
    expect(c.pending()).toBe(0);
  });
  it("新しいキューが前の再生を置き換え、低モーションでも数値を残す", async () => {
    const c = clock(),
      q = new AnimationQueue(c.scheduler),
      calls: string[] = [];
    const old = q.play([hit("attack")], {
      start: () => {},
      impact: () => calls.push("old"),
    });
    const current = q.play(
      [hit("counter")],
      { start: () => {}, impact: () => calls.push("current") },
      true,
    );
    expect(await old).toBe(false);
    expect(calls).toEqual(["current"]);
    expect(frameTiming(hit("counter"), true).durationMs).toBeGreaterThanOrEqual(
      350,
    );
    await c.advance(400);
    expect(await current).toBe(true);
  });
  it("移動中は移動層に同じ駒を1個だけ描画する", () => {
    const s = fixture();
    terrain(s, { q: 0, r: 0 }, "plain");
    add(s, "moving", "player", { q: 0, r: 0 }, 4);
    const r = applyObservedAction(
      s,
      { type: "act", pieceId: "moving", path: [{ q: 1, r: 0 }] },
      "player",
    );
    const frame = r.frames.find((f) => f.kind === "move")!;
    const o = { ...getObservation(s, "player"), ...frame.before };
    const active: ActiveAnimation = {
      frame,
      serial: 1,
      startedAt: 0,
      impact: false,
      reduced: false,
    };
    const html = renderToStaticMarkup(
      <svg>
        <BoardScene
          observation={o}
          legal={[]}
          stagedPath={[]}
          locked
          onHex={() => {}}
          onHover={() => {}}
          animation={active}
        />
      </svg>,
    );
    expect(html.match(/data-piece-id="moving"/g)).toHaveLength(1);
    expect(html).toContain("piece-motion-layer");
  });
  it("反撃のダメージ値と更新後の戦力を同時に描画する", () => {
    const s = fixture();
    terrain(s, { q: 0, r: 0 }, "plain");
    terrain(s, { q: 1, r: 0 }, "plain");
    add(s, "a", "player", { q: 0, r: 0 }, 4);
    add(s, "t", "cpu", { q: 1, r: 0 }, 6);
    const r = applyObservedAction(
      s,
      { type: "act", pieceId: "a", path: [], targetId: "t" },
      "player",
    );
    const frame = r.frames.find(
      (f) => f.kind === "hit" && f.mode === "counter",
    )!;
    const active: ActiveAnimation = {
      frame,
      serial: 2,
      startedAt: 0,
      impact: true,
      reduced: false,
    };
    const html = renderToStaticMarkup(
      <svg>
        <BoardScene
          observation={{ ...getObservation(s, "player"), ...frame.after }}
          legal={[]}
          stagedPath={[]}
          locked
          onHex={() => {}}
          onHover={() => {}}
          animation={active}
        />
      </svg>,
    );
    expect(html).toContain('data-damage="2"');
    expect(html).toContain('data-target-id="a"');
    expect(html.match(/data-piece-id="a"/g)).toHaveLength(1);
    expect(html.match(/data-piece-id="t"/g)).toHaveLength(1);
    expect(html).toContain('data-power="2"');
  });
});
