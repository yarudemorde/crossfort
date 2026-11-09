import type { BattleAction, BattleObservation } from "../character/battle";
import { sameHex } from "../game/rules/hex";
import type { Coord } from "../game/types";

/** Shared by map detail routing and action previews, including friendly healing targets. */
export function directActionAt(
  view: BattleObservation,
  legal: BattleAction[],
  coord: Coord,
) {
  const targetId =
    view.participants.find((p) => sameHex(p.coord, coord))?.character
      .characterId ??
    (sameHex(view.headquarters.cpu.coord, coord) ? "hq_cpu" : undefined);
  return legal.find(
    (a): a is Extract<BattleAction, { type: "act" }> =>
      a.type === "act" &&
      a.actorId === view.currentActorId &&
      !a.path.length &&
      !!targetId &&
      a.targetId === targetId,
  );
}
