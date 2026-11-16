# 040 session-cleanup の決定記録

## Q149（決定: 2026-11-17）
- 問い（`open-questions.md` からの移設）: `spring.session.jdbc.cleanup-cron`（毎日 3:00 UTC）は、最小インスタンス 0 の Cloud Run ではインスタンスが無い時間に動かない。CPU はリクエストの処理中だけ割り当てられるので、インスタンスが残っていても動くとは限らない。期限切れの `spring_session` の行が消えずに残る可能性がある（2026-11-04 に設定から推定）。2026-11-11 に本番で確かめた。`spring_session` の 25 行がすべて期限切れで、最も古い行は 2026-11-07 の作成だった（掃除は一度も動いていない）（仮: 機能マップに 040 session-cleanup として追加した。掃除の方法は 040 の区間 A で決める。URL を配る前には直さない。理由: 行は小さく、期限切れの行は読み出しのときに無効として扱われるので、フレンドへの公開の規模では影響が無い）
- 決定: API の起動のたびに、期限切れのセッションの掃除を 1 回行う。細部は次のとおりにする。
  - 掃除は Spring Session の `JdbcIndexedSessionRepository.cleanUpExpiredSessions()`（`spring-session-jdbc` 4.1.1 で公開のメソッド）を呼んで行い、削除の SQL を自前で書かない（理由: テーブル名や条件を Spring Session の定義と二重に持たない）。
  - 掃除が失敗しても（DB に届かないなど）起動は止めず、失敗をログに残す。AOT キャッシュの訓練の実行（`training` プロファイル。DB に接続できない）も今と同じく最後まで通ること。
  - 既存の `cleanup-cron`（毎日 3:00 UTC）は残す。値と既存のテスト（`ProdProfileTest`・`SessionPolicyTest`）は変えず、`application.yml` のコメントだけを実態（本番では起動時の掃除が主で、cron はインスタンスが動き続けるときの予備）に合わせる。
  - 外した案と理由:
    - Cloud Scheduler から専用のエンドポイントを叩く: Worker は `/api/*` を ID トークン付きで転送するので、エンドポイントは `/api` の外に置き、Scheduler 用のサービスアカウント・`run.invoker`・CSRF の除外・セッションを作らない設定・手順書が要る。毎日 Cloud Run と Neon を起こす（1 回 約 0.083 CU 時間）。
    - Worker の Cron Trigger から叩く: web（worker）と api の 2 領域にまたがり、公開経路の外にエンドポイントを置く問題は Scheduler の案と同じ。
    - ログインの時に掃除する: ログインの応答が遅れ、認証の経路に掃除が混ざる。
    - DB 側のジョブ（Neon の pg_cron）: Neon はスケールゼロで止まるので、止まっている間はジョブが動かない。
    - GitHub Actions の定期実行: DB かサービスアカウントの認証情報を Actions に渡すことになり、Q88 で後回しにした論点にぶつかる。
- 理由: 最小インスタンス 0・`--cpu-throttling` の Cloud Run で CPU が確実に割り当たるのは、起動中と要求の処理中だけである（`design/tech-stack.md`「費用」）。起動時の Flyway で Neon は既に起きているので、掃除のために Neon を余分に起こさない。インスタンスは最後の要求から約 15 分で落ちる（028 decisions.md Q91 の実測）ので、訪問があれば掃除も頻繁に走り、期限切れの行は次の起動で消える。残る穴（要求が途切れずインスタンスが 24 時間以上落ちない間）は、既存の cron が予備になる。触る領域が api だけで、契約とインフラを増やさない。
