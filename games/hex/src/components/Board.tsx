import settings from "../../data/presentation.settings.json";
import { useEffect, type CSSProperties } from "react";
import type { Action, Coord, Observation, ObservedPiece } from "../game/types";
import type { ActiveAnimation } from "../presentation/types";
import { tilePolygon, TERRAIN_CLIP_ID } from "./TerrainTile";
import { useMapGestures } from "./map/useMapGestures";
import { BoardScene } from "./map/BoardScene";
import { xy } from "./map/geometry";
export { xy } from "./map/geometry";
export function Board({
  observation: o,
  selectedPiece,
  selectedCard,
  legal,
  stagedPath,
  hovered,
  onHex,
  onHover,
  animation,
  locked = false,
}: {
  observation: Observation;
  selectedPiece?: ObservedPiece;
  selectedCard?: string;
  legal: Action[];
  stagedPath: Coord[];
  hovered?: Coord;
  onHex: (c: Coord) => void;
  onHover: (c: Coord) => void;
  animation?: ActiveAnimation;
  locked?: boolean;
}) {
  const map = useMapGestures(o.headquarters[o.owner], `${o.seed}-${o.mapId}`);
  useEffect(() => {
    const f = animation?.frame;
    if (!f) return;
    const positions =
      f.kind === "move"
        ? [f.from, f.to]
        : f.kind === "hit"
          ? f.before.pieces
              .filter(
                (p) =>
                  p.instanceId === f.targetId || p.instanceId === f.sourceId,
              )
              .map((p) => p.coord)
          : f.kind === "destroy" || f.kind === "appear"
            ? f.before.pieces
                .concat(f.after.pieces)
                .filter((p) => p.instanceId === f.pieceId)
                .map((p) => p.coord)
            : [];
    map.ensureVisible(positions.map(xy));
  }, [animation?.serial]);
  return (
    <div
      className="battlefield"
      data-animating={animation?.frame.kind ?? ""}
      data-animation-serial={animation?.serial ?? 0}
      data-animation-phase={animation?.impact ? "impact" : "start"}
      style={
        {
          "--popup-ms": settings.combat.popupMs + "ms",
          "--death-ms": settings.combat.deathMs + "ms",
          "--reveal-ms": settings.revealMs + "ms",
          "--territory-ms": settings.territoryMs + "ms",
        } as CSSProperties
      }
    >
      <div className="map-viewport" ref={map.viewport} {...map.bindings}>
        <svg
          className="hex-map"
          width="100%"
          height="100%"
          viewBox={`0 0 ${map.size.width} ${map.size.height}`}
          aria-label="戦場の六角形マップ"
        >
          <defs>
            <clipPath id={TERRAIN_CLIP_ID} clipPathUnits="userSpaceOnUse">
              <polygon points={tilePolygon} />
            </clipPath>
            <filter id="pin-shadow">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity=".7" />
            </filter>
            <radialGradient id="map-light">
              <stop stopColor="#65715c" stopOpacity=".15" />
              <stop offset="1" stopColor="#111511" stopOpacity="0" />
            </radialGradient>
          </defs>
          <g
            className="map-camera"
            transform={`translate(${map.camera.x} ${map.camera.y}) scale(${map.camera.scale})`}
            data-scale={map.camera.scale}
          >
            <BoardScene
              observation={o}
              selectedPiece={selectedPiece}
              selectedCard={selectedCard}
              legal={legal}
              stagedPath={stagedPath}
              hovered={hovered}
              onHex={onHex}
              onHover={onHover}
              animation={animation}
              locked={locked}
            />
          </g>
        </svg>
      </div>
      <div className="map-toolbar">
        <div>
          <button
            onClick={() =>
              map.focus(selectedPiece?.coord ?? o.headquarters[o.owner])
            }
            aria-label="自軍の位置へ移動"
            title="自軍の位置へ移動"
          >
            ◎
          </button>
          <button
            onClick={map.fit}
            aria-label="マップ全体を表示"
            title="マップ全体を表示"
          >
            全体
          </button>
          <button onClick={() => map.zoom(1 / 1.2)} aria-label="マップを縮小">
            −
          </button>
          <span>{Math.round((map.camera.scale / (720 / 610)) * 100)}%</span>
          <button onClick={() => map.zoom(1.2)} aria-label="マップを拡大">
            ＋
          </button>
        </div>
      </div>
    </div>
  );
}
