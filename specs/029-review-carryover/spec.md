# 029: review-carryover

## 目的 / ユーザーストーリー
開発者として、実装済みの機能のレビューで持ち越した未テストの分岐と検査の抜けを埋め、重複と未使用のコードを整理したい。回帰を検出できない箇所と、直すたびに複数のファイルを揃える必要がある箇所が残っていて、次の機能を安全に足しにくいため。ユーザーから見た画面と API の挙動は変えない。

## 受入基準（EARS記法）
- AC-1: WHEN 護石・武器の更新または構成の名前の変更が、行バージョンの確認の後に同時の更新と競合して楽観ロックに失敗したとき THE system SHALL `ResourceConflictException`（409）にしなければならない。この分岐を、`CharmService`・`WeaponService`・`BuildService` のそれぞれのテストで検証しなければならない。
- AC-2: IF 構成が要求の `excludedDecorationIds` の装飾品を付けているとき THEN システムは、テストの検算 `verifyBuild` で違反を返さなければならない。除外した防具の検査はこれまでどおりとする。
- AC-3: THE system SHALL `packages/solver` の `DamageColumns` から、未使用の `thetaCol` のフィールドを除かなければならない。求解の結果は変えてはならない。
- AC-4: THE system SHALL Web の単体テストで、ヘッダーのログインのリンク（`AuthControls.vue`）と結果の構成の保存のボタン（`ResultBuildCard.vue`）に `MD_OUTLINE_CLASS` のクラスが適用されていることを検証しなければならない。
- AC-5: THE system SHALL Playwright（Chromium）の e2e テストで、画面幅が `md` 以上のダークのテーマで、ヘッダーのログインのリンクを hover したときの算出された背景色が、026 AC-6 の `outline` の hover と同じ色であることを検証しなければならない。IF 同じ色でないとき THEN システムは、026 AC-6 を正としてクラスを直さなければならない（decisions.md Q121）。
- AC-6: THE system SHALL e2e の `uuidV7()` を `apps/web/e2e/support/` の 1 箇所に置き、`build-save.spec.ts`・`build-share.spec.ts`・`charm-save.spec.ts` からそれを使わなければならない。
- AC-7: THE system SHALL `BuildsGate`・`SearchView`・`CharmsView`・`WeaponsView`・`WeaponDialog`・`CharmCard` の読込中の表示の遅延を `useSkeletonDelay` で行わなければならない。遅延の時間と、読込中の表示を出す条件（`WeaponDialog` はダイアログが開いていて武器が読込中のとき）は変えてはならない。
- AC-8: THE system SHALL `CharmSkillRow`・`ArmorLockRow`・`ExcludeCard`・`WeaponBonusRow` の Combobox の入力欄の見た目の定義を、`apps/web/src/main/components/common/` の 1 箇所にまとめなければならない。それぞれの入力欄の見た目と操作（`truncate` の有無・`aria-invalid` と `disabled` の表示・候補の選択）は変えてはならない（decisions.md Q122）。
- AC-9: THE system SHALL `WeaponPayload.element.type` を、`constants/weapons.ts` の `ELEMENT_TYPES` から作る列挙型にしなければならない（decisions.md Q120）。
- AC-10: THE system SHALL `lib/api/weapons.ts` の要求の型を、`Omit` で差し替えずに契約の型のまま使い、`lib/builds/payload.ts` の属性の種類のキャストを除かなければならない。`lib/api/schema.ts` の import は `lib/api/` の中だけにしなければならない（decisions.md Q120）。
- AC-11: IF `ELEMENT_TYPES` と契約の属性の種類の列挙がずれたとき（どちらか一方にだけ種類があるとき。どちらの向きでも）THEN システムは、`pnpm type-check` で失敗しなければならない（decisions.md Q120）。
- AC-12: THE system SHALL `lib/api/charms.ts` の未使用の `CHARMS_FAILURE_MESSAGES` の再エクスポートと、`ExcludeCard.vue` の未使用の `root` ref を除かなければならない。
- AC-13: THE system SHALL AC-5 の修正を除いて、API の応答・契約・画面の見た目と操作・ソルバーの結果を変えてはならない。既存の単体テスト・e2e テスト・契約テストは、期待値を変えずに通らなければならない。

## スコープ外
- `NotFound.yaml` の説明の修正（decisions.md Q119・open-questions.md Q123）
- 契約の型を使う境界を `.claude/rules/web-vue.md` に書くこと（区間の中では書かない。`tasks/lessons.md` に起票済みで、マージの後に区間の外で直す。decisions.md Q120）
- `lib/api/builds.ts` の `isElement` を列挙で検査すること（列挙に無い種類の応答の扱いが変わる。decisions.md Q120）
- 選んだ武器を解決できないときの検索画面の扱い（画面の挙動が変わる。open-questions.md Q118）
- `damageModel.ts` の `stage1Cost` の名前の変更（019 handoff.md に持ち越しとあるが、機能マップの 029 の対象ではない）
- 010 handoff.md の持ち越しのうち楽観ロック以外（Web の作成の 409 の分岐・`reload()` 経由の 401・API 層の本文と CSRF の検査のテスト）
- `components/ui/combobox/ComboboxInput.vue` の変更（検索パレット用の見た目のまま）

## 契約差分
なし。

## 影響範囲
触る領域: api, web, solver
常時許可外の変更予定: なし

## 依存する機能ID
- 011, 020, 026
