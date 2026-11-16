# 039: not-found-route 計画

## スタック
- Web: Vue 3.5.45・Vue Router 5.4.0・Pinia・Reka UI（`apps/web/package.json` の現行どおり。`design/tech-stack.md` の表は Vue 3.5.43・Vue Router 5.3.1 のままで古いが、本機能では版を変えないので直さない）。依存は足さない。
- 使う API: `router.onError((error, to, from) => …)`（Vue Router 5.4.0 の `_ErrorListener` は `to` を受け取る。`dist/options-*.d.mts` で確かめた）、Reka UI の `ToastRoot`（`type="foreground"`・`:duration="Infinity"`）。
- アイコンは既存の `@lucide/vue` の `X` だけ（`AppToaster.vue` で使用中）。

## データモデル
なし

## 決定事項

### 「見つかりません」の画面（AC-1・AC-2・AC-9）
- D1: `apps/web/src/main/router/index.ts` の `routes` の末尾に、キャッチオールの経路を足す。`{ path: '/:pathMatch(.*)*', name: NOT_FOUND_ROUTE_NAME, component: …NotFoundView.vue, meta: { title: 'ページが見つかりません | SkillWeave' } }`。`NOT_FOUND_ROUTE_NAME = 'not-found'` を同じファイルから export する（D3 が使う）。リダイレクトはしない（URL を開いたパスのまま残す）。既存の8経路の定義・名前・タイトルは変えない。
  - 当てはめ: `/no-such-page` → `not-found`（`fullPath` は `/no-such-page` のまま）。`/builds/abc/extra` → `not-found`。`/builds/abc` → 既存の `build`（キャッチオールより具体的な経路が勝つ）。`/` → `search`。
- D2: `apps/web/src/main/views/NotFoundView.vue` を足す。値の正は screen-design.md 2 節。
  - 枠は既存の画面と同じ `mx-auto w-full px-4 py-4 md:max-w-[720px] md:px-6 lg:max-w-[1280px]`、その中を `max-w-[720px]` のまとまりにする（`PrivacyView.vue` と同じ）。
  - `h1`: 「ページが見つかりません」。`text-xl leading-snug font-bold`・`tabindex="-1"`・`outline-none`。表示したときにフォーカスを移さない（screen-design.md 2.2。`PrivacyView.vue` の `onMounted` のフォーカスは写さない）。
  - 本文とリンクは `flex flex-col items-start gap-3`。本文 `p.text-sm` は screen-design.md 2.1 の文言。リンクは `SharedBuildView.vue` の notFound と同じ `<Button as-child variant="outline" class="h-10"><RouterLink to="/">装備検索へ</RouterLink></Button>`。
  - 開いたパス・アイコン・イラストは出さない。ストア・API・マスターを読まない。

### ログインからの戻り先（AC-4）
- D3: `apps/web/src/main/lib/auth/loginReturn.ts` の `safeReturnPath` の判定を「一致した経路があり、かつ最後に一致した経路の名前が `NOT_FOUND_ROUTE_NAME` でない」に変える。先頭の `/`・`//`・`\` の検査は変えない。関数のコメントも「キャッチオールにだけ一致するパスは `/`」に直す。
  - 当てはめ: `/no-such-route` → `/`（既存のテストの期待のまま通る）。`/charms?tab=1` → そのまま。`/s/abc` → そのまま。`/builds/abc/extra` → `/`。

### 部品の読み込み失敗の検出（AC-5・AC-8）
- D4: 経路の部品の読み込みを包む関数 `lazyView(load)` と、その失敗を表す `RouteChunkLoadError`（`Error` の派生、`cause` に元の例外）を `apps/web/src/main/router/index.ts` に置く。`lazyView` は `() => load().catch((cause) => { throw new RouteChunkLoadError(cause) })` を返す。既存の8経路とキャッチオールの `component` をすべて `lazyView(() => import('@/views/…'))` にする（読み込む画面は変えない）。
  - 理由: `import()` の失敗の文言はブラウザごとに違う（Chrome の `Failed to fetch dynamically imported module` など）。文言の照合ではなく、経路の部品の `import()` が拒否されたことそのものを印にすれば、ブラウザに依らず判定でき、jsdom の単体テストでも拒否する読み込み関数で再現できる。Vite が `import()` を包む先読み（`__vitePreload`）の失敗も同じ Promise の拒否として届くので、同じ印が付く。
  - 部品のモジュールの評価中の例外も同じ印になる。どちらも「画面の部品を読めなかった」として扱う（AC-8 の対象は、ガードの例外など部品の読み込み以外の失敗）。
- D5: `installChunkErrorHook(router)` を `apps/web/src/main/router/index.ts` に足し、本物のルーターに `installTitleHook` と並べて付ける。`router.onError((error, to) => …)` で、`error instanceof RouteChunkLoadError` のときだけ `useChunkLoadStore().report(router.resolve(to.fullPath).href)` を呼ぶ（`href` は配信の基準パスを含む）。それ以外の例外では何もしない（AC-8。既存の扱いを変えない）。ストアはエラーが起きたときに取るので、`main.ts` の pinia の登録順に依らない。
  - 移動の失敗の後、画面と URL は移動の前のまま（Vue Router の既定。何も足さない）。`RouterLink` は `push` の拒否を握りつぶすので、未処理の拒否は出ない。
  - 起動の最初の移動（URL を直接開く）で部品を読めなかったときも同じ通知を出す（区別しない）。
  - `apps/web/src/test/support/mount.ts` の `newRouter` には付けない（既存のテストの前提を変えない。フックは router の spec で確かめる）。

### 読み込み失敗の通知（AC-5〜AC-7・AC-9）
- D6: ストア `apps/web/src/main/stores/chunkLoad.ts`（`useChunkLoadStore`）を足す。`appUpdate.ts` と同じ形にする。
  - 状態: `visible`・`targetHref`（再読み込みの行き先）・`reloading`・`afterToastId`（出た時点の最後のトーストの id。0 は無し）・`afterUpdate`（出た時点で新しい版の通知が出ていたか）。
  - `report(href)`: 出ていれば `targetHref` だけを差し替える（通知を1つのまま。screen-design.md 3.3）。出ていなければ `afterToastId`・`afterUpdate` を記録して `visible = true`・`targetHref = href`・`reloading = false` にする。
  - `dismiss()`: `visible = false`。次の `report` でまた出る（AC-7）。
  - `reload()`: 再読み込み中なら何もしない。`reloading = true` にして、登録された遷移の関数に `targetHref` を渡す。遷移の関数の既定は `(href) => window.location.assign(href)` で、`setNavigateHandler(handler)` で差し替えられる（jsdom の `location` は差し替えられないため、単体テストはこれで確かめる）。
- D7: 再読み込みは、失敗した移動の行き先へ `location.assign` で移る（ページを読み込み直す）。待機中の新しい版の Service Worker を先に有効にする経路（018 の `SKIP_WAITING` → `controllerchange` → `location.reload()`）は通さない。`apps/web/src/main/lib/pwa/register.ts` は変えない。
  - 理由: 事前キャッシュは版ごとに `index.html` と全チャンクを持ち、制御中の Service Worker は自分の版のキャッシュだけから返す（`sw/handlers.ts` の `fromPrecache`）。そのため、旧版の Service Worker が制御中なら旧版の `index.html` と旧版のチャンクがそろい、移った先の画面は読める。部品の読み込みに失敗するのは主に Service Worker の制御の外（初回の訪問・未対応のブラウザ・開発時）で、このときは配信が新しい `index.html` を返すので、読み直せば新しい版で開く。
  - 制御中でも事前キャッシュが消えていれば同じ失敗を繰り返しうる。このとき新しい版が待機中なら、新しい版の通知（018）も同時に出ているので、そちらの再読み込みで解消できる。`register.ts` の `controllerchange` に行き先を渡す変更は、018 の再読み込みの経路を変える（AC-9）ので採らない。
- D8: `apps/web/src/main/components/common/AppToaster.vue` に N2 を足す。値の正は screen-design.md 3 節。
  - N1 の `ToastRoot` と同じ面のクラスで、`type="foreground"`・`:duration="Infinity"`・`data-slot="chunk-load"`。見出し「画面を読み込めませんでした」、本文は screen-design.md 3.2 の文言、「再読み込み」（再読み込み中は無効にして「再読み込み中…」）、閉じるボタン（`aria-label`・`title`「通知を閉じる」）。`@update:open` で閉じたら `dismiss()`（Esc・スワイプ）。
  - 並び: `entries` を、トースト・N1・N2 の出た順の1つの並びにする。N1・N2 は、それぞれ `afterToastId` より大きい id の最初のトーストの前に置く。N1 と N2 の `afterToastId` が同じなら、N2 の `afterUpdate` が真のときだけ N2 を N1 の後に置く。N1 だけのときの並びは今と同じにする（既存の `AppToaster.spec.ts` の期待を書き換えずに通す。AC-9）。
  - N1 の見た目・文言・`type="background"`・閉じたときの扱いは変えない。

### 設計標準（screen-design.md 4 節）
- D9: `design-system/skillweave/MASTER.md` の Component Specs に「見つからない画面の表示」「読み込み失敗の通知」の2節を足す。内容は screen-design.md 4 節の2項のとおり。メインがワーカーへの委譲の前に書く。

### Web の単体テスト（web-agent）
- D10: 次を足す。既存の `router/index.spec.ts`・`loginReturn.spec.ts`・`AppToaster.spec.ts`・`appUpdate.spec.ts`・`App.spec.ts` の期待は書き換えない（AC-9）。
  - `apps/web/src/test/router/index.spec.ts`: キャッチオールの経路の名前とタイトル。アプリ内で `/no-such-page`・`/builds/abc/extra` へ `push` すると `not-found` に一致し、`fullPath` がそのままであること（AC-1）。`/builds/abc` は `build` のままであること（AC-9）。`installChunkErrorHook` を付けたテスト用ルーター（拒否する読み込み関数を `lazyView` で包んだ経路を持つ）で、移動が失敗すると通知のストアが行き先の `href` で出ること（AC-5）、ガードが例外を投げた失敗では出ないこと（AC-8）、失敗の後も `currentRoute` が移動の前のままであること。
  - `apps/web/src/test/views/NotFoundView.spec.ts`: `mountApp({ path: '/no-such-page' })` で、ヘッダー・ナビ・クレジットのバーの中に `h1` と本文が出て、`document.title` が `ページが見つかりません | SkillWeave` になり、ナビのどのリンクにも `aria-current="page"` が付かないこと（AC-1）。「装備検索へ」の `href` が `/` で、押すと `/` に移ること（AC-2）。
  - `apps/web/src/test/lib/auth/loginReturn.spec.ts`: D3 の当てはめの表を足す（AC-4）。`restoreAfterLogin` で戻り先が `/no-such-page` のとき `/` を開くこと。
  - `apps/web/src/test/stores/chunkLoad.spec.ts`: `report`・出ている間の行き先の差し替え・`dismiss` の後の再表示・`reload` が遷移の関数を1回だけ呼ぶこと（AC-5〜AC-7）。
  - `apps/web/src/test/components/common/AppToaster.spec.ts`: N2 の見出し・本文・再読み込み・閉じる、`foreground` の読み上げ（AC-5）。再読み込みを押すと行き先へ遷移の関数が呼ばれ「再読み込み中…」になる（AC-6）。閉じると消え、もう一度 `report` するとまた出る（AC-7）。N1 と N2 が同時に出て、出た順に並ぶこと（AC-9）。
  - テスト用ルーターの追従は要らない。共有コンポーネントに経路の項目を足さず、`support/mount.ts` は本物の `routes` を使う。

### E2E（e2e-agent）
- D11: `apps/web/e2e/not-found-route.spec.ts` を足す（既定のとおり Service Worker はブロック）。
  - AC-1・AC-2: `/no-such-page` を直接開くと、URL がそのままで、ヘッダー・ナビ・クレジットのバーと `h1` が出て、タイトルが `ページが見つかりません | SkillWeave` になる。「装備検索へ」を押すと `/` の装備検索が出る。
  - AC-5〜AC-7: `/` を開いた後、`page.route` で護石の画面のチャンク（`**/assets/CharmsView-*.js`。ビルドの出力名を確かめてから決める）に `text/html` の 200 を返し（本番の `not_found_handling` の再現）、ナビの「護石」を押す。通知の見出し・本文・ボタンが出て、URL と画面は `/` の装備検索のまま（AC-5）。閉じると消え、もう一度押すとまた出る（AC-7）。`page.unroute` の後に「再読み込み」を押すと、ページが読み込み直されて `/charms` の護石の画面が出る（AC-6）。
- D12: `apps/web/e2e/pwa-offline.spec.ts` に、Service Worker の制御下でオフラインにして `/no-such-page` を直接開き、再読み込みしても「見つかりません」の画面が出るテストを足す（AC-3）。既存の `openControlled` を使い、既存のテストと `ROUTES` は変えない。

### 確かめない範囲（ゲート D-1 で未確認として書く）
- D13: 実際の起動経路の確認は、本番のビルドを `vite preview` で配信する E2E（D11・D12）で行う。次は確かめない。`wrangler dev` と本番の配信での確認（配信の設定は変えない）、古いタブを開いたまま実際にデプロイしたときの再現（decisions.md Q136 で未再現）、Chrome 以外のブラウザ。

## 常時許可外の変更
- `design-system/skillweave/MASTER.md`（Component Specs に「見つからない画面の表示」「読み込み失敗の通知」の2節を足す。担当: メイン。理由: 画面を問わず守る規範で、ゲート B-1 で決めた screen-design.md 4 節の内容を標準に残すため）
