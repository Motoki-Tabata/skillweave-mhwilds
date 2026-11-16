# 041: api-structured-log

## 目的 / ユーザーストーリー
運営者として、本番の API で起きた例外に Error Reporting で気づきたい。今の API は Spring Boot の既定の平文のログを stdout に出しているので、Cloud Run がスタックトレースを 1 行ずつ別のログ（`textPayload`）に分け、severity も付かず、Error Reporting にエラーが載らない（2026-11-11 に本番と同じイメージで確かめた）。`prod` のログを、スタックトレースを `stack_trace` に持ち、`severity` を持つ 1 行の JSON にして、Error Reporting と Cloud Logging の重大度の絞り込みが効くようにする（decisions.md Q158）。

用語:
- 構造化ログ: Spring Boot 4.1.2 の組み込みの構造化ログの logstash 形式（`logging.structured.format.console: logstash`）で、1 件のログを 1 行の JSON にしたもの。
- 重大度の読み替え: Logback のレベルから Cloud Logging の LogSeverity の値への対応（ERROR→`ERROR`、WARN→`WARNING`、INFO→`INFO`、DEBUG と TRACE→`DEBUG`）。decisions.md Q158。

## 受入基準（EARS記法）
- AC-1: WHERE `prod` プロファイルで動くとき THE system SHALL アプリケーションのコンソールのログ（起動中のログを含む）を、1 件につき改行を含まない 1 行の JSON として標準出力に出さなければならない。
- AC-2: WHERE `prod` プロファイルで動くとき THE system SHALL 各ログの JSON に、書式化したログの本文を `message` として含めなければならない。
- AC-3: WHERE `prod` プロファイルで動くとき THE system SHALL 各ログの JSON に、重大度の読み替えで得た値を `severity` として含めなければならない。
- AC-4: WHERE `prod` プロファイルで動くとき THE system SHALL 各ログの JSON に、ログを出した時刻を ISO 8601（オフセット付き）の文字列で `time` として含め、`@timestamp` を含めてはならない。
- AC-5: WHEN `prod` プロファイルで例外を伴うログを出すとき THE system SHALL 例外の型・メッセージ・スタックのフレームと原因（`Caused by:`）の連なりを、Java の `Throwable.printStackTrace()` の書式で、そのログの JSON の `stack_trace` に 1 件のログとして含めなければならない。
- AC-6: WHEN `prod` プロファイルで要求の処理中に想定外の例外（`ApiExceptionHandler` と Spring MVC の既定の扱いが応答に変えない例外）が起きたとき THE system SHALL `severity` が `ERROR` で `stack_trace` にその例外を持つ 1 行の JSON のログを出さなければならない。
- AC-7: IF `prod` プロファイルで起動に失敗したとき（DB に届かないなど） THEN THE system SHALL 失敗の原因の例外を、`severity` が `ERROR` で `stack_trace` にその例外を持つ 1 行の JSON のログとして出さなければならない。
- AC-8: WHERE `local`・`training` プロファイルで動くとき THE system SHALL 今と同じ平文のログを出し、構造化ログにしてはならない。
- AC-9: THE system SHALL 構造化ログを、Spring Boot の組み込みの構造化ログと `StructuredLoggingJsonMembersCustomizer` の実装で作り、依存（`apps/api/build.gradle.kts`・`gradle/libs.versions.toml`）と `logback-spring.xml` を足してはならない。
- AC-10: THE system SHALL `design/tech-stack.md` の「Sentry」の行の、構造化したログの扱いの参照（`specs/open-questions.md` Q158）を、041 の決定（`specs/041-api-structured-log/decisions.md` Q158）への参照に付け替えなければならない。

## スコープ外
- 本番への API のデプロイと、Error Reporting に例外が載ることの本番での確認（運用作業。decisions.md Q158）
- ログと要求の相関（`logging.googleapis.com/trace`）・`httpRequest`・`sourceLocation`・`serviceContext` の付与
- ログを出す箇所とレベルの見直し（`ApiExceptionHandler` で 4xx をログに出すなど）
- ブラウザのエラーの収集と Sentry の導入（`design/tech-stack.md`「Sentry」の行）
- `local`・`training` プロファイルのログの形式の変更
- JVM がログの仕組みを用意する前に出す出力（JVM の起動の失敗など）
- Spring Boot の FailureAnalyzer が説明に置き換える起動の失敗（設定の値の束縛の失敗・ポートの衝突など）の `stack_trace`（`severity` が `ERROR` の説明のログは出る。decisions.md「区間 C での spec の変更」）

## 契約差分
- なし（エンドポイント・スキーマを変えない。テーブルも変えない）

## 影響範囲
触る領域: api
常時許可外の変更予定:
- `design/tech-stack.md`（「Sentry」の行の Q158 の参照を、041 の決定への参照に付け替える。AC-10）

## 依存する機能ID
- 028
