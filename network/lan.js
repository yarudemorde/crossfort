(function (g) {
  "use strict";
  var Core = g.CFLanCore,
    Build = g.CFLanBuild;
  if (
    new URL(g.location.href).searchParams.get("lanAuthority") === "1" &&
    g.parent !== g
  ) {
    var bridge = CFLanEngine.install(g, function (message) {
      g.parent.postMessage(
        { crossfortEngine: 1, event: message },
        g.location.origin,
      );
    });
    g.addEventListener("message", function (event) {
      if (
        event.source !== g.parent ||
        event.origin !== g.location.origin ||
        !event.data ||
        event.data.crossfortEngine !== 1
      )
        return;
      var m = event.data,
        allowed = [
          "start",
          "recover",
          "run",
          "choose",
          "setOnline",
          "stop",
          "surrender",
        ];
      if (!allowed.includes(m.method)) return;
      Promise.resolve()
        .then(function () {
          return bridge[m.method].apply(bridge, m.args || []);
        })
        .then(
          function () {
            g.parent.postMessage(
              { crossfortEngine: 1, rpc: m.rpc, ok: true },
              g.location.origin,
            );
          },
          function (e) {
            g.parent.postMessage(
              { crossfortEngine: 1, rpc: m.rpc, ok: false, error: e.message },
              g.location.origin,
            );
          },
        );
    });
    g.parent.postMessage(
      { crossfortEngine: 1, ready: true },
      g.location.origin,
    );
    return;
  }
  var $ = g.$,
    catalog = Core.catalogFromPools(g.CARD_POOLS, g.CARD_IDS),
    storageKey = "crossfort_lan_session_v1",
    session = null,
    host = null,
    transport = null,
    channel = null,
    authenticated = false,
    engineFrame = null,
    engineRpc = new Map(),
    engineRpcId = 0,
    engineReady = null,
    heartbeat = null,
    lastSeen = 0,
    lastAttempt = 0,
    connectDeadline = 0,
    pausedAt = 0,
    active = false,
    lastVersion = 0,
    requestId = null,
    cardCache = new Map(),
    viewGeneration = 0,
    inputPending = false,
    flightOrigins = new Map(),
    scanStream = null,
    scanFrame = null,
    resultRecorded = false;
  var base = {};
  [
    "isHumanSide",
    "sideLabel",
    "playSelectedCard",
    "attack",
    "endTurn",
    "resolveTarget",
    "resolvePicker",
    "confirmPicker",
    "cancelPicker",
    "returnToDecks",
    "returnToLobby",
    "showHome",
    "showDeckLibrary",
    "openBattleHistory",
    "gravePanelSide",
    "render",
    "renderStableBattle",
    "startGame",
  ].forEach(function (name) {
    base[name] = g[name];
  });
  function randomHex(bytes) {
    var data = new Uint8Array(bytes);
    crypto.getRandomValues(data);
    return Array.from(data, function (n) {
      return n.toString(16).padStart(2, "0");
    }).join("");
  }
  function roomCode() {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
      data = new Uint8Array(12);
    crypto.getRandomValues(data);
    return (
      "CF" +
      Array.from(data, function (n) {
        return chars[n % chars.length];
      }).join("")
    );
  }
  function name() {
    return (
      String($("lanName").value || g.playerProfile.name || "プレイヤー")
        .trim()
        .slice(0, 20) || "プレイヤー"
    );
  }
  function status(text) {
    $("lanStatus").textContent = text;
    positionStatus();
  }
  function error(text) {
    $("lanError").textContent = String(text || "");
  }
  function save() {
    if (!session) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(session));
    } catch (e) {
      error(
        "再接続情報を保存できません。ブラウザの空き容量・プライベートモード設定を確認してください。",
      );
      throw Error("再接続情報を保存できません");
    }
  }
  function load() {
    try {
      var s = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (
        s &&
        s.protocol === Core.VERSION &&
        s.build === Build &&
        /^CF[A-Z2-9]{12}$/.test(s.room) &&
        ["host", "guest"].includes(s.role) &&
        /^[a-f0-9]{32}$/.test(s.playerId) &&
        /^[a-f0-9]{64}$/.test(s.token)
      )
        return s;
    } catch (e) {}
    return null;
  }
  function send(message) {
    if (channel && authenticated && channel.isOpen()) {
      try {
        channel.send(message);
        return true;
      } catch (e) {
        disconnect("送信できません。再接続しています");
      }
    }
    return false;
  }
  function transportError(e) {
    var type = e && e.type;
    if (type === "peer-unavailable") {
      status("部屋への接続を試しています");
      return;
    }
    if (type === "unavailable-id") {
      error(
        "同じ部屋が別のタブで開いています。元のタブを閉じて再接続してください。",
      );
      return;
    }
    error(
      "接続できませんでした。Wi-Fiとインターネット接続を確認してください。" +
        (type ? "（" + type + "）" : ""),
    );
  }
  function ui() {
    var section = document.createElement("section");
    section.id = "lanScreen";
    section.innerHTML =
      '<div class="lanShell"><header class="lanHeader"><button class="lanBack" id="lanHome">ホーム</button><div><small>CROSSFORT / LOCAL LINK</small><h1>通信対戦</h1></div></header><div class="lanPanel"><h2>出陣の準備</h2><label class="lanLabel" for="lanName">プレイヤー名</label><input class="lanInput" id="lanName" maxlength="20"><label class="lanLabel" for="lanDeck">使用デッキ</label><select class="lanSelect" id="lanDeck"></select><button class="lanSecondary" id="lanEditDeck" style="width:100%;margin-top:10px">デッキ編集</button><label class="lanLabel" for="lanMode">接続方式</label><select class="lanSelect" id="lanMode"><option value="cloud">部屋コード（シグナリング利用）</option><option value="manual">接続情報交換（オフライン）</option></select><p class="lanNote" id="lanModeNote"></p></div><div class="lanPanel" id="lanConnectPanel"><h2>戦場への接続</h2><div class="lanActions"><button class="lanPrimary" id="lanCreate">部屋を作成</button><button class="lanSecondary" id="lanJoinFocus">部屋に参加</button></div><label class="lanLabel" for="lanJoinCode">ルームコード／接続コード</label><textarea class="lanInput lanCodeText" id="lanJoinCode" rows="2" autocapitalize="characters" spellcheck="false"></textarea><div class="lanActions"><button class="lanPrimary" id="lanJoin">参加・接続情報を読込</button><button class="lanSecondary" id="lanScan">QR読取</button></div></div><div class="lanPanel" id="lanRoomPanel" hidden><h2 id="lanRoomTitle">対戦ルーム</h2><span class="lanRoomCode" id="lanRoomCode"></span><div class="lanQr" id="lanQr"></div><textarea id="lanShareCode" class="lanInput lanCodeText" readonly aria-label="共有する接続情報"></textarea><div class="lanActions"><button class="lanSecondary" id="lanCopy">コピー</button><button class="lanSecondary" id="lanShare">共有</button></div><div class="lanOpponent"><span id="lanOwnName"></span><b id="lanOwnReady">準備中</b></div><div class="lanOpponent"><span id="lanOpponentName">対戦相手</span><b id="lanOpponentReady">参加待ち</b></div><div class="lanActions"><button class="lanPrimary" id="lanReady" disabled>準備完了</button><button class="lanSecondary" id="lanReconnect">再接続</button></div><button class="lanSecondary" id="lanLeave" style="width:100%;margin-top:10px">部屋から退出</button></div><div class="lanStatus" id="lanStatus" role="status" aria-live="polite">接続待ち</div><p class="lanError" id="lanError" role="alert"></p></div>';
    document.body.appendChild(section);
    var banner = document.createElement("div");
    banner.id = "lanBattleStatus";
    banner.setAttribute("role", "status");
    document.body.appendChild(banner);
    var scanner = document.createElement("div");
    scanner.className = "lanScanModal";
    scanner.id = "lanScanModal";
    scanner.innerHTML =
      '<div class="lanScanPanel"><h2>接続QRを読み取り</h2><video id="lanScanVideo" playsinline muted></video><canvas id="lanScanCanvas" hidden></canvas><label class="lanFileLabel">QR画像を選択<input id="lanScanFile" type="file" accept="image/*" capture="environment"></label><button class="lanSecondary" id="lanScanClose" style="width:100%;margin-top:10px">閉じる</button></div>';
    document.body.appendChild(scanner);
    $("lanName").value = g.playerProfile.name || "プレイヤー";
    $("lanHome").onclick = function () {
      leave(true);
    };
    $("lanEditDeck").onclick = function () {
      if (session && session.matchId) {
        error("開始した対戦のデッキは変更できません");
        return;
      }
      if (session && session.ready) {
        error("準備を解除してからデッキを編集してください");
        return;
      }
      section.style.display = "none";
      base.showDeckLibrary();
    };
    $("lanCreate").onclick = function () {
      create().catch(function (e) {
        error(e.message);
      });
    };
    $("lanJoinFocus").onclick = function () {
      $("lanJoinCode").focus();
    };
    $("lanJoin").onclick = function () {
      joinInput($("lanJoinCode").value).catch(function (e) {
        error(e.message);
      });
    };
    $("lanMode").onchange = modeNote;
    $("lanDeck").onchange = function () {
      if (session && !session.ready && !session.matchId) {
        session.deckSelection = $("lanDeck").value;
        save();
      }
    };
    $("lanReady").onclick = function () {
      setReady().catch(function (e) {
        error(e.message);
      });
    };
    $("lanLeave").onclick = function () {
      leave(false);
    };
    $("lanReconnect").onclick = function () {
      reconnect().catch(function (e) {
        error(e.message);
      });
    };
    $("lanCopy").onclick = copyShare;
    $("lanShare").onclick = share;
    $("lanScan").onclick = function () {
      scan().catch(function (e) {
        error(e.message);
      });
    };
    $("lanScanClose").onclick = stopScan;
    $("lanScanFile").onchange = scanFile;
    g.addEventListener("resize", positionStatus);
    g.addEventListener("scroll", positionStatus, { passive: true });
    if (g.visualViewport)
      g.visualViewport.addEventListener("resize", positionStatus);
    g.addEventListener("online", function () {
      if (session)
        reconnect().catch(function (e) {
          error(e.message);
        });
    });
    g.addEventListener("offline", function () {
      if (session && session.mode === "cloud")
        disconnect("通信が切断されました");
    });
    document.addEventListener("visibilitychange", function () {
      if (session && document.visibilityState === "visible") {
        if (Date.now() - lastSeen > 9000) disconnect("接続を確認しています");
        reconnect().catch(function (e) {
          error(e.message);
        });
      }
    });
    modeNote();
  }
  function modeNote() {
    $("lanModeNote").textContent =
      $("lanMode").value === "cloud"
        ? "接続の確立にはインターネットが必要です。対戦データはWebRTCで端末間を送受信します。"
        : "ページを両端末で開いた後、ホストの接続情報と相手の返答を交換します。Wi-Fiの端末間通信が許可されている必要があります。";
  }
  function decks() {
    var select = $("lanDeck"),
      selected = select.value;
    select.innerHTML = "";
    (g.savedDecks || []).forEach(function (deck) {
      var option = document.createElement("option");
      option.value = "saved:" + deck.id;
      option.textContent = deck.name;
      try {
        Core.validateDeck(deck, catalog);
      } catch (e) {
        option.disabled = true;
        option.textContent += "（使用不可）";
      }
      select.appendChild(option);
    });
    Object.keys(g.CARD_POOLS).forEach(function (color) {
      var option = document.createElement("option");
      option.value = "starter:" + color;
      option.textContent = Core.starterDeck(color, catalog).name + "（40枚）";
      select.appendChild(option);
    });
    if (
      Array.from(select.options).some(function (o) {
        return o.value === selected && !o.disabled;
      })
    )
      select.value = selected;
  }
  function selectedDeck() {
    var value = $("lanDeck").value;
    if (value.startsWith("saved:"))
      return Core.validateDeck(g.getSavedDeck(value.slice(6)), catalog);
    return Core.starterDeck(value.slice(8), catalog);
  }
  function show() {
    g.hideCoreScreens();
    g.hideSeasonScreens();
    g.clearSeasonBattleTheme();
    $("lanScreen").style.display = "block";
    decks();
    error("");
    if (!session) {
      var previous = load();
      if (previous && !previous.ended) {
        session = previous;
        status("前の接続を復元します");
        setupSession(true).catch(function (e) {
          error(e.message);
        });
      }
    }
    drawRoom();
    g.scrollTo(0, 0);
  }
  function drawRoom() {
    var exists = !!session;
    $("lanRoomPanel").hidden = !exists;
    $("lanConnectPanel").hidden = exists && session.mode === "cloud";
    $("lanCreate").disabled = exists;
    $("lanMode").disabled = exists;
    $("lanDeck").disabled = exists && (session.ready || !!session.matchId);
    $("lanName").disabled = exists;
    $("lanEditDeck").disabled = exists && (session.ready || !!session.matchId);
    if (
      exists &&
      session.deckSelection &&
      Array.from($("lanDeck").options).some(function (o) {
        return o.value === session.deckSelection;
      })
    )
      $("lanDeck").value = session.deckSelection;
    if (!exists) {
      $("lanShareCode").value = "";
      $("lanQr").innerHTML = "";
      return;
    }
    $("lanMode").value = session.mode;
    modeNote();
    $("lanRoomCode").textContent = session.room;
    $("lanRoomTitle").textContent =
      session.role === "host" ? "ホストの部屋" : "参加した部屋";
    $("lanOwnName").textContent = session.name;
    $("lanOwnReady").textContent = session.ready ? "準備完了" : "準備中";
    $("lanReady").disabled =
      !authenticated || !!session.matchId || session.ended;
    $("lanReady").textContent = session.ready ? "準備を解除" : "準備完了";
    if (session.mode === "cloud") {
      var link = new URL(g.location.href);
      link.searchParams.delete("lanAuthority");
      link.hash = "lan=" + session.room;
      showCode(link.href, session.room);
    } else if (session.manualCode)
      showCode(session.manualCode, session.manualCode);
  }
  function showCode(qrText, copyText) {
    $("lanShareCode").value = copyText;
    try {
      var qr = g.CFLanVendor.qrcode(0, "L");
      qr.addData(qrText);
      qr.make();
      $("lanQr").innerHTML = qr.createSvgTag({ scalable: true, margin: 2 });
      $("lanQr").hidden = false;
    } catch (e) {
      $("lanQr").innerHTML = "";
      $("lanQr").hidden = true;
      status("QRに収まらないため接続コードを共有してください");
    }
  }
  async function copyShare() {
    try {
      await navigator.clipboard.writeText($("lanShareCode").value);
      status("接続情報をコピーしました");
    } catch (e) {
      $("lanShareCode").focus();
      $("lanShareCode").select();
      status("接続情報を選択しました");
    }
  }
  async function share() {
    var text = $("lanShareCode").value;
    if (session && session.mode === "cloud") {
      var link = new URL(g.location.href);
      link.hash = "lan=" + session.room;
      text = link.href;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: "CROSSFORT 通信対戦", text: text });
      } catch (e) {
        if (e.name !== "AbortError") error("共有できませんでした");
      }
    } else await copyShare();
  }
  function newSession(role, room, mode) {
    return {
      protocol: Core.VERSION,
      build: Build,
      role: role,
      room: room,
      mode: mode,
      playerId: randomHex(16),
      token: randomHex(32),
      name: name(),
      deckSelection: $("lanDeck").value,
      lastConnectedAt: Date.now(),
      ready: false,
      seq: 0,
      matchId: null,
      hostSaved: null,
      guestIdentity: null,
      view: null,
      pausedAt: 0,
      ended: false,
    };
  }
  async function create() {
    if (session) throw Error("先に現在の部屋から退出してください");
    selectedDeck();
    error("");
    session = newSession("host", roomCode(), $("lanMode").value);
    save();
    await setupSession(false);
    drawRoom();
    if (session.mode === "manual") await makeOffer();
  }
  async function joinInput(raw) {
    raw = String(raw || "").trim();
    if (raw.startsWith("CFLAN1.")) return acceptManual(raw);
    if (/^https?:/.test(raw)) {
      var link = new URL(raw);
      raw = new URLSearchParams(link.hash.slice(1)).get("lan") || "";
    }
    var room = raw.toUpperCase().replace(/[\s-]/g, "");
    if (!/^CF[A-Z2-9]{12}$/.test(room))
      throw Error("ルームコードを確認してください");
    if (session) throw Error("先に現在の部屋から退出してください");
    selectedDeck();
    session = newSession("guest", room, "cloud");
    save();
    error("");
    await setupSession(false);
    drawRoom();
  }
  function sendEngine(method, args) {
    return engineReady.then(function () {
      return new Promise(function (resolve, reject) {
        var id = ++engineRpcId;
        engineRpc.set(id, { resolve: resolve, reject: reject });
        engineFrame.contentWindow.postMessage(
          { crossfortEngine: 1, rpc: id, method: method, args: args || [] },
          g.location.origin,
        );
      });
    });
  }
  function createEngine() {
    if (engineFrame) return;
    var resolveReady;
    engineReady = new Promise(function (resolve) {
      resolveReady = resolve;
    });
    engineFrame = document.createElement("iframe");
    engineFrame.className = "lanEngineFrame";
    engineFrame.title = "通信対戦のルール処理";
    engineFrame.tabIndex = -1;
    engineFrame.setAttribute("aria-hidden", "true");
    var url = new URL(g.location.href);
    url.hash = "";
    url.searchParams.set("lanAuthority", "1");
    engineFrame.src = url.href;
    var onMessage = function (event) {
      if (
        !engineFrame ||
        event.source !== engineFrame.contentWindow ||
        event.origin !== g.location.origin ||
        !event.data ||
        event.data.crossfortEngine !== 1
      )
        return;
      var m = event.data;
      if (m.ready) {
        resolveReady();
        return;
      }
      if (m.rpc) {
        var call = engineRpc.get(m.rpc);
        if (call) {
          engineRpc.delete(m.rpc);
          if (m.ok) call.resolve();
          else call.reject(Error(m.error || "ルール処理に失敗しました"));
        }
      } else if (m.event && host) host.fromEngine(m.event);
    };
    g.addEventListener("message", onMessage);
    engineFrame._listener = onMessage;
    document.body.appendChild(engineFrame);
  }
  function engineProxy() {
    return {
      start: function (c) {
        return sendEngine("start", [c]);
      },
      recover: function (c, s, j) {
        return sendEngine("recover", [c, s, j]);
      },
      run: function (c) {
        return sendEngine("run", [c]);
      },
      choose: function (s, id, v) {
        return sendEngine("choose", [s, id, v]);
      },
      setOnline: function (v) {
        sendEngine("setOnline", [v]).catch(function () {});
      },
      stop: function () {
        sendEngine("stop", []).catch(function () {});
      },
      surrender: function (side) {
        sendEngine("surrender", [side]).catch(function (e) {
          error(e.message);
        });
      },
    };
  }
  async function setupSession(restoring) {
    if (!session) return;
    pausedAt =
      session.pausedAt ||
      (session.matchId ? session.lastConnectedAt || Date.now() : 0);
    session.pausedAt = pausedAt;
    if (pausedAt && Date.now() - pausedAt > Core.RESUME_MS) {
      endLocal("再接続の制限時間を過ぎたため対戦を終了しました");
      return;
    }
    lastVersion = 0;
    authenticated = false;
    lastSeen = Date.now();
    active = !!session.matchId;
    resultRecorded = !!session.resultRecorded;
    if (session.role === "host") {
      createEngine();
      host = new g.CFLanSession.Host(
        {
          engine: engineProxy(),
          catalog: catalog,
          players: {
            player: session.playerId,
            enemy: session.guestIdentity && session.guestIdentity.playerId,
          },
          names: {
            player: session.name,
            enemy:
              (session.guestIdentity && session.guestIdentity.name) ||
              "対戦相手",
          },
          persist: function (saved) {
            session.hostSaved = saved;
            session.matchId = saved.config && saved.config.matchId;
            save();
          },
          deliver: deliver,
          newId: function () {
            return randomHex(16);
          },
          seed: function () {
            return crypto.getRandomValues(new Uint32Array(1))[0];
          },
        },
        session.hostSaved,
      );
      if (host.latest) {
        active = true;
        var view = Core.project(host.latest, "player", {
          catalog: catalog,
          publicNames: host.publicNames,
          names: host.names,
          busy: true,
          winner: host.winner,
        });
        receiveFrame(
          {
            matchId: session.matchId,
            version: host.version,
            view: view,
            lastSeq: (host.gate && host.gate.lastSeq.player) || 0,
          },
          true,
        );
      }
    } else if (session.view) {
      active = true;
      receiveFrame(
        {
          matchId: session.matchId,
          version: session.version || 0,
          view: session.view,
          lastSeq: session.seq || 0,
        },
        true,
      );
    }
    startTransport();
    startHeartbeat();
    drawRoom();
    if (restoring) {
      status(
        session.mode === "manual"
          ? "接続情報を再交換すると同じ対戦を再開できます"
          : "相手との再接続を待っています",
      );
      if (session.mode === "manual" && session.role === "host")
        await makeOffer();
    }
  }
  function startTransport() {
    if (transport) {
      var old = transport;
      transport = null;
      old.close();
    }
    if (!session) return;
    if (session.mode === "manual") {
      transport = new g.CFLanTransport.Manual({
        onConnection: onConnection,
        onError: transportError,
      });
      return;
    }
    connectDeadline = Date.now() + 30000;
    transport = new g.CFLanTransport.Cloud({
      id:
        session.role === "host"
          ? "cf1-" + session.room
          : "cfp-" + session.playerId,
      signaling: (g.CFLanConfig || {}).signaling,
      onOpen: function () {
        if (!session) return;
        status(
          session.role === "host"
            ? "部屋を作成しました。対戦相手を待っています"
            : "ホストへ接続しています",
        );
        if (session.role === "guest") attemptConnect();
      },
      onConnection: onConnection,
      onError: transportError,
      onStatus: status,
    });
  }
  function attemptConnect() {
    if (
      !session ||
      session.mode !== "cloud" ||
      session.role !== "guest" ||
      authenticated
    )
      return;
    lastAttempt = Date.now();
    if (
      transport &&
      transport.peer &&
      !transport.peer.destroyed &&
      !transport.peer.disconnected
    )
      transport.connect("cf1-" + session.room);
  }
  function onConnection(candidate) {
    if (!session) {
      candidate.close();
      return;
    }
    if (session.role === "guest") {
      if (channel && channel !== candidate) {
        var old = channel;
        channel = null;
        old.close();
      }
      channel = candidate;
      authenticated = false;
      candidate.onMessage = function (m) {
        if (channel !== candidate) return;
        handleGuest(m);
      };
      candidate.onClose = function () {
        if (channel === candidate) disconnect("ホストとの接続が切れました");
      };
      candidate.send({
        type: "hello",
        protocol: Core.VERSION,
        build: Build,
        room: session.room,
        playerId: session.playerId,
        token: session.token,
        name: session.name,
      });
    } else {
      var deadline = setTimeout(function () {
        if (!candidate._accepted) candidate.close();
      }, 8000);
      candidate.onMessage = function (m) {
        if (!candidate._accepted) {
          if (
            m.type !== "hello" ||
            m.protocol !== Core.VERSION ||
            m.build !== Build ||
            m.room !== session.room ||
            typeof m.playerId !== "string" ||
            typeof m.token !== "string" ||
            !/^[a-f0-9]{32}$/.test(m.playerId) ||
            !/^[a-f0-9]{64}$/.test(m.token)
          ) {
            candidate.send({
              type: "reject",
              message:
                m.build !== Build
                  ? "ゲームの更新版を両端末で再読み込みしてください"
                  : "接続情報を確認できません",
            });
            candidate.close();
            return;
          }
          if (pausedAt && Date.now() - pausedAt > Core.RESUME_MS) {
            host.abort("再接続の制限時間を過ぎたため対戦を終了しました");
            candidate.close();
            return;
          }
          var guest = session.guestIdentity;
          if (
            guest &&
            (guest.playerId !== m.playerId || guest.token !== m.token)
          ) {
            candidate.send({
              type: "reject",
              message: "この部屋は既に対戦相手が決まっています",
            });
            candidate.close();
            return;
          }
          clearTimeout(deadline);
          candidate._accepted = true;
          session.guestIdentity = {
            playerId: m.playerId,
            token: m.token,
            name: (typeof m.name === "string" ? m.name : "対戦相手").slice(
              0,
              20,
            ),
          };
          host.setGuest(m.playerId, session.guestIdentity.name);
          if (channel && channel !== candidate) {
            var old = channel;
            channel = null;
            old.close();
          }
          channel = candidate;
          authenticated = true;
          lastSeen = Date.now();
          pausedAt = 0;
          session.pausedAt = 0;
          session.lastConnectedAt = Date.now();
          save();
          candidate.onClose = function () {
            if (channel === candidate)
              disconnect("対戦相手との接続が切れました");
          };
          candidate.send({
            type: "welcome",
            protocol: Core.VERSION,
            build: Build,
            room: session.room,
            hostName: session.name,
            matchId: session.matchId,
            lastSeq: host.gate ? host.gate.lastSeq.enemy : 0,
          });
          status("相手が接続しました");
          host.setOnline(true).catch(function (e) {
            host.abort(e.message);
          });
          drawRoom();
          positionStatus();
          return;
        }
        if (channel !== candidate || !authenticated) return;
        lastSeen = Date.now();
        if (m.type === "ping") send({ type: "pong" });
        else if (m.type === "ready") {
          try {
            host
              .setReady("enemy", m.deck, m.ready === true)
              .catch(function (e) {
                send({ type: "error", message: e.message });
              });
          } catch (e) {
            send({ type: "error", message: e.message });
          }
        } else if (m.type === "command") host.command(m.command, "enemy");
        else if (m.type === "resync") host.broadcast();
        else if (m.type === "bye") host.abort("対戦相手が退出しました");
      };
    }
  }
  function handleGuest(m) {
    if (!session) return;
    if (m.type === "reject") {
      error(m.message);
      disconnect("接続を拒否されました");
      return;
    }
    if (m.type === "welcome") {
      if (pausedAt && Date.now() - pausedAt > Core.RESUME_MS) {
        endLocal("再接続の制限時間を過ぎたため対戦を終了しました");
        return;
      }
      if (
        m.protocol !== Core.VERSION ||
        m.build !== Build ||
        m.room !== session.room
      ) {
        error("ゲームの更新版を両端末で再読み込みしてください");
        return;
      }
      if (session.matchId && m.matchId && session.matchId !== m.matchId) {
        error("対戦IDが一致しません");
        return;
      }
      authenticated = true;
      lastSeen = Date.now();
      pausedAt = 0;
      session.pausedAt = 0;
      session.seq = m.lastSeq || 0;
      session.lastConnectedAt = Date.now();
      session.remoteName = (
        typeof m.hostName === "string" ? m.hostName : "対戦相手"
      ).slice(0, 20);
      if (m.matchId) session.matchId = m.matchId;
      inputPending = false;
      save();
      status("ホストと接続しました");
      send({ type: "resync" });
      drawRoom();
      positionStatus();
      return;
    }
    if (!authenticated) return;
    lastSeen = Date.now();
    if (m.type === "ping") {
      send({ type: "pong" });
      return;
    }
    receive(m);
  }
  function deliver(side, message) {
    if (side === "player") receive(message);
    else send(message);
  }
  function receive(message) {
    if (!session) return;
    if (message.type === "lobby") {
      session.ready = !!message.ownReady;
      if (message.matchId) session.matchId = message.matchId;
      $("lanOpponentName").textContent = message.opponentName;
      $("lanOpponentReady").textContent = message.opponentReady
        ? "準備完了"
        : authenticated
          ? "準備中"
          : "参加待ち";
      drawRoom();
      save();
    } else if (message.type === "frame") receiveFrame(message, false);
    else if (message.type === "visual") {
      if (active && authenticated && message.matchId === session.matchId)
        visual(message.event);
    } else if (message.type === "ack") {
      inputPending = false;
      if (message.error) error(message.error);
      if (g.state && g.state.matchMode === "lan" && active) renderView();
    } else if (message.type === "error") error(message.message);
    else if (message.type === "ended") endLocal(message.reason);
  }
  function cacheCards(state) {
    [
      "playerHand",
      "playerBoard",
      "enemyBoard",
      "playerLandmarks",
      "enemyLandmarks",
      "grave",
      "enemyGrave",
    ].forEach(function (key) {
      state[key] = state[key].map(function (c) {
        if (!c) return c;
        if (c._lanId && cardCache.has(c._lanId)) {
          var old = cardCache.get(c._lanId);
          Object.keys(old).forEach(function (k) {
            delete old[k];
          });
          Object.assign(old, c);
          return old;
        }
        if (c._lanId) cardCache.set(c._lanId, c);
        return c;
      });
    });
    if (cardCache.size > 250) {
      var used = new Set();
      [
        "playerHand",
        "playerBoard",
        "enemyBoard",
        "playerLandmarks",
        "enemyLandmarks",
        "grave",
        "enemyGrave",
      ].forEach(function (key) {
        state[key].forEach(function (c) {
          if (c) used.add(c._lanId);
        });
      });
      cardCache.forEach(function (c, id) {
        if (!used.has(id)) cardCache.delete(id);
      });
    }
  }
  function receiveFrame(packet, restoring) {
    if (
      !packet.view ||
      !packet.view.state ||
      !packet.matchId ||
      (!restoring && packet.version < lastVersion)
    )
      return;
    if (session.matchId && session.matchId !== packet.matchId) return;
    var view = packet.view,
      s = view.state;
    if (
      s.matchMode !== "lan" ||
      !s.enemyHand.every(function (c) {
        return c.hidden === true;
      }) ||
      !s.playerDeck.every(function (c) {
        return c.hidden === true;
      }) ||
      !s.enemyDeck.every(function (c) {
        return c.hidden === true;
      })
    ) {
      endLocal("非公開情報の検証に失敗しました");
      return;
    }
    var previous =
        g.state && g.state.matchMode === "lan" && active ? g.state : null,
      selected =
        previous &&
        previous.selectedCard >= 0 &&
        previous.playerHand[previous.selectedCard],
      slot = previous ? previous.selectedSlot : -1,
      priorHand = new Set(
        previous
          ? previous.playerHand.map(function (c) {
              return c._lanId;
            })
          : [],
      );
    session.matchId = packet.matchId;
    lastVersion = packet.version || 0;
    session.version = lastVersion;
    session.view = Core.copy(view);
    session.seq = Math.max(session.seq || 0, packet.lastSeq || 0);
    save();
    if (!active || !viewGeneration) {
      viewGeneration = ++g.battleGenerationCounter;
      g.cancelHandDraw();
      g.hideCoreScreens();
      g.hideSeasonScreens();
      g.clearSeasonBattleTheme();
    }
    active = true;
    $("lanScreen").style.display = "none";
    $("gameScreen").style.display = "grid";
    $("controls").style.display = "block";
    document.body.classList.add("battleActive");
    g.syncCompactBattleMode();
    cacheCards(s);
    s.generation = viewGeneration;
    if (!s.animating && selected)
      s.selectedCard = s.playerHand.findIndex(function (c) {
        return c._lanId === selected._lanId;
      });
    else s.selectedCard = -1;
    s.selectedSlot = s.selectedCard >= 0 ? slot : -1;
    g.state = s;
    requestId = view.requestId || null;
    if (previous && !restoring)
      s.playerHand.forEach(function (c) {
        if (!priorHand.has(c._lanId)) g.queueHandDraw(c, "player");
      });
    renderView();
    $("battleLog").textContent =
      view.choosing && !view.choosingSelf
        ? "相手が効果を選択しています"
        : view.log || "通信対戦";
    if (s.choiceRequest) g.renderPicker();
    else $("pickerModal").classList.remove("show");
    if (s.gameOver) {
      $("resultTitle").textContent =
        view.winner === "player"
          ? "VICTORY"
          : view.winner === "enemy"
            ? "DEFEAT"
            : "対戦終了";
      $("resultText").textContent =
        view.winner === "player"
          ? "あなたの勝利です"
          : view.winner === "enemy"
            ? "対戦相手の勝利です"
            : "対戦が終了しました";
      $("resultModal").classList.add("show");
      if (!resultRecorded) {
        resultRecorded = true;
        session.resultRecorded = true;
        g.playerStats.battles++;
        if (view.winner === "player") g.playerStats.wins++;
        g.persistPlayerStats();
        g.refreshProfileUnlocks();
        save();
      }
    }
  }
  function canInput() {
    return (
      !!session &&
      active &&
      authenticated &&
      !session.ended &&
      !inputPending &&
      !!g.state &&
      !g.state.gameOver
    );
  }
  function renderView() {
    if (!active || !g.state || g.state.matchMode !== "lan") return;
    var busy = g.state.animating;
    g.state.animating = busy || !authenticated || inputPending;
    base.render();
    g.state.animating = busy;
    $("playerName").textContent = session.name;
    $("enemyName").textContent =
      session.remoteName ||
      (session.role === "host" &&
        session.guestIdentity &&
        session.guestIdentity.name) ||
      "対戦相手";
    $("backBattleBtn").textContent = "通信対戦";
    $("turnLabel").textContent =
      "TURN " +
      g.state.turn +
      " / " +
      (g.state.playerTurn ? "自分" : "相手") +
      (authenticated ? " ・接続中" : " ・接続待ち");
    positionStatus();
  }
  function command(kind, payload) {
    if (!canInput()) {
      if (!authenticated) status("再接続を待っています");
      return;
    }
    var packet = {
      protocol: Core.VERSION,
      matchId: session.matchId,
      playerId: session.playerId,
      seq: ++session.seq,
      version: lastVersion,
      kind: kind,
      payload: payload || {},
      requestId: requestId,
    };
    inputPending = true;
    save();
    renderView();
    if (session.role === "host") host.command(packet, "player");
    else if (!send({ type: "command", command: packet })) {
      inputPending = false;
      renderView();
    }
  }
  async function setReady() {
    if (!session || !authenticated) return;
    var ready = !session.ready,
      deck = ready ? selectedDeck() : null;
    session.deckSelection = $("lanDeck").value;
    save();
    error("");
    if (session.role === "host") await host.setReady("player", deck, ready);
    else send({ type: "ready", deck: deck, ready: ready });
  }
  function disconnect(reason) {
    if (!session || session.ended) return;
    var old = channel;
    channel = null;
    authenticated = false;
    inputPending = false;
    if (old) old.close();
    if (session.matchId && !pausedAt) {
      pausedAt = Date.now();
      session.pausedAt = pausedAt;
      save();
    }
    if (host)
      host.setOnline(false).catch(function (e) {
        error(e.message);
      });
    status(reason || "再接続を待っています");
    drawRoom();
    if (active) renderView();
  }
  function startHeartbeat() {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = setInterval(function () {
      if (!session || session.ended) return;
      if (authenticated) {
        if (Date.now() - lastSeen > 10000) {
          disconnect("通信が途切れました。再接続しています");
          return;
        }
        session.lastConnectedAt = lastSeen;
        save();
        send({ type: "ping" });
      } else {
        if (pausedAt && Date.now() - pausedAt > Core.RESUME_MS) {
          if (host)
            host.abort("再接続の制限時間を過ぎたため対戦を終了しました");
          else endLocal("再接続の制限時間を過ぎたため対戦を終了しました");
          return;
        }
        if (session.mode === "cloud" && Date.now() - lastAttempt > 3500) {
          lastAttempt = Date.now();
          if (transport && transport.peer && transport.peer.destroyed)
            startTransport();
          else if (transport && transport.peer && transport.peer.disconnected) {
            try {
              transport.peer.reconnect();
            } catch (e) {}
          } else attemptConnect();
        }
        if (
          !session.matchId &&
          session.role === "guest" &&
          connectDeadline &&
          Date.now() > connectDeadline
        ) {
          error(
            "部屋に接続できません。コード、ホストの待機画面、Wi-Fiを確認してください。",
          );
          connectDeadline = 0;
        }
      }
      positionStatus();
    }, 2000);
  }
  async function reconnect() {
    if (!session) return;
    if (session.mode === "manual") {
      if (session.role === "host") await makeOffer();
      else {
        status("ホストの新しい接続コードを読み込んでください");
        show();
      }
      return;
    }
    if (authenticated) {
      send({ type: "resync" });
      return;
    }
    if (!transport || transport.peer.destroyed) startTransport();
    else if (transport.peer.disconnected) transport.peer.reconnect();
    else attemptConnect();
    status("再接続しています");
  }
  function positionStatus() {
    var banner = $("lanBattleStatus");
    if (!banner) return;
    if (
      !active ||
      !session ||
      authenticated ||
      $("gameScreen").style.display === "none"
    ) {
      banner.style.display = "none";
      return;
    }
    var rect = $("battleLog").getBoundingClientRect();
    banner.style.display = "block";
    banner.style.left = rect.left + rect.width / 2 + "px";
    banner.style.top = rect.top + rect.height / 2 + "px";
    var remaining = pausedAt
      ? Math.max(
          0,
          Math.ceil((Core.RESUME_MS - (Date.now() - pausedAt)) / 1000),
        )
      : 120;
    banner.textContent =
      "接続待ち・対戦を一時停止中" +
      (pausedAt ? " ／ 残り" + remaining + "秒" : "");
  }
  function visual(event) {
    if (!event || !Core.opposite || !g.state || g.state.matchMode !== "lan")
      return;
    var own = session.role === "host" ? "player" : "enemy",
      side = event.side === own ? "player" : "enemy";
    if (event.kind === "attack") g.animateCard(side, event.lane);
    else if (event.kind === "destroy") g.showDestroy(side, event.lane);
    else if (event.kind === "collapse")
      g.showLandmarkCollapse(side, event.lane);
    else if (event.kind === "number") {
      var node =
        event.zone === "life"
          ? document.querySelector('.battleHud[data-side="' + side + '"] .life')
          : g.boardCard(side, event.lane);
      g.floatAt(node, event.text, event.type);
      g.pulseClass(node, event.type === "heal" ? "healed" : "hit", 380);
    } else if (event.kind === "spell")
      g.showSpellCast(event.card, side).catch(function (e) {
        if (e !== g.staleBattle) console.error(e);
      });
    else if (event.kind === "place") {
      var origin = flightOrigins.get(event.card._lanId);
      flightOrigins.delete(event.card._lanId);
      if (!origin && side === "enemy") {
        var rect = $("enemyHandCount").getBoundingClientRect(),
          ghost = document.createElement("div");
        ghost.className = "handCard " + (g.COLOR_CLASS[event.card.color] || "");
        ghost.innerHTML =
          '<div class="cost">' +
          event.card.cost +
          '</div><div class="handName">' +
          g.escapeHtml(event.card.name) +
          '</div><div class="handText">' +
          g.formatCardText(event.card.text) +
          "</div>";
        origin = {
          node: ghost,
          left: rect.left - 25,
          top: rect.top,
          width: 70,
          height: 100,
        };
      }
      g.animateHandPlacement(side, event.lane, event.card, origin)
        .then(function () {
          g.animatePlacementLanding(side, event.lane, event.card);
        })
        .catch(function (e) {
          if (e !== g.staleBattle) console.error(e);
        });
    }
  }
  async function makeOffer() {
    if (!session || session.role !== "host")
      throw Error("ホストが接続情報を作成します");
    if (!transport || session.mode !== "manual") {
      startTransport();
    }
    status("Wi-Fiの接続情報を作成しています");
    var description = await transport.offer();
    session.manualCode = g.CFLanTransport.encode({
      version: 1,
      room: session.room,
      description: description,
    });
    save();
    drawRoom();
    status("ホストの接続情報を相手へ渡し、相手の返答を読み込んでください");
    $("lanScreen").style.display = "block";
  }
  async function acceptManual(raw) {
    var value = g.CFLanTransport.decode(raw);
    error("");
    if (value.description.type === "offer") {
      if (session && (session.room !== value.room || session.role !== "guest"))
        throw Error("現在の部屋から退出してから読み込んでください");
      if (!session) {
        selectedDeck();
        session = newSession("guest", value.room, "manual");
        save();
        await setupSession(false);
      }
      var description = await transport.answer(value.description);
      session.manualCode = g.CFLanTransport.encode({
        version: 1,
        room: session.room,
        description: description,
      });
      save();
      drawRoom();
      status("この返答をホストへ渡してください");
    } else {
      if (
        !session ||
        session.role !== "host" ||
        session.mode !== "manual" ||
        session.room !== value.room
      )
        throw Error("この部屋の返答ではありません");
      await transport.accept(value.description);
      status("相手との接続を確立しています");
    }
  }
  async function scan() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
      throw Error(
        "このブラウザではカメラを利用できません。QR画像またはコードを使用してください",
      );
    $("lanScanModal").classList.add("show");
    try {
      scanStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      var video = $("lanScanVideo");
      video.srcObject = scanStream;
      await video.play();
      function tick() {
        if (!scanStream) return;
        var canvas = $("lanScanCanvas");
        if (video.videoWidth) {
          canvas.width = Math.min(640, video.videoWidth);
          canvas.height = Math.round(
            (video.videoHeight * canvas.width) / video.videoWidth,
          );
          var ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          var code = g.CFLanVendor.jsQR(
            ctx.getImageData(0, 0, canvas.width, canvas.height).data,
            canvas.width,
            canvas.height,
          );
          if (code) {
            stopScan();
            $("lanJoinCode").value = code.data;
            joinInput(code.data).catch(function (e) {
              error(e.message);
            });
            return;
          }
        }
        scanFrame = setTimeout(tick, 130);
      }
      tick();
    } catch (e) {
      status("カメラを利用できません。QR画像か接続コードを読み込んでください");
    }
  }
  function stopScan() {
    if (scanFrame) clearTimeout(scanFrame);
    scanFrame = null;
    if (scanStream)
      scanStream.getTracks().forEach(function (track) {
        track.stop();
      });
    scanStream = null;
    $("lanScanVideo").srcObject = null;
    $("lanScanModal").classList.remove("show");
  }
  async function scanFile() {
    var file = $("lanScanFile").files[0];
    if (!file) return;
    var url = URL.createObjectURL(file);
    try {
      var image = new Image();
      image.src = url;
      await image.decode();
      var canvas = $("lanScanCanvas");
      canvas.width = Math.min(1400, image.width);
      canvas.height = Math.round((image.height * canvas.width) / image.width);
      var ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      var code = g.CFLanVendor.jsQR(
        ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        canvas.width,
        canvas.height,
      );
      if (!code) throw Error("QRを読み取れませんでした");
      stopScan();
      $("lanJoinCode").value = code.data;
      await joinInput(code.data);
    } catch (e) {
      error(e.message);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  function endLocal(reason) {
    if (!session) return;
    session.ended = true;
    session.ready = false;
    save();
    active = false;
    authenticated = false;
    inputPending = false;
    if (g.state && g.state.matchMode === "lan") {
      g.cancelBattleRequests(g.state);
      g.state.gameOver = true;
      g.state.animating = false;
    }
    g.hideCoreScreens();
    $("lanScreen").style.display = "block";
    $("lanBattleStatus").style.display = "none";
    $("resultModal").classList.remove("show");
    $("pickerModal").classList.remove("show");
    document
      .querySelectorAll(
        ".fxFloat,.fxGhost,.fxDefenseShield,.landmarkCollapse,.spellCastOverlay",
      )
      .forEach(function (node) {
        node.remove();
      });
    status(reason);
    drawRoom();
  }
  function leave(goHome) {
    if (
      session &&
      !session.ended &&
      session.matchId &&
      g.state &&
      !g.state.gameOver &&
      !g.confirm("通信対戦から退出しますか？")
    )
      return;
    if (session) {
      if (host) host.abort("ホストが部屋から退出しました");
      else send({ type: "bye" });
    }
    active = false;
    authenticated = false;
    stopScan();
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    var old = transport;
    transport = null;
    channel = null;
    if (old)
      setTimeout(function () {
        old.close();
      }, 150);
    if (host) host.engine.stop();
    host = null;
    if (engineFrame) {
      g.removeEventListener("message", engineFrame._listener);
      engineFrame.remove();
      engineFrame = null;
    }
    engineRpc.forEach(function (call) {
      call.reject(Error("通信対戦を終了しました"));
    });
    engineRpc.clear();
    session = null;
    sessionStorage.removeItem(storageKey);
    viewGeneration = 0;
    cardCache.clear();
    flightOrigins.clear();
    lastVersion = 0;
    pausedAt = 0;
    inputPending = false;
    requestId = null;
    resultRecorded = false;
    if (g.state && g.state.matchMode === "lan") {
      g.cancelBattleRequests(g.state);
      g.state.generation = ++g.battleGenerationCounter;
      g.state.gameOver = true;
    }
    g.hideCoreScreens();
    $("lanBattleStatus").style.display = "none";
    $("resultModal").classList.remove("show");
    $("pickerModal").classList.remove("show");
    error("");
    status("接続待ち");
    drawRoom();
    if (goHome) {
      $("lanScreen").style.display = "none";
      base.showHome();
    } else $("lanScreen").style.display = "block";
  }
  g.isHumanSide = function (side) {
    if (g.state && g.state.matchMode === "lan") return side === "player";
    return base.isHumanSide(side);
  };
  g.sideLabel = function (side) {
    if (g.state && g.state.matchMode === "lan")
      return side === "player"
        ? (session && session.name) || "自分"
        : (session && session.remoteName) ||
            (session && session.guestIdentity && session.guestIdentity.name) ||
            "対戦相手";
    return base.sideLabel(side);
  };
  g.playSelectedCard = function (mode) {
    if (!active || !g.state || g.state.matchMode !== "lan")
      return base.playSelectedCard(mode);
    if (!canInput() || g.state.animating || !g.state.playerTurn) return;
    var card = g.state.playerHand[g.state.selectedCard];
    if (!card) return;
    flightOrigins.set(card._lanId, g.capturePlacementOrigin("player", card));
    command("play", {
      cardId: card._lanId,
      lane: g.state.selectedSlot,
      mode: mode || "normal",
    });
  };
  g.attack = function (side, lane) {
    if (!active || !g.state || g.state.matchMode !== "lan")
      return base.attack(side, lane);
    if (
      side !== "player" ||
      !canInput() ||
      g.state.animating ||
      !g.state.playerTurn
    )
      return;
    var card = g.state.playerBoard[lane];
    if (card) command("attack", { lane: lane, cardId: card._lanId });
  };
  g.endTurn = function () {
    if (!active || !g.state || g.state.matchMode !== "lan")
      return base.endTurn();
    if (canInput() && !g.state.animating && g.state.playerTurn)
      command("end", {});
  };
  g.resolveTarget = function (side, index) {
    if (!active || !g.state || g.state.matchMode !== "lan")
      return base.resolveTarget(side, index);
    if (!g.state.targetRequest) return;
    var own = session.role === "host" ? "player" : "enemy";
    command("choice", {
      side: side === "player" ? own : Core.opposite(own),
      index: index,
    });
  };
  g.resolvePicker = function (index) {
    if (!active || !g.state || g.state.matchMode !== "lan")
      return base.resolvePicker(index);
    command("choice", { index: index });
  };
  g.confirmPicker = function () {
    if (!active || !g.state || g.state.matchMode !== "lan")
      return base.confirmPicker();
    var r = g.state.choiceRequest;
    if (!r) return;
    command(
      "choice",
      r.kind === "discover"
        ? { use: true }
        : r.kind === "multi"
          ? { indices: r.selected.slice() }
          : { destinations: r.destinations.slice() },
    );
  };
  g.cancelPicker = function () {
    if (!active || !g.state || g.state.matchMode !== "lan")
      return base.cancelPicker();
    var r = g.state.choiceRequest;
    if (!r) return;
    command(
      "choice",
      r.kind === "discover"
        ? { use: false }
        : r.kind === "multi"
          ? { indices: [] }
          : { cancel: true },
    );
  };
  g.render = function () {
    if (active && g.state && g.state.matchMode === "lan") return renderView();
    return base.render();
  };
  g.renderStableBattle = function () {
    if (active && g.state && g.state.matchMode === "lan") return renderView();
    return base.renderStableBattle();
  };
  ["returnToDecks", "returnToLobby"].forEach(function (fn) {
    g[fn] = function () {
      if (session && active) {
        leave(fn === "returnToLobby");
        return;
      }
      return base[fn]();
    };
  });
  g.showHome = function () {
    if ($("lanScreen")) $("lanScreen").style.display = "none";
    return base.showHome();
  };
  g.gravePanelSide = function (side) {
    base.gravePanelSide(side);
    if (active && g.state && g.state.matchMode === "lan")
      $("infoTitle").textContent = g.sideLabel(side) + "の墓地";
  };
  g.openBattleHistory = function () {
    if (!active || !g.state || g.state.matchMode !== "lan")
      return base.openBattleHistory();
    var html = (g.state.battleHistory || [])
      .slice()
      .reverse()
      .map(function (e) {
        return (
          '<div class="historyItem"><span class="historyTurn">TURN ' +
          e.turn +
          " " +
          g.escapeHtml(g.sideLabel(e.side)) +
          "</span><span>" +
          g.escapeHtml(e.text) +
          "</span></div>"
        );
      })
      .join("");
    g.openInfoModal(
      "バトルログ",
      "新しい履歴から表示・最大200件",
      html || '<div class="infoEmpty">ログはまだありません</div>',
      "",
    );
  };
  ui();
  g.CFLan = { show: show, leave: leave, reconnect: reconnect };
  var linked = new URLSearchParams(g.location.hash.slice(1)).get("lan");
  if (linked) {
    show();
    $("lanJoinCode").value = linked;
  } else {
    var resume = load();
    if (resume && resume.matchId && !resume.ended) show();
  }
})(window);
