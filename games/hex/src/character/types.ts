import type { Coord, Owner } from "../game/types";
export type ClassId =
  keyof typeof import("../../data/ruleset.characters.json").classes;
export type Level = 1 | 2 | 3 | "MAX";
export type Growth = {
  hp: number;
  attack: number;
  initiative: number;
  counterTenths: number;
};
export type Character = {
  characterId: string;
  originalName: string;
  displayName: string;
  affiliationId: string;
  classId: ClassId;
  hpDelta: number;
  attackDelta: number;
  level: Level;
  growthHistory: Growth[];
  battlesParticipated: number;
  kills: number;
  playerBattlesParticipated?: number;
  playerKills?: number;
  acquisitionSource: "starter" | "replacement" | "scout";
  nameEditUsed: boolean;
};
export type Participant = {
  /** Private stable CPU tie identity; never included in observations or frames. */
  initiativeKey?: string;
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
  promotionResult?: {
    characterId: string;
    fromLevel: Level;
    toLevel: Level;
    gain: Growth;
  };
};
export type RosterSave = {
  schemaVersion: 3;
  roster: Character[];
  archive: Character[];
  pendingReward?: Reward;
  completedRewardIds: string[];
  deploymentRecovery?: {
    mapId: string;
    seed: number;
    teamIds: string[];
    placements: Record<string, Coord>;
  };
  migrationNotice?: string;
};

/** Reserved identity for a future class; not generated or selectable in v2. */
export type FutureClassId = ClassId | "unique";
