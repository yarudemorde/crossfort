import type {
  Action,
  ActionResult,
  Coord,
  GameState,
  Owner,
  Piece,
  PlayerState,
} from "./types";
import {
  defaultConfig,
  defaultDeck,
  validateConfig,
  validateDeck,
} from "./data";
import { shuffle } from "./rng";
import { hexDistance, hexId, sameHex } from "./rules/hex";
import {
  calculateMovement,
  calculateTerritory,
  calculateVisibleHexes,
  powerOf,
  stats,
  terrainAt,
  recordExploration,
} from "./rules/board";
export const other = (owner: Owner): Owner =>
  owner === "player" ? "cpu" : "player";
const freshPlayer = (): PlayerState => ({
  deck: [],
  hand: [],
  resourceCards: [],
  playedCards: [],
  resourceTotal: 0,
  resourceRemaining: 0,
  exchangedThisTurn: false,
  exploredHexIds: [],
  ownTurnNumber: 0,
});
const fail = (message: string): never => {
  throw new Error(message);
};
function emit(
  s: GameState,
  type: string,
  text: string,
  audience: Owner[] = ["player", "cpu"],
  coord?: Coord,
  pieceId?: string,
) {
  s.actionLog.push({
    id: s.actionLog.length + 1,
    type,
    text,
    audience,
    coord,
    pieceId,
  });
}
function atAudience(s: GameState, coord: Coord): Owner[] {
  return (["player", "cpu"] as Owner[]).filter((o) =>
    calculateVisibleHexes(s, o).includes(hexId(coord)),
  );
}
const nameOf = (s: GameState, p: Piece) =>
  p.kind === "headquarters" ? "本城" : s.config.cards[p.definitionId].name;
function refresh(s: GameState) {
  s.territoryOwner = calculateTerritory(s);
  recordExploration(s, "player");
  recordExploration(s, "cpu");
  checkVictoryMutable(s);
}
function checkVictoryMutable(s: GameState) {
  if (s.outcome) return;
  for (const owner of ["player", "cpu"] as Owner[])
    if (!s.pieces.some((p) => p.owner === owner && p.kind === "headquarters")) {
      s.outcome = { winner: other(owner), reason: "headquartersDestroyed" };
      s.phase = "finished";
      emit(
        s,
        "victory",
        `${other(owner) === "player" ? "蒼の軍勢" : "紅の軍勢"}が敵本城を破壊。戦いは決した。`,
      );
      return;
    }
}
export const checkVictory = (s: GameState) => s.outcome;
function revealMutable(s: GameState, owner: Owner) {
  const p = s.players[owner];
  const count = Math.min(
    s.config.rules.resources.publicCardCap,
    s.config.rules.resources.initialPublicCards +
      s.pieces.filter((x) => x.owner === owner && x.kind === "landmark")
        .length *
        s.config.rules.resources.extraPerLivingFriendlyLandmark,
  );
  p.resourceCards = p.deck.splice(0, count);
  p.resourceTotal = p.resourceCards.reduce(
    (a, id) => a + s.config.cards[id].resource,
    0,
  );
  p.resourceRemaining = p.resourceTotal;
}
function startMutable(s: GameState, owner: Owner) {
  if (s.phase === "finished") return;
  s.activePlayer = owner;
  const p = s.players[owner];
  p.ownTurnNumber++;
  p.exchangedThisTurn = false;
  for (const x of s.pieces.filter((x) => x.owner === owner))
    x.actedThisTurn = false;
  p.hand = p.deck.splice(0, s.config.rules.deck.drawPerTurn);
  revealMutable(s, owner);
  emit(
    s,
    "turn",
    `${owner === "player" ? "蒼の軍勢" : "紅の軍勢"} 第${p.ownTurnNumber}ターン · 資源${p.resourceTotal}`,
  );
  refresh(s);
}
function recycleMutable(s: GameState, owner: Owner) {
  const p = s.players[owner];
  const pile = [...p.hand, ...p.playedCards, ...p.resourceCards];
  const shuffled = shuffle(pile, s.rngState);
  s.rngState = shuffled.seed;
  p.deck.push(...shuffled.items);
  p.hand = [];
  p.playedCards = [];
  p.resourceCards = [];
  p.resourceTotal = 0;
  p.resourceRemaining = 0;
  p.exchangedThisTurn = false;
  emit(s, "recycle", `${pile.length}枚を回収し、束だけを混ぜて山札の下へ。`, [
    owner,
  ]);
  for (const piece of [...s.pieces].filter(
    (x) => x.owner === owner && x.temporaryBonus !== 0,
  )) {
    piece.temporaryBonus = 0;
    if (piece.basePower - piece.accumulatedDamage <= 0) destroy(s, piece);
  }
  refresh(s);
}
export function createGame(
  seed: number,
  mapId: string,
  deckA = defaultDeck,
  deckB = defaultDeck,
  firstPlayer: Owner = "player",
  config = defaultConfig,
): GameState {
  validateConfig(config);
  for (const deck of [deckA, deckB]) {
    const e = validateDeck(deck, config);
    if (e) throw Error(e);
  }
  const map = config.maps[mapId];
  if (!map) throw Error("未定義のマップです。");
  if (
    hexDistance(map.headquarters.player, map.headquarters.cpu) <=
    config.rules.headquarters.territory * 2
  )
    throw Error("初期本城の領土が重なるマップは使用できません。");
  const s: GameState = {
    version: "prototype-1.0",
    seed: seed >>> 0,
    rngState: seed >>> 0,
    mapId,
    config: structuredClone(config),
    activePlayer: firstPlayer,
    phase: "main",
    players: { player: freshPlayer(), cpu: freshPlayer() },
    pieces: [],
    territoryOwner: {},
    nextInstanceNumber: 1,
    nextPlacementOrder: 1,
    actionLog: [],
    commands: [],
  };
  for (const owner of ["player", "cpu"] as Owner[]) {
    const r = shuffle(owner === "player" ? deckA : deckB, s.rngState);
    s.rngState = r.seed;
    s.players[owner].deck = r.items;
    s.pieces.push({
      instanceId: `hq_${owner}`,
      definitionId: "headquarters",
      owner,
      kind: "headquarters",
      coord: { ...map.headquarters[owner] },
      basePower: config.rules.headquarters.power,
      accumulatedDamage: 0,
      summonedOnOwnTurn: 0,
      actedThisTurn: false,
      placementOrder: 0,
      temporaryBonus: 0,
    });
  }
  refresh(s);
  startMutable(s, firstPlayer);
  return s;
}
export function startTurn(state: GameState, owner: Owner): GameState {
  const s = structuredClone(state);
  startMutable(s, owner);
  return s;
}
export function endTurn(state: GameState, owner: Owner): ActionResult {
  return applyAction(state, { type: "endTurn" }, owner);
}
export function revealResources(state: GameState, owner: Owner): GameState {
  const s = structuredClone(state);
  if (s.players[owner].resourceCards.length)
    throw Error("資源は公開済みです。");
  revealMutable(s, owner);
  return s;
}
export function exchangeHandCard(
  state: GameState,
  owner: Owner,
  cardId: string,
): ActionResult {
  return applyAction(state, { type: "exchange", cardId }, owner);
}
function destroy(s: GameState, p: Piece) {
  emit(
    s,
    "destroy",
    `${nameOf(s, p)}が${p.kind === "unit" ? "倒れた" : "崩壊した"}。`,
    atAudience(s, p.coord),
    p.coord,
    p.instanceId,
  );
  s.pieces = s.pieces.filter((x) => x.instanceId !== p.instanceId);
  checkVictoryMutable(s);
}
function damage(s: GameState, p: Piece, amount: number) {
  const before = powerOf(s, p);
  if (amount >= before) {
    destroy(s, p);
    return;
  }
  p.accumulatedDamage += amount;
}
function combatMutable(s: GameState, a: Piece, t: Piece) {
  const amount = powerOf(s, a);
  for (const owner of atAudience(s, t.coord)) {
    const aVisible = calculateVisibleHexes(s, owner).includes(hexId(a.coord));
    emit(
      s,
      "attack",
      `${aVisible ? nameOf(s, a) : "視野外の部隊"} → ${nameOf(s, t)}：戦力${powerOf(s, t)}、${amount}ダメージ。`,
      [owner],
      t.coord,
      t.instanceId,
    );
  }
  damage(s, t, amount);
  if (!s.pieces.includes(t)) {
    refresh(s);
    return;
  }
  emit(
    s,
    "survive",
    `${nameOf(s, t)}の残存戦力 ${powerOf(s, t)}。`,
    atAudience(s, t.coord),
    t.coord,
    t.instanceId,
  );
  if (hexDistance(a.coord, t.coord) <= stats(s, t).range) {
    const terrainRule = s.config.rules.terrain[terrainAt(s, t.coord)] as {
      counterBonus?: number;
    };
    const bonus = terrainRule.counterBonus ?? 0;
    const counter = powerOf(s, t) + bonus;
    const audience = Array.from(
      new Set([...atAudience(s, a.coord), ...atAudience(s, t.coord)]),
    );
    for (const owner of audience) {
      const visible = calculateVisibleHexes(s, owner);
      emit(
        s,
        "counter",
        `${visible.includes(hexId(t.coord)) ? nameOf(s, t) : "視野外の守備隊"}の反撃 ${counter}${bonus ? `（地形 +${bonus}）` : ""} → ${visible.includes(hexId(a.coord)) ? nameOf(s, a) : "視野外の攻撃部隊"}。`,
        [owner],
      );
    }
    damage(s, a, counter);
  }
  refresh(s);
}
export function resolveCombat(
  state: GameState,
  attackerId: string,
  targetId: string,
): ActionResult {
  return applyAction(state, {
    type: "act",
    pieceId: attackerId,
    path: [],
    targetId,
  });
}
function requireTarget(s: GameState, id: string | undefined): Piece {
  return (
    s.pieces.find((p) => p.instanceId === id) ?? fail("対象の駒がありません。")
  );
}
function playMutable(
  s: GameState,
  action: Extract<Action, { type: "play" }>,
  owner: Owner,
) {
  const p = s.players[owner];
  if (!p.hand.includes(action.cardId)) fail("手札にないカードです。");
  const c = s.config.cards[action.cardId];
  if (!c) fail("カードが未定義です。");
  if (p.resourceRemaining < c.cost)
    fail(`資源不足です。必要${c.cost}、残り${p.resourceRemaining}。`);
  const visible = new Set(calculateVisibleHexes(s, owner));
  if (c.type === "spell") {
    const effect = c.effects![0];
    if (effect.effectId === "reveal") {
      if (!action.coord || !visible.has(hexId(action.coord)))
        fail("現在の視野内を指定してください。");
      const hexes = s.config.maps[s.mapId].hexes.filter(
        (h) => hexDistance(h, action.coord!) <= effect.radius!,
      );
      recordExploration(s, owner, hexes);
      emit(s, "spell", `${c.name}：周辺の地形を探索。`, [owner], action.coord);
    } else {
      const t = requireTarget(s, action.targetId);
      if (!visible.has(hexId(t.coord))) fail("未発見の敵は対象にできません。");
      if (effect.effectId === "directDamage") {
        if (t.owner === owner) fail("敵の駒を指定してください。");
        emit(
          s,
          "spell",
          `${c.name} → ${nameOf(s, t)}：${effect.amount}ダメージ。`,
          atAudience(s, t.coord),
          t.coord,
        );
        damage(s, t, effect.amount!);
      } else {
        if (t.owner !== owner) fail("味方の駒を指定してください。");
        if (effect.effectId === "heal") {
          if (t.accumulatedDamage === 0) fail("回復するダメージがありません。");
          t.accumulatedDamage = Math.max(
            0,
            t.accumulatedDamage - effect.amount!,
          );
        } else {
          if (t.kind !== "unit") fail("味方ユニットを指定してください。");
          t.temporaryBonus += effect.amount!;
        }
        emit(
          s,
          "spell",
          `${c.name} → ${nameOf(s, t)}。`,
          atAudience(s, t.coord),
          t.coord,
        );
      }
    }
  } else {
    const coord = action.coord ?? fail("配置先を指定してください。");
    if (!s.config.maps[s.mapId].hexes.some((h) => sameHex(h, coord)))
      fail("盤外には配置できません。");
    if (!visible.has(hexId(coord))) fail("未探索のマスには配置できません。");
    const at = s.pieces.filter((x) => sameHex(x.coord, coord));
    if (at.some((x) => x.owner !== owner))
      fail("敵の駒がいるマスには配置できません。");
    if (c.type === "unit") {
      if (at.some((x) => x.kind === "unit")) fail("ユニットが既にいます。");
      if (
        !s.pieces.some(
          (x) =>
            x.owner === owner &&
            x.kind !== "unit" &&
            hexDistance(x.coord, coord) === 1,
        )
      )
        fail("自軍拠点の隣接マスに配置してください。");
    } else {
      if (at.some((x) => x.kind !== "unit")) fail("施設が既にあります。");
      if (s.territoryOwner[hexId(coord)] === other(owner))
        fail("敵領土には建設できません。");
      if (
        !s.pieces.some(
          (x) =>
            x.owner === owner &&
            x.kind === "unit" &&
            hexDistance(x.coord, coord) === 1,
        )
      )
        fail("自軍ユニットの隣接マスに建設してください。");
    }
    const piece: Piece = {
      instanceId: `piece_${s.nextInstanceNumber++}`,
      definitionId: c.id,
      kind: c.type,
      owner,
      coord: { ...coord },
      basePower: c.power!,
      accumulatedDamage: 0,
      summonedOnOwnTurn: p.ownTurnNumber,
      actedThisTurn: true,
      placementOrder: c.type === "landmark" ? s.nextPlacementOrder++ : 0,
      temporaryBonus: 0,
    };
    s.pieces.push(piece);
    emit(
      s,
      "deploy",
      `${owner === "player" ? "蒼" : "紅"}：${c.name}を${c.type === "unit" ? "展開" : "建設"}。`,
      atAudience(s, coord),
      coord,
      piece.instanceId,
    );
  }
  p.hand.splice(p.hand.indexOf(c.id), 1);
  p.playedCards.push(c.id);
  p.resourceRemaining -= c.cost;
  emit(
    s,
    "payment",
    `${c.name}：資源${c.cost}を支払い（残り${p.resourceRemaining}）。`,
    [owner],
  );
  refresh(s);
}
function actMutable(
  s: GameState,
  action: Extract<Action, { type: "act" }>,
  owner: Owner,
) {
  const piece = requireTarget(s, action.pieceId);
  if (piece.owner !== owner) fail("自軍の駒を選択してください。");
  if (piece.summonedOnOwnTurn >= s.players[owner].ownTurnNumber)
    fail("配置したターンは行動できません。");
  if (piece.actedThisTurn) fail("この駒は行動済みです。");
  if (!action.path.length && !action.targetId)
    fail("移動先か攻撃対象を選択してください。");
  const movement =
    piece.kind === "unit"
      ? calculateMovement(
          stats(s, piece).movement,
          terrainAt(s, piece.coord),
          s.config,
        )
      : 0;
  if (action.path.length > movement) fail("移動可能な距離を超えています。");
  const initialVisible = new Set(calculateVisibleHexes(s, owner));
  const map = s.config.maps[s.mapId];
  let previous = piece.coord;
  const visited = new Set([hexId(previous)]);
  for (const c of action.path) {
    if (
      hexDistance(previous, c) !== 1 ||
      !map.hexes.some((h) => sameHex(h, c)) ||
      visited.has(hexId(c))
    )
      fail("移動経路が不正です。");
    if (
      s.pieces.some(
        (x) =>
          x.owner !== owner &&
          sameHex(x.coord, c) &&
          initialVisible.has(hexId(c)),
      )
    )
      fail("敵のいるマスは通過できません。");
    visited.add(hexId(c));
    previous = c;
  }
  const final = action.path.at(-1);
  if (
    final &&
    s.pieces.some(
      (x) =>
        x.instanceId !== piece.instanceId &&
        x.kind === "unit" &&
        x.owner === owner &&
        sameHex(x.coord, final),
    )
  )
    fail("味方ユニットのいるマスには停止できません。");
  let lastFree = { ...piece.coord };
  let blocked = false;
  for (const c of action.path) {
    if (s.pieces.some((x) => x.owner !== owner && sameHex(x.coord, c))) {
      blocked = true;
      piece.coord = lastFree;
      recordExploration(s, owner);
      emit(
        s,
        "discovery",
        "進路に敵影。直前の空きマスで停止した。",
        [owner],
        c,
      );
      break;
    }
    piece.coord = { ...c };
    recordExploration(s, owner);
    if (
      !s.pieces.some(
        (x) =>
          x.instanceId !== piece.instanceId &&
          x.kind === "unit" &&
          sameHex(x.coord, c),
      )
    )
      lastFree = { ...c };
  }
  if (action.path.length)
    emit(
      s,
      "move",
      `${nameOf(s, piece)}が移動。`,
      atAudience(s, piece.coord),
      piece.coord,
      piece.instanceId,
    );
  if (action.targetId && !blocked) {
    const target = requireTarget(s, action.targetId);
    if (target.owner === owner) fail("敵の駒を選択してください。");
    if (!calculateVisibleHexes(s, owner).includes(hexId(target.coord)))
      fail("未発見の敵は攻撃できません。");
    const d = hexDistance(piece.coord, target.coord);
    if (d < 1 || d > stats(s, piece).range) fail("攻撃対象が射程外です。");
    piece.actedThisTurn = true;
    combatMutable(s, piece, target);
  } else {
    piece.actedThisTurn = true;
    refresh(s);
  }
}
export function applyAction(
  state: GameState,
  action: Action,
  owner: Owner = state.activePlayer,
): ActionResult {
  if (state.phase === "finished")
    return { state, events: [], error: "戦いは終了しています。" };
  if (owner !== state.activePlayer)
    return { state, events: [], error: "自分のターンではありません。" };
  const s = structuredClone(state);
  const start = s.actionLog.length;
  try {
    if (action.type === "endTurn") {
      recycleMutable(s, owner);
      if (!s.outcome) startMutable(s, other(owner));
    } else if (action.type === "exchange") {
      const p = s.players[owner];
      if (p.exchangedThisTurn) fail("交換は1ターンに1回です。");
      const index = p.hand.indexOf(action.cardId);
      if (index < 0) fail("手札から交換してください。");
      p.hand.splice(index, 1);
      p.deck.push(action.cardId);
      const id = p.deck.shift();
      if (id) p.hand.push(id);
      p.exchangedThisTurn = true;
      emit(s, "exchange", "手札1枚を山札の下へ送り、上から1枚引いた。", [
        owner,
      ]);
    } else if (action.type === "play") playMutable(s, action, owner);
    else if (action.type === "act") actMutable(s, action, owner);
    else fail("不明な操作です。");
    s.commands.push({ owner, action: structuredClone(action) });
    return { state: s, events: s.actionLog.slice(start) };
  } catch (e) {
    return {
      state,
      events: [],
      error: e instanceof Error ? e.message : "操作が不正です。",
    };
  }
}
export function replay(
  seed: number,
  mapId: string,
  commands: { owner: Owner; action: Action }[],
  firstPlayer: Owner = "player",
  config = defaultConfig,
): GameState {
  let s = createGame(
    seed,
    mapId,
    defaultDeck,
    defaultDeck,
    firstPlayer,
    config,
  );
  for (const c of commands) {
    const result = applyAction(s, c.action, c.owner);
    if (result.error) throw Error(result.error);
    s = result.state;
  }
  return s;
}
