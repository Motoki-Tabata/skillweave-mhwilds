# 030: privacy-notice 計画

## スタック
- API: Java 25・Spring Boot 4.1.2・Spring Security 7.1.2・Spring Session JDBC 4.1.1（`design/tech-stack.md` の現行どおり）。依存は足さない。
- Web: Vue 3.5.43・Vue Router 5.3.1（`design/tech-stack.md` の現行どおり）。アイコンは `apps/web/package.json` の `@lucide/vue` 1.61.0 の `ExternalLink`（`dist/esm/icons/external-link.mjs` で実在を確かめた）。依存は足さない。

## データモデル
なし

## 決定事項

### セッションの行の接続元アドレス（AC-12）
- D1: `SecurityConfig` の `oauth2Login` に `.authenticationDetailsSource(request -> null)` を足す。認証の詳細を読むコードは `apps/api/src` に無い（`getDetails`・`WebAuthenticationDetails` の検索で 0 件）。「セッションに接続元のアドレスを入れないため」という理由を1行のコメントで残す。
  - 効く理由（`spring-security-oauth2-client`・`spring-security-web`・`spring-security-config` 7.1.2 のソースで確認）: `OAuth2LoginAuthenticationFilter` は `authenticationDetailsSource.buildDetails(request)` の戻り値を要求と結果の両方に `setDetails` する。`OAuth2LoginAuthenticationProvider` もその値を写すだけで、`AbstractAuthenticationToken.setDetails` は null を受ける。`AbstractAuthenticationFilterConfigurer.authenticationDetailsSource` はこの値をフィルタへ渡す。
  - 採らない案: 独自の主体や `Authentication` への差し替え（ログインの流れの変更が大きく、009 の挙動を変える余地が増える）。保存の直前に詳細を消す案（フィルタを足す分だけ複雑になり、付けない方法で足りる）。
- D2: `DiscordOAuth2UserService` のクラスのコメント「メールアドレスと表示名は DB に書かない」を、次の事実に直す。メールアドレスは受け取らない。表示名は `users` に書かないが、主体に入ってセッションの行に保存される（decisions.md Q137）。コードは変えない。
- D3: `SessionPolicyTest` にテストを足す（`AuthFlowTest` と同じく実際の HTTP と Testcontainers の DB で、差し替えるのは Discord へのトークンの要求と利用者情報の取得だけ）。同じコンテキストを共有するので、テストの起動は増えない。
  - `http.stubDiscord` → `startAuthorization` → `callback` でログインし、`spring_session` と `spring_session_attributes` を結合して、そのセッションの行の全属性の `attribute_bytes` を読む。
  - 確かめること: `SPRING_SECURITY_CONTEXT` の属性があり、`DeserializingConverter` で戻した `SecurityContext` の認証の `getDetails()` が null で、主体の表示名が stub の値であること（テストが空振りしないことの確認を兼ねる）。全属性のバイト列を `ISO_8859_1` で文字列にして、`remoteAddress` と `WebAuthenticationDetails` を含まないこと。
  - D1 を入れる前にこのテストが失敗することを確かめ、完了報告に書く。
  - `AuthFlowTest`・`SessionPolicyTest` の既存のテストは書き換えずに通す（AC-12 の「009 の挙動を変えない」）。

### ルートとフッター（AC-1・AC-2）
- D4: `apps/web/src/main/router/index.ts` の `routes` に `{ path: '/privacy', name: 'privacy', component: () => import('@/views/PrivacyView.vue'), meta: { title: 'プライバシー | SkillWeave' } }` を足す。ガードは足さず、ログインの状態を見ない。タイトルは既存の `installTitleHook` が書く。`scrollBehavior` は足さない（screen-design.md「遷移」）。
- D5: `CreditBar.vue` の `footer` の最後の子に `RouterLink` を足す。項目の値の正は screen-design.md「項目定義」で、出典の3つの `span`・`footer` の `title`・`aria-label` は変えない。
  - クラスの方針: `ml-auto` で右端に寄せる。`-mr-2`・`px-2` で右の余白をバーの内側余白に重ね、文字の右端をページの余白にそろえる。`flex h-full shrink-0 items-center whitespace-nowrap underline` で、高さをバーにそろえ、切り詰めも折り返しもしない。`text-foreground`、フォーカスは `focus-visible:ring-ring` の内側のリング（`ring-inset`）にする。
  - `aria-current="page"` は `RouterLink` が付けるので、自分では書かない。見た目を変えるクラスも足さない。

### プライバシーの画面（AC-1・AC-3〜AC-11）
- D6: `apps/web/src/main/views/PrivacyView.vue` を足す。文面は screen-design.md「表記の文面」をそのまま template に書く（辞書・ストア・API・マスターを使わない）。
  - 枠: 他の画面と同じ `mx-auto w-full px-4 py-4 md:max-w-[720px] md:px-6 lg:max-w-[1280px]`。本文はその中で `max-w-[720px]` にして左に寄せる。
  - 文字: `h1` は `text-xl leading-snug font-bold`、`h2` は既存の `h2` と同じ `text-base leading-snug font-bold`、本文は `text-sm`、最終更新日は `text-xs`。MASTER.md の「小見出し（刻印風）」は使わない（既存の `h2` に実装が無く、tasks/lessons.md の 2026-11-02 の項が未決のため）。
  - 最終更新日: `2026/11/03`（decisions.md Q135 で事実を確かめた日）を、`PrivacyView.vue` の定数 `LAST_UPDATED` に書く。ビルドの日時から作らない（文面を変えていなくても日付が動くため）。「文面を変えたらこの値も変える」とコメントを添える。
- D7: 画面の先頭とフォーカス。`onMounted` で `heading.value?.focus({ preventScroll: true })` のあとに `window.scrollTo(0, 0)` を呼ぶ。`h1` は既存の画面と同じく `ref="heading"`・`tabindex="-1"`・`outline-none` にする。ルーター全体の挙動は変えない。
- D8: 本文のリンクは screen-design.md「リンク」の表のとおり。新しいタブのリンク（Google Fonts の FAQ・Cloudflare のプライバシーポリシー）は、`ExternalLink`（`aria-hidden="true"`）と `<span class="sr-only">（新しいタブで開く）</span>` を添える。2か所だけなので共通の部品にしない。文中のリンクなので高さは広げない（MASTER.md の操作領域の 44px の対象は行内のボタンや一覧の選択肢で、文中のリンクを含まない）。

### Web の単体テスト（web-agent）
- D9: 次を足す。既存の `App.spec.ts`・`router/index.spec.ts` の期待は書き換えない。
  - `apps/web/src/test/views/PrivacyView.spec.ts`: `mountApp({ path: '/privacy' })` で、AC-1（未ログイン・ログイン中・認証状態の取得不能・マスターの読込失敗で同じ `h1` と本文が出る）、AC-3〜AC-11（各 AC の語句と、リンクの `href`・`target`・`rel`・読み上げの文言。最終更新日の形式）。AC-3 は「Google 側の用途を断定しない」ので本文に用途の語を足さない。AC-10 は Cloudflare の文に数値が無く、Google Cloud の 30 日だけがあること。D7 のフォーカスと `window.scrollTo(0, 0)`（jsdom に実装が無いので spec の中で差し替える）。
  - `App.spec.ts`: `expectCommonLayout` に、フッターの `/privacy` へのリンクの文言・`href`・`title` の確認を足す（読込前・読込失敗・準備完了のすべてで通る）。`/privacy` で `aria-current="page"` が付くことも確かめる。
  - `router/index.spec.ts`: `/privacy`（`privacy`）のルートとタイトル。
  - テスト用ルーターの追従は要らない。`App.vue` を読むのは `support/mount.ts` だけで、`CreditBar` を単独でマウントする spec も無く、`support/mount.ts` は本物の `routes` を使う（検索で確かめた）。

### E2E（e2e-agent）
- D10: `apps/web/e2e/privacy-notice.spec.ts` を足す。既存の `solver-ui.spec.ts` の `contentinfo` の確認（`toContainText`）はリンクを足しても通るので変えない。
  - AC-1: `/privacy` を直接開く。`**/api/auth/me` を 401・200・503 に差し替えて、どれでも `h1` と本文が出て、タイトルが `プライバシー | SkillWeave` になり、`h1` にフォーカスがあること。
  - AC-2: `/`・`/charms`・`/privacy` のフッターにリンクがあること。`/` をスクロールした状態からリンクを押すと、`/privacy` に移り、`scrollY` が 0 で `h1` にフォーカスがあること。
  - AC-2 の幅: 幅 360px で、リンクの `scrollWidth` が `clientWidth` を超えず、リンクの全体が画面の中にあり、フッターの高さが 32px で、ページの横スクロールが無いこと。

### 設計標準（AC-2）
- D11: `design-system/skillweave/MASTER.md`「画面骨格」のクレジットのバーの項の直後に、次の2文を足す。メインがワーカーへの委譲の前に書く。「バーの右端に `/privacy` へのリンクを置く。リンクは切り詰めない。」「リンクの高さはバーと同じにする（操作領域の 44px の例外）。」

### 実際の起動経路での確認（メイン）
- D12: E2E の後に、メインが次を確かめて handoff の区間メモに記録する。ファイルは書かない。
  - `pnpm --filter @swv/web run build` をやり直してから（`test:e2e` の後の `dist` には測定用のページが入るため）、`pnpm --filter @swv/web exec wrangler dev` で起動し、`curl` で `/privacy` が 200 で `/` と同じ `index.html` を返すことを確かめる（decisions.md Q132 の「デプロイして確かめていない」の、手元で確かめられる範囲）。
  - 本物の Discord でのログインと、デプロイした環境での確認は行わない。AC-12 の確認は D3 までで、本番の照合は Q140 に残す。この2点を未確認として D-1 の提示に書く。

## 常時許可外の変更
- `design-system/skillweave/MASTER.md`（画面骨格のクレジットのバーに、プライバシーの画面へのリンクとその高さを足す。担当: メイン。理由: 全画面の骨格の標準で、ゲート B-1 で決めた 44px の例外を標準に残すため）
