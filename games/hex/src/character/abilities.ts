import rules from "../../data/ruleset.characters.json";
import { hexDistance } from "../game/rules/hex";
import { stats } from "./roster";
import type { Character, Participant } from "./types";

export const ability = (character: Character) =>
  rules.abilities[character.classId];
export const canAttack = (character: Character) =>
  ability(character).action === "attack";
export const canCounter = (character: Character) =>
  ability(character).canCounter;

/** Only the completed three-hex route of this action can empower an attack on a soldier. */
export function chargeBonus(
  character: Character,
  movedHexes: number,
  unitTarget = true,
): number {
  const a = ability(character);
  return unitTarget && a.chargeSteps > 0 && movedHexes === a.chargeSteps
    ? a.chargeAttack
    : 0;
}

export function healingPower(character: Character): number {
  return Math.round(
    (stats(character).attack * ability(character).healTenths) / 10,
  );
}

/** Healing has no terrain penalty, damage, counterattack or resurrection. */
export function resolveHealing(healer: Participant, target: Participant) {
  const distance = hexDistance(healer.coord, target.coord);
  if (
    ability(healer.character).action !== "heal" ||
    !healer.alive ||
    !target.alive ||
    healer.owner !== target.owner ||
    healer.character.characterId === target.character.characterId ||
    distance < 1 ||
    distance > stats(healer.character).range ||
    target.hp >= stats(target.character).hp
  )
    throw Error("回復対象が不正です。");
  const amount = Math.min(
    healingPower(healer.character),
    stats(target.character).hp - target.hp,
  );
  return { target: { ...target, hp: target.hp + amount }, amount };
}
