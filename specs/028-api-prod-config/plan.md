# 028: api-prod-config 計画

## スタック
- API: Java 25・Spring Boot 4.1.2・Spring Security 7.1.2・Spring Session JDBC 4.1.1・springdoc-openapi 3.1.1（`design/tech-stack.md` の現行どおり）。依存は足さない。
- 設定キーは jar 同梱の `META-INF/spring-configuration-metadata.json` で実在を確かめた（`spring.session.jdbc.cleanup-cron`（既定 `0 * * * * *`）・`springdoc.api-docs.enabled`・`springdoc.swagger-ui.enabled`）。`server.servlet.session.cookie.secure` は Boot の `SessionAutoConfiguration` が Spring Session の `DefaultCookieSerializer` の `setUseSecureCookie` へ写す（`spring-boot-session` 4.1.2 のソースで確認）。

## データモデル
なし

## 決定事項

### 本番プロファイルの設定（`application-prod.yml`）
- D1: `apps/api/src/main/resources/application-prod.yml` を新しく置き、本番だけの値をここに集める。既定のプロファイル（`spring.profiles.default: local`）と `application.yml`・`application-local.yml` の既存の値は変えない（AC-3・AC-12）。本番は環境変数 `SPRING_PROFILES_ACTIVE=prod` で有効にする（結線は Q88 の運用作業）。
  - 書くキー: `server.servlet.session.cookie.secure: true`（D2）、`management.endpoint.health.show-details: never`（D3）、`springdoc.api-docs.enabled: false` と `springdoc.swagger-ui.enabled: false`（D4）、`spring.security.oauth2.client.registration.discord.redirect-uri: ${DISCORD_REDIRECT_URI:}` と `swv.auth.web-top-url: ${SWV_WEB_TOP_URL:}`（D5）。
  - DB の接続情報は yml に書かない。Boot の緩い束縛で、環境変数 `SPRING_DATASOURCE_URL`・`SPRING_DATASOURCE_USERNAME`・`SPRING_DATASOURCE_PASSWORD` がそのまま `spring.datasource.*` になる（decisions.md Q85 の「環境変数で渡す」）。`DISCORD_CLIENT_ID`・`DISCORD_CLIENT_SECRET` は `application.yml` の既存の受け方と検証（`DiscordCredentialsValidator`）のまま。
  - 理由: プロファイルの差を1ファイルで読めるようにし、ローカルとテストの挙動を変えないため。
- D2: Cookie の `Secure`（AC-1・AC-2・AC-3）。
  - `SESSION` は D1 の `server.servlet.session.cookie.secure: true` で付く（`DefaultCookieSerializer` は値が true なら要求の scheme を見ずに付ける）。
  - `XSRF-TOKEN` は、`SecurityConfig.csrfTokenRepository()` が同じキー `server.servlet.session.cookie.secure` を `@Value("${server.servlet.session.cookie.secure:false}")` で受け、true のときだけ `CookieCsrfTokenRepository.setCookieCustomizer(c -> c.secure(true))` を設定する。false のときは customizer を設定しない（028 の前と同じく、要求が https のときだけ付く）。`withHttpOnlyFalse()` は変えない。
  - `X-Forwarded-*` は信頼しない（`server.forward-headers-strategy` を設定しない。spec のスコープ外）。
  - 理由: 1つのキーで2つの Cookie をそろえ、片方だけ付け忘れる構成を作れないようにする。`CookieCsrfTokenRepository.saveToken` は `secure(request.isSecure())` の後に customizer を当てるので、customizer で上書きできる（`spring-security-web` 7.1.2 のソースで確認）。
- D3: health（AC-4）。`management.endpoint.health.show-details: never` だけを書き、`show-components` は書かない（未設定なら `show-details` に従い、構成要素も出ない）。`probes.enabled: true` は `application.yml` のまま残すので、`/actuator/health/liveness`・`/actuator/health/readiness` は応答する。公開するエンドポイント（`health,info`）と `SecurityConfig` の許可は変えない。
- D4: springdoc（AC-5）。`springdoc.api-docs.enabled: false`・`springdoc.swagger-ui.enabled: false` で、`/v3/api-docs`・`/swagger-ui.html`・`/swagger-ui/index.html` を無効にする。`SecurityConfig` の `permitAll` と `OpenApiConfig` は変えない（ハンドラが無いので 404 になり、ERROR ディスパッチの許可で 403 に化けない）。テストの期待値は 404 に固定する。404 にならなければ、許可の範囲を広げずに停止してメインに報告する。
  - 理由: 契約テスト（`OpenApiContractTest`）は既定のプロファイルで `/v3/api-docs` を読むので、本番だけで無効にすれば契約の検証は変わらない。

### 必須の環境変数の検証（AC-7）
- D5: redirect URI と戻り先は、D1 のとおり `${VAR:}`（空の既定値）で受ける（`.claude/rules/api-spring.md`「必須の環境変数は `${VAR:}` で受けて起動時の検証で止める」）。値は絶対 URL を想定するが、形式の検査はしない（spec は未設定・空だけを求める）。
- D6: 検証は `ApplicationContextInitializer` の新しいクラス `config/ProdEnvironmentValidator` で行い、Bean の生成より前に止める。
  - `prod` が有効（`environment.acceptsProfiles(Profiles.of("prod"))`）なときだけ、解決後のキー `spring.security.oauth2.client.registration.discord.redirect-uri` と `swv.auth.web-top-url` が空白でないかを見る。空白のものを、対応する環境変数名（`DISCORD_REDIRECT_URI`・`SWV_WEB_TOP_URL`）で全部挙げた `IllegalStateException` を投げる。例: 両方が空なら `Required environment variables for the prod profile are not set: DISCORD_REDIRECT_URI, SWV_WEB_TOP_URL`、片方なら `... are not set: SWV_WEB_TOP_URL`。
  - 登録は `SkillweaveApplication` で行う。`SpringApplication` を組み立てて `addInitializers(new ProdEnvironmentValidator())` する static メソッド（`application()`）を足し、`main()` はそれを使って `run(args)` する。`TimeZone.setDefault` は `main()` の先頭のまま。`META-INF/spring.factories` は使わない（api-agent の書込範囲の外で、登録が見えにくいため）。
  - 失敗は `SpringApplication` が `Application run failed` として例外ごとログに出すので、環境変数名がログに出る。
  - 理由: 空の redirect URI は Boot の登録の組み立て（`ClientRegistration` の検証）でも失敗するが、メッセージ（`redirectUri cannot be empty`）が環境変数名を示さない。`ClientRegistrationRepository` の生成より前に検査するには、Bean ではなくコンテキストの初期化の段で見る必要がある（既存の `DiscordCredentialsValidator` は登録の生成の後に動く）。

### 認可を始めたセッションの有効期間（AC-8・AC-9・AC-10）
- D7: `swv.auth.authorization-session-timeout: 10m` を `application.yml` の `swv.auth` に足し、`SecurityConfig.AuthProperties` に `Duration authorizationSessionTimeout`（`@DefaultValue("10m")`）と `Duration sessionTimeout`（既存のキー `swv.auth.session-timeout` を読む）を足す。
- D8: 新しいクラス `security/ShortLivedAuthorizationRequestRepository`（`AuthorizationRequestRepository<OAuth2AuthorizationRequest>`）が `HttpSessionOAuth2AuthorizationRequestRepository` に委ねる。`saveAuthorizationRequest` で、保存する要求が null でなく、現在の認証が `AuthenticationTrustResolverImpl.isAuthenticated` で未ログイン（null・匿名）のときだけ、委譲の後に `request.getSession().setMaxInactiveInterval(<10 分の秒数>)` を呼ぶ。ログイン済みなら何もしない（AC-10）。`SecurityConfig` の `oauth2Login` の `authorizationEndpoint` に `authorizationRequestRepository(...)` で渡す（戻りのフィルタも同じリポジトリを使う）。現在の認証は `SecurityContextHolder.getContextHolderStrategy()` から読む。
- D9: ログインの成功で 30 日に戻す（AC-9）。`WebTopRedirectHandler` のコンストラクタに `Duration sessionTimeout` を足し、`onAuthenticationSuccess` でリダイレクトの前に `request.getSession(false)` が null でなければ `setMaxInactiveInterval(<秒数>)` を呼ぶ。失敗のときの無効化は変えない。
  - 理由: セッション固定の防止（`changeSessionId`）は同じセッションの属性と有効期間を引き継ぐので、10 分のまま残る。成功のときに必ず戻せば、ログイン済みで認可を始めた場合（D8 で何もしない）も含めて 30 日になる。Cookie の Max-Age（`server.servlet.session.cookie.max-age`）と `SessionCookieRefreshFilter` は変えない（decisions.md Q86・spec のスコープ外）。

### 期限の切れたセッションの掃除（AC-11）
- D10: `application.yml` の `spring.session.jdbc` に `cleanup-cron: "0 0 3 * * *"` を足す（プロファイル共通。`application-prod.yml` には書かない）。cron は JVM の既定のタイムゾーンで解釈され、`main()` の `TimeZone.setDefault(UTC)` により UTC の 3:00 になる（憲法の UTC 統一）。

### テスト（api-agent）
- D11: テストは `apps/api/src/test/**` に置き、Cookie の属性を見るものは `AuthFlowTest` と同じく実際の HTTP（`RANDOM_PORT`・`support/DiscordHttp`）で行う（MockMvc では `server.servlet.session.cookie.*` が Spring Session の Cookie に当たらないため）。既存のテスト（`AuthFlowTest`・`AuthorizationBypassTest`・`ErrorDispatchAuthorizationTest`・`DiscordCredentialsValidatorTest`・`OpenApiContractTest`・`SmokeTest` など）は書き換えずに通す（AC-12）。
  - `security/SessionPolicyTest`（既定のプロファイル。`AuthFlowTest` と同じ注釈と `@MockitoBean` の組にして、テストのコンテキストを共有させる）: AC-3（認可の開始・ログイン後の `SESSION` とログイン後の me の `XSRF-TOKEN` に `Secure` が無い）、AC-8（未ログインで認可を始めたセッションの `spring_session.max_inactive_interval` が 600）、AC-9（その続きでログインに成功したセッションが 2592000）、AC-10（ログイン済みの `SESSION` で認可を始めても 2592000 のまま）、AC-11（`JdbcSessionProperties` の `cleanupCron` が `0 0 3 * * *`）。
  - `config/ProdProfileTest`（`@ActiveProfiles("prod")`・`@FakeDiscordCredentials`・`DISCORD_REDIRECT_URI` と `SWV_WEB_TOP_URL` に `https://swv.example/...` の偽の値・Testcontainers）: AC-1（http の要求でも、認可の開始とログイン後の `SESSION` に `Secure`）、AC-2（ログイン後の me の `XSRF-TOKEN` に `Secure` があり `HttpOnly` が無い）、AC-4（`/actuator/health` が 200 で本文に `components`・`details` が無い。liveness・readiness が 200）、AC-5（`/v3/api-docs`・`/swagger-ui.html`・`/swagger-ui/index.html` が 404）、AC-6（認可の開始の Location の `redirect_uri` が `DISCORD_REDIRECT_URI` の値、ログイン成功の Location が `SWV_WEB_TOP_URL` の値）、AC-11（本番でも `cleanupCron` が同じ）、AC-12（本番でのログイン → me 200 → CSRF 付きのログアウト 204 → me 401、未ログインの me 401）。
  - `config/ProdEnvironmentValidatorTest`: AC-7。実際の起動経路として `SkillweaveApplication.application().run(...)` を `--spring.profiles.active=prod`・`--spring.main.web-application-type=none` と空の値の引数で呼び、例外のメッセージと出力（`OutputCaptureExtension`）に欠けた環境変数名だけが出ることを確かめる（片方が空・両方が空は `@ParameterizedTest`）。未設定（引数を渡さない）の場合は、テストの JVM の環境変数に無いことを `Assumptions` で前提にする。失敗しない場合（prod で両方あり・prod 以外で値なし）は `ApplicationContextRunner` に `ConfigDataApplicationContextInitializer` と `ProdEnvironmentValidator` をこの順で渡して確かめる。
- D12: 本番の環境変数（`SPRING_PROFILES_ACTIVE`・`DISCORD_REDIRECT_URI`・`SWV_WEB_TOP_URL`・`SPRING_DATASOURCE_*`）を `README.md` などの手順書に書くのは、デプロイの手順（Q88）の作業で行い、028 では書かない（spec のスコープ外）。

### 実際の起動経路での確認（メイン）
- D13: api-agent の完了の後、メインが `apps/api` で `./gradlew bootRun` を本番プロファイルで起動し（DB はローカルの compose。`SPRING_PROFILES_ACTIVE=prod` と `SPRING_DATASOURCE_*` をローカルの値に、`DISCORD_*` を偽の値に）、`curl` で次を確かめて handoff の区間メモに記録する。`/actuator/health` に構成要素が無い、`/v3/api-docs` が 404、認可の開始の `Set-Cookie: SESSION` に `Secure` があり Location の `redirect_uri` が環境変数の値。続けて `DISCORD_REDIRECT_URI` を外して起動し、ログインの前に起動が止まり、ログに環境変数名が出ること。ファイルは書かない。不一致は api-agent に再委譲する。

## 常時許可外の変更
- なし
