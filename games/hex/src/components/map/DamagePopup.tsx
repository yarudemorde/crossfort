import type { ActiveAnimation } from "../../presentation/types";
import { xy } from "./geometry";
export function DamagePopup({ active }: { active: ActiveAnimation }) {
  const f = active.frame;
  if (f.kind !== "hit" || !active.impact) return null;
  const p =
    f.before.pieces.find((p) => p.instanceId === f.targetId) ??
    f.after.pieces.find((p) => p.instanceId === f.targetId);
  if (!p) return null;
  const pos = xy(p.coord),
    positive = f.mode === "heal" || f.mode === "boost";
  return (
    <g
      transform={`translate(${pos.x} ${pos.y - 30})`}
      aria-hidden="true"
      pointerEvents="none"
    >
      <text
        className={`damage-popup ${f.mode} ${active.reduced ? "motion-reduced" : ""}`}
        data-damage={f.amount}
        data-target-id={f.targetId}
        textAnchor="middle"
      >
        {positive ? "+" : "−"}
        {f.amount}
      </text>
    </g>
  );
}
