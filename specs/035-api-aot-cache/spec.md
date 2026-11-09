# 035: api-aot-cache

## 目的 / ユーザーストーリー
ログインする利用者として、Cloud Run の API が停止しているときでも、ログインの開始や最初の保存を短い待ち時間で済ませたい。2026-11-09 の Cloud Run での比較で、停止からの最初の要求は、通常のイメージが 19.0 秒、訓練が途中で失敗した AOT キャッシュのイメージが 14.2 秒だった（open-questions.md Q150・`design/tech-stack.md`「API のデプロイ手順」）。運営者として、本番の DB の接続と実行時の設定を変えずに、訓練を最後まで通した AOT キャッシュ付きのイメージを `./gradlew bootBuildImage` で作れるようにしたい。また、訓練が壊れたときは気づけるようにしたい。

用語:
- 訓練の実行: buildpack（`paketo-buildpacks/spring-boot`）がビルドの中でアプリを `-Dspring.context.exit=onRefresh` で起動し、読み込んだクラスを AOT キャッシュに記録する処理。ビルドの中に DB は無い。
- `training` プロファイル: 訓練の実行だけで有効にする Spring のプロファイル（decisions.md Q154）。
- 通常のイメージ: AOT キャッシュを含まないイメージ（比較のためだけに作る）。

## 受入基準（EARS記法）
- AC-1: THE system SHALL `./gradlew bootBuildImage` で、常に AOT キャッシュ付きのイメージを作らなければならない（`bootBuildImage` の環境に `BP_JVM_AOTCACHE_ENABLED=true`）。Gradle のプロパティや環境変数による切り替えを設けてはならない（decisions.md Q155）。
- AC-2: THE system SHALL `bootBuildImage` の環境で、訓練の実行に `TRAINING_RUN_JAVA_TOOL_OPTIONS=-Dspring.profiles.active=training` だけを渡さなければならない。訓練の個々の設定は `build.gradle.kts` に書かず、`training` プロファイルに置かなければならない（decisions.md Q154）。
- AC-3: THE system SHALL `apps/api/src/main/resources/application-training.yml` で、Flyway の停止、Discord の client-id と client-secret のダミー値、`spring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect`、`spring.jpa.properties.hibernate.boot.allow_jdbc_metadata_access=false`、接続できないダミーの `spring.datasource.url` を設定しなければならない（decisions.md Q154）。
- AC-4: WHEN `./gradlew bootBuildImage` を実行するとき THE system SHALL DB が無くても訓練の実行でアプリのコンテキストの refresh を最後まで通し、ビルドのログに `AOTCache creation is complete` を出して、`Training run exited with an error` を出してはならない（decisions.md Q157）。
- AC-5: THE system SHALL 実行時の設定を変えてはならない。`application.yml`・`application-local.yml`・`application-prod.yml` と `apps/api/src/main/java/**` を変えず、`training` プロファイルは `spring.profiles.active` で明示したときだけ有効にしなければならない。
- AC-6: WHEN `training` プロファイルを有効にし、DB に接続できない状態でアプリのコンテキストを起動するとき THE system SHALL refresh を最後まで通さなければならない。これを API のテスト（JUnit。Testcontainers の DB を使わない）で検証し、`./gradlew build` で CI が実行しなければならない（decisions.md Q154・Q156）。
- AC-7: IF `application-training.yml` から方言の指定を外した THEN AC-6 のテストは失敗しなければならない（区間 D で一度外して確かめ、元に戻す）。
- AC-8: WHEN 手元で AOT キャッシュ付きのイメージと通常のイメージを続けて作り、`prod` プロファイル・PostgreSQL のコンテナ・1 CPU で起動したとき THE system SHALL AOT キャッシュ付きのイメージで、マイグレーションの適用、`/actuator/health` の 200、Cookie の無い `GET /api/auth/me` の 401、ログイン開始の 302 が通常のイメージと同じになり、`/actuator/health` が 200 になるまでの時間が通常のイメージより短くならなければならない（decisions.md Q156）。通常のイメージは Gradle のコマンドラインか init スクリプトで作り、リポジトリに切り替えを足してはならない。
- AC-9: THE system SHALL `design/tech-stack.md`「API のデプロイ手順」の手順 4 に、`bootBuildImage` の出力をファイルにも残し、`Training run exited with an error` が含まれていたら push せずに止める確認と、JRE・Syft の取得が 504 などで失敗したときは時間をおいて再実行することを足さなければならない（decisions.md Q154・Q157）。
- AC-10: THE system SHALL `design/tech-stack.md`「API のデプロイ手順」の測定の表で、AOT キャッシュの行を、リポジトリの既定になったこと・`training` プロファイルで訓練を最後まで通すこと・AC-8 の手元の測定値（起動時間・イメージの大きさ）に合わせて直さなければならない。イメージの大きさが Artifact Registry の無料枠の目安（今は 2 版ほど）を変えるなら、その目安も直さなければならない。

## スコープ外
- 本番の `swv-api` へのデプロイと、Cloud Run での停止からの最初の要求の測定（公開作業の B5・C8。decisions.md Q156）
- Spring AOT（`BP_SPRING_AOT_ENABLED`）・CDS（`BP_JVM_CDS_ENABLED`）・ネイティブイメージ
- 訓練の失敗でビルドを止める仕組み（buildpack の設定・Gradle での出力の検査。decisions.md Q157）
- JRE・Syft の取得の再試行の仕組み・取得元の指定（decisions.md Q154）
- CI でイメージを作ること、e2e でイメージを使うこと
- Cloud Run の設定（メモリ・CPU・起動ブースト・インスタンス数）の変更
- Spring Session の期限切れの掃除（Q149）

## 契約差分
- なし（イメージの作り方の変更で、API の契約は変えない）

## 影響範囲
触る領域: api
常時許可外の変更予定:
- `apps/api/build.gradle.kts`（bootBuildImage の環境に BP_JVM_AOTCACHE_ENABLED と TRAINING_RUN_JAVA_TOOL_OPTIONS を足す。AC-1・AC-2）
- `design/tech-stack.md`（「API のデプロイ手順」の手順 4 の確認と測定の表を直す。AC-9・AC-10）

## 依存する機能ID
- なし
