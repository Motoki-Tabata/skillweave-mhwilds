# Skillweave for MH Wilds

モンスターハンターワイルズ対応の**非公式**スキルシミュレータ（略称 `swv`）。PWA として動く Web アプリです。

> 本プロジェクトは個人による非公式の二次創作であり、株式会社カプコンとは関係ありません。
> カプコンの二次創作ガイドラインに従い、非営利で運営し、公式の画像・アイコンは使用しません。

- 分割リリースの予定: ① ソルバー＋護石の手入力＋火力の可視化 → ② 護石 OCR → ③ 逆引き（この護石があれば組める）
- 拡張「アセンダンス」（2027年予定）への対応は、公開後にこの README とリポジトリの Topics で示します。
- 設計方針の一次資料は [`temp/initial-design.md`](temp/initial-design.md)。確定した節から `design/`・`specs/` へ移していきます。

---

## 現在の状態

開発ハーネス（モノレポの雛形・CI・`main` の保護・契約ファースト運用・設計標準）を整備した段階です。機能は 001（solver-spike。HiGHS WASM の性能測定）・002（master-data-pipeline。MHDB からのマスターデータ生成）・003（solver-engine。`solveBuilds` と Worker のメッセージ型）・004（solver-ui。ログインなしで武器と必須スキルを指定して検索する最初の画面と e2e。ブラウザの Worker での測定は合格で、最大 1422.0 ms）が実装済みで、API はまだありません。

### 残作業（ハーネス）

| 作業 | 時期 |
|---|---|
| `/tsod-discover` で機能マップ（`specs/feature-map.md`）を作る | `.claude/` の配置後 |
| PWA（vite-plugin-pwa）の方針を決める（依存の provenance 欠落。[`design/tech-stack.md`](design/tech-stack.md)「主な判断」の 3） | 別セッションで詳細を確認して決める |

### 未決事項

| 項目 | メモ |
|---|---|
| ライセンス | 公開リポジトリだが未定。マスターデータの入力に MHDB（GPL-3.0 のリポジトリの出力 JSON）を使う点も踏まえて決める |
| 独自ドメイン | フロント（Cloudflare Pages）と API（Cloud Run）の Cookie を同一サイトにするために必要 |
| マネージド DB | Neon が PostgreSQL 18 を提供済み（[`design/tech-stack.md`](design/tech-stack.md) の §3.3 確認結果） |

---

## アーキテクチャ

```
┌──────────────────────────────┐        ┌──────────────────┐
│ apps/web  Vue 3 / Vite (PWA)  │  HTTP  │ apps/api          │
│  ├─ packages/solver（Worker） │ ─────▶ │ Spring Boot 4     │
│  └─ マスターデータ JSON        │        │ port 8080         │
│ port 5173                     │        └────────┬─────────┘
└──────────────────────────────┘                 ▼
                                        ┌──────────────────┐
                                        │ PostgreSQL 18     │
                                        │ port 5433 (swv_db)│
                                        └──────────────────┘
```

- ソルバー（と将来の OCR）はブラウザ内で実行します。ユーザーの画像はサーバーへ送りません。
- マスターデータは DB に置かず、`packages/data` が生成した JSON を静的配信します。DB はユーザーデータだけを持ちます。
- ソルバーと護石の入力はログインなしで使えます（端末内の下書き）。保存・共有は Discord ログインが必要です（機能009 以降）。

---

## 技術スタック（概要）

版・選定理由・検証結果の正は [`design/tech-stack.md`](design/tech-stack.md) です。ここではメジャー版までを示します。

| レイヤ | 技術 |
|---|---|
| API | Java 25 LTS / Spring Boot 4 / Gradle 9（Kotlin DSL）/ Flyway / springdoc-openapi |
| Web | Vue 3 / TypeScript 6 / Vite 8 / Tailwind CSS 4 /（shadcn-vue + Reka UI は 004 から） |
| packages | TypeScript 6 / Vitest 5 |
| Data | PostgreSQL 18 |
| パッケージ管理 | pnpm 11（リポジトリ直下の workspace。クールダウン・ビルドスクリプト遮断・信頼度の低下の拒否を有効化） |

---

## 前提環境

- JDK 25（Amazon Corretto 25 推奨）
- Node.js 24（24.12.0 以上）
- pnpm 11.25.0
- Docker（PostgreSQL と、テストの Testcontainers 用）

## セットアップ

```bash
git config core.hooksPath .githooks              # main への直接 push の拒否と gitleaks 検査（各自1回）
pnpm install                                     # リポジトリ直下で実行する
docker compose -f docker/compose.yaml up -d --wait
(cd apps/api && ./gradlew bootRun)               # http://localhost:8080/actuator/health
pnpm --filter @swv/web dev                       # http://localhost:5173
```

---

## 検証コマンド

CI（[`.github/workflows/ci.yml`](.github/workflows/ci.yml)）と同じ検証です。検証コマンドの正は [`CLAUDE.md`](CLAUDE.md) の「Commands」節です。

---

## ディレクトリ構成

```
skillweave-mhwilds/
├── .github/
│   ├── workflows/ci.yml        # secret-scan / api / web / packages
│   ├── dependabot.yml          # gradle / npm / github-actions / docker-compose のパッチ・マイナーを週次でまとめて更新（メジャーは四半期の棚卸し）
│   ├── pull_request_template.md
│   └── CODEOWNERS
├── .githooks/pre-push          # main への直接 push を拒否し、push 範囲を gitleaks で検査
├── contracts/                  # API 契約の単一実体（正）。規約は contracts/README.md
├── apps/
│   ├── api/                    # Spring Boot（io.github.motokitabata.skillweave。レイヤード構成）
│   │   └── src/{main,test}/
│   └── web/                    # Vue 3 SPA（src/main・src/test）
├── packages/
│   ├── solver/                 # ソルバー本体（DOM・API の型に依存しない純粋な TypeScript）
│   └── data/                   # マスターデータ生成パイプライン（dist/ は生成物としてコミットする予定）
├── docker/
│   ├── compose.yaml            # postgres:18 のみ（ホスト側ポート 5433）
│   ├── compose.sonar.yaml      # SonarQube（ローカル限定）
│   └── init/01_init.sql        # 初期化のみ（スキーマは Flyway）
├── design/                     # tech-stack / data-model-standard / attributes.yaml / ui-design-standard
├── docs/method/                # TSOD の原典（歴史的資料。改変しない。下記）
├── specs/                      # 薄仕様（1機能 = 1ディレクトリ）
├── temp/                       # 設計方針の一次資料・ソルバー入出力型のたたき台
├── scripts/sonar-local.sh
├── package.json                # ルート。workspace 横断スクリプト
├── pnpm-workspace.yaml         # workspace 定義・共有ツールの版（catalog）・サプライチェーン対策設定
└── sonar-project.properties
```

`docs/method/` の TSOD 原典は、手法を導入したときの資料をそのまま置いたものです。**現行運用の正ではありません。**
現行の手順の正は `.claude/skills/tsod-workflow/`（canon の配置後）、原典からの逸脱は同 `references/workflow-history.md` に記録します。

---

## main への直接 push を防ぐ

2つのガードを併用します。

- **GitHub の Ruleset**（サーバー側）: `main` への push を拒否し、PR のマージに CI（secret-scan / api / web / packages）の成功を必須にする。
- **`.githooks/pre-push`**（手元）: `main` への直接 push を拒否し、push 対象のコミットを gitleaks（CI と同じ版を docker で実行）で検査する。CI まで待たずに秘密情報の混入を止めるため。各自1回 `git config core.hooksPath .githooks` で有効化する。

---

## クレジット

- マスターデータは [MHDB](https://github.com/LartTyler/mhdb-wilds-data)（`LartTyler/mhdb-wilds-data`）の出力 JSON を入力として使う予定です（機能002 で導入。MHDB のコードは流用しません）。
