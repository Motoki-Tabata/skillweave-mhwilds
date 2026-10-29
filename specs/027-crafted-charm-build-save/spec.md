# 027: crafted-charm-build-save

## 目的 / ユーザーストーリー
プレイヤーとして、生産護石を使った検索結果の構成も、鑑定護石を使った構成と同じく保存して、保存した構成の画面で開き直したい。021 crafted-charm で生産護石を候補に含められるようになったが、生産護石を使った構成は保存できない（021 decisions.md Q78）。そのため、良い構成が見つかっても手元に残せない。

用語:
- 生産護石: マスターの `charms`（ID は `CharmId`。例: `ch:-1137475456:3`）。素材で作れる、スキルが固定の護石。
- 鑑定護石: 005 で手入力して登録する護石（ID は UUIDv7）。
- 生産護石の形・鑑定護石の形: 構成の保存の契約 `BuildCharm` の 2 つの形。生産護石の形は `{kind: 'crafted', charmId}`、鑑定護石の形はいまの `{id, payload}`（decisions.md Q92）。

## 受入基準（EARS記法）
- AC-1: THE system SHALL 構成の保存の契約で、`BuildPayload.charm` に、鑑定護石の形と null に加えて、生産護石の形 `{kind: 'crafted', charmId}` を受け付けなければならない。鑑定護石の形と `schemaVersion`（1）は変えてはならない（decisions.md Q92）。
- AC-2: WHEN ログインしたユーザーが、護石が生産護石の形の構成を `POST /api/builds` で作成したとき THE system SHALL 201 で保存し、一覧・名前の変更の応答で、保存した `charm` をそのまま返さなければならない。`charmId` がマスターにあるかどうかは検査してはならない（decisions.md Q92）。
- AC-3: IF 生産護石の形の `charmId` が生産護石の ID の形（接頭辞 `ch:`・系統の数値・ランクの数値）に合わない、または `charm` が鑑定護石の形にも生産護石の形にも当てはまらないとき THEN システムは 400 で拒否しなければならない（decisions.md Q92）。
- AC-4: THE system SHALL 鑑定護石を使った構成と護石なしの構成を、これまでどおり保存・一覧・表示できなければならない。保存済みの構成（鑑定護石の形・null）は、変換せずに読めなければならない（decisions.md Q92）。
- AC-5: WHEN 検索結果の構成が生産護石を使っているとき THE system SHALL その構成のカードに、鑑定護石を使った構成と同じ保存の操作を出し、生産護石を使った構成は保存できない旨の表示を出してはならない。未ログインのときの扱いは鑑定護石を使った構成と同じにしなければならない。
- AC-6: WHEN 生産護石を使った構成を保存したとき THE system SHALL 護石を生産護石の形で送り、生産護石の ID の参照だけを保存しなければならない。生産護石のレア度・スキル・スロットの写しを送ってはならない（decisions.md Q93）。
- AC-7: WHEN 生産護石を使った構成を保存した構成の画面で開いたとき THE system SHALL 構成のカードの護石の節に、その生産護石の名前（ja の辞書の名前）・レア度・スキル・スロットを、開いたときのマスターから引いて、検索結果の構成のカードと同じ形で表示しなければならない（decisions.md Q93）。
- AC-8: IF 保存した構成の生産護石の ID がいまのマスターに無いとき THEN システムは、構成のカードの護石の節に不明な護石である旨を ID とともに示し、構成のほかの内容（防具・装飾品・発動スキル・空きスロット・火力）は表示しなければならない（decisions.md Q93）。
- AC-9: THE system SHALL Web の構成の応答の検査で、生産護石の形を受け付けなければならない。`charm` が鑑定護石の形・生産護石の形・null のどれでもない応答は、これまでどおり形の合わない応答として扱わなければならない。
- AC-10: THE system SHALL Playwright（Chromium）の e2e テストで、「鑑定護石を登録せずに検索し、生産護石を使った構成を保存して、保存した構成の画面でその生産護石の名前が表示される」流れを検証しなければならない。

## スコープ外
- 生産護石の内容（レア度・スキル・スロット）の写しを構成に保存すること（decisions.md Q93）
- `BuildCharm` の鑑定護石の形に `kind` を付けること・`schemaVersion` を上げること（decisions.md Q92）
- 生産護石の ID がマスターにあるかどうかのサーバーでの検査（011 decisions.md Q68 と同じ）
- API の入力の検査の持ち越し（文字列の項目の型の変換・`element` の null・U+0000。open-questions.md Q72）
- 保存した構成から検索条件を復元すること（011 decisions.md Q63）
- 構成の共有（012 build-share）とゲストの構成の端末内の保存（open-questions.md Q70）
- 結果に出す生産護石のランクを、構成に足りる最小のランクへ下げること（021 decisions.md Q77）

## 契約差分
- 変更: スキーマ `BuildPayload`（`charm` の `oneOf` に生産護石の形を足す。鑑定護石の形・null は変えない）
- 追加: スキーマ `BuildCraftedCharm`(kind: `crafted`, charmId: 生産護石の ID の形の文字列)
- 変更: POST /api/builds（req の `payload.charm` に生産護石の形を受け付ける）・GET /api/builds と PATCH /api/builds/{id}（res の `payload.charm` に生産護石の形が入りうる）

## 影響範囲
触る領域: contracts, api, web
常時許可外の変更予定: なし

## 依存する機能ID
- 011
- 021
