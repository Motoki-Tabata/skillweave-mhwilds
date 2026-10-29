# 024: worker-solve-perf タスク

順序: T1 → T2 → T3 → T4 → T5 → T6 →（`expectedDamage` の1件目までの時間の最大が 5 秒を超えたとき、または `defense` の合計時間の最大が 3 秒を超えたときだけ）T7。T1・T3・T5 はすべて pnpm workspace を検証する役割なので並列にしない。

- [x] T1 [e2e-agent]      画面の測定ハーネス: `apps/web/e2e/measure/damage-ui.measure.ts`（`expectedDamage`）と `apps/web/e2e/measure/solver-ui.measure.ts`（`defense`）を、生産護石のオンとオフの両方で測る形にする。`expectedDamage` はケースごとの1件目までの時間と合計時間、生産護石のオン・オフ・全体の1件目までの時間の最大と 3 秒・5 秒に対する合否を、`defense` はケースごとの合計時間と、オン・オフ・全体の最大と 3 秒に対する合否を出力する。生産護石オンの「解なし」ケースは構成あり・解なしのどちらも可にする（plan D6）。時間は検査せず、CI では実行しない     refs spec §受入基準 AC-6, AC-7
- [x] T2 [main]           基準値の測定: 求解を変える前に `pnpm --filter @swv/web run measure --workers=1` を実行し、現行の実装の画面の時間（`expectedDamage`・`defense`、生産護石のオンとオフ）を decisions.md Q50 の「判断材料」に追記する（plan D7）     refs spec §受入基準 AC-6, AC-7, AC-8
- [x] T3 [solver-agent]   求解の方式の試作と測定: `packages/solver/src/test/damagePrototype.measure.ts` に plan D1 の候補 (a)〜(e) の単独と組み合わせを書き、Node・実データ・生産護石のオンとオフで、1件目までの時間の最大・合計時間の最大・求解の回数・現行の実装との期待値の一致を、現行の実装の値と並べて表で報告する（plan D1・D2）。`src/main` は変えない。試作のファイルはコミットする     refs spec §受入基準 AC-8
- [x] T4 [main]           方式の決定: T3 の報告をユーザーに示して確認を取り、採る方式を plan.md の D9 に、試作の結果の要約を decisions.md Q50 の「判断材料」に追記する。支配の除外（plan D4）を T5 に含めるかを D9 に書く（plan D3）     refs spec §受入基準 AC-8
- [x] T5 [solver-agent]   本実装とテスト: plan D9 の方式を `packages/solver/src/main` に実装し、D9 で採るときは支配の除外（plan D4）を入れる。テストは plan D5（既存のテストを変えずに通す・生産護石を含む小さなマスターでの総当たりとの一致・D9 に応じた部分問題と支配の除外のテスト・時間切れとキャンセルと進捗）。T3 の試作のファイルを削除する。D9 が「現行のまま」なら、plan D5 の受入基準 4 の生産護石のテストの追加と試作のファイルの削除だけを行う     refs spec §受入基準 AC-1, AC-2, AC-3, AC-4, AC-5
- [ ] T6 [main]           画面の測定と記録: `pnpm --filter @swv/web run measure --workers=1` を実行し、`design/tech-stack.md` の新しい節「ブラウザの Worker 上の expectedDamage の再測定（024 worker-solve-perf）」に、条件・環境・版・採った方式・試作して採らなかった方式の測定値・024 の前の基準値・ケースごとの時間・それぞれの最大・合否（3 秒、未達なら 5 秒への読み替え）を記録し、007 と 021 の節の冒頭から参照する（plan D8）     refs spec §受入基準 AC-6, AC-7, AC-8, AC-9, AC-10
- [ ] T7 [main]           （T6 で `expectedDamage` の1件目までの時間の最大が 5 秒を超えたとき、または `defense` の合計時間の最大が 3 秒を超えたときだけ）次の対策を `specs/open-questions.md` に新しい Q として起票し、`design/tech-stack.md` の記録から参照する（plan D8・decisions.md Q50）     refs spec §受入基準 AC-9, AC-10
