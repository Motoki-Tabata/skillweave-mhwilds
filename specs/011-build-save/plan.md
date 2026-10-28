# 011: build-save 計画

## スタック
- API: Java 25・Spring Boot 4.1.2（`apps/api/gradle/libs.versions.toml`）・Spring Framework 7・Hibernate ORM 7.4・Spring Data JPA・Bean Validation・springdoc-openapi 3.1.1。009 の Spring Security・Spring Session JDBC と、010 の Jackson の厳密な型の設定（`application.yml` の `allow-coercion-of-scalars: false`・`accept-float-as-int: false`）をそのまま使う。依存は足さない。
- Web: Vue 3.5.44・vue-router 5.4.0・Pinia 4.1.0・reka-ui 2.11.0・@lucide/vue 1.57.0・Vite 8.3.4・TypeScript 6.0.3・Vitest 5.0.5・@playwright/test 1.64.1（`design/tech-stack.md` の現行どおり。依存は足さない）。
- 追加する ui 部品は無い（screen-design.md 0。既存の `card`・`button`・`badge`・`dialog`・`alert-dialog`・`input`・`label`・`skeleton`・`alert`・`ResultAlert`・`AppToaster` で足りる）。`Select` を使わないため、`sonar-project.properties` の抑止の追記は要らない。
- HTTP は既存の `apps/web/src/main/lib/http.ts`。火力の計算は既存の `@swv/solver` の `evaluateDamage`（マスターに無いスキル・発動条件は数えないだけで例外を投げない）を使い、`packages/solver` は変えない。

## データモデル
- `builds`（`id` uuid DEFAULT uuidv7()・`user_id` uuid → `users (id)`・`name` text（`char_length` 1〜50）・`master_version` text（空でない）・`payload` jsonb（`jsonb_typeof = 'object'`）・`schema_version` integer（1 以上）・`version` integer DEFAULT 0・`created_at`・`updated_at`・`deleted_at` NULL）。部分インデックス `ix_builds_user_id (user_id, id DESC) WHERE deleted_at IS NULL`。`V4__create_builds.sql`（区間 B・00f6c80）。
- 属性は `design/attributes.yaml`（`defined_by: specs/011-build-save`）。`id` はクライアント採番の UUIDv7。

## 決定事項

### 文書（メイン）
- D1: 委譲の前に、メインが `design-system/skillweave/MASTER.md` に screen-design.md 8 の内容（Layout の「画面骨格」のナビゲーションの横スクロール、Component Specs の「保存した構成の一覧の行」「ログインが必要の表示」「現在のマスターに無い ID の表示」、UI Copy の「保存」「保存した構成」）を足す（T1）。
  - 理由: web-agent が部品を MASTER.md と突き合わせて実装するため。

### 契約（contract-agent）
- D2: 契約のファイルと名前（spec の契約差分の「名前は区間 C で決める」の結論）。
  - パス: `paths/builds/builds.yaml`（GET `listBuilds`・POST `createBuild`）と `paths/builds/builds-id.yaml`（PATCH `renameBuild`・DELETE `deleteBuild`）。4つとも `x-swv-status: draft` を付けて足す（T3 の後にメインが外す）。`openapi.yaml` に tag `builds` と2つのパスの `$ref` を足す。
  - 応答: GET 200（`Build` の配列）・401。POST 201（`Build`）・400・401・409。PATCH 200（`Build`）・400・401・404・409。DELETE 204・401。400・404・409・401 は既存の `components/responses/` を参照する。CSRF の拒否の 403 は `responses` に書かず、状態を変える3つの `description` に散文で書く（010 と同じ）。
  - スキーマ（`components/schemas/builds/`）:
    - `Build`（`id`・`name`・`masterVersion`・`payload`・`schemaVersion`・`version`・`createdAt`・`updatedAt`。すべて必須）。
    - `CreateBuildRequest`（`id`・`name`・`masterVersion`・`payload`・`schemaVersion`）、`RenameBuildRequest`（`name`・`version`）。
    - `BuildPayload`（`weapon`・`armor`・`charm`・`decorations`・`skills`・`freeSlots`・`activeConditionIds`。すべて必須）。`armor`・`decorations`・`skills`・`freeSlots` は、ソルバーの出力 `SolvedBuild` の同名の項目と同じ形にする（S5 で `SolvedBuild` に戻して既存の表示の関数に渡すため）。`score`・`freeSlotLevels` は持たない。
    - `BuildWeapon`（`kind` を discriminator にした `oneOf`）: `BuildMasterWeapon`（`kind: master`・`weaponId`）と `BuildCustomWeapon`（`kind: custom`・`id`・`payload`）。`payload` は `CustomWeaponPayload`（`baseWeaponId`・`name`・`attack`・`affinity`・`element`（省略可）・`slots`・`seriesBonusId`・`groupBonusId`）で、Web の `WeaponPayload`（`lib/weapons/types.ts`）と同じ形（decisions.md Q64 の写し）。
    - `BuildArmor`（`head`・`chest`・`arms`・`waist`・`legs`。すべて必須で、防具の ID か null）、`BuildCharm`（`id`・`payload`。`payload` は既存の `CharmPayload`）。`charm` は `BuildCharm` か null。
    - `BuildDecoration`（`slot`・`decorationId`）、`BuildSlotRef`（`owner`・`index`）、`BuildSkill`（`skillId`・`level`・`rawLevel`）。
  - `description` は `contracts/README.md` の固定テンプレートで書き、`refs specs/011-build-save/spec.md` を付ける。
  - 理由: スキーマ名は Web の生成型の名前になる。`SkillLevel`・`Slot`・`WeaponPayload` など `@swv/data`・Web の既存の型名と紛らわしいので、`Build`・`Custom` を前置する。
- D3: 構成名の規則（handoff の区間メモ・decisions.md Q66。作成と名前の変更で同じ）。
  - 空白は、ECMAScript の `String.prototype.trim()` が除く文字（WhiteSpace と LineTerminator。U+0020・U+00A0・U+3000・U+FEFF・改行などを含む）とする。Web は `trim()` した値を送る。サーバーは前後を削らず、先頭か末尾が空白の名前を 400 にする。
  - 文字数は Unicode のコードポイントの数とし、1〜50。DB の `char_length`・JSON Schema の `maxLength`・Java の `codePointCount` と一致させる。Web は `[...name].length` で数える（`name.length` は UTF-16 の単位で、絵文字を2と数えるため使わない）。
  - 契約: `minLength: 1`・`maxLength: 50`・`pattern: '^\S(?:[\s\S]*\S)?$'`（ECMA-262 の `\s` は trim の除く文字と同じ集合）。
  - API: `validator/` に独自の制約（例 `@BuildName`）を足し、コードポイントで数え、先頭と末尾のコードポイントを ECMAScript の空白の集合（`\t\n\u000B\f\r    -     　﻿`）と照合する。Java の `\s`・`Character.isWhitespace`・`String.strip` は集合が違う（U+00A0・U+FEFF を含まない、U+001C〜U+001F を含む）ので使わない。`@Size` は UTF-16 で数えるので使わない。
  - 例: 「鉄刀【神楽】 構成3」は可。「 構成」（先頭が全角空白）・空文字・51 コードポイントは 400。絵文字を含む 50 コードポイント（UTF-16 では 51 以上）は可。
- D4: `masterVersion` と、`payload` の項目ごとの規則（decisions.md Q68。数字は `packages/data/dist/master-2026.10.4.json` で数えた）。
  - `masterVersion`: `pattern: '^[0-9]+\.[0-9]+\.[0-9]+$'`・`maxLength: 32`。例: `2026.10.4`（`packages/data/src/main/pipeline/config.ts` の `MASTER_VERSION`）。
  - マスター ID の pattern（gameId は負の数を含む。実データの全件が一致することを確かめた）:

    | 種類 | pattern | 実データの例 |
    |---|---|---|
    | スキル | `^sk:-?[0-9]+$` | `sk:-397570464`（弱点特効）・`sk:850626240` |
    | 防具 | `^ar:-?[0-9]+:(head\|chest\|arms\|waist\|legs)$` | `ar:-1077030272:arms`・`ar:-2117203456:head` |
    | 装飾品 | `^dc:-?[0-9]+$` | `dc:-1003144960`・`dc:-2144349312` |
    | 武器 | `^wp:[a-z]+(-[a-z]+)*:[0-9]+$` | `wp:bow:1`・`wp:charge-blade:22` |
    | シリーズ／グループスキル | `^sb:-?[0-9]+$` | `sb:-1305836672`・`sb:-1432692352` |
    | 発動条件 | `^cd:[a-z][a-z0-9_]*$` | `cd:weak_point`・`cd:xu_wus_vigor` |

  - `armor` の各部位は防具の pattern か null（部位のキーと ID の部位の一致は検査しない）。
  - `decorations` は 0〜21 個（武器 3・防具 5 部位×3・護石 3 の最大のスロット数）。`freeSlots` も 0〜21 個。`BuildSlotRef` の `owner` は `weapon`・`head`・`chest`・`arms`・`waist`・`legs`・`charm`、`index` は 0〜2。
  - `skills` は 0〜100 個（取りうる最大は、防具 15・装飾品 42・武器 2・護石 3・シリーズ／グループで 70 前後。余裕を持たせた）。`skillId` の重複なし、`level` は 1 以上、`rawLevel` は `level` 以上。
  - `activeConditionIds` は 0〜50 個（現在のマスターは 21）で重複なし（`uniqueItems: true`）。
  - `charm.id` と `BuildCustomWeapon.id` は参照なので UUID の形だけを検査し、版は問わない（他の画面で作ったデータの ID のため）。`Build.id`・`CreateBuildRequest.id` は UUIDv7（010 と同じ `@UuidV7`）。
  - `CustomWeaponPayload`: `baseWeaponId` は武器の pattern、`name` は 0〜30 文字（空なら Web が基の武器の名前を出す。`constants/weapons.ts` の `WEAPON_NAME_MAX`）、`attack` は 1〜999、`affinity` は -100〜100、`element` は省略可で `type` は `fire`・`water`・`thunder`・`ice`・`dragon`・`poison`・`paralysis`・`sleep`・`blastblight` のどれか・`value` は 1〜99（マスターと同じ単位の整数）、`slots` は 0〜3 枠（`target` は `weapon`・`level` 1〜3）、`seriesBonusId`・`groupBonusId` はシリーズ／グループスキルの pattern か null。
  - `schemaVersion` は要求では `enum: [1]`。`version` は `minimum: 0`。`createdAt`・`updatedAt` は `format: date-time`。
- D5: 010 の護石のスキル ID の pattern を直す（教訓台帳 2026-10-28）。`contracts/components/schemas/charms/CharmSkill.yaml` の `pattern` を `^sk:[0-9]+$` から `^sk:-?[0-9]+$` に、`description` の「数字が続く形式」を「整数（負の数を含む）が続く形式」に、`examples` に `sk:-397570464` を足す。api は `entity/CharmSkill.java` の `@Pattern` を `sk:-?\d+` にし、`CharmControllerTest` に負の ID の護石を作成・更新できるケースを足す。
  - 理由: 011 の護石の写しは `CharmPayload` を使う（spec の契約差分）。直さないと、弱点特効などの負の ID のスキルを持つ護石を使った構成を保存できず AC-1 を満たさない。010 の護石の保存（ログイン中）も同じ理由で失敗している。

### API（api-agent）
- D6: 永続化は JPA にする（010 の `entity/Charm` と同じ形）。`entity/Build`（`@Version` の `version` は `Integer`。`payload` は型付きの record `BuildPayload` を `@JdbcTypeCode(SqlTypes.JSON)` で jsonb に写す）と `repository/BuildRepository`。護石の写しは既存の record `entity/CharmPayload` を使う。武器は sealed interface と Jackson の `kind` による型の判別で読み、未知の `kind` は 400。
  - jsonb に書かれるキー（D2 の項目名。`weapon.kind`・`armor.head`・`decorations[].slot.owner`・`skills[].rawLevel`・`activeConditionIds` など）が Web の形と一致することをテストで確かめる。
  - `created_at`・`updated_at`・`version` はサーバーが決め、要求から受け取らない。時刻は UTC（憲法）。クライアント採番の ID の受け取り方は 010 の `CharmService` と同じにする。
- D7: 4つの API の処理（decisions.md Q66。controller は `controller/BuildController`、処理は `service/BuildService`）。主体は `@AuthenticationPrincipal DiscordUserPrincipal` の `userId`。
  - 一覧: 自分の `deleted_at IS NULL` の行を `id` の降順で全件返す。
  - 作成: ID が既存の行（自分・他のユーザー・削除済みを問わない）と衝突したら 409。同時の作成で主キー違反になったときも 409。応答は 201 と保存後の構成。
  - 名前の変更: `id`・自分の `user_id`・`deleted_at IS NULL` で行を探し、無ければ 404（他のユーザーの行も 404）。要求の `version` が行と違えば 409。一致すれば `name` を書き換え、`updated_at` と `version` を進めて保存後の構成を返す。`@Version` の楽観ロックの失敗も 409。
  - 削除: 自分の削除していない行に `deleted_at` を入れる（行バージョンは照合しない）。一括 UPDATE で書くときは `version = version + 1` を明示する（教訓台帳 2026-10-27 の JPA の項）。行が無くても 204。他のユーザーの行は変えない。
  - パスの `{id}` が UUID の形でないときは、行が無いのと同じに扱う（PATCH は 404・DELETE は 204）。
  - 404・409 の例外は `common/exception/` に構成用のものを足し、`common/handler/ApiExceptionHandler` で ProblemDetail に変換する。`@ApiResponse` で D2 の status code を各メソッドに宣言する（`OpenApiContractTest#responseStatusCodesMatchImplementation` が契約と突き合わせる）。
- D8: 構造の検査（AC-11）は Bean Validation で要求の DTO と `payload` の record に書き、違反は 400（`application/problem+json`）にする。D3・D4 の各項目、必須の項目の欠落・null・型の違い・JSON として読めない本文を含む。未知のプロパティは record に無いので保存しない。マスターに依る検査はしない。
- D9: 認可は 009 の `SecurityConfig` のまま（`/api/**` はログインを要する・CSRF は `csrf.spa()`）。`SecurityConfig` は変えない。
- D10: API のテスト（AC-14。Testcontainers の PostgreSQL・`users` の行を2人分。`controller/BuildControllerTest`）。
  - 作成・一覧・名前の変更・削除の往復。一覧が ID の降順で、削除済みと他のユーザーの行を含まず、`payload` を含むこと。応答の `createdAt`・`updatedAt`・`version` がサーバーの値で、名前の変更で `version` が進み `updatedAt` が変わること。
  - 他のユーザーの構成の隔離: 一覧に出ない・名前の変更は 404 で行が変わらない・削除は 204 で行が変わらない。
  - ID の衝突（自分の行・他のユーザーの行・削除済みの行の3通り）が 409 で、既存の行が変わらないこと。
  - 行バージョンの不一致が 409 で上書きしないこと。存在しない・削除済みの ID の名前の変更が 404。削除の冪等（2回目も 204）。
  - 構造の制約の違反（D3・D4 の各項目と境界値。名前の前後の空白と U+00A0・コードポイントでの 50／51、`masterVersion` の空と形式、各 pattern、配列の上限、重複、`rawLevel` < `level`、未知の `kind`）が 400 で保存しないこと。負の gameId の ID（`sk:-397570464` など）と、負の ID のスキルを持つ護石の写しを受け付けること。入力だけが違う同形のテストは `@ParameterizedTest` にまとめる（`.claude/rules/api-spring.md` の `java:S5976`）。
  - 4つすべての未ログインの 401、POST・PATCH・DELETE の CSRF トークンの無い要求が 403 で行を変えないこと。
  - jsonb に書かれたキーが D6 のとおりであること。既存の `SmokeTest`・`OpenApiContractTest`・`AuthorizationBypassTest`・`CharmControllerTest`（D5 のケースを足したもの）を通す。

### Web（web-agent）
- D11: API の層（`pnpm contract:types` で再生成した `schema.ts` の `Build`・`CreateBuildRequest`・`RenameBuildRequest` を使う）。
  - `lib/api/charms.ts` の、失敗の種類（`unauthorized`・`conflict`・`notFound`・`failed`）・原因（`network`・`server`）・原因の文言（screen-design.md 6.6 と 010 で同じ）・`failureOf`・`run`・`isRecord`・`isNumber` を `lib/api/result.ts` に移し、`charms.ts` はそれを使う（`charms.ts` の既存の export の名前は型の別名などで残し、010 のテストを変えない）。護石の内容の形の検査（`toPayload`）は `charms.ts` から export して、構成の護石の写しの検査に使う。
  - `lib/api/builds.ts` の `BuildsApi`（`list`・`create`・`rename`・`remove`）を、`CharmsApi` と同じく差し替えられる形にする。応答の形（上位の項目、`schemaVersion` が 1、`payload` の各項目の有無と型）を検査し、合わなければ `failed`（`server`）にする。
  - 理由: 構成の API の結果の扱いは護石と同じ（decisions.md Q69）。`charms.ts` の写しを作ると同じ判定が二重になる（教訓台帳 2026-10-26 の二重化の項と同じ問題）。
- D12: 構成名の関数 `lib/builds/name.ts`（D3）。`trim()`・コードポイントでの文字数・検証（screen-design.md 3.3 の2つの文言）・初期値「<武器名> 構成<N>」（50 コードポイントを超えるときは武器名を切り詰める。サロゲートペアの途中で切らない）。D5・D7 で使う。
- D13: 検索の結果から構成の内容を作る（AC-1）。
  - `stores/search.ts` の送信の時点の写しに、マスターの版（`bundle.version`）と、武器の写し（マスターの武器は `weaponId`、個体差のある武器は `conditions` の `stored` の `id` と `payload` の複製）を足す。検索の後に武器・護石を編集・削除しても、保存する内容は検索したときのものにする。
  - `SolvedBuild` と送信の時点の写しから `CreateBuildRequest` の `payload` を作る関数を `lib/builds/` に置く（護石は `submittedCharms` から `id` と内容を写す。`charmId` が null なら null）。
  - 検索の結果のカードの「保存済み」の印（screen-design.md 3.1）は、検索の結果ごとの状態として search store に持ち、検索し直すと消す。
- D14: 構成のストア `stores/builds.ts`（screen-design.md 0・4.3・6、decisions.md Q65・Q69）。010 の `stores/charms.ts` のアカウントの側と同じ規則にする。
  - 状態は、判定中・ログインが必要（未ログインと「取得できない」を区別する）・読込中・一覧あり（0件を含む）・読込失敗（原因の文言）。`ensureLoaded()` は `useAuthStore().initialize()` を待ってから、ログイン中なら一覧を読む。画面を開くたびに一覧をサーバーから読む（端末に写しを持たない）。「再読み込み」は一覧だけを読み直す。
  - `save`（`uuidv7()` で採番して POST。押し直しは新しい ID）・`rename`（読んだ時点の `version` で PATCH）・`remove`（DELETE）は、結果の種類（成功・失敗・409・404・401・ログイン中でなくなって捨てた）を返す。成功したらサーバーの応答で一覧を変える（名前の変更は並びを変えない。保存は一覧の先頭に足す）。409・404 は一覧を読み直し、読み直しが失敗したら読込失敗にする。401 は `expire()` が変えたときだけトーストを出す（同時の 401 で1回）。それ以外の失敗は一覧を変えず、送り直さない。トーストの文言は screen-design.md 3.3・6.2・6.3・6.4 のとおり。
  - 認証の状態がログイン中でなくなったら（ログアウト・`expire()`）、その場でログインが必要の状態にし、それより前に送った要求の応答は一覧にもトーストにも反映しない（世代の番号などで捨てる）。
  - 削除の応答待ちの ID をストアが持つ（screen-design.md 6.3 の「削除中…」）。
  - API は `setApi` 等で差し替えられる形にする。単体テストは偽の認証 API と偽の `BuildsApi` を渡して書く。
- D15: 構成のカードの表示（AC-4・AC-5、screen-design.md 5.4・6.5）。
  - `components/search/BuildCard.vue` が search store を直接読むのをやめ、表示に要るもの（`SolvedBuild`・護石・武器のスロット・火力の基（武器の攻撃力・会心率。武器がマスターに無いときは無し）・オンの発動条件・見出し・護石の節の出し方）を props で受け取る形にする。検索結果は、search store から props を渡す側（`ResultsPanel` 等）で組み立てる。「保存」のボタンは見出しの行の slot に入れる。検索結果の表示は今と変えない（既存の `BuildCard.spec.ts` を通す。props の形の変更に合わせた追従はよい）。
  - `lib/solver/buildView.ts` に、現在のマスターに無い ID の扱いを足す（防具「不明な防具（<ID>）」と防御力「−」・合計に数えない、装飾品「不明な装飾品（<ID>）」、スキルは「不明な」の行に並べて効果の一覧に出さない、マスターの武器は「不明な武器（<ID>）」・スロットの Lv は「−」・火力の節に計算できない旨、発動条件「不明な発動条件（<ID>）」）。「無い」の判定はマスターの索引（`armorById`・`decorationById`・`skillById`・`weaponById`・発動条件）で行い、`nameOf` が ID を返すことには頼らない。
  - 保存した構成の `payload` から `SolvedBuild` を作り（`charmId` は `charm?.id`）、護石は写し、武器のスロットと火力の基はマスターの武器なら現在のマスター、個体差のある武器なら写しから引く。
- D16: 画面（screen-design.md 2〜6）。
  - ルート: `router/index.ts` に `/builds`（`builds`）と `/builds/:id`（`build`）を足し、`meta.title` はどちらも「保存した構成 | SkillWeave」。`mountApp` は本物の `routes` を使うので、テスト用ルーターに足すルートは無い。`test/router/index.spec.ts` などルートの一覧や件数を見ている既存の spec は追従する。
  - C1 `components/common/AppNav.vue`: 「保存した構成」を2番目に足し、ナビの行だけの横スクロールと、画面を移ったときに今のリンクを見える範囲に入れる（2.1）。ナビのリンクの数や並びを見ている既存の spec は追従する。
  - S1: カードの「保存」（3.1・3.2）、D5 構成を保存・D7 名前を変更は共通のダイアログ `components/builds/BuildNameDialog.vue`（タイトル・説明・初期値を props で受け取る。D12 を使う）、D6 `components/builds/LoginRequiredDialog.vue`（3.4。ログインの行き先は 009 の `lib/auth/loginReturn.ts`）。
  - S4 `views/BuildsView.vue`（4）・S5 `views/BuildView.vue`（5）。ログインが必要の表示（6.1）は `components/builds/LoginRequiredCard.vue` として S4・S5 で使う。一覧の行は `components/builds/BuildListItem.vue`。
  - D8 は `components/common/DeleteConfirmDialog.vue`（`alert-dialog`。タイトルと本文を props か slot で受け取る汎用の削除確認）を新しく作って使う。既存の `CharmDeleteDialog.vue`・`WeaponDeleteDialog.vue` は変えない（教訓台帳 2026-10-26 の二重化の項は、この部品への移行を専用の作業に残す）。
- D17: テストの支援。`src/test/support/` にメモリ上の偽の `BuildsApi` を置く。`mountApp`・`loadStores` は既定でそれを渡し、既存のテストの振る舞いを変えない（既定の認証は今の「取得できない」なので、構成の画面はログインが必要になる）。

### E2E（e2e-agent）
- D18: `e2e/build-save.spec.ts`（Chromium・ビルドした web・API なし。`page.route` で `/api/auth/me`・`/api/auth/logout`・`/api/builds`・`/api/builds/*` をテストの中のメモリ上の一覧で差し替える。既定の幅＝`md` 以上。AC-15）。
  - ログイン中（me が 200）: 検索して結果のカードの「保存」→ D5 で「保存」を押すと `POST /api/builds` が呼ばれ、トーストが出て、カードが「保存済み」になる。「保存した構成」へ移ると一覧に出て、名前を押すと S5 に構成のカードが出る（004・007 の e2e の検索の流れと支援を流用する）。
  - マスターの版が違う構成（差し替えた一覧に `masterVersion` が現在と違う構成を置く）を開くと、5.3 の警告が出る。
  - 名前の変更が 409: PATCH が 409 を返し、6.2 のトーストが出て、`GET /api/builds` がもう一度呼ばれ、読み直した一覧（差し替えた側で変えた名前）が出る。トーストの文言は `getByText(..., { exact: true })` で探す（教訓台帳 2026-10-27 の e2e の項）。
  - 未ログイン（me が 401）: 「保存」で D6 が出て、`POST /api/builds` が呼ばれない。
  - 既存の e2e は API が無いため me が届かず「取得できない」になる。カードに「保存」が増える以外は変わらない。既存の spec は変えない。

### 順序
- D19: T1 → T2 → T3 →（draft の回収）→ T4 → T5 → T6。並列にしない。
  - T3（api）と T4・T5（web）は、どちらも T2 の契約ファイルを前提にするため、`.claude/skills/tsod-build/SKILL.md`「委譲」節の並列の条件を満たさない（010 の plan D16 と同じ判断）。
  - web は2回に分けて委譲する（T4 は API の層・名前の関数・検索の写し・ストア・カードの表示の関数、T5 は画面）。T5 は T4 の形を前提にする。T6 は T5 の画面を前提にする。

## 常時許可外の変更
- `design-system/skillweave/MASTER.md`（Layout の画面骨格にナビゲーションの横スクロール、Component Specs に保存した構成の一覧の行・ログインが必要の表示・現在のマスターに無い ID の表示、UI Copy に保存の用語を足す。担当: メイン。時期: T1。理由: D1・screen-design.md 8）
