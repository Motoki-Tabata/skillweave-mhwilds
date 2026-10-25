# 019: damage-solve-perf

## 目的 / ユーザーストーリー
ハンターとして、火力（期待値）を最大にする構成の検索を、ほかの目的関数と同じく数秒で終えたい。006 damage-model の `maximize: expectedDamage` は厳密な最大を返すが、実データでは検索1回に最大約 55 秒かかり、基準の 3 秒を大きく超える（`design/tech-stack.md`「HiGHS の expectedDamage の測定（006 damage-model）」）。019 では、厳密さ（006 decisions.md Q36）を保ったまま `packages/solver` の求解を速くし、007 damage-ui が画面から使える時間に収める（decisions.md Q41）。

用語:
- 合計時間: 検索1回（`solveBuilds` の呼び出し全体）の時間。HiGHS の初期化は含めない。
- 1件目までの時間: 検索の開始から、1件目の構成が求まって進捗の通知が呼ばれるまでの時間。
- 支配される候補: 同じ部位の防具（装飾品は同じ種別）で、必須スキルと期待値に寄与するスキルのレベル・スロット・シリーズ／グループが、すべて別の候補以下であるもの（decisions.md Q41）。

## 受入基準（EARS記法）
- WHEN 目的関数が `expectedDamage` のとき THE system SHALL 006 と同じく、必須スキルの下限を満たす構成のうち期待値が最大のものから順に返し、期待値が同点の構成は防具用、次に武器用の空きスロットの Lv の合計が大きいものを選ばなければならない（006 decisions.md Q36）。構成ごとの `score` には、返す構成から計算した期待値を入れなければならない。
- WHERE `expectedDamage` で支配される防具・装飾品を候補から外すとき THE system SHALL 1件目の期待値を外さないときと一致させ、2件目以降は、支配されない候補の中で、それまでに返した防具と護石の組を除いた最大を返さなければならない（decisions.md Q41）。
- THE system SHALL 目的関数が `expectedDamage` 以外のとき、019 の前と同じ候補・構成・状態を返さなければならない。
- THE system SHALL `expectedDamage` で返すすべての構成について、ソルバーと独立に数え直した期待値が `score` と一致して降順に並ぶこと、小さなテスト用のマスターで総当たりした最大と1件目の期待値が一致すること、2件目以降が上の候補の定義での総当たりの最大と一致することを、テストで確かめなければならない。
- WHERE 1段目の期待値を下限にして空き Lv の重みで解き直す2段目の求解を行うとき IF 2段目の求解が解なしになったとき THEN システムは、例外にせず、1段目の解の構成をその件として返さなければならない。
- WHEN `timeoutMs` を過ぎたとき THE system SHALL それまでに求めた構成を状態 `timeout` で返し、キャンセルされたときは `SolveCancelledError` を投げなければならない（003・006 と同じ扱い）。
- WHEN 測定を実行したとき THE system SHALL 006 と同じ条件（`packages/data/dist/` の現行のマスター・条件をすべて有効・マスターの先頭の武器・護石なし・件数 10・必須スキル 3／6／10 個 × 解あり／解なし・各 3 回・Node）で、ケースごとの合計時間と1件目までの時間を出力しなければならない。CI では時間を測ってはならない。
- THE system SHALL 測定の結果と 3 秒の基準に対する合否を `design/tech-stack.md` に記録しなければならない。合格は、全ケース・全回の合計時間の最大が 3 秒以下であることとする（decisions.md Q41）。
- IF 合計時間の最大が 3 秒を超えたとき THEN システムは、全ケース・全回の1件目までの時間の最大が 3 秒以下であることを合格とし、進捗の通知（`onProgress` と Worker の `progress` のメッセージ）で、求めた構成を1件ずつ呼び出し側へ渡さなければならない。1件目までも 3 秒を超えたときは、対策を `specs/open-questions.md` に新しい Q として起票しなければならない（decisions.md Q41）。
- THE system SHALL 実データのテスト（`packages/solver/src/test/solveBuilds.real.spec.ts`）のすべての要求で `timeoutMs` を明示し、時間切れで状態 `timeout` になったときに検算の対象が欠けたまま合格しないようにしなければならない。

## スコープ外
- 近似で候補を絞ってから並べ替える方式（006 decisions.md Q36 を変えない）
- `expectedDamage` の件数の既定を下げること（decisions.md Q41 で採らない）
- 画面での逐次表示・目的関数の選択肢・発動条件のトグル（007 damage-ui）
- ブラウザの Worker 上での時間の測定（007 で画面から測る）
- `expectedDamage` 以外の目的関数の高速化
- 属性の期待値（open-questions.md Q40）

## 契約差分
- なし（API を持たない。ソルバーはブラウザ内で動く）

## 影響範囲
触る領域: solver
常時許可外の変更予定:
- `design/tech-stack.md`（expectedDamage の再測定の結果と合否を記録する。decisions.md Q41）

## 依存する機能ID
- 006
