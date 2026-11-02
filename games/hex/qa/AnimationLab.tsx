/** Developer-only deterministic scene. Not included by the Pages build. */
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Board } from "../src/components/Board";
import { createGame } from "../src/game/engine";
import { getObservation } from "../src/game/selectors/observation";
import { calculateTerritory, recordExploration } from "../src/game/rules/board";
import { applyObservedAction } from "../src/app/visualFrames";
import { AnimationQueue } from "../src/presentation/AnimationQueue";
import type { ActiveAnimation } from "../src/presentation/types";
import type { Action, GameState, Owner, Piece } from "../src/game/types";
import "../src/app/style.css";
import "../src/app/responsive.css";
import "../src/app/terrain.css";
import "../src/app/battle.css";
function add(
  s: GameState,
  id: string,
  owner: Owner,
  q: number,
  power: number,
  definitionId = "unit_infantry",
) {
  const piece: Piece = {
    instanceId: id,
    definitionId,
    owner,
    kind: definitionId.startsWith("landmark") ? "landmark" : "unit",
    coord: { q, r: 0 },
    basePower: power,
    accumulatedDamage: 0,
    summonedOnOwnTurn: 0,
    actedThisTurn: false,
    placementOrder: s.nextPlacementOrder++,
    temporaryBonus: 0,
  };
  s.pieces.push(piece);
  return piece;
}
function scene(id: string) {
  const s = createGame(1102, "crossing");
  s.players.player.ownTurnNumber = 2;
  for (const h of s.config.maps[s.mapId].hexes) h.terrain = "plain";
  let action: Action = { type: "act", pieceId: "a", path: [], targetId: "t" };
  if (id === "move") {
    add(s, "a", "player", -3, 2, "unit_scout");
    action = {
      type: "act",
      pieceId: "a",
      path: [
        { q: -2, r: 0 },
        { q: -1, r: 0 },
        { q: 0, r: 0 },
      ],
    };
  } else if (id === "ranged") {
    add(s, "a", "player", 0, 3, "unit_archers");
    add(s, "t", "cpu", 2, 5);
  } else if (id === "destroy") {
    add(s, "a", "player", 0, 8);
    add(s, "t", "cpu", 1, 2, "landmark_basic");
  } else if (id === "spell") {
    add(s, "a", "player", 0, 4);
    add(s, "t", "cpu", 1, 5);
    s.players.player.hand = ["spell_damage"];
    s.players.player.resourceRemaining = 10;
    action = { type: "play", cardId: "spell_damage", targetId: "t" };
  } else if (id === "heal") {
    const own = add(s, "a", "player", 0, 6);
    own.accumulatedDamage = 3;
    s.players.player.hand = ["spell_heal"];
    s.players.player.resourceRemaining = 10;
    action = { type: "play", cardId: "spell_heal", targetId: "a" };
  } else {
    add(s, "a", "player", 0, 4);
    add(s, "t", "cpu", 1, 6);
  }
  s.territoryOwner = calculateTerritory(s);
  recordExploration(s, "player");
  recordExploration(s, "cpu");
  return { s, action };
}
function Lab() {
  const [id, setId] = useState("counter");
  const [game, setGame] = useState(() => scene("counter"));
  const [o, setO] = useState(() => getObservation(game.s, "player"));
  const [active, setActive] = useState<ActiveAnimation>();
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const q = useRef(new AnimationQueue());
  const epoch = useRef(0);
  const [reduced, setReduced] = useState(false);
  function reset(next = id) {
    epoch.current++;
    q.current.cancel();
    const g = scene(next);
    setGame(g);
    setO(getObservation(g.s, "player"));
    setActive(undefined);
    setBusy(false);
    setHistory([]);
  }
  useEffect(() => () => q.current.cancel(), []);
  async function play() {
    reset();
    const g = scene(id);
    const result = applyObservedAction(g.s, g.action, "player");
    const version = epoch.current;
    setBusy(true);
    const success = await q.current.play(
      result.frames,
      {
        start: (a) => {
          setActive(a);
          setO((p) => ({
            ...p,
            ...(a.frame.kind === "appear" ? a.frame.after : a.frame.before),
          }));
          setHistory((p) => [
            ...p,
            `${a.frame.kind}${a.frame.kind === "hit" ? ":" + a.frame.mode : ""}`,
          ]);
        },
        impact: (a) => {
          setActive(a);
          setO((p) => ({ ...p, ...a.frame.after }));
        },
      },
      reduced,
    );
    if (success && version === epoch.current) {
      setO(getObservation(result.state, "player"));
      setActive(undefined);
      setBusy(false);
    }
  }
  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "6px 12px",
          flexWrap: "wrap",
        }}
      >
        <b>開発用・演出検証</b>
        <select
          aria-label="検証局面"
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            reset(e.target.value);
          }}
        >
          <option value="counter">攻撃と反撃 4→6</option>
          <option value="move">3マス移動</option>
          <option value="ranged">射程2の攻撃</option>
          <option value="destroy">ランドマーク破壊</option>
          <option value="spell">スペルダメージ</option>
          <option value="heal">回復</option>
        </select>
        <button onClick={play} disabled={busy}>
          演出を再生
        </button>
        <button onClick={() => reset()}>停止・初期化</button>
        <label>
          <input
            type="checkbox"
            checked={reduced}
            onChange={(e) => setReduced(e.target.checked)}
          />
          低モーション
        </label>
        <output>{busy ? "再生中" : "待機"}</output>
      </header>
      <div
        className="app-shell is-battle"
        style={{ flex: 1, minHeight: 0, height: "auto", width: "100%" }}
      >
        <main className="battle-layout">
          <div className="battle-workspace">
            <section className="map-stage">
              <Board
                key={id}
                observation={o}
                legal={[]}
                stagedPath={[]}
                onHex={() => {}}
                onHover={() => {}}
                locked
                animation={active}
              />
            </section>
          </div>
        </main>
      </div>
      <footer
        style={{ padding: 8, height: 36, flex: "none" }}
        aria-label="再生順序"
      >
        {history.join(" → ")}
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Lab />);
