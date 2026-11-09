import rules from "../../data/ruleset.characters.json";
import { nextRandom } from "../game/rng";
import type { ClassId, Growth, Level } from "./types";

export const levelSteps = (level: Level) => (level === "MAX" ? 3 : level - 1);
export const zeroGrowth = (): Growth => ({
  hp: 0,
  attack: 0,
  initiative: 0,
  counterTenths: 0,
});
export function totalGrowth(history: Growth[]): Growth {
  return history.reduce(
    (sum, gain) => ({
      hp: sum.hp + gain.hp,
      attack: sum.attack + gain.attack,
      initiative: sum.initiative + gain.initiative,
      counterTenths: sum.counterTenths + gain.counterTenths,
    }),
    zeroGrowth(),
  );
}
/** Four independent, equally weighted integer draws. The caller saves gain and next state atomically. */
export function rollGrowth(
  seed: number,
  classId?: ClassId,
): { gain: Growth; rngState: number } {
  let rngState = seed >>> 0;
  const gain = zeroGrowth();
  for (const key of Object.keys(gain) as (keyof Growth)[]) {
    const [roll, next] = nextRandom(rngState);
    rngState = next;
    const choices = rules.growth[key];
    gain[key] = choices[Math.floor(roll * choices.length)];
  }
  if (classId && !rules.abilities[classId].canCounter) gain.counterTenths = 0;
  return { gain, rngState };
}
export function validGrowth(value: unknown): value is Growth {
  if (!value || typeof value !== "object") return false;
  const g = value as Growth;
  return (Object.keys(rules.growth) as (keyof Growth)[]).every(
    (key) => Number.isInteger(g[key]) && rules.growth[key].includes(g[key]),
  );
}
/** Stable across reloads, roster ordering, seeds used for subsequent battles and repeated migrations. */
export function identitySeed(identity: string): number {
  let hash = 2166136261;
  for (const char of identity)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
export function migratedGrowth(identity: string, level: Level): Growth[] {
  let seed = identitySeed(`hex-v3-migration:${identity}`);
  return Array.from({ length: levelSteps(level) }, () => {
    const result = rollGrowth(seed);
    seed = result.rngState;
    return result.gain;
  });
}
