const { test } = require("node:test"),
  assert = require("node:assert/strict");
const {
  Core,
  environment,
  config,
  makeEngine,
  cloneCard,
  settle,
} = require("./lan-harness.cjs");
const g = environment(),
  catalog = Core.catalogFromPools(g.CARD_POOLS, g.CARD_IDS);
test("repeated 3-second reconnect attempts never extend the first outage deadline", () => {
  const guard = new Core.ResumeGuard(0),
    start = 100000;
  guard.begin(start);
  for (let elapsed = 3000; elapsed < 120000; elapsed += 3000) {
    guard.begin(start + elapsed); // A new hello/transport cannot complete recovery.
    assert.equal(guard.pausedAt, start);
    assert.equal(guard.ready(start + elapsed, start + elapsed), false);
    assert.equal(guard.expired(start + elapsed), false);
  }
  assert.equal(guard.expired(start + 120000), true);
  const reloaded = new Core.ResumeGuard(guard.pausedAt);
  assert.equal(reloaded.expired(start + 120001), true);
});
test("recovery requires acknowledged state plus stable heartbeats, with a new budget only after real recovery", () => {
  const guard = new Core.ResumeGuard(100000);
  guard.acknowledge(103000);
  guard.acknowledge(104000);
  assert.equal(guard.ready(108000, 103000), false);
  assert.equal(guard.ready(107999, 107999), false);
  assert.equal(guard.ready(108000, 108000), true);
  assert.equal(guard.ready(120000, 108000), false);
  guard.begin(120000);
  assert.equal(guard.pausedAt, 100000);
  assert.equal(guard.ready(130000, 130000), false);
  guard.acknowledge(130000);
  assert.equal(guard.ready(135000, 135000), true);
  guard.complete();
  guard.begin(140000);
  assert.equal(guard.pausedAt, 140000);
});
test("all six starter decks follow 40-card, four-copy and color rules", () => {
  for (const color of Object.keys(g.CARD_POOLS)) {
    const d = Core.starterDeck(color, catalog);
    assert.equal(
      Object.values(d.cards).reduce((a, b) => a + b, 0),
      40,
    );
    assert.ok(Object.values(d.cards).every((n) => n <= 4));
    assert.equal(Core.validateDeck(d, catalog).colors[0], color);
  }
});
test("deck validation rejects forged cards, amounts, colors and prototype keys", () => {
  const d = Core.starterDeck("白", catalog),
    first = Object.keys(d.cards)[0];
  for (const mutate of [
    (x) => (x.cards[first] = 5),
    (x) => (x.cards[first] = 1.5),
    (x) => (x.cards[first] = -1),
    (x) => (x.colors = ["白", "赤", "青"]),
    (x) => (x.colors = ["白", "白"]),
    (x) => (x.cards["存在しないカード"] = 4),
    (x) => (x.cards["農民"] = 0),
    (x) => (x.cards["皇帝軍"] = 4),
  ]) {
    const value = Core.copy(d);
    mutate(value);
    assert.throws(() => Core.validateDeck(value, catalog));
  }
  assert.throws(() =>
    Core.validateDeck(
      JSON.parse('{"colors":["白"],"cards":{"__proto__":40}}'),
      catalog,
    ),
  );
});
test("seeded random resumes at exactly the same next result", () => {
  const a = Core.random(42);
  for (let i = 0; i < 20; i++) a.next();
  const b = Core.random(a.state());
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});
test("views never send either deck or the opponent hand, including nested fields", async () => {
  const { g, engine } = makeEngine();
  engine.start(config(g));
  await settle();
  g.state.playerHand = [cloneCard(g, "農民")];
  g.state.enemyHand = [cloneCard(g, "「沈黙は破られた」")];
  g.state.playerDeck = [cloneCard(g, "白獅子の将軍")];
  g.state.enemyDeck = [cloneCard(g, "黒の将軍")];
  g.state.playerHand[0].forgedPrivateField = { secret: "DO-NOT-SEND" };
  g.state.battleHistory = [
    { turn: 1, side: "enemy", text: "探査：「沈黙は破られた」を確認" },
  ];
  const snapshot = engine.checkpoint().state;
  const p = Core.project(snapshot, "player", { catalog, publicNames: [] }),
    e = Core.project(snapshot, "enemy", { catalog, publicNames: [] });
  assert.equal(p.state.playerHand[0].name, "農民");
  assert.deepEqual(p.state.enemyHand, [{ hidden: true }]);
  assert.deepEqual(e.state.enemyHand, [{ hidden: true }]);
  assert.ok(!JSON.stringify(p).includes("「沈黙は破られた」"));
  assert.ok(!JSON.stringify(p).includes("白獅子の将軍"));
  assert.ok(!JSON.stringify(p).includes("黒の将軍"));
  assert.ok(!JSON.stringify(p).includes("DO-NOT-SEND"));
  assert.equal(e.state.playerHand[0].name, "「沈黙は破られた」");
  engine.stop();
});
test("private effect choices go exclusively to their owner and public lanes are remapped", async () => {
  const { g, engine } = makeEngine();
  engine.start(config(g));
  await settle();
  const card = cloneCard(g, "艦砲斉射"),
    state = engine.checkpoint().state;
  const request = {
    id: "q1",
    owner: "enemy",
    kind: "single",
    cards: [card],
    title: "山札の上を確認",
  };
  const p = Core.project(state, "player", { catalog, request }),
    e = Core.project(state, "enemy", { catalog, request });
  assert.equal(p.state.choiceRequest, null);
  assert.equal(p.requestId, null);
  assert.equal(e.state.choiceRequest.cards[0].name, "艦砲斉射");
  const target = {
    id: "q2",
    owner: "enemy",
    kind: "target",
    targetSide: "player",
    zone: "unit",
    candidates: [1],
    prompt: "相手を選択",
  };
  assert.equal(
    Core.project(state, "enemy", { catalog, request: target }).state
      .targetRequest.targetSide,
    "enemy",
  );
  engine.stop();
  await settle();
});
test("gate prevents old games, wrong players, duplicate commands, stale versions and out-of-turn choices", () => {
  const gate = new Core.Gate("m", { player: "p", enemy: "e" }),
    packet = {
      protocol: 1,
      matchId: "m",
      playerId: "p",
      seq: 1,
      version: 5,
      kind: "end",
    };
  assert.equal(
    gate.accept({ ...packet, matchId: "old" }, "player", 5, false, null).ok,
    false,
  );
  assert.equal(gate.accept(packet, "enemy", 5, false, null).ok, false);
  assert.equal(gate.accept(packet, "player", 5, false, null).ok, true);
  assert.equal(gate.accept(packet, "player", 5, false, null).duplicate, true);
  assert.equal(
    gate.accept({ ...packet, seq: 2, version: 4 }, "player", 5, false, null).ok,
    false,
  );
  assert.equal(
    gate.accept({ ...packet, seq: 3 }, "player", 5, true, null).ok,
    false,
  );
  const r = { id: "q1", owner: "enemy" };
  assert.equal(
    gate.accept(
      { ...packet, seq: 4, kind: "choice", requestId: "q1" },
      "player",
      5,
      true,
      r,
    ).ok,
    false,
  );
  assert.equal(
    gate.accept(
      { ...packet, playerId: "e", seq: 1, kind: "choice", requestId: "q1" },
      "enemy",
      5,
      true,
      r,
    ).ok,
    true,
  );
});
test("choice validation rejects impossible targets and duplicate multi selections", () => {
  assert.throws(() =>
    Core.choiceValue(
      { kind: "target", targetSide: "enemy", candidates: [1] },
      { side: "player", index: 1 },
    ),
  );
  assert.throws(() =>
    Core.choiceValue(
      { kind: "multi", cards: [{}, {}], max: 2 },
      { indices: [0, 0] },
    ),
  );
  assert.throws(() =>
    Core.choiceValue(
      { kind: "explore", cards: [{}] },
      { destinations: ["sideways"] },
    ),
  );
  assert.equal(
    Core.choiceValue({ kind: "revenge", cards: [{}] }, { cancel: true }),
    false,
  );
});
