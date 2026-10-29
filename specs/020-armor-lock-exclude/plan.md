# 020: armor-lock-exclude 計画

## スタック
- 既存（`design/tech-stack.md` の現行どおり。版の変更・依存の追加なし）: Node 24・TypeScript 6.0.3・Vue 3.5.43・Pinia 4.0.3・Vite 8.3.1・reka-ui 2.10.5・@lucide/vue 1.48.0・jsdom 30.1.1・@vue/test-utils 2.5.1・@playwright/test 1.63.0・npm `highs` 1.15.3
- ui 部品の追加なし（既存の `card`・`combobox`・`label`・`button` とトーストのストアを使う。screen-design.md の 0）

## データモデル
なし

## 決定事項
- D1: ソルバーの装飾品の除外（AC-1・AC-2）。`packages/solver/src/main/request.ts` の `SolverRequest` に `excludedDecorationIds?: DecorationId[]` を `excludedArmorIds` の直後に足す。`validate.ts` は `checkArmor` と並べて装飾品の検査を足し、マスターに無い ID を `除外の装飾品 <ID> がマスターに無い` で弾く（`fail` → `InvalidRequestError`）。`model.ts` の `candidateDecorations` が、除外の ID の Set に含まれる装飾品を変数から外す。装飾品の候補を作るのはこの関数だけなので（`placement.ts` は選ばれた装飾品しか扱わない）、ここで外せば返す構成に出ない。省略と空配列は除外なしとして同じに扱う。既存のテストの期待は変えない。
- D2: web の固定と除外の状態は、新しい Pinia ストア `apps/web/src/main/stores/lockExclude.ts`（`useLockExcludeStore`）に持つ。`conditions.ts` に足さない理由: 既に 270 行あり、AC-7 の相互の解除とトーストの処理が固定・除外の中で閉じるため。状態は `fixed: Partial<Record<ArmorPart, ArmorId | null>>`（キーが無い部位は「固定しない」、null は「何も付けない」）・`excludedArmorIds: ArmorId[]`・`excludedDecorationIds: DecorationId[]`（どちらも足した順）。端末に保存しない（localStorage 等を使わない。Pinia のメモリだけなので画面の移動では残り、再読み込みで既定に戻る。AC-10・decisions.md Q81）。
- D3: AC-7 の解除はストアの操作の中で行う。`setFixed(part, value)`（value は ArmorId・null・undefined＝固定しない）で防具を固定したとき、その防具が除外の一覧にあれば一覧から外し、トースト「<防具名>を除外の一覧から外しました。」を出す。`addExcludedArmor(id)` で、その防具を固定している部位があれば「固定しない」に戻し、トースト「<部位>の固定を解除しました。」を出す（部位名は `constants/labels.ts` の `ARMOR_PARTS`）。トーストは既存の `useToastStore().push`。これで、ソルバーに同じ防具を固定と除外の両方で渡すことは起きない。
- D4: アダプタ（AC-4・AC-6）。`apps/web/src/main/lib/solver/request.ts` の `SearchConditions` に `fixedArmor`・`excludedArmorIds`（ユーザーが除外した防具）・`excludedDecorationIds` を足す。`buildSolverRequest` は、要求の `excludedArmorIds` を「ランクの絞り込みで外す防具から固定した防具を引いたもの」＋「ユーザーが除外した防具（ランクで外す分と重複するものは足さない）」にする。`fixedArmor` は固定した部位があるときだけ、`excludedDecorationIds` は1件以上あるときだけ要求に入れる（固定も除外も無い検索の要求を 020 の前と同じ形に保つ）。既存の `excludedArmorIds(bundle, ranks)` の関数の形は変えない。
- D5: 送信した時点の写し。`stores/search.ts` の `submit()` が、条件の写しと同じ時点で固定と除外を写して `Submitted` に入れる（護石の読込を待つ間に固定・除外を変えても、送る要求と要約は変わらない）。`SearchSummary` に `fixedPartCount`（「何も付けない」を含む固定した部位の数）・`excludedArmorCount`・`excludedDecorationCount`（ユーザーの除外の件数。ランクで外した分は数えない）を足す。
- D6: 結果の表示（AC-8・AC-9）。`components/search/ResultsPanel.vue` の要約の末尾に「 ／ 固定 <N> 部位」か「 ／ 固定なし」、「 ／ 除外: 防具 <A> 件・装飾品 <B> 件」か「 ／ 除外なし」を足す（screen-design.md 2.5）。解なしの箇条書きは、`fixedPartCount > 0` か除外が1件以上のときだけ末尾に「部位の固定や除外を減らす」を足す。打ち切りの文言と、固定も除外も無いときの箇条書きは変えない。
- D7: 画面の部品（AC-3・AC-5・AC-8）。`components/search/ArmorLockCard.vue`（「部位の固定」。1部位の行を `ArmorLockRow.vue` に分ける）と `components/search/ExcludeCard.vue`（「除外」）を足し、`views/SearchView.vue` のフォームで `ConditionsCard` の直後・`ActivationConditionsCard` の前に置く（screen-design.md 2.1）。Combobox の組み方は既存の `components/charms/CharmSkillRow.vue`（reka-ui の `ComboboxInput` を直接使い、Input と同じ見た目にする）に揃える。照合は `lib/text.ts` の `matchesQuery`。表示名は `master.nameOf`、ランクの表記は `rankLabel`（`constants/labels.ts`）。
- D8: 候補の組み立て（固定の候補の「固定しない」「何も付けない」＋ランクの高い順の群、除外の候補の防具→装飾品の群と並び・除外済みの除外・先頭 50 件の打ち切りと残りの件数、候補の行の補助の文言）は、コンポーネントから分けた純粋関数として `apps/web/src/main/lib/search/lockExclude.ts` に置き、単体テストする（`apps/web/src/test/lib/search/lockExclude.spec.ts`）。固定の候補はランクの選択にかかわらず全ランクの防具を出す（AC-4）。
- D9: Combobox の入力欄での Enter は候補の選択だけにし、検索フォームの送信（ネイティブの暗黙の送信と、`SearchView.vue` の `onEnter`）を起こさない。単体テストで、候補を Enter で選んでも `search.submit` が呼ばれないことを確かめる。
- D10: フォーカス（screen-design.md 2.3・2.8）。除外の候補を選んだら入力欄を空にして一覧を閉じ、フォーカスを入力欄に残す。外すボタンの後は次の行の外すボタン、無ければ前の行、どちらも無ければ探す欄の入力欄へ移す。
- D11: e2e（AC-11）は `apps/web/e2e/armor-lock-exclude.spec.ts` に新しく書く。既存の `e2e/support/search.ts`（武器・スキルの選択）と `e2e/support/masterData.ts`（マスターから防具・装飾品の名前を引く）を使い、名前をテストに直書きしない。要素は screen-design.md 3 の AC-11 の行のラベル・名前・`aria-label` で取る。検証は結果の構成カードに出る防具名・装飾品名で行う。

## 常時許可外の変更
- なし
