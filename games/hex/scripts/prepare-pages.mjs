/** Package the existing static game and the new hex build into one Pages artifact. */
import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, basename } from "node:path";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const site = join(root, "_site");
await mkdir(site, { recursive: true });
for (const item of await readdir(root, { withFileTypes: true })) {
  if (
    item.name === "index.html" ||
    item.name.endsWith(".css") ||
    ["assets", "data", "network"].includes(item.name)
  )
    await cp(join(root, item.name), join(site, item.name), {
      recursive: true,
      filter: source => !["node_modules", "signaling"].includes(basename(source)),
    });
}
await cp(
  fileURLToPath(new URL("../dist/", import.meta.url)),
  join(site, "hex"),
  { recursive: true },
);
await writeFile(join(site, ".nojekyll"), "");
console.log("Pages artifact ready: existing root game and /hex/.");
