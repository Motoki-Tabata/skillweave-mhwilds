# 013: user-weapon-save 計画

## スタック
- API: Java 25・Spring Boot 4.1・Jackson 3・Hibernate ORM 7・Spring Data JPA・Bean Validation・springdoc-openapi（`design/tech-stack.md` の現行どおり）。009 の Spring Security・Spring Session JDBC をそのまま使う。依存は足さない。
- Web: Vue 3・Pinia・reka-ui・@lucide/vue・Vitest・@playwright/test（`design/tech-stack.md` の現行どおり）。依存も `components/ui/` の部品も足さない（screen-design.md 0）。`Select` を使う新規 `.vue` は無いため、`sonar-project.properties` の抑止の追記は要らない。
- HTTP は既存の `apps/web/src/main/lib/http.ts`（`credentials: 'include'`・状態を変える要求に `X-XSRF-TOKEN`）を使う。

## データモデル
- `weapons`（`id` uuid DEFAULT uuidv7()・`user_id` uuid → `users (id)`・`payload` jsonb（`jsonb_typeof = 'object'`）・`schema_version` integer（1 以上）・`version` integer DEFAULT 0・`created_at`・`updated_at`・`deleted_at` NULL）。部分インデックス `ix_weapons_user_id (user_id, id DESC) WHERE deleted_at IS NULL`。`V5__create_weapons.sql`（区間 B・098f35c）。
- 属性は `design/attributes.yaml`（`weapons.*` は既存の属性の `used_in` に追加済み。`payload` の形は `CustomWeaponPayload`）。`id` はクライアント採番の UUIDv7。

## 決定事項

### 区間 C の実測（decisions.md Q72 (3)）
- D1: 文字列の項目に U+0000 を含む要求のいまの挙動を、Testcontainers の PostgreSQL で実測した（使い捨てのテスト。コミットしていない）。
  - 構成の作成で構成名に U+0000: DB が `SQLState 22021`（`invalid byte sequence for encoding "UTF8": 0x00`）で拒否し、`BuildService` の `DataIntegrityViolationException` の catch が **409「Build id already exists」** にしていた。行は保存されない。
  - 構成の作成で武器の写しの名前に U+0000: DB が `SQLState 22P05`（jsonb の `\u0000 cannot be converted to text`）で拒否し、同じく 409 になった。
  - 護石のスキル ID に U+0000: pattern の違反で 400（DB に届かない）。
  - あわせて Q72 (1)(2) を確かめた: 構成名・武器名に `123`・`true`・`5` を送ると `"123"` 等に変換されて 201、`"element": null` は省略と同じ扱いで 201。
  - 結論: (3) は「DB のエラーが ID の衝突の 409 に化ける」不具合でもある。D5 で、要求を読む段階で 400 にして DB に届かせない。

### 契約（contract-agent）
- D2: 武器の API の契約のファイルと名前（spec の契約差分の「名前は区間 C で決める」の結論）。
  - パス: `paths/weapons/weapons.yaml`（GET `listWeapons`・POST `createWeapon`）と `paths/weapons/weapons-id.yaml`（PUT `updateWeapon`・DELETE `deleteWeapon`）。4つとも `x-swv-status: draft` を付けて足す（T2 の後にメインが外す）。`openapi.yaml` に tag `weapons`（description「個体差のある武器（ログイン中のユーザーが保存する個体差のある武器の一覧・作成・更新・削除）」）と2つのパスの `$ref` を足す。
  - スキーマ（`components/schemas/weapons/`）: `CustomWeapon`（`id`・`payload`・`schemaVersion`・`version`・`createdAt`・`updatedAt`。すべて必須）、`CreateCustomWeaponRequest`（`id`・`payload`・`schemaVersion`）、`UpdateCustomWeaponRequest`（`payload`・`schemaVersion`・`version`）。`payload` は既存の `../builds/CustomWeaponPayload.yaml` を `$ref` する（decisions.md Q99。複製しない）。
  - 項目の制約は護石（`Charm.yaml`・`CreateCharmRequest.yaml`・`UpdateCharmRequest.yaml`）と同じ: `id` は `format: uuid`（要求は UUIDv7 と description に書く）、`schemaVersion` は要求では `enum: [1]`、`version` は `minimum: 0`、`createdAt`・`updatedAt` は `format: date-time`。
  - 応答: GET 200（`CustomWeapon` の配列）・401。POST 201（`CustomWeapon`）・400・401・409。PUT 200（`CustomWeapon`）・400・401・404・409。DELETE 204・401。400・401・404・409 は既存の `components/responses/` を参照する。CSRF の拒否の 403 は `responses` に書かず、状態を変える3つの `description` に散文で書く（010 と同じ）。
  - `description` は `contracts/README.md` の固定テンプレートで書き、`refs specs/013-user-weapon-save/spec.md` を付ける。
  - 理由: このリポジトリでは `Weapon` はマスターの武器（`MasterWeapon`・`WeaponId`・`BuildMasterWeapon`）を指す。ユーザーが作った武器は既に `CustomWeaponPayload`・`BuildCustomWeapon` と `Custom` を前置しているので、それに揃える。パスと operationId は spec の契約差分の `/api/weapons` に合わせる。
- D3: U+0000 の禁止の書き方（spec の契約差分の「書き方は区間 C で決める」の結論。decisions.md Q72 (3)）。
  - 護石・構成・武器の要求の文字列の項目のうち、`pattern`・`enum`・`format: uuid` で既に U+0000 を含められないものは変えない。自由入力の文字列だけに足す。洗い出した結果は次の3つ:

    | スキーマ | 項目 | 変更 |
    |---|---|---|
    | `builds/CustomWeaponPayload.yaml` | `name` | `pattern: '^[^\u0000]*$'` を足し、description に「U+0000 を含まない」を足す |
    | `builds/CreateBuildRequest.yaml` | `name` | `pattern` を `'^\S(?:[\s\S]*\S)?$'` から `'^[^\s\u0000](?:[^\u0000]*[^\s\u0000])?$'` にし、description に「U+0000 を含まない」を足す |
    | `builds/RenameBuildRequest.yaml` | `name` | 同上 |

  - 例: 「鉄刀【神楽】 構成3」「自作」「」（武器名の空）は一致する。「a<U+0000>b」は一致しない。前後が空白の構成名は、いまと同じく一致しない。
  - 応答の `Build.yaml` の `name` は変えない（要求の規則だけを書く。spec の契約差分は要求の項目）。
  - 理由: pattern は JSON Schema（ECMA-262）でも Java の正規表現でも同じ意味になり、生成する Web の型は変わらない。

### API（api-agent）
- D4: 永続化は JPA にする（010 の `entity/Charm` と同じ形）。`entity/CustomWeapon`（`@Table(name = "weapons")`・`@Version` の `version` は `Integer`。`payload` は既存の record `entity/CustomWeaponPayload` を `@JdbcTypeCode(SqlTypes.JSON)` で jsonb に写す）と `repository/CustomWeaponRepository`。
  - jsonb に書かれるキー（`baseWeaponId`・`name`・`attack`・`affinity`・`element.type`・`element.value`・`slots[].target`・`slots[].level`・`seriesBonusId`・`groupBonusId`）が Web の `WeaponPayload` と一致し、属性の無い武器では `element` のキーが無いことをテストで確かめる。
  - `created_at`・`updated_at`・`version` はサーバーが決め、要求から受け取らない。時刻は UTC（憲法）。クライアント採番の ID の受け取り方は `CharmService` と同じにする。
- D5: 4つの API の処理（decisions.md Q99。controller は `controller/WeaponController`（`paths/weapons/` に対応）、処理は `service/WeaponService`、DTO は `dto/request/CreateCustomWeaponRequest`・`UpdateCustomWeaponRequest`・`dto/response/CustomWeaponResponse`）。主体は `@AuthenticationPrincipal DiscordUserPrincipal` の `userId`。`CharmController`・`CharmService` と同じ形にする。
  - 一覧: 自分の `deleted_at IS NULL` の行を `id` の降順で全件返す。
  - 作成: ID が既存の行（自分・他のユーザー・削除済みを問わない）と衝突したら 409。同時の作成で主キー違反になったときも 409。応答は 201 と保存後の武器。
  - 更新: `id`・自分の `user_id`・`deleted_at IS NULL` で行を探し、無ければ 404（他のユーザーの行も 404）。要求の `version` が行と違えば 409。一致すれば `payload`・`schema_version` を書き換え、`updated_at` と `version` を進めて返す。`@Version` の楽観ロックの失敗も 409。
  - 削除: 自分の削除していない行に `deleted_at` を入れる（行バージョンは照合しない）。一括 UPDATE で書くときは `version = version + 1` を明示する（`CharmRepository#markDeleted` と同じ）。行が無くても 204。他のユーザーの行は変えない。
  - パスの `{id}` が UUID の形でないときは、行が無いのと同じに扱う（PUT は 404・DELETE は 204）。
  - 404・409 は 025 の `ResourceNotFoundException`・`ResourceConflictException` を使い、文言は `WeaponService` の定数に1か所だけ置く。当てはめた結果: 404 `Weapon not found`、409（作成の ID の衝突）`Weapon id already exists`、409（行バージョンの不一致）`Weapon was changed by another request`。
  - `@ApiResponse` で D2 の status code を各メソッドに宣言する（`OpenApiContractTest#responseStatusCodesMatchImplementation` が契約と突き合わせる）。
  - 構造の検査（AC-10）は、要求の DTO（`id` は `@UuidV7`・`schemaVersion` は 1・`version` は 0 以上）と既存の `CustomWeaponPayload` の Bean Validation で行い、違反は 400。マスターに依る検査はしない。
- D6: AC-11 の 3 種の拒否を、護石・構成・武器の API の要求の読み取りにまとめて効かせる（decisions.md Q72）。
  - (1)(3) 文字列の項目: `config/JacksonConfig`（`JsonMapperBuilderCustomizer` の bean）で、Spring の JSON の mapper の `String` の deserializer を差し替える。差し替えた deserializer は、JSON の文字列だけを受け付け（数値・真偽・配列・オブジェクトは拒否。null はいまと同じく null にして `@NotNull` 等に任せる）、U+0000 を含む文字列は取り除かずに拒否する。拒否は本文の読み取りの失敗（`HttpMessageNotReadableException`）として、いまの `ApiExceptionHandler` の基底クラスが 400 の ProblemDetail にする。
    - 理由: 機能ごとの `@Pattern` だと、新しい文字列の項目を足すたびに付け忘れが起きる。011 の教訓のとおり `spring.jackson.mapper.allow-coercion-of-scalars: false` は数値・真偽から文字列への変換を止めないので、`application.yml` のキーでは足りない（`application.yml` の2つのキーは数値の項目のために残す）。
    - 影響の範囲: 差し替えは Spring MVC の要求の本文の読み取り（同じ mapper を使うもの）に効く。Discord の利用者情報は Spring Security の既定のクライアント（別の変換器）で `Map` に読むため対象外。Hibernate が jsonb を読む mapper も別。既存の `AuthFlowTest`・`DiscordOAuth2UserServiceTest` を通して確かめる。
  - (2) 省略できる項目の明示の null: 契約の要求のスキーマで、`required` に無い項目は `CustomWeaponPayload.element` だけ（`contracts/components/schemas/` を機械的に洗い出した結果。護石の要求には無い）。`CustomWeaponPayload` の `element` に `@JsonSetter(nulls = Nulls.FAIL)` を付け、明示の null を読み取りの失敗（400）にする。省略はいまと同じく受け付ける。構成の武器の写しと武器の API の両方に効く（同じ record のため）。
- D7: 認可は 009 の `SecurityConfig` のまま（`/api/**` はログインを要する・CSRF は `csrf.spa()`）。`SecurityConfig` は変えない。
- D8: API のテスト（AC-14。Testcontainers の PostgreSQL・`users` の行を2人分）。
  - `controller/WeaponControllerTest`（`CharmControllerTest` と同じ形）: 作成・一覧・更新・削除の往復。一覧が ID の降順で、削除済みと他のユーザーの行を含まないこと。応答の `createdAt`・`updatedAt`・`version` がサーバーの値で、更新で `version` が進み `updatedAt` が変わること。他のユーザーの武器の隔離（一覧に出ない・更新は 404 で行が変わらない・削除は 204 で行が変わらない）。ID の衝突（自分・他のユーザー・削除済みの3通り）が 409 で既存の行が変わらないこと。行バージョンの不一致が 409 で上書きしないこと。存在しない・削除済みの ID の更新が 404。削除の冪等。構造の制約の違反（AC-10 の各項目と境界値。名前の 30／31 コードポイント、攻撃力 0／1／999／1000、会心率 -101／100／101、属性値 0／99／100・未知の種類、スロット 4 枠・Lv 0／4・`target` が `armor`、`baseWeaponId`・付与スキルの ID の形式、UUIDv4 の ID、`schemaVersion` が 2）が 400 で保存しないこと。4つすべての未ログインの 401、POST・PUT・DELETE の CSRF トークンの無い要求が 403 で行を変えないこと。404・409 の `detail` が D5 の文言であること。jsonb のキーが D4 のとおりであること。
  - AC-11 の 3 種（入力だけが違う同形のテストは `@ParameterizedTest` にまとめる。`.claude/rules/api-spring.md` の `java:S5976`）。どれも 400 で、行が保存・変更されないことを確かめる。
    - 武器（`WeaponControllerTest`）: 作成・更新で `name` に `5`・`true`、`element` に `null`、`name` に U+0000 を含む文字列。
    - 構成（`BuildControllerTest` に足す）: 作成で構成名に `123`・`true`、武器の写しの `name` に `5`、武器の写しの `element` に `null`、構成名・武器の写しの `name` に U+0000。名前の変更で構成名に `123`・U+0000。
    - 護石（`CharmControllerTest` に足す）: 作成・更新でスキル ID に `101`（数値）・`target` に `true`、スキル ID に U+0000 を含む文字列。護石の要求には省略できる項目が無いので、null の種は構成と武器で確かめる（spec AC-11 の対象のうち、該当する項目が無いもの）。
  - 既存の `SmokeTest`・`OpenApiContractTest`・`AuthorizationBypassTest`・`AuthFlowTest`・`CharmControllerTest`・`BuildControllerTest` を、既存の期待値を変えずに通す。
- D9: 教訓台帳の 2026-10-28「allow-coercion-of-scalars: false は数値・真偽から String への変換を止めない」を、D6 で直す。メインは、T2 の成果をコミットするときに、同じコミットで `tasks/lessons.md` から該当の項目を消す（提案の「別の設定が要る」が D6 の `config/JacksonConfig` で満たされ、全 API に効くため）。

### Web（web-agent）
- D10: API の層 `lib/api/weapons.ts`（`pnpm contract:types` で再生成した `schema.ts` の `CustomWeapon`・`CreateCustomWeaponRequest`・`UpdateCustomWeaponRequest` を使う）。`lib/api/charms.ts` と同じ形にする。
  - `WeaponsApi`（`list`・`create`・`update`・`remove`）を、`SavedItemsApi<AccountWeapon, WeaponPayload, 1>` に当てはまる形で定義する。`AccountWeapon` は端末の `StoredWeapon` に `version` を加えた型（AC-6 の「端末内の武器と同じ形に行バージョンを加えて返す」）。
  - 結果は既存の `ApiResult`（`unauthorized`・`conflict`・`notFound`・`failed`（`network`／`server`））。
  - 応答の形（`id`・`payload`・`schemaVersion` が 1・`version`・`createdAt`・`updatedAt`）を検査し、合わなければ `failed`（`server`）。`payload` の検査は `lib/api/builds.ts` の `isCustomWeaponPayload` を export して使い、検査を2つに分けない（`element` は省略を許し、null を許さない）。
- D11: 武器のストア `stores/weapons.ts` に、`useSavedItems` の API と文言を渡す（decisions.md Q98・Q99。025 decisions.md Q73 のとおり、護石と同じ振る舞いにする）。
  - 文言（screen-design.md 2.5）:
    - conflict: 「この個体差のある武器は別の端末で変更されていたため、保存しませんでした。一覧を読み直しました。内容を確かめて、もう一度編集してください。」
    - notFound: 「この個体差のある武器は別の端末で削除されていたため、保存しませんでした。一覧を読み直しました。」
    - expiredWrite: 「ログインの有効期限が切れたため、保存しませんでした。端末内の個体差のある武器に切り替えました。アカウントに保存するには、もう一度「Discord でログイン」を押してください。」
    - expiredList: 「ログインの有効期限が切れました。端末内の個体差のある武器に切り替えました。もう一度「Discord でログイン」を押すと、アカウントの個体差のある武器を使えます。」
  - 公開する名前に `source`・`deviceWeaponCount`（`useSavedItems` の `deviceCount`）・`deletingIds`・`setApi` を足す（025 D12 の「013 で要れば足す」）。ほかの名前と、`entries`・`candidates`・`excluded` の計算は変えない。
  - 認証の判定を待つ・ログアウトと 401 での端末への切り替え・古い応答の破棄・409／404 の読み直し・401 のトーストを1回に絞る（護石と武器の要求が同時に 401 になっても1回。`auth.expire()` が最初の1回だけ真を返す）は `useSavedItems` が済ませるので、ストアには書かない。
- D12: 検索条件の武器の選択を外す（AC-5・decisions.md Q100・screen-design.md 3.1）。`stores/conditions.ts` で、武器のストアの `status` と `weapons` を見て、`status` が `loading` 以外になった時点で、選んでいる個体差のある武器の ID が `weapons` に無ければ選択を外す。
  - `loading` の間は判定しない（保存先の切り替えでは一覧が一度空になり、409・404 の読み直しでは読み直す前の一覧が残るため。判定すると、読み直した一覧に残る武器の選択まで外してしまう）。
  - 読み直しの失敗（`failed`・一覧が空）・端末を開けない（`unavailable`）でも外す。
  - 外したことは別に知らせない。武器欄のエラーは出さない（`weaponErrorShown` を変えない）。S3 の削除での `releaseWeapon` はそのまま残す。
- D13: テストの支援。`src/test/support/weaponsApi.ts` にメモリ上の偽の `WeaponsApi`（`charmsApi.ts` と同じ操作: `snapshot`・`seed`・`drop`・`failWith`・`hold`・`calls`）を置く。`mountApp`・`loadStores` は既定でそれを渡し、既定の認証は今の「取得できない」の偽物のまま（端末の保存先になる）にして、既存のテストの振る舞いを変えない。ストアを直接作る既存のテスト（`weapons.spec.ts`・`conditions.spec.ts`・`WeaponDialog.spec.ts` など）も、期待値を変えずに通す（武器のストアが認証の判定を待つようになるため、必要なら偽の認証 API を渡す準備だけを足す）。テスト用ルーターに足すルートは無い。
- D14: 画面（screen-design.md 2・3）。護石の `CharmsView.vue`・`CharmForm.vue`・`CharmListItem.vue` の同じ振る舞いの実装に揃える。
  - S3 `views/WeaponsView.vue`: h1 の直下の保存先の表示（2.2。`Cloud`／`Smartphone`、保存先が決まるまでは出さない）、端末内に残る武器の帯（2.3。`ResultAlert` の `info`・文言は 2.3 のとおり）、アカウントの読込失敗の Alert（見出し「個体差のある武器を読み込めません」・原因・「通信の状態を確かめて、「再読み込み」を押してください。通常の武器での検索は引き続き使えます。」）と「再読み込み」とフォームの無効化（2.4）。最初の読み込みの後の読み直しは、フォームを残して一覧の位置だけを読込中にする。
  - フォームの扱い（2.5）: `components/weapons/WeaponForm.vue` は `save` の結果のうち `conflict`・`notFound`・`expired` を `rejected` で親へ伝える（`CharmForm.vue` と同じ）。409・404 と、編集のモードでの 401・ログアウトは、登録のモードに戻して入力を捨てる。登録のモードでの 401・ログアウトは入力を残す。409 は読み直しの後にその武器の「編集」へ（無ければ一覧の見出しへ）、404 は一覧の見出しへフォーカスを移す。401 は押したボタンが残っていればそのまま、消えていれば一覧の見出しへ。
  - 削除（2.7）: 応答待ちの行（`deletingIds`）の「編集」「削除」を無効にし、「削除」を「削除中…」・`aria-label` を「<表示名>を削除中」にする（`components/weapons/WeaponListItem.vue`）。失敗したら行を元に戻す。端末の保存先でも同じ。
  - D4 の削除の確認（2.8）: 本文は「<要約>。削除すると元に戻せません。」＋ログイン中だけ「同じアカウントのほかの端末からも消えます。」＋検索条件で選んでいるときだけ「検索条件の武器の選択も外します。」の順。
  - S1・D1（3.2・3.3）: `components/search/WeaponCard.vue`・`WeaponDialog.vue` は、ストアの一覧・状態・原因の文言を出すだけなので、変更は要らない見込み。アカウントの読込失敗の原因（「サーバーに接続できませんでした」等。文末の「。」は既存の処理で除く）と、認証の判定中の読込中の表示を、単体テストで確かめる。

### E2E（e2e-agent）
- D15: `e2e/weapon-save.spec.ts`（Chromium・ビルドした web・API なし。`page.route` で `/api/auth/me`・`/api/auth/logout`・`/api/weapons`・`/api/weapons/*` をテストの中のメモリ上の一覧で差し替える。ログイン中は護石のストアも `/api/charms` を読むので、空の一覧を返す。既定の幅＝`md` 以上。AC-15）。
  - ログイン中（me が 200）: 個体差のある武器の画面に「保存先: アカウント」が出る。武器を登録すると `POST /api/weapons` が呼ばれ、一覧に出る。検索画面の武器を選ぶダイアログの「個体差のある武器」の節にその武器が出て、選ぶと「武器」カードに出る（008 の `user-weapon.spec.ts` の操作を流用する）。
  - ログアウト: 上の続きで検索条件にアカウントの武器を選んだまま「ログアウト」を押すと、URL が変わらずに「武器」カードが未選択の表示に戻る。個体差のある武器の画面へ移ると「保存先: この端末」と端末の一覧（空）が出る。
  - 409: 編集して保存すると PUT が 409 を返し、2.5 のトーストが出て、`GET /api/weapons` がもう一度呼ばれ、読み直した一覧（差し替えた側で変えた内容）が出る。
  - トーストの文言を `getByText` で探すときは `exact: true` を付ける（教訓台帳 2026-10-27。通知用の live region にも同じ文言が出るため）。
  - 既存の e2e（`discord-login.spec.ts`・`charm-save.spec.ts`・`e2e/support/buildsApi.ts` を使う spec）は、ログイン中に `/api/weapons` を差し替えていないため、武器の一覧が読込失敗になる。どれも武器の一覧の表示を検証していないので、変えずに通る見込み。既存の spec は変えない。落ちたら直さずに止めて報告する。

### 順序
- D16: T1 → T2 →（draft の回収）→ T3 → T4 → T5。並列にしない。
  - T2（api）と T3・T4（web）は、どちらも T1 の契約ファイルを前提にするため、`.claude/skills/tsod-build/SKILL.md`「委譲」節の並列の条件を満たさない。
  - web は2回に分けて委譲する（T3 は API の層・ストア・検索条件、T4 は画面）。T4 は T3 のストアの形を前提にする。T5 は T4 の画面を前提にする。
  - draft の回収（T2 の後）と教訓台帳の項目の削除（D9。T2 のコミット）はメインが行う。

## 常時許可外の変更
- なし
