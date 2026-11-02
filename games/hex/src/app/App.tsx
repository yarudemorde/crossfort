import tuning from "../../data/prototype.tuning.json";
import { useEffect, useRef, useState } from "react";
import { cards, maps, uiConfig } from "../data/catalog";
import type {
  Action,
  Coord,
  Observation,
  ObservedPiece,
  Owner,
} from "../game/types";
import { sameHex } from "../game/rules/hex";
import { Card, effectText } from "../components/Card";
import { Board } from "../components/Board";
import { Sigil, terrainEffects, terrainNames } from "../components/Icons";
import type { Request, Response } from "./protocol";
import { BattleLayout } from "../components/battle/BattleLayout";
import { AnimationQueue } from "../presentation/AnimationQueue";
import type { ActiveAnimation } from "../presentation/types";
import { calculateEffectivePower } from "../game/rules/board";
const clean = (s: string) => s.replace("（仮）", "");
const pieceName = (p: ObservedPiece) =>
  p.kind === "headquarters"
    ? "本城"
    : clean(uiConfig.cards[p.definitionId].name);
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
type Pending = { action: Action; title: string; text: string };
export default function App() {
  const [screen, setScreen] = useState<"setup" | "battle">("setup");
  const [mapId, setMapId] = useState(maps[0].id);
  const [first, setFirst] = useState<Owner>("player");
  const [seed, setSeed] = useState(randomSeed);
  const [deckOpen, setDeckOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [o, setO] = useState<Observation>();
  const [legal, setLegal] = useState<Action[]>([]);
  const [cardId, setCardId] = useState<string>();
  const [pieceId, setPieceId] = useState<string>();
  const [path, setPath] = useState<Coord[]>([]);
  const [hovered, setHovered] = useState<Coord>();
  const [pending, setPending] = useState<Pending>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [animation, setAnimation] = useState<ActiveAnimation>();
  const animationQueue = useRef(new AnimationQueue());
  const session = useRef(0);
  const [stack, setStack] = useState<ObservedPiece[]>([]);
  const [showResult, setShowResult] = useState(true);
  const worker = useRef<Worker | null>(null);
  const mounted = useRef(true);
  const playerActions = useRef<Action[]>([]);
  const submittedAction = useRef<Action | null>(null);
  useEffect(() => {
    mounted.current = true;
    const w = new Worker(new URL("./game.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.current = w;
    w.onmessage = async (msg: MessageEvent<Response>) => {
      const response = msg.data;
      if (response.session !== session.current || !mounted.current) return;
      if (submittedAction.current) {
        if (!response.error)
          playerActions.current.push(submittedAction.current);
        submittedAction.current = null;
      }
      if (response.error) setError(response.error);
      if (!response.observation) {
        setBusy(false);
        return;
      }
      const expectedSession = session.current;
      const played = await animationQueue.current.play(
        response.frames ?? [],
        {
          start: (active) => {
            setAnimation(active);
            const snapshot =
              active.frame.kind === "appear"
                ? active.frame.after
                : active.frame.before;
            setO((previous) =>
              previous ? { ...previous, ...snapshot } : previous,
            );
          },
          impact: (active) => {
            setAnimation(active);
            setO((previous) =>
              previous ? { ...previous, ...active.frame.after } : previous,
            );
          },
        },
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      );
      if (!played || expectedSession !== session.current || !mounted.current)
        return;
      setAnimation(undefined);
      setO(response.observation);
      setLegal(response.legal);
      setBusy(false);
    };
    w.onerror = () => {
      setError("ゲーム処理でエラーが発生しました。再戦で初期化してください。");
      setBusy(false);
    };
    return () => {
      mounted.current = false;
      w.terminate();
      animationQueue.current.cancel();
    };
  }, []);
  useEffect(() => {
    if (
      screen === "battle" &&
      o?.activePlayer === "cpu" &&
      !o.outcome &&
      !busy
    ) {
      const t = setTimeout(() => {
        setBusy(true);
        worker.current?.postMessage({
          type: "cpu",
          session: session.current,
        } satisfies Request);
      }, tuning.presentation.cpuDelayMs);
      return () => clearTimeout(t);
    }
  }, [screen, o, busy]);
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 5000);
    return () => clearTimeout(t);
  }, [error]);
  const selectedPiece = o?.pieces.find((p) => p.instanceId === pieceId);
  const selectedCard = cardId ? uiConfig.cards[cardId] : undefined;
  const interactive = !!o && o.activePlayer === "player" && !o.outcome && !busy;
  const resetSelection = () => {
    setCardId(undefined);
    setPieceId(undefined);
    setPath([]);
    setPending(undefined);
    setStack([]);
  };
  function begin() {
    session.current++;
    animationQueue.current.cancel();
    setAnimation(undefined);
    submittedAction.current = null;
    resetSelection();
    setError("");
    setShowResult(true);
    setO(undefined);
    setLegal([]);
    playerActions.current = [];
    setBusy(true);
    setScreen("battle");
    worker.current?.postMessage({
      type: "new",
      session: session.current,
      seed,
      mapId,
      first,
    } satisfies Request);
  }
  function send(action: Action) {
    if (!interactive) return;
    submittedAction.current = action;
    setBusy(true);
    resetSelection();
    worker.current?.postMessage({
      type: "action",
      action,
      session: session.current,
    } satisfies Request);
  }
  function requestEndTurn() {
    if (!interactive) return;
    if (cardId || path.length)
      setPending({
        action: { type: "endTurn" },
        title: "ターンを終了",
        text: "選択中の指示を取り消し、残りの手札と公開資源を回収します。",
      });
    else send({ type: "endTurn" });
  }
  useEffect(() => {
    const dialogs = [
      ...document.querySelectorAll<HTMLElement>('[role="dialog"]'),
    ];
    const dialog = dialogs.at(-1);
    const previous = document.activeElement as HTMLElement | null;
    const controls = () =>
      dialog
        ? [
            ...dialog.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input,select,[tabindex="0"]',
            ),
          ].filter((el) => el.offsetParent !== null)
        : [];
    const frame = dialog
      ? requestAnimationFrame(() => controls()[0]?.focus())
      : undefined;
    function keydown(e: KeyboardEvent) {
      if (e.key === "Escape" && dialog) {
        e.preventDefault();
        if (pending) setPending(undefined);
        else if (help) setHelp(false);
        else if (stack.length) setStack([]);
        else if (o?.outcome && showResult) setShowResult(false);
      }
      if (e.key === "Tab" && dialog) {
        const items = controls(),
          first = items[0],
          last = items.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            !dialog.contains(document.activeElement))
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            !dialog.contains(document.activeElement))
        ) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      document.removeEventListener("keydown", keydown);
      if (dialog && previous?.isConnected) previous.focus();
    };
  }, [pending, help, stack.length, showResult, o?.outcome]);
  function selectPiece(p: ObservedPiece) {
    setCardId(undefined);
    setPieceId(p.instanceId);
    setPath([]);
    setStack([]);
  }
  function target(p: ObservedPiece) {
    if (!interactive) {
      if (p.owner === "player") selectPiece(p);
      return;
    }
    if (selectedCard) {
      const a = legal.find(
        (a) =>
          a.type === "play" &&
          a.cardId === cardId &&
          a.targetId === p.instanceId,
      );
      if (a)
        setPending({
          action: a,
          title: `${clean(selectedCard.name)}を使用`,
          text: `${pieceName(p)}に ${effectText(selectedCard)} 資源${selectedCard.cost}を支払います。`,
        });
      else setError("この駒はカードの対象にできません。");
    } else if (selectedPiece && p.owner !== "player") {
      const a = legal.find(
        (a) =>
          a.type === "act" &&
          a.pieceId === pieceId &&
          a.targetId === p.instanceId &&
          JSON.stringify(a.path) === JSON.stringify(path),
      );
      if (a) {
        const dest = path.at(-1) ?? selectedPiece.coord;
        const terrain =
          o!.hexes.find((h) => sameHex(h, dest))?.terrain ?? "plain";
        const attack = calculateEffectivePower(
          selectedPiece,
          terrain,
          uiConfig,
        );
        const after = p.power - attack;
        setPending({
          action: a,
          title: `${pieceName(p)}を攻撃`,
          text: `${path.length ? `${path.length}マス移動後、` : ""}${pieceName(selectedPiece)}の戦力${attack}で攻撃。敵の戦力 ${p.power} → ${Math.max(0, after)}。${after <= 0 ? "撃破時の反撃はありません。" : `生存し、射程内の場合は残存戦力で反撃します。${terrainEffects[o!.hexes.find((h) => sameHex(h, p.coord))?.terrain ?? "plain"]}。`}`,
        });
      } else
        setError(
          "この位置からは攻撃できません。移動経路と射程を確認してください。",
        );
    } else if (p.owner === "player") selectPiece(p);
    else {
      setPieceId(p.instanceId);
      setCardId(undefined);
      setPath([]);
    }
    setStack([]);
  }
  function hexClick(coord: Coord) {
    if (!o) return;
    setHovered(coord);
    const occupants = o.pieces.filter((p) => sameHex(p.coord, coord));
    if (selectedCard && interactive) {
      const a = legal.find(
        (a) =>
          a.type === "play" &&
          a.cardId === cardId &&
          a.coord &&
          sameHex(a.coord, coord),
      );
      if (a) {
        setPending({
          action: a,
          title:
            selectedCard.type === "spell"
              ? clean(selectedCard.name)
              : `${clean(selectedCard.name)}を${selectedCard.type === "landmark" ? "建設" : "展開"}`,
          text: `${terrainNames[o.hexes.find((h) => sameHex(h, coord))?.terrain ?? "plain"]}（${coord.q}, ${coord.r}）に${selectedCard.type === "spell" ? "使用" : "配置"}。資源${selectedCard.cost}を支払います。${selectedCard.type !== "spell" ? "このターンの移動・能動攻撃はできません。" : ""}`,
        });
        return;
      }
      if (occupants.length === 1) {
        target(occupants[0]);
        return;
      }
      if (occupants.length > 1) {
        setStack(occupants);
        return;
      }
      setError(
        selectedCard.cost > o.self.resourceRemaining
          ? "資源が不足しています。"
          : "このマスにはカードを使用できません。",
      );
      return;
    }
    if (selectedPiece?.owner === "player" && interactive) {
      if (occupants.some((p) => p.owner === "cpu")) {
        if (occupants.length > 1) setStack(occupants);
        else target(occupants[0]);
        return;
      }
      const move = legal.find(
        (a) =>
          a.type === "act" &&
          a.pieceId === pieceId &&
          !a.targetId &&
          a.path.length &&
          sameHex(a.path.at(-1)!, coord),
      );
      if (move && move.type === "act") {
        setPath(move.path);
        return;
      }
    }
    if (occupants.length > 1) setStack(occupants);
    else if (occupants.length === 1) target(occupants[0]);
  }
  function exportReplay() {
    if (!o) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            version: "prototype-1.0",
            seed,
            mapId,
            first,
            playerActions: playerActions.current,
            events: o.events,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crossfort-replay-${seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  useEffect(() => {
    if (pieceId && !o?.pieces.some((p) => p.instanceId === pieceId)) {
      setPieceId(undefined);
      setPath([]);
    }
    if (cardId && !o?.self.hand.includes(cardId)) {
      setCardId(undefined);
      setPath([]);
    }
  }, [o, pieceId, cardId]);
  function leaveBattle() {
    session.current++;
    animationQueue.current.cancel();
    setAnimation(undefined);
    setBusy(false);
    resetSelection();
    setScreen("setup");
  }
  function requestHome() {
    if (!o?.outcome)
      setPending({
        action: { type: "endTurn" },
        title: "タイトルへ戻る",
        text: "現在の対戦を終了します。",
      });
    else leaveBattle();
  }
  return (
    <div className={`app-shell ${screen === "battle" ? "is-battle" : ""}`}>
      {screen === "setup" && (
        <header className="topbar">
          <button className="brand" onClick={() => setScreen("setup")}>
            <span className="brand-crest">✦</span>
            <span>
              CROSSFORT<small>WAR CHRONICLE — 戦記</small>
            </span>
          </button>
          <nav>
            <span className="build-label">HEX TERRITORY / PROTOTYPE 1.0</span>
            <button className="quiet" onClick={() => setHelp(true)}>
              遊び方 <span>?</span>
            </button>
          </nav>
        </header>
      )}
      {screen === "setup" ? (
        <main className="setup">
          <section className="setup-intro">
            <div className="eyebrow">A CHRONICLE OF CONQUEST</div>
            <h1>
              霧の向こうに、
              <br />
              <em>戦線を拓け。</em>
            </h1>
            <p>
              部隊を進め、砦を築き、敵の本城を落とす。
              <br />
              16枚のカードが巡る、六角形の領土戦。
            </p>
            <div className="intro-seal">
              <Sigil kind="headquarters" />
              <span>
                クロスフォート戦記<small>ヘックス領土戦</small>
              </span>
            </div>
            <div className="setup-note">
              PLAYER vs CPU <span>61 HEXES</span> 16 CARDS
            </div>
          </section>
          <section className="setup-panel">
            <div className="section-heading">
              <span>01</span>
              <h2>戦場を選択</h2>
              <small>SELECT BATTLEFIELD</small>
            </div>
            <div className="map-options">
              {maps.map((m, i) => (
                <button
                  key={m.id}
                  className={`map-option ${mapId === m.id ? "active" : ""}`}
                  onClick={() => setMapId(m.id)}
                >
                  <div className={`map-illustration map-${i}`}>
                    <svg viewBox="0 0 240 100" aria-hidden="true">
                      <path
                        d={
                          i === 0
                            ? "M-10 5Q130 20 100 50T250 95"
                            : "M0 90 50 12 103 90 144 20 205 90 240 50"
                        }
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={i === 0 ? 14 : 2}
                      />
                      <path
                        d="M27 75h23V56h-5V45H32v11h-5zm166-50h23V6h-5V-5h-13V6h-5z"
                        fill="currentColor"
                      />
                    </svg>
                    <span>0{i + 1}</span>
                  </div>
                  <strong>{clean(m.name)}</strong>
                  <small>
                    {i === 0
                      ? "河川を挟む、正面からの領土戦。"
                      : "地形を活かし、戦線を切り拓く。"}
                  </small>
                  <span className="selection-mark">
                    {mapId === m.id ? "選択中 ✓" : "選択する"}
                  </span>
                </button>
              ))}
            </div>
            <div className="section-heading">
              <span>02</span>
              <h2>軍勢を編成</h2>
              <small>16 / 16</small>
            </div>
            <button
              className="deck-summary"
              onClick={() => setDeckOpen(!deckOpen)}
            >
              <div className="deck-emblem">
                <Sigil />
              </div>
              <div>
                <strong>開発用・標準デッキ</strong>
                <small>ユニット9 / ランドマーク3 / スペル4</small>
              </div>
              <span>{deckOpen ? "−" : "＋"}</span>
            </button>
            {deckOpen && (
              <div className="deck-grid">
                {cards.map((c) => (
                  <Card key={c.id} card={c} compact />
                ))}
              </div>
            )}
            <div className="setup-controls">
              <label>
                手番
                <select
                  value={first}
                  onChange={(e) => setFirst(e.target.value as Owner)}
                >
                  <option value="player">先攻 — 蒼の軍勢</option>
                  <option value="cpu">後攻 — 蒼の軍勢</option>
                </select>
              </label>
              <label>
                乱数シード
                <div className="seed-field">
                  <input
                    aria-label="乱数シード"
                    type="number"
                    min="0"
                    max="4294967295"
                    value={seed}
                    onChange={(e) => setSeed(Number(e.target.value) >>> 0)}
                  />
                  <button
                    onClick={() => setSeed(randomSeed())}
                    aria-label="シードを変更"
                  >
                    ↻
                  </button>
                </div>
              </label>
            </div>
            <button className="primary start-button" onClick={begin}>
              戦場へ進む <span>→</span>
            </button>
            <p className="prototype-note">
              カード名・マップは開発用の仮データです。
            </p>
          </section>
        </main>
      ) : o ? (
        <BattleLayout
          observation={o}
          cards={uiConfig.cards}
          cardId={cardId}
          selectedPiece={selectedPiece}
          path={path}
          legal={interactive ? legal : []}
          busy={busy}
          interactive={interactive}
          onSelectCard={(id) => {
            setCardId(id === cardId ? undefined : id);
            setPieceId(undefined);
            setPath([]);
          }}
          onClear={resetSelection}
          onClearPath={() => setPath([])}
          onMove={() =>
            setPending({
              action: { type: "act", pieceId: pieceId!, path },
              title: "移動を確定",
              text: `${path.length}マス移動して行動を終了します。攻撃も行う場合は、先に敵を選択してください。`,
            })
          }
          onExchange={() => send({ type: "exchange", cardId: cardId! })}
          onEndTurn={requestEndTurn}
          onHelp={() => setHelp(true)}
          onHome={requestHome}
          onReplay={exportReplay}
        >
          <Board
            observation={o}
            selectedPiece={selectedPiece}
            selectedCard={cardId}
            legal={interactive ? legal : []}
            stagedPath={path}
            hovered={hovered}
            onHex={hexClick}
            onHover={setHovered}
            animation={animation}
            locked={busy}
          />
          <span className="sr-only" role="status">
            {animation?.frame.kind === "hit"
              ? `${animation.frame.mode === "counter" ? "反撃" : animation.frame.mode === "heal" ? "回復" : "命中"} ${animation.impact ? animation.frame.amount : ""}`
              : animation?.frame.kind === "move"
                ? "部隊が移動中"
                : ""}
          </span>
          {o.outcome && showResult && (
            <div className="modal-backdrop">
              <section
                className={`result-dialog ${o.outcome.winner}`}
                role="dialog"
                aria-modal="true"
                aria-label="対戦結果"
              >
                <div className="eyebrow">THE CHRONICLE IS WRITTEN</div>
                <Sigil kind="headquarters" />
                <h2>{o.outcome.winner === "player" ? "勝利" : "敗北"}</h2>
                <em>{o.outcome.winner === "player" ? "VICTORY" : "DEFEAT"}</em>
                <p>
                  {o.outcome.winner === "player"
                    ? "敵の本城が陥落した。"
                    : "自軍の本城が陥落した。"}
                  <br />第{o.self.ownTurnNumber}ターン · {clean(o.mapName)}
                </p>
                <button className="primary" onClick={begin}>
                  同じ条件で再戦
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    setSeed(randomSeed());
                    leaveBattle();
                  }}
                >
                  戦場選択へ
                </button>
                <button className="quiet" onClick={() => setShowResult(false)}>
                  戦場を確認
                </button>
              </section>
            </div>
          )}
          {o.outcome && !showResult && (
            <button
              className="result-reopen primary"
              onClick={() => setShowResult(true)}
            >
              対戦結果・再戦
            </button>
          )}
        </BattleLayout>
      ) : (
        <div className="loading">
          <Sigil kind="headquarters" />
          戦場を準備しています…
        </div>
      )}
      {screen === "setup" && (
        <footer>
          <span>CROSSFORT 戦記</span>
          <span>HEX TERRITORY WARFARE · 開発用カード / 仮マップ</span>
        </footer>
      )}
      {error && (
        <div className="error-toast" role="alert">
          {error}
        </div>
      )}
      {pending && (
        <div className="modal-backdrop">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={pending.title}
          >
            <div className="eyebrow">CONFIRM COMMAND</div>
            <h2>{pending.title}</h2>
            <p>{pending.text}</p>
            <div className="dialog-buttons">
              <button
                className="secondary"
                onClick={() => setPending(undefined)}
              >
                キャンセル
              </button>
              <button
                className="primary"
                onClick={() => {
                  if (pending.title === "タイトルへ戻る") {
                    leaveBattle();
                  } else send(pending.action);
                }}
              >
                確定する
              </button>
            </div>
          </section>
        </div>
      )}
      {stack.length > 0 && (
        <div className="modal-backdrop">
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="対象を選択"
          >
            <h2>対象を選択</h2>
            {stack.map((p) => (
              <button
                className="stack-choice"
                key={p.instanceId}
                onClick={() => target(p)}
              >
                <Sigil kind={p.kind} />
                <span>{pieceName(p)}</span>
                <b>⚔ {p.power}</b>
              </button>
            ))}
            <button className="quiet" onClick={() => setStack([])}>
              閉じる
            </button>
          </section>
        </div>
      )}
      {help && (
        <div className="modal-backdrop">
          <section
            className="help-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="遊び方"
          >
            <div className="eyebrow">FIELD MANUAL</div>
            <h2>戦場の手引き</h2>
            <ol>
              <li>
                <strong>盤面を中心に操作する</strong>
                <p>
                  手札バーでカードを開き、選択したら明るいマスを選びます。ドロワーを閉じても指示は残ります。ハンドルの上下スワイプ、または矢印キーで展開できます。移動経路は「移動を確定」で実行。カードのⓘで詳細を確認できます。資源内訳と記録は対戦メニューにあります。マップは1本指/左ドラッグで移動、2本指/ホイールで拡大縮小できます。
                </p>
              </li>
              <li>
                <strong>敵本城を破壊する</strong>
                <p>
                  本城の初期戦力は12。敵の姿は現在の味方視野内だけに表示されます。
                </p>
              </li>
              <li>
                <strong>手札を使って展開する</strong>
                <p>
                  毎ターン手札3枚と資源2〜4枚を公開。ユニットは自軍拠点の隣、ランドマークは自軍ユニットの隣に配置します。配置したターンは行動できません。
                </p>
              </li>
              <li>
                <strong>移動と攻撃を指揮する</strong>
                <p>
                  自軍の駒 → 移動先 → 敵を選択 →
                  確認して実行。移動だけで確定するとその駒の行動は終了します。生存した敵は射程内なら残存戦力で反撃します。
                </p>
              </li>
              <li>
                <strong>カードを循環させる</strong>
                <p>
                  手札を1ターンに1枚だけ交換できます。終了時に手札・資源・使用済みだけを混ぜ、残った山札の下へ戻します。盤上の駒は残ります。
                </p>
              </li>
            </ol>
            <div className="manual-legend">
              ⚔ 戦力　◉ 視野　➶ 射程　↟ 移動　⬡ 領土　◆ 資源
            </div>
            <p>
              探索済みの地形は残ります。施設を選択すると本来の領土範囲が点線で表示されます。重複する領土は先に配置した施設が優先されます。
            </p>
            <button className="primary" onClick={() => setHelp(false)}>
              戦場へ戻る
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
