-- ============================================================
-- 初期化スクリプト（DB・ロールのみ）
--
-- DB（swv_db）・アプリ用ロール（swv_app）は compose.yaml の
-- POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD で自動作成されるため、
-- このファイルでは行わない。
--
-- テーブル定義は一切ここに書かない。スキーマは Flyway
-- （apps/api/src/main/resources/db/migration/）が一元管理する。
-- 直接 DDL を書くと Flyway の管理と食い違い、起動失敗の原因になる。
-- ============================================================

-- タイムゾーンは compose.yaml の PGTZ で設定済みだが、念のため明示。
SET timezone = 'UTC';
