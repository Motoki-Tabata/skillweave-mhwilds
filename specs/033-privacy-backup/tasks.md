# 033: privacy-backup タスク

順序: T1 → T2 → T3 → T4。契約の変更は無い（spec §契約差分）。テーブルの変更も無い。T2 は T1 の手順を実行し、結果が T3 の文面の前提になる（plan D9）。T4 は T3 の文面を前提にするので並列にしない。

- [ ] T1 [main]           `design/tech-stack.md` の「バックアップ」の消し方を変え、「消去」を足し、「復元」に消し直す工程を足す（plan D1〜D6）     refs spec §受入基準 AC-8, AC-9, AC-10
- [ ] T2 [main]           T1 の手順を使い捨ての DB で実行し、確かめた日と結果を `design/tech-stack.md` に書く。前提が崩れたら停止する（plan D7〜D9）     refs spec §受入基準 AC-11
- [ ] T3 [web-agent]      `PrivacyView.vue` の「データの削除」の節に Q143 の文面を足し、最終更新日を変える（plan D10・D11）。`PrivacyView.spec.ts` に 033 のテストを足し、032 の節の順と AC-8 のテストを追従する（plan D12〜D15）     refs spec §受入基準 AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-12
- [ ] T4 [e2e-agent]      `apps/web/e2e/privacy-backup.spec.ts` を足し、`/privacy` で「データの削除」の見出しとバックアップの説明が表示されることを確かめる（plan D16）     refs spec §受入基準 AC-13
