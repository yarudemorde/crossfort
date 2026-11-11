import { Icon } from "../tactics/Icons";
import timing from "../../../data/presentation.settings.json";
import type { CharacterFrame } from "../../character/presentation";
import { TerrainTile, TERRAIN_CLIP_ID, tilePolygon } from "../TerrainTile";
import { getMapBounds, xy } from "../map/geometry";
import { useMapGestures } from "../map/useMapGestures";
import { sameHex } from "../../game/rules/hex";
import type { Coord } from "../../game/types";
import type { BattleAction, BattleObservation } from "../../character/battle";
import { stats } from "../../character/roster";
import type { AttackForecast } from "../../character/forecast";

export function CharacterBoard({
  view,
  legal,
  selected,
  onHex,
  animation,
  path,
  deploymentSlots,
  initialCoords,
  attackPreview,
  forecast,
}: {
  view: BattleObservation;
  legal: BattleAction[];
  selected?: string;
  path?: Coord[];
  deploymentSlots?: Coord[];
  initialCoords?: Coord[];
  attackPreview?: { actorId: string; targetId?: string; effect?: "heal" };
  forecast?: AttackForecast;
  onHex: (coord: Coord) => void;
  animation?: { frame: CharacterFrame; impact: boolean; serial: number };
}) {
  const f = animation?.frame;
  const camera = useMapGestures(
    getMapBounds(view.hexes),
    view.id,
    initialCoords?.length ? getMapBounds(initialCoords) : undefined,
  );
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
            <marker
              id="hx-attack-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0 0L10 5L0 10Z" fill="#CF756B" />
            </marker>
            <clipPath id={TERRAIN_CLIP_ID} clipPathUnits="userSpaceOnUse">
              <polygon points={tilePolygon} />
            </clipPath>
          </defs>
          <g
            className="hx-camera"
            data-camera={`${camera.camera.x},${camera.camera.y},${camera.camera.scale}`}
            transform={`translate(${camera.camera.x} ${camera.camera.y}) scale(${camera.camera.scale})`}
          >
            {view.hexes.map((h) => {
              const p = xy(h);
              const canMove =
                deploymentSlots?.some((c) => sameHex(c, h)) ||
                moves.some(
                  (a) =>
                    a.type === "act" && sameHex(a.path[a.path.length - 1], h),
                );
              const canAttack = targetCoords.some((c) => sameHex(c, h));
              const canHeal =
                canAttack &&
                attacks.some((a) => a.type === "act" && a.effect === "heal");
              const unit = view.participants.find((u) => sameHex(u.coord, h));
              return (
                <g
                  key={`${h.q},${h.r}`}
                  data-hex={`${h.q},${h.r}`}
                  transform={`translate(${p.x} ${p.y})`}
                  onClick={() => onHex(h)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${h.q},${h.r} ${unit ? `${unit.owner === "player" ? "自軍" : "敵軍"} ${unit.character.displayName} HP${unit.hp}` : deploymentSlots?.some((c) => sameHex(c, h)) ? "配置可能" : ""}`}
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
                      canHeal
                        ? "#438a6455"
                        : canAttack
                          ? "#c3454259"
                          : canMove
                            ? "#d5b66c55"
                            : !h.visible
                              ? "#0a0e1166"
                              : "transparent"
                    }
                    stroke={
                      canHeal
                        ? "#91dfaa"
                        : canAttack
                          ? "#f47865"
                          : canMove
                            ? "#e8ce86"
                            : "#1a2018"
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
            {attackPreview &&
              (() => {
                const a = view.participants.find(
                  (p) => p.character.characterId === attackPreview.actorId,
                )?.coord;
                const b =
                  attackPreview.targetId === "hq_cpu"
                    ? view.headquarters.cpu.coord
                    : view.participants.find(
                        (p) =>
                          p.character.characterId === attackPreview.targetId,
                      )?.coord;
                return a && b ? (
                  <line
                    className="hx-attack-preview"
                    x1={xy(a).x}
                    y1={xy(a).y}
                    x2={xy(b).x}
                    y2={xy(b).y}
                    stroke={
                      attackPreview.effect === "heal"
                        ? "#91dfaa"
                        : forecast?.directional
                          ? "#D2B576"
                          : "#CF756B"
                    }
                    strokeWidth="2.5"
                    strokeDasharray="5 3"
                    markerEnd={
                      attackPreview.effect === "heal" || forecast?.directional
                        ? undefined
                        : "url(#hx-attack-arrow)"
                    }
                    pointerEvents="none"
                  />
                ) : null;
              })()}
            {forecast &&
              (() => {
                const actor = view.participants.find(
                  (p) => p.character.characterId === attackPreview?.actorId,
                );
                const hit = view.participants.find(
                  (p) => p.character.characterId === forecast.hitTargetId,
                );
                const counter = view.participants.find(
                  (p) => p.character.characterId === forecast.counterTargetId,
                );
                if (!actor) return null;
                return (
                  <g pointerEvents="none" className="hx-target-feedback">
                    {forecast.directional && (
                      <circle
                        cx={xy(forecast.aim).x}
                        cy={xy(forecast.aim).y}
                        r="27"
                        fill="none"
                        stroke="#D2B576"
                        strokeWidth="2"
                        strokeDasharray="4 3"
                      />
                    )}
                    {hit && forecast.directional && (
                      <>
                        <circle
                          data-hit-target={forecast.hitTargetId}
                          cx={xy(hit.coord).x}
                          cy={xy(hit.coord).y}
                          r="24"
                          fill="none"
                          stroke="#f47865"
                          strokeWidth="3"
                          strokeDasharray={forecast.uncertain ? "4 3" : undefined}
                        />
                        {forecast.hitTargetId !==
                          forecast.requestedTargetId && (
                          <line
                            x1={xy(actor.coord).x}
                            y1={xy(actor.coord).y}
                            x2={xy(hit.coord).x}
                            y2={xy(hit.coord).y}
                            stroke="#f47865"
                            strokeWidth="3"
                            markerEnd="url(#hx-attack-arrow)"
                          />
                        )}
                      </>
                    )}
                    {hit &&
                      counter &&
                      counter.character.characterId !==
                        actor.character.characterId && (
                        <>
                          <circle
                            data-counter-target={forecast.counterTargetId}
                            cx={xy(counter.coord).x}
                            cy={xy(counter.coord).y}
                            r="25"
                            fill="none"
                            stroke="#efb56d"
                            strokeWidth="3"
                          />
                          <line
                            x1={xy(hit.coord).x}
                            y1={xy(hit.coord).y}
                            x2={xy(counter.coord).x}
                            y2={xy(counter.coord).y}
                            stroke="#efb56d"
                            strokeWidth="2.5"
                            strokeDasharray="4 3"
                          />
                        </>
                      )}
                  </g>
                );
              })()}
            <g pointerEvents="none">
              {(["player", "cpu"] as const).map((owner) => {
                const c = xy(view.headquarters[owner].coord);
                return (
                  <g key={owner} transform={`translate(${c.x} ${c.y})`}>
                    <g
                      transform="translate(-15 -16)"
                      className={owner === "player" ? "v2-ally" : "v2-enemy"}
                    >
                      <Icon name="castle" size={30} />
                    </g>
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
                    className={`v2-moving-piece ${f?.kind === "destroy" && f.targetId === unit.character.characterId ? "v2-dying" : ""} ${f?.kind === "hit" && f.actorId === unit.character.characterId ? (f.charge ? "v2-striking hx-charging" : "v2-striking") : ""}`}
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
                            values={`0 0; ${(xy(f.target).x - c.x) * (f.charge ? 0.35 : 0.18)} ${(xy(f.target).y - c.y) * (f.charge ? 0.35 : 0.18)}; 0 0`}
                            dur={`${timing.combat.meleeMs}ms`}
                          />
                        )}
                      {unit.character.characterId === selected && (
                        <circle
                          r="22"
                          fill="none"
                          stroke="#D2B576"
                          strokeWidth="2"
                          className="hx-selection-ring"
                        />
                      )}
                      {unit.owner === "cpu" ? (
                        <polygon
                          points="0,-19 16,-9 16,9 0,19 -16,9 -16,-9"
                          fill="#382323"
                          stroke="#CF756B"
                          strokeWidth="1.6"
                        />
                      ) : (
                        <circle
                          r="18"
                          fill="#19353E"
                          stroke="#79B5C8"
                          strokeWidth="1.6"
                        />
                      )}
                      <g
                        transform="translate(-12 -14)"
                        color={unit.owner === "player" ? "#BDE4EE" : "#F0B5A9"}
                      >
                        <Icon name={unit.character.classId} size={24} />
                      </g>
                      <rect
                        x="-14"
                        y="15"
                        width="28"
                        height="4"
                        rx="2"
                        fill="#0B1112"
                        stroke="#0B1112"
                        strokeWidth="2"
                      />
                      <rect
                        x="-14"
                        y="15"
                        width={
                          Math.max(0, unit.hp / stats(unit.character).hp) * 28
                        }
                        height="4"
                        rx="2"
                        fill={
                          unit.hp / stats(unit.character).hp < 0.3
                            ? "#E8A179"
                            : unit.owner === "player"
                              ? "#91D0CC"
                              : "#DF9587"
                        }
                      />
                      {unit.character.level !== 1 && (
                        <text
                          x="18"
                          y="-12"
                          textAnchor="middle"
                          className="v2-piece-label"
                        >
                          {unit.character.level === "MAX"
                            ? "★"
                            : unit.character.level}
                        </text>
                      )}
                    </g>
                  </g>
                );
              })}
            </g>
            {(f?.kind === "hit" || f?.kind === "heal") && f.target && (
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
                            stroke={
                              f.kind === "heal"
                                ? "#91dfaa"
                                : f.counter
                                  ? "#e99e53"
                                  : "#ffe6a2"
                            }
                            strokeWidth={f.charge ? "4" : "2"}
                            strokeDasharray={f.range === 2 ? "4 3" : undefined}
                            className="v2-attack-line"
                          />
                          <circle
                            r="4"
                            fill={f.kind === "heal" ? "#91dfaa" : "#ffe6a2"}
                          >
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
                      stroke={f.kind === "heal" ? "#91dfaa" : "#ffe0a1"}
                      strokeWidth="3"
                    />
                    <text
                      textAnchor="middle"
                      y="-24"
                      className="v2-damage"
                      fill={
                        f.kind === "heal"
                          ? "#91dfaa"
                          : f.counter
                            ? "#ffb566"
                            : "#ff7e70"
                      }
                    >
                      {f.kind === "heal" ? "+" : "−"}
                      {f.amount}
                    </text>
                    {f.charge && (
                      <text
                        y="-44"
                        textAnchor="middle"
                        className="v2-piece-label"
                        fill="#ffe0a1"
                      >
                        突撃
                      </text>
                    )}
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
          <Icon name="fit" />
        </button>
        <button onClick={() => camera.zoom(1 / 1.2)} aria-label="縮小">
          <Icon name="minus" />
        </button>
        <button onClick={() => camera.zoom(1.2)} aria-label="拡大">
          <Icon name="plus" />
        </button>
      </div>
    </div>
  );
}
