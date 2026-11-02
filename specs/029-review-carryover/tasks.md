# 029: review-carryover タスク

順序: T1 → T2 → T3 → T4 → T5 → T6 → T7。契約の変更は無い（spec §契約差分）。T3〜T6 は同じ web の領域なので、1 回の委譲にまとめてよい。

- [ ] T1 [api-agent]     護石・武器・構成の楽観ロックの失敗を、実際の競合で 409 になることのテストを足す（plan D1）  refs spec §受入基準 AC-1, AC-13
- [ ] T2 [solver-agent]  `verifyBuild` に除外した装飾品の検査を足す（D2）。`DamageColumns` から `thetaCol` を除く（D3）  refs spec §受入基準 AC-2, AC-3, AC-13
- [ ] T3 [web-agent]     6 箇所の手書きの遅延を `useSkeletonDelay` へ寄せる（D8）。未使用の再エクスポートと `root` ref を除く（D13）  refs spec §受入基準 AC-7, AC-12, AC-13
- [ ] T4 [web-agent]     Combobox の入力欄のクラスを `COMBOBOX_FIELD_CLASS` にまとめ、4 箇所の適用と `truncate` の有無のテストを足す（D9）  refs spec §受入基準 AC-8, AC-13
- [ ] T5 [web-agent]     `ElementType` を作って `WeaponPayload` に使い、要求の型の `Omit` とキャストを除き、両方向のずれを型検査で検出する（D10〜D12）  refs spec §受入基準 AC-9, AC-10, AC-11, AC-13
- [ ] T6 [web-agent]     ログインのリンクと保存のボタンに `MD_OUTLINE_CLASS` の各トークンがあることのテストを足す（D4）  refs spec §受入基準 AC-4, AC-13
- [ ] T7 [e2e-agent]     `uuidV7()` を `e2e/support/uuid.ts` へ移す（D7）。ダークの hover の色を `outline` の実物と比べる e2e を足す（D5）  refs spec §受入基準 AC-5, AC-6, AC-13

T7 の e2e が色の違いを示したときだけ、web-agent を新たに起動して `mdOutlineClass.ts` を直す（D6）。通ればこの追加の委譲は無い。
