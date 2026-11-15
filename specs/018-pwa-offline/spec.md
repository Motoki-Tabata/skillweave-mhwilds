# 018: pwa-offline

## 目的 / ユーザーストーリー
利用者として、SkillWeave を端末にアプリとしてインストールし、通信できない場所（電波の弱い場所・機内など）でも、装備検索と端末内の護石・武器の閲覧を続けたい。ゲーム中に手元で構成を組み直すためである。運営者として、依存を足さずに（decisions.md Q6）これを実現し、新しい版を配備したら利用者が古い版に残らないようにしたい。

用語:
- Service Worker（SW）: `/sw.js` で配信する自前のスクリプト。依存を使わない（decisions.md Q6）。
- 事前キャッシュ: SW のインストールの時点で取得して端末に写すファイル。画面のファイル（`index.html`・`/assets/**` の JS・CSS・ソルバーの WASM）と、マスター `master-<版>.json`・ja の辞書 `master-<版>.ja.json`（decisions.md Q179）。
- 利用時キャッシュ: 初めて取得したときに写し、以後はキャッシュから返すファイル。OCR のファイル `/tesseract/**`（decisions.md Q179）と Web フォント（`fonts.googleapis.com`・`fonts.gstatic.com`。`design/tech-stack.md` 判断 6）。

## 受入基準（EARS記法）
- AC-1: THE system SHALL Web アプリのマニフェスト（名前・短い名前・開始 URL `/`・`display: standalone`・テーマの色・192px と 512px の PNG のアイコン・maskable のアイコン）を配信し、`index.html` から参照しなければならない。アイコンは公式の画像を使わない自作の図案にしなければならない（decisions.md Q181・憲法）。
- AC-2: WHEN 本番のビルドの画面を開いたとき THE system SHALL `/sw.js` を登録し、事前キャッシュの対象をすべて取得し終えてから有効にしなければならない。初回の訪問では、有効になった時点でその画面を SW の制御下に置かなければならない。
- AC-3: WHILE 端末がオフラインのとき THE system SHALL 事前キャッシュの済んだ端末で、どのルート（`/`・`/charms`・`/weapons`・`/builds`・`/privacy` など）を直接開いても、または再読み込みしても、画面を表示しなければならない。
- AC-4: WHILE 端末がオフラインのとき THE system SHALL 装備検索（マスターの読み込み・ソルバーの実行・結果の表示）と、端末内の護石・個体差のある武器の一覧の表示を、オンラインのときと同じように行わなければならない。
- AC-5: WHEN `/tesseract/**` のファイルを初めて取得したとき THE system SHALL その応答を写し、以後はキャッシュから返さなければならない。事前キャッシュには含めてはならない。オンラインで一度 OCR を使った端末では、オフラインでも OCR を使えなければならない（decisions.md Q179）。
- AC-6: WHEN Web フォント（`fonts.googleapis.com` の CSS・`fonts.gstatic.com` のフォント）を取得したとき THE system SHALL その応答を写し、オフラインのときはキャッシュから返さなければならない（`design/tech-stack.md` 判断 6）。
- AC-7: THE system SHALL `/api/*` への要求（画面の遷移・ログインの開始を含む）と GET 以外の要求を、SW でキャッシュから返したり写したりしてはならず、常にネットワークへ送らなければならない（decisions.md Q178）。en の辞書など、画面が読まないファイルも写してはならない。
- AC-8: WHEN 新しい版の SW が事前キャッシュを取り終えたとき THE system SHALL 開いている画面に、新しい版がある旨と再読み込みの操作を出さなければならない。利用者が操作するまでは今の版のまま動かし、今の版の事前キャッシュを消してはならない（decisions.md Q180）。
- AC-9: WHEN 利用者が再読み込みの操作をしたとき THE system SHALL 新しい版の SW を有効にし、開いているアプリのすべての画面を新しい版で読み込み直し、古い版の事前キャッシュを消さなければならない。利用時キャッシュは版が変わっても残さなければならない。
- AC-10: IF 事前キャッシュの取得に失敗したとき（通信の切断・容量の不足など）THEN THE system SHALL その版の SW を有効にせず、画面はオンラインのときの今の挙動のまま動かし、エラーの表示を出してはならない。
- AC-11: WHERE Vite の開発サーバー（`pnpm dev`）と単体テストで動かすとき THE system SHALL SW を登録してはならない。
- AC-12: THE system SHALL `/privacy` の表記の端末内に保存するデータに、オフラインで使うために画面のファイル・マスター・OCR のファイル・Web フォントを端末に保存することと、サーバーから取得した護石・構成などのデータは保存しないことを書き、表記の最終更新日を更新しなければならない。
- AC-13: THE system SHALL 依存（`package.json` の dependencies・devDependencies）を足さずに AC-1〜AC-11 を満たさなければならない（decisions.md Q6）。

## スコープ外
- API の応答のキャッシュ（アカウントの護石・武器・保存した構成・共有した構成・共有 URL の閲覧。decisions.md Q178）と、オフラインの書き込みの待ち行列（010 decisions.md）
- オフラインであることを示す表示（ヘッダーの印など）。オフラインのときの既存の画面の文言（取得できない旨など）は変えない
- インストールを促す独自の操作（`beforeinstallprompt` を使うボタン）。インストールはブラウザの標準の操作で行う
- プッシュ通知・バックグラウンド同期
- iOS 向けの起動画面（`apple-touch-startup-image`）
- 英語のマニフェスト・表記
- フォントのセルフホスト（`design/tech-stack.md` 判断 6 は変えない）
- `vite-plugin-pwa`・workbox の導入（decisions.md Q6）

## 契約差分
- なし（API を変えない。SW は `/api/*` に手を出さない）

## 影響範囲
触る領域: web
常時許可外の変更予定:
- `apps/web/vite.config.ts`（SW のビルドと事前キャッシュの一覧の埋め込み・マニフェストとアイコンの配信をする Vite のプラグインを足す）
- `apps/web/index.html`（マニフェスト・テーマの色・アイコンの参照を足す）
- `apps/web/tsconfig.json`（SW を WebWorker の型で検査する tsconfig の参照を足す。区間 C で要否を確かめる）
- `apps/web/tsconfig.sw.json`（SW 用の型検査の設定を新設する。区間 C で要否を確かめる）
- `design/tech-stack.md`（「判断 3」と「後の機能で導入するもの」の vite-plugin-pwa の行を decisions.md Q6 に合わせて直す）
- `design-system/skillweave/MASTER.md`（新しい版の通知の見た目とアプリのアイコンの図案を足す）

## 依存する機能ID
- 004, 016
