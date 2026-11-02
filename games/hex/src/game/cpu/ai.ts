import tuning from "../../../data/prototype.tuning.json";
import type {
  Action,
  DecisionConfig,
  Observation,
  ObservedPiece,
} from "../types";
import { hexDistance, sameHex } from "../rules/hex";
import { nextRandom } from "../rng";
import { calculateEffectivePower } from "../rules/board";
/** Only the acting player's observation is accepted. No authoritative state or opponent deck. */
export function chooseCpuAction(
  o: Observation,
  legalActions: Action[],
  seed: number,
  config: DecisionConfig,
): Action {
  const own = o.pieces.filter((p) => p.owner === o.owner),
    enemies = o.pieces.filter((p) => p.owner !== o.owner),
    enemyHq = o.headquarters[o.owner === "player" ? "cpu" : "player"],
    ownHq = o.headquarters[o.owner];
  const threat = enemies.filter(
    (p) => p.kind === "unit" && hexDistance(p.coord, ownHq) <= 3,
  );
  const ownUnits = own.filter((p) => p.kind === "unit");
  const structures = own.filter((p) => p.kind === "landmark");
  const terrain = (coord: { q: number; r: number }) =>
    o.hexes.find((h) => sameHex(h, coord))?.terrain ?? "plain";
  const power = (p: ObservedPiece, coord = p.coord) =>
    calculateEffectivePower(p, terrain(coord), config);
  let best: Action = { type: "endTurn" },
    bestScore = 0;
  for (
    let index = 0;
    index < Math.min(legalActions.length, tuning.cpu.maxEvaluatedActions);
    index++
  ) {
    const a = legalActions[index];
    let score = -1;
    if (a.type === "act") {
      const p = own.find((p) => p.instanceId === a.pieceId)!;
      const dest = a.path.at(-1) ?? p.coord;
      const progress =
        hexDistance(p.coord, enemyHq) - hexDistance(dest, enemyHq);
      if (a.targetId) {
        const t = enemies.find((p) => p.instanceId === a.targetId)!;
        const damage = power(p, dest);
        const kill = damage >= t.power;
        const counter =
          !kill && hexDistance(dest, t.coord) <= t.range
            ? t.power -
              damage +
              ((
                config.rules.terrain[terrain(t.coord)] as {
                  counterBonus?: number;
                }
              ).counterBonus ?? 0)
            : 0;
        const loss = counter >= damage;
        score =
          40 +
          Math.min(damage, t.power) * 5 +
          (kill ? 25 : 0) -
          (loss ? p.basePower * 2 : counter) +
          (t.kind === "headquarters"
            ? 80 + damage * 8 + (kill ? 100000 : 0)
            : t.kind === "landmark"
              ? 15
              : 12) +
          (hexDistance(t.coord, ownHq) <= 3 ? 25 : 0) +
          progress * 0.4;
      } else {
        const closest = enemies
          .filter((t) => t.kind === "unit")
          .sort(
            (a, b) =>
              hexDistance(p.coord, a.coord) - hexDistance(p.coord, b.coord),
          )[0];
        const approach = closest
          ? hexDistance(p.coord, closest.coord) -
            hexDistance(dest, closest.coord)
          : 0;
        score =
          progress * 7 +
          (approach > 0 && closest && hexDistance(closest.coord, ownHq) < 4
            ? approach * 10
            : 0) +
          o.hexes.filter((h) => !h.explored && hexDistance(h, dest) <= p.vision)
            .length *
            0.15 -
          a.path.length * 0.1;
        if (
          p.range === 2 &&
          enemies.some((e) => hexDistance(dest, e.coord) === 1)
        )
          score -= 8;
        if (progress <= 0 && approach <= 0) score = -1;
      }
    } else if (a.type === "play") {
      const c = config.cards[a.cardId];
      if (c.type === "unit") {
        const d = hexDistance(a.coord!, enemyHq);
        score =
          25 +
          c.power! * 1.4 +
          c.movement! * 1.5 +
          (8 - d) * 2 +
          (c.range === 2 ? 8 : 0) -
          (c.movement === 0 && d > 3 ? 35 : 0);
        if (threat.length) score += 20 - hexDistance(a.coord!, ownHq) * 3;
        if (ownUnits.length > 13) score -= 15;
      } else if (c.type === "landmark") {
        const d = hexDistance(a.coord!, enemyHq);
        const closest = own
          .filter((p) => p.kind !== "unit")
          .reduce((v, p) => Math.min(v, hexDistance(p.coord, a.coord!)), 99);
        score = structures.length < 2 ? 38 : structures.length < 4 ? 13 : 0;
        score += closest * 3 + (8 - d) * 2 - (closest < 2 ? 17 : 0);
        if (d < 2) score -= 15;
      } else {
        const e = c.effects![0],
          t = o.pieces.find((p) => p.instanceId === a.targetId);
        if (e.effectId === "directDamage" && t)
          score =
            35 +
            Math.min(e.amount!, t.power) * 5 +
            (t.power <= e.amount! ? 30 : 0) +
            (t.kind === "headquarters"
              ? 60 + (t.power <= e.amount! ? 100000 : 0)
              : 0);
        else if (e.effectId === "heal" && t)
          score =
            12 +
            Math.min(e.amount!, t.accumulatedDamage) * 5 +
            (t.kind === "headquarters" ? 30 : 0);
        else if (e.effectId === "temporaryPowerBonus" && t)
          score =
            !t.actedThisTurn &&
            t.summonedOnOwnTurn < o.self.ownTurnNumber &&
            enemies.some(
              (x) => hexDistance(x.coord, t.coord) <= t.range + t.movement,
            )
              ? 27
              : -1;
        else if (e.effectId === "reveal") {
          const revealed = o.hexes.filter(
            (h) => !h.explored && hexDistance(h, a.coord!) <= e.radius!,
          ).length;
          score = revealed >= 5 ? 2 + revealed * 0.25 : -1;
        }
      }
    } else if (a.type === "exchange") {
      const c = config.cards[a.cardId];
      score =
        c.cost > o.self.resourceRemaining ||
        !legalActions.some((x) => x.type === "play" && x.cardId === a.cardId)
          ? 1
          : -1;
    }
    const [tie] = nextRandom((seed ^ Math.imul(index + 1, 2654435761)) >>> 0);
    score += tie * 0.07;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}
