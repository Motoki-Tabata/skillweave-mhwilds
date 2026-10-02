# Skillweave for MH Wilds 技術スタック一覧

> 作成日: 2026-10-02（機能開発前のハーネス整備で実測）
>
> **版の正は実測値**（`./gradlew dependencies` と `pnpm list -r --depth 0` の解決結果）。本書はその記録と選定理由を持つ。
> 宣言の正は `apps/api/gradle/libs.versions.toml`・各 `package.json`・`pnpm-workspace.yaml` の `catalog`・
> `docker/compose.yaml`。本書と食い違ったら宣言側が正で、本書を直す。

---

## 版の選び方

**選定時点の最新安定版、ただし公開から7日（クールダウン）を経たもの**を採る。

1. ランタイム・ツールのメジャー版は、検証済みの組み合わせとして Java 25・Node 24・pnpm 11・Gradle 9・Spring Boot 4・Vite 8・Vue 3・Tailwind 4 とする。メジャー版を上げるときは個別に判定して本書に理由を残す。
2. ライブラリのパッチ・マイナーは最新を取る。npm は `pnpm-workspace.yaml` の `minimumReleaseAge`（7日）が自動で効く。Maven Central は公開日を確認し、7日未満なら1つ前を選ぶ。
3. 依存の更新で非推奨・不適合が見つかったものは、本書に判断と理由を残す。

---

## API（apps/api）

| 項目 | 版 | 備考 |
|---|---|---|
| Java（toolchain） | 25（Amazon Corretto 25.0.4.1 で実測） | LTS。CI も corretto 25 |
| Gradle（wrapper） | 9.8.0 | `distributionSha256Sum` 付き |
| Spring Boot | 4.1.1 | 4.1.1 が最新（2026-08-20） |
| Spring Framework | 7.0.9 | Boot BOM が解決 |
| Hibernate ORM | 7.4.5.Final | Boot BOM が解決 |
| Flyway | 12.4.0（＋ `flyway-database-postgresql`） | Boot BOM が解決。`flyway-database-postgresql` が無いと "Unsupported Database" で起動失敗する |
| Jackson | 3.1.5（`tools.jackson`） | Boot BOM が解決 |
| Tomcat | 11.0.24 | Boot BOM が解決 |
| springdoc-openapi | 3.1.1 | |
| Spotless（palantir-java-format） | 8.10.3 | フォーマッタの版は固定せず、JDK に対応する版の選択を Spotless に委ねる（固定すると JDK 25 非対応の版を固定しうる） |
| Testcontainers | 2.0.5 | 座標は `org.testcontainers:testcontainers-postgresql` |
| JUnit Jupiter | 6.0.3 | Boot BOM が解決 |
| swagger-parser | 2.1.48 | contractTest 専用。swagger-core が参照する `javax.xml.bind` が JDK に無いため、`jaxb-api` 2.3.1 を testRuntimeOnly で併用 |

### 後の機能で導入するもの（今回は入れない）

| 項目 | 導入する機能 | 今回入れない理由 |
|---|---|---|
| Spring Session JDBC | 004 discord-login | クラスパスに載せるとセッションテーブルを要求する。テーブルは Flyway で作るので、その機能で一緒に入れる |
| Spring Security・OAuth2 Client（Discord） | 004 discord-login | 認証の要件（スコープ・リダイレクト URI・CSRF）を機能の中で決める。エンドポイントがまだ無いので保護対象も無い |

版はいずれも Spring Boot BOM が解決する。導入時に `./gradlew dependencies` で実測して本書に追記する。

---

## Web（apps/web）と packages

pnpm workspace はリポジトリ直下。共有する開発ツールの版は `pnpm-workspace.yaml` の `catalog` で一元管理する。

| 項目 | 版 | 備考 |
|---|---|---|
| Node.js | 24（`.nvmrc`）。`engines` は `^24.12.0` | |
| pnpm | 11.25.0（`packageManager`） | 12 系が出ているが、メジャー版は上記「版の選び方」1 のとおり 11 に留める |
| Vue | 3.5.43 | |
| Vue Router | 5.3.1 | |
| Pinia | 4.0.3 | |
| Vite | 8.3.1 | 8.3.2 はクールダウン中 |
| @vitejs/plugin-vue | 6.0.9 | |
| Tailwind CSS（＋ `@tailwindcss/vite`） | 4.3.3 | |
| TypeScript | **6.0.3**（7 系は不採用。下記） | catalog |
| vue-tsc | 3.3.11 | |
| Vitest（＋ `@vitest/coverage-v8`） | **5.0.1**（下記） | catalog |
| jsdom | 30.1.1 | |
| @vue/test-utils | 2.5.1 | |
| oxlint / eslint-plugin-oxlint | 1.85.0 | catalog |
| ESLint | 10.11.0 | catalog |
| typescript-eslint | 8.70.1 | catalog。packages 用 |
| eslint-plugin-vue | 10.11.1 | |
| @vue/eslint-config-typescript | 14.9.0 | |
| @vue/eslint-config-prettier | 10.2.0 | |
| Prettier | 3.9.9 | catalog |
| @types/node | 26.6.2 | catalog。26.6.3 はクールダウン中 |
| openapi-typescript | 7.13.0 | peer の `typescript ^5.x` は満たさない（6.0.3）が、生成は動作する（CI の型の鮮度検査で毎回確かめる） |
| @redocly/cli | 2.54.2 | 2.54.3 はクールダウン中 |
| swagger-ui-dist | 5.33.0 | 定義書の生成時のみ |

### 後の機能で導入するもの（今回は入れない）

| 項目 | 導入する機能 | 備考 |
|---|---|---|
| shadcn-vue の部品（reka-ui・class-variance-authority・clsx・tailwind-merge） | 003 solver-ui | `components.json` だけ置いてある。部品は CLI でソースとしてコピーする |
| アイコン | 003 solver-ui | `lucide-vue-next` は npm 上で deprecated。後継の `@lucide/vue`（1.49.0 が最新・2026-09-29）を導入時に確認する |
| vite-plugin-pwa | 未定（下記「PWA」） | **サプライチェーン対策の判断待ち** |
| HiGHS（npm `highs`） | 001 solver-spike | 下記「§3.3 の確認結果」 |
| Playwright | 003 solver-ui（e2e ジョブと同時） | 画面が無いため今回は入れない |

---

## 主な判断

### 1. TypeScript は 6.0.3（7 系は今回も不採用）

TypeScript 7.0.2（2026-07-08）は出ているが、typescript-eslint の最新 8.71.0（2026-09-28）でも peer 依存が
`typescript >=4.8.4 <6.1.0` のまま。TS 7 を入れた時点で lint が壊れるため、6.0.3 に留める（2026-10-02 確認）。

### 2. Vitest 5 を採用し、5.0.1 に留める

- Vitest 5.0.0 は 2026-09-03 公開でクールダウンを満たし、peer の Vite（`^6.4.0 || ^7 || ^8`）にも適合する。
- **5.0.2 は使わない。** 5.0.2 で依存の `why-is-node-running` が `^2.3.0` から `^3.2.1` に上がり、解決される
  3.2.2 は provenance が無い（3.2.0・3.2.1 にはある）。pnpm の `trustPolicy: no-downgrade` が
  `ERR_PNPM_TRUST_DOWNGRADE` で止める。3.2.2 は 2025-01 公開・同一メンテナで悪性の兆候は無いが、
  ポリシーに例外を作る理由も無いため、依存が変わる前の 5.0.1 に留める。上げるときは同じ点を再確認する。

### 3. PWA（vite-plugin-pwa）は導入を保留した

- peer 依存は Vite 8 に適合する（`vite-plugin-pwa@1.3.0`: `^3.1.0 || … || ^8.0.0`）。
- ただし依存の `workbox-build@7.4.1`（Google 公式・`vite-plugin-pwa` 1.3.0 が `^7.4.1` を要求）が、
  rollup 4 対応のための**個人フォークのプレリリース版** `@trickfilm400/rollup-plugin-off-main-thread@3.0.0-pre1`
  に依存しており、この版は provenance が無い（同パッケージの 2.4.3・2.5.0・4.0.0-pre1/pre2 にはある）。
  pnpm が `ERR_PNPM_TRUST_DOWNGRADE` で止める。
- 回避策は (a) `trustPolicy` の例外に加える、(b) overrides でフォークを provenance のある版に差し替える、
  (c) 上流の修正を待つ、のいずれか。サプライチェーン対策の例外になりうるため、詳細を確認したうえで
  別途方針を決める（決まるまで PWA 関連の依存は入れない）。

### 4. ローカル DB のポートは 5433

同じマシンで別プロジェクトの PostgreSQL（5432）と同時に起動できるよう、`docker/compose.yaml` のホスト側ポートを
5433 にした。コンテナ名・ボリューム名も `swv_` 接頭辞で分けている。

### 5. packages は TypeScript のソースをそのまま公開する

`packages/solver`・`packages/data` は `exports` で `src/main/index.ts` を指し、ビルド成果物を持たない
（利用側の Vite・Vitest がそのまま変換する）。そのため packages の検証は lint・format・type-check・test のみ。
`packages/solver` の tsconfig は `lib: ["ES2024"]`・`types: []` で、DOM と Node の型を使うと型検査で落ちる
（ソルバーを DOM・API の型に依存させない方針を機械で守るため）。Worker 用の型は 001 で足す。

---

## `temp/initial-design.md` §3.3 の確認結果（2026-10-02）

| 項目 | 結果 |
|---|---|
| マネージド DB の PostgreSQL 18 | **Neon: 提供あり**（14〜18 をサポート。2026-08 時点で 18.6。[Neon の版ポリシー](https://neon.com/docs/postgresql/postgres-version-policy)）。**Supabase: 新規プロジェクトでの提供告知を確認できず**（GitHub の Discussion で要望が出ている段階。17 のままの可能性が高い）。Neon が第一候補 |
| vite-plugin-pwa と Vite のメジャー版 | peer は適合。導入はサプライチェーン上の理由で保留（上記「判断 3」） |
| HiGHS WASM（npm `highs`） | 1.15.3（2026-09-11）。MIT。ESM（`build/highs.mjs`）と型定義あり、peer 依存なし。WASM は `highs/runtime` で取り出せる。導入と性能測定は 001 |
| TypeScript 7 と typescript-eslint | 不適合のまま（上記「判断 1」） |
| Cookie の同一サイト化 | 独自ドメインが未決のため未対応。dev では Vite の proxy で同一オリジンに見せている |

---

## CI

`.github/workflows/ci.yml` のジョブは secret-scan / api / web / packages。e2e は 003 で追加する。

## SonarQube のローカル限定採用

`scripts/sonar-local.sh` でローカルだけで解析し、PR の CI には入れない。

- 理由: IDE（SonarQube for IDE）でしか見えない指摘はコマンドで再現・集計できず、完了条件に組み込めない。
  一方で SonarCloud や CI への常駐は維持コストと Actions の無料枠を消費する。ローカルの docker だけで
  動かせば、どちらの問題も避けられる。
- 構成: `docker/compose.sonar.yaml`（SonarQube Community Build）を起動し、`sonarsource/sonar-scanner-cli` の
  docker イメージで解析する。Sonar の Gradle プラグインは入れず、`apps/api/build.gradle.kts` の
  `sonarClasspath` タスクが classpath と JDK のパスを書き出してスキャナへ渡す。
- 使い方: 未解決の指摘が 0 件なら exit 0、1 件以上なら exit 1。領域モード（`--area api|web|packages`）は、
  テストを再実行せず、base からの変更ファイルの新規コードだけを別プロジェクトで解析する。
  認証情報・指摘一覧は `.sonar-local/`（gitignore 済み）に置く。
- 誤検知の抑止は `sonar-project.properties` の `sonar.issue.ignore.multicriteria` に理由コメント付きで登録し、
  ソースへの `// NOSONAR` は使わない。
イメージの版は `docker/compose.sonar.yaml` が正。

## カバレッジのローカル計測

API は JaCoCo（`./gradlew test contractTest jacocoTestReport`）、pnpm workspace は Vitest の coverage-v8
（`pnpm test:coverage`）で計測し、Sonar の全体解析が取り込む。閾値は置かず、CI でも計測しない（数値を目標にせず、テストの漏れを見つける材料として使うため）。
ブートストラップ・生成物・shadcn-vue のコピー部品は、`sonar-project.properties` と各 `vitest.config.ts` で同じものを除外する。

## 既知の警告

- `pnpm --filter @swv/web test:unit` で Vite が「`vitest.config.ts` の `import './vite.config'` に拡張子が無い
  （将来の `configLoader: 'native'` 既定化で非対応）」と警告する。現状の動作には影響しない。

## 関連ドキュメント

- [`design/data-model-standard.md`](data-model-standard.md)
- [`design/ui-design-standard.md`](ui-design-standard.md)
- [`temp/initial-design.md`](../temp/initial-design.md) — 設計方針の一次資料（§3 が本書の出典）
