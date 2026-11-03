# 031 api-proxy の決定記録

## Q130（決定: 2026-11-03）
- 問い: ゲストの訪問でも API が起きる点をどう扱うか。`App.vue` の起動処理（`lib/auth/loginReturn.ts` の `restoreAfterLogin`）が毎回 `GET /api/auth/me` を呼ぶので、Cloud Run の起動と Workers の無料枠の消費が訪問ごとに起きる（Neon まで起きるかは未確認）。ゲストの訪問でも `/api/auth/me` が毎回呼ばれることを、本番の 503 で確かめた（2026-11-03）（仮: `SESSION` の Cookie が無ければ、Worker が Cloud Run へ転送せず未ログインの応答を返す。Cookie の扱いと応答の形を確かめて Q88 の手順で決める）
- 決定: 名前が `SESSION` で値が空でない Cookie が無い `GET /api/auth/me` は、Worker が Cloud Run へ転送せず 401 を返す。Workers の実行の枠は消費するが、Cloud Run は起こさない。応答の形は Q142 (b) のとおり。
- 理由: ゲストの訪問で Cloud Run の JVM を起こさずに済む。`XSRF-TOKEN` はログイン後の `GET /api/auth/me` の 200 の応答で発行され（`AuthFlowTest` の受入基準 8）、ログインの開始とコールバックは GET なので、ゲストの訪問で上流へ行かなくても CSRF は壊れない。ログインが失敗すると API はセッションを無効にするが、その後の未ログインの判定は、401 が Worker から返っても API から返っても同じになる。
- 受け入れる欠点: API が停止していても、Cookie の無いゲストには「取得できない」でなく「未ログイン」と表示される。その状態でログインを押すと、Q142 (c) の 502 の問題応答がそのまま見える。

## Q142（決定: 2026-11-03）
- 問い: 031 api-proxy の転送の仕様。(a) 上流の URL を設定で受け取る方法（環境変数かバインディング）と、未設定のときの挙動、(b) `SESSION` の Cookie が無い `GET /api/auth/me` に Worker が返す応答の形（API の問題応答 `application/problem+json` に合わせる案。Q130）と、Cookie の無い他の経路の扱い、(c) `redirect: 'manual'` で Discord の認可へのリダイレクトをそのまま返せるか、複数の `Set-Cookie` を結合せずに渡せるか（どちらも未検証）、(d) ホストと `X-Forwarded-*` の扱い（028 decisions.md Q85 は `forward-headers-strategy` に頼らない）、(e) `/api/login/oauth2/code/discord` のコールバックが同一オリジンで届くこと、(f) テストの方法（workerd か、fetch をモックした単体テストか。依存を足すなら `pnpm-workspace.yaml` の書き足しを確かめる）（仮: 031 の区間 A で決める。直接アクセスの制限（Worker だけが知るヘッダー）とデプロイは含めない）
- 決定:
  - (a) 上流のオリジンは `API_ORIGIN` として `wrangler secret put` で渡す。`wrangler.jsonc` は変えない。未設定または URL として不正なときは、`/api/*` のすべてに今と同じ 503 の問題応答を返す（下の (b) の 401 より先に判定する）。
  - (b) Cookie の無い `GET /api/auth/me` には、`ProblemDetailAuthenticationEntryPoint` と同じ本文 `{"type":"about:blank","title":"Unauthorized","status":401,"instance":"/api/auth/me"}` を、`Content-Type: application/problem+json`・`Cache-Control: no-store` で返す。パスは完全一致で判定し、他のパス・他のメソッドは Cookie が無くても転送する。
  - (c) 上流へは `redirect: 'manual'` を明示して送り、上流の応答をそのまま返す。上流へ届かず `fetch` が例外を投げたときは、502 の問題応答を返す。
  - (d) Host は Worker で指定しない（上流の URL のホストになる）。`Forwarded`・`X-Forwarded-*`・`X-Real-IP`・`CF-Connecting-IP`・`CF-Connecting-IPv6` は消して転送する。
  - (e) Web と Worker のコードに、コールバック専用の処理を足さない。パスとクエリを変えずに転送する。Discord の redirect URI（`DISCORD_REDIRECT_URI`）の設定は Q88 の運用作業で行う。
  - (f) 依存を足さず、vitest で `fetch` をモックした単体テストにする。
- 理由:
  - (a) リポジトリは公開で、Cloud Run への直接の到達の制限（Q88）もまだ無いので、URL を載せない。公式資料（Wrangler の deploy の節）に「Secrets are never deleted by a deployment」とある。未設定のときに 401 を先に返すと、API の接続前にログインボタンが出てしまう。
  - (b) Web は 401 だけを未ログインと判定する（`lib/api/auth.ts`）。認可の開始（`/api/oauth2/authorization/*`）と `/api/shared-builds/*` は Cookie なしで通す必要がある。
  - (d) API は接続元のヘッダーを使わない（Q85 と、認証の詳細を作らない `SecurityConfig`）。クライアントが偽装できる値を上流へ渡さず、利用者の IP を Google 側へ渡さない。Host を `skillweave.app` のまま渡すと Cloud Run に届かないと見込む（Cloud Run 側は未確認。本番の確認で分かる）。
  - (e) Spring Security 7.1.2 の `OAuth2AuthorizationCodeAuthenticationProvider` が照合するのは `state` だけで、コールバックの要求の Host との一致は見ない（`OAuth2LoginAuthenticationFilter` が要求の URL から作る `redirectUri` は照合に使われない）。トークン要求の `redirect_uri` は設定の絶対 URL（Q85）から作られる。
  - (f) ロジックは Cookie の判定とヘッダーの除去で、モックで検証できる。workerd を CI で起動するとプロセス起動の待ちと不安定さが増える。
- 実測（2026-11-03・手元の `wrangler dev`（wrangler 4.153.0・workerd）と Node の偽の上流。本番の Cloudflare と Cloud Run では未確認）:
  - 認可の開始: 302 の `Location` がそのまま返り、`Expires` のカンマを含む `Set-Cookie` 2 本が分かれて届いた。受信した Request の `redirect` は `manual` で、公式資料の記述と一致した。
  - コールバック: `/api/login/oauth2/code/discord?code=a%2Fb+c&state=d` がパスもクエリも変わらず上流へ届いた。
  - POST: 本文・`Cookie`・`X-XSRF-TOKEN` が届いた。Host は上流の URL のホストになった。
  - 接続元のヘッダー: `X-Forwarded-For`・`X-Forwarded-Host`・`X-Real-IP` はそのまま上流へ届き、`headers.delete` で消せた。手元では `CF-Connecting-IP` は Worker から上流へ届かなかった。
  - 上流へ届かないとき: `fetch` が `Error: Network connection lost.` を投げた。
  - `/api` は `/api/*` に当たらず Worker を通らない（SPA の `index.html` が返る。API に `/api` の経路は無い）。
- 公式資料に記載が無く未確認の点: 本番で Cloudflare が `X-Forwarded-For` を付け直すか、応答の最初のバイトまでの待ちの上限。Q88 の手順で、本番の次を確かめる（ログインの往復、`Set-Cookie` が分かれて届くこと、Cloud Run のログに利用者の IP が残るか）。残るかどうかは Q140 (b) の表記の照合に使う。
