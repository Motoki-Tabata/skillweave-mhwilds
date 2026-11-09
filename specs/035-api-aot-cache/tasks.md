# 035: api-aot-cache タスク

- [ ] T1 [main]       `apps/api/build.gradle.kts` の `bootBuildImage` の環境に `BP_JVM_AOTCACHE_ENABLED=true` と `TRAINING_RUN_JAVA_TOOL_OPTIONS=-Dspring.profiles.active=training` を足す。委譲の前に書く（plan D1）  refs spec §受入基準 AC-1, AC-2
- [ ] T2 [main]       `design/tech-stack.md`「API のデプロイ手順」の手順 4 に、`bootBuildImage` の出力をファイルに残して `Training run exited with an error` があれば push せずに止める確認と、JRE・Syft の取得の 504 では時間をおいて再実行することを足す。委譲の前に書く（plan D6）  refs spec §受入基準 AC-9
- [ ] T3 [api-agent]  `apps/api/src/main/resources/application-training.yml` の新設と、`training` プロファイルで DB 無しでも起動が通る `TrainingProfileTest`。方言を外すとテストが失敗することを一度確かめて元に戻す。実行時の設定ファイルと `apps/api/src/main/java/**` は変えない（plan D2〜D5）  refs spec §受入基準 AC-3, AC-5, AC-6, AC-7
- [ ] T4 [main]       手順 4 のとおりに `bootBuildImage` を実行して訓練が最後まで通ったことをログで確かめ、init スクリプトで作った通常のイメージと、`prod`・PostgreSQL のコンテナ・1 CPU で起動時間・マイグレーション・health・`/api/auth/me` の 401・ログイン開始の 302・イメージの大きさを比べ、結果を handoff の区間メモに残す（plan D7）  refs spec §受入基準 AC-4, AC-8
- [ ] T5 [main]       T4 の結果で `design/tech-stack.md`「API のデプロイ手順」の測定の表の AOT キャッシュの行（と必要ならイメージの行の無料枠の目安）を直す（plan D8）  refs spec §受入基準 AC-10
