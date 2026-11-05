import timing from "../../../data/presentation.settings.json";
import type { CharacterFrame } from "../../character/presentation";
import { TerrainTile, TERRAIN_CLIP_ID, tilePolygon } from "../TerrainTile";
import { getMapBounds, xy } from "../map/geometry";
import { useMapGestures } from "../map/useMapGestures";
import { sameHex } from "../../game/rules/hex";
import type { Coord } from "../../game/types";
import type { BattleAction, BattleObservation } from "../../character/battle";
import { stats } from "../../character/roster";

export function CharacterBoard({
  view,
  legal,
  selected,
  onHex,
  animation,
  path,
}: {
  view: BattleObservation;
  legal: BattleAction[];
  selected?: string;
  path?: Coord[];
  onHex: (coord: Coord) => void;
  animation?: { frame: CharacterFrame; impact: boolean; serial: number };
}) {
  const f = animation?.frame;
  const camera = useMapGestures(getMapBounds(view.hexes), view.id);
  const moves = legal.filter(
    (a) =>
      a.type === "act" &&
      a.actorId === selected &&
      a.path.length &&
      !a.targetId,
  );
  const attacks = legal.filter(
    (a) =>
      a.type === "act" &&
      a.actorId === selected &&
      !a.path.length &&
      a.targetId,
  );
  const targetCoords = attacks.flatMap((a) =>
    a.type === "act"
      ? [
          a.targetId === "hq_cpu"
            ? view.headquarters.cpu.coord
            : view.participants.find(
                (p) => p.character.characterId === a.targetId,
              )?.coord,
        ].filter((c): c is Coord => !!c)
      : [],
  );
  return (
    <div className="v2-board">
      <div className="map-viewport" ref={camera.viewport} {...camera.bindings}>
        <svg className="hex-map" width="100%" height="100%" aria-label="戦場">
          <defs>
            <clipPath id={TERRAIN_CLIP_ID} clipPathUnits="userSpaceOnUse">
              <polygon points={tilePolygon} />
            </clipPath>
          </defs>
          <g
            transform={`translate(${camera.camera.x} ${camera.camera.y}) scale(${camera.camera.scale})`}
          >
            {view.hexes.map((h) => {
              const p = xy(h);
              const canMove = moves.some(
                (a) =>
                  a.type === "act" && sameHex(a.path[a.path.length - 1], h),
              );
              const canAttack = targetCoords.some((c) => sameHex(c, h));
              const unit = view.participants.find((u) => sameHex(u.coord, h));
              return (
                <g
                  key={`${h.q},${h.r}`}
                  transform={`translate(${p.x} ${p.y})`}
                  onClick={() => onHex(h)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${h.q},${h.r} ${unit?.character.displayName ?? ""}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onHex(h);
                    }
                  }}
                >
                  <TerrainTile terrain={h.terrain} explored={h.explored} />
                  <polygon
                    points={tilePolygon}
                    fill={
                      canAttack
                        ? "#c3454259"
                        : canMove
                          ? "#d5b66c55"
                          : !h.visible
                            ? "#0a0e1166"
                            : "transparent"
                    }
                    stroke={
                      canAttack ? "#f47865" : canMove ? "#e8ce86" : "#1a2018"
                    }
                    strokeWidth={canMove || canAttack ? 2 : 1}
                  />
                </g>
              );
            })}
            {path && path.length > 0 && (
              <polyline
                points={[
                  view.participants.find(
                    (p) => p.character.characterId === selected,
                  )?.coord,
                  ...path,
                ]
                  .filter((c): c is Coord => !!c)
                  .map((c) => `${xy(c).x},${xy(c).y}`)
                  .join(" ")}
                fill="none"
                stroke="#fff0ab"
                strokeWidth="3"
                strokeDasharray="5 3"
                pointerEvents="none"
              />
            )}
            <g pointerEvents="none">
              {(["player", "cpu"] as const).map((owner) => {
                const c = xy(view.headquarters[owner].coord);
                return (
                  <g key={owner} transform={`translate(${c.x} ${c.y})`}>
                    <text
                      textAnchor="middle"
                      y="5"
                      className={owner === "player" ? "v2-ally" : "v2-enemy"}
                      fontSize="25"
                    >
                      ♜
                    </text>
                    <text textAnchor="middle" y="23" className="v2-piece-label">
                      {view.headquarters[owner].hp ?? "?"}
                    </text>
                  </g>
                );
              })}
              {view.participants.map((unit) => {
                const c = xy(unit.coord);
                return (
                  <g
                    key={unit.character.characterId}
                    className={`v2-moving-piece ${f?.kind === "destroy" && f.targetId === unit.character.characterId ? "v2-dying" : ""} ${f?.kind === "hit" && f.actorId === unit.character.characterId ? "v2-striking" : ""}`}
                    style={{
                      transform: `translate(${c.x}px, ${c.y}px)`,
                      transitionDuration: `${timing.movement.stepMs}ms`,
                    }}
                  >
                    <g>
                      {f?.kind === "hit" &&
                        f.actorId === unit.character.characterId &&
                        f.range === 1 &&
                        f.source &&
                        f.target &&
                        !animation?.impact && (
                          <animateTransform
                            key={animation?.serial}
                            attributeName="transform"
                            type="translate"
                            values={`0 0; ${(xy(f.target).x - c.x) * 0.18} ${(xy(f.target).y - c.y) * 0.18}; 0 0`}
                            dur={`${timing.combat.meleeMs}ms`}
                          />
                        )}
                      <circle
                        r="15"
                        fill={unit.owner === "player" ? "#203f50" : "#522720"}
                        stroke={
                          unit.character.characterId === selected
                            ? "#ffe098"
                            : "#d4c6a1"
                        }
                        strokeWidth={
                          unit.character.characterId === selected ? 3 : 1
                        }
                      />
                      <text textAnchor="middle" y="5" className="v2-piece-icon">
                        {unit.character.classId === "knight"
                          ? "♞"
                          : unit.character.classId === "archer"
                            ? "♝"
                            : "♟"}
                      </text>
                      <text
                        textAnchor="middle"
                        y="25"
                        className="v2-piece-label"
                      >
                        {unit.character.displayName} {unit.hp}/
                        {stats(unit.character).hp}
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>
            {f?.kind === "hit" && f.target && (
              <g key={animation!.serial} pointerEvents="none">
                {f.source && !animation!.impact && (
                  <g>
                    {(() => {
                      const a = xy(f.source!),
                        b = xy(f.target!);
                      return (
                        <>
                          <line
                            x1={a.x}
                            y1={a.y}
                            x2={b.x}
                            y2={b.y}
                            stroke={f.counter ? "#e99e53" : "#ffe6a2"}
                            strokeWidth="2"
                            strokeDasharray={f.range === 2 ? "4 3" : undefined}
                            className="v2-attack-line"
                          />
                          <circle r="4" fill="#ffe6a2">
                            <animateMotion
                              dur={`${timing.combat.projectileMs}ms`}
                              path={`M${a.x},${a.y} L${b.x},${b.y}`}
                              fill="freeze"
                            />
                          </circle>
                        </>
                      );
                    })()}
                  </g>
                )}
                {animation!.impact && (
                  <g
                    transform={`translate(${xy(f.target).x} ${xy(f.target).y})`}
                  >
                    <circle
                      className="v2-impact"
                      r="20"
                      fill="none"
                      stroke="#ffe0a1"
                      strokeWidth="3"
                    />
                    <text
                      textAnchor="middle"
                      y="-24"
                      className="v2-damage"
                      fill={f.counter ? "#ffb566" : "#ff7e70"}
                    >
                      −{f.amount}
                    </text>
                  </g>
                )}
              </g>
            )}
            {f?.kind === "destroy" &&
              f.target &&
              f.targetId?.startsWith("hq_") && (
                <circle
                  className="v2-impact"
                  cx={xy(f.target).x}
                  cy={xy(f.target).y}
                  r="28"
                  fill="none"
                  stroke="#c7a56c"
                  strokeWidth="5"
                />
              )}
          </g>
        </svg>
      </div>
      <div className="v2-map-tools">
        <button onClick={() => camera.fit()} aria-label="全体表示">
          全体
        </button>
        <button onClick={() => camera.zoom(1 / 1.2)} aria-label="縮小">
          −
        </button>
        <button onClick={() => camera.zoom(1.2)} aria-label="拡大">
          ＋
        </button>
      </div>
    </div>
  );
}
