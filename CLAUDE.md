# CLAUDE.md — skillweave-mhwilds（swv）開発規約

モンスターハンターワイルズ対応の非公式スキルシミュレータ（PWA）。機能開発は TSOD（薄仕様オーケストレーション開発）で進める。パス別の落とし穴・詳細規約は `.claude/rules/*.md` に分離してあり、作業対象のパスに応じて自動ロードされる。個別トラブルシューティングは本ファイルには置かない。

---

## 憲法（不変制約）

TSOD における「憲法」＝最初の仕様を書く前に確定している、単一ディレクトリにスコープできない全体決定。強度は advisory（格上げしない）。

- THE system SHALL JVM／PostgreSQL／JSON の日時をすべて UTC に統一し、表示のときにブラウザのローカル時刻へ変換しなければならない（`spring.jackson.time-zone` は Jackson のシリアライズにしか効かないため、アプリケーションの `main()` で `TimeZone.setDefault(...)` を明示している。JVM 起動フラグ `-Duser.timezone` への依存はしない——IDE 実行・gradlew・コンテナなど、起動方法によって漏れるリスクがあるため）。
- THE system SHALL スキーマ変更を必ず Flyway マイグレーション（`V<n>__<動詞>_<対象>.sql`）で行わなければならない。`docker/init/01_init.sql` への追記や DB への直接 DDL は禁止する。
- THE system SHALL `spring.jpa.hibernate.ddl-auto` を `none` に設定しなければならない（Flyway に委任するため）。
- THE system SHALL Web の HTTP クライアントに axios を使わず、`apps/web/src/main/lib/http.ts` のネイティブ fetch ラッパーを使わなければならない（依存を増やさないことでサプライチェーン攻撃の攻撃面を減らすため）。
- THE system SHALL UI コンポーネントに shadcn-vue + Reka UI を使わなければならない。コンポーネントは npm 依存ではなく、ソースとしてコピーする方式を取る（設定は `apps/web/components.json`）。
- THE system SHALL lint を oxlint → ESLint の順に実行しなければならない（各パッケージの `package.json` の `lint` スクリプト参照）。
- THE system SHALL npm サプライチェーン対策の設定をリポジトリ直下の `pnpm-workspace.yaml` に集約しなければならない。設定は変更後に必ず中身を確認し、意図しない上書きが起きていないことを確かめる。
- THE system SHALL ソルバーと OCR をブラウザ内で実行し、ユーザーの画像をサーバーへ送ってはならない（プライバシーとサーバー負荷のため）。
- THE system SHALL `packages/solver` を API の型と DOM に依存させてはならない（変換は `apps/web` のアダプタが行う）。
- THE system SHALL マスターデータを `packages/data` のパイプラインだけで生成しなければならない。`packages/data/dist/` を手で編集しない。
- THE system SHALL ユーザーデータの ID をクライアント採番の UUIDv7 としなければならない（ゲストの端末内下書きを、ログイン後に ID を振り直さずにサーバーへ取り込めるようにするため）。
- THE system SHALL 公式の画像・アイコンを使わず、画面に二次創作である旨を表記し、©CAPCOM は表記せず、営利化（広告・課金）をしてはならない。

---

## Commands

**検証コマンドの唯一の正**。CI（`.github/workflows/ci.yml`）が呼ぶものと同じ検証コマンド。ただし「ローカル限定」の行は CI では実行しない。PR を出す前にローカルで実行する。

| 種別 | apps/api（`apps/api` で実行） | pnpm workspace（リポジトリ直下で実行） |
|---|---|---|
| build | `./gradlew build` | `pnpm build` |
| test | `./gradlew test` | `pnpm test:unit` |
| lint | `./gradlew spotlessCheck` | `pnpm lint:check`（oxlint → ESLint の順） |
| format | — | `pnpm format:check` |
| typecheck | `./gradlew classes testClasses` | `pnpm type-check` |
| contract | `./gradlew contractTest` | `pnpm contract:lint` |
| contract 型の鮮度 | — | `pnpm contract:types` の後に `git diff --exit-code -- apps/web/src/main/lib/api/schema.ts` |
| contract 定義書 | — | `pnpm contract:docs`・`pnpm contract:swagger`（生成物は `contracts/dist/`・非コミット） |
| coverage（ローカル限定） | `./gradlew test contractTest jacocoTestReport` | `pnpm test:coverage` |
| 静的解析（ローカル限定） | `scripts/sonar-local.sh`（全体）／ `scripts/sonar-local.sh --area api\|web\|packages` | 左に同じ |
| 一括検証（要約のみ） | `node .claude/skills/tsod-verify/scripts/verify.mjs`（`--only api\|web\|packages\|e2e\|sonar`・`--e2e`・`--sonar`・`--sonar-area <api\|web\|packages>`・`--base <ref>`・`--allow-draft`・`--dry-run`） | 左に同じ |

特定のパッケージだけを検証するときは、リポジトリ直下で `pnpm --filter @swv/web run <script>`、`pnpm --filter './packages/*' run <script>` の形にする。

一括スクリプトは本表と同じコマンドを順に実行して要約だけを返すもので、本表を置き換えない。表と次の点だけ意図的に違う。

1. 表の pnpm の行はリポジトリ直下の `pnpm -r` 形（全パッケージ一括）で書いてある。`ci.yml` と一括検証は web と packages を `--filter` で分けて実行する。
2. `./gradlew test`・`classes testClasses`・`jacocoTestReport`・`pnpm test:coverage`・`pnpm lint`・`pnpm format` は表だけに載る。CI と一括検証は `./gradlew build` が test と typecheck を含むため個別に実行しない。lint と format の自動修正版は手元の修正用で、検証ではない。coverage は Sonar の全体解析が実行する。
3. `pnpm install --frozen-lockfile` はセットアップであり、検証コマンドの対象外。
4. 契約型の鮮度は、一括検証では作業ツリーの `schema.ts` を書き換えないよう一時ファイルへ再生成して現行の `schema.ts` と比較する（CI の「再生成後に差分なし」と同じ判定を、コミット前でも行えるようにしたもの）。
5. api は、一括検証では `spotlessCheck build` と `contractTest` を別の段で実行し、draft 残存中の contractTest の失敗を区別して表示する（`--allow-draft` のときだけ想定内として扱う）。

表を変えたらスクリプトも同時に直す。一致は区間 E の drift-scan が検査する。

lint は2種類ある。`pnpm lint:check` は非破壊・警告も失敗（`oxlint . --deny-warnings` → `eslint . --max-warnings 0`）。ローカルで自動修正したい場合は `pnpm lint`（`oxlint . --fix` → `eslint . --fix --cache`）。実行順序は憲法節の定めに従う。

ワーカーが実行する検証の下限の正は `.claude/skills/tsod-build/SKILL.md`「検証の下限」節である。

---

## e2e の追加

機能 003 で e2e を足すときは、次を同じ PR で揃える。揃えないと、一括検証・CI・本表の3者が食い違う。

- `ci.yml` に e2e ジョブを足す。
- `apps/web/package.json` に `test:e2e` script を足し、`apps/web/e2e/` を作る。
- 本表に e2e の行を足す。本表は canon の管理下にあるので、`tasks/lessons.md` に canon への改修要求として起票する。

---

## 参照

- 区間 A〜E とコマンド・推奨モデルの正は `.claude/skills/tsod-workflow/SKILL.md`。
- 設計標準は `design/`（技術スタック・データモデル・UI）。API 契約の規約は `contracts/README.md`。
- 作業対象のパスに応じて `.claude/rules/*.md` が自動ロードされる。
- 実装前に `specs/NNN-<slug>/spec.md` の「影響範囲」「スコープ外」を確かめる。
- 教訓・矛盾は発見したその場で `tasks/lessons.md` に記録する（書式と行き先の正は `.claude/skills/tsod-workflow/references/lessons-guide.md`）。
- `temp/` の卒業の正は `.claude/skills/tsod-ship/references/temp-graduation.md`。
