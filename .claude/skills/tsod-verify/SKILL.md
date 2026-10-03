---
name: tsod-verify
description: CLAUDE.md の Commands が定める検証コマンド一式（api・web・packages、必要に応じて e2e・Sonar）を1コマンドで実行し、ステップごとの PASS/FAIL/SKIP/XFAIL（想定内の失敗）と Sonar の件数行だけを返す。担当領域の変更したファイルだけを Sonar で解析する領域モード（--sonar-area）も持つ。「検証を回して」「全部のテストを流して」「CIと同じ検証をして」「担当領域の Sonar を確かめて」等のときに使う。
effort: low
---

# tsod-verify: 一括検証

## 実行方法

リポジトリ直下で次を実行する（[scripts/verify.mjs](./scripts/verify.mjs)）。

```
node .claude/skills/tsod-verify/scripts/verify.mjs [--only api|web|packages|e2e|sonar] [--e2e] [--sonar] [--allow-draft] [--dry-run]
node .claude/skills/tsod-verify/scripts/verify.mjs --sonar-area api|web|packages [--base <ref>] [--dry-run]
```

既定では api・web・packages を実行する。`--e2e`・`--sonar` を付けると該当ステップを追加する。`--only` を指定すると、その領域だけを実行する。`--only` に取れる値は `api`・`web`・`packages`・`e2e`・`sonar` の5つだけである。`--dry-run` は実行計画だけを表示し、コマンドは実行しない。

各領域の段は次のとおり（コマンドの正は `CLAUDE.md` の「Commands」節。ここはその写しで、実行計画の正は `verify.mjs` の `buildPlan`）。

| 領域 | 実行ディレクトリ | 段 |
|---|---|---|
| api | `apps/api` | `./gradlew spotlessCheck build`・`./gradlew contractTest`（CI の api ジョブと同じ） |
| web | リポジトリ直下 | `pnpm --filter @swv/web run` の `lint:check`・`format:check`・`type-check`・`test:unit`・`build`、`pnpm contract:lint`、契約型の鮮度、`pnpm contract:docs`・`pnpm contract:swagger` |
| packages | リポジトリ直下 | `pnpm --filter './packages/*' run` の `lint:check`・`format:check`・`type-check`・`test:unit` |
| e2e | リポジトリ直下 | 設定済みのときだけ実行する（下記） |
| sonar | リポジトリ直下 | `bash scripts/sonar-local.sh`（全体の解析） |

`--allow-draft` は、契約に `x-swv-status: draft` が残っている間の contractTest の失敗を想定内（XFAIL）として扱うための指定である。draft の回収前（api-agent の検証）だけに付ける。

## e2e（未設定の間は SKIP）

`apps/web/package.json` に `test:e2e` が無い、または `apps/web/e2e/` が無いときは、e2e の段は「SKIP（未設定: apps/web に test:e2e と e2e/ が必要）」になり、コマンドを実行しない。`--e2e` を付けても `--only e2e` でも同じ。設定済みのときは、`docker compose -f docker/compose.yaml up -d --wait` で DB を起動し、`apps/api` で bootRun を起動して `/actuator/health` を待ち、`pnpm --filter @swv/web run test:e2e` を実行して、終了時に自分が起動したプロセスだけを止める。`--e2e` も `--only e2e` も付けないときは「SKIP（未指定）」を表示する。

## 領域の Sonar（`--sonar-area`）

`--sonar-area <api|web|packages>` は、`bash scripts/sonar-local.sh --area <領域>` を1段だけ実行する。ワーカーが自分の担当領域の完了条件（新規コードの Sonar の issue が0件）を確かめるためのモード。

- テストを再実行しない（全体の `--sonar` は、カバレッジのためにテストを走らせる）。
- 変更したファイルの新規コードだけを見る。`--base <ref>` で、変更の比較元を指定できる。
- 全体の解析とは別のプロジェクトキーで解析する（全体の解析結果を上書きしないため）。
- `packages` は `packages/solver` と `packages/data` の両方を解析する。担当でないパッケージの issue は直さずに報告する。
- `--only`・`--e2e`・`--sonar` とは併用できない。`--base` は `--sonar-area` と一緒のときだけ有効。
- 出力は「未解決: issue N 件 / 未レビュー hotspot M 件」の件数行だけで、Quality Gate は表示しない。全体の解析（`--sonar`）は、対象リポジトリ直下の `bash scripts/sonar-local.sh` が出す「Quality Gate:」の行も扱う。
- 対象リポジトリ直下の `bash scripts/sonar-local.sh` の終了コードは、0＝未解決なし（PASS）、1＝未解決あり（FAIL）、2＝実行失敗（FAIL）。

## 結果の種別

- **PASS**: 成功。
- **FAIL**: 失敗。
- **SKIP**: 未設定または未指定で、実行しない段（e2e が未設定、Sonar を指定していない）。終了コード 0 に数える。
- **XFAIL（想定内の失敗）**: `--allow-draft` を付けて実行し、contractTest が失敗し、かつ `contracts/**` に `x-swv-status: draft` が残っている場合だけ。`--allow-draft` が無ければ同じ状況は FAIL になり、「draft 残存 N 件（draft 起因の可能性）」の注記が付く。
- **PREREQ（前提不足）**: 前提コマンド（`pnpm`・`java`・`docker` など）が無くて実行できなかった段。SKIP ではなく、終了コード 2 になる。

## 終了コード

- 0: FAIL も前提不足も無い（SKIP・XFAIL は0に数える。総合結果は「PASS（想定内の失敗あり: XFAIL N 件）」と表示される）。
- 1: いずれかのステップが FAIL。
- 2: 前提不足（`pnpm`・`java`・`docker` 等のコマンドが無い）または引数誤り。

## 出力の読み方

全ログは一時ディレクトリ（`os.tmpdir()` 配下の `swv-verify/<タイムスタンプ>/`）に保存され、標準出力にはそのパスだけが表示される。**文脈に全ログを読み込まない。** 失敗したステップのログだけを、必要な範囲で読む。

- 注記（`注記: …`）がある行は、その理由を読む（draft 残存の件数など）。
- Sonar のステップ（全体・領域とも）には、結果（PASS／FAIL／SKIP）にかかわらず必ず「Sonar 件数: …」行が付く。件数が取れなかったときは「取得できず」と表示されるので、全ログを確認する。
- web の段には、契約から Swagger UI・Redoc の静的ドキュメントを生成できるかの確認（`contract:docs`・`contract:swagger`）が含まれる。生成物は非コミット。
- 契約型のフレッシュネスは、一時ファイルへの再生成と現行の `apps/web/src/main/lib/api/schema.ts` の比較で判定する。作業ツリーの `schema.ts` を書き換えない（未コミット・未ステージでも正しく判定する）。FAIL は再生成漏れで、`pnpm contract:types` で再生成する。
- Gradle は `--rerun-tasks`・`--rerun` を付けて実行するので、キャッシュ済みの結果（UP-TO-DATE）は見ない。

## 使い手

- `tsod-build`（区間 D）: 一括検証・最終検証・是正後の検証。メインの実行は、最終検証以外では `--allow-draft` を付けない。
- `tsod-ship`（区間 E）: CI 失敗の再現。
- ワーカー: 検証の下限として `--only <領域>` と `--sonar-area <領域>` を実行する（下限の正は `.claude/skills/tsod-build/SKILL.md`「検証の下限」節）。

## コマンドの正

検証コマンドそのものの正は `CLAUDE.md` の「Commands」節である。本スクリプトはその写しで、表と違う点（意図的な差）は `CLAUDE.md` の同節に列挙してある（ここには転記しない）。両者と `.github/workflows/ci.yml` が食い違っていないかは、区間 E のドリフト検査（`tsod-ship` の `drift-scan.mjs`）が検査する。
