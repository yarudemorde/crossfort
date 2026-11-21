(function (root) {
  "use strict";
  var MAX = 300000;
  function Cloud(options) {
    var self = this,
      Peer = root.CFLanVendor.Peer;
    this.options = options;
    this.closed = false;
    this.pending = null;
    this.pendingTimer = null;
    this.peer = new Peer(
      options.id,
      Object.assign({ debug: 0 }, options.signaling || {}),
    );
    this.peer.on("open", function (id) {
      if (!self.closed) options.onOpen(id);
    });
    this.peer.on("connection", function (connection) {
      self.wrap(connection);
    });
    this.peer.on("disconnected", function () {
      if (!self.closed) {
        options.onStatus("シグナリングに再接続しています");
        try {
          self.peer.reconnect();
        } catch (e) {
          options.onError(e);
        }
      }
    });
    this.peer.on("error", function (e) {
      if (!self.closed) options.onError(e);
    });
  }
  Cloud.prototype.wrap = function (connection) {
    var options = this.options,
      channel = {
        send: function (data) {
          if (JSON.stringify(data).length > MAX)
            throw Error("通信データが大きすぎます");
          connection.send(data);
        },
        close: function () {
          connection.close();
        },
        remoteId: connection.peer,
        isOpen: function () {
          return connection.open;
        },
      };
    options.onStatus("相手との直接通信を確立しています");
    connection.on("iceStateChanged", function (state) {
      if (state === "checking")
        options.onStatus("Wi-Fiの直接通信を確認しています");
      if (state === "failed")
        options.onError({ type: "Wi-Fiの端末間通信を確立できません" });
    });
    var self = this;
    connection.on("open", function () {
      if (self.pending === connection) {
        self.pending = null;
        clearTimeout(self.pendingTimer);
      }
      options.onConnection(channel);
    });
    connection.on("data", function (data) {
      try {
        if (
          typeof data !== "object" ||
          !data ||
          Array.isArray(data) ||
          JSON.stringify(data).length > MAX
        )
          return;
        if (channel.onMessage) channel.onMessage(data);
      } catch (e) {
        options.onError(e);
      }
    });
    connection.on("close", function () {
      if (channel.onClose) channel.onClose();
    });
    connection.on("error", function (e) {
      if (channel.onClose) channel.onClose(e);
    });
    return channel;
  };
  Cloud.prototype.connect = function (id) {
    if (this.closed || this.peer.destroyed || this.pending) return;
    var self = this;
    this.pending = this.peer.connect(id, {
      reliable: true,
      serialization: "json",
      label: "crossfort-lan-v1",
    });
    this.wrap(this.pending);
    this.pendingTimer = setTimeout(function () {
      if (self.pending) {
        var c = self.pending;
        self.pending = null;
        c.close();
      }
    }, 12000);
  };
  Cloud.prototype.close = function () {
    this.closed = true;
    clearTimeout(this.pendingTimer);
    this.pending = null;
    this.peer.destroy();
  };
  function waitIce(pc) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(done, 8000);
      function done() {
        clearTimeout(timer);
        pc.removeEventListener("icegatheringstatechange", changed);
        if (pc.localDescription && /a=candidate:/.test(pc.localDescription.sdp))
          resolve();
        else reject(Error("Wi-Fiの接続候補を取得できませんでした"));
      }
      function changed() {
        if (pc.iceGatheringState === "complete") done();
      }
      if (pc.iceGatheringState === "complete") done();
      else pc.addEventListener("icegatheringstatechange", changed);
    });
  }
  function Manual(options) {
    this.options = options;
    this.pc = null;
    this.channel = null;
  }
  Manual.prototype.create = function () {
    if (this.pc) this.pc.close();
    var self = this;
    this.pc = new RTCPeerConnection({ iceServers: [] });
    this.pc.ondatachannel = function (event) {
      self.wrap(event.channel);
    };
    this.pc.onconnectionstatechange = function () {
      if (
        self.pc &&
        ["failed", "closed", "disconnected"].includes(
          self.pc.connectionState,
        ) &&
        self.channel &&
        self.channel.onClose
      )
        self.channel.onClose();
    };
    return this.pc;
  };
  Manual.prototype.wrap = function (dc) {
    var options = this.options,
      channel = {
        send: function (data) {
          var text = JSON.stringify(data);
          if (text.length > MAX) throw Error("通信データが大きすぎます");
          dc.send(text);
        },
        close: function () {
          dc.close();
        },
        remoteId: "manual",
        isOpen: function () {
          return dc.readyState === "open";
        },
      };
    this.channel = channel;
    dc.onopen = function () {
      options.onConnection(channel);
    };
    dc.onclose = dc.onerror = function () {
      if (channel.onClose) channel.onClose();
    };
    dc.onmessage = function (event) {
      if (typeof event.data !== "string" || event.data.length > MAX) return;
      try {
        var data = JSON.parse(event.data);
        if (!data || typeof data !== "object" || Array.isArray(data)) return;
        if (channel.onMessage) channel.onMessage(data);
      } catch (e) {
        options.onError(e);
      }
    };
  };
  Manual.prototype.offer = async function () {
    var pc = this.create();
    this.wrap(pc.createDataChannel("crossfort-lan-v1", { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer());
    await waitIce(pc);
    return { type: "offer", sdp: pc.localDescription.sdp };
  };
  Manual.prototype.answer = async function (description) {
    var pc = this.create();
    await pc.setRemoteDescription(description);
    await pc.setLocalDescription(await pc.createAnswer());
    await waitIce(pc);
    return { type: "answer", sdp: pc.localDescription.sdp };
  };
  Manual.prototype.accept = async function (description) {
    if (!this.pc) throw Error("接続情報を先に作成してください");
    await this.pc.setRemoteDescription(description);
  };
  Manual.prototype.close = function () {
    if (this.pc) this.pc.close();
    this.pc = null;
  };
  function encode(value) {
    var bytes = root.CFLanVendor.deflate(
        new TextEncoder().encode(JSON.stringify(value)),
      ),
      text = "";
    bytes.forEach(function (b) {
      text += String.fromCharCode(b);
    });
    return (
      "CFLAN1." +
      btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    );
  }
  function decode(text) {
    text = String(text || "").trim();
    if (text.length > 20000 || !/^CFLAN1\.[A-Za-z0-9_-]+$/.test(text))
      throw Error("接続コードの形式が違います");
    var raw = atob(text.slice(7).replace(/-/g, "+").replace(/_/g, "/")),
      bytes = Uint8Array.from(raw, function (c) {
        return c.charCodeAt(0);
      }),
      parts = [],
      length = 0,
      inflate = new root.CFLanVendor.Inflate();
    inflate.onData = function (chunk) {
      length += chunk.length;
      if (length > 128000) throw Error("接続情報が大きすぎます");
      parts.push(chunk);
    };
    inflate.push(bytes, true);
    if (inflate.err) throw Error("接続コードを読み取れません");
    var out = new Uint8Array(length),
      offset = 0;
    parts.forEach(function (part) {
      out.set(part, offset);
      offset += part.length;
    });
    var value = JSON.parse(new TextDecoder().decode(out));
    if (
      !value ||
      value.version !== 1 ||
      !/^CF[A-Z2-9]{12}$/.test(value.room) ||
      !value.description ||
      !["offer", "answer"].includes(value.description.type) ||
      typeof value.description.sdp !== "string" ||
      value.description.sdp.length > 100000
    )
      throw Error("接続情報の内容が不正です");
    return value;
  }
  root.CFLanTransport = {
    Cloud: Cloud,
    Manual: Manual,
    encode: encode,
    decode: decode,
  };
})(window);
