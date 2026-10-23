# 006: damage-model 計画

## スタック
- Node 24・TypeScript 6.0.3・Vitest 5.0.1・npm `highs` 1.15.3・`yaml`（`design/tech-stack.md` の現行どおり。版と依存の変更なし）
- マスターデータ: `packages/data/dist/master-2026.10.3.*` を `2026.10.4` に上げて再生成する（D9）。MHDB のコミットは `c50a1eb` のまま

## データモデル
なし

## 決定事項

### packages/data（受入基準 1〜3）
- D1: 発動条件の ID は `cd:<slug>` とする。slug は `^[a-z][a-z0-9_]*$`（英小文字で始まり、英小文字・数字・`_`）。発動条件はゲームの gameId を持たない手書きの定義なので、他の ID と違い slug で名付ける。名付けは、きっかけの en の表現の snake_case（例: `cd:weak_point`・`cd:wound`）。各スキルの「スキル発動中」「効果発動時」は、そのスキルの en の名前の snake_case（例: `cd:challenger`）にする。`@swv/data` の `ConditionId` のコメントの例（`cond.monster_enraged`）もこの形に直す。
- D2: `MasterBundle` に `conditions: MasterCondition[]`（`MasterCondition = { id: ConditionId }`）を足す。`id` の昇順に出力する。条件の名前は ja・en の辞書の項目（`{ name }`）に出す（`DictionaryEntry` の形は変えない）。
- D3: overlay の最上位のキーに `conditions` と `effects` を足す（既存の `replace`・`appraisedCharm`・`readings` に加えて5つ）。006 の定義は新しいファイル `packages/data/overlays/effects.yaml` に書く。
  ```yaml
  conditions:
    - id: cd:weak_point
      name: { ja: 有効部位への攻撃, en: Attacking a weak point }
  effects:
    sk:-397570464:            # 弱点特効。要素の数 = 最大レベル（index 0 = Lv1）
      - - { stat: affinity_add, value: 5, conditionId: cd:weak_point }
        - { stat: affinity_add, value: 3, conditionId: cd:wound }
      - …
    sk:422666624:             # 火事場力。効果の無いレベルは空の配列
      - []
      - - { stat: attack_mul, value: 1.05, conditionId: cd:adrenaline_rush }
  ```
  - `effects` の値はスキルの `effectsByLevel` をまるごと置き換える。`replace` で `effectsByLevel` を置き換えることは禁止する（定義の経路を1つにするため）。
  - 1つのレベルの中の効果の並びは overlay の並びのまま出力する。
- D4: overlay の段階で、次をファイル名と行・桁を示して失敗させる（受入基準 2。`dist/` に何も書かない）。
  - `effects`: 存在しないスキル ID・スキル（`sk:`）以外の ID・同じスキルの重複（全ファイルを通じて）・レベルの数が最大レベルと違う・`replace` での `effectsByLevel` の置き換え。
  - 効果: `stat` が `attack_add`・`attack_mul`・`affinity_add`・`crit_mul` 以外（`element_*` は Q40 まで受け付けない）・`value` が有限の数でない・`attack_add` と `affinity_add` が整数でない（ソルバーの会心率の2進展開の前提。D13）・`attack_mul` が 0 以下・`crit_mul` が 1.25 未満（Q35 の「有効な `crit_mul` の最大値を使う」と「既定の 1.25 との最大」を一致させるため）・`conditionId` が `conditions` に無い・未知のキー。
  - `conditions`: ID の形式が D1 に合わない・ID の重複（全ファイルを通じて）・`name` の `ja`・`en` のどちらかが無いか空の文字列・どの効果からも参照されない条件（007 のトグルに効かない条件を出さないため）・未知のキー。
- D5: 出力の前の検証（コミット済みの `dist/` を CI で検査する経路）に、規則 `skill-effects`（`effectsByLevel` の長さが 0 か最大レベル・`stat` と値の規則が D4 と同じ・`conditionId` が `conditions` にある）と `conditions`（ID の形式と重複なし）を足す。既存の「辞書に全 ID の ja と en の名前がある」の対象に条件の ID を含める。
- D6: 効果を埋める範囲と数値の出典は Q37 のとおり。data-agent は、ja の辞書の `description`・`levelDescriptions` を読み、4種の効果で表せるスキルをすべて埋める。条件の有無と単位は Q39 のとおり、説明文が書くきっかけで決める（「有効部位への攻撃時」→ `cd:weak_point`、「傷口への攻撃時、さらに」→ 別の効果として `cd:wound`、「スキル発動中」→ そのスキルの条件。きっかけの書かれていない効果は条件なし）。属性・状態異常・オトモ・防御力に効く部分と、数値の無い部分は書かない。`effects.yaml` はスキル ID の昇順に並べ、各スキルに名前のコメントを付ける。
- D7: 説明文の数値の写しの漏れを機械的に防ぐため、コミット済みの `dist/` に対するテストで、ja の `levelDescriptions` に「攻撃力」「会心率」「会心攻撃時のダメージ倍率」と数字を含むスキルが、`effectsByLevel` を持つか、テストに書いた除外の一覧（スキル ID と除外の理由。例: オトモの攻撃力・属性攻撃値・防御力だけ・数値なし）にあるかのどちらかであることを確かめる（受入基準 3）。
- D8: 代表のスキル（攻撃・見切り・超会心・弱点特効・挑戦者）の全レベルの効果は、説明文の数値をテストに直書きして、コミット済みの `dist/` と照合する（受入基準 3）。発動条件の一覧と ja・en の名前もコミット済みの `dist/` で確かめる。
- D9: マスターの版は `2026.10.4`（`config.ts` の `MASTER_VERSION`。data-agent が上げる）。`dist/` の再生成は生成物なのでワーカーの書込許可に無く、data-agent の実装の後にメインが `pnpm --filter @swv/data run generate` で行う（T2）。生成のコマンドが `2026.10.3` の3ファイルを削除する。再生成の後、`generate:check` の一致と `pnpm --filter @swv/data run test:unit` の成功を確かめる。T1 の検証では、`dist.spec.ts` の版と効果の不一致（T2 で解消）と、`packages/solver`・`apps/web` の型検査の `conditions` の欠落（T3・T4 で解消）による失敗を想定内として報告させる（004・005 と同じ扱い）。
- D10: 効果の数値の最終確認はオーナーが行う（Q35・Q37。`design/master-data.md` §9 と同じ扱い）。生成と実装を止めず、ゲート D-1 で `effects.yaml` の確認を求める。

### packages/solver（受入基準 4〜12）
- D11: 期待値の純関数 `evaluateDamage(master, base, skills, activeConditionIds?)` を新しいファイル `src/main/damage.ts` に書き、`index.ts` から公開する（型 `DamageStats = { attack; affinity; critMultiplier; expectedDamage }` も公開）。
  - `base`: `{ attack: number; affinity: number }`（武器の攻撃力と会心率。007 が個体差のある武器もそのまま渡せる形）。`skills`: `{ skillId; level }[]`（発動スキルのレベル。`SolvedBuild.skills` をそのまま渡せる）。
  - 式は Q35 のとおり。レベル L の効果は `effectsByLevel[L - 1]`（配列が空のスキルは効果なし）。数えるのは `conditionId` が無いか `activeConditionIds` に含まれる効果だけ。`affinity` は −100〜100 に丸めた値、`critMultiplier` は有効な `crit_mul` の最大（無ければ 1.25）。負の会心率では会心倍率にかかわらず 0.75 倍。どの値も丸めない。
  - マスターに無い条件 ID は一致しないだけで、例外は投げない（要求の検証は D12）。
- D12: 要求の検証（`validate.ts`）を次のように変える。
  - 目的関数 `expectedDamage` を拒否する検査を外す。
  - `activeConditionIds` の各 ID が `master.conditions` に無ければ `InvalidRequestError`（目的関数を問わない。受入基準 7）。
  - 目的関数が `expectedDamage` のときだけ、個体差のある武器の `attack` が 0 より大きい有限の数、`affinity` が整数であることを確かめる（他の目的関数の結果と状態を変えないため。受入基準 10）。
  - `ResolvedWeapon` に `attack`・`affinity` を足す（マスターの武器はマスターの値、個体差のある武器は要求の値）。
- D13: `expectedDamage` の ILP は、期待値を変数 θ で表す厳密な混合整数計画にする（Q36。近似の候補から並べ替える方式は採らない）。他の目的関数の ILP は変えない（受入基準 10）。
  - 対象のスキル R: 有効な条件の下で数える効果を1つでも持つスキル（種別を問わない）。
  - 装飾品の候補: 必須スキルを持つ装飾品に加えて、R の通常のスキル（シリーズ／グループ以外）を持つ装飾品（受入基準 9）。
  - レベルの変数: R の各スキル s に、レベル 0〜最大レベルの 0/1 変数 y(s,l)（和が 1）。実際の発動レベルと**両側で一致**させる（効果がレベルに単調でなくても厳密にするため）。通常のスキルは「Σ l·y ≤ 合計レベル」と「合計レベル ≤ Σ l·y + M·y(s,最大レベル)」。シリーズ／グループスキルは、段の部位数から決まる部位数の下限と上限で挟む（届かない段のレベルは 0 に固定）。
  - 加算と会心率: 基礎攻撃力の加算 D = Σ add(s,l)·y、会心率 F = 武器の会心率 + Σ aff(s,l)·y（整数）。
  - 攻撃力の倍率: `attack_mul` を持つスキルを順に掛ける。P0 = 武器の攻撃力、Pi = Σ_l q(i,l)、q(i,l) ≤ mul(i,l)·P(i−1)、q(i,l) ≤ 上界·y(i,l)。攻撃力 A = Pk + D。
  - 会心倍率: 候補の値 g（1.25 と R の `crit_mul` の値）の 0/1 変数（和が 1）。g > 1.25 は、g 以上の `crit_mul` を持つレベルの y の和以下。
  - 会心率の丸めと符号: F⁺・F⁻ を 0〜100 の整数とし、符号の 0/1 変数で片方だけを正にする。F⁺ − F⁻ ≤ min(100, max(F, −100)) を、下端の側も 0/1 変数で厳密に表す。F⁺・F⁻ を 7 ビットの 0/1 変数で2進展開する。
  - 期待値: θ = A + Σ_{g,b} (g − 1)/100·2^b·w(g,b) − 0.0025·Σ_b 2^b·v(b)。w(g,b) ≤ A、w ≤ 上界·(F⁺ のビット b)、w ≤ 上界·(g の変数)。v(b) ≥ A − 上界·(1 − F⁻ のビット b)、v ≥ 0。最大化なので、積の線形化は整数解で期待値と一致する（攻撃力と会心率が上がるほど期待値は上がり、A > 0・C > 0 のため）。
  - 上界は武器と R の効果の最大から計算する。M・上界の具体の値と変数の並びは solver-agent が決める。
- D14: `expectedDamage` は、1件ごとに2段で解く（Q36 の同点の順と、受入基準 9 の「寄与しない装飾品を付けない」を、数値の誤差に強い形で満たすため）。
  1. 目的を θ だけにして解き、その解の構成の期待値 E1 を `evaluateDamage` で計算する。
  2. 行 θ ≥ E1 − ε を足し、目的を 003 と同じ空き Lv の重み（防具用、次に武器用）に変えて解く。この解を返す構成にする。
  3. 足した行を外し（`changeRowBounds` で下限を −∞ に戻すか `deleteRows`）、目的を θ に戻し、2 の構成の防具と護石の組を除く行を足して次の件へ進む（003 と同じ除外）。
  - ε = 1e-6（期待値の同点の許容差。テストの降順・総当たりとの一致の比較も同じ ε を使う）。
  - タイムアウトとキャンセルの判定は、各段の求解の前に行う（003 と同じ扱い）。1段目の後に打ち切ったときは、その件を返さない。
- D15: `SolvedBuild.score` には、返す構成の発動スキルから `evaluateDamage` で計算した期待値を入れる（ILP の目的値は使わない）。状態は `optimal`（003 の `maximize` と同じ）。
- D16: テスト（受入基準 4〜12）。
  - `evaluateDamage`: 式・負会心・会心率の丸め（±100 の外）・`crit_mul` の最大・条件の有無と空の `activeConditionIds`・効果の無いスキル。
  - 要求の検証: マスターに無い条件 ID が `InvalidRequestError` になること（`feasible` と `expectedDamage` の両方）。`expectedDamage` が拒否されないこと。
  - 総当たり: 手作りの小さなマスター（部位ごとに 2〜3 個の防具・護石・必須スキルに無い火力スキルの装飾品・`attack_mul`・`crit_mul`・負の会心率の武器・条件付きの効果を含む）で、全構成（防具・護石・装飾品の付け方）を総当たりした期待値の最大と1件目の `score` が ε 以内で一致すること。2件目以降は、それまでに返した防具と護石の組を除いた総当たりの最大と一致すること。
  - 検算: 返したすべての構成で、テストの補助に書いたソルバーと独立の期待値の計算（`evaluateDamage` を呼ばない別実装）が `score` と一致し、`score` が降順（ε の許容）であること。各装飾品について、外すと必須スキルの下限を割るか期待値が ε を超えて下がること。同点のとき空き Lv（防具用、次に武器用）の順になること。
  - 既存の目的関数の非回帰: 同じマスターで `effectsByLevel` を空にしたものと埋めたもので、`feasible`・`defense`・`freeSlots` の結果（構成と状態）が一致すること。既存のテストはそのまま通ること。
  - 実データ: `packages/data/dist/` の現行のマスターで、条件をすべて有効にした `expectedDamage` を固定の必須スキルの組で解き、検算と降順を確かめる（時間は検査しない）。
  - テストの補助（`builders.ts` 等）の `MasterBundle` に `conditions` を足す。
- D17: 測定ハーネス（`src/test/solveBuilds.measure.ts`）に `expectedDamage` のケースを足す。実データ、条件をすべて有効にする、必須スキルは 003 と同じ 3／6／10 個 × 解あり／解なし、各 3 回、`maxResults` 10（004 Q20 の読み替えの既定の件数）、`timeoutMs` 60 秒。検索1回の合計時間・求解の回数（段の数を含む）・合計時間の最大と 3 秒に対する合否・HiGHS とマスターの版を出力する。003 のケースは残す。

### apps/web（スコープ外の追従のみ）
- D18: `apps/web/src/test/support/fixtures.ts` の `MasterBundle` に `conditions: []` を足す（他に `MasterBundle` を組み立てる web のテストがあれば同じく）。画面と `src/main` は変えない。

### 常時許可外の変更を書く時期
- D19: `design/master-data.md` は委譲の前に書く（T0。D1〜D5・D9 の書式と検証規則を、data-agent が読めるようにするため）。§4 の ID 規則の表に発動条件、§6 に `conditions`・`effects` の書式と検証規則、§8 に効果の数値の出典（Q37）を足す。
- D20: `packages/data/dist/` は data-agent の実装の後に書く（T2。D9）。`design/tech-stack.md` は測定の後に書く（T6。測定ハーネスができるまで書けないため）。新しい節「HiGHS の expectedDamage の測定（006 damage-model）」に、条件・環境・版・ケースごとの時間・最大と合否を記録する。3 秒を超えたら、対策を `specs/open-questions.md` に新しい Q として起票し、記録から参照する（T7。Q36）。

## 常時許可外の変更
- `design/master-data.md`（発動条件の ID 規則・overlay の `conditions`・`effects` の書式と検証規則・効果の数値の出典を足す。担当: メイン。時期: T0。理由: Q39・D1〜D5）
- `design/tech-stack.md`（expectedDamage の測定の結果を新しい節に記録する。担当: メイン。時期: T6。理由: 受入基準 12・Q36）
- `packages/data/dist/master-2026.10.4.json`（生成物。生成のコマンドで書く。担当: メイン。時期: T2。理由: D9）
- `packages/data/dist/master-2026.10.4.ja.json`（同上の ja の辞書。担当: メイン。時期: T2。理由: D9）
- `packages/data/dist/master-2026.10.4.en.json`（同上の en の辞書。担当: メイン。時期: T2。理由: D9）
- `packages/data/dist/master-2026.10.3.json`（旧版。生成のコマンドが削除する。担当: メイン。時期: T2。理由: D9）
- `packages/data/dist/master-2026.10.3.ja.json`（旧版の ja の辞書。同上。担当: メイン。時期: T2）
- `packages/data/dist/master-2026.10.3.en.json`（旧版の en の辞書。同上。担当: メイン。時期: T2）
