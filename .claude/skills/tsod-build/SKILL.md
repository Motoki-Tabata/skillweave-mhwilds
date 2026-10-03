---
name: tsod-build
description: 区間 D。handoff でゲート C-1 の承認を確かめてから、tasks.md の担当領域ごとの委譲・一括検証・レビュー・是正・最終検証をゲート D-1 まで進め、承認後に停止して /tsod-ship を案内する区間コマンド。ユーザーが「/tsod-build NNN」と打ったときだけ起動する。文脈が膨らんで中断した区間 D の再開にも使う。
disable-model-invocation: true
argument-hint: "<NNN または NNN-slug>"
effort: medium
---

# 区間 D: 実装・検証・レビュー

共通動作は `.claude/skills/tsod-workflow/SKILL.md`「区間コマンドの共通動作」に従う。推奨モデルは Sonnet（委譲・検証・是正の往復が主で、生成量が大きいため）。reviewer-agent だけは Opus で動く。

## 開始条件

handoff を全文読み、ゲート C-1 が `承認済み` であることを確かめる。未承認・handoff が無いなら「開始条件を満たさない（ゲート C-1 未承認）」と提示し、`/tsod-plan NNN` を案内して停止する。ブランチは `feat/NNN-<slug>` であること。

- handoff の「要確認事項」「PR 本文に必須の記載事項」「区間メモ」を読んで把握する。
- 区間 D の開始コミット（その時点の HEAD）を、handoff の「コミット範囲」に記録する。
- handoff に「区間の再開点」があれば、「再開」節へ進む。

## 委譲

1. plan.md「常時許可外の変更」のうち、ゲート C-1 で承認された行を、ワーカーへの委譲の前にメインが書く（依存追加 → リポジトリ直下で `pnpm install`・`apps/api` で `./gradlew` の解決確認まで）。
2. tasks.md の担当領域ごとに、領域を担うワーカーを別の起動で委譲する（native の `subagent_type`）。

   | 領域 | ワーカー |
   |---|---|
   | 契約 | contract-agent |
   | api 実装 | api-agent |
   | web 実装 | web-agent |
   | solver 実装 | solver-agent |
   | data 実装 | data-agent |
   | api テスト | api-test-agent |
   | web 単体テスト | web-test-agent |
   | solver テスト | solver-test-agent |
   | data テスト | data-test-agent |
   | E2E | e2e-agent |

   既定の順序は、contract-agent → api-agent →（draft の回収）→ data-agent → solver-agent → web-agent → テスト役。実装役はテストを書かないので、テストは必ずテスト役に委ねる。`apps/web/src/main/lib/api/schema.ts` の再生成は web-agent の責務。既存オペレーションに status code だけを足す契約変更では、contract-agent と api-agent を続けて実行する（その間の contractTest の失敗は想定内。`.claude/rules/contracts-first.md` の該当箇条）。
3. プロンプトは [delegation-template.md](./references/delegation-template.md) の定型で作る。
4. **並列にしてよい条件（唯一の正）**: 次をすべて満たすときだけ。満たさなければ直列にする。
   - tasks.md のタスクごとの担当領域と書込フォルダが重ならない。
   - タスク間に依存が無い（一方の出力を他方が前提にしない。同じ契約ファイルを前提にしない）。
   - 両者の検証が、同じ共有物を含まない。このプロジェクトの共有物は次の2つ。
     - **Gradle プロジェクト `apps/api`**: 同じ build ディレクトリでの Gradle の同時実行を避けるため、`apps/api` を検証する役割どうし（api-agent と api-test-agent）は並列にしない。
     - **pnpm workspace**: リポジトリ直下の同じ lockfile・同じルート scripts を使い、`apps/web` が `packages/*` のソースを型検査で読む。編集中のファイルによる `format:check`・`type-check` の失敗を避けるため、pnpm workspace を検証する役割どうし（web・solver・data の各役割と e2e-agent）は並列にしない。

   したがって並列にしてよいのは、`apps/api` 側の役割（api-agent・api-test-agent のどちらか1つ）と、pnpm workspace 側の役割（web・solver・data の各役割・e2e-agent のどれか1つ）の組で、上の他の条件も満たすときだけ。contract-agent は両側の前提になるので並列にしない。solver と data の役割は、互いに並列にしない（同じ `packages` の段で lint・format を検査するため）。

   機能マップの依存の表（機能同士の依存）は、この判断の根拠にしない。並行で起動したときはバックグラウンドで起動し、完了通知を待つ。
5. ワーカーが戻ったら、`git status` で担当外の変化が無いことを確かめ、領域ごとに1コミットを積む。
6. 修正のための再委譲は、担当ワーカーを**新規起動**し、`review-diff.mjs` で保存した差分ファイルのパスと修正指示だけを渡す（前回の会話を再開しない。SendMessage で再開しない）。担当は上の領域表で一意に決まる。

### ワーカーの報告を受けたとき

- フォルダ外の変更が必要と報告された → 共有構成ファイルなら AskUserQuestion でユーザーに提示し、承認後にメインが書き、handoff の「PR 本文に必須の記載事項」に記録する。ほかのワーカー領域の定型修正は、メインの直接修正の基準に当たるものだけメインが直す。それ以外は担当ワーカーを新規起動する。
- 担当外の変化の報告があれば、並行で動いていたワーカーの書込かを確かめ、該当しなければ是正する。
- 契約型のフレッシュネスは、verify.mjs が一時ファイルへの再生成との比較で判定する。`apps/web/src/main/lib/api/schema.ts` が未コミット・未ステージでも落ちない。FAIL なら再生成漏れ。

### draft の回収

api-agent の完了直後（data-agent・solver-agent・web-agent・テスト役への委譲の前）に、メインが `contracts/**` の `x-swv-status: draft` 行を削除し、grep で残存0件を確かめる。回収したら `node .claude/skills/tsod-verify/scripts/verify.mjs --only api`（`--allow-draft` なし）を実行して PASS を確かめる。draft の事後検出は contractTest が担う。

## 検証の下限（ワーカーが実行する検証の唯一の正）

各ワーカーは、自分の領域の行を実行して実出力を貼る。`verify.mjs --only <領域>` は、`CLAUDE.md`「Commands」の当該領域の行をまとめて実行するもの。表の各行を手で個別に叩く代わりに使う。領域は `api`・`web`・`packages`（`packages/solver` と `packages/data`）・`e2e`。

| ワーカー | 実行するコマンド |
|---|---|
| contract-agent | `pnpm contract:lint` |
| api-agent | `node .claude/skills/tsod-verify/scripts/verify.mjs --only api --allow-draft`（draft の回収前だけ。contractTest の失敗は XFAIL と表示される）と bootRun の起動確認（`/actuator/health`）、`node .claude/skills/tsod-verify/scripts/verify.mjs --sonar-area api` |
| api-test-agent | `node .claude/skills/tsod-verify/scripts/verify.mjs --only api` と `--sonar-area api` |
| web-agent | `node .claude/skills/tsod-verify/scripts/verify.mjs --only web` と `node .claude/skills/tsod-verify/scripts/verify.mjs --sonar-area web` |
| web-test-agent | `pnpm --filter @swv/web run test:coverage`（Sonar と同じ計測経路。`test:unit` だけで完了にしない）と `verify.mjs --only web` と `--sonar-area web` |
| e2e-agent | `verify.mjs --only e2e`（e2e が未設定の間は SKIP）と `pnpm --filter @swv/web run lint:check`・`pnpm --filter @swv/web run format:check` と `--sonar-area web` |
| solver-agent・data-agent | `verify.mjs --only packages` と `--sonar-area packages` |
| solver-test-agent | `pnpm --filter @swv/solver run test:coverage` と `verify.mjs --only packages` と `--sonar-area packages` |
| data-test-agent | `pnpm --filter @swv/data run test:coverage` と `verify.mjs --only packages` と `--sonar-area packages` |
| data-model-agent | Bash を持たないため下限なし（メインが区間 B で確かめる） |

- Sonar の完了条件: 担当領域の新規コードに Sonar の issue が0件（`--sonar-area` の exit 0）。contract-agent・data-model-agent は Sonar の解析対象を書かないので対象外。
- `--sonar-area packages` は、`packages/solver` と `packages/data` の**両方**を解析する。担当でないもう一方のパッケージの issue は、直さずに完了報告に書く。
- api の最終検証は、Gradle のキャッシュ済みの結果を見ない。`verify.mjs` は `--rerun-tasks`・`--rerun` を付けて実行するので、手で `./gradlew` を叩くときも `--rerun-tasks` を付ける。

## 一括検証

全領域の委譲が済んだら、メインが次を `run_in_background` で1回実行し、要約だけを見る（[待ち方](../tsod-workflow/references/waiting.md)）。

```
node .claude/skills/tsod-verify/scripts/verify.mjs --e2e
```

e2e が未設定の間、e2e の段は SKIP（未設定）になり、終了コードに影響しない。ワーカーの完了報告は鵜呑みにせず、この1回で確かめる（キャッシュ済みの結果を見ていないかにも注意する）。メインは個々の検証コマンドを手で繰り返さない。緑になったら、その時点のコミットを「区間の再開点」として handoff に記録し、コミットする。

## 失敗の切り分け

テストの失敗・flake（単体・E2E とも）は、推定で直さない。test-investigator を新規起動して切り分けさせ（手順の正は [triage.md](./references/triage.md)）、特定された原因をもとに、担当領域のワーカーを新しく起動して直させる。

## レビュー

1. `node .claude/skills/tsod-build/scripts/review-diff.mjs <開始コミット> <再開点>` で差分をファイルへ保存し、出力（パスと変更の要約。領域別のファイル数を含む）だけを見る。メインは差分の全文を読まない。
2. reviewer-agent に、差分ファイルのパスと spec.md のパスを渡す。必要ならメインが `/code-review` に同じコミット範囲を target として渡す（補助）。
3. 所見は handoff の「レビュー記録」に要約で記録する。

### 使えないとき

`/code-review` が呼べない・拒否される・挙動が変わったときは、再試行せず、reviewer-agent の所見だけで受入判定する。`/security-review` は、認証・認可・入力検証に触れる機能だけユーザーに実行を依頼し、使えなければ reviewer のチェックリストのセキュリティ項目で判定する。依存の一覧は [builtin-skills.md](../tsod-workflow/references/builtin-skills.md)。

## 是正

要修正の所見ごとに、担当領域のワーカーを新規起動して直させる。是正は別のコミットにする（[commit-rules.md](../tsod-workflow/references/commit-rules.md)）。メインは `verify.mjs --only <触れた領域>` を `run_in_background` で実行する。再レビューには、是正の範囲の差分ファイル（`review-diff.mjs`）と前回の所見（handoff の「レビュー記録」）だけを渡す。要修正が0件になるまで繰り返す。2巡で解消しなければ、残った指摘をユーザーに提示して判断を仰ぐ。

## 最終検証

レビューの要修正が無くなったら、メインが次を最後に1回だけ実行する（coverage を含む Sonar の全体解析）。`--allow-draft` は付けない。失敗は是正して再実行する。要約には Sonar の件数行が必ず含まれる。

```
node .claude/skills/tsod-verify/scripts/verify.mjs --e2e --sonar
```

## メインの直接修正

[direct-edit.md](../tsod-workflow/references/direct-edit.md) に従う。

## コミット

[commit-rules.md](../tsod-workflow/references/commit-rules.md) に従う。

## 待ち方

[waiting.md](../tsod-workflow/references/waiting.md) に従う。

## ゲート D-1

一括検証・最終検証の要約・レビュー所見・メインの直接修正の表（そのまま）・常時許可外の変更の実績を提示し、`git diff` の確認を促してから、AskUserQuestion を1回取る。承認されたら、同じターンで handoff のゲート D-1 と「現在地」を更新し、未起票の教訓を処理して、1回コミットする。承認後に追加の確認を挟まない。

## 再開

是正の往復で文脈が膨らんだときは、メインが handoff の「区間の再開点」「レビュー記録」を更新してコミットし、停止して「新しいセッションで `/tsod-build NNN` を起動するとレビューから再開する」と案内する。

起動時に handoff に再開点があれば、委譲と一括検証を飛ばし、再開点とレビュー記録から差分ファイルを作り直して、「レビュー」（または未解決の所見の「是正」）から始める。

## 教訓

発見したその場で `tasks/lessons.md` に記録する（ワーカーの報告の教訓候補も同じ。書式は `.claude/skills/tsod-workflow/references/lessons-guide.md`）。push・PR は区間 E（`tsod-ship`）の担当。

## 既知の限界

最終防御は reviewer の差分分類とゲート D-1 の確認。限界の詳細の正は `.claude/skills/impact-scope/guard-internals.md`「既知の限界」節。

## 区間の終わり（次のコマンドと推奨モデル）

ゲート D-1 の承認の直後に、handoff の「現在地」を、「区間の終わりの定型」の D→E の行のとおり書く。このセッションでは PR 作成に進まない。次の定型の案内文を出して停止する。

「新しいセッションを開き、`/model sonnet` にしてから `/tsod-ship NNN-<slug>` を起動してください。」
