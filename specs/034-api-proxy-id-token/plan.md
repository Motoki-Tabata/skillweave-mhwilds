# 034: api-proxy-id-token 計画

## スタック
- Cloudflare Workers（`apps/web/worker/index.ts`・`compatibility_date` 2026-10-20）、wrangler、TypeScript 6.0.3、vitest。版は変えない。実際の版は `apps/web/package.json` の wrangler 4.156.0、`pnpm-workspace.yaml` の vitest 5.0.5 で、`design/tech-stack.md` の表（4.153.0・5.0.1）より新しい。表の取り残しは台帳の 2026-10-27 の項目の範囲で、034 では直さない。
- 署名と鍵の読み込みは Web Crypto（`crypto.subtle`）、base64 は `atob`・`btoa`、文字列の変換は `TextEncoder`・`TextDecoder` で行う。npm の依存は足さない（AC-2）。Workers の型パッケージも使わず、`Env` は手で書く（031 plan D9）。
- 区間 C で確かめたこと（2026-11-07）: vitest の既定の jsdom 環境で、テストの中で作った RSA の鍵の `exportKey('pkcs8')`・PEM からの `importKey('pkcs8', …)`・`sign`・`verify` が通る。`crypto.subtle`・`atob`・`btoa`・`TextDecoder` を使う下書きを `worker/index.ts` に足して `vue-tsc --build --noEmit` が通る（`tsconfig.node.json`・`tsconfig.vitest.json` の両方）。どちらの下書きも消した。

## データモデル
なし

## 決定事項
- D1: 区間 D の最初のタスク（T1）で、運営者が鍵を発行し、メインが手元から交換を試す（decisions.md Q151）。web-agent への委譲より前に行う。
  - 運営者が行う: GCP のプロジェクトを用意し（C3 で未作成なら作る。課金の有効化は要らない）、「API のデプロイ手順」の手順 1 の変数と `gc` を定義し、手順 6 の `gc iam service-accounts create swv-web-invoker` を実行する。`add-iam-policy-binding` は Cloud Run のサービスが要るので C3 で行う。続けて鍵を発行する。出力先はリポジトリの外のディレクトリ（例: `$HOME/.swv-keys`、`chmod 700`）をコンテナにマウントして渡す。
    - 例: `docker run --rm -v swv-gcloud:/root/.config/gcloud -v "$HOME/.swv-keys":/out gcr.io/google.com/cloudsdktool/google-cloud-cli:592.0.0-slim gcloud iam service-accounts keys create /out/swv-web-invoker.json --iam-account=swv-web-invoker@$PROJECT.iam.gserviceaccount.com`
  - 鍵を作れない（`iam.disableServiceAccountKeyCreation` による `FAILED_PRECONDITION`）とき: 区間 D を止め、web-agent へ委譲しない。ユーザーに、(a) 運営者がプロジェクトでこの制約の適用を外す（組織のポリシー管理者の権限が要る。組織に属さないプロジェクトにはこの制約は掛からない）、(b) Q151 を区間 A でやり直す、のどちらにするかを聞く。鍵の形が変わると AC-1・AC-2 が変わるため、作れないまま実装へ進まない。
  - メインが行う: scratchpad に依存なしの Node のスクリプトを置き、D5・D6 と同じ JWT を Web Crypto で作って交換する。鍵のファイルのパスを引数で受け、鍵の値と `id_token` の本体は出力しない。確かめるのは、200 で JSON の `id_token` が返ること、そのペイロードの `aud` が送った `target_audience` と一致すること、`exp` が数値で約 1 時間後であること。Cloud Run が未配備なら、`target_audience` は仮の `https://swv-api-example.a.run.app` にする（実在しなくてよい）。T4 の偽の上流のため、`http://127.0.0.1:8787` を `target_audience` にしたときも交換できるかを試す。
  - 結果は decisions.md に記録する（要求と応答の形・クレームの名前と値の形。秘密は書かない）。spec と違う形（ヘッダーに `kid` が要る、応答のキーが違う等）なら、委譲せずにユーザーへ報告し、区間 A へ戻すかを決める。
- D2: `design/tech-stack.md`「API のデプロイ手順」の手順 6（AC-12）は、T1 の後・web-agent への委譲の前に、メインが書く（T2）。T1 で実際に通したコマンドを書くためで、委譲より後の成果には依存しない。
  - 足す内容: 鍵の発行（D1 の例の形。出力先はリポジトリの外）、`pnpm --filter @swv/web exec wrangler secret put API_INVOKER_KEY < "$HOME/.swv-keys/swv-web-invoker.json"` での登録（標準入力から読む）、登録の後の手元のファイルの削除、漏れたときの無効化（`gc iam service-accounts keys list --iam-account=…` で鍵の ID を確かめ、`keys disable` で無効にし、新しい鍵を発行・登録してから古い鍵を `keys delete` する）。
  - 手順 6 の「鍵の作り方と Worker への登録は、Worker の機能（B4）で決めてここに足す」の文を、足した手順に置き換える。`wrangler secret put` が新しい版をすぐ出すかは、公式資料で確かめてから書く。手順 7 と「停止」は変えない。
- D3: 実装はすべて `apps/web/worker/index.ts` に書き、ファイルを分けない。`tsconfig.node.json` と `tsconfig.vitest.json` の include が `worker/index.ts` だけを挙げているので、ファイルを足すと composite の型検査が TS6307 で失敗し、共有構成ファイルの変更が要るため。`Env` に `API_INVOKER_KEY?: string` を足す。`wrangler.jsonc` は変えない。先頭のコメントに、鍵があれば ID トークンを付けることを足す。
- D4: 判定の順は「`API_ORIGIN` の検査（031 AC-4）→ Cookie の無い `GET /api/auth/me`（031 AC-5）→ 鍵の有無 → 使い回せるトークンの確認 → トークンの取得 → 転送」にする（AC-6・AC-7）。鍵は `env.API_INVOKER_KEY` が `undefined` か空文字なら「未設定」とし、トークンを取らずに転送する。
  - ヘッダー: `STRIPPED_HEADERS` に `x-serverless-authorization` を足し、鍵の有無によらず消す。トークンを取れたときだけ、`upstreamHeaders` の結果に `X-Serverless-Authorization: Bearer <id_token>` を `set` する。`Authorization` は触らない（AC-3）。
  - 鍵あり・クライアントが `X-Serverless-Authorization: Bearer evil` を送る → 上流には `Bearer <取ったトークン>` だけが届く
  - 鍵なし・同じ要求 → 上流にこのヘッダーは無い
  - `Authorization: Bearer abc` → 鍵の有無によらずそのまま届く
- D5: JWT の組み立て（AC-1・AC-2）。
  - ヘッダーは `{"alg":"RS256","typ":"JWT"}`。`kid` は付けない（T1 で通ることを確かめる）。
  - クレームは `iss`・`sub` に `client_email`、`aud` に `https://oauth2.googleapis.com/token`（定数。鍵の `token_uri` は読まない）、`target_audience` に `resolveOrigin` の結果、`iat` に `Math.floor(Date.now() / 1000)`、`exp` に `iat + 3600`。
  - `target_audience` の例: `API_ORIGIN` が `https://swv-api-abc.a.run.app` → `https://swv-api-abc.a.run.app`、`https://swv-api-abc.a.run.app/foo` → `https://swv-api-abc.a.run.app`（末尾のスラッシュもパスも付けない）。
  - base64url は、`TextEncoder` の UTF-8 を `btoa` で base64 にし、`+` を `-`、`/` を `_` に替え、末尾の `=` を除く。署名の入力は `<ヘッダー>.<クレーム>`、署名も同じ base64url にする。
  - PEM は、`-----BEGIN PRIVATE KEY-----`・`-----END PRIVATE KEY-----` と空白（改行を含む）を除いて `atob` し、`Uint8Array` にして `importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])` へ渡す。
- D6: 交換と失敗の分け方（AC-1・AC-8・AC-9）。
  - 交換は `fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) })` の形にする。
  - 503（鍵の誤り）: `JSON.parse` の例外、`client_email` か `private_key` が空でない文字列でない、`atob`・`importKey`・`sign` の例外。
  - 502（交換の失敗）: `fetch` の例外、`res.ok` が偽、応答の JSON の解釈の例外、`id_token` が空でない文字列でない。
  - 2 種類を取り違えないよう、`try`/`catch` の範囲を「鍵の解析〜署名」と「交換の `fetch`〜応答の解釈」に分ける。上流への `fetch` の `try`/`catch`（031 D7）は今のまま残す。問題応答の本文は AC-8・AC-9 の値にし、既存の `problem` を使う。
- D7: トークンの使い回し（AC-4・AC-5。decisions.md Q152）。
  - モジュールのスコープに `{ value, expiresAt }`（`expiresAt` は `exp` の秒）を 1 つ持つ。`Date.now() < expiresAt * 1000 - 300_000` のときだけ使い回し、そうでなければ取り直す。鍵や `API_ORIGIN` ごとに分けない（secret を変えると新しい版になり、isolate が替わるため）。同時の要求の交換はまとめない。
  - `exp` を `T + 3600` 秒としたとき: `T + 3299` 秒の転送は使い回す、`T + 3300` 秒（ちょうど 5 分前）と `T + 3301` 秒は取り直す。
  - 失敗したとき（503・502）は、持っている値を書き換えない。残っている古い値は閾値を過ぎているので使われず、次の要求で取り直す（AC-5）。
  - `exp` は `id_token` の 2 つ目の部分を base64url で読んで JSON として得る（署名は確かめない）。部分が 3 つでない・JSON として読めない・`exp` が有限の数でないときは、そのトークンで今回は転送し、持たない。502 にはしない（AC-9 の条件は `id_token` が無いときだけで、読めないトークンは Cloud Run の 401 で見える）。
- D8: テスト（AC-11）。
  - 置き場所は既存の `apps/web/src/test/worker/index.spec.ts`。031 のテストは変えない（鍵の無い `env` なので、AC-7 の確認にもなる）。034 は別の `describe` にする。
  - モジュールのスコープのトークンをテストごとに捨てるため、034 の `describe` は `beforeEach` で `vi.resetModules()` してから `await import('../../../worker/index')` で読み直す。テストのためだけの export（リセット関数など）は足さない。
  - 鍵は `beforeAll` で `generateKey`（`RSASSA-PKCS1-v1_5`・2048 ビット・`SHA-256`）で作り、`pkcs8` を 64 文字ごとに改行した PEM にして、`{ type: 'service_account', client_email: 'swv-web-invoker@example-project.iam.gserviceaccount.com', private_key: <PEM>, private_key_id: 'k1', token_uri: 'https://example.invalid/token' }` の JSON にする。`token_uri` は使われないことを確かめるための値。
  - `fetch` のモックは URL で分け、トークンエンドポイントには `exp` を入れた偽の `id_token`（`<ヘッダー>.<ペイロード>.sig`）を返す。
  - 時刻は `vi.useFakeTimers({ toFake: ['Date'] })` と `vi.setSystemTime` で動かす（`Date` だけを偽にし、Promise と Web Crypto を止めない）。
  - 確かめること:
    - AC-1・AC-2: 送った JWT のヘッダーとクレーム、`grant_type`、`Content-Type`、公開鍵での署名の検証、上流の `X-Serverless-Authorization`
    - AC-3: クライアントの `X-Serverless-Authorization` の除去（鍵あり・なし）と `Authorization` の保持
    - AC-4: D7 の境界の 3 点
    - AC-5: 失敗の後の次の要求で取り直すこと
    - AC-6: `API_ORIGIN` が無いときと Cookie の無い `GET /api/auth/me`。鍵ありで、`fetch` が呼ばれないこと
    - AC-7: 鍵が `undefined` と `''` のとき
    - AC-8: JSON でない、`client_email` が無い、`private_key` が無い、PEM でない文字列、EC（P-256）の `pkcs8` の PEM
    - AC-9: `fetch` の例外、500、200 で `{}`、200 で JSON でない本文
    - AC-10: 上流の 401・403 がそのまま返り、トークンエンドポイントと上流が 1 回ずつだけ呼ばれること
  - 環境は既定の jsdom のままでよい（スタック節の確認）。
- D9: 整形・lint・解析は 031 plan D10 のとおり。`worker/index.ts` は `pnpm format:check` の対象外なので、web-agent が `pnpm --filter @swv/web exec prettier --write worker/index.ts` で整形する。テストは `src/test/` にあるので対象に入る。Worker は Sonar と coverage の対象外のまま（台帳の 2026-11-03 の項目。034 では直さない）。
- D10: web-agent の後に、メインが実際の経路を確かめる（T4。031 plan D11 と同じ形）。
  - `pnpm --filter @swv/web run build` の後、`apps/web` で `wrangler dev` を起動する。`API_ORIGIN` は scratchpad の Node の偽の上流（受けたヘッダーを記録する）の `http://127.0.0.1:<port>`、`API_INVOKER_KEY` は T1 の鍵にする。鍵の渡し方は `wrangler dev --help` で確かめる。`.dev.vars` を使うなら（`.gitignore` 済み）確認の直後に消す。トークンエンドポイントは本物を使う。
  - 確かめること:
    - 1 回目の転送で上流に `X-Serverless-Authorization: Bearer …` が届き、そのペイロードの `aud` が `API_ORIGIN` のオリジンであること
    - 続けた 2 回目で同じトークンが届くこと
    - クライアントの `X-Serverless-Authorization` が置き換わること
    - 鍵を外して起動し直すとヘッダーが付かないこと
    - 壊した鍵で 503 になること
  - 結果を decisions.md に記録する。T1 で `http://127.0.0.1` の audience が交換できなかったときは、この確認を AC-1 の外の項目（2 回目の使い回し・置き換え・未設定・壊れた鍵）に絞り、そのことを記録する。
  - 本物の Cloud Run での確認は C3・C5 で行う。
  - T4 の後、運営者が手元の鍵のファイルを消し、GCP 上の鍵を削除する。本番の鍵は C3・C5 で手順 6 のとおり発行し直す。
- D11: 既存のテストと文書で追従するものは無い。`X-Serverless-Authorization`・`API_INVOKER_KEY`・`swv-web-invoker` を `apps/web`・`design`・`specs`（034 を除く）・`tasks` で検索し、当たったのは `design/tech-stack.md`（手順 6・「停止」）・`specs/feature-map.md`・`specs/open-questions.md`・`tasks/20261103-launch/plan.md` だけだった。`apps/web` には無い。手順 6 は T2 で直し、ほかは計画の記録なので変えない。031 の単体テストは鍵の無い `env` で動くので、期待値は変わらない。

## 常時許可外の変更
- `design/tech-stack.md`（「API のデプロイ手順」の手順 6 に鍵の発行・登録・手元のファイルの削除・漏れたときの無効化を足す。担当: メイン。理由: AC-12。T1 で通したコマンドを書くため、T1 の後・委譲の前に書く。D2）
