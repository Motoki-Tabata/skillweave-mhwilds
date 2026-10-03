# handoff: 002-master-data-pipeline
<!-- 書き手はメイン（メインセッション）だけ。区間コマンドは開始時に必ず全文を読む。会話にしか無い情報をここへ移す。コミットハッシュは、既に存在するコミットのものだけを書く（handoff を含むコミット自身のハッシュは書かない。ハッシュを書くための amend はしない） -->

## 現在地
- 区間: C
- 次に起動するコマンド: `/tsod-plan 002-master-data-pipeline`
- 推奨モデル: Opus
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
| C-1 | plan.md・tasks.md | 未 | |
| D-1 | 実装受入 | 未 | |
| E-1 | マージ（PR・CI 緑） | 未 | |
| E-2 | ドリフト是正と drift PR のマージ | 未 | |
<!-- 状態: 未 / 承認済み / 該当なし（理由）。記録: 承認済みなら `YYYY-MM-DD / <短縮ハッシュ>`（ハッシュは、ゲートの直前に積んだ成果物のコミットの短縮ハッシュ。ゲートのコミット自身ではない）。E-1 は PR 番号（ユーザーが手動マージした場合は「承認済み（手動マージ）」と PR 番号）。E-2 は drift PR 番号（是正なしなら「承認済み（是正なし）」）。A-1 の記録には「decisions.md への移設先（Q 番号の一覧）」を併記する（該当なしなら「なし」） -->

## コミット範囲
- 区間 D の開始コミット: <区間 D を始めたときの HEAD>
- レビュー対象の範囲: `<開始コミット>..<再開点>`
- 是正の範囲: `<前回のレビュー対象の終点>..<是正の最後のコミット>`
<!-- 書くのは既に存在するコミットのハッシュだけ。区間 D 以外では空のまま -->

## 区間の再開点
- 一括検証が緑になった時点のコミット: <ハッシュ>
- その時点の verify の要約行: <総合結果の行と Sonar 件数行>
- レビューの進捗: <何回目まで済み・未解決の所見>
<!-- 区間 D の文脈が膨らんで中断するときに書く。再開した区間 D はここからレビュー（または是正）を始める -->

## 委譲の記録
| 領域 | ワーカー | コミット |
|---|---|---|
<!-- 区間 D。領域ごとの委譲が済んだらコミットを1行追記する。領域とワーカーは tsod-build/SKILL.md の領域表の語で書く -->

## レビュー記録
| 回 | 範囲 | 所見の要約 | 状態 |
|---|---|---|---|
<!-- 区間 D。所見は要約で書く（差分や所見の全文を貼らない）。状態: 要修正 / 是正済み / 解消 -->

## メインの直接修正
| 区間 | ファイル | 内容（1行） | 理由 |
|---|---|---|---|
<!-- 直接修正の直後、同じターンで1行追記する（後でまとめて書かない）。1件も無ければ「なし」と書く。空欄のままゲート D-1 を提示しない。PR 本文にはこの表をそのまま転記する -->

## PR 本文に必須の記載事項
<!-- 例: ユーザー承認のうえ追加した常時許可外の変更（パス・理由・承認した区間）、メインの直接修正（上の表をそのまま転記）、台帳（tasks/lessons.md）の変更 -->

## 未起票の教訓
<!-- 台帳へまだ書けない候補だけ。区間の終わりに起票するか、持ち越す理由を書く -->
なし（区間 A の canon への要求「overlay の書込許可」は `tasks/lessons.md` に起票済み）

## 要確認事項
<!-- 次の区間で必ず確認すべき事項。仕様の曖昧点は specs/open-questions.md へ -->
- 護鎖刃竜の命脈の訂正値（ゴグβ の発動部位数が `2→1, 2→1, 4→2, 4→2` と重複。他のセットは `2→1, 4→2`）は、最終確認をオーナーに求める（`temp/initial-design.md` §7.5 と同じ扱い）。
- `packages/data/overlays/**` の書込許可の canon への反映状況。未反映なら `corrections.yaml` は plan の常時許可外としてメインが書く。

## 区間メモ
<!-- 次の区間が知るべき事実だけ（再開位置・保留中の判断）。経緯は書かない -->
- 区間 A の時点の MHDB `main` の HEAD は `c50a1eb892f4a1ad9bb35c147801658804be2cc2`（`wilds.mhdb.io/version` は `2026-04-15T01:28:18+00:00`）。固定する SHA は区間 C で決める。
- 取得対象: `output/merged/` の `Skill.json`・`Armor.json`・`Accessory.json`・`Amulet.json`、`output/merged/weapons/` の武器種14ファイル（`HuntingHorn{EchoBubbles,EchoWaves,Melodies,Songs}.json` は対象外）。`Charm.json` は装飾用のアイテムで、護石ではない。
- MHDB の形: 防具はセット単位の配列で `pieces[].kind` が部位。`set_bonus_id`・`group_bonus_id` はスキルの gameId。スキルの `kind` は `armor`・`weapon`・`set`・`group`。武器の属性は `specials[]`（`kind: element|status`・`element`・`raw`）。生産護石（`Amulet.json` の `is_random: false`）の `ranks[]` にスロットは無い。名前は15言語あり、ja・en だけを使う。
