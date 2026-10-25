# 教訓台帳

`.claude/**`・`CLAUDE.md` への改修要求と作業の教訓を、その場で起票する唯一の台帳です。
書式と行き先の正は `.claude/skills/tsod-workflow/references/lessons-guide.md` です。
項目を直したコミットの中で、直した人が台帳から消します。


## 2026-10-23 /design はユーザーが起動した後、同じセッションのメインがキャンバスを作る（機能005・区間B）
- 種別: 矛盾是正
- 何が起きたか: `tsod-screen-table/SKILL.md` の画面設計の手順3は「ユーザー自身が `/design` を実行して、キャンバス URL と確定内容を返す」とする。実際は、ユーザーが入力欄で `/design <説明文>` を打つと、メインに Artifact の quickstart と Design タイプからの作成を指示する形で展開され、メインがアートボードを書いて URL を得た。説明文をメッセージに貼り付けただけでは起動しなかった（005 の screen-design.md・キャンバス MZbLw8W1YMAuthDWDwiUHD）。
- 提案: `.claude/skills/tsod-screen-table/SKILL.md`「画面設計」手順3〜4を、「ユーザーが入力欄で `/design` を打って起動する（貼り付けでは起動しない）。展開された指示に従い、メインが同じセッションでキャンバスを作り、URL を screen-design.md に記録する」に直す。builtin-skills.md の前提の列挙も合わせて確かめる。

## 2026-10-23 区間 B の途中で薄仕様を改訂するときの手順が無い（機能005・区間B）
- 種別: 規律昇華
- 何が起きたか: 画面設計の質問で、スキルを読みで検索する要件が出て、A-2 承認済みの spec.md の受入基準を変える必要が生じた。区間を戻す手順が無いため、同じセッションで spec.md・decisions.md（Q34）を直してコミットし（e215141）、AskUserQuestion で A-2 を取り直して `handoff.mjs gate 005 A-2 e215141` で上書きし、区間メモに残した。
- 提案: `.claude/skills/tsod-workflow/SKILL.md` に「後の区間で薄仕様の変更が要るとき」の節を足し、上の手順（spec-check の再実行・決定記録・A-2 の取り直し・区間メモ）を正にするか、`/tsod-spec` へ戻すかを決めて書く。

## 2026-10-23 plan の「常時許可外の変更」の行にパス以外のバッククォートがあると、突合から黙って漏れる（機能005・区間C）
- 種別: 規律昇華
- 何が起きたか: plan.md の `design/master-data.md` の行で、括弧の説明の中の語（`readings`・`reading`）にもバッククォートを付けた。`spec-check.mjs --compare-plan` は、バッククォートの中身を数えて「1行1パス」でない行を突合の対象から外すため、書式のエラーを出さずに「spec のみ」と判定した（238981d。6ee89f8 で直した）。`.claude/rules/ui-design.md` を理由に書いた `components/ui/` の行も、同じ理由で突合から漏れていた。
- 再発: 006 の区間 C でも、`design/master-data.md` の行の説明に `conditions`・`effects` のバッククォートを付けて「spec のみ」と判定された（b53ea9d。4280c0a で直した）。手順に書かれていない限り繰り返すので、優先して直す。
- 提案: `.claude/skills/tsod-plan/SKILL.md`「plan.md」節の「常時許可外の変更」の箇条に、「1行のバッククォートはパスの1つだけにし、説明の中の識別子・パスには付けない」を足す。あわせて `spec-check.mjs` の `comparePlan` が、1行1パスでない plan の行を「判定不能」として表に出すように直す。

## 2026-10-23 Select を使う新規 .vue があるのに、sonar-project.properties の抑止が plan の常時許可外に挙がらなかった（機能005・区間D）
- 種別: 規律昇華
- 何が起きたか: 004 の e3 と同じ `Web:InputWithoutLabelCheck`（Reka UI の SelectTrigger への誤検知）が、005 の `CharmSkillRow.vue`・`CharmForm.vue` に出た。plan と spec の常時許可外に `sonar-project.properties` が無く、区間 D の途中でユーザーに承認を取って e4・e5 を足した（0babc4d）。既知の事象は `.claude/rules/web-vue.md`「Sonar で繰り返し出たルールの避け方（web）」に載っている。
- 提案: `.claude/skills/tsod-plan/SKILL.md` の「常時許可外の変更」の節に、「Select／SelectTrigger を使う新規 .vue を含む機能は、`sonar-project.properties` の multicriteria 追記を常時許可外に挙げる」を足す。

## 2026-10-23 shadcn-vue の CLI が依存を足して node_modules を壊し、web-agent の paths 前提も落とし穴になった（機能005・区間D）
- 種別: 規律昇華
- 何が起きたか: `shadcn-vue@2.8.2 add` は、`tsconfig.json` に `paths` を一時的に足さないと失敗した。成功しても `package.json` に `cn` を足して `pnpm install` を走らせ、部品の import を `"cn"` にした。lockfile を戻した後も node_modules が lockfile と食い違い、data-agent の検証が `vitest` のリンク切れで一つも走らなかった（`pnpm install --frozen-lockfile` で復旧）。既存の `button` の上書き確認で止まるため、button を退避して復元した。
- 提案: `.claude/rules/web-vue.md`「ビルド設定とテストの落とし穴」に、CLI の実行手順（paths の一時追加・`cn` の依存を戻して import を `@/lib/utils` に直す・既存部品の退避・実行後の `pnpm install --frozen-lockfile` と `prettier --write`）を足す。`.claude/skills/tsod-build/SKILL.md` の「委譲」の前に、`pnpm install --frozen-lockfile` で依存を確かめる一行を足すことも検討する。

## 2026-10-23 受入基準の ID は spec の箇条書きの順で数える（機能005・区間D）
- 種別: 規律昇華
- 何が起きたか: 実装中にワーカーが付けた受入基準の ID が、spec の確定後の順とずれ、レビューで 8 つの spec ファイルのコメントが要修正になった。spec.md に ID が明記されていないため、数え方が人によって違う。
- 提案: `.claude/skills/tsod-spec/` で受入基準に ID（`AC-1` など）を書くか、`.claude/skills/tsod-build/references/delegation-template.md` に「受入基準の ID は spec の箇条書きの順（1 始まり）で数える。委譲の前にメインが番号付きの一覧を渡す」を足す。

## 2026-10-24 触る領域の web がテスト用フィクスチャの追従だけのときも、区間 B へ進む規則になっている（機能006・区間A）
- 種別: 規律昇華
- 何が起きたか: 006 は画面もテーブルも変えないが、`MasterBundle` に項目が増えるため `apps/web/src/test/support/fixtures.ts` の追従が要る。常時許可外に書くと spec-check が「web-agent の常時許可フォルダ内」として NG にするため、`触る領域:` に `web` を足した。`tsod-spec/SKILL.md`「区間の終わり」は `web` を含めば区間 B としているため、ユーザーの承認を取って B-1・B-2 を該当なしにし、A→C に進めた（specs/006-damage-model/spec.md「スコープ外」に注記）。
- 提案: `.claude/skills/tsod-spec/SKILL.md`「区間の終わり」の区間 B の条件を、「画面の変更がある（`apps/web/src/main/**` の画面・部品を変える）、または新しい永続化がある」に直し、テストの追従だけの `web` では区間 C へ進めるようにする。

## 2026-10-24 領域モードの Sonar（--sonar-area）が 0 件でも、全体解析で issue が出る（機能006・区間D）
- 種別: 規律昇華
- 何が起きたか: data-agent の `--sonar-area packages` は issue 0 件で完了と報告したが、最終検証の全体解析（`verify.mjs --e2e --sonar`）で `packages/data/src/main/pipeline/overlay.ts` の `typescript:S3776`（認知的複雑度 17）が 1 件出て Quality Gate が ERROR になり、data-agent を再起動して直した。
- 提案: `.claude/skills/tsod-build/SKILL.md`「検証の下限」の Sonar の完了条件に、「領域モードは変更したファイルの一部しか解析しないことがあり、0 件でも全体解析で出る。関数を分けたときは認知的複雑度 15 以下を自分で見積もる」を足す。

## 2026-10-24 plan・設計文書に書く具体例は、規則を機械的に当てはめた実データの値で書く（機能006・区間C・D）
- 種別: 規律昇華
- 何が起きたか: plan D1・D3 と `design/master-data.md` の発動条件 ID の例（`cd:challenger`・`cd:adrenaline_rush`）を、規則「スキルの en 名の snake_case」を当てはめずに書いた。実データでは挑戦者は `cd:agitator`、火事場力は `cd:heroics` で、data-agent の報告で食い違いが分かった。
- 提案: `.claude/skills/tsod-plan/SKILL.md` に、「ID の命名規則を決めるときは、実データの代表 2〜3 件に規則を当てはめた結果を例に書く」を足す。

## 2026-10-24 HiGHS の passLinearObjectives は blend_multi_objectives を false にしないと優先度が効かない（機能019・区間D）
- 種別: 規律昇華
- 何が起きたか: 試作（`a-both+e2`）は `blend_multi_objectives` を既定の true のまま測り、合計 19 秒・1件目 1.1 秒と見積もった。本実装は、優先度を効かせるために false にし、空き Lv の重みも補助の目的に足したところ、1件目 2.6 秒（余裕 0.4 秒）になった。補助の目的を足すと本体の `colCost` は最適化されず、006 の同点の順のテストが落ちた（solver-agent の報告。`specs/019-damage-solve-perf/plan.md` D11）。
- 提案: `.claude/rules/solver.md` に、「複数目的は `blend_multi_objectives` を false にし、辞書式にしたい目的はすべて `passLinearObjectives` の補助の目的として優先度つきで渡す。方式の試作は、本実装で確定する設定と目的の形で測り、同点の順のテストも通す」を足す。

## 2026-10-24 `*.measure.ts` を複数置くと、ファイルを指定しない `--mode measure` は全部走る（機能019・区間D）
- 種別: 規律昇華
- 何が起きたか: 試作の `damagePrototype.measure.ts` を足すと、`vitest run --mode measure -t "expectedDamage"` が `solveBuilds.measure.ts` と同時に走る。vitest の `-t` は、空白と `=` を含む名前（`k=3 解あり`）に合わせにくく、試作は環境変数（`PROTO_CONFIGS` など）で絞った。
- 提案: `.claude/rules/solver.md` に、「測定は `--mode measure` の末尾にファイルを指定して実行する。describe 名の語で分けるだけにしない。ケースを絞るときは環境変数で絞る」を足す。

## 2026-10-26 見出しの font-semibold（600）が MASTER.md のウェイト3種（400・500・700）と食い違う（機能007・区間D）
- 種別: 矛盾是正
- 何が起きたか: reviewer が、007 で足した `ActivationConditionsCard.vue` の h2 の `font-semibold` を MASTER.md「Typography」のウェイト3種と突合して指摘した。既存の全カード（`WeaponCard`・`CharmCard`・`RequiredSkillsCard`・`ConditionsCard`・`BuildCard` の h3 など）が同じ書き方で、007 の欠陥ではない。
- 提案: MASTER.md のウェイトに 600 を足すか、既存カードを `font-bold` に揃えるかを、次に UI の見出しを触る機能の区間 B で決める。

## 2026-10-26 conventions.md のテスト配置に e2e/measure/*.measure.ts と共有ケースの置き場が無い（機能007・区間D）
- 種別: 規律昇華
- 何が起きたか: 007 で測定のハーネス（`apps/web/e2e/measure/damage-ui.measure.ts`）と、004 の測定と共有する `apps/web/e2e/support/measureCases.ts` を足したが、`conventions.md`「テスト配置・命名規約」の E2E の項にこの置き場の定めが無い（004 から続く実態）。`.claude/**` なので区間の中では書けない。
- 提案: `.claude/rules/conventions.md` の E2E の項に、測定は `e2e/measure/*.measure.ts`（CI では実行しない）・測定どうしで共有するケースは `e2e/support/` に置き、測定のファイルどうしは import しない、を足す。

## 2026-10-26 Sonar の Web:S6819 は role="region" にも当たる（機能007・区間D）
- 種別: 規律昇華
- 何が起きたか: web-agent が説明の領域に `role="region"` を付けたところ `Web:S6819` に当たり、`<section aria-label>` に変えて解消した（暗黙の role が region になる）。screen-design.md 3.1 は `role="region"` と書いている。
- 提案: `.claude/rules/web-vue.md`「Sonar で繰り返し出たルールの避け方（web）」の `role="group"`・`role="status"` の項に、`role="region"` も `<section aria-label>` に代える旨を足す。
