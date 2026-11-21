import { build } from "esbuild";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
await mkdir("network/vendor", { recursive: true });
await build({
  entryPoints: ["network/vendor-entry.js"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["safari15", "chrome90"],
  outfile: "network/vendor/rtc.js",
  legalComments: "linked",
});
const files = [
  "data/cards.js",
  "data/card-rules.js",
  "network/core.js",
  "network/engine.js",
  "network/session.js",
  "network/transport.js",
  "network/lan.js",
];
const input = await Promise.all(files.map((p) => readFile(p)));
const hash = createHash("sha256").update("CROSSFORT-LAN-1:20261122");
input.forEach((bytes) => hash.update(bytes));
const html = await readFile("index.html", "utf8");
for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))
  hash.update(match[1]);
const digest = hash.digest("hex");
await writeFile(
  "network/version.js",
  "window.CFLanBuild=" + JSON.stringify(digest) + ";\n",
);
console.log("Bundled pinned PeerJS, QR, scanner and compression dependencies.");
