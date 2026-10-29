# 027: crafted-charm-build-save 計画

## スタック
- 契約: OpenAPI 3.1（`contracts/`・Redocly で lint）。Web の型は `openapi-typescript` で `apps/web/src/main/lib/api/schema.ts` に再生成する。
- API: Java 25・Spring Boot 4.1・Jackson 3.1（`tools.jackson`。注釈は `com.fasterxml.jackson.annotation`）・Bean Validation・JUnit・Testcontainers。
- Web: Vue 3・Pinia・Vitest・@playwright/test（Chromium）。
- 版はすべて `design/tech-stack.md` の現行どおりで、依存は足さない。追加する ui 部品は無い（screen-design.md 0）。`Select` を使う新規 `.vue` は無いので、`sonar-project.properties` の抑止の追記は要らない。
- マスターデータ: `packages/data/dist/master-2026.10.4.*`（変更なし）。

## データモデル
なし（テーブル変更なし。`builds.payload`（jsonb）の `charm` に生産護石の形が入りうるようになるだけで、`schema_version` は 1 のまま。decisions.md Q92）

## 決定事項

### 契約（AC-1・AC-3）
- D1: `contracts/components/schemas/builds/BuildCraftedCharm.yaml` を新しく足す。`type: object`・`required: [kind, charmId]`。`kind` は `enum: [crafted]`、`charmId` は `pattern: '^ch:-?[0-9]+:[0-9]+$'`（接頭辞 `ch:`・系統の数値（負を含む）・ランクの数値）で、description に「マスターにあるかどうかはサーバーでは検査しない」と書く（decisions.md Q92。`BuildMasterWeapon.weaponId` の書き方にそろえる）。`openapi.yaml` の `components.schemas` に `BuildCraftedCharm` を登録する。
  - 実データに当てはめた例（マスター 2026.10.4）: `ch:-2057181952:1`（にぎりめしの護石）・`ch:-1137475456:2`（耳栓の護石Ⅱ）・`ch:-498059904:5`（友愛の護石Ⅴ）は通る。`ch:-2057181952`（ランクなし）・`ch:x:1`・`CH:-1:1`・`wp:bow:1`・UUID は通らない。
- D2: `BuildPayload.yaml` の `charm` の `oneOf` に `BuildCraftedCharm.yaml` を足す（並びは `BuildCharm`・`BuildCraftedCharm`・null）。`charm` の description は「護石。鑑定護石は参照と写し、生産護石は参照だけ。護石を使わない構成は null。」にする。`BuildCharm.yaml` は形を変えず、description だけ「鑑定護石の参照と写し。」にする（decisions.md Q92）。
  - `BuildCharm` に `kind` が無いので `discriminator` は付けない。`{id, payload}` と `{kind, charmId}` は必須の項目が重ならないので、`oneOf` の排他は必須の項目で決まる。4つの項目を全部持つ値は両方に当たり、`oneOf` として不正になる（D4 の 400 と一致する）。
  - パス（`paths/builds/*.yaml`）は `$ref` で `BuildPayload` を引くだけなので変えない。

### API（AC-2・AC-3・AC-4）
- D3: `entity/` に、`BuildPayload.charm` の型として sealed interface `BuildPayloadCharm`（permits `BuildCharm`・`BuildCraftedCharm`）を足し、`@JsonTypeInfo(use = JsonTypeInfo.Id.DEDUCTION)` と `@JsonSubTypes` で、項目の有無から形を判別する。既存の record `BuildCharm`（鑑定護石。契約の `BuildCharm`）は項目と検査を変えずに `BuildPayloadCharm` を実装させ、Javadoc を「鑑定護石の参照と写し」に直す。新しい record `BuildCraftedCharm(String kind, String charmId)`（契約の `BuildCraftedCharm`）は、`kind` に `@NotNull @Pattern(regexp = "crafted")`、`charmId` に `@NotNull @Pattern(regexp = BuildCraftedCharm.CHARM_ID)`（`CHARM_ID = "ch:-?\\d+:\\d+"`。`BuildMasterWeapon.WEAPON_ID` と同じ書き方）を付ける。`BuildPayload.charm` は `@JsonProperty(required = true) @Valid BuildPayloadCharm charm` にする（null 可のまま）。
  - 理由: `BuildCharm` は `kind` を持たないので、`BuildWeapon` の `Id.NAME`（`kind` の値で判別）は使えない。DEDUCTION なら、保存済みの行（`{id, payload}`）を変換せずに読め（AC-4）、書き出しも `kind` を record の項目として持つので契約の形のまま `jsonb` に入る。
  - マスターにあるかどうかは検査しない（decisions.md Q92・011 decisions.md Q68）。
  - 形の判別に失敗する値（`{}`・`{kind, charmId, id, payload}` のように両方の項目を持つ・どちらの必須の項目も無い）は、既存の未知の `kind` の武器と同じく読めない要求として 400（`application/problem+json`）になることをテストで確かめる。期待どおりに 400 にならない場合は、独自のデシリアライザで回避せず、そこで停止して報告する。
- D4: テスト（`controller/BuildControllerTest.java` に足す。既存のケースは変えずに通す）:
  - AC-2: 生産護石の形の構成を `POST` すると 201 で保存され、一覧（`GET`）と名前の変更（`PATCH`）の応答の `payload.charm` が送った `{kind: 'crafted', charmId}` のままであること。マスターに無い ID（例: `ch:-1:1`）でも 201 であること。
  - AC-2・AC-6: `payloadIsStoredWithTheWebKeys` と同じ方法で、`jsonb` に `{"kind":"crafted","charmId":"ch:-2057181952:1"}` のキーで入ること。
  - AC-3: `validPayloads` に D1 の通る例、`invalidPayloads` に D1 の通らない例と、`kind` が `crafted` 以外・`kind` だけ・`charmId` だけ・`charmId` が null・数値・両方の形の項目を併せ持つ値・`{}` を足し、400 で保存されないこと。
  - AC-4: 既存の鑑定護石の形・null のケースが変わらず通ること。加えて、鑑定護石の形の `payload` を DB に直接入れた行（API を通さない、版 1 のまま）が一覧の応答にそのまま出ること。

### Web の API の層と保存（AC-6・AC-9）
- D5: `pnpm contract:types` で `schema.ts` を再生成し、`lib/api/builds.ts` に `BuildCraftedCharm` の型の export を足す。`BuildPayload['charm']` は `BuildCharm | BuildCraftedCharm | null` になる。
- D6: 応答の検査（`lib/api/builds.ts` の `isBuildCharm`）: null は通す。`kind` を持つ値は、`kind === 'crafted'` かつ `charmId` が文字列のときだけ通す。`kind` を持たない値は、いまの鑑定護石の検査（`id` が文字列・`toPayload(payload)` が null でない）のまま。それ以外は形の合わない応答（`toBuild` が null）として扱う（AC-9）。`charmId` の形（`ch:` 等）は Web では検査しない（契約の pattern は API が保証し、表示は D9 の `isCraftedCharmId` と不明な護石の表示で受ける）。
- D7: 保存の `payload`（`lib/builds/payload.ts` の `buildPayloadOf`）: 構成の `charmId` が `isCraftedCharmId` に当たるときは `{ kind: 'crafted', charmId: build.charmId }` だけを入れ、レア度・スキル・スロットの写しは入れない（AC-6・decisions.md Q93）。鑑定護石と護石なしはいまのまま。

### 検索結果の「保存」（AC-5）
- D8: `components/search/ResultBuildCard.vue` の 021 の分岐（`usesCrafted`・`#notice` の理由の表示・`Info` の import）を消し、`saveable` なら護石の種類によらず `#action` の「保存」を出す。未ログイン・取得できないときの D6 の扱いは、既存の保存の経路のまま（`ResultsPanel.vue` は変えない）。021 で `BuildCard.vue` に足した名前付き slot `notice`（`$slots.notice` の `div`）は使い手が無くなるので消す（021 plan D12 で足したもので、ほかに使い手が無いことを grep で確かめる）。

### 保存した構成の画面 S5 の護石（AC-7・AC-8）
- D9: マスターのストア（`stores/master.ts`）に、全ランクの生産護石を ID で引く `charmById`（`indexById<MasterCharm>(bundle.value?.charms ?? [])`）を足す。`craftedCharms`（系統ごとに最上位ランクだけ）は使わない（保存したときの最上位ランクが、後のマスターで最上位でなくなっても引けるようにするため）。`lib/builds/savedMaster.ts` の `SavedMasterSource` と `lib/solver/buildView.ts` の `SavedBuildMaster` に `charmById: ReadonlyMap<string, MasterCharm>` を足し、`savedMasterOf` が渡す。
- D10: `lib/solver/buildView.ts` の保存した構成の経路:
  - `solvedOf`: `charm` が null なら `charmId` は null、生産護石の形なら `charmId`、鑑定護石の形なら `id`。`SolvedBuild.charmId` の型（`Uuid | CharmId | null`）に合わせてキャストを直す。
  - 護石の写しの Map（いまの `charmMap`）: 鑑定護石の形はいまのまま写しから作る。生産護石の形は `master.charmById` で引き、あればその件を `SolverCharm` として入れ、無ければ入れない（`lookup.charm` が undefined を返す）。
- D11: 護石の節の表示（`lib/solver/buildView.ts` の `CharmView`・`charmView` と `components/search/BuildCard.vue`）:
  - `unknownCharmName = (id) => \`不明な護石（${id}）\`` を、ほかの `unknown*Name` と並べて足す。
  - `CharmView` に `known: boolean` を足し、`rarity` を `number | null` にする。`charmView` は、`lookup.charm` が護石を返したら今と同じ内容に `known: true`。返さず、かつ ID が `isCraftedCharmId` に当たるときは `{ name: unknownCharmName(id), known: false, rarity: null, skills: [], slots: [] }`。返さず鑑定護石の ID のときは、いまのまま null。
  - `BuildCard.vue` は `known` が false のとき、「レア度」「スキル」「スロット」の値に「−」を出す（「スキルなし」「スロットなし」とは書かない。screen-design.md 3.2）。「名前」の行は `name` をそのまま出す（色・フォントは変えない）。`known` が true のときの DOM は変えない（検索結果と鑑定護石の表示は今のまま。AC-4）。
  - 装飾品の表の護石のスロットと空きスロットの護石のチップは、既存の `slotLevelOf` が null を返して「−」になる。発動スキル・火力は保存した値から求めるので変わらない（AC-8）。
  - 生産護石を引けたときの「名前」は `lookup.nameOf(id)`（ja の辞書。いまの `charmView` の経路）で、検索結果の構成のカードと同じ形になる（AC-7）。

### テストの追従と新しいテスト（Web）
- D12: 単体テスト（web-agent）:
  - `src/test/lib/api/builds.spec.ts`: 生産護石の形の応答を通すこと、`kind` が `crafted` 以外・`charmId` が無い・文字列でない応答を null にすること（AC-9）。
  - 保存の `payload`（`src/test/stores/searchSave.spec.ts` か `buildPayloadOf` の単体テスト）: 生産護石の構成は `{kind: 'crafted', charmId}` だけを送り、写しを送らないこと（AC-6）。
  - `src/test/components/search/ResultsPanel.save.spec.ts` の 021 の「生産護石を使った構成」の describe: 021 AC-8 を確かめる3件を、027 の AC-5（生産護石の構成のカードに「構成 1 を保存」が出て、「生産護石を使った構成は保存できません。」が出ないこと・鑑定護石の構成も保存できること・検索中に見つけた順のカードには「保存」が出ないこと）に書き換える。未ログインで生産護石の構成の「保存」を押すと D6 が開くことを足す。021 の AC-7（名前・レア度など）のテストは変えない。
  - `src/test/lib/solver/buildViewSaved.spec.ts`・`src/test/views/BuildView.spec.ts`: 生産護石の形の構成で護石の節に名前・レア度・スキル・スロットが出ること（AC-7）、マスターに無い ID で「不明な護石（<ID>）」と「−」が出て、防具・装飾品・発動スキル・空きスロット・火力は出ること（AC-8）、鑑定護石と護石なしの表示が変わらないこと（AC-4）。固定値のマスターは既存の `makeBundle({ craftedCharms: true })` を使う。
  - `src/test/lib/builds/savedMaster.spec.ts` と、`SavedMasterSource`・`SavedBuildMaster` を手で組み立てている既存の spec を、`charmById` の追加に追従させる。
- D13: e2e（e2e-agent）:
  - `e2e/build-save.spec.ts` の `mockApi`（`/api/auth/me` と `/api/builds/**` のメモリ上の差し替え）と `json`・`FakeBuild` を `e2e/support/buildsApi.ts` に移し、`build-save.spec.ts` はそれを import する（振る舞いは変えない。`FakeBuild.payload.charm` の型は契約の3つの形を受けるように広げる）。`searchPlainWeapon` の生産護石の切り替えをオフにする操作は残し、理由のコメントを「011 の条件（護石の候補なし）を保つため」に直す（保存できない構成が出るから、という理由は 027 で無くなる）。
  - `e2e/crafted-charm.spec.ts` の 021 の AC-11（1）: 「生産護石を使った構成は保存できません。」が出ることと「保存」が0件であることの確かめを、構成 1 のカードに「構成 1 を保存」が出て、理由の文が出ないことに直す（AC-5）。AC-11（2）は変えない。
  - 新しいテスト（AC-10。`e2e/crafted-charm.spec.ts` に `027 crafted-charm-build-save` の describe を足し、同じファイルの `fillConditions` を使う）: `mockApi` でログイン中にし、鑑定護石を登録せずに必須スキル「にぎりめし」で検索し、生産護石「にぎりめしの護石」を使った構成 1 を保存する。POST した `payload.charm` が `{ kind: 'crafted', charmId: 'ch:-2057181952:1' }` そのもの（写しの項目が無い）であることを確かめ（AC-6）、「保存した構成」から開いた S5 の構成のカードの護石の節に「にぎりめしの護石」が出ることを確かめる（AC-7・AC-10）。要素はラベル・`aria-label`・文言で操作する（screen-design.md 4）。

### デザインシステム（screen-design.md 5）
- D14: 委譲の前に、メインが `design-system/skillweave/MASTER.md` の Component Specs の「現在のマスターに無い ID の表示」に、値が分からない項目は「−」と書き、「なし」（「スキルなし」「スロットなし」など）とは書かない旨を足す（T1）。

### 委譲の順
- D15: T1（メイン）→ T2（契約）→ T3（api）と T4（web）を並列 → T5（e2e）。T3 と T4 はどちらも T2 の契約だけを前提にして互いの出力を使わず、検証の共有物も `apps/api`（Gradle）と pnpm workspace に分かれるので、`tsod-build/SKILL.md`「委譲」節の並列の条件を満たす。T5 は T4 の画面を前提にし、T4 と同じ pnpm workspace を検証するので T4 の後にする。契約の変更はスキーマだけ（オペレーション・status code は変えない）なので、`x-swv-status: draft` は付けない。

## 常時許可外の変更
- `design-system/skillweave/MASTER.md`（Component Specs の「現在のマスターに無い ID の表示」に、値が分からない項目は「−」と書き「なし」と書かない旨を足す。担当: メイン。時期: T1（委譲の前）。理由: screen-design.md 5・D14）
