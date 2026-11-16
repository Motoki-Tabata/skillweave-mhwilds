## スタック
- Spring Boot 4.1.2・Java 25・Logback（Spring Boot の BOM が決める版）・Tomcat 11.0.27（`design/tech-stack.md` のとおり。版は変えない）
- 構造化ログ: Spring Boot の組み込みの構造化ログの logstash 形式（`org.springframework.boot.logging.logback.LogstashStructuredLogFormatter`）と `StructuredLoggingJsonMembersCustomizer`（`org.springframework.boot.logging.structured`）
- テスト: JUnit 5・Mockito・`OutputCaptureExtension`（`ProdEnvironmentValidatorTest` で使用済み）・Testcontainers（`TestcontainersConfiguration`）・Jackson 3（`tools.jackson.databind.ObjectMapper`。出力の JSON を読むだけ）
- 依存の追加: なし（AC-9）

## データモデル
なし

## 決定事項
- D1: `apps/api/src/main/resources/application-prod.yml` に次を足す（AC-1・AC-2・AC-4・AC-5・AC-9）。キーは `spring-boot-4.1.2.jar` の `META-INF/spring-configuration-metadata.json` で実在を確かめ、非推奨の印は無かった。
  ```yaml
  logging:
    structured:
      format:
        console: logstash
      json:
        rename:
          "[@timestamp]": time
        customizer: io.github.motokitabata.skillweave.config.CloudLoggingSeverityCustomizer
        stacktrace:
          printer: standard
  ```
  - `rename` のキーは角括弧で囲む（囲まないと、Map のキーの束縛で `@` が落ちる）。区間 C で、ビルド済みの jar をこの設定で起動して、全行が `time` を持ち `@timestamp` を持たないことを確かめた。`time` の値は `LogstashStructuredLogFormatter` が `ISO_OFFSET_DATE_TIME` と JVM の既定のタイムゾーンで書く（本番は `main()` が UTC にするので `2026-11-16T16:38:31.077862757Z` の形）。
  - バナーは足さずに消える。`spring.main.banner-mode` の既定は、構造化ログが有効なら `off` である（メタデータの説明と、jar の実測で非 JSON の行が出なかったことで確かめた）。`spring.main.banner-mode` は書かない。
  - `application.yml`・`application-local.yml`・`application-training.yml` は変えない（AC-8）。
- D2: `severity` は `apps/api/src/main/java/io/github/motokitabata/skillweave/config/CloudLoggingSeverityCustomizer.java` で足す（AC-3・AC-9）。`StructuredLoggingJsonMembersCustomizer<ILoggingEvent>` を実装し、引数の無い public のコンストラクタを持つ（Spring Boot が `logging.structured.json.customizer` の FQCN から作る）。`customize` で `members.add("severity", ILoggingEvent::getLevel).as(<読み替え>)` を足す。読み替えは `ch.qos.logback.classic.Level` から LogSeverity の文字列へ、ERROR→`ERROR`、WARN→`WARNING`、INFO→`INFO`、DEBUG→`DEBUG`、TRACE→`DEBUG`、それ以外（イベントには来ない）→`DEFAULT`。`level`・`level_value` は消さない（decisions.md Q158）。`spring.factories` での登録はしない（全プロファイルの構造化ログに効く登録になり、設定が `application-prod.yml` と 2 か所に分かれるため）。
- D3: スタックトレースの印字は `logging.structured.json.stacktrace.printer: standard`（`StandardStackTracePrinter.rootLast()`。資料の説明は「`Throwable#printStackTrace()` と同じ」）にする（AC-5）。理由: 指定しない既定（`logging-system`）は Logback の `ThrowableProxyConverter` で書き、共通のフレームを `... 13 common frames omitted` と書く。`standard` では `... 13 more` になる（区間 C で jar を両方の設定で起動して確かめた）。
- D4: AC-6 は既存の経路で満たし、出す箇所のコードは足さない。要求の処理中に `ApiExceptionHandler` と Spring MVC の既定の扱いが応答に変えない例外は、`DispatcherServlet` から `ServletException` として Tomcat まで上がる。Tomcat 11.0.27 の `StandardWrapperValve` は、これを `Servlet.service() for servlet [dispatcherServlet] ... threw exception [Request processing failed: <外側の例外>] with root cause` の ERROR と例外つきで JULI（JUL）に出し、Spring Boot の `LogbackLoggingSystem` が入れる `SLF4JBridgeHandler` で Logback に届く（ソースで確かめた）。応答（500 と既定の `/error` の本文）は変えない。
  - 例外に原因の連なりがあるとき、Tomcat は `StandardWrapper.getRootCause` で最も深い原因の例外を渡すので、`stack_trace` はその例外の `printStackTrace()` になる（外側の例外の名前とメッセージは `message` に入る）。最も深い原因の例外も、投げられたときの呼び出し元（アプリのフレーム）をフレームに持つ。外側の例外ごと出すには `ApiExceptionHandler` に 500 のハンドラを足す必要があり、応答の本文が変わるので、041 では変えない（spec のスコープ外「ログを出す箇所とレベルの見直し」）。
- D5: AC-7 は既存の経路で満たし、コードは足さない。`SpringApplication.reportFailure` が `Application run failed` を ERROR と例外つきで出す。区間 C で、jar を `prod` で DB に届かない URL（`localhost:1`）で起動して、最後の行が `stack_trace` に `Caused by: ... java.net.ConnectException` の連なりを持つ ERROR の 1 行になること、`ProdEnvironmentValidator` の失敗も同じ形になることを確かめた。FailureAnalyzer が扱う失敗は spec のスコープ外（decisions.md「区間 C での spec の変更」）。
- D6: ログの仕組みの設定は `SpringApplication.run` のたびに作り直され、キャッシュされたテストのコンテキストを使い回すときは作り直されない。形式を確かめるテストは、アプリを明示的に起動するか、そのクラスだけのコンテキストを作って、テストの実行順で形式が変わらないようにする。D7〜D9 はこの方針で置く。
- D7: AC-3 の単体テストは `apps/api/src/test/java/io/github/motokitabata/skillweave/config/CloudLoggingSeverityCustomizerTest.java` に置く。Spring を起動せず、`JsonWriter.<ILoggingEvent>of(new CloudLoggingSeverityCustomizer()::customize)` で、各レベルの `LoggingEvent` を書いた JSON の `severity` を確かめる（ERROR→`ERROR`、WARN→`WARNING`、INFO→`INFO`、DEBUG→`DEBUG`、TRACE→`DEBUG`）。入力だけが違うので `@ParameterizedTest` にまとめる（`java:S5976`）。
- D8: AC-1〜AC-5・AC-7・AC-8 の起動のテストは `apps/api/src/test/java/io/github/motokitabata/skillweave/config/StructuredLogStartupTest.java` に置く。`@ExtendWith(OutputCaptureExtension.class)` で、`SkillweaveApplication.application().run(...)` を明示的に呼ぶ（`ProdEnvironmentValidatorTest`・`TrainingProfileTest` と同じ起動の経路）。DB には届かない URL（`jdbc:postgresql://localhost:1/x`。`application-training.yml` と同じく即座に拒否される）を渡し、Testcontainers は使わない。
  - `prod`: 引数は `--spring.profiles.active=prod`・`--server.port=0`・`--spring.datasource.url=jdbc:postgresql://localhost:1/x`・`--spring.datasource.username=u`・`--spring.datasource.password=p`・`--DISCORD_CLIENT_ID=test-client`・`--DISCORD_CLIENT_SECRET=test-secret`・`--DISCORD_REDIRECT_URI=https://swv.example/api/login/oauth2/code/discord`・`--SWV_WEB_TOP_URL=https://swv.example/`。起動が例外で失敗することを確かめ、`output.getOut()` の空でない各行について次を確かめる。
    - 各行が 1 つの JSON のオブジェクトとして読める（AC-1）。`Starting SkillweaveApplication` を含む `message` の行がある（AC-1 の起動中のログ・AC-2）。
    - 各行が文字列の `message` を持つ（AC-2）。各行の `severity` が、同じ行の `level` を D2 の読み替えにかけた値と一致する。`WARNING` の行が少なくとも 1 行ある（DB に届かない起動では `Exception encountered during context initialization` が WARN で出る）（AC-3）。
    - 各行の `time` が `OffsetDateTime.parse` で読め、`@timestamp` を持たない（AC-4）。
    - `logger_name` が `org.springframework.boot.SpringApplication` の行の `severity` が `ERROR` で、`stack_trace` が `Caused by: ` と `java.net.ConnectException` を含み、`\t... <数> more` の行を持ち、`common frames omitted` を含まない（AC-5・AC-7）。
  - `local`・`training`（AC-8）: `training` は `--spring.profiles.active=training`・`--server.port=0` で起動して閉じる（成功する）。`local` は `--spring.profiles.active=local`・`--server.port=0`・上と同じ DB の URL と資格情報・`--DISCORD_CLIENT_ID=test-client`・`--DISCORD_CLIENT_SECRET=test-secret` で起動して失敗させる。どちらも、出力が `Starting SkillweaveApplication` を含み、`{` で始まる行が無いことを確かめる。`local` では、スタックトレースが `\tat ` で始まる別の行に分かれていること（今の平文のまま）も確かめる。
- D9: AC-5・AC-6 の要求のテストは `apps/api/src/test/java/io/github/motokitabata/skillweave/config/StructuredLogRequestTest.java` に置く。`@SpringBootTest(webEnvironment = RANDOM_PORT)`・`@Import(TestcontainersConfiguration.class)`・`@FakeDiscordCredentials`・`@ActiveProfiles("prod")`・`ProdProfileTest` と同じ `@TestPropertySource`・`@ExtendWith(OutputCaptureExtension.class)` に、`@MockitoBean ShareService` と `@DirtiesContext` を付ける（D6。このクラスだけのコンテキストにし、ほかのクラスに使い回させない）。
  - AC-6: `ShareService.view` が、原因を持たない `IllegalStateException`（メッセージはこのテストだけの文字列）を投げるようにし、`GET /api/shared-builds/<英数字 12 文字>` を実際の HTTP で送る。応答が 500 であることと、`output.getOut()` に、`severity` が `ERROR` で、`stack_trace` がその例外の `printStackTrace()` の出力と一致する JSON の行があることを確かめる。比べるときは末尾の改行の有無だけをそろえる。
  - AC-5: SLF4J のロガーで、原因を 2 段持ち、共通のフレームを持つ例外（例: 同じメソッドの中で作った原因を外側の例外に渡す）を `error` で出し、その行の `stack_trace` が外側の例外の `printStackTrace()` の出力と一致することを確かめる（`Caused by:` と `... <数> more` を含むこと）。
  - api-agent は、`application-prod.yml` から `stacktrace.printer: standard` を一時的に外すと AC-5 のテストが、`customizer` の行を外すと AC-3 の起動のテスト（D8）が失敗することを一度ずつ確かめ、元に戻してから成功を確かめる。両方の実出力の要点を完了報告に貼る。外した状態はコミットしない。
- D10: 既存のテストは変えずに通す。`ProdEnvironmentValidatorTest` は出力に環境変数名を含むことを確かめており、JSON の `message` にも名前が入るので通る見込み。`ProdProfileTest`・`TrainingProfileTest`・`SessionStartupCleanupTest` も変えない。落ちたら直さずに止めて報告する。
- D11: `design/tech-stack.md`「Sentry」の行の「構造化したログにする扱いは `specs/open-questions.md` Q158。」を、041 の決定（`specs/041-api-structured-log/decisions.md` Q158。`prod` のログを `stack_trace` と `severity` を持つ 1 行の JSON にした）への参照に付け替え、同じ行の「今の平文のログでは」を「当時の平文のログでは」に直す（AC-10）。メインが委譲の前に書く（T1）。

## 常時許可外の変更
- `design/tech-stack.md`（「Sentry」の行の Q158 の参照を、041 の決定への参照に付け替える。担当: メイン。理由: spec の影響範囲の常時許可外の変更予定。委譲の前に書く。D11）
