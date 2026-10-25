# 007: damage-ui 計画

## スタック
- Vue 3.5.44・Pinia 4.1.0・reka-ui 2.11.0（shadcn-vue の生成物）・@lucide/vue 1.57.0・Vite 8.3.4・TypeScript 6.0.3・Vitest 5.0.5・@playwright/test 1.64.1（`design/tech-stack.md` の現行どおり。版と依存の変更なし）
- `@swv/solver`（`evaluateDamage`・`SolvedBuild`・`Objective`）と `@swv/data`（マスターと辞書の型）は 006・019 のものをそのまま使う。`packages/solver`・`packages/data` は変えない
- マスターデータ: `packages/data/dist/master-2026.10.4.*`（019 の測定と同じ版）

## データモデル
なし

## 決定事項

### ソルバーの読み込み（spec「常時許可外の変更予定」の `packages/solver/package.json`）
- D1: メインスレッドの `evaluateDamage` は、`@swv/solver` のルート（`.`）から import する。`packages/solver/package.json` の exports にサブパスは足さない。理由: `packages/solver/src/main` は `highs` を `import type` でしか読まず、HiGHS を実行時に読むのは `apps/web/src/main/workers/solver.worker.ts` だけなので、ルートから読んでも HiGHS はメインのバンドルに入らない。

### 検索条件（受入基準 1〜3・6）
- D2: 目的の選択肢は `apps/web/src/main/constants/labels.ts` の `OBJECTIVE_OPTIONS` の末尾に `{ id: 'expectedDamage', label: '火力の最大化', description: <screen-design.md 2.2 の補助文> }` を足し、`lib/solver/request.ts` の `toObjective` に `{ kind: 'maximize', metric: 'expectedDamage' }` を足す。結果の並べ替えはしない（ソルバーが返した順）。
- D3: 発動条件のトグルの状態は `stores/conditions.ts` に足す（オンの条件の ID。既定は空。保存しない。004 decisions.md Q23 と同じストア）。トグルの並びは ja の名前の `compareJa`（`lib/text.ts`）の順で、マスターの `conditions` をすべて出す。カードは新しい部品 `components/search/ActivationConditionsCard.vue` にする（既存の `ConditionsCard.vue` は「検索条件」カードなので名前を分ける）。置き場所は `SearchView.vue` の「検索条件」カードと検索操作の間（screen-design.md 2.1）。
- D4: 検索したときの写し（`stores/search.ts` の `Submitted`）に、オンの条件の ID（トグルの並びの順）と、武器の攻撃力・会心率を足す。要求の `activeConditionIds` は、目的にかかわらずこの ID を入れる（オンが無ければ `[]`）。結果の火力の計算と要約は、この写しだけを使う（検索の後のトグル・武器の変更に影響されない）。要約（`SearchSummary`）に、検索したときにオンだった条件の名前の列を足し、`ResultsPanel.vue` で「発動条件: <名前>・<名前>」／「発動条件: なし」を出す（screen-design.md 2.5.1）。

### 火力の表示（受入基準 4・5）
- D5: 構成ごとの火力は、`evaluateDamage(bundle, { attack, affinity }, build.skills, activeConditionIds)` で、D4 の写しから計算する。目的にかかわらず、すべての構成（逐次表示で届いた構成を含む）に出す。ソルバーが返す `score` は使わない。
- D6: 丸めは表示用の関数だけで行う。`Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false, signDisplay: 'negative' })`（`roundingMode` は既定の `halfExpand`＝絶対値の四捨五入。`signDisplay: 'negative'` で `-0` を出さない）を、期待値・攻撃力は `d = 1`、会心率は `d = 0` に `%` を付けて、会心倍率は `d = 2` で使う。置き場所は `lib/format.ts`。並び順・比較には丸めた値を使わない。
- D7: 構成カード（`BuildCard.vue`）の見出し行の期待値・火力の節・スキルの効果の開閉と一覧は、screen-design.md 2.5.2 のとおり。開閉の状態は構成カードごとに持ち、既定は閉じる。

### 説明文と補完（受入基準 7〜10）
- D8: 補完の文は、純粋な関数（新しいファイル `lib/skills/effectSummary.ts`）で、そのレベルの `Effect[]`（`MasterSkill.effectsByLevel[level - 1]`）と名前を引く関数から作る。書式は screen-design.md 4 節（`stat` ごとの書式・符号・倍率は小数第2位で D6 の関数を使う・加算は丸めない・条件ごとに組にまとめ、組の中は「・」、条件付きの組は「（<条件の名前>）」、組と組は「 ／ 」、組の並びは最初に出た順）。効果が無いときは `null` を返し、補完を出さない。
- D9: 説明文は ja の辞書の `levelDescriptions[level - 1]`（index 0 = Lv1）。`\r\n` を `\n` にそろえ、`white-space: pre-line` で出す。空文字・欠けは「説明文が無い」と扱う。説明文と補完の組（説明文が無ければ補完だけ・両方無ければ出さない）は、結果の構成カード（D7）と D2 のダイアログ（D10）で同じ部品にする。
- D10: D2 のダイアログ（`SkillDialog.vue`）は screen-design.md 3 節のとおり。格子の列数を基準 1・`md` 2・`lg` 3 にし、各トグルボタンの右に説明の開閉ボタン（lucide の `Info`）を置く。開いている説明は1つだけ（スキルの ID で持つ）で、タブの切り替え・検索欄の語の変更・ダイアログを閉じたときに閉じる。

### 逐次表示（受入基準 11〜13）
- D11: `lib/solver/client.ts` の `SolveHandlers.onProgress` を `(found: number, build: SolvedBuild) => void` にし、Worker の `progress` の `build` を渡す（019 D6 の形。`requestId` の照合は今のまま）。`stores/search.ts` に届いた構成の列を足し、`onProgress` で末尾に足す。列は、結果（`onResult`）・取り消し（`cancel`）・エラー（`onError`）・新しい検索（`submit` の `clearResult`）で空にする。時間切れは 004 のまま（ソルバーが返した結果を出す）。
- D12: `ResultsPanel.vue` は、検索中で届いた構成が1件以上あるとき、進捗の帯の下に補助文・要約・届いた構成のカードを出す（screen-design.md 2.5.3）。検索が終わったら結果の表示に置き換え、構成カードを作り直す（開いていたスキルの効果を閉じるため。逐次表示と結果のカードで `key` を分ける）。届いた構成のカードの追加は読み上げず、フォーカスは動かさない。

### テスト（web の単体テスト）
- D13: 単体テストは `apps/web/src/test/**` の既存の配置に足す。少なくとも次を確かめる。
  - D6 の丸め（`312.45`→`312.5`、`1.005`→`1.01`、`-15.5`→`-16%`、`-0.04`→`0.0`、`1.4`→`1.40`。`Intl.NumberFormat` は10進の表記で四捨五入するので、`toFixed` のような2進の誤差は出ない。Node 24 で確認済み）。
  - D8 の補完（攻撃 Lv5・弱点特効 Lv5・挑戦者 Lv5 の screen-design.md 4 節の例、属性値の効果、効果が無いレベル）。テスト用のマスター（`src/test/support/fixtures.ts`）に、効果・条件・説明文を足してよい。
  - D4 の写し（検索の後にトグル・武器を変えても、火力・要約・要求が変わらない）と、要求の `activeConditionIds`（オンが無いときは `[]`）。
  - D11 の逐次表示（届いた順に足す・結果で置き換える・取り消し・エラー・新しい検索で消える・違う `requestId` を捨てる）。既存の `stores/search.spec.ts`・`views/SearchView.spec.ts`・`lib/solver/client.spec.ts` は `onProgress` の引数の変更に追従させる。
  - 既存の `components/search/ConditionsCard.spec.ts`・`BuildCard.spec.ts`・`SkillDialog.spec.ts` は、選択肢の追加・火力の節・格子の変更に追従させる。
  - ルーティング付きの共有コンポーネントには項目を足さない（`AppHeader`・`AppNav` は変えない）。

### E2E と測定（受入基準 14・15）
- D14: e2e は新しいファイル `apps/web/e2e/damage-ui.spec.ts` に書く。実データで、必須スキルに弱点特効 Lv5 を入れ、目的を「火力の最大化」・件数 1（時間を短くするため）にして、(1) トグルがすべてオフで検索した構成 1 の期待値と、(2) 「有効部位への攻撃」（名前は辞書から引く）をオンにして検索し直した構成 1 の期待値を読み、(2) > (1) であることを確かめる（オンにすると最適値が必ず大きくなるため。構成が同じである必要はない）。続けて、(2) の後に検索せずトグルをオフにしても表示中の期待値が変わらないこと、構成 1 のスキルの効果を開いて弱点特効の説明文と補完「会心率 +30%（<有効部位への攻撃の名前>）」が出ることを確かめる。既存の `solver-ui.spec.ts` が目的の選択肢の数などに依存していれば追従させる。
- D15: 測定は新しいファイル `apps/web/e2e/measure/damage-ui.measure.ts`（`pnpm --filter @swv/web run measure`。CI では実行しない。時間は assert せず console に出す）に書く。条件は decisions.md Q49 のとおり 019 と同じ（実データ・発動条件のトグルをすべてオン・マスターの先頭の武器・護石なし・件数 10・候補のランクはすべて・必須スキル 3／6／10 個 × 解あり／解なし・各 3 回）。ただし画面を通すので、時間の上限は画面の `SOLVE_TIMEOUT_MS`（30 秒）になる（decisions.md Q48。019 の Node の測定は 60 秒）。
  - 1件目までの時間: 「検索」を押してから、逐次表示の構成 1 のカードが出るまで。合計時間: 「検索」を押してから、検索中の表示が消えて結果（解あり・打ち切り・解なし）が出るまで。どちらも HiGHS の初期化とマスターの読み込みを含めない。
  - 状態の検査: 解ありのケースは、構成が1件以上出ること（完了でも打ち切りでもよい。打ち切りなら件数と打ち切られた旨を出力する）。解なしのケースは、解なしの表示が出ること。違えば失敗にする。
  - 出力: ケースごと・回ごとの合計時間と1件目までの時間・結果（件数・打ち切りの有無）、全ケース・全回のそれぞれの最大、1件目までの最大の 3 秒に対する合否。
  - 004 の測定（`solver-ui.measure.ts`）と同じ 6 ケースのスキルと下限は、共有のファイル `apps/web/e2e/support/measureCases.ts` に移して両方から読む（測定のファイルどうしを import すると、相手のテストが登録されるため）。004 の測定の中身（目的・ランク・出力）は変えない。Playwright のテストの時間の上限は、打ち切り（30 秒）× 3 回が収まる値にする。

### 記録（受入基準 14・screen-design.md 6 節）
- D16: `design-system/skillweave/MASTER.md` の Component Specs に、screen-design.md 6 節の4つ（発動条件のトグル・火力の表示・スキルの説明と補完・開閉のボタン）を、区間 D の委譲の前にメインが書く（内容は screen-design.md で確定しているため。ワーカーが標準として読めるようにする）。
- D17: `design/tech-stack.md` は、測定のハーネス（D15）ができた後に、メインが測定を実行して書く（結果が実装まで決まらないため）。新しい節「ブラウザの Worker 上の expectedDamage の測定（007 damage-ui）」に、条件（D15。時間の上限が 30 秒であることを含む）・環境・版・ケースごとの合計時間と1件目までの時間・結果・それぞれの最大・合否を記録し、019 の節の「限界」の「ブラウザの Worker 上の時間は未測定」から参照する。1件目までの時間の最大が 3 秒を超えたときは、対策を `specs/open-questions.md` に新しい Q として起票し、記録から参照する（decisions.md Q49）。

## 常時許可外の変更
- `design-system/skillweave/MASTER.md`（発動条件のトグル・火力の表示・スキルの説明と補完・開閉のボタンの部品とパターンを Component Specs に足す。担当: メイン。時期: 委譲の前。理由: screen-design.md 6 節・D16）
- `design/tech-stack.md`（ブラウザの Worker 上の expectedDamage の測定の結果と合否を新しい節に記録し、019 の節から参照する。担当: メイン。時期: 測定のハーネスの後。理由: 受入基準 14・decisions.md Q49・D17）
