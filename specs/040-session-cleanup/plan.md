## スタック
- Spring Boot 4.1.2・Java 25・`spring-session-jdbc` 4.1.1（`design/tech-stack.md` のとおり。版は変えない）
- テスト: JUnit 5・Mockito・`OutputCaptureExtension`（`spring-boot-test`。`ProdEnvironmentValidatorTest` で使用済み）・Testcontainers（`postgres:18.6-trixie`、`TestcontainersConfiguration`）
- 依存の追加: なし

## データモデル
なし

## 決定事項
- D1: 起動時の掃除は、`SmartInitializingSingleton` を実装した Bean の `afterSingletonsInstantiated()` で行う。理由: この呼び出しは refresh の中で、すべての singleton（Flyway の `FlywayMigrationInitializer` を含む）の生成の後、Web サーバー（Tomcat）がポートを開く `finishRefresh` の前に 1 回だけ走る。本番の `gc run deploy` は起動プローブを指定していない（既定の TCP の起動プローブ）ので、Cloud Run の「起動中」はポートが開くまでで、その間は `--cpu-throttling` でも CPU が割り当たる（`design/tech-stack.md`「費用」）。`ApplicationReadyEvent` はポートが開いた後に来るので使わない。掃除の DELETE の分だけ、ポートが開くまでの時間が延びる（Neon は Flyway で既に起きている）。
- D2: 掃除の Bean は `apps/api/src/main/java/io/github/motokitabata/skillweave/config/SessionStartupCleanup.java` に置く。`@Component`、コンストラクタで `JdbcIndexedSessionRepository`（Boot の Spring Session JDBC の自動構成が登録する Bean）を受け、`afterSingletonsInstantiated()` で `cleanUpExpiredSessions()` を 1 回呼ぶ（AC-1・AC-3）。テーブル名・削除の条件を持つ SQL は書かない。`@Profile` などで起動の種類を分けない（`training` でも呼び、D3 の失敗の扱いで通す。AC-5）。
- D3: 掃除の失敗は `RuntimeException` で捕まえ、SLF4J で WARN に例外ごと（スタックトレース付き）残し、起動を続ける（AC-4）。メッセージは英語で、既存の例外の文言にそろえる（例: `Failed to clean up expired sessions on startup`）。理由: DB に届かないときは `TransactionTemplate` が `CannotCreateTransactionException`（`TransactionException`）を、SQL のエラーは `DataAccessException` を投げ、共通の親は `RuntimeException` だけである。型を絞ると、想定の外の型で起動が止まる。`Error` は捕まえない。
- D4: `apps/api/src/main/resources/application.yml` の `cleanup-cron` の上のコメントだけを直す（AC-6）。内容は「本番（最小インスタンス 0 の Cloud Run）では起動時の掃除（`SessionStartupCleanup`）が主で、この cron はインスタンスが動き続けるときの予備。毎日 3:00、JVM の既定のタイムゾーン＝UTC で解釈される」。キーと値（`0 0 3 * * *`）は変えないので、`spring-configuration-metadata.json` の確認は要らない。`ProdProfileTest`・`SessionPolicyTest` の cron の検査は変えない。
- D5: AC-3・AC-4 の単体テストは `apps/api/src/test/java/io/github/motokitabata/skillweave/config/SessionStartupCleanupTest.java` に置く。Spring を起動せず、`JdbcIndexedSessionRepository` を Mockito で作る。
  - AC-3: `afterSingletonsInstantiated()` の後、`cleanUpExpiredSessions()` がちょうど 1 回呼ばれ、ほかの呼び出しが無い（`verifyNoMoreInteractions`）。
  - AC-4: `cleanUpExpiredSessions()` が `CannotCreateTransactionException` と `DataAccessException` の具象（例: `CannotGetJdbcConnectionException`・`BadSqlGrammarException`）を投げるとき、`afterSingletonsInstantiated()` が例外を投げず、`OutputCaptureExtension` の出力に `WARN` とメッセージがある。入力だけが違うので `@ParameterizedTest` にまとめる（`java:S5976`）。
- D6: AC-1・AC-2 の結合テストは `apps/api/src/test/java/io/github/motokitabata/skillweave/config/SessionStartupCleanupIntegrationTest.java` に置く。`@SpringBootTest(webEnvironment = RANDOM_PORT)`・`@Import(TestcontainersConfiguration.class)`・`@FakeDiscordCredentials` の 1 つ目のアプリで行を作り、同じコンテナを指す 2 つ目のアプリを起動して「起動のたびに」を確かめる（1 つ目のアプリの掃除は、行を作る前に済んでいるため）。
  1. 1 つ目のアプリで、実際のログインの経路（`DiscordHttp`）で、ログイン済みのセッション A・B と、未ログインで認可を始めたセッション C を作る。A の Cookie の `GET /api/auth/me` が 200 であることを確かめる。
  2. B・C の `spring_session.expiry_time` を、テストの準備の SQL（`JdbcTemplate` の UPDATE）で現在より前にする。B・C の `spring_session_attributes` の行が 1 件以上あることを確かめる。準備の SQL はテストだけに置き、AC-3 の対象（本体）ではない。
  3. `SkillweaveApplication.application().run(...)` で 2 つ目のアプリを起動する。引数は `--server.port=0`、`PostgreSQLContainer` の Bean から取った `--spring.datasource.url`・`--spring.datasource.username`・`--spring.datasource.password`、`--DISCORD_CLIENT_ID=test-client`・`--DISCORD_CLIENT_SECRET=test-secret`。プロファイルは指定しない（既定の `local`。接続先は引数で上書きされる）。try-with-resources で閉じる。
  4. 2 つ目のアプリの起動の後、B・C の `spring_session` と `spring_session_attributes` の行が 0 件、A の行が残っていること（AC-1・AC-2）と、2 つ目のアプリのポート（`local.server.port`）への A の Cookie の `GET /api/auth/me` が 200 であること（AC-2）を確かめる。
  - api-agent は、`afterSingletonsInstantiated()` の中の呼び出しを一時的に外すとこのテストが失敗する（B・C の行が残る）ことを一度確かめ、元に戻してから成功を確かめる。両方の実出力の要点を完了報告に貼る。外した状態はコミットしない。
- D7: AC-5 は既存の `TrainingProfileTest` を変えずに通す。`training` プロファイルでは D1 の掃除がポート 1 への接続の拒否で失敗し、D3 のとおり WARN を残して起動が続く（AOT キャッシュの訓練の実行 `-Dspring.context.exit=onRefresh` でも、掃除は refresh の中なので同じ経路を通る）。api-agent は、`TrainingProfileTest` の実行時間を変更の前後で比べ、WARN の行が出ていることと合わせて完了報告に書く。大きく延びた（目安 3 秒以上）ときは止めて報告する。
- D8: `design/tech-stack.md`「稼働の実測（2026-11-11）」の末尾の文「期限切れの `spring_session` の行は消えずに残っている（`specs/open-questions.md` Q149）。」を、2026-11-11 には残っていた事実（25 行すべてが期限切れ）と、040 から API の起動のたびに掃除すること（`specs/040-session-cleanup/decisions.md` Q149）への参照に付け替える（文言はメインが書くときに決める）。同文書の v1.0.0 の条件の Q149 の列挙は変えない（リリースの条件で、040 の範囲の外）。メインが委譲の前に書く（T1）。

## 常時許可外の変更
- `design/tech-stack.md`（稼働の実測の、期限切れのセッションの行が残っているという記述の参照を、040 の決定 Q149 への参照に付け替える。担当: メイン。理由: spec の影響範囲の常時許可外の変更予定。委譲の前に書く。D8）
