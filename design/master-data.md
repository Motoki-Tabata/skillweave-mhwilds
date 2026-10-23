# マスターデータ設計標準

スキル・防具・装飾品・武器・護石のマスターデータの、情報源・生成パイプライン・ID 規則・出力形式・説明文の扱いを定める。実装は `packages/data`（`src/main/pipeline/`・`overlays/`・`dist/`）。

---

## 1. 原則

- マスターデータは DB に入れない。`packages/data` が生成した版付きの JSON を静的配信する。
- `packages/data/dist/` は生成物であり、手で編集しない。直したい値は overlay（`packages/data/overlays/*.yaml`）で直す。
- 生成は1つのコマンドで再現でき、同じ取得物・overlay・版からはバイト単位で同じ内容が出る。
- ユーザーデータからマスターを参照するときは FK を張らず、ID の文字列と `master_version` で持つ。整合性はアプリ層が `master_version` と照合して検証する。

## 2. 情報源

- **主: MHDB**（`LartTyler/mhdb-wilds-data` の `output/merged`）。ゲームファイル由来で、日本語を含む全言語の名前がある。
  - **コミット SHA を固定して取得**する（SHA と版は `packages/data/src/main/pipeline/config.ts`）。MHDB のコードは流用せず、出力 JSON だけを入力にする（リポジトリは GPL-3.0）。クレジットを表記する。
  - 取得対象は `Skill.json`・`Armor.json`・`Accessory.json`・`Amulet.json` と、武器種14ファイル（`weapons/`）。
- **補: 手作業 YAML の overlay**（MHDB に無いものと、MHDB の誤りの訂正）。
  - 火力計算用の効果数値（`effectsByLevel`）・発動条件・鑑定護石の抽選テーブル（`appraisedCharm`）・個体差武器の選択肢。中身は、それぞれを使う機能が埋める。
  - MHDB の誤りの訂正（`overlays/corrections.yaml`。訂正の根拠は YAML のコメントに書く）。
- **予備: ゲームファイルからの自前抽出**。MHDB のアセンダンス対応が止まった場合に検討する。
- 攻略サイトはスクレイピングしない。人が照合するための参照にとどめる。

## 3. パイプライン

1. **取得**: 固定した SHA の統合 JSON を raw.githubusercontent.com から取得し、`packages/data/.cache/mhdb/<SHA>/`（git 管理外）に置く。同じ SHA のキャッシュが揃っていればネットワークに接続しない。
2. **変換**: gameId から自前 ID を生成し、`MasterBundle` の形へ変換する。名前・説明文は ja・en の辞書に分ける。MHDB の形が型の前提を外れたとき（例: 武器の `specials` が2つ以上）は、該当の ID を示して失敗させる。黙って丸めない。
3. **overlay**: `overlays/*.yaml` をファイル名の昇順で重ねる。
4. **検証**: 違反を全件示して失敗させ、`dist/` に何も書かない（§6）。
5. **出力**: `dist/` に書く（§7）。差分は PR でレビューする。

コマンドは `packages/data` の `generate`（生成）と `generate:check`（`dist/` を書かずに既存のファイルとバイト単位で比べる。ローカル限定）。Node 24 の型除去で実行し、実行器の依存は足さない。

`master_version` は人が設定ファイルに書く（例: `2026.10.1`）。更新の要否は、MHDB の `/version`（取り込み時刻）を人が参考にして決める。

## 4. ID 規則

MHDB 自身の `id` は取り込み直しで変わりうるので使わず、gameId から生成する。

| 対象 | 形式 | 例 |
|---|---|---|
| スキル | `sk:<gameId>` | `sk:850626240` |
| シリーズ／グループスキルの発動定義 | `sb:<スキルの gameId>` | `sb:-1432692352` |
| 防具 | `ar:<防具セットの gameId>:<部位>` | `ar:-2117203456:head` |
| 装飾品 | `dc:<gameId>` | `dc:-2144349312` |
| 武器 | `wp:<武器種>:<gameId>`（gameId は武器種内でのみ一意） | `wp:charge-blade:22` |
| 生産護石 | `ch:<gameId>:<ランク>` | `ch:-2084662144:1` |
| 発動条件 | `cd:<slug>`（slug は `^[a-z][a-z0-9_]*$`） | `cd:weak_point` |

発動条件はゲームの gameId を持たない手書きの定義なので、slug で名付ける。きっかけの en の表現の snake_case にする（例: `cd:weak_point`・`cd:wound`）。各スキルの「スキル発動中」「効果発動時」は、そのスキルの en の名前の snake_case にする（例: `cd:challenger`）。

## 5. 変換の規則

- スキルの種別 `set` は `series` に読み替える。`maxLevel` は `ranks` のレベルの最大。極意スキル（`raisesMaxLevel`）は出力しない（アセンダンス対応で扱う）。
- シリーズ／グループスキルは同じ `SetBonus`（`thresholds` の配列）で表し、`kind` が `set`・`group` のスキルごとに1つ作る。`thresholds` は、そのスキルを持つ防具セットの `ranks`（発動部位数とレベル）から作る。防具の部位が持つ set・group のスキルは、防具の `skills` に入れず `setBonusIds` に入れる。
- 防具は防具セットの部位ごとに1つ。防御力は強化後の最大値、スロットは防具用（`target: 'armor'`）。
- 防具のランク（`rank`: `low`・`high`・`master`）は、レア度から `src/main/pipeline/config.ts` の対応表で決める。現行は 1〜4 が `low`、5〜8 が `high`。対応表に無いレア度の防具があれば、変換のエラーにして生成を失敗させる。`master` の対応は、アセンダンスのデータが MHDB に入ったときに対応表を直して決める。検証は、すべての防具の `rank` が3つの値のどれかであることを確かめる。
- 武器は14種の全件。スロットは武器用（`target: 'weapon'`）。
- 護石は、生産護石（MHDB の `is_random: false`）の rank ごとに1つ。鑑定護石の本体は含めず、抽選テーブルは overlay の `appraisedCharm` で定義する。
- 取得元（リポジトリとコミット SHA）と版を `MasterBundle` に記録する。

## 6. overlay の書式と検証

overlay の最上位のキーは `replace`・`appraisedCharm`・`readings`・`conditions`・`effects` だけ。

```yaml
replace:
  - id: sb:-1432692352      # 対象のエントリの ID。接頭辞で集合が決まる
    field: thresholds       # エントリの最上位の項目。値をまるごと置き換える（深いマージはしない）
    value:
      - { pieces: 2, level: 1 }
      - { pieces: 4, level: 2 }
appraisedCharm:             # 任意。全ファイルを通じて高々1回
  patterns: []
  groups: []
readings:                   # 任意。スキル ID → 読み。全ファイルを通じて同じ ID は1回だけ書ける
  sk:850626240: こうげき
  sk:-1689391744: たいじゅつ
conditions:                 # 任意。発動条件の定義。全ファイルを通じて同じ ID は1回だけ書ける
  - id: cd:weak_point
    name: { ja: 有効部位への攻撃, en: Attacking a weak point }
effects:                    # 任意。スキル ID → レベルごとの効果。全ファイルを通じて同じスキルは1回だけ書ける
  sk:-397570464:            # 要素の数 = スキルの最大レベル（index 0 = Lv1）
    - - { stat: affinity_add, value: 5, conditionId: cd:weak_point }
      - { stat: affinity_add, value: 3, conditionId: cd:wound }
    - …
  sk:422666624:             # 効果の無いレベルは空の配列
    - []
    - - { stat: attack_mul, value: 1.05, conditionId: cd:adrenaline_rush }
```

存在しない ID・存在しない項目・未知のキー・同じ `id` と `field` の重複・YAML の構文エラーは、ファイル名と行番号を示して生成を失敗させる。

`readings` は、スキルの検索に使う読みを定める。読みは、ひらがな（U+3041〜U+3096）と長音符「ー」だけからなる、空でない文字列にする。記号（「・」「【】」）は含めない。英字のスキル名は読みをひらがなで書く（例: 「ＫＯ術」→「けーおーじゅつ」）。次は、ファイル名と行・桁を示して生成を失敗させる。

- 存在しない ID。
- スキル（`sk:`）以外の ID。
- 同じ ID の重複。
- 文字列でない値。

`effects` の値は、スキルの `effectsByLevel` をまるごと置き換える。`replace` で `effectsByLevel` を置き換えることは禁止する（定義の経路を1つにするため）。1つのレベルの中の効果の並びは overlay の並びのまま出力する。次は、ファイル名と行・桁を示して生成を失敗させる。

- `effects`: 存在しないスキル ID・スキル（`sk:`）以外の ID・同じスキルの重複・レベルの数が最大レベルと違う・`replace` での `effectsByLevel` の置き換え。
- 効果: `stat` が `attack_add`・`attack_mul`・`affinity_add`・`crit_mul` 以外（`element_*` は未確定事項 Q40 が決まるまで受け付けない）・`value` が有限の数でない・`attack_add` と `affinity_add` が整数でない・`attack_mul` が 0 以下・`crit_mul` が 1.25 未満・`conditionId` が `conditions` に無い・未知のキー。`conditionId` が無い効果は常に有効。
- `conditions`: ID の形式が §4 に合わない・ID の重複・`name` の `ja`・`en` のどちらかが無いか空の文字列・どの効果からも参照されない条件・未知のキー。

条件の名前は ja・en の辞書の項目（`{ name }`）に出す。

出力の前に、次を検証する。

- ID の重複がない。
- 参照するスキル ID と `sb:` の ID がすべて存在する。
- スキルのレベルが 1 以上で、そのスキルの最大レベル以下。
- スロット Lv が 1〜4（型は4まで許す。現行のゲームは3まで）。
- シリーズ／グループスキルの発動部位数が昇順で重複せず、整数である。
- 同じスキルを持つ防具セットの間で、発動部位数とレベルが一致する。
- 辞書に全 ID（発動条件の ID を含む）の ja と en の名前がある。
- ja の辞書のすべてのスキル（武器・防具・シリーズ・グループ）が `reading` を持ち、その文字種が上の規則に合う（規則名 `dictionary-reading`）。en の辞書とスキル以外の項目には `reading` が無い。MHDB の更新でスキルが増えたときは、読みを足すまで生成が失敗する。
- 効果（規則名 `skill-effects`）: すべてのスキルの `effectsByLevel` の長さが 0 か最大レベルで、`stat` と値の規則が上の overlay の規則と同じで、`conditionId` が `conditions` にある。
- 発動条件（規則名 `conditions`）: ID の形式が §4 に合い、重複がない。
- 抽選テーブル（`appraisedCharm`。規則名 `appraised-charm`）: `groups` の `group` の名前が重複しない。`patterns[].skillGroups` の要素が null か `groups` にある名前で、長さが 3 以下。`slotPatterns` の要素（スロットの並び）の長さが 3 以下。`groups[].skills` が武器スキル・防具スキルだけ。鑑定護石のレア度の範囲（5〜8）は検証しない。

MHDB の誤りで防具セットの間の定義が食い違うときは、overlay が `thresholds` を置き換えることで解消する（検証は、解消していない不一致を違反にする）。

## 7. 出力

- `dist/master-<版>.json`・`master-<版>.ja.json`・`master-<版>.en.json`。ja・en 以外の言語は出さない。
- `MasterBundle.conditions`（`{ id }` の配列）は `id` の昇順に出す。
- ja の辞書のスキルの項目だけが、任意の `reading`（`readings` の値）を持つ。en の辞書とスキル以外の項目には出さない。`@swv/data` のエントリの `DictionaryEntry` は `reading?: string` を持つ。
- キーは再帰的に昇順、インデント2・末尾に改行1つ。配列は各集合を `id` の昇順、`skills` を `skillId` の昇順、`thresholds` を `pieces` の昇順にする。文字列の比較はコードユニット順で行い、実行環境のロケールに依存させない。
- 出力しようとする版のファイルが既にあり中身が異なるときは、版を上げるよう示して失敗し、既存のファイルを上書きしない。
- 新しい版を出力したら、`dist/` から旧版のファイルを削除し、現行の版だけを残す。
- `@swv/data` のエントリ（`src/main/index.ts`）は型の定義だけを持つ。Node の API に依存するコードを読み込ませない（ブラウザとソルバーが型を読めるようにするため。`tsconfig.entry.json` の `types: []` で機械的に守る）。
- CI は、ネットワークに接続せずに、コミット済みの `dist/` を §6 の検証にかける。取得と再生成の一致確認はローカルで行う。

## 8. 効果の説明文

- ゲーム内の説明文をそのまま表示し、数値を補完する。説明文は MHDB のスキルランクごとの説明（ja・en）を辞書に格納する（`levelDescriptions`。index 0 が Lv1）。
- 数値の補完は `effectsByLevel` から UI で生成する（例: 説明文の後ろに「攻撃力+9／会心率+5%」）。補完文は辞書に保存せず、計算で出す。
- 効果の数値（`effects.yaml`）の出典は、ゲーム内の説明文（ja の `levelDescriptions`）とする。攻略サイトは取り込まない。説明文に攻撃力・会心率・会心倍率の数値が明記され、`attack_add`・`attack_mul`・`affinity_add`・`crit_mul`（条件付きを含む）で表せるスキルをすべて埋める。属性・状態異常・オトモ・防御力に効く部分と、数値の無い部分は書かない。条件は、説明文が書くきっかけで決める。最終確認はオーナー。
- カプコンのガイドラインは公式素材の「そのまま使用」をガイドラインの対象外としている。説明文の掲載は、この点を認識したうえでの判断である。アイコン・画像は使わない。

## 9. ゲーム仕様の確認結果（2026-10-02 時点。最終確認はオーナー）

- 武器用珠と防具用珠は別。複合珠は現状、武器の3スロ珠にのみある（アセンダンスで防具にも増える見込み）。
- スロット Lv は現行3まで。過去作は4まであったため、型は4まで許す。
- 鑑定護石: スキル最大3種類（武器・防具スキル混在）、スロット最大3枠（武器用・防具用）。レア5〜8。レア8は1枠目に武器スロ①が確定、レア5〜7は武器スロなし。
- シリーズ／グループスキルの発動部位数はスキルごとに異なる。巨戟アーティアは、シリーズ・グループを各1部位分付与でき、部位数に数える。
- 拡張「アセンダンス」（2027年予定）で「極意」スキル（特定スキルの上限を引き上げる）が復活する。
