import { CharacterSession } from "../src/character/session";
import {
  loadSave,
  discardBattle,
  persistBattle,
} from "../src/character/storage";
import { chooseAction } from "../src/character/cpu";
import { headquartersFor } from "../src/character/combat";
import { neighbors } from "../src/game/rules/hex";
import { maps } from "../src/game/data";

document.querySelector<HTMLButtonElement>("#run")!.onclick = async (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const output = document.querySelector("output")!;
  button.disabled = true;
  try {
    const save = await loadSave(1);
    if (save.pendingReward) throw Error("未完了の報酬を先に確定してください。");
    const team = ["knight", "archer", "scout"].flatMap((classId) =>
      save.roster.filter((c) => c.classId === classId).slice(0, 2),
    );
    const map = maps.find((m) => m.id === "crossing-small")!;
    const slots = neighbors(headquartersFor(map).player);
    for (let seed = 1; seed <= 40; seed++) {
      const game = new CharacterSession({
        id: `local-qa-${crypto.randomUUID()}`,
        seed,
        mapId: map.id,
        first: "player",
        team,
        placements: Object.fromEntries(
          team.map((c, i) => [c.characterId, slots[i]]),
        ),
      });
      let state = game.view();
      for (let step = 0; step < 800 && !state.observation.outcome; step++) {
        if (state.observation.activePlayer === "cpu") state = game.cpu();
        else {
          const action = chooseAction(state.observation, seed + step);
          if (action.type === "pass") state = game.act(action);
          else {
            state = game.move(action.actorId, action.path);
            state = game.act(chooseAction(state.observation, seed + step + 1));
          }
        }
      }
      if (
        state.observation.outcome?.winner !== "player" ||
        state.result?.reason !== "headquartersDestroyed" ||
        !state.result.participants.some((p) => p.owner === "cpu" && p.alive)
      )
        continue;
      await discardBattle();
      await persistBattle(game.snapshot());
      output.textContent = `完了: seed ${seed} / ${state.observation.actionNumber}手 / ${state.result.reason} / 降伏兵あり。ゲームを開くと報酬から再開します。`;
      return;
    }
    throw Error("40シード内に降伏兵のいる勝利なし。");
  } catch (error) {
    output.textContent = String(error);
  } finally {
    button.disabled = false;
  }
};
