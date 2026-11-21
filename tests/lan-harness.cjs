const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const Core = require("../network/core.js"),
  Engine = require("../network/engine.js");
const root = path.join(__dirname, "..");
function environment() {
  const nodes = new Map();
  function element(id) {
    if (!nodes.has(id))
      nodes.set(id, {
        style: {},
        children: [],
        innerHTML: "",
        textContent: "",
        hidden: false,
        classList: {
          add() {},
          remove() {},
          toggle() {},
          contains() {
            return false;
          },
        },
        setAttribute() {},
        getAttribute() {
          return null;
        },
        addEventListener() {},
        querySelector() {
          return element(id + "-child");
        },
        querySelectorAll() {
          return [];
        },
        appendChild(node) {
          this.children.push(node);
        },
        getBoundingClientRect() {
          return { top: 0, left: 0, width: 0, height: 0 };
        },
        remove() {},
      });
    return nodes.get(id);
  }
  const g = vm.createContext({
    console,
    Math,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
    document: {
      body: element("body"),
      documentElement: element("html"),
      getElementById: element,
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      createElement() {
        return element("created-" + nodes.size);
      },
    },
    window: { addEventListener() {}, scrollTo() {} },
    MutationObserver: class {
      observe() {}
    },
    ResizeObserver: class {
      observe() {}
    },
    requestAnimationFrame() {},
    matchMedia() {
      return { matches: true };
    },
  });
  for (const f of ["data/cards.js", "data/card-rules.js"])
    vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), g);
  for (const m of fs
    .readFileSync(path.join(root, "index.html"), "utf8")
    .matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))
    if (m[1].trim()) vm.runInContext(m[1], g);
  vm.runInContext(
    "render=renderStableBattle=renderPicker=renderBattleHud=renderDefenseLine=showDefenseShield=showPowerGain=showDestroy=showLandmarkCollapse=animateSummon=animateLandmark=animateCard=pulseClass=function(){};wait=showSpellCast=animateHandPlacement=animatePlacementLanding=placementMotion=async function(){};boardCard=function(){return null;};",
    g,
  );
  return g;
}
function config(g) {
  const catalog = Core.catalogFromPools(g.CARD_POOLS, g.CARD_IDS);
  return {
    matchId: "test-match",
    seed: 123456,
    names: { player: "Host", enemy: "Guest" },
    decks: {
      player: Core.starterDeck("赤", catalog),
      enemy: Core.starterDeck("白", catalog),
    },
  };
}
function makeEngine(onEvent) {
  const g = environment(),
    events = [];
  const engine = Engine.install(g, (event) => {
    events.push(event);
    if (onEvent) onEvent(event);
  });
  return { g, engine, events };
}
function cloneCard(g, name) {
  const t = g.cardTemplateByName(name);
  if (!t) throw Error(name);
  return g.cloneCard(t.row, t.color);
}
async function settle() {
  for (let i = 0; i < 8; i++)
    await new Promise((resolve) => setImmediate(resolve));
}
module.exports = {
  Core,
  Engine,
  environment,
  makeEngine,
  config,
  cloneCard,
  settle,
};
