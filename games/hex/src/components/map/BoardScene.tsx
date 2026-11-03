import { memo } from "react";
import { uiConfig } from "../../data/catalog";
import type {
  Action,
  Coord,
  Observation,
  ObservedPiece,
} from "../../game/types";
import { hexDistance, hexId, sameHex } from "../../game/rules/hex";
import type { ActiveAnimation } from "../../presentation/types";
import { terrainNames } from "../Icons";
import { TerrainTile, tilePolygon as polygon } from "../TerrainTile";
import { xy, getMapBounds } from "./geometry";
import { PieceIcon } from "./PieceIcon";
import { PieceMotionLayer, motionPieceId } from "./PieceMotionLayer";
import { CombatAnimationLayer } from "./CombatAnimationLayer";
export const BoardScene = memo(function BoardScene({
  observation: o,
  selectedPiece,
  selectedCard,
  legal,
  stagedPath,
  hovered,
  onHex,
  onHover,
  locked,
  animation,
}: {
  observation: Observation;
  selectedPiece?: ObservedPiece;
  selectedCard?: string;
  legal: Action[];
  stagedPath: Coord[];
  hovered?: Coord;
  onHex: (c: Coord) => void;
  onHover: (c: Coord) => void;
  locked: boolean;
  animation?: ActiveAnimation;
}) {
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
          a.targetId &&
          JSON.stringify(a.path) === JSON.stringify(stagedPath),
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
  const movingId = motionPieceId(animation),
    f = animation?.frame;
  const bounds = getMapBounds(o.hexes);
  return (
    <>
      <ellipse
        cx={(bounds.minX + bounds.maxX) / 2}
        cy={(bounds.minY + bounds.maxY) / 2}
        rx={bounds.width / 2}
        ry={bounds.height / 2}
        fill="url(#map-light)"
      />
      {o.hexes.map((h) => {
        const pos = xy(h),
          id = hexId(h),
          deploy = playHexes.has(id),
          move = !!selectedPiece && moves.has(id),
          chosen = stagedPath.some((c) => sameHex(c, h));
        const pieces = o.pieces.filter((p) => sameHex(p.coord, h));
        const influence =
          selectedPiece &&
          selectedPiece.kind !== "unit" &&
          h.explored &&
          hexDistance(selectedPiece.coord, h) <= selectedPiece.territory;
        const old = f?.before.hexes.find((b) => sameHex(b, h));
        const revealed =
          !!animation?.impact && !!old && !old.explored && h.explored;
        const territoryChanged =
          f?.kind === "territory" &&
          h.visible &&
          old?.territory !== h.territory;
        return (
          <g
            key={id}
            transform={`translate(${pos.x} ${pos.y})`}
            className={`hex ${h.explored ? h.terrain : "unknown"} ${h.visible ? "visible" : "dim"} ${h.territory ?? ""} ${deploy ? "deployable" : ""} ${move ? "movable" : ""} ${chosen ? "path-chosen" : ""} ${hovered && sameHex(hovered, h) ? "hovered" : ""} ${revealed ? "newly-explored" : ""} ${territoryChanged ? "territory-changed" : ""}`}
            role="button"
            tabIndex={locked ? -1 : 0}
            aria-disabled={locked}
            aria-label={`${h.q},${h.r} ${h.explored ? terrainNames[h.terrain!] : "未探索"}${pieces.map((p) => " " + (p.kind === "headquarters" ? "本城" : (uiConfig.cards[p.definitionId]?.name.replace("（仮）", "") ?? p.kind))).join("")}`}
            onClick={() => {
              if (!locked) onHex({ q: h.q, r: h.r });
            }}
            onMouseEnter={() => onHover(h)}
            onFocus={() => onHover(h)}
            onKeyDown={(e) => {
              if (!locked && (e.key === "Enter" || e.key === " ")) {
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
            {!pieces.length && sameHex(h, o.headquarters.cpu) && !h.visible && (
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
      <g className="stationary-piece-layer">
        {o.pieces
          .filter((p) => p.instanceId !== movingId)
          .map((p) => {
            const pos = xy(p.coord),
              stack = o.pieces.filter((other) => sameHex(other.coord, p.coord)),
              index = stack.indexOf(p);
            const hit = f?.kind === "hit" && f.targetId === p.instanceId;
            const source = f?.kind === "hit" && f.sourceId === p.instanceId;
            return (
              <g
                key={p.instanceId}
                transform={`translate(${pos.x} ${pos.y})${stack.length > 1 ? ` translate(${index === 0 ? -11 : 11} ${index === 0 ? -6 : 6}) scale(.73)` : ""}`}
                pointerEvents="none"
              >
                <PieceIcon
                  piece={p}
                  selected={p.instanceId === selectedPiece?.instanceId}
                  targetable={
                    targetIds.has(p.instanceId) ||
                    spellTargets.has(p.instanceId)
                  }
                  ready={
                    !p.actedThisTurn &&
                    p.owner === o.owner &&
                    p.summonedOnOwnTurn < o.self.ownTurnNumber
                  }
                  className={`${source ? "is-source" : ""} ${hit ? (animation?.impact ? "is-hit" : "is-target") : ""} ${hit && f.mode === "counter" ? "counter-hit" : ""}`}
                />
              </g>
            );
          })}
      </g>
      <PieceMotionLayer active={animation} />
      <CombatAnimationLayer active={animation} />
    </>
  );
});
