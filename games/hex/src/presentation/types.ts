import type { Coord, Observation } from "../game/types";
import type { HitMode } from "../game/visualTrace";
export type BoardSnapshot = Pick<Observation, "hexes" | "pieces">;
type Snapshots = { before: BoardSnapshot; after: BoardSnapshot };
export type VisualFrame = Snapshots &
  (
    | { kind: "move"; pieceId: string; from: Coord; to: Coord }
    | {
        kind: "hit";
        targetId: string;
        sourceId?: string;
        sourceRange?: number;
        mode: HitMode;
        amount: number;
        powerBefore: number;
        powerAfter: number;
      }
    | { kind: "destroy" | "appear" | "vanish"; pieceId: string }
    | { kind: "reveal"; coord?: Coord }
    | { kind: "territory" | "sync" }
  );
export type ActiveAnimation = {
  frame: VisualFrame;
  serial: number;
  startedAt: number;
  impact: boolean;
  reduced: boolean;
};
