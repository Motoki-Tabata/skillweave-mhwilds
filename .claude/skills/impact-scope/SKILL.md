---
name: impact-scope
description: 「影響範囲」節（spec.md）の定義、ワーカーごとの書込許可フォルダ（正は write-scopes.json）、共有する構成ファイルの扱い、禁止コマンド、停止規律、完了報告の書式を持つ参照知識。contract-agent・api-agent・web-agent・solver-agent・data-agent・api-test-agent・web-test-agent・solver-test-agent・data-test-agent・e2e-agent・data-model-agent・reviewer-agent・test-investigator に preload される。「触る領域」の語彙、書込フォルダの外に出る変更の扱い、deny されたときの動き方を確かめたいときは、明示されなくても読む。書込ガードの仕組みと強度、テスト配置・共有部品の規約は補助資料に分けている。
user-invocable: false
effort: medium
---

# 影響範囲（Impact Scope）— 唯一の定義

本 Skill は、spec.md「影響範囲」節の定義と、ワーカーごとの書込許可フォルダの単一の正（SSoT）である。`tsod-spec`（節の生成）・`tsod-spec-check`（機械判定）・`agent-write-guard.mjs`（PreToolUse／PostToolUse hook の実装）・`bash-write.mjs`（Bash の解析）・preload 先の全役割は、すべて本定義に従う。

必要時に開く補助資料（preload では読み込まれない。ワーカーの日常の行動には不要）:

- [guard-internals.md](./guard-internals.md): ガードの仕組み・強度・回帰テストと実発火の確認・既知の限界。書込が deny された理由を調べるとき、ガードを改修するときに読む。
- [conventions.md](./conventions.md): 「テスト配置・命名規約」「共有部品の扱い」。テスト役・web-agent・reviewer-agent・`tsod-spec` が節名で参照する。テストや共有部品を新設する前に読む。

## 影響範囲節（spec.md）の定義

`spec.md` の `## 影響範囲` は次の書式で書く。

```markdown
## 影響範囲
触る領域: api, web, contracts
常時許可外の変更予定:
- `apps/api/build.gradle.kts`（<理由。例: testImplementation に xxx を追加>）
```

- `触る領域:` はカンマ区切りで、語彙は `api`・`web`・`solver`・`data`・`contracts`・`docker` の6語。3つ以下。
- `常時許可外の変更予定:` に書くのは、ワーカーの常設の書込フォルダの外に出る変更予定だけ（共有構成ファイル・メイン専有領域・担当フォルダをまたぐ修正）。該当が無ければ `常時許可外の変更予定: なし` と1行で書く。
- 1行1パス、glob 不可（バッククォート囲みのリテラルパスをちょうど1個）。
- 機械判定は `tsod-spec-check` のスクリプトが行う（語彙は `spec-check.mjs` の `AREA_VOCAB` と一致させる）。最終確定は `plan.md` とゲート C-1。
- 本節は書込ガードの判定には使わない（ガードは下記の許可表だけを見る）。

## 書込許可フォルダ

**常設の書込範囲**（唯一の正は [write-scopes.json](./write-scopes.json)。列挙に無いパスは deny）。下表は表示用であり、表を直すときは JSON を先に直す。一致は回帰テスト（`agent-write-guard.test.mjs`）が検出する。

| 役割 | 許可 glob | 備考 |
|---|---|---|
| contract-agent | `contracts/**` | |
| api-agent | `apps/api/src/main/java/**`・`apps/api/src/main/resources/application*.yml` | |
| web-agent | `apps/web/src/main/**` | `apps/web/src/main/lib/api/schema.ts` の再生成を含む |
| api-test-agent | `apps/api/src/test/**` | |
| web-test-agent | `apps/web/src/test/**` | |
| e2e-agent | `apps/web/e2e/**` | 予約の場所（e2e を導入する機能で作られる） |
| data-model-agent | `apps/api/src/main/resources/db/migration/**`・`design/data-model-standard.md`・`design/attributes.yaml` | migration は予約の場所（最初のマイグレーションを足す機能で作られる） |
| solver-agent | `packages/solver/src/main/**` | |
| solver-test-agent | `packages/solver/src/test/**` | |
| data-agent | `packages/data/src/main/**` | |
| data-test-agent | `packages/data/src/test/**` | |
| test-investigator | （空配列） | リポジトリ内は書けない。一時ディレクトリだけ |
| reviewer-agent・screen-design-agent | 表に載せない | `tools` が Read・Grep・Glob だけであることで担保 |

- ロール間で glob は重ならない。実装役はテストを書かず、テスト役は実装を書かない。
- `packages/data/dist/**` はどのロールにも含めない（生成物で手編集しない）。`packages/solver/bench/`・`packages/data/{scripts,overlays}/` も現時点では含めない。データパイプラインと overlay の置き場は機能 002 で決まり、そのときに canon への改修要求（`tasks/lessons.md`）として担当フォルダを足す。予約として先に入れないのは、置き場が未決のまま glob を固定すると、決まった置き場と食い違ったときに誤った許可が残るため。
- Bash での書込も、同じ許可フォルダで判定される。ファイルの作成・編集は Write/Edit を使う。Bash で書くのは、許可フォルダ内の静的パスへのリダイレクト・`sed -i`・ファイル指定のフォーマッタ等に限る。
- マイグレーションは data-model-agent だけが書く。区間 D で追加のマイグレーションが必要になったら、api-agent は書かずに停止して報告する。メインは、区間 B のテーブル設計へ戻るか、data-model-agent を新規起動する。

### 共有する構成ファイル（ビルド設定・依存定義・実行時設定）: 宣言駆動の例外にする（常設には含めない）

- 対象: `apps/api/build.gradle.kts`・`apps/api/settings.gradle.kts`・`apps/api/gradle/libs.versions.toml`・`apps/api/gradle/wrapper/**`、リポジトリ直下の `package.json`・`pnpm-workspace.yaml`・`pnpm-lock.yaml`、`apps/web` と `packages/*` の `package.json`・`tsconfig*.json`・`vite.config.ts`・`vitest.config.ts`・`eslint.config.ts`、`apps/web/components.json`、`docker/**`・`sonar-project.properties`・`.github/**`・`scripts/**`・リポジトリ直下の `README.md`。この列挙に無くても「ビルド・実行時設定」に当たるものは同じ扱い。
- 扱い: spec.md「影響範囲」の「常時許可外の変更予定」に書かれ、plan.md に列挙されてゲート C-1 で承認されたものだけを、メインがワーカーへの委譲より前に書く。plan に無く実装中に必要になったら、ワーカーは書かずに停止して報告し、メインがユーザーの承認を得てから書く。
- 常設に含めない理由: 常設にすると、要件が想定していない依存の追加や設定変更がワーカーの判断だけで通る。宣言駆動にすれば、ワーカーの「範囲外なら停止」がここで必ず発火し、メインが plan の承認範囲と照らして判断できる。
- メインも区間の中で書かず、人間の明示指示を要するもの: 列挙の正は [direct-edit.md](../tsod-workflow/references/direct-edit.md) の「常に人間の明示指示を要するもの」節。
- `specs/**`・`tasks/lessons.md`・handoff はメインだけが書く。`.claude/**`・`CLAUDE.md` は canon の管理下で誰も書かない（変更要求は `tasks/lessons.md` に起票）。

**強度と担保**

- ワーカー: deterministic。frontmatter の hooks は、そのワーカーの実行中だけ発火し、引数のロール名で許可表を引くので、役割別に判定できる。確実に止めるのは PreToolUse の deny（Write・Edit・NotebookEdit と Bash の書込先の解析）。PostToolUse（Bash 前後の git 差分の比較）はブロック不可のイベントで、解析をすり抜けた書込の事後検出（ワーカーへの通知）と位置づける。ワーカーは通知を受けたら書き戻さずに停止して報告する。
- メイン: advisory（ガード対象外）。代わりの担保は、`spec-check.mjs --compare-plan` の出力（ゲート C-1）、reviewer-agent の差分分類、ゲート D-1 での人間の `git diff` 確認、handoff の「メインの直接修正」表。
- 役割の識別と、事前・事後の強制と advisory の範囲は [guard-internals.md](./guard-internals.md) が正（ここには転記しない）。

## 禁止コマンド（全ロール共通）

次は、どのロールも実行しない。いずれも hook が deny する。

- `git stash`（`list`・`show` を除く）。並行作業や他の役割の変更を巻き込むため。
- 作業ツリー全体を書き換える git 操作: `checkout <ブランチ>`・`switch`・`reset`・`clean`・`merge`・`rebase`・`pull`・`cherry-pick`・`revert`・`am`・`apply`。
- `git push`。
- コミット・ステージング・タグ: `git commit`・`git add`・`git tag`（読取り形も許さず、引数に関わらず禁止）。
- ブランチ・リモート・設定の変更: `git branch`（`-d`・`-D`・`-m`・`-M`・`-c`・`-C`・`--delete`・`--move`・`--copy`・`--set-upstream-to` など、作成・削除・改名・複製・上流設定を含む形）、`git remote add`／`remove`／`set-url`／`rename` など、`git config` の設定・削除・編集。読取り形は許可する: `git branch`（一覧）・`--list`・`--show-current`、`git remote`（`-v`）・`show`・`get-url`、`git config --get`・`--list`・`-l`。
- `gh pr merge`（`gh` の他のサブコマンドは禁止しない）。
- 依存の追加・更新（`pnpm add`／`install` 等）。

コミット・ブランチ・リモート設定の操作と PR のマージ、依存追加はメインの担当で、ワーカーは作業ツリーの変更だけを行う。

## 停止規律

1. **書く前の自己チェック**: 対象パスを次の3つに分ける（この3分類の唯一の正はここ）。
   1. 常設の範囲（自分の役割の許可 glob）に当たる → 続行する。
   2. 共有する構成ファイルの例外に当たる（依存の追加・設定ファイルの変更・テスト設定を含む）→ 自分では書かず、停止して対象パスと理由を報告する。メインが plan の承認範囲と照らして書く。
   3. どちらでもない（他の役割の領域を含む）→ 実装せず、停止して対象パスと理由を報告する。別名ファイルで迂回しない。
2. **deny されたとき**: 書かずに停止し、対象パスと理由をメインへ報告する。**別名ファイルで迂回しない**（共有部品の複製になり、許可表による判定の意味も失われるため）。
3. **Bash 実行後に、hook が担当外の変化（block）または照合不能を通知したとき**: 書き戻さずに作業を止め、実行したコマンドと対象パスをメインへ報告する。自分のコマンドの結果か判断できないとき（並行作業による変化かもしれないとき）も、完了報告の「担当外の変化」に列挙する。
4. **既存テストや他領域が落ちたら、直さずに再現コマンドと出力を報告して止まる。**（この1文が、ワーカーの停止の扱いの正。ワーカー定義と委譲プロンプトは、この文をそのまま引く）

## 完了報告

ワーカーは、完了報告に次を書く（要約だけにせず、実出力を貼る）。

- **実行したコマンド行と、その出力の該当部分**（件数行・BUILD 行・失敗時のエラー全文）。一括スクリプトの出力（ステップごとの PASS/FAIL 行・件数行・失敗時の末尾ログ）は実出力にあたる。出力を貼れない（実行しなかった・実行できなかった）ときは、その旨を明記する。実行していないコマンドを「通った」と書かない。「通りました」という要約は、実際には失敗していても言葉の上で区別が付かないため。
- **担当外の変化**（hook の事後通知を受けたパス。無ければ「なし」）。
- **教訓候補**（あれば。ワーカーは `tasks/lessons.md` を書けないので、メインが起票する）。

## 既知の限界

`guard-internals.md` の「既知の限界」節が正（ここには転記しない）。

## preload 先

`contract-agent`・`api-agent`・`web-agent`・`solver-agent`・`data-agent`・`api-test-agent`・`web-test-agent`・`solver-test-agent`・`data-test-agent`・`e2e-agent`・`data-model-agent`・`test-investigator`（書込ガードを配線する12体）と `reviewer-agent` が本 Skill を `skills:` で preload する。書込ツールを持たない `screen-design-agent` は preload しない。
