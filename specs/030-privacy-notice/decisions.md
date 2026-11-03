# 030 privacy-notice の決定記録

## Q132（決定: 2026-11-03）
- 問い: プライバシーの表記の置き場所と経路。いまのフッター（`CreditBar.vue`）はマスターの出典だけで、二次創作の表記はヘッダーのバッジ（`AppHeader.vue`）にある。ルートは `apps/web/src/main/router/index.ts` に 7 つあり、`wrangler.jsonc` は `not_found_handling: single-page-application` なので、`/privacy` を足せば `run_worker_first` に入れなくても `index.html` で届く（デプロイして確かめていない）（仮: 専用ページ `/privacy` を足し、フッターとログインの前から辿れるリンクを置く。ダイアログにしない理由は、URL で直接示せることと、Discord の同意画面の前に案内できること。030 の区間 A で決める）
- 決定: 専用ページ `/privacy` を足し、全画面に固定で出るフッター（`CreditBar.vue`）からリンクする。ログインのボタンの横には足さない。
- 理由: フッターはログインの前から常に見えるので、1 か所で「同意画面の前に案内できる」を満たす。ヘッダーの右端はログインの導線の場所が 1 か所と決まっている（`design-system/skillweave/MASTER.md`）。

## Q133（決定: 2026-11-03）
- 問い: プライバシーの表記の言語。UI は日本語のみで（`vue-i18n` 等の依存が無い。en の辞書があるのはマスターデータだけ）、英語の画面は無い（仮: 日本語のみにする。英語は UI の多言語化と合わせて別に扱う）
- 決定: 日本語のみにする。
- 理由: UI 全体が日本語のみで、この画面だけ英語を足す仕組みが無い。

## Q134（決定: 2026-11-03）
- 問い: プライバシーの表記に運営者の連絡先を載せるか。ドメインの RDAP には登録者情報を出していない（028 decisions.md Q83）。載せないと、利用者が削除などを頼む先が無い。載せると運営者が特定されうる（仮: 030 の区間 A でユーザーが決める。載せる場合の候補は GitHub のリポジトリの issue。連絡先を載せないなら、データの削除をどう扱うかの文面を合わせて決める）
- 決定: `contact@skillweave.app` を載せ、Cloudflare Email Routing で運営者の受信箱へ転送する。転送の設定と受信の確認は公開の作業で行う（Q140）。
- 理由: 依頼の内容が公開されず、登録者情報も出ない。GitHub の issue は、運営者のアカウントが表に出て、削除の依頼と Discord の情報が公開の場に残るので採らない。載せない案は、サーバーのデータの消去を頼む先が無くなるので採らない。返信すると転送先のアドレスが相手に見える点は受け入れる。

## Q135（決定: 2026-11-03）
- 問い: プライバシーの表記に書く事実の確認。次を一次情報で確かめてから書き、確かめられないものは書かずに保留する。(a) Discord のログインで保存する項目と、要求する scope（`apps/api` の保存コードと `application.yml` を読む）。(b) 端末内に保存するデータ（`apps/web` の IndexedDB・localStorage のキーを列挙する）。(c) Cloudflare（Workers のアクセスログ）と Google Cloud（Cloud Run のログ）が記録する項目と保持期間（公式の資料で確かめる）。(d) Google Fonts の CDN への IP アドレスの送信（`design/tech-stack.md` 判断 6）。(e) Neon に保存する項目と期間（セッションの行の保持を含む）（仮: 030 の区間 A の最初の工程で表にまとめる。(c) は公開の作業で実際の設定を見てから確定する）
- 決定: 確かめた次の事実だけを書く。外部サービスのログは「記録されることがあります」と書き、保持期間は確認できた Google Cloud の既定の 30 日だけを載せる。Cloudflare は期間を書かず公式のポリシーへリンクする。サーバーの場所は「シンガポールなど日本国外」と書く。本番の設定との照合は公開の作業で行う（Q140）。

  | 区分 | 事実 | 確かめた先 |
  |---|---|---|
  | (a) Discord | scope は `identify` だけで、メールアドレスを受け取らない。アクセストークンは保持しない | `application.yml`・`SecurityConfig`・Discord の公式資料（`/users/@me` は `identify` だけならメールアドレスを返さない） |
  | (a)(e) `users` | `discord_id` と作成・更新日時 | `V1__create_users.sql` |
  | (e) セッションの行 | 内部のユーザー ID・表示名が入る。有効期間は 30 日で、掃除は毎日 3:00 UTC（未ログインで認可を始めただけの行は 10 分） | `application.yml`・一時テストで実際の行を確認（2026-11-03） |
  | (e) 保存データ | 護石・構成・個体差のある武器・共有。削除は `deleted_at` を付けるだけで、行は残る | `V3`〜`V6`・リポジトリのコード |
  | (e) Neon | 地域は Singapore。無料プランの復元期間は 6 時間 | 028 decisions.md Q87・Neon の公式資料 |
  | 共有 | URL を知っていれば誰でも読める。応答に利用者を示す項目は無い | `contracts/components/schemas/shares/SharedBuild.yaml` |
  | (b) 端末内 | IndexedDB `swv`（`charms`・`weapons`）、localStorage `swv-theme`、sessionStorage `swv-login-return` | `apps/web` の `lib/storage/database.ts`・`lib/theme.ts`・`lib/auth/loginReturn.ts` |
  | Cookie | `SESSION`・`XSRF-TOKEN` | `SecurityConfig` |
  | アクセス解析 | 入れていない | `apps/web` の検索 |
  | (c) Cloud Run | 要求ログは自動で作られる。項目は `remoteIp`・`userAgent`・`referer`・`requestUrl` など。`_Default` の保持は既定で 30 日 | Google Cloud の公式資料 |
  | (c) Cloudflare | Workers Logs は公式資料の中で、既定で有効とする記述と設定の追加が要るとする記述が食い違う。`wrangler.jsonc` に `observability` は無い。保持期間は確定しない | Cloudflare の公式資料・`wrangler.jsonc` |
  | (d) Google Fonts | フォントの読み込みで IP アドレス・要求の URL・User-Agent などのヘッダーが Google に届く | `apps/web/index.html`・`design/tech-stack.md` 判断 6。FAQ の本文はクライアント描画で取得できず、検索結果の要約でしか読めていないので、Google 側の用途は断定せず FAQ へリンクする |

- 理由: 確かめていないことを書くと、表記そのものが誤りになる。ログの有無を断定せず上限で書けば、Q88 の設定の細部に左右されない。

## Q137（決定: 2026-11-03）
- 問い: セッションの行に入る接続元アドレスをどうするか。Spring Security の `OAuth2LoginAuthenticationFilter` は `WebAuthenticationDetails`（`remoteAddress` を含む）を認証に付け、`SPRING_SECURITY_CONTEXT` として `SPRING_SESSION_ATTRIBUTES` に保存する。一時テストで、実際の行に `remoteAddress` と接続元のアドレスが入ることを確かめた（2026-11-03）。`forward-headers-strategy` を使わないので、本番で入るのが利用者の IP か手前のプロキシのアドレスかは未確認。
- 決定: 保存をやめる。ログインの認証に詳細を付けないようにし、セッションの行に入らないことをテストで固定する。`DiscordOAuth2UserService` の「メールアドレスと表示名は DB に書かない」は、表示名がセッションの行に入る事実に合わせて直す。
- 理由: 詳細は使っておらず、やめれば「データベースに IP アドレスを保存しない」と表記に書ける。未デプロイなので、既存の行の移行は要らない。保存したまま書く案は、本番で何が入るかが未確認のまま残る。

## Q138（決定: 2026-11-03）
- 問い: 護石・構成・武器・共有を削除しても、`deleted_at` を付けるだけで行が残り、物理削除するコードが無い点を 030 でどう扱うか。
- 決定: 表記に「削除してもデータベース上に残ること」と「完全な消去は連絡先へ依頼すること」を書き、当面は運営者が手作業で消す。物理削除とアカウントの削除の機能は 030 に入れず、Q139 に残す。
- 理由: 物理削除を入れると、保持期間の決定と外部キーの順序の検討が増え、S の規模を超える見込み。公開の前に要るのは事実が読めることで、フレンド公開の規模なら依頼は手作業で扱える。
