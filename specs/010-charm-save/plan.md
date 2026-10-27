# 010: charm-save 計画

## スタック
- API: Java 25・Spring Boot 4.1.2（`apps/api/gradle/libs.versions.toml`）・Spring Framework 7・Hibernate ORM 7.4・Spring Data JPA・Bean Validation（`spring-boot-starter-validation`）・springdoc-openapi 3.1.1。009 で入れた Spring Security・Spring Session JDBC をそのまま使う。依存は足さない（必要なスターターは `apps/api/build.gradle.kts` に揃っている）。
- Web: Vue 3.5.44・Pinia 4.1.0・reka-ui 2.11.0・@lucide/vue 1.57.0・Vite 8.3.4・TypeScript 6.0.3・Vitest 5.0.5・@playwright/test 1.64.1（`design/tech-stack.md` の現行どおり。依存は足さない）。
- 追加する ui 部品は無い（screen-design.md 0。既存の `alert`・`alert-dialog`・`ResultAlert`・`AppToaster` で足りる）。
- HTTP は既存の `apps/web/src/main/lib/http.ts`（`credentials: 'include'`・状態を変える要求に `X-XSRF-TOKEN`）を使う。

## データモデル
- `charms`（`id` uuid DEFAULT uuidv7()・`user_id` uuid → `users (id)`・`payload` jsonb（`jsonb_typeof = 'object'`）・`schema_version` integer（1 以上）・`version` integer DEFAULT 0・`created_at`・`updated_at`・`deleted_at` NULL）。部分インデックス `ix_charms_user_id (user_id, id DESC) WHERE deleted_at IS NULL`。`V3__create_charms.sql`（区間 B・ee85032）。
- 属性は `design/attributes.yaml`（`defined_by: specs/010-charm-save`）。`id` はクライアント採番の UUIDv7（`design/data-model-standard.md`「主キー・採番方針」）。

## 決定事項

### 文書（メイン）
- D1: 委譲の前に、メインが `design-system/skillweave/MASTER.md` に screen-design.md 5 の内容（Component Specs の「保存先の表示」「端末内に残るデータの帯」、UI Copy の用語「アカウント」「この端末」）を足す（T1）。
  - 理由: web-agent が部品を MASTER.md と突き合わせて実装するため。

### 契約（contract-agent）
- D2: 契約のファイルと名前（spec の契約差分の「名前は区間 C で決める」の結論）。
  - パス: `paths/charms/charms.yaml`（GET `listCharms`・POST `createCharm`）と `paths/charms/charms-id.yaml`（PUT `updateCharm`・DELETE `deleteCharm`）。4つとも `x-swv-status: draft` を付けて足す（T3 の後にメインが外す）。`openapi.yaml` に tag `charms` と2つのパスの `$ref` を足す。
  - スキーマ（`components/schemas/charms/`）: `Charm`（`id`・`payload`・`schemaVersion`・`version`・`createdAt`・`updatedAt`。すべて必須）、`CharmPayload`（`rarity`・`skills`・`slots`）、`CharmSkill`（`skillId`・`level`）、`CharmSlot`（`target`・`level`）、`CreateCharmRequest`（`id`・`payload`・`schemaVersion`）、`UpdateCharmRequest`（`payload`・`schemaVersion`・`version`）。
  - 構造の制約（decisions.md Q61）は schema に書く: `id` は `format: uuid`、`schemaVersion` は要求では `enum: [1]`、`rarity` 5〜8、`skills`・`slots` は `maxItems: 3`、`skillId` は `pattern: '^sk:[0-9]+$'`、スキルの `level` は `minimum: 1`、`target` は `enum: [weapon, armor]`、スロットの `level` は 1〜3。スキルの重複の禁止は `skills` の `description` に散文で書く。`createdAt`・`updatedAt` は `format: date-time`、`version` は `minimum: 0`。
  - 応答: GET 200（`Charm` の配列）・401。POST 201（`Charm`）・400・401・409。PUT 200（`Charm`）・400・401・404・409。DELETE 204・401。400・404・409 は `components/responses/` に `BadRequest`・`NotFound`・`Conflict`（`application/problem+json`・`ProblemDetail`）を足して参照する。CSRF の拒否の 403 は `responses` に書かず、状態を変える3つの `description` に散文で書く（`contracts/README.md`「禁止事項」）。
  - `description` は `contracts/README.md` の固定テンプレートで書き、`refs specs/010-charm-save/spec.md` を付ける。
  - 理由: スキーマ名は Web の生成型の名前になる。`SkillLevel`・`Slot` は `@swv/data` の型名と紛らわしいので、`Charm` を前置した名前にする。

### API（api-agent）
- D3: 永続化は JPA にする（`design/data-model-standard.md`「楽観的ロック」の `@Version`）。
  - `entity/Charm`（`@Version` の `version`。`payload` は型付きの record を `@JdbcTypeCode(SqlTypes.JSON)` で jsonb に写す）と `repository/CharmRepository`。Hibernate 7.4 は `Jackson3JsonFormatMapper` を同梱している。jsonb に書かれるキー（`rarity`・`skills[].skillId`・`skills[].level`・`slots[].target`・`slots[].level`）が Web の形と一致することをテストで確かめる。
  - `created_at`・`updated_at`・`version` はサーバーが決め、要求から受け取らない（要求の DTO にこれらの項目を持たない）。`updated_at` は更新のたびに進める。時刻は UTC（憲法）。
  - クライアント採番の ID の受け取り方（`persist` を使い `merge` を避ける等）は、`design/data-model-standard.md`「主キー・採番方針」の末尾のとおり、Hibernate の一次情報（javadoc・実機）で確かめて決める。
- D4: 4つの API の処理（decisions.md Q59・Q62。controller は `controller/CharmController`、処理は `service/` に置く）。主体は `@AuthenticationPrincipal DiscordUserPrincipal` の `userId`。
  - 一覧: 自分の `deleted_at IS NULL` の行を `id` の降順で全件返す。
  - 作成: ID が既存の行（自分・他のユーザー・削除済みを問わない）と衝突したら 409。存在の確認だけに頼らず、同時の作成で主キー違反になったときも 409 にする。応答は 201 と保存後の護石。
  - 更新: `id`・自分の `user_id`・`deleted_at IS NULL` で行を探し、無ければ 404（他のユーザーの行も 404）。要求の `version` が行と違えば 409。一致すれば `payload`・`schema_version` を書き換え、`version` を進めて保存後の護石を返す。読んでから書くまでの間に別の要求が更新した場合（`@Version` の楽観ロックの失敗）も 409。
  - 削除: `id`・自分の `user_id`・`deleted_at IS NULL` の行に `deleted_at` を入れる（行バージョンは照合しない）。行が無くても 204。他のユーザーの行は変えない。
  - パスの `{id}` が UUID の形でないときは、行が無いのと同じに扱う（PUT は 404・DELETE は 204）。DELETE に 400 を足さないため（spec の契約差分は 204 だけ）。
  - 理由: 応答の status code の集合は `OpenApiContractTest#responseStatusCodesMatchImplementation` が契約と突き合わせる。D2 の集合と一致させる。
- D5: 構造の検査（AC-10・decisions.md Q61）は Bean Validation で要求の DTO に書き、違反は 400 にする。
  - `id` は UUID の版が 7・variant が RFC 4122、`schemaVersion` は 1、`rarity` 5〜8、`skills` 0〜3 個（`skillId` は `^sk:[0-9]+$`・重複なし・`level` は 1 以上）、`slots` 0〜3 枠（`target` は `weapon` か `armor`・`level` 1〜3）。必須の項目の欠落・null・型の違い・JSON として読めない本文も 400。
  - `payload` は型付きの record に読み、その record から jsonb に書く（未知のプロパティは保存しない）。
  - マスターに依る検査（スキルの存在・最大レベル・抽選テーブル）はしない。
- D6: 400・404・409 は `application/problem+json` の ProblemDetail で返す（009 の 401 と同じ形）。検証の例外と、404・409 を表す例外の変換は `common/handler/` の `@RestControllerAdvice` に置く。`@ApiResponse` で D2 の status code を各メソッドに宣言する。
- D7: 認可は 009 の `SecurityConfig` のまま（`/api/**` はログインを要する・CSRF は `csrf.spa()`）。`SecurityConfig` は変えない。
- D8: API のテスト（AC-14。Testcontainers の PostgreSQL・`users` の行を2人分作る）。
  - 作成・一覧・更新・削除の往復。一覧が ID の降順で、削除済みと他のユーザーの行を含まないこと。応答の `createdAt`・`updatedAt`・`version` がサーバーの値で、更新で `version` が進み `updatedAt` が変わること。
  - 他のユーザーの護石の隔離: 一覧に出ない・更新は 404 で行が変わらない・削除は 204 で行が変わらない。
  - ID の衝突（自分の行・他のユーザーの行・削除済みの行の3通り）が 409 で、既存の行が変わらないこと。
  - 行バージョンの不一致が 409 で上書きしないこと。存在しない・削除済みの ID の更新が 404。削除の冪等（2回目も 204）。
  - 構造の制約の違反（D5 の各項目と境界値）が 400 で保存しないこと。入力だけが違う同形のテストは `@ParameterizedTest` にまとめる（`.claude/rules/api-spring.md` の `java:S5976`）。
  - 4つすべての未ログインの 401（`application/problem+json`・`Location` なし）、POST・PUT・DELETE の CSRF トークンの無い要求が 403 で行を変えないこと。
  - jsonb に書かれたキーが D3 のとおりであること。既存の `SmokeTest`・`OpenApiContractTest`・`AuthorizationBypassTest` を通す。

### Web（web-agent）
- D9: API の層 `lib/api/charms.ts`（`pnpm contract:types` で再生成した `schema.ts` の `Charm`・`CreateCharmRequest`・`UpdateCharmRequest` を使う）。
  - `CharmsApi`（`list`・`create`・`update`・`remove`）を、既存の `AuthApi` と同じく差し替えられる形にする。
  - 結果は、成功と、失敗の種類 `unauthorized`（401）・`conflict`（409）・`notFound`（404）・`failed`（原因は `network`＝fetch が届かない／`server`＝それ以外の status・応答の形の不正）に分ける。画面の文言は 2.6 のとおり、`network` は「サーバーに接続できませんでした。」、`server` は「サーバーで処理できませんでした。」。
  - 応答の形（`id`・`payload`・`schemaVersion` が 1・`version`・`createdAt`・`updatedAt`）を検査し、合わなければ `failed`（`server`）にする。
  - 端末の `StoredCharm` に `version` を加えた型を、アカウントの護石の型にする（端末の形と同じ形。AC-5）。
- D10: 認証のストアに、ログインの期限切れを反映する操作 `expire()` を足す（AC-11）。ログイン中のときだけ未ログイン・表示名なしにし、変えたかどうかを返す。ログアウトの API は呼ばない。ヘッダーは状態を見て 009 の未ログインの表示に戻る。
  - 理由: 同時に複数の要求が 401 になっても、最初の1回だけが「変えた」になり、トーストを1回に絞れる（screen-design.md 2.5）。
- D11: 護石のストア `stores/charms.ts` の保存先の切り替え（screen-design.md 0・2.5、decisions.md Q58・Q60）。
  - 保存先 `source`（判定中は未定・`account`・`device`）を持つ。`ensureLoaded()` は `useAuthStore().initialize()` を待ってから、ログイン中ならアカウントの一覧を、それ以外（未ログイン・取得できない）なら 005 のとおり端末の一覧を読む。判定の前に端末の一覧を出さない。
  - 認証の状態がログイン中から未ログインに変わったら（ログアウト・`expire()`）、その場で端末の一覧に切り替える。保存先が変わる前に送った要求の応答は、一覧にもトーストにも反映しない（世代の番号などで捨てる）。
  - アカウントの一覧を読むときに1回だけ、端末の護石の件数 `deviceCharmCount` を数える（端末の保存先を開いて `list()` の件数。開けない・読めないときは null で、エラーは出さない）。「再読み込み」はアカウントの一覧と件数を読み直し、認証状態は読み直さない。
  - アカウントの一覧の読込失敗は `status` を `failed` にし、`failureMessage` は D9 の原因の文言。`unavailable` は端末だけで使う。一覧の読み込みが 401 なら、`expire()` と一覧の読み込みでの 401 のトースト（2.5 の括弧内の文言）にして端末に切り替える。
  - 登録は `uuidv7()` と `CHARM_SCHEMA_VERSION` で POST、上書きは読んだ時点の `version` で PUT し、成功したらサーバーの応答で一覧を変える（成功のトーストは 005 のまま）。削除は DELETE。
  - `save`・`remove` は、結果の種類（保存した・失敗・別の端末で変更（409）・別の端末で削除（404）・期限切れ（401）・保存先が変わって捨てた）を返す。409・404 はトーストを出して一覧を読み直し、読み直しが失敗したら読込失敗にする。401 は `expire()` が変えたときだけトーストを出して端末に切り替える。それ以外の失敗は 2.4 のトーストで、一覧を変えず、送り直さない。
  - 削除の応答待ちの ID をストアが持つ（端末・アカウントの両方。2.7 の「削除中…」の表示に使う）。
  - 入力・照合・候補の判定・一覧の並びは 005 のまま（`entries`・`candidates`・`excluded` はどちらの保存先でも同じ計算）。
  - API とアカウントの保存先は、既存の `setRepositoryOpener` と同じく差し替えられる形（`setApi` 等）にする。ストアの単体テストは、偽の認証 API と偽の `CharmsApi` を渡して書く。
- D12: テストの支援。`src/test/support/` にメモリ上の偽の `CharmsApi` を置く。`mountApp` は既定で、今の「取得できない」の偽の認証 API（端末の保存先になる）とこの偽物を渡し、既存のテストの振る舞いを変えない。テスト用ルーターに足すルートは無い（ルートを足さない）。
- D13: 画面（screen-design.md 2・3）。
  - S2 `views/CharmsView.vue`: h1 の直下の保存先の表示（2.2。`Cloud`／`Smartphone`）、端末内に残る護石の帯（2.3。`ResultAlert` の `info`）、アカウントの護石の読込失敗の Alert と「再読み込み」とフォームの無効化（2.4）。保存先が決まるまでは表示を出さない。
  - フォームの扱い（2.5）: 409・404 と、編集のモードでの 401・ログアウトは、登録のモードに戻して入力を捨てる。登録のモードでの 401・ログアウトは入力を残す。409 は読み直しの後にその護石の「編集」へ（無ければ一覧の見出しへ）、404 は一覧の見出しへフォーカスを移す。401 は押したボタンが残っていればそのまま、消えていれば一覧の見出しへ。
  - 削除（2.7）: 応答待ちの行の「編集」「削除」を無効にし、「削除」を「削除中…」にする。失敗したら行を元に戻す。
  - D3 `CharmDeleteDialog.vue`（2.8）: ログイン中だけ、本文の末尾に「同じアカウントのほかの端末からも消えます。」を足す。
  - S1 `components/search/CharmCard.vue`（3）: 件数と原因をストアから出す（アカウントの原因の文言は D9）。
- D14: 教訓台帳の「護石の読込失敗の帯に、文末の「。」が重なる」（2026-10-26）をこの機能で直す。`CharmCard.vue` の読込失敗の帯で `failureMessage` の末尾の「。」を除いてから括弧に入れ、`CharmCard.spec.ts` の期待値を合わせる（2.6 の原因の文言も「。」で終わり、直さないとアカウントの読込失敗でも句点が重なるため）。メインは、T5 の成果をコミットするときに、同じコミットで `tasks/lessons.md` から該当の項目を消す。

### E2E（e2e-agent）
- D15: `e2e/charm-save.spec.ts`（Chromium・ビルドした web・API なし。`page.route` で `/api/auth/me`・`/api/auth/logout`・`/api/charms`・`/api/charms/*` をテストの中のメモリ上の一覧で差し替える。既定の幅＝`md` 以上。AC-15）。
  - ログイン中（me が 200）: 「保存先: アカウント」が出る。護石を登録すると `POST /api/charms` が呼ばれ、一覧に出る。検索画面の「候補にする護石: 1 件」が出て、検索を実行するとその護石を使った構成が構成カードに出る（005 の e2e の流れと支援を流用する）。
  - ログアウト: 先に未ログイン（me が 401）で端末に護石を1件登録し、me を 200 に替えて読み直すと、アカウントの一覧と「この端末には、…1 件残っています。」の帯が出る。「ログアウト」で、URL が変わらずに「保存先: この端末」と端末の護石の一覧に切り替わる。
  - 409: 編集して保存すると PUT が 409 を返し、2.5 のトーストが出て、`GET /api/charms` がもう一度呼ばれ、読み直した一覧（差し替えた側で変えた内容）が出る。
  - 既存の e2e は API が無いため me が届かず「取得できない」になり、端末の保存先のまま動く。既存の spec は変えない。

### 順序
- D16: T1 → T2 → T3 →（draft の回収）→ T4 → T5 → T6。並列にしない。
  - T3（api）と T4・T5（web）は、どちらも T2 の契約ファイルを前提にするため、`.claude/skills/tsod-build/SKILL.md`「委譲」節の並列の条件（同じ契約ファイルを前提にしない）を満たさない。
  - web は2回に分けて委譲する（T4 は API の層とストア、T5 は画面）。T5 は T4 のストアの形を前提にする。T6 は T5 の画面を前提にする。

## 常時許可外の変更
- `design-system/skillweave/MASTER.md`（Component Specs に保存先の表示と端末内に残るデータの帯、UI Copy に保存先の用語を足す。担当: メイン。時期: T1。理由: D1・screen-design.md 5）
