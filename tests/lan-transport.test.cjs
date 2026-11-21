const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs"),
  { EventEmitter } = require("node:events");
const pako = require("pako"),
  qr = require("qrcode-generator"),
  jsQR = require("jsqr");
function load(extra = {}) {
  const g = { CFLanVendor: { ...pako }, ...extra };
  vm.runInNewContext(
    fs.readFileSync(
      require("node:path").join(__dirname, "../network/transport.js"),
      "utf8",
    ),
    {
      window: g,
      TextEncoder,
      TextDecoder,
      Uint8Array,
      btoa,
      atob,
      setTimeout,
      clearTimeout,
      ...extra,
    },
  );
  return g.CFLanTransport;
}
test("offline offer survives compression, QR generation and QR image decoding", () => {
  const t = load(),
    offer = {
      version: 1,
      room: "CFABCDEFGH2345",
      description: {
        type: "offer",
        sdp: "v=0\r\na=candidate:1 1 udp 2122260223 192.168.1.2 50000 typ host\r\n",
      },
    };
  const code = t.encode(offer);
  assert.deepEqual(JSON.parse(JSON.stringify(t.decode(code))), offer);
  const q = qr(0, "L");
  q.addData(code);
  q.make();
  const n = q.getModuleCount(),
    scale = 5,
    width = (n + 8) * scale,
    pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (q.isDark(y, x))
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) {
            const i =
              (((y + 4) * scale + sy) * width + (x + 4) * scale + sx) * 4;
            pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
          }
  assert.equal(jsQR(pixels, width, width).data, code);
});
test("offline parser rejects malformed, huge and decompression-bomb connection data", () => {
  const t = load();
  assert.throws(() => t.decode("CFLAN1.invalid"));
  assert.throws(() => t.decode("A".repeat(20001)));
  assert.throws(() =>
    t.decode(
      t.encode({
        version: 1,
        room: "CFABCDEFGH2345",
        description: { type: "offer", sdp: "x".repeat(150000) },
      }),
    ),
  );
});
test("cloud connection retries do not create overlapping handshakes", () => {
  class Connection extends EventEmitter {
    constructor(peer) {
      super();
      this.peer = peer;
      this.open = false;
    }
    send(x) {
      this.sent = x;
    }
    close() {
      this.open = false;
      this.emit("close");
    }
  }
  class Peer extends EventEmitter {
    constructor(id) {
      super();
      this.id = id;
      this.calls = [];
    }
    connect(id) {
      const c = new Connection(id);
      this.calls.push(c);
      return c;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const t = load({ CFLanVendor: { Peer } });
  let channel;
  const cloud = new t.Cloud({
    id: "a",
    onOpen() {},
    onStatus() {},
    onError(e) {
      throw e;
    },
    onConnection(c) {
      channel = c;
    },
  });
  cloud.connect("b");
  cloud.connect("b");
  assert.equal(cloud.peer.calls.length, 1);
  const c = cloud.peer.calls[0];
  c.open = true;
  c.emit("open");
  channel.send({ type: "ping" });
  assert.equal(c.sent.type, "ping");
  assert.equal(channel.isOpen(), true);
  cloud.close();
  assert.equal(cloud.peer.destroyed, true);
});
