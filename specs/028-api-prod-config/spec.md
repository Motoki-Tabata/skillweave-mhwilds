# 028: api-prod-config

## 目的 / ユーザーストーリー
運営者として、API・DB の公開（open-questions.md Q71）の前に、本番用の設定を入れておきたい。Cookie が https だけで送られ、内部の情報（health の詳細・API 定義書）が外に出ず、戻り先の URL を取り違えたまま起動しないようにするためである。あわせて、認可を始めただけで作られる未ログインのセッションの行が 30 日残る点（009 handoff.md の持ち越し）を直し、DB に不要な行と負荷を残さないようにする。画面の挙動は変えない。

用語:
- 本番プロファイル: Spring のプロファイル `prod`。既定のプロファイルは今までどおり `local`。
- 認可の開始: `GET /api/oauth2/authorization/discord`。Spring Security が認可の状態（state）をセッションに保存するため、未ログインでもセッションの行が作られる。
- セッションの有効期間: Spring Session JDBC の最大無操作時間（`spring_session.max_inactive_interval`）。

経路は同一オリジン（Web と API を Cloudflare の転送で同じオリジンにする。decisions.md Q84）を前提にする。

## 受入基準（EARS記法）
- AC-1: WHERE 本番プロファイルが有効なとき THE system SHALL セッションの Cookie（`SESSION`）に `Secure` 属性を付けなければならない。要求が http に見えるとき（TLS を手前で終えたとき）も付けなければならない（decisions.md Q85）。
- AC-2: WHERE 本番プロファイルが有効なとき THE system SHALL CSRF の Cookie（`XSRF-TOKEN`）に、要求の scheme にかかわらず `Secure` 属性を付けなければならない。HttpOnly を付けない点（JS が読む二重送信の方式）は変えてはならない。
- AC-3: WHERE 本番プロファイルが無効なとき（`local`・テスト）THE system SHALL `SESSION`・`XSRF-TOKEN` の Cookie の属性を 028 の前と変えてはならない（ローカルの http で、ログインと CSRF が今までどおり動く）。
- AC-4: WHERE 本番プロファイルが有効なとき THE system SHALL `/actuator/health` の応答に構成要素の詳細（DB など）を含めてはならない。`/actuator/health/liveness`・`/actuator/health/readiness` には今までどおり応答しなければならない。
- AC-5: WHERE 本番プロファイルが有効なとき THE system SHALL springdoc の `/v3/api-docs` と `/swagger-ui.html` を無効にし、API の定義を返してはならない。本番プロファイルが無効なときは、今までどおり返さなければならない（契約テストは本番プロファイルを使わない）。
- AC-6: WHERE 本番プロファイルが有効なとき THE system SHALL Discord の redirect URI を環境変数 `DISCORD_REDIRECT_URI` から、ログイン後の戻り先（`swv.auth.web-top-url`）を環境変数 `SWV_WEB_TOP_URL` から受け取らなければならない。
- AC-7: IF 本番プロファイルが有効で、`DISCORD_REDIRECT_URI` か `SWV_WEB_TOP_URL` が未設定か空のとき THEN システムは、起動に失敗し、どの環境変数が欠けているかをログに出さなければならない（Boot が未解決の `${...}` を文字列のまま値にして起動してしまうのを防ぐ）。
- AC-8: WHEN 未ログインの要求が認可を始めたとき THE system SHALL そのセッションの有効期間を 10 分にしなければならない（decisions.md Q86）。
- AC-9: WHEN 認可を始めたセッションでログインに成功したとき THE system SHALL ログイン後のセッションの有効期間を `swv.auth.session-timeout`（30 日）にしなければならない。
- AC-10: WHEN ログイン済みのセッションで認可を始めたとき THE system SHALL そのセッションの有効期間を短くしてはならない。
- AC-11: THE system SHALL 期限の切れたセッションの掃除（`spring.session.jdbc.cleanup-cron`）を、プロファイルにかかわらず1日1回（UTC 3:00）にしなければならない（decisions.md Q91）。
- AC-12: THE system SHALL 009 discord-login の受入基準の挙動（ログイン・ログアウト・セッションの延長・CSRF・401 の応答）を、本番プロファイルの有無にかかわらず 028 の前と変えてはならない（既存の `AuthFlowTest` などが通ること）。

## スコープ外
- Web の変更（同一オリジンを前提にするため。decisions.md Q84）。CORS の設定
- 公開の作業そのもの: 独自ドメイン（Q83）、Cloudflare の転送の設定と Cloud Run への直接の到達の扱い（Q84・Q88）、マネージド DB（Q87）、コンテナイメージ・デプロイの手順と自動化（Q88）、Secret Manager から環境変数への結線（Q85・Q88）
- `server.forward-headers-strategy` による転送ヘッダーの信頼（decisions.md Q85）
- 未ログインのセッションの Cookie の Max-Age を短くすること（Cookie の Max-Age は全体で共通の 30 日のまま。decisions.md Q86）
- 認可の状態をセッション以外（Cookie など）に保存して、未ログインのセッションの行を作らないようにすること
- 接続プールの keepalive・Cloud Run の最小インスタンス数など、Neon の停止に関わる調整と実測（decisions.md Q91・Q87・Q88）
- 009 handoff.md のその他の持ち越し（`SessionCookieRefreshFilter` の `flushBuffer` など）

## 契約差分
- なし（エンドポイント・スキーマを変えない。springdoc の無効化は本番プロファイルの設定で、契約の内容は変えない）

## 影響範囲
触る領域: api
常時許可外の変更予定: なし

## 依存する機能ID
- 009
