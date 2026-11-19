# 023: element-damage 計画

## スタック
- Node 24・TypeScript・Vue 3.5.45・Vitest・npm `highs` 1.15.4・`@playwright/test` 1.65.0（Chromium だけ）（`design/tech-stack.md` の現行どおり。版と依存の変更なし）
- マスターデータ: `packages/data/dist/` の現行の版 `2026.11.4`（変更なし。属性の効果の `element`・`weaponTypes` は 038・043 で入っている）

## データモデル
なし

## 決定事項

### ソルバーの構成の計算（AC-1〜AC-4）
- D1: 武器の属性の種類を、ソルバーの定数として持つ。5 属性は `ELEMENT_TYPES = ['fire', 'water', 'thunder', 'ice', 'dragon']`、状態異常は `STATUS_TYPES = ['poison', 'paralysis', 'sleep', 'blastblight']`（`packages/solver/src/main/damage.ts` に置き、`index.ts` から公開する。web の判定もこれを読む）。武器の `element.type` がどちらにも無い文字列のときは「属性が分からない」として扱い、属性の値を計算しない（AC-4）。
  - 例: `wp:bow:10` の `element` は `{ type: 'thunder', value: 11 }` → 5 属性（表示値 110）。毒の武器は `{ type: 'poison', … }` → 状態異常。`wp:bow:1` は `element` が無い → 無属性。
- D2: `DamageBase` に `element?: { type: string; value: number }`（マスターの単位）を足す。`DamageStats` に `element?: ElementStats` を足し、属性が無い・分からないときはプロパティごと持たない（既存の `toEqual` を壊さないため。`undefined` を入れない）。
  ```ts
  export type ElementStats =
    | { kind: 'element'; type: string; value: number; critMultiplier: number; expected: number }
    | { kind: 'status'; type: string; value: number }
  ```
- D3: `evaluateDamage` が、物理に加えて属性の値を求める。数える効果は `isCounted`（発動条件と武器種）を通り、かつ種類が合う（効果の `element` が武器の `element.type` と一致、または省略）もの。
  - 5 属性の武器: 属性値 = 武器の値 × `element_mul` の積 ＋ `element_add` の和。属性の会心倍率 = 有効な `element_crit_mul` の最大（無ければ 1）。属性期待値 = 属性値 × 属性の会心補正。属性の会心補正 = 会心率（物理と同じく −100〜100 に丸めた値）が 0 より大きければ 1 ＋ 会心率 ÷ 100 ×（属性の会心倍率 − 1）、0 以下なら 1。`status_*` は数えない。
  - 状態異常の武器: 蓄積値 = 武器の値 × `status_mul` の積 ＋ `status_add` の和。会心の補正はかけない。`element_*` は数えない。
  - 丸めない。物理の値（`attack`・`affinity`・`critMultiplier`・`expectedDamage`）の計算は変えない（AC-10）。

### 目的関数「属性の最大化」（AC-7・AC-8・AC-10）
- D4: `Objective` の `metric` に `'expectedElement'` を足す（`{ kind: 'maximize'; metric: 'expectedElement' }`）。web の目的の選択肢の ID も `expectedElement` にする。`SolvedBuild.score` は、返す構成から `evaluateDamage` で計算し直した属性期待値（マスターの単位・丸めない。`expectedDamage` の 019 D15 と同じ扱い）。
- D5: 要求の検証（`validate.ts`）。`ResolvedWeapon` に武器の属性（マスターの武器の `element`、個体差のある武器の `custom.element`）を足す。`expectedElement` のとき、次を `InvalidRequestError` にする（AC-8）: 武器の属性が無い、または種類が 5 属性でない。個体差のある武器の属性値が 0 より大きい有限の数でない。あわせて、`expectedDamage` と同じ個体差のある武器の攻撃力・会心率の検査（`checkDamageWeapon`）も行う（会心率の2進展開が整数を前提にするため）。
- D6: 求解は、`expectedDamage` の ILP（`damageModel.ts`）と同じ形の厳密な混合整数計画にし、`enumerateDamage`（θ を優先度 10、空き Lv の重みを優先度 5 の補助の目的にした辞書式の求解・1 件ごとに防具と護石の組を除く行を足す）をそのまま使う。`damageModel.ts` の関数を「数える効果の種類」で引数化して共通にする。
  - 属性値 E: 攻撃力 A の連鎖（`addAttack`）と同じ形で、基の値を武器の属性値、乗算を `element_mul`、加算を `element_add` にする。
  - 会心率: `addAffinity` をそのまま使う（丸めと符号の扱いが同じ）。
  - 属性の会心倍率の候補: 基の値を 1 にし、候補は 1 と、対象のスキルの `element_crit_mul` のうち 1 を超える値。
  - θ = E ＋ Σ（候補 j・ビット b）w(j,b)·(v_j − 1)/100·2^b。負の部分の項（`expectedDamage` の v(b)）は持たない（負会心は属性を減らさない。Q184）。
  - 対象のスキル: 種類が合う `element_add`・`element_mul`・`element_crit_mul` のどれかが中立でないレベルを持つスキル。`affinity_add` は、対象のスキルの `element_crit_mul` に 1 を超える値が 1 つでもあるときだけ数える（無ければ会心率は属性期待値に効かないので、会心率の列と行を作らない）。
  - `expectedDamage` の ILP の列・行・目的は変えない（共通化は引数化だけ。既存のテストを変えずに通す。AC-10）。
- D7: 支配される候補の除外（024 の `reduceCandidates`）を、`expectedElement` にも当てはめる。関係するスキルは、必須スキルと D6 の属性の対象のスキル。理由: 実データで最大化の1件目までの時間を 5 秒以下に収める見込みを確保するため（024 で `expectedDamage` の画面の1件目が 5.4 秒 → 3.4 秒になった方式）。支配される候補を外しても1件目（最大）は変わらない。2件目以降の列は、除外の前の全構成の順と変わりうる（024 と同じ。019 decisions.md Q41 の許容）。このため、AC-11 の総当たりとの一致のテストの手作りのマスターは、候補が支配し合わない形にする（`.claude/rules/solver.md`）。
- D8: 同点の順は `expectedDamage` と同じ（属性期待値の差が `DAMAGE_EPSILON` 以内なら同点とし、防具用、次に武器用の空きスロットの Lv の合計が大きいもの）。目的の係数（`objectiveCosts` の空き Lv の重み）は `expectedDamage` と同じにする。

### ソルバーのテスト（AC-11）
- D9: `packages/solver/src/test/**` に書く。
  - 構成の計算（`damage.spec.ts`）: 5 属性・状態異常・無属性・種類が分からない武器。種類の不一致の効果を数えない、`element` を省略した効果は数える、`element_*` を状態異常の武器で・`status_*` を 5 属性の武器で数えない、発動条件のオンとオフ、`weaponTypes` の絞り込み、`element_crit_mul` の最大、会心率が負（補正 1）・0・100 超（100 に丸める）の場合。
  - 属性の最大化（新しい spec ファイル。`solveBuilds.damage.spec.ts` にならう）: 手作りの小さなマスター（候補が支配し合わない形）で、全件の属性期待値の列が総当たり（`support/bruteForce.ts`）で求めた属性期待値の降順と `DAMAGE_EPSILON` 以内で一致すること、同点の順、全件が独立の検算（`support/verifyBuild.ts`）に通って `score` が降順であること、発動条件のオンとオフで結果が変わる場合。参照の実装（`support/damageReference.ts`）に属性の計算を足し、`evaluateDamage` と独立に書く。
  - AC-8: 無属性・状態異常・種類が分からない武器（マスターの武器と個体差のある武器の両方）で `expectedElement` を指定したときの `InvalidRequestError`。
  - AC-10: 既存のテスト（`solveBuilds.spec.ts`・`solveBuilds.damage.spec.ts`・`solveBuilds.real.spec.ts`・`damage.spec.ts`）を変えずに通す。通らなければ報告して止まる。
  - 実データ（`solveBuilds.real.spec.ts` にならう）: D12 の測定の武器で `expectedElement` を1回解き、全件が検算に通ること。
- D10: Node の測定の目安。`packages/solver/src/test/solveBuilds.measure.ts` に `expectedElement` のケース（D12 と同じ武器・6 ケース・生産護石のオンとオフ・発動条件はすべて有効）を足し、solver-agent が1件目までの時間の最大を報告に書く（各ケース 1 回でよい。合否は画面の測定 T7 で決める）。Node の値が約 4.2 秒（5 秒から画面の差の約 0.74 秒を引いた値。`design/tech-stack.md` の 007 の節）を超えたら、web の委譲の前にメインが報告を受けて止める。

### 画面（AC-4〜AC-6・AC-9）
- D11: web の変更（`apps/web/src/main/**`。画面設計 `screen-design.md` の 2・3 節が正）。
  - 目的の選択肢: `constants/labels.ts` の `OBJECTIVE_OPTIONS` の末尾に `{ id: 'expectedElement', label: '属性の最大化', description: '属性期待値が大きい順に探します。「発動条件」でオンにした効果を数えます。' }` を足し、`lib/solver/request.ts` の `toObjective` に対応を足す。
  - 武器の属性: `stores/conditions.ts` の `ResolvedWeapon` に `element?`（マスターの武器の `element`、または保存した武器の `payload.element`）を足す。`DamageBase` に `element` を入れる箇所は、`stores/search.ts`（検索結果）・`stores/reverseLookup.ts`（逆引きの候補）・`lib/solver/buildView.ts`（保存した構成・共有した構成。マスターの武器は今のマスターの `element`、個体差のある武器は `payload.element`。基の武器がマスターに無くても `payload.element` は使う）の 3 か所。
  - 選べないとき（AC-9。画面設計 2.2・2.3）: `stores/conditions.ts` に、武器が解決済みで属性が 5 属性でないかの判定と、選択肢の下の理由・目的の直下のエラーの文言を足す。`unavailableReason` の既存の順（武器 → ランク）の末尾に、目的と武器が合わない理由を足す。逆引きは止めない: `stores/reverseLookup.ts` は、武器とランクの理由だけを見るように変える（武器とランクの理由を返す computed を `conditions` に分けて公開し、`unavailableReason` はそれと目的の理由を順に返す）。<属性の表示名> は `constants/weapons.ts` の既存の表示名（無属性は「無属性」）を使う。
  - 構成カード（`components/search/BuildCard.vue`。画面設計 3.1・3.2）: `evaluateDamage` の `element` から、見出し行の属性期待値（5 属性のみ）・火力の `<dl>` の2行目・上限の注記を出す。値は `ELEMENT_DISPLAY_FACTOR` を掛けてから `formatDamageValue` で丸める（Q206）。
  - shadcn-vue の部品・`Select` は足さない（`sonar-project.properties` の追記は不要）。
- D12: 測定と e2e で使う 5 属性の武器は「マスターの並びで先頭の、属性が 5 属性の武器」（現行の `2026.11.4` では `wp:bow:10`。雷属性・値 11（表示 110）。武器スキル 2 つを持つ）。状態異常の武器は「マスターの並びで先頭の、属性が状態異常の武器」。どちらも ID を書き込まず、`apps/web/e2e/support/masterData.ts` で実データから引く。
- D13: web の単体テスト（`apps/web/src/test/**`）。
  - 追加: `BuildCard.spec.ts` に 5 属性・状態異常・無属性・属性が分からない武器の表示（見出し行・2行目・注記・表示値の丸め・負の値）、`conditions` のストアのテストに選べる・選べない・選んだ後に武器を変えたときのエラーと `unavailableReason` の順、`reverseLookup.spec.ts` に目的と武器が合わなくても逆引きが止まらないこと、`buildViewSaved.spec.ts`（と共有した構成のテスト）に `damageBase.element`、`request.spec.ts` に `toObjective('expectedElement')`、目的の選択肢の部品のテストに無効の表示と `aria-describedby`。
  - 追従（既存の期待が変わるもの。plan の時点の grep）: `damageBase` を `toEqual` で比べる 9 か所（`stores/search.spec.ts` の 319・510・541 行付近、`stores/reverseLookup.spec.ts` の 96・117 行付近、`lib/solver/buildViewSaved.spec.ts` の 212・240・267 行付近、`components/search/BuildCard.spec.ts` の 501 行付近）は、テストの武器が `element` を持つときだけ `element` を期待に足す。目的の選択肢の数や並びを数えるテストがあれば 5 つに追従する。

### e2e（AC-5〜AC-7・AC-9）
- D14: e2e（`apps/web/e2e/**`）は検索画面で確かめる。保存した構成・共有した構成は、構成カードが共通で `damageBase` を `buildView.ts` が作るので、単体テスト（D13）で確かめる。
  - D12 の 5 属性の武器で「属性の最大化」を選んで検索し、構成カードの見出し行と火力の2行目に「属性期待値」「<属性の表示名>値」と注記が出ること、構成 1 から順に見出し行の属性期待値が増えないこと（丸めた値で比べる）。
  - D12 の状態異常の武器で「火力の最大化」を検索し、2行目に「<属性の表示名>値」と注記が出て、「属性期待値」が出ないこと。`plainWeaponId`（無属性）では 2 行目と注記が出ないこと（既存の `damage-ui.spec.ts` に足すか、新しい `element-damage.spec.ts` に書く）。
  - AC-9: 状態異常の武器で「属性の最大化」が無効で理由が出ること。5 属性の武器で選んだ後に状態異常の武器へ選び直すと、エラーが出て「検索」が無効になり、「護石を逆引き」は有効のままであること。
  - 値は実データから引き、画面の文言は `screen-design.md` §5 の文言で探す。

### 測定と記録（AC-12・AC-13）
- D15: 画面の測定ハーネス `apps/web/e2e/measure/element-ui.measure.ts` を足す（e2e-agent）。条件は `damage-ui.measure.ts` と同じ（実データ・発動条件のトグルをすべてオン・件数 10・候補のランクは下位と上位・`support/measureCases.ts` の 6 ケース × 各 3 回・生産護石のオンとオフ・上限は画面の `SOLVE_TIMEOUT_MS`）で、武器を D12 の 5 属性の武器に、目的を「属性の最大化」にする。`fillRequiredSkills` に武器を引数で渡せるようにする（省略時は今の `plainWeaponId`。既存の測定は変えない）。状態の検査は、武器スキルで解の有無が変わりうるので、解あり・解なしのどちらも可とし、エラーの表示なら失敗にする。1件目までの時間と合計時間・状態・件数、生産護石のオンとオフのそれぞれと全体の1件目までの時間の最大、5 秒に対する合否を出力する。時間は検査（assert）しない。
- D16: 測定と `design/tech-stack.md` への記録は、web と e2e の後（T7）にメインが行う。`pnpm --filter @swv/web run measure --workers=1 e2e/measure/element-ui.measure.ts`（36 回 × 最大 30 秒で、所要は最大約 20 分）。新しい節「ブラウザの Worker 上の属性の最大化の測定（023 element-damage）」に、条件・環境・版・武器・ケースごとの1件目までの時間と合計時間・最大・合否（5 秒。AC-12 の読み替えの経緯）を書く。1件目までの時間の最大が 5 秒を超えたら、記録してから区間 D を止めて報告する（AC-12）。
- D17: `design/master-data.md` §9 の「023 element-damage の前提の確認」（AC-13）と `design-system/skillweave/MASTER.md`（画面設計 §6）は、内容が今の時点で決まっているので、委譲の前（T1）にメインが書く。decisions.md Q205 は §9 の書き換えを区間 E のドリフト是正で行うとしたが、その後に承認された spec.md（AC-13・常時許可外の変更予定）が区間 D で書くことにしているので、spec.md に従う。
  - `master-data.md` §9: 説明文の属性値の単位を「表示値の単位で確定（Q205）。`effects.yaml` の加算は説明文の値 ÷ 10」、負会心を「属性を減らさない（Q184。出典では定まらず、オーナーが確定）」、会心撃【属性】が無いときの属性の会心倍率を「1（023 の計算。Q40）」に書き換える。会心撃【特殊】は 023 のスコープ外として未確定のまま残す。
  - `MASTER.md`: Component Specs「火力の表示」に画面設計 3.2 の内容（2行目の並べ方・ラベル・文字の大きさと太字・表示値と丸め・上限の注記）を足し、「用語の統一」に「属性期待値（属性値 × 属性の会心補正）」を足す。

## 常時許可外の変更
- `design-system/skillweave/MASTER.md`（「火力の表示」に属性の行と上限の注記、「用語の統一」に属性期待値を足す。担当: メイン。時期: T1（委譲の前）。理由: 画面設計 §6・D17）
- `design/master-data.md`（§9 の 023 の前提の確認を Q184・Q205 の決定に書き換える。担当: メイン。時期: T1（委譲の前）。理由: AC-13・D17）
- `design/tech-stack.md`（属性の最大化の画面の測定の結果と合否を新しい節に記録する。担当: メイン。時期: T7（web と e2e の後）。理由: AC-12・D16）
