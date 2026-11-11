import type { PresentationEvent } from "./presentation";
import { hexDistance } from "../game/rules/hex";
import { nextRandom } from "../game/rng";
import { forecastAttack } from "./forecast";
import { attackDamage } from "./combat";
import { canAttack, healingPower } from "./abilities";
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
    const supporting = !canAttack(actor.character);
    const allies = o.participants.filter(
      (p) => p.owner === o.owner && p.character.characterId !== action.actorId,
    );
    const anchor = supporting
      ? ([...allies].sort(
          (a, b) =>
            Number(b.hp < stats(b.character).hp) -
              Number(a.hp < stats(a.character).hp) ||
            hexDistance(a.coord, hq) - hexDistance(b.coord, hq),
        )[0]?.coord ?? o.headquarters[o.owner].coord)
      : hq;
    let score =
      12 +
      (hexDistance(actor.coord, anchor) - hexDistance(dest, anchor)) * 8 -
      action.path.length * 0.1;
    const forecast = forecastAttack(o, action);
    if (action.targetId) {
      const target = o.participants.find(
        (p) =>
          p.character.characterId ===
          (forecast?.hitTargetId ?? action.targetId),
      );
      const hit = forecast?.hit ?? 0;
      if (action.effect === "heal" && target) {
        score +=
          45 +
          Math.min(
            healingPower(actor.character),
            stats(target.character).hp - target.hp,
          ) *
            8;
      } else if (target) {
        const survives = target.hp > hit;
        const counter = forecast?.counter ?? 0;
        const counterRecipient = o.participants.find(
          (p) => p.character.characterId === forecast?.counterTargetId,
        );
        score +=
          35 +
          Math.min(hit, target.hp) * 5 +
          (!survives ? 25 : 0) -
          counter * 3 -
          (counterRecipient && counter >= counterRecipient.hp ? 35 : 0);
      } else
        score +=
          130 +
          hit * 10 +
          ((o.headquarters[enemy].hp ?? 60) <= hit ? 10000 : 0);
    }
    // Only currently visible opponents and the filtered timeline enter these estimates.
    const visibleEnemies = o.participants.filter((p) => p.owner !== o.owner);
    const waiting = new Set(
      o.timeline.filter((t) => !t.acted).map((t) => t.characterId),
    );
    for (const enemyUnit of visibleEnemies) {
      if (!canAttack(enemyUnit.character)) continue;
      const es = stats(enemyUnit.character);
      if (hexDistance(dest, enemyUnit.coord) <= es.range + es.movement) {
        const danger = attackDamage(
          enemyUnit.character,
          terrain(enemyUnit.coord),
        );
        score -=
          danger * (waiting.has(enemyUnit.character.characterId) ? 1.2 : 0.4);
        if (danger >= actor.hp && waiting.has(enemyUnit.character.characterId))
          score -= 12;
      }
      // Assist the next visible friendly attackers instead of assuming hidden forces.
      if (
        forecast?.hitTargetId === enemyUnit.character.characterId &&
        enemyUnit.hp > stats(actor.character).attack
      ) {
        const support = o.participants.filter(
          (p) =>
            p.owner === o.owner &&
            p.character.characterId !== action.actorId &&
            waiting.has(p.character.characterId) &&
            hexDistance(p.coord, enemyUnit.coord) <=
              stats(p.character).range + stats(p.character).movement,
        ).length;
        score += Math.min(2, support) * 4;
      }
    }
    const [tie] = nextRandom((seed ^ Math.imul(index + 1, 2654435761)) >>> 0);
    return { action, score, tie };
  });
  candidates.sort((a, b) => b.score - a.score || b.tie - a.tie);
  return candidates[0].action;
}

/** Execute a full turn through observations, including targets revealed by movement. */
export function playCpuTurn(
  state: Battle,
  seed: number,
  onStep?: (state: Battle, event?: PresentationEvent) => void,
): Battle {
  const owner = state.activePlayer;
  const first = chooseAction(observation(state, owner), seed);
  if (first.type === "pass" || state.pendingActorId)
    return applyBattleAction(state, first, owner, onStep);
  const moved = beginMovement(state, owner, first.actorId, first.path, onStep);
  const followUp = chooseAction(observation(moved, owner), seed ^ 0x9e3779b9);
  return applyBattleAction(moved, followUp, owner, onStep);
}
