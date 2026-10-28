# 025: shared-parts-refactor

## 目的 / ユーザーストーリー
このアプリの開発者として、機能ごとに複製された部品（削除確認ダイアログ・保存先のストアの状態機械・ダイアログのオーバーレイ・404／409 の例外とハンドラ）を共有部品にまとめたい。次の保存機能（013 user-weapon-save）が同じ複製を増やさず、共有部品に種類ごとの違いを渡すだけで作れるようにするためである。画面と API の挙動は変えない（`tasks/lessons.md` 2026-10-26・2026-10-28 の3項目、011 plan D16）。

用語:
- 保存先の状態機械: 護石のストアが持つ、保存先（アカウントか端末）の判定・一覧の読込・ログアウトと 401 での端末への切り替え・古い応答の破棄・409／404 のあとの読み直し・保存と削除の処理の全体（decisions.md Q73）。
- 書込結果の型: 護石のストアの `save`・`remove` が返す `saved`・`failed`・`conflict`・`notFound`・`expired`・`discarded`（decisions.md Q74）。

## 受入基準（EARS記法）
- AC-1: THE system SHALL 護石・個体差のある武器・保存した構成の削除の確認に `components/common/DeleteConfirmDialog.vue` を使い、`CharmDeleteDialog.vue`・`WeaponDeleteDialog.vue` を残してはならない（decisions.md Q76）。
- AC-2: WHEN 護石か個体差のある武器の削除の確認を開いたとき THE system SHALL いまと同じタイトル・本文・ボタン・閉じたときのフォーカスの戻し先にしなければならない。本文には、アカウントの護石では「同じアカウントのほかの端末からも消えます。」を、検索条件で選んでいる武器では「検索条件の武器の選択も外します。」を含めなければならない（decisions.md Q76）。
- AC-3: THE system SHALL 基準幅でヘッダーとクレジットのバーを覆わないダイアログのオーバーレイを `components/common/` の1つの部品にし、`PickerDialog.vue`・`BuildDialogFrame.vue` の両方がこれを使わなければならない。オーバーレイの位置・色・アニメーションを変えてはならない。
- AC-4: THE system SHALL 保存先の状態機械を1つの汎用の部品にし、護石のストアはアカウントと端末の両方で、個体差のある武器のストアは端末だけでこれを使わなければならない。種類ごとに違うもの（素のオブジェクトへの変換・スキーマ版・保存先を開く関数・API・トーストの文言）は部品の引数で受け取らなければならない（decisions.md Q73）。
- AC-5: THE system SHALL 護石のストアの公開する状態と操作の名前・型・挙動（保存先の判定・端末への切り替え・トーストの文言・書込結果）を変えてはならない（decisions.md Q73）。
- AC-6: WHERE 汎用の部品に API を渡さないとき（個体差のある武器） THE system SHALL いまと同じく認証の判定を待たずに端末の保存先を開き、ログイン・ログアウト・401 で保存先や一覧を変えてはならない（decisions.md Q73）。
- AC-7: THE system SHALL 個体差のある武器のストアの `save`・`remove` を書込結果の型で返さなければならない。武器の登録・編集・削除の画面の挙動（成功のときの表示とトースト、失敗のときにトーストを出して一覧を変えないこと）を変えてはならない（decisions.md Q74）。
- AC-8: WHILE 個体差のある武器の削除の応答を待つ間 THE system SHALL 同じ武器の削除を重ねて受け付けてはならない（decisions.md Q73）。
- AC-9: THE system SHALL ID の降順の並べ替えの関数を、護石・個体差のある武器・保存した構成のストアで共有しなければならない。保存した構成のストアは保存先の状態機械を使わず、ログインが必要の状態の扱いを変えてはならない（decisions.md Q73）。
- AC-10: THE system SHALL 404 と 409 の例外を、機能名の付かない汎用の例外（文言を引数で受け取る）の1つずつにまとめ、`ApiExceptionHandler` のハンドラを 404 と 409 の1本ずつにしなければならない。`CharmNotFoundException`・`CharmConflictException`・`BuildNotFoundException`・`BuildConflictException` を残してはならない（decisions.md Q75）。
- AC-11: THE system SHALL 護石と保存した構成の API の応答（ステータス・`application/problem+json` の本文・`detail` の文言）を変えてはならない（decisions.md Q75）。
- AC-12: THE system SHALL API のテストで、護石と保存した構成の、更新の 404（自分の行が無い ID・形式の不正な ID）と 409（行バージョンの不一致・作成の ID の衝突）の応答の `detail` が、いまの文言のままであることを検証しなければならない（decisions.md Q75）。
- AC-13: THE system SHALL Web の単体テストで、汎用の部品を API を渡さずに使ったときに、認証の判定を待たないこと、ログアウト・401 で一覧を変えないこと、削除の応答待ちの間は同じ ID の削除を受け付けないことを検証しなければならない（decisions.md Q73）。
- AC-14: THE system SHALL 既存の Web の単体テスト（`weapons.spec.ts` などの、武器の書込結果の型への追従を除く）・Playwright の e2e テスト・API のテスト・契約テストを、期待値を変えずに通さなければならない。

## スコープ外
- 画面の見た目の変更。MASTER.md と食い違う見出しの `font-semibold`・`shadow-lg`・AlertDialog の `ui/` 既定のオーバーレイ（`bg-black/80`）は 026 design-system-alignment で扱う
- 個体差のある武器のサーバーへの保存と、武器の API（013 user-weapon-save）
- 保存した構成のストアの状態機械の共通化（decisions.md Q73）
- API の入力の検査の持ち越し（open-questions.md Q72。013 で扱う）
- 404・409 の例外以外の API の共通化（コントローラの ID の解析など）と、端末の保存先（`lib/charms/storage.ts`・`lib/weapons/storage.ts`）の共通化
- `.claude/rules/api-spring.md` への「404・409 の例外は機能名を付けず共有する」の追記（`.claude/**` は区間の中で書かず、`tasks/lessons.md` の行き先として扱う）
- 契約の変更

## 契約差分
- なし（API の応答は変えない。decisions.md Q75）

## 影響範囲
触る領域: api, web
常時許可外の変更予定: なし

## 依存する機能ID
- 008, 010, 011
