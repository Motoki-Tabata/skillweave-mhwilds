# 書込ガードの内部仕様（必要時に開く補助資料）

`impact-scope/SKILL.md` から分離した、ワーカーの日常の行動には効かない内部仕様。ガードの配線・判定順序・出力形式、強度、回帰テストと実発火の確認、既知の限界を収める。SKILL.md の「書込許可フォルダ」表と `write-scopes.json` が許可の正であり、本ファイルはそれを変えない。メインの書込区分と直接修正の基準は `.claude/skills/tsod-workflow/references/direct-edit.md`。

## ガードの仕組み

### 配線

書込を持つ12役割（`contract-agent`・`api-agent`・`web-agent`・`solver-agent`・`data-agent`・`api-test-agent`・`web-test-agent`・`solver-test-agent`・`data-test-agent`・`e2e-agent`・`data-model-agent`・`test-investigator`）の frontmatter に、`PreToolUse`（matcher `Write|Edit|NotebookEdit|Bash`）と `PostToolUse`（matcher `Bash`）を置く。どちらも [scripts/agent-write-guard.mjs](./scripts/agent-write-guard.mjs) を自分のロール名を引数にして呼ぶ。スクリプトは stdin の `hook_event_name` でイベントを判別する（無ければ PreToolUse として扱う）。`test-investigator` の許可は空配列で、リポジトリ内には Write も Bash も書けない（一時ディレクトリだけ可）。

### Write/Edit/NotebookEdit の判定順序

fail-closed。どこかで例外が出たら deny。

1. stdin の JSON を読む。読めない → deny。
2. 引数のロール名が [write-scopes.json](./write-scopes.json) の `roles` にある。無い・JSON が読めない → deny。
3. `tool_name` が `Write`・`Edit`・`NotebookEdit`・`Bash` 以外 → allow（何も出力せず終了コード0）。
4. 対象パス = `tool_input.file_path`（`NotebookEdit` は `tool_input.notebook_path` も見る）。無い → deny。
5. リポジトリ root = 環境変数 `CLAUDE_PROJECT_DIR`、無ければ stdin の `cwd`。どちらも無い → deny。
6. 対象パスを root 基準で絶対化し、`..`・`.` を解決する。そのうえで、実在する最も深い祖先ディレクトリを realpath で解決する（シンボリックリンクによる領域外への脱出を防ぐ）。root からの相対パスを `/` 区切りで得る。
7. root の外（相対パスが `..` で始まる、または別ドライブ）→ OS の一時ディレクトリ（`os.tmpdir()` を realpath したもの）の配下なら allow、それ以外は deny。
8. ロールの許可 glob のいずれかに一致 → allow。一致しなければ deny。glob は `**`＝0個以上のディレクトリ、`*`＝`/` を含まない任意文字列、それ以外はリテラル。Windows（`process.platform === 'win32'`）では大文字小文字を区別しない。

### Bash の事前判定（PreToolUse）

`tool_input.command` を [scripts/bash-write.mjs](./scripts/bash-write.mjs) で解析する。`command` が文字列でなければ deny（fail-closed）。判定の順序は次のとおり。

1. 書込先を静的に特定できない書込構文が1件でもあれば deny（理由文で Write/Edit を使うよう指示する）。
2. 禁止コマンド（SKILL.md の「禁止コマンド（全ロール共通）」）が1件でもあれば deny。
3. 明示の書込先パスそれぞれを、Write/Edit と同じ手順5〜8で判定する。相対パスは stdin の `cwd` と、コマンド内の静的な `cd` を基準にする。1つでも許可フォルダ外なら deny。
4. 暗黙の書込先（ディレクトリ接頭辞）は、コマンドごとに、すべてがロールの許可フォルダとまったく重ならないときだけ deny する。一部でも重なれば通す。

すべて通れば allow する。コマンド別の暗黙の書込先の正は `bash-write.mjs` の `COMMAND_RULES` である。判定は「出現」でなく「宛先」で行う。heredoc の本文やクォート文字列の中に担当外のパス文字列が出てきても、それは書込先ではない。`xargs`・`find -exec` の後ろが `sh -c`／`bash -c` のときは、`-c` の文字列を同じ解析にかけ、書込が無ければ解析不能にしない。変数・コマンド置換を含むのが読み取りコマンドの引数だけなら、deny しない。

pnpm workspace のスクリプトの暗黙の書込先は、対象パッケージで決まる。`pnpm format`（リポジトリ直下・`-r`）は `apps/web/src/`・`packages/solver/src/`・`packages/data/src/`、`pnpm --filter <selector> run format` は selector が指すパッケージの `src/`（`@swv/web`→`apps/web`、`@swv/solver`→`packages/solver`、`@swv/data`→`packages/data`、`./packages/*`→solver と data の両方。解決できない selector は全パッケージとみなす）。`pnpm lint`・`lint:oxlint`・`lint:eslint` は同じ対応でパッケージ全体を指す。

| 区分 | 例 | 事前判定（PreToolUse） | 事後照合（PostToolUse） |
|---|---|---|---|
| 書込先を静的に特定できる書込 | `cat > f <<'EOF'`、`echo x >> f`、`tee f`、`sed -i … f`、`cp a f`、`mv a f`、`rm f`、`touch f`、`mkdir d`、`git mv a b`、`git restore f`、`prettier --write f`、`eslint --fix f`、`./gradlew spotlessApply -PspotlessIdeHook=f` | 書込先が**すべて**ロールの許可 glob に一致すれば allow。1つでも外れれば deny。OS の一時ディレクトリ配下と `/dev/null` 等の特殊ファイルは allow | 実施 |
| コマンド固有の暗黙の書込先を持つ既知コマンド | `pnpm format`（→ 各パッケージの `src/`）、`pnpm lint`（→ 各パッケージ）、`pnpm contract:types`（→ `apps/web/src/main/lib/api/schema.ts`）、`./gradlew spotlessApply`（→ `apps/api/src/`）、`pnpm add`／`install`（→ リポジトリ直下の `package.json`・`pnpm-lock.yaml`・`pnpm-workspace.yaml` と各パッケージの `package.json`） | 暗黙の書込先がロールの許可フォルダと**まったく重ならなければ deny**。全体が許可フォルダに含まれれば allow。一部だけ重なる場合は allow し、実際の変化を事後照合に委ねる | 実施 |
| 書込先を静的に特定できない書込構文 | `python3 -c "open(…,'w')"`、`node -e "fs.writeFileSync(…)"`、`python3 - <<EOF`（書込 API を含む）、書込先に `$VAR`／`$(…)`／バッククォートを含むリダイレクト、`xargs rm`、`find … -delete`、`eval` | **deny**（fail-closed）。理由文で「Write/Edit を使う」よう指示する | — |
| 禁止コマンド（全ロール共通） | `git stash`（`list`・`show` を除く）、作業ツリー全体を書き換える git 操作（`checkout <ブランチ>`・`switch`・`reset`・`clean`・`merge`・`rebase`・`pull`・`cherry-pick`・`revert`・`am`・`apply`）、`git push`、`git commit`・`git add`・`git tag`（全体禁止）、`git branch`（作成・削除・改名・複製・上流設定。一覧・`--list`・`--show-current` を除く）・`git remote`（`-v`・`show`・`get-url` を除く）・`git config`（`--get`・`--list`・`-l` を除く）、`gh pr merge`（`gh` の他のサブコマンドは対象外） | **deny** | — |
| 書込を含まないコマンド | 検証（`./gradlew build`・`pnpm test:unit`・`pnpm test:coverage`・`node …/verify.mjs`）、読取り（`git diff`・`grep`・`ls`・`xargs grep`）、任意スクリプトの実行（`node x.mjs`・`bash x.sh`） | allow（ビルド出力は gitignore 済みで判定対象外） | 実施（任意スクリプトの書込はここで捕まる） |

### Bash の事後照合（PostToolUse）

PreToolUse で allow したとき、`git status --porcelain` の対象パスと内容ハッシュのスナップショットを OS の一時ディレクトリへ保存する。PostToolUse で取り直して比べ、変化したパスのうち許可フォルダ外のものがあれば `decision: "block"` と理由文を返す（元に戻す処理はしない。他のワーカーの作業を壊しうるため）。スナップショットが見つからない・git が使えないときは、黙って通さず「照合できなかった」旨を `additionalContext` で返す。

block または照合不能の通知を受けたワーカーの振る舞いは、SKILL.md の「停止規律」が正。

### 出力形式

- allow（事前）は何も出力しない（`permissionDecision: "allow"` を返すと通常の権限確認をバイパスするため、返さない）。
- deny は `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"<理由>"}}`。
- 事後の通知は `{"decision":"block","reason":"…","hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"…"}}`。照合できなかったときは `hookSpecificOutput` だけを返す。

## 強度

| 対象 | 強度 | 担保 |
|---|---|---|
| ワーカーの Write/Edit/NotebookEdit | **deterministic**（PreToolUse・fail-closed） | 回帰テスト、配置後のカナリア |
| ワーカーの Bash（書込先を静的に特定できる書込・暗黙の書込先が重ならない既知コマンド・禁止コマンド・特定できない書込構文） | **deterministic**（PreToolUse で事前 deny・fail-closed） | 回帰テスト（Bash の4分類）、配置後の Bash カナリア |
| ワーカーの Bash（事前判定を通った実行が担当外を実際に変えた場合。任意スクリプト・暗黙の書込先が一部だけ重なるフォーマッタ等） | 検出は **deterministic**（PostToolUse の git 差分照合）。停止は advisory（通知を受けたワーカーが止まって報告する） | ワーカー定義の停止規律、完了報告の「担当外の変化」欄、reviewer-agent の差分分類、ゲート D-1 の `git diff` 確認 |
| バックグラウンド実行の Bash（`run_in_background`） | 事前判定のみ deterministic。事後照合は実行完了を待てないため効かない | reviewer-agent の差分分類、ゲート D-1 |
| メインの書込 | advisory | handoff の「メインの直接修正」表（強制記入欄）、reviewer-agent の差分分類、ゲート D-1 |
| native の `subagent_type` 以外での起動 | 無効（agent 定義の hooks・tools が載らない） | `tsod-build`・`tsod-screen-table` は native の `subagent_type` でのみ起動する |

`enforced`（settings.json の `permissions`）と OS-level は採らない。permissions はワーカー単位で分けられない。sandbox はユーザーが無効化する運用のため、前提にできない。

**advisory である旨の注記**: 役割の識別は、hook の所属先とロール名引数で行う。機構的に強制されるのは対象パスと許可表の突合（事前）と git 差分の検出（事後）であり、事後に検出した変化を止める・報告するのはワーカーの規律（advisory）である。

並行委譲では、別のワーカーの書込が事後照合に「担当外の変化」として現れうる（誤検出）。`tsod-build` の並列化の条件で機会を減らし、ワーカーには「自分のコマンドの結果か判断できないときも、書き戻さずに完了報告へ列挙する」と定めている。

## 回帰テストと実発火の確認

回帰テストはリポジトリ root で次を実行する。故意の違反を注入して deny されること、読み取りだけのコマンドが allow されることを、役割ごとに検査する（検出0件を「検出できる」と扱わない）。

```
node --test .claude/skills/impact-scope/scripts/agent-write-guard.test.mjs
```

「ロジックが正しい」と「hook が発火する」は別の検証である。実発火は、次の3種を、対象の役割を native の `subagent_type` で起動して確かめる。

1. **Write の deny**: `api-test-agent` に `apps/api/src/main/java/__guard_canary.txt` への Write を指示して deny されることを確かめる。同じ `api-test-agent` に `apps/api/src/test/java/__guard_canary.txt` への Write を指示して通ることを確かめる。作ったファイルはメインが削除する。
2. **Bash の事前 deny**: `api-test-agent` に `echo x > apps/api/src/main/java/__guard_canary.txt` を指示して deny を確かめる。
3. **Bash の事後検出**: メインが OS の一時ディレクトリに「`apps/api/src/main/java/__guard_canary2.txt` を作るシェルスクリプト」を置き、`api-test-agent` にそのスクリプトを `sh <パス>` で実行させる。事前判定は通り、事後照合で block の通知が出ることを確かめる。作られたファイルはメインが削除する。

Write を持つ11役割（`test-investigator` 以外）で (1) を最低1回、Bash を持つ11役割（`data-model-agent` 以外）で (2) を最低1回確かめる。`test-investigator` は Write を持たないので (1) の対象外で、Bash 経由の (2) を、リポジトリ内のパスへの書込で確かめる。

## 既知の限界

- 禁止コマンドの判定は、`git`・`gh` の語とサブコマンドの字面で行う。`git config` の読取りは `--get`・`--list`・`-l`（と `get`・`list` サブコマンド）だけ許し、キーだけを渡す暗黙の取得（`git config user.name`）も禁止側に倒す。`git tag` は一覧も禁止する。別名（`git` の alias）・スクリプト経由の実行は字面で判定できず、事後照合に委ねる。コミット・ブランチ・リモート設定の操作と PR のマージはメインの担当で、ワーカーは作業ツリーの変更だけを行う。
- シェルの静的解析は近似である。事前判定を通った任意スクリプト・一部だけ重なるフォーマッタの実際の変化は事後照合で検出するが、止めるのはワーカーの規律である。
- バックグラウンド実行の Bash は事後照合できない。
- 並行委譲では、他のワーカーの書込が事後照合に現れうる。
- native 以外の起動（`general-purpose` での代替起動）では agent 定義の hooks が載らず、ガードが無効になる。
- メインの書込はガード対象外。
