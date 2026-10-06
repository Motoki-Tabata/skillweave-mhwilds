# 004: solver-ui 計画

## スタック
- 既存（`design/tech-stack.md` の現行どおり。版の変更なし）: Node 24・TypeScript 6.0.3・Vue 3.5.43・Vue Router 5.3.1・Pinia 4.0.3・Vite 8.3.1・Tailwind CSS 4.3.3・Vitest 5.0.1・jsdom 30.1.1・@vue/test-utils 2.5.1・npm `highs` 1.15.3
- `apps/web` に足す依存（版は 2026-10-06 に npm で確認。公開から 7 日を経た最新。完全一致の版で書く）:

  | 依存 | 版 | 公開日 | 区分 | 用途 |
  |---|---|---|---|---|
  | `@swv/solver` | `workspace:*` | — | dependencies | ソルバー（`createWorkerHandler` と入出力の型） |
  | `@swv/data` | `workspace:*` | — | dependencies | マスターの型（`import type` だけ） |
  | `highs` | 1.15.3 | 2026-09-11 | dependencies | Worker で HiGHS を初期化する（`packages/solver` と同じ版） |
  | `reka-ui` | 2.10.5 | 2026-09-21 | dependencies | shadcn-vue の部品の土台。2.11.0 はクールダウン中 |
  | `class-variance-authority` | 0.7.1 | 2024-11-26 | dependencies | shadcn-vue の部品の variant |
  | `clsx` | 2.1.1 | 2024-04-23 | dependencies | `cn()` |
  | `tailwind-merge` | 3.7.0 | 2026-09-12 | dependencies | `cn()` |
  | `@vueuse/core` | 14.4.0 | 2026-07-29 | dependencies | shadcn-vue の部品が import する（`reka-ui` 2.10.5 の要求 `^14.1.0` に合わせる。15.0.0 は採らない） |
  | `tw-animate-css` | 1.4.0 | 2025-09-24 | dependencies | Dialog などの開閉のアニメーションのクラス |
  | `@lucide/vue` | 1.48.0 | 2026-09-24 | dependencies | アイコン（`lucide-vue-next` は deprecated。`.claude/rules/web-vue.md`）。1.49.0 以降はクールダウン中 |
  | `@playwright/test` | 1.63.0 | 2026-09-04 | devDependencies | e2e と測定（Chromium だけ。decisions.md Q24） |

- shadcn-vue の CLI は `shadcn-vue@2.8.2`（2026-08-08）を `pnpm dlx` で使う。依存には入れない。
- マスターデータ: `packages/data/dist/master-2026.10.2.json`・`.ja.json`・`.en.json`（決定事項 2 で版を上げて再生成する。MHDB のコミットは `c50a1eb` のまま）。

## データモデル
- テーブル: なし（API・DB を持たず、端末にも保存しない。decisions.md Q23。ゲート B-2 は該当なし）。
- マスターの JSON の形の変更（DB ではない）: `MasterArmor` に `rank: ArmorRank`（`'low' | 'high' | 'master'`）を足す（decisions.md Q21。決定事項 1）。

## 決定事項

### マスターデータ（packages/data）
1. 防具のランクをパイプラインで付ける（decisions.md Q21）。
   - `src/main/index.ts` に `export type ArmorRank = 'low' | 'high' | 'master'` を足し、`MasterArmor` に `rank: ArmorRank` を足す（必須の項目。`rarity` の次に置く）。
   - レア度とランクの対応表を `src/main/pipeline/config.ts`（人が書く設定）に持つ。現行は 1〜4 が `low`、5〜8 が `high`。`master` の対応は、アセンダンスのデータが MHDB に入ったときに対応表を直して決める。
   - 変換（`convert.ts`）で防具に `rank` を付ける。対応表に無いレア度の防具があれば、変換のエラー（`<防具ID>: レア度 <n> のランクが対応表にありません`）にして生成を失敗させ、`dist/` に何も書かない（既存の変換のエラーと同じ経路）。
   - 検証（`validate.ts`）でも、すべての防具の `rank` が3つの値のどれかであることを確かめる（`dist.spec.ts` がコミット済みの `dist/` に検証の関数を掛けるので、手で直した `dist/` も検出できる）。
   - 規則は `design/master-data.md` の「5. 変換の規則」に足す（決定事項 21 の T1）。
2. マスターの版を `2026.10.2` に上げる（`config.ts` の `MASTER_VERSION`）。`dist/` の再生成は生成物なのでワーカーの書込許可に無く、メインが `pnpm --filter @swv/data run generate` で行う（tasks T4）。生成のコマンドが `2026.10.1` の3ファイルを削除する。再生成の後、`pnpm --filter @swv/data run generate:check` が一致を返すことを確かめる。
3. `MasterArmor` の必須の項目が増えるので、`packages/solver/src/test/support/builders.ts` の `armor()` に `rank` を足す（既定は `'high'`。引数で変えられるようにする）。`packages/solver` の型検査（`tsconfig.vitest.json`）が落ちるため、data の実装の直後に直す（tasks T5）。ソルバーの本体（`src/main`）は `rank` を読まず、変更しない（ランクの絞り込みは呼び出し側の除外の指定で行う。Q21）。

### マスターの配信とクレジット（apps/web の構成ファイル。メインが書く）
4. マスターと辞書は、`apps/web/vite.config.ts` の `publicDir` を `packages/data/dist/` にして、同一オリジンの静的ファイルとして配信する（開発サーバー・`vite preview`・ビルドの出力のどれでも `/<ファイル名>` で取れる）。`apps/web/public/` は現在無いので衝突しない。en の辞書も配信されるが、画面は読まない（Q4）。
   - 採らなかった案: Vite のプラグインでファイルを選んで出力する案。プラグインのコードがメイン専有の構成ファイルに増える。`publicDir` で足りる間は採らない（`apps/web/public/` が要る機能が来たら見直す）。
5. マスターの版と取得元（クレジット）は、`vite.config.ts` が設定の評価時に `packages/data/dist/` の `master-<版>.json`（辞書を除く）を1つだけ読み、`define` で `__SWV_MASTER__`（`{ version: string; source: { repository: string; commit: string } }`）として埋め込む。ちょうど1つでなければ設定の評価で例外にする。型の宣言は `apps/web/env.d.ts` に置く。
   - クレジットのバーは `__SWV_MASTER__.source` を読むので、マスターの取得の前・失敗の後も表示できる（screen-design.md 2.2）。
   - 画面はマスターを `${import.meta.env.BASE_URL}master-${__SWV_MASTER__.version}.json`、辞書を `….ja.json` から取る。
   - Vitest は `vite.config.ts` を取り込むので、単体テストでも `__SWV_MASTER__` が定義される。
6. Worker は ES モジュールで出力する（`vite.config.ts` に `worker: { format: 'es' }`）。`highs` の ESM ビルドは Node 向けの分岐に動的 import を持ち、既定の `iife` ではビルドできないため。
7. `apps/web/tsconfig.app.json` と `apps/web/tsconfig.vitest.json` の `include` に `../../packages/solver/src/main/**/*.ts` と `../../packages/data/src/main/index.ts` を足す。`packages/*` は TypeScript のソースを公開しており（`design/tech-stack.md` 主な判断 5）、composite の project references では、取り込んだソースが `include` に無いと TS6307 で落ちるため（2026-10-06 に一時ファイルで再現し、`include` を足すと app 側が通ることを確認した）。
8. ページのタイトルは `apps/web/index.html` の `<title>` を「装備検索 | SkillWeave」にする（画面は1つなので、ルーターでタイトルを切り替える仕組みは作らない）。

### 画面の実装（apps/web/src/main。web-agent）
9. ファイルの置き場（目安）。
   - `App.vue`: 共通レイアウト C1（ヘッダー・クレジットのバー・トーストの置き場）と `RouterView`。読込の状態に関わらず常に描画する。
   - `components/common/`: `AppHeader.vue`・`CreditBar.vue`・トースト（Reka UI の Toast の部品を組み合わせて作る。shadcn-vue の `sonner` は `vue-sonner` の依存が増えるので使わない）。
   - `views/SearchView.vue`: S1。`HomeView.vue` は削除し、ルート `/` を `SearchView` に向ける。
   - `components/search/`: S1・D1・D2 の部品（武器のカード・武器のダイアログ・必須スキルのカード・スキルのダイアログ・検索条件のカード・検索操作・結果パネル・構成カードなど）。
   - `stores/`: 読み込みの状態（P1〜P3）と検索の状態（Q0〜Q7）を Pinia のストアに持つ。分け方は web-agent が決める。
   - `lib/solver/`: Worker との通信（決定事項 11）と、検索条件から `SolverRequest` への変換（決定事項 12）。DOM と Vue に依存しない関数にして、単体テストで直接呼べるようにする。
   - `workers/solver.worker.ts`: Worker の入口（決定事項 10）。
   - `constants/`: 表示名と検索の定数（決定事項 13）。
   - `components/ui/`: shadcn-vue の CLI でメインがコピーする（決定事項 20）。web-agent は書かない。
10. Worker の入口（`workers/solver.worker.ts`）。
    - `import highsLoader from 'highs'` と `import highsWasmUrl from 'highs/runtime?url'` で、`highsLoader({ locateFile: () => highsWasmUrl })` を起動時に1回呼ぶ。HiGHS の `new URL('highs.wasm', import.meta.url)` に頼らない（依存の事前バンドルで URL が変わりうるため）。
    - メッセージは HiGHS の初期化を待ってから `createWorkerHandler`（`@swv/solver`）に渡す。`deps` は `post`＝`postMessage`、`now`＝`performance.now`、`yieldControl`＝`setTimeout(…, 0)` を包んだ Promise（003 plan 決定事項 3）。
    - HiGHS の初期化に失敗したら、`{ type: 'initFailed'; message: string }` を送る。この型は web の型として、`WorkerOutbound` に足した union（例: `SolverWorkerOutbound`）で持つ（`packages/solver` は変えない）。
    - `tsconfig.app.json` は DOM の型なので、`self` は必要な最小のインターフェース（`postMessage`・`onmessage`）に型を付けて使う。`/// <reference lib="webworker" />` は DOM の型と衝突するので使わない。
11. Worker との通信（`lib/solver/`）。
    - Worker の生成を引数で受け取る（`new Worker(new URL('../workers/solver.worker.ts', import.meta.url), { type: 'module' })` を既定にする）。単体テストは偽の Worker を渡す（jsdom に Worker は無い）。
    - 読み込み: マスターと ja の辞書を `lib/http.ts` の `http.get` で取り、Worker に `loadMaster` を1回だけ送り、`masterLoaded` で準備完了（P3）にする。失敗の原因は、マスターの取得・辞書の取得・HiGHS の初期化（`initFailed`）・それ以外（Worker の異常終了を含む）の4つに分け、screen-design.md 3.3 の文言を出す。「再読み込み」は Worker を作り直し、取得からやり直す。
    - 検索: `requestId` は `crypto.randomUUID()` で振る（ユーザーデータではないので UUIDv7 にしない）。現在の `requestId` と違う `progress`・`result`・`error` は捨てる。やり直しは新しい `solve` を送るだけでよい（`createWorkerHandler` が実行中の要求を打ち切る）。キャンセルは `cancel` を送り、すぐに Q0 に戻してトーストを出す。
    - Worker が検索中に異常終了（`error` のイベント）したら Q6「検索を実行するプログラムが停止しました。」にし、その Worker を終了させる。次の検索の前に Worker を作り直し、取得済みのマスターを `loadMaster` で渡し直す（マスターと辞書は取り直さない）。
12. 検索条件から `SolverRequest` への変換（純粋関数）。
    - `masterVersion` は取得したマスターの `version`、`weapon` は `{ kind: 'master', weaponId }`、`charms` は `[]`、`required` は必須スキルと下限、`fixedArmor` は付けない。
    - `excludedArmorIds` は、選ばれていないランクの防具の ID の全部（Q21）。全ランクを選んだときは空にする。
    - `objective`: 「条件を満たす構成」→ `{ kind: 'feasible' }`、「防御力の最大化」→ `{ kind: 'maximize', metric: 'defense' }`、「空きスロットの最大化」→ `{ kind: 'maximize', metric: 'freeSlots' }`。
    - `maxResults` は件数（1〜30）、`timeoutMs` は決定事項 13 の定数。
13. 定数（`constants/`。Q25）。
    - 武器種: MHDB の `kind` の14種（`great-sword`・`long-sword`・`sword-shield`・`dual-blades`・`hammer`・`hunting-horn`・`lance`・`gunlance`・`switch-axe`・`charge-blade`・`insect-glaive`・`light-bowgun`・`heavy-bowgun`・`bow`）ごとに、正式名・短い表示名（D1 のボタン用）・並び順。
    - 部位（頭・胴・腕・腰・脚）とスロットの持ち主（武器・護石を足す）、ランク（下位・上位・マスター。並び順を持ち、「最も高いランク」の判定に使う）、スキルの種類（武器・防具・シリーズ・グループ。この順）の表示名。
    - 目的の3つのラベルと補助文、件数の範囲（1〜30）と既定（10）、D1 の表示の上限（50 件）、読込中のスケルトンを出すまでの時間（300 ms）。
    - 検索の時間の上限 `timeoutMs` は 30 秒（30000）。画面に入力欄を持たない。既定の件数（10）での測定（Node）は 0.3 秒程度で、30 件でも 7.7 秒以下なので、通常の検索で打ち切りが起きない値にする。Q4・Q5 の文言に秒数は入れない（screen-design.md の文言のまま）。
14. 一覧の並びと絞り込み。
    - D2 のスキルは、種類のタブの中で ja の名前を `Intl.Collator('ja').compare` で並べる。D1 の武器はマスターの並び（`weapons` の順）のまま。
    - 名前の部分一致は、入力と名前の両方を `normalize('NFKC')` と `toLowerCase()` にかけてから `includes` で比べる。
    - 武器種のボタンとランクのチェックボックスは、マスターに含まれる値だけを、定数の並び順で出す。
    - 辞書に名前が無い ID は、ID の文字列をそのまま出す（検証で辞書の欠けは0件のはずだが、画面を壊さないため）。
15. 画面の文言・状態・幅・キーボード操作は `specs/004-solver-ui/screen-design.md` に従う。色・文字・密度の数値とトークン（`--primary`・`--warning`・`--destructive` など）は `design/ui-design-standard.md` を正とし、`assets/main.css` の `@theme`・`:root` に書く（`@import 'tw-animate-css'` もここ）。表の見出しは `<thead><tr><th scope="col">` で書く（`.claude/rules/web-vue.md`）。

### テスト（web 単体・e2e・測定）
16. web の単体テスト（web-test-agent。`apps/web/src/test/<main と同じ相対パス>/`）。
    - `lib/solver/` の変換（ランクの除外・`charms` が空・目的の対応・件数と `timeoutMs`）と通信（偽の Worker で、`loadMaster` が1回だけ・`requestId` の違う応答を捨てる・やり直しとキャンセルで前の結果と進捗を出さない・`initFailed` と異常終了の扱い）。
    - 定数が、`packages/data/dist/` の現行のマスターに含まれる武器種・ランク・スキルの種類をすべて覆うこと（テストから `node:fs` で `dist/` を読む。`tsconfig.vitest.json` は `types: ["node"]`）。
    - 画面: 共通レイアウト（バッジとクレジットが読込前・読込失敗でも出る・`©CAPCOM` が無い）、P1〜P3、武器の絞り込みと 50 件の上限、スキルの追加・削除・下限の範囲・種類ごとのまとまり、件数の丸め、ランクの既定と0個のエラー、検索できない理由とボタンの無効、Q0〜Q7 の表示、構成カードの表示項目。
    - ダイアログと Select のテストは `.claude/rules/web-vue.md` の後始末とタイムアウトの節に従う。
17. e2e（e2e-agent。`apps/web/e2e/*.spec.ts`、補助は `apps/web/e2e/support/`）。
    - ビルドした web を `vite preview` で起動し、API・DB は起動しない（Q24）。実際のマスターと HiGHS を使う。
    - 要素はロール・ラベル・見出しの文言（screen-design.md）で探す。テスト用の ID（`data-testid`）は足さない。
    - 検証する流れ: (a) 武器を選び、必須スキルを追加して検索し、構成カードが表示される（必須スキルの組は、既定の条件〈候補のランクは上位だけ〉で解があるものを、e2e-agent が実データで確かめて選ぶ）。(b) 解なしの表示（シリーズスキル2つで6部位以上を要する組。例: 火竜の力 Lv2 と 闢獣の力 Lv2。003 の実データのテストと同じ組で、ランクに関係なく解が無い）。(c) ヘッダーの二次創作のバッジとクレジットのバーが表示される。
    - 武器・スキルの名前は、テストから `node:fs` で `packages/data/dist/` の ja の辞書を読んで決め、名前を直書きしない（版が上がっても追従できるように）。
18. 測定（e2e-agent が `apps/web/e2e/measure/*.measure.ts` に書き、`pnpm --filter @swv/web run measure` で実行する。CI では実行しない。Q20）。
    - ブラウザ（Chromium）で画面を操作し、「検索」を押してから結果（見出し「<N> 件の構成が見つかりました」または解なしの Alert）が表示されるまでの時間を測る。HiGHS の初期化とマスターの読み込みは含めない。
    - 条件は 003 の測定（`packages/solver/src/test/solveBuilds.measure.ts`）に合わせる: スキルを持たないマスターの先頭の武器、必須スキル 3／6／10 個 × 解あり／解なしの6ケース（003 と同じスキルと下限）、目的は「防御力の最大化」、候補のランクは「下位」「上位」の両方（003 と同じ候補）。件数だけを既定の 10 にする（Q20 の読み替え）。
    - 各ケースを3回。各回の時間・状態（件数または解なし）と、全ケース・全回の最大、3 秒の基準に対する合否、ブラウザの版、マスターの版を出力する。時間は検査（assert）しない。状態が 003 の期待（解あり／解なし）と違えば失敗にする。
    - 結果はメインが `design/tech-stack.md` に記録する（決定事項 21 の T11）。

### 構成・CI（メインが書く）
19. Playwright と e2e の配線。
    - `apps/web/playwright.config.ts`（新規）: `testDir: './e2e'`。プロジェクトを2つ持つ: `e2e`（`testMatch: '**/*.spec.ts'`）と `measure`（`testMatch: '**/*.measure.ts'`）。どちらも Chromium（`devices['Desktop Chrome']`）。`baseURL` は `http://localhost:4173`。`webServer` は `pnpm run build && pnpm run preview --port 4173 --strictPort`（`reuseExistingServer: !process.env.CI`）。CI では `forbidOnly`。`retries` は 0（flake を隠さない）。`trace: 'retain-on-failure'`。
    - `apps/web/package.json` の scripts: `test:e2e` は `playwright test --project=e2e`、`measure` は `playwright test --project=measure`。`format`・`format:check` の対象に `e2e/` を足す（`prettier --write src/ e2e/`・`prettier --check src/ e2e/`）。
    - `apps/web/tsconfig.e2e.json`（新規）: `@tsconfig/node24` を継承し、`include` は `e2e/**/*.ts` と `playwright.config.ts`、`types: ["node"]`・`composite: true`・`noEmit: true`・`module: ESNext`・`moduleResolution: Bundler`。`apps/web/tsconfig.json` の `references` に足す（`type-check` と `build` の `vue-tsc --build` が e2e も型検査する）。
    - `.gitignore` は Playwright の出力（`apps/web/test-results/`・`playwright-report/`・`blob-report/`）を既に含むので変えない。
    - Sonar の解析対象（`sonar-project.properties`）は変えない（`apps/web/e2e/` は `sonar.sources`・`sonar.tests` のどちらにも入れない）。
20. shadcn-vue の部品は、メインがリポジトリ直下で依存を完全一致の版で足した後に、`apps/web` で `pnpm dlx shadcn-vue@2.8.2 add alert badge button card checkbox dialog input label number-field progress radio-group select skeleton tabs` を実行してコピーする（`.claude/rules/ui-design.md`）。
    - CLI の後に `apps/web/package.json` と `pnpm-lock.yaml` の差分を確かめ、CLI が足した・上げた依存があれば、上の表の版に戻す（表に無い依存が要るなら停止してユーザーに提示する）。コピーした部品の `lucide-vue-next` の import は `@lucide/vue` に書き換える。CLI が `src/main/lib/utils.ts`（`cn()`）を作らなければ、web-agent が作る。
    - 表（`table`）とトースト（`toast`・`sonner`）はコピーしない（決定事項 9・15）。
21. 常時許可外の変更を書く時期。
    - 委譲の前（T1・T2）: 依存と構成ファイル（決定事項 4〜8・19・20）、`.github/workflows/ci.yml` の e2e ジョブ、`README.md` の「残作業」の e2e の行の削除、`design/master-data.md` のランクの規則、`design/tech-stack.md` の依存の表（導入した依存を「後の機能で導入するもの」から本表に移す。「CI」節の e2e の記述も直す）。
    - data-agent の後（T4）: `packages/data/dist/` の再生成。
    - e2e-agent の後（T11）: `pnpm --filter @swv/web run measure` を実行し、`design/tech-stack.md` に「HiGHS のブラウザの Worker での測定（004 solver-ui）」の節を足す（条件・ケースごとの時間・最大・合否・測定環境・ブラウザ・HiGHS・マスターの版）。測定の対象（e2e-agent の成果）ができるまで書けないため（`tasks/lessons.md` 2026-10-04「常時許可外の変更の中に、委譲の前には書けないものがある」と同じ扱い）。
22. CI の e2e ジョブ（`.github/workflows/ci.yml`）: ジョブ名 `e2e`、`timeout-minutes: 15`。web のジョブと同じ checkout・pnpm・Node・`pnpm install --frozen-lockfile` の後、`pnpm --filter @swv/web exec playwright install --with-deps chromium` と `pnpm --filter @swv/web run test:e2e` を実行する（ビルドは Playwright の `webServer` が行う）。測定は実行しない。報告書のアップロードは足さない（アクションを増やさない）。既存の「e2e ジョブは…追加する」のコメントは消す。
23. `ci.yml` と `README.md` は「常に人間の明示指示を要するもの」（`.claude/skills/tsod-workflow/references/direct-edit.md`）に当たる。spec の「常時許可外の変更予定」に挙がっており、ゲート C-1 の承認をその明示指示として扱い、区間 D でメインが書く。PR 本文に記載する。

### 進め方の注意
24. 一括検証（`verify.mjs --e2e`）の e2e の段は docker と API を起動してから `test:e2e` を実行する（`tasks/lessons.md` 2026-10-06 に起票済み。canon の改修待ち）。004 の e2e は API を使わないので結果には影響しないが、区間 D の一括検証には docker と Java が要る。
25. 依存の追加で `ERR_PNPM_TRUST_DOWNGRADE` が出たら、`.claude/rules/pnpm-workspace.md` の手順で確かめ、`pnpm-workspace.yaml` の変更が要るならメインも書かずにユーザーに提示する。
26. 並列にしない。今回のタスクはすべて pnpm workspace を検証する役割なので、`tsod-build/SKILL.md`「委譲」の条件により直列にする。

## 常時許可外の変更
- `apps/web/package.json`（dependencies に @swv/solver・@swv/data・highs・reka-ui・class-variance-authority・clsx・tailwind-merge・@vueuse/core・tw-animate-css・@lucide/vue を、devDependencies に @playwright/test を完全一致の版で追加。scripts に test:e2e・measure を足し、format・format:check に e2e/ を足す。担当: メイン。時期: T1。理由: スタック・決定事項 19）
- `pnpm-lock.yaml`（上記の依存の追加に伴う更新。担当: メイン。時期: T1。理由: 依存の追加）
- `apps/web/vite.config.ts`（publicDir を packages/data/dist に、define で __SWV_MASTER__ を、worker.format を es に。担当: メイン。時期: T1。理由: 決定事項 4〜6）
- `apps/web/env.d.ts`（__SWV_MASTER__ の型の宣言を足す。担当: メイン。時期: T1。理由: 決定事項 5）
- `apps/web/index.html`（title を「装備検索 | SkillWeave」にする。担当: メイン。時期: T1。理由: 決定事項 8・screen-design.md 3.7）
- `apps/web/tsconfig.json`（references に tsconfig.e2e.json を足す。担当: メイン。時期: T1。理由: 決定事項 19）
- `apps/web/tsconfig.app.json`（include に packages/solver と packages/data の公開するソースを足す。担当: メイン。時期: T1。理由: 決定事項 7）
- `apps/web/tsconfig.vitest.json`（include に同上を足す。担当: メイン。時期: T1。理由: 決定事項 7）
- `apps/web/tsconfig.e2e.json`（新規。e2e と playwright.config.ts の型検査。担当: メイン。時期: T1。理由: 決定事項 19）
- `apps/web/playwright.config.ts`（新規。e2e と測定の2プロジェクト。担当: メイン。時期: T1。理由: 決定事項 19）
- `apps/web/src/main/components/ui/`（新規。shadcn-vue の CLI で部品をコピーし、アイコンの import を @lucide/vue に書き換える。担当: メイン。時期: T2。理由: 決定事項 20・`.claude/rules/ui-design.md`）
- `.github/workflows/ci.yml`（e2e ジョブを足す。担当: メイン。時期: T1。理由: 受入基準 13・決定事項 22・23）
- `README.md`（「残作業」節の e2e ジョブの行を消す。担当: メイン。時期: T1。理由: 受入基準 13・決定事項 23）
- `design/tech-stack.md`（導入した依存の版を T1 で、Worker 上の測定の結果を T11 で記録する。担当: メイン。理由: 受入基準 14・決定事項 21）
- `design/master-data.md`（防具のランクとレア度の対応表の規則を足す。担当: メイン。時期: T1。理由: 受入基準 12・決定事項 1）
- `packages/data/dist/master-2026.10.2.json`（生成物。生成のコマンドで書く。担当: メイン。時期: T4。理由: 決定事項 2）
- `packages/data/dist/master-2026.10.2.ja.json`（同上の ja の辞書。担当: メイン。時期: T4。理由: 決定事項 2）
- `packages/data/dist/master-2026.10.2.en.json`（同上の en の辞書。担当: メイン。時期: T4。理由: 決定事項 2）
- `packages/data/dist/master-2026.10.1.json`（旧版。生成のコマンドが削除する。担当: メイン。時期: T4。理由: 決定事項 2）
- `packages/data/dist/master-2026.10.1.ja.json`（旧版の ja の辞書。同上。担当: メイン。時期: T4）
- `packages/data/dist/master-2026.10.1.en.json`（旧版の en の辞書。同上。担当: メイン。時期: T4）
