import { hexDistance } from "../game/rules/hex";
import { nextRandom } from "../game/rng";
import { damage } from "./combat";
import { stats } from "./roster";
import {
  applyBattleAction,
  beginMovement,
  legalActions,
  observation,
  type Battle,
  type BattleAction,
  type BattleObservation,
} from "./battle";

/** CPU receives only its filtered observation. */
export function chooseAction(o: BattleObservation, seed: number): BattleAction {
  const legal = legalActions(o);
  if (!legal.length) throw Error("CPUの手番ではありません。");
  const enemy = o.owner === "player" ? "cpu" : "player",
    hq = o.headquarters[enemy].coord;
  const terrain = (c: { q: number; r: number }) =>
    o.hexes.find((h) => h.q === c.q && h.r === c.r)?.terrain ?? "plain";
  const candidates = legal.map((action, index) => {
    if (action.type === "pass") return { action, score: 0, tie: 0 };
    const actor = o.participants.find(
      (p) => p.character.characterId === action.actorId,
    )!;
    const dest = action.path.at(-1) ?? actor.coord;
    let score =
      12 +
      (hexDistance(actor.coord, hq) - hexDistance(dest, hq)) * 8 -
      action.path.length * 0.1;
    if (action.targetId) {
      const target = o.participants.find(
        (p) => p.character.characterId === action.targetId,
      );
      const hit = damage(stats(actor.character).attack, terrain(dest));
      if (target) {
        const survives = target.hp > hit;
        const counter =
          survives &&
          hexDistance(dest, target.coord) <= stats(target.character).range
            ? damage(
                stats(target.character).attack,
                terrain(target.coord),
                true,
              )
            : 0;
        score +=
          35 +
          Math.min(hit, target.hp) * 5 +
          (!survives ? 25 : 0) -
          counter * 3 -
          (counter >= actor.hp ? 35 : 0);
      } else
        score +=
          130 +
          hit * 10 +
          ((o.headquarters[enemy].hp ?? 15) <= hit ? 10000 : 0);
    }
    const [tie] = nextRandom((seed ^ Math.imul(index + 1, 2654435761)) >>> 0);
    return { action, score, tie };
  });
  candidates.sort((a, b) => b.score - a.score || b.tie - a.tie);
  return candidates[0].action;
}

/** Execute a full turn through observations, including targets revealed by movement. */
export function playCpuTurn(state: Battle, seed: number): Battle {
  const owner = state.activePlayer;
  const first = chooseAction(observation(state, owner), seed);
  if (first.type === "pass" || state.pendingActorId)
    return applyBattleAction(state, first, owner);
  const moved = beginMovement(state, owner, first.actorId, first.path);
  const followUp = chooseAction(observation(moved, owner), seed ^ 0x9e3779b9);
  return applyBattleAction(moved, followUp, owner);
}
