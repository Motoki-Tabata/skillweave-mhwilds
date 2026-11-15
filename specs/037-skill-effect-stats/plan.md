# 037 skill-effect-stats 計画

## スタック
- packages: TypeScript・Vitest・`yaml`。Web: Vue・Vitest。版はすべて `design/tech-stack.md` の現行どおりで、依存は足さない。
- マスターデータ: `packages/data/dist/master-2026.11.1.*` を `2026.11.2` に上げて再生成する（D6）。MHDB のコミットは変えない。

## データモデル
なし

## 決定事項

### 効果の種類と書式（packages/data。data-agent）

- D1: 効果の種類（`EffectStat`）は次の 11 個にする。名前は既存の `<対象>_add`・`<対象>_mul` の形に揃える。既存の型にある `element_add`・`element_mul`（今は overlay の規則が受け付けず、マスターに 1 件も無い）は、名前を残して 037 の属性値の種類にする（置き換えでも別名でもなく、同じ名前に 037 の意味と規則を与える。handoff の要確認事項への回答）。
  | `stat` | 種類（decisions.md Q187） | 集計 |
  |---|---|---|
  | `attack_add`・`attack_mul` | 攻撃力（既存） | 加算・乗算 |
  | `affinity_add` | 会心率（既存） | 加算 |
  | `crit_mul` | 会心倍率（既存） | 最大を採る |
  | `element_add`・`element_mul` | 属性値 | 加算・乗算 |
  | `status_add`・`status_mul` | 状態異常値 | 加算・乗算 |
  | `element_crit_mul` | 属性の会心倍率 | 最大を採る |
  | `status_crit_mul` | 状態異常の会心倍率 | 最大を採る |
  | `defense_add`・`defense_mul` | 防御力 | 加算・乗算 |
  | `resistance_add` | 耐性値 | 加算 |
- D2: 種類の区別は、`Effect` の任意の項目 `element` に持たせる（`@swv/data` の `index.ts` に型 `EffectElement` を足す）。値は武器の属性の種類（`MasterWeapon.element.type` の実データの値）と同じ文字列に、耐性値の全属性を表す `all` を足したもの: `fire`・`water`・`thunder`・`ice`・`dragon`・`poison`・`paralysis`・`sleep`・`blastblight`・`all`。種類ごとの規則は次のとおり。
  - `element_add`・`element_mul`: `fire`・`water`・`thunder`・`ice`・`dragon` のどれか、または省略（武器の属性を問わない）。
  - `status_add`・`status_mul`: `poison`・`paralysis`・`sleep`・`blastblight` のどれか、または省略（武器の状態異常を問わない）。
  - `resistance_add`: `fire`・`water`・`thunder`・`ice`・`dragon`・`all` のどれかが必須（省略は違反）。
  - その他の種類（攻撃力・会心・属性と状態異常の会心倍率・防御力）: `element` を持てない（書けば違反）。
  - 出力の `Effect` は、`element` を持つときだけ項目を出す（`conditionId` と同じ。キーの並びは §7 の再帰的な昇順のまま）。
- D3: 値の規則（AC-2）。既存の 4 種の規則は変えない。符号の制限は、既存の `attack_add` と同じく加算には付けない。
  - `element_add`・`status_add`: 有限の数で、小数第1位まで（10 倍が整数。浮動小数の誤差は `Math.round(value * 10)` との差が 1e-9 未満なら整数とみなす）。マスターの単位（説明文の値 ÷ 10）で持つため（decisions.md Q193）。
  - `element_mul`・`status_mul`・`defense_mul`: 0 より大きい（`attack_mul` と同じ）。
  - `element_crit_mul`・`status_crit_mul`: 1 以上（基準の倍率は 023・038 で決めるので、037 は倍率として下げない値だけを受け付ける）。
  - `defense_add`・`resistance_add`: 整数。
- D4: 規則の置き場は `pipeline/effects.ts` のまま。`EFFECT_STATS` を D1 の 11 個にし、`effectProblem(stat, value)` を `effectProblem(stat, value, element)` に広げて D2・D3 を検査する。overlay の読み込み（`overlay.ts`。未知のキーの一覧に `element` を足し、`toEffect` で `element` を出力に移す）と出力前の検証（`validate.ts` の規則 `skill-effects`）は、どちらもこの関数を使う（規則を 1 か所に保つ）。エラーの文言は既存の形（「stat … は … のどれでもありません」等）に揃え、overlay の違反はファイル名と行・桁を示す（既存の `fail(…, effect)` の経路）。
- D5: `overlays/effects.yaml` に、対象のスキル 15 件（decisions.md Q187）の全レベルを書く（AC-3）。
  - 1 レベルの効果は、説明文に出てくる順に並べる（screen-design.md §2。補完は `effectsByLevel` の順に出すため）。属性値・状態異常値の加算はマスターの単位（説明文の値 ÷ 10）、その他は説明文のまま。発動条件は付けない（すべて常時）。
  - 行末に既存どおり `# <スキル名>` を付け、スキル ID の昇順の既存の並び方に合わせて挿入する（既存の 22 件は変えない）。
  - 実データに当てはめた例（ja の `levelDescriptions` から）:
    - 火属性攻撃強化 Lv3「火属性攻撃値を１．２倍し、火属性攻撃値に＋６０」→ `- - { stat: element_mul, value: 1.2, element: fire }` と `- { stat: element_add, value: 6, element: fire }`
    - 毒属性強化 Lv1「毒の蓄積値を１．０５倍し、毒の蓄積値に＋１０」→ `{ stat: status_mul, value: 1.05, element: poison }`・`{ stat: status_add, value: 1, element: poison }`
    - 防御 Lv7「防御力を１．１倍し、防御力＋３５、全属性耐性値＋５」→ `{ stat: defense_mul, value: 1.1 }`・`{ stat: defense_add, value: 35 }`・`{ stat: resistance_add, value: 5, element: all }`
    - 火耐性 Lv3「火耐性＋２０、防御力＋１０」→ `{ stat: resistance_add, value: 20, element: fire }`・`{ stat: defense_add, value: 10 }`
  - 冒頭のコメントの「属性・状態異常・オトモ・防御力に効く部分と、数値の無い部分は書かない」を、037 の範囲（decisions.md Q187 の表の種類だけを書く。オトモ・回数や段階を数える数値・種類の区別が定まらない値・攻撃の種類や部位で範囲を限る倍率・数値の無い部分は書かない）に改める（AC-10）。
  - `element_crit_mul`・`status_crit_mul` の値は書かない（AC-4。会心撃【属性】・会心撃【特殊】は 038）。
- D6: マスターの版は `2026.11.2`（`config.ts` の `MASTER_VERSION`。data-agent が上げる）。既存の版の付け方（`YYYY.MM.N`）に従う。`dist.spec.ts` の版の直書き（`全防具に rank があり、版が 2026.11.1 である` の題名と 2 つの期待値）も追従する。
  - web のテストのマスターのファイル名の直書き（`pwa/precache.spec.ts`・`sw/handlers.spec.ts`・`sw/route.spec.ts`・`support/serviceWorker.ts`）は、実際の `dist/` を読まない合成の入力なので追従しない（036 の版上げでも変えていない。handoff の要確認事項への回答）。web の実マスターの fixture（`support/masterFixture.ts`）は `__SWV_MASTER__.version` で版を引くので変更は要らない。
- D7: 既存のテストの追従（data-agent）。
  - `effects.spec.ts` の overlay の不正な `stat` の例 `{ stat: element_add, value: 5 }` は、037 で正しくなるので、どの種類でもない名前（例: `sharpness_add`）に替える。
  - 同ファイルの出力前の検証の例 `{ stat: 'element_add', value: 1 }`（違反を期待）は、037 で正しくなるので、D2・D3 に反する例（例: `{ stat: 'resistance_add', value: 5 }`。区別の欠落）に替え、違反の数の期待値を保つ。
- D8: データのテスト（AC-2・AC-6）。
  - AC-2: `effects.spec.ts` に、overlay と出力前の検証の両方で、D2 の区別の規則（種類で取れない区別・`resistance_add` の区別の欠落・区別を持てない種類の `element`・一覧に無い値）と D3 の値の規則（`element_add` の小数第2位・`defense_add` の小数・`*_mul` の 0 以下・`*_crit_mul` の 1 未満）の違反を足す。overlay の違反はファイル名と行・桁を確かめる（既存のテストの形）。正しい例（区別あり・区別なし・`all`）が通ることも確かめる。
  - AC-6: `dist.spec.ts` に、コミット済みの `dist/` の現行の版を読んで次を確かめるテストを足す。期待値は ja の `levelDescriptions` から書き写した値で書く（実装の写しにしない。既存の 006 のテストと同じ注記）。
    - 火属性攻撃強化 Lv3 = `[element_mul 1.2 fire, element_add 6 fire]`、毒属性強化 Lv3 = `[status_mul 1.2 poison, status_add 5 poison]`、防御 Lv7 = `[defense_mul 1.1, defense_add 35, resistance_add 5 all]`、火耐性 Lv3 = `[resistance_add 20 fire, defense_add 10]`（並びまで一致）。
    - 対象のスキル 15 件（ID を直書きし、名前を ja の辞書で確かめる）のすべてのレベルが空でない。
    - 説明文に属性値・状態異常値・防御力・耐性値の数値があるスキルは、効果を持つか、理由を添えた除外の一覧にある。判定は `/属性攻撃値|属性値|蓄積値|防御力|耐性/` と数字の両方を含む説明文を持つことにし、既存の 006 の受入基準 3 のテストと同じ形（漏れが 0 件・除外の一覧の各件が該当し効果を持たない）にする。2026.11.1 の説明文での事前の見積もりでは、除外は 6 件（砲術: 砲撃に範囲を限る値・属性吸収: 種類の区別が定まらない値・防御力ＤＯＷＮ耐性: 効果時間の数値・オトモへの采配: オトモは対象外・毛皮の昂揚: 数値は回数だけ・連撃: 数値は回数だけ）。火事場力は既存の効果を持つので除外に載せない。
- D9: data-agent の検証で想定内の失敗は次の 2 つだけ。ほかの失敗は直してから完了にする。
  - `dist.spec.ts` の版と D8 の AC-6 のテスト: `dist/` は T3 でメインが再生成するまで旧版のまま（ファイル名が `MASTER_VERSION` と合わない）なので落ちる。
  - `verify.mjs --only packages` の type-check の `packages/solver/src/main/damage.ts`: `Record<EffectStat, number>` が D1 の新しい種類を持たないので落ちる。T4 の solver-agent が直す。
  - web の type-check（`effectSummary.ts` の `Record<EffectStat, …>`）も T5 まで落ちる。data-agent は web を検証しないので、メインが T3 の後の確認で想定内として扱う。

### マスターの再生成（メイン）

- D10: `dist/` の再生成（T3）は、生成物なのでワーカーの書込許可に無く、data-agent の実装の後にメインが `pnpm --filter @swv/data run generate` で行う。生成のコマンドが `2026.11.1` の 3 ファイルを削除する。spec.md の常時許可外の変更予定の `dist/` の 6 行は、この時期に書く（委譲の前には書けない）。再生成の後に次を確かめる。
  - `pnpm --filter @swv/data run generate:check` が一致し、`pnpm --filter @swv/data run test:unit` が通る（D9 の 1 つ目の想定内の失敗が解消する）。
  - AC-5: `git show` で HEAD から取り出した `master-2026.11.1` の 3 ファイルと新しい 3 ファイルを、版の値と対象のスキル 15 件の `effectsByLevel` を除いて比べ、一致すること。辞書は版の値だけが違うこと。旧版は `dist/` から消えるので恒久のテストにせず、scratchpad の使い捨てのスクリプトで 1 回だけ行い、結果を D-1 の報告に書く。

### ソルバー（packages/solver。solver-agent）

- D11: ソルバーの計算は変えない（AC-7）。`damage.ts` の `evaluateDamage` の集計の型 `Record<EffectStat, number>` を、数える 4 種（`attack_add`・`attack_mul`・`affinity_add`・`crit_mul`）だけを持つ型に替える（未使用の `element_add`・`element_mul` の初期値も消す）。分岐はそのままで、新しい種類は今と同じく素通りする。`damageModel.ts` の `levelEffects` は 4 種以外を数えない作りなので変えない。
- D12: ソルバーのテスト（AC-7・AC-8）は、新しい `src/test/solveBuilds.effectStats.spec.ts` に置く。`support/realMaster.ts` の `loadRealMaster()` で T3 の後の現行のマスターを読み、新しい種類の効果だけを除いたマスター（各スキルの各レベルから 4 種以外の効果を除く。空になったスキルは `[]` のまま比べてよいし、レベルの空の配列を残してもよい。`effectsByLevel` の長さの規則に合う形にする）を作って比べる。
  - 前提の確認: 現行のマスターが D1 の新しい種類の効果を 1 件以上持つ（除く前後で差がある）こと。
  - 火力: 対象のスキル（火属性攻撃強化 Lv3・毒属性強化 Lv3・防御 Lv7・火耐性 Lv3 を含む）と既存の効果を持つスキル（例: 攻撃・見切り）の組で、`evaluateDamage` の攻撃力・会心率・会心倍率・期待値が一致する。
  - 検索（AC-7）: 目的関数 `expectedDamage` で、対象のスキルを必須スキルに含む要求を解き、構成と並び（`builds` の全件）が一致する。要求は `solveBuilds.real.spec.ts` の既存の要求の形を流用し、件数（`maxResults`）を小さく保って既存の実データのテストと同程度の時間に収める。
  - 検索（AC-8）: 目的関数 `defense` で同じ比べ方をし、構成と並びが一致し、各構成の `score` が防具の `defense` の合計に等しい。

### Web（apps/web。web-agent）

- D13: 補完（`src/main/lib/skills/effectSummary.ts`）を D1 の 11 個に広げる（AC-9・AC-4）。文言は screen-design.md §2 のとおり。
  - 書式の表を `Record<EffectStat, (effect: Effect) => string>` に替え、区別を読めるようにする。
  - 属性値・状態異常値の区別の表示名は、`constants/weapons.ts` の `elementTypeName`（`ELEMENT_TYPES`）を使う（例: `fire` → 「火属性」、`blastblight` → 「爆破属性」）。区別なしは「属性値」「状態異常値」。
  - 耐性値の区別の表示名（火・水・雷・氷・龍・全属性）は、`effectSummary.ts` の中に定数で持つ（使う場所が補完だけのため）。
  - `element_add`・`status_add` は表示値 `Math.round(value * 10)` を符号付きで出す（例: 6 → `+60`）。他の加算は 007 のとおり丸めない。乗算・会心倍率は既存の `formatMultiplier`（小数第2位）。
  - 実データに当てはめた例: 火属性攻撃強化 Lv3 →「効果: 火属性値 ×1.20・火属性値 +60」、防御 Lv7 →「効果: 防御力 ×1.10・防御力 +35・全属性耐性 +5」、火耐性 Lv3 →「効果: 火耐性 +20・防御力 +10」。
- D14: Web の単体テスト。
  - `src/test/lib/skills/effectSummary.spec.ts`: 既存の「属性値の効果と負の加算も出す」は、`element_add` の値をマスターの単位に替える（`value: 5` →「属性値 +50」。期待する文字列は変えない）。種類と区別の組ごとに screen-design.md §2 の表の例どおりの文を出すこと、`element_add` の小数（例: 0.5 → `+5`）と浮動小数の誤差（例: 0.1 + 0.2 → `+3`）、`element_crit_mul`・`status_crit_mul`（1.35 →「属性の会心倍率 1.35」）を足す。
  - AC-9 を実データで確かめるテストを足す。`support/masterFixture.ts` の `bundle`・`dictionary` で、screen-design.md §2.1 の 7 行（スキル Lv と補完）の文が `summarizeEffects` から得られること。期待値は §2.1 の表を書き写す。
  - `src/main/**` で変えるのは `effectSummary.ts` だけ。画面の配置・部品は変えない（screen-design.md）。

### 設計文書（メイン。委譲の前）

- D15: `design/master-data.md` を書き直す（AC-10。T1）。
  - §6: overlay の効果の例に `element` を持つ行を 1 つ足し、「効果:」の箇条の `stat` の一覧と値の規則を D1〜D3 に替える（`element_*` を受け付けない旨の注記を消す）。出力前の検証の `skill-effects` の記述は「上の overlay の規則と同じ」のままで足りる。
  - §8: 「説明文に攻撃力・会心率・会心倍率の数値が明記され、4 種で表せるスキルをすべて埋める。属性・状態異常・オトモ・防御力に効く部分…は書かない」を、decisions.md Q187 の範囲（9 種類の効果で表せる数値を埋める。属性値・状態異常値・防御力・耐性値は対象のスキル 15 件。属性と状態異常の会心倍率は 038 で入れる。書かない値の分類）と、decisions.md Q193 の単位（属性値・状態異常値の加算はマスターの単位で持ち、補完は表示値で出す）に替える。
- D16: `design-system/skillweave/MASTER.md` の「スキルの説明と補完」節の書式の表を、screen-design.md §2 の表に合わせて書き直す（T1）。`element_add` の行は表示値（× 10）の書式にし、区別の表示名の表と表示値の丸めの規則を足す。

## 常時許可外の変更
- `design/master-data.md`（§6 の効果の規則と §8 の効果の数値の出典と書く範囲を、037 の種類と範囲に合わせる。担当: メイン。時期: 委譲の前。D15）
- `design-system/skillweave/MASTER.md`（スキルの説明と補完の節の書式の表を screen-design.md §2 に合わせる。担当: メイン。時期: 委譲の前。D16）
- `packages/data/dist/master-2026.11.2.json`（生成物。担当: メイン。時期: data-agent の後に generate で書く。D10）
- `packages/data/dist/master-2026.11.2.ja.json`（生成物の ja の辞書。同上）
- `packages/data/dist/master-2026.11.2.en.json`（生成物の en の辞書。同上）
- `packages/data/dist/master-2026.11.1.json`（旧版。同上の generate が削除する）
- `packages/data/dist/master-2026.11.1.ja.json`（旧版の ja の辞書。同上）
- `packages/data/dist/master-2026.11.1.en.json`（旧版の en の辞書。同上）
