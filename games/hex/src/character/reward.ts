import rules from "../../data/ruleset.characters.json";
import { nextRandom } from "../game/rng";
import { cleanName, nextLevel, scoutChance } from "./roster";
import type { BattleResult, RosterSave } from "./types";
import type { Character } from "./types";

export function sameCharacter(a: Character, b: Character): boolean {
  return (
    (Object.keys(a) as (keyof Character)[]).every((key) => a[key] === b[key]) &&
    (Object.keys(b) as (keyof Character)[]).every((key) => a[key] === b[key])
  );
}

export function beginReward(
  save: RosterSave,
  result: BattleResult,
  seed: number,
): RosterSave {
  if (
    result.winner !== "player" ||
    save.pendingReward ||
    save.completedRewardIds.includes(result.id)
  )
    throw Error("報酬を開始できません。");
  const own = result.participants.filter((p) => p.owner === "player");
  if (
    !own.length ||
    new Set(own.map((p) => p.character.characterId)).size !== own.length ||
    own.some((p) => !save.roster.some((c) => sameCharacter(c, p.character)))
  )
    throw Error("戦闘結果が不正です。");
  const eligible =
    result.reason === "headquartersDestroyed" &&
    result.participants.some((p) => p.owner === "cpu" && p.alive);
  const promotable = own.some((p) => p.alive && p.character.level !== "MAX");
  return {
    ...save,
    pendingReward: {
      id: result.id,
      result: structuredClone(result),
      rngState: seed >>> 0,
      scoutStatus: eligible ? "pending" : "skipped",
      promotionStatus: promotable ? "pending" : "skipped",
    },
  };
}
export function decideScout(save: RosterSave, targetId?: string): RosterSave {
  const reward = save.pendingReward;
  if (!reward || reward.scoutStatus !== "pending")
    throw Error("勧誘は処理済みです。");
  if (!targetId)
    return { ...save, pendingReward: { ...reward, scoutStatus: "skipped" } };
  const candidate = reward.result.participants.find(
    (p) => p.owner === "cpu" && p.alive && p.character.characterId === targetId,
  );
  if (!candidate || reward.result.reason !== "headquartersDestroyed")
    throw Error("勧誘対象が不正です。");
  const dead = new Set(
    reward.result.participants
      .filter((p) => p.owner === "player" && !p.alive)
      .map((p) => p.character.characterId),
  );
  if (
    save.roster.filter((p) => !dead.has(p.characterId)).length >=
    rules.rosterLimit
  )
    throw Error("所持上限です。");
  if ([...save.roster, ...save.archive].some((p) => p.characterId === targetId))
    throw Error("IDが重複しています。");
  const [roll, rngState] = nextRandom(reward.rngState),
    success = roll * 100 < scoutChance(candidate.character);
  return {
    ...save,
    pendingReward: {
      ...reward,
      rngState,
      scoutStatus: success ? "succeeded" : "failed",
      ...(success
        ? {
            scouted: {
              ...candidate.character,
              acquisitionSource: "scout" as const,
              nameEditUsed: false,
            },
          }
        : {}),
    },
  };
}
/** The one-time name edit remains part of the pending atomic reward. */
export function renameScout(save: RosterSave, input: string): RosterSave {
  const reward = save.pendingReward;
  const scout = reward?.scouted;
  if (
    !reward ||
    reward.scoutStatus !== "succeeded" ||
    !scout ||
    scout.nameEditUsed
  )
    throw Error("勧誘したキャラクターの名前を変更できません。");
  return {
    ...save,
    pendingReward: {
      ...reward,
      scouted: { ...scout, displayName: cleanName(input), nameEditUsed: true },
    },
  };
}
export function promote(save: RosterSave, id?: string): RosterSave {
  const reward = save.pendingReward;
  if (
    !reward ||
    reward.scoutStatus === "pending" ||
    reward.promotionStatus !== "pending"
  )
    throw Error("強化できません。");
  const survivors = reward.result.participants.filter(
    (p) => p.owner === "player" && p.alive && p.character.level !== "MAX",
  );
  if (!id) {
    if (survivors.length) throw Error("生存者を選択してください。");
    return {
      ...save,
      pendingReward: { ...reward, promotionStatus: "skipped" },
    };
  }
  if (!survivors.some((p) => p.character.characterId === id))
    throw Error("強化対象が不正です。");
  return {
    ...save,
    pendingReward: { ...reward, promotionStatus: "chosen", promotedId: id },
  };
}
/** Build the entire next save in memory; the caller persists it as one value. */
export function commitVictory(save: RosterSave): RosterSave {
  const r = save.pendingReward;
  if (
    !r ||
    save.completedRewardIds.includes(r.id) ||
    r.scoutStatus === "pending" ||
    r.promotionStatus === "pending"
  )
    throw Error("報酬が未完了です。");
  const own = r.result.participants.filter((p) => p.owner === "player"),
    byId = new Map(own.map((p) => [p.character.characterId, p]));
  const roster = save.roster
    .filter((c) => byId.get(c.characterId)?.alive !== false)
    .map((c) => {
      const p = byId.get(c.characterId);
      if (!p) return c;
      return {
        ...c,
        battlesParticipated: c.battlesParticipated + 1,
        kills: c.kills + p.killsThisBattle,
        playerBattlesParticipated: (c.playerBattlesParticipated ?? 0) + 1,
        playerKills: (c.playerKills ?? 0) + p.killsThisBattle,
        level: c.characterId === r.promotedId ? nextLevel(c.level) : c.level,
      };
    });
  const dead = save.roster
    .filter((c) => byId.get(c.characterId)?.alive === false)
    .map((c) => {
      const p = byId.get(c.characterId)!;
      return {
        ...c,
        battlesParticipated: c.battlesParticipated + 1,
        kills: c.kills + p.killsThisBattle,
        playerBattlesParticipated: (c.playerBattlesParticipated ?? 0) + 1,
        playerKills: (c.playerKills ?? 0) + p.killsThisBattle,
      };
    });
  if (r.scouted) roster.push(r.scouted);
  if (
    roster.length > rules.rosterLimit ||
    new Set(roster.map((p) => p.characterId)).size !== roster.length
  )
    throw Error("所持データが不正です。");
  return {
    schemaVersion: 2,
    roster,
    archive: [...save.archive, ...dead],
    completedRewardIds: [...save.completedRewardIds, r.id],
  };
}
