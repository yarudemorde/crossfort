import type { Character } from "../character/types";
import type { Coord } from "../game/types";

export type FormationDraft = {
  formation: string[];
  placements: Record<string, Coord>;
  pick?: string;
};

/** Reconcile UI selections with an accepted save, without changing the save. */
export function reconcileFormationDraft(
  draft: FormationDraft,
  roster: Character[],
): FormationDraft {
  const owned = new Set(roster.map((c) => c.characterId));
  const selected = new Set<string>();
  const formation = draft.formation.filter((id) => {
    if (!owned.has(id) || selected.has(id)) return false;
    selected.add(id);
    return true;
  });
  const placements = Object.fromEntries(
    Object.entries(draft.placements).filter(([id]) => selected.has(id)),
  );
  const pick = draft.pick && selected.has(draft.pick) ? draft.pick : undefined;
  if (
    formation.length === draft.formation.length &&
    Object.keys(placements).length === Object.keys(draft.placements).length &&
    pick === draft.pick
  )
    return draft;
  return { formation, placements, pick };
}
