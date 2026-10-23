# 006: damage-model

## 目的 / ユーザーストーリー
ハンターとして、必須スキルを満たす構成のうち、火力（物理の期待値）が最も高いものを知りたい。スキルの効果の数値と発動条件はマスターに無いため、overlay で定義する。そのうえで構成の期待値を計算し、ソルバーの `maximize: expectedDamage` で最大化できるようにする。画面への表示と条件の切り替えは 007 damage-ui が行う。006 は `packages/data` と `packages/solver` に、007 が使う計算と最大化を揃える。

用語:
- 期待値: 物理の期待値。攻撃力 × 会心補正（式は decisions.md Q35）。属性は含めない。
- 発動条件: 条件付きの効果が有効になるきっかけ（例: 有効部位への攻撃）。発動している／していないの二値で扱う（decisions.md Q39）。
- 有効な条件: 要求の `activeConditionIds` に含まれる条件。

## 受入基準（EARS記法）
- THE system SHALL overlay で、スキルのレベルごとの効果（攻撃力の加算・攻撃力の倍率・会心率の加算・会心倍率。それぞれ任意で発動条件を持つ）と、発動条件（ja・en の名前付き）を定義できなければならない。生成物では、効果を `MasterBundle` のスキルの `effectsByLevel` に、発動条件の一覧を `MasterBundle` に、条件の名前を ja・en の辞書に出力しなければならない（decisions.md Q39）。
- IF overlay の効果か発動条件が不正なとき（効果のレベルの数がスキルの最大レベルと違う、存在しない条件 ID を参照している、数値が有限でない、条件 ID が重複している、条件の名前が ja・en のどちらかに無い） THEN システムは、ファイル名と行を示して生成を失敗させ、`dist/` に何も書いてはならない。
- THE system SHALL ja の辞書の説明文に攻撃力・会心率・会心倍率の数値が明記され、上の4種の効果で表せるスキルを、種別を問わずすべて説明文どおりの数値で埋めなければならない。マスターの版を上げて `dist/` を再生成し、代表のスキル（攻撃・見切り・超会心・弱点特効・挑戦者）の全レベルの効果を、コミット済みの `dist/` に対するテストで確かめなければならない（decisions.md Q37）。
- THE system SHALL `packages/solver` に、武器・発動スキルとそのレベル・有効な条件を受け取り、攻撃力・会心率・会心倍率・期待値を返す純関数を提供しなければならない。計算は decisions.md Q35 の式に従い、期待値を丸めてはならない。
- WHEN 会心率の合計が −100〜100 の外のとき THE system SHALL 範囲の端に丸めて計算しなければならない。会心率が負のときは、会心倍率にかかわらず負会心（0.75 倍）として会心補正を計算しなければならない。
- THE system SHALL 有効な条件に含まれない条件を持つ効果を、計算に数えてはならない。`activeConditionIds` の指定が無い、または空のときは、条件の無い効果だけで計算しなければならない。
- IF `activeConditionIds` にマスターに無い条件 ID が含まれるとき THEN システムは、解なしではなく不正な要求としてエラーを返さなければならない（003 decisions.md Q18）。目的関数 `expectedDamage` は、不正な要求ではなくなる。
- WHEN 目的関数が `expectedDamage` のとき THE system SHALL 必須スキルの下限を満たす構成のうち期待値が最大のものから順に返し、2件目以降はそれまでに返した構成を除いた中での最大を返さなければならない。期待値が同点の構成は、防具用、次に武器用の空きスロットの Lv の合計が大きいものを選ばなければならない（decisions.md Q36）。
- WHEN 目的関数が `expectedDamage` のとき THE system SHALL 必須スキルに無いスキルの装飾品も、期待値を上げるなら付けなければならない。必須スキルにも期待値にも寄与しない装飾品を付けた構成を返してはならない。構成ごとの `score` には期待値を入れなければならない。
- THE system SHALL 目的関数が `expectedDamage` 以外のとき、003 と同じ構成と状態を返さなければならない（006 の変更で、既存の目的関数の結果を変えない）。
- THE system SHALL `expectedDamage` で返すすべての構成について、ソルバーと独立に数え直した期待値が `score` と一致して降順に並ぶことと、小さなテスト用のマスターで全構成を総当たりした最大と1件目の期待値が一致することを、テストで確かめなければならない。
- WHEN 測定を実行したとき THE system SHALL `packages/data/dist/` の現行のマスターで、条件をすべて有効にした `expectedDamage` について、003 と同じ必須スキル 3／6／10 個 × 解あり／解なしの各ケースの検索1回の合計時間を出力し、3 秒の基準に対する合否とともに `design/tech-stack.md` に記録しなければならない。CI では時間を測らず、3 秒を超えたら対策を `specs/open-questions.md` に新しい Q として起票しなければならない（decisions.md Q36）。

## スコープ外
- 属性の期待値（`element_add`・`element_mul`・会心撃【属性】。open-questions.md Q40）
- 検索画面の目的関数の選択肢への追加・発動条件のトグル・期待値の表示・説明文への数値の補完（007。decisions.md Q38）。web は、MasterBundle に発動条件の一覧が増えることに伴うテスト用のマスターの追従だけを行い、画面は変えない
- 斬れ味・モーション値・肉質・アイテム・食事の効果（decisions.md Q35）
- 発動率（条件が発動している時間の割合）の扱い
- 説明文に数値が無いスキル（例: 連撃）と、属性・状態異常・オトモに効くスキルの効果
- 極意スキル（`raisesMaxLevel`）の扱い
- 測定で 3 秒を超えたときの対策の実装（新しい Q で決める）

## 契約差分
- なし（API を持たない。ソルバーはブラウザ内で動き、マスターは静的配信の JSON）

## 影響範囲
触る領域: data, solver, web
常時許可外の変更予定:
- `design/master-data.md`（発動条件の ID 規則・overlay の効果と発動条件の書式・検証規則・効果の数値の出典を足す）
- `design/tech-stack.md`（expectedDamage の測定の結果を記録する。decisions.md Q36）
- `packages/data/dist/master-2026.10.4.json`（生成物。効果と発動条件を足すため、版を上げて生成のコマンドで書く。版の値は plan で決める）
- `packages/data/dist/master-2026.10.4.ja.json`（生成物の ja の辞書。同上）
- `packages/data/dist/master-2026.10.4.en.json`（生成物の en の辞書。同上）
- `packages/data/dist/master-2026.10.3.json`（旧版。生成のコマンドが削除する）
- `packages/data/dist/master-2026.10.3.ja.json`（旧版の ja の辞書。同上）
- `packages/data/dist/master-2026.10.3.en.json`（旧版の en の辞書。同上）

## 依存する機能ID
- 002
- 003
