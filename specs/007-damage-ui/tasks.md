# 007: damage-ui タスク

順序: T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8。T2〜T5 は同じ領域（web）なので、T2・T3 を1回、T4・T5 を1回の委譲にまとめてよい。T2〜T7 はすべて pnpm workspace を検証する役割なので並列にしない。T6・T7 は T5 までの画面を前提にする。

- [x] T1 [main]           `design-system/skillweave/MASTER.md` の Component Specs に、screen-design.md 6 節の4つ（発動条件のトグル・火力の表示・スキルの説明と補完・開閉のボタン）を書く（plan D16。委譲の前）     refs spec §受入基準 2, 4, 7, 8
- [x] T2 [web-agent]      表示用の純粋な関数とその単体テスト: `lib/format.ts` の丸め（plan D6）、`lib/skills/effectSummary.ts` の補完の文（plan D8）、説明文の取り出しと改行の正規化（plan D9）。テスト用のマスターに効果・条件・説明文を足してよい（plan D13）     refs spec §受入基準 5, 9, 10
- [x] T3 [web-agent]      検索条件: 目的に「火力の最大化」を足す（plan D2）、発動条件のストアと `ActivationConditionsCard.vue`（plan D3）、検索したときの写し・要求の `activeConditionIds`・要約の発動条件（plan D4）と単体テスト。既存の `ConditionsCard.spec.ts`・`request.spec.ts`・`search.spec.ts` を追従させる（plan D13）     refs spec §受入基準 1, 2, 3, 6
- [x] T4 [web-agent]      結果: 構成カードの火力と、スキルの効果の開閉と一覧（plan D5・D7・D9）、`client.ts` の `onProgress` の `build` と逐次表示・置き換え・取り消し・エラー（plan D11・D12）と単体テスト。既存の `BuildCard.spec.ts`・`client.spec.ts`・`search.spec.ts`・`SearchView.spec.ts` を追従させる（plan D13）     refs spec §受入基準 4, 5, 6, 7, 10, 11, 12, 13
- [x] T5 [web-agent]      D2 のダイアログ: 格子の列数、説明の開閉ボタンと説明の領域（plan D9・D10）と単体テスト。既存の `SkillDialog.spec.ts` を追従させる     refs spec §受入基準 8, 9, 10
- [x] T6 [e2e-agent]      `e2e/damage-ui.spec.ts`: 火力の最大化・トグルの反映・検索の後の変更で表示が変わらないこと・説明文と補完（plan D14）。既存の `solver-ui.spec.ts` が変更に依存していれば追従させる     refs spec §受入基準 1, 3, 6, 7, 15
- [x] T7 [e2e-agent]      測定のハーネス: `e2e/measure/damage-ui.measure.ts` と、6 ケースを共有する `e2e/support/measureCases.ts`（004 の `solver-ui.measure.ts` もここから読む。中身は変えない）（plan D15）。測定を1回実行して出力を報告する     refs spec §受入基準 14
- [ ] T8 [main]           `pnpm --filter @swv/web run measure` を実行し、`design/tech-stack.md` の新しい節「ブラウザの Worker 上の expectedDamage の測定（007 damage-ui）」に記録して 019 の節から参照する。1件目までの時間の最大が 3 秒を超えたら、対策を `specs/open-questions.md` に新しい Q として起票し、記録から参照する（plan D17・decisions.md Q49）     refs spec §受入基準 14
