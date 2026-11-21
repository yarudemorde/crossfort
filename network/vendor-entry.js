import { Peer } from "peerjs";
import qrcode from "qrcode-generator";
import jsQR from "jsqr";
import { deflate, Inflate } from "pako";
window.CFLanVendor = { Peer, qrcode, jsQR, deflate, Inflate };
