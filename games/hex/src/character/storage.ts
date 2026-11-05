import type { Character, Participant, RosterSave } from "./types";
import { createInitialRoster } from "./roster";

const DB_NAME = "crossfort-hex-characters-v2";
const STORE = "saves";
const KEY = "active";
function validCharacter(value: unknown): value is Character {
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
    !(c.classId === "scout" && c.attackDelta === -1) &&
    Number.isInteger(c.battlesParticipated) &&
    Number(c.battlesParticipated) >= 0 &&
    Number.isInteger(c.kills) &&
    Number(c.kills) >= 0 &&
    ["starter", "replacement", "scout"].includes(String(c.acquisitionSource)) &&
    typeof c.nameEditUsed === "boolean"
  );
}
export function validateSave(value: unknown): asserts value is RosterSave {
  if (!value || typeof value !== "object")
    throw Error("セーブデータが破損しています。");
  const s = value as Record<string, unknown>;
  if (
    s.schemaVersion !== 2 ||
    !Array.isArray(s.roster) ||
    s.roster.length > 15 ||
    !s.roster.every(validCharacter) ||
    !Array.isArray(s.archive) ||
    !s.archive.every(validCharacter) ||
    !Array.isArray(s.completedRewardIds) ||
    !s.completedRewardIds.every((x) => typeof x === "string")
  )
    throw Error("セーブデータが破損しているか旧形式です。");
  const chars = [...s.roster, ...s.archive] as Character[];
  if (
    new Set(chars.map((c) => c.characterId)).size !== chars.length ||
    new Set(s.completedRewardIds).size !== s.completedRewardIds.length
  )
    throw Error("セーブデータのIDが重複しています。");
  if (s.pendingReward !== undefined) {
    const r = s.pendingReward as Record<string, unknown> | null;
    if (
      !r ||
      typeof r !== "object" ||
      typeof r.id !== "string" ||
      s.completedRewardIds.includes(r.id) ||
      !Number.isInteger(r.rngState) ||
      !["pending", "skipped", "failed", "succeeded"].includes(
        String(r.scoutStatus),
      ) ||
      !["pending", "skipped", "chosen"].includes(String(r.promotionStatus)) ||
      !r.result ||
      typeof r.result !== "object" ||
      (r.result as Record<string, unknown>).id !== r.id ||
      !Array.isArray((r.result as Record<string, unknown>).participants) ||
      (r.scoutStatus === "succeeded" && !validCharacter(r.scouted))
    )
      throw Error("報酬データが破損しています。");
    const result = r.result as Record<string, unknown>;
    const participants = result.participants as Participant[];
    if (
      result.winner !== "player" ||
      !["headquartersDestroyed", "allUnitsKilled"].includes(
        String(result.reason),
      ) ||
      !participants.length ||
      participants.length > 12 ||
      participants.some(
        (p) =>
          !p ||
          !validCharacter(p.character) ||
          !["player", "cpu"].includes(p.owner) ||
          !p.coord ||
          !Number.isInteger(p.coord.q) ||
          !Number.isInteger(p.coord.r) ||
          !Number.isInteger(p.hp) ||
          p.hp < 0 ||
          typeof p.alive !== "boolean" ||
          p.alive !== p.hp > 0 ||
          !Number.isInteger(p.killsThisBattle) ||
          p.killsThisBattle < 0,
      ) ||
      new Set(participants.map((p) => p.character.characterId)).size !==
        participants.length ||
      participants.some(
        (p) =>
          p.owner === "player" &&
          !(s.roster as Character[]).some(
            (c) => c.characterId === p.character.characterId,
          ),
      ) ||
      (r.scoutStatus === "pending" &&
        result.reason !== "headquartersDestroyed") ||
      (r.scoutStatus !== "succeeded" && r.scouted !== undefined) ||
      (r.scoutStatus === "pending" && r.promotionStatus === "chosen") ||
      (r.promotionStatus === "chosen" &&
        !participants.some(
          (p) =>
            p.owner === "player" &&
            p.alive &&
            p.character.level !== "MAX" &&
            p.character.characterId === r.promotedId,
        ))
    )
      throw Error("報酬データの内容が不正です。");
  }
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE);
    };
    request.onerror = () =>
      reject(request.error ?? Error("保存領域を開けません。"));
    request.onblocked = () =>
      reject(Error("別のタブが保存領域を使用しています。"));
    request.onsuccess = () => resolve(request.result);
  });
}
/** One read-write IndexedDB transaction serializes initialization and every reward transition. */
export async function updateSave(
  seed: number,
  change: (current: RosterSave) => RosterSave,
): Promise<RosterSave> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite"),
        store = tx.objectStore(STORE),
        request = store.get(KEY);
      let result: RosterSave | undefined, failure: unknown;
      request.onsuccess = () => {
        try {
          const current: unknown =
            request.result === undefined
              ? createInitialRoster(seed)
              : request.result;
          validateSave(current);
          result = change(structuredClone(current));
          validateSave(result);
          store.put(result, KEY);
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result!);
      tx.onabort = () =>
        reject(failure ?? tx.error ?? Error("保存が中断されました。"));
      tx.onerror = () => {
        /* onabort reports the final failure */
      };
    });
  } finally {
    db.close();
  }
}
export const loadSave = (seed: number) =>
  updateSave(seed, (current) => current);
