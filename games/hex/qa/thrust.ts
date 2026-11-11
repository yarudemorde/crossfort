import { thrustFixture } from "./thrust-fixtures";
import {
  discardBattle,
  updateSave,
  persistBattle,
} from "../src/character/storage";
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "button[data-scenario]",
))
  button.onclick = async () => {
    const output = document.querySelector("output")!;
    try {
      button.disabled = true;
      const game = thrustFixture(
        button.dataset.scenario as "attack" | "counter" | "diagonal",
      );
      await discardBattle();
      await updateSave(0, (s) => ({
        ...s,
        roster: game.snapshot().config.team,
        pendingReward: undefined,
      }));
      await persistBattle(game.snapshot());
      output.textContent = `準備完了：${button.dataset.scenario}`;
    } catch (e) {
      output.textContent = String(e);
    } finally {
      button.disabled = false;
    }
  };
