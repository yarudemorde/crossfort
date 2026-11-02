import settings from "../../../data/presentation.settings.json";
import { easeProgress } from "../../presentation/easing";
import { useLayoutEffect, useRef } from "react";
import type { ActiveAnimation } from "../../presentation/types";
import { frameTiming } from "../../presentation/AnimationQueue";
import { xy } from "./geometry";
import { PieceIcon } from "./PieceIcon";
export function motionPieceId(a?: ActiveAnimation) {
  if (!a) return;
  const f = a.frame;
  if (
    f.kind === "move" ||
    f.kind === "destroy" ||
    f.kind === "appear" ||
    f.kind === "vanish"
  )
    return f.pieceId;
  if (
    f.kind === "hit" &&
    f.sourceId &&
    f.sourceRange === 1 &&
    (f.mode === "attack" || f.mode === "counter")
  )
    return f.sourceId;
}
export function PieceMotionLayer({ active }: { active?: ActiveAnimation }) {
  const root = useRef<SVGGElement>(null);
  const id = motionPieceId(active);
  const f = active?.frame;
  const p =
    f && id
      ? (f.kind === "appear" ? f.after : f.before).pieces.find(
          (p) => p.instanceId === id,
        )
      : undefined;
  useLayoutEffect(() => {
    if (!active || !p || !root.current) return;
    const frame = active.frame,
      origin = xy(p.coord),
      timing = frameTiming(frame, active.reduced);
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = Math.max(0, now - active.startedAt);
      let position = origin;
      if (frame.kind === "move") {
        const from = xy(frame.from),
          to = xy(frame.to);
        const t = active.reduced
            ? 1
            : Math.min(1, elapsed / Math.max(1, timing.impactMs)),
          ease = easeProgress(t, settings.movement.easing);
        position = {
          x: from.x + (to.x - from.x) * ease,
          y: from.y + (to.y - from.y) * ease,
        };
      } else if (frame.kind === "hit" && !active.reduced) {
        const target = frame.before.pieces.find(
          (p) => p.instanceId === frame.targetId,
        );
        if (target) {
          const to = xy(target.coord),
            dx = to.x - origin.x,
            dy = to.y - origin.y,
            d = Math.hypot(dx, dy) || 1;
          const lunge =
            Math.sin(
              Math.PI * Math.min(1, elapsed / Math.max(1, timing.impactMs)),
            ) * 11;
          position = {
            x: origin.x + (dx / d) * lunge,
            y: origin.y + (dy / d) * lunge,
          };
        }
      }
      root.current?.setAttribute(
        "transform",
        `translate(${position.x} ${position.y})`,
      );
      if (elapsed < timing.durationMs) raf = requestAnimationFrame(tick);
    };
    tick(performance.now());
    return () => cancelAnimationFrame(raf);
  }, [active?.serial, p?.instanceId]);
  if (!active || !p) return null;
  const pos = xy(p.coord);
  return (
    <g className="piece-motion-layer" aria-hidden="true" pointerEvents="none">
      <g ref={root} transform={`translate(${pos.x} ${pos.y})`}>
        <g
          key={
            f!.kind === "move" ? p.instanceId : `${active.serial}-${f!.kind}`
          }
          className={`motion-${f!.kind} ${active.reduced ? "motion-reduced" : ""}`}
        >
          <PieceIcon
            piece={p}
            className={f!.kind === "hit" ? "is-source" : ""}
          />
        </g>
      </g>
    </g>
  );
}
