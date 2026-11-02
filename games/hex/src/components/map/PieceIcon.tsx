import type { ObservedPiece } from "../../game/types";
import { Sigil } from "../Icons";
export function PieceIcon({
  piece: p,
  selected = false,
  targetable = false,
  ready = false,
  className = "",
}: {
  piece: ObservedPiece;
  selected?: boolean;
  targetable?: boolean;
  ready?: boolean;
  className?: string;
}) {
  return (
    <g
      data-piece-id={p.instanceId}
      className={`piece ${p.owner} ${p.actedThisTurn ? "acted" : ""} ${selected ? "selected" : ""} ${targetable ? "targetable" : ""} ${className}`}
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
        <text y="4" data-power={p.power}>
          {p.power}
        </text>
      </g>
      {ready && <circle cx="16" cy="-14" r="3.8" className="ready-dot" />}
    </g>
  );
}
