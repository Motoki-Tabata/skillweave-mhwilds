## スタック
- Spring Boot 4.1.2・Java 25（`design/tech-stack.md` のとおり。版は変えない）
- イメージの作成: Spring Boot の Gradle プラグインの `bootBuildImage`（Paketo の buildpack。訓練の実行は `paketo-buildpacks/spring-boot` が行う）
- 手元の比較の DB: `postgres:18.6-trixie`（`docker/compose.yaml` と同じ版）
- 依存の追加: なし

## データモデル
なし

## 決定事項
- D1: `apps/api/build.gradle.kts` の `tasks.named<BootBuildImage>("bootBuildImage")` に `environment.putAll(mapOf("BP_JVM_AOTCACHE_ENABLED" to "true", "TRAINING_RUN_JAVA_TOOL_OPTIONS" to "-Dspring.profiles.active=training"))` を足す。`imageName` は今の `skillweave-mhwilds-api` のまま。訓練の個々の設定はここに書かず、コメントで `training` プロファイル（`application-training.yml`）と decisions.md Q154・Q155 を指す。切り替えのプロパティは設けない。メインが委譲の前に書く（T1）。
- D2: `apps/api/src/main/resources/application-training.yml` を新設し、次の値だけを置く。冒頭のコメントに「訓練の実行だけで有効にする。実行時には有効にしない（decisions.md Q154）」と書く。
  - `spring.flyway.enabled: false`
  - `spring.datasource.url: jdbc:postgresql://localhost:1/training`（ポート 1 は接続が即座に拒否されるので、Spring Session の 1 回の接続の試みがすぐ失敗して先へ進む。応答の無いホストにすると接続のタイムアウトまで待つので使わない）
  - `spring.jpa.database-platform: org.hibernate.dialect.PostgreSQLDialect`
  - `spring.jpa.properties.hibernate.boot.allow_jdbc_metadata_access: false`（解決後のプロパティ名がこの形になれば、YAML の入れ子の書き方は問わない）
  - `spring.security.oauth2.client.registration.discord.client-id: training`・`client-secret: training`（秘密情報に見えない固定の文字列。空だと Boot の登録の検証と DiscordCredentialsValidator が起動を止める）
  - キーは `.claude/rules/api-spring.md` のとおり、該当 jar の `META-INF/spring-configuration-metadata.json` で実在と非推奨を確かめる（`spring.jpa.properties.*` は Hibernate へそのまま渡る map なので対象外）。
- D3: AC-6 のテストは `apps/api/src/test/java/io/github/motokitabata/skillweave/config/TrainingProfileTest.java` に置く。`SkillweaveApplication.application().run("--spring.profiles.active=training", "--server.port=0")` で実際の起動の経路を通し（`ProdEnvironmentValidatorTest` と同じ起動のしかた）、返ったコンテキストが active であることと、有効なプロファイルが `training` だけであることを確かめ、try-with-resources で閉じる。
  - `@SpringBootTest`・`@Import(TestcontainersConfiguration.class)`・`@FakeDiscordCredentials` は付けない。DB の接続先と Discord の値は `training` プロファイルの値そのものを使う（それが検証の対象のため）。
  - `-Dspring.context.exit=onRefresh` はテストで設定しない。JVM 全体のシステムプロパティ（`SpringProperties`）なので、同じ JVM の他のテストにも効いてしまう。refresh の後の lifecycle の開始まで通す起動は、訓練の実行（refresh まで）より広い範囲を確かめる。
  - Testcontainers も手元の DB も使わないので、`./gradlew build`（CI）で Docker なしに実行される。
- D4: AC-7 は api-agent が T3 の中で確かめる。`application-training.yml` から `spring.jpa.database-platform` を一時的に外して `./gradlew test --tests '*TrainingProfileTest'` が失敗すること（原因が方言の判定 `Unable to determine Dialect` であること）を確かめ、元に戻してから成功を確かめる。両方の実出力の要点を完了報告に貼る。外した状態はコミットしない。
- D5: AC-5 は差分で確かめる。`apps/api/src/main/**` の変更は `application-training.yml` の新設だけで、`application.yml`・`application-local.yml`・`application-prod.yml` と `apps/api/src/main/java/**` は変えない。`training` を `spring.profiles.group`・`spring.profiles.include`・`spring.profiles.default` に入れない。
- D6: `design/tech-stack.md`「API のデプロイ手順」の手順 4（AC-9）は、メインが委譲の前に書く（T2）。コマンドは次の形にする（文言はメインが書くときに決める）。
  - `bootBuildImage` の出力を `tee` で `apps/api/build/boot-build-image.log` にも残す。`build/` が無い新しい作業ツリーでも `tee` が失敗しないよう先に `mkdir -p` し、`set -o pipefail` で Gradle の失敗を隠さない。
  - ログに `Training run exited with an error` があれば push せずに止め、`AOTCache creation is complete` が無いときも止める（`grep` の終了コードで判定する）。
  - JRE・Syft の取得が 504 などで失敗したら、時間をおいて同じコマンドを再実行する。
  - T4 で手順 4 のコマンドを書いたとおりに実行し、手順そのものを確かめる。
- D7: AC-4・AC-8 の確認は、T1〜T3 の後にメインが手元で行う（T4）。リポジトリのファイルは書かない。
  1. 手順 4（D6）のとおりに `bootBuildImage` を実行してログを確かめ（AC-4）、直後に `docker tag skillweave-mhwilds-api:latest swv-api-measure:aot` で別名を付ける。
  2. 通常のイメージは、scratchpad に置いた init スクリプトで作る。`gradle.projectsEvaluated` の中で `BootBuildImage` の `environment` の `BP_JVM_AOTCACHE_ENABLED` を `false` にし、`TRAINING_RUN_JAVA_TOOL_OPTIONS` を外す（build.gradle.kts の設定より後に効かせるため。区間 A の試作で、init スクリプトの通常の設定は build.gradle.kts に後から上書きされた）。ログに AOT キャッシュの行が無いことを確かめ、直後に `docker tag skillweave-mhwilds-api:latest swv-api-measure:plain` を付ける。
  3. `postgres:18.6-trixie` のコンテナを立て、イメージごとに空のデータベースを作り直してから、`--cpus=1 --memory=1g`・`SPRING_PROFILES_ACTIVE=prod`・DB の接続情報・ダミーの Discord の値・`DISCORD_REDIRECT_URI`・`SWV_WEB_TOP_URL` で起動する。`docker run` から `/actuator/health` が 200 になるまでの時間（0.2 秒ごとに確かめる）と、ログの `Started … in` を記録する。2 つのイメージを交互に 3 回ずつ測る。
  4. 各起動で、Flyway のマイグレーションの適用（ログの適用件数）、`/actuator/health` の 200、Cookie の無い `GET /api/auth/me` の 401、`GET /api/oauth2/authorization/discord` の 302 を確かめ、2 つのイメージで同じであることを確かめる。
  5. イメージの大きさを `docker image inspect --format '{{.Size}}'`（展開後）と `docker save … | gzip -c | wc -c`（gzip）で測る。
  6. 測定の値と確認の結果を、T5 の材料として handoff の「区間メモ」に残す。測定に使ったコンテナ・イメージ・init スクリプトは終わったら消す。
- D8: `design/tech-stack.md`「API のデプロイ手順」の測定の表（AC-10）は、T4 の測定の後にメインが書く（T5）。AOT キャッシュの行を、リポジトリの既定になったこと・`training` プロファイルで訓練を最後まで通すこと・T4 の測定値（起動時間・イメージの大きさ）に合わせて直し、測定日を書く。イメージの gzip の大きさから、Artifact Registry の無料枠（0.5 GB）に収まる版の数の目安が今の「2 版ほど」から変わるときは、イメージの行の目安も直す。Cloud Run での比較の行は変えない（スコープ外）。

## 常時許可外の変更
- `apps/api/build.gradle.kts`（bootBuildImage の環境に BP_JVM_AOTCACHE_ENABLED と TRAINING_RUN_JAVA_TOOL_OPTIONS を足す。担当: メイン。理由: AC-1・AC-2。委譲の前に書く。D1）
- `design/tech-stack.md`（API のデプロイ手順の手順 4 の確認と測定の表を直す。担当: メイン。理由: AC-9・AC-10。手順 4 は委譲の前、測定の表は T4 の後に書く。D6・D8）
