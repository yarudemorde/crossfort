import rules from "../../data/ruleset.characters.json";
import { nextRandom } from "../game/rng";
import { createInitialRoster } from "./roster";
import { identitySeed } from "./growth";
import type { ClassId } from "./types";

/** Version 1 is retained verbatim for existing battle saves. Version 2 adds the new jobs. */
export function createCpuTeam(
  seed: number,
  battleId: string,
  version: 1 | 2 = 2,
) {
  const pool = createInitialRoster(seed ^ 0x7f4a7c15).roster;
  const legacy = pool.filter((_, i) => [0, 1, 3, 4, 6, 7].includes(i));
  const [roll] = nextRandom(seed ^ 0x34c831a9);
  const classes = rules.cpuFormations[
    Math.floor(roll * rules.cpuFormations.length)
  ] as ClassId[];
  const members =
    version === 1
      ? legacy
      : classes.map((classId, i) => ({ ...pool[i], classId }));
  return members.map((c, index) => ({
    ...c,
    characterId: `cpu-${[0, 1, 2, 3].map((salt) => identitySeed(`identity:${salt}:${battleId}:${index}`).toString(16).padStart(8, "0")).join("")}`,
  }));
}
