# 槍兵「直突き」v2.2.1 実装・検証

検証日：2026-11-11。対象は `games/hex/`。ルート側カードゲームのソース・仕様・保存は変更しない。

## 実装

- 槍兵の職業基礎値を攻撃9、反撃整数13（×1.3）へ変更。基本反撃12、砂漠11、森林/山岳13。保存された個体差・成長をそのまま加算する。
- `targeting.ts` が通常攻撃・反撃の命中先を共通判定する。正六角形と中心間線分の交差を整数比で求め、射程2全18方向を扱う。境界両側を含み、最短六角距離→線分進入距離→時計回り側で解決。配列・生成順には依存しない。
- `resolveBoardCombat` は命中対象を確定してからHP・死亡・撃破数へ適用する。実際の被攻撃者が生存しているときだけ一度反撃する。反撃先が第三者でも、その個体へ記録し、再反撃を発生させない。
- 味方・死亡者は射線を遮らない。弓兵は途中の兵士を無視して指定対象へ命中する従来方式を継続。距離2の反撃無効能力は追加しない。
- 既存の本城攻撃を維持する。本城を指定した槍兵の射線上に敵兵がいればその兵へ命中し、いなければ本城へ命中する。
- UIとCPUの `forecastAttack` は観測情報だけを受け取り、確定戦闘と同じ関数を使う。非公開の盤面をUIへ渡さない。未視認マスを含む射線では占有状態によらず「命中先未確定」とし、HPの確定予測を出さない。
- 金の点線で指定方向、赤で既知の命中先、橙で別の反撃先を表示する。別の味方が反撃を受ける場合、元の攻撃者の予測HPを誤って減らさない。演出・ログには実際の対象IDを使う。
- schemaVersion 3、IndexedDBの名称・キー・取引を変更しない。所持兵士・進行中対戦・未完了報酬を初期化しない。職業基本値を参照するため既存槍兵にも新基礎値が反映される。

## 自動検証

| コマンド | 結果 |
| --- | --- |
| `npm run typecheck` | 成功 |
| `npm run lint` | 成功 |
| `npm test` | 39ファイル・438テスト成功 |
| `npm run build` | 成功 |

新規36テスト。射程1/2/範囲外、全18方向、6回転、座標平行移動、兵士配列の入替、境界の同距離敵、味方/死亡者通過、成長と地形、第三者への反撃・撃破・順番スキップ、予測一致、本城への射線、弓兵の直接攻撃/反撃、CPU合法手、演出/ログ、IndexedDBと実Workerでの保存復元、勝利後の撃破戦績・二重報酬防止を確認する。

既存3職業のCPU自動対戦108条件は全決着し、従来と同じ集計（6対6の36条件：自軍20勝/CPU16勝、5〜12ラウンド）。6職業混成は全6マップ×4シードの24条件が全決着し、5〜16ラウンド、回復111回、自軍6勝/CPU18勝。少数固定シードの結果であり、一般的な対人バランスの評価ではない。職業・地形・編成の追加調整は行わない。

## ブラウザ確認

CSS表示領域375×667、390×844、430×932、844×390、768×1024、PC1363×936で攻撃予測を開き、documentのscrollWidth/HeightがclientWidth/Heightと一致することを確認した。小型スマホでは予測の開閉前後でカメラ座標・倍率が一致する。

実マップ/実Session/実Workerを使う開発専用 `qa/thrust.html` で次を確認した。このQA入口は本番ビルドに含めない。

1. 奥の敵を指定→手前の敵へ9ダメージ。指定した奥の敵のHPは変わらず、実被攻撃者からの反撃が予測どおりに発生する。
2. 弓兵が槍兵を射程2から攻撃→間にいる別の味方へ反撃12。弓兵HP22は変わらず、味方HP30→18。
3. 斜め(1,1)を指定→境界両側の敵のうち時計回り側(0,1)へ命中する予測。

スクリーンショットはブラウザ全体を保存している。スマホ画像右側・下側の余白はサイズ検証ホストであり、ゲーム内の空白領域ではない。

| 画面 | 証跡 |
| --- | --- |
| 小型スマホ・通常直突き | [画像](screenshots/thrust-mobile-attack.png) |
| 小型スマホ・第三者への反撃 | [画像](screenshots/thrust-mobile-counter.png) |
| スマホ横画面・斜め方向 | [画像](screenshots/thrust-landscape.png) |
| PC・斜め方向 | [画像](screenshots/thrust-pc.png) |

物理スマートフォン実機での確認は未実施。既存のジェスチャー処理は変更しない。

## 変更ファイル

- 設定・仕様・バージョン：`data/ruleset.characters.json`、`docs/GAME_SPEC.md`、`README.md`、`BUILD_INFO.json`、`package.json`、`package-lock.json`
- 命中・戦闘・観測予測・CPU：`src/character/targeting.ts`（新規）、`forecast.ts`（新規）、`combat.ts`、`battle.ts`、`cpu.ts`
- UI：`src/app/useCharacterGame.ts`、`CharacterApp.tsx`、`character.css`、`src/components/character/CharacterBoard.tsx`、`src/components/tactics/BattleActionBar.tsx`、`Icons.tsx`
- テスト：`tests/thrust-helpers.ts`、`tests/unit/character-thrust.test.ts`、`character-thrust-presentation.test.tsx`、`character-new-classes.test.ts`、`tests/integration/character-thrust-persistence.test.ts`、`character-thrust-worker.test.ts`
- 検証入口：`qa/thrust-fixtures.ts`、`qa/thrust.html`、`qa/thrust.ts`
- 証跡：本書、`docs/screenshots/thrust-*.png`
- 配信成果物：リポジトリ直下の `hex/index.html` と新しいハッシュ付きJS/CSS/Worker。画像と旧ハッシュ資産は維持する。
