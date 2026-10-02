# データモデル設計標準

> 全機能が従う横断標準。TSOD で機能を1つずつ確定する際、`plan.md`「データモデル」節はこの標準に従うこと。
>
> 作成日: 2026-10-02（vehicle-intake-management の同名文書を複製し、`temp/initial-design.md` §6 の差分を反映した）
> 対象: `skillweave-mhwilds`（swv）のユーザーデータ（PostgreSQL）

---

## 適用範囲

- PostgreSQL に置く**ユーザーデータ**の全テーブルに適用する（護石・個体差のある武器・ビルド・共有・ユーザー等）。
- **マスターデータ（スキル・防具・装飾品・武器・生産護石）は DB に置かない。** `packages/data` が生成した
  バージョン付き JSON を静的配信する。ID 規則や生成手順はこの標準の対象外（`temp/initial-design.md` §7。
  機能002 で `design/master-data.md` へ移す）。
- Spring Session JDBC が要求するテーブル（`spring_session` 系）は Spring の定義に従う。命名規則の対象外だが、
  作成は他のテーブルと同じく Flyway で行う。

---

## 命名規則

| 対象 | 規則 | 例 |
|---|---|---|
| テーブル | snake_case・複数形 | `charms` `user_weapons` |
| カラム | snake_case・単数形 | `discord_id` `master_version` |
| 主キー | `id`（型は下記「主キー・採番」を参照） | `id` |
| 外部キー | `<参照テーブルの単数形>_id` | `user_id` |
| 日時 | `_at` サフィックス・`timestamptz` | `created_at` `deleted_at` |
| 日付 | `_on` サフィックス・`date` | — |
| 真偽 | `is_` / `has_` プレフィックス・`boolean` | `is_public` |
| 区分 | `_type` / `_status` サフィックス。`ENUM` 型は使わず `text` ＋ `CHECK` 制約 | — |
| 制約・索引 | `pk_` / `fk_` / `uq_` / `ix_` / `ck_` ＋ テーブル名 ＋ カラム名 | `fk_charms_user_id` |
| マイグレーション | `V<n>__<動詞>_<対象>.sql` | `V1__create_users.sql` |
| 監査カラム | 全テーブルに `created_at` / `updated_at`（`timestamptz`）。`*_by` は持たない（下記） | — |

### 区分カラムに `ENUM` 型を使わない理由

PostgreSQL の `ENUM` 型は値を追加するたびに `ALTER TYPE ... ADD VALUE` が必要で、
Flyway マイグレーションの積み上げ運用（`V<n>__` で常に前進のみ）と相性が悪い
（`ALTER TYPE ... ADD VALUE` はトランザクション内で直後に使えない等の制約がある）。
`text` ＋ `CHECK (column IN (...))` であれば、値の追加は `CHECK` 制約を張り直す
通常の `ALTER TABLE` で済み、Flyway の前進のみの運用と整合する。

### 所有者と監査カラム

- ユーザーデータは必ず所有者を持つ。所有者は `user_id uuid NOT NULL`（`users (id)` への外部キー）で表す。
- 編集者は常に所有者本人なので、`created_by` / `updated_by` / `deleted_by` は**持たない**。
- `created_at` / `updated_at` は持つ（`timestamptz`）。時刻は UTC で保存する（下記「タイムゾーン」）。
- 端末側（IndexedDB の下書き）とサーバー側でユーザーデータのスキーマを同一にする。サーバーだけが付与するのは
  `user_id`（と、サーバーが管理する `created_at` / `updated_at` / `version`）だけとする
  （ゲスト下書きの一方向取り込みの前提。`temp/initial-design.md` §2.1）。

### 論理削除

論理削除するテーブルは、削除日時を記録するため以下のカラムを持つ。

- `deleted_at timestamptz NULL` — 削除日時。NULL の行が未削除。

**設計判断**:
- `is_deleted` 等の真偽カラムは持たない（同じ事実を2表現にしないため。日時で十分）。
- 削除者のカラム（`deleted_by`）は持たない（削除できるのは所有者だけのため）。
- 全テーブルに一律で付けるものではなく、論理削除が必要なテーブルだけに付ける（どのテーブルかは各機能の `spec.md` が決める）。

---

## 楽観的ロック

同時編集の競合は**楽観的ロック**で検出する。悲観的ロック（行の占有）は使わない。

- 更新されうるテーブルは `version integer NOT NULL DEFAULT 0` を持ち、JPA の `@Version` で扱う。
- クライアントは読んだ時点の `version` を更新要求に載せ、サーバーは一致しなければ競合として拒否する。
- **競合判定に `updated_at` を使わない。** 端末の時計ずれに弱いため。

---

## 主キー・採番方針

- 全テーブルの主キーは次の形で統一する。

  ```sql
  id uuid NOT NULL DEFAULT uuidv7() PRIMARY KEY
  ```

- **UUID v7 を採用する（v4 ではなく）。** PostgreSQL 18 は `uuidv7()` を組込み関数として
  提供しており、`pgcrypto` 等の拡張は不要（`docker/init/01_init.sql` にテーブル定義や
  `CREATE EXTENSION` を追記しない方針を崩さない）。v7 は時刻順に並ぶため、ログ追跡・
  障害調査・カーソルページングが素直になる。
- **ユーザーデータの採番はクライアントを正とする。** ゲストの下書き（IndexedDB）をログイン後に
  サーバーへ取り込むとき、ID を振り直さずに済ませるため。
  - ブラウザの `crypto.randomUUID()` は v4 なので、v7 は自前で実装する（依存を増やさない）。
  - `DEFAULT uuidv7()` は保険として残す（クライアントが ID を送らない経路があっても行が作れるように）。
  - サーバーは、受け取った ID が**他のユーザーの行**と衝突した場合に拒否する。
  - 副作用として ID から生成時刻がおおよそ推測できる。共有 URL に ID を出す場合は、別の短縮 ID を使う
    （`shares` の短縮 ID。`temp/initial-design.md` §5.2）。
- Hibernate 側でクライアント採番の ID をどう受け取るか（`@Id` に値を入れて `persist` するか等）と、
  既存 ID の行との区別（`merge` を避ける等）は本標準では決め打ちしない。**実装着手時に Hibernate の
  一次情報（javadoc・実機確認）で確認すること。**

---

## jsonb と `schema_version`

- 構造が機能とともに変わるデータ（護石の内容・ビルドの内容など）は `payload jsonb` に持ってよい。
- **jsonb を持つテーブルにだけ** `schema_version integer NOT NULL` を付け、`payload` の形の版を記録する。
  読み出し時に版を見て変換する（DB 側で一括変換しない）。
- マスターデータへの参照（スキル ID・防具 ID 等）は FK を張らない `text` で持つ。整合性は、その行が
  作られた時点の `master_version`（必要なテーブルだけが持つ）と照合してアプリ層で検証する。
- jsonb の中身を検索する必要が出たら GIN インデックスを検討し、それでも足りなければ正規化する。

---

## タイムゾーン

- JVM・PostgreSQL・JSON の日時はすべて UTC に統一する。表示時にブラウザのローカル時刻へ変換する。
- 日時カラムは必ず `timestamptz`。

---

## Attribute（データ項目）／ Entity（テーブル）／ Column（カラム）の三層

同じ項目が別テーブルで別の型・別の桁になる事故を防ぐため、責務を3層に分ける。

| 層 | 定義場所 | 誰が書くか |
|---|---|---|
| **Attribute（データ項目）** | `design/attributes.yaml` | **人が書く。ここが SSoT。** |
| **Entity（テーブル）** | 実 DB（Flyway マイグレーション） | 人が書く（Attribute を参照して組み立てる） |
| **Column（カラム）** | 実 DB | 人は書かない。テーブル定義書・ER図は実 DB から生成する（後続フェーズ） |

- `design/attributes.yaml` には、項目ごとに 論理名・物理名（カラム名）・型・桁・NULL 可否・ドメイン制約を
  **一度だけ**定義する。同じ論理名の項目が複数テーブルに現れる場合（例: `所有者ID` が `charms.user_id` にも
  `builds.user_id` にも現れる）、物理名・型が食い違っていないかをこの辞書で確認できるようにする。
- **辞書は TSOD の進行に合わせて育てる。** 初版はフォーマット定義のみとし、機能が1つ確定するたびに
  該当項目を追記する（最初の確定は機能005 charm-save の予定）。
- ER図・テーブル定義書の生成、および `attributes.yaml` と実 DB の突合を CI で機械検証する仕組みは、
  主要なテーブルが出揃ってから着手する（後続フェーズ・スコープ外）。

---

## 関連ドキュメント

- [`design/attributes.yaml`](attributes.yaml) — Attribute 辞書（SSoT）
- [`design/tech-stack.md`](tech-stack.md) — 技術スタックの選定理由・検証結果
- [`temp/initial-design.md`](../temp/initial-design.md) — 設計方針の一次資料（§5・§6 がこの標準の出典）
