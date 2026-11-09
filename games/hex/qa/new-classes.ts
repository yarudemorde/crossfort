// Uses the exact session fixtures covered by unit/Worker tests. Vite development only.
import { specialtySession } from "../tests/class-session-helpers";
import {
  discardBattle,
  updateSave,
  persistBattle,
} from "../src/character/storage";
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "button[data-class]",
)) {
  button.onclick = async () => {
    const output = document.querySelector("output")!;
    try {
      const cls = button.dataset.class as "medic" | "cavalry";
      await discardBattle();
      const game = specialtySession(cls);
      await updateSave(0, (s) => ({
        ...s,
        roster: game.snapshot().config.team,
        pendingReward: undefined,
      }));
      await persistBattle(game.snapshot());
      output.textContent = `準備完了：${cls}。通常ゲームから回復・3マス移動後の突撃を操作できます。`;
    } catch (e) {
      output.textContent = String(e);
    }
  };
}
