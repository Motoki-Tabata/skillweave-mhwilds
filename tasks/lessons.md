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
