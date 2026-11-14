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
| Spring Boot | 4.1.2 | `libs.versions.toml` の宣言（`./gradlew dependencies` で実測） |
| Spring Security（`spring-boot-starter-security`・`spring-boot-starter-security-oauth2-client`） | 7.1.2 | 009 で導入。Boot BOM が解決。Boot 4 のスターター名は `-security-oauth2-client`（旧 `-oauth2-client` ではない）。テスト用は `spring-boot-starter-security-test` |
| Spring Session JDBC（`spring-boot-starter-session-jdbc`） | 4.1.1 | 009 で導入。Boot BOM が解決。テーブルは Flyway の V2 で作る（jar 同梱の `schema-postgresql.sql` と一致を確認済み） |
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

### 後の機能で導入するもの

今は無い（009 discord-login で Spring Session JDBC と Spring Security・OAuth2 Client を導入した）。

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
| @types/node | 24.19.2 | catalog。メジャーは Node 本体に合わせる（下記「更新の方針」）。`packages/solver` の devDependencies（テストと測定が Node の型を使う） |
| highs（HiGHS の WASM 版） | 1.15.3（2026-09-11） | `packages/solver` の dependencies。完全一致の版。MIT。採用（下記「HiGHS の測定結果」） |
| yaml | 2.9.1（2026-09-11） | `packages/data` の devDependencies。完全一致の版。ISC・依存0。パイプラインがオーバーレイ（`overlays/*.yaml`）を読むときだけ使い、ブラウザへは配信しない。provenance は 2.9.0 以前にも無く、`trustPolicy: no-downgrade` に抵触しない |
| `@swv/solver`・`@swv/data` | `workspace:*` | `apps/web` の dependencies。ソルバーの入口と型、マスターの型（`import type` だけ） |
| highs | 1.15.3（2026-09-11） | `apps/web` の dependencies。Worker で HiGHS を初期化する。`packages/solver` と同じ版 |
| reka-ui | 2.10.5（2026-09-21） | shadcn-vue の部品の土台。2.11.0 はクールダウン中。推移的依存の `vue-demi` のビルドスクリプトは `allowBuilds` で遮断（`@floating-ui/vue` 経由。0.14.x の既定の出力は Vue 3 向け） |
| class-variance-authority | 0.7.1（2024-11-26） | shadcn-vue の部品の variant |
| clsx | 2.1.1（2024-04-23） | `cn()` |
| tailwind-merge | 3.7.0（2026-09-12） | `cn()` |
| @vueuse/core | 14.4.0（2026-07-29） | shadcn-vue の部品が import する。reka-ui 2.10.5 の要求 `^14.1.0` に合わせ、15.0.0 は採らない |
| tw-animate-css | 1.4.0（2025-09-24） | Dialog などの開閉アニメーションのクラス |
| @lucide/vue | 1.61.0（2026-10-21） | アイコン。`lucide-vue-next` は deprecated |
| @playwright/test | 1.63.0（2026-09-04） | `apps/web` の devDependencies。e2e と測定。Chromium だけ |
| wrangler | 4.153.0（2026-10-26） | `apps/web` の devDependencies。Worker の手元の実行とデプロイ。推移的依存の `esbuild`・`workerd` のビルドスクリプトは `allowBuilds` で遮断 |
| neon（Neon CLI） | 8.14.0（2026-10-30） | リポジトリ直下の devDependencies。完全一致の版。`pnpm exec neon` で使う。手元の運用（`neon link`・接続文字列の取得・使い捨てのブランチ）だけに使い、アプリからは import しない。グローバルに入れると Dependabot の対象外になるので、直下の依存にした。`neon.ts`（`@neon/config`・`@neon/env`）は作らない。ビルドスクリプトを持つ依存は無い |
| openapi-typescript | 7.13.0 | peer の `typescript ^5.x` は満たさない（6.0.3）が、生成は動作する（CI の型の鮮度検査で毎回確かめる） |
| @redocly/cli | 2.54.2 | 2.54.3 はクールダウン中 |
| swagger-ui-dist | 5.33.0 | 定義書の生成時のみ |
| tesseract.js | 7.0.0（2025-12-15） | **015 の測定は不合格（採否は Q117 で決める。決めるまで測定用に残す）**。`apps/web` の dependencies。完全一致の版。Apache-2.0。護石の画像の文字認識（015 ocr-spike）。ブラウザ内で動かし、画像を送らない。postinstall（寄付の案内の表示だけ）は `allowBuilds` で遮断 |
| tesseract.js-core | 7.0.0（2025-12-15） | **015 の測定は不合格（採否は Q117 で決める。決めるまで測定用に残す）**。`apps/web` の dependencies。完全一致の版。Apache-2.0。tesseract.js の要求 `^7.0.0` と同じ版。WASM コアを `vite.config.ts` のプラグインが自オリジンの固定のパスで配信するために直接の依存にする |
| @tesseract.js-data/jpn | 1.0.0（2023-09-04） | **015 の測定は不合格（採否は Q117 で決める。決めるまで測定用に残す）**。`apps/web` の dependencies。完全一致の版。MIT。言語データは `4.0.0_best_int/jpn.traineddata.gz`（約 2.0 MB）だけを使う |

### 後の機能で導入するもの（今回は入れない）

| 項目 | 導入する機能 | 備考 |
|---|---|---|
| vite-plugin-pwa | 未定（下記「PWA」） | **サプライチェーン対策の判断待ち** |

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
`packages/data` は Node の API を使うパイプラインを `src/main/pipeline/` に置くため `types: ["node"]` だが、ブラウザが読む入口 `src/main/index.ts` は型だけを直接書き、import を持たせない。`tsconfig.entry.json`（`types: []`・`include` は入口だけ）が入口だけを型検査し（`type-check` script が `tsconfig.json` の検査に続けて実行する）、入口が Node の API や Node 依存のモジュールを読み込むと型エラーで落ちる。

### 6. Web フォントは Google Fonts の CDN から読み込む（2026-10-08）

デザインシステムの一新（`design-system/skillweave/MASTER.md` の Typography）で、IBM Plex Sans JP（和欧）と Inter（数字）を
`apps/web/index.html` の `<link>` で Google Fonts の CDN から読み込むことにした。npm の依存ではないので、
`pnpm-workspace.yaml` のサプライチェーン対策（クールダウン・provenance）の対象外で、版の固定もない。

- 和文は文字の範囲ごとに分割して配信され、使う文字の分だけが読み込まれる。セルフホストより軽い。
- 利用者の IP アドレスが Google に送られる。プライバシーの表記（`/privacy`。030 privacy-notice）に書いてある。
- オフラインでは読み込めずフォールバックのシステムフォントになる。018 pwa-offline で、`fonts.googleapis.com`・
  `fonts.gstatic.com` を実行時にキャッシュする設定を足す。
- CSP を導入するときは、`style-src` に `https://fonts.googleapis.com`、`font-src` に `https://fonts.gstatic.com` を許可する。

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
  npm だけは本番の依存と開発の依存で2本に分ける（コミットの接頭辞を分けるため。「リリースと版」節）。
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
  - **PostgreSQL**: 本番のマネージド DB は Neon に決めた（`specs/028-api-prod-config/decisions.md` Q87）。本番も 18 で動かす（同 Q129）。メジャーを上げるには Neon の新しいプロジェクトへ移す必要があるので、次のメジャーへは手元と本番の移行の手順を決めてから上げる。

### 見送り・是正待ちの一覧（2026-10-02 時点）

| 対象 | 現行 | 状態 | 次に見直す条件 |
|---|---|---|---|
| TypeScript | 6.0.3 | 7.x は見送り（上記「判断 1」） | typescript-eslint の peer が 7 を許したとき |
| vitest / @vitest/coverage-v8 | 5.0.1 | 5.0.3 で `why-is-node-running` が provenance のある 3.2.1 に固定され、上記「判断 2」の理由は解消する見込み | 週次のまとめ PR で取り込み、CI で確かめる |
| pnpm | 11.25.0 | 12 系は見送り | 次の棚卸し |
| Node | 24 LTS | Node 26 は 2026-10-28 に LTS 入り | 2027-04 以降の棚卸し（24 のサポート終了は 2028-04-30） |
| Spring Boot | 4.1.2 | 4.2 は 2026-09 時点でマイルストーン | 4.2.1 が出た後の棚卸し（4.1 の OSS サポート終了は 2027-07-31） |

---

## `temp/initial-design.md` §3.3 の確認結果（2026-10-02）

| 項目 | 結果 |
|---|---|
| マネージド DB の PostgreSQL 18 | **Neon: 提供あり**（14〜18 をサポート。2026-08 時点で 18.6。[Neon の版ポリシー](https://neon.com/docs/postgresql/postgres-version-policy)）。**Supabase: 新規プロジェクトでの提供告知を確認できず**（GitHub の Discussion で要望が出ている段階。17 のままの可能性が高い）。Neon が第一候補 |
| vite-plugin-pwa と Vite のメジャー版 | peer は適合。導入はサプライチェーン上の理由で保留（上記「判断 3」） |
| HiGHS WASM（npm `highs`） | 1.15.3（2026-09-11）。MIT。ESM（`build/highs.mjs`）と型定義あり、peer 依存なし。WASM は `highs/runtime` で取り出せる。採用（性能は下記「HiGHS の測定結果」） |
| TypeScript 7 と typescript-eslint | 不適合のまま（上記「判断 1」） |
| Cookie の同一サイト化 | Web と API を同一オリジンにする（`specs/028-api-prod-config/decisions.md` Q84）。ドメインは `skillweave.app`（同 Q83）。dev では Vite の proxy で同一オリジンに見せている |

---

## HiGHS の測定結果（001 solver-spike・2026-10-04）

**結論: 合格。HiGHS（npm `highs` 1.15.3）を採用する。縮約は不要。**

- 条件: 合成データ（シード 20261003。上位防具 582・装飾品 361・生産護石 187）。件数と防具のスキル数の平均は MHDB の実測値
  （`wilds.mhdb.io/en/*`・2026-10-03 取得）に合わせた。スロットの構成とスキル Lv の分布は仮定の値。
  必須スキル 3／6／10 個 × 解あり／解なし。各ケースを 3 回。1 回の検索は防御力の最大化で最大 30 件まで列挙（1 件ごとに 1 回の求解）。
  HiGHS の初期化（`highs` の読み込み）は時間に含めない。
- 解なしの作り方: 単独では Lv 7 に届く希少なスキルを k 個選び、下限を Lv 7 にする（組み合わせとしてだけ満たせない）。
- 合格基準: 検索 1 回の合計時間の最大が 3 秒以下。
- 測定環境: Node v24.21.0・linux x64（WSL2）・AMD Ryzen 7 5700X。HiGHS 本体の版は `1.15.1 (04024d7)`（npm パッケージ 1.15.3 が同梱するもの）。
- 実行: `pnpm --filter @swv/solver exec vitest run --mode measure --reporter=verbose`
  （`pnpm --filter @swv/solver run measure` でも走るが、表は reporter が verbose のときだけ表示される。通常のテスト・CI では実行しない）。

| ケース | 結果 | 求解回数 | 合計時間（3 回, ms） | 1 求解の平均（ms） | 分枝のノード数・LP 反復数（最大） |
|---|---|---|---|---|---|
| k=3 解あり | 30 件 | 30 | 755.7 / 615.5 / 624.0 | 24.3 / 20.0 / 20.4 | 1 / 9 |
| k=6 解あり | 30 件 | 30 | 708.6 / 684.4 / 688.1 | 23.3 / 22.5 / 22.6 | 1 / 16 |
| k=10 解あり | 30 件 | 30 | 725.5 / 762.9 / 693.9 | 23.8 / 25.1 / 22.8 | 1 / 21 |
| k=3 解なし | 解なし | 1 | 7.8 / 8.5 / 7.7 | 6.5 / 6.0 / 6.4 | 0 / 0（presolve で判定） |
| k=6 解なし | 解なし | 1 | 22.6 / 23.4 / 20.7 | 20.1 / 20.7 / 18.6 | 1 / 18 |
| k=10 解なし | 解なし | 1 | 21.0 / 21.3 / 22.5 | 19.1 / 18.6 / 20.0 | 1 / 24 |

- 全ケース・全回の合計時間の最大: **762.9 ms**（k=10 解あり・2 回目。基準 3000 ms に対して合格。余裕は約 4 倍）。
- 1 求解の最大は初回の 1 回目だけ大きい（k=3 解ありで 88.1 ms）。それ以外は 50 ms 未満。時間の大半は 30 回の求解の繰り返し。
- 縮約（必須スキルに寄与しない防具のまとめ）は、基準を超えなかったので加えていない。
- 限界 1: 解ありの求解は、LP の解がそのまま整数解になり、分枝しない（ノード数 1）。解なしも presolve か根ノードの LP で判定され、
  分枝限定に入るケースは作れなかった（試した作り方: 解ありの構成の下限を +1〜+4 する・一部のスキルだけ +1〜+3 する・全スキルの下限を Lv 4〜7 にする・希少なスキルを選んで Lv 7 にする。旧方式の「単独の到達値そのもの」は Lv 17 超で、根ノードの LP で落ちていた。現実的な下限では、この定式化と合成データでは常に presolve か根ノードで決まる）。
  したがって、分枝が必要になる難しい入力（実データの偏り・装飾品の所持数の制限・シリーズスキル）での時間は、この測定からは分からない。003 以降で再測定する。
- 限界 2: 合成データでの測定であり、実データ（002 のマスターデータ）と Worker 上での時間は未測定。実データでの再測定は 003、Worker での測定は 004。

---

## HiGHS の実データでの再測定（003 solver-engine・2026-10-04）

**結論: 不合格。解ありのケースで検索 1 回の合計時間の最大が 7677.9 ms となり、基準の 3 秒を超えた。対策は `specs/open-questions.md` の Q20 に起票した（004 の着手前に決める）。**

- 条件: 実データ（`packages/data/dist/master-2026.10.1.json`。防具 714・装飾品 361・スキル 179・シリーズ／グループ 42・武器 1188）。武器はスキルを持たないマスターの武器 1 本に固定、護石なし、防御力の最大化、`maxResults` 30、`timeoutMs` 60 秒（打ち切りなし）。
  必須スキル 3／6／10 個 × 解あり／解なし。各ケースにシリーズ／グループスキル（火竜の力・鱗張りの技法）を含む。各ケースを 3 回。1 回の検索は `solveBuilds` の呼び出し全体（検証と組み立てを含む）。HiGHS の初期化は時間に含めない。
- 合格基準: 検索 1 回の合計時間の最大が 3 秒以下（001 と同じ）。
- 測定環境: Node v24.21.0・linux x64（WSL2）・AMD Ryzen 7 5700X。HiGHS 本体の版は `1.15.1 (04024d7)`（npm `highs` 1.15.3 が同梱するもの）。マスターの版は `2026.10.1`。
- 実行: `pnpm --filter @swv/solver exec vitest run --mode measure --reporter=verbose`（通常のテスト・CI では実行しない）。

| ケース | 結果 | 求解回数 | 合計時間（3 回, ms） | 1 求解の最大（ms） | 分枝のノード数・LP 反復数（最大） |
|---|---|---|---|---|---|
| k=3 解あり | 30 件 | 30 | 2223.4 / 1937.6 / 1717.0 | 177.7 | 1 / 274 |
| k=6 解あり | 30 件 | 30 | 4222.3 / 4085.4 / 4079.1 | 407.5 | 9 / 1399 |
| k=10 解あり | 30 件 | 30 | 7677.9 / 7663.3 / 7425.5 | 766.4 | 11 / 2283 |
| k=3 解なし | 解なし | 1 | 24.3 / 22.0 / 28.0 | 22.2 | 1 / 12 |
| k=6 解なし | 解なし | 1 | 33.0 / 30.0 / 34.1 | 28.7 | 1 / 34 |
| k=10 解なし | 解なし | 1 | 39.6 / 49.8 / 42.9 | 44.3 | 1 / 42 |

- 全ケース・全回の合計時間の最大: **7677.9 ms**（k=10 解あり・1 回目）。k=6 解ありも約 4.1 秒で基準を超え、k=3 解ありは基準内。
- 解ありの時間は、求解回数（30）と、後ろの求解ほど長くなること（観測。1 件ごとに除外の行が増えることが原因と推定しているが、切り分けていない）で決まる。k=10 の 1 求解は、最初の数件が約 30〜60 ms、最後の数件が約 600〜770 ms。001 の合成データ（合計 762.9 ms 以下）より大きく伸びた。
- 解なしは 20〜50 ms で、ノード数 1・LP 反復数 12〜42。反復数が 0 でないので presolve では落ちておらず、根ノードの LP 緩和で判定されている（presolve の内部で先に判定された可能性までは切り分けていない）。分枝には入らなかった。
- k=6・k=10 の解ありは分枝に入る（ノード数 9〜11、LP 反復数 1399〜2283）。k=3 の解ありは分枝しない（ノード数 1、LP 反復数 274）。001 の合成データの解ありはすべてノード数 1 だったので、001 の限界 1（分枝が必要になる入力の時間は未測定）のうち、実データでの解ありは今回測れた。解なしで分枝に入るケースは作れていない。
- 限界: Worker 上の時間（004 で測定済み。次節）、護石あり・装飾品の所持数の制限・目的関数が `freeSlots` のときの時間は未測定。
- 対策: Q20（`specs/open-questions.md`）。Q20 は 004 の決定（`specs/004-solver-ui/decisions.md`）へ移した。

## HiGHS のブラウザの Worker での測定（004 solver-ui・2026-10-07）

**結論: 合格。「検索」を押してから結果が表示されるまでの時間の最大が 1422.0 ms で、基準の 3 秒以下だった。** 003 の不合格（Node で件数 30・7677.9 ms）に対し、Q20 の読み替えで件数を既定の 10 にして測った。

- 条件: ブラウザ（Chromium）でビルドした web を `vite preview` で配信し、画面を操作して測る。実データ（`packages/data/dist/master-2026.10.2.json`）。武器はスキルを持たないマスターの先頭の武器、護石なし、目的は「防御力の最大化」、候補のランクは「下位」「上位」の両方、件数 10、`timeoutMs` 30 秒（打ち切りなし）。必須スキルは 003 と同じ 3／6／10 個 × 解あり／解なしの 6 ケース。各ケースを 3 回。各回で `page.goto` して条件を入れ直す。
- 時間の範囲: 「検索」の click の直前から、結果の見出し「<N> 件の構成が見つかりました」または解なしの Alert が見えるまでの、Node 側の経過時間。Playwright の往復の誤差を含む。HiGHS の初期化とマスターの読み込みは含めない。
- 合格基準: 全ケース・全回の時間の最大が 3 秒以下（001・003 と同じ）。
- 測定環境: Node v24.21.0・linux x64（WSL2）・AMD Ryzen 7 5700X（12 論理コア）・メモリ 19 GiB。ブラウザは Chromium 153.0.8010.12（Playwright 1.63.0 の headless shell）。HiGHS は npm `highs` 1.15.3（同梱の本体は `1.15.1 (04024d7)`）。マスターの版は `2026.10.2`。
- 実行: `pnpm --filter @swv/web run measure`（CI では実行しない）。

| ケース | 結果 | 時間（3 回, ms） |
|---|---|---|
| k=3 解あり | 10 件 | 993.2 / 879.9 / 879.5 |
| k=6 解あり | 10 件 | 1397.8 / 1379.9 / 1401.6 |
| k=10 解あり | 10 件 | 1422.0 / 1409.4 / 1420.8 |
| k=3 解なし | 解なし | 265.0 / 269.9 / 262.1 |
| k=6 解なし | 解なし | 268.8 / 265.4 / 262.5 |
| k=10 解なし | 解なし | 279.6 / 252.3 / 261.1 |

- 全ケース・全回の最大: **1422.0 ms**（k=10 解あり・1 回目）。
- 同じ条件の別の実行（実装担当の確認の 1 回）では、最大が 1930.6 ms（k=6 解あり・2 回目）で、他の回より約 500 ms 長かった。ゆらぎはあるが、どちらも基準内。
- 解なしの約 260 ms は、003 の Node での 20〜50 ms より長い。ページの再読み込みの後の画面の描画と Playwright の往復を含むため。この差の内訳は切り分けていない。
- 限界: 護石あり・装飾品の所持数の制限・目的が `freeSlots` のときの時間、件数 30 のときの Worker 上の時間は未測定。時間は Node 側の経過で、画面上の体感（初回の描画など）とは一致しない。

---

## HiGHS の expectedDamage の測定（006 damage-model・2026-10-24）

> 019 damage-solve-perf の再測定の結果（求解の方式の変更後）は「HiGHS の expectedDamage の再測定（019 damage-solve-perf・2026-10-24）」の節を参照する。

**結論: 不合格。合計時間の最大が 54974.3 ms で、基準の 3 秒を超えた。** 対策は `specs/open-questions.md` の Q41 に起票した。

- 条件: Node で `solveBuilds` を直接呼ぶ（`packages/solver/src/test/solveBuilds.measure.ts` の `expectedDamage` のケース）。実データ（`packages/data/dist/master-2026.10.4.json`）。目的は `expectedDamage`、発動条件はマスターのすべてを有効にする、武器はマスターの先頭の武器、護石なし、`maxResults` 10、`timeoutMs` 60 秒。必須スキルは 003 と同じ 3／6／10 個 × 解あり／解なしの 6 ケース。各ケースを 3 回。
- 時間の範囲: 検索1回の合計時間（1件ごとの 2 段の求解を含む。HiGHS の初期化は含めない）。
- 合格基準: 全ケース・全回の合計時間の最大が 3 秒以下（001・003・004 と同じ）。
- 測定環境: Node v24.22.1・linux x64（WSL2）・AMD Ryzen 7 5700X（12 論理コア）。HiGHS は npm `highs` 1.15.3（同梱の本体は `1.15.1 (04024d7)`）。マスターの版は `2026.10.4`（防具 714・装飾品 361・スキル 179・シリーズ／グループ 42・武器 1188）。
- 実行: `pnpm --filter @swv/solver exec vitest run --mode measure --reporter=verbose --silent=false -t "expectedDamage"`（CI では実行しない。`--silent=false` を付けないと出力が見えない）。

| ケース | 結果 | 求解の回数 | 合計時間（3 回, ms） | 1回の求解の最大（ms） |
|---|---|---|---|---|
| k=3 解あり | 10 件 | 20 | 54974.3 / 54749.4 / 54623.1 | 4627.1 |
| k=6 解あり | 10 件 | 20 | 26979.1 / 27048.1 / 26990.0 | 2389.9 |
| k=10 解あり | 10 件 | 20 | 27587.8 / 27579.5 / 27591.4 | 2535.8 |
| k=3 解なし | 解なし | 1 | 35.7 / 32.4 / 32.5 | 23.6 |
| k=6 解なし | 解なし | 1 | 36.1 / 37.4 / 33.5 | 27.0 |
| k=10 解なし | 解なし | 1 | 41.2 / 39.8 / 40.1 | 33.1 |

- 全ケース・全回の最大: **54974.3 ms**（k=3 解あり・1 回目）。解ありのケースは 10 件 × 2 段 = 20 回の求解が要り、1回が 0.4〜4.6 秒かかる。解なしのケースは 1 回の求解で終わり、基準内。
- 対策の案と判断は Q41 に置く。
- 限界: 護石あり・装飾品の所持数の制限・件数 30 のときは未測定。ブラウザの Worker 上の時間は未測定（004 の測定と同じ経路では測っていない）。

## HiGHS の expectedDamage の再測定（019 damage-solve-perf・2026-10-24）

**結論: 1件目までの時間の基準で合格。合計時間の最大は 37739.4 ms で 3 秒を超えるため、基準を「1件目が求まるまでの時間の最大が 3 秒以下」に読み替えた（`specs/019-damage-solve-perf/decisions.md` Q41）。1件目までの最大は 2609.6 ms。** 合格は、進捗の通知（`SolveOptions.onProgress` の第2引数・Worker の `progress` の `build`）で構成が1件ずつ呼び出し側へ届くことが前提で、画面の逐次表示は 007 で行う。1件目の余裕は約 0.4 秒と小さい。

- 条件: 006 と同じ（実データ・発動条件はすべて有効・マスターの先頭の武器・護石なし・`maxResults` 10・`timeoutMs` 60 秒・必須スキル 3／6／10 個 × 解あり／解なしの 6 ケース・各 3 回・Node）。
- 時間の範囲: 合計時間は検索1回の全体。1件目までの時間は、開始から最初の `onProgress` の呼び出しまで。どちらも HiGHS の初期化を含めない。
- 採った方式（plan D11。`blend_multi_objectives` の `false` と空き Lv の重みを補助の目的にする点は実装で足した）: HiGHS の `presolve` を `off`、`mip_allow_restart` を `false`、`blend_multi_objectives` を `false` にし、`Model.passLinearObjectives` で期待値 θ（優先度 10）と空き Lv の重み（優先度 5）を補助の目的として渡して、1件につき1回の求解にした（006 は 2 段で 20 回）。厳密さ（期待値の最大から順、同点は防具用、次に武器用の空き Lv の合計）は変えていない。支配される候補の除外は採っていない。
- 測定環境: 006 と同じ（Node v24.22.1・linux x64（WSL2）・AMD Ryzen 7 5700X。HiGHS は npm `highs` 1.15.3、同梱の本体は `1.15.1 (04024d7)`。マスターの版は `2026.10.4`）。
- 実行: `pnpm --filter @swv/solver exec vitest run --mode measure --reporter=verbose --silent=false -t "expectedDamage" src/test/solveBuilds.measure.ts`（CI では実行しない）。

| ケース | 結果 | 求解の回数 | 合計時間（3 回, ms） | 1件目まで（3 回, ms） | 1回の求解の最大（ms） |
|---|---|---|---|---|---|
| k=3 解あり | 10 件 | 10 | 37739.4 / 37458.5 / 37466.4 | 2609.6 / 2392.2 / 2403.4 | 5234.6 |
| k=6 解あり | 10 件 | 10 | 23361.3 / 23334.8 / 23319.2 | 1885.4 / 1877.8 / 1879.8 | 3290.7 |
| k=10 解あり | 10 件 | 10 | 26490.9 / 26517.6 / 26472.6 | 2577.5 / 2588.7 / 2583.1 | 3583.5 |
| k=3 解なし | 解なし | 1 | 19.8 / 27.5 / 21.3 | なし | 11.0 |
| k=6 解なし | 解なし | 1 | 19.7 / 25.2 / 18.5 | なし | 10.9 |
| k=10 解なし | 解なし | 1 | 21.3 / 19.7 / 18.6 | なし | 11.4 |

- 全ケース・全回の最大: 合計時間 **37739.4 ms**（3 秒に対し FAIL）、1件目までの時間 **2609.6 ms**（3 秒に対し PASS）。006（54974.3 ms）からの合計時間の短縮は約 31%。
- 試作（T2）では `blend_multi_objectives` を設定せず、合計 19 秒・1件目 1.1 秒だった。本実装は優先度を効かせるため `blend_multi_objectives` を `false` にし、空き Lv の重みも補助の目的にした。試作より遅いのは、これらの違いによると考えられる（切り分けの測定はしていない）。
- 限界: 006 と同じ（護石あり・所持数の制限・件数 30）。ブラウザの Worker 上の時間は「ブラウザの Worker 上の expectedDamage の測定（007 damage-ui・2026-10-26）」の節に記録した。

## ブラウザの Worker 上の expectedDamage の測定（007 damage-ui・2026-10-26）

再測定は「ブラウザの Worker 上の expectedDamage の再測定（024 worker-solve-perf・2026-10-29）」の節を見る。

**結論: 1件目までの時間の基準（最大 3 秒以下）で不合格。1件目までの最大は 3353.6 ms（Node の 2609.6 ms より約 0.74 秒遅い）。合計時間の最大は 30599.4 ms で、k=3 解ありの 3 回は画面の上限 30 秒（`SOLVE_TIMEOUT_MS`）で打ち切られた（8 件）。** 対策は `specs/open-questions.md` の Q50 に起票した（`specs/007-damage-ui/decisions.md` Q49 により、007 はこの記録をもって進める）。

- 条件: 019 と同じ（実データ・発動条件はすべてオン・マスターの先頭の武器・護石なし・件数 10・候補のランクは下位と上位・必須スキル 3／6／10 個 × 解あり／解なしの 6 ケース・各 3 回）。ただし画面（Chromium の Worker）を通すので、時間の上限は画面の `SOLVE_TIMEOUT_MS`（30 秒）。019 の Node の測定は 60 秒。
- 時間の範囲: 1件目までの時間は、「検索」を押してから、逐次表示の「構成 1」のカードが出るまで。合計時間は、「検索」を押してから、検索中の表示が消えて結果（解あり・打ち切り・解なし）が出るまで。どちらも HiGHS の初期化とマスターの読み込みを含めない。
- 測定環境: Chromium 156.0.8078.4（Playwright）・Node v24.22.1・linux x64（WSL2）・AMD Ryzen 7 5700X・マスターの版 `2026.10.4`・HiGHS は npm `highs` 1.15.3。`--workers=1` で 007 の測定だけを実行した（既定の 2 ワーカーでは 004 の測定と並走し、最大が 3361.2 ms・合計が 31612.9 ms と近い値だった）。
- 実行: `pnpm --filter @swv/web run measure --workers=1 damage-ui`（CI では実行しない）。

| ケース | 結果 | 合計時間（3 回, ms） | 1件目まで（3 回, ms） |
|---|---|---|---|
| k=3 解あり | 8 件・30 秒で打ち切り（3 回とも） | 30599.4 / 30090.3 / 30090.3 | 3353.6 / 2848.4 / 3347.9 |
| k=6 解あり | 10 件 | 25056.1 / 25063.4 / 25061.0 | 2347.0 / 2346.1 / 2341.9 |
| k=10 解あり | 10 件 | 29114.3 / 28612.6 / 28605.6 | 3349.5 / 3351.5 / 3347.6 |
| k=3 解なし | 解なし | 231.6 / 229.9 / 231.6 | なし |
| k=6 解なし | 解なし | 233.1 / 233.7 / 233.0 | なし |
| k=10 解なし | 解なし | 235.2 / 231.9 / 236.4 | なし |

- 全ケース・全回の最大: 合計時間 **30599.4 ms**、1件目までの時間 **3353.6 ms**（3 秒に対し FAIL）。
- 画面を通した 1件目までの時間は、k=3 の2回目（2848.4 ms）と k=6（2.3 秒台）を除き、3.35 秒前後にそろっていた。019 の Node の値（k=3 で 2.4〜2.6 秒、k=10 で 2.6 秒）より、k=3・k=10 で約 0.7 秒長い。原因の切り分けはしていない。
- 限界: 護石あり・所持数の制限・件数 30 は未測定。解ありの 3 ケースは、合計時間が上限の 30 秒に近いか届いている。

---

## HiGHS の生産護石を候補に含めた測定（021 crafted-charm・2026-10-28）

高速化後の画面の再測定は「ブラウザの Worker 上の expectedDamage の再測定（024 worker-solve-perf・2026-10-29）」の節を見る。

**結論: 生産護石を候補に含めると、`expectedDamage` の1件目までの時間の最大が 2987.8 ms（PASS）から 4522.8 ms（FAIL）になり、3 秒の基準を超えた。`defense` の合計時間の最大は 4525.9 ms（護石なし）と 4173.0 ms（生産護石あり）で、どちらも護石なしの時点で基準を超えていた。** 021 では高速化せず、機能 024 worker-solve-perf（`specs/feature-map.md`）で扱う（`specs/021-crafted-charm/decisions.md` Q77）。

- 条件: 003 の `defense` と 006 の `expectedDamage` のケースをそのまま使い（実データ・マスターの先頭の武器・必須スキル 3／6／10 個 × 解あり／解なしの 6 ケース。`defense` は件数 30、`expectedDamage` は件数 10）、護石の候補だけを変えた。護石なし・生産護石ありとも各 3 回。
- 候補: 生産護石 60 件（マスターの生産護石 183 件を、系統ごとの最上位ランクに絞った。`apps/web` の `craftedSolverCharms` と同じ規則）。鑑定護石は含めない。
- 測定環境: Node v24.22.1・linux x64（WSL2）・AMD Ryzen 7 5700X・マスターの版 `2026.10.4`・HiGHS は npm `highs` 1.15.3（ハーネスが出力する版の文字列は 1.15.1）。
- 実行: `pnpm --filter @swv/solver exec vitest run --mode measure --reporter=verbose --silent=false src/test/solveBuilds.measure.ts`（CI では実行しない。全体で約 17 分）。

| ケースの組 | 護石 | 合計時間の最大（ms） | 1件目までの最大（ms） | 3 秒の基準 |
|---|---|---|---|---|
| `defense` | なし | 4525.9 | — | FAIL（合計） |
| `defense` | 生産護石あり | 4173.0 | — | FAIL（合計） |
| `expectedDamage` | なし | 42325.1 | 2987.8 | 合計 FAIL・1件目 PASS |
| `expectedDamage` | 生産護石あり | 51949.9 | 4522.8 | 合計 FAIL・1件目 FAIL |

- `defense` の最大は、どちらも k=10 のケース（護石なしは解あり、生産護石ありは「解なし」ケース）。生産護石ありの「解なし」ケースは、護石が増えて解が見つかるようになり、状態が `optimal` になった（護石なしでは `infeasible`）。このため、生産護石あり側は解あり・解なしの区別なく、解を30件（`expectedDamage` は10件）出すまでの時間である。
- `expectedDamage` の1件目までの最大 4522.8 ms は、k=6 解ありの生産護石あり。生産護石ありでは、1件目が 3 秒を超えたケースが 6 ケース中 3 つある（k=6 解あり 4.3〜4.5 秒、k=10 解あり 3.03〜3.05 秒、k=10 解なし 3.03〜3.09 秒。「解なし」ケースは護石が増えて解が出るようになったもの）。護石なしの解ありの 3 ケースは 2.1〜3.0 秒（最大 2987.8 ms で、基準に近い）だった。
- 限界: 鑑定護石を併せた候補・所持数の制限・件数 30 の `expectedDamage` は未測定。ブラウザの Worker 上の時間は測っていない（Node の値）。

## ブラウザの Worker 上の expectedDamage の再測定（024 worker-solve-perf・2026-10-29）

**結論: `expectedDamage` の1件目までの時間の最大（生産護石のオンとオフの全ケース・全回）は 3353.4 ms で、3 秒の基準は不合格。基準を 5 秒に読み替えると合格（`specs/024-worker-solve-perf/decisions.md` Q50）。024 の前の 5376.9 ms から約 38% 縮んだ。生産護石オンは 5376.9 → 2852.3 ms（3 秒以下）になり、3 秒を超えるのはオフの k=3 解ありだけ（3348〜3353 ms。024 の前の 2847〜3353 ms から変わらない）。`defense` の合計時間の最大は 874.9 ms で、3 秒の基準に合格。** 採った方式は、支配される候補の除外（候補 (b)）だけ。

- 条件: 007 と同じ（実データ・発動条件はすべてオン・マスターの先頭の武器・件数 10・候補のランクは下位と上位・必須スキル 3／6／10 個 × 解あり／解なしの 6 ケース・各 3 回・上限は画面の `SOLVE_TIMEOUT_MS`（30 秒））。ただし「生産護石を候補に含める」のオンとオフの両方を測る。`defense` は 004 と同じ条件（件数 10・各 3 回）で、同じくオンとオフの両方。`pnpm --filter @swv/web run measure --workers=1`（`apps/web/e2e/measure/damage-ui.measure.ts`・`solver-ui.measure.ts`）。
- 測定環境: Chromium 156.0.8078.4（Playwright）・Node v24.22.2・linux x64（WSL2）・AMD Ryzen 7 5700X・マスターの版 `2026.10.4`・HiGHS は npm `highs` 1.15.3。
- 採った方式: `expectedDamage` のとき、固定・除外を適用した後の防具・装飾品・生産護石のうち、関係するスキル（必須スキルと期待値の対象のスキル）・スロット（防具・生産護石）・Lv（装飾品）の点で他の候補に支配されるものを、モデルに入れない。互いに等しい候補は並びの最初だけを残す。鑑定護石は対象外。会心倍率の候補ごとの分解などは採っていない。2件目以降の列は、除外前と変わりうる（019 decisions.md Q41 で許容。1件目は全ケースで一致）。実装は `packages/solver/src/main/dominance.ts`。
- 試作して採らなかった方式（Node・実データ・1件目までの時間の最大。decisions.md Q50 に表）: 会心倍率の候補ごとに分けて解く (a) は、単独ではオンで少し縮み（3111〜3682 ms。現行 4083 ms）、オフで悪化した（3603〜3756 ms。現行 2699 ms）。どちらも 1 回の測定で、(b) ほどの差ではない。(a) と (b) の組み合わせは、オン 2128 ms・オフ 2650 ms で (b) 単独（オン 2420 ms・オフ 2664 ms）との差が小さいため、実装が小さい (b) 単独にした。下限の受け渡し (c)・HiGHS の設定 (d) は効かなかった（現行と同程度）。
- 024 の前の基準値（現行の実装・同じ環境）: `expectedDamage` の1件目までの時間の最大はオン 5376.9 ms（k=6 解あり）・オフ 3860.0 ms（k=10 解あり）・全体 5376.9 ms。`defense` の合計時間の最大はオン 1372.7 ms・オフ 868.7 ms。

`expectedDamage` の1件目までの時間（ms。3 回の範囲）と、画面の上限（30 秒）で打ち切られた件数:

| ケース | オフ（024 の前） | オフ（024 の後） | オン（024 の前） | オン（024 の後） |
|---|---|---|---|---|
| k=3 解あり | 2847〜3353 | 3348〜3353 | 2843〜2857 | 2346〜2350 |
| k=3 解なし | 解なし | 解なし | 2341〜2349 | 1843〜2345 |
| k=6 解あり | 2344〜2347 | 1842〜1844 | 5368〜5377 | 2846〜2849 |
| k=6 解なし | 解なし | 解なし | 1843〜1853 | 1840〜1845 |
| k=10 解あり | 3859〜3860 | 1841〜1845 | 3356〜3860 | 2346 |
| k=10 解なし | 解なし | 解なし | 3860〜3861 | 2848〜2852 |
| 最大 | 3860.0 | 3353.4 | 5376.9 | 2852.3 |

- 「解なし」は、オフでは `infeasible`（130〜240 ms で返る）。オンでは護石が増えて解が出るため、10 件の構成が出る（k=10 解なしの 024 の前は 30 秒で打ち切り・8 件）。このため、オンの「解なし」ケースの1件目までの時間は解を出すまでの時間である。
`expectedDamage` の合計時間（ms。3 回の範囲。参考で、基準にしない）。画面の上限（30 秒）で打ち切られた件数は「打ち切り」の列:

| ケース | オフ（024 の前） | オフ（024 の後） | オン（024 の前） | オン（024 の後） |
|---|---|---|---|---|
| k=3 解あり | 30092〜30099（打ち切り・8 件） | 30108〜30597（打ち切り・8 件） | 30097〜30104（打ち切り・8 件） | 30095（打ち切り・7 件） |
| k=3 解なし | 231〜236 | 132〜137 | 29620〜29632 | 23049〜23065 |
| k=6 解あり | 25062〜26616 | 23055〜23564 | 32667〜33173（打ち切り・8 件） | 31626〜32138（打ち切り・9 件） |
| k=6 解なし | 234〜244 | 232〜234 | 18559〜19064 | 11455〜11465 |
| k=10 解あり | 30680〜31742（2 回目だけ打ち切り・9 件） | 21551〜22053 | 30122〜30137（打ち切り・6 件） | 30111〜30123（打ち切り・8 件） |
| k=10 解なし | 235〜239 | 233〜236 | 31729〜32177（打ち切り・8 件） | 27107〜27647 |
| 最大 | 31741.6 | 30596.9 | 33172.8 | 32137.5 |

`defense` の合計時間（ms。3 回の範囲）。`defense` の求解は変えていないので、024 の前後の差は測定のばらつきの範囲:

| ケース | オフ（024 の前） | オフ（024 の後） | オン（024 の前） | オン（024 の後） |
|---|---|---|---|---|
| k=3 解あり | 865〜869 | 857〜866 | 844〜857 | 365〜851 |
| k=3 解なし | 130〜229 | 128〜133 | 843〜857 | 834〜858 |
| k=6 解あり | 856〜864 | 853〜863 | 841〜875 | 839〜844 |
| k=6 解なし | 233〜235 | 231〜236 | 845〜889 | 839〜850 |
| k=10 解あり | 858〜867 | 857〜864 | 846〜851 | 836〜848 |
| k=10 解なし | 235〜238 | 233〜237 | 1353〜1373 | 842〜875 |
| 最大 | 868.7 | 865.6 | 1372.7 | 874.9 |

- 「解なし」のオフは `infeasible`、オンは 10 件の構成が出る（上の `expectedDamage` の説明のとおり。`defense` のオンも `found(10)`）。

次の対策は起票していない（`expectedDamage` は 5 秒に読み替えて合格・`defense` は 3 秒に合格のため）。オフの k=3 解ありの 3 秒超（3.35 秒）を縮める必要が出たら、(b) で縮まなかった定式化の見直しを新しい Q として起票する。

---

## 本番の構成（2026-11-02）

Web は 2026-11-03 に初めてデプロイし、2026-11-07 に v0.1.0、続けて v0.2.0（034 の ID トークンの付与）を出した。Neon のプロジェクトは 2026-11-04 に作った。API は 2026-11-07 に Cloud Run（Singapore）へ初めてデプロイし、起動時の Flyway で V1〜V6 が `neondb` に入った。同日に Worker の `API_ORIGIN` と `API_INVOKER_KEY` を登録し、`/api/*` が Cloud Run へ届くようになった。決定の経緯は `specs/028-api-prod-config/decisions.md` の Q83・Q84・Q87・Q129・Q131 に、残りの手順は `specs/open-questions.md` の Q88 にある。無料枠は 2026-11-02 に確認した値で、変わりうる。

| 用途 | 採用 | 無料枠と設定 |
|---|---|---|
| ドメイン・DNS | Cloudflare Registrar（`skillweave.app`） | ドメイン代だけ費用がかかる |
| 連絡先のメール | Cloudflare Email Routing（`contact@skillweave.app` を運営者の受信箱へ転送。2026-11-14 に有効化） | 無料。受信と転送だけで、送信はしない。キャッチオールは無効 |
| Web・マスターデータ | Cloudflare Workers Static Assets | 静的配信は無料で無制限。Worker の実行は 10 万回/日で、`/api/*` の転送がこれを消費する |
| API | Cloud Run（Singapore。2026-11-07 に東京と測って決めた） | 月 18 万 vCPU 秒・36 万 GB 秒・200 万リクエスト（Tier 1 の地域の値。Singapore は下の「費用」を見る）。課金アカウントが要り、超えると課金される。`max-instances=1` と予算を設定する |
| DB | Neon（`aws-ap-southeast-1`。PostgreSQL 18。最大 0.25 CU） | 月 100 CU 時間・1 GB・転送量 5 GB。課金はされず、CU 時間か転送量を超えるとコンピュートが止まり、ストレージを超えると書き込みが止まる |
| イメージの保管 | Artifact Registry | 0.5 GiB。最新版だけを残す |

Web は Pages でなく Workers にする。どちらも静的配信は無料で、`/api/*` の転送は同じ Workers の枠を消費する。Cloudflare の資料は Workers を機能の広い基盤とし、Pages からの移行手順を示している（Pages の廃止の告知は確認していない）。

### 費用

2026-11-04 に Google Cloud の公式の料金ページで確かめた値で、変わりうる。金額は USD で、日本円の単価は確かめていない。

Cloud Run の単価（リクエストベースの課金）:

| 項目 | Singapore（`asia-southeast1`） | 東京（`asia-northeast1`） |
|---|---|---|
| CPU（処理中。vCPU 秒） | $0.0000336 | $0.000024 |
| メモリ（処理中。GiB 秒） | $0.0000035 | $0.0000025 |
| CPU・メモリの待機（最小インスタンスだけ。各単位） | $0.0000035 | $0.0000025 |
| リクエスト（100 万件） | $0.40 | $0.40 |
| インターネットへの転送（最初の段階。GiB） | $0.19 | $0.12（アジア宛て） |

- 課金されるのは、インスタンスの起動中、SIGTERM の処理中、リクエストの処理中で、100 ミリ秒単位に切り上げる。最小インスタンスでない待機中のインスタンスは課金されない。
- 無料枠は請求先アカウント単位で毎月リセットされ、Tier 1 の単価による金額の割引として適用される（CPU $4.32・メモリ $0.90）。Singapore の単価で割ると、月 12.9 万 vCPU 秒（1 vCPU で約 36 時間）・25.7 万 GiB 秒になる。この換算は資料の記載からの計算で、請求での確認はまだしていない。
- インターネットへの転送の無料枠は北米からの 1 GiB だけで、Singapore と東京には無い。Cloud Run から Cloudflare と Neon への通信はこれに当たると読んでいる（請求での確認はまだしていない）。同じ地域の Google Cloud 内の転送は無料。

| 構成（Singapore・1 vCPU・1 GiB） | 月額の目安 |
|---|---|
| 最小 0、処理中が月 36 時間以内 | CPU とメモリは無料枠の範囲 |
| 最小 1、待機だけ | 約 $13 |
| 最大 1 インスタンスが 30 日間ずっと処理中 | 約 $91（東京は約 $63）に、リクエストと転送の費用が加わる |

`max-instances=1` は CPU とメモリの費用だけを抑える。リクエスト数と転送量は抑えない。

その他のサービス:

| サービス | 無料枠 | 超えた分 |
|---|---|---|
| Artifact Registry | 請求先アカウントで 0.5 GiB | 約 $0.10/GiB・月。同じ地域からの取得は無料、アジア内の別の地域は $0.05/GiB |
| Secret Manager | 請求先アカウントで有効なバージョン 6 個・アクセス 1 万回/月 | 約 $0.06/バージョン・月、$0.03/1 万回。無効にしない古いバージョンも数える |
| Cloud Logging | プロジェクトごとに月 50 GiB、30 日の保持 | $0.50/GiB、30 日を超える保持は $0.01/GiB・月 |

費用の上限:

- 通常の予算（alerts-only）は通知するだけで、使用も課金も止めない。判定は割引を引いた後の実際の費用で、税を含む。月の費用は翌月 2 日まで数える。通知の割合は変えられ（既定は実費の 50・90・100%）、見込みの額でも通知できる。
- spend cap の予算は、1 プロジェクトの 1 サービスを対象に月単位で設定でき、Cloud Run は対象に入っている。超えるとそのサービスの新しい使用を翌月 1 日まで止める。リソースとデータは消えない。適用は即時でなく、超過分は通常どおり請求される。判定は定価の見積もりで、割引とクレジットを含まない。無料枠が割引として扱われるなら、無料枠の範囲の使用でも上限に届く。転送の費用が判定に含まれるかは、資料に記載が見つからない。通知は 50・80・100% で、請求先アカウントの管理者とプロジェクトのオーナーに届き、変えられない。同じプロジェクトの同じサービスはすべて数えるので、地域の測定で出す東京のサービスも含まれる。手で解除すると、その月は額を上げて保存し直すまで再び止まらない。止まっている間は編集も削除もできない。
- 課金を無効にする自動化は、プロジェクトの全サービスを止め、リソースが消えることがあると資料が警告している。

予算（2026-11-07 に決定）:

| 予算 | 金額と通知 | 理由 |
|---|---|---|
| spend cap（`skillweave` のプロジェクトの Cloud Run） | 月 ¥1,500（$10 相当）。通知は固定 | 普段の定価の見積もり（月 $1 弱。費用の大半は起動）の約 10 倍で、地域の測定でも止まりにくい。`/api/*` を叩かれたときの損失を $10 と報告の遅れの分に抑える |
| 通常の予算（請求先アカウント全体） | 月 ¥150（$1 相当）。実費の 50・90・100% と見込みの 100% で通知 | 普段は無料枠の範囲で $0 の見込みなので、請求が出たらすぐ気づける。spend cap の外の費用（Artifact Registry・Secret Manager・Logging・転送）を見張る |

請求先アカウントの通貨は JPY なので、金額を円で決めた（2026-11-07。ユーザーの決定）。転送の費用がどのサービスの費目に出るかは C3 で確かめる。2026-11-11 の実測（下の「稼働の実測」）で、11 月 1〜11 日の定価は Cloud Run の ¥4 だけで、金額は据え置いた。

新規の無料トライアルは $300・90 日で、有料へ切り替えないまま期限が来るか使い切ると、アカウントを閉じてリソースを止め、30 日の猶予の後に完全に削除する。

資料: [Cloud Run](https://cloud.google.com/run/pricing)・[Artifact Registry](https://cloud.google.com/artifact-registry/pricing)・[Secret Manager](https://cloud.google.com/secret-manager/pricing)・[ネットワーク](https://cloud.google.com/vpc/network-pricing)・[Observability](https://cloud.google.com/products/observability/pricing)・[予算](https://docs.cloud.google.com/billing/docs/how-to/budgets)・[spend cap](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps)・[課金の無効化](https://docs.cloud.google.com/billing/docs/how-to/disable-billing-with-notifications)・[無料の機能](https://docs.cloud.google.com/free/docs/free-cloud-features)

### Web のデプロイ手順

通常は `.github/workflows/release.yml` が出す（「リリースと版」節）。release-please のリリース PR をマージすると、作られたタグをチェックアウトし、単体テスト・ビルド・測定ページの除外の確認・`wrangler deploy --dry-run`・`wrangler deploy --tag <タグ> --message <タグ>` を順に実行し、下の手順 4 の表のうち `/`・`/privacy`・`/api/auth/me` の応答を確かめる。既存のタグを出し直すときと前の版へ戻すときは、Actions の Release を `workflow_dispatch` で実行し、タグを指定する。画面の確認（表の残りの行）は、デプロイの後に運営者がブラウザで行う。

ワークフローの準備（運営者が行う）:

- GitHub App: このリポジトリだけに入れる。権限は Contents・Pull requests・Issues の Read and write（release-please がブランチ・PR・ラベルを作る）。Client ID を Variable の `RELEASE_APP_CLIENT_ID` に、秘密鍵を Secret の `RELEASE_APP_PRIVATE_KEY` に入れる。
- Environment `production`: デプロイを許すブランチは `main` だけ。Secret の `CLOUDFLARE_API_TOKEN`（テンプレートは「Edit Cloudflare Workers」で、アカウントと `skillweave.app` のゾーンに絞る）と Variable の `CLOUDFLARE_ACCOUNT_ID` を入れる。カスタムドメインの経路に要るゾーンの権限は、公式資料に記載が無い（2026-11-07 に確認）。このテンプレートの範囲で、v0.1.0 のカスタムドメインへのデプロイが通った（2026-11-07）。

ワークフローが使えないときは、手元から手動で出す。`wrangler login` は運営者が行う。

1. 配備するコミットをチェックアウトし、リポジトリ直下で依存を入れてビルドし直す。`test:e2e` の後の `apps/web/dist` には OCR の測定ページが入っているので、配備に使わない。

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @swv/web run build
   ```

2. `apps/web/dist` に `charm-ocr` のパスが無いことを確かめる。

   ```bash
   find apps/web/dist -ipath '*charm-ocr*'
   ```

3. 内容を確かめてからデプロイする。

   ```bash
   pnpm --filter @swv/web exec wrangler deploy --dry-run
   pnpm --filter @swv/web exec wrangler deploy
   ```

4. 本番の応答を確かめる。

   | 確認 | 期待する結果 |
   |---|---|
   | `/`・`/privacy`・`/builds` | 200 の `text/html`。ブラウザで画面と「非公式の二次創作」のバッジが出る |
   | `/` で武器を選んで検索 | 構成が表示される（ログインは不要） |
   | `/master-<版>.json` | 200 の `application/json` |
   | `/api/auth/me` | API の接続前は 503 の `application/problem+json` |

戻すときは、前のタグで Release を `workflow_dispatch` で実行する。ワークフローが使えないときは `wrangler rollback` で前の版へ戻す。版はタグ名で `wrangler deployments list` に出る。

Cloudflare の Web Analytics は残す（2026-11-03 にユーザーが決定）。Cloudflare が、HTML を受け付ける要求の応答にビーコン（`static.cloudflareinsights.com/beacon.min.js`）を挿入し、ブラウザが `/cdn-cgi/rum` へ計測値を送る。リポジトリと `dist` にはこのスクリプトが無く、`Accept: text/html` を付けない `curl` の応答にも入らないので、ブラウザか、この `Accept` を付けた要求で確かめる。`/privacy` の記載は、この挙動に合わせる。

### 使わないサービス

2026-11-04 に公式の料金ページで確かめて判断した。条件が変わったら見直す。

| サービス | 判断 | 理由 |
|---|---|---|
| Vercel | 使わない | Hobby は個人の非商用が条件で使えるが、Workers の静的配信は無料で無制限、`/api/*` の転送もすでに動く形になっている |
| Namecheap | 使わない | Cloudflare Registrar は原価で販売し、DNS とまとまる |
| Clerk | 使わない | Discord のログインとセッションは API に実装済みで、外部へ渡すデータが増えるだけになる |
| Supabase | 使わない | 無料枠は 1 週間使わないと一時停止し、500 MB。Neon は 1 GB で、使わない間は計算が止まり、一時停止の扱いにならない。API の置き換えにも Spring Boot の書き直しが要る |
| Upstash | 使わない | セッションは PostgreSQL にあり、Redis の用途が無い |
| Pinecone | 使わない | ベクトル検索の機能が無い |
| Resend | 使わない | 送信するメールが無い。受信は Cloudflare Email Routing（無料）で足りる |
| Stripe | 使わない | 憲法で営利化を禁止している |
| PostHog | 使わない | 表示の速さは Cloudflare Web Analytics で足りる。行動の記録やセッションの録画は `/privacy` の説明を大きく変える |
| Sentry | 今は使わない | API のエラーは Google Cloud の Error Reporting（料金なし。Cloud Logging の費用だけ）を先に試す。2026-11-11 に試したところ、今の平文のログでは Cloud Run がスタックトレースを 1 行ずつ別のログに分け、Error Reporting に載らなかった。構造化したログにする扱いは `specs/open-questions.md` Q158。ブラウザのエラーを集めたくなったら、`/privacy` の変更と合わせて機能として検討する |

Cloudflare のログの料金は 2026-12-01 に変わる。無料プランは 1 日 0.5 GB・保持 7 日で、上限に達すると取り込みを止め、課金はされない。Workers Logs は引き続き無効のままにする。

### API のデプロイ手順

手元から手動で出す。手順 1〜7 は 2026-11-07 に本番で実行し、「停止」は 2026-11-09 に試した。2026-11-11 に手順 4・5 で AOT キャッシュ付きのイメージ（`api:b29693c`）へ入れ替えた。前のイメージ（`api:4fb470f`）は戻すときのために Artifact Registry に残している。`gcloud` は手元に入れず、`gcr.io/google.com/cloudsdktool/google-cloud-cli:592.0.0-slim` のコンテナで実行する。認証情報は docker ボリュームに置き、リポジトリに入れない。ログイン・課金の有効化・秘密情報の入力は運営者が行う。

手元のコンテナで測った値（2026-11-04。Ryzen 7 5700X・WSL2・`prod` プロファイル・PostgreSQL 18.6 のコンテナ。Cloud Run と Neon の値ではない）:

| 項目 | 結果 |
|---|---|
| イメージ | `./gradlew bootBuildImage` で作れる。JRE は 25.0.5。AOT キャッシュ無しの通常のイメージで、展開後 769 MB、gzip で 175 MB（2026-11-04。AOT キャッシュ付きの値は下の行。Artifact Registry の無料枠の目安は 2 版ほど） |
| メモリ | 512 MiB は起動しない（メモリの計算で `fixed memory regions require 642294K`）。768 MiB と 1 GiB は起動し、300 回の要求の後で約 300 MiB |
| 起動（`/actuator/health` が 200 になるまで） | 通常のイメージは 1 CPU で約 14.5 秒、2 CPU で 7.5 秒。同じ日の先の測定では 1 CPU で 36〜39 秒、2 CPU で 21 秒と大きくぶれ、原因は分かっていない |
| AOT キャッシュ（`bootBuildImage` の既定。`BP_JVM_AOTCACHE_ENABLED=true`、訓練は `training` プロファイル。2026-11-09 に測定） | 訓練の実行は DB に接続できなくても最後まで通る（`application-training.yml`）。1 CPU・1 GiB で `/actuator/health` が 200 になるまで 7.5〜7.7 秒、`Started … in` は 6.1〜6.3 秒（通常のイメージと交互に 3 回ずつ。通常は 15.4〜16.5 秒、`Started` は 13.3〜14.2 秒）。イメージは展開後 1050 MB・gzip で 198 MB（通常は 770 MB・164 MB）で、無料枠の目安は 2 版ほどのまま。マイグレーション 6 件の適用・`/api/auth/me` の 401・ログイン開始の 302 は通常と同じ |
| AOT キャッシュの Cloud Run での比較（2026-11-09。Singapore・本番と同じ設定の別名のサービス・同じコミット `4fb470f`） | アプリの起動（`Started … in`、3 回の平均）は通常 13.9 秒、AOT 9.4 秒。21 分の無操作の後の最初の要求（ログイン開始の 302）は通常 19.0 秒、AOT 14.2 秒。ウォームはどちらも約 0.3 秒。AOT のイメージは訓練が JPA の初期化で失敗した（ビルドの中に DB が無い）まま作られたキャッシュで、訓練を最後まで通せばさらに縮む見込み。測定のサービスとイメージは削除した |
| 本番の `swv-api` での AOT キャッシュ（2026-11-11。`api:b29693c`・訓練は最後まで通った・Worker 経由で手元から） | アプリの起動（`Started … in`）はデプロイ時 7.9 秒、停止からの起動で 8.0 秒・7.5 秒。22〜23 分の無操作の後の最初の要求（ログイン開始の 302）は 14.3 秒・13.5 秒で、続く要求は約 0.4 秒。訓練を最後まで通しても最初の要求は 2026-11-09 の 14.2 秒からほとんど縮まなかった。ログでは、要求から新しいインスタンスの開始まで約 1.5 秒、そこから JVM の開始まで約 2 秒かかり、JVM の開始から `Started` まで約 10.5 秒（`process running for` の値）だった。AOT キャッシュで縮むのはアプリの起動の部分だけ |

Cookie の無いゲストの `GET /api/auth/me` は Worker が答えるので、ゲストの訪問では Cloud Run を起こさない。ログイン済みの最初の要求とログインの開始は、停止中のインスタンスの起動を待つ。

設定と理由:

| 設定 | 値 | 理由 |
|---|---|---|
| メモリ | 1 GiB | 768 MiB でも動くが、負荷をかけて測っていないので余裕を取る。費用は CPU が大半で、差は小さい |
| CPU | 1 vCPU、`--cpu-throttling`（リクエストベースの課金） | インスタンスベースは存続の間ずっと課金される |
| 起動ブースト | `--cpu-boost` | 起動中は 2 vCPU 分が課金されるが、待ち時間が減る |
| インスタンス数 | 最小 0・最大 1 | 最小 1 は Singapore で月約 $13 かかる |
| Invoker の確認 | 有効（既定のまま） | Worker だけが ID トークンを付けて呼ぶ。料金ページによると IAM で拒否した要求は課金されないので、`run.app` への直接の要求で費用が増えない（`specs/open-questions.md` Q88） |
| シークレット | `swv-db-url`・`swv-db-username`・`swv-db-password`・`swv-discord-client-id`・`swv-discord-client-secret` | 5 個で無料枠に収まる。値を入れ替えたら古い版を破棄する |

`SPRING_DATASOURCE_URL` は `jdbc:postgresql://<direct のホスト>/neondb?sslmode=require` の形にする。ユーザー名とパスワードは URL に入れない。

1. 変数を決め、`gcloud` を呼ぶ関数を定義する。`PROJECT` は実際の ID に置き換える。

   ```bash
   PROJECT=<プロジェクト ID>
   REGION=asia-southeast1
   IMAGE=$REGION-docker.pkg.dev/$PROJECT/swv/api:$(git rev-parse --short HEAD)
   gc() { docker run --rm -i -v swv-gcloud:/root/.config/gcloud gcr.io/google.com/cloudsdktool/google-cloud-cli:592.0.0-slim gcloud "$@"; }
   ```

2. 先に Cloud Run の spend cap の予算と、請求先アカウントの通知用の予算をコンソールで作る（下の「停止」と「費用」）。
3. Artifact Registry のリポジトリと、実行用のサービスアカウントを作り、シークレットを読む権限を渡す。

   シークレットの値は運営者が入れる。値を画面・履歴・チャットに出さないよう、DB の値は `.env.local` の `DATABASE_URL_UNPOOLED` から取り出し、Discord の値は `read -rs` で受けて渡す（2026-11-07 に実行）。

   ```bash
   neon_part() { python3 -c 'import sys,urllib.parse as u;v=[l.split("=",1)[1].strip().strip("\"\x27") for l in open(".env.local") if l.startswith("DATABASE_URL_UNPOOLED=")][0];p=u.urlsplit(v);print({"url":f"jdbc:postgresql://{p.hostname}{p.path}?sslmode=require","user":u.unquote(p.username),"pass":u.unquote(p.password)}[sys.argv[1]],end="")' "$1"; }
   gc services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
   neon_part url | gc secrets create swv-db-url --replication-policy=automatic --data-file=-
   neon_part user | gc secrets create swv-db-username --replication-policy=automatic --data-file=-
   neon_part pass | gc secrets create swv-db-password --replication-policy=automatic --data-file=-
   read -rs V && printf %s "$V" | gc secrets create swv-discord-client-id --replication-policy=automatic --data-file=- ; unset V
   read -rs V && printf %s "$V" | gc secrets create swv-discord-client-secret --replication-policy=automatic --data-file=- ; unset V
   ```

   Discord の値は、本番用のアプリ（開発用と別）の OAuth2 に redirect URI `https://skillweave.app/api/login/oauth2/code/discord` を登録して取る。

   ```bash
   gc artifacts repositories create swv --repository-format=docker --location=$REGION
   gc iam service-accounts create swv-api-runtime
   for s in swv-db-url swv-db-username swv-db-password swv-discord-client-id swv-discord-client-secret; do
     gc secrets add-iam-policy-binding $s --member=serviceAccount:swv-api-runtime@$PROJECT.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor
   done
   ```

4. 配備するコミットでイメージを作り、push する。イメージの作成中に AOT キャッシュの訓練の実行が走る（`training` プロファイル。`application-training.yml`）。訓練が失敗してもイメージは作られてしまうので、出力をファイルに残し、`Training run exited with an error` があるとき、または `AOTCache creation is complete` が無いときは push せずに止める。JRE・Syft の取得が 504 などで失敗したら、時間をおいて同じコマンドを再実行する。

   ```bash
   mkdir -p apps/api/build
   (cd apps/api && set -o pipefail && ./gradlew bootBuildImage 2>&1 | tee build/boot-build-image.log) &&
   ! grep -q 'Training run exited with an error' apps/api/build/boot-build-image.log &&
   grep -q 'AOTCache creation is complete' apps/api/build/boot-build-image.log &&
   docker tag skillweave-mhwilds-api:latest $IMAGE &&
   gc auth print-access-token | docker login -u oauth2accesstoken --password-stdin https://$REGION-docker.pkg.dev &&
   docker push $IMAGE
   ```

5. デプロイする。起動時に Flyway が Neon へマイグレーションを流すので、スキーマが変わる版では先にバックアップを取る。

   ```bash
   gc run deploy swv-api --image=$IMAGE --region=$REGION --service-account=swv-api-runtime@$PROJECT.iam.gserviceaccount.com --invoker-iam-check --memory=1Gi --cpu=1 --cpu-throttling --cpu-boost --min-instances=0 --max-instances=1 --set-env-vars=SPRING_PROFILES_ACTIVE=prod,DISCORD_REDIRECT_URI=https://skillweave.app/api/login/oauth2/code/discord,SWV_WEB_TOP_URL=https://skillweave.app/ --set-secrets=SPRING_DATASOURCE_URL=swv-db-url:latest,SPRING_DATASOURCE_USERNAME=swv-db-username:latest,SPRING_DATASOURCE_PASSWORD=swv-db-password:latest,DISCORD_CLIENT_ID=swv-discord-client-id:latest,DISCORD_CLIENT_SECRET=swv-discord-client-secret:latest
   ```

6. Worker が呼び出しに使うサービスアカウントを作り、このサービスの Invoker の権限だけを渡す。続けて鍵を発行して Worker に登録する。Worker は鍵から ID トークンを作り、`X-Serverless-Authorization` に付けて Cloud Run を呼ぶ（`specs/034-api-proxy-id-token/spec.md`）。

   ```bash
   gc iam service-accounts create swv-web-invoker
   gc run services add-iam-policy-binding swv-api --region=$REGION --member=serviceAccount:swv-web-invoker@$PROJECT.iam.gserviceaccount.com --role=roles/run.invoker
   ```

   鍵の JSON はリポジトリの外に出し、手元に置く時間を短くする。発行したら、Worker に登録し、登録できたら手元のファイルを消す（2026-11-07 に、本番の鍵の発行・`wrangler secret put`・手元のファイルの削除までを通した）。

   ```bash
   mkdir -p "$HOME/.swv-keys" && chmod 700 "$HOME/.swv-keys"
   docker run --rm -v swv-gcloud:/root/.config/gcloud -v "$HOME/.swv-keys":/out gcr.io/google.com/cloudsdktool/google-cloud-cli:592.0.0-slim gcloud iam service-accounts keys create /out/swv-web-invoker.json --iam-account=swv-web-invoker@$PROJECT.iam.gserviceaccount.com
   sudo chown "$USER" "$HOME/.swv-keys/swv-web-invoker.json" && chmod 600 "$HOME/.swv-keys/swv-web-invoker.json"
   cat "$HOME/.swv-keys/swv-web-invoker.json" | pnpm --filter @swv/web exec wrangler secret put API_INVOKER_KEY
   shred -u "$HOME/.swv-keys/swv-web-invoker.json"
   ```

   `wrangler secret put` は新しい版を作り、すぐにデプロイする（Cloudflare の公式資料）。登録を忘れても Worker は止まらず、Cloud Run が 403 を返す（`specs/034-api-proxy-id-token/decisions.md` Q153）ので、手順 7 の後に Worker 経由の要求で確かめる。

   鍵が漏れた（または漏れた疑いがある）ときは、先に無効にして被害を止め、新しい鍵を登録してから古い鍵を消す。

   ```bash
   gc iam service-accounts keys list --iam-account=swv-web-invoker@$PROJECT.iam.gserviceaccount.com
   gc iam service-accounts keys disable <漏れた鍵の ID> --iam-account=swv-web-invoker@$PROJECT.iam.gserviceaccount.com
   # 新しい鍵を発行して登録する（上の `keys create` から `wrangler secret put`・`shred` まで）
   gc iam service-accounts keys delete <漏れた鍵の ID> --iam-account=swv-web-invoker@$PROJECT.iam.gserviceaccount.com
   ```

   `USER_MANAGED` でない鍵（`SYSTEM_MANAGED`）は Google が管理するので、触らない。無効にしてから新しい鍵を登録し終えるまでは、トークンの交換が失敗して 502 になる（すでに取ったトークンは期限まで使われる）。漏れていない鍵を入れ替えるだけなら、新しい鍵を登録してから古い鍵を無効にして途切れを避ける。

7. トークンを付けない要求が 403 になることと、運営者の ID トークン（`gc auth print-identity-token`）を `Authorization: Bearer` で付けたとき `/actuator/health` が 200、Cookie なしの `/api/auth/me` が 401 を返すことを確かめる。`run.app` の URL はリポジトリに書かない。

#### 地域の測定

Singapore と東京へ同じイメージを一時的に出し、ウォームの状態で `/actuator/health` の応答時間（DB の確認を含む）を手元から 20 回ずつ測る。東京の単価は安いが Neon は Singapore にあるので、DB への往復が増える。差がわずかなら Singapore にする。測り終えたら使わない地域のサービスを削除する。

結果（2026-11-07。イメージ `api:4fb470f`・手元は日本・運営者の ID トークンで直接・両地域を交互に 20 回ずつ）:

| 地域 | 中央値 | 最小 | 90 パーセンタイル | 最大 | 起動（`Started … in`） |
|---|---|---|---|---|---|
| Singapore | 245 ms | 228 ms | 328 ms | 487 ms | 16.7 秒（初回でマイグレーションを含む） |
| 東京 | 243 ms | 218 ms | 313 ms | 360 ms | 15.2 秒 |

差はわずかなので Singapore にし、東京のサービスは削除した。東京は手元に近い分と Neon への往復が増える分が打ち消し合ったと読んでいる。DB を何度も呼ぶ要求では東京が不利になる。どちらもトークンなしの要求は 403、トークン付きで `/actuator/health` は 200、Cookie なしの `/api/auth/me` は 401、`/api/oauth2/authorization/discord` は本番の redirect URI を載せた Discord への 302 だった。

#### 停止

Invoker の確認は常に有効なので、`run.app` への直接の要求は Cloud Run が拒否し、料金ページによると課金されない。費用が想定を超えたら、Worker のサービスアカウントから Invoker の権限を外す。Worker からの要求も拒否されるようになる。2026-11-09 に試した。権限を外してから約 80 秒で、Worker 経由の `/api/oauth2/authorization/discord` が 302 から 403（Google の `text/html` の Forbidden がそのまま返る）に変わった。Worker が持っている期限内の ID トークンでも拒否される。Cookie なしの `/api/auth/me` は Worker が答えるので 401 のまま。権限を戻すと約 90 秒で 302 に戻った。

```bash
gc run services remove-iam-policy-binding swv-api --region=$REGION --member=serviceAccount:swv-web-invoker@$PROJECT.iam.gserviceaccount.com --role=roles/run.invoker
```

再開は手順 6 の `add-iam-policy-binding` で権限を戻す。それでも足りなければ `gc run services delete swv-api --region=$REGION` でサービスを消す。イメージ・シークレット・Neon のデータは残る。

spend cap で止まったときは、原因を確かめてから、予算の編集で上限を解除し、上限の額を上げて保存し直す（解除だけでは、その月は再び止まらない）。戻るまで最大 1 時間かかる。何もしなければ翌月 1 日に戻る。

### 稼働の実測（2026-11-11）

URL を配る前の本番（`swv-api` は `api:b29693c`、Web は v0.2.0）で測った。Neon の値は Neon の API（`neon api`）、Cloud Run の値は Cloud Monitoring とログ、費用と Workers の値はコンソールとダッシュボードで読んだ。

Neon の停止（`specs/028-api-prod-config/decisions.md` Q91）:

- Neon は止まる。最後の要求から停止までは約 20 分だった（2026-11-09〜11 の 10 回。20〜21 分）。Cloud Run のインスタンスが最後の要求から約 15 分で落ち、その後に Neon の 5 分の無操作を待って止まる。例: 最後の要求 09:02 → 停止 09:22（UTC）。
- Cloud Run の起動時に Flyway が DB に接続するので、要求の中身に関係なく、Cloud Run の起動は Neon も起こす。1 回の起動で Neon は約 20 分（0.25 CU で約 0.083 CU 時間）動き、月 100 CU 時間は約 1,200 回の起動に当たる。
- Neon の接続一覧に残っていたのは Neon 自身の接続（`compute_monitor`・`pg_cron`）だけで、停止を妨げる接続は無かった。

レイテンシ（手元から Worker 経由。`/api/shared-builds/{shortId}` は DB を読んで 404 を返す）:

| 状態 | 結果 |
|---|---|
| Cloud Run と Neon がどちらも停止 | 14.5 秒（1 回）。Neon の起動は約 1 秒で、JVM の起動と並行して進む |
| Cloud Run だけ停止（Neon は起動中） | 15.8 秒（1 回） |
| ウォーム（20 回） | 中央値 0.40 秒・90 パーセンタイル 0.55 秒・最大 0.79 秒 |
| Worker だけが答える Cookie なしの `/api/auth/me`（20 回） | 中央値 0.18 秒・90 パーセンタイル 0.20 秒 |

最初の要求の待ちは、ほぼ Cloud Run の起動（「API のデプロイ手順」の表）によるもので、Neon の復帰はほとんど効いていない。

無料枠の消費（2026-11-01〜11。測定用のサービスを含む）:

| サービス | 消費 | 無料枠 |
|---|---|---|
| Neon | 約 1.1 CU 時間（稼働 4.4 時間）・転送 1 MB・論理サイズ 31 MiB（請求期間は 11-03 から） | 月 100 CU 時間・転送 5 GB |
| Cloud Run | 課金対象のインスタンス時間 約 271 秒・要求 140 件 | 約 12.9 万 vCPU 秒・200 万件 |
| Google Cloud の費用 | Cloud Run の定価 ¥4、無料枠の割引 −¥4 で ¥0。Artifact Registry も ¥0。転送の費目は出ていない | — |
| Workers | Worker の呼び出し 327 回・静的配信の要求 30.77k（11 月） | 呼び出しは 10 万回/日、静的配信は無制限 |

URL を配る前から、`/api/.env`・`/api/credentials` などを探るスキャナーの要求が来ている（2026-11-09〜11 に約 40 件）。Cookie なしの `/api/auth/me` 以外は Worker が Cloud Run へ転送するので、これだけで Cloud Run と Neon が起きる（`specs/open-questions.md` Q159）。期限切れの `spring_session` の行は消えずに残っている（`specs/open-questions.md` Q149）。

### プライバシーの表記との照合（2026-11-14）

`/privacy`（最終更新日 2026/11/04）の記載を、URL を配る前の本番（Web は v0.2.0）の設定とブラウザの通信と照らし合わせた。連絡先のメールが未設定だったので設定を表記に合わせ、ほかは表記と合っていた。表記は直していない（`specs/030-privacy-notice/decisions.md` Q140）。

| 項目 | `/privacy` の記載 | 本番の事実 | 確かめた方法 |
|---|---|---|---|
| 連絡先 | `contact@skillweave.app` | 2026-11-14 まで Email Routing は未設定で、届かなかった。同日に有効にし、DNS に MX 3 件・SPF と DKIM の TXT 各 1 件が入った。転送先とは別のアドレスから送ったメールが、アクティビティログで「転送済み」になり、運営者の受信箱に届いた。最初のテストメールは `550 5.1.1 Address does not exist` で戻った（DNS は公開側から引けていたので、ルールが反映される前に届いたと見ている。原因は確かめていない） | ダッシュボードの設定とアクティビティログ・テストメール |
| DB の場所 | シンガポールなど日本国外 | Neon は `aws-ap-southeast-1`、Cloud Run は Singapore | 「本番の構成」 |
| Google Cloud のログの保持 | 既定で 30 日 | 要求のログが入る `_Default` は 30 日。ほかは Google が置く `_Required`（400 日・管理の操作の監査ログ）だけで、シンクは既定の 2 つ、データアクセスの監査ログは無効（`auditConfigs` が空） | `gcloud logging buckets list`・`sinks list`・`projects get-iam-policy`（読み取りだけ） |
| Cloudflare のログ | 記録されることがある（期間は書かない） | Workers Logs はダッシュボードの Observability で無効のまま。`wrangler.jsonc` に `observability` は無い | ダッシュボード・`wrangler.jsonc` |
| バックアップ | 週 1 回ほど・消去の後も約 4 週間残る | 週 1 回・4 世代（「バックアップ」） | 手順との照合 |
| Web Analytics | ページの URL と読み込みの時間などを Cloudflare へ送る。Cookie と localStorage は使わない | `beacon.min.js` が `/cdn-cgi/rum` へ、読み込みのたびと画面の遷移（`/` → `/builds`）のたびに POST する。項目は `location`・`referrer`・`firstPaint`・`firstContentfulPaint`・`timingsV2`・`memory`・`versions` など。`?probe=1` を付けて開いても `location` にクエリ文字列は無かった。要求に `Cookie` は無く、ゲストの訪問の後の Cookie と localStorage は空だった | 手元の Playwright（Chromium）で本番を開いて記録 |
| ブラウザの通信先 | Google Fonts・Cloudflare・Discord のログイン | ゲストの訪問では `skillweave.app`・`fonts.googleapis.com`・`fonts.gstatic.com`・`static.cloudflareinsights.com` だけ。ログインでは C5（2026-11-07）の HAR のとおり Discord の画面の通信が加わる。`run.app` への通信は無い | 運営者のブラウザの HAR・Playwright |

運営者の端末では、セキュリティソフトが `beacon.min.js` を 0 バイトの `image/gif` に差し替え（`net::ERR_FAILED`）、`/cdn-cgi/rum` は送られなかった。ビーコン自体のハッシュは HTML の `integrity` と一致した。同じソフトはページにスクリプトも挿入するので、本番の通信先を確かめるときはその分を除いて読む。

### DB の設定とバックアップ

Neon のプロジェクトは `skillweave`。コンピュートは 0.25 CU 固定で、無操作が 5 分続くと止まる（無料プランでは変更できない）。

- **版**: PostgreSQL 18 を使う。マイグレーションの既定値の `uuidv7()` は 17 に無い。
- **接続**: API も手作業も direct（ホスト名に `-pooler` が付かないもの）を使う。pooled では `pg_dump` と Flyway を使わない。
- **マイグレーション**: API の起動時に Flyway が流す。`neondb` に手でテーブルを作らない。試すときは使い捨てのデータベースを作る。
- **接続文字列**: パスワードを含むので、チャット・リポジトリ・スクリーンショットに残さない。
- **手元の紐付け**: リポジトリ直下で `pnpm exec neon init -y --agent claude-code --org-id <org> --project-id <project> --branch production --no-config` を実行すると、`.neon`（組織・プロジェクト・ブランチ）と `.env.local`（`DATABASE_URL`・`DATABASE_URL_UNPOOLED`）ができる。どちらも `.gitignore` の対象。API は `DATABASE_URL_UNPOOLED` を `SPRING_DATASOURCE_URL`（`jdbc:postgresql://<host>/<db>?sslmode=require`）・`_USERNAME`・`_PASSWORD` に分けて受ける。API のコードと Web には Neon 向けの変更は要らない。
- **API を Neon で試す**: `production` から使い捨てのブランチを作り（`neon branches create --name <名前> --parent production`）、その direct 接続で `bootRun` し、終わったら `neon branches delete` で消す。2026-11-07 に、Flyway の V1〜V6 の適用・`/actuator/health` の `db: UP`・Spring Session の行の作成・`uuidv7()` の既定値を確かめ、`production` は空のまま残した。

`DROP DATABASE` が `being accessed by other users` で失敗したら、ダッシュボードでそのデータベースを開いていないか確かめる。ダッシュボードで開いた後に、アプリ名が空の idle 接続が 8 本残り、コンピュートの設定を保存した後で消せた例がある（2026-11-04）。接続元は確定していない。

#### バックアップ

週 1 回とマイグレーションを含む版のデプロイの前に、運営者が手元で取る。ダンプには利用者のデータが入るので、平文でディスクに置かず、リポジトリの外に保存する。マイグレーションの前のダンプも世代に数え、ダンプを取って確かめた後に、新しい順で 5 個目以降のものと、取得から 28 日を過ぎたものを消す（手順 4）。パスフレーズはダンプと別の場所で管理する。

1. 同じターミナルで、接続文字列とパスフレーズを読み込む。どちらも画面に出ず、履歴にも残らない。

   ```bash
   read -rs NEON_DIRECT_URL && export NEON_DIRECT_URL
   ```

   ```bash
   read -rs SWV_BACKUP_PASSPHRASE
   ```

2. ダンプを取って暗号化する。`<保存先>` はリポジトリの外のディレクトリ。ファイル名には時刻（UTC の時分）を含める。同じ日にマイグレーションの前のダンプを続けて取っても、名前が衝突して手順 3 の「失敗したらファイルを消す」が先に取ったダンプを消すことがないようにするため。

   ```bash
   set -o pipefail
   F="<保存先>/swv-$(date -u +%Y%m%d%H%M).dump.gpg"
   docker run --rm -e NEON_DIRECT_URL postgres:18.6-trixie sh -c 'pg_dump "$NEON_DIRECT_URL" -Fc --no-owner --no-acl --exclude-table-data="spring_session*"' | gpg --batch --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 -o "$F" 3<<<"$SWV_BACKUP_PASSPHRASE"; echo "exit=$?"
   ```

3. `exit=0` と、復号して目次を読めることを確かめる。接続に失敗してもファイルは残る（70 バイトの例がある）ので、ファイルの有無では判断しない。失敗したらファイルを消す。

   ```bash
   gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 -d "$F" 3<<<"$SWV_BACKUP_PASSPHRASE" | docker run --rm -i postgres:18.6-trixie pg_restore --list | grep -c 'TABLE DATA'
   ```

4. 古いものを消す。手順 3 で確かめた後にだけ行う。例: `10/06`・`10/13`・`10/20`・`10/27` がある状態で `11/03` を取ると、`10/06` が 5 個目になるので消す。まず対象を表示し、内容を見てから消す。

   ```bash
   cd "<保存先>"
   { ls -1 swv-*.dump.gpg | sort -r | tail -n +5; find . -maxdepth 1 -name 'swv-*.dump.gpg' -mtime +28 -printf '%P\n'; } | sort -u
   ```

   表示されたファイルだけを `rm` で消す。続けて、消去の記録（`#### 消去`）のうち、残っている最も古いダンプの取得日より前の日付のものを表示する。ダンプが 1 個も残っていなければ、記録は消さない。同じ日のダンプが残る間も消さない。表示された名前を見てから `rm` で消す。

   ```bash
   OLDEST=$(ls -1 swv-*.dump.gpg | sort | head -n1 | sed -E 's/^swv-([0-9]{8})[0-9]*\..*/\1/')
   [ -n "$OLDEST" ] && ls -1 swv-erased-*.txt | awk -v o="$OLDEST" '{ d = $0; gsub(/[^0-9]/, "", d); if (d < o) print $0 }'
   ```

5. 変数を消す。

   ```bash
   unset NEON_DIRECT_URL SWV_BACKUP_PASSPHRASE
   ```

#### 消去

利用者から消去の依頼を受けたら、依頼を受けてから 14 日以内を目安に行う。本人確認の方法はこの手順の対象外とする。ダンプには消去の前のデータが残るので、消した利用者の記録を残し、復元のときに消し直す。

1. 接続文字列を読み込む（`#### バックアップ` の手順 1）。依頼の Discord の ID から `users.id` を引く。`<DiscordのID>` は数字だけ（`^[0-9]{1,20}$`）を確かめてから入れる。

   ```bash
   docker run --rm -e NEON_DIRECT_URL postgres:18.6-trixie sh -c 'psql "$NEON_DIRECT_URL" -At -c "select id from users where discord_id = '"'"'<DiscordのID>'"'"'"'
   ```

2. 消去の記録を書く。ダンプと同じ保存先の `swv-erased-<YYYYMMDD>.txt`（日付は UTC）に、`users.id` を 1 行に 1 件ずつ書く。`users.id` 以外は書かない。手順 1 の結果が 1 行の UUID であることを確かめてから書く（0 件なら Discord の ID が違うので、何も書かずに依頼者へ確認する）。消す前に書く（記録が無いまま消えた状態を作らないため。消す工程が失敗しても依頼は残っているのでやり直す）。記録は、この日付以前に取ったダンプがすべて消えるまで残す（`#### バックアップ` の手順 4 が消す）。

   ```bash
   echo "<users.id>" >> "<保存先>/swv-erased-$(date -u +%Y%m%d).txt"
   ```

3. 消す。`SWV_ERASED_IDS` はカンマ区切りの `users.id`。消去では 1 件を入れる。1 つのトランザクションで、`shares` を `builds` より先に消す（外部キーのため）。`spring_session_attributes` は `ON DELETE CASCADE` で消える。ソフトデリートの行も `deleted_at` を見ずに消す。他の利用者の共有が対象の構成を指すと外部キーで全体が失敗し、何も消えない（`ShareService.create` は自分の構成だけを受け付けるので通常は起きない）。

   ```bash
   read -r SWV_ERASED_IDS && export SWV_ERASED_IDS
   ```

   ```bash
   docker run --rm -i -e NEON_DIRECT_URL -e SWV_ERASED_IDS postgres:18.6-trixie sh -c 'psql "$NEON_DIRECT_URL" -v ON_ERROR_STOP=1 --single-transaction -v ids="$SWV_ERASED_IDS" -f -' <<'SQL'
   DELETE FROM spring_session WHERE principal_name = ANY (string_to_array(:'ids', ','));
   DELETE FROM shares WHERE user_id = ANY (string_to_array(:'ids', ',')::uuid[]);
   DELETE FROM builds WHERE user_id = ANY (string_to_array(:'ids', ',')::uuid[]);
   DELETE FROM charms WHERE user_id = ANY (string_to_array(:'ids', ',')::uuid[]);
   DELETE FROM weapons WHERE user_id = ANY (string_to_array(:'ids', ',')::uuid[]);
   DELETE FROM users WHERE id = ANY (string_to_array(:'ids', ',')::uuid[]);
   SQL
   ```

4. 結果を確かめる。`users`・`builds`・`charms`・`weapons`・`shares` と `spring_session` の該当行が 0 件であること、ほかの利用者の行が残っていることを `select count(*)` で見る。終わったら `unset NEON_DIRECT_URL SWV_ERASED_IDS` する。

確認の範囲（2026-11-04）: 使い捨ての `postgres:18.6-trixie`（手元の docker・`--network host`）に、API の起動で Flyway にマイグレーションを流させ、実際のログインの経路（Discord はスタブ）で作った 2 人の利用者の本物のセッションと、護石・構成・武器・共有（ソフトデリートの行を含む）を入れ、上のコマンドを実行した。次を確かめた。(1) `spring_session.principal_name` は `users.id` と一致する。(2) `#### バックアップ` の `pg_dump` の指定で取ったダンプには、`spring_session*` のデータと表示名が無く、Discord の ID とソフトデリートの行がある。(3) 1 人を消すと、その利用者の行が全テーブル（`spring_session_attributes` を含む）で 0 件になり、もう 1 人の行とセッションが残る。消した利用者の Cookie の `/api/auth/me` は 401、残った利用者は 200 を返す。(4) (2) のダンプを空のデータベースへ復元し、記録から消し直すと、消した利用者の行が消えてもう 1 人の行が残る。Neon での実行、Neon の復元、古いダンプと古い消去の記録を消す工程（`#### バックアップ` の手順 4）は未確認。

#### 復元

6 時間以内の誤操作なら、先に Neon の復元（無料プランは 6 時間・変更 1 GB まで）を検討する。それより前に戻すときは、ダンプを空のデータベースへ入れる。どちらの復元でも、API を止めて復元し、復元したデータベースへ消し直す工程（手順 4。`#### 消去` の手順 3 と同じ SQL）を実行してから起動する。ダンプからの復元は手順 1〜5 を順に行う。Neon の復元では、手順 1（API を止める）と手順 2 の接続文字列とパスフレーズの読み込みだけを行い、空のデータベースの作成と手順 3 は行わない。続けて手順 4 を、読み替えずに `NEON_DIRECT_URL` に対して実行し、行数を確かめ（手順 5 の前半）、接続先を変えずに API を起動する。Neon の復元はセッションも戻すが、消去した利用者のセッションはこの工程で消える。

1. API を止める。
2. 接続文字列（`NEON_DIRECT_URL`）とパスフレーズを上の手順で読み込む。ダッシュボードか次のコマンドで空のデータベースを作る。

   ```bash
   docker run --rm -e NEON_DIRECT_URL postgres:18.6-trixie sh -c 'psql "$NEON_DIRECT_URL" -c "create database swv_restore"'
   ```

3. 接続文字列のデータベース名を `swv_restore` に変えたものを `NEON_RESTORE_URL` に入れ、復元する。`F` は復元するファイル。

   ```bash
   read -rs NEON_RESTORE_URL && export NEON_RESTORE_URL
   ```

   ```bash
   gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 -d "$F" 3<<<"$SWV_BACKUP_PASSPHRASE" | docker run --rm -i -e NEON_RESTORE_URL postgres:18.6-trixie sh -c 'pg_restore -d "$NEON_RESTORE_URL" --no-owner --no-acl --single-transaction --exit-on-error'
   ```

4. 消し直す。保存先の `swv-erased-*.txt` のすべての行をカンマ区切りで `SWV_ERASED_IDS` に入れ、`#### 消去` の手順 3 の `psql` を `NEON_RESTORE_URL` に対して実行する（`-e NEON_DIRECT_URL` と `"$NEON_DIRECT_URL"` を `NEON_RESTORE_URL` に読み替える）。記録が無ければ飛ばす。

   ```bash
   export SWV_ERASED_IDS="$(cat "<保存先>"/swv-erased-*.txt | paste -sd, -)"
   ```

5. 行数を確かめ、API の `SPRING_DATASOURCE_URL` を `swv_restore` へ向けて起動する。セッションは復元されないので、利用者は再ログインする。

確認の範囲（2026-11-04）: Neon の使い捨てのデータベースでは、ファイルを介した同じ指定の往復を確かめた。パイプの形は手元の PostgreSQL 18.6 で確かめた。Flyway が作る本物の `flyway_schema_history` を含む復元は、手元の PostgreSQL 18.6 のパイプの形で確かめた（033 の確認。`#### 消去` の確認の範囲）。パイプの形の Neon での実行は、API のデプロイの後の最初のバックアップで確かめる。

## CI

`.github/workflows/ci.yml` のジョブは secret-scan / api / web / packages / e2e。e2e は Chromium だけで、ビルドした web を `vite preview` で配信し、API・DB は使わない（004）。測定（`pnpm --filter @swv/web run measure`）は CI では実行しない。すべての checkout は `persist-credentials: false` にする。

`.github/workflows/release.yml` のジョブは release-please / deploy-web（「リリースと版」節・「Web のデプロイ手順」節）。`main` の Ruleset の必須チェックには入れない。

## リリースと版（2026-11-07）

版は release-please がリポジトリで1つだけ管理する。直下の `package.json` の `version`・`.release-please-manifest.json`・`CHANGELOG.md` を release-please が書き、手では編集しない。`apps/web`・`packages/*` の `version` は使わない（0.0.1 のまま）。

- **タグ**: `v<MAJOR>.<MINOR>.<PATCH>`（`include-component-in-tag: false`）。
- **開発中（0.x）**: `feat` で MINOR、`fix` で PATCH を上げる。破壊的変更でも MINOR だけを上げる（`bump-minor-pre-major`）。`docs`・`test`・`refactor`・`build`・`ci`・`chore`・`style` は版を上げず、CHANGELOG にも載せない。そうしたコミットは、次のリリースに同乗する。
- **リリースの流れ**: `main` へのマージのたびに、release-please がリリース PR（`chore(main): release x.y.z`）を作るか更新する。PR は GitHub App の名義なので CI が走る。リリース PR をマージした時点で、タグ・GitHub Release を作り、Web を本番へ出す。
- **起点**: v0.1.0 は、release-please の導入の直後の `main` に手で作った GitHub Release である。それより前の履歴は CHANGELOG に載せない（`bootstrap-sha` は導入前の `main` の HEAD）。手で作ったタグはワークフローを起動しないので、v0.1.0 の本番への反映は `workflow_dispatch` で行う。
- **Dependabot**: npm の本番の依存は `fix(deps)` で PATCH のリリースを作り、CHANGELOG の「修正」に載る。npm の開発の依存（`build(deps-dev)`）・gradle と docker-compose（`build(deps)`）・Actions（`ci(deps)`）は版を上げない。1本の PR に本番と開発の依存が混ざったときの接頭辞は資料に記載が無いので（2026-11-07 に確認）、npm のグループを `dependency-type` で分けている。
- **API**: CD の対象外。Cloud Run への手順は `specs/open-questions.md` の Q88。
- **v1.0.0**: `specs/feature-map.md` の機能（2026-11-14 時点で未着手の 016・017・018・023）をすべて本番へ出した時に、`release-please-config.json` のパッケージ `.` に `"release-as": "1.0.0"` を入れた PR をマージし、リリース PR を v1.0.0 にする。リリースの後、次の PR で `release-as` を外す（残すと、以後も 1.0.0 を作ろうとする）。

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

## Tesseract.js の護石の読み取りの測定（015 ocr-spike・2026-11-01）

結論: **不合格・Tesseract.js は不採用**（改善の前 10.0%・改善の後 85.0%。基準は 90% 以上）。認識時間と初期化の時間は基準内。前処理の改善（plan D14）を1回加えても基準に届かなかったため、代替の選定を `specs/open-questions.md` の Q117 に起票した（015 の AC-13）。

- 条件: 対象は PC 版の護石の詳細画面。画像 20 枚（すべて 1920x1080）。正解は `apps/web/e2e/measure/charm-ocr/labels.json`。完全一致は、スキル（ID と Lv）・スロット（別と Lv）の並びと数が正解と一致し、`null` を含まないこと。前処理は、改善の前が切り出し（名前と Lv を1枠1行に並べ直す）とグレースケール化だけ、改善の後がそれに拡大（2倍）・二値化（大津の方法）・文字の許可リスト（候補のスキル名に現れる文字と `Lv0123456789`）を加えたもの。どちらも PSM 6。照合のしきい値（長さ ÷ 3 の切り捨て）は変えていない。
- 基準: 完全一致率 90% 以上かつ認識時間の最大 3000 ms 以下。
- 測定環境: Node 24.22.2・Linux 6.18.54.1-microsoft-standard-WSL2・AMD Ryzen 7 5700X（12 論理コア）・メモリ 19 GB・Chromium 156.0.8078.4（Playwright）。
- 版: tesseract.js 7.0.0・tesseract.js-core 7.0.0・言語データ `@tesseract.js-data/jpn` 1.0.0 の `4.0.0_best_int`。言語データは IndexedDB に保存しない（`cacheMethod: 'none'`）。
- 結果（改善の前と後）:

  | 項目 | 改善の前 | 改善の後 |
  |---|---|---|
  | 完全一致率 | 2/20 = 10.0%（一致は charm-009・charm-012） | 17/20 = 85.0%（不一致は charm-001・017・019） |
  | 認識時間の最大 | 123 ms（1 枚あたり 56〜123 ms） | 109 ms（1 枚あたり 47〜109 ms） |
  | 初期化の時間 | 319 ms（マスターの取得を含まない。言語データの保存なし） | 301 ms |
  | 合否 | FAIL | FAIL（一致率が基準に 5 ポイント足りない） |
  | 通信 | 自オリジン以外へのリクエストなし。worker・core・lang の3種を記録した | 同左 |

- 不一致の傾向（改善の前・18 枚）:
  - スロットの不一致は 0 件。不一致はすべてスキル欄。
  - 主因は Lv の誤認。`Lv` が `mv`・`II`・`INZ】` に化け、Lv の部分が読めずに行が `null` になる（charm-002・003・004・005・006・007・008・010・011・013・014・015・016・017・020 など）。スキル名自体は読めている行が多い。
  - 字形の誤認が少数ある（「弱点特効」→「細点特効」、「渾身」→「澤身」、charm-018 の「ランナー」→「ジテーー [5 の 4」）。
  - 文字の間に空白が入る。照合は空白を除くので原因ではない。
  - 認識時間が短いのは、画像が小さい切り出し1枚だけを認識するため。
- 不一致の傾向（改善の後・3 枚）: いずれもスキル名の字形の誤認で、Lv は全行で読めた。スロットの不一致は 0 件。
  - charm-001: 「渾身」の「渾」が欠けて「身」だけになった（長さ 2・しきい値 0 で完全一致だけを受けるため `null`）。
  - charm-017: 「龍属性攻撃強化」の先頭が「能」に化けた（「火・雷・水・氷・龍属性攻撃強化」のすべてと距離 1 の同点になり `null`）。
  - charm-019: 「剛刃研磨」が「刃研護」になり、距離がしきい値（長さ 4 ÷ 3 の切り捨て = 1）を超えて `null`。
  - 改善の前の主因だった `Lv` の誤認は、二値化と許可リストで解消した。
  - 残りの不一致は文字の欠落・取り違えで、前処理の追加の改善（さらなる拡大・範囲の調整など）や照合の調整で縮む余地があるが、015 の取り決め（改善は1回だけ・しきい値は変えない）に従い、ここでは行わない。
- 生の出力: 測定コマンドの標準出力（画像ごとの不一致の項目と認識した生の行）。再現は `pnpm --filter @swv/web exec playwright test --project=measure e2e/measure/charm-ocr.measure.ts`。

## 既知の警告

- `pnpm --filter @swv/web test:unit` で Vite が「`vitest.config.ts` の `import './vite.config'` に拡張子が無い
  （将来の `configLoader: 'native'` 既定化で非対応）」と警告する。現状の動作には影響しない。

## 関連ドキュメント

- [`design/data-model-standard.md`](data-model-standard.md)
- [`design-system/skillweave/MASTER.md`](../design-system/skillweave/MASTER.md)
- [`temp/initial-design.md`](../temp/initial-design.md) — 設計方針の一次資料（§3 が本書の出典）
