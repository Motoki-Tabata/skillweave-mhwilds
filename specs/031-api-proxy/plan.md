# 031: api-proxy 計画

## スタック
- Cloudflare Workers（`apps/web/worker/index.ts`・`compatibility_date` 2026-10-20）、wrangler 4.153.0、TypeScript 6.0.3、vitest 5.0.5。版は `design/tech-stack.md` のまま。
- 依存は足さない。Workers の型パッケージも使わず、`Env` は手で書く。

## データモデル
なし

## 決定事項
- D1: `apps/web/worker/**` を web-agent の常設の書込範囲へ足す。転送の本体はロジックなので、書込ガードの内側でワーカーが書く。区間 D の前に、区間の外の `chore/*` でメインが行う（`canon-boundary.md` の経路 (a)）。
  - 直す場所: `.claude/skills/impact-scope/write-scopes.json`、`.claude/skills/impact-scope/SKILL.md` の表、`.claude/agents/web-agent/web-agent.md` の説明と表。
  - 同じコミットで、`tasks/lessons.md` の 2026-11-03 の項目から書込範囲の分を消す。Sonar の分（`sonar.sources`）は 031 のスコープ外なので残す。
  - 確認: `.claude/skills/impact-scope/scripts/agent-write-guard.test.mjs` と `.claude/skills/tsod-spec-check/scripts/spec-check.test.mjs` を実行する。
  - PR を main へマージした後、`feat/031-api-proxy` へ main を merge で取り込む。rebase はしない（`handoff.mjs check` は、記録したハッシュが HEAD の履歴にあることを見るため）。
- D2: 判定は「`API_ORIGIN` の検査（AC-4）→ `GET /api/auth/me` の Cookie の判定（AC-5）→ 転送」の順にする。
- D3: `API_ORIGIN` は、`URL.canParse` が真で、プロトコルが `https:` か `http:` のときだけ有効とし、`URL.origin` だけを使う。`http:` を認めるのは手元の `wrangler dev` で使うため。`URL` として解釈できても、プロトコルが違えば無効にする。未設定でも Worker は起動し、AC-4 の 503 を返す（Spring の起動時検証の規約は当たらない）。
  - `https://swv-api-abc.a.run.app` → 有効、`https://swv-api-abc.a.run.app/foo` → 有効（`https://swv-api-abc.a.run.app` を使う）
  - `localhost:8080` → 無効（プロトコルが `localhost:`）、`not a url`・空文字・未設定 → 無効
- D4: セッションの Cookie の判定は、`Cookie` ヘッダーを `;` で分け、前後の空白を除いて、`SESSION=` で始まり、その後ろが空でない要素があるかで行う。大文字小文字は区別する。パスは `/api/auth/me` の完全一致、メソッドは `GET` だけを対象にする。
  - `SESSION=abc`・`a=1; SESSION=abc` → あり
  - `XSESSION=abc`・`SESSION=`・`session=abc`・ヘッダーなし → なし
  - `/api/auth/me/` と `HEAD /api/auth/me` は Cookie が無くても転送する（AC-7）
- D5: 上流の URL は `` `${origin}${url.pathname}${url.search}` `` の文字列連結で作る。`new URL(path, origin)` は使わない（`//` で始まるパスでオリジンが変わるため）。
  - `https://skillweave.app/api/login/oauth2/code/discord?code=a%2Fb+c&state=d` → `<origin>/api/login/oauth2/code/discord?code=a%2Fb+c&state=d`
- D6: 転送は `fetch(url, { method, headers, body: request.body, redirect: 'manual' })` の形にする。ヘッダーは `new Headers(request.headers)` の写しから、`Host`・`Forwarded`・`X-Forwarded-` で始まるもの・`X-Real-IP`・`CF-Connecting-IP`・`CF-Connecting-IPv6` を消す。名前の一覧を配列へ写してから消す（反復しながら消さない）。上流の応答は作り直さず、そのまま返す（AC-2・AC-3）。
- D7: `try`/`catch` で囲むのは上流への `fetch` だけにし、例外は AC-10 の 502 にする。問題応答の本文は AC-4・AC-5・AC-10 の値に合わせる。`Cache-Control: no-store` を付けるのは 401 だけにする。先頭のコメント（「API を接続するまでは 503 を返す」）は実態に合わせて直す。
- D8: テストは `apps/web/src/test/worker/index.spec.ts` に置く。`src/main` の外なので `@/` は使えず、`../../../worker/index` の相対パスで import する。`fetch` は `vi.stubGlobal` で差し替える（`lib/http.spec.ts` と同じ）。環境は既定の jsdom のままでよい（`Request`・`Response`・`Headers` と `Cookie` ヘッダーの扱いを、jsdom と node の両方で動かして確かめた）。
- D9: `Env` は `API_ORIGIN?: string` の形で export する（composite の tsconfig のため）。この形の Worker の下書きが、`tsconfig.node.json` と `tsconfig.vitest.json` の両方の設定で型検査を通ることを確かめた。
- D10: `pnpm format:check` は `src/`・`e2e/` だけを見るので、`worker/index.ts` は検査されない。web-agent は `pnpm --filter @swv/web exec prettier --write worker/index.ts` で整形する。スクリプトは変えない。lint と型検査は Worker も対象に入っている。Sonar と coverage の対象外であることは spec のスコープ外のとおりで、`--sonar-area web` の0件は Worker の品質を示さない。
- D11: web-agent の後に、メインが実際の経路を確かめる（T4）。`pnpm build` の後、`apps/web` で `wrangler dev --var API_ORIGIN:http://127.0.0.1:<port>` を起動し、scratchpad に置く Node の偽の上流へ向ける。確かめるのは、認可の開始の 302 と分かれた `Set-Cookie`、コールバックのパスとクエリ、POST の本文と `Cookie`・`X-XSRF-TOKEN`、接続元のヘッダーの除去、Cookie の無い `GET /api/auth/me` の 401（上流へ届かないこと）、上流を止めたときの 502、`API_ORIGIN` なしの 503 である。本番の確認は Q88 で行う。
- D12: 既存のテストと文書で追従するものは無い。`Service Unavailable` と `worker/index` を `apps/web/src`・`apps/web/e2e`・`design`・`contracts` で検索して0件だった。`API_ORIGIN` の登録の手順を `design/tech-stack.md` へ書くのは Q88 の運用作業とする。

## 常時許可外の変更
- `apps/web/tsconfig.vitest.json`（include に worker/index.ts を追加。担当: メイン。理由: 単体テストから Worker のコードを読むため。足さないと TS6307 で失敗する）
