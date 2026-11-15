# 017: reverse-lookup 計画

## スタック
- packages: TypeScript・Vitest・npm `highs`。Web: Vue 3・Pinia・reka-ui・Vitest・@playwright/test（Chromium）。版はすべて `design/tech-stack.md` の現行どおりで、依存は足さない。
- 追加する ui 部品は無い（screen-design.md 0。既存の `button`・`card`・`ResultAlert`・reka-ui の `Progress` で足りる）。`Select` を使う新規 `.vue` は無いので、`sonar-project.properties` の抑止の追記は要らない。
- マスターデータ: `packages/data/dist/master-2026.11.1.*`（変更なし）。抽選テーブルはレア5〜8 の 29 パターン（レア5: 6・レア6: 7・レア7: 8・レア8: 8）、グループ A〜J の 10 件。パターンとスロットの並びの組は 100、相異なるスロットの並びは 8、グループの中のスキルの Lv は最大 4。

## データモデル
なし

## 決定事項

### ソルバーの入口と型（AC-1・AC-10・Q168）
- D1: 逆引きは `packages/solver/src/main/reverseLookup.ts` の新しい関数 `reverseLookup(highs, master, request, options)` にし、型も同じファイルに置いて `src/main/index.ts` から出す。通常の検索の `SolverRequest`・`SolverResponse`・`solveBuilds` は変えない（AC-12）。
  - `ReverseLookupRequest`: `masterVersion`・`weapon`（`SolverWeapon`）・`required`・`fixedArmor?`・`excludedArmorIds?`・`excludedDecorationIds?`・`maxResults`・`timeoutMs`。`charms`・`objective`・`activeConditionIds` は持たない（登録した護石と目的関数を使わない。AC-1）。
  - `VirtualCharm`: `rarity: number`・`skills: (SkillLevel | null)[]`・`slots: Slot[]`。`skills` はパターンの枠の順で、グループが `null` の枠（枠なし）を除いた長さ。`null` は「任意」の枠（AC-4）。
  - `ReverseLookupCandidate`: `charm: VirtualCharm`・`build: SolvedBuild`。`build.charmId` は `null` にし、`decorations`・`freeSlots` の `owner: 'charm'` の `index` は `charm.slots` の添字を指す（JSDoc に書く）。
  - `ReverseLookupResponse`: `status: 'feasible' | 'infeasible' | 'timeout'`・`candidates`・`elapsedMs`。
  - `ReverseLookupOptions`: `SolveOptions` の `onProgress` を `(found: number, candidate: ReverseLookupCandidate) => void` に替えたもの。
- D2: 要求の検査は、`charms: []`・`objective: { kind: 'feasible' }` を足した内部の `SolverRequest` で既存の `validateRequest` を通す。加えて、`master.appraisedCharm.patterns` が空なら `InvalidRequestError`（抽選テーブルが無い）を投げる。テーブルの無いレア度はパターンが無いので、候補に入らない（AC-8。レア度での絞り込みの処理は持たない）。

### モデル（AC-2・AC-3・AC-10）
- D3: `model.ts` の `buildModel` に、抽選テーブルを渡す省略可の引数を足す。渡さないとき（通常の検索）の列・行・係数は今と同じにする（AC-12。既存のテストが変わらず通ることで示す）。渡したときは、護石 y の列の後ろ（0/1 の範囲）に次の列を足す。
  - パターンとスロットの並びの列 v[k,j]: パターン k の `slotPatterns[j]` を選ぶ（現行のマスターで 100 列）。
  - 枠のスキルの列 u[k,i,s]: パターン k の i 番目の枠（グループが `null` でない枠）に、必須スキルのうち通常のスキル s を入れる。s がその枠のグループに無ければ列を作らない。レベルはグループに書かれたレベル。必須でないスキルは列にしない（選ばない枠は「任意」）。
  - 行: Σ v = 1（護石はちょうど 1 つ）。パターン k・枠 i ごとに Σ_s u[k,i,s] − Σ_j v[k,j] ≤ 0（選んだパターンの枠にだけ、1 枠 1 スキル）。必須スキル s ごとに Σ_{k,i} u[k,i,s] ≤ 1（同じスキルを 2 つ持たない。AC-3・036 Q174）。
  - 既存の行への係数: 通常のスキルの行に u のレベル、配置の行（種別 t・Lv s）に −(`slotPatterns[j]` の t・Lv s のスロットの数) × v。シリーズ／グループスキルの行には足さない（護石は数えない）。目的の重みの上界（`slotUpperBound`）には、v のスロットの並びの最大を護石の候補の最大として入れる。
  - 実データでの例: 必須スキルが 攻撃 Lv2・体術 Lv3 のとき、パターン「レア5・A,F,F」（スロットの並び 4 つ）には v が 4 列、u は 1 枠目（A）に 攻撃 Lv1、2・3 枠目（F）に 体術 Lv3 が 1 列ずつできる。体術の 2 列は AC-3 の行で同時に選べない。攻撃は A では Lv1 なので、この護石だけでは Lv2 に届かず、防具・装飾品で補う。
- D4: 目的（最大化）は、辞書式に「要るスキルの数が少ない」→「要るスキルのレベルの合計が低い」→「レア度が低い」→ 既存の feasible の目的（空き Lv の重み）の順にする（AC-5）。重みで 1 つの目的にまとめる: `objectiveCosts` の c1 を Wr とし、Wl = Wr ×（テーブルのレア度の最大 + 1）、Wc = Wl ×（3 × グループの Lv の最大 + 1）。v の係数は（そのスロットの並びの空き Lv の重み）− Wr × レア度、u の係数は −(Wc + Wl × レベル)。係数は整数で、現行のマスターで 10^7 未満に収まる（`mip_rel_gap` 0 のまま）。

### 列挙（AC-5・AC-6・AC-7・AC-9）
- D5: `reverseLookup` の列挙は、`solveBuilds.ts` の既存の列挙（防具と護石の組を除く行）とは別の関数にする。時間・キャンセルの判定（`readyToSolve`・`runModel`）は共有する。1 件求めるごとに、その候補（要るスキルの組 R とスロットの並び S）より要求が厳しいだけの護石を除く行を足す: Σ_{(s,l)∈R} Σ_{k,i: u[k,i,s] のレベル ≥ l} u[k,i,s] + Σ_{k,j: slotPatterns[j] が S と同じ} v[k,j] ≤ |R|（AC-6。同じ候補・レア度だけ違う同じ候補もこの行で除かれる）。スロットの並びの同一は、長さ・各要素の種別と Lv が並びの順に一致すること。
  - 例: 「見切り Lv1・任意・任意／防具用 Lv3」の後は、スロットが防具用 Lv3 で見切り Lv1 以上を含む護石が除かれる。「任意・任意・任意／武器用 Lv1・防具用 Lv1・防具用 Lv1」の後は、そのスロットの並びの護石がすべて除かれる。
  - `maxResults` 件に達する・解なし・時間の上限のどれかで止める。状態は、時間の上限で止めたら `timeout`（見つけた分を返す。AC-9）、0 件なら `infeasible`（AC-7）、それ以外は `feasible`。モデルを組む前に解なしと分かったとき（`buildModel` が `null`）は `infeasible`。
- D6: 解の読み出しは、1 になった v からパターンとスロットの並び、u から枠のスキルを読み、`VirtualCharm` にする。構成は、要るスキルとスロットを持つ内部の `SolverCharm` を作って既存の `assembleBuild` で組み、`charmId` を `null` にする（D1）。返す前に、要るスキルの数・レベルの合計・レア度で安定に並べ直す（D4 の目的で見つかる順と同じになるが、並びを AC-5 として保証するため）。
  - D4・D5 で、見つかる候補の要るスキルはどれも構成に効く（外すと目的が良くなり、除く行にも当たらないので、先に見つかっているはず）。

### Worker（AC-9・AC-12）
- D7: `worker.ts` のメッセージに足す: 受信 `{ type: 'reverseLookup'; requestId; request: ReverseLookupRequest }`、送信 `{ type: 'reverseProgress'; requestId; found; candidate }` と `{ type: 'reverseResult'; requestId; response: ReverseLookupResponse }`。`cancel`・`error` は共有する。実行中の要求の枠（`running`）は通常の検索と共有し、どちらを始めても実行中のほうを打ち切る（screen-design.md 0）。既存のメッセージの形は変えない。

### ソルバーのテスト
- D8: `packages/solver/src/test/reverseLookup.spec.ts`（手作りの小さなマスターと抽選テーブル。`support/builders.ts` を使う）。
  - 総当たりとの一致（AC-2・AC-5・AC-6）: テーブルの全パターン・全スロットの並び・各枠「任意」か必須スキル（同じスキルは 1 つまで）の護石を列挙し、1 件ずつ `solveBuilds`（その護石だけを候補・feasible・maxResults 1）で組めるかを見て、要るスキルとスロットの組ごとに最小のレア度を残し、AC-5 の順に並べ、先に残した候補より厳しいだけのものを除いて先頭から `maxResults` 件を取る（`support/` に置く）。逆引きの結果の（要るスキル・スロット・レア度）の並びと一致することを確かめる。同点の候補がある固定値では、件数が `maxResults` 未満になる条件で集合として比べる。
  - 個別: 同じグループが 2 枠あるパターンで同じスキルを 2 つ持たない（AC-3）・必須スキル 0 件で「任意」だけの候補・`maxResults` の打ち切り・解なし（AC-7）・テーブルが空で `InvalidRequestError`・テーブルにあるレア度だけが出る（AC-8）・部位の固定と除外・装飾品の除外が効く（AC-1）・時間の上限で `timeout` と見つけた分・キャンセルで `SolveCancelledError`（AC-9）・返した構成の発動スキルが必須スキルを満たし、装飾品が仮想の護石のスロットに収まる（AC-4。`support/verifyBuild.ts` を使う）。
  - 実データ（`solveBuilds.real.spec.ts` に足す。CI で実行する）: 1 つの条件で逆引きし、各候補がテーブルのどれかのパターンに収まり（AC-2）、同じスキルを 2 つ持たず（AC-3）、候補の護石を `SolverCharm` にして通常の `solveBuilds` に渡すと組めること。
  - `worker.spec.ts`: 逆引きの進捗・結果・キャンセル、逆引きの実行中に通常の検索を始めると逆引きが打ち切られ、その逆も同じこと。
  - 既存のテストは変えずに通す（AC-12）。

### 測定と記録（AC-11）
- D9: 測定ハーネス（`packages/solver/src/test/solveBuilds.measure.ts`）に、既存の 003 の `defense` のケースと同じ武器・必須スキルで逆引きするケース（ラベルの接頭辞「逆引き」・`maxResults` 10・`timeoutMs` は既存と同じ・`REPEATS` 回）を足し、1 件目の候補までの時間（`onProgress` の最初の呼び出しまで）と合計の時間、ケースごとの最大と 3 秒の基準に対する合否を出力する。CI では実行しない（`ciTiming.spec.ts` の検査のまま）。
- D10: 測定と記録は、T2 の後に T3 でメインが行う（測定の結果がハーネスの完成まで決まらないため）。`pnpm --filter @swv/solver exec vitest run --mode measure --reporter=verbose --silent=false src/test/solveBuilds.measure.ts -t 逆引き` を実行し、`design/tech-stack.md` に新しい節「HiGHS の護石の逆引きの測定（017 reverse-lookup）」を足して、条件・環境・版・抽選テーブルの規模・ケースごとの 1 件目までの時間と合計・最大・3 秒の基準に対する合否を記録する。1 件目までの最大が 3 秒を超えたら、T4 へ進まずにユーザーに提示する（AC-11 は受入基準なので、超えたまま進めない）。

### Web の要求と Worker の結線（AC-1・AC-9）
- D11: `apps/web/src/main/lib/solver/request.ts` に `buildReverseLookupRequest(bundle, conditions)` を足す。条件は `SearchConditions` から `objective`・`maxResults`・`charms` を除いたもの。ランクで外す防具・固定・除外の扱いは `buildSolverRequest` と同じ処理を共有する（`buildSolverRequest` の出力は変えない）。`maxResults` は `constants/search.ts` の新しい定数 `REVERSE_LOOKUP_MAX_RESULTS = 10`（Q169）、`timeoutMs` は `SOLVE_TIMEOUT_MS`。
- D12: `lib/solver/client.ts` に `reverseLookup(request, handlers): string` を足す（`onProgress(found, candidate)`・`onResult(response)`・`onError(message)`）。実行中の枠（`active`）は `solve` と共有し、どちらかを始めると前の応答を捨てる。`reverseProgress`・`reverseResult` を受け、`error`・異常終了・HiGHS の初期化失敗は `onError` に渡す。`cancel` は共有。`stores/master.ts` に `reverseLookup` を足し、取り消しは既存の `cancelSolve` を使う。`workers/solver.worker.ts` の例外の捕捉は `reverseLookup` の要求にも `error` を返す。
- D13: `stores/master.ts` に `appraisedRarities`（`appraisedCharm.patterns` のレア度の重複を除いた昇順。マスターが無ければ空）を足す。逆引きできるかの判定（AC-8）と要約の「抽選テーブル」に使う。

### Web の状態（AC-1・AC-7・AC-8・AC-9・AC-12）
- D14: 逆引きの状態は新しいストア `stores/reverseLookup.ts` に持つ: `status`（`idle`・`searching`・`done`・`error`）・`found`・見つけた順の候補・`response`・`errorMessage`・要約（D17）・火力の表示に使う送信した時点の武器の攻撃力・会心率とオンの発動条件・`runCount`・`unavailableReason`。
  - `unavailableReason`: 検索の理由（`conditions.unavailableReason`）があればそれを「…と逆引きできます。」の文言に置き換えたもの（「武器を選ぶと逆引きできます。」「候補にするランクを選ぶと逆引きできます。」）、なければ `appraisedRarities` が空のとき「抽選テーブルが未整備のため、逆引きできません。」、それ以外は `null`（screen-design.md 2.1）。
  - `submit()`: 理由があれば始めない。検索のストアの `discard()` を呼んでから、送信した時点の条件の写しを取り、結果を消して `searching` にし、`runCount` を増やして `master.reverseLookup` を呼ぶ。護石の読込は待たない（護石を使わない）。
  - `cancel()`: `master.cancelSolve()`、結果を消して `idle` に戻し、トースト「逆引きをキャンセルしました。」（R7）。
  - `discard()`: 通知を出さずに結果を消して `idle` に戻す（応答の破棄は、次の要求が client の実行中の枠を置き換えることで起きる）。
- D15: 検索のストア（`stores/search.ts`）には `discard()`（トーストを出さずに `idle` に戻し、護石の読込待ちを無効にする）を足し、`submit()` が検索を始めるときに逆引きのストアの `discard()` を呼ぶ。ほかの振る舞いは変えない（AC-12）。2 つのストアは互いを参照するので、`useXxxStore()` は関数の中で呼ぶ（setup の最上位で相互に呼ばない）。

### Web の表示（AC-4・AC-5・AC-7・AC-8・AC-9）
- D16: `SearchActions.vue` に screen-design.md 2.1 の「護石を逆引き」の行を足す（`type="button"`・outline・幅いっぱい・高さ 40px、実行中は「逆引きし直す」、説明または理由を `aria-describedby` で関連づけ、理由があれば無効）。「キャンセル」は通常の検索・逆引きのどちらの実行中にも出し、実行中のほうの `cancel()` を呼ぶ。「検索」のボタンとフォームの Enter の送信は変えない（逆引きは始めない）。
- D17: `ResultsPanel.vue`: h2 を、逆引きのストアが `idle` でなければ「逆引きの結果」、それ以外は「検索結果」にする。逆引きの `runCount` が増えたときも h2 へフォーカスを移す。逆引きのストアが `idle` でないときは、新しい部品 `components/search/ReverseLookupResults.vue`（R1〜R6。screen-design.md 2.3）を出し、`idle` のときは今の DOM のまま（Q0〜Q7 は変えない。AC-12）。要約（screen-design.md 2.5）は `ReverseLookupResults.vue` が作る（「抽選テーブル: レア5・レア6・…」は送信した時点の `appraisedRarities`）。R3 の「候補にするランクを広げる」「部位の固定や除外を減らす」の出し分けは通常の検索の R と同じ条件。
- D18: 候補のカードは新しい部品 `components/search/ReverseCandidateCard.vue` にし、`BuildCard.vue` を見出し「候補 <N>」・`showCharm` は `false`・「保存」なしで使う。`BuildCard.vue` に名前付きの slot `charm` を足し、見出しの行の直下（火力の節の上）に出す。slot が空のときは今の DOM のまま（通常の検索・保存した構成の画面は変えない）。slot には「狙う護石」（h4）とレア度・スキル・スロットの `<dl>` を出す（screen-design.md 2.4。「任意」のチップは破線の枠線と `--muted-foreground`）。
  - 構成の表示の材料（`BuildLookup`）は、候補の `VirtualCharm` から作る web の中だけの `SolverCharm`（ID は web の定数。スキルは「任意」を除いた枠、スロットは `charm.slots`）を `charm(id)` で返し、`build` の `charmId` をその定数に置き換えて渡す。装飾品の表の、仮想の護石のスロットに付けた装飾品の持ち主は「護石」になる（既存の `owner: 'charm'` の表示）。

### Web のテスト
- D19: 新しい振る舞いの単体テスト: `buildReverseLookupRequest`（ランクの除外・固定・除外・件数 10・目的と護石を含まない）、client の逆引きのメッセージ（進捗・結果・エラー・異常終了・通常の検索との置き換え）、逆引きのストア（理由の文言・`submit`・`cancel` のトースト・`discard`・検索との相互の打ち切り）、`SearchActions`（ボタンの文言・無効・`aria-describedby`・キャンセル）、`ResultsPanel` の h2 とフォーカス、`ReverseLookupResults` の R1〜R6 と要約、`ReverseCandidateCard`（狙う護石・「任意」・スロットなし・保存が無い）。抽選テーブルのある固定値は既存の `src/test/support/fixtures.ts` の `makeTableBundle()`、テーブルが空の固定値は既存の `makeBundle()`（AC-8）を使う。
- D20: 既存の単体テストの追従は、`SearchActions` にボタンが増えることで、ボタンを数える・役割だけで引く既存の spec が落ちたときに限る（文言・既定値は変えないので、期待値の追従は想定していない）。落ちたら、名前で引く形に直す。

### E2E（AC-1・AC-4・AC-7・AC-12）
- D21: 新しい e2e `apps/web/e2e/reverse-lookup.spec.ts`（実データ 2026.11.1。テーブルはレア5〜8）。要素は「護石を逆引き」のボタン名・h2「逆引きの結果」・「候補 <N>」（`exact: true`）・小見出し「狙う護石」で操作する（screen-design.md 3）。
  - 見つかる: マスターの先頭の武器と、抽選テーブルのグループにある必須スキルで逆引きし、「候補 1」と「狙う護石」とレア度・スキル・スロットが出て、要約に「抽選テーブル: レア5・レア6・レア7・レア8」が出る。
  - 見つからない: どの護石でも満たせない必須スキルの組で逆引きし、「抽選テーブルのどの護石でも条件を満たせません」が出る。
  - 逆引きの後に「検索」を押すと、h2 が「検索結果」に戻り、通常の検索の結果が出る（AC-12）。
  - 使うスキルとレベルは e2e-agent が実データで確かめて選び、選んだ理由（グループにある・満たせない理由）をコメントに書く。スキルのダイアログの操作は `e2e/support/search.ts` の既存の関数を使う。
  - テーブルが未整備（AC-8）は実データで起こせないので、web の単体テストで示す（D19）。既存の e2e は変えずに通す。

### 用語（screen-design.md 4）
- D22: 委譲の前に、メインが `design-system/skillweave/MASTER.md` の UI Copy の「用語の統一」に「逆引き」（ボタンは「護石を逆引き」、実行中は「逆引きし直す」）と「任意」の枠を、Component Specs に「任意の枠のチップ」（破線の枠線・`--muted-foreground`・文言「任意」を必ず出す）を足す（T1）。

### 委譲の順
- D23: T1（メイン）→ T2（solver）→ T3（メインの測定と記録）→ T4（web）→ T5（e2e）。web が D1 の型と D7 のメッセージに依存し、solver・web・e2e はどれも pnpm workspace を検証する役割なので並列にしない。

## 常時許可外の変更
- `design-system/skillweave/MASTER.md`（UI Copy の用語の統一に「逆引き」「任意」を、Component Specs に任意の枠のチップを足す。担当: メイン。時期: T1（委譲の前）。理由: screen-design.md 4・D22）
- `design/tech-stack.md`（逆引きの測定の結果を新しい節に記録する。担当: メイン。時期: T3（T2 の後）。理由: AC-11・D10）
