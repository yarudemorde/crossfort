import type { Coord } from "../../game/types";
import { TILE_RADIUS } from "../TerrainTile";
export const xy = (c: Coord) => ({
  x: 340 + Math.sqrt(3) * TILE_RADIUS * (c.q + c.r / 2),
  y: 263 + TILE_RADIUS * 1.5 * c.r,
});
export type Point = { x: number; y: number };
export type Camera = Point & { scale: number };
export function zoomAt(camera: Camera, anchor: Point, scale: number): Camera {
  const ratio = scale / camera.scale;
  return {
    x: anchor.x - (anchor.x - camera.x) * ratio,
    y: anchor.y - (anchor.y - camera.y) * ratio,
    scale,
  };
}
export function toScreen(camera: Camera, p: Point): Point {
  return { x: camera.x + p.x * camera.scale, y: camera.y + p.y * camera.scale };
}
