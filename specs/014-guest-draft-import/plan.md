# 014: guest-draft-import 計画

## スタック
- Web: Vue 3・Pinia・reka-ui・@lucide/vue・Vitest・@playwright/test（`design/tech-stack.md` の現行どおり）。依存も `components/ui/` の部品も足さない（screen-design.md 0。既存の `ResultAlert`・`alert-dialog`・Toast・`Button` で足りる）。`Select` を使う新規 `.vue` は無いため、`sonar-project.properties` の抑止の追記は要らない。
- HTTP は既存の `apps/web/src/main/lib/http.ts` を、010 の `lib/api/charms.ts`・013 の `lib/api/weapons.ts` 越しに使う。契約・API は変えない（spec の契約差分）。

## データモデル
- なし

## 決定事項

### 文書（メイン）
- D1: 委譲の前に、メインが `design-system/skillweave/MASTER.md` の Component Specs「端末内に残るデータの帯」の「中身は表示も送信もしない。」を、screen-design.md 5 の文に替える（T1）。
  - 理由: web-agent が帯の部品を MASTER.md と突き合わせて実装するため。spec の影響範囲は「常時許可外の変更予定: なし」のままで、plan で初めて常時許可外になる（台帳の 2026-10-29「画面設計が MASTER.md への追記を決めたのに…」と同じ事象。027 と同じく C-1 で承認を取る）。

### Web（web-agent）
- D2: 400 を失敗の種類として見分ける（handoff の要確認事項）。`lib/api/result.ts` の `ApiFailure` に `{ kind: 'badRequest' }` を足し、`failureOf` で 400 をそれにする。
  - 既存の呼び出し側は変えない。`causeText`（`stores/savedItems.ts`）と `failureCauseText` は `failed` 以外を `server` の文言にするため、護石・武器・構成・共有の 400 の画面の文言と振る舞いは今と同じ（`stores/builds.ts`・`stores/shares.ts`・`views/SharedBuildView.vue` は `unauthorized`・`conflict`・`notFound` 以外を `else` で失敗として扱っている）。
  - 既存の単体テストの 400 の期待値（`test/lib/api/charms.spec.ts`・`weapons.spec.ts`・`builds.spec.ts`・`shares.spec.ts` の `[400, { kind: 'failed', cause: 'server' }]`）を `{ kind: 'badRequest' }` に直す。
  - 理由: 契約が 400 を定義済みで、`HttpError` が status を持つため、種類を1つ足すのが最も小さい。`failed` に status を持たせる形は、ほかの呼び出し側の型の絞り込みを崩す。
- D3: 取り込みの手順は、護石と武器が共有する状態機械 `stores/savedItems.ts` の `useSavedItems` に `importFromDevice()` として置く（screen-design.md 0 の「一覧を持つ1か所」。護石と武器で同じ手順になり、名詞だけが違うため）。`api` を渡したときだけ働く。
  1. 保存先が `account` で、取り込み中でないときだけ始める。それ以外は何もせず `ignored` を返す（AC-10）。取り込み中の印 `importing`（`ref<boolean>`）を立て、始めた時点の世代の番号を覚える。
  2. 端末の保存先を開いて（`opener` で開き直す。アカウントの保存先のとき `repository` は null のため）一覧を読む。送る順は ID の昇順（登録した順）。
  3. アカウントの一覧を `api.list()` で読み直し、ID の集合だけを使う（一覧の表示はここでは変えない。2.3 の「フォーム・一覧は変えない」）。401 は 5 の期限切れ、それ以外の失敗は 5 の通信・サーバーの失敗にして、何も送らない（screen-design.md 2.4 の「始める時点のアカウントの一覧」の2行）。
  4. 1件ずつ順に（前の応答を待ってから次を送る）:
     - アカウントに同じ ID があれば、送らずに端末から消し（`repository.delete`。失敗は無視）、取り込んだ件数に足す（AC-5）。
     - 送る前に世代の番号が変わっていたら（ログアウト・ほかの要求の 401 で端末に切り替わった）、送らずに止める（5 の知らせなし）。
     - `api.create({ id, payload, schemaVersion })` に端末の値をそのまま渡す。`plainPayload` もマスターとの照合も通さない（AC-3。`schemaVersion` は端末の値を `V` に型だけ合わせる。1 でなければサーバーが 400 にする）。作成日時・更新日時は送らない。
     - `ok`: 端末から消し（失敗は無視）、取り込んだ件数に足す（AC-4）。応答の時点で世代の番号が変わっていても消す（screen-design.md 2.4「取り込み中のログアウト」の応答待ちの1件）。このときは、端末への切り替えの読み込み（`loading`）を待ってから、一覧（`items`）からその ID を除く（切り替えの読み込みが消す前の端末を読んでいても、取り込んだ1件を出さないため。AC-11）。その後、送らずに止める。
     - `badRequest`・`conflict`: 端末に残し、残した件数に足して次へ進む（AC-6）。
     - `unauthorized`: 止める（5 の期限切れ。AC-7）。
     - それ以外（`failed`・想定外の `notFound`）: 止める（5 の通信・サーバーの失敗。AC-8）。送り直さない。
  5. 終わり方ごとに、トーストを1回だけ出す（文言は D4）。残した件数 `<M>` は、拒否された件数と、止めたために送らなかった件数（失敗した1件を含む）の合計。
     - 最後まで送った: `<M>` が 0 なら通常、1以上なら `destructive`。続けて `loadAccount(true)` でアカウントの一覧と端末内の件数を読み直す（AC-9）。
     - 通信・サーバーの失敗で止めた: `destructive`。続けて `loadAccount(true)`。
     - 期限切れ: `auth.expire()` を呼び（ヘッダーが未ログインに戻り、既存の `watch` が端末に切り替える）、保存先がまだ `account` なら `switchToDevice()` を呼ぶ（`handleExpired` と同じ）。010 の期限切れのトースト（`expiredList`・`expiredWrite`）は出さず、取り込みのトーストだけを出す。切り替えの読み込みを待つ。
     - 世代の番号が変わって止めた: トーストを出さず、読み直さない（009 の「ログアウトしました」と 010 の切り替えに任せる）。
  6. 読み直しまで終えてから `importing` を下ろす（`finally`。2.3 の期間）。`resetState()`（テストの差し替え）でも下ろす。
  - 結果の種類 `SavedImportResult` を返す: `done`（すべて取り込んだ）・`partial`（拒否あり）・`stopped`（通信・サーバー・端末の失敗）・`expired`・`discarded`（世代が変わった）・`ignored`。画面はフォーカスの判断（D7）に使う。
  - 理由: 世代の番号は 010 の古い応答を捨てる仕組みをそのまま使え、ログアウトの扱い（screen-design.md 0・2.4）を足し算で書ける。ストアに置くので、画面を離れても取り込みは続く（Pinia のストアは画面と独立）。
- D4: 取り込みのトーストの文言は、`useSavedItems` が `noun` から組み立てる（screen-design.md 2.4 の表の文言で、名詞だけが護石・個体差のある武器で違うため。`SavedItemsMessages` には足さない）。`<原因>` は `causeText`。
  - 端末の保存先を開けない・読めない（手順 2）は screen-design.md に無いため、次の文言にする: `${noun}を取り込めませんでした。${端末の原因の文言} もう一度お試しください。`（`destructive`。端末の原因は `failureText`。既存の `reportFailure` と同じ文型）。何も送らず、`loadAccount(true)` で読み直して `stopped` を返す。帯は端末内の件数を数えられたときだけ出るため、ふつうは起きない。
- D5: ストアの公開。`stores/charms.ts` と `stores/weapons.ts` は、`useSavedItems` の `importing` と `importFromDevice` を同じ名前でそのまま公開する。
- D6: テストの支援（`src/test/support/`）。
  - `charmsApi.ts`・`weaponsApi.ts` のメモリ上の偽の API に、特定の ID の作成だけを指定の失敗で返す手段を足す（AC-6 の「1件だけ拒否して次へ進む」を書くため。今の `failWith` は操作の全呼び出しに効く）。作成の要求の記録（送った `id`・`payload`・`schemaVersion` の順の列）も足す（AC-3 の「変えずに1件ずつ順に」を確かめるため）。
  - `charmRepository.ts`・`weaponRepository.ts` の偽の端末の保存先に、削除の失敗を起こす手段が無ければ足す（AC-4 の「端末から消せなかったときも取り込んだものとして数える」）。
  - 既存のテストの振る舞いは変えない（既定は今のまま）。テスト用ルーターに足すルートは無い。
  - 単体テストは護石と武器の両方で書く（AC-12）。手順そのものは `useSavedItems` の1か所なので、護石のストアで AC-2〜AC-9 の各分岐を確かめ、武器のストアでは同じ分岐を少なくとも「すべて取り込んだ」「400 の1件を残して進む」「401 で止める」「通信の失敗で止める」で確かめる。
- D7: 画面（screen-design.md 2・3）。
  - S2 `views/CharmsView.vue`・S3 `views/WeaponsView.vue` の端末内に残るデータの帯（既存の `showDeviceBand` の条件のまま。AC-1）の本文の下に、`Button`（outline・高さ 44px）「アカウントに取り込む」を置く（2.2）。
  - 取り込み中（ストアの `importing`）は文言を「取り込み中…」にし、左にスピナー（16px・`aria-hidden`）を置いて無効にする（2.3）。2.5 の「D5 で『取り込む』→ 無効のボタンにフォーカスを戻す」を満たすため、`disabled` 属性ではなく `aria-disabled="true"` と押下の無視で無効にする（`disabled` にするとフォーカスが `body` に落ちる）。
  - 確認のダイアログ D5・D6 は、名詞と件数を props で受ける共通の部品 `components/common/DeviceImportDialog.vue`（`alert-dialog`。既存の `DeleteConfirmDialog.vue` と同じ置き場と形）にして、2 つの画面から使う（3）。`<N>` は帯の件数（`deviceCharmCount`・`deviceWeaponCount`）。「キャンセル」・Esc・背景で閉じたら何もしない（AC-2）。
  - フォーカス（2.5）: ダイアログを閉じたら「アカウントに取り込む」（取り込み中なら同じボタン）へ戻す。終わった後に帯が消えた（結果が `done`・`expired`、または読み直しで件数が 0）ときは、既存の `focusHeadingIfLost` を使う。帯が残るときは動かさない。
  - 帯の本文の件数は、取り込みの間は変えない（ストアは終わってから読み直すので、`deviceCharmCount` は読み直すまで変わらない）。
  - 010 の 2.3 の「端末内の護石をアカウントへ取り込む導線は置かない（014）」に当たるコメント・テストがあれば、本書のとおりに直す。

### E2E（e2e-agent）
- D8: `e2e/guest-draft-import.spec.ts`（Chromium・ビルドした web・API なし。`page.route` で `/api/auth/me`・`/api/auth/logout`・`/api/charms`・`/api/weapons` をテストの中のメモリ上の一覧で差し替える。既定の幅＝`md` 以上。AC-13）。
  - 準備は `e2e/charm-save.spec.ts`・`weapon-save.spec.ts` と同じく、me を 401 にして端末に登録し、me を 200 に替えて読み直す。
  - 護石: 端末に2件を登録してログインすると「この端末には、…2 件残っています。」の帯と「アカウントに取り込む」が出る。押して「取り込む」を押すと `POST /api/charms` が2回呼ばれ、トースト「護石を 2 件アカウントに取り込みました。」が出て、アカウントの一覧に2件が出て、帯が消える。ログアウトすると端末の一覧が空になる。
  - 武器: 同じ流れを1件で確かめる（トースト「個体差のある武器を 1 件アカウントに取り込みました。」）。
  - 取り消し: ダイアログで「キャンセル」を押すと、`POST` が1回も呼ばれず、帯の件数が変わらない（護石で確かめる）。
  - 400: 端末に2件を残し、最初の `POST /api/charms` を 400 にすると、2.4「一部を取り込めなかった」のトーストが出て、帯の件数が 1 になり、「アカウントに取り込む」が押せる状態で残る（護石で確かめる）。
  - トーストの文言は `getByText` に `exact: true` を付ける（台帳の 2026-10-27）。
  - 既存の e2e は、API が無いため me が届かず「取得できない」になり、帯も操作も出ないため、変えない（D9 の切り出しを除く）。
- D9: 護石系・武器系の e2e が3本目になるため、台帳の 2026-10-27・2026-10-30 の基準どおり、画面移動と登録の手順を `e2e/support/charms.ts`（`openCharms`・登録の手順）と `e2e/support/weapons.ts`（`openWeapons`・登録の手順）に切り出し、D8 の spec から使う。同じ内容の局所関数を持つ既存の spec（`charm-input.spec.ts`・`charm-save.spec.ts`・`user-weapon.spec.ts`・`weapon-save.spec.ts`）は、切り出した関数に置き換える（中身の違う局所関数は残す）。
  - メインは、T4 の成果をコミットするときに、同じコミットで `tasks/lessons.md` の 2026-10-30「武器系の e2e spec が登録の手順と画面移動のヘルパーを複製している」を消し、2026-10-27「トーストの文言が…」から `e2e/support/charms.ts` への切り出しの提案だけを除く（`exact: true` の規則の提案は `.claude/rules/` の変更で本機能の外のため残す）。

### 順序
- D10: T1 → T2 → T3 → T4。並列にしない。
  - T2・T3・T4 はどれも pnpm workspace を検証する役割のため、`.claude/skills/tsod-build/SKILL.md`「委譲」節の並列の条件を満たさない。
  - web は2回に分けて委譲する（T2 は API の層・ストア・テストの支援、T3 は画面）。T3 は T2 のストアの形を前提にし、T4 は T3 の画面を前提にする。

## 常時許可外の変更
- `design-system/skillweave/MASTER.md`（Component Specs の端末内に残るデータの帯の文を、取り込みの操作を置ける形に替える。担当: メイン。時期: T1。理由: D1・screen-design.md 5）
