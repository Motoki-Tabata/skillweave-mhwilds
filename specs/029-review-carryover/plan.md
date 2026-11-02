# 029: review-carryover 計画

## スタック
- 既存のスタックのまま（`design/tech-stack.md`）。依存は足さない。
- API のテスト: JUnit・Testcontainers・`@MockitoSpyBean`。Web の単体テスト: Vitest。e2e: Playwright（Chromium）。型検査: `vue-tsc --build`（`tsconfig.vitest.json` が `src/test/**` も含む）。

## データモデル
なし

## 決定事項

### 楽観ロックのテスト（AC-1）
- D1: `CharmServiceTest`・`WeaponServiceTest`・`BuildServiceTest` に 1 件ずつ足す。`doThrow` で例外を作らず、実際の楽観ロックの失敗を起こす。
  - 手順: `service.create` で行を作り、`doAnswer` で `repository.saveAndFlush` の直前に `jdbc` で `version` を 1 つ進めてから `invocation.callRealMethod()` を呼ぶ。これで行バージョンの確認を通った後に、`UPDATE ... WHERE version = ?` が 0 行になる。対象は `CharmService.update`・`WeaponService.update`・`BuildService.rename`。
  - 検査: `ResourceConflictException` であることに加えて、`hasCauseInstanceOf(ObjectOptimisticLockingFailureException.class)` を見る。行バージョンの確認で弾く経路も同じ例外と同じ文言を返すため、原因を見ないと `catch` の分岐を通ったことを確かめられない。あわせて、行の中身（護石は `payload`、構成は `name`）が変わっていないことを見る。
  - `CHANGED` は `private` のままにする。テストのために公開範囲を変えない。
  - 理由: 既存のテストは `doReturn(false)` で確認だけをすり抜けて、DB の拒否は本物を受けている。同じ形にすると、Hibernate の例外が `ObjectOptimisticLockingFailureException` に変換されることまで確かめられる。`doThrow` では `catch` する型の誤りを検出できない。
  - `callRealMethod` が spy の repository で動かないときは、`doThrow(new ObjectOptimisticLockingFailureException(...))` に替え、その旨を完了報告に書く。

### ソルバー（AC-2・AC-3）
- D2: `verifyBuild.ts` に、`build.decorations` の `decorationId` が `request.excludedDecorationIds` にあれば `除外された装飾品 <ID> を付けている` を積む関数を足し、`verifyBuild` から呼ぶ。`checkPlacement` は `request` を受けていないので引数を増やさない。`verifyBuild.spec.ts` の「除外した防具の使用」の隣に、`validBuild()` の装飾品を除外した要求で `除外された装飾品` を含むことを見るテストを足す（防具の検査の文言と区別するため、`除外` だけで照合しない）。
- D3: `DamageColumns` から `thetaCol` を除き、`damageModel.ts` の戻り値を `damage: { stage1Cost }` にする。`stage1Cost` を作るローカル変数の `thetaCol` は残す。`stage1Cost` の名前は変えない（spec のスコープ外）。

### `MD_OUTLINE_CLASS` の検証（AC-4・AC-5）
- D4: 単体テストは `AuthControls.spec.ts`（ログインのリンク）と `ResultsPanel.save.spec.ts`（`[data-save-index]` の保存のボタン。`ResultBuildCard` 単体の spec は無い）に足す。`MD_OUTLINE_CLASS` を空白で分けた各トークンが、要素の `classList` にあることを見る。`Button` は `cn`（tailwind-merge）を通すので、文字列の部分一致では一部のトークンが落ちたことを検出できない。
- D5: e2e は `apps/web/e2e/md-outline-hover.spec.ts` に置く。
  - ページ: 未ログイン（`**/api/auth/me` を 401）で、`**/api/shared-builds/*` を 404 にした `/s/<短い ID>`。ヘッダーの「Discord でログイン」と、`outline` の実物の「装備検索へ」のリンクが同じページに出る。画面幅は 1280px、`<html>` に `dark` があることを確かめる。
  - 比較: `Button` は `transition-all` なので、`page.addStyleTag` で `transition: none !important` を入れて色の途中の値を読まないようにする。「装備検索へ」の hover 前と hover 中の算出された背景色を読み、**違うことを確かめてから**（hover が効かず透明どうしで一致する空振りを防ぐ）、ログインのリンクを hover して `toHaveCSS('background-color', <outline の hover の色>)` で比べる。色の値は書き写さない（トークンを変えてもテストが壊れないように）。
  - 既存のビルドの CSS（`apps/web/dist`）では `md:dark:hover:bg-muted` が `dark:hover:bg-accent/50` より後ろにあるので、通る見込みである。確定は e2e の結果で行う。
- D6: D5 の e2e が色の違いを示したら、e2e-agent はテストを緩めずに報告する。メインは `tsod-build` の手順で原因を切り分け、web-agent を新たに起動して `mdOutlineClass.ts` を直す（026 AC-6 を正とする）。AC-13 の例外なので、handoff の「PR 本文に必須の記載事項」に書く（decisions.md Q121）。通れば `src/main` のクラスは変えない。

### e2e の `uuidV7()`（AC-6）
- D7: `apps/web/e2e/support/uuid.ts` に `export function uuidV7()` を置き、3 本の spec の定義を消す。本体は 3 本とも同じ。`randomBytes` の import は `build-save.spec.ts`・`charm-save.spec.ts` から除き、`build-share.spec.ts` は `shortId` の生成で使うので残す。

### スケルトンの遅延（AC-7）
- D8: 手書きの `ref`・タイマー・`watch`・`onBeforeUnmount` を消し、次の式で `useSkeletonDelay` を呼ぶ。テンプレートを変えないよう、変数名はそのままにする。使わなくなった import（`LOADING_SKELETON_DELAY_MS` など）も消す。

  | 部品 | 変数 | 条件 |
  |---|---|---|
  | `BuildsGate` | `showSkeleton` | `phase.value === 'loading'` |
  | `SearchView` | `showSkeleton` | `master.status === 'loading'` |
  | `CharmsView` | `showSkeleton` | `master.status === 'loading' \|\| charms.status === 'loading'` |
  | `WeaponsView` | `showSkeleton` | `master.status === 'loading' \|\| weapons.status === 'loading'` |
  | `WeaponDialog` | `showLoading` | `props.open && weapons.status === 'loading'` |
  | `CharmCard` | `showLoading` | `charms.status === 'loading'` |

  - 6 箇所とも `immediate: true` と既定の flush で `useSkeletonDelay` と同じ。監視の対象が `status` から真偽値に変わっても、読み込み中でない状態どうしの遷移ではタイマーが立たないので挙動は変わらない。

### Combobox の入力欄（AC-8）
- D9: `components/common/comboboxFieldClass.ts` に定数 `COMBOBOX_FIELD_CLASS` を置く。コンポーネントで包まず、`mdOutlineClass.ts` と同じ形にする。
  - 理由: 共通にしたいのは見た目のクラスだけで、`v-model`・`display-value`・`blur`・`aria-*` は行ごとに違う。包むと Reka の `ComboboxInput` への受け渡しを増やすことになり、候補の選択を壊す余地が増える。
  - 定数に入れるのは `CharmSkillRow`・`WeaponBonusRow` と同じ一式から `truncate` を除いたもの。`aria-invalid:border-destructive` と `disabled:*` を含む。`ArmorLockRow`・`ExcludeCard` は `aria-invalid` も `disabled` も渡していないので（`Combobox` の根にも `disabled` が無い）、見た目は変わらない。
  - 使い方: `CharmSkillRow`・`WeaponBonusRow` は `:class="[COMBOBOX_FIELD_CLASS, 'truncate']"`、`ArmorLockRow` はそれに既存の `{ 'text-muted-foreground': ... }` を足す。`ExcludeCard` は `:class="COMBOBOX_FIELD_CLASS"`（`truncate` なし）。`components/ui/combobox/ComboboxInput.vue` は変えない。
  - テスト: 各行の入力欄に定数の各トークンがあることと、`truncate` の有無を、既存の spec（`ExcludeCard.spec.ts`・`ArmorLockCard.spec.ts`・`CharmsView.spec.ts`・武器の行を描画している spec）で見る。

### 属性の種類の型（AC-9・AC-10・AC-11）
- D10: `constants/weapons.ts` の `ELEMENT_TYPES` を `[...] as const satisfies readonly ElementTypeLabel[]` にし、`export type ElementType = (typeof ELEMENT_TYPES)[number]['id']` を足す。`lib/weapons/types.ts` の `WeaponPayload.element.type` をこの型にする。
  - `WeaponDraft.elementType` は `string | null` のままにする。`validate.spec.ts` が `elementType: 'unknown'` を `element-type` のエラーにすることを見ており、下書きは検証の前の値を持つため。`elementTypeName(id: string)` も変えない。
  - `lib/weapons/input.ts` の `draftToPayload` は `draft.elementType as ElementType` にする。この関数は「検証を通った下書き」を受ける前提で、同じ関数に `draft.baseWeaponId!` と `level as 1 | 2 | 3` がある。型ガードで分岐すると、通らない分岐を足すことになり、検証を通っていない値の扱いも変わる。
- D11: `lib/api/weapons.ts` の要求の型を `components['schemas']['CreateCustomWeaponRequest']`・`['UpdateCustomWeaponRequest']` のまま使う。`lib/builds/payload.ts` のキャストを除く（`type: payload.element.type`）。`toAccountWeapon` の `payload as WeaponPayload` は残す（`isElement` を厳しくしないため。decisions.md Q120）。
  - テスト用の偽物（`src/test/support/weaponsApi.ts`）は既に `as unknown as WeaponPayload` で受けているので変えなくてよい。テストの型の注釈が足りなければ足す（期待値は変えない）。
- D12: AC-11 の両方向の検出。`WeaponPayload` を契約の型へ代入できるかだけでは、**`ELEMENT_TYPES` にだけある種類**しか検出できない（契約にだけある種類は代入を妨げない）。そこで `lib/api/weapons.ts` に次を置く。`schema.ts` の import を `lib/api/` の中に閉じるため、ここに置く。

  ```ts
  type ContractElementType = NonNullable<
    components['schemas']['CustomWeaponPayload']['element']
  >['type']

  /** T が契約の属性の種類と過不足なく一致すれば true。 */
  export type MatchesContractElementType<T> = [T] extends [ContractElementType]
    ? [ContractElementType] extends [T]
      ? true
      : false
    : false

  type AssertTrue<T extends true> = T

  /** `ELEMENT_TYPES` と契約の列挙がずれると、ここが型検査で失敗する。 */
  export type ElementTypesInSync = AssertTrue<MatchesContractElementType<ElementType>>
  ```

  - 同じ形をスクラッチの `tsc`（TypeScript 6.0.3）で確かめた。一致なら通り、`ElementType | 'extra'` は `AssertTrue` で失敗する。`as const satisfies` のままで `.find` の戻りも `string` のまま使える。
  - 回帰のテスト: `src/test/lib/api/weapons.spec.ts` に、`const extra: MatchesContractElementType<ElementType | 'extra'> = false`、`const missing: MatchesContractElementType<Exclude<ElementType, 'fire'>> = false`、`const same: MatchesContractElementType<ElementType> = true` を書く。判定が壊れると `pnpm type-check` が失敗する。
  - 実物での確認: web-agent は `ELEMENT_TYPES` に種類を足した場合と 1 つ消した場合のそれぞれで `pnpm --filter @swv/web run type-check` が失敗することを確かめ、出力を完了報告に貼ってから元に戻す（消す側が「契約にだけある種類」に当たるので、`schema.ts` は触らない）。
  - `lib/api/schema` の import が `lib/api/` の中だけであることは、`grep` の結果を完了報告に貼る。

### 未使用のコード（AC-12）
- D13: `lib/api/charms.ts` の `CHARMS_FAILURE_MESSAGES` の再エクスポートとそのコメントを消す。`ExcludeCard.vue` の `const root` と `ref="root"` を消す（`ref` の import は `open` などで使うなら残す）。

### 挙動を変えないこと（AC-13）
- D14: 既存のテストの期待値を変えない。型の注釈と import の追従だけを許す。期待値を変えないと通らないときは、そのテストを直さずに報告する。既定値の変更は無いので、旧既定を期待するテストの洗い出しは要らない。

## 常時許可外の変更
- なし
