# v2.0 検証記録

2026-11-05。`npm run typecheck`、`npm run lint`、`npm test`、`npm run build` を使用。

|対象|検証|
|---|---|
|AC-01〜04 初期・個体差・上限・補充|character-core、character-rewards、character-storage。各職3名、最低値、15名、名前編集、除隊、スカウト時の死亡者差引き|
|AC-05〜08 編成・配置・地図・本城|character-core、character-battle、map-sizes。1〜6名、コスト10、全6地図の本城周囲検証|
|AC-09〜14 戦闘・交互行動・HP・勝敗|character-core、character-battle、character-lifecycle、character-worker。移動後発見・攻撃、反撃、全滅、本城破壊|
|AC-15〜22 成長・勧誘・戦績・回復|character-core、character-rewards、character-storage、character-lifecycle。レベル固定補正、対象制限、確率、所属・Lv引継ぎ、死亡除外、撃破記録|
|AC-23〜24 敗北・保存|character-persistence、character-worker。実IndexedDB API（fake-indexeddb）で手番復帰、競合拒否、勝利と報酬の一括保存、二重付与拒否。PCブラウザで戦闘再読込と敗北→配置復帰を確認|
|AC-25 秘匿|character-battle、character-session、character-worker。未探索地形・視野外の敵は観測に含めない。演出フレームも同じ制限|
|AC-26 CPU|character-battle-probe。全6地図×両先攻×3シード×1/5/6名編成＝108条件で合法手による決着|
|AC-27 UI|PCブラウザで編成・配置・移動確認・攻撃予測・攻撃・反撃・敗北・復帰、再読込を実施。勝利→勧誘→強化→帰還は画面が使用するセッション・Worker・保存境界の自動試験で検証|
|AC-28 既存ゲーム|ルートのカードゲームソースは変更対象に含めない。Pages梱包は既存ルートゲームとHEXを配置|

## 表示サイズ

ブラウザ内のiframeで各CSS viewportを作り、戦闘画面のhtmlの幅・高さとscrollWidth/scrollHeightが一致することを確認：375×667、390×844、430×932、844×390、768×1024、1366×768、1440×900。ドラッグ閾値、ピンチの中心補正、ホイールズーム、クリック誤発火抑止は既存のmap-gestures／map-viewportの自動試験を継承。

これは実端末でのタッチ入力・フレームレート測定ではありません。機種ごとのSafe Area、ブラウザバーの変動、描画性能については公開後も実端末で確認が必要です。勝利報酬画面のリロードはIndexedDB統合試験で保証し、PCでの全画面手動試験とは区別します。

## 暫定事項

初期名・所属配分、CPU評価、敵全滅勝利、待機、地形補正、勧誘1回、ブラウザローカル保存はGAME_SPECの暫定ルールです。CPUの全シードでの決着を保証するものではありません。プレイヤーが待機を繰り返す試合には強制手数上限を設けません。
