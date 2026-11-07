# 034: api-proxy-id-token タスク

- [ ] T1 [main]       運営者が `swv-web-invoker` を作って鍵を発行し、メインが手元からトークンエンドポイントで交換を試して decisions.md に記録する。鍵を作れない・形が spec と違うときは委譲せず停止する（plan D1）  refs spec §受入基準 AC-1, AC-2
- [ ] T2 [main]       `design/tech-stack.md`「API のデプロイ手順」の手順 6 に、T1 で通した鍵の発行・`wrangler secret put API_INVOKER_KEY` での登録・手元のファイルの削除・漏れたときの無効化を足す（plan D2）  refs spec §受入基準 AC-12
- [ ] T3 [web-agent]  `apps/web/worker/index.ts` の ID トークンの取得・使い回し・付与と、`apps/web/src/test/worker/index.spec.ts` の単体テスト（plan D3〜D9）  refs spec §受入基準 AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11
- [ ] T4 [main]       `wrangler dev` と偽の上流・本物のトークンエンドポイントで実際の経路を確かめて decisions.md に記録し、その後に運営者が鍵を破棄する（plan D10）  refs spec §受入基準 AC-1, AC-3, AC-4, AC-7, AC-8
