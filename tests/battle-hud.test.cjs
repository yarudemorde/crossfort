const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const {
  environment,
  Core,
  config,
  makeEngine,
  settle,
} = require("./lan-harness.cjs");
const root = path.join(__dirname, ".."),
  html = fs.readFileSync(path.join(root, "index.html"), "utf8");
test("generated HUD sprites are RGBA PNGs with production dimensions", () => {
  for (const [name, w, h] of [
    ["frame", 1800, 268],
    ["wing_left",1000,180],
    ["wing_right",1000,180],
    ["life_crest",209,280],
    ["life", 256, 256],
    ["deck", 128, 128],
    ["grave", 128, 128],
    ["resource_bar", 1500, 200],
    ["resource_filled", 52, 128],
    ["resource_spent", 52, 128],
    ["resource_locked", 52, 128],
  ]) {
    const data = fs.readFileSync(
      path.join(root, "assets/ui/battle/hud/hud_" + name + ".png"),
    );
    assert.equal(data.subarray(1, 4).toString(), "PNG");
    assert.equal(data.readUInt32BE(16), w);
    assert.equal(data.readUInt32BE(20), h);
    assert.equal(data[25], 6, "true RGBA");
  }
});
test("HUD keeps unique public IDs, semantic icon counts and animation anchors", () => {
  for (const id of [
    "topBattleHud",
    "bottomBattleHud",
    "enemyLife",
    "playerLife",
    "enemyMana",
    "mana",
    "enemyDeckCount",
    "playerDeckCount",
    "enemyGraveCount",
    "graveCount",
    "enemyResourceTrack",
    "playerResourceTrack",
    "enemyResourceSlots",
    "playerResourceSlots",
    "enemyName",
    "playerName",
    "turnLabel",
    "enemyHandCount",
    "battleMenuToggle",
  ])
    assert.equal(html.split('id="' + id + '"').length - 1, 1, id);
  assert.match(html, /class="life enemy"/);
  assert.match(html, /class="life player"/);
  assert.match(html, /aria-label="自分の墓地枚数"/);
  assert.match(html, /aria-label="相手の山札枚数"/);
  assert.match(html, /battle-hud\.css/);
});
test("resource renderer uses exactly ten generated slots and retains filled/spent/locked decisions", () => {
  const g = environment();
  g.state = { mana: 0, maxMana: 0, enemyMana: 0, enemyMaxMana: 0 };
  for (const [current, maximum] of [
    [0, 0],
    [0, 10],
    [5, 7],
    [10, 10],
  ]) {
    g.state.mana = current;
    g.state.maxMana = maximum;
    g.renderResourceSlots(
      "player",
      "playerResourceSlots",
      "playerResourceTrack",
    );
    const rendered = g.$("playerResourceSlots").innerHTML;
    assert.equal((rendered.match(/class="resourceSlot /g) || []).length, 10);
    for (const [status, count] of [
      ["filled", current],
      ["spent", maximum - current],
      ["locked", 10 - maximum],
    ]) {
      assert.equal(
        (rendered.match(new RegExp("resourceSlot " + status, "g")) || [])
          .length,
        count,
      );
      if (count)
        assert.ok(rendered.includes("hud_resource_" + status + ".png"));
    }
  }
});
test("shared HUD renderer maps CPU/local/LAN/season observations without changing LIFE or mana", async () => {
  const { g: rules, engine } = makeEngine();
  engine.start(config(rules));
  await settle();
  rules.state.playerLife = 18;
  rules.state.enemyLife = 7;
  rules.state.mana = 5;
  rules.state.maxMana = 7;
  rules.state.enemyMana = 3;
  rules.state.enemyMaxMana = 5;
  const g = environment();
  vm.runInContext(html.match(/function renderBattleHud\([\s\S]*?\n}/)[0], g);
  for (const mode of ["cpu", "local", "lan", "season"]) {
    g.state =
      mode === "lan"
        ? Core.project(rules.state, "enemy", {}).state
        : Core.copy(rules.state);
    g.state.matchMode =
      mode === "local" ? "local" : mode === "lan" ? "lan" : "cpu";
    g.state.eventMode = mode === "season";
    const top = mode === "local" ? "player" : "enemy",
      bottom = mode === "local" ? "enemy" : "player";
    const before = JSON.stringify(g.state);
    g.renderBattleHud(top, bottom);
    assert.equal(JSON.stringify(g.state), before, "HUD rendering is read-only");
    assert.equal(
      g.$("playerLife").textContent,
      g.state[bottom === "player" ? "playerLife" : "enemyLife"],
    );
    assert.equal(
      g.$("enemyLife").textContent,
      g.state[top === "player" ? "playerLife" : "enemyLife"],
    );
    assert.equal(
      g.$("mana").textContent,
      g.manaFor(bottom) + "/" + g.maxManaFor(bottom),
    );
    assert.ok(g.$("playerResourceSlots").innerHTML.includes("hud_resource_"));
  }
  engine.stop();
});
