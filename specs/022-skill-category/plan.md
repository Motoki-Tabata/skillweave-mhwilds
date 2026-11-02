# 022 skill-category 計画

## スタック
- Web: Vue 3・Pinia・reka-ui・Vitest・@playwright/test（Chromium）。packages: TypeScript・Vitest・`yaml`。版はすべて `design/tech-stack.md` の現行どおりで、依存は足さない。
- マスターデータ: `packages/data/dist/master-2026.10.4.*` を `2026.10.5` に上げて再生成する（D7）。MHDB のコミットは `c50a1eb` のまま。

## データモデル
なし

## 決定事項

### マスターデータ（packages/data）

- D1: `src/main/index.ts` に `SkillCategory`（`attack`・`affinity`・`element`・`sharpness`・`weapon_specific`・`defense`・`resistance`・`mobility`・`support` の union）を足し、`MasterSkill` に必須の `category: SkillCategory` を足す（decisions.md Q124・Q127）。
- D2: エントリの `index.ts` は型の定義だけを持つ（`design/master-data.md` §7）ので、値の一覧は新しい `src/main/pipeline/categories.ts` の `SKILL_CATEGORIES` に持つ。`effects.ts` の `EFFECT_STATS` と同じく、overlay の読み込みと出力前の検証が共有する。`satisfies readonly SkillCategory[]` で型と揃える。パイプラインの一覧は妥当性の判定にだけ使い、表示の順の正は Web の定数（D10）とする。
- D3: 分類は新しいファイル `overlays/categories.yaml` の最上位キー `categories` に、スキル ID → 分類 ID で書く（AC-2）。並びと注記は `readings.yaml` に揃えて、スキル ID の昇順・行末に ja の名前のコメントを付ける。実データに当てはめた例:
  - `sk:1: attack # 攻撃`（武器）
  - `sk:1425756032: resistance # 火耐性`（防具）
  - `sk:-1642078720: support # 先達の導き`（グループ。説明文は「活性化している採取ポイントの発生確率が上がる」）
- D4: overlay の読み込み（`overlay.ts`）に `parseCategories`・`applyCategories` を足す。`readings` と同じ書き方で、次をファイル名と行・桁を示して失敗させる（AC-3）。`dist/` に何も書かないことは、`generate.ts` が overlay の失敗で出力の前に止まる既存の順序で満たす。
  - `categories` がキーと値の組でない・値が文字列でない。
  - 存在しない ID・スキル（`sk:`）以外の ID・同じスキルの重複（ファイルをまたぐものを含む）・`SKILL_CATEGORIES` に無い分類 ID。
- D5: `replace` で `category` を置き換えることを禁止する。`applyReplacement` の `effectsByLevel` の禁止と同じ分岐に足し、ファイル名と行・桁を示して失敗させる。D6 の未割当の値があるので `Object.hasOwn` の検査では止まらず、禁止を明示しないと定義の経路が 2 つになるため（AC-2）。
- D6: `convert.ts` の `buildSkills` は、`category` に未割当の値（`categories.ts` の `UNASSIGNED_CATEGORY`。`'' as SkillCategory`）を入れる。`MasterBundle` の型を変換の途中と出力で分けるより変更が小さく、`effectsByLevel: []` を変換で入れて overlay で埋める既存の形とも揃う。`validate.ts` に規則 `skill-category` を足し、`SKILL_CATEGORIES` に無い値（未割当・項目なしを含む）のスキルを `<スキル ID>: 分類がありません` の違反にする（AC-4）。CI のコミット済みの `dist/` の検証（`dist.spec.ts`）も同じ規則を通る。
- D7: マスターの版は `2026.10.5`（`config.ts` の `MASTER_VERSION`。data-agent が上げる）。`dist.spec.ts` の版を直書きしたテストも追従する。`dist/` の再生成は生成物なのでワーカーの書込許可に無く、data-agent の実装の後にメインが `pnpm --filter @swv/data run generate` で行う（T3）。生成のコマンドが `2026.10.4` の 3 ファイルを削除する。再生成の後に次を確かめる。
  - `pnpm --filter @swv/data run generate:check` の一致と `pnpm --filter @swv/data run test:unit` の成功。
  - AC-5: `git show` で HEAD から取り出した `master-2026.10.4` の 3 ファイルと新しい 3 ファイルを、版の値と各スキルの `category` を除いて比べ、一致すること。旧版は `dist/` から消えるので恒久のテストにせず、scratchpad の使い捨てのスクリプトで 1 回だけ行い、結果を D-1 の報告に書く。区間 C の時点で、`generate:check` が 2026.10.4 とバイト単位で一致することは確認済み。
- D8: 179 件の割当は data-agent が ja の `levelDescriptions` を根拠に `categories.yaml` に書く（AC-1・decisions.md Q126・Q128）。複数に効くスキルは主な効果で 1 つに決める。割当の根拠に迷ったものは完了報告に列挙する。ゲート D-1 では、メインが生成後の `dist/` から「分類ごとに、種類とスキル名を並べた全件の一覧」を scratchpad の使い捨てのスクリプトで作り、件数の表とともに提示する。
  - オーナーが割当を直すときは、data-agent を新規起動して `categories.yaml` を直す。`writeOutput` は既存の版と中身が違うと失敗する（`design/master-data.md` §7）が、`2026.10.5` は未マージで配信していないので版を上げ直さない。メインが `2026.10.5` の 3 ファイルを削除してから再生成する。
- D9: データのテストは、`src/test/support/fixtures.ts` に `READINGS_YAML` と同じ形の `CATEGORIES_YAML` を足して `generate.spec.ts`・`overlay.spec.ts` の既存の経路に載せる。`dist.spec.ts` に、すべてのスキルが `SKILL_CATEGORIES` のどれかを持つこと、代表のスキルの割当（攻撃→`attack`・見切り→`affinity`・火耐性→`resistance`）を足す。

### 画面（apps/web）

- D10: `constants/labels.ts` に `SKILL_CATEGORIES: readonly { id: SkillCategory; label: string }[]` を Q124 の順で足す。辞書には入れない（Q127）。`src/test/constants/weaponTypes.spec.ts` の「マスターのすべてのスキルの種類に表示名がある」と同じ形で、実データのすべての `category` に表示名があることと、表示名の順（固定値）を確かめる。定数に無い分類のスキルは一覧から消えるため、この検査で防ぐ。
- D11: 区切りは `SkillDialog.vue` の computed で作る。`master.skillsByKind` の各種類を `SKILL_CATEGORIES` の順に `filter` し、0 件の分類を除く（AC-6・AC-7・AC-8）。`filter` は順を保つので名前順はそのまま。`stores/master.ts` の `skillsByKind` は `CharmSkillRow.vue` も使うので変えない（AC-11）。検索語があるときの `searchResults` の分岐も変えない（AC-9）。
- D12: `SkillPickerList.vue` は変えず、分類ごとに 1 つ置く。`openSkillId` は親の `SkillDialog.vue` が 1 つ持つので、別の分類の説明を開くと先の説明は閉じる（AC-10）。テンプレートの形は次のとおり。新しい `.vue` は足さないので、`sonar-project.properties` への追記は要らない。
  - `TabsContent` の中: `<div class="flex flex-col gap-4">` の下に、分類ごとに `<section class="flex flex-col gap-2">`。`<section>` に名前は付けない（ランドマークを最大 9 個増やさないため）。
  - 見出し: `<h3>`。MASTER.md「小見出し（刻印風）」を Tailwind のユーティリティで書く（`flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-muted-foreground`。角は `before:`、線は `after:` の疑似要素）。共通の部品にはしない（既存の h3 は変えない。`tasks/lessons.md` の 2026-11-02 の項のとおり 022 では揃えない）。
- D13: Web のテストの追従（web-agent）。
  - `src/test/support/fixtures.ts` の `skill()` に `category`（既定 `'attack'`）を足す。分類を変えるテストだけが値を渡す。
  - `src/test/components/search/SkillDialog.spec.ts` の 137〜138 行目は、`dialog()!.querySelector('h3')` でフッターの h3 を取っている。分類の h3 が先に来て壊れるので、フッターの h3 を文言で探す形に直す。
  - 新しいテスト: タブの中の見出しの順（AC-6）・見出しの下の種類と名前順（AC-7）・0 件の分類の見出しを出さない（AC-8）・検索語があるとき見出しが無い（AC-9）・分類をまたいで開く説明が 1 つだけ（AC-10）。

### ソルバー（packages/solver）

- D14: `src/main/**` は変えない（AC-11）。`src/test/support/builders.ts` の `masterSkill()` に `category: 'attack'` を足す（Q127）。テストの中に `MasterSkill` のリテラルが他にあれば `pnpm --filter @swv/solver run type-check` で洗い出して追従する。

### E2E（apps/web/e2e）

- D15: 新しい `e2e/skill-category.spec.ts`（AC-12）。割当はゲート D-1 で変わりうるので、スキル名と見出しの組を直書きしない。
  - 期待する見出し: spec に固定で書いた 9 つの表示名のうち、実データの武器スキルにある分類のものを、固定の順のまま並べる。実データは `e2e/support/masterData.ts` から読む（`RawMaster.skills` に `category` を足す）。
  - 見出しの取得: `dialog.getByRole('tabpanel').getByRole('heading', { level: 3 })`。フッターの「選択中のスキル」も h3 なので、`tabpanel` で絞る。
  - 選択: 最初の見出しを含む `section` の、`aria-pressed` が false の最初のボタンを押し、その名前のスキルがフッターと必須スキルの行に出ることを確かめる。
  - 検索: 検索語を入れると `tabpanel` が消え、ダイアログの h3 がフッターの 1 つだけになることを確かめる。

### 進め方

- D16: 委譲の順は T1 → T6 の直列にする。`category` を必須にした時点で `packages/solver`・`apps/web` の型検査が落ちるので、途中の検証の失敗を次のとおり想定内として報告させる。
  - T2（data-agent）: `dist.spec.ts` の版と分類の不一致（T3 で解消）・`generate:check` の「dist/ が再生成の結果と一致しません」（overlay と検証を通った後の失敗だけが想定内。T3 で解消）・`packages/solver`（T4 で解消）と `apps/web`（T5 で解消）の型検査。
  - T4（solver-agent）: `apps/web` の型検査（T5 で解消）。
- D17: `design/master-data.md` は委譲の前に書く（T1）。`packages/data/dist/` は data-agent の実装の後に書く（T3。D7）。

## 常時許可外の変更
- `design/master-data.md`（§6 に overlay の categories の書式と検証規則と replace の禁止を、出力の前の検証に規則 skill-category を、§7 にスキルの分類の出力を足す。担当: メイン。時期: T1。理由: D3〜D6）
- `packages/data/dist/master-2026.10.5.json`（生成物。生成のコマンドで書く。担当: メイン。時期: T3。理由: D7）
- `packages/data/dist/master-2026.10.5.ja.json`（同上の ja の辞書。担当: メイン。時期: T3。理由: D7）
- `packages/data/dist/master-2026.10.5.en.json`（同上の en の辞書。担当: メイン。時期: T3。理由: D7）
- `packages/data/dist/master-2026.10.4.json`（旧版。生成のコマンドが削除する。担当: メイン。時期: T3。理由: D7）
- `packages/data/dist/master-2026.10.4.ja.json`（旧版の ja の辞書。同上。担当: メイン。時期: T3）
- `packages/data/dist/master-2026.10.4.en.json`（旧版の en の辞書。同上。担当: メイン。時期: T3）
