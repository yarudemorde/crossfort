import type { Coord, GameState, Owner } from "./types";
export type HitMode = "attack" | "counter" | "spell" | "heal" | "boost";
export type EngineVisualEvent =
  | { kind: "move"; pieceId: string; from: Coord; to: Coord; route?: Coord[] }
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
  | { kind: "destroy" | "deploy"; pieceId: string }
  | { kind: "reveal"; owner: Owner; coord?: Coord }
  | { kind: "sync" };
export type VisualObserver = (
  state: GameState,
  event: EngineVisualEvent,
) => void;
const observers = new WeakMap<GameState, VisualObserver>();
export function watchVisualState(state: GameState, observer?: VisualObserver) {
  if (observer) observers.set(state, observer);
  return () => observers.delete(state);
}
/** Optional telemetry only. The observer receives a detached state, never the draft. */
export function captureVisual(state: GameState, event: EngineVisualEvent) {
  const observer = observers.get(state);
  if (observer) {
    try {
      observer(structuredClone(state), structuredClone(event));
    } catch {
      /* Telemetry failure must never change the authoritative action. */
    }
  }
}
