# 003: solver-engine タスク

順序: T1 → T2 → T3・T4・T5・T6（同じ領域なので1回の委譲でよい）→ T7 → T8 →（T8 で不合格のときだけ）T9。すべて pnpm workspace を検証する役割なので並列にしない。

- [ ] T1 [main]                委譲前の常時許可外の変更: `packages/solver/package.json` の dependencies に `"@swv/data": "workspace:*"` を足し、リポジトリ直下で `pnpm install`。`pnpm-lock.yaml` の差分が @swv/data の追加だけであることと、`pnpm --filter @swv/solver run type-check` が通ることを確かめる（plan 決定事項 18）     refs spec §受入基準 1, 15
- [ ] T2 [solver-agent]        003 の実装を新しいファイルに書く: 入出力の型（plan 決定事項 1）、`solveBuilds` と options（決定事項 2・3）、要求の検証（決定事項 4）、ILP の組み立て（シリーズ／グループスキル・部位の固定と除外・配置の列 z・辞書式の重み付き目的。決定事項 5〜7）、配置・空きスロット・発動スキルの読み出し（決定事項 8）、列挙・状態・タイムアウト・キャンセル（決定事項 9・10）、Worker のメッセージ型と `createWorkerHandler`（決定事項 11）。001 の `searchBuilds.ts`・`types.ts` は残し、`index.ts` の export からだけ外す（決定事項 12）     refs spec §受入基準 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15
- [ ] T3 [solver-test-agent]   テストの補助を 003 の形にする: 手作りの `MasterBundle` のビルダー、実データの読み込み（plan 決定事項 13）、ソルバーと独立の検算（決定事項 15）。001 のテスト・測定ハーネス・合成データの生成器を削除し、`ciTiming.spec.ts` の引用を受入基準 14 に直す（決定事項 12）     refs spec §受入基準 13, 14
- [ ] T4 [solver-test-agent]   正しさのテスト（手作りのデータ。plan 決定事項 14）: 必須スキルの下限、シリーズ／グループスキルの部位数と段（武器の setBonusIds を含む）、部位の固定・null 固定・除外、護石あり／なし、装飾品の種別と Lv、`defense`・`freeSlots` の最大化と同点の空き Lv の順、不要な装飾品を付けないこと、列挙の件数と重複なしと状態、出力の配置・空きスロット・発動スキル（頭打ちと頭打ち前）・`freeSlotLevels`、不正な要求の各項目がエラーで候補の絞り込みの結果は解なしであること、偽の時計によるタイムアウト（それまでの構成を `timeout` で返す）、Worker のハンドラ（`loadMaster`・`progress`→`result` の順・未読込と不正な要求の `error`・`cancel` と実行中の別の `solve` で打ち切った要求に結果を送らないこと）。返した全構成に検算を掛ける。時間は検査しない     refs spec §受入基準 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13
- [ ] T5 [solver-test-agent]   実データのテスト: `packages/data/dist/` の現行のマスターで、シリーズ／グループスキルを含む固定の必須スキルの組（解あり・解なし）を解き、返した全構成に検算を掛ける。時間は検査しない     refs spec §受入基準 2, 13
- [ ] T6 [solver-test-agent]   測定ハーネス（`src/test/**/*.measure.ts`）: 実データ、必須スキル 3／6／10 個 × 解あり／解なし（各ケースにシリーズ／グループスキルを含む）、各 3 回、検索1回の合計時間・求解の回数と時間・ノード数と LP 反復数・合計時間の最大と 3 秒に対する合否・HiGHS とマスターの版を出力する（plan 決定事項 16）     refs spec §受入基準 14
- [ ] T7 [solver-agent]        001 の `src/main/searchBuilds.ts`・`src/main/types.ts` を削除する（T3 で 001 のテストが消えた後。plan 決定事項 12）     refs spec §受入基準 1, 15
- [ ] T8 [main]                `pnpm --filter @swv/solver exec vitest run --mode measure --reporter=verbose` を実行し、ケースごとの時間・合計時間の最大と合否・測定環境・HiGHS とマスターの版・解なしのケースが presolve／根ノード／分枝のどこで決まったかを `design/tech-stack.md` の新しい節に記録する（plan 決定事項 17・18）     refs spec §受入基準 14
- [ ] T9 [main]                （T8 で合計時間の最大が 3 秒を超えたときだけ）対策を `specs/open-questions.md` に新しい Q として起票し、`design/tech-stack.md` の記録から参照する（plan 決定事項 17）     refs spec §受入基準 14
