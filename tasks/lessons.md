# 教訓台帳

canon への改修要求と作業の教訓を、その場で起票する唯一の台帳です。
書式と行き先の正は `.claude/skills/tsod-workflow/references/lessons-guide.md` です。
反映済みの項目は canon の配置時に lessons-ledger が消すので、手で消さないでください。

## 2026-10-03 未信頼のワークスペースでは書込ガードと許可リストが黙って無効になる（canon 配置後の実発火確認・区間外）
- 種別: 矛盾是正
- 何が起きたか: `api-test-agent` を native の `subagent_type` で起動し、`apps/api/src/main/java/` への Write・Bash リダイレクト・任意スクリプトを試したところ、すべて通った（deny も block も無し）。`agent-write-guard.mjs` を手で呼ぶと正しく deny を返す。`claude -p --debug-file` のログに `Skipping frontmatter hooks for agent 'api-test-agent': the folder its definition file came from is not trusted` と `Dropped 159 project-scoped permissions.allow entries — workspace not yet trusted` が出た。trust dialog を承認していないワークスペースでは、frontmatter の hooks と settings.json の permissions.allow が警告なしで捨てられる。`.claude/README.md` の「前提セットアップと配置後の手作業」は「なし」と書いており、`impact-scope/guard-internals.md`「強度」はワーカーの書込を deterministic としていて、この前提が抜けている。
- 提案: canon の配置手順と `.claude/README.md`「前提セットアップと配置後の手作業」に「対象リポジトリで Claude Code を対話起動して trust dialog を承認する」を加える。`guard-internals.md`「強度」と「既知の限界」に「ワークスペースが信頼済みであること」を前提として明記し、実発火の確認手順の最初に信頼状態の確認（`~/.claude.json` の `projects[<root>].hasTrustDialogAccepted`）を置く。

## 2026-10-03 許可リストの `'./packages/*'` の `*` がワイルドカードとして扱われ、許可が意図より広い（canon 配置後の実発火確認・区間外）
- 種別: 矛盾是正
- 何が起きたか: 信頼済みのワークスペースで `claude -p` を起動すると、`.claude/settings.json` の `Bash(pnpm --filter './packages/*' run <script>)` 系の14ルールすべてに「wildcard before the rest of the command, so it also matches any options inserted at that position and approves them without a prompt」という警告が出た。クォート内の `*` が任意文字列に一致するため、`--filter './packages/` と `' run lint` の間に任意のオプションを挟んだコマンドまで確認なしで通る。2形（この形と `./gradlew …`）が確認なしで通ること自体は、通常の権限モードの `claude -p` で確かめた。
- 提案: canon の settings.json の生成元で `pnpm --filter './packages/*' run …` の14ルールを削除し、既に列挙済みの `pnpm --filter @swv/solver run …`・`pnpm --filter @swv/data run …` に寄せる（許可パターンでは `*` をクォートで逃がせないため、パッケージ名の列挙に統一する）。CLAUDE.md の Commands とワーカー向けの手順で `--filter './packages/*'` を案内している箇所も、パッケージ名の形に合わせるかどうかを同時に決める。

## 2026-10-03 機能番号を実装順に振り直したため、canon 管理下の「機能 003 で e2e を足す」が solver-ui を指さなくなった（機能分解・区間外）
- 種別: 矛盾是正
- 何が起きたか: `/tsod-discover` で `specs/feature-map.md` を作り、機能 ID を実装順に振り直した（solver-ui は 003 → 004、discord-login は 004 → 009、charm-save は 005 → 010）。非管理側（`README.md`・`design/*`・`contracts/README.md`・`ci.yml`・`main.css`）は同じブランチで新番号に直した。管理側の `CLAUDE.md`「e2e の追加」節の「機能 003 で e2e を足すときは」と、`.claude/skills/tsod-ship/SKILL.md` の「画面を持つ最初の機能（機能 003）で e2e を CI に足すとき」は旧番号のまま残っていたため、オーナーの指示で配置先の両箇所を直接「機能 004」に直した（`docs/canon-feature-number` ブランチ）。canon のリポジトリ（`claude-code-canon`）を grep しても両箇所の文言は見つからず、生成元のどこに対応するかは特定できていない。
- 提案: canon の生成元で両箇所に当たる箇所を特定し、機能番号を「004」に直す（直さないと、次の配置で配置先の修正が「機能 003」に戻る）。番号の振り直しで再び食い違わないよう、番号ではなく「画面を持つ最初の機能（`specs/feature-map.md` 参照）」と書く形にするかも同時に決める。

## 2026-10-03 `components/common/` を先に作ったため、canon 管理下の「予約の場所」の記述が実態とずれた（フォルダ構成の適用・区間外）
- 種別: 矛盾是正
- 何が起きたか: 機能 001 の前に、apps/api のレイヤー別パッケージ・apps/web の `components/common/`・`constants/`・`types/`・`stores/`・各 `src/docs/` を、置き場の規約を書いた `README.md` 付きで作った（`chore/folder-structure` ブランチ）。`.claude/skills/impact-scope/conventions.md`「共有部品の扱い」節は `apps/web/src/main/components/common/` を「予約の場所で、最初の共通部品を足す機能で作られる」と書いており、フォルダが既にある実態と合わない。
- 提案: canon の生成元で同節の `components/common/` の行から「予約の場所で、最初の共通部品を足す機能で作られる」を外し、「置き場の規約は同フォルダの `README.md`」に置き換える。あわせて、各フォルダの `README.md` を置き場の規約の正として参照するかを決める。

## 2026-10-04 常時許可外の変更の中に、委譲の前には書けないものがある（機能001・区間C）
- 種別: 矛盾是正
- 何が起きたか: `tsod-build/SKILL.md`「委譲」1 は、C-1 で承認された常時許可外の変更を「ワーカーへの委譲の前に」メインが書くとしている。001 では `design/tech-stack.md`（測定結果の記録）は solver-test-agent の測定ハーネスができるまで書けず、`packages/solver/vitest.config.ts` の `passWithNoTests` の削除は、テストが無いうちに行うと solver-agent の検証（`test:unit`）が0件で落ちる。`specs/001-solver-spike/plan.md` 決定事項 14 で、この2つだけ委譲の後に書くと決めた。
- 提案: `tsod-build/SKILL.md`「委譲」1 と `tsod-plan/SKILL.md`「常時許可外の変更」の説明に、「後続の成果に依存する変更は、plan の決定事項に書く時期を明記し、その時期に `[main]` のタスクとして書く」を足す。

## 2026-10-04 solver のテスト配置規約が、補助部品・測定ハーネス・main と対応しないテストを許していない（機能001・区間 D）
- 種別: 矛盾是正
- 何が起きたか: `.claude/skills/impact-scope/conventions.md`「テスト配置・命名規約」は `src/test/<main と同じ相対パス>/<名前>.spec.ts` だけを定めている。001 では、合成データ生成器と検算の補助（`packages/solver/src/test/support/`）、時間の測定ハーネス（`*.measure.ts`。plan 決定事項 8 で通常のテストから分離）、main のファイルに対応しないテスト（`support/syntheticData.spec.ts`・`ciTiming.spec.ts`）が必要になり、規約の外に置いた。reviewer-agent がこの点を要修正として挙げた。
- 提案: `conventions.md`「テスト配置・命名規約」と `.claude/rules/solver.md` に、solver の例外として「テスト用の補助は `src/test/support/`」「測定は `src/test/**/*.measure.ts`（`--mode measure` のときだけ実行。CI では実行しない）」「補助のテストは `src/test/support/` に置いてよい」「main に対応しないテストは `src/test/` 直下に置いてよい」を足す。

## 2026-10-04 packages の tsconfig が `types: []` のため、テストと測定の型検査を分ける必要がある（機能001・区間 D）
- 種別: 規律昇華
- 何が起きたか: `packages/solver/tsconfig.json`（`lib: ["ES2024"]`・`types: []`）のままでは、テストと測定ハーネスが使う `performance`・`console` が型エラーになる。001 で `tsconfig.json` の `include` を `src/main/**` に絞り、`tsconfig.vitest.json`（`types: ["node"]`）で `src/test/**` も検査する形に分け、`type-check` で2本を実行した。verify・Sonar（`sonar.typescript.tsconfigPaths` に追加）とも通った（一括検証 PASS・Sonar issue 0）。
- 提案: `.claude/rules/solver.md`（と、同じ `types: []` の `packages/data` を扱う `.claude/rules/data.md`）に「`src/main` は `types: []` の `tsconfig.json` で、テストと測定は `tsconfig.vitest.json`（`types: ["node"]`）で型検査する。`sonar-project.properties` の `sonar.typescript.tsconfigPaths` にも後者を足す」を加える。

## 2026-10-04 overlay の置き場が決まったので、data-agent の書込許可に足す（機能002・区間A）
- 種別: 矛盾是正
- 何が起きたか: `.claude/skills/impact-scope/SKILL.md`「書込許可フォルダ」は、overlay の置き場が機能 002 で決まったら担当フォルダを足すとしている。002 の決定（`specs/002-master-data-pipeline/decisions.md` Q10）で、overlay を `packages/data/overlays/*.yaml`、パイプラインのコードを `packages/data/src/main/` に置くと決めた。反映までは overlay を spec の「常時許可外の変更予定」に挙げ、メインが書く。
- 提案: `.claude/skills/impact-scope/write-scopes.json` の `data-agent` に `packages/data/overlays/**` を足し、同 `SKILL.md` の表と「`packages/data/{scripts,overlays}/` も現時点では含めない」の箇所を直す。`.claude/rules/data.md` の「overlay とパイプラインの置き場は、パイプラインを導入する機能で決まる」を、決まった置き場に書き換える。
