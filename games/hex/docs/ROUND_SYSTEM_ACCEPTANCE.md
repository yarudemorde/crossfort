# 機動順ラウンド・成長・移行 検証記録

2026-11-07。製品バージョン2.1.0、保存形式schemaVersion 3。旧カードゲーム本体は変更しない。

## 実装

- 職業基準を騎士30/12/10/×1.0、弓兵22/9/12/×0.5、斥候18/6/16/×2.0へ変更（HP/攻撃/機動/反撃）。本城HP60。
- movementを移動距離として維持し、initiativeを独立追加。反撃は整数counterTenths、砂漠→最低1→倍率→切上げ→森林/山岳の順。
- 完全なラウンド順・現在位置・行動済み・currentActorIdはエンジンと非公開保存で管理。現在の1体のみ合法。移動確定では進めず、攻撃・終了・待機で進める。死亡者はスキップ。
- 同値優先はseed・round・安定キーから再現。隠れた兵士数に依存して自軍内の順序が変わるシャッフルを使わない。CPUの一時IDで再戦の行動順を変えない。
- 成長は4項目を独立・等確率抽選し、対象・増分・次乱数を報酬へ一括保存。履歴はLv1→2→3→MAXの3回。+0を含む結果を表示し、リロードで再抽選しない。
- タイムラインは現在見える兵士だけ。完全順、絶対位置、隠れたID・人数枠・内部生成キー・内部行動回数をUIへ返さない。非公開CPU連続行動を1応答へまとめる。CPU自身も専用Observationだけで判断。
- 現在の兵士を自動選択。他兵士・タイムラインのタップは詳細のみ。キャンセルは左、確定は右。カメラの自動移動を追加しない。

## 既存データ

既存DB・ストアを維持。v2のID、原名/表示名、所属、職業、Lv、初期差、出撃/撃破、勧誘/除隊記録を保持し、過去Lv分の成長をIDから一度だけ生成して保存する。旧選択済み強化も対象固定で一度生成。新形式の不正データは再抽選で修復せず、上書きしない。

進行中の旧対戦は旧HPと交互手番が前提のため、原データをlegacyBackupV2へ保持し、編成・配置・マップ/サイズ・seedを復元して戦闘前に戻す。所持は戦闘前のまま維持し、通知を表示する。退避・移行は単一取引。新方式の保存は現在兵士・順序・移動後の攻撃待ちをそのまま再開する。

## 自動検証

npm run typecheck、npm run lint、npm test、npm run build が成功。27ファイル・329テスト。旧版の参照回帰テストも維持する。

新規試験は機動降順、同値500seedの陣営非固定、人数秘匿、各1回、連続行動、移動後の権利保持、死亡スキップ、順序保存/改変拒否、反撃倍率/地形順序、4抽選の範囲/全36組合せ/候補頻度、MAX、報酬再読込/重複拒否、旧データ移行を確認。スカウト時の成長履歴引継ぎも検証する。

fake-indexeddbで旧所持/戦闘の一括退避・移行と保存失敗の不変性を確認。実WorkerでQuotaExceededErrorを注入し、保存されたラウンド状態とWorkerの状態が操作前へ戻り、再読込して同じ兵士から続けられることを確認した。

CPUは全6マップ×6seed条件×1/5/6名の108条件で、800行動以内に全件決着。6対6だけの36条件は自軍20勝・CPU16勝、5〜12ラウンド（中央値8）。1名/5名条件を含む全体の勝率は編成人数が異なるため公平なバランス指標には使わない。有限条件の検証であり、全seedや全編成の勝率を保証しない。プレイヤーが待機を繰り返す場合の強制決着は追加していない。

## ブラウザ検証

ChromeのCSS viewportで実測。全7サイズでhtmlのclientWidth/HeightとscrollWidth/Heightが一致し、ページの縦横スクロールなし。

|サイズ|タイムライン|マップ高|下部高|
|---|---:|---:|---:|
|375×667|68|417|130|
|390×844|68|594|130|
|430×932|68|682|130|
|844×390|54|198|90|
|768×1024|68|774|130|
|1366×768|68|528|112|
|1440×900|68|660|112|

390×844で行動兵士の自動選択、タイムラインの他兵士詳細、移動確認、移動確定、攻撃待ち保存/再開を確認。詳細を開閉してもcurrentActorとカメラのx/y/scaleは不変。攻撃予測では与6・反撃14・自HP3/敵HP13、ボタンは左キャンセルx14、右確定x198.5を確認。6名を一度ずつ待機させてROUND 2へ移り、行動済みと現在枠が更新されることを確認。

開発用旧セーブで、継承のアルトLv.2、6名の配置、大91マスを復元し、再読み込み後も同じ配置/能力だった。IndexedDB試験ではseed99保持と原本バックアップも照合。

実エンジンの小渡河戦seed2を5ラウンドで本城破壊まで完走した結果を通常保存。新UIで勧誘見送り→継承のアルトLv.2を強化→HP33→36(+3)、攻撃14→15(+1)、機動10→10(+0)、反撃×1.1→×1.1(+0.0)を表示。再読込後の全文が一致し、強化ボタンは再出現しなかった。帰還後に兵舎でLv.3/36/15/10と、戦死3名を除いた6名の所持を確認した。

## 画像・再検証

- [スマホ・行動順](screenshots/rounds/phone-timeline.png)
- [スマホ・反撃予測](screenshots/rounds/phone-attack.png)
- [横画面](screenshots/rounds/landscape.png)
- [成長結果](screenshots/rounds/growth.png)
- [寸法実測JSON](screenshots/rounds/viewports.json)

画像の左上が指定CSS viewportで、残りの暗色は検証ホスト画面。開発サーバーでqa/character-responsive.html?w=390&h=844、qa/legacy-recovery.html、qa/lifecycle.htmlを使用。QAページは開発用データを扱い、製品ビルドのエントリーに含めない。

## 残課題・検証の限界

物理iPhone/Android、Safari固有のタッチ・Safe Area・ブラウザバー変動と実機FPSは未計測。実装にはsafe-area/visualViewport/reduced-motionを維持し、ジェスチャーは既存自動試験で検証。戦力バランスは指定値を変更していない。機動差や先行配置の戦略評価、長期育成時の勝率は追加プレイテスト対象。今回の有限試験に未決着はなかった。

## 変更ファイル一覧

- `BUILD_INFO.json`
- `README.md`
- `data/presentation.settings.json`
- `data/ruleset.characters.json`
- `docs/GAME_SPEC.md`
- `docs/ROUND_SYSTEM_ACCEPTANCE.md`
- `docs/archive/GAME_SPEC.characters-v2.md`
- `docs/screenshots/rounds/growth.png`
- `docs/screenshots/rounds/landscape.png`
- `docs/screenshots/rounds/phone-attack.png`
- `docs/screenshots/rounds/phone-timeline.png`
- `docs/screenshots/rounds/viewports.json`
- `package-lock.json`
- `package.json`
- `qa/legacy-recovery.html`
- `qa/legacy-recovery.ts`
- `qa/lifecycle.ts`
- `src/app/CharacterApp.tsx`
- `src/app/character.css`
- `src/app/useCharacterGame.ts`
- `src/character/battle.ts`
- `src/character/character.worker.ts`
- `src/character/combat.ts`
- `src/character/cpu.ts`
- `src/character/deployment.ts`
- `src/character/growth.ts`
- `src/character/migration.ts`
- `src/character/reward.ts`
- `src/character/roster.ts`
- `src/character/rounds.ts`
- `src/character/session.ts`
- `src/character/storage.ts`
- `src/character/types.ts`
- `src/character/validation.ts`
- `src/components/tactics/BattleActionBar.tsx`
- `src/components/tactics/BattleHUD.tsx`
- `src/components/tactics/CampScreens.tsx`
- `src/components/tactics/DeploymentBar.tsx`
- `src/components/tactics/GrowthResult.tsx`
- `src/components/tactics/Icons.tsx`
- `src/components/tactics/ResultsScreen.tsx`
- `src/components/tactics/RoundIndicator.tsx`
- `src/components/tactics/SettingsPanel.tsx`
- `src/components/tactics/SoldierList.tsx`
- `src/components/tactics/TurnTimeline.tsx`
- `tests/character-helpers.ts`
- `tests/integration/character-battle-probe.test.ts`
- `tests/integration/character-migration.test.ts`
- `tests/integration/character-worker.test.ts`
- `tests/unit/character-battle.test.ts`
- `tests/unit/character-core.test.ts`
- `tests/unit/character-growth-migration.test.tsx`
- `tests/unit/character-rewards.test.ts`
- `tests/unit/character-rounds.test.tsx`
- `tests/unit/character-session.test.ts`
- `tests/unit/character-storage.test.ts`

## 公開後の確認

実装コミット `3e0e89381a23f73acdd741788f7f2f7c77fa9164` をmainとfeature/hex-initiative-roundsへ反映。Hex game checks（main/作業ブランチ）、Deploy Crossfort and Hex to Pages、既存pages build and deploymentはすべて成功した。

公開URL https://yarudemorde.github.io/crossfort/hex/ が `index-wLSpr4q2.js` を読み込むことを確認。6名・コスト10で編成、配置、戦闘開始。HP60と機動16の斥候の自動選択、タイムラインを確認した。ルカの2マス移動を確定しても同じ兵士の攻撃待ちが続き、リロード後も同じ状態から再開した。移動前後のカメラ値は不変。行動終了後、CPUの移動・戦闘・反撃を経て次の自軍エルナへ自動で進んだ。

エルナの移動後に見えている敵ルカを選び、与6・反撃14・予測HP自6/敵12、左キャンセル・右攻撃確定を確認。現在見える9名だけをタイムラインへ表示していた。公開画面のhtmlは1363×936でscrollWidth/Heightも同値。

[公開版の行動順と攻撃予測](screenshots/rounds/public-battle.png)
