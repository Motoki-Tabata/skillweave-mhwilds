# 036: appraised-charm-table

## 目的 / ユーザーストーリー
プレイヤーとして、登録した鑑定護石が抽選テーブルに合うかを「未検査」ではなく「合格」か「テーブル不一致」で知りたい。入力の誤りに気づけるようにするためで、017 reverse-lookup の逆引きの土台にもなる。今のマスター（2026.10.5）は `appraisedCharm` が空（パターン 0 件・群 0 件）なので、どのレア度も「未検査」になる（017 decisions.md Q166）。

用語:
- 抽選テーブル: マスターの `appraisedCharm`。群（`groups`。A〜J の 10 種で、それぞれ（スキル, レベル）の組の集まり）と、レア度ごとのパターン（`patterns`。スキル1〜3 の群の組とスロットの並び）からなる。型（`AppraisedCharmPattern`・`CharmSkillGroup`）と検証の規則 `appraised-charm` は 002・005 で実装済みで、036 では変えない。
- 表に入れたレア度: レア5〜8 のうち、Q171 の手順で出典の食い違いが解けて、036 で抽選テーブルに入れたレア度（decisions.md Q172）。

画面に出す値の出どころ: 照合の結果（合格・テーブル不一致・未検査）は、`packages/data` が生成する JSON の `appraisedCharm` を、`apps/web/src/main/lib/charms/match.ts` の `matchCharm` が照らして出す（005 decisions.md Q33）。036 は JSON の中身だけを変え、照合と画面は変えない。

## 受入基準（EARS記法）
- AC-1: THE system SHALL 抽選テーブルを overlay `packages/data/overlays/appraised-charm.yaml` の `appraisedCharm` に定義し、群 A〜J の中身と、表に入れたレア度ごとのパターンとスロットの並びを、生成したマスターの `appraisedCharm` に出力しなければならない。中身は、エージェントが出典の候補のサイトから作った下書きのうち、オーナーが確かめて採用したものに限る（decisions.md Q170・Q172・Q175）。
- AC-2: THE system SHALL overlay の各スキルを `sk:<gameId>` の ID で書き、同じ行に ja のスキル名をコメントで添えなければならない（decisions.md Q175）。
- AC-3: WHEN 抽選テーブルを足したマスターを生成したとき THE system SHALL 版を 2026.10.5 から上げて `dist/` に現行の版だけを残し、`appraisedCharm` 以外の内容（ID・名前・読み・分類・効果・防具など）を 2026.10.5 から変えてはならない。
- AC-4: THE system SHALL 生成したマスターの抽選テーブルについて、次を `packages/data` のテストで検証しなければならない。パターンのレア度が 5〜8 である。パターンが参照する群がすべて `groups` にある。群のスキルのレベルが 1 以上そのスキルの最大レベル以下である。レア5〜7 のスロットに武器用の枠が無く、レア8 のスロットの 1 枠目が武器用 Lv1 である（`design/master-data.md`「ゲーム仕様の確認結果」）。
- AC-5: THE system SHALL オーナーが提供した手持ちの鑑定護石（レア度・スキルとレベル・スロットの並び）をすべて fixture にし、生成した実際のマスターで `matchCharm` がそのすべてに「合格」を返すことを、`apps/web/src/test` の単体テストで検証しなければならない（decisions.md Q176）。
- AC-6: WHEN 表に入れたレア度の護石を照合したとき THE system SHALL 「未検査」ではなく「合格」か「テーブル不一致」を返さなければならない。表に入れていないレア度の護石には、今のまま「未検査」を返さなければならない。
- AC-7: THE system SHALL `design/master-data.md` に、抽選テーブルについて次を記録しなければならない。読み比べたサイト、取得日、出典ごとの最終更新日、ゲームの版（「不明（取得日時点の最新と推定）」）、未検証の箇所（多数決か和集合で採った箇所と、手持ちの護石が 3 件に満たないレア度）、外したレア度とその理由（decisions.md Q170・Q171・Q173・Q176）。
- AC-8: THE system SHALL 照合（`match.ts`）と、護石の入力・一覧・ソルバーの画面と挙動を変えてはならない。表の誤りの見込みや出典が非公式であることを、画面に示してはならない（decisions.md Q174・Q177）。
- AC-9: WHEN 抽選テーブルを入れたマスターで E2E を実行したとき THE system SHALL 護石を登録する既存の E2E（`charm-input`・`charm-save`・`guest-draft-import`・`charm-ocr`）をすべて通さなければならない。登録の手順は、表に合う護石を登録するか、テーブル不一致の確認を経て登録する形に追従させてよい。
- AC-10: THE system SHALL 取得したサイトの HTML、抽選テーブルの下書き、名前を ID に直す使い捨てのスクリプトを、リポジトリにコミットしてはならない。取得の対象から Phantom Brawlers を外さなければならない（decisions.md Q170・Q175）。

## スコープ外
- 照合（`match.ts`）の変更。同じスキルの重複の禁止は、005 decisions.md Q32 の入力の制約に任せる（decisions.md Q174）
- 画面の変更（非公式・未検証である旨の注記を含む。decisions.md Q177）
- 型（`AppraisedCharmPattern`・`CharmSkillGroup`）と、検証の規則 `appraised-charm` の変更
- パターン・群の中のスキル・スロットの重み（確率）（017 decisions.md Q169）
- 017 reverse-lookup の逆引きと、仮想の護石の候補の作り方
- 名前を ID に直すスクリプトのパイプラインへの組み込みと、抽選テーブルの定期的な取得や更新
- 拡張「アセンダンス」で加わりうるレア度への対応（005 decisions.md Q32 のレア度 5〜8 の見直し）
- 生産護石（`charms`）の変更

## 契約差分
- なし（API は抽選テーブルを持たない。マスターは静的配信の JSON で、保存済みの構成の `masterVersion` の形も変えない）

## 影響範囲
触る領域: data, web
常時許可外の変更予定:
- `design/master-data.md`（抽選テーブルの出典・取得日・ゲームの版・未検証の箇所・外したレア度を記録する）
- `packages/data/dist/master-2026.11.1.json`（生成物。抽選テーブルを足すため、版を上げて生成のコマンドで書く。版の値は plan で決める）
- `packages/data/dist/master-2026.11.1.ja.json`（生成物の ja の辞書。同上）
- `packages/data/dist/master-2026.11.1.en.json`（生成物の en の辞書。同上）
- `packages/data/dist/master-2026.10.5.json`（旧版。生成のコマンドが削除する）
- `packages/data/dist/master-2026.10.5.ja.json`（旧版の ja の辞書。同上）
- `packages/data/dist/master-2026.10.5.en.json`（旧版の en の辞書。同上）

## 依存する機能ID
- 002
- 005
