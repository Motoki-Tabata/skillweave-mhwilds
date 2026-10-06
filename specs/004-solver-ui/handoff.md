# handoff: 004-solver-ui
<!-- 書き手はメイン（メインセッション）だけ。区間コマンドは開始時に必ず全文を読む。会話にしか無い情報をここへ移す。コミットハッシュは、既に存在するコミットのものだけを書く（handoff を含むコミット自身のハッシュは書かない。ハッシュを書くための amend はしない） -->

## 現在地
- 区間: E
- 次に起動するコマンド: `/tsod-ship 004-solver-ui`
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
| D-1 | 実装受入 | 承認済み | 2026-10-07 / 6a3308e |
| E-1 | マージ（PR・CI 緑） | 未 | |
| E-2 | ドリフト是正と drift PR のマージ | 未 | |
<!-- 状態: 未 / 承認済み / 該当なし（理由）。記録: 承認済みなら `YYYY-MM-DD / <短縮ハッシュ>`（ハッシュは、ゲートの直前に積んだ成果物のコミットの短縮ハッシュ。ゲートのコミット自身ではない）。E-1 は PR 番号（ユーザーが手動マージした場合は「承認済み（手動マージ）」と PR 番号）。E-2 は drift PR 番号（是正なしなら「承認済み（是正なし）」）。A-1 の記録には「decisions.md への移設先（Q 番号の一覧）」を併記する（該当なしなら「なし」） -->

## コミット範囲
- 区間 D の開始コミット: e8fb6af
- レビュー対象の範囲: `<開始コミット>..<再開点>`
- 是正の範囲: `<前回のレビュー対象の終点>..<是正の最後のコミット>`
<!-- 書くのは既に存在するコミットのハッシュだけ。区間 D 以外では空のまま -->

## 区間の再開点
- 一括検証が緑になった時点のコミット: 0ea6f06（最終検証 `verify.mjs --e2e --sonar` も PASS・Sonar issue 0 / hotspot 0 / Quality Gate OK。コミットは 6a3308e）
- その時点の verify の要約行: `verify.mjs --e2e` 総合結果: PASS（Sonar は最終検証まで未実行。担当領域ごとの `--sonar-area` は issue 0 / hotspot 0）
- レビューの進捗: 1回目で解消（要修正0件）
<!-- 区間 D の文脈が膨らんで中断するときに書く。再開した区間 D はここからレビュー（または是正）を始める -->

## 委譲の記録
| 領域 | ワーカー | コミット |
|---|---|---|
| data 実装 | data-agent | 00a5cad |
| data 再生成（メイン T4） | main | 5902539 |
| solver テスト | solver-test-agent | dfab226 |
| data テスト | data-test-agent | 3907ad1 |
| web 実装 | web-agent | 74237a3（Sonar 抑止の承認の記録は 02deff0） |
| web 単体テスト | web-test-agent | ebcf74b |
| E2E（T9・T10） | e2e-agent | 93e12e8 |
| 測定の記録（メイン T11） | main | 0ea6f06 |
<!-- 区間 D。領域ごとの委譲が済んだらコミットを1行追記する。領域とワーカーは tsod-build/SKILL.md の領域表の語で書く -->

## レビュー記録
| 回 | 範囲 | 所見の要約 | 状態 |
|---|---|---|---|
| 1 | e8fb6af..0ea6f06 | 要修正1（直接修正の表が空）。確認事項10: ①使っていない ui/ 部品と PickerDialog の置き場 ②Sonar 抑止 e3 の範囲 ③trustPolicyExclude の恒久化 ④tech-stack の003の節の古い記述 ⑤web-vue.md の lucide 節が古い ⑥テスト規約外の置き場 ⑦App.spec のコメントの番号 ⑧e2e/.gitkeep ⑨進捗の記録 ⑩CI の e2e は CI 未確認。受入基準1〜14は実装とテストに対応、憲法・スコープ外の違反なし、セキュリティ問題なし。Sonar 全体は判定不能（最終検証で確かめる） | 解消（要修正は記録で解消。④⑦⑧⑨は直接修正、⑤⑥は台帳に起票。①②③⑩は D-1 で提示） |
<!-- 区間 D。所見は要約で書く（差分や所見の全文を貼らない）。状態: 要修正 / 是正済み / 解消 -->

## メインの直接修正
| 区間 | ファイル | 内容（1行） | 理由 |
|---|---|---|---|
| D | `apps/web/e2e/.gitkeep` | 削除 | e2e/ に実ファイルが入ったため（レビュー確認事項8） |
| D | `apps/web/src/test/App.spec.ts` | コメントの受入基準の番号を 10 から 11 に直した | レビュー確認事項7（コメントのみ） |
| D | `specs/004-solver-ui/tasks.md` | T1〜T11 のチェックボックスを更新 | レビュー確認事項9 |
| D | `design/tech-stack.md` | 003 の節の「限界」「対策」の参照先を、004 の測定と decisions.md へ直した | レビュー確認事項4（古い記述） |
<!-- 直接修正の直後、同じターンで1行追記する（後でまとめて書かない）。1件も無ければ「なし」と書く。空欄のままゲート D-1 を提示しない。PR 本文にはこの表をそのまま転記する -->

## PR 本文に必須の記載事項
<!-- 例: ユーザー承認のうえ追加した常時許可外の変更（パス・理由・承認した区間）、メインの直接修正（上の表をそのまま転記）、台帳（tasks/lessons.md）の変更 -->
- 台帳（`tasks/lessons.md`）の変更: 区間 A で「API を持たない e2e でも、一括検証の e2e の段が docker と API を起動する（機能004・区間A）」を起票した。
- ゲート C-1 で承認された常時許可外の変更のうち、spec に無く plan にだけあるもの: `apps/web/env.d.ts`・`apps/web/index.html`・`apps/web/tsconfig.app.json`・`apps/web/tsconfig.vitest.json`・`apps/web/tsconfig.e2e.json`（新規）・`apps/web/src/main/components/ui/`（shadcn-vue の CLI でコピー）。理由は plan 決定事項 5・7・8・19・20。
- `.github/workflows/ci.yml`（e2e ジョブ）と `README.md`（残作業の e2e の行）は「常に人間の明示指示を要するもの」に当たり、ゲート C-1 の承認を明示指示として扱ってメインが書いた（plan 決定事項 23）。
- spec の「触る領域」（web, data）の外に、solver のテスト（`packages/solver/src/test/support/builders.ts` の `armor()` に `rank`。tasks T5）が入る。`MasterArmor.rank` を必須にしたことの型の追従で、ソルバーの本体は変えていない。
- 区間 D の T1 で、ユーザー承認のうえ `pnpm-workspace.yaml` の `allowBuilds` に `vue-demi: false` を足した（plan に無い変更。`reka-ui` → `@floating-ui/vue` の推移的依存のビルドスクリプトが未判定で `pnpm install` が ERR_PNPM_IGNORED_BUILDS になるため。既定どおり遮断。0.14.x の既定の出力は Vue 3 向け。承認: 区間 D）。

- 区間 D の T2 で、ユーザー承認のうえ `pnpm-workspace.yaml` に `trustPolicyExclude: [semver@6.3.1]` を足した（plan に無い変更。shadcn-vue の CLI の推移的依存。理由と調査は要確認事項。承認: 区間 D）。
- 区間 D の T2 で、ユーザー承認のうえ `apps/web/components.json` から `"framework": "vite"` を削除した（plan に無い変更。shadcn-vue@2.8.2 のスキーマに無いキーで CLI が拒否するため。承認: 区間 D）。
- 区間 D の T7 で、ユーザー承認のうえ `sonar-project.properties` に `sonar.issue.ignore.multicriteria`（e1〜e3）を足した（plan に無い変更）。`ui/input/Input.vue`・`ui/label/Label.vue`（shadcn-vue のコピー。編集禁止）と `RequiredSkillsCard.vue` の `SelectTrigger` に対する `Web:InputWithoutLabelCheck`・`Web:S6853` の誤検知3件。理由は各行のコメント。承認: 区間 D。

## 未起票の教訓
<!-- 台帳へまだ書けない候補だけ。区間の終わりに起票するか、持ち越す理由を書く -->
- なし（区間 B の候補「キャンセルとやり直しのできる処理には、送信中の無効化が合わない」は、`design/ui-design-standard.md` §4 に反映して解消した）
- 区間 D の候補（T7）→ 起票済み（tasks/lessons.md 2026-10-07 の2件）。以下は経緯:
- 区間 D の候補（T7）: `role="group"`・`role="status"` は Sonar S6819 に引っかかるので `<fieldset>`・`<output>` で書く（`.claude/rules/web-vue.md` の Sonar 節へ）。Reka の `SelectTrigger` に `Web:InputWithoutLabelCheck` が出る（抑止済み）。TS6307 は `tsconfig.app.json` の include で通ることを確認（`web-vue.md` への昇華候補。T11 の後に判断）。Playwright の headless shell の版ずれ（1244 と 1243）は e2e-agent の前に `playwright install chromium` が要るか確認する。
- 区間 D の候補（T2）: shadcn-vue の CLI は、`tsconfig.json` に `paths` が無いと失敗し、`components.json` の未知のキーも拒否する。`.claude/rules/ui-design.md` へ昇華するかは T7 の後に判断する（持ち越し）。
- 区間 C の候補「web（composite の tsconfig）から `packages/*` のソースを import すると TS6307 で落ちるので、`tsconfig.app.json`・`tsconfig.vitest.json` の `include` に足す」は持ち越す。一時ファイルでの再現だけで、実際の import で通ることは区間 D の T1 で確かめるため。通ったら `.claude/rules/web-vue.md` への規律昇華として起票する。

## 要確認事項
- 区間 E への持ち越し（D-1 で現状のまま承認）: ①使っていない `ui/` の部品（`progress`・`dialog` の一部）と `PickerDialog` の置き場 ②Sonar 抑止 e3 が `RequiredSkillsCard.vue` 全体にかかること ③`trustPolicyExclude: [semver@6.3.1]` の恒久化 ④CI の e2e ジョブが CI 上で通るか（E-1 で確認。Playwright の headless shell の版ずれに注意）。
<!-- 次の区間で必ず確認すべき事項。仕様の曖昧点は specs/open-questions.md へ -->
- 区間 D は T1・T2 まで完了（T1: 525e20e。T2: 下記の T2 のコミット）。T1〜T11 は完了し、一括検証は緑（0ea6f06）。次はレビュー。測定は合格（最大 1422.0 ms。design/tech-stack.md に記録済み）。
- T2 のサプライチェーン調査の結論（2026-10-06）: ①`semver@6.3.1` は npm CLI チームの公開（2023-07-10）で、tarball の integrity 一致・6.3.0 との差分は正規表現の ReDoS 対策のみ（CVE-2022-25883 の移植）・install スクリプトなし・週間 DL 約4億。trustPolicy が落ちたのは、先に出た 7.5.1〜7.5.4 に provenance があり、後から出た 6.x 系の 6.3.1 に無いためで、誤検知と判断した。②`vue-demi@0.14.10` は antfu 公開・postinstall は Vue の版に応じた切替ファイルを書くだけでネットワーク等なし。`allowBuilds: false` の遮断を維持する。
- T2 の実施: ユーザー承認のうえ `trustPolicyExclude: [semver@6.3.1]` を足した。その後 CLI が `components.json` の `framework` を拒否したので、承認のうえ削除した。CLI は `tsconfig.json` の `paths` が無いと `resolvedPaths` で失敗するため、実行中だけ一時的に足して戻した（差分なし）。部品は `@lucide/vue` の import で生成され（書き換え不要）、`package.json`・lockfile に差分は無い。コピーした `ui/` は Prettier で整形した（`format:check` 緑）。
- T2 の時点で `type-check` は `@/lib/utils`（`cn()`）が無いため失敗する。plan 決定事項 20 のとおり、web-agent が T7 で `src/main/lib/utils.ts` を作る（T3〜T6 の検証では web の型検査は対象外）。

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
