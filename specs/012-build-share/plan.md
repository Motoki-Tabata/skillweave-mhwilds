# 012: build-share 計画

## スタック
- API: Java 25・Spring Boot 4・Spring Security・Spring Session JDBC・Spring Data JPA・Bean Validation・springdoc-openapi（版は `design/tech-stack.md` の現行どおり）。009 の `SecurityConfig`・010 の Jackson の厳密な型の設定・011 の `BuildPayload` の record をそのまま使う。短縮 ID の乱数は JDK の `java.security.SecureRandom`。依存は足さない。
- Web: Vue 3・vue-router・Pinia・reka-ui・@lucide/vue・Vitest・@playwright/test（版は `design/tech-stack.md` の現行どおり。依存は足さない）。
- 追加する ui 部品は無い（screen-design.md 0。既存の `card`・`button`・`badge`・`dialog`・`alert-dialog`・`skeleton`・`alert`・`ResultAlert`・`AppToaster` で足りる）。`Select` を使わないため、`sonar-project.properties` の抑止の追記は要らない。
- HTTP は既存の `apps/web/src/main/lib/http.ts`。クリップボードはブラウザの `navigator.clipboard.writeText`。`packages/solver`・`packages/data` は変えない。

## データモデル
- `shares`（`id` uuid DEFAULT uuidv7()・`short_id` text（`^[0-9A-Za-z]{12}$`・全行で一意 `uq_shares_short_id`）・`user_id` uuid → `users (id)`・`build_id` uuid → `builds (id)`・`name` text（`char_length` 1〜50）・`master_version` text（空でない）・`payload` jsonb（`jsonb_typeof = 'object'`）・`schema_version` integer（1 以上）・`created_at`・`updated_at`・`deleted_at` NULL）。`version` は持たない（`design/data-model-standard.md` の楽観ロックの節）。
- 部分一意インデックス `uq_shares_build_id (build_id) WHERE deleted_at IS NULL`（有効な共有は構成につき1つ）と、部分インデックス `ix_shares_user_id (user_id, id DESC) WHERE deleted_at IS NULL`。`V6__create_shares.sql`（区間 B・5180e18）。
- 属性は `design/attributes.yaml`（`defined_by: specs/012-build-share`）。`id` はクライアント採番の UUIDv7、`short_id` はサーバーの採番。

## 決定事項

### 文書（メイン）
- D1: 委譲の前に、メインが `design-system/skillweave/MASTER.md` に screen-design.md 9 の内容（UI Copy の「共有」「共有した構成」「共有された構成」「共有を取り消す」、Component Specs の「URL の表示」）を足す（T1）。
  - 理由: web-agent が文言と部品を MASTER.md と突き合わせて実装するため。spec.md の影響範囲は「常時許可外の変更予定: なし」だが、区間 B の screen-design.md 9 で追記が決まった（教訓台帳 2026-10-29 の MASTER.md の項と同じ経緯）。

### 契約（contract-agent）
- D2: 契約のファイルと名前（spec の契約差分）。
  - パス: `paths/shares/shares.yaml`（GET `listShares`・POST `createShare`）・`paths/shares/shares-id.yaml`（DELETE `revokeShare`）・`paths/shared-builds/shared-builds-shortId.yaml`（GET `getSharedBuild`）。4つとも `x-swv-status: draft` を付けて足す（T3 の後にメインが外す）。`openapi.yaml` に tag `shares`・`shared-builds` と3つのパスの `$ref` を足す。
  - 応答: GET `listShares` 200（`Share` の配列）・401。POST `createShare` 201（`Share`。作った）・200（`Share`。既存の有効な共有）・400・401・404・409。DELETE `revokeShare` 204・401。GET `getSharedBuild` 200（`SharedBuild`）・404。400・401・404・409 は既存の `components/responses/` を参照する。CSRF の拒否の 403 は `responses` に書かず、状態を変える2つの `description` に散文で書く（010・011 と同じ）。
  - `getSharedBuild` は `security: []`（未ログイン可）とし、`description` の「公開範囲・認証」に、GET・HEAD だけを未ログインに許すこと、応答に共有の行の ID・元の構成の ID・作成者の情報を含めないことを書く。`listShares`・`createShare`・`revokeShare` は `sessionCookie`。
  - スキーマ（`components/schemas/shares/`）:
    - `Share`（`id`・`shortId`・`buildId`・`name`・`createdAt`。すべて必須）。
    - `CreateShareRequest`（`id`・`buildId`。どちらも必須・`format: uuid`）。
    - `SharedBuild`（`name`・`masterVersion`・`payload`・`schemaVersion`・`createdAt`。すべて必須。`payload` は既存の `../builds/BuildPayload.yaml` を参照する）。
  - `shortId` は `pattern: '^[0-9A-Za-z]{12}$'`。`name`・`masterVersion`・`schemaVersion`・`createdAt` の制約は `Build.yaml` の同名の項目と同じにする。パスの `{id}` は `builds-id.yaml` と同じく `format: uuid`、`{shortId}` は `type: string` だけにし、形の違う短縮 ID は不在と同じ 404 になることを `description` に書く（D6）。
  - `description` は `contracts/README.md` の固定テンプレートで書き、`refs specs/012-build-share/spec.md` を付ける。
  - 理由: 管理の API（`/api/shares`）と閲覧の API（`/api/shared-builds`）を別のパスに分けると、`SecurityConfig` の未ログインの許可を閲覧のパスの GET・HEAD だけに絞れる（AC-11）。`revokeShare` は画面の操作の名前（「共有を取り消す」）に合わせる。
- D3: 短縮 ID の規則（decisions.md Q89・AC-2）。
  - 文字は base62（`0-9`・`A-Z`・`a-z` の 62 字）、長さは 12 字。サーバーが `SecureRandom#nextInt(62)` で1字ずつ選ぶ（剰余の偏りが無い）。
  - 例: 当てはまる `Ab3dE6gH9jK2`（screen-design.md 4.1 の例）・`0aZ9xQ1bY8cW`。当てはまらない `Ab3dE6gH9jK`（11 字）・`Ab3dE6gH9j-2`（`-` を含む）。共有の URL は `http://localhost:5173/s/Ab3dE6gH9jK2` の形（D11）。

### API（api-agent）
- D4: 永続化は JPA にする。`entity/Share`（`payload` は既存の record `BuildPayload` を `@JdbcTypeCode(SqlTypes.JSON)` で jsonb に写す。`@Version` は持たない）と `repository/ShareRepository`。
  - `Share` はクライアント採番の ID を持ち `@Version` が無いので、Spring Data の `save` は既定で `merge`（既存の行の上書き）になる。`Persistable<UUID>` を実装し、新規の間は `isNew()` を true にして（`@PostPersist`・`@PostLoad` で false にする）、ID の衝突が主キー違反として表に出るようにする。
  - `created_at`・`updated_at` はサーバーが決める（UTC・マイクロ秒に丸める。`BuildService#now` と同じ）。
- D5: 管理の API の処理（decisions.md Q90・Q101。controller は `controller/ShareController`（`/api/shares`）、処理は `service/ShareService`）。主体は `@AuthenticationPrincipal DiscordUserPrincipal` の `userId`。
  - 一覧: 自分の `deleted_at IS NULL` の行を `id` の降順で全件返す。元の構成を削除した共有も含む（構成の状態は見ない）。
  - 作成: 次の順で判定する。
    1. 元の構成を `BuildRepository#findByIdAndUserIdAndDeletedAtIsNull` で探し、無ければ 404（他のユーザーの構成も 404）。
    2. その構成の有効な共有があれば、新しく作らずにその共有を 200 で返す（AC-3。要求の `id` が既存の行と衝突していても 200 を優先する）。
    3. 要求の `id` が既存の行（自分・他のユーザー・取り消し済みを問わない）と衝突したら 409。
    4. 構成の行から `name`・`master_version`・`payload`・`schema_version` を写し、D3 の短縮 ID を採番して INSERT し、201 で返す。
  - INSERT の一意制約の違反は制約名で分ける（`BuildService#create` と同じく、メソッドを `@Transactional` で包まず、`saveAndFlush` の単位で失敗させる）。`pk_shares_id` は 409。`uq_shares_short_id` は短縮 ID を採番し直して INSERT をやり直す（上限 5 回。超えたら変換せずに例外を上げる）。`uq_shares_build_id`（同時の作成）は、その構成の有効な共有を読み直して 200 で返す。
    - 制約名を取り出す関数を `common/util/` に足す（既存の `PrimaryKeyViolations#isViolationOf` の振る舞いは変えない）。制約名を取り出せないときは変換しない（`shares` は一意制約が3つあり、SQLState 23505 だけではどれか決められないため）。
  - 短縮 ID の採番は `SecureRandom` を持つ部品（例 `service/ShortIdGenerator`）に分け、テストで衝突する値を返す偽物に差し替えられるようにする。
  - controller は 201 と 200 を `ResponseEntity` で返し分ける。`@ApiResponse` で D2 の status code を宣言する（`OpenApiContractTest#responseStatusCodesMatchImplementation` が契約と突き合わせる）。
  - 取り消し: 自分の削除していない行に `deleted_at` と `updated_at` を入れる一括 UPDATE（`version` は無い）。行が無い・他のユーザー・取り消し済みでも 204。パスの `{id}` が UUID の形でないときも 204（`BuildController#delete` と同じ）。
  - 404・409 は既存の `ResourceNotFoundException`・`ResourceConflictException` を使う（教訓台帳 2026-10-28 の例外の項）。
- D6: 閲覧の API（decisions.md Q90・Q101・AC-10・AC-11。controller は管理と別の `controller/SharedBuildController`（`/api/shared-builds`））。
  - `GET /api/shared-builds/{shortId}`: `short_id` が一致し `deleted_at IS NULL` の行を返す。無い・取り消し済み・`{shortId}` が `^[0-9A-Za-z]{12}$` に当てはまらないときは、区別せずに 404。
  - 応答の DTO（例 `dto/response/SharedBuildResponse`）は `name`・`masterVersion`・`payload`・`schemaVersion`・`createdAt` だけを持つ（行の ID・元の構成の ID・`user_id` を DTO に持たせない）。
  - 主体を引数に取らない（ログインの有無で応答を変えない）。
- D7: 認可（AC-11・AC-12）。`config/SecurityConfig` の未ログインの許可に `getOrHead("/api/shared-builds/*")` を足す。それ以外の `/api/**`（`/api/shares` を含む）はログインを要するまま。CSRF は `csrf.spa()` のまま（GET・HEAD は対象外）。
  - 理由: 未ログインで読めるユーザーデータの API はこれが最初になる。許可を GET・HEAD と1段のパスに絞り、`/api/shared-builds`（ID なし）・`/api/shared-builds/x/extra`・POST などは従来どおりログインを要する。
- D8: API のテスト（AC-14。Testcontainers の PostgreSQL・`users` の行を2人分。`controller/ShareControllerTest`・`controller/SharedBuildControllerTest` と、必要なら `service/ShareServiceTest`）。
  - 作成: 201 で、構成の行から `name`・`masterVersion`・`payload`・`schemaVersion` が写ること（要求に `name`・`payload` を足しても、行には構成の行の値が入ること）・応答が `Share` の5項目で、短縮 ID が D3 の形であること。有効な共有がある構成で2回目が 200 で同じ共有を返し行が増えないこと。元の構成が無い・削除済み・他のユーザーの構成で 404、ID の衝突（自分の行・他のユーザーの行・取り消し済みの行の3通り）で 409、どちらも行が増えないこと。`id`・`buildId` の欠落・UUID でない値で 400。
  - 短縮 ID: 採番の偽物が既存の短縮 ID（取り消し済みの行のものを含む）を先に返すと採番し直して作れること・取り消し済みの共有の短縮 ID が再利用されないこと（AC-2）。
  - 一覧: ID の降順・取り消し済みと他のユーザーの行を含まない・元の構成を削除した共有を含むこと。
  - 取り消し: 204 で `deleted_at` が入ること・冪等（2回目も 204）・存在しない ID と UUID でない ID も 204・他のユーザーの共有は 204 で行が変わらないこと・取り消した後に同じ構成で新しい共有（別の短縮 ID）を 201 で作れること。
  - 閲覧: 未ログインで 200 と応答の項目が5つだけであること（`id`・`buildId`・`shortId`・`userId` などを含まない）・ログイン中でも同じ応答・HEAD が 200・取り消し済み・存在しない・形の違う短縮 ID で 404。元の構成の名前の変更と削除の後も閲覧の内容が変わらず、共有が残ること（AC-7）。
  - 認可: `listShares`・`createShare`・`revokeShare` の未ログインの 401、`createShare`・`revokeShare` の CSRF トークンの無い要求の 403 で行を変えないこと、閲覧のパスへの POST・DELETE と `/api/shared-builds`・`/api/shared-builds/x/extra` の未ログインが許されないこと（`AuthorizationBypassTest` に足すか、同じ形で書く）。他のユーザーの共有を返さない・変えないこと。
  - 入力だけが違う同形のテストは `@ParameterizedTest` にまとめる（`.claude/rules/api-spring.md` の `java:S5976`）。既存の `SmokeTest`・`OpenApiContractTest`・`AuthorizationBypassTest`・`BuildControllerTest` を通す。

### Web（web-agent）
- D9: API の層 `lib/api/shares.ts`（`pnpm contract:types` で再生成した `schema.ts` の `Share`・`CreateShareRequest`・`SharedBuild` を使う）。
  - `SharesApi`（`list`・`create`・`revoke`・`view`）を `BuildsApi` と同じく差し替えられる形にし、結果は `lib/api/result.ts` の `ApiResult` にする。`create` の結果は `{ share, created }` とする。
  - `created` は「応答の `id` が要求の `id` と同じ」で判定する（201 は要求の ID で行を作ったとき、200 は既存の有効な共有で ID が違う。Web は押すたびに新しい ID を採番する）。`http.ts` は応答の status を返さないため、status を返す経路を足さずに済ませる。
  - 応答の形を検査し、合わなければ `failed`（`server`）にする。`SharedBuild` の `payload` の検査は `lib/api/builds.ts` の `isBuildPayload` を export して使う（同じ検査を二重にしない）。`schemaVersion` は 1。
- D10: 共有のストア `stores/shares.ts`（screen-design.md 3.3・4・7、decisions.md Q69 の扱い）。`stores/builds.ts` と同じ規則にする。
  - 状態は、判定中・ログインが必要（未ログインと「取得できない」を区別する）・読込中・一覧あり（0件を含む）・読込失敗（原因の文言）。`ensureLoaded()` は `useAuthStore().initialize()` を待ってから、ログイン中なら一覧を読む。画面を開くたびにサーバーから読む。「再読み込み」は一覧だけを読み直す。
  - `create(buildId)` は `uuidv7()` で採番して送り、結果（`created`・`existing`・`notFound`・`failed`・`expired`・`discarded`）と共有を返す。成功したら一覧を読み込み済みなら先頭に足す（`existing` は足さない）。`notFound` は `useBuildsStore().reload()` で構成の一覧を読み直し、screen-design.md 3.3 のトーストを出す。押し直しは新しい ID で送る。
  - `revoke(id)` は応答待ちの ID を持ち（「取り消し中…」）、成功したら一覧から消す。それ以外の失敗は一覧を変えない。
  - 401 は screen-design.md 7.1 の文言で、`auth.expire()` が変えたときだけトーストを出す（構成の API と同時の 401 で1回）。ログイン中でなくなったら（ログアウト・`expire()`）その場でログインが必要の状態にし、それより前に送った要求の応答を一覧にもトーストにも反映しない（`stores/builds.ts` と同じく世代の番号などで捨てる）。
  - 閲覧（S7）はストアに状態を持たせず、`fetchShared(shortId)` で `SharesApi#view` の結果をそのまま返す（ログインの状態を待たない）。S7 が自分の状態（読込中・表示・見つからない・読込失敗）を持つ。
  - `setApi` で API を差し替えられる形にする。
- D11: 共有の URL と表示の関数（`lib/shares/`）。
  - URL は `location.origin` と、ルート `shared-build` の `router.resolve` の `href` から組み立てる（decisions.md Q71。`import.meta.env.BASE_URL` を自前で連結しない）。例: `http://localhost:5173/s/Ab3dE6gH9jK2`。
  - コピーは `navigator.clipboard.writeText` で行い、使えない・拒否されたときは失敗を返す（呼び出し側が URL の文字を全選択し、トーストを出す。screen-design.md 3.3）。
  - `lib/solver/buildView.ts` の `savedBuildView` の引数の型を `Pick<Build, 'masterVersion' | 'payload'>` に広げ、`SharedBuild` をそのまま渡せるようにする（中身の処理は変えない。現在のマスターに無い ID の扱いも 011 のまま。AC-5・AC-6）。
- D12: 画面（screen-design.md 1〜7）。
  - ルート: `router/index.ts` に `/shares`（`shares`・「共有した構成 | SkillWeave」）と `/s/:shortId`（`shared-build`・「共有された構成 | SkillWeave」）を足す。ルートの一覧や件数を見ている既存の spec（`test/router/index.spec.ts` など）は追従する。
  - C1 `components/common/AppNav.vue`: 「共有した構成」を3番目に足す。`/s/:shortId` ではどのリンクにも `aria-current` を付けない（`isCurrent` の前方一致が `/s/` に当たらないことをテストで確かめる）。ナビのリンクの数や並びを見ている既存の spec は追従する。
  - S5 `views/BuildView.vue`: 操作の行の先頭に「共有」（削除中は無効）を足し、D9 を開く。D9 は `components/shares/ShareDialog.vue`（確認の段と URL の表示の段。201・200 の文言、404・401・それ以外の失敗の扱い、閉じたときと 404 の後のフォーカス）。URL の枠と「URL をコピー」は `components/shares/ShareUrl.vue` にして S6 と共有する。
  - S6 `views/SharesView.vue` と一覧の行 `components/shares/ShareListItem.vue`（読込中・ログインが必要・空・一覧あり・読込失敗、取り消し中の表示、取り消しの後のフォーカス）。ログインが必要の表示は既存の `LoginRequiredCard.vue` に本文の差し替え（例 `messages` の props。既定は今の文言）を足して使う。マスターは読まない。
  - D10 は既存の `components/common/DeleteConfirmDialog.vue` に確定のボタンの文言の props（既定は「削除」）を足して使う。既存の利用箇所の表示は変えない。
  - S7 `views/SharedBuildView.vue`: マスターと共有を読み、読込中・表示・見つからない・読込失敗・マスターの読込失敗を出す（5.5）。構成の情報（「共有」の日時）・マスターの版の警告（5.3 の文言）・`BuildCard`（`show-charm`・見出し「構成の内容」）は `BuildView.vue` と同じ部品で出す。作成者の情報と操作を出さず、ログインの状態で表示を変えない。
- D13: テストの支援。`src/test/support/` にメモリ上の偽の `SharesApi` を置き、`mountApp`・`loadStores` は既定でそれを渡して、既存のテストの振る舞いを変えない。`navigator.clipboard` は各 spec で差し替える。

### E2E（e2e-agent）
- D14: `e2e/build-share.spec.ts`（Chromium・ビルドした web・API なし・既定の幅＝`md` 以上。AC-15）。`page.route` で `/api/auth/me`・`/api/builds`・`/api/shares`・`/api/shares/*`・`/api/shared-builds/*` をテストの中のメモリ上の一覧で差し替える。構成の差し替えは既存の `e2e/support/buildsApi.ts` を使う。
  - ログイン中（me が 200）: 差し替えた保存した構成を `/builds/<id>` で開き、「共有」→「URL を作成」で `POST /api/shares` が呼ばれ、「共有の URL」に `/s/<短縮 ID>` を含む URL が出る。「共有した構成」へ移ると一覧に出る。
  - 未ログイン（me が 401）: `/s/<短縮 ID>` を開くと、共有の名前（h1）と構成のカードが出る。
  - 取り消し済み（閲覧が 404）: `/s/<短縮 ID>` を開くと「共有された構成が見つかりません」が出る。
  - トーストの文言を探すときは `getByText(..., { exact: true })`（教訓台帳 2026-10-27 の e2e の項）。既存の e2e は、S5 に「共有」が増える以外は変わらない。既存の spec は変えない。

### 順序
- D15: T1 → T2 → T3 →（draft の回収）→ T4 → T5 → T6。並列にしない。
  - T3（api）と T4（web）は、どちらも T2 の契約ファイルを前提にするため、`.claude/skills/tsod-build/SKILL.md`「委譲」節の並列の条件を満たさない（010 の plan D16・011 の plan D19 と同じ判断）。
  - web は2回に分けて委譲する（T4 は API の層・ストア・URL とコピーの関数・`savedBuildView` の型・テストの支援、T5 は画面）。T5 は T4 の形を前提にする。T6 は T5 の画面を前提にする。

## 常時許可外の変更
- `design-system/skillweave/MASTER.md`（UI Copy に共有の用語、Component Specs に URL の表示を足す。担当: メイン。時期: T1。理由: D1・screen-design.md 9）
