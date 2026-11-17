# 042: worker-api-filter

## 目的 / ユーザーストーリー
運営者として、契約に無い `/api/*` への要求（スキャナーが探る `/api/.env`・`/api/credentials` など）を Web の Worker で 404 にし、Cloud Run と Neon を起こさないようにしたい。今の Worker（031・034）は、Cookie なしの `GET /api/auth/me` 以外をすべて Cloud Run へ転送するので、こうした要求だけで Cloud Run が起動し、起動時の Flyway が Neon も起こす（decisions.md Q159）。あわせて、Worker のコードが Sonar・coverage・整形の検査から漏れている状態を直す（decisions.md Q199）。

用語:
- 許可の一覧: Worker が手で持つ、転送してよいパスのテンプレートの一覧。`contracts/openapi.yaml` の `paths` のキー 11 個と、契約の外で API が受ける OAuth の 2 個（`/api/oauth2/authorization/{registrationId}`・`/api/login/oauth2/code/{registrationId}`）からなる（decisions.md Q159）。
- 問題応答・`API_ORIGIN`・上流: 031 の spec.md の用語のとおり。

## 受入基準（EARS記法）
- AC-1: WHEN `/api/*` の要求のパスが許可の一覧のどれにも一致しないとき THE system SHALL 転送せず、404 の問題応答（本文 `{"type":"about:blank","title":"Not Found","status":404,"instance":<要求のパス>}`、`Content-Type: application/problem+json`）を、メソッドによらず返さなければならない（decisions.md Q159）。
- AC-2: WHEN `/api/*` の要求のパスが許可の一覧のどれかに一致するとき THE system SHALL メソッドによらず、031・034 のとおりに扱わなければならない（Cookie なしの `GET /api/auth/me` は 401、それ以外は転送）。
- AC-3: THE system SHALL テンプレートの `{…}` を、`/` を含まない空でない 1 セグメントに一致させ、値の形式（`{id}` の UUID など）を確かめてはならない。テンプレートのそのほかの部分は、大文字と小文字を区別して完全に一致させなければならない。末尾の `/` や空のセグメント（`//`）を含むパスは一致しないものとし、照合にクエリ文字列を使ってはならない。
- AC-4: IF `API_ORIGIN` が未設定または URL として不正である THEN システムは許可の一覧の照合より先に、031 の AC-4 のとおり 503 の問題応答を返さなければならない。
- AC-5: WHEN AC-1 で 404 を返すとき THE system SHALL トークンエンドポイントを呼んではならない。
- AC-6: WHERE `API_ORIGIN` が `http:` のオリジンである THE system SHALL 許可の一覧に一致する要求を、そのオリジンへ転送しなければならない（031 handoff.md の持ち越し。decisions.md Q199）。
- AC-7: THE system SHALL Web の単体テストで、許可の一覧から OAuth の 2 個を除いたものが `contracts/openapi.yaml` の `paths` のキーと過不足なく一致することを検証しなければならない。
- AC-8: THE system SHALL Web の単体テスト（`fetch` をモックする vitest）で AC-1〜AC-6 を検証し、031・034 のテストが通り続けなければならない。ただし、031 のテストのうち許可の一覧に一致しないパスを転送するとした 2 例は改めなければならない。031 の AC-7 の `GET /api/auth/me/` は、AC-3 により 404 になるので AC-1 のテストへ改める。031 の AC-1 の `//evil.example/x` は、許可の一覧に一致するパスに替えて、`API_ORIGIN` のオリジンだけを使うことを確かめ続ける。
- AC-9: THE system SHALL `apps/web/worker` を、Sonar の解析対象（`sonar-project.properties` の `sonar.sources`）・vitest の coverage の対象（`apps/web/vitest.config.ts` の `include`）・整形の対象（`apps/web/package.json` の `format`・`format:check`）に含めなければならない（decisions.md Q199）。
- AC-10: THE system SHALL `design/tech-stack.md`「稼働の実測」のスキャナーの要求の記述に、042 から契約に無いパスを Worker が 404 にすることを足し、`apps/web/worker/index.ts` の冒頭の説明を AC-1〜AC-5 の挙動に合わせなければならない。

## スコープ外
- メソッドの照合（405）と、パスパラメータの値の形式の確認（decisions.md Q159）
- 許可の一覧に一致するパスへの Cookie なしの要求を、Worker で 401 にすること（`GET /api/auth/me` 以外）
- 許可の一覧の自動生成、`schema.ts` の型による網羅の検査（decisions.md Q159）
- API・契約・`wrangler.jsonc`（`run_worker_first`）の変更、Web の画面と文言の変更
- テスト配置の規約（`.claude/skills/impact-scope/conventions.md`）の改修（decisions.md Q199）
- デプロイと本番での確認、Cloudflare の WAF・レート制限の設定

## 契約差分
- なし（API の契約は変えない。Worker が契約の `paths` に合わせる側になる）

## 影響範囲
触る領域: web
常時許可外の変更予定:
- `sonar-project.properties`（sonar.sources に apps/web/worker を足す。AC-9。2026-11-17 にオーナーが指示した。decisions.md Q199）
- `apps/web/vitest.config.ts`（coverage の include に worker/**/*.ts を足す。AC-9）
- `apps/web/package.json`（format・format:check の対象に worker/ を足す。AC-9）
- `design/tech-stack.md`（「稼働の実測」のスキャナーの要求の記述を更新する。AC-10）

## 依存する機能ID
- 031
- 034
