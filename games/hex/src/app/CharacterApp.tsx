import { useEffect, useState } from "react";
import { useCharacterGame, newCharacterId } from "./useCharacterGame";
import { CharacterBoard } from "../components/character/CharacterBoard";
import { BattleHUD } from "../components/tactics/BattleHUD";
import { BattleActionBar } from "../components/tactics/BattleActionBar";
import {
  CampHome,
  Barracks,
  Formation,
  SoldierDetails,
} from "../components/tactics/CampScreens";
import { DeploymentBar } from "../components/tactics/DeploymentBar";
import { ResultsScreen } from "../components/tactics/ResultsScreen";
import { SettingsPanel } from "../components/tactics/SettingsPanel";
import { Sheet } from "../components/tactics/Sheet";
import {
  Icon,
  SoldierBadge,
  classNames,
  type IconName,
} from "../components/tactics/Icons";
import { rename, retire, recruitReplacement } from "../character/roster";
import type { Character, ClassId } from "../character/types";
import "./character.css";
import "./terrain.css";
type Panel =
  | "menu"
  | "settings"
  | "help"
  | "records"
  | "replacement"
  | "soldier"
  | "chronicle"
  | "terrain";
const panelNames: Record<Panel, string> = {
  menu: "軍令",
  settings: "戦場設定",
  help: "遊び方",
  records: "戦績",
  replacement: "補充兵を迎える",
  soldier: "兵士の詳細",
  chronicle: "戦況記録",
  terrain: "地形効果",
};
export default function CharacterApp() {
  const g = useCharacterGame();
  const [panel, setPanel] = useState<Panel>();
  const [detail, setDetail] = useState<Character>();
  const [attackIntent, setAttackIntent] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    const measure = () =>
      document.documentElement.style.setProperty(
        "--hx-viewport",
        `${viewport?.height ?? window.innerHeight}px`,
      );
    measure();
    viewport?.addEventListener("resize", measure);
    window.addEventListener("resize", measure);
    return () => {
      viewport?.removeEventListener("resize", measure);
      window.removeEventListener("resize", measure);
      document.documentElement.style.removeProperty("--hx-viewport");
    };
  }, []);
  useEffect(() => {
    setAttackIntent(false);
  }, [g.selection, g.movePreview, g.view?.pendingActorId]);
  useEffect(() => {
    if (!g.error) return;
    const timer = setTimeout(() => g.setError(""), 6000);
    return () => clearTimeout(timer);
  }, [g.error]);
  const openDetail = (c: Character) => {
    setDetail(c);
    setPanel("soldier");
  };
  const selected = g.view?.participants.find(
    (p) => p.character.characterId === g.selection,
  );
  const currentDetail =
    g.save?.roster.find((c) => c.characterId === detail?.characterId) ?? detail;
  const titles = {
    home: "本陣",
    barracks: "兵舎",
    formation: "部隊編成",
    deployment: `${g.mapInfo.name.replace("（仮）", "")} · ${g.mapInfo.hexCount}マス`,
    battle: "戦場",
    defeat: "敗北",
    reward: "戦果",
  };
  if (!g.save)
    return (
      <main className="hx-loading">
        <Icon name="flag" size={36} />
        <span>{g.error || "軍営を読み込み中"}</span>
      </main>
    );
  return (
    <div className="hx-shell" data-screen={g.screen}>
      <BattleHUD
        view={g.screen === "battle" ? g.view : undefined}
        title={titles[g.screen]}
        menuOpen={!!panel}
        onMenu={() => setPanel(g.screen === "deployment" ? "settings" : "menu")}
        onBack={
          g.screen === "formation" || g.screen === "barracks"
            ? () => g.setScreen("home")
            : g.screen === "deployment"
              ? () => g.setScreen("formation")
              : undefined
        }
      />
      {g.screen === "home" && (
        <CampHome
          game={g}
          onBarracks={() => g.setScreen("barracks")}
          onRecords={() => setPanel("records")}
          onSettings={() => setPanel("settings")}
        />
      )}
      {g.screen === "barracks" && (
        <Barracks
          game={g}
          onDetail={openDetail}
          onReplacement={() => setPanel("replacement")}
        />
      )}
      {g.screen === "formation" && <Formation game={g} />}
      {g.screen === "deployment" && (
        <>
          <div className="hx-battle-stage hx-deployment-stage">
            {g.deploymentView ? (
              <CharacterBoard
                view={g.deploymentView}
                legal={[]}
                selected={g.pick}
                onHex={(c) => g.chooseSlot(c)}
                deploymentSlots={g.slots}
                initialCoords={[
                  ...g.slots,
                  g.deploymentView.headquarters.player.coord,
                ]}
              />
            ) : (
              <div className="hx-loading">配置範囲を読み込み中</div>
            )}
            <div className="hx-board-caption">
              <Icon name="flag" size={15} />
              {g.pick
                ? `${g.chosen.find((c) => c.characterId === g.pick)?.displayName} の配置先を選択`
                : "兵士を選んで配置"}
            </div>
          </div>
          <DeploymentBar game={g} />
        </>
      )}
      {g.screen === "battle" && (
        <>
          <div className="hx-battle-stage">
            {g.view && (
              <CharacterBoard
                view={g.view}
                legal={g.response?.legal ?? []}
                selected={g.selection}
                onHex={g.hex}
                path={g.movePreview?.path}
                animation={g.animation}
                attackPreview={g.preview}
              />
            )}
            <button
              className="hx-info-toggle hx-icon-btn"
              aria-label={selected ? "選択兵士の詳細" : "戦況記録"}
              onClick={() =>
                selected
                  ? openDetail(selected.character)
                  : setPanel("chronicle")
              }
            >
              <Icon name={selected ? "knight" : "book"} />
            </button>
          </div>
          <BattleActionBar
            game={g}
            attackIntent={attackIntent}
            onMoveIntent={() => setAttackIntent(false)}
            onAttackIntent={() => setAttackIntent(true)}
            onInspect={() =>
              selected ? openDetail(selected.character) : setPanel("chronicle")
            }
          />
        </>
      )}
      {g.screen === "defeat" && (
        <main className="hx-defeat">
          <Icon name="shield" size={70} />
          <span className="hx-eyebrow">DEFEAT</span>
          <h1>軍旗、墜つ</h1>
          <p>
            {g.view?.outcome?.reason === "allUnitsKilled"
              ? "自軍の出撃部隊が全滅しました。"
              : "自軍本城が陥落しました。"}
          </p>
          <small>所持兵士と戦績は戦闘前の状態に戻ります。</small>
          <div>
            <button
              className="hx-button primary hx-wide"
              disabled={g.busy}
              onClick={g.retry}
            >
              戦闘前に戻る
            </button>
            <button
              className="hx-button hx-wide"
              disabled={g.busy}
              onClick={g.goHome}
            >
              本陣へ帰還
            </button>
          </div>
        </main>
      )}
      {g.screen === "reward" && g.pending && (
        <ResultsScreen game={g} onDetail={openDetail} />
      )}
      {g.error && (
        <div className="hx-toast" role="alert">
          <span>{g.error}</span>
          <button
            className="hx-icon-btn"
            onClick={() => g.setError("")}
            aria-label="通知を閉じる"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {panel && (
        <Sheet
          key={panel}
          title={panelNames[panel]}
          onClose={() => setPanel(undefined)}
        >
          {panel === "menu" && (
            <nav className="hx-menu-list">
              {(
                [
                  ["chronicle", "book", "戦況記録"],
                  ["terrain", "shield", "地形効果"],
                  ["help", "eye", "遊び方"],
                  ["settings", "settings", "設定"],
                ] as [Panel, IconName, string][]
              ).map(([p, i, label]) => (
                <button key={p} onClick={() => setPanel(p)}>
                  <Icon name={i} />
                  {label}
                  <Icon name="chevron" size={16} />
                </button>
              ))}
              <button
                disabled={g.busy}
                onClick={() => {
                  setPanel(undefined);
                  g.goHome();
                }}
              >
                <Icon name="castle" />
                本陣へ
                <Icon name="chevron" size={16} />
              </button>
            </nav>
          )}
          {panel === "settings" && <SettingsPanel game={g} />}
          {panel === "chronicle" && (
            <div className="hx-chronicle">
              {g.chronicle.length ? (
                g.chronicle.map((line, i) => (
                  <p key={i}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    {line}
                  </p>
                ))
              ) : (
                <p className="hx-empty">戦闘記録はまだありません。</p>
              )}
            </div>
          )}
          {panel === "terrain" && (
            <dl className="hx-detail-lines">
              {[
                ["平原", "補正なし"],
                ["森林", "反撃ダメージ +1"],
                ["山岳", "機動 −1 / 反撃 +1"],
                ["湿地", "機動 −2"],
                ["砂漠", "攻撃 −1（最低1）"],
                ["河川", "移動距離1固定"],
              ].map(([a, b]) => (
                <div key={a}>
                  <dt>{a}</dt>
                  <dd>{b}</dd>
                </div>
              ))}
              <p className="hx-muted">
                移動の補正は出発地点で判定。機動は最低1です。
              </p>
            </dl>
          )}
          {panel === "help" && (
            <div className="hx-help">
              <h3>一手、一人。</h3>
              <p>
                兵士を選び、金色のマスで移動先を確認。確定後は赤い敵を選んで攻撃するか、行動を終了します。その場からの攻撃も可能です。
              </p>
              <h3>反撃を読む</h3>
              <p>
                敵が生存し、射程内なら自動で一度反撃します。攻撃前の予測HPを確認してください。受傷しても攻撃力は変わりません。
              </p>
              <h3>霧の向こうへ</h3>
              <p>
                探索した地形は残りますが、敵兵は現在の視野内にいるときだけ見えます。敵本城の場所は公開、HPは視認時だけ表示します。
              </p>
              <h3>戦場を見渡す</h3>
              <p>
                1本指またはマウスのドラッグで移動。2本指ピンチ、ホイールで拡縮。盤面はTabとEnterでも操作できます。
              </p>
              <h3>勝利と帰還</h3>
              <p>
                敵本城の破壊、または敵全滅で勝利。生存者1名を強化し、本城破壊時には降伏兵を勧誘できます。勝利時の戦死者は永久に失われます。敗北時は戦闘前へ戻ります。
              </p>
              <p className="hx-muted">
                このブラウザに自動保存します。再読み込みで戦闘や報酬を再開できます。端末間同期はありません。
              </p>
            </div>
          )}
          {panel === "soldier" && currentDetail && (
            <SoldierDetails
              key={currentDetail.characterId}
              character={currentDetail}
              busy={g.busy}
              onRename={
                g.screen === "barracks"
                  ? (n) =>
                      g.change((s) => rename(s, currentDetail.characterId, n))
                  : undefined
              }
              onRetire={
                g.screen === "barracks"
                  ? async () => {
                      if (
                        !confirm(
                          `${currentDetail.displayName}を除隊しますか？ 元には戻せません。`,
                        )
                      )
                        return false;
                      const ok = await g.change((s) =>
                        retire(s, currentDetail.characterId),
                      );
                      if (ok) setPanel(undefined);
                      return ok;
                    }
                  : undefined
              }
            />
          )}
          {panel === "replacement" && (
            <>
              <p className="hx-muted">
                最低個体値のLv.1補充兵を迎えます。所持6名未満のときに利用できます。
              </p>
              <div className="hx-replacement-options">
                {(["knight", "archer", "scout"] as ClassId[]).map((c) => (
                  <button
                    className="hx-button"
                    disabled={g.busy || g.save!.roster.length >= 6}
                    key={c}
                    onClick={async () => {
                      if (
                        await g.change((s) =>
                          recruitReplacement(s, c, newCharacterId()),
                        )
                      )
                        setPanel(undefined);
                    }}
                  >
                    <Icon name={c} size={28} />
                    <strong>{classNames[c]}</strong>
                    <small>
                      {c === "knight"
                        ? "HP9 / 攻撃5"
                        : c === "archer"
                          ? "HP5 / 攻撃2"
                          : "HP3 / 攻撃1"}
                    </small>
                  </button>
                ))}
              </div>
            </>
          )}
          {panel === "records" && (
            <>
              <div className="hx-record-totals">
                <div>
                  <small>勝利</small>
                  <b>{g.save.completedRewardIds.length}</b>
                </div>
                <div>
                  <small>現役兵士</small>
                  <b>{g.save.roster.length}</b>
                </div>
                <div>
                  <small>戦績アーカイブ</small>
                  <b>{g.save.archive.length}</b>
                </div>
              </div>
              <h3>過去の兵士</h3>
              {g.save.archive.length ? (
                g.save.archive.map((c) => (
                  <div className="hx-archive-row" key={c.characterId}>
                    <SoldierBadge character={c} />
                    <span>
                      <strong>{c.displayName}</strong>
                      <small>
                        出撃 {c.battlesParticipated} / 撃破 {c.kills}
                      </small>
                    </span>
                  </div>
                ))
              ) : (
                <p className="hx-empty">記録はまだありません。</p>
              )}
            </>
          )}
        </Sheet>
      )}
    </div>
  );
}
