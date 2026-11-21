/* Transport-independent rules for the LAN protocol. No DOM or network access. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CFLanCore = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var VERSION = 1,
    RESUME_MS = 120000,
    MAX_PACKET = 300000;
  var CARD_FIELDS = [
    "id",
    "name",
    "cost",
    "type",
    "species",
    "text",
    "color",
    "legendary",
    "canAttack",
    "power",
    "basePower",
    "attacksUsedThisTurn",
    "grantedKeywords",
    "permanentPowerBonus",
    "handCostReduction",
    "spellDamageBonus",
    "temporaryEffects",
    "isToken",
    "_lanId",
  ];
  function copy(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }
  function opposite(side) {
    return side === "player" ? "enemy" : "player";
  }
  function validSide(side) {
    return side === "player" || side === "enemy";
  }
  function integer(n, min, max) {
    return Number.isSafeInteger(n) && n >= min && n <= max;
  }
  function catalogFromPools(pools, ids) {
    var result = Object.create(null);
    Object.keys(pools).forEach(function (color) {
      pools[color].forEach(function (row) {
        result[row[0]] = {
          name: row[0],
          color: color,
          id: ids[row[0]] || "",
          cost: row[1],
          power: row[2],
          type: row[3],
          text: row[4] || "",
        };
      });
    });
    return result;
  }
  function validateDeck(raw, catalog) {
    if (
      !raw ||
      typeof raw !== "object" ||
      !Array.isArray(raw.colors) ||
      raw.colors.length < 1 ||
      raw.colors.length > 2 ||
      new Set(raw.colors).size !== raw.colors.length
    )
      throw Error("デッキカラーは1〜2色です");
    var colors = raw.colors.slice(),
      validColors = new Set(
        Object.values(catalog).map(function (c) {
          return c.color;
        }),
      );
    if (
      colors.some(function (c) {
        return typeof c !== "string" || !validColors.has(c);
      })
    )
      throw Error("デッキカラーが不正です");
    if (!raw.cards || Array.isArray(raw.cards) || typeof raw.cards !== "object")
      throw Error("デッキのカードを確認できません");
    var cards = Object.create(null),
      total = 0,
      keys = Object.keys(raw.cards);
    if (keys.length > 40) throw Error("デッキ枚数が不正です");
    keys.forEach(function (name) {
      var n = raw.cards[name];
      if (
        !Object.prototype.hasOwnProperty.call(catalog, name) ||
        !integer(n, 1, 4) ||
        colors.indexOf(catalog[name].color) < 0
      )
        throw Error("使用できないカード、カラー、または採用枚数があります");
      cards[name] = n;
      total += n;
    });
    if (total !== 40) throw Error("通信対戦のデッキは40枚必要です");
    return {
      id: "lan-deck",
      name: String(raw.name || "遠征デッキ").slice(0, 20),
      colors: colors,
      cards: cards,
    };
  }
  function starterDeck(color, catalog) {
    var colors = [color],
      all = Object.values(catalog);
    if (
      all.filter(function (c) {
        return c.color === color;
      }).length < 10
    ) {
      var counts = {};
      all.forEach(function (c) {
        if (c.color !== color) counts[c.color] = (counts[c.color] || 0) + 1;
      });
      colors.push(
        Object.keys(counts).sort(function (a, b) {
          return counts[b] - counts[a] || a.localeCompare(b, "ja");
        })[0],
      );
    }
    var units = all
      .filter(function (c) {
        return colors.includes(c.color) && c.type === "ユニット";
      })
      .sort(function (a, b) {
        return (
          (a.color === color ? 0 : 1) - (b.color === color ? 0 : 1) ||
          a.cost - b.cost ||
          a.name.localeCompare(b.name, "ja")
        );
      });
    var rest = all
      .filter(function (c) {
        return colors.includes(c.color) && c.type !== "ユニット";
      })
      .sort(function (a, b) {
        return (
          (a.color === color ? 0 : 1) - (b.color === color ? 0 : 1) ||
          a.cost - b.cost ||
          a.name.localeCompare(b.name, "ja")
        );
      });
    var choices = units.slice(0, 7).concat(rest.slice(0, 3));
    all.forEach(function (c) {
      if (
        choices.length < 10 &&
        colors.includes(c.color) &&
        !choices.includes(c)
      )
        choices.push(c);
    });
    var cards = Object.create(null);
    choices.slice(0, 10).forEach(function (c) {
      cards[c.name] = 4;
    });
    return validateDeck(
      {
        name: colors.join("・") + "の基本デッキ",
        colors: colors,
        cards: cards,
      },
      catalog,
    );
  }
  function random(seed) {
    var value = Number(seed) >>> 0 || 0x6d2b79f5;
    return {
      next: function () {
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        value >>>= 0;
        return value / 4294967296;
      },
      state: function () {
        return value >>> 0;
      },
      restore: function (n) {
        value = Number(n) >>> 0 || 0x6d2b79f5;
      },
    };
  }
  function cardCopy(card, recipient) {
    if (!card) return null;
    var out = {};
    CARD_FIELDS.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(card, k)) out[k] = copy(card[k]);
    });
    if (recipient === "enemy" && Array.isArray(out.temporaryEffects))
      out.temporaryEffects.forEach(function (e) {
        if (validSide(e.ownerSide)) e.ownerSide = opposite(e.ownerSide);
      });
    return out;
  }
  function hiddenCards(count) {
    return Array.from(
      { length: Math.max(0, Math.min(200, count || 0)) },
      function () {
        return { hidden: true };
      },
    );
  }
  function redactor(catalog, known) {
    var names = Object.keys(catalog).sort(function (a, b) {
      return b.length - a.length;
    });
    if (!names.length)
      return function (text) {
        return String(text || "");
      };
    var pattern = new RegExp(
      names
        .map(function (n) {
          return n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        })
        .join("|"),
      "g",
    );
    return function (text) {
      return String(text || "").replace(pattern, function (name) {
        return known.has(name) ? name : "非公開カード";
      });
    };
  }
  function project(state, recipient, meta) {
    if (!validSide(recipient)) throw Error("Invalid viewer");
    meta = meta || {};
    var other = opposite(recipient),
      map = function (s) {
        return s === recipient ? "player" : "enemy";
      };
    function get(side, p, e) {
      return state[side === "player" ? p : e];
    }
    function list(side, p, e) {
      return (get(side, p, e) || []).map(function (c) {
        return cardCopy(c, recipient);
      });
    }
    var ownHand = get(recipient, "playerHand", "enemyHand") || [],
      otherHand = get(other, "playerHand", "enemyHand") || [];
    var known = new Set(meta.publicNames || []);
    ownHand.forEach(function (c) {
      known.add(c.name);
    });
    [
      state.playerBoard,
      state.enemyBoard,
      state.playerLandmarks,
      state.enemyLandmarks,
      state.grave,
      state.enemyGrave,
    ].forEach(function (zone) {
      (zone || []).forEach(function (c) {
        if (c) known.add(c.name);
      });
    });
    var clean = redactor(meta.catalog || {}, known),
      request = meta.request;
    var view = {
      generation: meta.generation || 1,
      matchMode: "lan",
      eventMode: false,
      eventStage: 0,
      eventBoss: false,
      turn: state.turn,
      firstSide: map(state.firstSide),
      playerTurn: map(state.playerTurn ? "player" : "enemy") === "player",
      playerColor: get(recipient, "playerColor", "enemyColor"),
      enemyColor:
        (
          (get(other, "playerBoard", "enemyBoard") || []).find(function (c) {
            return c && c.color;
          }) || {}
        ).color || "",
      playerLife: get(recipient, "playerLife", "enemyLife"),
      enemyLife: get(other, "playerLife", "enemyLife"),
      mana: get(recipient, "mana", "enemyMana"),
      maxMana: get(recipient, "maxMana", "enemyMaxMana"),
      enemyMana: get(other, "mana", "enemyMana"),
      enemyMaxMana: get(other, "maxMana", "enemyMaxMana"),
      playerHand: ownHand.map(function (c) {
        return cardCopy(c, recipient);
      }),
      enemyHand: hiddenCards(otherHand.length),
      playerDeck: hiddenCards(
        (get(recipient, "playerDeck", "enemyDeck") || []).length,
      ),
      enemyDeck: hiddenCards(
        (get(other, "playerDeck", "enemyDeck") || []).length,
      ),
      playerBoard: list(recipient, "playerBoard", "enemyBoard"),
      enemyBoard: list(other, "playerBoard", "enemyBoard"),
      playerLandmarks: list(recipient, "playerLandmarks", "enemyLandmarks"),
      enemyLandmarks: list(other, "playerLandmarks", "enemyLandmarks"),
      grave: list(recipient, "grave", "enemyGrave"),
      enemyGrave: list(other, "grave", "enemyGrave"),
      playerDefense: copy(get(recipient, "playerDefense", "enemyDefense")),
      enemyDefense: copy(get(other, "playerDefense", "enemyDefense")),
      playerLaneStates: copy(
        get(recipient, "playerLaneStates", "enemyLaneStates") || [
          {},
          {},
          {},
          {},
          {},
        ],
      ),
      enemyLaneStates: copy(
        get(other, "playerLaneStates", "enemyLaneStates") || [
          {},
          {},
          {},
          {},
          {},
        ],
      ),
      selectedCard: -1,
      selectedSlot: -1,
      animating: !!meta.busy || !!state.animating,
      gameOver: !!state.gameOver,
      targetRequest: null,
      choiceRequest: null,
      enemyLabel: (meta.names || {})[other] || "対戦相手",
      extraTurns: {
        player: (state.extraTurns || {})[recipient] || 0,
        enemy: (state.extraTurns || {})[other] || 0,
      },
      spellsThisTurn: {
        player: (state.spellsThisTurn || {})[recipient] || 0,
        enemy: (state.spellsThisTurn || {})[other] || 0,
      },
      battleHistory: (state.battleHistory || []).slice(-200).map(function (e) {
        return { turn: e.turn, side: map(e.side), text: clean(e.text) };
      }),
    };
    if (request && request.owner === recipient) {
      if (request.kind === "target")
        view.targetRequest = {
          targetSide: map(request.targetSide),
          zone: request.zone,
          candidates: request.candidates.slice(),
          prompt: request.prompt,
        };
      else
        view.choiceRequest = {
          kind: request.kind,
          cards: request.cards.map(function (c) {
            return cardCopy(c, recipient);
          }),
          title: request.title,
          max: request.max,
          selected: copy(request.selected || []),
          destinations: copy(request.destinations || []),
        };
    }
    return {
      state: view,
      log: clean(meta.log),
      requestId: request && request.owner === recipient ? request.id : null,
      choosing: !!request,
      choosingSelf: !!request && request.owner === recipient,
      winner: state.gameOver
        ? get(recipient, "playerLife", "enemyLife") <= 0
          ? "enemy"
          : get(other, "playerLife", "enemyLife") <= 0
            ? "player"
            : meta.winner
              ? map(meta.winner)
              : null
        : null,
    };
  }
  function Gate(matchId, players, lastSeq) {
    this.matchId = matchId;
    this.players = players;
    this.lastSeq = Object.assign({ player: 0, enemy: 0 }, lastSeq || {});
  }
  Gate.prototype.accept = function (packet, side, version, busy, request) {
    if (
      !validSide(side) ||
      !packet ||
      packet.protocol !== VERSION ||
      packet.matchId !== this.matchId ||
      packet.playerId !== this.players[side] ||
      !integer(packet.seq, 1, Number.MAX_SAFE_INTEGER)
    )
      return { ok: false, error: "対戦または操作番号が不正です" };
    if (packet.seq <= this.lastSeq[side])
      return { ok: false, duplicate: true, ack: packet.seq };
    if (packet.seq !== this.lastSeq[side] + 1)
      return {
        ok: false,
        error: "操作番号が前後しました。状態を再取得します",
        resync: true,
      };
    var error = null,
      choice = packet.kind === "choice";
    if (
      ["play", "attack", "end", "choice", "surrender"].indexOf(packet.kind) < 0
    )
      error = "不明な操作です";
    else if (
      choice &&
      (!request || request.owner !== side || packet.requestId !== request.id)
    )
      error = "この選択は既に終了しています";
    else if (
      !choice &&
      packet.kind !== "surrender" &&
      (busy || packet.version !== version)
    )
      error = "盤面を更新しました。もう一度操作してください";
    this.lastSeq[side] = packet.seq;
    return error
      ? { ok: false, error: error, ack: packet.seq }
      : { ok: true, ack: packet.seq };
  };
  function choiceValue(request, input) {
    if (!request || !input || typeof input !== "object")
      throw Error("選択内容が不正です");
    var n = request.cards ? request.cards.length : 0;
    if (request.kind === "target") {
      if (
        input.side !== request.targetSide ||
        !request.candidates.includes(input.index)
      )
        throw Error("対象を選択できません");
      return { side: input.side, index: input.index };
    }
    if (request.kind === "single" || request.kind === "revenge") {
      if (request.kind === "revenge" && input.cancel === true) return false;
      if (!integer(input.index, 0, n - 1))
        throw Error("カードを選択できません");
      return { index: input.index };
    }
    if (request.kind === "discover") {
      if (typeof input.use !== "boolean") throw Error("選択内容が不正です");
      return input.use;
    }
    if (request.kind === "multi") {
      if (
        !Array.isArray(input.indices) ||
        input.indices.length > request.max ||
        new Set(input.indices).size !== input.indices.length ||
        input.indices.some(function (i) {
          return !integer(i, 0, n - 1);
        })
      )
        throw Error("採用するカードの枚数が不正です");
      return input.indices.slice();
    }
    if (request.kind === "explore") {
      if (
        !Array.isArray(input.destinations) ||
        input.destinations.length !== n ||
        input.destinations.some(function (x) {
          return x !== "top" && x !== "bottom";
        })
      )
        throw Error("探査先が不正です");
      return input.destinations.slice();
    }
    throw Error("未対応の選択です");
  }
  return {
    VERSION: VERSION,
    RESUME_MS: RESUME_MS,
    MAX_PACKET: MAX_PACKET,
    copy: copy,
    opposite: opposite,
    integer: integer,
    catalogFromPools: catalogFromPools,
    validateDeck: validateDeck,
    starterDeck: starterDeck,
    random: random,
    cardCopy: cardCopy,
    project: project,
    Gate: Gate,
    choiceValue: choiceValue,
  };
});
