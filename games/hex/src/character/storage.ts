import type { Character, Participant, RosterSave } from "./types";
import { createInitialRoster, stats } from "./roster";
import { beginReward, sameCharacter } from "./reward";
import { validCharacter } from "./validation";
import { validGrowth } from "./growth";
import { nextLevel } from "./roster";
import { migrateSave, recoverDeployment } from "./migration";
import { battleResult } from "./battle";

const DB_NAME = "crossfort-hex-characters-v2";
const STORE = "saves";
const KEY = "active";
export { validCharacter } from "./validation";
export function validateSave(value: unknown): asserts value is RosterSave {
  if (!value || typeof value !== "object")
    throw Error("セーブデータが破損しています。");
  const s = value as Record<string, unknown>;
  if (
    s.schemaVersion !== 3 ||
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
          p.hp > stats(p.character).hp ||
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
          !(s.roster as Character[]).some((c) => sameCharacter(c, p.character)),
      ) ||
      (r.scoutStatus === "pending" &&
        result.reason !== "headquartersDestroyed") ||
      (r.scoutStatus !== "succeeded" && r.scouted !== undefined) ||
      (r.scoutStatus === "succeeded" &&
        !participants.some(
          (p) =>
            p.owner === "cpu" &&
            p.alive &&
            sameCharacter(
              {
                ...p.character,
                acquisitionSource: "scout",
                nameEditUsed: (r.scouted as Character).nameEditUsed,
                displayName: (r.scouted as Character).nameEditUsed
                  ? (r.scouted as Character).displayName
                  : p.character.displayName,
              },
              r.scouted as Character,
            ),
        )) ||
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
    const promotion = (r as unknown as import("./types").Reward)
      .promotionResult;
    const promoted = participants.find(
      (p) => p.character.characterId === r.promotedId,
    )?.character;
    if (
      r.promotionStatus === "chosen"
        ? !promotion ||
          !promoted ||
          promotion.characterId !== r.promotedId ||
          promotion.fromLevel !== promoted.level ||
          promotion.toLevel !== nextLevel(promoted.level) ||
          !validGrowth(promotion.gain)
        : promotion !== undefined || r.promotedId !== undefined
    )
      throw Error("成長結果が不正です。");
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
        request = store.get(KEY),
        battleRequest = store.get("battle");
      let result: RosterSave | undefined, failure: unknown;
      battleRequest.onsuccess = () => {
        try {
          const raw = request.result;
          const current =
            raw === undefined ? createInitialRoster(seed) : migrateSave(raw);
          const legacyBattle =
            battleRequest.result && battleRequest.result.schemaVersion !== 3;
          if ((raw && raw.schemaVersion === 2) || legacyBattle) {
            // Retain the original records in the same transaction, before moving
            // a legacy battle back to its own deployment screen.
            store.put(
              { save: raw, battle: battleRequest.result },
              "legacyBackupV2",
            );
            if (legacyBattle) {
              const recovery = recoverDeployment(battleRequest.result, current);
              if (!current.pendingReward) current.deploymentRecovery = recovery;
              current.migrationNotice =
                "旧方式の戦闘は編成・配置・シードを保持して戦闘前に戻しました。所持兵士と旧データのバックアップは維持しています。";
              store.delete("battle");
            }
          }
          validateSave(current);
          result = change(structuredClone(current));
          validateSave(result);
          if (
            battleRequest.result &&
            !legacyBattle &&
            (JSON.stringify(result.roster) !== JSON.stringify(current.roster) ||
              JSON.stringify(result.archive) !==
                JSON.stringify(current.archive))
          )
            throw Error("戦闘中は所持データを変更できません。");
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

/** Private battle state is stored under another key and is never returned by loadSave. */
type Snapshot = ReturnType<import("./session").CharacterSession["snapshot"]>;
const BATTLE_KEY = "battle";
export async function readBattle(): Promise<Snapshot | undefined> {
  await loadSave(0);
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly"),
        req = tx.objectStore(STORE).get(BATTLE_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
export async function persistBattle(
  snapshot: Snapshot,
  expectedRevision?: number,
): Promise<RosterSave> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite"),
        store = tx.objectStore(STORE);
      const rosterReq = store.get(KEY),
        battleReq = store.get(BATTLE_KEY);
      let result: RosterSave, failure: unknown;
      battleReq.onsuccess = () => {
        try {
          const save = rosterReq.result;
          validateSave(save);
          const current = battleReq.result as Snapshot | undefined;
          if (
            expectedRevision === undefined
              ? !!current
              : !current ||
                current.config.id !== snapshot.config.id ||
                current.revision !== expectedRevision
          )
            throw Error(
              "別のタブで戦闘が更新されました。再読み込みしてください。",
            );
          if (
            save.pendingReward ||
            save.completedRewardIds.includes(snapshot.config.id)
          )
            throw Error("この戦闘は処理済みです。");
          if (
            snapshot.config.team.some(
              (c) => !save.roster.some((own) => sameCharacter(own, c)),
            )
          )
            throw Error("出撃時の所持データと一致しません。");
          result = { ...save };
          delete result.deploymentRecovery;
          if (save.deploymentRecovery) store.put(result, KEY);
          if (snapshot.battle.outcome?.winner === "player") {
            result = beginReward(
              result,
              battleResult(snapshot.battle),
              snapshot.config.seed ^ 0x3c6ef372,
            );
            validateSave(result);
            store.put(result, KEY);
            store.delete(BATTLE_KEY);
          } else store.put(snapshot, BATTLE_KEY);
        } catch (e) {
          failure = e;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(failure ?? tx.error ?? Error("戦闘を保存できません。"));
    });
  } finally {
    db.close();
  }
}
export async function discardBattle() {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(BATTLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
