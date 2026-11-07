# 034 api-proxy-id-token の決定記録

## Q151（決定: 2026-11-07）
- 問い: 034 で Worker が ID トークンを取る方法と、鍵の置き場。`swv-web-invoker` のサービスアカウントの鍵（JSON）を Worker の secret に置き、Worker が JWT を RS256 で署名して Google のトークンエンドポイントで ID トークン（`target_audience` は Cloud Run の URL）に交換する案が素直だが、署名は Web Crypto で行い npm の依存を足さない前提か、audience を `API_ORIGIN` から作るか別の secret にするか、鍵を使わない方法（Workload Identity 連携で Cloudflare 側の OIDC を使えるか）があるかは未確認（2026-11-07 に B4 の起票で判明）（仮: 鍵の JSON を 1 つの secret に置き、Web Crypto で署名し、audience は `API_ORIGIN` を使う。鍵を使わない方法は 034 の区間 A で公式資料を確かめ、使えなければ見送る。鍵の発行と secret の登録は運営者が C3・C5 で行い、手順は `design/tech-stack.md`「API のデプロイ手順」の手順 6 に足す）
- 決定:
  - 鍵を使わない方法（Workload Identity 連携）は見送る。`swv-web-invoker` の鍵の JSON をそのまま 1 つの secret `API_INVOKER_KEY` に置く（`wrangler secret put`。`wrangler.jsonc` は変えない）。Worker は鍵の `client_email` と `private_key` を使う。
  - Worker は、`iss` と `sub` を `client_email`、`aud` を `https://oauth2.googleapis.com/token`、`target_audience` を `API_ORIGIN` のオリジン、`iat` を今、`exp` を 1 時間後にした JWT を、Web Crypto（`importKey('pkcs8', …)`・`RSASSA-PKCS1-v1_5`・`SHA-256`）で署名する。`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer` でトークンエンドポイントへ POST し、応答の `id_token` を `X-Serverless-Authorization: Bearer <id_token>` で付ける。トークンエンドポイントの URL は固定にし、鍵の `token_uri` は使わない。npm の依存は足さない。
  - クライアントが送った `X-Serverless-Authorization` は、鍵の有無によらず消して転送する。`Authorization` は変えずに転送する。
  - 鍵の発行・secret の登録・鍵の破棄の手順は `design/tech-stack.md`「API のデプロイ手順」の手順 6 に足す。実行は運営者が C3・C5 で行う。
  - 公式資料に交換の要求と応答の形の記載が無いので、区間 D の最初のタスクで、運営者が発行した実際の鍵を使い、手元から交換して `id_token` が返ること・その `aud` が `API_ORIGIN` になることを確かめる。鍵は確認の後に破棄してよい。
- 理由:
  - Cloud Run の資料（service-to-service の「Use workload identity federation from outside Google Cloud」）は、Workload Identity 連携に、連携に対応した外部の ID プロバイダーのトークンを要する。Cloudflare の資料（Workers と Cloudflare One の目次）に、Worker が自分の ID として OIDC のトークンを発行する機能は見つからなかった。最も近い Access のサービストークンは静的な秘密で、OIDC ではない。
  - 同じ資料の「Use a downloaded service account key from outside Google Cloud」が、鍵で自分で署名した JWT に `target_audience` を付けて Google が署名した ID トークンに交換する方法を示している。IAM Credentials の `generateIdToken` は先にアクセストークンが要り、往復が 2 回になる。
  - audience は資料のとおりサービスの URL でなければならず、custom domain は使えない。`API_ORIGIN` は `run.app` の URL なので、別の secret を足さずに済む。
  - Workers の変数 1 個の上限は 5 KB で、鍵の JSON は収まる。Web Crypto は `RSASSA-PKCS1-v1_5` と `SHA-256` に対応している。
  - 資料によると、`X-Serverless-Authorization` と `Authorization` の両方があるときは前者だけを確かめ、コンテナへは署名を除いて渡す。API は `Authorization` を使わない（セッションの Cookie）。クライアントの値を消さないと、手元の開発で鍵が無いときにクライアントの値がそのまま上流へ届く。
- 受け入れる欠点: 鍵は長期の秘密で、漏れると Invoker の権限が使われる。権限はこのサービスの Invoker だけに絞り（手順 6）、漏れたら鍵を無効にして発行し直す。組織が 2024-05-03 以降に作られたプロジェクトでは、`iam.disableServiceAccountKeyCreation` が既定で有効で鍵を作れない。今のプロジェクトで作れるかは、区間 D の最初のタスクで確かめる。

## Q152（決定: 2026-11-07）
- 問い: 034 の ID トークンの使い回し。要求のたびに交換するとトークンエンドポイントへの往復が毎回増える。Worker のインスタンスのメモリに有効期限（1 時間）まで持つ案、Cache API や KV に置く案がある。Cookie の無い `GET /api/auth/me` は 031 の AC-5 のとおり転送しないので、トークンも取らない（仮: インスタンスのメモリに、期限の数分前まで持つ。KV など新しいバインディングは足さない）
- 決定: 取った ID トークンを Worker のグローバルスコープの変数に持ち、トークンの `exp` の 5 分前まで使い回す。`exp` は `id_token` のペイロードを読んで得る（署名は確かめない。確かめるのは Cloud Run）。期限の 5 分前を過ぎた後の最初の転送で取り直す。取れなかった結果は持たず、次の要求で取り直す。同時に来た要求の交換を 1 回にまとめる処理は入れない。Cookie の無い `GET /api/auth/me`（031 の AC-5）と、`API_ORIGIN` が無いとき（031 の AC-4）は、トークンを取らない。
- 理由: 資料によると isolate は要求をまたいで残るが、いつ捨てられるかは決まっていない。捨てられても取り直すだけで済む。KV や Cache API は新しいバインディングか、キャッシュのキーの設計が要る。最大インスタンス 1 で利用者も少ないので、同時の交換が重なっても往復が数回増えるだけである。5 分の余裕は、Worker と Google の時計のずれと、転送の途中で切れることを避けるため。

## Q153（決定: 2026-11-07）
- 問い: 034 でトークンが取れないときの応答。secret が未設定・鍵が不正・トークンエンドポイントの失敗（停止の手順で Invoker の権限を外したときは、トークンは取れて Cloud Run が 403 を返す）のそれぞれで、何を返すか。031 の AC-4（`API_ORIGIN` が無いと 503）・AC-10（転送の例外は 502）との揃え方と、手元の開発（`API_ORIGIN` が手元の API で鍵が無い）で付けずに転送してよいか（仮: 鍵が未設定なら付けずに転送し、手元の開発と今の挙動を保つ。鍵が不正・交換の失敗は 502 の問題応答。Cloud Run の 403 は 031 の AC-2 のとおりそのまま返す）
- 決定:
  - `API_INVOKER_KEY` が未設定（空を含む）: `X-Serverless-Authorization` を付けずに転送する（031 の挙動のまま）。
  - 鍵が不正（JSON として読めない・`client_email` か `private_key` が無い・`importKey` か署名が失敗する）: 転送せず、031 の AC-4 と同じ 503 の問題応答（本文 `{"title":"Service Unavailable","status":503}`）を返す。
  - トークンエンドポイントへの `fetch` が例外を投げる・2xx でない・応答に `id_token` が無い: 転送せず、031 の AC-10 と同じ 502 の問題応答（本文 `{"title":"Bad Gateway","status":502}`）を返す。
  - トークンを付けた転送に Cloud Run が 401・403 を返したとき: 031 の AC-2 のとおりそのまま返し、取り直しも再試行もしない。
- 理由: 鍵が不正なのは `API_ORIGIN` が不正なのと同じく運営者の設定の誤りで、待っても直らないので 503 に揃える（仮の 502 から変えた）。トークンエンドポイントの失敗は、上流へ届かないのと同じく転送先の側の失敗なので 502 に揃える。未設定で付けずに転送すると、本番で登録を忘れたときは Cloud Run の 403 がそのまま見えるので、気づける。
- 受け入れる欠点: 本番で `API_INVOKER_KEY` の登録を忘れても Worker は止まらず、ログイン・保存・共有 URL が 403 になる。C5 の確認で気づく前提にする。

## T1 の確認結果（実施: 2026-11-07）
- 内容: 運営者が GCP プロジェクトを作り、サービスアカウント `swv-web-invoker` と JSON 鍵を発行した（鍵はリポジトリの外。`iam.disableServiceAccountKeyCreation` は掛からなかった）。メインが plan D5・D6 と同じ JWT（`kid` なし）を Web Crypto で作り、`https://oauth2.googleapis.com/token` へ交換を試した。
- 要求: `POST`・`Content-Type: application/x-www-form-urlencoded`・本文は `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer` と `assertion`。JWT のヘッダーは `{"alg":"RS256","typ":"JWT"}`（`kid` なし）、クレームは `iss`・`sub`（`client_email`）・`aud`（トークンエンドポイント）・`target_audience`・`iat`・`exp`（`iat + 3600`）。
- 結果（`target_audience` が `https://swv-api-example.a.run.app` と `http://127.0.0.1:8787` の両方）:
  - 200・`application/json`。応答のキーは `id_token` だけ。
  - `id_token` は 3 つの部分で、ヘッダーのキーは `alg`・`kid`・`typ`、ペイロードのキーは `aud`・`azp`・`email`・`email_verified`・`exp`・`iat`・`iss`・`sub`。
  - `aud` は送った `target_audience` と一致。`exp` は数値で、交換の直後から約 3600 秒後。`iss` は `https://accounts.google.com`、`email` は `client_email` と一致。
  - JWT のヘッダーに `kid` を付けた場合も同じ結果（`kid` は不要）。
- 結論: spec（AC-1・AC-2）・plan D5・D6 の形のとおりで、区間 A へ戻す必要は無い。`http://127.0.0.1` の audience も交換できたので、T4 は AC-1 の項目を含めて行える。
- 鍵の値と `id_token` の本体は記録していない。鍵は T4 の後に運営者が手元と GCP 上で削除する（plan D10）。

## T4 の確認結果（実施: 2026-11-07。plan D10）
- 方法: `pnpm --filter @swv/web run build` の後、`apps/web` で `wrangler dev`（`.dev.vars` に `API_ORIGIN=http://127.0.0.1:9911` と `API_INVOKER_KEY`。確認の直後に削除済み）を起動し、受けたヘッダーを記録する Node の偽の上流へ転送させた。トークンエンドポイントは本物。鍵は T1 のもの。
- 結果:
  - 鍵あり・1 回目: 上流に `X-Serverless-Authorization: Bearer …` が届いた。ペイロードの `aud` は `http://127.0.0.1:9911`（`API_ORIGIN` のオリジン）、`exp` は約 3599 秒後。`Authorization` は届かない（付けていない要求）。
  - 続けた 2 回目: 同じトークンが届いた（使い回し）。
  - クライアントが `X-Serverless-Authorization: Bearer evil` と `Authorization: Bearer abc` を送った要求: 上流には取ったトークンだけが届き、`evil` は消えた。`Authorization: Bearer abc` はそのまま届いた。
  - 鍵を外して起動し直した場合: 上流にこのヘッダーは無い（クライアントの `evil` も消えた）。
  - `private_key` を壊した鍵: 503 `{"title":"Service Unavailable","status":503}`。上流には 0 件。
- 範囲: AC-1・AC-3・AC-4・AC-7・AC-8 を実際の経路で確かめた（T1 で `http://127.0.0.1` の audience が交換できたので、AC-1 の項目も含めた）。本物の Cloud Run での確認は C3・C5。
- 後始末: scratchpad のスクリプトと `.dev.vars` は削除済み・コミットしていない。手元の鍵のファイルと GCP 上の鍵は、運営者がこの後に削除する。
