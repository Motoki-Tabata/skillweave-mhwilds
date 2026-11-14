# 鑑定護石の抽選テーブルの整備（036 の起票の入力資料）

> 作成日: 2026-11-15。`/tsod-discover temp/appraised-charm-table.md` の入力にする一次資料。
> 017 reverse-lookup の区間 A で、抽選テーブル（`packages/data/overlays/` の `appraisedCharm`）が空だと分かり、整備を 017 より先に行うと決めた（017 decisions.md Q166）。整備は TSOD の機能（仮: 036 appraised-charm-table・触る領域 data）として起票する。

## 1. 目的

- 鑑定護石の抽選テーブルを `appraisedCharm` に入れ、マスターの版を上げて `dist/` を作り直す。
- 使い道: 005 charm-input の照合（`apps/web/src/main/lib/charms/match.ts`。今はどのレア度も「未検査」）と、017 reverse-lookup の逆引き。
- 017 の再開条件は、少なくとも 1 つのレア度のテーブルがマスターに入ること（Q166）。

## 2. 現状

- MHDB（`LartTyler/mhdb-wilds-data`。固定の SHA `c50a1eb` は 2026-11-15 時点の上流の最新でもある）に抽選テーブルは無い。`Amulet.json` の `is_random: true` は 4 件（未解の護石・史伝の護石・秘歴の護石・栄世の護石。レア 5〜8）で、名前と説明しか持たない。`Charm.json` は武器の飾りで、護石ではない。
- 生成済みのマスター 2026.10.5 の `appraisedCharm` は `patterns` 0 件・`groups` 0 件。
- 型（`packages/data/src/main/index.ts`）:
  - `AppraisedCharmPattern { rarity; skillGroups: (string | null)[]; slotPatterns: Slot[][] }`。レア度ごとに複数のパターンを持てる。スロットのパターンはパターンごとに持つ。
  - `CharmSkillGroup { group; skills: SkillLevel[] }`。グループは（スキル, レベル）の組を持つ。
- overlay の読み込みと検証（規則名 `appraised-charm`。`design/master-data.md`）は実装済み。スキルは `sk:<gameId>` の ID で書く。

## 3. 調査で分かった抽選の構造（コミュニティの調査。未検証）

出典は §5。複数のサイトで構造は一致したが、どれも非公式の調査で、ゲームの版を明記していない。

### 3.1 レア度

- 1 個の抽選でのレア度の確率: レア5 59%・レア6 27%・レア7 11%・レア8 3%（gamerch・mhw-blog・MHHQ・phantombrawlers で一致）。
- 入手は★9 のクエストの「光るお守り」から（2025-08 の無料アップデートで追加）。

### 3.2 スキル枠のパターン（群は A〜J の 10 種）

スキル1 の群でスキル2・3 の群の組が決まる。`ー` は枠なし。

| レア度 | パターン（スキル1-スキル2-スキル3） |
|---|---|
| 5（6 件） | A-F-F・A-G-ー・A-H-F・A-H-H・A-I-ー・A-J-ー |
| 6（7 件） | A-A-G・A-A-J・B-F-F・B-H-F・B-H-H・B-I-ー・B-J-ー |
| 7（8 件） | B-A-G・B-A-H・B-A-J・C-F-E・C-G-ー・C-H-E・C-J-ー・D-A-A |
| 8（8 件） | レア7 と同じ |

- mhw-blog はレア6 を 6 件（A-G-J があり、A-A-J と B-H-H が無い）としており、gamerch・nettoge と食い違う。

### 3.3 スロットの並び

| レア度 | スロットの並び（①〜③ は防具用の Lv、[1] は武器用の Lv1） |
|---|---|
| 5 | ①① ・ ② ・ ②① ・ ③（全パターン共通） |
| 6 | ① ・ ①① ・ ② ・ ②①（全パターン共通） |
| 7 | ① ・ ①① ・ ②。ただし B-A-H だけは ①① ・ ② ・ ③ |
| 8 | [1] ・ [1]① ・ [1]①①（全パターン共通。武器用は 1 枠目だけ） |

- レア7 B-A-G のスロットを、mhw-blog は 4 種（②① を含む）、gamerch は 3 種としており食い違う。
- スロットがパターンに依存するのはレア7（とレア8）の B-A-H だけ。今の型はパターンごとに `slotPatterns` を持つので表せる。

### 3.4 群の中身

- 群は（スキル, レベル）の組の集まり。同じスキルでも群によってレベルが違う（例: 攻撃は A で Lv1、B と D で Lv2、C で Lv3）。
- 件数（gamerch）: A 37・B 43・C 40・D 21・E 37・F 37・G 34・H 15・I 15・J 9（計 288）。
- gamerch と mhw-blog で中身が食い違う（砲術・B の Lv1 の 6 件・ボマー・G の環境適応系など）。mhw-blog には誤字と重複がある。

### 3.5 わからないこと

- 同じ群が 2 枠に出るパターン（A-A-G・D-A-A・F-F など）で、同じスキルが重複しうるか。どのサイトも断定していない。
- どのゲームの版の時点のデータか。アップデート（拡張「アセンダンス」を含む）で変わったか。
- パターン・群の中のスキル・スロットの重み（確率）。どのサイトにも無い。017 では確率を出さない（017 decisions.md Q169）。

## 4. 今の型との適合

- §3.2〜3.4 の構造は、今の `AppraisedCharmPattern`・`CharmSkillGroup` でそのまま表せる見込み。型を変えずに overlay を書くだけで済む可能性が高い。
- 重複の制約（§3.5）が「重複しない」なら、照合（`match.ts`）と 017 のソルバーで別に扱う必要がある。型ではなく規則の話になる。

## 5. 出典の候補

005 decisions.md Q3 で「攻略サイトのスクレイピングはしない」と決めている。下のどれにも再利用の許諾は見当たらない。権利面の判断はオーナーが行う。

| 出典 | 内容 | 出典の明記・利用条件 |
|---|---|---|
| [gamerch MHWA 攻略 Wiki（光るおまもりの抽選確率の仕様）](https://gamerch.com/mhwilds/937094) | パターン・スロット・群の中身（A〜J）・レア度の確率 | 出典の記載なし。最終更新 2026-09-09 |
| [mhw-blog（神おま・全スキルと全スロット抽選一覧）](https://www.mhw-blog.com/mh-wilds-kamiohma-goseki-skill-slot-list/) | パターン・スロット・群の中身（(1)〜(10)） | 出典の記載なし。誤字・重複あり。© 表記 |
| [nettoge（出現パターンと仕様・シミュレータ）](https://nettoge.com/mhwilds-talisman-patterns-simulator/) | パターン・スロット（群の中身は対話式で未取得） | 海外コミュニティのデータマイニングと記載。All rights reserved |
| [Monster Hunter HQ（Complete Appraised Talismans Guide）](https://monsterhunterhq.com/gaming/monster-hunter-wilds-complete-appraised-talismans-guide/) | 10 群の中身・スロット・確率 | データマイン（クレジット: Dtlnor）。元のスプレッドシートは未確認。再利用の許諾なし |
| [Phantom Brawlers（Talismans RNG）](https://www.phantombrawlers.com/MHWilds/Talismans_RNG) | スキルの平坦な一覧・スロット | 規約でスクレイピングと大部分の複製を禁止 |
| [Monster Hunter Wiki（MHWilds/Talismans）](https://monsterhunterwiki.org/wiki/MHWilds/Talismans) | 鑑定護石の本文は未取得 | ライセンス未確認（コミュニティ Wiki なので、再利用できるライセンスの可能性がある） |
| オーナー・フレンドの手持ちの鑑定護石 | 実在する護石 | 自前のデータ。表の正しさの検証に使える（下の §6） |

- 一次資料（データマインの元）は見つかっていない。Dtlnor 氏の資料の所在は未確認。

## 6. 手持ちの護石を使った検証と推論

- 手持ちの護石は、表の正しさの検証に使える。全件が `match.ts` で「合格」になれば表と矛盾しない。「テーブル不一致」になった護石は、表の誤り（または入力の誤り）の手がかりになる。
- 手持ちの護石だけから表を推論するのは、網羅の面で足りない（群は計 288 件で、出ていない組は分からない）。推論で分かるのは、パターン（スキル1 の群とスキル2・3 の群の組）と、群に入っている（スキル, レベル）の一部。
- 護石の集め方の候補: 016 の OCR（スクリーンショット）で登録する・手入力（005）・端末に保存した護石の書き出し。

## 7. 036 の区間 A で決めること（起票のときに open-questions へ）

- 出典: どれを正にするか（権利面の判断を含む）。食い違い（§3.2・§3.3・§3.4）をどう解くか。
- 対象: どのレア度から入れるか。017 の再開には 1 つで足りる（Q166）。
- ゲームの版: どの版の時点のデータとして記録するか（`design/master-data.md` に出典と取得日を残す）。
- 重複の制約（§3.5）の扱い。
- 入力の形式: オーナーが日本語のスキル名で表を用意し、辞書で `sk:` の ID に直して YAML にする、など。
- 検証: 手持ちの護石を何件、どう集めて照合するか。
