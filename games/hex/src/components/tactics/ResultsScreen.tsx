import { useState } from "react";
import type { CharacterGame } from "../../app/useCharacterGame";
import { stats, scoutChance, nextLevel } from "../../character/roster";
import {
  decideScout,
  promote,
  commitVictory,
  renameScout,
} from "../../character/reward";
import { Icon, SoldierBadge, classNames } from "./Icons";
import type { Character } from "../../character/types";
export function ResultsScreen({
  game: g,
  onDetail,
}: {
  game: CharacterGame;
  onDetail: (c: Character) => void;
}) {
  const r = g.pending!;
  // The casualty list remains available on every victory, including all-unit
  // victories and reward sessions resumed after a reload.
  const [overview, setOverview] = useState(true);
  const dead = r.result.participants.filter(
      (p) => p.owner === "player" && !p.alive,
    ).length,
    canRecruit = g.save!.roster.length - dead < 15;
  const stage = overview
    ? "results"
    : r.scoutStatus === "pending"
      ? "scout"
      : r.promotionStatus === "pending"
        ? "promote"
        : "done";
  return (
    <main className="hx-workspace hx-rewards">
      <div className="hx-result-heading">
        <Icon name="flag" size={34} />
        <div>
          <span className="hx-eyebrow">VICTORY</span>
          <h1>戦勝</h1>
        </div>
        <span className="hx-victory-reason">
          {r.result.reason === "headquartersDestroyed"
            ? "敵本城を破壊"
            : "敵軍を全滅"}
        </span>
      </div>
      <div className="hx-reward-steps">
        <span className={stage === "results" ? "active" : ""}>戦果</span>
        <i />
        <span className={stage === "scout" ? "active" : ""}>勧誘</span>
        <i />
        <span className={stage === "promote" ? "active" : ""}>強化</span>
        <i />
        <span className={stage === "done" ? "active" : ""}>帰還</span>
      </div>
      <div className="hx-list-scroll">
        {stage === "results" && (
          <>
            {(["player", "cpu"] as const).map((owner) => (
              <section className="hx-result-army" key={owner}>
                <h2>{owner === "player" ? "自軍" : "敵軍"}</h2>
                {r.result.participants
                  .filter((p) => p.owner === owner)
                  .map((p) => (
                    <button
                      className={`hx-soldier-row ${!p.alive ? "fallen" : ""}`}
                      key={p.character.characterId}
                      onClick={() => onDetail(p.character)}
                    >
                      <SoldierBadge
                        character={p.character}
                        enemy={owner === "cpu"}
                        hp={p.hp}
                      />
                      <span className="hx-soldier-name">
                        <strong>{p.character.displayName}</strong>
                        <small>
                          {classNames[p.character.classId]} · 撃破{" "}
                          {p.killsThisBattle}
                        </small>
                      </span>
                      <b
                        className={p.alive ? "hx-status-alive" : "danger-text"}
                      >
                        {p.alive
                          ? owner === "cpu" &&
                            r.result.reason === "headquartersDestroyed"
                            ? "降伏"
                            : "生存"
                          : "戦死"}
                      </b>
                    </button>
                  ))}
              </section>
            ))}
            {dead > 0 && (
              <p className="hx-loss-note">
                戦死した味方{dead}名は、戦果の確定とともに永久喪失します。
              </p>
            )}
          </>
        )}
        {stage === "scout" && (
          <>
            <div className="hx-stage-title">
              <h2>降伏兵を迎える</h2>
              <p>勧誘は1名に1回。失敗しても再挑戦できません。</p>
            </div>
            {!canRecruit && (
              <p className="hx-loss-note">
                所持上限に達しています。今回は勧誘を見送ります。
              </p>
            )}
            {r.result.participants
              .filter((p) => p.owner === "cpu" && p.alive)
              .map((p) => (
                <button
                  className="hx-soldier-row"
                  disabled={g.busy || !canRecruit}
                  key={p.character.characterId}
                  onClick={() =>
                    void g.change((s) =>
                      decideScout(s, p.character.characterId),
                    )
                  }
                >
                  <SoldierBadge character={p.character} />
                  <span className="hx-soldier-name">
                    <strong>{p.character.displayName}</strong>
                    <small>
                      {classNames[p.character.classId]} Lv.{p.character.level} ·
                      HP差{p.character.hpDelta >= 0 ? "+" : ""}
                      {p.character.hpDelta} / 攻撃差
                      {p.character.attackDelta >= 0 ? "+" : ""}
                      {p.character.attackDelta}
                    </small>
                  </span>
                  <span className="hx-scout-chance">
                    <b>{scoutChance(p.character)}%</b>
                    <small>勧誘</small>
                  </span>
                </button>
              ))}
          </>
        )}
        {stage === "promote" && (
          <>
            <div className="hx-reward-announcement" role="status">
              {r.scoutStatus === "succeeded"
                ? `${r.scouted?.displayName}が加入します`
                : r.scoutStatus === "failed"
                  ? "勧誘は失敗しました"
                  : "勧誘を見送りました"}
            </div>
            <div className="hx-stage-title">
              <h2>戦功を讃える</h2>
              <p>生存した出撃兵1名を強化します。</p>
            </div>
            {r.result.participants
              .filter(
                (p) =>
                  p.owner === "player" &&
                  p.alive &&
                  p.character.level !== "MAX",
              )
              .map((p) => {
                const a = stats(p.character),
                  b = stats({
                    ...p.character,
                    level: nextLevel(p.character.level),
                  });
                return (
                  <button
                    className="hx-promotion-row"
                    key={p.character.characterId}
                    disabled={g.busy}
                    onClick={() =>
                      void g.change((s) => promote(s, p.character.characterId))
                    }
                  >
                    <SoldierBadge character={p.character} />
                    <span>
                      <strong>{p.character.displayName}</strong>
                      <small>
                        Lv.{p.character.level} → {nextLevel(p.character.level)}
                      </small>
                    </span>
                    <span>
                      <b>
                        HP {a.hp} → {b.hp}
                      </b>
                      <small>
                        攻撃 {a.attack} → {b.attack}
                      </small>
                    </span>
                    <Icon name="chevron" />
                  </button>
                );
              })}
          </>
        )}
        {stage === "done" && (
          <div className="hx-return-summary">
            <Icon name="shield" size={58} />
            <h2>軍営へ帰還</h2>
            <p>生存者は全回復します。</p>
            <dl className="hx-detail-lines">
              <div>
                <dt>強化</dt>
                <dd>
                  {r.promotedId
                    ? r.result.participants.find(
                        (p) => p.character.characterId === r.promotedId,
                      )?.character.displayName
                    : "対象なし"}
                </dd>
              </div>
              <div>
                <dt>勧誘</dt>
                <dd>
                  {r.scoutStatus === "succeeded"
                    ? "成功"
                    : r.scoutStatus === "failed"
                      ? "失敗"
                      : "なし"}
                </dd>
              </div>
              <div>
                <dt>戦死</dt>
                <dd>{dead}名</dd>
              </div>
            </dl>
            {r.scouted && !r.scouted.nameEditUsed && (
              <ScoutName
                busy={g.busy}
                name={r.scouted.displayName}
                onSave={(n) => g.change((s) => renameScout(s, n))}
              />
            )}
          </div>
        )}
      </div>
      <footer className="hx-workspace-footer">
        {stage === "results" ? (
          <button
            className="hx-button primary hx-wide"
            onClick={() => setOverview(false)}
          >
            報酬へ進む
            <Icon name="chevron" />
          </button>
        ) : stage === "scout" ? (
          <button
            className="hx-button hx-wide"
            disabled={g.busy}
            onClick={() => void g.change((s) => decideScout(s))}
          >
            勧誘を見送る
          </button>
        ) : stage === "done" ? (
          <button
            className="hx-button primary hx-wide"
            disabled={g.busy}
            onClick={async () => {
              if (await g.change(commitVictory)) g.setScreen("home");
            }}
          >
            戦果を確定して帰還
          </button>
        ) : (
          <span className="hx-footer-hint">強化する兵士を選択</span>
        )}
      </footer>
    </main>
  );
}
function ScoutName({
  name,
  busy,
  onSave,
}: {
  name: string;
  busy: boolean;
  onSave: (n: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false),
    [value, setValue] = useState(name);
  return editing ? (
    <form
      className="hx-name-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onSave(value)) setEditing(false);
      }}
    >
      <label>
        加入時の名前
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={40}
        />
      </label>
      <button className="hx-button" disabled={busy}>
        名前を確定
      </button>
    </form>
  ) : (
    <button className="hx-button hx-wide" onClick={() => setEditing(true)}>
      加入する兵士の名前を変更
    </button>
  );
}
