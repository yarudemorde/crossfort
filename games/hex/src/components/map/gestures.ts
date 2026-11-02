import settings from "../../../data/presentation.settings.json";
import { zoomAt, type Camera, type Point } from "./geometry";
/** Platform-independent gesture math, shared by pointer and wheel input. */
export class MapGestureController {
  camera: Camera = { x: 0, y: 0, scale: 720 / 610 };
  pointers = new Map<number, Point>();
  suppressClick = false;
  private dragging = false;
  private start: Point = { x: 0, y: 0 };
  private pinch?: { camera: Camera; center: Point; distance: number };
  private rebasePinch() {
    const [a, b] = [...this.pointers.values()];
    this.pinch =
      a && b
        ? {
            camera: { ...this.camera },
            center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            distance: Math.hypot(a.x - b.x, a.y - b.y),
          }
        : undefined;
  }
  private clamp(scale: number) {
    return Math.max(
      settings.camera.minScale,
      Math.min(settings.camera.maxScale, scale),
    );
  }
  down(id: number, p: Point) {
    if (!this.pointers.size) {
      this.start = p;
      this.dragging = false;
      this.suppressClick = false;
    }
    this.pointers.set(id, p);
    if (this.pointers.size === 2) this.rebasePinch();
    if (this.pointers.size > 1) {
      this.dragging = true;
      this.suppressClick = true;
    }
  }
  move(id: number, p: Point) {
    const prior = this.pointers.get(id);
    if (!prior) return false;
    this.pointers.set(id, p);
    const next = [...this.pointers.values()];
    if (next.length >= 2) {
      const [a, b] = next,
        base = this.pinch!;
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const translated = {
        ...base.camera,
        x: base.camera.x + center.x - base.center.x,
        y: base.camera.y + center.y - base.center.y,
      };
      this.camera = zoomAt(
        translated,
        center,
        this.clamp(
          base.distance > 0
            ? (base.camera.scale * distance) / base.distance
            : base.camera.scale,
        ),
      );
      this.dragging = true;
      this.suppressClick = true;
      return true;
    }
    if (
      !this.dragging &&
      Math.hypot(p.x - this.start.x, p.y - this.start.y) <
        settings.camera.dragThresholdPx
    )
      return false;
    const from = this.dragging ? prior : this.start;
    this.camera = {
      ...this.camera,
      x: this.camera.x + p.x - from.x,
      y: this.camera.y + p.y - from.y,
    };
    this.dragging = true;
    this.suppressClick = true;
    return true;
  }
  up(id: number, cancel = false) {
    this.pointers.delete(id);
    this.rebasePinch();
    if (cancel) this.suppressClick = true;
    if (this.pointers.size === 1) this.start = [...this.pointers.values()][0];
  }
  zoom(anchor: Point, factor: number) {
    this.camera = zoomAt(
      this.camera,
      anchor,
      this.clamp(this.camera.scale * factor),
    );
  }
}
