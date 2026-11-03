# 031: api-proxy

## 目的 / ユーザーストーリー
利用者として、`skillweave.app` のまま Discord でログインし、構成の保存と共有 URL を使いたい。今は Web の Worker が `/api/*` に 503 を返すので、本番ではどちらも使えない。運営者として、ログインしていない訪問のたびに Cloud Run を起こしたくない。起動の待ちと無料枠の消費を減らすためである。

用語:
- 上流: Worker が転送する先の API（本番は Cloud Run）。オリジンは Worker の secret `API_ORIGIN` で受け取る（decisions.md Q142）。
- セッションの Cookie: 名前がちょうど `SESSION` で、値が空でない Cookie。
- 問題応答: `Content-Type: application/problem+json` の応答。

## 受入基準（EARS記法）
- AC-1: WHEN `/api/*` の要求を受けたとき THE system SHALL メソッド・パス・クエリ文字列・本文・`Cookie`・`X-XSRF-TOKEN` を変えずに、`API_ORIGIN` のオリジンへ転送しなければならない。ただし AC-4・AC-5 に当たる要求は転送してはならない。
- AC-2: WHEN 上流が応答したとき THE system SHALL ステータス・ヘッダー・本文を変えずに返さなければならない。複数の `Set-Cookie` は1つに結合してはならない。
- AC-3: WHEN 上流が 3xx を返したとき THE system SHALL リダイレクトを追わず、`Location` を変えずに返さなければならない（`redirect: 'manual'`）。
- AC-4: IF `API_ORIGIN` が未設定または URL として不正である THEN システムは `/api/*` のすべての要求に、転送せず、503 の問題応答（本文 `{"title":"Service Unavailable","status":503}`）を返さなければならない。この判定は AC-5 より先に行わなければならない。
- AC-5: WHEN セッションの Cookie が無い `GET /api/auth/me` を受けたとき THE system SHALL 転送せず、401 の問題応答（本文 `{"type":"about:blank","title":"Unauthorized","status":401,"instance":"/api/auth/me"}`、`Cache-Control: no-store`）を返さなければならない。
- AC-6: WHEN セッションの Cookie がある `GET /api/auth/me` を受けたとき THE system SHALL 転送しなければならない。`XSESSION` のように名前の一部だけが一致する Cookie と、値が空の `SESSION` は、セッションの Cookie として扱ってはならない。
- AC-7: WHEN セッションの Cookie が無い要求で、AC-5 に当たらないもの（認可の開始 `/api/oauth2/authorization/discord`、`/api/shared-builds/*`、`/api/auth/me` への GET 以外のメソッド、他の経路）を受けたとき THE system SHALL 転送しなければならない。
- AC-8: WHEN `/api/login/oauth2/code/discord` のコールバックを受けたとき THE system SHALL パスとクエリ文字列（`%2F` と `+` を含む）を変えずに転送しなければならない。
- AC-9: WHEN 転送するとき THE system SHALL `Forwarded`・`X-Forwarded-` で始まるヘッダー・`X-Real-IP`・`CF-Connecting-IP`・`CF-Connecting-IPv6` を消して送らなければならない。Host は指定せず、上流の URL のホストに任せなければならない（decisions.md Q142 (d)）。
- AC-10: IF 転送の `fetch` が例外を投げた THEN システムは 502 の問題応答（本文 `{"title":"Bad Gateway","status":502}`）を返さなければならない。
- AC-11: THE system SHALL Web の単体テスト（`fetch` をモックした vitest）で AC-1〜AC-10 を検証しなければならない。npm の依存を足してはならない。

## スコープ外
- デプロイ、`API_ORIGIN` の登録、Discord の redirect URI の設定、本番での確認（Q88。確認の項目は decisions.md Q142）
- Cloud Run への直接の到達の制限（Worker だけが知るヘッダー。Q88）
- `/api/auth/me` 以外の経路で、Worker が転送せずに応答すること
- Web の画面と文言の変更（API の停止中にゲストへ「未ログイン」と表示される点は受け入れる。decisions.md Q130）
- API の変更
- 転送の再試行・キャッシュ・要求の頻度の制限（Q107）・Worker のログの設定（Q140）
- `apps/web/worker` を Sonar の解析対象と coverage に足すこと（`tasks/lessons.md` に起票済み）

## 契約差分
- なし（`GET /api/auth/me` の 401 は既存の契約のまま。Worker の応答を `contracts/components/responses/Unauthorized.yaml` の形に合わせる）

## 影響範囲
触る領域: web
常時許可外の変更予定:
- `apps/web/tsconfig.vitest.json`（単体テストの spec から Worker のコードを読むため include に足す。足さないと TS6307 で失敗する）

## 依存する機能ID
- 028
