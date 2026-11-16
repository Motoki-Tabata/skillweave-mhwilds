# 041 api-structured-log の決定記録

## Q158（決定: 2026-11-17）
- 問い（`open-questions.md` からの移設）: API の例外が Error Reporting に載らない。2026-11-11 に、本番と同じイメージ（`api:b29693c`）の一時のサービスを届かない DB の URL で起動して失敗させたところ、スタックトレースは 1 行ずつ別のログ（`textPayload`）になり、severity も付かず、10 分待っても Error Reporting にエラーは載らなかった（一時のサービスは削除した）。公式資料は、スタックトレースが 1 件の複数行の `textPayload`、または `jsonPayload` の `stack_trace`・`exception`・`message` にあれば拾うとしている。今の API は Spring Boot の既定の平文のログを stdout に出しているので、設定だけでは拾われない（仮: URL を配った後に、`prod` のログを `stack_trace`（できれば `severity` も）を持つ 1 行の JSON にする。機能マップに 041 api-structured-log として追加した。それまでは Cloud Logging で `swv-api` のログを読んでエラーに気づく。理由: フレンドへの公開の規模ならログを読めば足り、起動の失敗や DB に届かない障害はデプロイと Worker 経由の確認で分かるので、C8 を遅らせない。Spring Boot の組み込みの構造化ログ（`logging.structured.format.console` の `logstash` 形式）で載るか、`severity` のために独自の形式が要るかは、起票した後の区間 A で確かめる）
- 決定: `prod` プロファイルだけ、API のコンソールのログを、Spring Boot 4.1.2 の組み込みの構造化ログ（`logging.structured.format.console: logstash`）の 1 行の JSON にする。細部は次のとおりにする。
  - 例外のスタックトレースは、logstash 形式が出す `stack_trace` に 1 件のログとして入れる（Error Reporting は `jsonPayload` の `stack_trace` を最初に見る）。`message` もそのまま出す。
  - Cloud Run の組み込みのエージェントが `LogEntry.severity` に移す `severity` を、`StructuredLoggingJsonMembersCustomizer` の小さなクラスで足す。値は Logback のレベルから LogSeverity の列挙の値へ読み替える（ERROR→`ERROR`、WARN→`WARNING`、INFO→`INFO`、DEBUG と TRACE→`DEBUG`）。logstash 形式の `level`・`level_value` は残す。
  - `@timestamp` を `time` に改名する（`logging.structured.json.rename`）。Cloud Run は `time` を `LogEntry.timestamp` に移すので、記録の時刻がログを出した時刻になる。
  - `local` と `training` は今の平文のログのままにする（手元で読みやすいため）。
  - 本番へのデプロイと、Error Reporting に例外が載ることの本番での確認は、機能に含めず運用作業として行う。
  - 外した案と理由:
    - `logging.structured.json.rename` で `level` を `severity` に改名するだけにする: Logback の `WARN`・`TRACE` は LogSeverity の列挙に無い。Cloud Run の組み込みのエージェントがこれを読み替えるかは公式資料に書かれておらず、`WARN` が `DEFAULT` になる恐れがある。
    - `ecs`・`gelf` 形式: `severity` の問題は logstash と同じで、logstash より利点が無い。
    - `logback-spring.xml` と logstash-logback-encoder・Spring Cloud GCP のログ: 依存が増える。組み込みの形式で足りる。
- 理由: 公式資料（Error Reporting「Formatting errors in Cloud Logging」の「Log a stack trace」）は、`jsonPayload` に `stack_trace`・`exception`・`message` のどれかがあればスタックトレースを拾うとしている。Cloud Logging「Structured logging」は、Cloud Run の組み込みのエージェントが 1 行の JSON の `severity`・`message`・`time` を LogEntry の対応する欄へ移すとしている。LogEntry の LogSeverity の列挙は `DEFAULT`・`DEBUG`・`INFO`・`NOTICE`・`WARNING`・`ERROR`・`CRITICAL`・`ALERT`・`EMERGENCY` で、ほかの表記は標準の値へ読み替えて書くよう求めている。組み込みの logstash 形式は `stack_trace` と `message` を既に持つので、足りないのは `severity` の値の読み替えだけで、依存を増やさずに済む。

## 区間 C での spec の変更（2026-11-17）
- 変更: spec.md の「スコープ外」に、Spring Boot の FailureAnalyzer が説明に置き換える起動の失敗の `stack_trace` を足した。AC-7 の文面は変えない。
- 経緯: 区間 C で、ビルド済みの API の jar を `prod` と `logging.structured.format.console=logstash` で起動して確かめた。DB に届かない失敗（Flyway の接続の失敗）と `ProdEnvironmentValidator` の失敗は、`SpringApplication` が `Application run failed` を ERROR と例外つきで出すので、`stack_trace` を持つ 1 行の JSON になった。一方、`server.servlet.session.timeout=abc`（値の束縛の失敗）では、`LoggingFailureAnalysisReporter` が説明文だけを ERROR で出し、原因の例外は DEBUG でしか出さないので、`stack_trace` を持たなかった。Spring Boot 4.1.2 の `SpringApplication.reportFailure` は、FailureAnalyzer が失敗を扱ったときに `Application run failed` を出さない。
- 理由: FailureAnalyzer が扱う失敗は設定の誤りで、デプロイのときにリビジョンが起動せず分かる。説明文には直し方が書かれ、スタックトレースより読みやすい。埋めるには独自の `FailureAnalysisReporter` を `spring.factories` で登録する必要があり、説明のログと 2 件になるうえ、`local`・`training` の出力も変わる。
- 外した案: 独自の `FailureAnalysisReporter` で原因の例外を ERROR と `stack_trace` で出す（上の理由）。
