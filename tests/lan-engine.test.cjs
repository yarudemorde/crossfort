const { test } = require("node:test"),
  assert = require("node:assert/strict");
const {
  Core,
  makeEngine,
  config,
  cloneCard,
  settle,
} = require("./lan-harness.cjs");
const { Host } = require("../network/session.js");
function fixture(g, engine) {
  g.state.playerTurn = true;
  g.state.firstSide = "player";
  g.state.mana =
    g.state.maxMana =
    g.state.enemyMana =
    g.state.enemyMaxMana =
      10;
  g.state.playerBoard.fill(null);
  g.state.enemyBoard.fill(null);
  g.state.playerLandmarks.fill(null);
  g.state.enemyLandmarks.fill(null);
  g.state.playerHand = [];
  g.state.enemyHand = [];
  g.state.playerLife = g.state.enemyLife = 20;
  g.state.grave = [];
  g.state.enemyGrave = [];
  engine.checkpoint();
}
test("lan uses original placement, guard combat, turns, extra turns and win detection", async () => {
  const { g, engine } = makeEngine();
  engine.start(config(g));
  await settle();
  fixture(g, engine);
  const farmer = cloneCard(g, "農民");
  g.state.playerHand = [farmer];
  engine.checkpoint();
  await engine.run({
    kind: "play",
    side: "player",
    payload: { cardId: farmer._lanId, lane: 2, mode: "normal" },
  });
  assert.equal(g.state.playerBoard[2], farmer);
  assert.equal(g.state.mana, 9);
  const guard = cloneCard(g, "クロスフォート兵");
  g.state.enemyBoard[1] = guard;
  farmer.canAttack = true;
  engine.checkpoint();
  assert.equal(g.defenderIndex("enemy", 2), 1);
  await engine.run({
    kind: "attack",
    side: "player",
    payload: { cardId: farmer._lanId, lane: 2 },
  });
  assert.ok(guard.power < guard.basePower || g.state.enemyBoard[1] === null);
  g.state.extraTurns.player = 1;
  await engine.run({ kind: "end", side: "player", payload: {} });
  assert.equal(g.activeSide(), "player");
  await engine.run({ kind: "end", side: "player", payload: {} });
  assert.equal(g.activeSide(), "enemy");
  assert.equal(g.state.matchMode, "lan");
  await engine.run({ kind: "surrender", side: "enemy", payload: {} });
  assert.equal(g.state.gameOver, true);
  assert.equal(engine.checkpoint().winner, "player");
  engine.stop();
});
test("private choices during the other player turn are routed to the correct owner", async () => {
  const { g, engine } = makeEngine();
  engine.start(config(g));
  await settle();
  fixture(g, engine);
  g.state.enemyHand = [cloneCard(g, "原始的な投槍")];
  const foe = cloneCard(g, "農民");
  g.state.playerBoard[0] = foe;
  const task = g.changeLife("enemy", -3, { sourceType: "ability" });
  await settle();
  let r = engine.getRequest();
  assert.equal(r.owner, "enemy");
  assert.equal(r.kind, "revenge");
  const view = Core.project(g.state, "enemy", { request: r });
  assert.doesNotThrow(() => g.cancelBattleRequests(view.state));
  assert.equal(engine.getRequest().id, r.id);
  assert.throws(() => engine.choose("player", r.id, { index: 0 }));
  engine.choose("enemy", r.id, { cancel: true });
  await task;
  engine.stop();
});
test("host recovery replays a pending placement choice once, preserving card identity and RNG", async () => {
  const first = makeEngine();
  first.engine.start(config(first.g));
  await settle();
  fixture(first.g, first.engine);
  const card = cloneCard(first.g, "銀嶺の軍旗手");
  first.g.state.playerHand = [card];
  const stable = first.engine.checkpoint(),
    command = {
      side: "player",
      kind: "play",
      payload: { cardId: card._lanId, lane: 2, mode: "normal" },
    };
  const original = first.engine.run(command);
  await settle();
  const r = first.engine.getRequest();
  assert.ok(r);
  assert.equal(r.owner, "player");
  const second = makeEngine();
  const replay = second.engine.recover(config(second.g), stable, {
    command,
    inputs: [],
  });
  await settle();
  const restored = second.engine.getRequest();
  assert.equal(restored.id, r.id);
  assert.equal(second.g.state.playerHand.length, 0);
  assert.equal(second.g.state.playerBoard[2].name, "銀嶺の軍旗手");
  first.engine.choose("player", r.id, { side: "player", index: 2 });
  second.engine.choose("player", restored.id, { side: "player", index: 2 });
  await Promise.all([original, replay]);
  assert.equal(second.g.state.playerBoard[2].power, 4);
  assert.equal(second.g.state.mana, 6);
  assert.deepEqual(
    Core.copy(second.g.state.playerHand),
    Core.copy(first.g.state.playerHand),
  );
  assert.equal(second.engine.checkpoint().rng, first.engine.checkpoint().rng);
  first.engine.stop();
  second.engine.stop();
});
test("host command validation rejects another hand, illegal costs and exhausted attacks", async () => {
  const { g, engine } = makeEngine();
  engine.start(config(g));
  await settle();
  fixture(g, engine);
  const c = cloneCard(g, "農民");
  g.state.enemyHand = [c];
  engine.checkpoint();
  await assert.rejects(
    engine.run({
      side: "player",
      kind: "play",
      payload: { cardId: c._lanId, lane: 0, mode: "normal" },
    }),
  );
  g.state.playerHand = [c];
  g.state.enemyHand = [];
  g.state.mana = 0;
  await assert.rejects(
    engine.run({
      side: "player",
      kind: "play",
      payload: { cardId: c._lanId, lane: 0, mode: "normal" },
    }),
  );
  g.state.playerBoard[0] = c;
  await assert.rejects(
    engine.run({
      side: "player",
      kind: "attack",
      payload: { cardId: c._lanId, lane: 0 },
    }),
  );
  engine.stop();
});
test("disconnect pauses an in-flight operation and resumes the same turn transition", async () => {
  const { g, engine } = makeEngine();
  engine.start(config(g));
  await settle();
  fixture(g, engine);
  engine.setOnline(false);
  let completed = false;
  const task = engine
    .run({ side: "player", kind: "end", payload: {} })
    .then(() => {
      completed = true;
    });
  await settle();
  assert.equal(completed, false);
  assert.equal(engine.isRunning(), true);
  engine.setOnline(true);
  await task;
  assert.equal(g.activeSide(), "enemy");
  assert.equal(g.state.turn, 1);
  assert.equal(g.state.enemyMana, 10);
  engine.stop();
});
test("accepted choice cannot be submitted again under a new sequence number", async () => {
  let host;
  const made = makeEngine((m) => {
      if (host) host.fromEngine(m);
    }),
    { g, engine } = made,
    catalog = Core.catalogFromPools(g.CARD_POOLS, g.CARD_IDS);
  host = new Host({
    engine,
    catalog,
    players: { player: "p", enemy: "e" },
    names: { player: "H", enemy: "G" },
    persist() {},
    deliver() {},
    newId() {
      return "choice-race";
    },
    seed() {
      return 1;
    },
  });
  await host.setReady("player", Core.starterDeck("赤", catalog), true);
  await host.setReady("enemy", Core.starterDeck("白", catalog), true);
  await host.setOnline(true);
  await settle();
  fixture(g, engine);
  const card = cloneCard(g, "銀嶺の軍旗手");
  g.state.playerHand = [card];
  host.stable = engine.checkpoint();
  host.command(
    {
      protocol: 1,
      matchId: "choice-race",
      playerId: "p",
      seq: 1,
      version: host.version,
      kind: "play",
      payload: { cardId: card._lanId, lane: 2, mode: "normal" },
    },
    "player",
  );
  await settle();
  const request = host.request;
  assert.ok(request);
  const packet = {
    protocol: 1,
    matchId: "choice-race",
    playerId: "p",
    seq: 2,
    version: host.version,
    kind: "choice",
    requestId: request.id,
    payload: { side: "player", index: 2 },
  };
  host.command(packet, "player");
  host.command({ ...packet, seq: 3 }, "player");
  await settle();
  assert.equal(g.state.playerBoard[2].power, 4);
  assert.equal(g.state.mana, 6);
  assert.equal(host.journal, null);
  engine.stop();
});
test("two serialized clients play through to a shared result; duplicate input does not apply twice", async () => {
  let host,
    saved,
    last = { player: null, enemy: null },
    delivered = { player: [], enemy: [] };
  const made = makeEngine((m) => {
      if (host) host.fromEngine(m);
    }),
    g = made.g,
    engine = made.engine,
    catalog = Core.catalogFromPools(g.CARD_POOLS, g.CARD_IDS);
  host = new Host({
    engine,
    catalog,
    players: { player: "p", enemy: "e" },
    names: { player: "Host", enemy: "Guest" },
    persist(s) {
      saved = Core.copy(s);
    },
    deliver(side, m) {
      const packet = JSON.parse(JSON.stringify(m));
      delivered[side].push(packet);
      if (m.type === "frame") last[side] = packet;
    },
    newId() {
      return "complete-match";
    },
    seed() {
      return 77;
    },
  });
  await host.setReady("player", Core.starterDeck("赤", catalog), true);
  await host.setReady("enemy", Core.starterDeck("白", catalog), true);
  await host.setOnline(true);
  await settle();
  let operations = 0,
    firstEnd = null;
  async function send(side, kind, payload) {
    const p = {
      protocol: 1,
      matchId: host.config.matchId,
      playerId: host.players[side],
      seq: host.gate.lastSeq[side] + 1,
      version: host.version,
      kind,
      payload,
      requestId: host.request && host.request.id,
    };
    host.command(JSON.parse(JSON.stringify(p)), side);
    await settle();
    if (!firstEnd && kind === "end") {
      firstEnd = Core.copy(g.state);
      host.command(p, side);
      await settle();
      assert.equal(g.state.turn, firstEnd.turn);
      assert.equal(g.state.playerTurn, firstEnd.playerTurn);
    }
    operations++;
  }
  for (let step = 0; step < 450 && !g.state.gameOver; step++) {
    if (host.request) {
      const r = host.request;
      await send(
        r.owner,
        "choice",
        r.kind === "target"
          ? { side: r.targetSide, index: r.candidates[0] }
          : r.kind === "revenge"
            ? { cancel: true }
            : r.kind === "single"
              ? { index: 0 }
              : r.kind === "discover"
                ? { use: true }
                : r.kind === "multi"
                  ? { indices: [] }
                  : { destinations: r.cards.map(() => "top") },
      );
      continue;
    }
    if (host.busy) {
      await settle();
      continue;
    }
    const side = g.activeSide();
    if (side === "enemy" && g.state.turn > 2) {
      await send(side, "end", {});
      continue;
    }
    const view = last[side].view.state,
      hand = g.handFor(side);
    let action = null;
    for (const visible of view.playerHand) {
      const c = hand.find((x) => x._lanId === visible._lanId);
      if (g.effectiveCost(c, side) > g.manaFor(side)) continue;
      let lane =
        c.type === "スペル"
          ? -1
          : Array.from({ length: 5 }, (_, i) => i).find((i) =>
              g.canPlaceCard(side, c, i),
            );
      if (lane !== undefined) {
        action = { cardId: c._lanId, lane, mode: "normal" };
        break;
      }
    }
    if (action) {
      await send(side, "play", action);
      continue;
    }
    const lane = g
      .boardFor(side)
      .findIndex(
        (c) =>
          c &&
          g.remainingAttacks(c) > 0 &&
          !g.hasKeyword(c, "cannotAttack", side),
      );
    if (lane >= 0) {
      await send(side, "attack", {
        lane,
        cardId: g.boardFor(side)[lane]._lanId,
      });
      continue;
    }
    await send(side, "end", {});
  }
  await settle();
  assert.equal(
    g.state.gameOver,
    true,
    "match reaches its real LIFE-based result",
  );
  assert.notEqual(last.player.view.winner, last.enemy.view.winner);
  assert.equal(
    last.player.view.state.playerLife,
    last.enemy.view.state.enemyLife,
  );
  assert.equal(
    last.player.view.state.enemyLife,
    last.enemy.view.state.playerLife,
  );
  assert.ok(operations > 15);
  assert.equal(saved.journal, null);
  for (const side of ["player", "enemy"])
    for (const packet of delivered[side].filter((x) => x.type === "frame")) {
      assert.ok(packet.view.state.enemyHand.every((c) => c.hidden));
      assert.ok(packet.view.state.playerDeck.every((c) => c.hidden));
      assert.ok(packet.view.state.enemyDeck.every((c) => c.hidden));
    }
  engine.stop();
});
