# 043: weapon-type-effects

## 目的 / ユーザーストーリー
プレイヤーとして、会心撃【属性】・災禍転福・連撃のように武器種で値が違うスキルについても、効果の数値を説明文の後ろの補完で確かめたい。連撃の攻撃力のように火力に効くものは、選んだ武器の武器種の値で火力の期待値に数えてほしい。開発者としては、023 element-damage（属性の期待値）の前提になる会心撃【属性】の値をマスターに揃えたい（023 decisions.md Q197）。今のマスターの効果は武器種の区別を持てないので、この 3 件は効果が空のままである（038 decisions.md Q196）。

用語:
- 対象の 3 件: 会心撃【属性】（`sk:313598432`）・災禍転福（`sk:-1700743296`）・連撃（`sk:565867136`）。
- 武器種: マスターの武器の `weaponType`（MHDB の kind。例: `great-sword`）。全 14 種。
- 武器種の区別: 効果の任意の項目 `weaponTypes`（decisions.md Q200）。省略した効果は全武器種に効く。
- 選んだ武器の武器種: マスターの武器はその武器の `weaponType`、個体差のある武器は `baseWeaponId` の武器の `weaponType`（decisions.md Q203）。
- 補完: スキルの説明文の後ろに `effectsByLevel` から画面で作る「効果: 」で始まる文（007 screen-design.md §4）。

画面に出す値の出どころ: 補完と発動条件のトグルは、`packages/data` が生成する JSON（`effectsByLevel`・`conditions`）から、既存のコード（`apps/web/src/main/lib/skills/effectSummary.ts`・`stores/conditions.ts`）が作る。火力の数値は、同じ JSON と選んだ武器の武器種から、ソルバー（`packages/solver/src/main/damage.ts`・`damageModel.ts`）が計算する。武器種は、検索画面では `stores/conditions.ts` の解決済みの武器が持ち、保存した構成・共有した構成では `lib/solver/buildView.ts` がマスターの武器から引く。API の応答は使わない。

## 受入基準（EARS記法）
- AC-1: THE system SHALL 効果に任意の項目 `weaponTypes` を持てるようにしなければならない。要素はマスターの武器の武器種のどれかで、重複が無く、配列は空であってはならない。overlay と出力前の検証は、違反をファイル名と行・桁を示して生成の失敗にしなければならない（decisions.md Q200）。
- AC-2: THE system SHALL 対象の 3 件の値を、エージェントが Web の情報源を `curl` で 1 ページずつ全文取得して作った下書きのうち、オーナーが確かめて採用したものに限って `packages/data/overlays/effects.yaml` に書かなければならない。出典の間の食い違いは 038 decisions.md Q190 の順で解き、値が定まらない武器種の組のレベルの効果は書いてはならない。取得の対象から Phantom Brawlers を外し、取得した HTML と下書きをコミットしてはならない（decisions.md Q201）。
- AC-3: THE system SHALL 連撃の「5 回継続」以降の最大の段階と、災禍転福の「状態異常・属性やられの解除後」を、それぞれ発動条件として書かなければならない。連撃は基礎攻撃力を `attack_add`・属性値を `element_add` で、災禍転福は属性値を `element_mul`・状態異常値を `status_mul` で書き、段階の途中の値を書いてはならない（decisions.md Q202）。
- AC-4: WHEN 値を足したマスターを生成したとき THE system SHALL 版を 2026.11.3 から上げて `dist/` に現行の版だけを残さなければならない。2026.11.3 から変えてよいのは、対象の 3 件の `effectsByLevel` と、足した発動条件（`conditions` と ja・en の辞書の条件の名前）だけで、それ以外の内容（既存の効果・ID・名前・読み・分類・抽選テーブル・防具など）を変えてはならない。`weaponTypes` を持たない効果の出力の形は変えてはならない。
- AC-5: THE system SHALL 生成した実際のマスターについて、次を `packages/data` のテストで検証しなければならない。対象の 3 件の各々は、効果を持つか、理由を添えた「空のまま」の一覧にある。効果を持つスキルの代表の値と武器種の組が、採用した値と一致する（代表は区間 C で決める）。
- AC-6: WHEN 火力の期待値を計算するとき THE system SHALL `weaponTypes` を持つ効果を、選んだ武器の武器種が含まれるときだけ数え、`weaponTypes` を持たない効果は今までどおり数えなければならない。これは、構成の期待値（`evaluateDamage`）と、`expectedDamage` の最大化の ILP の両方に当てはめなければならない（decisions.md Q203）。
- AC-7: IF 選んだ武器の武器種が分からない（個体差のある武器の基の武器がマスターに無いなど）THEN システムは、`weaponTypes` を持つ効果を火力に数えてはならない。
- AC-8: THE system SHALL 火力の期待値に数える効果の種類を、今の `attack_add`・`attack_mul`・`affinity_add`・`crit_mul` から増やしてはならない。属性値・状態異常値・属性の会心倍率の効果は、マスターに入れて補完に出すが、火力に数えてはならない（decisions.md Q203）。
- AC-9: WHERE 効果が `weaponTypes` を持つ THE system SHALL 補完に、その値がどの武器種のものかが分かるように出さなければならない。書式と、武器が決まっている画面で選んだ武器の武器種の値に絞るかは、区間 B で決める。
- AC-10: THE system SHALL 検索結果・逆引きの候補・保存した構成・共有した構成の火力の表示を、ソルバーと同じ武器種の絞り込みで計算しなければならない。
- AC-11: THE system SHALL `design/master-data.md` の §6 に `weaponTypes` の規則を足し、§11 に対象の 3 件の出典の記録（読み比べたサイト・取得日・採った値と武器種の組・入れなかった組と理由）を書かなければならない。
- AC-12: WHEN 値を入れたマスターで検索の時間を測るとき THE system SHALL `design/tech-stack.md` の既存の測り方（実データ・発動条件はすべてオン・`pnpm --filter @swv/web run measure --workers=1`）で測り、結果を `design/tech-stack.md` に記録しなければならない。IF `expectedDamage` の1件目までの時間の最大が 5 秒（024 decisions.md Q50）を超えたなら THEN システムは、区間 D を止めて報告しなければならない。

## スコープ外
- 属性値・状態異常値・属性の会心倍率の火力の計算（023 element-damage。decisions.md Q203）
- 対象の 3 件の外の値。038 が別の理由で空にした値（044 skill-effect-values-verify）と、037 decisions.md Q187 の 9 種類に当たらない値（045・046）
- 段階の途中の値と、発動率の扱い（006 decisions.md Q39・038 decisions.md Q189）
- 出典の区別を画面に示すこと（038 decisions.md Q191）
- 武器種による発動条件のトグルの出し分け
- API・契約・保存した構成と共有した構成の形の変更
- ソルバーの性能の改善（AC-12 で基準を超えたら止めて別に扱う）

## 契約差分
- なし（API は効果を持たない。マスターは静的配信の JSON で、武器種は保存した構成の武器の ID からマスターで引く。保存した構成の `masterVersion` の形も変えない）

## 影響範囲
触る領域: data, solver, web
常時許可外の変更予定:
- `design/master-data.md`（§6 に weaponTypes の規則を足し、§11 に対象の 3 件の出典を記録する）
- `design/tech-stack.md`（値を入れたマスターでの検索の時間の測定の結果を記録する）
- `design-system/skillweave/MASTER.md`（「スキルの説明と補完」節に、武器種の括弧の書式と構成カードでの絞り込みを足す。screen-design.md §6）
- `packages/data/dist/master-2026.11.4.json`（生成物。効果を足すため、版を上げて生成のコマンドで書く。版の値は plan で決める）
- `packages/data/dist/master-2026.11.4.ja.json`（生成物の ja の辞書。同上）
- `packages/data/dist/master-2026.11.4.en.json`（生成物の en の辞書。同上）
- `packages/data/dist/master-2026.11.3.json`（旧版。生成のコマンドが削除する）
- `packages/data/dist/master-2026.11.3.ja.json`（旧版の ja の辞書。同上）
- `packages/data/dist/master-2026.11.3.en.json`（旧版の en の辞書。同上）

## 依存する機能ID
- 006
- 007
- 037
- 038
