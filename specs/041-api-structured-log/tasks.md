# 041: api-structured-log タスク

- [ ] T1 [main]       `design/tech-stack.md`「Sentry」の行の Q158 の参照を、041 の決定（`specs/041-api-structured-log/decisions.md` Q158）への参照に付け替え、同じ行の「今の平文のログでは」を「当時の平文のログでは」に直す。委譲の前に書く（plan D11）  refs spec §受入基準 AC-10
- [ ] T2 [api-agent]  `application-prod.yml` の構造化ログの設定（logstash 形式・`@timestamp`→`time`・`severity` の customizer・`stacktrace.printer: standard`）と `config/CloudLoggingSeverityCustomizer`。単体テスト `CloudLoggingSeverityCustomizerTest`、明示的な起動で確かめる `StructuredLogStartupTest`、要求と SLF4J の出力で確かめる `StructuredLogRequestTest`。`stacktrace.printer` と `customizer` の行を外すと対応するテストが失敗することを一度ずつ確かめて元に戻す。既存のテストは変えない（plan D1〜D10）  refs spec §受入基準 AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9

順序: T1 → T2。並列にしない（T1 は委譲の前に書く常時許可外の変更）。
