import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { swipeStage } from "../../src/components/battle/panels";
import { MobileBottomDrawer } from "../../src/components/battle/MobileBottomDrawer";
import { BattleHeader } from "../../src/components/battle/BattleHeader";
import { selectionHint } from "../../src/components/battle/SelectionInspector";
import { createGame } from "../../src/game/engine";
import { getObservation } from "../../src/game/selectors/observation";
import { defaultConfig } from "../../src/game/data";
const noop = () => {};
const o = getObservation(createGame(1102, "highlands"), "player");
describe("マップ中心UIの表示契約", () => {
  it("上スワイプで手札を開き、下スワイプで収納する", () => {
    expect(swipeStage(0, -60)).toBe(1);
    expect(swipeStage(1, 60)).toBe(0);
  });
  it("手札には中間の独立した詳細段階を設けない", () => {
    expect(swipeStage(1, -60)).toBe(1);
    expect(swipeStage(0, 60)).toBe(0);
  });
  it("短い移動はハンドルのタップとして扱う", () => {
    expect(swipeStage(0, 12)).toBe(0);
    expect(swipeStage(1, 12)).toBe(1);
  });
  it("閉じたドロワーには本文もフォーカス可能な中身も残さない", () => {
    const html = renderToStaticMarkup(
      <MobileBottomDrawer
        stage={0}
        onStage={noop}
        count={3}
        resource={0}
        total={3}
        endButton={<button>ターン終了</button>}
      >
        <button>非表示の詳細操作</button>
      </MobileBottomDrawer>,
    );
    expect(html).not.toContain("非表示の詳細操作");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("残り資源 0、合計 3");
    expect(html).toContain("ターン終了");
  });
  it("開いたドロワーには展開状態と閉じる操作を付ける", () => {
    const html = renderToStaticMarkup(
      <MobileBottomDrawer
        stage={1}
        onStage={noop}
        count={3}
        resource={1}
        total={3}
        endButton={<button>ターン終了</button>}
      >
        <button>詳細操作</button>
      </MobileBottomDrawer>,
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("詳細操作");
    expect(html).toContain("手札を閉じる");
  });
  it("不可視の敵本城の戦力は公開しない", () => {
    expect(o.pieces.some((p) => p.instanceId === "hq_cpu")).toBe(false);
    const html = renderToStaticMarkup(
      <BattleHeader
        observation={o}
        busy={false}
        onHelp={noop}
        onHome={noop}
        onReplay={noop}
      />,
    );
    expect(html).toContain("敵軍本城 ?/12");
    expect(html).toContain("自軍本城 12/12");
    expect(html).not.toContain(String(o.seed));
    expect(html).not.toContain(o.mapName);
  });
  it("資源不足・配置・行動済みは短い状況表示にする", () => {
    const card =
      defaultConfig.cards["unit_scout"] ??
      Object.values(defaultConfig.cards).find((c) => c.type === "unit")!;
    expect(
      selectionHint({ ...o, self: { ...o.self, resourceRemaining: 0 } }, card),
    ).toBe("資源不足");
    expect(
      selectionHint({ ...o, self: { ...o.self, resourceRemaining: 99 } }, card),
    ).toBe("配置先を選択");
    const p = { ...o.pieces[0], actedThisTurn: true, summonedOnOwnTurn: 0 };
    expect(selectionHint(o, undefined, p)).toBe("行動済み");
    expect(
      selectionHint(o, undefined, {
        ...p,
        actedThisTurn: false,
        summonedOnOwnTurn: o.self.ownTurnNumber,
      }),
    ).toBe("このターンは行動不可");
    expect(selectionHint(o)).toBe("");
  });
});
