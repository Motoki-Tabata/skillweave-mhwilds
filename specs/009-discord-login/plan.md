# 009: discord-login 計画

## スタック
- API: Java 25・Spring Boot 4.1.2（`apps/api/gradle/libs.versions.toml`）・Spring Framework 7・Hibernate ORM 7・springdoc-openapi 3.1.1。新たに Spring Security・OAuth2 Client・Spring Session JDBC のスターター（と Spring Security のテスト用スターター）を足す。版は Spring Boot BOM が解決し、`libs.versions.toml` には載せない（既存のスターターと同じ書き方）。スターターの座標と解決した版は T1 で `./gradlew dependencies` で実測し、`design/tech-stack.md` に記録する（D1）。
- Web: Vue 3.5.44・Pinia 4.1.0・reka-ui 2.11.0（shadcn-vue の生成物）・@lucide/vue 1.57.0・Vite 8.3.4・TypeScript 6.0.3・Vitest 5.0.5・@playwright/test 1.64.1（`design/tech-stack.md` の現行どおり。依存は足さない）。
- 追加する ui 部品: `dropdown-menu`（screen-design.md 0）。メインが `pnpm dlx shadcn-vue@2.8.2 add dropdown-menu` でコピーする（005 plan D15 と同じ CLI の版）。
- HTTP は既存の `apps/web/src/main/lib/http.ts`（`credentials: 'include'`・`XSRF-TOKEN` の Cookie を `X-XSRF-TOKEN` ヘッダーで送る）を使う。

## データモデル
- `users`（`id` uuid DEFAULT uuidv7()・`discord_id` text 一意・`CHECK (discord_id ~ '^[0-9]{1,20}$')`・`created_at`・`updated_at`）。`V1__create_users.sql`。
- Spring Session JDBC の公式スキーマ（`SPRING_SESSION`・`SPRING_SESSION_ATTRIBUTES`）。`V2__create_spring_session.sql`。命名規則の対象外。
- 属性は `design/attributes.yaml`（`defined_by: specs/009-discord-login`）。`users.id` はサーバー採番の例外（`design/data-model-standard.md`「主キー・採番方針」）。

## 決定事項

### 依存と構成（メイン）
- D1: T1 でメインが `apps/api/build.gradle.kts` に Spring Security・OAuth2 Client・Spring Session JDBC のスターターと Spring Security のテスト用スターターを足す。Boot 4 でスターターの名前が変わっているもの（OAuth2 Client など）があるため、座標は推測で書かず、`./gradlew dependencies` で解決を確かめる。続けて、jar 同梱の `org/springframework/session/jdbc/schema-postgresql.sql` と `V2__create_spring_session.sql` を突き合わせる（handoff の要確認事項）。違っていれば区間 D を止め、ゲート B-2 の成果物の修正としてユーザーに諮る。
  - 理由: 依存を足すまで api-agent はコンパイルできない。V2 はゲート B-2 で jar を読まずに書いた写しで、違いがあると Spring Session の SQL が実行時に失敗する。

### API（api-agent）
- D2: Discord の登録（`spring.security.oauth2.client.registration.discord` と `provider.discord`）。
  - provider: 認可 `https://discord.com/oauth2/authorize`・トークン `https://discord.com/api/oauth2/token`・ユーザー情報 `https://discord.com/api/users/@me`・`user-name-attribute: id`。registration: `authorization-grant-type: authorization_code`・`scope: identify` だけ（受入基準 1）。
  - クライアント ID とシークレットは `application.yml` で `${DISCORD_CLIENT_ID}`・`${DISCORD_CLIENT_SECRET}` と書き、既定値を持たない（未設定なら起動に失敗する）。テストは `apps/api/src/test/**` の中で偽の値を与え、main の `application.yml` を隠さない形にする（`src/test/resources/application.yml` を置くと main のものが読まれなくなるため、その名前では置かない）。
  - redirect-uri は `application-local.yml` で `${DISCORD_REDIRECT_URI:http://localhost:5173/api/login/oauth2/code/discord}` に固定する（handoff の要確認事項 1 の結論）。`apps/web/vite.config.ts` は変えない。
  - 理由: Vite の proxy は `changeOrigin: true` のため、`{baseUrl}` から組み立てると `localhost:8080` になり、Discord から API へ直接戻ってしまう。redirect-uri を Web のオリジンに固定すれば、戻りも proxy を通る。認可の応答の検証は `state` の照合で、トークンの要求には保存した redirect-uri を使うので、戻りの要求の Host（`localhost:8080`）と redirect-uri が違っても通る想定である。api-agent は、Host が redirect-uri と違う戻りで認証が成功することをテストで確かめる。成り立たなければ停止してメインに報告する（その場合は `vite.config.ts` の `changeOrigin` を変える案を常時許可外としてユーザーに諮る）。
- D3: 認可の開始と戻りのパスは、`/api/oauth2/authorization/discord` と `/api/login/oauth2/code/discord`（spec の契約差分）。
  - ログインの成功・失敗のどちらでも、設定キー `swv.auth.web-top-url`（既定 `/`）へリダイレクトする（受入基準 3。戻り先を要求のパラメータで受け取らない。保存した要求への戻り（`SavedRequest`）も使わない）。
  - 失敗のときは、Spring Security の既定のように例外をセッションへ書かず、認可の途中で作ったセッションを無効にしてからリダイレクトする（受入基準 4「セッションを確立せず」）。
  - Spring Security の既定のログイン画面（`/login`）とログアウト（`/logout`）は出さない。
  - 理由: 本番では Web と API のオリジンが分かれうる（decisions.md Q5）。キーにしておけば、公開のときにコードを変えずに済む。
- D4: ユーザーの特定と作成。
  - `OAuth2UserService` を自前で実装し、Discord のユーザー情報（既定の `DefaultOAuth2UserService` を委譲先として注入できる形にし、テストで差し替える）から `id`・`global_name`・`username` を読む。`id` が `^[0-9]{1,20}$` に合わなければ認証の失敗にする。
  - `users` の作成と再利用は、`INSERT … ON CONFLICT (discord_id) DO UPDATE … RETURNING id` の1文で行う（受入基準 2）。条件: ID は DB の `DEFAULT uuidv7()` で採番する（UUIDv7）、同じ Discord ユーザーの初回ログインが同時に来ても重複も失敗もしない、2回目以降は行の値を変えない。JPA のネイティブクエリか `JdbcClient` かは api-agent が選ぶ。`entity/README.md` の「サーバー側で採番しない」に `users` の例外（data-model-standard.md）を書き添える。
  - 認証の主体（セッションに入るもの）は、内部のユーザー ID と表示名（`global_name`、空か無ければ `username`）だけを持つ、直列化できる独自のクラスにする。Discord の他の属性（アバターなど）は持たない（decisions.md Q55）。メールアドレスと表示名は DB に書かない。
- D5: Discord のアクセストークンは、ログインの後に使わないので保持しない。`OAuth2AuthorizedClient` を保存しない（何もしない `OAuth2AuthorizedClientRepository` を登録する）。
  - 理由: Boot の既定はメモリ上のサービスに保存し、ログインのたびに増え続ける。セッションに保存すると、使わない Discord のトークンが DB に残る。
- D6: `GET /api/auth/me` と `POST /api/auth/logout` は、Spring Security のフィルタではなく `@RestController`（`controller/AuthController`）で実装する（handoff の要確認事項 2 の結論）。
  - `GET /api/auth/me`: 主体の表示名を `CurrentUser { displayName }` で返す。Discord にも DB にも問い合わせない。
  - `POST /api/auth/logout`: `SecurityContextLogoutHandler`（セッションの無効化。Spring Session JDBC が行を消し、`SESSION` の Cookie を失効させる）と `CsrfLogoutHandler` を呼び、204 を返す（受入基準 6）。
  - 未ログインはどちらも 401。401 は認証の入口（`AuthenticationEntryPoint`。`security/` に置く）が `application/problem+json` の ProblemDetail で返し、Discord へリダイレクトしない（受入基準 10）。
  - 両メソッドに `@ApiResponse` で 200・401（me）、204・401（logout）を宣言する。CSRF の拒否の 403 は宣言しない（contracts/README.md「禁止事項」）。
  - 理由: フィルタで処理すると springdoc に出ず、`contractTest` で契約と突合できない。
- D7: 認可の規則（`config/` の `SecurityFilterChain`）。
  - 認証不要: 認可の開始と戻り、`/v3/api-docs/**`・`/swagger-ui/**`・`/swagger-ui.html`、`/actuator/health/**`・`/actuator/info`。それ以外の `/api/**` はログインを要する。残りは拒否する。
  - パスの照合は `PathPatternRequestMatcher` で行い、GET と HEAD をそろえる。認可の迂回のテスト（エンコードしたパス・HEAD）を置く（`.claude/rules/api-spring.md`）。
  - 既存の `SmokeTest`（`/actuator/health`）と `contractTest`（`/v3/api-docs`）が、認証なしで通り続けること。
- D8: CSRF は Cookie の `XSRF-TOKEN`（JS から読める）とヘッダー `X-XSRF-TOKEN` の組にする（既存の `http.ts` に合わせる）。Spring Security 7 の SPA 向けの構成（`csrf.spa()`）があればそれを使う。`GET /api/auth/me` の 200 の応答で `XSRF-TOKEN` の Cookie が発行されることをテストで確かめる（Web はログインの後に最初に呼ぶのが me のため）。CSRF トークンの無いログアウトは 403 で拒否し、セッションを残す（受入基準 7）。
- D9: セッション。
  - Spring Session JDBC（`spring.session.jdbc.initialize-schema: never`。テーブルは Flyway の V2 が作る）。
  - 有効期間は設定キー `swv.auth.session-timeout`（既定 `30d`）の1か所で決め、Spring Session のタイムアウトと Cookie の `Max-Age` の両方をこのキーから設定する（decisions.md Q56）。参照する Spring のキーの実在は `spring-configuration-metadata.json` で確かめる（`.claude/rules/api-spring.md`）。
  - Cookie は `HttpOnly`・`SameSite=Lax`。`Secure` は付けない（spec のスコープ外。ローカルは http）。
  - Spring Session は、セッションの作成と ID の変更のときにしか Cookie を書かない。このままだと Cookie はログインから 30 日で切れ、使い続けていても未ログインになる。有効なセッションを持つ要求の応答で `SESSION` の Cookie を書き直し、Cookie の期限を最後の利用から数えるようにする（`security/` か `config/` のフィルタ。受入基準 9・Q56「最後の利用から 30 日」）。
- D10: API のテストは実際の Discord に接続しない（受入基準 14）。Testcontainers の PostgreSQL を使う。
  - ユーザーの作成と再利用: D4 の `OAuth2UserService` に偽の Discord のユーザー情報を渡し、初回で1行でき、2回目で同じ ID が返り行が増えないこと、`users` にメール・表示名の列が無く値が書かれないこと。
  - 戻りの処理: 偽のトークン・ユーザー情報の応答で戻りの要求を通し、`swv.auth.web-top-url` へのリダイレクトと、Host が redirect-uri と違っても成功すること（D2）。拒否（`error=access_denied`）でセッションが確立されず同じ URL へリダイレクトすること。手段（MockMvc と差し替えた `OAuth2AccessTokenResponseClient` など）は api-agent が選ぶ。
  - 401（me・logout とも。`Location` が無いこと）、CSRF の無いログアウトの 403 とセッションの残存、ログアウトでの `SPRING_SESSION` の行の削除、セッションが JDBC に保存され別の要求から読めること（受入基準 8 の代わり。再起動そのものは手動で確かめる）、Cookie の属性（`HttpOnly`・`SameSite=Lax`・`Max-Age`）と D9 の書き直し、D7 の迂回のテスト。

### 契約（contract-agent）
- D11: 契約のファイル（`contracts/README.md` の規約どおり）。
  - `paths/auth/auth-me.yaml`（GET・`operationId: getCurrentUser`・200 `CurrentUser`・401）と `paths/auth/auth-logout.yaml`（POST・`operationId: logout`・204・401）。どちらも `x-swv-status: draft` を付けて足す（api-agent の実装の後にメインが外す）。
  - `components/schemas/auth/CurrentUser.yaml`（`displayName`: 必須の文字列・`minLength: 1`）、`components/schemas/common/ProblemDetail.yaml`（RFC 9457 の `type`・`title`・`status`・`detail`・`instance`）、`components/responses/Unauthorized.yaml`（`application/problem+json`）。
  - セッションの Cookie（`SESSION`）を `securitySchemes` に足し、両オペレーションの認証として示す。logout の `description` に、CSRF トークン（`X-XSRF-TOKEN`）が必須で、無ければ 403 になることを散文で書く（`responses` には 403 を足さない）。
  - 認可の開始と戻りは契約に載せない（spec の契約差分）。

### Web（web-agent）
- D12: 認証状態の取得とストア。
  - `lib/api/auth.ts` に `fetchCurrentUser()` と `logout()` を置き、生成型（`pnpm contract:types` で再生成した `schema.ts` の `CurrentUser`）を使う。`fetchCurrentUser()` は、200 で `displayName` が空でない文字列ならログイン中、401 なら未ログイン、それ以外（届かない・401 以外・形の不正）は「取得できない」を返し、例外を投げない（受入基準 11）。
  - `stores/auth.ts`（Pinia）は、状態（判定中・未ログイン・ログイン中・取得できない）・表示名・ログアウト中を持ち、`initialize()` は1回だけ取得する（screen-design.md 0「画面の切り替えのたびには呼び直さない」）。ログアウトは 204 と 401 を成功、それ以外を失敗にする（screen-design.md 2.4）。API の関数は、既存の保存層と同じく差し替えられる形にし、テストで偽物を渡す。
  - 起動のときの呼び出しは `App.vue` で行う。
- D13: ログインからの戻り（screen-design.md 2.4）。
  - `lib/auth/loginReturn.ts` に、`sessionStorage` の `swv-login-return` の読み書き（使えなければ黙って何もしない）と、戻り先の検証（`/` で始まり、`//` で始まらず、`\` を含まず、ルーターで一致するルートがあるパスだけ。それ以外は `/`）を置く。
  - 起動のときに記録を読んで消し、me の結果に応じて `router.replace` とトースト（成功「Discord でログインしました」、401 は destructive の「Discord でログインできませんでした。もう一度「Discord でログイン」を押してください。」、取得できないときは出さない）を行う。
- D14: ヘッダーの部品。
  - `components/common/AuthControls.vue`（新規）を `AppHeader.vue` の `data-slot="header-auth"` に置き、screen-design.md 2.2・2.3・2.6 のとおりに出し分ける。`md` 以上と基準幅の切り替えは CSS（`md:` の表示の切り替え）で行う。
  - ログインのリンクは `<a href="/api/oauth2/authorization/discord">` で、押したときに今の `fullPath` を記録してから移る。M1 は `dropdown-menu`（T3 でメインが足す）。ログアウトの成功の後、フォーカスをログインのリンクへ移す。
  - 判定中と取得できないときは、場所の幅も取らない（screen-design.md 2.2）。
- D15: 既存の単体テストの追従。`src/test/support/mount.ts` の `mountApp` は、既定で「取得できない」を返す偽の認証 API を渡す（既存のテストのヘッダーの中身を変えないため）。`AppHeader.spec.ts`・`App.spec.ts` を追従させる。テスト用ルーターに足すルートは無い（ルートを足さない）。

### E2E（e2e-agent）
- D16: `e2e/discord-login.spec.ts`（Chromium・ビルドした web・API なし。`page.route` で `/api/**` の応答を差し替える。既定の幅＝`md` 以上）。
  - 未ログイン（me が 401）: 「Discord でログイン」のリンクが出て、`href` が `/api/oauth2/authorization/discord`。`/charms` で押すと、差し替えた認可の開始が `/` へ 302 で戻し、me が 200 を返すと `/charms` に戻り、トースト「Discord でログインしました」と表示名が出る（受入基準 3・5）。
  - ログイン中（me が 200）: 表示名と「ログアウト」が出る。`XSRF-TOKEN` の Cookie を置いた状態で「ログアウト」を押すと、`POST /api/auth/logout` に `X-XSRF-TOKEN` が付き、204 でログインのリンクに戻り、URL が変わらず、トースト「ログアウトしました」が出る（受入基準 6）。
  - 取得できない（me が 500）: 認証の部品もエラーの通知も出ず、検索・護石・武器の画面へ移って使える（受入基準 11・12）。
  - 既存の e2e は API が無いため me が届かず「取得できない」になり、ヘッダーに何も足されない。既存の spec は変えない。

### 文書と手動の確認（メイン）
- D17: 委譲の前にメインが書く文書（T2）。
  - `README.md`: Discord Developer Portal でアプリを作り、リダイレクト URI に `http://localhost:5173/api/login/oauth2/code/discord` を登録し、環境変数 `DISCORD_CLIENT_ID`・`DISCORD_CLIENT_SECRET`（任意で `DISCORD_REDIRECT_URI`）を設定して API と Web を起動する手順。値をリポジトリに書かないこと（受入基準 13）。
  - `design-system/skillweave/MASTER.md`: screen-design.md 4 の内容（画面骨格の認証の部品・アカウントのメニュー・用語）。
  - `design/tech-stack.md`: T1 の実測の版を記録し、「後の機能で導入するもの」の表から Spring Session JDBC と Spring Security・OAuth2 Client の行を外す。表の Spring Boot の行（4.1.1）が `libs.versions.toml`（4.1.2）と違うので、実測に合わせる。T1 の直後に書く。
- D18: 実際の Discord での確認（受入基準 15 の手動の確認）は、e2e の後にユーザーに依頼する（T8）。確かめる点: 認可画面のスコープが `identify` だけ、ログイン・押した画面への戻り・表示名、API の再起動の後もログインが保たれる、ログアウト、認可の拒否でのトースト。Discord がユーザー情報の要求を既定の User-Agent で拒むなど、テストで差し替えた部分の不一致が見つかれば、api-agent に再委譲する。

### 順序
- D19: T1 → T2 → T3 → T4 → T5 と T6 は並列 → T7 → T8。
  - T5（api。`apps/api` の検証）と T6（web。pnpm workspace の検証）は、書込フォルダも検証の共有物も重ならず、どちらも T4 の契約だけを前提にするので並列にしてよい（`.claude/skills/tsod-build/SKILL.md`「委譲」節）。契約の draft は T5 の後にメインが外す。
  - T7 は T6 の画面を前提にする。T8 は T5〜T7 の後。

## 常時許可外の変更
- `apps/api/build.gradle.kts`（Spring Security・OAuth2 Client・Spring Session JDBC のスターターと Spring Security のテスト用スターターを足す。担当: メイン。時期: T1。理由: D1）
- `design/tech-stack.md`（導入した依存の版の実測を記録し、「後の機能で導入するもの」の表と Spring Boot の行を更新する。担当: メイン。時期: T1 の直後（T2）。理由: D17）
- `README.md`（Discord アプリの登録・リダイレクト URI・環境変数の設定と起動の手順を書く。担当: メイン。時期: T2。理由: D17）
- `design-system/skillweave/MASTER.md`（画面骨格の認証の部品・アカウントのメニュー・用語を足す。担当: メイン。時期: T2。理由: D17・screen-design.md 4）
- `apps/web/src/main/components/ui/`（shadcn-vue の CLI で dropdown-menu をコピーし、アイコンの import を @lucide/vue に書き換える。担当: メイン。時期: T3。理由: スタック・screen-design.md 0・`.claude/rules/ui-design.md`）
