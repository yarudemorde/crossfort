import type { Character, Level, RosterSave, Reward } from "./types";
import { migratedGrowth, rollGrowth } from "./growth";
import { nextLevel } from "./roster";
import { validLegacyCharacter } from "./validation";
import { maps } from "../game/data";
import { headquartersFor, validateDeployment } from "./combat";

function migrateCharacter(value: unknown): Character {
  if (!validLegacyCharacter(value))
    throw Error(
      "旧キャラクターデータが破損しています。上書きせず停止しました。",
    );
  const c = structuredClone(value) as Omit<Character, "growthHistory">;
  return {
    ...c,
    growthHistory: migratedGrowth(c.characterId, c.level as Level),
  };
}
/** Idempotent, deterministic migration. The storage transaction keeps the original v2 pair. */
export function migrateSave(value: unknown): RosterSave {
  if (!value || typeof value !== "object")
    throw Error("セーブデータが破損しています。");
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion === 3) return structuredClone(value) as RosterSave;
  if (
    raw.schemaVersion !== 2 ||
    !Array.isArray(raw.roster) ||
    !Array.isArray(raw.archive) ||
    !Array.isArray(raw.completedRewardIds)
  )
    throw Error("対応していない保存形式です。上書きせず停止しました。");
  const save = {
    ...structuredClone(raw),
    schemaVersion: 3,
    roster: raw.roster.map(migrateCharacter),
    archive: raw.archive.map(migrateCharacter),
    completedRewardIds: [...raw.completedRewardIds],
  } as RosterSave;
  if (raw.pendingReward !== undefined) {
    const r = structuredClone(raw.pendingReward) as Reward;
    if (!r.result || !Array.isArray(r.result.participants))
      throw Error("旧報酬が破損しています。");
    r.result.participants = r.result.participants.map((p) => ({
      ...p,
      character: migrateCharacter(p.character),
    }));
    if (r.scouted) r.scouted = migrateCharacter(r.scouted);
    if (r.promotionStatus === "chosen") {
      const character = r.result.participants.find(
        (p) => p.character.characterId === r.promotedId,
      )?.character;
      if (!character || character.level === "MAX")
        throw Error("旧強化対象が不正です。");
      const { gain, rngState } = rollGrowth(r.rngState);
      r.rngState = rngState;
      r.promotionResult = {
        characterId: character.characterId,
        fromLevel: character.level,
        toLevel: nextLevel(character.level),
        gain,
      };
    }
    save.pendingReward = r;
  }
  save.migrationNotice =
    "兵士の名前・個体差・レベル・戦績を引き継ぎ、新しい成長履歴を一度だけ生成しました。";
  return save;
}
export function recoverDeployment(
  value: unknown,
  save: RosterSave,
): NonNullable<RosterSave["deploymentRecovery"]> {
  const snapshot = value as {
    config?: {
      mapId: string;
      seed: number;
      team: Character[];
      placements: NonNullable<RosterSave["deploymentRecovery"]>["placements"];
    };
    battle?: { participants?: unknown[] };
  };
  const c = snapshot?.config;
  const map = maps.find((m) => m.id === c?.mapId);
  if (
    !c ||
    !map ||
    !Number.isInteger(c.seed) ||
    !Array.isArray(c.team) ||
    !c.team.length ||
    !snapshot.battle ||
    !Array.isArray(snapshot.battle.participants)
  )
    throw Error("旧戦闘の復元情報が不正です。旧データを保持して停止しました。");
  const teamIds = c.team.map((p) => p.characterId);
  if (
    teamIds.some((id) => !save.roster.some((c) => c.characterId === id)) ||
    validateDeployment(map, headquartersFor(map).player, teamIds, c.placements)
  )
    throw Error(
      "旧戦闘の編成・配置が不正です。旧データを保持して停止しました。",
    );
  return {
    mapId: c.mapId,
    seed: c.seed,
    teamIds,
    placements: structuredClone(c.placements),
  };
}
