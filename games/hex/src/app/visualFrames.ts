import { applyAction } from "../game/engine";
import { getObservation } from "../game/selectors/observation";
import { sameHex } from "../game/rules/hex";
import type { Action, GameState, Observation, Owner } from "../game/types";
import type { EngineVisualEvent } from "../game/visualTrace";
import type { BoardSnapshot, VisualFrame } from "../presentation/types";
export const boardSnapshot = (o: Observation): BoardSnapshot => ({
  hexes: o.hexes,
  pieces: o.pieces,
});
/** Runs the authoritative action once; filters every intermediate view inside Worker. */
export function applyObservedAction(
  state: GameState,
  action: Action,
  owner: Owner,
  viewer: Owner = "player",
) {
  let previous = boardSnapshot(getObservation(state, viewer));
  const frames: VisualFrame[] = [];
  function capture(s: GameState, event: EngineVisualEvent) {
    // Rollback after a hidden obstruction retraces actual traversed centers.
    if (event.kind === "move" && event.route?.length) {
      let from = event.from;
      for (const to of event.route) {
        const view = structuredClone(s);
        view.pieces.find((p) => p.instanceId === event.pieceId)!.coord = {
          ...to,
        };
        capture(view, { kind: "move", pieceId: event.pieceId, from, to });
        from = to;
      }
      return;
    }
    const after = boardSnapshot(getObservation(s, viewer));
    const before = previous;
    let frame: VisualFrame | undefined;
    const beforePiece = (id: string) =>
      before.pieces.find((p) => p.instanceId === id);
    const afterPiece = (id: string) =>
      after.pieces.find((p) => p.instanceId === id);
    if (event.kind === "move") {
      const a = beforePiece(event.pieceId),
        b = afterPiece(event.pieceId);
      if (a && b && !sameHex(a.coord, b.coord))
        frame = {
          kind: "move",
          pieceId: a.instanceId,
          from: a.coord,
          to: b.coord,
          before,
          after,
        };
      else if (!a && b)
        frame = { kind: "appear", pieceId: b.instanceId, before, after };
      else if (a && !b)
        frame = { kind: "vanish", pieceId: a.instanceId, before, after };
    } else if (event.kind === "hit") {
      const target = beforePiece(event.targetId) ?? afterPiece(event.targetId);
      if (target) {
        const source = event.sourceId
          ? (beforePiece(event.sourceId) ?? afterPiece(event.sourceId))
          : undefined;
        const beforeView = structuredClone(before);
        const targetBefore = beforeView.pieces.find(
          (p) => p.instanceId === target.instanceId,
        );
        if (targetBefore) targetBefore.power = event.powerBefore;
        const targetAfter = after.pieces.find(
          (p) => p.instanceId === target.instanceId,
        );
        if (targetAfter) targetAfter.power = event.powerAfter;
        frame = {
          kind: "hit",
          before: beforeView,
          after,
          targetId: target.instanceId,
          mode: event.mode,
          amount: event.amount,
          powerBefore: event.powerBefore,
          powerAfter: event.powerAfter,
          ...(source
            ? { sourceId: source.instanceId, sourceRange: event.sourceRange }
            : {}),
        };
      }
    } else if (event.kind === "destroy") {
      if (beforePiece(event.pieceId)) {
        const beforeView = structuredClone(before);
        beforeView.pieces.find((p) => p.instanceId === event.pieceId)!.power =
          0;
        frame = {
          kind: "destroy",
          pieceId: event.pieceId,
          before: beforeView,
          after,
        };
      }
    } else if (event.kind === "deploy") {
      if (afterPiece(event.pieceId) && !beforePiece(event.pieceId))
        frame = { kind: "appear", pieceId: event.pieceId, before, after };
    } else if (event.kind === "reveal") {
      if (event.owner === viewer)
        frame = {
          kind: "reveal",
          before,
          after,
          ...(event.coord &&
          after.hexes.some((h) => h.visible && sameHex(h, event.coord!))
            ? { coord: event.coord }
            : {}),
        };
    } else if (JSON.stringify(before) !== JSON.stringify(after)) {
      const territory = after.hexes.some(
        (h) =>
          h.visible &&
          before.hexes.find((b) => sameHex(b, h))?.territory !== h.territory,
      );
      // Deploy is animated by the following explicit marker, not an early sync.
      const newPiece = after.pieces.some((p) => !beforePiece(p.instanceId));
      if (!newPiece)
        frame = { kind: territory ? "territory" : "sync", before, after };
      else return;
    }
    if (frame) frames.push(frame);
    previous = after;
  }
  const result = applyAction(state, action, owner, capture);
  return { ...result, frames: result.error ? [] : frames };
}
