import { useEffect, useRef, useState } from "react";
import timing from "../../data/presentation.settings.json";
import { CharacterBoard } from "../components/character/CharacterBoard";
import {
  mapSizes,
  mapTypes,
  selectMap,
  type MapSizeId,
} from "../data/map-selection";
import { hexDistance, neighbors, sameHex } from "../game/rules/hex";
import type { Coord, Owner } from "../game/types";
import { damage, headquartersForRadius } from "../character/combat";
import {
  stats,
  scoutChance,
  validateFormation,
  recruitReplacement,
  rename,
  retire,
} from "../character/roster";
import {
  beginReward,
  commitVictory,
  decideScout,
  promote,
  renameScout,
} from "../character/reward";
import { loadSave, updateSave } from "../character/storage";
import type { BattleAction } from "../character/battle";
import type { Character, ClassId, RosterSave } from "../character/types";
import type {
  CharacterRequest,
  CharacterResponse,
} from "../character/character.worker";
import "./character.css";

const className: Record<ClassId, string> = {
  knight: "騎士",
  archer: "弓兵",
  scout: "斥候",
};
const countryName: Record<string, string> = {
  crossfort: "クロスフォート",
  avis: "アヴィス",
  riskari: "リスカリ",
};
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const id = () =>
  crypto.randomUUID?.() ??
  Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) =>
    n.toString(16).padStart(8, "0"),
  ).join("");
type Screen =
  "home" | "formation" | "deployment" | "battle" | "defeat" | "reward";
function Detail({ character: c }: { character: Character }) {
  const s = stats(c);
  return (
    <>
      <strong>{c.displayName}</strong>{" "}
      <span>
        {className[c.classId]}・
        {countryName[c.affiliationId] ?? c.affiliationId}・Lv.{c.level}
      </span>
      <small>
        ❤️ {s.hp}　🗡 {s.attack}　👁 {s.vision}　🏹 {s.range}　🥾 {s.movement}　🪙{" "}
        {s.cost}
        <br />
        個体差 HP {c.hpDelta >= 0 ? "+" : ""}
        {c.hpDelta} / 攻撃 {c.attackDelta >= 0 ? "+" : ""}
        {c.attackDelta}　出撃 {c.battlesParticipated} / 撃破 {c.kills}
      </small>
    </>
  );
}
export default function CharacterApp() {
  const [save, setSave] = useState<RosterSave>();
  const [screen, setScreen] = useState<Screen>("home");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [formation, setFormation] = useState<string[]>([]);
  const [placements, setPlacements] = useState<Record<string, Coord>>({});
  const [pick, setPick] = useState<string>();
  const [mapType, setMapType] = useState(mapTypes[0].id);
  const [mapSize, setMapSize] = useState<MapSizeId>("medium");
  const mapId = selectMap(mapType, mapSize).id;
  const [first, setFirst] = useState<Owner>("player");
  const [battleSeed, setBattleSeed] = useState(seed);
  const [selection, setSelection] = useState<string>();
  const [preview, setPreview] =
    useState<Extract<BattleAction, { type: "act" }>>();
  const [response, setResponse] = useState<CharacterResponse>();
  const worker = useRef<Worker | undefined>(undefined);
  const sid = useRef(0);
  const savedResult = useRef<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    loadSave(seed())
      .then((s) => {
        if (live) {
          setSave(s);
          if (s.pendingReward) setScreen("reward");
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const w = new Worker(
      new URL("../character/character.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = w;
    w.onmessage = async (msg: MessageEvent<CharacterResponse>) => {
      const v = msg.data;
      if (v.session !== sid.current) return;
      if (v.error) {
        setError(v.error);
        setBusy(false);
        return;
      }
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      for (const frame of v.frames ?? []) {
        if (v.session !== sid.current) return;
        setResponse((previous) =>
          previous ? { ...previous, observation: frame, legal: [] } : previous,
        );
        await new Promise<void>((resolve) =>
          window.setTimeout(
            resolve,
            reduced
              ? timing.reducedMotionMs
              : timing.movement.stepMs + timing.movement.pauseMs,
          ),
        );
      }
      if (v.session !== sid.current) return;
      setResponse(v);
      setSelection(v.observation?.pendingActorId);
      if (v.result && savedResult.current !== v.result.id) {
        savedResult.current = v.result.id;
        try {
          const s = await updateSave(0, (current) =>
            current.pendingReward?.id === v.result!.id
              ? current
              : beginReward(current, v.result!, battleSeed),
          );
          setSave(s);
          setScreen("reward");
        } catch (e) {
          savedResult.current = undefined;
          setError(String(e));
        }
      } else if (v.observation?.outcome?.winner === "cpu") setScreen("defeat");
      setBusy(false);
    };
    w.onerror = () => {
      setError("戦闘処理でエラーが発生しました。");
      setBusy(false);
    };
    return () => {
      w.terminate();
      worker.current = undefined;
    };
  }, [battleSeed]);
  useEffect(() => {
    if (
      screen === "battle" &&
      response?.observation?.activePlayer === "cpu" &&
      !response.observation.outcome &&
      !busy
    ) {
      const timer = setTimeout(
        () => send({ type: "cpu", session: sid.current }),
        250,
      );
      return () => clearTimeout(timer);
    }
  }, [screen, response, busy]);
  function send(request: CharacterRequest) {
    setError("");
    setBusy(true);
    worker.current?.postMessage(request);
  }
  async function change(fn: (s: RosterSave) => RosterSave) {
    setBusy(true);
    try {
      const s = await updateSave(0, fn);
      setSave(s);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  function start() {
    if (!save) return;
    const team = formation.map((x) =>
      save.roster.find((c) => c.characterId === x)!,
    );
    const config = {
      id: id(),
      seed: battleSeed,
      mapId,
      first,
      team,
      placements,
    };
    sid.current++;
    savedResult.current = undefined;
    setPreview(undefined);
    setResponse(undefined);
    setScreen("battle");
    send({ type: "new", config, session: sid.current });
  }
  function command(action: BattleAction) {
    setPreview(undefined);
    send({ type: "act", action, session: sid.current });
  }
  function hex(coord: Coord) {
    if (
      busy ||
      !response?.observation ||
      response.observation.activePlayer !== "player"
    )
      return;
    const view = response.observation;
    const actions = response.legal ?? [];
    if (view.pendingActorId) {
      const target = view.participants.find(
        (p) => p.owner === "cpu" && sameHex(p.coord, coord),
      );
      const targetId =
        target?.character.characterId ??
        (sameHex(view.headquarters.cpu.coord, coord) ? "hq_cpu" : undefined);
      const hit = actions.find(
        (a) => a.type === "act" && a.targetId === targetId && !!targetId,
      );
      if (hit?.type === "act") setPreview(hit);
      return;
    }
    const move = actions.find(
      (a) =>
        a.type === "act" &&
        a.actorId === selection &&
        !a.targetId &&
        a.path.length &&
        sameHex(a.path[a.path.length - 1], coord),
    );
    if (move?.type === "act") {
      send({
        type: "move",
        actorId: move.actorId,
        path: move.path,
        session: sid.current,
      });
      return;
    }
    const piece = view.participants.find(
      (p) => p.owner === "player" && sameHex(p.coord, coord),
    );
    setSelection(piece?.character.characterId);
  }
  function chooseSlot(coord: Coord, characterId = pick) {
    if (!characterId) return;
    setPlacements((p) => {
      const next = { ...p };
      const other = Object.keys(next).find((x) => sameHex(next[x], coord));
      const old = next[characterId];
      if (other && other !== characterId) {
        if (old) next[other] = old;
        else delete next[other];
      }
      next[characterId] = coord;
      return next;
    });
    setPick(undefined);
  }
  const mapInfo = selectMap(mapType, mapSize);
  const slots = neighbors(headquartersForRadius(mapInfo.radius).player);
  const chosen = formation.flatMap((id) => {
    const c = save?.roster.find((item) => item.characterId === id);
    return c ? [c] : [];
  });
  const cost = chosen.reduce((n, c) => n + stats(c).cost, 0);
  const pending = save?.pendingReward;
  const view = response?.observation;
  const attacking =
    preview &&
    view?.participants.find((p) => p.character.characterId === preview.actorId);
  const defending =
    preview &&
    view?.participants.find(
      (p) => p.character.characterId === preview.targetId,
    );
  const tile = (c: Coord) =>
    view?.hexes.find((h) => sameHex(h, c))?.terrain ?? "plain";
  const expectedHit = attacking
    ? damage(stats(attacking.character).attack, tile(attacking.coord))
    : 0;
  const expectedCounter =
    attacking &&
    defending &&
    defending.hp > expectedHit &&
    hexDistance(attacking.coord, defending.coord) <=
      stats(defending.character).range
      ? damage(stats(defending.character).attack, tile(defending.coord), true)
      : 0;
  if (!save)
    return <main className="v2-loading">{error || "部隊を読み込み中…"}</main>;
  return (
    <div className={`v2-app ${screen === "battle" ? "v2-active" : ""}`}>
      <header className="v2-header">
        <strong>
          CROSSFORT <span>HEX</span>
        </strong>
        {screen === "battle" && response?.observation && (
          <div>
            {response.observation.activePlayer === "player"
              ? "自軍の手番"
              : "敵軍の手番"}
            　♜ {response.observation.headquarters.player.hp} / 敵{" "}
            {response.observation.headquarters.cpu.hp ?? "?"}
          </div>
        )}
        <button
          disabled={busy}
          onClick={() => {
            if (
              screen === "battle" &&
              !confirm("戦闘を中断してホームに戻りますか？")
            )
              return;
            sid.current++;
            setResponse(undefined);
            setScreen(pending ? "reward" : "home");
          }}
        >
          ホーム
        </button>
      </header>
      {error && (
        <div role="alert" className="v2-error">
          {error}
          <button onClick={() => setError("")}>×</button>
        </div>
      )}
      {screen === "home" && (
        <main className="v2-content">
          <div className="v2-title">
            <div>
              <p>戦場に名を刻め</p>
              <h1>
                部隊を率いて、
                <br />
                敵の本城を落とせ。
              </h1>
              <p>所持 {save.roster.length} / 15</p>
            </div>
            <button
              className="v2-primary"
              onClick={() => {
                setFormation([]);
                setPlacements({});
                setScreen("formation");
              }}
            >
              出撃編成
            </button>
          </div>
          <h2>所持キャラクター</h2>
          <div className="v2-cards">
            {save.roster.map((c) => (
              <article className="v2-card" key={c.characterId}>
                <Detail character={c} />
                <div>
                  <button
                    disabled={busy || c.nameEditUsed}
                    onClick={() => {
                      const name = prompt(
                        "新しい名前（1〜20文字）",
                        c.displayName,
                      );
                      if (name !== null)
                        void change((s) => rename(s, c.characterId, name));
                    }}
                  >
                    名前変更
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          `${c.displayName}を除隊しますか？ 元に戻せません。`,
                        )
                      )
                        void change((s) => retire(s, c.characterId));
                    }}
                  >
                    除隊
                  </button>
                </div>
              </article>
            ))}
          </div>
          {save.roster.length < 6 && (
            <section>
              <h2>無料補充</h2>
              <div className="v2-actions">
                {(["knight", "archer", "scout"] as const).map((c) => (
                  <button
                    key={c}
                    disabled={busy}
                    onClick={() =>
                      void change((s) => recruitReplacement(s, c, id()))
                    }
                  >
                    {className[c]}を補充
                  </button>
                ))}
              </div>
            </section>
          )}
          {save.archive.length > 0 && (
            <details>
              <summary>戦績アーカイブ（{save.archive.length}名）</summary>
              {save.archive.map((c) => (
                <p key={c.characterId}>
                  {c.displayName}　出撃 {c.battlesParticipated} / 撃破 {c.kills}
                </p>
              ))}
            </details>
          )}
        </main>
      )}
      {screen === "formation" && (
        <main className="v2-content">
          <h1>出撃編成</h1>
          <p>
            {formation.length} / 6名　編成コスト {cost} / 10
          </p>
          {chosen.length > 0 && (
            <div className="v2-actions" aria-label="出撃順">
              {chosen.map((c, i) => (
                <span key={c.characterId}>
                  {i + 1}. {c.displayName}{" "}
                  <button
                    aria-label={`${c.displayName}を前へ`}
                    disabled={i === 0}
                    onClick={() =>
                      setFormation((a) => {
                        const x = [...a];
                        [x[i - 1], x[i]] = [x[i], x[i - 1]];
                        return x;
                      })
                    }
                  >
                    ↑
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="v2-cards">
            {save.roster.map((c) => (
              <button
                className={`v2-card v2-select ${formation.includes(c.characterId) ? "selected" : ""}`}
                key={c.characterId}
                onClick={() =>
                  setFormation((a) =>
                    a.includes(c.characterId)
                      ? a.filter((x) => x !== c.characterId)
                      : [...a, c.characterId],
                  )
                }
              >
                <Detail character={c} />
              </button>
            ))}
          </div>
          <div className="v2-actions">
            <button onClick={() => setScreen("home")}>戻る</button>
            <button
              className="v2-primary"
              disabled={!!validateFormation(formation, save.roster)}
              onClick={() => {
                setPlacements({});
                setPick(undefined);
                setScreen("deployment");
              }}
            >
              配置へ
            </button>
          </div>
        </main>
      )}
      {screen === "deployment" && (
        <main className="v2-content">
          <h1>戦場と配置</h1>
          <div className="v2-actions">
            <label>
              戦場{" "}
              <select
                value={mapType}
                onChange={(e) => {
                  setMapType(e.target.value);
                  setPlacements({});
                }}
              >
                {mapTypes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name.replace("（仮）", "")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              大きさ{" "}
              <select
                value={mapSize}
                onChange={(e) => {
                  setMapSize(e.target.value as MapSizeId);
                  setPlacements({});
                }}
              >
                {mapSizes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}（{s.hexCount}マス）
                  </option>
                ))}
              </select>
            </label>
            <label>
              先攻{" "}
              <select
                value={first}
                onChange={(e) => setFirst(e.target.value as Owner)}
              >
                <option value="player">自軍</option>
                <option value="cpu">CPU</option>
              </select>
            </label>
            <label>
              シード{" "}
              <input
                type="number"
                value={battleSeed}
                onChange={(e) => setBattleSeed(Number(e.target.value) >>> 0)}
              />
            </label>
          </div>
          <p>
            部隊を選び、本城の周囲に配置。配置済み部隊を選んで別の場所へ移動・入れ替えできます。
          </p>
          <div className="v2-deploy">
            <div className="v2-roster-pick">
              {chosen.map((c) => (
                <button
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/plain", c.characterId)
                  }
                  className={pick === c.characterId ? "selected" : ""}
                  key={c.characterId}
                  onPointerDown={() => setPick(c.characterId)}
                  onPointerUp={(e) => {
                    const el = document
                      .elementFromPoint(e.clientX, e.clientY)
                      ?.closest("[data-deploy-slot]") as HTMLElement | null;
                    if (el?.dataset.deploySlot) {
                      const index = Number(el.dataset.deploySlot);
                      if (Number.isInteger(index) && slots[index])
                        chooseSlot(slots[index], c.characterId);
                    }
                  }}
                  onClick={() => setPick(c.characterId)}
                >
                  {c.displayName}　
                  {placements[c.characterId] ? "配置済み" : "未配置"}
                </button>
              ))}
            </div>
            <div className="v2-slots">
              <div className="v2-castle">
                ♜<small>自軍本城</small>
              </div>
              {slots.map((c, i) => {
                const unit = chosen.find(
                  (x) =>
                    placements[x.characterId] &&
                    sameHex(placements[x.characterId], c),
                );
                return (
                  <button
                    key={i}
                    className={`v2-slot slot-${i}`}
                    data-deploy-slot={i}
                    onClick={() => chooseSlot(c)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      chooseSlot(c, e.dataTransfer.getData("text/plain"));
                    }}
                  >
                    {unit?.displayName ?? "配置"}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="v2-actions">
            <button onClick={() => setScreen("formation")}>編成へ戻る</button>
            <button
              className="v2-primary"
              disabled={
                busy || Object.keys(placements).length !== formation.length
              }
              onClick={start}
            >
              戦闘開始
            </button>
          </div>
        </main>
      )}
      {screen === "battle" && response?.observation && (
        <>
          <CharacterBoard
            view={response.observation}
            legal={response.legal ?? []}
            selected={selection}
            onHex={hex}
          />
          <div className="v2-battle-controls">
            {response.result && !pending && (
              <button
                disabled={busy}
                onClick={async () => {
                  const result = response.result!;
                  if (
                    await change((s) =>
                      s.pendingReward?.id === result.id
                        ? s
                        : beginReward(s, result, battleSeed),
                    )
                  )
                    setScreen("reward");
                }}
              >
                報酬保存を再試行
              </button>
            )}
            {preview && attacking && (
              <div className="v2-prediction" role="status">
                {defending?.character.displayName ?? "敵本城"} に {expectedHit}{" "}
                ダメージ　反撃 {expectedCounter}
                <button disabled={busy} onClick={() => command(preview)}>
                  攻撃
                </button>
                <button onClick={() => setPreview(undefined)}>取消</button>
              </div>
            )}
            {selection && (
              <span>
                {
                  response.observation.participants.find(
                    (p) => p.character.characterId === selection,
                  )?.character.displayName
                }
                　
                {response.observation.pendingActorId
                  ? "攻撃対象を選択"
                  : "移動先を選択"}
              </span>
            )}
            {selection && !response.observation.pendingActorId && (
              <button
                disabled={busy}
                onClick={() =>
                  send({
                    type: "move",
                    actorId: selection,
                    path: [],
                    session: sid.current,
                  })
                }
              >
                その場で攻撃
              </button>
            )}
            <button
              disabled={busy || response.observation.activePlayer !== "player"}
              onClick={() => command({ type: "pass" })}
            >
              {response.observation.pendingActorId ? "攻撃せず終了" : "待機"}
            </button>
          </div>
        </>
      )}
      {screen === "defeat" && (
        <main className="v2-content v2-result">
          <h1>GAME OVER</h1>
          <p>戦闘前の所持状態に戻ります。</p>
          <div className="v2-actions">
            <button onClick={() => setScreen("deployment")}>
              戦闘前に戻る
            </button>
            <button onClick={() => setScreen("home")}>ホームへ</button>
          </div>
        </main>
      )}
      {screen === "reward" && pending && (
        <main className="v2-content">
          <h1>勝利</h1>
          <p>
            {pending.result.reason === "headquartersDestroyed"
              ? "敵本城を破壊"
              : "敵部隊を全滅"}
          </p>
          <h2>戦闘結果</h2>
          <div className="v2-cards">
            {pending.result.participants.map((p) => (
              <article className="v2-card" key={p.character.characterId}>
                <Detail character={p.character} />
                <strong>
                  {p.owner === "player" ? "自軍" : "敵軍"}　
                  {p.alive ? "生存" : "死亡"}　撃破 {p.killsThisBattle}
                </strong>
              </article>
            ))}
          </div>
          {pending.scoutStatus === "pending" && (
            <section>
              <h2>降伏兵の勧誘</h2>
              <div className="v2-cards">
                {pending.result.participants
                  .filter((p) => p.owner === "cpu" && p.alive)
                  .map((p) => (
                    <button
                      className="v2-card v2-select"
                      disabled={busy}
                      key={p.character.characterId}
                      onClick={() =>
                        void change((s) =>
                          decideScout(s, p.character.characterId),
                        )
                      }
                    >
                      <Detail character={p.character} />
                      <strong>成功率 {scoutChance(p.character)}%</strong>
                    </button>
                  ))}
              </div>
              <button
                disabled={busy}
                onClick={() => void change((s) => decideScout(s))}
              >
                勧誘を見送る
              </button>
            </section>
          )}
          {pending.scoutStatus !== "pending" && (
            <section>
              <h2>
                勧誘：
                {pending.scoutStatus === "succeeded"
                  ? "成功"
                  : pending.scoutStatus === "failed"
                    ? "失敗"
                    : "なし"}
              </h2>
              {pending.scouted && (
                <>
                  <p>{pending.scouted.displayName} が加入します。</p>
                  <button
                    disabled={busy || pending.scouted.nameEditUsed}
                    onClick={() => {
                      const n = prompt(
                        "加入時の名前",
                        pending.scouted!.displayName,
                      );
                      if (n !== null) void change((s) => renameScout(s, n));
                    }}
                  >
                    名前を変更
                  </button>
                </>
              )}
            </section>
          )}
          {pending.scoutStatus !== "pending" &&
            pending.promotionStatus === "pending" && (
              <section>
                <h2>生存者を1名強化</h2>
                <div className="v2-cards">
                  {pending.result.participants
                    .filter(
                      (p) =>
                        p.owner === "player" &&
                        p.alive &&
                        p.character.level !== "MAX",
                    )
                    .map((p) => (
                      <button
                        className="v2-card v2-select"
                        key={p.character.characterId}
                        disabled={busy}
                        onClick={() =>
                          void change((s) =>
                            promote(s, p.character.characterId),
                          )
                        }
                      >
                        <Detail character={p.character} />
                        <strong>1段階強化</strong>
                      </button>
                    ))}
                </div>
              </section>
            )}
          {pending.scoutStatus !== "pending" &&
            pending.promotionStatus !== "pending" && (
              <button
                className="v2-primary"
                disabled={busy}
                onClick={async () => {
                  if (await change(commitVictory)) setScreen("home");
                }}
              >
                報酬を確定して帰還
              </button>
            )}
        </main>
      )}
    </div>
  );
}
