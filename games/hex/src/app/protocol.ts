import type { Action, GameEvent, Observation, Owner } from "../game/types";
export type Request =
  | { type: "new"; seed: number; mapId: string; first: Owner }
  | { type: "action"; action: Action }
  | { type: "cpu" }
  | {
      type: "replay";
      seed: number;
      mapId: string;
      first: Owner;
      actions: Action[];
    };
export type Response = {
  observation: Observation;
  legal: Action[];
  events: GameEvent[];
  error?: string;
  cpuBusy: boolean;
};
