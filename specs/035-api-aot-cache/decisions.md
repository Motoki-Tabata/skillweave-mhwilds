# 035 api-aot-cache の決定記録

## Q154（決定: 2026-11-09）
- 問い: 035 api-aot-cache で、ビルドの中の訓練の実行（DB が無い）を最後まで通す方法。Flyway を止めて Discord の値をダミーにしても、JPA の初期化で `Unable to determine Dialect without JDBC metadata` になって止まる（2026-11-09）。訓練の設定は本番の DB 接続と実行時の設定に影響させない（仮: `TRAINING_RUN_JAVA_TOOL_OPTIONS` に `-Dspring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect` と `-Dspring.jpa.properties.hibernate.boot.allow_jdbc_metadata_access=false` を足して試す。それでも通らないときは、訓練用の Spring プロファイルで DB に触れる Bean を外す案と、途中で止まった部分のキャッシュのまま入れる案［Cloud Run で 19.0 秒が 14.2 秒］を比べる。ビルドが JRE と Syft を GitHub のリリースから取り、2026-11-09 は 504 が続いてイメージを作れなかったので、取得の失敗への備え（再試行の手順・取得元の指定）を扱うかも合わせて決める）
- 決定:
  - 訓練用の Spring プロファイル `training` を `apps/api/src/main/resources/application-training.yml` に置く。中身は、Flyway の停止（`spring.flyway.enabled=false`）、Discord の client-id と client-secret のダミー値、`spring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect`、`spring.jpa.properties.hibernate.boot.allow_jdbc_metadata_access=false`、接続できないダミーの `spring.datasource.url` にする。Bean は外さない。
  - `apps/api/build.gradle.kts` の `bootBuildImage` は、`BP_JVM_AOTCACHE_ENABLED=true` と `TRAINING_RUN_JAVA_TOOL_OPTIONS=-Dspring.profiles.active=training` だけを渡す。
  - `training` プロファイルで、DB に接続できなくてもアプリのコンテキストの refresh が最後まで通ることを確かめる API のテスト（JUnit）を足し、CI で訓練が壊れたことに気づけるようにする。
  - JRE と Syft の取得の失敗（504）への備え（再試行の仕組み・取得元の指定）は作らない。`design/tech-stack.md`「API のデプロイ手順」の手順 4 に、504 のときは時間をおいて再実行することを書く。
- 理由:
  - 2026-11-09 に、init スクリプトで `bootBuildImage` に同じ設定を渡して試した（リポジトリは未変更）。訓練の実行は refresh を最後まで通り（`Exposing 2 endpoints beneath base path '/actuator'`）、`AOTCache creation is complete: application.aot 140845056 bytes` でイメージが作れた。ビルドは 37 秒。方言の指定が無いと、同じ日の再現で JPA の初期化が失敗し、キャッシュは 88875008 バイトだった。
  - 訓練の設定は launch の環境（`env.launch`）に書き出されず、実行時には効かない。`training` プロファイルは本番（`SPRING_PROFILES_ACTIVE=prod`）では有効にならない。
  - 設定をプロファイル 1 か所に置くと、ビルドの設定とテストが同じ値を見るので、二重管理にならない。`build.gradle.kts` に直接書く案は差分が小さいが、訓練が壊れても CI で気づけない（Q157）。
  - 試作では JRE と Syft をビルドのキャッシュボリューム（`pack-cache-*.build`）から復元し、GitHub から取らなかった。取得が起きるのはキャッシュに無い版のときだけである。
- 受け入れる欠点:
  - Spring Session JDBC の `JdbcTemplate` がエラーコードの判定のために DB への接続を 1 回試み、訓練のログに `Error while extracting database name` の WARN とスタックトレースが出る。1 秒ほどで先へ進み、訓練は止まらない。
  - 訓練は `prod` でなく `training` プロファイルで動くので、`prod` だけで読み込まれるクラスはキャッシュに入らない。
  - `application-training.yml` がイメージの中に入る。

## Q155（決定: 2026-11-09）
- 問い: 035 api-aot-cache で、手元の `./gradlew bootBuildImage` と本番のイメージを同じ設定にするか。`bootBuildImage` を使うのは本番へのデプロイの手順（`design/tech-stack.md`「API のデプロイ手順」の手順 4〜5）だけで、CI・e2e は使っていない（仮: 分けずに `bootBuildImage` の既定で AOT キャッシュを作る。訓練の分だけビルドが長くなるが、切り替えを設けると本番で付け忘れる経路ができる）
- 決定: 仮のとおり。切り替え（Gradle のプロパティ・環境変数）は設けず、`bootBuildImage` は常に AOT キャッシュ付きのイメージを作る。
- 理由: 切り替えを設けると、本番のイメージで付け忘れる経路ができる。訓練の分の時間は、2026-11-09 の試作でビルド全体が 37 秒だったので、問題にならない。

## Q156（決定: 2026-11-09）
- 問い: 035 api-aot-cache の受入の確かめ方。CI は `bootBuildImage` を実行しないので、設定の変更は CI では確かめられない（仮: 区間 D で、手元でイメージを作って訓練の実行が最後まで通ったことをビルドのログで確かめ、手元のコンテナ（1 CPU）でアプリの起動時間・マイグレーション・`/api/auth/me` の 401・ログイン開始の 302 を通常のイメージと比べる。Cloud Run での停止からの最初の要求の測定は、マージの後に本番の `swv-api` へ出して公開作業の B5 で行い、`design/tech-stack.md` の測定表に足す）
- 決定: 仮のとおり。加えて、Q154 の `training` プロファイルのテストを CI で動かす。
  - CI: `training` プロファイルで DB 無しでも refresh が通るテスト（Q154）。
  - 区間 D（手元）: イメージを作り、ビルドのログで訓練の実行が最後まで通ったこと（Q157 の文言が無く、`AOTCache creation is complete` が出ること）を確かめる。`prod` プロファイルと PostgreSQL のコンテナで、1 CPU のコンテナの起動時間（`/actuator/health` が 200 になるまで）・マイグレーション・Cookie の無い `/api/auth/me` の 401・ログイン開始の 302 を、AOT キャッシュの無いイメージと続けて比べる。AOT キャッシュの無いイメージは、Gradle のコマンドラインか init スクリプトで作り、リポジトリに切り替えを足さない（Q155）。
  - Cloud Run の停止からの最初の要求の測定は、マージの後に公開作業の B5 で行う。
- 理由: CI は `bootBuildImage` を実行しない。イメージを作って比べる手順を CI に足すと、Docker と GitHub からの取得に依存して CI が遅く不安定になる。

## Q157（決定: 2026-11-09）
- 問い: 035 の区間 A の試作で判明した。訓練の実行が途中で失敗しても、buildpack は `Training run exited with an error, but produced a usable application.aot (88875008 bytes); keeping it and continuing.` と出してビルドを成功させる。訓練が後の変更（起動時に DB へ触れる Bean の追加など）で壊れても、イメージは作れて、停止からの起動が遅くなるだけで気づけない。どう気づくか。
- 決定:
  - CI では、Q154 の `training` プロファイルのテストで気づく。
  - `design/tech-stack.md`「API のデプロイ手順」の手順 4 で、`bootBuildImage` の出力をファイルにも残し、`Training run exited with an error` が含まれていたら push せずに止める確認を足す。
- 理由: buildpack に、訓練の失敗でビルドを止める設定があるかは確かめていない。Gradle の `bootBuildImage` の出力を Gradle の中で検査する方法は、ログの取り回しが要って重い。テストは起動時の DB の接続による失敗を早く見つけ、手順の確認はテストが拾えない失敗（buildpack・JVM の側）を拾う。
- 受け入れる欠点: 手順の確認は運営者の手作業で、忘れれば効かない。
