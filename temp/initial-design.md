# Skillweave for MH Wilds 設計方針（v0.1・暫定）

> **この文書の位置づけ**: claude.ai の Chat で決めた設計方針をまとめた一次資料。リポジトリ作成時に
> `temp/initial-design.md` として置き、vim と同じ「temp/ の卒業」運用で、確定した節から `design/`・`CLAUDE.md`・
> `specs/` へ移していく。**バージョン番号はここでは決めない**（実測値を正とし、`design/tech-stack.md` に記録する）。
>
> 同梱資料: `temp/solver-types.ts`（ソルバー入出力型のたたき台。`packages/solver` の初期実装の起点）
>
> 作成日: 2026-10-02 / 参照元プロジェクト: `vehicle-intake-management`（以下 vim）
>
> **名称**: 正式名 Skillweave for MH Wilds — ワイルズ対応 非公式スキルシミュレータ / 略称 `swv` /
> リポジトリ `https://github.com/Motoki-Tabata/skillweave-mhwilds` / Java パッケージ `io.github.motokitabata.skillweave`

---

## 1. プロダクト概要

- **目的**: 自分とフレンドが使う道具＋ポートフォリオとして始め、将来は一般公開サービスに育てる。
- **差別化（分割リリース）**: ①ソルバー＋護石手入力＋火力の可視化 → ②護石OCR → ③逆引き（この護石があれば組める）。
- **プラットフォーム**: Web アプリ（PWA）で完結。ストア公開はしない。
- **権利面**: カプコン二次創作ガイドライン準拠。非営利・「二次創作である」旨の表記・公式画像（アイコン含む）不使用・`©CAPCOM` 表記はしない。

---

## 2. アーキテクチャ方針

- ソルバーと OCR は**ブラウザ内で実行**する（サーバー負荷・費用・画像のプライバシーのため）。ソルバーは Web Worker。
- バックエンドは最初から導入: 認証、ユーザーデータ（護石・武器・保存構成）の保存、構成共有。
- **マスターデータは DB に入れない**。`packages/data` が生成したバージョン付き JSON を静的配信する（Cloudflare Pages）。
  DB はユーザーデータのみを持つ。
- ソルバー・データ・UI はパッケージ分離する。ソルバーは API の型に依存しない（変換は `apps/web` のアダプタ）。
- API は OpenAPI 契約ファースト（vim の `contracts/` 運用を踏襲）。

### 2.1 ゲストモード（決定）

- ソルバーと護石入力は**ログインなしで使える**。ゲストの入力は端末内（IndexedDB）の下書きで、同期しない。
- 保存・共有・複数端末利用は **Discord ログイン必須**。
- 書き込みはオンライン時のみ。オフライン時は閲覧とソルバー実行のみ。
- 一般公開段階で「ログイン時にゲスト下書きを一方向・一回きりでサーバーへ取り込む」処理を追加する（双方向マージはしない）。
- そのための前提（**最初から守る**）:
  1. ユーザーデータの UUID は**クライアント採番（UUIDv7）を正**とする。
  2. ユーザーデータのスキーマを端末側・サーバー側で同一にする（`user_id` だけサーバーが付与）。

---

## 3. 技術スタック方針

**バージョンは実測で決める**。vim の `design/tech-stack.md` と同じく、`./gradlew dependencies` / `pnpm list` の解決結果を正とし、
選定理由・相互検証結果を `design/tech-stack.md` に記録する。pnpm のクールダウン（`minimumReleaseAge`）は vim と同じく有効にする。

### 3.1 vim から踏襲するもの

Java（LTS）/ Spring Boot 4 / Gradle（Kotlin DSL）/ Spring Data JPA + Hibernate / Flyway / PostgreSQL 18 /
springdoc-openapi / Testcontainers（H2 不使用）/ Vue 3 / TypeScript / Vite / Vue Router / Pinia /
shadcn-vue + Reka UI / Tailwind CSS 4 / ネイティブ fetch ラッパー（axios 不使用）/ Vitest / Playwright /
pnpm（サプライチェーン対策）/ oxlint → ESLint / Prettier / openapi-typescript / Redocly / swagger-parser（契約テスト）/
gitleaks / SonarQube（ローカル限定）。

### 3.2 vim から変えるもの・追加するもの

| 項目 | vim | 本プロジェクト | 理由 |
|---|---|---|---|
| セッションストア | Valkey（Redis スターター経由） | **Spring Session JDBC（PostgreSQL）** | Cloud Run の横に Valkey を置くと固定費が出る。Cookie＋CSRF 方式と `http.ts` は流用できる |
| 認証 | ログインID＋パスワード | **Spring Security OAuth2 Client（Discord）** | フレンド利用で抵抗が少ない。パスワードを持たない |
| PWA | なし | **vite-plugin-pwa** | Vite のメジャー版との peer 適合を実測で確認すること |
| ソルバー | なし | **ILP ライブラリ（HiGHS の WASM 版が第一候補）** | 機能001（スパイク）で性能を測ってから確定する |
| OCR | なし | Tesseract.js（フェーズ②で導入） | 今は入れない |
| タイムゾーン | JST 統一 | **UTC 統一（表示時にブラウザのローカル時刻へ変換）** | 一般公開を見据え、Cloud Run・マネージド DB の既定に合わせる |
| デプロイ | なし | Web: Cloudflare Pages / API: Cloud Run / DB: Neon または Supabase | 費用最小。API は**まず JVM 版**で出し、コールドスタートが問題になってから GraalVM ネイティブを検討 |
| パッケージ構成 | `frontend/` 内に pnpm workspace | **リポジトリ直下に pnpm workspace** | `apps/web` と `packages/*` がパッケージを共有するため |

### 3.3 実測時に確認すること

- マネージド DB（Neon / Supabase）が PostgreSQL 18 を提供しているか。提供が無い場合でも、ユーザーデータはクライアント採番なので
  `uuidv7()` の DB デフォルトは保険でしかなく致命的ではない。ローカル（Docker）は 18 を使う。
- vite-plugin-pwa・HiGHS WASM の peer 依存と、Vite / TypeScript のメジャー版との適合。
- TypeScript 7 系と typescript-eslint の適合（vim 選定時は不適合だった。再確認する）。
- Cookie の同一サイト化: フロント（Pages）と API（Cloud Run）を独自ドメインの同一サイト配下（例 `app.<domain>` / `api.<domain>`）に置く前提。
  ドメインは未決（§11）。

---

## 4. フォルダ構成

vim の構成（README「ディレクトリ構成」）を流用し、`frontend/` `backend/` を `apps/web` `apps/api` に移して `packages/` を足す。

```
skillweave-mhwilds/
├── .claude/                    # TSOD 一式を vim から流用。rules のパス対象を apps/ に読み替える（§10）
├── .github/
│   ├── workflows/ci.yml        # secret-scan / api / web / packages / e2e（deploy は後で追加）
│   ├── dependabot.yml
│   ├── pull_request_template.md
│   └── CODEOWNERS
├── .githooks/pre-push          # vim と同じ（main への直接 push 拒否＋gitleaks）
├── contracts/                  # API 契約の単一実体（vim と同じ構成・規約。contracts/README.md も流用）
├── apps/
│   ├── api/                    # vim の backend/ に相当（Spring Boot・Gradle・レイヤード構成）
│   │   └── src/{main,test}/java/io/github/motokitabata/skillweave/   # controller/ service/ repository/ entity/ dto/ security/ config/ ...
│   │       main/resources/db/migration/      # Flyway
│   └── web/                    # vim の frontend/ に相当
│       ├── e2e/
│       └── src/{main,test,docs}/              # main: views/ components/ stores/ router/ lib/api/ workers/ 等
├── packages/
│   ├── solver/                 # ソルバー本体（ILP 組み立て・装飾品の後処理配置・Worker メッセージ）
│   │   ├── src/main/           # types.ts（temp/solver-types.ts が起点）, model/, worker/
│   │   ├── src/test/
│   │   └── bench/              # 実データ規模のベンチマーク（機能001で作る）
│   └── data/                   # マスターデータ生成パイプライン（§7）
│       ├── scripts/            # import-mhdb.ts（取得）, build.ts（変換・オーバーレイ・検証・出力）
│       ├── overlays/           # 手作業 YAML（効果数値・発動条件・鑑定護石テーブル・訂正）
│       ├── src/main/           # MasterBundle のスキーマ定義・ID 生成規則
│       ├── src/test/           # 参照整合性などの検証
│       └── dist/               # 生成物（コミットする。差分を PR でレビューするため）
├── docker/
│   ├── compose.yaml            # postgres:18 のみ（Valkey なし）
│   ├── compose.sonar.yaml      # vim と同じ（ローカル限定）
│   └── init/01_init.sql
├── design/
│   ├── tech-stack.md           # 実測値で新規作成
│   ├── data-model-standard.md  # vim から複製して §6 の差分を反映
│   ├── attributes.yaml         # 空の辞書から開始（§6.3 が最初のエントリ候補）
│   ├── master-data.md          # 新規。§7 の内容を卒業させる先
│   └── ui-design-standard.md   # vim から複製して調整（ゲーム用途に合わせて見直す）
├── docs/method/                # TSOD 原典（vim からコピー。改変しない）
├── specs/                      # feature-map.md と NNN-<slug>/（§9）
├── temp/                       # 本文書・solver-types.ts
├── tasks/                      # lessons.md（vim と同じ運用）
├── scripts/                    # sonar-local.sh 等
├── package.json                # ルート。workspace 横断スクリプト
├── pnpm-workspace.yaml         # ★ リポジトリ直下。サプライチェーン対策設定もここに集約
├── sonar-project.properties
├── CLAUDE.md
└── README.md
```

補足:

- `packages/*` も vim の `src/main` / `src/test` の分け方にそろえる（apps と同じ見た目にして迷いを減らす）。
- Java パッケージは `io.github.motokitabata.skillweave`（決定）。vim の `com.vehicleintake.vim` は所有していないドメインを逆順にした形だったが、
  本プロジェクトは自分が管理する名前空間（GitHub アカウント `Motoki-Tabata` → `motokitabata.github.io`）を使う。
  Java の識別子にハイフンは使えないため詰めて表記する。独自ドメインを取得してもパッケージ名は変えない（改名コストに見合わないため）。
  その下のレイヤード構成（`controller/` `service/` ...）は vim と同じ。

---

## 5. データ設計の前提

### 5.1 マスターデータとユーザーデータの分離

| | マスターデータ | ユーザーデータ |
|---|---|---|
| 置き場 | `packages/data/dist/*.json`（静的配信） | PostgreSQL |
| ID | ゲーム内 ID（gameId）から機械生成した文字列（§7.3） | UUIDv7（クライアント採番） |
| 版管理 | `master_version` | 行ごとの `version`（楽観的ロック）＋ jsonb を持つ行は `schema_version` |
| 参照 | — | マスター参照は FK を張らない `text`。整合性は `master_version` と照合してアプリ層で検証 |

### 5.2 テーブル（初期案）

- `users`: ID、Discord ID、作成日時 など
- `charms`: ID、`user_id`、`payload jsonb`（rarity・skills・slots）、`schema_version`、`version`、監査日時、`deleted_at`
- `user_weapons`: 巨戟アーティア等の個体差がある武器（ベース武器 ID＋復元ボーナス・付与シリーズ／グループスキル等）
- `builds`: ID、`user_id`、名前、`payload jsonb`（装備・護石参照・装飾品・発動条件）、**作成時の `master_version`**、`schema_version`、`version`
- `shares`: 短縮 ID、build の**スナップショット**（jsonb）、作成日時（参照ではなく複製。元を編集・削除しても共有内容が変わらない）
- `spring_session` 系: Spring Session JDBC が要求するテーブル（Flyway で作成）

護石のスキル・スロットは当面 jsonb。フェーズ③の逆引きで検索が必要になったら GIN インデックス、それでも足りなければ正規化を検討する。

---

## 6. データモデル設計標準（vim からの差分）

`design/data-model-standard.md` は vim から複製し、以下を反映する。

### 6.1 そのまま採用

命名規則一式（テーブル複数形・`_at`＋`timestamptz`・`_on`＋`date`・`is_`/`has_`・制約名の接頭辞・`V<n>__<動詞>_<対象>.sql`）、
区分カラムは `text`＋`CHECK`（ENUM 不使用）、主キーは UUID v7、論理削除は `deleted_at`（`is_deleted` は持たない）、
Attribute／Entity／Column の三層と `attributes.yaml` を SSoT とする運用、Flyway 前進のみ、Testcontainers 一本。

### 6.2 変更点

1. **採番責務**: ユーザーデータのテーブルは**クライアント採番を正**、`DEFAULT uuidv7()` は保険として残す。
   - ブラウザの `crypto.randomUUID()` は v4 のため、v7 は自前実装（依存を増やさない）。
   - サーバーは受け取った ID が他ユーザーの行と衝突した場合に拒否する。
2. **監査カラム**: `created_by` / `updated_by` / `deleted_by` は持たない（編集者は常に所有者）。所有者は `user_id`（`users` への FK）。
   `created_at` / `updated_at` は持つ。
3. **ロック**: 悲観的ロックの節は適用しない。**楽観的ロック `version integer`（JPA `@Version`）**を使う。
   競合判定に `updated_at` を使わない（端末の時計ずれに弱いため）。
4. **マスターデータ**: DB に置かない。ID は UUID ではなく gameId 由来の文字列（§7.3）。
5. **`schema_version`**: jsonb を持つテーブルにだけ付ける。
6. **タイムゾーン**: §3.2 のとおり UTC。

### 6.3 attributes.yaml の最初のエントリ候補（機能005で確定）

護石ID、所有者ID（`user_id`）、護石内容（`payload jsonb`）、スキーマ版（`schema_version`）、行バージョン（`version`）、
作成日時、更新日時、削除日時。

---

## 7. マスターデータ

> 卒業記録: 機能002で §7 全体を `design/master-data.md` へ移設し、実装（`packages/data`）済み。以降は `design/master-data.md` が正。

### 7.1 情報源（決定）

- **主: MHDB**（`LartTyler/mhdb-wilds-data` の `output/merged`、または `wilds.mhdb.io` API）。ゲームファイル由来で日本語を含む全言語の名前がある。
  - **コミット SHA を固定して取得**する。MHDB のコードは流用せず、出力 JSON を入力として使う（リポジトリは GPL-3.0）。クレジットを表記する。
- **補: 手作業 YAML のオーバーレイ**（MHDB に無いもの）
  - 火力計算用の効果数値（`effectsByLevel`）
  - 発動条件（怒り時など）
  - 鑑定護石の抽選テーブル（レア度ごとのスキル枠グループ・スロットパターン）
  - MHDB の誤りの訂正
- **予備: ゲームファイルからの自前抽出**。MHDB のアセンダンス対応が止まった場合に検討する。
- 攻略サイトはスクレイピングしない。人が照合するための参照にとどめる。

### 7.2 パイプライン

1. **取得**: SHA 固定で MHDB の統合 JSON を取得
2. **変換**: gameId から自前 ID を生成し `MasterBundle` の形へ。名前・説明文は ja/en の辞書に分ける
3. **オーバーレイ**: `overlays/*.yaml` を重ねる
4. **検証**: 参照切れ・レベル上限超過・スロット Lv 範囲などを Vitest で検査
5. **出力**: `dist/master-<version>.json` と辞書。差分を PR でレビュー

`master_version` の更新判定には MHDB の `/version`（取り込み時刻）を参考にする。

### 7.3 ID 規則（MHDB の推奨に従い gameId を使う。MHDB 自身の `id` は取り込み直しで変わりうるため使わない）

| 対象 | 形式 | 例 |
|---|---|---|
| スキル | `sk:<gameId>` | `sk:850626240` |
| 防具 | `ar:<防具セットの gameId>:<部位>` | `ar:-2117203456:head` |
| 装飾品 | `dc:<gameId>` | `dc:-2144349312` |
| 武器 | `wp:<武器種>:<gameId>`（gameId は武器種内でのみ一意） | `wp:charge-blade:22` |
| 生産護石 | `ch:<gameId>:<ランク>` | `ch:-2084662144:1` |

### 7.4 効果の説明文（決定）

- **ゲーム内の説明文をそのまま表示し、数値を補完する**。
  - 説明文は MHDB のスキルランクごとの説明（ja/en）を辞書に格納する。
  - 数値の補完は `effectsByLevel` から UI で生成する（例: 説明文の後ろに「攻撃力+9／会心率+5%」）。補完文は辞書に保存しない（計算で出す）。
- カプコンのガイドラインは公式素材の「そのまま使用」をガイドラインの対象外としている。説明文の掲載はこの点を認識したうえでの判断として記録する。
  アイコン・画像は引き続き使わない。

### 7.5 ゲーム仕様の確認結果（2026-10-02 時点。最終確認はオーナー）

- 武器用珠と防具用珠は別。複合珠は現状、武器の3スロ珠にのみある（アセンダンスで防具にも増える見込み）。
- スロット Lv は現行3まで。過去作は4まであったため型は4まで許す。
- 鑑定護石: スキル最大3種類（武器・防具スキル混在）、スロット最大3枠（武器用・防具用）。レア5〜8。レア8は1枠目に武器スロ①が確定、レア5〜7は武器スロなし。
- シリーズ／グループスキルの発動部位数はスキルごとに異なる。巨戟アーティアはシリーズ・グループを各1部位分付与でき、部位数に数える。
- 拡張「アセンダンス」（2027年予定）で「極意」スキル（特定スキルの上限を引き上げる）が復活する。

---

## 8. ソルバー

入出力型は `temp/solver-types.ts` が正（たたき台）。設計判断:

1. ソルバーは純粋関数。マスターもユーザーデータも自分で取りに行かず、受け取るだけ。
2. スロット種別（武器用／防具用）は部位ではなくスロット1つずつに持たせる（`Slot = { target, level }`）。護石の並び順にも意味がある。
3. 装飾品は「スロット Lv 別の個数」で ILP を解き、具体的な配置は後処理（貪欲法）で決める。
4. シリーズスキルとグループスキルは同じ `SetBonus`（`thresholds` の配列）で表す。
5. 火力計算の効果はデータ駆動（`effectsByLevel`、条件付き効果は `conditionId`、ユーザーがトグル）。
6. マスターは Worker に `loadMaster` で1回だけ渡す。`masterVersion` 不一致のリクエストは拒否する。
7. 武器は当面固定入力（探索対象にしない）。

---

## 9. 機能の順番（feature-map の初期案）

| No | slug | 内容 | 備考 |
|---|---|---|---|
| — | （ハーネス） | 雛形・CI・TSOD 一式・設計標準の整備 | TSOD 機能ではない。最初のセッションで行う（§10） |
| 001 | solver-spike | HiGHS WASM で実データ規模の問題が数秒以内に解けるかを検証 | 最大の技術リスクを先に潰す。結果は `design/tech-stack.md` に記録 |
| 002 | master-data-pipeline | §7 のパイプライン | 001 で使う実データもここから供給できると望ましい（001 は暫定データでも可） |
| 003 | solver-ui | ソルバー画面（ログインなし・ゲスト下書き） | フェーズ① の中心 |
| 004 | discord-login | Discord OAuth・Spring Session JDBC | |
| 005 | charm-save | 護石の保存・同期 | attributes.yaml の最初の確定（§6.3） |
| 006 | build-save-share | ビルドの保存・共有スナップショット | |

火力の可視化（フェーズ①の一部）は 003 に含めるか独立機能にするかを `/tsod-discover` で決める。

---

## 10. 最初の Claude Code セッションでやること

1. **リポジトリ作成**（`Motoki-Tabata/skillweave-mhwilds`。公開範囲は §11 を先に決める。Topics に `monster-hunter-wilds` 等を付け、アセンダンス対応は README と Topics で示す）。本文書と `solver-types.ts` を `temp/` に置く。
2. **TSOD 一式の流用**: vim から `.claude/`・`docs/method/`・`.githooks/`・`.github/` の雛形をコピーし、以下を読み替える。
   - `.claude/rules/*.md` のパス対象（`backend/**` → `apps/api/**`、`frontend/**` → `apps/web/**`）。Valkey 関連の規則は削除。
   - `packages/**` 用の rules が必要か検討（ソルバーは純 TS・DOM 非依存など）。
   - CLAUDE.md の Commands 表をモノレポ構成（ルートからの `pnpm -r` / `pnpm --filter`、`apps/api` の Gradle）に合わせる。
   - 一括検証スクリプト（`tsod-verify`）のパス。
3. **雛形作成と実測**: §4 の構成で `apps/api`・`apps/web`・`packages/solver`・`packages/data` を作り、依存を入れて解決版を実測し、
   `design/tech-stack.md` を新規作成する（§3.3 の確認項目を含める）。
4. **設計標準**: vim の `data-model-standard.md` を複製して §6 の差分を反映。`attributes.yaml` は空の辞書で作成。
5. **CLAUDE.md の憲法**を §12 の案で作成。
6. **CI** を通す（secret-scan / api / web / packages）。
7. `/tsod-discover` で §9 を `specs/feature-map.md` に起こす。

---

## 11. 未決事項

| 項目 | メモ |
|---|---|
| リポジトリの公開範囲 | ポートフォリオ目的なら public。public なら GitHub の Ruleset（ブランチ保護）が使える。vim は private のため `.githooks/pre-push` が唯一のガードだった |
| 独自ドメイン | Cookie を同一サイトにするために必要（§3.3） |
| マネージド DB | Neon / Supabase（PG18 提供状況で決める） |
| 火力の可視化の機能分割 | §9 |
| OCR スパイクの実施時期 | フェーズ②の前 |
| ホスティング費用の上限 | 無料枠を超えたときの方針 |

---

## 12. 憲法（CLAUDE.md）の案

vim の憲法から引き継ぐもの・変えるもの。

- **引き継ぐ**: スキーマ変更は Flyway のみ（`docker/init/` への DDL 追記禁止）／`ddl-auto: none`／axios 不使用・ネイティブ fetch ラッパー／
  shadcn-vue + Reka UI（コンポーネントはソースコピー方式）／lint は oxlint → ESLint の順／npm サプライチェーン対策設定は
  **リポジトリ直下の `pnpm-workspace.yaml`** に集約。
- **変える**: タイムゾーンは JST ではなく **UTC** に統一（表示はブラウザのローカル時刻）。Valkey 関連は削除。
- **追加する**:
  - ソルバーと OCR はブラウザ内で実行し、ユーザーの画像をサーバーへ送らない。
  - `packages/solver` は API の型・DOM に依存しない。
  - マスターデータは `packages/data` のパイプラインでのみ生成する。`dist/` を手で編集しない（直したいときはオーバーレイ）。
  - ユーザーデータの ID はクライアント採番の UUIDv7。
  - 公式画像・アイコンを使わない。画面に二次創作である旨を表記し、`©CAPCOM` は表記しない。営利化（広告・課金）をしない。
