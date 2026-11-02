import { describe, it, expect } from "vitest";
import { MapGestureController } from "../../src/components/map/gestures";
import { zoomAt, toScreen } from "../../src/components/map/geometry";
const point = (x: number, y: number) => ({ x, y });
describe("マップ固有のジェスチャー", () => {
  it("ホイールの中心にある地図上の点は拡大しても動かない", () => {
    const c = { x: 20, y: -40, scale: 1.5 },
      anchor = point(185, 260),
      mapPoint = point((anchor.x - c.x) / c.scale, (anchor.y - c.y) / c.scale);
    expect(toScreen(zoomAt(c, anchor, 3), mapPoint)).toEqual(anchor);
  });
  it("10px未満はタップ、ドラッグは指に追従しクリック抑止", () => {
    const c = new MapGestureController();
    c.down(1, point(100, 100));
    expect(c.move(1, point(106, 105))).toBe(false);
    expect(c.suppressClick).toBe(false);
    expect(c.move(1, point(120, 110))).toBe(true);
    expect(c.camera.x).toBe(20);
    expect(c.camera.y).toBe(10);
    c.up(1);
    expect(c.suppressClick).toBe(true);
    c.down(2, point(100, 100));
    c.up(2);
    expect(c.suppressClick).toBe(false);
  });
  it("2本指を広げると拡大し、その中心にある地点を維持", () => {
    const c = new MapGestureController();
    c.camera = { x: 0, y: 0, scale: 1 };
    c.down(1, point(100, 100));
    c.down(2, point(200, 100));
    c.move(1, point(50, 100));
    c.move(2, point(250, 100));
    expect(c.camera.scale).toBeCloseTo(2);
    expect(toScreen(c.camera, point(150, 100)).x).toBeCloseTo(150);
    expect(toScreen(c.camera, point(150, 100)).y).toBeCloseTo(100);
    expect(c.suppressClick).toBe(true);
  });
  it("2本指ドラッグは倍率を戻して中心を移動、1本へ戻っても誤タップしない", () => {
    const c = new MapGestureController();
    c.camera = { x: 0, y: 0, scale: 1 };
    c.down(1, point(100, 100));
    c.down(2, point(200, 100));
    c.move(1, point(120, 130));
    c.move(2, point(220, 130));
    expect(c.camera.scale).toBeCloseTo(1);
    expect(c.camera.x).toBeCloseTo(20);
    expect(c.camera.y).toBeCloseTo(30);
    c.up(1);
    c.move(2, point(230, 140));
    c.up(2);
    expect(c.camera.x).toBeCloseTo(30);
    expect(c.camera.y).toBeCloseTo(40);
    expect(c.suppressClick).toBe(true);
  });
  it("上下限を越えるズームでもカーソル基準を保つ", () => {
    const c = new MapGestureController();
    const a = point(150, 200);
    c.zoom(a, 10000);
    expect(c.camera.scale).toBe(3.6);
    const before = point(
      (a.x - c.camera.x) / c.camera.scale,
      (a.y - c.camera.y) / c.camera.scale,
    );
    c.zoom(a, 0.00001);
    expect(c.camera.scale).toBe(0.18);
    expect(toScreen(c.camera, before).x).toBeCloseTo(a.x);
    expect(toScreen(c.camera, before).y).toBeCloseTo(a.y);
  });
  it("最大/最小倍率の2本指移動でも倍率が漂わない", () => {
    for (const scale of [0.18, 3.6]) {
      const c = new MapGestureController();
      c.camera = { x: 0, y: 0, scale };
      c.down(1, point(100, 100));
      c.down(2, point(200, 100));
      c.move(1, point(80, 120));
      c.move(2, point(180, 120));
      expect(c.camera.scale).toBeCloseTo(scale);
      expect(c.camera.x).toBeCloseTo(-20);
      expect(c.camera.y).toBeCloseTo(20);
    }
  });
  it("pointercancelはクリックを生まず、追跡中の指を解放", () => {
    const c = new MapGestureController();
    c.down(1, point(100, 100));
    c.up(1, true);
    expect(c.pointers.size).toBe(0);
    expect(c.suppressClick).toBe(true);
    expect(c.move(1, point(200, 200))).toBe(false);
  });
});
