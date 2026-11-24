// Use the installed PeerJS serializers and chunk reassembly unchanged; only the
// network socket/RTC endpoint is replaced. No browser or external server needed.
const { Peer } = require("peerjs");
class SerializerProvider extends Peer {
  _createServerConnection() {
    return {};
  }
  _delayedAbort() {}
  _initialize() {}
}
function serializedPair(serialization) {
  const provider = new SerializerProvider("serializer-test");
  const original = global.RTCPeerConnection;
  const packets = [],
    errors = [];
  global.RTCPeerConnection = class {
    createDataChannel() {
      return {
        bufferedAmount: 0,
        addEventListener() {},
        send() {},
        close() {},
      };
    }
    createOffer() {
      return new Promise(() => {});
    }
    close() {}
  };
  let a, b;
  try {
    const Serializer = provider._serializers[serialization];
    a = new Serializer("b", provider, { reliable: true });
    b = new Serializer("a", provider, { reliable: true });
  } finally {
    global.RTCPeerConnection = original;
  }
  for (const [sender, receiver] of [
    [a, b],
    [b, a],
  ]) {
    sender.on("error", (e) => errors.push(e));
    sender.dataChannel.send = (bytes) => {
      if (bytes.byteLength > 16384) throw Error("RTC message limit exceeded");
      packets.push(bytes.byteLength);
      queueMicrotask(() => receiver._handleDataMessage({ data: bytes }));
    };
    sender._open = true;
  }
  return { a, b, packets, errors };
}
module.exports = { serializedPair };
