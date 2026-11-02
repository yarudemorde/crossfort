import { useLayoutEffect, useRef } from "react";
import type { ActiveAnimation } from "../../presentation/types";
import settings from "../../../data/presentation.settings.json";
import { frameTiming } from "../../presentation/AnimationQueue";
import { xy } from "./geometry";
import { DamagePopup } from "./DamagePopup";
export function CombatAnimationLayer({ active }: { active?: ActiveAnimation }) {
  const projectile = useRef<SVGGElement>(null);
  const f = active?.frame;
  const source =
    f?.kind === "hit" && f.sourceId
      ? f.before.pieces.find((p) => p.instanceId === f.sourceId)
      : undefined;
  const target =
    f?.kind === "hit"
      ? f.before.pieces.find((p) => p.instanceId === f.targetId)
      : undefined;
  useLayoutEffect(() => {
    if (
      !active ||
      active.frame.kind !== "hit" ||
      !source ||
      !target ||
      !projectile.current ||
      active.reduced
    )
      return;
    const start = xy(source.coord),
      end = xy(target.coord),
      timing = frameTiming(active.frame);
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - active.startedAt;
      const t = Math.max(
        0,
        Math.min(
          1,
          (elapsed - settings.combat.windupMs) /
            (timing.impactMs - settings.combat.windupMs),
        ),
      );
      projectile.current?.setAttribute(
        "transform",
        `translate(${start.x + (end.x - start.x) * t} ${start.y + (end.y - start.y) * t}) rotate(${(Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI})`,
      );
      projectile.current?.setAttribute(
        "opacity",
        elapsed >= settings.combat.windupMs && elapsed < timing.impactMs
          ? "1"
          : "0",
      );
      if (elapsed < timing.impactMs) raf = requestAnimationFrame(tick);
    };
    tick(performance.now());
    return () => cancelAnimationFrame(raf);
  }, [active?.serial]);
  if (!active || f?.kind !== "hit" || !target) return null;
  const to = xy(target.coord),
    from = source ? xy(source.coord) : undefined;
  const ranged = f.sourceRange !== 1,
    magic = f.mode === "spell" || f.mode === "heal" || f.mode === "boost";
  return (
    <g
      className={`combat-layer ${f.mode}`}
      aria-hidden="true"
      pointerEvents="none"
    >
      {from && !magic && (
        <>
          <line
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            className="attack-direction"
          />
          {ranged && !active.impact && !active.reduced && (
            <g ref={projectile} opacity="0" className="attack-projectile">
              <path d="M-11 0H7M1-4 8 0 1 4" />
            </g>
          )}
        </>
      )}
      <circle cx={to.x} cy={to.y} r="25" className="attack-target-ring" />
      {active.impact && (
        <g
          key={active.serial}
          transform={`translate(${to.x} ${to.y})`}
          className={`hit-burst ${magic ? "magic" : ""} ${active.reduced ? "motion-reduced" : ""}`}
        >
          {magic ? (
            <>
              <circle r="27" />
              <path d="M0-33V33M-33 0H33M-23-23 23 23M23-23-23 23" />
            </>
          ) : (
            <>
              <path d="M-18 17 18-17M-10 23 24-11" />
              <circle r="24" />
            </>
          )}
        </g>
      )}
      <DamagePopup active={active} />
    </g>
  );
}
