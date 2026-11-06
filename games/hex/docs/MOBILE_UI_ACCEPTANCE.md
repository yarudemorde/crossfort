# スマートフォン戦術UI 検証記録

2026-11-06。v2.0のルール、CPU、戦闘計算、報酬処理、IndexedDBのスキーマとトランザクションは変更していない。ルート側カードゲームは変更対象外。

## 変更領域

|ファイル|内容|
|---|---|
|`src/app/CharacterApp.tsx`、`useCharacterGame.ts`|表示シェルと共通コントローラーの分離。プレビューとシートの状態を戦闘から分離|
|`src/app/character.css`、`src/main.tsx`|全画面・Safe Area・visualViewport・統一配色。旧UIのCSSを現行画面から切り離す|
|`src/components/tactics/`|HUD、固定アクションバー、軍営、兵舎、編成、配置、戦果、詳細シート、設定、オリジナルSVGアイコン|
|`src/components/character/CharacterBoard.tsx`|職業別シルエット、HPバー、選択リング、配置可能マス、攻撃方向線。既存の可視演出を継承|
|`src/components/map/useMapGestures.ts`|配置時だけ本城付近を初期表示。UIの開閉・選択・サイズ変化では再フィットしない|
|`src/character/deployment.ts`、`character.worker.ts`|配置用の読み取り専用観測。現在の対戦・所持・報酬・乱数は変更しない|
|`data/presentation.settings.json`|操作ボタンをマップ外へ移したため、旧下部オフセットを0にする。演出時間は維持|
|`tests/unit/character-deployment-ui.test.tsx`、`tests/integration/character-worker.test.ts`|配置の秘匿、全6マップ、15名一覧、HUD非公開HP、生死一覧、Worker読み取りで保存が不変なことを追加検証|
|`qa/lifecycle.html`、`qa/lifecycle.ts`|開発用。実エンジンの対戦を完走し、通常保存を経由して報酬UIを再検証。製品ビルドのエントリーには含めない|

## 操作

- 兵士をタップ：金の選択リングと移動範囲。別の味方で切り替え。
- 移動先をタップ：経路を表示。「移動を確定」または「取消」。別の移動先へ変更可能。
- 赤い敵をタップ：攻撃方向、与ダメージ、反撃、双方の予測HPを表示してから確定。
- 1本指／マウスドラッグ：カメラ移動。2本指ピンチ／ホイール：中心位置を維持して拡縮。10pxのドラッグ判定で誤タップを抑止。
- 配置：下部兵士からマスへドラッグ、または兵士→マスのタップ。既配置兵は移動・入れ替え可能。
- 設定・詳細・戦況：必要なときだけ開く。背景タップ、閉じるボタン、Escapeで閉じる。フォーカスを元の操作へ戻す。

## 自動検証

`npm run typecheck`、`npm run lint`、`npm test`、`npm run build` が成功。24ファイル・309テスト。旧版参照回帰テストも維持。v2 CPUは全6マップ×両先攻×3シード×1/5/6名編成の108条件で合法手による決着を確認。

新しい配置観測は全6マップで、未探索地形・敵兵・敵本城HPを返さない。部分配置を扱い、不正・重複配置を拒否する。実Workerで配置観測を要求した前後の所持・戦闘スナップショットが同一であることを確認。

## ブラウザ実測

Chromeの同一オリジンiframeに各CSS viewportを作成。DOM寸法を読み取り、以下すべてでhtmlのclientWidth/HeightとscrollWidth/Heightが一致した。ページ全体のスクロールなし。

|CSS viewport|HUD|マップ高|下部バー高|
|---|---:|---:|---:|
|375×667|52|485|130|
|390×844|52|662|130|
|430×932|52|750|130|
|844×390|48|252|90|
|768×1024|52|842|130|
|1366×768|60|596|112|
|1440×900|60|728|112|

390×844で通常・兵士選択・移動先確認・攻撃確認・メニュー開閉・移動確定・CPU演出後の下部高は130px。マップ上端52px、高さ662px、カメラのx/y/scaleも同一だった。マウスドラッグ後も選択とプレビューが誤変更されず、ホイールズームが動くことを実操作で確認。

軍営・兵舎は375×667、844×390、768×1024、1366×768でページのはみ出しなし。375×667の兵舎一覧は表示高418px／内容高756pxで、一覧だけを内部スクロールする。編成6名・コスト10、実マップへの6名配置、ドラッグでの入れ替え、戦闘開始、移動確認、攻撃確認、撃破、CPU、戦闘リロード再開を確認。

実エンジンでseed 1の小渡河戦を11手で本城破壊まで完走した結果を保存し、新UIで生死一覧→勧誘成功→生存者のLv.2強化→リロード→報酬再開→確定帰還を操作した。レナのHP15→16、味方1名の永久喪失と勧誘1名加入、勝利数1を兵舎・軍営で確認。リロード後に勧誘と強化を再実行する操作は出現しない。

## 画像

画像はブラウザから取得した実画面。スマホ検証画像では左上が指定した実寸CSS viewportで、右側・下側の暗色領域は検証用ホスト画面。

- [スマホ縦・戦闘](screenshots/mobile-ui/battle-phone.png)
- [スマホ横・戦闘](screenshots/mobile-ui/battle-landscape.png)
- [PC・戦闘](screenshots/mobile-ui/battle-desktop.png)
- [軍営](screenshots/mobile-ui/camp-phone.png)
- [兵舎](screenshots/mobile-ui/barracks-phone.png)
- [実測JSON](screenshots/mobile-ui/viewports.json)

## 再検証

`npm run dev` 後、`/qa/character-responsive.html?w=390&h=844` でサイズ別確認。`/qa/lifecycle.html` は現在の開発用ロスターで対戦を完走し、報酬画面を再開するための開発専用ページ。現存の開発用対戦を置き換える旨を画面に明示している。公開版には含まれない。

## 未検証範囲

物理スマートフォン、iOS Safariでの実タッチ・ノッチ・ブラウザバー変動・60fps計測は未実施。Safe Area、dvh/visualViewport、pointer capture、reduced-motionは実装し、ジェスチャーの中心補正・閾値・キャンセルは自動テストで検証した。ブラウザのCSS viewport検証と実機検証は区別する。
