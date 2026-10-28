# handoff: 020-armor-lock-exclude
<!-- 書き手はメイン（メインセッション）だけ。区間コマンドは開始時に必ず全文を読む。会話にしか無い情報をここへ移す。handoff は `.claude/skills/tsod-workflow/scripts/handoff.mjs` だけで更新し、Edit・sed・python・node -e で書き換えない。ゲート記録は `handoff.mjs gate` で書き、次の区間が `handoff.mjs check` で照合する。コミットハッシュは、既に存在するコミットのものだけを書く（handoff を含むコミット自身のハッシュは書かない。ハッシュを書くための amend はしない） -->

## 現在地
- 区間: D
- 次に起動するコマンド: `/tsod-build 020-armor-lock-exclude`
- 推奨モデル: Sonnet
- ブランチ: `feat/020-armor-lock-exclude`（不変）
<!--
区間の終わりの定型（区間コマンドはこの行を逐語で写す。推奨モデルの表記は `Opus`・`Sonnet` だけを使う）

| 移行 | 区間 | 次に起動するコマンド | 推奨モデル | ブランチ |
|---|---|---|---|---|
| 開始（A） | A | `/tsod-spec 020-armor-lock-exclude` | Opus | `feat/020-armor-lock-exclude` |
| A→B | B | `/tsod-screen-table 020-armor-lock-exclude` | Opus | `feat/020-armor-lock-exclude`（不変） |
| A→C（UI もテーブル変更も無い） | C | `/tsod-plan 020-armor-lock-exclude` | Opus | `feat/020-armor-lock-exclude`（不変） |
| B→C | C | `/tsod-plan 020-armor-lock-exclude` | Opus | `feat/020-armor-lock-exclude`（不変） |
| C→D | D | `/tsod-build 020-armor-lock-exclude` | Sonnet | `feat/020-armor-lock-exclude`（不変） |
| D→E | E | `/tsod-ship 020-armor-lock-exclude` | Sonnet | `feat/020-armor-lock-exclude`（不変） |
| E→完了 | 完了 | なし | なし | なし（`feat/020-armor-lock-exclude`・`docs/020-armor-lock-exclude-drift` ともマージ・削除済み） |
-->

## ゲート記録
| ゲート | 対象 | 状態 | 承認日時・記録 |
|---|---|---|---|
| A-1 | 未確定事項の決定（decisions.md への移設） | 承認済み | 2026-10-28 / 8add97c |
| A-2 | 薄仕様 spec.md | 承認済み | 2026-10-28 / aeaa737 |
| B-1 | 画面設計 screen-design.md | 承認済み | 2026-10-28 / a71f78d |
| B-2 | テーブル設計（design/・migration） | 該当なし（テーブル変更なし） | 2026-10-28 |
| C-1 | plan.md・tasks.md | 承認済み | 2026-10-29 / f74fa40 |
| D-1 | 実装受入 | 未 | |
| E-1 | マージ（PR・CI 緑） | 未 | |
| E-2 | ドリフト是正と drift PR のマージ | 未 | |
<!-- 状態: 未 / 承認済み / 該当なし（理由）。記録: 承認済みなら `YYYY-MM-DD / <短縮ハッシュ>`（ハッシュは、成果物をコミットした直後の HEAD の短縮ハッシュ。ゲートのコミット自身ではない。gate を打った後のコミットは handoff.md だけにする）。E-1 は ship の呼び出しどおり `PR #番号`（手動マージ済みなら `手動マージ PR #番号`）。E-2 は `drift PR #番号`（是正なしなら `--na "是正なし"` で「該当なし（是正なし）」）。A-1 の記録には「decisions.md への移設先（Q 番号の一覧）」を併記する（該当なしなら「なし」） -->

## コミット範囲
- 区間 D の開始コミット: d913a57
- レビュー対象の範囲: `<開始コミット>..<再開点>`
- 是正の範囲: `<前回のレビュー対象の終点>..<是正の最後のコミット>`
<!-- 書くのは既に存在するコミットのハッシュだけ。区間 D 以外では空のまま -->

## 区間の再開点
- 一括検証が緑になった時点のコミット: 5cd01cf
- その時点の verify の要約行: <総合結果の行と Sonar 件数行>
- レビューの進捗: <何回目まで済み・未解決の所見>
<!-- 区間 D の文脈が膨らんで中断するときに書く。再開した区間 D はここからレビュー（または是正）を始める -->

## 委譲の記録
| 領域 | ワーカー | コミット |
|---|---|---|
| solver | solver-agent | ef6c584 |
| web (T2) | web-agent | 441c63f |
| web (T3) | web-agent | e5c68c2 |
| E2E | e2e-agent | f63f158 |
| web (是正) | web-agent | 4417e3c |
| E2E (是正) | e2e-agent | 5cd01cf |
<!-- 区間 D。領域ごとの委譲が済んだらコミットを1行追記する。領域とワーカーは tsod-build/SKILL.md の領域表の語で書く -->

## レビュー記録
| 回 | 範囲 | 所見の要約 | 区分 | 処遇 | 状態 |
|---|---|---|---|---|---|
| 1 | d913a57..5cd01cf solver | verifyBuild.ts が除外した装飾品を検査しない（任意の補強） | 持ち越し | 持ち越し | 要修正 |
| 1 | d913a57..5cd01cf solver | verifyBuild.ts が除外した装飾品を検査しない（任意の補強） | 持ち越し | 持ち越し | 解消 |
| 1 | d913a57..5cd01cf solver | 除外で解なしになる経路のテストが無い（任意） | 持ち越し | 持ち越し | 解消 |
| 1 | d913a57..5cd01cf solver | 新テストの describe 名が周囲の AC 表記と混ざる（軽微） | 持ち越し | 持ち越し | 解消 |
| 1 | d913a57..5cd01cf web | handoff に是正コミット 4417e3c・5cd01cf の委譲記録が無い | 要修正 | 是正 | 要修正 |
| 1 | d913a57..5cd01cf web | handoff に是正コミット 4417e3c・5cd01cf の委譲記録が無い | 要修正 | 是正 | 解消 |
| 1 | d913a57..5cd01cf web | 検索用 Combobox の入力欄の構造が 3 箇所に複製（共通化は 005 に触れる） | 起票 | 起票 | 解消 |
| 1 | d913a57..5cd01cf web | SearchView onEnter の role=combobox 除外の副作用なし（観察） | 持ち越し | 持ち越し | 解消 |
| 1 | d913a57..5cd01cf web | AC-11 e2e の補強余地（名前の部分一致・対照の欠如・TAIJUTSU の重複） | 持ち越し | 持ち越し | 解消 |
| 1 | d913a57..5cd01cf web | AC-7 の固定→除外の一覧更新を画面経由で見るテストが無い | 持ち越し | 持ち越し | 解消 |
| 1 | d913a57..5cd01cf web | buildSolverRequest が固定と除外の重なりを自分では除かない（validate が弾く） | 持ち越し | 持ち越し | 解消 |
| 1 | d913a57..5cd01cf web | ExcludeCard の未使用 root ref | 持ち越し | 持ち越し | 解消 |
<!-- 区間 D。所見1件につき1行。所見は要約で書く（差分や所見の全文を貼らない）。区分: reviewer-agent の区分（要修正 / 要判断 / 起票 / 持ち越し）。処遇: 是正 / 直接修正 / ゲートで判断 / 起票 / 持ち越し のどれか。状態: 要修正 / 是正済み / 解消。既存の行は書き換えず、是正後は同じ所見の新しい行を状態=解消で追記する。
区分と処遇の対応: 要修正 → 是正または直接修正 / 要判断 → ゲートで判断 / 起票 → 起票 / 持ち越し → 持ち越し -->

## メインの直接修正
| 区間 | ファイル | 内容（1行） | 理由 |
|---|---|---|---|
| なし | - | - | - |
<!-- 直接修正の直後、同じターンで1行追記する（後でまとめて書かない）。1件も無ければ「なし」と書く。空欄のままゲート D-1 を提示しない。PR 本文にはこの表をそのまま転記する -->

## PR 本文に必須の記載事項
<!-- 例: ユーザー承認のうえ追加した常時許可外の変更（パス・理由・承認した区間）、メインの直接修正（上の表をそのまま転記）、台帳（tasks/lessons.md）の変更 -->
- メインの直接修正: なし。常時許可外の変更: なし。台帳 tasks/lessons.md に 1 件起票（Combobox の Enter・blur の落とし穴）

## 未起票の教訓
<!-- 台帳へまだ書けない候補だけ。区間の終わりに起票するか、持ち越す理由を書く -->

## 要確認事項
<!-- 次の区間で必ず確認すべき事項。仕様の曖昧点は specs/open-questions.md へ -->

## 区間メモ
<!-- 次の区間が知るべき事実だけ（再開位置・保留中の判断）。経緯は書かない -->
- A-1 の移設先: Q79・Q80・Q81・Q82（open-questions からの移設なし。区間 A で新しく立てた問い）
