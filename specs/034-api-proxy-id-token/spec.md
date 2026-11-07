# 034: api-proxy-id-token

## 目的 / ユーザーストーリー
運営者として、Cloud Run の Invoker の確認を有効にしたまま、Web の Worker から API を呼べるようにしたい。`run.app` への直接の要求を Cloud Run の IAM で拒否し、課金させないためである（open-questions.md Q88）。今の Worker（031）は ID トークンを付けないので、Invoker の確認が有効な Cloud Run には転送が届かない。

用語:
- 鍵: Worker の secret `API_INVOKER_KEY` に置く、サービスアカウント `swv-web-invoker` の鍵の JSON（decisions.md Q151）。
- トークンエンドポイント: `https://oauth2.googleapis.com/token`。
- 問題応答・`API_ORIGIN`・上流: 031 の spec.md の用語のとおり。

## 受入基準（EARS記法）
- AC-1: WHEN 鍵が設定されていて `/api/*` の要求を転送するとき THE system SHALL 鍵で署名した JWT（`iss`・`sub` は鍵の `client_email`、`aud` はトークンエンドポイント、`target_audience` は `API_ORIGIN` のオリジン、`iat` は今、`exp` は 1 時間後）を、`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer` でトークンエンドポイントへ POST し、応答の `id_token` を `X-Serverless-Authorization: Bearer <id_token>` で付けて転送しなければならない（decisions.md Q151）。
- AC-2: THE system SHALL JWT の署名を Web Crypto の `RSASSA-PKCS1-v1_5`・`SHA-256` で行い、鍵の `private_key`（PKCS#8 の PEM）を `importKey('pkcs8', …)` で読まなければならない。npm の依存を足してはならない。
- AC-3: WHEN `/api/*` の要求を転送するとき THE system SHALL クライアントが送った `X-Serverless-Authorization` を、鍵の有無によらず消さなければならない。`Authorization` と、031 の AC-1 が変えずに送るヘッダーは、変えずに転送しなければならない。
- AC-4: WHEN 取った ID トークンの `exp` の 5 分前より前に、次の要求を転送するとき THE system SHALL トークンエンドポイントを呼ばず、同じ ID トークンを付けなければならない。`exp` の 5 分前を過ぎた後の最初の転送では、取り直さなければならない（decisions.md Q152）。
- AC-5: IF ID トークンが取れなかった THEN システムはその結果を持たず、次に転送する要求で取り直さなければならない。
- AC-6: WHEN 031 の AC-4（`API_ORIGIN` が未設定か不正）または 031 の AC-5（セッションの Cookie が無い `GET /api/auth/me`）に当たる要求を受けたとき THE system SHALL トークンエンドポイントを呼ばず、031 のとおりに応答しなければならない。
- AC-7: WHERE 鍵が未設定（空を含む）である THE system SHALL トークンエンドポイントを呼ばず、`X-Serverless-Authorization` を付けずに転送しなければならない（decisions.md Q153）。
- AC-8: IF 鍵が JSON として読めない、`client_email` か `private_key` が無い、または `importKey` か署名が失敗した THEN システムは転送せず、503 の問題応答（本文 `{"title":"Service Unavailable","status":503}`）を返さなければならない（decisions.md Q153）。
- AC-9: IF トークンエンドポイントへの `fetch` が例外を投げた、2xx でない応答を返した、または応答に `id_token` が無い THEN システムは転送せず、502 の問題応答（本文 `{"title":"Bad Gateway","status":502}`）を返さなければならない（decisions.md Q153）。
- AC-10: WHEN ID トークンを付けた転送に上流が 401 か 403 を返したとき THE system SHALL 031 の AC-2 のとおりそのまま返し、ID トークンの取り直しも転送の再試行もしてはならない。
- AC-11: THE system SHALL Web の単体テスト（`fetch` をモックし、テストの中で作った RSA の鍵を使う vitest）で AC-1〜AC-10 を検証し、031 の AC-1〜AC-10 のテストが通り続けなければならない。
- AC-12: THE system SHALL `design/tech-stack.md`「API のデプロイ手順」の手順 6 に、`swv-web-invoker` の鍵の発行・`wrangler secret put API_INVOKER_KEY` での登録・手元の鍵のファイルの削除・漏れたときの鍵の無効化の手順を足さなければならない。

## スコープ外
- 鍵の発行、secret の登録、デプロイ、本番での確認（C3・C5。decisions.md Q151 の区間 D の最初のタスクでの交換の試しは含める）
- 鍵を使わない方法（Workload Identity 連携。decisions.md Q151 で見送り）
- KV・Cache API などの新しいバインディング、同時の要求の交換を 1 回にまとめること（decisions.md Q152）
- ID トークンの署名の検証（Cloud Run が行う）
- `wrangler.jsonc` の変更、API の変更、Web の画面と文言の変更
- 転送の再試行・Worker のログの設定（Q140）

## 契約差分
- なし（Worker と Cloud Run の間の認証で、API の契約は変えない）

## 影響範囲
触る領域: web
常時許可外の変更予定:
- `design/tech-stack.md`（「API のデプロイ手順」の手順 6 に鍵の発行と登録の手順を足す。AC-12）

## 依存する機能ID
- 031
