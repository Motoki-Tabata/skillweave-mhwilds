# 025: shared-parts-refactor 計画

## スタック
- API: Java 25・Spring Boot 4.1.2（`design/tech-stack.md` の現行どおり）。依存は足さない。
- Web: Vue 3・Pinia・reka-ui・Vitest・@playwright/test（`design/tech-stack.md` の現行どおり）。依存も `components/ui/` の部品も足さない。`Select` を使わないため、`sonar-project.properties` の抑止の追記は要らない。
- 契約（`contracts/**`）は変えない（spec §契約差分）。

## データモデル
- なし

## 決定事項

### api（api-agent）
- D1: 404・409 の汎用の例外は `common/exception/ResourceNotFoundException`・`ResourceConflictException` の2つにする。どちらも `RuntimeException` を継承し、文言を引数で受け取る（409 は `(String message)` と `(String message, Throwable cause)` の2つ。いまの `CharmConflictException` と同じ）。`CharmNotFoundException`・`CharmConflictException`・`BuildNotFoundException`・`BuildConflictException` は削除する。
  - 理由: decisions.md Q75。機能名を付けないので、013 の武器の API もそのまま使える。`Resource` を付けるのは、`NotFoundException` だけだと他のライブラリの同名のクラスと import で取り違えやすいため。
- D2: `ApiExceptionHandler` のハンドラは `ResourceNotFoundException` → 404、`ResourceConflictException` → 409 の2本にし、いまと同じく `ProblemDetail.forStatusAndDetail(<status>, e.getMessage())` を返す。
- D3: `detail` の文言は、いまと1文字も変えない。文言は機能ごとにサービスの定数に1か所だけ置き、コントローラの ID の解析の 404 もその定数を参照する。いまの文言を当てはめた結果:

  | 機能 | 404 | 409（作成の ID の衝突） | 409（行バージョンの不一致） |
  |---|---|---|---|
  | 護石 | `Charm not found` | `Charm id already exists` | `Charm was changed by another request` |
  | 保存した構成 | `Build not found` | `Build id already exists` | `Build was changed by another request` |

  - 理由: decisions.md Q75・spec AC-11。いまは `CharmNotFoundException` の既定のコンストラクタが文言を持つので、`orElseThrow(CharmNotFoundException::new)` の置き換えで文言が散らばらないようにする。
- D4: AC-12 のテストは、既存の `CharmControllerTest`・`BuildControllerTest` の 404・409 のテスト（護石の更新の 404・409、構成の名前の変更の 404・409、両者の作成の ID の衝突の 409）に、応答の `detail` が D3 の表の文言と一致する検証を足す。404 は「存在しない・削除済み・形式の不正な ID」の全部の ID で検証する。既存の検証（ステータス・`Content-Type`・行が変わらないこと）は変えない。
- D5: `common/exception/README.md` の例（`CharmNotFoundException`）を、D1 の汎用の例外と「機能名を付けず、文言を引数で渡す」に直す。

### web（web-agent）
- D6: ダイアログのオーバーレイは `components/common/AppDialogOverlay.vue` にする。reka-ui の `DialogOverlay` をいまのクラス（`data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-x-0 top-12 bottom-8 z-50 bg-black/60 md:inset-y-0`）のまま包み、`PickerDialog.vue`・`BuildDialogFrame.vue` の `DialogOverlay` をこれに置き換える。「基準幅でヘッダーとクレジットのバーを覆わない」の注釈は部品の側へ移す。
  - 理由: spec AC-3。クラスの文字列を変えないことで、位置・色・アニメーションを変えない。AlertDialog のオーバーレイ（`ui/` 既定の `bg-black/80`）は 026 で扱うため触らない。
- D7: AC-3 の単体テストは `src/test/components/common/AppDialogOverlay.spec.ts` に置き、`PickerDialog` と `BuildDialogFrame` を開いた状態で、オーバーレイの要素のクラスが D6 の文字列と同じであることを検証する。
- D8: 護石と武器の削除の確認は `components/common/DeleteConfirmDialog.vue` を変えずに使い、`title`・`description` は `CharmsView.vue`・`WeaponsView.vue` の `computed` で組み立てる。`CharmDeleteDialog.vue`・`WeaponDeleteDialog.vue` は削除する。いまの文言を当てはめた結果:
  - 護石: タイトル `護石を削除しますか？`、本文 `<要約>。削除すると元に戻せません。` ＋ アカウントのときだけ `同じアカウントのほかの端末からも消えます。`
  - 武器: タイトル `個体差のある武器を削除しますか？`、本文 `<要約>。削除すると元に戻せません。` ＋ 検索条件で選んでいるときだけ `検索条件の武器の選択も外します。`
  - 理由: decisions.md Q76。`close-auto-focus` の受け取り方は `DeleteConfirmDialog` も同じなので、フォーカスの戻し先の処理（`onDialogCloseAutoFocus`）は変えない（spec AC-2）。
- D9: 保存先の状態機械は `stores/savedItems.ts` の `useSavedItems(options)` にする。Pinia のストアではなく、`defineStore` のセットアップの中で呼ぶ関数で、返した ref と関数をストアがそのまま公開する。`stores/README.md` に「ストアが共有する、セットアップの中で呼ぶ関数も置く」を1行足す。
  - 置き場の理由: auth・toast のストアを使うので `lib/` には置かない（`lib/` からストアへ依存させない）。
  - 持つもの（decisions.md Q73）: `status`（`loading`・`ready`・`unavailable`・`failed`）・`source`（`unknown`・`account`・`device`）・`failureMessage`・一覧・端末内の件数・`deletingIds`、`setRepositoryOpener`・`setApi`（テスト用。読み込み済みの状態を捨てる）、`ensureLoaded`・`reload`・`save`・`remove`。保存先の判定、ログアウトと 401 での端末への切り替え、世代による古い応答の破棄、更新の 409・404 のあとの読み直し、削除の応答待ちの ID による二重の削除の防止は、いまの `stores/charms.ts` の処理を移す。
  - 引数（種類ごとに違うもの）: 素のオブジェクトへの変換（`plainPayload`）、スキーマ版、保存先を開く関数、トーストの名詞（`護石`・`個体差のある武器`。`<名詞>を登録しました。`・`<名詞>を保存しました。`・`<名詞>を削除しました。`・`<名詞>を<保存|削除>できませんでした。<原因> もう一度お試しください。` の形はいまの2つのストアで同じ）、API とその文言（409・404・書込の 401・一覧の 401 の4つ。API を渡すときだけ要る）。
  - API の形は、いまの `CharmsApi` の `list`・`create({ id, payload, schemaVersion })`・`update(id, { payload, schemaVersion, version })`・`remove(id)` を、要素の型で汎用にしたもの。`CharmsApi` は型を変えずにこれに当てはまるようにする。
  - API を渡さないとき（spec AC-6）: 認証の判定を待たずに端末の保存先を開く。auth の状態を `watch` しない。`source` は `device` のままで、ログイン・ログアウト・401 で保存先も一覧も変えない。
- D10: 書込結果の型は `useSavedItems` の側で `SavedWriteResult`（`'saved' | 'failed' | 'conflict' | 'notFound' | 'expired' | 'discarded'`）として定義する。`stores/charms.ts` の `CharmWriteResult`・`CharmsStatus`・`CharmSource`・`CharmRepositoryOpener` は、名前を残して汎用の型の別名にする。`stores/weapons.ts` の `WeaponsStatus`・`WeaponRepositoryOpener` も同じ。
  - 理由: spec AC-5。護石のストアを import している画面・テストの型を変えない。保存した構成の `BuildWriteResult` は同じ和集合だが、構成のストアは状態機械を使わないため（decisions.md Q73）そのまま残す。
- D11: 護石のストアは `useSavedItems` に API（`charmsApi`）と D9 の引数を渡し、いまと同じ名前の状態と操作（`status`・`source`・`failureMessage`・`charms`・`deviceCharmCount`・`deletingIds`・`entries`・`candidates`・`candidateCount`・`excluded`・`excludedCount`・`setRepositoryOpener`・`setApi`・`ensureLoaded`・`reload`・`save`・`remove`）を公開する。トーストの文言（`MESSAGE_CONFLICT` など4つ）は `stores/charms.ts` に残して引数で渡す。照合・候補の判定（`entries` 以下）は護石のストアに残す。
  - 確認: 既存の `charms.spec.ts`・`CharmsView.spec.ts`・`CharmsView.account.spec.ts` を期待値を変えずに通す（spec AC-14）。
- D12: 武器のストアは `useSavedItems` に API を渡さずに使う。公開する名前はいまと同じ（`status`・`failureMessage`・`weapons`・`entries`・`candidates`・`candidateCount`・`excluded`・`excludedCount`・`setRepositoryOpener`・`ensureLoaded`・`reload`・`save`・`remove`）で、`save`・`remove` の戻り値だけを `SavedWriteResult` にする。`source`・`deletingIds` は公開しない（武器の画面が使わないため。013 で要れば足す）。
  - 呼び出し側の追従（decisions.md Q74）: `views/WeaponsView.vue` の `if (!(await weapons.remove(id)))` と `components/weapons/WeaponForm.vue` の `const ok = await weapons.save(...)` を、結果が `'saved'` かどうかの判定にする。画面の挙動は変えない。
  - `weapons.spec.ts` の `toBe(true)`・`toBe(false)` を `toBe('saved')`・`toBe('failed')` にする（spec AC-14 の除外の範囲）。ほかの期待値は変えない。
- D13: ID の降順の並べ替えは `lib/uuidv7.ts` の `byIdDescending<T extends { id: string }>(a, b)` にし、護石・武器（`useSavedItems` の中）と保存した構成（`stores/builds.ts`）が使う。3つのストアの局所の `byIdDescending` は削除する。単体テストは `src/test/lib/uuidv7.spec.ts` に足す。
  - 理由: spec AC-9。並びの根拠（UUIDv7 は先頭が時刻）が採番と同じファイルにある方が読み取りやすい。保存した構成のストアは並べ替え以外を変えない。
- D14: AC-13 の単体テストは `src/test/stores/savedItems.spec.ts` に置き、`useSavedItems` を API を渡さずにテスト用のストアの中で使って、(1) `auth.initialize` が解決しないままでも `ensureLoaded` が端末の一覧を読み終えること、(2) 読み終えた後に auth の状態を未ログイン・`expire()` に変えても一覧と状態が変わらないこと、(3) 削除の応答を保留した間に同じ ID の `remove` を呼ぶと `'failed'` を返し、保存先の `delete` が1回しか呼ばれないこと、を検証する。武器のストアでも (3) を `weapons.spec.ts` に1件足す（spec AC-8）。
- D15: web は2回に分けて委譲する。1回目（T2）はダイアログの部品（D6〜D8）、2回目（T3）は保存先の状態機械と並べ替え（D9〜D14）。
  - 理由: 2つは互いの出力を前提にしないが、どちらも `WeaponsView.vue`・`CharmsView.vue` を触る。分けると1回の差分と委譲プロンプトの読む範囲が小さくなり、レビューの単位も受入基準の塊と揃う。

### 進め方（メイン）
- D16: 順序は「T1 と T2 を並列 → T3」。T1（api-agent・`apps/api`）と T2（web-agent・pnpm workspace）は、書込フォルダが重ならず、互いの出力を前提にせず、契約も変えないため、`tsod-build/SKILL.md`「委譲」節の並列の条件を満たす。T3 は T2 と同じ pnpm workspace の役割なので T2 の後に直列にする。新しい e2e は書かない（画面の挙動を変えないため。既存の e2e は一括検証の `--e2e` で通す。spec AC-14）。
- D17: `tasks/lessons.md` の台帳の整理は、直した領域のコミットの中でメインが行う（lessons-guide.md の「項目を直したコミットの中で消す」）。
  - T1 のコミット: 2026-10-28「例外クラスと ApiExceptionHandler のハンドラが機能ごとに並行して増える」の項から、汎用の例外とハンドラへの統合の提案を消し、`.claude/rules/api-spring.md` への「404・409 の例外は機能名を付けず共有する」の追記の提案だけを残す（spec §スコープ外）。
  - T2 のコミット: 2026-10-28「ダイアログのオーバーレイの記述が PickerDialog と BuildDialogFrame で複製された」の項を消す。
  - T3 のコミット: 2026-10-26「削除確認ダイアログと、端末保存のストアの状態機械が護石と武器で二重になった」の項を消す（削除確認は T2、状態機械は T3 で直り、T3 で両方が揃うため）。

## 常時許可外の変更
- なし
