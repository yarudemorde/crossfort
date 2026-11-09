import rules from "../../data/ruleset.characters.json";
import { totalGrowth } from "./growth";
import { nextRandom } from "../game/rng";
import type { Character, ClassId, Level, RosterSave } from "./types";

export const classIds = Object.keys(rules.classes) as ClassId[];

export function stats(c: Character) {
  const base = rules.classes[c.classId],
    growth = totalGrowth(c.growthHistory);
  if (!rules.abilities[c.classId].canCounter) growth.counterTenths = 0;
  const initialHp = Math.max(1, base.hp + c.hpDelta),
    initialAttack = Math.max(1, base.attack + c.attackDelta);
  return {
    ...base,
    hp: initialHp + growth.hp,
    attack: initialAttack + growth.attack,
    initiative: base.initiative + growth.initiative,
    counterTenths: base.counterTenths + growth.counterTenths,
    growth,
    initialHp,
    initialAttack,
  };
}
export function scoutChance(c: Character) {
  const base = rules.classes[c.classId],
    value = stats(c),
    cfg = rules.scout;
  return Math.min(
    cfg.maxPercent,
    Math.max(
      cfg.minPercent,
      cfg.basePercent -
        cfg.perPoint *
          (value.initialHp - base.hp + value.initialAttack - base.attack),
    ),
  );
}
const names = [
  "アルト",
  "レナ",
  "ガルド",
  "ミラ",
  "ユリア",
  "シオン",
  "ルカ",
  "エルナ",
  "カイン",
];
const countries = ["crossfort", "avis", "riskari"];
export function createInitialRoster(seed: number): RosterSave {
  let rng = seed >>> 0;
  const roster: Character[] = [];
  for (const classId of ["knight", "archer", "scout"] as const)
    for (let i = 0; i < 3; i++) {
      let value: number;
      [value, rng] = nextRandom(rng);
      const hpDelta = rules.hpDelta[Math.floor(value * rules.hpDelta.length)];
      [value, rng] = nextRandom(rng);
      const rawAttack =
        rules.attackDelta[Math.floor(value * rules.attackDelta.length)];
      const attackDelta =
        Math.max(1, rules.classes[classId].attack + rawAttack) -
        rules.classes[classId].attack;
      const index = roster.length,
        name = names[index];
      roster.push({
        characterId: `starter-${seed >>> 0}-${index}`,
        originalName: name,
        displayName: name,
        affiliationId: countries[index % countries.length],
        classId,
        hpDelta,
        attackDelta,
        level: 1,
        growthHistory: [],
        battlesParticipated: 0,
        kills: 0,
        acquisitionSource: "starter",
        nameEditUsed: false,
      });
    }
  return { schemaVersion: 3, roster, archive: [], completedRewardIds: [] };
}
export function recruitReplacement(
  save: RosterSave,
  classId: ClassId,
  id: string,
): RosterSave {
  if (
    save.pendingReward ||
    save.roster.length >= rules.replacementBelow ||
    save.roster.length >= rules.rosterLimit
  )
    throw Error("補充できません。");
  if (
    !id ||
    [...save.roster, ...save.archive].some((c) => c.characterId === id)
  )
    throw Error("IDが重複しています。");
  const name = "補充兵",
    base = rules.classes[classId];
  if (!base) throw Error("不明な職業です。");
  return {
    ...save,
    roster: [
      ...save.roster,
      {
        characterId: id,
        originalName: name,
        displayName: name,
        affiliationId: "crossfort",
        classId,
        hpDelta: -3,
        attackDelta: Math.max(1, base.attack - 1) - base.attack,
        level: 1,
        growthHistory: [],
        battlesParticipated: 0,
        kills: 0,
        acquisitionSource: "replacement",
        nameEditUsed: false,
      },
    ],
  };
}
export function cleanName(input: string): string {
  const clean = input
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .trim();
  if (!clean || [...clean].length > 20)
    throw Error("名前は1〜20文字で入力してください。");
  return clean;
}
export function rename(
  save: RosterSave,
  id: string,
  input: string,
): RosterSave {
  if (save.pendingReward) throw Error("報酬処理中は変更できません。");
  const clean = cleanName(input);
  const c = save.roster.find((p) => p.characterId === id);
  if (!c || c.nameEditUsed) throw Error("名前を変更できません。");
  return {
    ...save,
    roster: save.roster.map((p) =>
      p.characterId === id
        ? { ...p, displayName: clean, nameEditUsed: true }
        : p,
    ),
  };
}
export function retire(save: RosterSave, id: string): RosterSave {
  if (save.pendingReward) throw Error("報酬処理中は変更できません。");
  const c = save.roster.find((p) => p.characterId === id);
  if (!c) throw Error("キャラクターが見つかりません。");
  return {
    ...save,
    roster: save.roster.filter((p) => p.characterId !== id),
    archive: [...save.archive, c],
  };
}
export function validateFormation(
  ids: string[],
  roster: Character[],
): string | undefined {
  if (
    !ids.length ||
    ids.length > rules.formationLimit ||
    new Set(ids).size !== ids.length
  )
    return "編成は1〜6名です。";
  const chosen = ids.map((id) => roster.find((c) => c.characterId === id));
  if (chosen.some((c) => !c)) return "所持していないキャラクターです。";
  if (
    chosen.reduce((sum, c) => sum + rules.classes[c!.classId].cost, 0) >
    rules.formationBudget
  )
    return "編成コストが10を超えています。";
}
export function nextLevel(level: Level): Level {
  return level === 1 ? 2 : level === 2 ? 3 : "MAX";
}
