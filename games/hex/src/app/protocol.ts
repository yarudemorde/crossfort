import type { Action, GameEvent, Observation, Owner } from "../game/types";
import type { VisualFrame } from "../presentation/types";
export type Request = (
  | { type: "new"; seed: number; mapId: string; first: Owner }
  | { type: "action"; action: Action }
  | { type: "cpu" }
  | {
      type: "replay";
      seed: number;
      mapId: string;
      first: Owner;
      actions: Action[];
    }
) & { session?: number };
export type Response = {
  frames: VisualFrame[];
  session?: number;
  observation: Observation;
  legal: Action[];
  events: GameEvent[];
  error?: string;
  cpuBusy: boolean;
};
