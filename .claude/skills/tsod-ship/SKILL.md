---
name: tsod-ship
description: 区間 E。handoff でゲート D-1 の承認を確かめてから、PR 作成・CI 完了待ち・CI 失敗の是正・承認後のマージ（手動マージ済みの分岐を含む）・ドリフト検査と drift PR のマージ・ブランチ掃除を進め、handoff を完了にする区間コマンド。ユーザーが「/tsod-ship NNN」と打ったときだけ起動する。
disable-model-invocation: true
argument-hint: "<NNN または NNN-slug>"
effort: medium
---

# 区間 E: 出荷（PR・CI・マージ・ドリフト検査）

共通動作は `.claude/skills/tsod-workflow/SKILL.md`「区間コマンドの共通動作」に従う。推奨モデルは Sonnet（定型の進行と判定が主なため）。定型の操作は `.claude/skills/tsod-ship/scripts/` のスクリプトで行い、メインが判断するのはドリフトの判定と卒業記録の文面だけにする。区間 E は組込み Skill に依存しない（[builtin-skills.md](../tsod-workflow/references/builtin-skills.md)）。

## 開始条件

`node .claude/skills/tsod-workflow/scripts/handoff.mjs check NNN D-1` を常に実行する。

- exit 0 なら、確認の問いを挟まずに PR 作成へ進む。
- exit 0 以外のとき、出力の NG の理由がすべて「ハッシュ … の後に成果物が変わった」であり、かつ OPEN か MERGED の PR が有るときは、NG の一覧を提示して続行する（CI 失敗の是正や手動マージの後の再起動で、D-1 の承認の後に成果物が変わりうるため。D-1 の後の是正の変更は、ゲート E-1 の問いで人間に見せる）。PR は `gh pr list --head feat/NNN-<slug> --state all --json number,state` で探し、OPEN と MERGED だけを数える（CLOSED は無いものとして扱う。OPEN を優先する）。`gh pr list` が失敗したら停止する。続行するときは、次の「手動マージ済みの分岐」で、見つけた PR の状態を確かめる。
- 理由が1つでも「未承認」「記録のハッシュが git に実在しない」「HEAD の履歴に無い」など上の形以外である、または該当する PR が無いときは、出力を示して停止し、`/tsod-build NNN` を案内する。

過去の機能の spec.md・decisions.md・handoff.md や `design/` 配下の大きな文書は、[reading-discipline.md](../tsod-workflow/references/reading-discipline.md) に従い、範囲指定の無い cat で読まず、Grep で位置を決めてから節を読む。

handoff の更新（ゲート E-1・E-2 の記録・現在地・区間の終わり・そのほか）は `handoff.mjs` のサブコマンドだけで行い、Edit・sed・python・node -e で書き換えない。

## 手動マージ済みの分岐

開始条件で見つけた PR（複数あれば OPEN を優先）の状態を、`gh pr view <番号> --json state,mergeCommit` で確かめる。`MERGED` なら、PR 作成・CI 待ち・マージを飛ばし、`handoff.mjs gate NNN E-1 "手動マージ PR #<番号>"` でゲート E-1 を記録して、ドリフト検査へ進む（記録は drift ブランチで行う）。`MERGED` でなければ、CI 待ち以降を続ける。

## PR 本文

PR 本文は `.github/pull_request_template.md` を使う（記入欄の定義は、このテンプレートの1か所だけ）。

```
node .claude/skills/tsod-ship/scripts/pr-body.mjs NNN
```

スクリプトが、テンプレートの見出しに沿って本文を一時ファイルに作り、パスを返す。メインはそのファイルを確かめ、空欄があれば埋める。handoff の「PR 本文に必須の記載事項」と「メインの直接修正」の表が、本文に入っていることを確かめる。

## PR 作成

```
bash .claude/skills/tsod-ship/scripts/pr-open.sh <本文ファイル>
```

push と `gh pr create --base main` を行い、PR 番号を出力する。PR 番号は `handoff.mjs gate NNN E-1 "PR #<番号>"` でゲート E-1 の記録に残す（記録は drift ブランチで行う）。

## CI 待ち（CI 完了待ちの唯一の正）

```
bash .claude/skills/tsod-ship/scripts/ci-wait.sh <PR 番号>
```

`run_in_background` で起動し、完了通知を待つ（[待ち方](../tsod-workflow/references/waiting.md)）。判定は `gh pr checks` の終了コードで行う。外部コマンド（`jq` 等）の有無に判定を依存させないため。出力はファイルにリダイレクトされ、文脈には要約行とログのパスだけが出る。`no checks reported` の取り直しと、ワークフローが起動していないときの扱い（exit 3。緑とみなさない）はスクリプトが持つ。本体の PR と drift PR の両方に同じ手順を使う。CI のジョブは `secret-scan`・`api`・`web`・`packages`・`e2e`。

テストの失敗・flake なら、担当ワーカーに直させる前に test-investigator を新規起動して切り分ける（手順の正は [tsod-build の triage.md](../tsod-build/references/triage.md)）。

失敗したら、ログファイルの末尾だけを読み、`node .claude/skills/tsod-verify/scripts/verify.mjs --only <領域>`（`api`・`web`・`packages`）で手元で再現する。直接修正の基準（[direct-edit.md](../tsod-workflow/references/direct-edit.md)）を超えるものは、担当ワーカーを新規起動して直させる（差分と修正指示だけを渡す）。直したら `bash .claude/skills/tsod-ship/scripts/pr-open.sh --push-only` で push して待ち直す。

## ゲート E-1: マージ

CI が緑なら AskUserQuestion を1回取る。承認されたら次を実行する（merge commit・`--delete-branch`・main へ切り替えて pull）。承認されなければ停止する。

```
bash .claude/skills/tsod-ship/scripts/pr-merge.sh <PR 番号>   # パイプで繋がず単独で実行する
```

`pr-merge.sh` は、`| tail` などのパイプで繋がず単独で実行し、exit code を見て成否を判定する（パイプで繋ぐと、スクリプトの失敗が隠れて結果を見落とす）。drift PR のマージも同じ。

## ドリフト検査

マージ後に実行する。**乖離が見つかったら、是正の対象は `spec.md`・`plan.md`・`specs/feature-map.md`・`README.md`・`design/` である。コードを事後正当化しない。** 仕様が真実の源であるなら、コードと整合し続けなければならず、この検査を省くと仕様が実態と離れていくため。順序は、乖離の判定→E-2 で是正の案を示して承認を得る→書く。承認の前には、是正の対象を書かない。

1. `docs/NNN-<slug>-drift` ブランチを作る（`feat/NNN-<slug>` 上にいる場合は切り替える）。
2. 機械で検出できる項目を出す。

   ```
   node .claude/skills/tsod-ship/scripts/drift-scan.mjs NNN
   ```

   チェックリストをファイルに書き、件数の要約を返す。突き合わせるのは、`CLAUDE.md` の「Commands」節・`.github/workflows/ci.yml` の run 行・`verify.mjs` の実行計画の3者で、README は読まない。
3. メインは [drift-checklist.md](./references/drift-checklist.md) の観点で、乖離を判定し、是正の案を作る（この時点では書かない。書くのは E-2 の承認の後）。
4. `temp/` の卒業は [temp-graduation.md](./references/temp-graduation.md) に従い、卒業記録の文面を書く。

マージ済み PR・CI 結果の確認は `gh pr view`・`gh run view` で行う。

## ゲート E-2: ドリフト是正と drift PR のマージ

是正の案（対象のファイルと直す内容）を提示し、AskUserQuestion を1回だけ取る:「この是正で drift PR を作り、CI が緑ならマージしてブランチを掃除してよいか」。承認後は、再確認せずに次を進める。`README.md` の是正は、この承認を明示の指示とみなす（[direct-edit.md](../tsod-workflow/references/direct-edit.md)）。

1. 承認された是正を書き、成果物としてコミットする（handoff.md はまだ変えない）。
2. 是正内容の要約を一時ファイルに書き（drift PR の本文）、`bash .claude/skills/tsod-ship/scripts/pr-open.sh <本文ファイル>` で drift PR を作る。
3. ゲート E-2 の記録と現在地の完了を1回で行う。`node .claude/skills/tsod-workflow/scripts/handoff.mjs finish NNN E-2 "drift PR #<番号>" --move E→完了`。handoff.md の変更だけを1回コミットし、push する（`--push-only`）。順は「成果物のコミット→finish→handoff.md のコミット1回」。記録済みのゲートには `--overwrite` が無いと exit 1 になる。
4. `bash .claude/skills/tsod-ship/scripts/ci-wait.sh <drift PR 番号>`（`run_in_background`）。失敗したら、上の CI 失敗の是正と同じ手順で直す。
5. 緑になったら `bash .claude/skills/tsod-ship/scripts/pr-merge.sh <drift PR 番号>`。
6. `bash .claude/skills/tsod-ship/scripts/prune-gone-branches.sh` でローカルブランチを掃除する（個別の git コマンドで消さない）。

是正が無いときは、drift PR を作らずに、`handoff.mjs finish NNN E-2 --na "是正なし" --move E→完了` でゲート E-2 の記録と「現在地」の完了を1回で行う。ここだけは main へのコミットが要るので、ユーザーに提示して判断を仰ぐ（main への直接 push は pre-push が拒否する。仕組みは `README.md` の「main への直接 push を防ぐ」節）。

## 書込の担当

push・PR 作成・マージ・ブランチ削除は、メインだけが行い、ワーカーに委ねない。これらのスクリプト（`pr-open.sh`・`pr-merge.sh`・`prune-gone-branches.sh`）は `.claude/settings.json` の許可リストに入れない。実行のたびに、ユーザーの承認を経るため。書込（push・PR 作成・マージ・コメント）と CI 完了待ちは `gh` CLI に一本化する。MCP は使わない。

## メインの直接修正・待ち方

- 直接修正の基準: [direct-edit.md](../tsod-workflow/references/direct-edit.md)
- 待ち方: [waiting.md](../tsod-workflow/references/waiting.md)

## 終わりに

handoff に残った「未起票の教訓」「要確認事項」を処理する（起票するか、次の機能へ持ち越す旨を書く）。処理（持ち越す旨の記録は `handoff.mjs note NNN <節> <文>`）したら完了を報告する。

## 区間の終わり（次のコマンドと推奨モデル）

この機能は完了。次の機能は `/tsod-spec NNN`（推奨モデル: Opus。新しいセッションで `/model opus` にしてから起動する）と案内して停止する。
