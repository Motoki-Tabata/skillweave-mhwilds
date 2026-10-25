# 007: damage-ui

## 目的 / ユーザーストーリー
ハンターとして、検索で見つかった構成の火力（物理の期待値）を見比べ、火力が最も高い構成を探したい。そのために、発動条件（例: 有効部位への攻撃）をトグルで選んで検索し、構成ごとの期待値と内訳を見たい。また、スキルが何をするのかを、ゲーム内の説明文と効果の数値で確かめたい。006 damage-model が揃えた計算（`evaluateDamage`）と最大化（`maximize: expectedDamage`）を、検索画面から使えるようにする。

用語:
- 火力: 物理の期待値と、その内訳（攻撃力・会心率・会心倍率）。006 decisions.md Q35 の式で計算する。属性は含めない。
- 発動条件: 条件付きの効果が有効になるきっかけ。マスターの `conditions` の1件。名前は辞書の `name`。
- 補完: スキルのレベルの効果（`effectsByLevel`）から画面で作る数値の文。辞書には保存しない（`temp/initial-design.md` §7.4）。

## 受入基準（EARS記法）
- THE system SHALL 検索条件の目的の選択肢に「火力の最大化」を足し、選んで検索したときは `{ kind: 'maximize', metric: 'expectedDamage' }` で要求し、結果をソルバーが返した順に並べなければならない（006 decisions.md Q38）。
- THE system SHALL マスターの発動条件をすべて、辞書の名前でトグルとして出さなければならない。トグルの既定はすべてオフとし、状態を保存してはならない（decisions.md Q44）。
- WHEN 検索したとき THE system SHALL その時点でオンの発動条件の ID を、目的にかかわらず要求の `activeConditionIds` に入れなければならない。オンの条件が無いときは空の配列にしなければならない（decisions.md Q44）。
- THE system SHALL 目的にかかわらず、結果のすべての構成に期待値・攻撃力・会心率・会心倍率を表示しなければならない。値は `packages/solver` の `evaluateDamage` に、検索したときの武器の攻撃力と会心率・構成の発動スキル・検索したときにオンの条件を渡して得なければならない（decisions.md Q43）。
- THE system SHALL 期待値と攻撃力を小数第1位、会心率を整数の %、会心倍率を小数第2位に四捨五入して表示しなければならない。丸めは表示だけで行い、並び順に使ってはならない（decisions.md Q43）。
- WHEN 検索の後に発動条件のトグルか武器の選択を変えたとき THE system SHALL 表示中の構成の火力を変えてはならず、次の検索から反映しなければならない（decisions.md Q44）。
- THE system SHALL 結果の構成の発動スキルごとに、発動しているレベルの ja の説明文と補完を表示しなければならない（decisions.md Q45）。
- THE system SHALL 必須スキルを選ぶダイアログで、スキルのレベルごとに ja の説明文と補完を表示しなければならない（decisions.md Q45）。
- THE system SHALL 補完を、そのレベルの `effectsByLevel` の効果をすべて使って画面で作らなければならない。条件付きの効果には条件の名前を添え、効果が無いレベルには補完を出してはならない（decisions.md Q45）。
- IF 辞書にそのレベルの説明文が無いとき THEN システムは、説明文を出さず、補完があれば補完だけを表示しなければならない。
- WHEN 検索中に Worker の `progress` のメッセージで構成が届いたとき THE system SHALL 目的にかかわらず、その構成と火力を届いた順に結果へ足して表示し、検索が終わったらソルバーが返した結果で置き換えなければならない（decisions.md Q46）。
- IF 検索中に検索を取り消したとき THEN システムは、届いた構成も消して検索前の状態に戻し、取り消した旨を表示しなければならない（004 の取り消しを変えない。decisions.md Q47）。
- IF 火力の最大化の検索が時間の上限で打ち切られたとき THEN システムは、他の目的と同じ上限（`SOLVE_TIMEOUT_MS`）で打ち切り、打ち切りまでに見つかった構成とその火力、打ち切られた旨を表示しなければならない（004 の時間切れの表示を変えない。decisions.md Q48）。
- WHEN 測定を実行したとき THE system SHALL ブラウザの Worker 上で、019 と同じ条件の火力の最大化の1件目までの時間と合計時間を測り、`design/tech-stack.md` に記録しなければならない。CI では測ってはならず、1件目までの時間の最大が 3 秒を超えたときは対策を `specs/open-questions.md` に新しい Q として起票しなければならない（decisions.md Q49）。
- THE system SHALL 火力の最大化で検索し、発動条件のトグルを反映した火力と、発動スキルの説明文と補完が表示されるまでを、e2e テストで確かめなければならない。

## スコープ外
- `expectedDamage` の検索時間の対策（Q41）・2 段目が解なしのときの縮退・実データのテストの `timeoutMs` の明示。019 damage-solve-perf で済ませた（decisions.md Q42）
- 目的関数ごとの時間の上限・件数の既定の変更（decisions.md Q48）
- 取り消したときに届いた構成を残すこと（decisions.md Q47）
- 属性の期待値（`element_add`・`element_mul`・会心撃【属性】。open-questions.md Q40）
- 検索の後にトグルを変えたときの火力の即時の再計算と並べ直し（decisions.md Q44）
- 発動条件のトグルの状態の保存・発動率の扱い
- en の説明文の表示（言語の切り替え）
- 個体差のある武器の火力（008 user-weapon）
- `packages/solver`・`packages/data` の計算・生成物の変更（006 のものをそのまま使う）

## 契約差分
- なし（API を持たない。ソルバーはブラウザ内で動き、マスターと辞書は静的配信の JSON）

## 影響範囲
触る領域: web
常時許可外の変更予定:
- `design-system/skillweave/MASTER.md`（区間 B で決める発動条件のトグル・火力の表示・説明文と補完の部品とパターンを足す）
- `design/tech-stack.md`（ブラウザの Worker 上での火力の最大化の測定の結果を記録する。decisions.md Q49）
- `packages/solver/package.json`（メインスレッドから期待値の計算関数だけを読むサブパスを exports に足す場合。HiGHS をメインのバンドルに含めないため。要否は plan で決める）

## 依存する機能ID
- 004
- 006
- 019（Q41 の対策の機能 damage-solve-perf。マージ済み。進捗の通知の構成（`progress` の `build`）を逐次表示に使う。decisions.md Q42・Q46）
