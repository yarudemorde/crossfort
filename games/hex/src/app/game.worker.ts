/// <reference lib="webworker" />
import { createGame, applyAction } from "../game/engine";
import { getObservation } from "../game/selectors/observation";
import { getLegalActions } from "../game/selectors/legal";
import { getCpuTurnAction } from "../game/cpu/controller";
import type { GameState } from "../game/types";
import type { Request, Response } from "./protocol";
let state: GameState;
self.onmessage = (message: MessageEvent<Request>) => {
  const request = message.data;
  try {
    let error: string | undefined;
    let start = state?.actionLog.length ?? 0;
    if (request.type === "new") {
      state = createGame(
        request.seed,
        request.mapId,
        undefined,
        undefined,
        request.first,
      );
      start = 0;
    } else if (request.type === "action") {
      const result = applyAction(state, request.action, "player");
      state = result.state;
      error = result.error;
    } else if (
      request.type === "cpu" &&
      state.activePlayer === "cpu" &&
      !state.outcome
    ) {
      const action = getCpuTurnAction(state);
      const result = applyAction(state, action, "cpu");
      state = result.state;
      error = result.error;
    } else if (request.type === "replay") {
      state = createGame(
        request.seed,
        request.mapId,
        undefined,
        undefined,
        request.first,
      );
      let index = 0;
      let guard = 0;
      while (!state.outcome && guard++ < 20000) {
        if (state.activePlayer === "player") {
          if (index >= request.actions.length) break;
          const r = applyAction(state, request.actions[index++], "player");
          if (r.error) throw Error(r.error);
          state = r.state;
        } else {
          const r = applyAction(state, getCpuTurnAction(state), "cpu");
          if (r.error) throw Error(r.error);
          state = r.state;
        }
      }
      start = state.actionLog.length;
    }
    const observation = getObservation(state, "player");
    const response: Response = {
      observation,
      legal: getLegalActions(observation, {
        cards: state.config.cards,
        rules: state.config.rules,
      }),
      events: observation.events.filter((e) => e.id > start),
      error,
      cpuBusy: state.activePlayer === "cpu" && !state.outcome,
    };
    self.postMessage(response);
  } catch (e) {
    self.postMessage({
      error: e instanceof Error ? e.message : "ゲーム処理に失敗しました。",
    });
  }
};
