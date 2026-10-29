# 028: api-prod-config タスク

順序: T1 → T2。契約の変更は無い（spec §契約差分）。

- [ ] T1 [api-agent]      `application-prod.yml` を足し、`SESSION`・`XSRF-TOKEN` の `Secure`（D1・D2）、health の詳細を出さない（D3）、springdoc の無効化（D4）、redirect URI と戻り先を環境変数から受ける（D5）。`config/ProdEnvironmentValidator` と `SkillweaveApplication.application()` での登録（D6）。`swv.auth.authorization-session-timeout` と `AuthProperties` の拡張（D7）、`security/ShortLivedAuthorizationRequestRepository` と `SecurityConfig` への組み込み（D8）、`WebTopRedirectHandler` でのログイン成功時の 30 日への戻し（D9）、`spring.session.jdbc.cleanup-cron`（D10）。D11 の `SessionPolicyTest`・`ProdProfileTest`・`ProdEnvironmentValidatorTest` を書き、既存のテストを書き換えずに通す（plan D1〜D11）     refs spec §受入基準 AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12
- [ ] T2 [main]           実際の起動経路での確認: `./gradlew bootRun` を本番プロファイルとローカルの DB で起動し、health・`/v3/api-docs`・認可の開始の `SESSION` の `Secure` と `redirect_uri` を `curl` で確かめ、`DISCORD_REDIRECT_URI` を外した起動が環境変数名をログに出して止まることを確かめて、handoff の区間メモに記録する。ファイルは書かない。不一致は api-agent に再委譲する（plan D13）     refs spec §受入基準 AC-1, AC-4, AC-5, AC-6, AC-7
