import type { Character } from "./types";
import { levelSteps, validGrowth } from "./growth";
export function validCharacter(value: unknown): value is Character {
  return (
    validIdentity(value) &&
    Array.isArray(value.growthHistory) &&
    value.growthHistory.length === levelSteps(value.level) &&
    value.growthHistory.every(validGrowth)
  );
}
export function validLegacyCharacter(value: unknown): boolean {
  return validIdentity(value);
}
function validIdentity(value: unknown): value is Character {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.characterId === "string" &&
    c.characterId.length > 0 &&
    typeof c.originalName === "string" &&
    c.originalName.length > 0 &&
    typeof c.displayName === "string" &&
    [...c.displayName].length >= 1 &&
    [...c.displayName].length <= 20 &&
    typeof c.affiliationId === "string" &&
    ["knight", "archer", "scout"].includes(String(c.classId)) &&
    [1, 2, 3, "MAX"].includes(c.level as string | number) &&
    Number.isInteger(c.hpDelta) &&
    Number(c.hpDelta) >= -3 &&
    Number(c.hpDelta) <= 3 &&
    Number.isInteger(c.attackDelta) &&
    Number(c.attackDelta) >= -1 &&
    Number(c.attackDelta) <= 1 &&
    Number.isInteger(c.battlesParticipated) &&
    Number(c.battlesParticipated) >= 0 &&
    Number.isInteger(c.kills) &&
    Number(c.kills) >= 0 &&
    ["starter", "replacement", "scout"].includes(String(c.acquisitionSource)) &&
    typeof c.nameEditUsed === "boolean" &&
    (c.playerBattlesParticipated === undefined ||
      (Number.isInteger(c.playerBattlesParticipated) &&
        Number(c.playerBattlesParticipated) >= 0)) &&
    (c.playerKills === undefined ||
      (Number.isInteger(c.playerKills) && Number(c.playerKills) >= 0))
  );
}
