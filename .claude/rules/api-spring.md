---
paths:
  - apps/api/**
---

# API / Spring Boot 4.1 — 既知の落とし穴

Java パッケージは `io.github.motokitabata.skillweave`。依存・座標まわりの選定（Testcontainers の artifact 座標、`flyway-database-postgresql`、swagger-parser と `jaxb-api` の併用など）は `apps/api/build.gradle.kts` と `apps/api/gradle/libs.versions.toml` に反映済みで、理由は `design/tech-stack.md` の「API（apps/api）」節にある。

## `TestRestTemplate` は `@SpringBootTest(webEnvironment=RANDOM_PORT)` だけでは自動配線されない
Boot 3.x は暗黙で bean 登録されていたが、Boot 4 では
`@AutoConfigureTestRestTemplate`
（`org.springframework.boot.resttestclient.autoconfigure` パッケージ）を
明示しないと `NoSuchBeanDefinitionException` になる。

## Jackson 3（`tools.jackson.databind.ObjectMapper`）へのパッケージ移行
旧 `com.fasterxml.jackson.databind.ObjectMapper` ではなく
`tools.jackson.databind.ObjectMapper` を使う。`com.fasterxml.jackson.*` の
コピペ import は静かに旧世代の互換パッケージへ解決されることがあるため、
import 元パッケージを都度確認する。

## application*.yml のキーは spring-configuration-metadata.json で実在・非推奨を確認する
`application.yml`・`application-*.yml` のキーを追加・変更するときは、該当 jar の
`META-INF/spring-configuration-metadata.json`（`deprecation.level` を含む）で実在と非推奨を
確認する。`level: error` のキーは読まれず、起動も失敗しない（黙って無効化される）。

## 一括 UPDATE（`@Modifying`）の後に読み直すときは flush と clear を付ける
一括 UPDATE の後、同じトランザクションで読み直すときは
`@Modifying(flushAutomatically = true, clearAutomatically = true)` を付ける。
付けないと、0件更新の後の読み直しで永続化コンテキストの古いエンティティを見る。

## Spring Security の独自 RequestMatcher は `PathPatternRequestMatcher` を使う
Spring Security を導入する機能（認証の機能）から適用する。パスを照合するときは
`PathPatternRequestMatcher` を使い、`request.getRequestURI()`（未デコード）の文字列比較をしない。
Spring MVC はデコード後のパスで照合するため、パーセントエンコードで認可をすり抜けうる。
メソッドの指定は GET と HEAD をそろえる。認可の迂回テスト（エンコードしたパス・HEAD）を必ず置く。
同じパスをメソッド別に複数回書くときの書き方は「Sonar で繰り返し出たルールの避け方（api）」節を参照する。

## エンコード済みパスを送るテストは `URI` で渡す
`TestRestTemplate` に文字列で渡さず `URI` で渡す（文字列だと `%73` が `%2573` に
二重エンコードされる）。テストが狙った形でサーバーに届いているかを確かめる。

## Sonar で繰り返し出たルールの避け方（api）
このルール群の正はここだけ。

- **`java:S1192`（重複リテラル）を URI の定数化で直すと `java:S1075`（URI のハードコード）になる。**
  同じパスを HTTP メソッド別に複数回書くときは、定数ではなく、メソッドとパスを受けて
  `PathPatternRequestMatcher.withDefaults().matcher(method, path)` を返すヘルパーに集約する。
  `requestMatchers(HttpMethod.GET, path)` は HEAD にマッチしないので、HEAD を別行で明示する。
- **`java:S7467`**: 使わない例外パラメータは無名変数 `_` にする（Java 22 以降の書き方）。
- **`java:S5976`**: 入力だけが違う同形のテストは `@ParameterizedTest` にまとめる。

## 最終検証はキャッシュを無効化して実行する
`./gradlew` はタスク結果を `UP-TO-DATE` として再利用するため、直前の
コード変更が反映されないまま緑色の結果を得てしまうことがある。最終検証コマンドは
`--rerun-tasks` 等でキャッシュを無効化して実行し、`UP-TO-DATE` を green と誤認しない。

`--rerun-tasks` が無効化するのは Gradle のタスクキャッシュだけで、**テスト用コンテナに
残ったデータは消えない**。Testcontainers のコンテナは同一実行内で複数のテストクラスが
共有し、前回の実行で作られた行が残っていることもある。起動時の投入処理・初期データが絡む
変更をしたときは、**コンテナを落としてから**
（`docker compose -f docker/compose.yaml down` 相当で、テスト用コンテナも再作成される状態にしてから）
最終検証を1回実行する。まっさらな DB でしか出ない失敗は、そうしないと CI で初めて分かる。
