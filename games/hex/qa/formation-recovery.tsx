// Local Vite-only harness: not included in the public build.
import { createRoot } from "react-dom/client";
import { useCharacterGame } from "../src/app/useCharacterGame";
import { Formation } from "../src/components/tactics/CampScreens";
import { DeploymentBar } from "../src/components/tactics/DeploymentBar";
import { beginReward, promote, commitVictory } from "../src/character/reward";
import { recruitReplacement } from "../src/character/roster";
import "../src/app/character.css";

function FormationRecovery() {
  const g = useCharacterGame();
  if (!g.save) return <p>保存データを読込中</p>;
  return (
    <div className="hx-shell">
      <header style={{ padding: 8, flexShrink: 0 }}>
        <strong>開発専用：勝利後の編成引き継ぎ</strong>
        <div>
          <button
            disabled={g.busy || g.chosen.length !== 6}
            onClick={() => {
              void g.change((s) => {
                const reward = beginReward(
                  s,
                  {
                    id: `formation-qa-${crypto.randomUUID()}`,
                    winner: "player",
                    reason: "allUnitsKilled",
                    participants: g.chosen.map((character, i) => ({
                      character,
                      owner: "player",
                      coord: { q: i, r: 0 },
                      hp: i === 0 ? 1 : 0,
                      alive: i === 0,
                      killsThisBattle: i === 0 ? 2 : 0,
                    })),
                  },
                  7,
                );
                return commitVictory(promote(reward, g.chosen[0].characterId));
              });
            }}
          >
            6名中5名戦死の勝利を確定
          </button>
          <button
            disabled={g.busy || g.save.roster.length >= 6}
            onClick={() => {
              void g.change((s) =>
                recruitReplacement(s, "scout", crypto.randomUUID()),
              );
            }}
          >
            斥候を無料補充
          </button>
          <button
            disabled={g.busy}
            onClick={() =>
              g.setPlacements(
                Object.fromEntries(
                  g.formation.map((id, i) => [id, g.slots[i]]),
                ),
              )
            }
          >
            隣接6マスに配置
          </button>
        </div>
        <output aria-label="検証状態">
          {g.screen} / 所持{g.save.roster.length} / 編成{g.formation.length} /
          実体{g.chosen.length} / コスト{g.cost} / 戦死{g.save.archive.length}
        </output>
        <p role="alert">{g.error}</p>
        <a href="/">通常ゲームへ戻る</a>
      </header>
      {g.screen !== "deployment" && g.screen !== "battle" && (
        <Formation game={g} />
      )}
      {g.screen === "deployment" && <DeploymentBar game={g} />}
      {g.screen === "battle" && (
        <output>
          戦闘開始済み：自軍
          {g.view?.participants.filter((p) => p.owner === "player").length}名
        </output>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<FormationRecovery />);
