import { readFile, writeFile } from "node:fs/promises";
const source = JSON.parse(
  await readFile(
    new URL("../data/maps.prototype.json", import.meta.url),
    "utf8",
  ),
);
const metadata = source.maps.map(({ id, name, radius, headquarters }) => ({
  id,
  name,
  radius,
  headquarters,
}));
await writeFile(
  new URL("../src/data/maps.catalog.json", import.meta.url),
  JSON.stringify(metadata, null, 2) + "\n",
);
