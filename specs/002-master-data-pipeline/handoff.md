# handoff: 002-master-data-pipeline
<!-- 書き手はメイン（メインセッション）だけ。区間コマンドは開始時に必ず全文を読む。会話にしか無い情報をここへ移す。コミットハッシュは、既に存在するコミットのものだけを書く（handoff を含むコミット自身のハッシュは書かない。ハッシュを書くための amend はしない） -->

## 現在地
- 区間: E
- 次に起動するコマンド: `/tsod-ship 002-master-data-pipeline`
- 推奨モデル: Sonnet
- ブランチ: `feat/002-master-data-pipeline`（不変）
<!--
区間の終わりの定型（区間コマンドはこの行を逐語で写す。推奨モデルの表記は `Opus`・`Sonnet` だけを使う）

| 移行 | 区間 | 次に起動するコマンド | 推奨モデル | ブランチ |
|---|---|---|---|---|
| 開始（A） | A | `/tsod-spec 002-master-data-pipeline` | Opus | `feat/002-master-data-pipeline` |
| A→B | B | `/tsod-screen-table 002-master-data-pipeline` | Opus | `feat/002-master-data-pipeline`（不変） |
| A→C（UI もテーブル変更も無い） | C | `/tsod-plan 002-master-data-pipeline` | Opus | `feat/002-master-data-pipeline`（不変） |
| B→C | C | `/tsod-plan 002-master-data-pipeline` | Opus | `feat/002-master-data-pipeline`（不変） |
| C→D | D | `/tsod-build 002-master-data-pipeline` | Sonnet | `feat/002-master-data-pipeline`（不変） |
| D→E | E | `/tsod-ship 002-master-data-pipeline` | Sonnet | `feat/002-master-data-pipeline`（不変） |
| E→完了 | 完了 | なし | なし | なし（`feat/002-master-data-pipeline`・`docs/002-master-data-pipeline-drift` ともマージ・削除済み） |
-->

## ゲート記録
| ゲート | 対象 | 状態 | 承認日時・記録 |
|---|---|---|---|
| A-1 | 未確定事項の決定（decisions.md への移設） | 承認済み | 2026-10-04 / dd5aeff（移設先: Q7, Q9, Q10, Q11, Q12） |
| A-2 | 薄仕様 spec.md | 承認済み | 2026-10-04 / 19bdfc0 |
| B-1 | 画面設計 screen-design.md | 該当なし（UI・テーブル変更なし） | |
| B-2 | テーブル設計（design/・migration） | 該当なし（UI・テーブル変更なし） | |
| C-1 | plan.md・tasks.md | 承認済み | 2026-10-04 / a41db24 |
| D-1 | 実装受入 | 承認済み | 2026-10-04 / f64799b |
| E-1 | マージ（PR・CI 緑） | 未 | |
| E-2 | ドリフト是正と drift PR のマージ | 未 | |
<!-- 状態: 未 / 承認済み / 該当なし（理由）。記録: 承認済みなら `YYYY-MM-DD / <短縮ハッシュ>`（ハッシュは、ゲートの直前に積んだ成果物のコミットの短縮ハッシュ。ゲートのコミット自身ではない）。E-1 は PR 番号（ユーザーが手動マージした場合は「承認済み（手動マージ）」と PR 番号）。E-2 は drift PR 番号（是正なしなら「承認済み（是正なし）」）。A-1 の記録には「decisions.md への移設先（Q 番号の一覧）」を併記する（該当なしなら「なし」） -->

## コミット範囲
- 区間 D の開始コミット: 7672feb6aac9566e20f5debc488e67a41db4611d
- レビュー対象の範囲: `<開始コミット>..<再開点>`
- 是正の範囲: `<前回のレビュー対象の終点>..<是正の最後のコミット>`
<!-- 書くのは既に存在するコミットのハッシュだけ。区間 D 以外では空のまま -->

## 区間の再開点
- 一括検証が緑になった時点のコミット: dbb1824
- その時点の verify の要約行: 総合結果: PASS（`verify.mjs --e2e`。e2e・sonar は SKIP。Sonar 件数行は最終検証で取る）
- レビューの進捗: 2回目まで済み・未解決の所見なし。最終検証（--e2e --sonar）PASS、Sonar issue 0 / hotspot 0 / Quality Gate OK
<!-- 区間 D の文脈が膨らんで中断するときに書く。再開した区間 D はここからレビュー（または是正）を始める -->

## 委譲の記録
| 領域 | ワーカー | コミット |
|---|---|---|
| 常時許可外の変更（T1） | main | 2a09c36 |
| data 実装（T2・T3） | data-agent | 626e113 |
| 生成物 dist（T4） | main | 8a6048b |
| data テスト（T5・T6） | data-test-agent | 7b340d8 |
| passWithNoTests 削除（T7） | main | dbb1824 |
| 是正: thresholds の整数検証（data 実装） | data-agent | 5b36aba |
| 是正: 同上のテスト（data テスト） | data-test-agent | 9696f8c |
<!-- 区間 D。領域ごとの委譲が済んだらコミットを1行追記する。領域とワーカーは tsod-build/SKILL.md の領域表の語で書く -->

## レビュー記録
| 回 | 範囲 | 所見の要約 | 状態 |
|---|---|---|---|
| 1 | 7672feb..dbb1824 | 要修正: (1) validate.ts の thresholds の level・pieces が整数かを見ていない（受入基準 8。欠落・小数が通る）(2) 直接修正の表が空欄。任意: 置換後の値の型の防御、パスの文字列連結、`in` を `Object.hasOwn` に、`?? ''` と型キャストの黙った通過、levelDescriptions の長さ検査、generate.spec の2回目比較の名前、writeAtomic の重複。受入基準 1〜15 は (1) を除き充足。plan・憲法の逸脱なし | 是正済み |
| 2 | 6dc7712..9696f8c | 問題なし（要修正・任意なし）。前回の要修正 2 件は解消 | 解消 |
<!-- 区間 D。所見は要約で書く（差分や所見の全文を貼らない）。状態: 要修正 / 是正済み / 解消 -->

## メインの直接修正
| 区間 | ファイル | 内容（1行） | 理由 |
|---|---|---|---|
| なし | | | |
<!-- 直接修正の直後、同じターンで1行追記する（後でまとめて書かない）。1件も無ければ「なし」と書く。空欄のままゲート D-1 を提示しない。PR 本文にはこの表をそのまま転記する -->

## PR 本文に必須の記載事項
<!-- 例: ユーザー承認のうえ追加した常時許可外の変更（パス・理由・承認した区間）、メインの直接修正（上の表をそのまま転記）、台帳（tasks/lessons.md）の変更 -->
- spec に無く plan で足した常時許可外の変更（ゲート C-1 で承認）: `packages/data/tsconfig.entry.json`（新規。入口を `types: []` で型検査し、受入基準 15 を機械で守る）、`design/tech-stack.md`（yaml 2.9.1 の追加）
- `pnpm-lock.yaml`: yaml 2.9.1 の追加により、vite の optional peer に yaml が解決され、vite・vitest などの識別子に `(yaml@2.9.1)` が付いた（apps/web・packages/solver の解決は変わらず、識別子だけの差分）
- MHDB の訂正（`overlays/corrections.yaml`）は、spec が挙げる護鎖刃竜の命脈に加え、巨戟龍の黙示録（`sb:5590`）も同じ重複のため訂正する（plan 決定事項 13。訂正値はゲート C-1 でオーナーが確認）

## 未起票の教訓
<!-- 台帳へまだ書けない候補だけ。区間の終わりに起票するか、持ち越す理由を書く -->
なし（区間 D で新たな候補なし。ワーカーの報告にも教訓候補なし。区間 A の canon への要求「overlay の書込許可」は `tasks/lessons.md` に起票済み）

## 要確認事項
<!-- 次の区間で必ず確認すべき事項。仕様の曖昧点は specs/open-questions.md へ -->
- `packages/data/overlays/**` の書込許可は 2026-10-04 時点で canon に未反映。`corrections.yaml` は plan の常時許可外として T1 でメインが書く。区間 D の開始時に `write-scopes.json` を見て、反映済みでもこの機能ではメインが書く（plan どおり）。

## 区間メモ
<!-- 次の区間が知るべき事実だけ（再開位置・保留中の判断）。経緯は書かない -->
- 固定する MHDB の SHA は `c50a1eb892f4a1ad9bb35c147801658804be2cc2`、版は `2026.10.1`（plan「スタック」）。訂正値（命脈・黙示録とも `2→1, 4→2`）はゲート C-1 でオーナーが確認済み。
- 取得対象: `output/merged/` の `Skill.json`・`Armor.json`・`Accessory.json`・`Amulet.json`、`output/merged/weapons/` の武器種14ファイル（`HuntingHorn{EchoBubbles,EchoWaves,Melodies,Songs}.json` は対象外）。`Charm.json` は装飾用のアイテムで、護石ではない。
- MHDB の形: 防具はセット単位の配列で `pieces[].kind` が部位。`set_bonus_id`・`group_bonus_id` はスキルの gameId。スキルの `kind` は `armor`・`weapon`・`set`・`group`。武器の属性は `specials[]`（`kind: element|status`・`element`・`raw`）。生産護石（`Amulet.json` の `is_random: false`）の `ranks[]` にスロットは無い。名前は15言語あり、ja・en だけを使う。
