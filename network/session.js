(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./core.js"));
  else root.CFLanSession = factory(root.CFLanCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";
  function Host(options, saved) {
    this.options = options;
    this.engine = options.engine;
    this.catalog = options.catalog;
    this.players = Core.copy(options.players);
    this.names = Core.copy(options.names);
    this.decks = { player: null, enemy: null };
    this.ready = { player: false, enemy: false };
    this.connected = false;
    this.busy = false;
    this.version = 0;
    this.config = null;
    this.stable = null;
    this.journal = null;
    this.latest = null;
    this.request = null;
    this.publicNames = [];
    this.winner = null;
    this.gate = null;
    this.ended = false;
    this.engineStarted = false;
    if (saved) {
      this.players = saved.players;
      this.names = saved.names;
      this.decks = saved.decks;
      this.ready = saved.ready;
      this.version = saved.version || 0;
      this.config = saved.config;
      this.stable = saved.stable;
      this.journal = saved.journal;
      this.winner = saved.winner;
      this.ended = !!saved.ended;
      if (this.config) {
        this.gate = new Core.Gate(
          this.config.matchId,
          this.players,
          saved.lastSeq,
        );
        if (this.stable) {
          this.latest = this.stable.state;
          this.publicNames = this.stable.publicNames || [];
        }
      }
    }
  }
  Host.prototype.saved = function () {
    return Core.copy({
      players: this.players,
      names: this.names,
      decks: this.decks,
      ready: this.ready,
      version: this.version,
      config: this.config,
      stable: this.stable,
      journal: this.journal,
      lastSeq: this.gate && this.gate.lastSeq,
      winner: this.winner,
      ended: this.ended,
    });
  };
  Host.prototype.persist = function () {
    this.options.persist(this.saved());
  };
  Host.prototype.setGuest = function (id, name) {
    if (this.players.enemy && this.players.enemy !== id)
      throw Error("この部屋には既に対戦相手がいます");
    this.players.enemy = id;
    this.names.enemy = String(name || "対戦相手").slice(0, 20);
    this.persist();
  };
  Host.prototype.lobby = function () {
    var self = this;
    ["player", "enemy"].forEach(function (side) {
      if (!self.players[side]) return;
      self.options.deliver(side, {
        type: "lobby",
        ownReady: self.ready[side],
        opponentReady: self.ready[Core.opposite(side)],
        opponentName: self.names[Core.opposite(side)] || "対戦相手",
        connected: self.connected,
        matchId: self.config && self.config.matchId,
      });
    });
  };
  Host.prototype.setReady = function (side, deck, ready) {
    if (this.config || this.ended)
      throw Error("開始した対戦のデッキは変更できません");
    if (!this.players[side]) throw Error("参加者を確認できません");
    if (ready) {
      this.decks[side] = Core.validateDeck(deck, this.catalog);
      this.ready[side] = true;
    } else {
      this.ready[side] = false;
      this.decks[side] = null;
    }
    this.persist();
    this.lobby();
    return this.tryStart();
  };
  Host.prototype.tryStart = async function () {
    if (
      this.config ||
      !this.connected ||
      !this.ready.player ||
      !this.ready.enemy
    )
      return;
    this.config = {
      matchId: this.options.newId(),
      seed: this.options.seed(),
      names: Core.copy(this.names),
      decks: Core.copy(this.decks),
    };
    this.gate = new Core.Gate(this.config.matchId, this.players);
    this.busy = true;
    this.persist();
    this.engineStarted = true;
    await this.engine.start(this.config);
  };
  Host.prototype.setOnline = async function (value) {
    this.connected = !!value;
    this.engine.setOnline(this.connected);
    this.lobby();
    if (this.connected && this.config && !this.engineStarted && !this.ended) {
      this.engineStarted = true;
      this.busy = true;
      await this.engine.recover(this.config, this.stable, this.journal);
    } else if (this.connected && !this.config) await this.tryStart();
    if (this.latest) this.broadcast();
  };
  Host.prototype.prepareResume = function () {
    // Deliver a recovery snapshot while the original rule engine stays paused.
    this.connected = false;
    this.engine.setOnline(false);
    if (this.config && !this.engineStarted && !this.ended) {
      this.engineStarted = true;
      this.busy = true;
      var self = this;
      Promise.resolve(
        this.engine.recover(this.config, this.stable, this.journal),
      ).catch(function (e) {
        self.abort(e.message);
      });
    }
    this.lobby();
    if (this.latest) this.broadcast();
  };
  Host.prototype.fromEngine = function (message) {
    if (this.ended) return;
    if (message.type === "update") {
      this.latest = message.state;
      this.request = message.request;
      this.busy = message.busy;
      this.log = message.log;
      this.publicNames = message.publicNames;
      this.winner = message.winner;
      this.broadcast();
    } else if (message.type === "stable") {
      this.stable = message.checkpoint;
      this.latest = message.checkpoint.state;
      this.publicNames = message.checkpoint.publicNames || [];
      this.winner = message.checkpoint.winner;
      this.journal = null;
      this.busy = false;
      this.request = null;
      this.persist();
      this.broadcast();
    } else if (message.type === "visual") {
      var self = this,
        event = message.event;
      ["player", "enemy"].forEach(function (side) {
        self.options.deliver(side, {
          type: "visual",
          matchId: self.config.matchId,
          event: event,
        });
      });
    } else if (message.type === "fatal")
      this.abort("ルール処理を中断しました：" + message.message);
  };
  Host.prototype.broadcast = function (only) {
    if (!this.latest || !this.config) return;
    this.version++;
    this.persist();
    var self = this;
    ["player", "enemy"].forEach(function (side) {
      var view = Core.project(self.latest, side, {
        catalog: self.catalog,
        publicNames: self.publicNames,
        request: self.request,
        names: self.names,
        busy: self.busy,
        log: self.log,
        winner: self.winner,
      });
      self.options.deliver(side, {
        type: "frame",
        protocol: Core.VERSION,
        matchId: self.config.matchId,
        version: self.version,
        lastSeq: self.gate.lastSeq[side],
        view: view,
      });
    });
  };
  Host.prototype.command = function (packet, side) {
    var self = this;
    if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
      this.options.deliver(side, {
        type: "error",
        message: "操作データを確認できません",
      });
      return;
    }
    if (!this.connected || this.ended || !this.gate) {
      this.options.deliver(side, {
        type: "ack",
        seq: packet.seq,
        ok: false,
        error: "接続を待っています",
      });
      return;
    }
    var result = this.gate.accept(
      packet,
      side,
      this.version,
      this.busy,
      this.request,
    );
    if (!result.ok) {
      this.persist();
      this.options.deliver(side, {
        type: "ack",
        matchId: this.config.matchId,
        seq: packet.seq,
        ok: !!result.duplicate,
        error: result.error,
        duplicate: !!result.duplicate,
      });
      this.broadcast(side);
      return;
    }
    try {
      if (packet.kind === "choice") {
        Core.choiceValue(this.request, packet.payload);
        if (!this.journal) throw Error("選択中の操作を確認できません");
        this.journal.inputs.push({
          side: side,
          requestId: packet.requestId,
          value: Core.copy(packet.payload),
        });
        this.request = null;
        this.persist();
        this.broadcast();
        Promise.resolve(
          this.engine.choose(side, packet.requestId, packet.payload),
        ).catch(function (e) {
          self.abort(e.message);
        });
      } else {
        var command = {
          side: side,
          kind: packet.kind,
          payload: Core.copy(packet.payload || {}),
        };
        if (packet.kind === "surrender" && this.busy) {
          this.engine.surrender(side);
        } else {
          this.journal = { command: command, inputs: [] };
          this.busy = true;
          this.persist();
          this.broadcast();
          Promise.resolve(this.engine.run(command)).catch(function (e) {
            if (self.ended) return;
            self.busy = false;
            self.journal = null;
            self.persist();
            self.options.deliver(side, { type: "error", message: e.message });
            self.broadcast();
          });
        }
      }
      this.options.deliver(side, {
        type: "ack",
        matchId: this.config.matchId,
        seq: packet.seq,
        ok: true,
      });
    } catch (e) {
      this.options.deliver(side, {
        type: "ack",
        matchId: this.config.matchId,
        seq: packet.seq,
        ok: false,
        error: e.message,
      });
      this.persist();
      this.broadcast(side);
    }
  };
  Host.prototype.abort = function (reason) {
    if (this.ended) return;
    this.ended = true;
    this.busy = false;
    this.engine.stop();
    this.persist();
    var self = this;
    ["player", "enemy"].forEach(function (side) {
      self.options.deliver(side, {
        type: "ended",
        reason: String(reason || "対戦を終了しました"),
      });
    });
  };
  return { Host: Host };
});
