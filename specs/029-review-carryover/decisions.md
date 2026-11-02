# 029 review-carryover の決定記録

## Q119（決定: 2026-11-02）
- 問い: 触る領域が api・web・solver・contracts の 4 つになり、上限の 3 つを超える。どう解消するか。
- 決定: `NotFound.yaml` の説明の修正を 029 から外し、`open-questions.md` の Q123 に残す。029 は api・web・solver の 1 機能のまま進める。
- 理由: `contracts` が要るのはこの説明の 1 行だけで、外せば上限に収まる。テストと検査の機能（api・solver・web）と web の整理の機能（web・contracts）に割る案は、PR は小さくなるが、挙動を変えない小さな整理に区間 A〜E を 2 周かけることになるので採らない。

## Q120（決定: 2026-11-02）
- 問い: `WeaponPayload.element.type` を契約の列挙に揃えるにあたり、契約の型を使う境界をどこに引くか。
- 決定: `lib/api/schema.ts` を import するのは `lib/api/` の中だけにする。`WeaponPayload` は web の型のまま持ち、属性の種類は `constants/weapons.ts` の `ELEMENT_TYPES` から作る列挙型にする。`lib/api/weapons.ts` の要求の型は `Omit` の差し替えをやめて契約の型を使い、`lib/builds/payload.ts` のキャストも外す。契約の列挙とのずれは型検査で検出する。
- 決定（応答の検査）: `lib/api/builds.ts` の `isElement` は厳しくしない（種類を文字列として検査するまま）。厳しくすると、列挙に無い種類の応答の扱いが変わり、「挙動を変えない」に反する。
- 決定（規約）: 境界を `.claude/rules/web-vue.md` に書く作業は、区間の中では行わない（`canon-boundary.md`）。`tasks/lessons.md` に起票し、029 のマージの後に区間の外で直す。
- 理由: いま `lib/api/schema` を import しているのは `lib/api/` の中だけで、`apps/web/src/main/types/README.md` の方針とも合う。`WeaponPayload` を契約の型から派生させる案は、列挙の二重定義は無くなるが、端末に保存する型が API の型に依存し、`WeaponId` などの区別された ID の型も失うので採らない。

## Q121（決定: 2026-11-02）
- 問い: `MD_OUTLINE_CLASS` のダークの hover（026 AC-6。`md:dark:hover:bg-muted` が ghost の `dark:hover:bg-accent/50` に勝つこと）を、どう確かめるか。
- 決定: Playwright の e2e で、`md` 以上の幅のダークで hover したときの算出された背景色を検査する。クラスの適用は単体テストで見る。e2e が 026 AC-6 と違う結果を示したら、026 AC-6 を正としてクラスを直す（画面の挙動を変えない例外として、PR 本文に書く）。
- 理由: 実ブラウザでしか確かめられない未確認の事項を解消でき、回帰も検出できる。区間 D か E の目視で確かめる案は、回帰を検出できないので採らない。

## Q122（決定: 2026-11-02）
- 問い: Combobox の入力欄の共通化に `WeaponBonusRow.vue` を含めるか。機能マップは `CharmSkillRow`・`ArmorLockRow`・`ExcludeCard` の 3 箇所を挙げているが、`WeaponBonusRow` にも同じ入力欄がある。
- 決定: 含める。4 箇所すべてを共通化する。
- 理由: 残すと同じ重複が 1 箇所残る。機能マップの列挙の漏れで、含めない理由が無い。
