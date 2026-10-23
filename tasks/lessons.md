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
- 提案: `.claude/skills/tsod-plan/SKILL.md`「plan.md」節の「常時許可外の変更」の箇条に、「1行のバッククォートはパスの1つだけにし、説明の中の識別子・パスには付けない」を足す。あわせて `spec-check.mjs` の `comparePlan` が、1行1パスでない plan の行を「判定不能」として表に出すように直す。
