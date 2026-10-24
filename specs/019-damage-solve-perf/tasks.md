# 019: damage-solve-perf タスク

順序: T1・T2（同じ領域なので1回の委譲でよい）→ T3 → T4 → T5 →（T5 の合計時間の最大が 3 秒を超え、T4 に D6 が入っていないときだけ）T6 →（1件目までも 3 秒を超えたときだけ）T7。T1・T2・T4・T6 はすべて pnpm workspace を検証する役割なので並列にしない。

- [ ] T1 [solver-agent]   測定ハーネスと実データのテスト: `src/test/solveBuilds.measure.ts` の `expectedDamage` のケースに、1件目までの時間と、合計時間・1件目までの時間のそれぞれの最大と 3 秒に対する合否を足す（006 の条件のまま。plan D8）。`src/test/solveBuilds.real.spec.ts` のすべての要求に `timeoutMs` を明示し、検算の前に状態が `timeout` でないことを検査する（plan D9）。`src/main` は変えない     refs spec §受入基準 7, 10
- [ ] T2 [solver-agent]   求解の方式の試作と測定: `src/test/damagePrototype.measure.ts` に plan D1 の候補 (a)〜(f) の単独と組み合わせを書き、006 の条件で合計時間の最大・1件目までの時間の最大・求解の回数・現行の実装との期待値の一致を表で報告する（plan D1・D2）。`src/main` は変えない。試作のファイルはコミットする     refs spec §受入基準 7, 8
- [ ] T3 [main]           方式の決定: T2 の報告をユーザーに示して確認を取り、採る方式を plan.md の D11 に、試作の結果の要約を decisions.md Q41 の「判断材料」に追記する。D6（進捗の通知に構成を載せる）と D5（支配の除外）を T4 に含めるかを D11 に書く（plan D3）     refs spec §受入基準 8, 9
- [ ] T4 [solver-agent]   本実装とテスト: plan D11 の方式を `src/main` に実装し、2段目が解なしのときの縮退（plan D4）、D11 で採るときの支配の除外（plan D5）と進捗の通知への構成の載せ（plan D6）を入れる。テストは plan D7（既存の 006 のテストを変えずに通す・支配の除外の総当たりとの一致・2段目の解なしの差し替え・時間切れとキャンセル）。T2 の試作のファイルを削除する     refs spec §受入基準 1, 2, 3, 4, 5, 6, 9
- [ ] T5 [main]           `pnpm --filter @swv/solver exec vitest run --mode measure --reporter=verbose --silent=false -t "expectedDamage"` を実行し、`design/tech-stack.md` の新しい節「HiGHS の expectedDamage の再測定（019 damage-solve-perf）」に、条件・環境・版・採った方式・ケースごとの合計時間と1件目までの時間・それぞれの最大・合否を記録し、006 の節の冒頭から参照する（plan D10）     refs spec §受入基準 8, 9
- [ ] T6 [solver-agent]   （T5 で合計時間の最大が 3 秒を超え、T4 に D6 が入っていないときだけ）進捗の通知に構成を載せる: `SolveOptions.onProgress` の2番目の引数と Worker の `progress` のメッセージの `build`（plan D6）。テストは plan D7 の受入基準 6 の項のうち `onProgress` の引数の確認。終わったら T5 の記録の合否を確定する     refs spec §受入基準 9
- [ ] T7 [main]           （T5 で1件目までの時間の最大も 3 秒を超えたときだけ）対策を `specs/open-questions.md` に新しい Q として起票し、`design/tech-stack.md` の記録から参照する（plan D10・decisions.md Q41）     refs spec §受入基準 9
