# handoff: 004-solver-ui
<!-- 書き手はメイン（メインセッション）だけ。区間コマンドは開始時に必ず全文を読む。会話にしか無い情報をここへ移す。コミットハッシュは、既に存在するコミットのものだけを書く（handoff を含むコミット自身のハッシュは書かない。ハッシュを書くための amend はしない） -->

## 現在地
- 区間: D
- 次に起動するコマンド: `/tsod-build 004-solver-ui`
- 推奨モデル: Sonnet
- ブランチ: `feat/004-solver-ui`（不変）
<!--
区間の終わりの定型（区間コマンドはこの行を逐語で写す。推奨モデルの表記は `Opus`・`Sonnet` だけを使う）

| 移行 | 区間 | 次に起動するコマンド | 推奨モデル | ブランチ |
|---|---|---|---|---|
| 開始（A） | A | `/tsod-spec 004-solver-ui` | Opus | `feat/004-solver-ui` |
| A→B | B | `/tsod-screen-table 004-solver-ui` | Opus | `feat/004-solver-ui`（不変） |
| A→C（UI もテーブル変更も無い） | C | `/tsod-plan 004-solver-ui` | Opus | `feat/004-solver-ui`（不変） |
| B→C | C | `/tsod-plan 004-solver-ui` | Opus | `feat/004-solver-ui`（不変） |
| C→D | D | `/tsod-build 004-solver-ui` | Sonnet | `feat/004-solver-ui`（不変） |
| D→E | E | `/tsod-ship 004-solver-ui` | Sonnet | `feat/004-solver-ui`（不変） |
| E→完了 | 完了 | なし | なし | なし（`feat/004-solver-ui`・`docs/004-solver-ui-drift` ともマージ・削除済み） |
-->

## ゲート記録
| ゲート | 対象 | 状態 | 承認日時・記録 |
|---|---|---|---|
| A-1 | 未確定事項の決定（decisions.md への移設） | 承認済み | 2026-10-06 / 81447bd（移設先: Q4, Q20, Q21, Q22, Q23, Q24, Q25。Q4・Q20 は open-questions から移設、Q21〜Q25 は区間 A で新規に起票して決定） |
| A-2 | 薄仕様 spec.md | 承認済み | 2026-10-06 / c7d2bea |
| B-1 | 画面設計 screen-design.md | 承認済み | 2026-10-06 / 57239c3 |
| B-2 | テーブル設計（design/・migration） | 該当なし（テーブル変更なし） | 2026-10-06 / API・DB を持たず、端末にも保存しない（Q23）。ランクはマスターの JSON の項目 |
| C-1 | plan.md・tasks.md | 承認済み | 2026-10-06 / 619acbf |
| D-1 | 実装受入 | 未 | |
| E-1 | マージ（PR・CI 緑） | 未 | |
| E-2 | ドリフト是正と drift PR のマージ | 未 | |
<!-- 状態: 未 / 承認済み / 該当なし（理由）。記録: 承認済みなら `YYYY-MM-DD / <短縮ハッシュ>`（ハッシュは、ゲートの直前に積んだ成果物のコミットの短縮ハッシュ。ゲートのコミット自身ではない）。E-1 は PR 番号（ユーザーが手動マージした場合は「承認済み（手動マージ）」と PR 番号）。E-2 は drift PR 番号（是正なしなら「承認済み（是正なし）」）。A-1 の記録には「decisions.md への移設先（Q 番号の一覧）」を併記する（該当なしなら「なし」） -->

## コミット範囲
- 区間 D の開始コミット: e8fb6af
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
- 台帳（`tasks/lessons.md`）の変更: 区間 A で「API を持たない e2e でも、一括検証の e2e の段が docker と API を起動する（機能004・区間A）」を起票した。
- ゲート C-1 で承認された常時許可外の変更のうち、spec に無く plan にだけあるもの: `apps/web/env.d.ts`・`apps/web/index.html`・`apps/web/tsconfig.app.json`・`apps/web/tsconfig.vitest.json`・`apps/web/tsconfig.e2e.json`（新規）・`apps/web/src/main/components/ui/`（shadcn-vue の CLI でコピー）。理由は plan 決定事項 5・7・8・19・20。
- `.github/workflows/ci.yml`（e2e ジョブ）と `README.md`（残作業の e2e の行）は「常に人間の明示指示を要するもの」に当たり、ゲート C-1 の承認を明示指示として扱ってメインが書いた（plan 決定事項 23）。
- spec の「触る領域」（web, data）の外に、solver のテスト（`packages/solver/src/test/support/builders.ts` の `armor()` に `rank`。tasks T5）が入る。`MasterArmor.rank` を必須にしたことの型の追従で、ソルバーの本体は変えていない。
- 区間 D の T1 で、ユーザー承認のうえ `pnpm-workspace.yaml` の `allowBuilds` に `vue-demi: false` を足した（plan に無い変更。`reka-ui` → `@floating-ui/vue` の推移的依存のビルドスクリプトが未判定で `pnpm install` が ERR_PNPM_IGNORED_BUILDS になるため。既定どおり遮断。0.14.x の既定の出力は Vue 3 向け。承認: 区間 D）。

## 未起票の教訓
<!-- 台帳へまだ書けない候補だけ。区間の終わりに起票するか、持ち越す理由を書く -->
- なし（区間 B の候補「キャンセルとやり直しのできる処理には、送信中の無効化が合わない」は、`design/ui-design-standard.md` §4 に反映して解消した）
- 区間 C の候補「web（composite の tsconfig）から `packages/*` のソースを import すると TS6307 で落ちるので、`tsconfig.app.json`・`tsconfig.vitest.json` の `include` に足す」は持ち越す。一時ファイルでの再現だけで、実際の import で通ることは区間 D の T1 で確かめるため。通ったら `.claude/rules/web-vue.md` への規律昇華として起票する。

## 要確認事項
<!-- 次の区間で必ず確認すべき事項。仕様の曖昧点は specs/open-questions.md へ -->

## 区間メモ
<!-- 次の区間が知るべき事実だけ（再開位置・保留中の判断）。経緯は書かない -->
- `open-questions.md` の Q5（デプロイ）は 004 の後の区間外作業の判断で、004 の spec には影響しないため移設していない。
- 区間 B では `design/ui-design-standard.md` の未決の項目（対応画面サイズ・密度・画面骨格・カテゴリ色・フォントスタックの見直し）を 004 の画面設計で決める（同文書の冒頭の注記）。
- 004 は新しいテーブルを持たない（API・DB なし。decisions.md Q23 で端末保存もしない）。ゲート B-2 は該当なしの見込み。
- 区間 A で、一括検証の e2e の段と Commands 表について canon への改修要求を `tasks/lessons.md` に起票した（2026-10-06 の項目）。
- 画面設計のキャンバスは https://claude.ai/artifact/KiuQGu3oEf2g3UzLpfNjXv （`screen-design.md` が正）。B-1 で `design/ui-design-standard.md` の未決の項目も確定した。
- 区間 D は tasks.md の T1 から直列で進める（並列にしない。plan 決定事項 26）。T3（data-agent）の検証では、`dist.spec.ts` の版の不一致（T4 で解消）と solver の型検査の `builders.ts` の `rank` の欠落（T5 で解消）の失敗が想定内。
- 一括検証の e2e の段は docker と API を起動する（plan 決定事項 24）。区間 D の一括検証には docker と Java が要る。
- スキルの攻撃系・会心系などの分類（スキルを選ぶダイアログの並びに使う）は、ユーザーが後で作りたいとした。マスターに無いデータなので 004 には含めない。後で `/tsod-discover` で機能マップに追加する（Q22 の固定・除外の入力 UI と同じ扱い）。
