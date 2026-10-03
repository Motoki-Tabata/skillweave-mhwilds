# 001: solver-spike 計画

## スタック
- Node 24・TypeScript 6.0.3・Vitest 5.0.1（`design/tech-stack.md` の現行どおり。版の変更なし）
- HiGHS の WASM 版: npm `highs` 1.15.3（2026-09-11 公開でクールダウンを満たす。MIT。peer 依存なし）。`packages/solver` の `dependencies` に完全一致の版で足す（他パッケージの直接依存と同じ書き方）
- `@types/node`: `catalog:`（24.13.6）を `packages/solver` の `devDependencies` に足す。テストと測定だけが使う（下の決定事項 7）

## データモデル
なし

## 決定事項

### 公開 API と型
1. 公開する関数は `searchBuilds(highs, input)` の1つにする。HiGHS の初期化済みのインスタンス（`highs` の型 `Highs`）を引数で受け取り、`src/main` では `highsLoader()` を呼ばない。`highs` からは `import type` だけをする。理由: WASM の読み込み方は Node・Worker・バンドラで違い、それに依存すると `src/main` が DOM・Node の API に触れる。また受入基準 9 の「初期化を時間に含めない」を、呼び出し側で初期化することで自然に満たせる。
2. 型は `temp/solver-types.ts` から、001 で使うものだけを `src/main` へ移す: `Brand`・`SkillId`・`ArmorId`・`DecorationId`・`Uuid`・`ArmorPart`・`SlotLevel`・`SlotTarget`・`Slot`・`SkillLevel`・`SolverStatus`。防具・装飾品・護石は、元の型（`MasterArmor`・`MasterDecoration`・`SolverCharm`）から 001 で使う欄だけを持つ型にする。
   - 防具: `id`・`part`・`slots`・`skills`・`defense`（候補は部位の欄を持つ平らな配列で受け取る。`MasterBundle.armors` からそのまま渡せる形にするため）
   - 装飾品: `id`・`target`・`slotLevel`・`skills`
   - 護石: `id`・`slots`・`skills`
   - 武器: `slots`・`skills` だけを直接受け取る（`SolverWeapon` のマスター参照は 003。001 にはマスターの照合が無いため）
3. 入力は `required`（必須スキル）・`armors`・`charms`・`weapon`・`decorations`・`maxResults`（既定 30）。出力は `status`（`'optimal'`／`'infeasible'`）と `builds`（見つかった順。各要素は部位ごとの防具 ID・護石 ID（候補が空なら `null`）・装飾品 ID ごとの個数・防御力の合計）。部位のどれかの候補が空なら `infeasible` を返す。

### 定式化（ILP）
4. 変数と制約:
   - 変数: 防具ごとの 0/1（x）、護石ごとの 0/1（y）、装飾品ごとの個数（非負整数 n）。必須スキルを1つも持たない装飾品は変数にしない（目的関数にも制約にも効かず、結果が変わらないため）。
   - 部位ごとに Σx = 1。護石は候補があれば Σy = 1。
   - 必須スキルごとに: 武器のレベル + Σ(防具のレベル × x) + Σ(護石のレベル × y) + Σ(装飾品のレベル × n) ≥ 下限。
   - スロット: 種別 t（武器用・防具用）とレベル L ごとに、「種別 t で slotLevel ≥ L の装飾品の個数の和 ≤ 種別 t で Lv ≥ L のスロットの数」。武器のスロットは定数、防具と護石のスロットは x・y の係数になる。護石のスロットの種別は `Slot.target` に従う。小さい装飾品は大きいスロットに入るので、この入れ子の不等式が、具体的な配置が存在することの必要十分条件になる（配置そのものは 003 の後処理）。
   - 目的: Σ(防御力 × x) の最大化。
5. 列挙: 解を得たら、その解で 1 になった防具5つと護石（あれば）の変数の和 ≤（その個数 − 1）の行を足して解き直す。30 件に達するか解が尽きる（infeasible）まで繰り返す。返す装飾品の個数は、解の値を最も近い整数に丸めたもの。
6. HiGHS の呼び出しは、永続 API（`highs.withModel` で作ったモデルに `passModel` で構造データを渡し、`run` で解き、除外の行を `addRow` で足して `run` し直す）を使う。LP 形式のテキスト（`highs.solve(string)`）は使わない。理由: ID の文字種が LP 形式の名前に使えない文字（`:` 等）を含み、文字列の組み立てと解析を挟むと、除外の行を足すたびにモデル全体を作り直すことになるため。変数と行は添字で管理し、ID への対応は呼び出し側の配列で持つ。「1回の求解」は `run()` の1回を指す。

### テストと測定
7. 型検査を2本に分ける。`packages/solver/tsconfig.json` は `include` を `src/main/**` に絞り、`lib: ["ES2024"]`・`types: []` のまま残す（`src/main` が DOM・Node の型に触れたら落ちる仕組みは変えない）。新しい `packages/solver/tsconfig.vitest.json` は `tsconfig.json` を継承し、`include` に `src/main/**`・`src/test/**`、`types: ["node"]` を持つ。`type-check` script は両方を順に実行する。理由: 現行の `types: []` のもとでは、テストからも `performance`・`console` が型エラーになる（2026-10-04 に一時ファイルで確認）。測定ハーネスは時間の計測と出力にこれらが要る。`apps/web` の `tsconfig.vitest.json` と同じ分け方にそろえる。
8. 測定は通常のテスト実行から分ける。`vitest.config.ts` を mode で切り替え、既定（`test:unit`・`test:coverage`。CI が実行する）は `src/test/**/*.spec.ts` だけ、`--mode measure` のときだけ `src/test/**/*.measure.ts` を対象にして `testTimeout` を延ばす。`package.json` に `"measure": "vitest run --mode measure"` を足す。`*.spec.ts` では時間を検査しない。測定は検証コマンドではないので、`CLAUDE.md` の Commands には載せない。
9. 計時: HiGHS の初期化（`highsLoader()`）は測定ハーネスの `beforeAll` で行い、時間に含めない。検索1回の合計時間は `searchBuilds` の呼び出し全体（モデルの組み立てを含む）。1回の求解ごとの時間は、ハーネスが注入する `Highs` を包み、`withModel` が渡すモデルの `run()` ごとに計る（`src/main` の API に計測用の引数を足さない）。各ケースを 3 回計ってすべて出力し、合否は全ケース・全回の合計時間の最大で判定する。出力には HiGHS の版（`highs.version`）を含める。
10. 合成データの生成器は、シード付きの擬似乱数を `src/test` に自前で書く（依存を足さない）。件数・スロット・スキルの分布は decisions.md Q2 の値に合わせ、出典（`wilds.mhdb.io/en/*`・2026-10-03 取得）をコードのコメントに書く。
    - 解ありのケース: 生成したデータから構成を1つ無作為に選び、その発動スキルから必須スキル（3／6／10 個）と下限を取る（解の存在を構成で保証する）。
    - 解なしのケース: 必須スキルのどれもが単独では到達できる下限にし、組み合わせとして満たせないものにする（単独で到達できない下限は presolve ですぐに判定され、重いケースを測れないため）。ハーネスは、解なしのケースが `infeasible` を返したことを確かめる。
11. 検算（受入基準 7）は、ソルバーと独立に、返した構成の防具・護石・武器・装飾品から必須スキルのレベルを数え直し、装飾品を大きい順に、入る中で最も小さい空きスロットへ割り当てて配置できることを確かめる。

### 条件付きの作業（測定の結果で決まる）
12. 縮約は、合計時間の最大が 3 秒を超えたときだけ足す。定義: 部位ごとに、必須スキルを1つも持たない防具を「スロットの構成（種別 × Lv の多重集合）」で組に分け、各組で防御力が最大の1つだけを候補に残す。`searchBuilds` の前に掛ける純粋関数として `src/main` に置き、測定では縮約の時間も合計時間に含める。縮約の前後の両方を測って記録する。
13. 縮約を加えても 3 秒を超えたら、メインが代替（別の ILP ライブラリ・自前の探索）の選定を `specs/open-questions.md` に新しい Q として起票し、`design/tech-stack.md` に「不合格」と記録して 001 を閉じる（区間 D・E は通常どおり進め、書いたコードは残す）。

### 常時許可外の変更を書く時期
14. 下の「常時許可外の変更」は、原則どおり委譲の前にメインが書く。ただし次の2つは、後続の成果がないと書けないので、委譲の後に書く。
    - `packages/solver/vitest.config.ts` の `passWithNoTests` の削除: solver-test-agent がテストを書いた後（T6）。先に外すと、solver-agent の検証（`test:unit`）がテスト0件で落ちるため。mode の切り替えは委譲の前に書く。
    - `design/tech-stack.md`: 測定の後（T7・T10）。

## 常時許可外の変更
- `packages/solver/package.json`（dependencies に highs 1.15.3、devDependencies に @types/node を catalog: で追加。scripts に measure を足し、type-check を2本の tsc にする。担当: メイン。理由: 決定事項 1・7・8）
- `pnpm-lock.yaml`（highs・@types/node の追加に伴う更新。担当: メイン。理由: 依存の追加）
- `packages/solver/vitest.config.ts`（mode で通常のテストと測定を分ける。passWithNoTests は T6 で外す。担当: メイン。理由: 決定事項 8・14）
- `packages/solver/tsconfig.json`（include を src/main/** に絞る。lib と types は変えない。担当: メイン。理由: 決定事項 7）
- `packages/solver/tsconfig.vitest.json`（新規。テストと測定の型検査に Node の型を与える。担当: メイン。理由: 決定事項 7）
- `sonar-project.properties`（sonar.typescript.tsconfigPaths に packages/solver/tsconfig.vitest.json を足す。人間の明示指示が要るファイルなので、ゲート C-1 で明示の承認があったときだけメインが書く。担当: メイン。理由: テストのファイルを tsconfig.json から外すため、Sonar がテストの型情報を引けるようにする）
- `design/tech-stack.md`（測定結果・合否・測定環境・HiGHS の版と採否を記録し、highs と @types/node を packages の表へ移す。担当: メイン。理由: 受入基準 10・11。書く時期は決定事項 14）
