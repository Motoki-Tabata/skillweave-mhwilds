# Skillweave for MH Wilds 技術スタック一覧

> 作成日: 2026-10-02（機能開発前のハーネス整備で実測）
>
> **版の正は実測値**（`./gradlew dependencies` と `pnpm list -r --depth 0` の解決結果）。本書はその記録と選定理由を持つ。
> 宣言の正は `apps/api/gradle/libs.versions.toml`・各 `package.json`・`pnpm-workspace.yaml` の `catalog`・
> `docker/compose.yaml`。本書と食い違ったら宣言側が正で、本書を直す。

---

## 版の選び方

**選定時点の最新安定版、ただし公開から7日（クールダウン）を経たもの**を採る。

1. ランタイム・ツールのメジャー版は、検証済みの組み合わせとして Java 25・Node 24・pnpm 11・Gradle 9・Spring Boot 4・Vite 8・Vue 3・Tailwind 4 とする。メジャー版は下記「更新の方針」の棚卸しで判定し、本書に理由を残す。
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
| Spring Session JDBC | 009 discord-login | クラスパスに載せるとセッションテーブルを要求する。テーブルは Flyway で作るので、その機能で一緒に入れる |
| Spring Security・OAuth2 Client（Discord） | 009 discord-login | 認証の要件（スコープ・リダイレクト URI・CSRF）を機能の中で決める。エンドポイントがまだ無いので保護対象も無い |

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
| @types/node | 24.13.6 | catalog。メジャーは Node 本体に合わせる（下記「更新の方針」）。24.19.0 はクールダウン中。`packages/solver` の devDependencies（テストと測定が Node の型を使う） |
| highs（HiGHS の WASM 版） | 1.15.3（2026-09-11） | `packages/solver` の dependencies。完全一致の版。MIT。採用（下記「HiGHS の測定結果」） |
| openapi-typescript | 7.13.0 | peer の `typescript ^5.x` は満たさない（6.0.3）が、生成は動作する（CI の型の鮮度検査で毎回確かめる） |
| @redocly/cli | 2.54.2 | 2.54.3 はクールダウン中 |
| swagger-ui-dist | 5.33.0 | 定義書の生成時のみ |

### 後の機能で導入するもの（今回は入れない）

| 項目 | 導入する機能 | 備考 |
|---|---|---|
| shadcn-vue の部品（reka-ui・class-variance-authority・clsx・tailwind-merge） | 004 solver-ui | `components.json` だけ置いてある。部品は CLI でソースとしてコピーする |
| アイコン | 004 solver-ui | `lucide-vue-next` は npm 上で deprecated。後継の `@lucide/vue`（1.49.0 が最新・2026-09-29）を導入時に確認する |
| vite-plugin-pwa | 未定（下記「PWA」） | **サプライチェーン対策の判断待ち** |
| Playwright | 004 solver-ui（e2e ジョブと同時） | 画面が無いため今回は入れない |

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
（ソルバーを DOM・API の型に依存させない方針を機械で守るため）。ただしテストと測定は `performance`・`console` を使うので、
`tsconfig.json` は `include` を `src/main/**` に絞り、`src/test/**` は `tsconfig.vitest.json`（`types: ["node"]`）で別に型検査する
（`type-check` script が両方を実行する）。Worker 用の型は後の機能で足す。

---

## 更新の方針（2026-10-02）

パッチ・マイナーは週次でまとめて取り込み、メジャーは四半期の棚卸しで計画して上げる。
Dependabot の設定（`.github/dependabot.yml`）はこの節に従う。

### 決めた経緯（2026-10-02 の実測）

- Dependabot は1パッケージ1PRで、パッチ・マイナー・メジャーを区別せずに届けていた。初回の実行で、
  不採用と決めている TypeScript 7（上記「判断 1」）の PR が届いた。
- `@types/node` が 26 系（catalog）なのに、実行環境は Node 24（`.nvmrc`・`engines`）だった（2026-10-02 に 24 系へ戻した）。
  その間は、Node 26 にしか無い API を使っても型チェックを通ってしまう状態だった。
- Dependabot は非推奨を知らせない。また、Dependabot の対象外のもの（`.nvmrc`・`.github/workflows/ci.yml` の
  `java-version`・Spring Boot BOM が解決する推移的依存）を点検する時期が決まっていなかった。

### パッチ・マイナー: 毎週、エコシステムごとに1本

- Dependabot の `groups` で、gradle・npm・github-actions・docker-compose ごとに、パッチ・マイナーを1本の PR にまとめる。
  CI が緑ならマージする。機能ブランチには混ぜない。
- クールダウンは7日にする（`pnpm-workspace.yaml` の `minimumReleaseAge` と揃える）。github-actions・docker-compose にも同じ7日を置く。
- セキュリティ更新は `groups` と `ignore` の対象外なので、個別に届く。届いたら、棚卸しを待たずに取り込む。

### メジャー: 四半期の棚卸しで計画して上げる

- Dependabot の `ignore` で、すべてのメジャーの version updates を止める。
- 棚卸しは 1月・4月・7月・10月の初めに行う。機能開発の区切りに、`chore/deps-review-YYYYQn` ブランチで進める。
  1. `pnpm outdated -r` と Maven Central のメタデータで、メジャーの差分と非推奨のパッケージを一覧にする。
  2. Dependabot の対象外（`.nvmrc`・CI の `java-version`）を点検する。compose のイメージのメジャーもここで見る。
  3. 1件ずつ「上げる／見送る」を決める。見送るものは下の一覧に、理由と次に見直す条件を書く。
  4. 上げるものは1メジャー1PRにして、README「検証コマンド」の全段（CI と同じ）を通す。
- 上げる条件（すべて満たすこと）:
  - GA から1か月以上たっている。
  - 依存先（peer 依存・Spring Boot BOM）が対応を宣言している。
  - ただし、現行版のサポート終了まで3か月を切ったときや、セキュリティ上の理由があるときは前倒しする。
- 個別の基準:
  - **Spring Boot**: 新しいマイナー（4.2 など）は推移的依存（Hibernate・Flyway 等）のメジャーを含むので、
    メジャーと同じように棚卸しで扱う。最初のパッチ（x.y.1）が出てから上げる。現行マイナーの OSS サポートが終わる前には必ず上げる。
  - **Java・Node**: LTS だけを使う。次の LTS への移行は、LTS 入りから半年たってからの棚卸しで行う。
    現行 LTS のサポートが終わる1年前までには移る。
  - **@types/node**: メジャーは Node 本体のメジャーに合わせる。
  - **vitest と @vitest/coverage-v8**: 同じ版にそろえて、1本の PR で上げる。
  - **pnpm**: 上記「版の選び方」1 に従う。
  - **PostgreSQL**: メジャーは、本番のマネージド DB（Neon が第一候補）の方針が決まるまで見送る。

### 見送り・是正待ちの一覧（2026-10-02 時点）

| 対象 | 現行 | 状態 | 次に見直す条件 |
|---|---|---|---|
| TypeScript | 6.0.3 | 7.x は見送り（上記「判断 1」） | typescript-eslint の peer が 7 を許したとき |
| vitest / @vitest/coverage-v8 | 5.0.1 | 5.0.3 で `why-is-node-running` が provenance のある 3.2.1 に固定され、上記「判断 2」の理由は解消する見込み | 週次のまとめ PR で取り込み、CI で確かめる |
| pnpm | 11.25.0 | 12 系は見送り | 次の棚卸し |
| Node | 24 LTS | Node 26 は 2026-10-28 に LTS 入り | 2027-04 以降の棚卸し（24 のサポート終了は 2028-04-30） |
| Spring Boot | 4.1.1 | 4.2 は 2026-09 時点でマイルストーン | 4.2.1 が出た後の棚卸し（4.1 の OSS サポート終了は 2027-07-31） |

---

## `temp/initial-design.md` §3.3 の確認結果（2026-10-02）

| 項目 | 結果 |
|---|---|
| マネージド DB の PostgreSQL 18 | **Neon: 提供あり**（14〜18 をサポート。2026-08 時点で 18.6。[Neon の版ポリシー](https://neon.com/docs/postgresql/postgres-version-policy)）。**Supabase: 新規プロジェクトでの提供告知を確認できず**（GitHub の Discussion で要望が出ている段階。17 のままの可能性が高い）。Neon が第一候補 |
| vite-plugin-pwa と Vite のメジャー版 | peer は適合。導入はサプライチェーン上の理由で保留（上記「判断 3」） |
| HiGHS WASM（npm `highs`） | 1.15.3（2026-09-11）。MIT。ESM（`build/highs.mjs`）と型定義あり、peer 依存なし。WASM は `highs/runtime` で取り出せる。採用（性能は下記「HiGHS の測定結果」） |
| TypeScript 7 と typescript-eslint | 不適合のまま（上記「判断 1」） |
| Cookie の同一サイト化 | 独自ドメインが未決のため未対応。dev では Vite の proxy で同一オリジンに見せている |

---

## HiGHS の測定結果（001 solver-spike・2026-10-04）

**結論: 合格。HiGHS（npm `highs` 1.15.3）を採用する。縮約は不要。**

- 条件: 合成データ（シード 20261003。上位防具 582・装飾品 361・生産護石 187。件数と分布は MHDB の実測値 `wilds.mhdb.io/en/*`・2026-10-03 取得に合わせた）。
  必須スキル 3／6／10 個 × 解あり／解なし。各ケースを 3 回。1 回の検索は防御力の最大化で最大 30 件まで列挙（1 件ごとに 1 回の求解）。
  HiGHS の初期化（`highs` の読み込み）は時間に含めない。
- 合格基準: 検索 1 回の合計時間の最大が 3 秒以下。
- 測定環境: Node v24.21.0・linux x64（WSL2）・AMD Ryzen 7 5700X。HiGHS 本体の版は `1.15.1 (04024d7)`（npm パッケージ 1.15.3 が同梱するもの）。
- 実行: `pnpm --filter @swv/solver run measure`（通常のテスト・CI では実行しない。出力は reporter が verbose のときだけ表示される）。

| ケース | 結果 | 求解回数 | 合計時間（3 回, ms） | 1 求解の最大（ms） |
|---|---|---|---|---|
| k=3 解あり | 30 件 | 30 | 760.2 / 624.6 / 600.4 | 91.7 / 23.0 / 23.7 |
| k=6 解あり | 30 件 | 30 | 712.6 / 665.2 / 685.1 | 42.7 / 26.5 / 27.4 |
| k=10 解あり | 30 件 | 30 | 652.7 / 635.7 / 627.9 | 28.9 / 23.8 / 24.5 |
| k=3 解なし | 解なし | 1 | 21.7 / 23.2 / 20.9 | 19.9 / 20.8 / 18.8 |
| k=6 解なし | 解なし | 1 | 22.2 / 22.6 / 22.4 | 20.4 / 20.1 / 20.6 |
| k=10 解なし | 解なし | 1 | 25.1 / 23.1 / 24.8 | 21.5 / 21.0 / 20.6 |

- 全ケース・全回の合計時間の最大: **760.2 ms**（基準 3000 ms に対して合格。余裕は約 4 倍）。
- 1 求解は 20〜25 ms で、必須スキルの数にほぼよらない。時間の大半は求解の繰り返し（30 回）。
- 縮約（必須スキルに寄与しない防具のまとめ）は、基準を超えなかったので加えていない。
- 限界: 合成データでの測定であり、実データ（002 のマスターデータ）と Worker 上での時間は未測定。実データでの再測定は 003、Worker での測定は 004。

---

## CI

`.github/workflows/ci.yml` のジョブは secret-scan / api / web / packages。e2e は 004 で追加する。

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
