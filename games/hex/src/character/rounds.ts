import { nextRandom } from "../game/rng";
import { identitySeed } from "./growth";
import { stats } from "./roster";
import type { Participant } from "./types";
import type { Battle } from "./battle";

export function roundOrder(
  participants: Participant[],
  seed: number,
  round: number,
): string[] {
  // Independent seeded priorities avoid leaking hidden roster size through a
  // shuffle that consumes a variable number of random draws.
  return participants
    .filter((p) => p.alive)
    .map((p) => ({
      p,
      tie: nextRandom(
        identitySeed(
          `${seed}:${round}:${p.initiativeKey ?? p.character.characterId}`,
        ),
      )[0],
    }))
    .sort(
      (a, b) =>
        stats(b.p.character).initiative - stats(a.p.character).initiative ||
        b.tie - a.tie ||
        (a.p.character.characterId < b.p.character.characterId ? -1 : 1),
    )
    .map(({ p }) => p.character.characterId);
}
export function beginRound(state: Battle) {
  state.turnOrder = roundOrder(
    state.participants,
    state.seed,
    state.roundNumber,
  );
  state.turnIndex = 0;
  state.actedIds = [];
  setCurrent(state);
}
function setCurrent(state: Battle) {
  const id = state.turnOrder[state.turnIndex];
  const actor = state.participants.find(
    (p) => p.character.characterId === id && p.alive,
  );
  if (!actor) throw Error("行動順に生存兵士がいません。");
  state.currentActorId = id;
  state.activePlayer = actor.owner;
}
export function finishActor(state: Battle) {
  state.actedIds.push(state.currentActorId);
  state.turnIndex++;
  while (
    state.turnIndex < state.turnOrder.length &&
    !state.participants.some(
      (p) =>
        p.alive && p.character.characterId === state.turnOrder[state.turnIndex],
    )
  )
    state.turnIndex++;
  if (state.turnIndex >= state.turnOrder.length) {
    state.roundNumber++;
    beginRound(state);
  } else setCurrent(state);
}
export function validRoundState(s: Battle): boolean {
  if (
    !Number.isInteger(s.roundNumber) ||
    s.roundNumber < 1 ||
    !Array.isArray(s.turnOrder) ||
    !Array.isArray(s.actedIds) ||
    !Number.isInteger(s.turnIndex) ||
    s.turnIndex < 0 ||
    s.turnIndex >= s.turnOrder.length
  )
    return false;
  const ids = new Set(s.participants.map((p) => p.character.characterId));
  const expected = roundOrder(
    s.participants
      .filter((p) => s.turnOrder.includes(p.character.characterId))
      .map((p) => ({ ...p, alive: true })),
    s.seed,
    s.roundNumber,
  );
  return (
    new Set(s.turnOrder).size === s.turnOrder.length &&
    s.turnOrder.every((id) => ids.has(id)) &&
    JSON.stringify(expected) === JSON.stringify(s.turnOrder) &&
    new Set(s.actedIds).size === s.actedIds.length &&
    s.actedIds.every((id) => s.turnOrder.slice(0, s.turnIndex).includes(id)) &&
    s.turnOrder[s.turnIndex] === s.currentActorId &&
    s.participants.some(
      (p) =>
        p.character.characterId === s.currentActorId &&
        p.owner === s.activePlayer &&
        (p.alive || !!s.outcome),
    ) &&
    !s.actedIds.includes(s.currentActorId) &&
    s.turnOrder
      .slice(0, s.turnIndex)
      .every(
        (id) =>
          s.actedIds.includes(id) ||
          !s.participants.find((p) => p.character.characterId === id)?.alive,
      ) &&
    s.participants
      .filter((p) => p.alive)
      .every((p) => s.turnOrder.includes(p.character.characterId)) &&
    (!s.pendingActorId || s.pendingActorId === s.currentActorId)
  );
}
