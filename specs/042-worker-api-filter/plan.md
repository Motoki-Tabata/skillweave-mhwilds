# 042: worker-api-filter 計画

## スタック
- Cloudflare Workers（`apps/web/worker/index.ts`・`compatibility_date` 2026-10-20）、TypeScript、vitest、prettier。版は `design/tech-stack.md` と `apps/web/package.json` のまま変えない（wrangler は `apps/web/package.json` の 4.158.0。`design/tech-stack.md` の表は 4.153.0 のままで、区間 E のドリフトの確認に任せる）。
- 依存は足さない。YAML の解析ライブラリも使わない（D4）。

## データモデル
なし

## 決定事項
- D1: 許可の一覧は、`apps/web/worker/index.ts` の名前付き export の定数（`export const API_PATH_TEMPLATES: readonly string[]`）として持つ。中身は契約の `paths` のキーの順に 11 個、続けて OAuth の 2 個の、次の 13 個とする。
  - `/api/shares`・`/api/shares/{id}`・`/api/shared-builds/{shortId}`・`/api/builds`・`/api/builds/{id}`・`/api/charms`・`/api/charms/{id}`・`/api/weapons`・`/api/weapons/{id}`・`/api/auth/me`・`/api/auth/logout`
  - `/api/oauth2/authorization/{registrationId}`・`/api/login/oauth2/code/{registrationId}`

  別のファイルに分けない。`tsconfig.node.json`・`tsconfig.vitest.json` は composite で、`include` に `worker/index.ts` だけを列挙しているので、別ファイルにすると両方の `include` を変えることになる（decisions.md Q159 の「tsconfig を変えない」）。名前付き export を持つ Worker が workerd で動くことは、wrangler 4.158.0 の `wrangler dev` で、`export const` と既定の `fetch` を持つ下書きが 200 を返し、警告を出さないことで確かめた。
- D2: 照合は、セグメントごとの比較で行い、テンプレートから正規表現を組み立てない（エスケープの漏れと、Sonar の正規表現の指摘を避けるため）。`pathname.split('/')` とテンプレートの `split('/')` の要素数が同じで、各要素について、テンプレート側が `{` で始まり `}` で終わるなら要求側が空でないこと、それ以外なら `===` で等しいことを満たすとき、一致とする。照合する値は `new URL(request.url).pathname` で、クエリを含まない。`.`・`..` のセグメントは URL の解釈で解決済みで、パーセントエンコードはそのまま残る。当てはめの例:
  - `/api/builds/0193f2a4-7b1c-7000-8000-000000000000`・`/api/builds/not-a-uuid` → 一致（`/api/builds/{id}`。値は確かめない）
  - `/api/oauth2/authorization/discord` → 一致
  - `/api/builds/`（`{id}` が空）・`/api/Builds`・`/api/builds/a/b`・`/api//builds`・`/api/.env`・`/api/v1/.env` → 不一致
  - `/api/builds/%2F` → 一致（エンコードされた `/` はセグメントを分けない）
- D3: 判定の順序は、`resolveOrigin`（503）→ 一覧の照合（404）→ Cookie なしの `GET /api/auth/me`（401）→ ID トークンの取得 → 転送とする（decisions.md Q159）。404 は既存の `problem()` で作り、本文は `{ type: 'about:blank', title: 'Not Found', status: 404, instance: url.pathname }` とする。`Cache-Control` は付けない（AC-1 に無い。`no-store` を付けるのは 401 だけとした 031 の plan D7 を保つ）。
- D4: AC-7 のテストは、`contracts/openapi.yaml` を `readFileSync` で読む（`apps/web/src/test/constants/weaponTypes.spec.ts` と同じく `join(import.meta.dirname, '../../../../../contracts/openapi.yaml')` の形）。`paths:` の行から次のトップレベルのキー（行頭が空白でない行）の手前までで、`^  (/[^:\s]+):\s*$` に当たる行のキーを取り出す。YAML の解析ライブラリは足さない（依存の追加は `package.json` と lockfile の変更になり、サプライチェーンの攻撃面が増える。`paths` のキーは `$ref` の 1 行を持つ同じ形で並んでいる）。この規則で今の `contracts/openapi.yaml` から D1 の 11 個がちょうど取り出せることを確かめた。比較は、`API_PATH_TEMPLATES` から OAuth の 2 個を除いたものと、取り出したキーを、それぞれ並べ替えた配列どうしの `toEqual` で行う（過不足と重複を検出する）。OAuth の 2 個が一覧にあることも別に確かめる。
- D5: テストは既存の `apps/web/src/test/worker/index.spec.ts` に足す（031 の plan D8 の置き場所と import の形のまま）。042 のテストは新しい `describe('worker /api/* allowlist (042)')` にまとめ、テスト名の `AC-N` は 042 の受入基準の番号とする。少なくとも次を確かめる。
  - AC-1: `/api/.env`・`/api/v1/.env`・`/api/credentials`・`/api/swagger.json`・`/api/auth/me/` を `GET`・`POST`・`DELETE` で送り、404・本文・`Content-Type`・上流を呼ばないこと
  - AC-2: 一覧の 13 個（`{…}` に値を入れたもの）が `GET` と契約に無いメソッド（`PATCH` など）で転送されること。Cookie なしの `GET /api/auth/me` が 401 のままであること
  - AC-3: D2 の例のうち一致・不一致の代表と、クエリだけが一致する形（`/api/.env?x=/api/builds` → 404）
  - AC-4: `API_ORIGIN` が無いとき、一覧に無いパスでも 503 になること
  - AC-5: `API_INVOKER_KEY` があっても、404 にする要求ではトークンエンドポイントを呼ばないこと（`fetch` が呼ばれないこと）
  - AC-6: `API_ORIGIN` が `http://127.0.0.1:8787` のとき、`http://127.0.0.1:8787/api/builds` へ転送すること
- D6: 031 のテストの追従（AC-8）は次の 2 箇所だけにする。031 の AC-7 の `it.each` から `['GET', '/api/auth/me/']` を外す（D5 の AC-1 で 404 を確かめる）。031 の AC-1 の `//evil.example/x` の例は、`call('/api/builds', {}, { API_ORIGIN: `${ORIGIN}/foo` })` が `${ORIGIN}/api/builds` へ転送することを確かめる形に替える（`//` を含むパスの 404 は D5 の AC-3 で確かめる）。034 のテストは `/api/builds` と `/api/auth/me` だけを使うので変えない。
- D7: `apps/web/worker/index.ts` の冒頭の説明（AC-10）は、D3 の順序のとおり、503 → 許可の一覧に無いパスは 404 → Cookie なしの `GET /api/auth/me` は 401 → それ以外は転送、と書き直す。web-agent が書く。
- D8: 「常時許可外の変更」の 4 行は、ゲート C-1 の承認の後、web-agent への委譲より前に、メインが 1 コミットで書く。中身は次のとおり。
  - `sonar-project.properties`: `sonar.sources` の `apps/web/scripts,\` の次に `apps/web/worker,\` を足す。`sonar.coverage.exclusions` は変えない。
  - `apps/web/vitest.config.ts`: `coverage.include` を `['src/main/**/*.{ts,vue}', 'worker/**/*.ts']` にする。
  - `apps/web/package.json`: `format` を `prettier --write src/ e2e/ worker/`、`format:check` を `prettier --check src/ e2e/ worker/` にする。`worker/` は今も整形済みである（`pnpm exec prettier --check worker/` が通ることを確かめた）。
  - `design/tech-stack.md`「稼働の実測」のスキャナーの要求の段落: 042 から、契約に無いパスへの要求は Worker が 404 を返し、Cloud Run へ転送しないことを足す。契約にあるパスの形をした要求と、契約に無いメソッドの要求は今どおり転送されることも書く（decisions.md Q159 の「受け入れる欠点」）。

  同じコミットで、`tasks/lessons.md` の 2026-11-03 の 2 項目（「apps/web/worker/** が Sonar の解析対象と coverage に入っていない」「apps/web の format:check は worker/ を検査しない」）を消す（`lessons-guide.md` の 1）。テスト配置の規約の項目は残す（decisions.md Q199）。
- D9: `--sonar-area web`（`scripts/sonar-local.sh`）は、解析するパスを `apps/web/src/main`・`apps/web/src/test`・`apps/web/e2e` に固定しているので、D8 の後も `apps/web/worker` を解析しない。`scripts/**` は検査機構で、decisions.md Q199 の指示の外なので変えない（教訓に起票した）。web-agent の Sonar の完了条件（`--sonar-area web` の 0 件）はテストの変更だけを見るので、web-agent の後にメインが全体解析（`verify.mjs --sonar`）を 1 回走らせ、`apps/web/worker/index.ts` の issue を確かめる。042 で初めて解析対象に入るので、既存のコード由来の issue も 042 で直す。出たら web-agent を新規起動して直させ、直すのが適さないものはゲート D-1 で判断する。
- D10: web-agent の後に、メインが実際の経路を確かめる（031 の plan D11 と同じ形）。`pnpm --filter @swv/web build` の後、`apps/web` で `wrangler dev --var API_ORIGIN:http://127.0.0.1:<port>` を起動し、scratchpad に置く Node の偽の上流へ向ける。確かめるのは、`GET`・`POST /api/.env` の 404 の問題応答と上流へ届かないこと、`/api/builds/` の 404、`/api/builds` と `/api/oauth2/authorization/discord` の転送、Cookie なしの `GET /api/auth/me` の 401、`API_ORIGIN` なしの 503 である。名前付き export（D1）が workerd で動くことと、AC-6 の `http:` の転送も、これで実経路で確かめる。本番での確認はスコープ外。
- D11: 既定値・既存の文言を変える機能ではない。画面を変えないので、E2E のタスクは作らない。`Not Found` と `worker/index` を `apps/web/src`・`apps/web/e2e` で検索し、追従が要るのは `apps/web/src/test/worker/index.spec.ts`（D6）だけだった（ほかの一致は `apps/web/src/test/lib/http.spec.ts` の fetch ラッパーのモックの `statusText` で、Worker と関係しない）。E2E の `webServer` は `vite preview` で、Worker を通らない。

## 常時許可外の変更
- `sonar-project.properties`（sonar.sources に apps/web/worker を足す。担当: メイン。理由: AC-9。2026-11-17 にオーナーが指示した。decisions.md Q199）
- `apps/web/vitest.config.ts`（coverage の include に worker/**/*.ts を足す。担当: メイン。理由: AC-9）
- `apps/web/package.json`（format・format:check の対象に worker/ を足す。担当: メイン。理由: AC-9）
- `design/tech-stack.md`（「稼働の実測」のスキャナーの要求の記述を更新する。担当: メイン。理由: AC-10）
