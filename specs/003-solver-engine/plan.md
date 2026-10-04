# 003: solver-engine 計画

## スタック
- Node 24・TypeScript 6.0.3・Vitest 5.0.1・npm `highs` 1.15.3（`design/tech-stack.md` の現行どおり。版の変更なし）
- `@swv/data`（`packages/data`）を `packages/solver` の `dependencies` に `workspace:*` で足す（decisions.md Q17）。`import type` だけで使い、実行時の値は読まない
- マスターデータ: `packages/data/dist/master-2026.10.1.json`（2026-10-04 時点の現行。防具 714・装飾品 361・スキル 179・シリーズ／グループ 42・武器 1188・生産護石 183）

## データモデル
なし

## 決定事項

### ファイルの置き場と公開 API
1. `src/main` の分け方（ファイル名は目安）。
   - `request.ts`: 入出力の型（`SolverWeapon`・`SolverCharm`・`Objective`・`SolverRequest`・`SlotOwner`・`SlotRef`・`SolvedBuild`・`SolverStatus`・`SolverResponse`）。形は `temp/solver-types.ts` の同名の型のまま写し、次だけを変える。
     - `SolvedBuild` に `freeSlotLevels?: { armor: number; weapon: number }` を足す（目的関数が `freeSlots` のときだけ入れる。受入基準 8）。`score` は `maximize` のときだけ入れ、`defense` では防御力の合計、`freeSlots` では防具用の空き Lv の合計（主目的の値）にする。
     - マスター由来の型（ID・`Slot`・`SkillLevel`・`ArmorPart`・`MasterBundle` 等）は `@swv/data` から `import type` で読む。001 で `packages/solver` に複製した型は使わない（Q17）。
     - `activeConditionIds` は型に残し、003 では読まない（006）。
   - `validate.ts`: 要求の検証（決定事項 4）。
   - `model.ts`: ILP の組み立て（決定事項 5〜7）。
   - `placement.ts`: 装飾品の配置・空きスロット・発動スキルの計算（決定事項 8）。
   - `solveBuilds.ts`: 列挙・タイムアウト・キャンセル（決定事項 9・10）。
   - `worker.ts`: Worker のメッセージ型（`WorkerInbound`・`WorkerOutbound`。`temp/solver-types.ts` のまま）と純粋なメッセージハンドラ（決定事項 11）。
2. 公開する関数は次の2つ。どちらも HiGHS の初期化済みのインスタンスを引数で受け取る（001 と同じ。`highs` からは `import type` だけ）。
   - `solveBuilds(highs, master, request, options): Promise<SolverResponse>`
   - `createWorkerHandler(deps): (message: WorkerInbound) => Promise<void>`
   - エラーの型 `InvalidRequestError`（不正な要求）・`SolveCancelledError`（キャンセル）も公開する。`index.ts` は上と `request.ts`・`worker.ts` の型だけを export し、`@swv/data` の型は再 export しない（利用側は `@swv/data` から読む）。
3. `solveBuilds` の `options` は、`src/main` が持てない時計とイベントループを呼び出し側から受け取る（`tsconfig.json` が `lib: ["ES2024"]`・`types: []` で `setTimeout`・`performance` の型を持たないため。handoff の区間メモ）。
   - `now: () => number`（ミリ秒。経過時間とタイムアウトの判定に使う。必須）
   - `yieldControl: () => Promise<void>`（求解の前にイベントループへ処理を返す。必須。004 の Worker は `setTimeout(…, 0)` を包んで渡す。マイクロタスクでは `cancel` のメッセージを受け取れない）
   - `isCancelled?: () => boolean`・`onProgress?: (found: number) => void`
   - テストは偽の時計を注入してタイムアウトを確かめ、実時間を待たない（`*.spec.ts` は時間の API を使わない。001 の `ciTiming.spec.ts`）。

### 要求の検証
4. 求解の前に要求を検証し、不正なら `InvalidRequestError`（どの項目がなぜ不正かを日本語の `message` に書く）を投げる（Q18）。検証する項目:
   - `request.masterVersion` が `master.version` と一致する（マスター未読込はハンドラで判定する。決定事項 11）
   - マスターに有る ID: 武器（`kind: 'master'` の `weaponId`、`kind: 'custom'` の `baseWeaponId`）、防具（`fixedArmor` の値・`excludedArmorIds`）、スキル（`required`・護石・個体差のある武器の `skills`）。個体差のある武器の `setBonusIds` もマスターの `setBonuses` に有ることを確かめる（スキルと同じく、無い ID を黙って0部位として数えないため）
   - `fixedArmor` の防具の `part` がキーの部位と一致する。同じ防具が `fixedArmor` と `excludedArmorIds` の両方に無い
   - `required` の各 `level` が整数で 1 以上、そのスキルの `maxLevel` 以下（シリーズ／グループスキルも `MasterSkill.maxLevel`。実データでは段の最大レベルと一致することを 2026-10-04 に確認）
   - `maxResults` が 1〜30 の整数、`timeoutMs` が 0 より大きい有限の数、`objective` が `expectedDamage` でない
   - 固定・除外・候補の絞り込みの結果として満たせないもの（固定されていない部位の候補が空、等）は検証で落とさず、解なしとして返す。

### 定式化（ILP）
5. 変数（列）: 001 の定式化を広げる。
   - 防具 x（0/1）: 固定されていない部位はマスターの全防具から除外を引いたもの、固定された部位はその1つ、固定が `null` の部位は列を作らない（Q15）。
   - 護石 y（0/1）: 候補ごと。装飾品 n（非負整数）: 必須スキルを1つでも持つ装飾品だけ（001 と同じ。持たない装飾品は空きスロットを減らすだけなので、決定事項 7 の目的では選ばれない）。
   - 配置 z（非負整数）: スロットの種別 t（武器用・防具用）× 装飾品の Lv d × スロットの Lv s（d ≤ s）ごとに1つ（最大 20 列）。「種別 t・Lv d の装飾品を Lv s のスロットに付ける個数」。
6. 制約（行）:
   - 部位ごとに Σx = 1（固定が `null` の部位は行を作らない）。護石は候補があれば Σy = 1。
   - 通常のスキル（必須スキルごと）: 武器のレベル + Σ(防具のレベル × x) + Σ(護石のレベル × y) + Σ(装飾品のレベル × n) ≥ 下限（001 と同じ）。
   - シリーズ／グループスキル（必須スキルごと。Q19）: 下限のレベル L に対し、`thresholds` のうち `level ≥ L` の段の `pieces` の最小を p とする。Σ(そのスキルの `SetBonus.id` を `setBonusIds` に持つ防具の x) + (武器がそれを持てば 1) ≥ p。護石と装飾品は数えない。
   - 配置: 種別 t・Lv d ごとに Σ_s z[t][d][s] = Σ(種別 t・`slotLevel` d の装飾品の n)。種別 t・Lv s ごとに Σ_d z[t][d][s] ≤ 種別 t でちょうど Lv s のスロットの数（武器は定数、防具と護石は x・y の係数）。001 の入れ子の不等式を、空きスロットの Lv を線形に書ける形へ置き換えたもの（配置が存在する条件は同じ）。
7. 目的関数（Q14）: 主目的 P・防具用の空き Lv の合計 A・武器用の空き Lv の合計 W を、重み付きの1本の目的で辞書式に最大化する。
   - P: `defense` は Σ(防御力 × x)、`freeSlots` は A、`feasible` は 0。
   - 空き Lv の合計 = Σ_s s × (種別 t でちょうど Lv s のスロットの数) − Σ_{d,s} s × z[t][d][s]。スロットの種別で分ける（護石の防具用のスロットは A に入る）。
   - 目的 = c₁·P + c₂·A + W。c₂ = (W の上界) + 1、c₁ = c₂ × ((A の上界) + 1)。上界は、武器・部位ごとの候補の最大・護石の候補の最大のスロット Lv の合計から、要求ごとに求める。`freeSlots` は P = A なので c₁·A + W と同じ。
   - 目的は整数値なので、HiGHS の `mip_rel_gap` を 0 にして、最適性の判定を整数の差で行う（既定の 1e-4 では、重みを掛けた目的で下位の項の差が許容差に埋もれるため）。
   - 不採用: HiGHS の多目的（`passLinearObjectives` の優先度）。目的ごとに解き直しが入り、1件あたりの求解の回数が増えるため。
8. 解からの読み出し（`placement.ts`）:
   - 装飾品の配置は ILP の z を使わず、n から作り直す: 種別ごとに装飾品を Lv の大きい順（同じ Lv はマスターの `decorations` の並び順）に、入る中で最も Lv の小さい空きスロットへ付ける。同じ Lv のスロットは、持ち主の順（`weapon`→`head`→`chest`→`arms`→`waist`→`legs`→`charm`）、次に添字の順に選ぶ。配置が存在するときこの手順は必ず成功し、付けたスロットの Lv の合計が最小になる（ILP の最適値と一致する）。
   - 付けられなかった装飾品が出たら、ILP と配置の不整合としてエラーを投げる（黙って捨てない）。
   - 発動スキル: 防具・武器・護石・付けた装飾品のスキルを合計して `rawLevel`、`maxLevel` で頭打ちして `level`。シリーズ／グループスキルは、部位数が閾値以上の最大の段のレベルを `level`・`rawLevel` の両方に入れる（部位数はレベルでないため）。レベル 0 のスキルは入れない。並びはマスターの `skills` の順。

### 列挙・状態・タイムアウト・キャンセル
9. 求解（`solveBuilds.ts`）:
   - 検証 → 列と行の組み立て → `highs.withModel(async (model) => …)`（Promise を返すと解決後にモデルを破棄する）。
   - 各求解の前に `await yieldControl()` し、続けて `isCancelled()` が真なら `SolveCancelledError` を投げ、`now()` の経過が `timeoutMs` 以上なら打ち切る。HiGHS の `time_limit` には残り時間（秒）を毎回設定する。
   - 求解の結果: 最適 → 構成を読み出して `onProgress(件数)` を呼び、得た防具（固定が `null` の部位を除く）と護石の変数の和 ≤ 個数 − 1 の行を足して次へ（001 と同じ）。選んだ変数が1つも無い（全部位が `null` 固定で護石の候補も空）ときは、他の組が無いので1件で終える。解なし → 終了。時間制限 → その求解の暫定解は捨てて打ち切る。それ以外の状態はエラーを投げる。
   - `maxResults` に達するか解なしで終了したとき: 1件以上なら `maximize` で `optimal`・`feasible` で `feasible`、0件なら `infeasible`。打ち切ったとき: 見つけた件数にかかわらず `timeout`（Q13・Q14）。
   - `elapsedMs` は `solveBuilds` の呼び出しから返すまで（検証と組み立てを含む）を `now()` で測る。
   - HiGHS の状態の判定には `highs.constants.modelStatus` の名前付きの値を使う（001 の数値の直書きをやめる）。
10. 1回の求解の途中では割り込めない（HiGHS の `run()` は同期）。キャンセルとタイムアウトの反応は、最悪で1回の求解の時間だけ遅れる（Q13 の前提）。

### Worker のメッセージハンドラ
11. `createWorkerHandler({ highs, post, now, yieldControl })` は `self` に触れず、受け取ったメッセージを処理して `post(WorkerOutbound)` を呼ぶ関数を返す（004 の Worker の起動スクリプトは `self.onmessage` からこれを呼び、`post` に `self.postMessage` を渡す）。状態（読み込んだマスター・実行中の要求）はこの関数の閉包に持つ。
   - `loadMaster`: マスターを保持し、`masterLoaded`（版）を送る。実行中の要求は、始めたときのマスターのまま続ける。
   - `solve`: マスターが未読込なら `error` を送る。実行中の要求があれば、それをキャンセル扱いにしてから新しい要求を始める（同時に処理する要求は1件。Q13）。構成を1件見つけるごとに `progress`、最後に `result` を送る。
   - `cancel`: 実行中の要求の `requestId` と一致すればキャンセル扱いにする。一致しなければ何もしない。
   - キャンセル扱いの要求は `SolveCancelledError` で終わり、`result` も `error` も送らない。`InvalidRequestError` はその `message` で `error` を送る。それ以外の例外も `error` を送る（画面が待ち続けないように。`message` で不正な要求と区別できる文言にする）。

### 001 のコードの扱い
12. 001 の `searchBuilds`・`types.ts` は 003 の関数と型で置き換え、削除する（handoff の区間メモ）。テストと測定も 003 の形に移す。
   - solver-agent は 003 の実装を新しいファイルに書き、001 の `searchBuilds.ts`・`types.ts` は残したまま `index.ts` の export からだけ外す（001 のテストは `../main/searchBuilds`・`../main/types` を直接 import しているので、テストを移すまで型検査とテストを通すため）。
   - solver-test-agent は 001 のテスト（`searchBuilds.spec.ts`）・測定ハーネス（`searchBuilds.measure.ts`）・合成データの生成器（`support/syntheticData.ts`・`support/random.ts`・`support/syntheticData.spec.ts`）を削除し、003 の形で書き直す。合成データは実データ（決定事項 13）で置き換える。`ciTiming.spec.ts` は内容を変えずに残し、引用する受入基準を 003 の 14 に直す。
   - テストが移った後に、solver-agent が `searchBuilds.ts`・`types.ts` を削除する。

### テストと測定
13. 実データは、テストの補助（`src/test/support/`）が `node:fs` で `packages/data/dist/` の `master-<版>.json`（辞書の `.ja.json`・`.en.json` を除く）を読む。ちょうど1つであることを確かめる。`@swv/data` の `exports` は型の入口だけで JSON を import できず、`packages/data/package.json` は変えない（handoff の区間メモ）。
14. 正しさのテストは、手作りの小さい `MasterBundle`（補助のビルダーで作る）で受入基準 1〜12 を受入基準ごとに確かめる。Worker のハンドラは、偽の `post`・`yieldControl`（Node の `setImmediate` を包む）・偽の時計で、メッセージの順と、キャンセル・別の `solve` での打ち切りを確かめる。
15. 検算（受入基準 13）は、ソルバーと独立に、返した構成の防具・武器・護石・装飾品からスキルのレベル（シリーズ／グループスキルの部位数と段を含む）を数え直し、装飾品の配置が種別と Lv を満たし、同じスロットに2つ付いていないこと、必須スキルの下限を満たすことを確かめる。手作りのデータと実データの両方の結果に掛ける。
16. 測定ハーネス（`src/test/**/*.measure.ts`。`pnpm --filter @swv/solver run measure` のときだけ実行し、CI では実行しない。001 と同じ）:
   - 実データの現行のマスター、武器は固定の1本（スキルを持たないマスターの武器）、護石なし、`maximize: defense`、`maxResults` 30、`timeoutMs` は打ち切りが起きない大きさ（60 秒）。
   - 必須スキルの組は実データから固定で選んで定数として書き、スキル名をコメントに添える。3／6／10 個 × 解あり／解なしの6ケースで、どのケースもシリーズ／グループスキルを1つ以上含む。解ありは1件以上・解なしは `infeasible` を返すことをハーネスが確かめる。解なしは、presolve や根ノードで自明に落ちないよう、組み合わせとしてだけ満たせない下限を選ぶ（例: 部位数の合計が5を超えるシリーズスキルの組。001 の限界 1 の再測定）。
   - HiGHS の初期化は `beforeAll` で行い時間に含めない。`now` には `performance.now`、`yieldControl` には `setImmediate` を包んだものを渡す。各ケース 3 回。検索1回の合計時間（`solveBuilds` の呼び出し全体）・求解の回数・1求解の時間・分枝のノード数と LP 反復数・合計時間の最大と 3 秒に対する合否・HiGHS の版・マスターの版を出力する（001 の決定事項 9 と同じ計り方。求解ごとの時間は `withModel` を包んで計り、`src/main` に計測用の引数を足さない）。
17. 測定の結果は、メインが `design/tech-stack.md` に新しい節「HiGHS の実データでの再測定（003 solver-engine）」として記録する（001 の節は残す）。3 秒を超えたら、メインが対策を `specs/open-questions.md` に新しい Q として起票し、003 はその記録をもって閉じる（Q16。対策の実装はスコープ外）。

### 常時許可外の変更を書く時期
18. `packages/solver/package.json`・`pnpm-lock.yaml` は委譲の前に書く（T1）。`design/tech-stack.md` は測定の後に書く（T8。測定ハーネスができるまで書けないため。`tasks/lessons.md` の「常時許可外の変更の中に、委譲の前には書けないものがある」と同じ扱い）。

## 常時許可外の変更
- `packages/solver/package.json`（dependencies に "@swv/data": "workspace:*" を追加。担当: メイン。理由: decisions.md Q17・決定事項 1）
- `pnpm-lock.yaml`（@swv/data の追加に伴う更新。担当: メイン。理由: 依存の追加）
- `design/tech-stack.md`（実データでの再測定の結果・合否・測定環境・HiGHS とマスターの版を新しい節に記録。担当: メイン。理由: 受入基準 14・decisions.md Q16。書く時期は決定事項 18）
