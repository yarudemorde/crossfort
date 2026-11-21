/* Host-only adapter: the original card engine remains the only rules authority. */
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./core.js"));
  else root.CFLanEngine = factory(root.CFLanCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";
  function install(g, emit) {
    var originals = {},
      running = false,
      online = true,
      stopped = false,
      replaying = false,
      rng = Core.random(1),
      requestCounter = 0,
      cardCounter = 0,
      requestMeta = new WeakMap(),
      chooserOwner = null,
      publicNames = new Set(),
      pending = null,
      winner = null,
      queued = false,
      replayInputs = [],
      gateWaiters = [];
    [
      "render",
      "renderStableBattle",
      "renderPicker",
      "logMsg",
      "showSelectionBanner",
      "checkedBattle",
      "wait",
      "showSpellCast",
      "animateHandPlacement",
      "animateCard",
      "showDestroy",
      "showLandmarkCollapse",
      "floatAt",
      "finish",
      "isHumanSide",
      "sideLabel",
      "playSelectedCard",
      "attack",
      "endTurn",
      "resolveTarget",
      "resolvePicker",
      "confirmPicker",
      "cancelPicker",
      "placementMotion",
    ].forEach(function (name) {
      originals[name] = g[name];
    });
    var chooserNames = [
      "chooseTarget",
      "chooseZoneCard",
      "chooseZoneCards",
      "chooseExploreDestinations",
      "chooseDiscoverUse",
      "chooseRevengeCard",
      "chooseOpenSlot",
      "chooseAttackDestination",
      "chooseRelicSlot",
      "chooseLaneTarget",
    ];
    var names = { player: "プレイヤー1", enemy: "プレイヤー2" };
    function stamp() {
      if (!g.state) return;
      var seen = new Set();
      [
        g.state.playerBoard,
        g.state.enemyBoard,
        g.state.playerLandmarks,
        g.state.enemyLandmarks,
        g.state.playerHand,
        g.state.enemyHand,
        g.state.playerDeck,
        g.state.enemyDeck,
        g.state.grave,
        g.state.enemyGrave,
        g.state.choiceRequest && g.state.choiceRequest.cards,
      ].forEach(function (zone) {
        (zone || []).forEach(function (c) {
          if (c && !seen.has(c)) {
            seen.add(c);
            if (!c._lanId) c._lanId = "c" + ++cardCounter;
          }
        });
      });
      [
        g.state.playerBoard,
        g.state.enemyBoard,
        g.state.playerLandmarks,
        g.state.enemyLandmarks,
        g.state.grave,
        g.state.enemyGrave,
      ].forEach(function (zone) {
        (zone || []).forEach(function (c) {
          if (c) publicNames.add(c.name);
        });
      });
    }
    function capture() {
      if (!g.state) return null;
      var r = g.state.targetRequest || g.state.choiceRequest;
      if (!r) {
        pending = null;
        return null;
      }
      if (!requestMeta.has(r)) {
        requestMeta.set(r, {
          id: "q" + ++requestCounter,
          owner: chooserOwner || g.activeSide(),
        });
        if (replaying && replayInputs.length) {
          var input = replayInputs.shift(),
            meta = requestMeta.get(r);
          if (input.requestId !== meta.id || input.side !== meta.owner)
            throw Error("再接続時の選択履歴が一致しません");
          queueMicrotask(function () {
            try {
              choose(input.side, input.requestId, input.value);
            } catch (e) {
              emit({ type: "fatal", message: e.message });
            }
          });
        }
      }
      var m = requestMeta.get(r);
      stamp();
      pending = g.state.targetRequest
        ? {
            id: m.id,
            owner: m.owner,
            kind: "target",
            targetSide: r.targetSide,
            zone: r.zone || "unit",
            candidates: r.candidates.slice(),
            prompt: String(r.prompt || "対象を選択"),
          }
        : {
            id: m.id,
            owner: m.owner,
            kind: r.kind,
            cards: Core.copy(r.cards),
            title: String(r.title || "カードを選択"),
            max: r.max,
            selected: Core.copy(r.selected || []),
            destinations: Core.copy(r.destinations || []),
          };
      return pending;
    }
    function stateCopy() {
      stamp();
      var s = Core.copy(g.state);
      s.targetRequest = null;
      s.choiceRequest = null;
      return s;
    }
    function checkpoint() {
      return {
        state: stateCopy(),
        rng: rng.state(),
        requestCounter: requestCounter,
        cardCounter: cardCounter,
        publicNames: Array.from(publicNames),
        winner: winner,
      };
    }
    function publish() {
      if (stopped || !g.state) return;
      capture();
      if (replaying && replayInputs.length) return;
      emit({
        type: "update",
        state: stateCopy(),
        request: Core.copy(pending),
        busy: running,
        log: g.$("battleLog").textContent || "",
        publicNames: Array.from(publicNames),
        winner: winner,
      });
    }
    function changed() {
      capture();
      if (queued) return;
      queued = true;
      queueMicrotask(function () {
        queued = false;
        publish();
      });
    }
    function visual(type, value) {
      if (!replaying && !stopped)
        emit({
          type: "visual",
          event: Object.assign({ kind: type }, value || {}),
        });
    }
    function reveal(card) {
      if (card) publicNames.add(card.name);
    }
    function waitOnline() {
      if (online || replaying || stopped) return Promise.resolve();
      return new Promise(function (resolve) {
        gateWaiters.push(resolve);
      });
    }
    function setOnline(value) {
      online = !!value;
      if (online) {
        gateWaiters.splice(0).forEach(function (r) {
          r();
        });
        publish();
      }
    }
    g.gameRandom = function () {
      return rng.next();
    };
    g.isHumanSide = function (side) {
      return g.state && g.state.matchMode === "lan"
        ? true
        : originals.isHumanSide(side);
    };
    g.sideLabel = function (side) {
      return g.state && g.state.matchMode === "lan"
        ? names[side]
        : originals.sideLabel(side);
    };
    [
      "render",
      "renderStableBattle",
      "renderPicker",
      "logMsg",
      "showSelectionBanner",
    ].forEach(function (name) {
      g[name] = function () {
        var result = originals[name].apply(g, arguments);
        changed();
        return result;
      };
    });
    chooserNames.forEach(function (name) {
      var original = g[name];
      g[name] = function (side) {
        var previous = chooserOwner;
        chooserOwner = side;
        try {
          var result = original.apply(g, arguments);
          capture();
          return result;
        } finally {
          chooserOwner = previous;
        }
      };
    });
    g.checkedBattle = async function (result, generation) {
      await waitOnline();
      var value = await originals.checkedBattle(result, generation);
      await waitOnline();
      return value;
    };
    g.wait = function (ms) {
      return replaying ? Promise.resolve() : originals.wait(ms);
    };
    g.placementMotion = function () {
      return replaying
        ? Promise.resolve()
        : originals.placementMotion.apply(g, arguments);
    };
    g.showSpellCast = function (card, side, options) {
      reveal(card);
      visual("spell", { side: side, card: Core.cardCopy(card, side) });
      return replaying
        ? Promise.resolve()
        : originals.showSpellCast(card, side, options);
    };
    g.animateHandPlacement = function (side, lane, card) {
      reveal(card);
      visual("place", {
        side: side,
        lane: lane,
        card: Core.cardCopy(card, side),
      });
      return replaying
        ? Promise.resolve()
        : arguments[3]
          ? originals.animateHandPlacement.apply(g, arguments)
          : g.wait(g.placementMotionReduced() ? 0 : 300);
    };
    g.animateCard = function (side, lane) {
      visual("attack", { side: side, lane: lane });
      return originals.animateCard.apply(g, arguments);
    };
    g.showDestroy = function (side, lane) {
      visual("destroy", { side: side, lane: lane });
      return originals.showDestroy.apply(g, arguments);
    };
    g.showLandmarkCollapse = function (side, lane) {
      visual("collapse", { side: side, lane: lane });
      return originals.showLandmarkCollapse.apply(g, arguments);
    };
    g.floatAt = function (node, text, type) {
      var location = null;
      ["player", "enemy"].forEach(function (side) {
        if (
          node &&
          g.document.querySelector(
            '.battleHud[data-side="' + side + '"] .life',
          ) === node
        )
          location = { side: side, zone: "life", lane: -1 };
        for (var lane = 0; lane < 5; lane++)
          if (node && g.boardCard(side, lane) === node)
            location = { side: side, zone: "unit", lane: lane };
      });
      if (location)
        visual(
          "number",
          Object.assign(location, { text: String(text), type: type }),
        );
      return originals.floatAt.apply(g, arguments);
    };
    g.finish = function (win, text) {
      if (!g.state || g.state.matchMode !== "lan")
        return originals.finish(win, text);
      if (g.state.gameOver) return;
      winner = win ? "player" : "enemy";
      g.state.gameOver = true;
      g.state.animating = false;
      g.cancelBattleRequests(g.state);
      g.logMsg(names[winner] + "の勝利");
      changed();
    };
    function configure(config) {
      names = config.names;
      g.savedDecks = [
        Object.assign({}, config.decks.player, {
          id: "lan-player",
          name: names.player + "のデッキ",
        }),
        Object.assign({}, config.decks.enemy, {
          id: "lan-enemy",
          name: names.enemy + "のデッキ",
        }),
      ];
      rng = Core.random(config.seed);
      publicNames = new Set();
      requestCounter = cardCounter = 0;
      requestMeta = new WeakMap();
      pending = null;
      winner = null;
      stopped = false;
    }
    function start(config) {
      configure(config);
      g.startGame(
        config.decks.player.colors[0],
        config.decks.enemy.colors[0],
        "lan",
        "lan-player",
        "lan-enemy",
        "random",
        { enemyLabel: names.enemy },
      );
      if (!g.state || g.state.matchMode !== "lan")
        throw Error("通信対戦を開始できませんでした");
      stamp();
      g.state.selectedCard = -1;
      g.state.selectedSlot = -1;
      publish();
      emit({ type: "stable", checkpoint: checkpoint() });
    }
    async function recover(config, saved, journal) {
      configure(config);
      if (!saved) {
        start(config);
        return;
      }
      if (g.state) g.cancelBattleRequests(g.state);
      g.state = Core.copy(saved.state);
      g.state.generation = ++g.battleGenerationCounter;
      g.state.targetRequest = null;
      g.state.choiceRequest = null;
      g.state.animating = false;
      g.state.selectedCard = -1;
      g.state.selectedSlot = -1;
      rng.restore(saved.rng);
      requestCounter = saved.requestCounter || 0;
      cardCounter = saved.cardCounter || 0;
      publicNames = new Set(saved.publicNames || []);
      winner = saved.winner || null;
      g.$("gameScreen").style.display = "grid";
      g.$("controls").style.display = "block";
      originals.render();
      if (journal) {
        replaying = true;
        replayInputs = Core.copy(journal.inputs || []);
        try {
          await run(journal.command);
        } finally {
          replaying = false;
          replayInputs = [];
          publish();
        }
      } else {
        publish();
        emit({ type: "stable", checkpoint: checkpoint() });
      }
    }
    function validate(command) {
      var side = command.side,
        p = command.payload || {},
        s = g.state;
      if (!s || s.gameOver) throw Error("対戦は終了しています");
      if (command.kind === "surrender") return;
      if (g.activeSide() !== side) throw Error("相手のターンです");
      if (command.kind === "play") {
        var hand = g.handFor(side),
          index = hand.findIndex(function (c) {
            return c._lanId === p.cardId;
          });
        if (index < 0) throw Error("手札が更新されました");
        var c = hand[index];
        if (p.mode !== "normal" && p.mode !== "dive")
          throw Error("使用方法が不正です");
        if (p.mode === "dive" && g.rulesFor(c).dive == null)
          throw Error("潜水を持たないカードです");
        var cost =
          p.mode === "dive" ? g.diveCost(c, side) : g.effectiveCost(c, side);
        if (cost > g.manaFor(side)) throw Error("資源が足りません");
        if (
          c.type !== "スペル" &&
          (!Core.integer(p.lane, 0, 4) || !g.canPlaceCard(side, c, p.lane))
        )
          throw Error("配置できないスロットです");
        command.handIndex = index;
      } else if (command.kind === "attack") {
        if (!Core.integer(p.lane, 0, 4)) throw Error("攻撃元が不正です");
        var attacker = g.boardFor(side)[p.lane];
        if (
          !attacker ||
          attacker.type !== "ユニット" ||
          !g.remainingAttacks(attacker) ||
          g.hasKeyword(attacker, "cannotAttack", side)
        )
          throw Error("このユニットは攻撃できません");
        if (p.cardId !== attacker._lanId) throw Error("盤面が更新されました");
      } else if (command.kind !== "end") throw Error("操作内容が不正です");
    }
    async function run(command) {
      if (running) throw Error("前の操作を処理中です");
      validate(command);
      running = true;
      var p = command.payload || {};
      changed();
      try {
        if (command.kind === "play") {
          g.state.selectedCard = command.handIndex;
          g.state.selectedSlot = p.lane == null ? -1 : p.lane;
          await originals.playSelectedCard(p.mode);
        } else if (command.kind === "attack")
          await originals.attack(command.side, p.lane);
        else if (command.kind === "end") await originals.endTurn();
        else if (command.kind === "surrender")
          g.finish(command.side === "enemy", "投了");
      } catch (e) {
        if (e !== g.staleBattle || !g.state.gameOver) {
          emit({ type: "fatal", message: (e && e.message) || String(e) });
          throw e;
        }
      } finally {
        running = false;
        if (g.state) {
          g.state.selectedCard = -1;
          g.state.selectedSlot = -1;
          g.state.animating = false;
        }
        publish();
        if (!stopped) emit({ type: "stable", checkpoint: checkpoint() });
      }
    }
    function choose(side, id, input) {
      capture();
      if (!pending || id !== pending.id || side !== pending.owner)
        throw Error("選択権がありません");
      var value = Core.choiceValue(pending, input),
        r = g.state.targetRequest || g.state.choiceRequest;
      if (pending.kind === "target")
        originals.resolveTarget(value.side, value.index);
      else if (pending.kind === "single" || pending.kind === "revenge") {
        if (value === false) originals.cancelPicker();
        else originals.resolvePicker(value.index);
      } else if (pending.kind === "discover") {
        if (value) originals.confirmPicker();
        else originals.cancelPicker();
      } else if (pending.kind === "multi") {
        r.selected = value;
        originals.confirmPicker();
      } else {
        r.destinations = value;
        originals.confirmPicker();
      }
      pending = null;
      changed();
    }
    function stop() {
      stopped = true;
      online = true;
      gateWaiters.splice(0).forEach(function (r) {
        r();
      });
      if (g.state) {
        g.cancelBattleRequests(g.state);
        g.state.generation = ++g.battleGenerationCounter;
        g.state.gameOver = true;
      }
      running = false;
    }
    function surrender(side) {
      g.finish(side === "enemy", "投了");
      if (!running) emit({ type: "stable", checkpoint: checkpoint() });
    }
    return {
      start: start,
      recover: recover,
      run: run,
      choose: choose,
      setOnline: setOnline,
      stop: stop,
      surrender: surrender,
      checkpoint: checkpoint,
      publish: publish,
      getRequest: function () {
        capture();
        return pending;
      },
      isRunning: function () {
        return running;
      },
    };
  }
  return { install: install };
});
