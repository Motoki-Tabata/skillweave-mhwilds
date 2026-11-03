# 031: api-proxy タスク

- [x] T1 [main]       `write-scopes.json` の web-agent に `apps/web/worker/**` があることを確かめる。無ければ委譲せず停止する（plan D1 の chore を先に済ませる）  refs plan D1
- [x] T2 [main]       `apps/web/tsconfig.vitest.json` の include に `worker/index.ts` を足す  refs spec §受入基準 AC-11
- [x] T3 [web-agent]  `apps/web/worker/index.ts` の転送の本体と `apps/web/src/test/worker/index.spec.ts` の単体テスト（plan D2〜D10）  refs spec §受入基準 AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11
- [x] T4 [main]       `wrangler dev` と偽の上流で実際の経路を確かめ、結果を `decisions.md` に記録する（plan D11）  refs spec §受入基準 AC-1, AC-2, AC-3, AC-4, AC-5, AC-8, AC-9, AC-10
