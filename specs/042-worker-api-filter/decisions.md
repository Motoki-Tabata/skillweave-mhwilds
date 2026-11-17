# 042 worker-api-filter の決定記録

## Q159（決定: 2026-11-17）
- 問い: `/api/*` へのスキャナーの要求が Cloud Run と Neon を起こす。URL を配る前の 2026-11-09〜11 に、`/api/.env`・`/api/v1/.env`・`/api/credentials`・`/api/swagger.json` などへの要求が約 40 件届き、Cloud Run（401・403）まで転送された。Worker が答えるのは Cookie なしの `GET /api/auth/me` だけなので、契約に無いパスも Cloud Run を起動し、起動時の Flyway が Neon も起こす（`design/tech-stack.md`「稼働の実測」）（仮: URL を配る前には直さない。今の量なら 1 回の起動で Neon は約 0.083 CU 時間で、無料枠への影響は小さい。契約に無いパスを Worker で 404 にする。公開作業の進行表 D5（2026-11-14）で v1.0.0 の前に扱うと決めたので、機能マップに 042 worker-api-filter として追加した）
- 決定:
  - Worker（`apps/web/worker/index.ts`）は、転送してよいパスのテンプレートの一覧を手で持つ。一覧は `contracts/openapi.yaml` の `paths` のキー（11 個）と、契約の外で API が受ける OAuth の 2 つ（`/api/oauth2/authorization/{registrationId}`・`/api/login/oauth2/code/{registrationId}`。`SecurityConfig` の `AUTHORIZATION_BASE`・`CALLBACK_PATTERN`）からなる。
  - Web の単体テストで、一覧のうち OAuth の 2 つを除いたものが `contracts/openapi.yaml` の `paths` のキーと過不足なく一致することを確かめる。契約にパスを足して一覧を直し忘れると、`pnpm test:unit` が落ちる。
  - 照合はパスだけで行い、メソッドは問わない。一覧のどれにも当たらないパスの要求は、転送せずに 404 の問題応答を返す。当たるパスは、メソッドによらず今どおり転送する（契約に無いメソッドは API が 401・405 などを返す）。
  - テンプレートの `{…}` は、`/` を含まない空でない 1 セグメントに一致させる。値の形式（`{id}` の UUID など）は確かめない。そのほかの部分は大文字と小文字を区別して完全に一致させる。末尾の `/` や `//` を含むパスは一致しない。照合にはクエリ文字列を使わない。
  - 404 の問題応答の本文は、既存の 401 に合わせて `{"type":"about:blank","title":"Not Found","status":404,"instance":<要求のパス>}`、`Content-Type` は `application/problem+json` にする。
  - 判定の順序は、`API_ORIGIN` の確認（031 の AC-4。503）→ 一覧の照合（404）→ Cookie なしの `GET /api/auth/me`（031 の AC-5。401）→ ID トークンの取得と転送（034）とする。404 にする要求では ID トークンを取らない。
- 理由:
  - 手の一覧と一致テストなら、Worker の import も `tsconfig.node.json`・ビルドの手順も変えずに、契約とのずれを CI で検出できる。`schema.ts` の型で網羅を検査する案は、composite の `tsconfig.node.json` の `include` に `schema.ts` を足す必要がある。ビルド時の生成は生成の手順が増える。
  - 届いたスキャナーの要求は未知のパスへのものなので、パスだけの照合で目的を果たせる。メソッドまで照合すると、405 と `Allow` を Worker で作ることになり、API の挙動と二重に持つ。
  - 値の形式まで確かめると、不正な `{id}` への応答が契約どおりの API の応答から 404 に変わり、契約と食い違う。
  - `API_ORIGIN` の確認を先にするのは、031 の AC-4 が「`/api/*` のすべての要求に 503」と定めているため。
- 受け入れる欠点: 契約にあるパスの形をした要求（例: `/api/builds/.env`）は今どおり転送され、Cloud Run を起こす。契約に無いメソッドの要求も同じ。今届いている要求の形では問題にならない。

## Q199（決定: 2026-11-17）
- 問い: 042 で、`apps/web/worker/**` が検査から漏れている件（`tasks/lessons.md` の 2026-11-03 の「apps/web/worker/** が Sonar の解析対象と coverage に入っていない」「apps/web の format:check は worker/ を検査しない」）と、031 handoff.md の持ち越し（`API_ORIGIN` が `http:` のときに転送する、有効側の肯定テストが無い）をどこまで含めるか。`sonar-project.properties` の変更は検査機構の変更なので、人間の明示の指示を要する。
- 決定（2026-11-17 にオーナーが `sonar-project.properties` の変更を含めることを指示した）:
  - `sonar-project.properties` の `sonar.sources` に `apps/web/worker` を足す。
  - `apps/web/vitest.config.ts` の coverage の `include` に `worker/**/*.ts` を足す。
  - `apps/web/package.json` の `format`・`format:check` の対象に `worker/` を足す。
  - `API_ORIGIN` が `http:` のオリジンのときに、そのオリジンへ転送することを確かめる単体テストを足す。
  - テスト配置の規約の件（`tasks/lessons.md` の 2026-11-03「テスト配置の規約が apps/web/worker のテストに当てはまらない」）は `.claude/**` の改修なので 042 には含めない。
- 理由: 042 は Worker を変える機能なので、変えたコードが Sonar・coverage・整形の検査に入っている状態で出す。持ち越しのテストは同じファイルのテストに足すだけで済む。

## spec.md AC-8 の改訂（2026-11-18・区間 C）
- 何を: AC-8 の「改めなければならない 031 のテスト」に、031 の AC-1 のテストの `//evil.example/x`（`API_ORIGIN` にパスがあってもオリジンだけを使うことを確かめる例）を足した。許可の一覧に一致するパスに替えて、同じことを確かめ続ける。
- 理由: 区間 C で `apps/web/src/test/worker/index.spec.ts` の要求のパスを洗い出したところ、許可の一覧に一致しないパスを転送するとした例は `GET /api/auth/me/` のほかにこの 1 例があった。`//` を含むパスは AC-3 により一致しないので、AC-1 の 404 になり、元のままでは通り続けられない。

## 実経路の確認（2026-11-18・区間 D・plan D10）
- 方法: `pnpm --filter @swv/web build` の後、`apps/web` で wrangler 4.158.0 の `wrangler dev --var API_ORIGIN:http://127.0.0.1:8787` を起動し、Node の偽の上流（`http://127.0.0.1:8787`。受けた要求を記録する）へ向けて curl で確かめた。
- 結果:
  - `GET`・`POST /api/.env` → 404、`application/problem+json`、本文 `{"type":"about:blank","title":"Not Found","status":404,"instance":"/api/.env"}`。偽の上流は受けていない。
  - `GET /api/builds/`（`{id}` が空）・`GET /api/auth/me/` → 404（上流へ届かない）。
  - `GET /api/builds`・`GET /api/oauth2/authorization/discord` → 200。偽の上流が `GET /api/builds`・`GET /api/oauth2/authorization/discord` を受けた（AC-6 の `http:` の転送を含む）。
  - Cookie なしの `GET /api/auth/me` → 401（`application/problem+json`）。
  - `API_ORIGIN` なしで起動し直した場合、`/api/.env`・`/api/builds` とも 503（AC-4）。
  - 名前付き export（D1）を持つ Worker は workerd で動いた。
- 偽の上流が受けた要求は、許可した 2 件だけだった。本番での確認はスコープ外。
