# 001: solver-spike タスク

順序: T1 → T2 → T3・T4・T5（同じ領域なので1回の委譲でよい）→ T6 → T7 →（T7 で不合格のときだけ）T8 → T9 → T10。すべて pnpm workspace を検証する役割なので並列にしない。

- [x] T1 [main]                委譲前の常時許可外の変更: highs と @types/node の追加と `pnpm install`、measure・type-check の script、vitest.config.ts の mode の切り替え、tsconfig の分割（plan 決定事項 7・8）、C-1 で承認されたときだけ sonar-project.properties     refs spec §受入基準 1, 9, 13, 14
- [x] T2 [solver-agent]        型の移設と `searchBuilds`（plan 決定事項 1〜6: ILP の組み立て、HiGHS の永続 API での求解、除外の行を足す列挙、解なし）     refs spec §受入基準 1, 2, 3, 4, 5, 6, 14
- [x] T3 [solver-test-agent]   シード固定の合成データ生成器（Q2 の分布と出典の記載、解あり・解なしのケースの作り方は plan 決定事項 10）と、同じシードから同じデータになることのテスト     refs spec §受入基準 8
- [x] T4 [solver-test-agent]   正しさのテスト: 小さい手作りのデータで、必須スキルの下限・武器用と防具用のスロットの区別・スロット Lv 以下の装飾品だけ・防御力の最大化・30 件での打ち切りと解が尽きるまでの列挙・防具と護石の組の重複なし・解なしを確かめ、生成器のデータで返した全構成を独立に検算する（plan 決定事項 11）。時間は検査しない     refs spec §受入基準 1, 2, 3, 4, 5, 6, 7, 13
- [x] T5 [solver-test-agent]   測定ハーネス（`src/test/**/*.measure.ts`）: 上位防具の全件、必須スキル 3／6／10 個 × 解あり／解なし、各 3 回、検索1回の合計時間と求解ごとの時間・合計時間の最大と 3 秒に対する合否・HiGHS の版を出力する（plan 決定事項 9）。HiGHS の初期化は時間に含めない     refs spec §受入基準 9, 13
- [ ] T6 [main]                `packages/solver/vitest.config.ts` の `passWithNoTests` を外す（T3〜T5 の後。plan 決定事項 14）     refs spec §受入基準 7, 8
- [ ] T7 [main]                `pnpm --filter @swv/solver run measure` を実行し、ケースごとの時間・合計時間の最大と合否・測定環境・HiGHS の版・採否を `design/tech-stack.md` に記録する     refs spec §受入基準 9, 10
- [ ] T8 [solver-agent]        （T7 で合計時間の最大が 3 秒を超えたときだけ）縮約の純粋関数（plan 決定事項 12）     refs spec §受入基準 11
- [ ] T9 [solver-test-agent]   （T8 を行ったときだけ）縮約のテスト（縮約後の候補で返した構成も検算を満たす）と、測定ハーネスに縮約の前後の両方を出力させる     refs spec §受入基準 7, 11
- [ ] T10 [main]               （T8 を行ったときだけ）再測定し、縮約の前後の結果を `design/tech-stack.md` に記録する。それでも 3 秒を超えたら、代替の選定を `specs/open-questions.md` に新しい Q として起票し、001 を「不合格」で閉じる（plan 決定事項 13）     refs spec §受入基準 10, 11, 12
