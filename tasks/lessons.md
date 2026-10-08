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

## 2026-10-04 新設した design/master-data.md に .claude/rules の配線が無い（機能002・区間 E）
- 種別: 矛盾是正
- 何が起きたか: 002 のドリフト検査で、temp §7 を卒業させるために `design/master-data.md` を新設した。`design/` 直下の文書には `.claude/rules/**` のいずれかが「正」として参照する配線が要る（temp-graduation.md の不変条件）が、`.claude/` は canon の管理下のため drift PR では配線できない。
- 提案: `.claude/rules/data.md` に「マスターデータの情報源・ID 規則・overlay の書式・検証・出力の正は `design/master-data.md`」を足す。あわせて、同ファイルの「overlay とパイプラインの置き場は、パイプラインを導入する機能で決まる」を、決まった置き場（`packages/data/overlays/*.yaml`・`src/main/pipeline/`）に書き換える（上の「overlay の置き場が決まったので…」と同じ改修で行える）。

## 2026-10-06 API を持たない e2e でも、一括検証の e2e の段が docker と API を起動する（機能004・区間A）
- 種別: 矛盾是正
- 何が起きたか: 004 は e2e を、ビルドした web だけで API・DB なしで動かすと決めた（`specs/004-solver-ui/decisions.md` Q24）。`.claude/skills/tsod-verify/scripts/verify.mjs` の e2e の段は、`docker compose up` と API の起動・待ち受けを必ず前置きするため、API を持たない機能の e2e にも不要な前提（docker と java）が付く。`CLAUDE.md` の Commands 表には e2e の行が無い（同「e2e の追加」節が、行の追加を canon への改修要求で行うと定めている）。
- 提案: `verify.mjs` の e2e の段で、docker と API の起動を、e2e が API を要るときだけ行うようにする（例: Playwright の設定や script で API の要否を宣言する）。`CLAUDE.md` の Commands 表に e2e の行（`pnpm --filter @swv/web run test:e2e`）を足し、`ci.yml` の e2e ジョブ（004 で追加）と一致させる。

## 2026-10-07 web-vue.md の「アイコン（lucide）」節が、導入後の実態と合わない（機能004・区間 D）
- 種別: 矛盾是正
- 何が起きたか: 004 で shadcn-vue と `@lucide/vue` を導入したが、`.claude/rules/web-vue.md` の「アイコン（lucide）」節は「アイコンの依存はまだ導入していない」「`design/tech-stack.md` の『後の機能で導入するもの』の表のアイコンの行を見る」のままで、その行は表から本表へ移して消えた。
- 提案: 同節を「導入済み。CLI でコピーした部品の import は `@lucide/vue` になる（`lucide-vue-next` は deprecated）。版は `design/tech-stack.md` の Web の依存の表を見る」に書き換える。

## 2026-10-07 web の Sonar とビルド設定の落とし穴を web-vue.md に足す（機能004・区間 D）
- 種別: 規律昇華
- 何が起きたか: 004 で次が分かった。(1) `role="group"`・`role="status"` は Sonar の S6819 に当たるので `<fieldset>`・`<output>` で書く。(2) Reka UI の `SelectTrigger` と shadcn-vue の汎用 `Input`・`Label` は、ラベルを付けても `Web:InputWithoutLabelCheck`・`Web:S6853` が出る誤検知で、`sonar.issue.ignore.multicriteria` で抑止した（`ui/` は編集禁止）。(3) web から `packages/*` のソースを import するには、`tsconfig.app.json`・`tsconfig.vitest.json` の `include` に足す（TS6307。実際の import で通ることを確認）。(4) shadcn-vue の CLI は、`tsconfig.json` に `paths` が無いと失敗し、`components.json` の未知のキーも拒否する。(5) vitest 内でリポジトリのファイルを読むときは `import.meta.dirname` を使う（`new URL(..., import.meta.url)` は `/@fs/` になる）。(6) Playwright の `getByRole('heading', { name })` は部分一致なので、連番の見出しには `exact: true`。
- 提案: `.claude/rules/web-vue.md`（Sonar 節と、構成・テストの節）に上の6点を足す。

## 2026-10-08 デザインシステムの唯一の正を design-system/skillweave/MASTER.md に統合したが、canon 側の参照先が design/ui-design-standard.md のまま（デザインシステム一新・区間外）
- 種別: 矛盾是正
- 何が起きたか: デザインシステムを「鍛冶場の鉄」に一新し、ui-ux-pro-max の標準（Master + Overrides）に合わせて `design/ui-design-standard.md` の全節（色・フォント・サイズ・レイアウト・密度・フォーム・状態・文言・a11y）を `design-system/skillweave/MASTER.md` に統合した（`docs/design-system-refresh` ブランチ）。`ui-design-standard.md` は旧節と MASTER.md の見出しの対応表だけを持つ転送用のファイルにした。canon 管理下の `.claude/rules/ui-design.md`・`agents/reviewer-agent`・`agents/screen-design-agent`・`agents/web-agent`・`skills/tsod-screen-table/SKILL.md`・`skills/tsod-ship/references/temp-graduation.md`・`skills/impact-scope/scripts/agent-write-guard.test.mjs` は `design/ui-design-standard.md` を直接参照しており、MASTER.md と `pages/` を読まない。構成を変えたとき、旧 § 番号の参照（`main.css` のコメントなど）がまとめて壊れた。
- 提案: canon の生成元で、上記の参照先を `design-system/skillweave/MASTER.md` に改める。canon 側は値や規約を書き写さず参照だけを持つ（正の場所・`pages/<page>.md` があれば MASTER.md より優先するという解決順・各エージェントが突き合わせる見出し。例: reviewer-agent は文字サイズのクラスを「Typography の Type Scale」、色の直書きを「Color Palette」と突合する）。参照は § 番号ではなく見出し名で書く。`.claude/rules/ui-design.md` の `paths` に `design-system/**` を加える。再配置で参照先の切り替わりを確かめたら、`design/ui-design-standard.md` を削除する。
