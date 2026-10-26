# 008: user-weapon 計画

## スタック
- Vue 3.5.44・Pinia 4.1.0・reka-ui 2.11.0（shadcn-vue の生成物）・@lucide/vue 1.57.0・Vite 8.3.4・TypeScript 6.0.3・Vitest 5.0.5・@playwright/test 1.64.1（`design/tech-stack.md` の現行どおり。版と依存の変更なし）
- 依存は足さない。IndexedDB はネイティブの API、UUIDv7 は 005 の `lib/uuidv7.ts` を使う。`fake-indexeddb` は足さない（005 plan D9 と同じく、単体テストは保存層を差し替え、実際の IndexedDB は e2e で確かめる）。
- 追加する ui 部品は無い（screen-design.md 0。`select`（`SelectGroup`・`SelectLabel` を含む）・`combobox`・`input`・`alert-dialog`・`badge` は既存）。
- `@swv/solver`（`SolverWeapon` の `kind: 'custom'`・`evaluateDamage`）と `@swv/data`（マスターと辞書の型）はそのまま使う。`packages/solver`・`packages/data` は変えない。
- マスターデータ: `packages/data/dist/master-2026.10.4.*`（版を上げない）。

## データモデル
- テーブル: なし（ゲート B-2 は該当なし。013 user-weapon-save で作る）。
- 端末の IndexedDB に保存する武器の形は screen-design.md 4 のとおり（`id`・`payload`・`schemaVersion`・`createdAt`・`updatedAt`。`payload` は `baseWeaponId`・`name`・`attack`・`affinity`・`element`・`slots`・`seriesBonusId`・`groupBonusId`）。データベースとストアは D2 で決める。

## 決定事項

### 端末の保存（apps/web/src/main/lib。web-agent）
- D1: アーティア武器の見分け方（screen-design.md 3.2 で区間 C に送った点）。
  - マスターの武器のうち、ja の辞書の名前が「アーティア」で始まるものをアーティア武器とする（2026.10.4 で 28 本。14 武器種 × Ⅰ・Ⅱ。2026-10-26 に `dist/` で確かめた）。接頭辞は `constants/` の定数に置き、判定は純粋な関数 `isArtiaWeapon(weapon, nameOf)` にする。
  - 理由: マスターの武器の型にシリーズを表す項目が無く、項目を足すと `packages/data` の変更になる（spec の触る領域は web だけ）。ID の一覧を定数に持つと、マスターの更新で武器が増えたときに追従しない。画面は日本語だけ（004 decisions.md Q4）で、ja の辞書は常に読み込んでいる。
  - 基の武器の選択肢と、「基の武器が現行のマスターのアーティア武器に無い」の判定（フォームの検証・検索の候補の判定）の両方がこの関数を使う。
- D2: データベースとストア（screen-design.md 4 で区間 C に送った点）。
  - 005 の `swv` データベースに、ストア `weapons`（`keyPath: 'id'`）を足し、版を `1` → `2` に上げる。`onupgradeneeded` は、無いストア（`charms`・`weapons`）をそれぞれ作る。新規の端末（版 0 → 2）と 005 の端末（1 → 2）の両方で同じ処理になる。
  - データベースを開く処理（名前・版・`onupgradeneeded`・`runTransaction`・失敗の原因の変換・文言）を、`lib/charms/storage.ts` から共通のモジュール `lib/storage/database.ts` に移し、護石と武器の両方の保存層がそれを使う。版の定数を1か所にして、護石と武器で別の版を開いて `VersionError` や `blocked` になるのを防ぐため。
  - 失敗の型は `CharmStorageError` を共通の `StorageError` に改め、`classifyStorageError`・`STORAGE_FAILURE_MESSAGES`・`StorageFailureReason` とともに共通のモジュールに置く。護石の側（`stores/charms.ts`・`src/test/support/charmRepository.ts`・`lib/charms/storage.spec.ts`）は import を追従させる。文言と原因の3分類（005 plan D8）は変えない。
  - 開いた接続に `onversionchange` で `close()` を設定する。将来、別のタブが版を上げるときに、古いタブの接続が `blocked` を起こさないようにするため。
  - 削除は物理削除（screen-design.md 4）。
- D3: 武器の保存層（`lib/weapons/storage.ts`・`lib/weapons/types.ts`）。
  - 型は `StoredWeapon`・`WeaponPayload`（screen-design.md 4）。`WEAPON_SCHEMA_VERSION = 1`。インターフェース `WeaponRepository` を `list()`・`put(weapon)`・`delete(id)` で定め、IndexedDB の実装は `openWeaponRepository(factory = globalThis.indexedDB)` で作る（005 の `CharmRepository` と同じ形）。
  - 読み込んだ値の `schemaVersion` が 1 でないもの、または D5 の構造の検証（マスターに依らない部分）に反するものがあれば、読み飛ばさず `unknown` の失敗にする（005 plan D8 と同じく、黙って捨てない）。
  - 一覧の並び（ID の降順）は、呼び出し側で並べ直す。

### 武器の純粋な部品（apps/web/src/main/lib/weapons。web-agent）
- D4: 入力値の読み取り。
  - 攻撃力・会心率・属性値の入力は、`normalizeForSearch` と同じ NFKC で全角の数字と「－」を半角に直し、前後の空白を除いてから、`^-?\d+$` に合うときだけ整数として読む。
  - 属性値は装備画面の表示値（10〜990 の 10 の倍数）を入力させ、保存とソルバーへの受け渡しは ÷ 10（1〜99）にする。表示は保存した値 × 10（screen-design.md 0・4）。
  - 名前は前後の空白を除いて保存し、30 文字の上限はコードポイントで数える（`[...name].length`）。
- D5: 構造上の制約（`validateWeapon`）と検索の候補の判定（`weaponEligibility`）。DOM と Vue に依存しない純粋な関数にする（005 plan D10 と同じ方針）。
  - `validateWeapon` は、フォームの下書きと `MasterBundle`・名前を引く関数を受け、項目ごとのエラーを screen-design.md 3.2 の文言で返す。項目は `baseWeapon`・`name`・`attack`・`affinity`・`element`・`slots[i]`・`seriesBonus`・`groupBonus`。
    - 「候補からシリーズスキルを選んでください。」（Combobox の入力の状態）は画面の側で出す。
  - 保存の前の検証では、screen-design.md 4 の範囲と、付与スキルの種別（`seriesBonusId` の `setBonus` の `skillId` のスキルの種別が `series`、`groupBonusId` が `group`）・個数を検査する。`slots` の `target` は `weapon` だけ。
  - マスターに依らない部分（範囲・形・個数）は、D3 の読み込みの後の検査にも使う。関数を分けて、保存層からはマスター無しで呼べるようにする。
  - `weaponEligibility` は、保存済みの武器について、基の武器が D1 のアーティア武器として現行のマスターにあるか、`seriesBonusId`・`groupBonusId` が現行のマスターにその種別で（D5 の種別の検査と同じ規則で）あるかを判定し、外す理由を screen-design.md 3.3 の「検索対象外の理由」の文言に使う形で返す。種別の違いも「現行のマスターにありません」として扱う。
  - 判定の結果は保存しない。表示のたびに現行のマスターで求める（screen-design.md 0）。
- D6: ソルバーへの変換（`toSolverWeapon`）と表示用の文字列。
  - `toSolverWeapon(stored)` は screen-design.md 4 のとおり `kind: 'custom'` の `SolverWeapon` を作る（`setBonusIds` は `seriesBonusId`・`groupBonusId` のうち null でないものをこの順に。`skills` は空。`element` が無ければ項目を出さない）。
  - 表示名（名前が空なら基の武器の名前、基の武器もマスターに無ければ「（基の武器が見つかりません）」）と、性能の行（「攻撃力 <n> ／ 会心 <n>% ／ <属性> <値> ／ スロット Lv<n>・…」）と付与スキルの表示（「<名前>（シリーズ）」「<名前>（グループ）」）を作る関数を置き、S1 の武器カード・D1・S3 の一覧・D4 が共有する。
  - 付与スキルの名前は、`setBonus` の `skillId` を ja の辞書で引く。
  - 属性の種類の表示名と並び（火属性・水属性・雷属性・氷属性・龍属性・毒属性・麻痺属性・睡眠属性・爆破属性。キーは MHDB の `fire`・`water`・`thunder`・`ice`・`dragon`・`poison`・`paralysis`・`sleep`・`blastblight`）は `constants/` の定数に置く（screen-design.md 0）。

### 画面と状態（apps/web/src/main。web-agent）
- D7: 武器のストア（`stores/weapons.ts`）。005 の `stores/charms.ts` と同じ形にする。
  - 状態は、読込中・読込済み・端末に保存できない（原因）・読み込みの失敗（原因）。最初に使われたときに1回だけ `WeaponRepository` を開いて一覧を読む（`ensureLoaded`）。
  - 登録・上書き・削除は、保存に成功してからストアの一覧を変える。失敗は screen-design.md 3.4 の文言でトースト（`tone: 'destructive'`）に出す。
  - 一覧の並びは ID の降順。返す値: 検索の候補（`weaponEligibility` が通るもの）、検索対象外の件数と理由（現行のマスターで計算するゲッター）。
  - `WeaponRepository` の作り方は、ストアの外から差し替えられるようにする（`setRepositoryOpener`）。
  - ストアは検索条件のストアを参照しない（D8 との循環を避ける）。
- D8: 検索条件の武器の選択（`stores/conditions.ts`）。
  - `weaponId: WeaponId | null` を、選択 `WeaponSelection | null`（`{ kind: 'master'; weaponId }` か `{ kind: 'custom'; id }`）に改める。`weapon` のゲッターは、表示と検索に要る形（表示名・武器種・攻撃力・会心率・スロット・`SolverWeapon` を作る元）に解決して返す。個体差のある武器は武器のストアから ID で引くので、S3 で編集すれば S1 のカードは編集後の内容を出す（screen-design.md 2.2）。
  - 選んでいる個体差のある武器が武器のストアから消えたら、選択を外す（未選択に戻す。武器欄のエラーは出さない）。削除の操作（S3・D4）の成功の後に、画面の側から `conditions` の「この ID を選んでいれば外す」操作を呼ぶ。
  - `unavailableReason`・`showWeaponError`・`ResultsPanel.vue`・`SearchView.vue` の「武器が未選択」の判定は、選択が null かどうかで行う。
- D9: 検索の要求と結果の表示（`lib/solver/request.ts`・`stores/search.ts`・`lib/solver/buildView.ts`・`BuildCard.vue`）。
  - `SearchConditions.weaponId` を `weapon: SolverWeapon` に改め、`buildSolverRequest` はそのまま `SolverRequest.weapon` に渡す。マスターの武器は `{ kind: 'master', weaponId }`、個体差のある武器は D6 の `toSolverWeapon` で作る。
  - 送信した時点の写し（`Submitted`）に、`SolverWeapon` の写し（`structuredClone`）と、要約用の武器の名前、構成の表示用の武器のスロットを入れる。`damageBase` は、選んだ武器（個体差のある武器なら入力した値）の攻撃力・会心率から作る。検索の後に武器を編集・削除しても、表示中の結果・火力・要約は変えない（screen-design.md 2.4）。
  - 要約の武器は、個体差のある武器なら「<表示名>（個体差）」（screen-design.md 2.4）。`SearchSummary.weaponId` は、構成の表示が武器のスロットを引くためだけに使っているので、送信した時点の武器のスロットに置き換える。`BuildLookup.weapon` も、マスターの武器ではなく武器のスロットを受ける形にする。
  - 個体差のある武器は、武器のストアの読み込みが済んでからしか選べないので、送信の時点で武器のストアを待たない。
- D10: 画面のファイルの置き場（目安）。
  - `views/WeaponsView.vue`: S3。ルートに `/weapons`（名前 `weapons`、遅延読み込み、`meta.title` は「個体差のある武器 | SkillWeave」）を足す。
  - `components/weapons/`: 入力フォーム・付与スキルの行（Combobox と空にするボタン）・一覧の行・削除の確認（D4）。付与スキルの Combobox の検索は 005 の `matchesSkillQuery`（名前と読み）を使う。
  - `components/common/AppNav.vue`: リンク「個体差のある武器」を足す。
  - `components/search/WeaponCard.vue`（個体差のある武器の表示と S3 へのリンク）・`WeaponDialog.vue`（個体差のある武器の節・読込中・読込失敗）・`ResultsPanel.vue`（要約）・`BuildCard.vue`（D9）を追従させる。
  - 基の武器の Select は、武器種の定数の並びで `SelectGroup`（見出しは武器種の正式名）に分け、グループの中はマスターの並びにする。
- D11: web の単体テスト（`apps/web/src/test/<main と同じ相対パス>/`）。
  - `lib/`: 共通の `database.ts`（版 2 の `onupgradeneeded` で両方のストアができること、版 1 の既存のストアを残すこと、原因の変換）、武器の保存層、`isArtiaWeapon`、入力値の読み取り（全角・負の数・属性値の換算）、`validateWeapon` の各エラーと種別・個数の違反、`weaponEligibility` の3つの理由、`toSolverWeapon`、表示用の文字列、`buildSolverRequest` の `custom`、`toBuildView` の個体差のある武器のスロット。
  - ストア: 武器のストアの並び・登録・上書き・削除・書き込みの失敗でストアが変わらないこと・端末に保存できないときの状態・候補と検索対象外。検索条件の選択と、削除での選択の解除。検索の写し（検索の後に武器を編集・削除しても、要約・火力・構成のスロットが変わらない）。
  - 画面: S3 の入力と各エラーの文言と位置・最初の不正な項目へのフォーカス・登録と編集のモード・一覧と検索対象外・削除の確認とフォーカス・端末に保存できないときのフォームの無効。S1 の武器カード、D1 の節の出し分けと絞り込み・読込中・読込失敗、要約、ナビの `aria-current`。
  - メモリ上の `WeaponRepository` を `src/test/support/` に置き、`mountApp` が既定でそれを渡すようにする（既存のテストが「端末に保存できない」の表示に変わらないようにするため）。
  - テスト用ルーター（`src/test/support/mount.ts` の `newRouter`）に `/weapons` のルートを足す。ナビのリンクが、ルートの無いテスト用ルーターで既存の `App.spec.ts`・`SearchView.spec.ts` などを落とさないようにするため。
  - テスト用のマスター（`src/test/support/fixtures.ts`）に、アーティア武器・シリーズとグループの `setBonuses` と辞書の名前を足してよい。
  - 既存の `lib/charms/storage.spec.ts`・`stores/search.spec.ts`・`stores/conditions.spec.ts`・`lib/solver/request.spec.ts`・`lib/solver/buildView.spec.ts`・`components/search/WeaponDialog.spec.ts`・`BuildCard.spec.ts`・`components/common/AppNav.spec.ts`・`views/SearchView.spec.ts` などは、D2・D8・D9 の型の変更に追従させる。
  - Combobox・AlertDialog・Select のテストは、`.claude/rules/web-vue.md` の後始末とタイムアウトの節に従う。

### e2e（apps/web/e2e。e2e-agent）
- D12: 新しいファイル `apps/web/e2e/user-weapon.spec.ts`。ビルドした web を `vite preview` で起動し、API・DB は起動しない。実際のマスター・HiGHS・Chromium の IndexedDB を使う。要素はロール・ラベル・見出しの文言（screen-design.md）で探し、`data-testid` は足さない。基の武器・付与スキルの名前は、`e2e/support/masterData.ts` のやり方で `packages/data/dist/` の ja の辞書から決める。
  - (a) S3 で個体差のある武器（基の武器・攻撃力・会心率・属性・スロット・シリーズスキルかグループスキル）を登録する → 一覧に出る → 再読み込みの後も一覧に残る → ナビで検索画面へ行く → D1 の「個体差のある武器」の節から選ぶ → 付与スキルを必須スキルに入れ、目的を「火力の最大化」にして検索する → 要約に「<表示名>（個体差）」、構成カードに火力と、付与スキルを数えた発動スキルが出る。
    - 付与スキルが部位数に数えられたことが結果から分かるように、付与スキルと必須スキルの組（例: 防具だけでは部位数が1つ足りないシリーズ／グループスキル）は、e2e-agent が実データで確かめて決める。
  - (b) 攻撃力に範囲外の値を入れて「登録」を押すと、保存されず、攻撃力の直下に「攻撃力は 1〜999 の整数で入力してください。」が出て、一覧の件数が変わらない。
  - 各テストは新しいブラウザコンテキストで始める（Playwright の既定）。

### 構成・文書（メインが書く）
- D13: `design-system/skillweave/MASTER.md` に、screen-design.md 6 の3つ（画面骨格のナビのリンク・一覧の状態のラベルの一般化・UI Copy の用語）を、区間 D の委譲の前にメインが書く（T1）。ナビのリンクの並びを MASTER.md に書くかは T1 でメインが決める（screen-design.md 6）。内容は screen-design.md で確定しているため、ワーカーが標準として読めるようにする。

### 進め方の注意
- D14: 並列にしない。web と e2e はどちらも pnpm workspace を検証する役割なので、`tsod-build/SKILL.md`「委譲」の条件により直列にする。
- D15: web の委譲は3回に分ける（T2・T3・T4）。1回の委譲の差分を、レビューできる大きさにするため。同じ領域なので、順に実行する。
  - T2: `lib/` の純粋な部品・共通の保存層と、その単体テスト（護石の側の追従を含む）。
  - T3: 武器のストアと S3・D4。
  - T4: C1・S1・D1 の変更と検索の要求・結果。

## 常時許可外の変更
- `design-system/skillweave/MASTER.md`（画面骨格のナビに「個体差のある武器」、一覧の状態のラベルの一般化、「個体差のある武器」「基の武器」「付与スキル」の用語と表記を足す。担当: メイン。時期: T1（委譲の前）。理由: D13・screen-design.md 6）
