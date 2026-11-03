import type { Coord } from "../../game/types";
import { TILE_RADIUS } from "../TerrainTile";
import settings from "../../../data/presentation.settings.json";
export const xy = (c: Coord) => ({
  x: 340 + Math.sqrt(3) * TILE_RADIUS * (c.q + c.r / 2),
  y: 263 + TILE_RADIUS * 1.5 * c.r,
});
export type Point = { x: number; y: number };
export type Camera = Point & { scale: number };
export type MapBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};
/** Bounds use public coordinates and the full hex polygon, never terrain. */
export function getMapBounds(hexes: readonly Coord[]): MapBounds {
  if (!hexes.length) throw Error("マップにマスがありません。");
  const points = hexes.map(xy);
  const halfWidth = (Math.sqrt(3) * TILE_RADIUS) / 2 + 2;
  const halfHeight = TILE_RADIUS + 2;
  const minX = Math.min(...points.map((p) => p.x)) - halfWidth;
  const maxX = Math.max(...points.map((p) => p.x)) + halfWidth;
  const minY = Math.min(...points.map((p) => p.y)) - halfHeight;
  const maxY = Math.max(...points.map((p) => p.y)) + halfHeight;
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}
export function fitMapCamera(
  bounds: MapBounds,
  viewport: { width: number; height: number },
): Camera {
  const {
    fitPaddingPx: padding,
    toolbarInsetPx,
    minScale,
    maxScale,
  } = settings.camera;
  const height = Math.max(1, viewport.height - toolbarInsetPx);
  const scale = Math.max(
    minScale,
    Math.min(
      maxScale,
      Math.max(1, viewport.width - 2 * padding) / bounds.width,
      Math.max(1, height - 2 * padding) / bounds.height,
    ),
  );
  return {
    scale,
    x: viewport.width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
    y: height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale,
  };
}
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
