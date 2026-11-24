const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const {
  Core,
  environment,
  makeEngine,
  config,
  settle,
} = require("./lan-harness.cjs");

// Exercise the actual controller callbacks with fake time/DOM. Test hooks exist
// only in this in-memory test source, never in the distributed game.
function controller(role = "guest") {
  const g = environment(),
    store = new Map();
  let now = 100000,
    tick;
  const get = g.document.getElementById;
  g.document.getElementById = (id) => {
    const n = get(id);
    if (n.value == null) n.value = "";
    if (!n.options) n.options = [];
    return n;
  };
  g.document.addEventListener = () => {};
  g.document.visibilityState = "visible";
  Object.assign(g, {
    window: g,
    parent: g,
    location: {
      href: "https://crossfort.test/",
      origin: "https://crossfort.test",
      hash: "",
    },
    URL,
    URLSearchParams,
    addEventListener() {},
    removeEventListener() {},
    scrollTo() {},
    navigator: {},
    crypto: require("node:crypto").webcrypto,
    sessionStorage: {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    },
    setInterval(fn) {
      tick = fn;
      return 1;
    },
    clearInterval() {},
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    CFLanCore: Core,
    CFLanBuild: "test-build",
    CFLanVendor: { qrcode: require("qrcode-generator") },
    syncCompactBattleMode() {},
    queueHandDraw() {},
    confirm() {
      return true;
    },
  });
  const original = fs.readFileSync(
    require("node:path").join(__dirname, "../network/lan.js"),
    "utf8",
  );
  const source = original.replace(
    "  ui();",
    `g.__lanTest={
    configure(s,h){session=s;host=h;active=!!s.matchId;recovery=new Core.ResumeGuard(s.pausedAt);lastSeen=Date.now();},
    connect:onConnection,frame:receiveFrame,heartbeat:startHeartbeat,end:endLocal,
    inspect(){return {pausedAt:recovery.pausedAt,proof:recovery.synchronizedAt,authenticated,canInput:canInput(),ended:session.ended};}
  };\n  ui();`,
  );
  assert.notEqual(source, original);
  vm.runInContext(source, g);
  const session = {
    protocol: 1,
    build: "test-build",
    role,
    room: "CFABCDEFGH2345",
    mode: "cloud",
    playerId: role === "host" ? "a".repeat(32) : "b".repeat(32),
    token: "d".repeat(64),
    name: role,
    matchId: "recover-match",
    pausedAt: 100000,
    ready: true,
    seq: 0,
    ended: false,
  };
  return {
    g,
    session,
    setup(host = null) {
      g.__lanTest.configure(session, host);
      g.__lanTest.heartbeat();
    },
    at(value) {
      now = value;
    },
    tick() {
      tick();
    },
    inspect() {
      return g.__lanTest.inspect();
    },
    candidate() {
      return {
        sent: [],
        open: true,
        isOpen() {
          return this.open;
        },
        send(m) {
          this.sent.push(m);
        },
        close() {
          this.open = false;
        },
      };
    },
  };
}
function welcome(c, id = "connection-1") {
  return {
    type: "welcome",
    protocol: 1,
    build: "test-build",
    room: c.session.room,
    matchId: c.session.matchId,
    syncId: id,
    lastSeq: 0,
    hostName: "host",
  };
}

test("controller keeps the same deadline through 3-second welcomes and expires even while authenticated", () => {
  const c = controller();
  c.setup();
  for (let i = 0; i < 40; i++) {
    c.at(100000 + i * 3000);
    const wire = c.candidate();
    c.g.__lanTest.connect(wire);
    wire.onMessage(welcome(c, "attempt-" + i));
    c.at(100000 + (i + 1) * 3000);
    c.tick();
    assert.equal(c.inspect().pausedAt, 100000);
    assert.equal(c.inspect().canInput, false);
    if (i < 39) wire.onClose();
  }
  assert.equal(c.inspect().ended, true);
  assert.match(c.g.$("lanStatus").textContent, /制限時間/);
});
test("guest acknowledges an applied HP7 frame but waits for the matching host resume message", async () => {
  const made = makeEngine();
  made.engine.start(config(made.g));
  await settle();
  made.g.state.playerLife = 7;
  const c = controller();
  c.setup();
  const wire = c.candidate();
  c.g.__lanTest.connect(wire);
  wire.onMessage(welcome(c));
  c.g.__lanTest.frame(
    {
      matchId: c.session.matchId,
      version: 20,
      view: Core.project(made.g.state, "enemy", {}),
    },
    false,
  );
  assert.ok(wire.sent.some((m) => m.type === "stateAck" && m.version === 20));
  assert.equal(c.inspect().canInput, false);
  wire.onMessage({
    type: "resumed",
    syncId: "old-connection",
    matchId: c.session.matchId,
    version: 20,
  });
  assert.equal(c.inspect().pausedAt, 100000);
  c.at(106000);
  wire.onMessage({
    type: "resumed",
    syncId: "connection-1",
    matchId: c.session.matchId,
    version: 20,
  });
  assert.equal(c.inspect().pausedAt, 0);
  assert.equal(c.inspect().canInput, true);
  assert.equal(c.g.state.enemyLife, 7);
  made.engine.stop();
});
test("host remains paused until the current connection acknowledges state and stays healthy for five seconds", () => {
  const c = controller("host"),
    calls = [];
  const host = {
    version: 20,
    gate: { lastSeq: { enemy: 0 } },
    setGuest() {},
    prepareResume() {
      calls.push("prepare");
      this.version++;
    },
    setOnline(v) {
      calls.push(v);
      return Promise.resolve();
    },
    broadcast() {},
    abort(reason) {
      calls.push("abort");
      c.g.__lanTest.end(reason);
    },
  };
  c.setup(host);
  const wire = c.candidate();
  c.g.__lanTest.connect(wire);
  wire.onMessage({
    type: "hello",
    protocol: 1,
    build: "test-build",
    room: c.session.room,
    playerId: "b".repeat(32),
    token: "d".repeat(64),
    name: "guest",
  });
  const reply = wire.sent.find((m) => m.type === "welcome");
  assert.ok(reply.syncId);
  assert.deepEqual(calls, ["prepare"]);
  c.at(106000);
  wire.onMessage({ type: "pong" });
  c.tick();
  assert.equal(c.inspect().pausedAt, 100000);
  wire.onMessage({
    type: "stateAck",
    syncId: "old",
    matchId: c.session.matchId,
    version: 21,
  });
  assert.equal(c.inspect().proof, 0);
  wire.onMessage({
    type: "stateAck",
    syncId: reply.syncId,
    matchId: c.session.matchId,
    version: 20,
  });
  assert.equal(c.inspect().proof, 0);
  wire.onMessage({
    type: "stateAck",
    syncId: reply.syncId,
    matchId: c.session.matchId,
    version: 21,
  });
  c.at(110999);
  wire.onMessage({ type: "pong" });
  c.tick();
  assert.equal(c.inspect().pausedAt, 100000);
  c.at(111000);
  c.tick();
  assert.equal(c.inspect().pausedAt, 100000);
  wire.onMessage({ type: "pong" });
  c.tick();
  assert.equal(c.inspect().pausedAt, 0);
  assert.ok(calls.includes(true));
  assert.ok(
    wire.sent.some((m) => m.type === "resumed" && m.syncId === reply.syncId),
  );
});
