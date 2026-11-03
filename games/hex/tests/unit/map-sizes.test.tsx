import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { maps } from "../../src/game/data";
import metadata from "../../src/data/maps.catalog.json";
import {
  mapSizes,
  mapTypes,
  defaultMapSize,
  selectMap,
} from "../../src/data/map-selection";
import { createGame } from "../../src/game/engine";
import { getObservation } from "../../src/game/selectors/observation";
import { calculateVisibleHexes } from "../../src/game/rules/board";
import { hexDistance, hexId, neighbors } from "../../src/game/rules/hex";
import {
  fitMapCamera,
  getMapBounds,
  toScreen,
  xy,
} from "../../src/components/map/geometry";
import { MapSizeSelector } from "../../src/components/MapSizeSelector";
import settings from "../../data/presentation.settings.json";

describe("マップ種類とサイズ", () => {
  it("中サイズの元データはバイト単位で維持", () => {
    expect(
      createHash("sha256")
        .update(
          readFileSync(
            new URL("../../data/maps.prototype.json", import.meta.url),
          ),
        )
        .digest("hex"),
    ).toBe("d6bc4c038d3dcbd66e668e3ca28208874f56f2ddc4fbc22993092353cd225053");
  });
  it("初期値は中、種類を切り替えても独立してサイズを選べる", () => {
    expect(defaultMapSize).toBe("medium");
    expect(mapTypes).toHaveLength(2);
    expect(maps).toHaveLength(6);
    for (const type of mapTypes)
      for (const size of mapSizes) {
        const selected = selectMap(type.id, size.id);
        expect(selected.typeId).toBe(type.id);
        expect(selected.radius).toBe(size.radius);
        expect(selected.hexCount).toBe(size.hexCount);
        expect(selected.id).toBe(
          size.id === "medium" ? type.id : `${type.id}-${size.id}`,
        );
      }
    expect(() => selectMap("unknown")).toThrow();
    const html = renderToStaticMarkup(
      <MapSizeSelector value={defaultMapSize} onChange={() => {}} />,
    );
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    for (const size of mapSizes) expect(html).toContain(`${size.hexCount}マス`);
  });
  it("UI用カタログは許可した公開メタデータのみ", () => {
    for (const m of metadata) {
      expect(Object.keys(m).sort()).toEqual(
        [
          "id",
          "typeId",
          "size",
          "name",
          "radius",
          "hexCount",
          "headquarters",
        ].sort(),
      );
      expect(JSON.stringify(m)).not.toContain("terrain");
      expect(JSON.stringify(m)).not.toContain("hexes");
    }
  });
  for (const m of maps) {
    it(`${m.id}：実タイル数・両端本城・領土・進軍路・霧`, () => {
      const ids = new Set(m.hexes.map(hexId));
      const count = 1 + 3 * m.radius * (m.radius + 1);
      expect(m.hexes).toHaveLength(count);
      expect(ids.size).toBe(count);
      for (const h of m.hexes) {
        expect(hexDistance(h, { q: 0, r: 0 })).toBeLessThanOrEqual(m.radius);
        expect([
          "plain",
          "forest",
          "mountain",
          "river",
          "swamp",
          "desert",
        ]).toContain(h.terrain);
      }
      expect(m.headquarters.player).toEqual({ q: -m.radius, r: 0 });
      expect(m.headquarters.cpu).toEqual({ q: m.radius, r: 0 });
      const s = createGame(1103, m.id);
      const ownTerritory = new Set(
        m.hexes
          .filter((h) => hexDistance(h, m.headquarters.player) <= 1)
          .map(hexId),
      );
      const enemyTerritory = m.hexes.filter(
        (h) => hexDistance(h, m.headquarters.cpu) <= 1,
      );
      expect(enemyTerritory.every((h) => !ownTerritory.has(hexId(h)))).toBe(
        true,
      );
      for (const id of ownTerritory)
        expect(s.territoryOwner[id]).toBe("player");
      for (const h of enemyTerritory)
        expect(s.territoryOwner[hexId(h)]).toBe("cpu");
      const queue = [m.headquarters.player],
        visited = new Set([hexId(queue[0])]);
      for (let i = 0; i < queue.length; i++)
        for (const h of neighbors(queue[i]))
          if (ids.has(hexId(h)) && !visited.has(hexId(h))) {
            visited.add(hexId(h));
            queue.push(h);
          }
      expect(visited.size).toBe(count);
      for (let q = -m.radius; q <= m.radius; q++)
        expect(ids.has(`${q},0`)).toBe(true);
      for (const owner of ["player", "cpu"] as const) {
        const o = getObservation(s, owner);
        expect(o.hexes).toHaveLength(count);
        expect(o.pieces.map((p) => p.instanceId)).toEqual([`hq_${owner}`]);
        const visible = new Set(calculateVisibleHexes(s, owner));
        for (const h of o.hexes) {
          expect(h.visible).toBe(visible.has(hexId(h)));
          if (!h.explored) {
            expect(h.terrain).toBeUndefined();
            expect(h.territory).toBeUndefined();
          }
        }
      }
      expect(getObservation(createGame(1103, m.id), "player")).toEqual(
        getObservation(s, "player"),
      );
    });
  }
  it("小・中・大の全体表示で、全タイルが7画面サイズの内側に収まる", () => {
    const viewports = [
      [375, 554],
      [390, 731],
      [430, 819],
      [844, 292],
      [768, 911],
      [1366, 653],
      [1440, 785],
    ];
    for (const m of maps)
      for (const [width, height] of viewports) {
        const bounds = getMapBounds(m.hexes);
        const camera = fitMapCamera(bounds, { width, height });
        const topLeft = toScreen(camera, { x: bounds.minX, y: bounds.minY });
        const bottomRight = toScreen(camera, {
          x: bounds.maxX,
          y: bounds.maxY,
        });
        expect(topLeft.x).toBeGreaterThanOrEqual(
          settings.camera.fitPaddingPx - 0.001,
        );
        expect(topLeft.y).toBeGreaterThanOrEqual(
          settings.camera.fitPaddingPx - 0.001,
        );
        expect(bottomRight.x).toBeLessThanOrEqual(
          width - settings.camera.fitPaddingPx + 0.001,
        );
        expect(bottomRight.y).toBeLessThanOrEqual(
          height -
            settings.camera.toolbarInsetPx -
            settings.camera.fitPaddingPx +
            0.001,
        );
        expect(toScreen(camera, xy({ q: 0, r: 0 })).x).toBeCloseTo(width / 2);
      }
    const viewport = { width: 390, height: 731 };
    expect(
      fitMapCamera(
        getMapBounds(maps.find((m) => m.radius === 3)!.hexes),
        viewport,
      ).scale,
    ).toBeGreaterThan(
      fitMapCamera(
        getMapBounds(maps.find((m) => m.radius === 5)!.hexes),
        viewport,
      ).scale,
    );
  });
});
