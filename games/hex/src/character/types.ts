import type { Coord, Owner } from "../game/types";
export type ClassId = "knight" | "archer" | "scout";
export type Level = 1 | 2 | 3 | "MAX";
export type Character = {
  characterId: string;
  originalName: string;
  displayName: string;
  affiliationId: string;
  classId: ClassId;
  hpDelta: number;
  attackDelta: number;
  level: Level;
  battlesParticipated: number;
  kills: number;
  playerBattlesParticipated?: number;
  playerKills?: number;
  acquisitionSource: "starter" | "replacement" | "scout";
  nameEditUsed: boolean;
};
export type Participant = {
  character: Character;
  owner: Owner;
  coord: Coord;
  hp: number;
  alive: boolean;
  killsThisBattle: number;
};
export type BattleResult = {
  id: string;
  winner: Owner;
  reason: "headquartersDestroyed" | "allUnitsKilled";
  participants: Participant[];
};
export type Reward = {
  id: string;
  result: BattleResult;
  rngState: number;
  scoutStatus: "pending" | "skipped" | "failed" | "succeeded";
  scouted?: Character;
  promotionStatus: "pending" | "skipped" | "chosen";
  promotedId?: string;
};
export type RosterSave = {
  schemaVersion: 2;
  roster: Character[];
  archive: Character[];
  pendingReward?: Reward;
  completedRewardIds: string[];
};

/** Reserved identity for a future class; not generated or selectable in v2. */
export type FutureClassId = ClassId | "unique";
