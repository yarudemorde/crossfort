import { uiConfig } from "../data/catalog";
import { useEffect, useRef } from "react";
import type { Action, Coord, Observation, ObservedPiece } from "../game/types";
import { hexDistance, hexId, sameHex } from "../game/rules/hex";
import { Sigil, terrainNames } from "./Icons";
import {
  TerrainTile,
  tilePolygon as polygon,
  TILE_RADIUS as size,
  TERRAIN_CLIP_ID,
} from "./TerrainTile";
export const xy = (c: Coord) => ({
  x: 340 + Math.sqrt(3) * size * (c.q + c.r / 2),
  y: 263 + size * 1.5 * c.r,
});
export function Board({
  observation: o,
  selectedPiece,
  selectedCard,
  legal,
  stagedPath,
  hovered,
  onHex,
  onHover,
  zoom,
  onZoom,
}: {
  observation: Observation;
  selectedPiece?: ObservedPiece;
  selectedCard?: string;
  legal: Action[];
  stagedPath: Coord[];
  hovered?: Coord;
  onHex: (c: Coord) => void;
  onHover: (c: Coord) => void;
  zoom: number;
  onZoom: (v: number) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const gesture = useRef({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    dragged: false,
    down: false,
  });
  const width = Math.max(100, 720 * zoom);
  function focusHex(coord: Coord, behavior: ScrollBehavior = "smooth") {
    const el = viewport.current;
    if (!el) return;
    const position = xy(coord);
    el.scrollTo({
      left: Math.max(0, ((position.x - 35) / 610) * width - el.clientWidth / 2),
      top: Math.max(
        0,
        ((position.y - 20) / 610) * width -
          (el.clientHeight -
            parseFloat(getComputedStyle(el).paddingBottom || "0")) /
            2,
      ),
      behavior,
    });
  }
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      focusHex(o.headquarters[o.owner], "auto"),
    );
    return () => cancelAnimationFrame(frame);
    // Initial camera position only; selecting targets must not move the map.
  }, [o.seed, o.mapId]);
  function changeZoom(value: number) {
    const el = viewport.current;
    if (!el) return;
    const next = Math.max(0.15, Math.min(2, value));
    const x = (el.scrollLeft + el.clientWidth / 2) / width;
    const y =
      (el.scrollTop +
        (el.clientHeight -
          parseFloat(getComputedStyle(el).paddingBottom || "0")) /
          2) /
      width;
    onZoom(next);
    requestAnimationFrame(() =>
      el.scrollTo({
        left: x * Math.max(100, 720 * next) - el.clientWidth / 2,
        top:
          y * Math.max(100, 720 * next) -
          (el.clientHeight -
            parseFloat(getComputedStyle(el).paddingBottom || "0")) /
            2,
      }),
    );
  }
  const playHexes = new Set(
    legal
      .filter((a) => a.type === "play" && a.cardId === selectedCard && a.coord)
      .map((a) => (a.type === "play" ? hexId(a.coord!) : "")),
  );
  const moves = new Set(
    legal
      .filter(
        (a) =>
          a.type === "act" &&
          a.pieceId === selectedPiece?.instanceId &&
          a.path.length &&
          !a.targetId,
      )
      .map((a) => (a.type === "act" ? hexId(a.path.at(-1)!) : "")),
  );
  const targetIds = new Set(
    legal
      .filter(
        (a) =>
          a.type === "act" &&
          a.pieceId === selectedPiece?.instanceId &&
          JSON.stringify(a.path) === JSON.stringify(stagedPath) &&
          a.targetId,
      )
      .map((a) => (a.type === "act" ? a.targetId : "")),
  );
  const spellTargets = new Set(
    legal
      .filter(
        (a) => a.type === "play" && a.cardId === selectedCard && a.targetId,
      )
      .map((a) => (a.type === "play" ? a.targetId : "")),
  );
  return (
    <div className="battlefield">
      <div className="map-corner top-left">
        BATTLEFIELD / {o.hexes.filter((h) => h.explored).length} OF 61
      </div>
      <div className="map-corner bottom-right">HEX TERRITORY WARFARE</div>
      <div
        className="map-scroll"
        ref={viewport}
        onPointerDownCapture={(e) => {
          if (e.button !== 0) return;
          const el = e.currentTarget;
          gesture.current = {
            x: e.clientX,
            y: e.clientY,
            left: el.scrollLeft,
            top: el.scrollTop,
            dragged: false,
            down: true,
          };
        }}
        onPointerMoveCapture={(e) => {
          const g = gesture.current;
          if (!g.down) return;
          const dx = e.clientX - g.x,
            dy = e.clientY - g.y;
          if (Math.hypot(dx, dy) > 8) g.dragged = true;
          if (g.dragged && e.pointerType === "mouse") {
            e.currentTarget.setPointerCapture(e.pointerId);
            e.currentTarget.scrollLeft = g.left - dx;
            e.currentTarget.scrollTop = g.top - dy;
          }
        }}
        onPointerUpCapture={() => {
          gesture.current.down = false;
        }}
        onPointerCancel={() => {
          gesture.current.down = false;
        }}
        onClickCapture={(e) => {
          if (gesture.current.dragged) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <svg
          className="hex-map"
          viewBox="35 20 610 486"
          style={{ width: `${width}px`, height: `${(width * 486) / 610}px` }}
          aria-label="戦場の六角形マップ"
        >
          <defs>
            <clipPath id={TERRAIN_CLIP_ID} clipPathUnits="userSpaceOnUse">
              <polygon points={polygon} />
            </clipPath>
            <filter id="pin-shadow">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity=".7" />
            </filter>
            <radialGradient id="map-light">
              <stop stopColor="#65715c" stopOpacity=".15" />
              <stop offset="1" stopColor="#111511" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="340" cy="263" r="260" fill="url(#map-light)" />
          {o.hexes.map((h) => {
            const pos = xy(h);
            const id = hexId(h);
            const deploy = playHexes.has(id),
              move = !!selectedPiece && moves.has(id),
              chosen = stagedPath.some((c) => sameHex(c, h));
            const pieces = o.pieces.filter((p) => sameHex(p.coord, h));
            const hoveredTile = hovered && sameHex(hovered, h);
            const influence =
              selectedPiece &&
              selectedPiece.kind !== "unit" &&
              h.explored &&
              hexDistance(selectedPiece.coord, h) <= selectedPiece.territory;
            return (
              <g
                key={id}
                transform={`translate(${pos.x} ${pos.y})`}
                className={`hex ${h.explored ? h.terrain : "unknown"} ${h.visible ? "visible" : "dim"} ${h.territory ?? ""} ${deploy ? "deployable" : ""} ${move ? "movable" : ""} ${chosen ? "path-chosen" : ""} ${hoveredTile ? "hovered" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`${h.q},${h.r} ${h.explored ? terrainNames[h.terrain!] : "未探索"}${pieces.map((p) => " " + (p.kind === "headquarters" ? "本城" : (uiConfig.cards[p.definitionId]?.name.replace("（仮）", "") ?? p.kind))).join("")}`}
                onClick={() => onHex({ q: h.q, r: h.r })}
                onMouseEnter={() => onHover(h)}
                onFocus={() => onHover(h)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onHex(h);
                  }
                }}
              >
                <polygon points={polygon} className="hex-face" />
                <TerrainTile
                  terrain={h.explored ? h.terrain : undefined}
                  explored={h.explored}
                />
                <polygon
                  points={polygon}
                  className="hex-overlay"
                  aria-hidden="true"
                />
                <polygon
                  points={polygon}
                  className="hex-border"
                  aria-hidden="true"
                />
                {influence && (
                  <polygon points={polygon} className="influence-ring" />
                )}
                {(deploy || move) && !pieces.length && (
                  <circle r="4" className="legal-dot" />
                )}
                {pieces.map((p, i) => (
                  <g
                    key={p.instanceId}
                    transform={
                      pieces.length > 1
                        ? `translate(${i === 0 ? -11 : 11} ${i === 0 ? -6 : 6}) scale(.73)`
                        : undefined
                    }
                    className={`piece ${p.owner} ${p.actedThisTurn ? "acted" : ""} ${p.instanceId === selectedPiece?.instanceId ? "selected" : ""} ${targetIds.has(p.instanceId) || spellTargets.has(p.instanceId) ? "targetable" : ""}`}
                  >
                    <circle
                      r={p.kind === "headquarters" ? 24 : 20}
                      className="piece-disc"
                      filter="url(#pin-shadow)"
                    />
                    <circle
                      r={p.kind === "headquarters" ? 21 : 17}
                      className="piece-border"
                    />
                    <foreignObject x="-17" y="-21" width="34" height="34">
                      <Sigil kind={p.kind} variant={p.definitionId} />
                    </foreignObject>
                    <g transform="translate(0 17)">
                      <rect x="-11" y="-6" width="22" height="14" rx="3" />
                      <text y="4">{p.power}</text>
                    </g>
                    {!p.actedThisTurn &&
                      p.owner === o.owner &&
                      p.summonedOnOwnTurn < o.self.ownTurnNumber && (
                        <circle
                          cx="16"
                          cy="-14"
                          r="3.8"
                          className="ready-dot"
                        />
                      )}
                  </g>
                ))}
                {!pieces.length &&
                  sameHex(h, o.headquarters.cpu) &&
                  !h.visible && (
                    <g className="hq-marker">
                      <path d="m0-11 10 11L0 11-10 0z" />
                      <text y="23">敵本城 初期地点</text>
                    </g>
                  )}
              </g>
            );
          })}
          {selectedPiece && stagedPath.length > 0 && (
            <polyline
              className="route-line"
              points={[selectedPiece.coord, ...stagedPath]
                .map((c) => {
                  const p = xy(c);
                  return `${p.x},${p.y}`;
                })
                .join(" ")}
            />
          )}
        </svg>
      </div>
      <div className="map-toolbar">
        <span>
          <i className="legend-dot own" />
          自軍 <i className="legend-dot enemy" />
          敵軍 <i className="legend-dot fog" />
          探索済み
        </span>
        <div>
          <button
            onClick={() =>
              focusHex(selectedPiece?.coord ?? o.headquarters[o.owner])
            }
            aria-label="自軍の位置へ移動"
            title="自軍の位置へ移動"
          >
            ◎
          </button>
          <button
            onClick={() => {
              const el = viewport.current;
              if (!el) return;
              changeZoom(
                Math.min(
                  el.clientWidth,
                  ((el.clientHeight -
                    parseFloat(getComputedStyle(el).paddingBottom || "0")) *
                    610) /
                    486,
                ) / 720,
              );
            }}
            aria-label="マップ全体を表示"
            title="マップ全体を表示"
          >
            全体
          </button>
          <button
            onClick={() => changeZoom(zoom - 0.15)}
            aria-label="マップを縮小"
          >
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => changeZoom(zoom + 0.15)}
            aria-label="マップを拡大"
          >
            ＋
          </button>
        </div>
      </div>
    </div>
  );
}
