# 032: privacy-analytics タスク

順序: T1 → T2。契約の変更は無い（spec §契約差分）。テーブルの変更も無い。T2 は T1 の文面を前提にするので並列にしない。

- [ ] T1 [web-agent]      `PrivacyView.vue` にアクセス解析の節を足し、Cookie の節とアクセスログの節の文面と最終更新日を変える（plan D1・D2）。`PrivacyView.spec.ts` に 032 のテストを足し（plan D3〜D6）、030 の AC-9 と AC-10 のテストを追従する（plan D7）     refs spec §受入基準 AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9
- [ ] T2 [e2e-agent]      `apps/web/e2e/privacy-analytics.spec.ts` を足し、`/privacy` でアクセス解析の節の見出しと Cloudflare Web Analytics の説明へのリンクが表示されることを確かめる（plan D8）     refs spec §受入基準 AC-10
