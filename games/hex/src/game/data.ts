import cardData from "../../data/cards.prototype.json";
import mapData from "../../data/maps.prototype.json";
import additionalMaps from "../../data/maps.additional.prototype.json";
import rules from "../../data/ruleset.prototype.json";
import type { CardDefinition, GameConfig, MapDefinition } from "./types";
export const cards = cardData.cards as CardDefinition[];
export const maps = [...mapData.maps, ...additionalMaps.maps] as MapDefinition[];
export const defaultDeck = [...cardData.decks.player];
export const defaultConfig: GameConfig = {
  cards: Object.fromEntries(cards.map((c) => [c.id, c])),
  maps: Object.fromEntries(maps.map((m) => [m.id, m])),
  rules,
};
export function validateDeck(
  deck: string[],
  config = defaultConfig,
): string | undefined {
  if (deck.length !== config.rules.deck.count)
    return "デッキは16枚で構成してください。";
  if (new Set(deck).size !== config.rules.deck.uniqueDefinitions)
    return "同じカードは採用できません。16種類が必要です。";
  if (deck.some((id) => !config.cards[id]))
    return "未定義のカードが含まれています。";
}
export function validateConfig(config: GameConfig): void {
  for (const c of Object.values(config.cards)) {
    if (
      !Number.isInteger(c.cost) ||
      c.cost < 1 ||
      !Number.isInteger(c.resource) ||
      c.resource < 1 ||
      c.resource > 3
    )
      throw Error(`不正なカード値: ${c.id}`);
    if (
      c.type !== "spell" &&
      (!Number.isInteger(c.power) ||
        c.power! < 1 ||
        !Number.isInteger(c.vision) ||
        c.vision! < 1)
    )
      throw Error(`不正な戦力・視野: ${c.id}`);
    if (
      c.type === "unit" &&
      (![0, 1, 2, 3].includes(c.movement!) || ![1, 2].includes(c.range!))
    )
      throw Error(`不正な移動・射程: ${c.id}`);
    if (c.type === "landmark" && ![1, 2].includes(c.territory!))
      throw Error(`不正な領土: ${c.id}`);
    if (
      c.type === "spell" &&
      (!c.effects?.length ||
        c.effects.some(
          (e) =>
            !["heal", "directDamage", "reveal", "temporaryPowerBonus"].includes(
              e.effectId,
            ) ||
            (e.effectId === "reveal"
              ? !Number.isInteger(e.radius) || e.radius! < 1
              : !Number.isInteger(e.amount) || e.amount! < 1),
        ))
    )
      throw Error(`不正な効果: ${c.id}`);
  }
}
