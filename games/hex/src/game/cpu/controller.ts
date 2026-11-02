import tuning from "../../../data/prototype.tuning.json";
import type { Action, GameState } from "../types";
import { getObservation } from "../selectors/observation";
import { getLegalActions } from "../selectors/legal";
import { chooseCpuAction } from "./ai";
/** Infrastructure gate: the policy itself receives only its own observation. */
export function getCpuTurnAction(state: GameState): Action {
  let lastEnd = state.commands.length - 1;
  while (lastEnd >= 0 && state.commands[lastEnd].action.type !== "endTurn")
    lastEnd--;
  const count = state.commands.length - lastEnd - 1;
  if (count >= tuning.cpu.maxActionsPerTurn) return { type: "endTurn" };
  const observation = getObservation(state, "cpu");
  const publicConfig = { cards: state.config.cards, rules: state.config.rules };
  return chooseCpuAction(
    observation,
    getLegalActions(observation, publicConfig),
    state.seed + state.commands.length,
    publicConfig,
  );
}
