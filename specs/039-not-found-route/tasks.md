# 039: not-found-route タスク

順序: T1 → T2 → T3。契約の変更は無い（spec §契約差分）。テーブルの変更も無い。

- [ ] T1 [main]           `design-system/skillweave/MASTER.md` の Component Specs に「見つからない画面の表示」「読み込み失敗の通知」の2節を足す（plan D9）     refs spec §受入基準 AC-2, AC-5
- [ ] T2 [web-agent]      キャッチオールの経路と `NOT_FOUND_ROUTE_NAME`（D1）、`NotFoundView.vue`（D2）、`safeReturnPath` の判定（D3）、`lazyView`・`RouteChunkLoadError` で全経路の部品を包み（D4）、`installChunkErrorHook` を本物のルーターに付ける（D5）。`stores/chunkLoad.ts`（D6・D7。`register.ts` は変えない）と `AppToaster.vue` の N2 と並び（D8）。単体テストを D10 のとおり足し、既存の spec の期待は書き換えずに通す。テスト用ルーターの追従は、共有コンポーネントに経路の項目を足さず `support/mount.ts` が本物の `routes` を使うので要らない（plan D1〜D8・D10）     refs spec §受入基準 AC-1, AC-2, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9
- [ ] T3 [e2e-agent]      `apps/web/e2e/not-found-route.spec.ts` を足す（直接開く・タイトル・装備検索へのリンク、チャンクに HTML を返したときの通知・閉じて再表示・再読み込みで行き先が開くこと）（D11）。`pwa-offline.spec.ts` に、SW の制御下のオフラインで `/no-such-page` を開いて再読み込みしても同じ画面が出るテストを足す（D12）（plan D11・D12）     refs spec §受入基準 AC-1, AC-2, AC-3, AC-5, AC-6, AC-7
