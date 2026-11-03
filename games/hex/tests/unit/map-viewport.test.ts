import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMapGestures } from "../../src/components/map/useMapGestures";
import { xy, toScreen, getMapBounds } from "../../src/components/map/geometry";
import settings from "../../data/presentation.settings.json";
import type { MapGestureController } from "../../src/components/map/gestures";

// Exercise the real hook's ResizeObserver and event handlers without a browser.
const hooks = vi.hoisted(() => ({
  refs: [] as { current: unknown }[],
  effects: [] as (() => void | (() => void))[],
  sizes: [] as unknown[],
}));
vi.mock("react", () => ({
  useRef: (current: unknown) => {
    const ref = { current };
    hooks.refs.push(ref);
    return ref;
  },
  useState: (initial: unknown) => [
    initial,
    (v: unknown) => hooks.sizes.push(v),
  ],
  useCallback: (callback: unknown) => callback,
  useLayoutEffect: (effect: () => void | (() => void)) =>
    hooks.effects.push(effect),
}));

describe("UI開閉時のマップ位置", () => {
  let resize: () => void;
  let cleanup: undefined | (() => void);
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  const listeners = new Map<string, (e: WheelEvent) => void>();
  const viewport = {
    clientWidth: 390,
    clientHeight: 731,
    getBoundingClientRect: () => ({ left: 0, top: 52 }),
    addEventListener: (name: string, callback: (e: WheelEvent) => void) =>
      listeners.set(name, callback),
    removeEventListener: (name: string) => listeners.delete(name),
  };
  function flush() {
    for (const [id, callback] of [...frames]) {
      frames.delete(id);
      callback(performance.now() + 1000);
    }
  }
  function mount() {
    const map = useMapGestures(
      getMapBounds([
        { q: -4, r: 0 },
        { q: -4, r: 4 },
        { q: 0, r: 4 },
        { q: 4, r: 0 },
        { q: 4, r: -4 },
        { q: 0, r: -4 },
      ]),
      "1102-highlands",
    );
    hooks.refs[0].current = viewport;
    cleanup = hooks.effects[0]() || undefined;
    flush();
    return {
      map,
      controller: hooks.refs[1].current as MapGestureController,
    };
  }
  beforeEach(() => {
    hooks.refs.length = 0;
    hooks.effects.length = 0;
    hooks.sizes.length = 0;
    viewport.clientWidth = 390;
    viewport.clientHeight = 731;
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  });
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    frames.clear();
    vi.unstubAllGlobals();
  });
  it("手札・選択欄の開閉は表示領域だけを変え、各マスの画面座標を維持", () => {
    const { controller } = mount();
    const camera = { ...controller.camera };
    const anchor = toScreen(camera, xy({ q: -4, r: 0 }));
    for (const height of [521, 453, 663, 731]) {
      viewport.clientHeight = height;
      resize();
      flush();
      expect(controller.camera).toEqual(camera);
      expect(toScreen(controller.camera, xy({ q: -4, r: 0 }))).toEqual(anchor);
    }
  });
  it("手動移動/ズーム後もUI開閉・画面サイズ変更で位置と倍率を戻さない", () => {
    const { controller } = mount();
    controller.down(1, { x: 100, y: 100 });
    controller.move(1, { x: 170, y: 140 });
    controller.up(1);
    controller.zoom({ x: 200, y: 250 }, 1.6);
    const camera = { ...controller.camera };
    for (const [width, height] of [
      [390, 453],
      [844, 292],
      [1366, 653],
    ]) {
      viewport.clientWidth = width;
      viewport.clientHeight = height;
      resize();
      flush();
      expect(controller.camera).toEqual(camera);
    }
  });
  it("明示した全体表示・ホイールズームは引き続きカメラを操作できる", () => {
    const { map, controller } = mount();
    const before = { ...controller.camera };
    viewport.clientHeight = 453;
    resize();
    map.fit();
    flush();
    flush();
    expect(controller.camera).not.toEqual(before);
    const center = toScreen(controller.camera, xy({ q: 0, r: 0 }));
    expect(center.x).toBeCloseTo(viewport.clientWidth / 2);
    expect(center.y).toBeCloseTo(
      (viewport.clientHeight - settings.camera.toolbarInsetPx) / 2,
    );
    const scale = controller.camera.scale;
    const preventDefault = vi.fn();
    listeners.get("wheel")!({
      clientX: 195,
      clientY: 300,
      deltaY: -100,
      deltaMode: 0,
      ctrlKey: false,
      preventDefault,
    } as unknown as WheelEvent);
    flush();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(controller.camera.scale).toBeGreaterThan(scale);
  });
});
