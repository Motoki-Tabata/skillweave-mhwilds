# 040: session-cleanup タスク

- [x] T1 [main]       `design/tech-stack.md`「稼働の実測（2026-11-11）」の、期限切れの `spring_session` の行が残っているという文の参照を、040 の決定（起動時の掃除。`specs/040-session-cleanup/decisions.md` Q149）への参照に付け替える。委譲の前に書く（plan D8）  refs plan D8
- [ ] T2 [api-agent]  `config/SessionStartupCleanup`（`SmartInitializingSingleton` で `JdbcIndexedSessionRepository.cleanUpExpiredSessions()` を 1 回呼び、失敗は WARN で残して起動を続ける）と、`application.yml` の `cleanup-cron` のコメントの修正。単体テスト `SessionStartupCleanupTest` と、2 つ目のアプリの起動で確かめる結合テスト `SessionStartupCleanupIntegrationTest`。呼び出しを外すと結合テストが失敗することを一度確かめて元に戻す。`TrainingProfileTest`・`ProdProfileTest`・`SessionPolicyTest` は変えない（plan D1〜D7）  refs spec §受入基準 AC-1, AC-2, AC-3, AC-4, AC-5, AC-6

順序: T1 → T2。並列にしない（T1 は委譲の前に書く常時許可外の変更）。
