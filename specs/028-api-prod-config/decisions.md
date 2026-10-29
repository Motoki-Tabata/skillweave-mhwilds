# 028 api-prod-config の決定記録

## Q84（決定: 2026-10-29）
- 問い: Web から API への経路をどうするか。(a) Cloudflare 側で `/api/**` を Cloud Run へ転送し、Web と API を同一オリジンにする（ローカルの Vite の proxy と同じ形）。(b) `temp/initial-design.md` §3.3 の `app.<domain>`／`api.<domain>` の同一サイトの別オリジンにする。(b) は、`apps/web/src/main/lib/http.ts` の相対パス `/api`・JS が `document.cookie` から `XSRF-TOKEN` を読む CSRF の方式（API のホストの Cookie は Web のホストから読めない）・`swv.auth.web-top-url: /`・CORS の未設定を変える必要がある。(a) は認可の開始とコールバックも `/api` 配下（`SecurityConfig`）なのでコードを変えずに済むが、転送の仕組み（Pages Functions か Workers か）と、転送を経ない Cloud Run への直接の到達をどう扱うかを決める必要がある。
- 決定: (a) 同一オリジンにする。028 は Web を変えず、API の設定だけを扱う。転送の仕組みと、Cloud Run への直接の到達の扱いは Q88（デプロイの手順）で決める。
- 理由: Web の HTTP の呼び方・CSRF の Cookie の読み方・CORS を変えずに、Cookie の同一サイト化も満たせる。Cloud Run の URL へ直接来た要求は、Discord の redirect URI が独自ドメインに固定されているため、ログインを完了できない（認可の状態を持つセッションの Cookie が別のホストに付く）。

## Q85（決定: 2026-10-29）
- 問い: 本番の API の設定をローカルとどう変えるか。セッション Cookie の `Secure` 属性（009 spec.md のスコープ外）、`management.endpoint.health.show-details: always`、springdoc（`/swagger-ui.html`・`/v3/api-docs`）の公開、Discord の本番の redirect URI、秘密情報（`DISCORD_CLIENT_ID`・`DISCORD_CLIENT_SECRET`・DB の接続情報）の渡し方がある。
- 決定: 本番用のプロファイル `prod` を足し、次のとおりにする。
  - セッションの Cookie（`SESSION`）と CSRF の Cookie（`XSRF-TOKEN`）の両方に、設定で明示して `Secure` を付ける。`X-Forwarded-*` を信頼する方式（`server.forward-headers-strategy`）には頼らない。
  - health の詳細（`show-details`）は `never` にする。probes は残す。
  - springdoc（`/v3/api-docs`・`/swagger-ui.html`）を無効にする。
  - Discord の redirect URI と Web のトップの URL（`swv.auth.web-top-url`）は、環境変数から絶対 URL で受け取り、未設定なら起動に失敗させる。
  - 秘密情報（`DISCORD_CLIENT_ID`・`DISCORD_CLIENT_SECRET`・DB の接続情報）は環境変数で渡す。Secret Manager から環境変数への結線は Q88 の運用作業で行う。
- 理由: Cloud Run は TLS を手前で終えるため、API から見た要求は http になり、`CookieCsrfTokenRepository` の既定（要求が https のときだけ `Secure`）では付かない。転送のヘッダーを信頼すると、経路（Cloudflare の転送と Cloud Run の直接の到達）ごとに、ヘッダーを誰が付けるかを確かめる必要が出る。Tomcat は相対の Location を要求のホストと scheme で絶対化するので、戻り先を相対のままにできない（`application-local.yml` と同じ理由）。Boot は未解決の `${VAR}` を文字列のまま残すため、未設定を起動時に検出する。

## Q86（決定: 2026-10-29）
- 問い: 公開の前に要る API のコードの変更（Q85 の本番の設定と、認可を始めただけで未ログインのセッションの行が作られ 30 日残る点（009 handoff.md の持ち越し））を、どの作業で行うか。Q71 の旧い仮は「公開の作業に含める」だったが、ロジックとテストの変更はメインの直接修正の基準（`.claude/skills/tsod-workflow/references/direct-edit.md`）の外で、区間外の運用作業ではワーカーとレビューを通らない。
- 決定: 機能 028 api-prod-config で行う。未ログインのまま認可を始めたセッションの有効期間を 10 分にし、ログインに成功したら 30 日（`swv.auth.session-timeout`）に戻す。ログイン済みのセッションで認可を始めたときは、有効期間を短くしない。Cookie の Max-Age は全体で共通（30 日）のまま変えない。
- 理由: 10 分は Discord の同意画面との往復に十分で、未ログインの行が残る期間を 30 日から大きく縮められる。Cookie の Max-Age を変えないのは、期限の切れた行を指す Cookie が残るだけで害が無く、Cookie の書き出しを要求ごとに変える仕組みを足さずに済むため。ログイン済みのセッションを短くすると、認可を途中でやめた利用者が 10 分でログアウトされてしまう。

## Q91（決定: 2026-10-29）
- 問い: 028 api-prod-config で、Spring Session JDBC の期限切れのセッションの掃除の間隔を変えるか。既定は毎分（`0 * * * * *`。`spring-session-jdbc` 4.1.1 の `JdbcIndexedSessionRepository` で確認）で、リポジトリは `cleanup-cron` を設定していない。API が起きている間は Neon が 5 分使われずに停止する条件を満たせず、最小の 0.25 CU で常時動くと月に約 180 CU 時間となり、Neon Free の 100 CU 時間を超えうる（試算。実測していない）。Cloud Run の最小インスタンス数（0 なら費用はほぼ 0 だが、JVM の起動と Neon の復帰の待ちが重なる。1 なら常駐の料金が出る）とも関わる。
- 決定: 掃除の間隔（`spring.session.jdbc.cleanup-cron`）を1日1回（UTC 3:00）にし、プロファイル共通の `application.yml` に置く。最小インスタンス数は Q88 の手順を決めるときに見積もって決める。
- 理由: 期限の切れたセッションは読み出しのときにも無効として扱われるので、掃除の間隔を延ばしても挙動は変わらない。ローカルと本番で間隔を分ける理由は無い。Neon が実際に止まれるかは、接続プールの keepalive や Cloud Run の CPU の割り当てにも左右されるため、公開の作業（Q87・Q88）で実測する。
