# 040: session-cleanup

## 目的 / ユーザーストーリー
運営者として、期限の切れたログインのセッションの行（`spring_session`）を、最小インスタンス 0 の Cloud Run でも確実に消したい。今の `spring.session.jdbc.cleanup-cron`（毎日 3:00 UTC）は、インスタンスが無い時間や CPU が割り当たらない時間には動かず、本番では一度も動いていない（2026-11-11 に 25 行すべてが期限切れだった）。CPU が確実に割り当たる API の起動のたびに掃除し、期限切れの行を溜めないようにする（decisions.md Q149）。

用語:
- 期限切れのセッション: `spring_session` の `expiry_time` が現在より前の行と、`ON DELETE CASCADE` で連なる `spring_session_attributes` の行。
- 起動時の掃除: API の起動のたびに 1 回、Spring Session の `JdbcIndexedSessionRepository.cleanUpExpiredSessions()` を呼んで期限切れのセッションを消すこと（decisions.md Q149）。

## 受入基準（EARS記法）
- AC-1: WHEN API が起動したとき THE system SHALL 起動時の掃除を 1 回行い、期限切れのセッション（ログイン済みのセッションと、未ログインで認可を始めたセッションの両方）の `spring_session` と `spring_session_attributes` の行を消さなければならない。
- AC-2: WHEN 起動時の掃除を行うとき THE system SHALL 期限の切れていないセッションの行を残さなければならない。そのセッションの Cookie での `GET /api/auth/me` は、起動の前と同じく 200 を返さなければならない。
- AC-3: THE system SHALL 起動時の掃除の削除を Spring Session の `JdbcIndexedSessionRepository.cleanUpExpiredSessions()` で行い、テーブル名や削除の条件を持つ独自の SQL を書いてはならない。
- AC-4: IF 起動時の掃除が失敗したとき（DB に届かない・SQL のエラーなど） THEN THE system SHALL 起動を止めずに続け、失敗を WARN 以上のログに残さなければならない。
- AC-5: WHERE `training` プロファイル（AOT キャッシュの訓練の実行。DB に接続できない）で起動するとき THE system SHALL 今と同じく起動を最後まで通さなければならない（既存の `TrainingProfileTest` が通る）。
- AC-6: THE system SHALL `spring.session.jdbc.cleanup-cron` の値（`0 0 3 * * *`）を変えずに残し、`application.yml` のコメントを「本番では起動時の掃除が主で、cron はインスタンスが動き続けるときの予備」という実態に合わせなければならない（既存の `ProdProfileTest`・`SessionPolicyTest` の cron の検査は変えない）。

## スコープ外
- 起動時の掃除以外の掃除の経路（Cloud Scheduler・Worker の Cron Trigger・ログインの時・Neon の pg_cron・GitHub Actions）。decisions.md Q149 で外した
- `cleanup-cron` の値の変更と停止
- 掃除の件数のログ・メトリクス（Spring Session の DEBUG のログのまま）
- 本番への API のデプロイと、本番での期限切れの行の確認（`design/tech-stack.md`「API のデプロイ手順」で、デプロイの後に `select count(*) from spring_session where expiry_time < …` で見る）
- 削除したユーザーデータの物理削除とアカウントの削除（052 account-deletion）

## 契約差分
- なし（エンドポイント・スキーマを変えない。テーブルも変えない）

## 影響範囲
触る領域: api
常時許可外の変更予定:
- `design/tech-stack.md`（「稼働の実測」の、期限切れのセッションの行が消えずに残っているという記述（Q149 の参照）を、040 の決定（起動時の掃除）への参照に付け替える）

## 依存する機能ID
- 028
