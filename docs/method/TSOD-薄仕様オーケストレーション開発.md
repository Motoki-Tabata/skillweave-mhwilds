# TSOD — 薄仕様オーケストレーション開発

**Thin-Spec Orchestrated Development**
AIエージェント駆動開発のための統合開発手法（2026年版）

---

## 目次

- [0. サマリ](#0-サマリ)
- [1. 設計思想](#1-設計思想)
- [2. 前提となる調査結果](#2-前提となる調査結果)
- [3. 手法全体像](#3-手法全体像)
- [4. Phase 0：ハーネス整備](#4-phase-0ハーネス整備)
- [5. Phase 1：ヒアリングと機能分解](#5-phase-1ヒアリングと機能分解)
- [6. Phase 2：薄仕様の作成](#6-phase-2薄仕様の作成)
- [7. Phase 3：計画とタスク分解](#7-phase-3計画とタスク分解)
- [8. Phase 4：オーケストレーション実行](#8-phase-4オーケストレーション実行)
- [9. Phase 5：検証ゲートとマージ](#9-phase-5検証ゲートとマージ)
- [10. Phase 6：仕様の更新とドリフト対策](#10-phase-6仕様の更新とドリフト対策)
- [11. Gitブランチ戦略](#11-gitブランチ戦略)
- [12. フロントエンド＋バックエンド同時開発への適用](#12-フロントエンドバックエンド同時開発への適用)
- [13. リスクと前提](#13-リスクと前提)
- [14. 導入ロードマップ](#14-導入ロードマップ)
- [付録A. テンプレート集](#付録a-テンプレート集)
- [付録B. 参考文献](#付録b-参考文献)

---

## 0. サマリ

| 項目 | 内容 |
|---|---|
| 名称 | TSOD（Thin-Spec Orchestrated Development / 薄仕様オーケストレーション開発） |
| 一次成果物 | 機能単位の薄い仕様書（1〜3ページ）。コードは生成・検証される二次成果物 |
| 目標成熟度 | **Spec-Anchored**（仕様とコードが並走し、テストが整合を強制する）。Spec-as-Source は狙わない |
| 構成要素 | BMADの役割設計 × Spec Kitの仕様パイプライン × Spec Kittyのworktree隔離と受入ゲート × 契約ファースト × トランクベース＋スタックPR |
| 実行単位 | 1薄仕様 = 1機能ブランチ = 1worktree群 = 1スタックPR |
| 適用範囲 | フロントエンド／バックエンド同時開発、モノレポ推奨（別リポジトリでも運用可） |
| 適さない場面 | 使い捨てプロトタイプ、単独で短命なプロジェクト、要件が未知の探索的作業 |

---

## 1. 設計思想

TSODは5つの原則の上に立つ。

1. **憲法を先に置く** — 不変制約（言語・FW・セキュリティ・禁止パターン）を最初の仕様より前にコミットする。
2. **1機能 = 1薄仕様** — 大規模要件を、単独でデモできる縦切りの機能に分解し、それぞれを1〜3ページの仕様に落とす。厚い仕様は擬似コードになり、プログラムを二度書くことになる。
3. **契約を先に固める** — API・スキーマ・型を実装より先に確定し、フロント／バックの並列開発のガードレールにする。
4. **実装役と検証役を分ける** — 実装するエージェントと検証するエージェントを分離することで、並列実行にスケールし、ユニットテストが構造的に検出できないアーキテクチャ違反や契約ドリフトを捕捉できる。
5. **並列化は依存グラフで決める** — 真に独立なタスクだけを並列化し、依存があるものは順序化する。worktree隔離はファイルレベルの依存を解決しない。

### 単一フレームワークを採用しない理由

2026年6月の比較研究（arXiv:2606.04967）は、主要6フレームワークを6次元（仕様・コンテキスト・役割・実行・検証・移植性）で採点し、**6次元すべてを強くカバーするフレームワークは存在しない**と結論づけた。プロセスの深さと移植性は構造的なトレードオフの関係にある。

| フレームワーク | 仕様 | 文脈 | 役割 | 実行 | 検証 | 移植性 | 計 |
|---|---|---|---|---|---|---|---|
| GitHub Spec Kit | 2 | 1 | 1 | 1 | 1 | 2 | 8 |
| OpenSpec | 2 | 1 | 0 | 1 | 0 | 2 | 6 |
| BMAD Method | 2 | 2 | 2 | 1 | 2 | 1 | 10 |
| Get Shit Done (GSD) | 1 | 2 | 0 | 1 | 0 | 0 | 4 |
| Spec Kitty | 2 | 1 | 1 | 2 | 2 | 1 | 9 |
| Reversa | 2 | 2 | 0 | 0 | 1 | 1 | 6 |

（0=なし／1=部分的／2=中核）

したがってTSODは**次元ごとに最良の実践を組み合わせる**方針をとる。

---

## 2. 前提となる調査結果

### 手法の世代比較

| 観点 | 従来（ウォーターフォール） | 現在主流（アジャイル／DevOps） | AIエージェント駆動 |
|---|---|---|---|
| 一次成果物 | 設計書 | 動くコード | 仕様（コードは生成物） |
| 仕様の読み手 | 人間 | 人間 | 人間とエージェント両方 |
| 仕様の強制力 | 助言的 | テストが部分的に強制 | テスト／契約がドリフトで落ちる |
| 仕様の寿命 | 前工程で確定、以後陳腐化 | 軽量、コードが正 | 生きた成果物、継続的に検証 |
| 並列化の単位 | 工程 | チーム／ストーリー | エージェント × worktree |
| ボトルネック | 実装 | 実装＋テスト | **レビューと統合順序** |
| 主な失敗様式 | 手戻りが巨大 | 属人化・暗黙知依存 | 仕様ドリフト、文脈盲目、レビュー崩壊 |

### ボトルネック移動の裏づけ

- 2026年3月時点でClaude CodeがGitHubコミットの約4%を占め、Codex CLIは週次アクティブユーザー300万に到達。ボトルネックは生成からレビューへ移動した。
- 2026年の実証研究：エージェント作成PRは変更が大きいほど、force pushがあるほどマージされにくい。レビュアーの関与度が統合成功と最も強く相関する。
- 別の2026年研究：エージェント作成PRの多くにレビュー記録がなく、レビューコメント自体が他のエージェントによるものも多い。
- 2026年4月改訂の大規模研究：6,299リポジトリの464,900件のAI起因の問題を追跡し、22.7%が最新バージョン時点で残存。

### 実務での効果報告

KDDIアジャイル開発センターは2025年9月から仕様駆動開発を導入し、SMS／プッシュ通知のAPI基盤開発に適用。業務内容が「設計2割・開発8割」から「設計8割・開発2割」へ変化したと報告している。**人の工数は仕様化側に寄る**前提で見積もりを組む必要がある。

---

## 3. 手法全体像

```
Phase 0  ハーネス整備（初回のみ）
   憲法 / AGENTS.md階層 / 検証コマンド / CI / 契約パッケージ
        │
Phase 1  ヒアリング → 機能マップ + 依存グラフ + 曖昧点リスト
        │
Phase 2  1機能 = 1薄仕様（EARS受入基準・スコープ外・影響範囲）
        │
Phase 3  計画（plan.md）とタスク分解（tasks.md、仕様条項へのトレーサビリティ）
        │
Phase 4  オーケストレーション実行
   Orchestrator → Contract / Backend / Frontend / Test / Reviewer
        │
Phase 5  検証ゲート → 人間の受入 → スタック順にマージ
        │
Phase 6  仕様の更新（spec ⇔ plan ⇔ tasks ⇔ code のドリフト検査）
        │
        └──→ 次の機能へ
```

**黄金律：仕様から直接コードへ飛ばない。** 計画をレビューしてからタスク分解し、タスクをレビューしてから実装する。

---

## 4. Phase 0：ハーネス整備

プロジェクト開始時に一度だけ行う。ここが弱いと以降すべてが崩れる。

### 4.1 憲法（不変制約）

最初の仕様を書く**前に**コミットする。プロジェクト全体の決定はEARSのUbiquitous文で書く。

```markdown
# 憲法（Constitution）
- システムは TypeScript strict モードを使用しなければならない。
- システムは 秘密情報を環境変数経由でのみ読み込まなければならない。
- システムは 全APIエンドポイントに契約テストを備えなければならない。
- システムは 直接SQLを書かず、指定のORM経由でのみDBへアクセスしなければならない。
```

### 4.2 AGENTS.md の階層配置

AGENTS.mdはLinux Foundationが管理する公開標準で、Claude Code / Codex CLI / Cursor / Aider / Devin / GitHub Copilot / Gemini CLI / Windsurf / Amazon Q がnativeに読む。大半のエージェントは**編集対象ファイルに最も近いもの**を読むため、モノレポでパッケージ単位の上書きが可能。

```
/AGENTS.md                  ← 全体：言語バージョン、パッケージマネージャ、
                               コミット形式、セキュリティ、モノレポ構成
/apps/api/AGENTS.md         ← バックエンド固有の規約
/apps/web/AGENTS.md         ← フロントエンド固有の規約
/packages/contracts/AGENTS.md ← 契約更新の手順
```

**避けるべき2つの失敗**

| 失敗 | 内容 | 対策 |
|---|---|---|
| 全ルールをグローバル化 | 無関係なルールが毎回コンテキストに載り、ウィンドウが非効率になる | 全体に関わるものだけグローバル。残りはモジュール／パッケージにスコープ |
| ルールを後追いで書く | パターンが定着してからルール化しても守られない | パターンを導入したその瞬間にルールも書く |

### 4.3 検証コマンドの明示

エージェントの挙動に最も影響するセクション。ビルド／テスト／lint／型チェックのコマンドを明記する。

```markdown
## Commands
- build:     pnpm build
- test:      pnpm test
- lint:      pnpm lint
- typecheck: pnpm typecheck
- e2e:       pnpm test:e2e
- contract:  pnpm gen:contracts && pnpm test:contract
```

### 4.4 リポジトリ側の整備

- ブランチ保護（mainへの直接pushを禁止）
- 必須チェック（build / test / lint / typecheck / contract）
- CODEOWNERS
- マージキュー（エージェントのPR量に耐えるため必須）
- 契約パッケージの切り出し（第12章参照）

---

## 5. Phase 1：ヒアリングと機能分解

対話エージェント（アナリスト役）がユーザーと壁打ちし、大規模要件を機能単位に分解する。**出力は3点**。

### 5.1 機能マップ

| 機能ID | 名称 | 1行の価値 | 優先度 | 想定サイズ |
|---|---|---|---|---|
| 001 | メールログイン | ユーザーがアカウントにアクセスできる | P0 | S |
| 002 | 注文一覧 | 購入履歴を確認できる | P0 | M |
| 003 | 注文詳細 | 個別注文の内訳を確認できる | P1 | S |

### 5.2 依存グラフ

**並列化可否の唯一の根拠**となる。人間の勘ではなく、この成果物で判定する。

```
001 メールログイン
 ├─→ 002 注文一覧
 │     └─→ 003 注文詳細
 └─→ 004 プロフィール編集     ← 002 と並列可
```

### 5.3 曖昧点リスト

計画に入る前にエージェントが曖昧点を洗い出し、ユーザーに確認する。ここで潰さなかった曖昧さは、後工程で必ず倍のコストになる。

```markdown
## 要確認事項
- [ ] Q1: ログインリンクの有効期限は？（仮：15分）
- [ ] Q2: 未登録メールアドレスの場合の挙動は？（仮：202を返し列挙を防ぐ）
- [ ] Q3: 注文一覧のページング方式は？（仮：カーソルベース）
```

---

## 6. Phase 2：薄仕様の作成

### 6.1 「薄仕様」の定義

**1薄仕様の適正条件（すべて満たすこと）**

- [ ] 仕様が **1〜3ページ** に収まる
- [ ] 受入基準が **5〜15個** のEARS文
- [ ] **単独でデモできる縦切り**（UI〜DBまでの1本）
- [ ] 触るパッケージが **3つ以下**
- [ ] **1〜3日**でマージまで到達できる見込み

満たさない場合は分割、小さすぎる場合は統合する。この判定自体をエージェントのチェックリストにする。

### 6.2 仕様テンプレート

配置は `specs/NNN-<slug>/spec.md`（1機能 = 1ディレクトリ）。

```markdown
# 004: パスワードレス・マジックリンクログイン

## 目的 / ユーザーストーリー
訪問者として、パスワードを覚えずにメールだけでログインしたい。
パスワード管理の負担とリセット問い合わせを減らすため。

## 受入基準（EARS記法）
- WHEN ユーザーが有効なメールアドレスを送信した
  THE system SHALL 15分間有効なワンタイムログインリンクを送信しなければならない。
- IF ログインリンクが2回以上使用された
  THEN システムは HTTP 410 Gone で拒否しなければならない。
- WHERE メールアドレスがアカウントに紐づかない場合
  THE system SHALL アカウント列挙を防ぐため HTTP 202 を返さなければならない。
- THE system SHALL リンクトークンをハッシュ化して保存し、平文で保存してはならない。
- WHILE トークン検証が進行中である
  THE system SHALL 送信ボタンを無効化しなければならない。

## スコープ外
- ソーシャルログイン、SSO、パスワードフォールバック
- 多要素認証

## 契約差分
- 追加: POST /auth/magic-link   （req: {email}, res: 202）
- 追加: GET  /auth/verify?token= （res: 200 | 410）
- 追加: スキーマ magic_tokens(id, user_id, token_hash, expires_at, consumed_at)

## 影響範囲
触ってよい:
- packages/contracts/openapi.yaml
- apps/api/src/auth/**
- apps/web/src/routes/login/**
- tests/e2e/auth/**
触ってはいけない:
- apps/api/src/orders/**
- packages/shared/constants.ts

## 依存する機能ID
- なし（本機能が 002, 004 の前提）
```

### 6.3 EARS記法

受入基準は人間にもモデルにも曖昧でない形で書く。EARS（Easy Approach to Requirements Syntax）の5パターンでほぼ全てを網羅できる。

| パターン | テンプレート | 用途 |
|---|---|---|
| Ubiquitous | The system **shall** … | 常時成立する制約 |
| Event-driven | **WHEN** … **THE system SHALL** … | イベント起点の振る舞い |
| State-driven | **WHILE** … **THE system SHALL** … | 状態継続中の振る舞い |
| Unwanted behavior | **IF** … **THEN** … | 異常系・拒否条件 |
| Optional | **WHERE** … **THE system SHALL** … | 条件付き機能 |

**見返り：** この書き方の基準はほぼ1:1でテストケースに対応する。これが仕様を「助言的」ではなく「実行可能」にする。

### 6.4 薄仕様を書く際の規律

- 実装詳細ではなく**ドメイン言語**で書く
- 「スコープ外」を必ず書く。エージェントの探索範囲を縛る唯一の手段
- 「影響範囲」を必ず書く。並列実行時の**ファイル所有権**の宣言になる（第8章参照）
- 仕様が擬似コードになったら書きすぎ。**プログラムを二度書いている**

---

## 7. Phase 3：計画とタスク分解

### 7.1 plan.md

```markdown
## スタック
Node 22 + Fastify / Postgres 16 / Redis（トークンTTL）

## データモデル
magic_tokens(id, user_id, token_hash, expires_at, consumed_at)

## 決定事項
- トークン = 32バイト CSPRNG、SHA-256 ハッシュで保存
- 未知メールへの202はコントローラ層で強制
- レート制限は 5回/分/IP
```

### 7.2 tasks.md

各タスクは**満たす仕様条項を引用する**。テストが落ちたときにどの意図が壊れたかを特定できるようにする。

```markdown
- [ ] T1  contract: POST /auth/magic-link, GET /auth/verify を openapi.yaml に追加   refs spec §契約差分
- [ ] T2  migration: magic_tokens テーブル                                          refs spec §契約差分
- [ ] T3  POST /auth/magic-link（発行 + 送信）                                       refs spec §受入基準 1, 4
- [ ] T4  GET  /auth/verify（消費 + セッション）                                     refs spec §受入基準 2
- [ ] T5  ログインフォーム UI + 送信中の無効化                                        refs spec §受入基準 5
- [ ] T6  契約テスト（202 / 410 パス）                                               refs spec §受入基準 2, 3
- [ ] T7  発行エンドポイントのレート制限                                             refs plan §決定事項
```

### 7.3 トレーサビリティのルール

- コミットメッセージに仕様を引用する
  `feat(auth): magic link issue endpoint, refs specs/004-magic-link/spec.md`
- PRの説明に仕様IDと満たす受入基準番号を書く
- 仕様に紐づかない変更はPRに混ぜない

---

## 8. Phase 4：オーケストレーション実行

### 8.1 役割定義

BMAD的な分業をコード生産に絞って軽量化する。各エージェントは**書き込み権限を持つディレクトリを限定**する。

| 役割 | 責務 | 書き込み権限 |
|---|---|---|
| **Orchestrator** | 依存グラフから実行順を決定、worktree払い出し、マージ順序の決定 | なし（制御のみ） |
| **Contract Agent** | OpenAPI / 型 / スキーマの更新 | `packages/contracts/**` |
| **Backend Agent** | API・ドメイン・永続化 | `apps/api/**` |
| **Frontend Agent** | 画面・状態・結線 | `apps/web/**` |
| **Test/QA Agent** | 契約テスト・E2E | `tests/**` |
| **Reviewer Agent** | 仕様⇔差分の突合、憲法違反の検出 | **読み取り＋コメントのみ** |

**Reviewerを実装エージェントから分離することが要**。SDDは実装役と検証役を分離することで並列エージェントにスケールし、ユニットテストが構造的に検出できないアーキテクチャ違反やAPI契約のドリフトを捕捉する。

### 8.2 オーケストレーションの3階層と段階導入

2026年のツール群は3階層に整理できる。**下から順に上げる**こと。

| 階層 | 内容 | 規模 | 代表例 |
|---|---|---|---|
| **Tier 1** | 単一ターミナルのサブエージェント。追加ツール不要 | 1〜2 | Claude Code サブエージェント / Agent Teams |
| **Tier 2** | 隔離worktreeで複数エージェント。人間がダッシュボード・差分レビュー・マージ制御に関与 | 3〜10 | Conductor, Vibe Kanban, Claude Squad, Nimbalyst, Agent Orchestrator |
| **Tier 3** | クラウドVMでエージェントが走り、戻るとPRができている | バックログ消化 | Claude Code Web, GitHub Copilot Coding Agent, Jules, Codex Web |

多くのチームは3階層を使い分ける。**Tier 1 → Tier 2 の順に、並列度3〜5から**始める。

### 8.3 並列化の判定基準

**worktree隔離は同時実行エージェント間のファイルレベル依存を解決しない。**
エージェントAがAPIを作り、エージェントBがそのAPIを呼ぶフロントエンドを作る場合、BはAのエンドポイント署名を作業中に必要とする。これらは並列化ではなく**順序化**すべきタスクである。

判定フロー：

```
2つのタスクは並列化してよいか？
 ├─ 依存グラフ上で依存関係がある？ ────→ YES: 直列化する
 ├─ 「影響範囲」のファイル集合が交差する？ → YES: 直列化する
 ├─ 同じ契約ファイルを変更する？ ────→ YES: 契約を先に単独で確定させる
 └─ いずれもNO ──────────────→ 並列化してよい
```

### 8.4 並列実行時の運用上の落とし穴

| 問題 | 症状 | 対策 |
|---|---|---|
| ポート／サービス衝突 | 複数エージェントが同じdevサーバ・DBを奪い合う | worktreeごとに `.env.local` を用意し、ポートを分離 |
| 共有外部状態 | DB・Dockerボリューム・キューが共有される | worktreeごとに別DB／別コンテナ |
| タスク境界の曖昧さ | 2エージェントが同じモジュールを触り、誰も予期しない衝突が起きる | 起動前に**明示的なファイル所有権**を定める（＝薄仕様の「影響範囲」） |
| 3-wayマージの失敗 | エージェントがマージ文脈を安全に再構成できない | 衝突が起きたら人間が解決。エージェントに任せない |

---

## 9. Phase 5：検証ゲートとマージ

### 9.1 ゲートの連鎖

```
worktreeで実装
   ↓
CI グリーン（build / test / lint / typecheck / contract）
   ↓
Reviewer Agent（仕様⇔差分の突合、憲法違反の検出）
   ↓
★ 人間の受入 ★  ← ここは外さない
   ↓
スタック順にマージ
```

### 9.2 人間ゲートを外さない理由

- エージェント作成PRの多くにレビュー記録がなく、レビューコメント自体が他のエージェントによるものも多いという2026年の研究結果がある
- レビュアーの関与度が統合成功と最も強く相関する
- 変更を小さなスタックに分割してもレビュー可能性は上がるが、**人間の監督それ自体は保証されない**

**並列度を上げる前に、レビュー体制を上げること。** レビューが単一障害点になるのがこの手法の最大の実務リスク。

### 9.3 Reviewer Agent のチェックリスト

```markdown
- [ ] 差分は仕様の受入基準に1:1で対応しているか
- [ ] 「スコープ外」に記載された領域に手を入れていないか
- [ ] 「影響範囲」外のファイルを変更していないか
- [ ] 憲法に違反していないか
- [ ] 契約変更が openapi.yaml に反映され、型が再生成されているか
- [ ] 各受入基準に対応するテストが存在するか
- [ ] コミットに仕様IDが引用されているか
```

---

## 10. Phase 6：仕様の更新とドリフト対策

マージ後、`spec ⇔ plan ⇔ tasks ⇔ code` の整合を確認し、乖離があれば**仕様側を直す**。

```markdown
## ドリフト検査（マージ後に実行）
- [ ] 実装で変更した設計判断が plan.md に反映されているか
- [ ] 追加された受入基準が spec.md に反映されているか
- [ ] 実装しなかった項目が「スコープ外」に移動されているか
- [ ] 契約の実体（openapi.yaml）と実装が一致しているか
```

仕様が真実の源であるなら、コードと整合し続けなければならない。**コード変更が仕様を無効化した時点を検出する**仕組みを持たない限り、SDDは単に用語の層を1枚増やしただけのバイブコーディングになる。

---

## 11. Gitブランチ戦略

### 11.1 構成

トランクベースを骨格に、機能ごとに短命ブランチ。機能内はレイヤー別のスタックPR。

```
main（保護 + マージキュー）
└─ feat/NNN-<slug>            ← 1薄仕様 = 1機能ブランチ = 1worktree群
   ├─ NNN/1-contract          ← PR#1 → feat/NNN-<slug>
   ├─ NNN/2-backend           ← PR#2 → NNN/1-contract
   ├─ NNN/3-frontend          ← PR#3 → NNN/1-contract（backendと並列可）
   └─ NNN/4-e2e               ← PR#4 → NNN/2-backend, NNN/3-frontend
```

### 11.2 なぜスタックPRか

スタックPRは依存ブランチの連鎖を第一級の単位として扱う。各層がmainではなく**直下のブランチ**を対象とし、最終的にトランクに着地する。レビュアーは自分の層の差分だけを見て、CIは最終ターゲットに対して走り、マージは自動でカスケードする。

**エージェント時代に固有の理由：** 複数エージェントが同じフィーチャーブランチを共有すると、責務上は分かれて見えても依存ファイルはすぐ重なる。ECの注文フローなら `models/order.py` と `config/db.yaml` が最初に衝突し、API作業が始まると `tests/conftest.py` がホットスポットになる。構造的な問題は**複数の作業者が同じブランチHEADを取り合っている**ことであり、加えてエージェントは3-wayマージの文脈を安全に再構成するのが苦手である。

### 11.3 スタックにすべきでない場合

**複数エージェントが並列に動いているというだけの理由でスタックにしてはいけない。**
独立タスクは独立ブランチ・独立PRのほうが適切。スタックが有効なのは、本物の依存連鎖と一貫したレビューの筋書きを表している場合に限る。

| 関係 | 扱い |
|---|---|
| 機能内のレイヤー間（contract → backend → frontend → e2e） | **スタック** |
| 機能間（依存グラフ上で独立） | **独立ブランチ・独立PR** |
| 機能間（依存あり） | 独立ブランチ。ただし**マージ順序をOrchestratorが制御** |

### 11.4 ツール選択

| ツール | 状況 |
|---|---|
| GitHub Stacked PRs | 2026年7月31日に公開プレビュー。stack mapで順序付きPR系列を追跡、並列レビュー可、承認PRと配下の未マージ層を1操作でマージ。`gh-stack` スキル経由でコーディングエージェントからも操作可。既存のブランチ保護と必須チェックは不変。**GAまでの変更は見込むべき** |
| Graphite / Aviator / Git Town | 成熟したサードパーティ。既に使っているなら乗り換えを急ぐ必要はない。AviatorのエージェントプラグインはコーディングエージェントにRaw Gitではなく `av branch` / `av pr` / `av sync` を使わせる |

### 11.5 運用ルール

- **短命に保つ。** ブランチは1〜2日を目安。スタック方式で変更を小さく短命に保てるのは、**スタックの底が頻繁に統合される場合に限る**
- **統合worktreeを単一マージポイントにする。** 統合ゲーティングとして、統合worktreeが唯一のマージ先になる
- **命名規約**：`feat/NNN-<slug>` / `NNN/<layer-no>-<layer>`
- **コミット規約**：`<type>(<scope>): <summary>, refs specs/NNN-<slug>/spec.md`
- **ブランチ保護 + CODEOWNERS + マージキュー** は必須。エージェントのPR量に耐えるため
- **force pushを避ける。** エージェントPRはforce pushがあるとマージされにくいという実証結果がある

---

## 12. フロントエンド＋バックエンド同時開発への適用

**適用可能。むしろ契約ファーストとの相性で最も効果が出る領域。**

### 12.1 推奨構成：モノレポ + 契約パッケージ

```
project-root/
  specs/
    004-magic-link/
      spec.md
      plan.md
      tasks.md
  packages/
    contracts/
      openapi.yaml            ← 単一の契約実体
      generated-types.ts      ← 自動生成
      api-client.ts           ← 自動生成
      AGENTS.md
    shared/
      enums.ts
      constants.ts
  apps/
    api/
      AGENTS.md               ← API変更時はOpenAPI更新必須、
      src/                       DB変更時はマイグレーション必須、テスト追加必須
    web/
      AGENTS.md               ← CSS変更時はビルド検証必須、
      src/                       コンポーネント作成時はStorybook考慮、
                                 型定義変更時はeslintチェック必須
  tests/
    e2e/
  AGENTS.md                   ← 全体規約
```

### 12.2 実行フロー

```
Spec ─→ Contract ─┬─→ Backend ─┐
                  └─→ Frontend ─┴─→ E2E
```

第11章のスタック構造とそのまま一致する。契約PRが先に着地するため、バックエンドとフロントエンドは**生成型とモックに対して並列作業できる**。

### 12.3 契約がガードレールになる仕組み

```
バックエンドがスキーマ変更
   ↓
契約（openapi.yaml）が更新される
   ↓
フロントエンドの型が再生成される
   ↓
フロントの使い方が誤っていればコンパイルが失敗する
   ↓
契約テスト／E2Eが挙動の不一致を捕捉する
```

この構造により、バックエンドが黙って応答形状を発明せず、フロントエンドが戻り値を推測せず、エージェントが散在する実装詳細から全てを推論する必要がなくなる。**エージェントの推論だけに頼らず、契約とテストをガードレールとして働かせる**のが要点。

### 12.4 モノレポを推奨する理由

別リポジトリだと、1つのプロダクト機能に対して別々のPRができる。バックエンドPRは単体では正しく見え、フロントエンドPRも単体では正しく見えるが、本当の問題は**機能全体が動くかどうか**である。

方針：**デプロイはモジュラーに保ち、エンジニアリングの文脈は統一し、契約は明示的に保つ。** バックエンドとフロントエンドは引き続き別々にデプロイできる。

### 12.5 別リポジトリのまま運用する場合

- 契約を**独立パッケージとしてバージョン管理**する（npm/private registry等）
- 仕様IDを両リポジトリのPRタイトルに入れて紐付ける
- 契約パッケージのバージョン更新PRを、両リポジトリのスタックの底に置く
- E2Eは第3のリポジトリまたはCI上で契約バージョンを固定して実行する

---

## 13. リスクと前提

推奨するだけでは不誠実なので、否定的な評価も列挙する。

### 13.1 手法そのものへの批判

| リスク | 内容 | TSODでの緩和 |
|---|---|---|
| **仕様ドリフト** | 仕様とコードが乖離し、仕様が信用できなくなる | Phase 6のドリフト検査。Spec-Anchored止まりとし、コードを真実の源に保つ |
| **「Adopt」ではない** | ThoughtworksはSDDをTechnology Radarの**Assess**リングに置き、「実行可能なコードが依然として真実の源であり保守を要する」として「仕様だけで十分」という見方を明確に否定している | Spec-as-Sourceを目標にしない |
| **過剰仕様** | 仕様が擬似コードになると、プログラムを二度書くことになる | 薄仕様の適正条件（1〜3ページ、5〜15基準）で機械的に制限 |
| **偽の確信** | 間違った仕様に適合しても、何の要件も満たさない | Phase 1の曖昧点リストと人間の受入ゲート |
| **新しい皮のウォーターフォール** | Brandon Kindred「Same Patterns, New Hype」(2026)は、SDDは大部分がウォーターフォール／契約設計のリブランドであり、**価値はツールではなく仕様を書きながら行う思考そのもの**にあると論じる | この批判は的を射ている。Phase 1のヒアリング品質が全体の上限を決めると認識する |
| **儀式化** | ツールの複雑さが、見合った価値なしにセレモニーを増やす | Tier 1から段階導入し、効果が確認できた要素だけ残す |

### 13.2 運用上のリスク

| リスク | 内容 | 対策 |
|---|---|---|
| **レビューの単一障害点** | 生成量にレビューが追いつかない | 並列度を上げる前にレビュー体制を上げる。スタックPRで差分を小さくする |
| **AI由来の欠陥の残存** | 2026年4月改訂の研究では、AI起因の問題の22.7%が最新バージョン時点でも残存 | 契約テスト・E2E・Reviewer Agentの多層防御 |
| **サプライチェーン** | コミュニティ製のコマンド・スキル・テンプレートはソフトウェアパッケージ同様のリスクを持ち、1つの命令やスキルがエージェントに危険なコマンドを実行させたり機微な文脈を収集させたりし得る | 導入するスキル／プラグインを監査対象にする。権限スコープを絞る |
| **フレームワークの揮発性** | コミュニティ製フレームワークは組織移管や停止が起きる（GSDの例） | 移植性の高い層（AGENTS.md、EARS、OpenAPI、Git）に依存し、特定ツールに深く結合しない |

### 13.3 適用判断

**採用する価値がある場合**
- AIコーディングアシスタントを使っている
- 要件が複雑
- メンテナが複数いる
- 統合が多い、または規制対象のシステム

**採用しないほうがよい場合**
- 使い捨てプロトタイプ
- 単独で短命なプロジェクト
- 要件がまだ未知の探索的作業

---

## 14. 導入ロードマップ

最初から全部やらないこと。**ツールはループを強制するために使うものであり、思考を置き換えるためのものではない。**

### Week 1 — 基盤

- [ ] 憲法をコミット
- [ ] AGENTS.md を階層配置（root / api / web）
- [ ] 検証コマンドを明記
- [ ] ブランチ保護 + CODEOWNERS + マージキューを設定
- [ ] **既存の1機能を薄仕様で書き直す**（Tier 1、並列なし）

### Week 2–3 — 契約とスタック

- [ ] `packages/contracts` を切り出し、型生成を自動化
- [ ] 1機能で `Spec → Contract → BE/FE → E2E` のスタックPRを通す
- [ ] コミット規約（仕様ID引用）を運用開始
- [ ] Reviewer Agent のチェックリストを整備

### Week 4–6 — 並列化

- [ ] worktree隔離のセットアップ（`.env.local`、別DB／コンテナ）
- [ ] 依存グラフに基づき、独立機能を2〜3並列で実行
- [ ] Orchestrator役とReviewer役を明確に分離
- [ ] マージ順序の制御ルールを運用

### Week 7以降 — スケール

- [ ] 依存グラフからのworktree自動払い出し
- [ ] ドリフト検査の自動化
- [ ] Tier 3（クラウドエージェント）でバックログを消化
- [ ] 並列度を段階的に拡大（レビュー体制の拡張とセットで）

### 効果測定の指標

| 指標 | 見るもの |
|---|---|
| 仕様→マージのリードタイム | 手法が速度に効いているか |
| PR1本あたりの差分行数 | レビュー可能性が保たれているか |
| 人間レビューでの差し戻し率 | 仕様品質が上がっているか |
| 仕様ドリフト検出件数 | Phase 6が機能しているか |
| マージ後の不具合密度 | 検証ゲートが機能しているか |
| 設計:実装の工数比 | 「設計8割・開発2割」への移行が起きているか |

---

## 付録A. テンプレート集

### A.1 ディレクトリ構成（初期セットアップ）

```
project-root/
├── AGENTS.md
├── CODEOWNERS
├── .specify/
│   └── constitution.md
├── specs/
│   └── NNN-<slug>/
│       ├── spec.md
│       ├── plan.md
│       └── tasks.md
├── packages/
│   ├── contracts/
│   └── shared/
├── apps/
│   ├── api/AGENTS.md
│   └── web/AGENTS.md
└── tests/e2e/
```

### A.2 ルートAGENTS.md 骨子

```markdown
# AGENTS.md

## Commands
build / test / lint / typecheck / e2e / contract のコマンド

## モノレポ構成
apps/api（バックエンド）, apps/web（フロント）, packages/contracts（契約）

## 全体規約
- 言語・FWバージョン
- コミット形式: <type>(<scope>): <summary>, refs specs/NNN-<slug>/spec.md
- 秘密情報の取り扱い
- 禁止パターン

## 作業の進め方
1. specs/NNN-<slug>/spec.md を最初に読む
2. 「影響範囲」外のファイルを変更しない
3. 「スコープ外」の実装をしない
4. 契約変更は packages/contracts のPRを先に立てる
```

### A.3 Orchestrator への指示テンプレート

```markdown
機能ID: NNN
仕様: specs/NNN-<slug>/spec.md

手順:
1. 仕様の「依存する機能ID」を確認し、未マージの依存があれば待機する
2. 仕様の「影響範囲」から、並列可能なレイヤーを判定する
3. レイヤーごとにworktreeとブランチを払い出す
   - NNN/1-contract（先行、単独実行）
   - NNN/2-backend, NNN/3-frontend（contract完了後に並列）
   - NNN/4-e2e（両方完了後）
4. 各worktreeに .env.local を配置し、ポートとDBを分離する
5. 各レイヤーの完了後、CIグリーンを確認してからReviewer Agentを起動
6. Reviewer通過後、人間の受入を待つ
7. 受入後、スタック順にマージする

制約:
- 「影響範囲」外のファイルを変更するエージェントは即停止する
- マージ衝突が発生した場合、エージェントに解決させず人間にエスカレーションする
```

### A.4 PRテンプレート

```markdown
## 仕様
specs/NNN-<slug>/spec.md

## このPRが満たす受入基準
- [ ] 受入基準 1: ...
- [ ] 受入基準 2: ...

## スタック上の位置
NNN/2-backend → NNN/1-contract → feat/NNN-<slug> → main

## 契約変更
なし / あり（openapi.yaml の差分を記載）

## 影響範囲の遵守
- [ ] 仕様の「影響範囲」内のファイルのみ変更した
- [ ] 「スコープ外」の実装をしていない
```

---

## 付録B. 参考文献

**論文・研究**

- Macedo, S. O. (2026). *From Prompt to Process: a Process Taxonomy and Comparative Assessment of Frameworks Supporting AI Software Development Agents.* arXiv:2606.04967
- Piskala, D. B. (2026). *Spec-Driven Development: From Code to Contract in the Age of AI Coding Assistants.* arXiv:2602.00180
- Marri, S. R. (2026). *Constitutional Spec-Driven Development: Enforcing Security by Construction in AI-Assisted Code Generation.* arXiv:2602.02584
- Taghavi, P. & Bhavani, S. (2026). *Spec Kit Agents: Context-Grounded Agentic Workflows.* arXiv:2604.05278

**実践ガイド**

- Spec-Driven Development in 2026: What It Is, the Tooling, and How Teams Actually Use It — https://dev.to/krlz/spec-driven-development-in-2026-what-it-is-the-tooling-and-how-teams-actually-use-it-2fk2
- The Code Agent Orchestra — https://addyosmani.com/blog/code-agent-orchestra/
- Stacked PRs and AI Worktrees — https://georgheiler.com/2026/03/17/stacked-prs-and-ai-worktrees/
- Running Coding Agents in Parallel with Git Worktrees — https://dev.to/andrea_schiona/running-coding-agents-in-parallel-with-git-worktrees-4cnk
- How to Use Git Worktrees for Parallel AI Agent Execution — https://www.augmentcode.com/guides/git-worktrees-parallel-ai-agent-execution
- Why AI Agents Need Monorepos, Not Just Better Prompts — https://www.cosx.ai/blogs/why-ai-agents-need-monorepos-not-just-better-prompts
- AGENTS.md Complete Guide for Engineering Teams (2026) — https://blog.buildbetter.ai/agents-md-complete-guide-for-engineering-teams-in-2026/
- Stacked Pull Requests - The Complete Guide for Developers — https://www.awesomecodereviews.com/best-practices/stacked-prs/
- GitHub Stacked PRs — Public Preview (July 2026) — https://explainx.ai/blog/github-stacked-pull-requests-public-preview-july-2026
- gh-stack Explained: Why Branching Strategy Changes in the Age of AI Multi-Agent Development — https://smartscope.blog/en/blog/gh-stack-multi-agent-branch-strategy/

**フレームワーク**

- GitHub Spec Kit — https://github.com/github/spec-kit
- OpenSpec — https://github.com/Fission-AI/OpenSpec
- BMAD Method — https://github.com/bmad-code-org/BMAD-METHOD
- Spec Kitty — https://github.com/Priivacy-ai/spec-kitty

**日本語資料**

- 仕様駆動開発（SDD）とは？AI駆動開発における基本概念と実践ツールを解説（クラウドエース）— https://cloud-ace.jp/column/detail546/
- KDDI系が仕様駆動開発を採用、AIで業務は「設計8割・開発2割」に（日経クロステック）— https://xtech.nikkei.com/atcl/nxt/column/18/00001/11413/
- ループエンジニアリングとは？（Hexabase）— https://www.hexabase.com/column/loop-engineering-orchestration-ai-agent-guide-2026

---

*作成日: 2026年9月1日*
