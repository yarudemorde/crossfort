/** Public definitions only. Full map terrain is loaded exclusively in the game worker. */
import cardData from "../../data/cards.prototype.json";
import rules from "../../data/ruleset.prototype.json";
import type { CardDefinition, DecisionConfig } from "../game/types";
export const cards = cardData.cards as CardDefinition[];
export { default as maps } from "./maps.catalog.json";
export const uiConfig: DecisionConfig = {
  cards: Object.fromEntries(cards.map((c) => [c.id, c])),
  rules,
};
