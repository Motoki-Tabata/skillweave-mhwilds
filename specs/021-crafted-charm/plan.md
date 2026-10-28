# 021: crafted-charm 計画

## スタック
- Web: Vue 3・Pinia・reka-ui・Vitest・@playwright/test（Chromium）。packages: TypeScript・Vitest・npm `highs`。版はすべて `design/tech-stack.md` の現行どおりで、依存は足さない。
- 追加する ui 部品は無い（screen-design.md 0。既存の `card`・`checkbox`・`label`・`button`・`ResultAlert` で足りる）。`Select` を使う新規 `.vue` は無いので、`sonar-project.properties` の抑止の追記は要らない。
- マスターデータ: `packages/data/dist/master-2026.10.4.*`（変更なし。生産護石 60 系統・183 件）。

## データモデル
なし

## 決定事項

### ソルバーの型（AC-1）
- D1: `packages/solver/src/main/request.ts` の `SolverCharm.id` を `Uuid | CharmId`、`SolvedBuild.charmId` を `Uuid | CharmId | null` に広げる。`CharmId` は `@swv/data` から型だけを読む（既存の import の並びに足す）。求解の処理（`model.ts`・`placement.ts`・`validate.ts`）は変えない（decisions.md Q31）。
- D2: ソルバーのテスト（`packages/solver/src/test/solveBuilds.spec.ts` に足す）: 手作りの小さなマスターで、ID が `ch:` の護石と UUID の護石を候補に混ぜ、構成が使った護石の ID が渡した文字列のまま `charmId` に返ることを確かめる（鑑定・生産それぞれが選ばれるケース）。既存のテストは変えずに通す。

### 生産護石の候補（AC-3・AC-4・AC-6・AC-9）
- D3: 絞り込みは `apps/web/src/main/lib/charms/crafted.ts` に置く（decisions.md Q77）。
  - `isCraftedCharmId(id: string): boolean` — ID が `ch:` で始まるか。鑑定護石か生産護石かの区別はこれだけで行う（Q31）。
  - `craftedSolverCharms(charms: readonly MasterCharm[]): SolverCharm[]` — ID を最後の `:` で系統（`ch:<gameId>`）とランク（整数）に分け、系統ごとにランクが最大の1件だけを `SolverCharm`（`id`・`rarity`・`skills`・`slots` の写し）にして返す。並びはマスターの並びで、各系統の最上位の件が現れる位置の順。上位ランクが下位ランクを包含することを前提にし、包含は検査しない（関数の JSDoc に前提を書く）。
  - 実データに当てはめた例: `ch:-1137475456:1`・`ch:-1137475456:2`（耳栓の護石Ⅰ・Ⅱ）→ `ch:-1137475456:2` だけ。`ch:-1172000256:1`〜`:3`（環境の護石Ⅰ〜Ⅲ）→ `ch:-1172000256:3` だけ。`ch:-2057181952:1`（にぎりめしの護石。ランクが1つだけの系統）→ そのまま。ランクⅤまである `ch:-498059904`（友愛の護石）→ `ch:-498059904:5`。マスター 2026.10.4 全体で 60 件。spec.md の用語の例 `ch:-1137475456:3` は実データに無い（耳栓は Ⅱ まで）が、用語の説明の例にとどまり受入基準に影響しないので spec は直さない。
- D4: 包含の検査はパイプラインに足さない（decisions.md Q77 の「区間 C で決める」の決定）。代わりに `apps/web` の単体テスト（`src/test/lib/charms/crafted.spec.ts`）で次の2つを示す（AC-9）。
  - 手作りの護石で、系統ごとに最上位だけを返すこと、負の `gameId`・ランク1つだけの系統・並びの決定性。
  - 現行のマスター（`packages/data/dist/master-${__SWV_MASTER__.version}.json` を `import.meta.dirname` から読む。前例は `src/test/constants/weaponTypes.spec.ts`）で、どの系統でも最上位ランクが下位ランクのスキル（同じスキルで同じ以上のレベル）とスロット（Lv を降順に並べて要素ごとに同じ以上。数が足りない側は 0）を包含すること。マスターの更新で包含が崩れたら、このテストが落ちて、絞り込みの前提が崩れたことが分かる。
  - 理由: パイプラインに足すと触る領域に data が増え、spec の影響範囲（solver・web）を超える。web のテストで現行のマスターを検査すれば、マスターの更新時の CI で同じ時点に気づける。
- D5: マスターのストア（`stores/master.ts`）に、`craftedSolverCharms(bundle.charms)` の computed（マスターが無いときは空）を足す。「護石」カードの件数 K と、検索の送信の両方がこれを使う。
- D6: 切り替えの状態は検索条件のストア（`stores/conditions.ts`）に `includeCraftedCharms`（既定 `true`）として持つ。端末には保存しない（再読み込みでオンに戻る。S1 ⇄ S2 の移動では残る。screen-design.md 2.1）。
- D7: 検索の送信（`stores/search.ts` の `dispatch`）は、送信した時点の切り替えの値で候補を決める。オンなら鑑定護石の候補（`charmsStore.candidates`。読込失敗のときは空）の後ろに D5 の生産護石を並べ、オフなら鑑定護石の候補だけを渡す（AC-3・AC-4・AC-6）。切り替えの値は `submit` の時点の写し（`Submitted`）に入れ、護石の読込を待つ間に切り替えても、押した時点の値を使う。`submittedCharms` には渡した候補をすべて（生産護石を含む）入れ、構成の表示がそこから護石を引く。

### 表示（AC-2・AC-5・AC-7）
- D8: 「護石」カード（`components/search/CharmCard.vue`）に切り替えと補助テキストを足し、鑑定護石の件数の文言を screen-design.md 2.1 の表のとおり（オン・オフで後半を変える）にする。補助テキストの K は D5 の件数。`Checkbox` と `Label` の行は `ConditionsCard.vue` の「候補にするランク」の行の書き方に合わせる。
- D9: 検索条件の要約: `SearchSummary` に送信した時点の切り替えの値（`includeCraftedCharms: boolean`）を足し、`charmCount` は「送信した時点の鑑定護石の候補の件数」の意味のまま残す（JSDoc を直す）。`ResultsPanel.vue` の要約は「／ 鑑定護石 <N> 件 ／ 生産護石を含める（含めない）」にする（screen-design.md 2.2）。
- D10: 構成のカードの護石の節を出す条件は、「送信した時点の護石の候補（鑑定護石と生産護石の合計。`submittedCharms` の件数）が1件以上」とする。現行のマスターでは生産護石が 60 件あるので、screen-design.md 2.3 の「鑑定護石の候補が1件以上、または生産護石を含めた」と同じ結果になる。生産護石が0件のマスター（単体テストの固定値）で、候補が無いのに「護石なし」を出さないための読み替え。
- D11: 生産護石の名前: `lib/solver/buildView.ts` の `CharmView` に `name: string | null` を足す。`build.charmId` が D3 の `isCraftedCharmId` に当たるときだけ `lookup.nameOf(id)`（辞書に無ければ ID。`master.nameOf` の既存の振る舞い）、鑑定護石と保存した構成の表示（`buildViewSaved` の経路）では `null`。`BuildCard.vue` は `name` が `null` でないときだけ護石の節の先頭に「名前」の行を出す（AC-7。鑑定護石の DOM は変えない）。

### 保存（AC-8）
- D12: `ResultBuildCard.vue` で、`saveable` かつ構成の `charmId` が生産護石のときは、`#action` の「保存」を出さず、保存できない理由（lucide `Info` と「生産護石を使った構成は保存できません。」）を出す。理由は見出しの行の直下・火力の節の上に置く（screen-design.md 2.4）。置き場は `BuildCard.vue` に名前付きの slot（例: `notice`）を足して渡し、slot が空のときは今の DOM のままにする（保存した構成の画面 S5 と検索中のカードは変えない）。`saveable` でないカード（検索中に見つけた順に出すカード）は理由も出さない。保存の経路（`search.buildPayload`・`ResultsPanel.vue` の保存のダイアログ）は変えない（生産護石の構成からは呼ばれない）。

### テストの追従
- D13: 既存の単体テストの追従（web-agent）。固定値のマスター（`src/test/support/fixtures.ts`）は `charms: []` なので、生産護石の候補は空になり、構成・要求の期待値はほぼ変わらない。変わるのは文言で、少なくとも次が当たる: `src/test/components/search/CharmCard.spec.ts`（「候補にする護石」「護石が登録されていません。護石なしで検索します。」「…護石なしで検索します。」の読込失敗）、`src/test/views/SearchView.spec.ts`（要約の「護石 0 件」）、`src/test/components/search/BuildCard.spec.ts`（要約の「護石 1 件」）。新しい振る舞いは、固定値のマスターに生産護石を足すオプションで確かめる（既定の `charms: []` は変えない）。S2 の「護石が登録されていません。」（`CharmsView`）は 021 で変えない。
- D14: 既存の e2e の追従（e2e-agent）。e2e は実データで動き、既定がオンなので候補に生産護石が入る。
  - `e2e/charm-input.spec.ts`・`e2e/charm-save.spec.ts`: 「候補にする護石: 1 件」を「候補にする鑑定護石: 1 件」にする。
  - `e2e/build-save.spec.ts`: 構成 1 が生産護石を使うと「構成 1 を保存」が出ない。011 の意図（保存できる構成の保存）を保つため、`searchPlainWeapon` で検索の前に切り替えをオフにする。
  - `e2e/measure/solver-ui.measure.ts`・`e2e/measure/damage-ui.measure.ts`: 冒頭に書いた条件（護石なし）を保つため、条件の入力で切り替えをオフにする（004・007 の測定と比べられるように）。
  - ほかの spec（`solver-ui`・`damage-ui`・`user-weapon`・`discord-login`）は、オンのまま通るかを実行して確かめ、落ちたら推定で直さず切り分けを報告する。
- D15: 新しい e2e（`e2e/crafted-charm.spec.ts`。AC-11）。鑑定護石を登録しない状態で、マスターの先頭の武器（`master.plainWeaponId`）と必須スキル「にぎりめし」（`sk:10503`。マスター 2026.10.4 で、防具・装飾品・武器に無く、生産護石 `ch:-2057181952:1`「にぎりめしの護石」だけが持つスキル）で検索する。
  - オン（既定）: 結果の構成の護石の節に「にぎりめしの護石」が出て、そのカードに「構成 <N> を保存」が無く、「生産護石を使った構成は保存できません。」が出る。要約に「生産護石を含める」が出る。
  - オフ: 切り替えをオフにして同じ条件で検索すると、解なしの表示（「条件を満たす構成が見つかりませんでした」）になることで、生産護石が候補に入らないことを示す（解なしのときは要約を出さないので、要約は確かめない）。
  - 要素はラベル・`aria-label`・文言で操作する（screen-design.md 3）。スキルのダイアログの操作は `e2e/support/search.ts` の `addSkills` を使う。

### 測定と記録（AC-10）
- D16: 測定ハーネス（`packages/solver/src/test/solveBuilds.measure.ts`）に、既存の 003 の `defense` のケースと 006 の `expectedDamage` のケースのそれぞれについて、生産護石を候補に含めた版（ラベルの接頭辞「生産護石あり」）を足す。候補は D3 と同じ規則（系統ごとに最上位ランク）で、`packages/solver/src/test/support/` に置く小さな関数で実データから作る（`packages/solver` は `apps/web` に依存できないため、規則を写す。写しであることをコメントに書く）。ほかの条件（武器・必須スキル・件数・`timeoutMs`・回数）は既存のケースと同じ。報告の表と最大の行・合否は、既存の出力に生産護石ありのケースも載る形にする（`defense` と `expectedDamage` で、護石なし・生産護石ありを分けて最大を出す）。CI では実行しない（`ciTiming.spec.ts` の検査のまま）。
- D17: 測定と記録は、T2 の後に T3 でメインが行う（測定の結果がハーネスの完成まで決まらないため）。`pnpm --filter @swv/solver exec vitest run --mode measure --reporter=verbose --silent=false src/test/solveBuilds.measure.ts` を実行し、`design/tech-stack.md` に新しい節「HiGHS の生産護石を候補に含めた測定（021 crafted-charm）」を足して、条件・環境・版・候補の件数（60）・ケースごとの護石なしと生産護石ありの合計時間（`expectedDamage` は1件目までの時間も）・それぞれの最大・3 秒の基準に対する合否を記録する。基準を超えても 021 では高速化せず、超えたことと 024 worker-solve-perf で扱う旨を書く（decisions.md Q77）。

### 用語（screen-design.md 4）
- D18: 委譲の前に、メインが `design-system/skillweave/MASTER.md` の UI Copy の「用語の統一」に、素材で作る、スキルが固定の護石は「生産護石」、手入力で登録する護石は「鑑定護石」、両方を指すときは「護石」と書く旨を足す（T1）。

### 委譲の順
- D19: T1（メイン）→ T2（solver）→ T3（メインの測定と記録）→ T4（web）→ T5（e2e）。web の型検査が D1 の型に依存し、solver・web・e2e はどれも pnpm workspace を検証する役割なので並列にしない。

## 常時許可外の変更
- `design-system/skillweave/MASTER.md`（UI Copy の用語の統一に「生産護石」「鑑定護石」を足す。担当: メイン。時期: T1（委譲の前）。理由: screen-design.md 4・D18）
- `design/tech-stack.md`（生産護石を候補に含めた測定の結果を新しい節に記録する。担当: メイン。時期: T3（T2 の後）。理由: AC-10・decisions.md Q77・D17）
