# 018: pwa-offline 計画

## スタック
- Vite 8.3.6（rolldown）・Vue 3.5.45・reka-ui 2.11.0・TypeScript 6.0.3・vitest 5.1.0・Playwright 1.65.0。版は `design/tech-stack.md` のまま。
- ブラウザ標準の Service Worker・Cache Storage・Web App Manifest と、ビルド時の Compression Streams（`CompressionStream('deflate')`）・Web Crypto（`crypto.subtle.digest`）。
- 依存は足さない（AC-13・decisions.md Q6）。`vite-plugin-pwa`・workbox・PNG の変換のパッケージを使わない。

## データモデル
なし

## 決定事項
- D1: ファイルの置き場を次に分ける。
  - SW: `apps/web/src/main/sw/`。入口 `sw.ts` はイベントの結線だけにし、振り分け・install・activate・fetch の処理は同じフォルダの別モジュールに置く。SW のモジュールは `src/main/sw/` の外を import しない（`@/` も使わない。D3 の検査に当たるため）。
  - ビルド時の生成: `apps/web/src/main/pwa/`（マニフェスト・アイコンの SVG と PNG・事前キャッシュの一覧と版）。画面からは import せず、`apps/web/vite.config.ts` が相対パスで import する。`tsconfig.node.json` の型検査も通るよう、`src/main/pwa/` の外と `@/` を import せず、DOM にしか無い型名（`BlobPart`・`BufferSource` など）を書かない（node の型で TS2304 になることを scratch で確かめた。`Uint8Array<ArrayBuffer>` で受ければ両方で通る）。
  - 画面: 登録 `src/main/lib/pwa/register.ts`、状態 `src/main/stores/appUpdate.ts`、通知 `src/main/components/common/AppToaster.vue`、呼び出し `src/main/main.ts`。
  - 結線: `apps/web/vite.config.ts` のプラグイン（D17。メインが書く）。
- D2: SW は WebWorker の型で検査する（handoff の要確認事項への答え: `tsconfig.sw.json` は要る）。
  - `apps/web/tsconfig.sw.json` を新設する: `extends` は `@vue/tsconfig/tsconfig.json`、`include` は `src/main/sw/**/*.ts`、`lib` は `["ES2022", "WebWorker"]`、`types` は `[]`、`composite: true`。`apps/web/tsconfig.json` の `references` に足す。
  - `apps/web/tsconfig.app.json` に `"exclude": ["src/main/sw/sw.ts"]` を足す（`tsconfig.vitest.json` は `exclude` を書いていないので継承する）。入口を外さないと、DOM の型で `ServiceWorkerGlobalScope` の `addEventListener` が無いと落ちる。
  - ロジックのモジュールは DOM と WebWorker の両方の型で検査される。両方にある型（`Request`・`Response`・`Cache`・`CacheStorage`・`URL`）だけを使い、`ServiceWorkerGlobalScope`・`FetchEvent`・`ExtendableEvent`・`Clients` は `sw.ts` だけに書く（ロジックには引数で渡す）。この形で `vue-tsc --build` が通ること、入口を外さないと落ちることを scratch で確かめた。
  - `sonar-project.properties` の `sonar.typescript.tsconfigPaths` に `apps/web/tsconfig.sw.json` を足す（入口がどの tsconfig にも属さなくなるため）。
- D3: SW は本体のビルドの中で、単一ファイルの classic script として出す。
  - `buildStart` で `this.emitFile({ type: 'chunk', id: <sw.ts の絶対パス>, fileName: 'sw.js' })`。
  - `generateBundle` で、`sw.js` の chunk の `imports`・`dynamicImports` が空でなければ例外にする。SW が画面と共有するモジュールを import すると、rolldown が共有の chunk に分けて `sw.js` に import 文が入り、classic の SW として動かない（scratch で再現した）。
  - 事前キャッシュの一覧と版は、`self.__SWV_PRECACHE__ = {…};` を `sw.js` の chunk の先頭に足して渡す。型は `sw.ts` で `ServiceWorkerGlobalScope` に宣言を足す。文字列の目印の置換は使わない（圧縮で定数が畳まれうるため）。
  - 登録は classic（`type: 'module'` を付けない）。
- D4: 事前キャッシュの一覧（URL は `config.base` を前に付けた絶対パス）。
  - 入れる: バンドルの全ファイル（chunk・asset）、マスター `master-<版>.json` と ja の辞書 `master-<版>.ja.json`、マニフェストとアイコン（D12）。`index.html` は `/` で持つ（Cloudflare の静的配信は `/index.html` を `/` へリダイレクトし、リダイレクトを経た応答はナビゲーションに返せないため）。
  - 除く: `sw.js`、`tesseract/**`（AC-5）、`e2e/**` と測定の入口の chunk（`SWV_OCR_MEASURE=1` のときの `ocrMeasureInput` の `charm-ocr`）。en の辞書は publicDir の写しでバンドルに入らないので、足さないことで除かれる（AC-7）。
  - 今の `apps/web/dist` に当てはめた例:
    - 入る: `/`、`/assets/main-GxbOW8wZ.js`、`/assets/solver.worker-DOZrhvIW.js`、`/assets/highs-CTQpMom3.wasm`、`/master-2026.11.1.json`、`/master-2026.11.1.ja.json`、`/manifest.webmanifest`、`/icons/icon-192.png`
    - 入らない: `/sw.js`、`/tesseract/lang/jpn.traineddata.gz`、`/master-2026.11.1.en.json`、`/e2e/measure/charm-ocr/index.html`、`/assets/charm-ocr-Ds125BQP.js`
- D5: キャッシュの名前と版。
  - 事前キャッシュ: `swv-precache-<版>`。版は、一覧の各 URL とその内容の SHA-256 を URL の順に `<URL> <hash>\n` で並べた文字列の SHA-256 の先頭 16 桁（16 進の小文字）。例: `swv-precache-3f9a1c0e5b7d2a64`。内容が1バイトでも変われば版が変わり、`sw.js` のバイト列も変わるので、ブラウザが新しい版を見つける。
  - 利用時キャッシュ: `swv-runtime-ocr`・`swv-runtime-fonts`（固定の名前。版を含めない。AC-9）。
  - OCR のエントリのキーは `<URL>?v=<そのファイルの内容の SHA-256 の先頭 16 桁>`（例: `/tesseract/lang/jpn.traineddata.gz?v=<16 桁>`、`/tesseract/worker.min.js?v=<16 桁>`）。ネットワークからは元の URL で取る。`/tesseract/**` は名前にハッシュが無く、tesseract.js を上げた後に古いコアを返し続けると壊れるため。各ファイルの hash は `self.__SWV_PRECACHE__` に一覧と一緒に渡す。
  - activate で消すのは、`swv-precache-` で始まり今の版でないキャッシュと、`swv-runtime-ocr` のうち今のキーの集合に無いエントリだけ。内容の変わらない OCR のファイルと fonts のエントリは版をまたいで残る（AC-9）。ほかの名前のキャッシュには触れない。
- D6: fetch の振り分け。上から順に、最初に当たった行で扱う。「何もしない」は `respondWith` を呼ばない（ブラウザが普通にネットワークへ送る）。
  1. GET 以外 → 何もしない（AC-7）
  2. 同一オリジンで、パスが `/api/` で始まる → 何もしない（ナビゲーションを含む。AC-7）
  3. 同一オリジンのナビゲーション（`request.mode === 'navigate'`）で、パスの最後の `/` より後に `.` が無い → 自分の版のキャッシュの `/` を返す。無ければネットワーク（AC-3）
  4. 同一オリジンで、クエリを除いたパスが事前キャッシュの一覧にある → 自分の版のキャッシュから返す。無ければネットワーク（AC-4）
  5. 同一オリジンで、パスが `/tesseract/` で始まる → `swv-runtime-ocr` から D5 のキーで返す。無ければ取得し、`response.ok` なら写して返す（AC-5）
  6. オリジンが `https://fonts.gstatic.com` → `swv-runtime-fonts` から返す。無ければ取得し、`response.ok` なら写す（AC-6）
  7. オリジンが `https://fonts.googleapis.com` → 写しがあればそれを返し、裏で取り直して `response.ok` なら写し直す。写しが無ければ取得して写す（AC-6）
  8. それ以外 → 何もしない（en の辞書・測定のページ・ほかのオリジン。AC-7）
  - 例: `POST /api/builds` → 1、`GET /api/auth/me` → 2、ナビゲーションの `/api/auth/discord` → 2、ナビゲーションの `/charms`・`/builds/0190a1b2-…`・`/s/abc123` → 3、ナビゲーションの `/master-2026.11.1.en.json` → 8、`GET /master-2026.11.1.json` → 4、`GET /master-2026.11.1.en.json` → 8。
  - 自分の版のキャッシュは名前を指定して開く（`caches.match` で全キャッシュを探さない。待機中の新しい版のキャッシュを返さないため。AC-8）。
  - 写すのは `response.ok` の応答だけにする（不透明な応答は写さない）。
- D7: `apps/web/index.html` の Google Fonts の `<link rel="stylesheet">` と、`fonts.googleapis.com` の `preconnect` に `crossorigin` を付ける。CORS の応答にして、D6 の 7 で状態を確かめてから写すため（no-cors の不透明な応答は、エラーでも区別できない）。`fonts.googleapis.com` の CSS は `access-control-allow-origin: *` を返すことを確かめた（2026-11-15）。
- D8: SW の install・activate・message。
  - install: `swv-precache-<版>` を開き、一覧の各 URL を `new Request(url, { cache: 'reload' })` にして `addAll` する（HTTP のキャッシュの古い `/`・固定名のファイルを混ぜない）。失敗したらそのキャッシュを消してから例外を投げ直す（その版は有効にならない。AC-10）。install では `skipWaiting` を呼ばない（AC-8）。
  - activate: D5 の掃除をしてから `clients.claim()` を呼ぶ（初回の訪問で、読み込み直さずに制御下に置く。AC-2）。
  - message: `{ type: 'SKIP_WAITING' }` を受けたら `skipWaiting()` を呼ぶ（AC-9）。
- D9: 画面側の登録（`lib/pwa/register.ts`）。
  - `import.meta.env.PROD` が真で `'serviceWorker' in navigator` のときだけ、`window` の `load` の後に `navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)` を呼ぶ。`import.meta.env.PROD` の判定は `register.ts` の中に置き、単体テストは `vi.stubEnv` で切り替える（AC-11）。`main.ts` は無条件に呼ぶ。
  - 通知を出す条件: 登録の時点で `registration.waiting` があり、かつ `navigator.serviceWorker.controller` がある。または `updatefound` の `installing` が `installed` になった時点で `controller` がある。`controller` が無い（初回の訪問）ときは出さない（AC-8）。
  - 再読み込みの操作: `registration.waiting` に `{ type: 'SKIP_WAITING' }` を送り、ストアを再読み込み中にする。
  - `controllerchange`: 起動の時点で `controller` があった画面、または一度 `controllerchange` を受けた画面では `location.reload()` を呼ぶ。新しい版は利用者の操作でしか有効にならないので、これで開いているすべての画面が新しい版で読み込み直される（AC-9）。初回の訪問の `clients.claim()` による最初の `controllerchange` では読み込み直さない。
  - 画面が見えるようになったとき（`visibilitychange` で `visible`）、前回の確認から 1 時間以上たっていれば `registration.update()` を呼ぶ。インストールしたアプリを閉じない利用者は遷移が起きず、ブラウザが新しい版を確かめないため（decisions.md Q180 の理由）。
  - 登録・更新の確認の失敗は捕まえて何もしない（エラーを画面に出さない。AC-10）。
- D10: 状態のストア `stores/appUpdate.ts` は、新しい版が待っているか・閉じたか・再読み込み中かを持つ。通知を出すのは「待っている かつ 閉じていない」とき。閉じた状態はメモリだけに持つ（次にアプリを開いたとき、まだ待っていればまた出す。screen-design.md の状態の表）。`register.ts` がストアを更新し、ストアの再読み込みの操作から `register.ts` の送信を呼ぶ形にする（ストアは `navigator` に触れない）。
- D11: 通知は `AppToaster.vue` の同じ `ToastProvider` の中に `ToastRoot`（`type="background"`、`duration` は `Infinity`）として描く。部品・文言・状態・読み上げは screen-design.md の「新しい版の通知」節が正。普通のトーストと出た順に上から積むため、通知とトーストを出た順の1つの並びとして描く。既存のトーストの見た目と振る舞いは変えない。
- D12: マニフェストとアイコン。
  - 配信するファイル（固定の名前。内容の変化は D5 の版に入る）: `/manifest.webmanifest`、`/icons/icon.svg`、`/icons/icon-192.png`、`/icons/icon-512.png`、`/icons/icon-maskable-512.png`。プラグインが `generateBundle` で asset として出す。
  - マニフェストの項目は screen-design.md の表が正。`theme_color`・`background_color` は `#0f1317`（MASTER.md の `--background` ダーク）。`icons` は `icon-192.png`（`any`）・`icon-512.png`（`any`）・`icon-maskable-512.png`（`maskable`）。
  - `apps/web/index.html` に `<link rel="manifest" href="/manifest.webmanifest">`・`<meta name="theme-color" content="#0f1317">`・`<link rel="icon" type="image/svg+xml" href="/icons/icon.svg">`・`<link rel="apple-touch-icon" href="/icons/icon-192.png">` を直接書く。Vite のビルドは、ビルドの時点で無いパスの `<link>` を警告なしでそのまま残すことを scratch で確かめた。
  - 開発サーバーではこれらを配信しない（プラグインは `apply: 'build'`。`pnpm dev` ではアイコンとマニフェストが 404 になるが、動作に影響しない）。
- D13: アイコンの描画（decisions.md Q181 のラスタライズの手段）。
  - screen-design.md「アイコンの図案」節の幾何（帯の太さ 1/9・中心 2／4.5／7・隙間は帯の約 0.3 倍・市松に上下を入れ替える・通常は一辺の約 62%・maskable は約 50%）を1つのデータにし、SVG（`rect` の並び）と PNG の両方をそこから作る。色は地 `#0f1317`・縦 `#f68534`（`--primary` ダーク）・横 `#a1a9b0`（`--muted-foreground` ダーク）。図はキャンバス（screen-design.md の URL）を参照する。
  - PNG は自前で符号化する: 画素ごとに 4×4 の標本の色を平均し、RGBA 8bit・各行のフィルタ 0 の生データを `CompressionStream('deflate')`（zlib 形式。先頭が `78 9c` になることを node で確かめた）で圧縮して IDAT にし、CRC-32 は表引きで自前に計算する。
  - PNG はビルドのたびに生成し、リポジトリに置かない（`publicDir` はマスターのフォルダで、`apps/web/public` は使っていない）。
- D14: プライバシーの表記（AC-12）。
  - 「この端末に保存するデータ」の節の文面は screen-design.md の「項目定義（表記の文面）」が正。`LAST_UPDATED` は実装した日にする。
  - 既存の単体テストの追従: `apps/web/src/test/views/PrivacyView.spec.ts` の `最終更新日: 2026/11/04` の期待（266〜269 行）と、端末に保存するデータの列挙の期待（129 行付近）。e2e には該当の期待が無い（`2026/11/04`・`この端末に保存` を `apps/web/e2e` で検索して 0 件）。
  - `/privacy` の文面は MASTER.md には足さない（MASTER.md の UI Copy は用語の統一だけを扱う。handoff の要確認事項への答え）。
- D15: e2e。
  - `apps/web/playwright.config.ts` の `use` に `serviceWorkers: 'block'` を足す。既存の e2e と測定は SW なしで今のまま動かす（SW を許すと `page.route` のモックを迂回しうるのと、全テストで事前キャッシュの約 6MB を取りに行くため）。
  - 018 の e2e は新しいファイル `apps/web/e2e/pwa-offline.spec.ts` に置き、先頭で `test.use({ serviceWorkers: 'allow' })` にする。対象: AC-1（マニフェストの項目・`theme-color` がマニフェストと同じ値・アイコンの PNG の寸法）、AC-2（読み込み直さずに `controller` が付く・事前キャッシュに D4 の「入る」の代表があり「入らない」が無い）、AC-3（`context.setOffline(true)` で各ルートを開く・再読み込みして見出しが出る）、AC-4（オフラインで検索して結果が出る・端末内の護石と武器の一覧が出る）、AC-5（オンラインで1回読み取った後、オフラインで再読み込みして読み取れる）、AC-7（キャッシュの中身に `/api/` と en の辞書が無い）。
  - AC-6・AC-8・AC-9・AC-10・AC-11 は単体テストで確かめる。新しい版を e2e で作るには2回のビルドが要り、Google Fonts の確認は外部への接続に依存するため。
- D16: 単体テストの置き場（`conventions.md` の web 単体の規約どおり、`src/main` と同じ相対パス）。
  - `src/test/sw/`: D6 の例の全行の振り分け、install の成功と失敗（キャッシュを消して投げ直す）、activate の掃除（D5）と `clients.claim`、`SKIP_WAITING`、OCR のキー、fonts の 2 種の戦略、`response.ok` でない応答を写さないこと。Cache Storage・clients の偽物は `src/test/support/` に置く。
  - `src/test/pwa/`: マニフェストの項目、SVG、PNG（署名・IHDR の寸法・代表の画素の色。`DecompressionStream` で戻して確かめる）、一覧の入れる／除く（D4 の例）、版の計算。ビルド時のコードなので、ファイルの先頭に `// @vitest-environment node` を書く（jsdom の `Blob` を避けるため）。
  - `src/test/lib/pwa/register.spec.ts`: 本番以外で登録しない（AC-11）、初回で通知しない、`waiting` と `updatefound` で通知する、`SKIP_WAITING` を送る、`controllerchange` で読み込み直す条件、失敗を握りつぶす、`visibilitychange` の `update` と 1 時間の間隔。
  - `src/test/stores/appUpdate.spec.ts`、`src/test/components/common/AppToaster.spec.ts`（文言・ボタンの種類・再読み込み中・閉じる・トーストと出た順に並ぶ）。
- D17: `apps/web/vite.config.ts` の結線は、T2（`src/main/sw/`・`src/main/pwa/` ができた後）にメインが書く（T3）。
  - `plugins` に PWA のプラグインを1つ足す（`apply: 'build'`・`enforce: 'post'`）。`buildStart` で D3 の chunk を出し、`generateBundle` で D3 の検査 → D12 のファイルを出す → D4 の一覧と D5 の版を `src/main/pwa/` の関数で作る → `self.__SWV_PRECACHE__` を前置する。マスターの2ファイルは既存の `masterDir` から読む。
  - `src/main/pwa/` の関数の名前と引数は T2 の web-agent が決め、完了報告に書かせる。T3 の後に `pnpm --filter @swv/web run build` で `dist/sw.js`・`dist/manifest.webmanifest`・`dist/icons/` ができ、`sw.js` の先頭に D4 の例の一覧があることを確かめる。
  - `apply: 'build'` なので、`vitest.config.ts` が `vite.config.ts` を合成しても単体テストには効かない。
- D18: 文書。委譲の前にメインが書く（T1）。
  - `design/tech-stack.md`: 「判断 3」を、vite-plugin-pwa・workbox を使わず依存を足さない自前の SW にした旨（decisions.md Q6 の確認した事実と理由の要約）に書き換える。「後の機能で導入するもの」の vite-plugin-pwa の行を消す（表が空になるので節ごと消す）。「§3.3 の確認結果」の vite-plugin-pwa の行を「導入しない（判断 3）」に直す。
  - `design-system/skillweave/MASTER.md`: Component Specs に「新しい版の通知」（置き場・部品・文言・状態）と「アプリのアイコン」（図案の幾何・色・置き方・マニフェストの `name` に二次創作の旨を入れること）の節を足す。正は screen-design.md で、写すのは標準として残す要点だけにする。
- D19: 順序は T1 → T2 → T3 → T4 → T5 で、並列にしない。T2 と T4 は同じ web の領域、T5 は T4 の画面とビルドを前提にする。T2 の時点で `tsconfig.sw.json` があり（T1）、T4 の時点で `vite.config.ts` の結線がある（T3）ので、T4 の web-agent の `verify.mjs --only web` は SW を含むビルドで走る。

## 常時許可外の変更
- `apps/web/tsconfig.json`（references に tsconfig.sw.json を足す。担当: メイン。時期: T1。理由: D2）
- `apps/web/tsconfig.sw.json`（新設。担当: メイン。時期: T1。理由: D2）
- `apps/web/tsconfig.app.json`（exclude に SW の入口を足す。担当: メイン。時期: T1。理由: D2）
- `sonar-project.properties`（sonar.typescript.tsconfigPaths に tsconfig.sw.json を足す。担当: メイン。時期: T1。理由: D2）
- `apps/web/index.html`（マニフェスト・テーマの色・アイコンの参照と、Google Fonts の crossorigin。担当: メイン。時期: T1。理由: D7・D12）
- `apps/web/playwright.config.ts`（use に serviceWorkers block を足す。担当: メイン。時期: T1。理由: D15）
- `design/tech-stack.md`（判断 3 と vite-plugin-pwa の行を直す。担当: メイン。時期: T1。理由: D18）
- `design-system/skillweave/MASTER.md`（新しい版の通知とアプリのアイコンの節を足す。担当: メイン。時期: T1。理由: D18）
- `apps/web/vite.config.ts`（PWA のプラグインを足す。担当: メイン。時期: T2 の後の T3。理由: D17）
