import { terrainArt } from "../data/terrain-art";
import type { Terrain } from "../game/types";
export const TILE_RADIUS = 31;
export const tilePolygon = Array.from(
  { length: 6 },
  (_, i) =>
    `${TILE_RADIUS * Math.cos(((60 * i - 30) * Math.PI) / 180)},${TILE_RADIUS * Math.sin(((60 * i - 30) * Math.PI) / 180)}`,
).join(" ");
export const TERRAIN_CLIP_ID = "terrain-hex-clip";
/** Unknown hexes always use the same fog art, even if a caller supplies terrain. */
export function TerrainTile({
  terrain,
  explored,
}: {
  terrain?: Terrain;
  explored: boolean;
}) {
  const kind = explored && terrain ? terrain : "fog";
  const extent = TILE_RADIUS * 1.02;
  return (
    <g
      className="terrain-tile"
      aria-hidden="true"
      pointerEvents="none"
      data-terrain-art={kind}
      clipPath={`url(#${TERRAIN_CLIP_ID})`}
    >
      <image
        className="terrain-image"
        href={terrainArt[kind]}
        x={-extent}
        y={-extent}
        width={extent * 2}
        height={extent * 2}
        preserveAspectRatio="xMidYMid slice"
      />
    </g>
  );
}
