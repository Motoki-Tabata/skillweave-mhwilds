# 002: master-data-pipeline 計画

## スタック
- Node 24・TypeScript 6.0.3・Vitest 5.0.1（`design/tech-stack.md` の現行どおり。版の変更なし）。パイプラインは Node 24 の型除去で `node` から直接実行する（v24.21.0 で、`.ts` 拡張子付きの import を含むファイルが警告なしで実行できることを 2026-10-04 に確認）
- `yaml` 2.9.1（2026-09-11 公開でクールダウンを満たす。ISC。依存0。provenance は 2.9.0 以前にも無く、`trustPolicy: no-downgrade` に抵触しない）。`packages/data` の `devDependencies` に完全一致の版で足す（decisions.md Q9。ブラウザへは配信しない）
- 取得元: `LartTyler/mhdb-wilds-data` のコミット `c50a1eb892f4a1ad9bb35c147801658804be2cc2`（2026-04-14。2026-10-04 時点の `main` の HEAD。`wilds.mhdb.io/version` は `2026-04-15T01:28:18+00:00`）
- 版: `2026.10.1`

## データモデル
なし

## 決定事項

### ファイルの置き場と実行
1. コードは `packages/data/src/main/` に置く。入口の `src/main/index.ts` には型の定義だけを直接書き、import 文を持たせない（受入基準 15。利用側が `.ts` 拡張子の import を許す設定を持たなくても型を読めるようにするため）。パイプラインは `src/main/pipeline/` に置き、型は `../index.ts` から `import type` で読む。分け方は次のとおり（ファイル名は目安）。
   - `config.ts`: 人が書く設定（MHDB のリポジトリ・コミット SHA・版）。設定ファイルを `src/main` の中の TS にして、data-agent の書込許可の中に収める
   - `mhdb.ts`: MHDB の入力の型（使う項目だけ）
   - `fetch.ts`（取得とキャッシュ）・`ids.ts`（ID 生成）・`convert.ts`（変換）・`overlay.ts`（YAML の解釈と適用）・`validate.ts`（検証）・`serialize.ts`（直列化）・`output.ts`（`dist/` への書込）・`generate.ts`（実行の入口）
   - Node の API に触れるのは `fetch.ts`・`output.ts`・`generate.ts` と、overlay のファイルを読む箇所だけにする。それ以外は純粋関数にし、ネットワーク・ディレクトリ・fetch 関数は引数で受け取る（受入基準 14 の単体テストで差し替えるため）
2. `package.json` の scripts に `generate`（`node src/main/pipeline/generate.ts`）と `generate:check`（同 `--check`）を足す。`--check` は取得から直列化までを行い、`dist/` を書かずに既存のファイルとバイト単位で比べ、違えば違うファイルを示して失敗する。Q11 の「再生成して `dist/` と差分が無いことの確認（ローカル限定）」の手段で、data-agent が `dist/` を書かずに実データで動作を確かめる手段も兼ねる。
3. Node の型除去で実行するため、`tsconfig.json` に `allowImportingTsExtensions: true`（`noEmit` は既にある）と `erasableSyntaxOnly: true`（enum・namespace 等の型除去で消せない構文を型検査で落とす）を足す。
4. 受入基準 15 を機械で守るため、`tsconfig.entry.json`（新規）を置く。`tsconfig.json` を継承し、`include` を `src/main/index.ts` だけ、`types: []` にする。`type-check` script は `tsc --noEmit` と `tsc --noEmit -p tsconfig.entry.json` を順に実行する。入口が Node の API や Node 依存のモジュールを読み込むと、後者が型エラーで落ちる（`packages/solver` の `types: []` と同じ考え方）。

### 取得
5. 取得対象は区間メモのとおり 18 ファイル（`output/merged/` の `Skill.json`・`Armor.json`・`Accessory.json`・`Amulet.json` と、`output/merged/weapons/` の武器種 14 ファイル）。URL は `https://raw.githubusercontent.com/LartTyler/mhdb-wilds-data/<SHA>/output/merged/...`。
6. キャッシュは `packages/data/.cache/mhdb/<SHA>/` に、リポジトリの相対パスのまま置く（`.gitignore` に `packages/data/.cache/` を足す）。18 ファイルが揃っていればネットワークに接続しない。ファイルは一時ファイルに書いてから rename し、途中で落ちたファイルをキャッシュと見なさない。取得の失敗は URL と HTTP のステータスを示して生成を失敗させる。

### 変換（MHDB → `MasterBundle`）
7. 型は `temp/solver-types.ts` の `MasterBundle` 以下（`MasterVersion`・各 ID のブランド型・`ArmorPart`・`SlotLevel`・`SlotTarget`・`Slot`・`SkillLevel`・`SkillKind`・`EffectStat`・`Effect`・`MasterSkill`・`SetBonus`・`MasterArmor`・`MasterDecoration`・`MasterCharm`・`AppraisedCharmPattern`・`CharmSkillGroup`・`MasterWeapon`・`MasterBundle`）を `index.ts` へ写し、次を変える。ソルバーの型（`packages/solver`）は変えない（スコープ外。003）。
   - `MasterBundle` に `source: { repository: string; commit: string }` を足す（受入基準 13）
   - 辞書の型を足す: `MasterDictionary = { version: MasterVersion; locale: 'ja' | 'en'; entries: Record<string, DictionaryEntry> }`、`DictionaryEntry = { name: string; description?: string; levelDescriptions?: string[] }`（`levelDescriptions` は index 0 = Lv1。スキルだけが持つ）
   - `ConditionId` は `Effect` が参照するので残す。ソルバー入出力・Worker の型は写さない
8. 項目の対応:
   - スキル: `kind` は `armor`・`weapon`・`group` をそのまま、`set` を `series` にする。`maxLevel` は `ranks` の `level` の最大。`effectsByLevel` は `[]`。`raisesMaxLevel` は出力しない（Q7）
   - シリーズ／グループ（`sb:`）: `kind` が `set`・`group` のスキルごとに1つ。`skillId` はそのスキルの `sk:`。`thresholds` は、そのスキルを `set_bonus`／`group_bonus` に持つ防具セットの `ranks`（`pieces`・`skill_level`）から作る（下の 9）
   - 防具: 防具セットの `pieces[]` ごとに1つ。`part` は `pieces[].kind`、`rarity` は防具セットの値、`defense` は `defense.max`、`slots` は `target: 'armor'`。部位の `skills` のうち、`kind` が `set`・`group` のスキルは `skills` に入れず `setBonusIds`（`sb:`）に入れる。防具セットの `set_bonus_id`・`group_bonus_id` は `setBonusIds` に使わない。理由: ゴグα・ゴグβ（2026-10-04 に実データで確認）は、各部位が自セットのシリーズスキルに加えて別のシリーズスキルを1部位分持つ。防具セットの欄はセットにつき1つしか表せず、ゴグβでは `set_bonus_id` が頭の部位にしかないスキル（護鎖刃竜の命脈）を指している
   - 装飾品: `target` は `allowed_on`、`slotLevel` は `level`
   - 生産護石: `is_random: false` の護石の `ranks[]` ごとに1つ。`rarity` は rank の値、`slots` は `[]`
   - 武器: 14 ファイルの全件。`weaponType` は MHDB の `kind`（例: `charge-blade`。ID の `<武器種>` も同じ）、`attack` は `attack_raw`、`affinity` はそのまま、`element` は `specials[0]` があれば `{ type: element または status の値, value: raw }`、`slots` は `target: 'weapon'`、`setBonusIds` は `[]`（現行の武器は set・group のスキルを持たない）
   - 型の前提を MHDB の形が外れたとき（部位の set・group スキルのレベルが 1 以外、武器の `specials` が2つ以上、`specials[].hidden` が true）は、該当の ID を示して変換を失敗させる。黙って丸めない
   - 辞書: スキルは `name`・`description`・`levelDescriptions`（`ranks[].descriptions`）、`sb:` は元のスキルの `name`、防具は部位の、生産護石は rank の、装飾品・武器は本体の `name`・`description`。文字列は MHDB のまま入れる（改行 `\r\n` の扱いは表示の 004 で決める）
9. シリーズ／グループの発動部位数の不一致の扱い（受入基準 8 の「同じスキルを持つ防具セットの間で発動部位数とレベルが一致する」）: 変換は `sb:` ごとに、防具セットの gameId ごとの `ranks` を集める。すべて一致すればそれを `thresholds` にし、一致しなければ「不一致」として出力の型に載せない中間の状態で持つ。オーバーレイが当該 `sb:` の `thresholds` を置き換えたら、不一致は解消する（オーバーレイの値が、そのスキルを持つ全防具セットの値になる）。検証は、解消していない不一致を、`sb:` の ID と防具セットごとの値を示して違反にする。出力の `MasterBundle` では `sb:` ごとに `thresholds` が1つなので、この一致は形で保証され、コミット済みの `dist/` に対するテスト（受入基準 14）では検査しない（防具セットごとの値は取得物にしか無いため）。

### オーバーレイ
10. 書式（`packages/data/overlays/*.yaml`）。最上位のキーは `replace` と `appraisedCharm` だけを許す。訂正の根拠は YAML のコメントに書く。
    ```yaml
    replace:
      - id: sb:-1432692352      # 対象のエントリの ID。接頭辞で集合が決まる（sk・sb・ar・dc・wp・ch）
        field: thresholds        # エントリの最上位の項目。値をまるごと置き換える（深いマージはしない）
        value:
          - { pieces: 2, level: 1 }
          - { pieces: 4, level: 2 }
    appraisedCharm:              # 任意。全ファイルを通じて高々1回
      patterns: []
      groups: []
    ```
11. 適用: ファイル名の昇順で読み、変換の後に重ねる。どのファイルも `appraisedCharm` を定義しなければ `{ patterns: [], groups: [] }`。
12. 失敗にするもの（受入基準 7。ファイル名と行番号を示す。YAML の構文エラーは行と桁）: YAML として解釈できない・最上位に未知のキーがある・`replace` の要素に `id`・`field`・`value` が欠ける・ID が存在しない・項目がエントリに存在しないか `id` である・同じ `id` と `field` の組が複数の箇所にある（適用の順序に結果を依存させないため）・`appraisedCharm` が複数のファイルにある。値の中身の妥当性は、検証（受入基準 8）で見る。
13. `overlays/corrections.yaml` には、現行の MHDB で検出される誤りとして次の2件を書く（受入基準 9。spec の括弧書きは命脈だけを挙げているが、検証の規則「発動部位数が昇順で重複しない」を全件に当てると2件目も検出され、訂正しないと生成が失敗する）。
    - 護鎖刃竜の命脈（`sb:-1432692352`）: ゴグβの `set_bonus` の `ranks` が `2→1, 2→1, 4→2, 4→2` と重複し、護鎖刃竜・α・β の `2→1, 4→2` と一致しない。`2→1, 4→2` に訂正する
    - 巨戟龍の黙示録（`sb:5590`）: これを定義する唯一の防具セットであるゴグαの `ranks` が、同じく `2→1, 2→1, 4→2, 4→2` と重複している（スキルの `ranks` は Lv1・Lv2 の2つ）。`2→1, 4→2` に訂正する
    - 訂正値の最終確認はオーナーに求める（handoff「要確認事項」）

### 検証
14. 検証は、オーバーレイの後に、出力の `MasterBundle` と辞書に対して行う純粋関数にする（違反の配列を返す）。受入基準 8 の項目のうち、防具セット間の一致だけは 9 のとおり中間の状態に対して行い、同じ違反の一覧にまとめて示す。コミット済みの `dist/` に対するテストは、同じ関数を使う。
15. 違反が1つでもあれば、全件を示して生成を失敗させ、`dist/` に何も書かない。

### 出力
16. 直列化: オブジェクトのキーを再帰的に昇順にし、インデント2・末尾に改行1つの JSON にする。配列は、最上位の各集合を `id` の昇順、`skills` を `skillId` の昇順、`setBonusIds` を昇順、`thresholds` を `pieces` の昇順にする。`slots` は MHDB の順のまま。文字列の比較はコードユニット順（`<`）で行い、`localeCompare` は使わない（実行環境のロケールで順序を変えないため）。
17. ファイルは `dist/master-<版>.json`・`master-<版>.ja.json`・`master-<版>.en.json`。3つのうち既にあるものが1つでも中身が異なれば、版を上げるよう示して失敗し、何も書かない。すべて同じなら書き換えない。書いた後（または同じだったとき）に、`dist/` の `master-*.json` のうち現行の版でないものを削除する。`master-*.json` に当たらないファイルは触らない。

### 常時許可外の変更を書く時期
18. 下の「常時許可外の変更」は、原則どおり委譲の前にメインが書く（T1）。ただし次は、後続の成果がないと書けないので委譲の後に書く（001 と同じ。`tasks/lessons.md` 2026-10-04 の項目）。
    - `packages/data/dist/master-2026.10.1{,.ja,.en}.json`: data-agent の実装の後に、メインが `generate` を実行して書く（T4）。`dist/` はどのワーカーの書込許可にも無い
    - `packages/data/vitest.config.ts` の `passWithNoTests` の削除: data-test-agent がテストを書いた後（T7）

## 常時許可外の変更
- `packages/data/package.json`（devDependencies に yaml 2.9.1 を完全一致で追加。scripts に generate・generate:check を足し、type-check を2本の tsc にする。担当: メイン。理由: 決定事項 2・4、decisions.md Q9）
- `pnpm-lock.yaml`（yaml の追加に伴う更新。担当: メイン。理由: 依存の追加）
- `packages/data/tsconfig.json`（allowImportingTsExtensions と erasableSyntaxOnly を足す。担当: メイン。理由: 決定事項 3）
- `packages/data/tsconfig.entry.json`（新規。入口を types: [] で型検査する。担当: メイン。理由: 決定事項 4。受入基準 15 を機械で守るため）
- `packages/data/vitest.config.ts`（passWithNoTests を外す。担当: メイン。理由: 最初のテストを書くため。書く時期は決定事項 18）
- `.gitignore`（packages/data/.cache/ を足す。担当: メイン。理由: 決定事項 6、decisions.md Q11）
- `packages/data/overlays/corrections.yaml`（新規。命脈と黙示録の訂正。担当: メイン。理由: 決定事項 13。data-agent の書込許可に overlays が入るまで）
- `packages/data/dist/master-2026.10.1.json`（生成物。担当: メイン。理由: 受入基準 10。書く時期は決定事項 18）
- `packages/data/dist/master-2026.10.1.ja.json`（生成物の ja の辞書。担当: メイン。理由: 同上）
- `packages/data/dist/master-2026.10.1.en.json`（生成物の en の辞書。担当: メイン。理由: 同上）
- `design/tech-stack.md`（yaml 2.9.1 を packages の表に足し、判断 5 に packages/data の入口の型検査を足す。担当: メイン。理由: 版を新たに決めたため）
