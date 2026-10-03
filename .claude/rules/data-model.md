---
paths:
  - apps/api/src/main/resources/db/migration/**
---

# データモデル — 命名・型・監査カラムの要点（`db/migration/`）

このディレクトリは予約の場所で、無ければ最初のマイグレーションを足す機能で作る。置き場を先に決めておくのは、最初のマイグレーションを書く機能が置き場に迷わず、本ファイルがその最初のファイルから自動で読み込まれるようにするため。

正は `design/data-model-standard.md`。本ファイルは全文を再掲せず、マイグレーション作業時に思い出すべき要点だけを示す。`design/data-model-standard.md` と `design/attributes.yaml` の2文書をあわせて配線する（同一データモデル領域を扱うため1本にまとめている）。

- **主キー**: 全テーブル共通で `uuid DEFAULT uuidv7()`。ユーザーデータの採番はクライアントを正とし、`DEFAULT` は保険として残す。アプリ側に UUID 生成ライブラリを新規追加しない。選定理由は `design/data-model-standard.md`「主キー・採番方針」節を参照（本ファイルには転記しない）。
- **区分カラム**: `ENUM` 型は使わず `text` ＋ `CHECK` 制約。値追加を Flyway の前進のみ運用と整合させるため。
- **監査カラム**: 全テーブルに `created_at` / `updated_at`（`timestamptz`）を持たせる。`created_by` / `updated_by` / `deleted_by` は持たない（編集者は常に所有者。所有者は `user_id`）。詳細は `design/data-model-standard.md`「所有者と監査カラム」節を参照する。
- **日時**: `_at` サフィックス・`timestamptz`。UTC で保存する。
- **日付**: `_on` サフィックス・`date`。
- **真偽**: `is_` / `has_` プレフィックス・`boolean`。
- **テーブル名**: snake_case・複数形。
- **カラム名**: snake_case・単数形。
- **マイグレーションファイル名**: `V<n>__<動詞>_<対象>.sql`。
- **楽観的ロック**: 更新されうるテーブルは `version integer` を持つ。競合判定に `updated_at` を使わない。
- **テーブル設計は区間 B（`/tsod-screen-table`）で合意し、data-model-agent が書き出す**: 当該機能に必要な最小のテーブル設計は区間 B で inline 対話により合意し、書き出し役の `data-model-agent` が `design/data-model-standard.md`・`design/attributes.yaml`・本ディレクトリの Flyway マイグレーションへ反映する。

これ以外の規則（外部キー命名・制約/索引の接頭辞・jsonb と `schema_version`・`design/attributes.yaml` との三層構造等）は `design/data-model-standard.md` の該当節を参照する。
