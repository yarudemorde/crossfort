import { useState } from "react";
import type { CharacterGame } from "../../app/useCharacterGame";
import type { Character, ClassId } from "../../character/types";
import { stats } from "../../character/roster";
import { Icon, SoldierBadge, classNames, countryNames } from "./Icons";
import { SoldierList } from "./SoldierList";
export function CampHome({
  game: g,
  onBarracks,
  onRecords,
  onSettings,
}: {
  game: CharacterGame;
  onBarracks: () => void;
  onRecords: () => void;
  onSettings: () => void;
}) {
  return (
    <main className="hx-camp">
      <div className="hx-camp-art" aria-hidden="true">
        <svg viewBox="0 0 600 380">
          <path
            d="M0 340 60 290 90 315 155 235 220 270 280 195 350 230 410 180 490 265 540 240 600 310V380H0Z"
            fill="#3d4e44"
          />
          <path
            d="M120 340V220h20v-30h18v30h28v-35h20v35h18v80h45V150h18v-28h20v28h20v150h45V220h20v-35h18v35h24v-30h20v30h20v120Z"
            fill="#192426"
          />
          <path
            d="M274 340v-35a26 26 0 0 1 52 0v35"
            fill="#D2B576"
            opacity=".12"
          />
          <path d="M0 355h600" stroke="#D2B576" opacity=".25" />
        </svg>
      </div>
      <div className="hx-camp-title">
        <span className="hx-eyebrow">CROSSFORT CHRONICLE</span>
        <h1>灰の軍営</h1>
        <p>霧の向こうへ、軍旗を。</p>
      </div>
      <div className="hx-camp-strength">
        <span>
          所持兵士{" "}
          <b>
            {g.save?.roster.length}
            <small>/15</small>
          </b>
        </span>
        <i />
        <span>
          勝利 <b>{g.save?.completedRewardIds.length ?? 0}</b>
        </span>
      </div>
      <button
        className="hx-sortie"
        disabled={g.busy}
        onClick={() => {
          g.setScreen("formation");
        }}
      >
        <Icon name="flag" size={30} />
        <span>
          <strong>出撃</strong>
          <small>部隊を編成する</small>
        </span>
        <Icon name="chevron" />
      </button>
      <nav className="hx-camp-nav">
        <button onClick={onBarracks}>
          <Icon name="knight" size={26} />
          兵舎
        </button>
        <button onClick={onRecords}>
          <Icon name="history" size={26} />
          戦績
        </button>
        <button onClick={onSettings}>
          <Icon name="settings" size={26} />
          設定
        </button>
      </nav>
      <small className="hx-save-note">
        <span />
        このブラウザに自動保存
      </small>
    </main>
  );
}
export function ClassFilter({
  value,
  onChange,
}: {
  value: ClassId | "all";
  onChange: (v: ClassId | "all") => void;
}) {
  return (
    <div className="hx-filters" role="group" aria-label="職業で絞り込み">
      {(["all", "knight", "archer", "scout"] as const).map((c) => (
        <button key={c} aria-pressed={value === c} onClick={() => onChange(c)}>
          {c === "all" ? "全兵士" : classNames[c]}
        </button>
      ))}
    </div>
  );
}
export function Barracks({
  game: g,
  onDetail,
  onReplacement,
}: {
  game: CharacterGame;
  onDetail: (c: Character) => void;
  onReplacement: () => void;
}) {
  const [filter, setFilter] = useState<ClassId | "all">("all");
  return (
    <main className="hx-workspace">
      <div className="hx-page-heading">
        <span>所属兵士</span>
        <strong>
          {g.save?.roster.length}
          <small>/15</small>
        </strong>
      </div>
      <ClassFilter value={filter} onChange={setFilter} />
      <div className="hx-list-scroll">
        <SoldierList
          characters={g.save!.roster.filter(
            (c) => filter === "all" || c.classId === filter,
          )}
          onSelect={onDetail}
        />
        {g.save!.roster.length === 0 && (
          <p className="hx-empty">兵士がいません。補充兵を迎えてください。</p>
        )}
      </div>
      <footer className="hx-workspace-footer">
        <span>少数精鋭を率いる</span>
        <button
          className="hx-button"
          disabled={g.busy || g.save!.roster.length >= 6}
          onClick={onReplacement}
        >
          <Icon name="plus" />
          無料補充
        </button>
      </footer>
    </main>
  );
}
export function Formation({ game: g }: { game: CharacterGame }) {
  const [filter, setFilter] = useState<ClassId | "all">("all"),
    [order, setOrder] = useState<string>();
  return (
    <main className="hx-workspace hx-formation">
      <div className="hx-formation-meter">
        <div>
          <span>
            出撃兵士{" "}
            <b>
              {g.formation.length}
              <small>/6</small>
            </b>
          </span>
          <span>
            編成コスト{" "}
            <b>
              {g.cost}
              <small>/10</small>
            </b>
          </span>
        </div>
        <progress value={g.cost} max={10} aria-label="編成コスト" />
      </div>
      <ClassFilter value={filter} onChange={setFilter} />
      <div className="hx-list-scroll">
        <SoldierList
          characters={g.save!.roster.filter(
            (c) => filter === "all" || c.classId === filter,
          )}
          selected={g.formation}
          onSelect={(c) => g.toggleFormation(c.characterId)}
          disabled={g.busy}
        />
      </div>
      <footer className="hx-formation-footer">
        <div className="hx-lineup-label">
          <span>出撃順</span>
          <div>
            <button
              className="hx-icon-btn"
              disabled={!order || g.formation.indexOf(order) === 0}
              aria-label="選択した兵士を前へ"
              onClick={() => g.reorder(order!, -1)}
            >
              ←
            </button>
            <button
              className="hx-icon-btn"
              disabled={
                !order || g.formation.indexOf(order) === g.formation.length - 1
              }
              aria-label="選択した兵士を後ろへ"
              onClick={() => g.reorder(order!, 1)}
            >
              →
            </button>
          </div>
        </div>
        <div className="hx-lineup">
          {Array.from({ length: 6 }, (_, i) => {
            const c = g.chosen[i];
            return c ? (
              <button
                key={i}
                className={order === c.characterId ? "selected" : ""}
                aria-label={`出撃順${i + 1} ${c.displayName}`}
                onClick={() => setOrder(c.characterId)}
              >
                <SoldierBadge
                  character={c}
                  selected={order === c.characterId}
                />
                <small>{c.displayName}</small>
              </button>
            ) : (
              <span key={i} className="hx-empty-slot">
                {i + 1}
              </span>
            );
          })}
        </div>
        <button
          className="hx-button primary hx-wide"
          disabled={!g.formation.length || g.busy}
          onClick={g.prepareDeployment}
        >
          配置へ進む
          <Icon name="chevron" />
        </button>
      </footer>
    </main>
  );
}
export function SoldierDetails({
  character: c,
  busy,
  onRename,
  onRetire,
}: {
  character: Character;
  busy: boolean;
  onRename?: (n: string) => Promise<boolean>;
  onRetire?: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false),
    [name, setName] = useState(c.displayName),
    s = stats(c);
  return (
    <>
      <div className="hx-profile">
        <SoldierBadge character={c} />
        <h3>{c.displayName}</h3>
        <p>
          {countryNames[c.affiliationId] ?? c.affiliationId} ·{" "}
          {classNames[c.classId]} · Lv.{c.level}
        </p>
      </div>
      <div className="hx-stat-grid">
        {[
          ["体力", s.hp],
          ["攻撃", s.attack],
          ["視野", s.vision],
          ["射程", s.range],
          ["機動", s.movement],
          ["編成", s.cost],
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <dl className="hx-detail-lines">
        <div>
          <dt>初期個体差</dt>
          <dd>
            HP {c.hpDelta >= 0 ? "+" : ""}
            {c.hpDelta} / 攻撃 {c.attackDelta >= 0 ? "+" : ""}
            {c.attackDelta}
          </dd>
        </div>
        <div>
          <dt>成長補正</dt>
          <dd>
            HP +{s.hp - s.initialHp} / 攻撃 +{s.attack - s.initialAttack}
          </dd>
        </div>
        <div>
          <dt>出撃 / 撃破</dt>
          <dd>
            {c.battlesParticipated} / {c.kills}
          </dd>
        </div>
        <div>
          <dt>原名</dt>
          <dd>{c.originalName}</dd>
        </div>
      </dl>
      {onRename &&
        (!editing ? (
          <button
            className="hx-button hx-wide"
            disabled={busy || c.nameEditUsed}
            onClick={() => setEditing(true)}
          >
            {c.nameEditUsed ? "名前変更済み" : "名前を変更"}
          </button>
        ) : (
          <form
            className="hx-name-editor"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await onRename(name)) setEditing(false);
            }}
          >
            <label>
              新しい名前
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                autoFocus
              />
            </label>
            <div>
              <button
                type="button"
                className="hx-button"
                onClick={() => setEditing(false)}
              >
                取消
              </button>
              <button className="hx-button primary" disabled={busy}>
                変更を確定
              </button>
            </div>
          </form>
        ))}
      {onRetire && (
        <button
          className="hx-button hx-wide danger-text"
          disabled={busy}
          onClick={() => void onRetire()}
        >
          除隊する
        </button>
      )}
    </>
  );
}
