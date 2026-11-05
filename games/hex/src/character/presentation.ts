import type { Coord } from "../game/types";
import type { BattleObservation } from "./battle";
export type PresentationEvent = {
  type: "attack" | "counter";
  actorId: string;
  targetId: string;
  amount: number;
};
export type CharacterFrame = {
  kind: "move" | "hit" | "destroy";
  before: BattleObservation;
  after: BattleObservation;
  actorId?: string;
  targetId?: string;
  source?: Coord;
  target?: Coord;
  amount?: number;
  counter?: boolean;
  range?: number;
};
