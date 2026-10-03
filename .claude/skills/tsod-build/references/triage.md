# テスト失敗・flake の切り分け手順（唯一の正）

テスト（vitest・Playwright・JUnit）の失敗や flake を、推定で直さない。推定で直すと、原因でない箇所に手を入れて、別の flake を生むため。担うのは test-investigator（修正しない）。メインは検証コマンドを手で繰り返さない。

## 共通の進め方

単独での再現 → 反復実行 → 原因の特定、の順に進める。出力はファイルにリダイレクトし（一時ディレクトリ）、報告には要約だけを書く。

## vitest（web 単体・solver・data）

対象のパッケージは、`@swv/web`（`apps/web`）・`@swv/solver`（`packages/solver`）・`@swv/data`（`packages/data`）。リポジトリ直下から `--filter` で絞って実行する。

- 単独で実行: `pnpm --filter @swv/web exec vitest run src/test/<対象>.spec.ts`（solver・data は `@swv/solver`・`@swv/data` と各パッケージの `src/test/` 配下に読み替える）
- カバレッジ計測下で実行: 上に `--coverage` を付ける（`pnpm --filter <パッケージ> run test:coverage` の計測経路で、負荷が高く、後始末の遅れが顕在化しやすい）
- テスト名で絞る: `-t "<名前>"`
- ファイル並列を止める: `--no-file-parallelism`
- ワーカー数を絞る: `--maxWorkers=1`
- 実行順への依存を確かめる: `--sequence.shuffle`（再現には `--sequence.seed=<値>`）
- 反復: Playwright の `--repeat-each` に当たる CLI オプションに頼らず、シェルのループで行う。

出力先は変数を含まない固定パス `/tmp/tsod-triage/` にし、`>>` で追記する（書込ガードは、書込先に変数を含むリダイレクトを拒否するため。ループ変数を出力先のパスに入れない）。回の区切りは、ログの中に `echo` で書く。

```
mkdir -p /tmp/tsod-triage
for i in $(seq 1 N); do echo "--- run $i" >> /tmp/tsod-triage/vitest.log; pnpm --filter @swv/web exec vitest run src/test/<file> --coverage >> /tmp/tsod-triage/vitest.log 2>&1; echo "$i: exit $?" >> /tmp/tsod-triage/vitest.log; done
```

## Playwright（E2E）

E2E は、`apps/web` に `test:e2e` と `apps/web/e2e/` が作られてから使う。

- 対象 spec だけを冷えた状態で再現する。api は起動し直し、起動時データが絡むならテスト用コンテナも作り直す。
- 反復: `pnpm --filter @swv/web exec playwright test e2e/<名前>.spec.ts --workers=1 --repeat-each=<N> --retries=0 --trace on`
- 並列でだけ落ちるかは、`--workers` を既定にした同じ反復と比べて切り分ける。
- 失敗した操作のリクエスト本文と応答を確かめる。

## api（JUnit）

`apps/api` で `./gradlew test --tests '<クラス名>' --rerun` を、シェルのループで反復する（`./gradlew` の cwd は `apps/api`）。契約の突合の失敗は `./gradlew contractTest --rerun`。Gradle のキャッシュ済みの結果（UP-TO-DATE）を見ないよう、`--rerun` を必ず付ける。

## 報告

次の項目で報告する。

- 再現コマンド
- 反復回数と成否（例: 5回中2回失敗）
- 一次情報（エラー全文・リクエスト本文と応答・trace の所在）
- 原因と確度
- 直す担当領域（提案だけで、自分では直さない）
