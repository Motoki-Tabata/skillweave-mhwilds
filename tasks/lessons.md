# 教訓台帳

`.claude/**`・`CLAUDE.md` への改修要求と作業の教訓を、その場で起票する唯一の台帳です。
書式と行き先の正は `.claude/skills/tsod-workflow/references/lessons-guide.md` です。
項目を直したコミットの中で、直した人が台帳から消します。


## 2026-10-24 plan・設計文書に書く具体例は、規則を機械的に当てはめた実データの値で書く（機能006・区間C・D）
- 種別: 規律昇華
- 何が起きたか: plan D1・D3 と `design/master-data.md` の発動条件 ID の例（`cd:challenger`・`cd:adrenaline_rush`）を、規則「スキルの en 名の snake_case」を当てはめずに書いた。実データでは挑戦者は `cd:agitator`、火事場力は `cd:heroics` で、data-agent の報告で食い違いが分かった。
- 提案: `design/master-data.md` 90 行の例を、実データに規則を当てはめた値（`cd:agitator`・`cd:heroics`）に直す。

## 2026-10-26 見出しの font-semibold（600）が MASTER.md のウェイト3種（400・500・700）と食い違う（機能007・区間D）
- 種別: 矛盾是正
- 何が起きたか: reviewer が、007 で足した `ActivationConditionsCard.vue` の h2 の `font-semibold` を MASTER.md「Typography」のウェイト3種と突合して指摘した。既存の全カード（`WeaponCard`・`CharmCard`・`RequiredSkillsCard`・`ConditionsCard`・`BuildCard` の h3 など）が同じ書き方で、007 の欠陥ではない。
- 提案: MASTER.md のウェイトに 600 を足すか、既存カードを `font-bold` に揃えるかを、次に UI の見出しを触る機能の区間 B で決める。

## 2026-10-26 削除確認ダイアログと、端末保存のストアの状態機械が護石と武器で二重になった（機能008・区間D）
- 種別: 規律昇華
- 何が起きたか: reviewer が、`CharmDeleteDialog.vue` と `WeaponDeleteDialog.vue`（違いは本文の断り文1つ）、`stores/charms.ts` と `stores/weapons.ts`（`ensureLoaded`・`reload`・`failureText`・`byIdDescending`・`plainPayload`）の二重化を指摘した。conventions.md「共有部品の扱い」の「2箇所以上に現れる UI は共有部品にする」に当たるが、008 の範囲外（護石の側を変える）のため、そのまま積んだ（レビュー記録 1 回目）。
- 提案: 端末保存の3つ目の機能が出る前に、`components/common/` の汎用の削除確認（本文を slot で差し替える）と、保存先の状態機械の共通化を、専用の機能（またはリファクタの区間 B）として切る。

## 2026-10-27 Spring Boot の版を上げたコミットで design/tech-stack.md の表が更新されなかった（機能009・区間C）
- 種別: 規律昇華
- 何が起きたか: 3563ad4 で `apps/api/gradle/libs.versions.toml` の Spring Boot を 4.1.2 に上げたが、`design/tech-stack.md` の表（Spring Boot の行・更新の方針の表）は 4.1.1 のまま残った。009 の T2 で表を実測に合わせる（specs/009-discord-login/plan.md D17）。
- 提案: `design/tech-stack.md` 204 行の「更新の方針」の表を、実測の版と確認日に直す。区間 E の drift-scan で `libs.versions.toml`・`package.json` の版と `design/tech-stack.md` の表の一致を検査することも検討する。

## 2026-10-27 並列の条件「同じ契約ファイルを前提にしない」と、009 の api・web の並列が食い違う（機能010・区間C）
- 種別: 矛盾是正
- 何が起きたか: `.claude/skills/tsod-build/SKILL.md`「委譲」節の並列の条件は「同じ契約ファイルを前提にしない」とするが、009 の plan D19 は、契約のタスクが済んだ後の api-agent と web-agent を「どちらも契約だけを前提にする」として並列にした。010 の plan D16 は条文どおり直列にした。契約が確定した後の api と web の並列を許すのか、条文の意図が読み取れない。
- 提案: 「委譲」節の条件に、先行タスクで確定済みの契約を両者が読むだけなら並列にしてよいかを明記する。

## 2026-10-27 JPA の一括 UPDATE は @Version を進めず、Jackson 3 は型の違いを黙って変換する（機能010・区間D）
- 種別: 規律昇華
- 何が起きたか: 010 の api で、`@Modifying` の一括 UPDATE（論理削除）が `@Version` を進めず、同時の更新が古いスナップショットで削除を上書きして行を生き返らせる穴をレビューで指摘された（7ae46af で `version = version + 1` を明示して解消）。また Jackson 3 は既定で `"rarity":"8"` や `8.5` を 8 に変換するため、`application.yml` の `spring.jackson.mapper.allow-coercion-of-scalars: false` と `spring.jackson.deserialization.accept-float-as-int: false` で 400 にした（全 API に効く。`Charm.getVersion()` を `int` にすると Spring Data の新規判定で NPE になるため `Integer` にした）。
- 提案: `.claude/rules/api-spring.md` に3点を足す。(1) `@Version` 付きエンティティを一括 UPDATE で変えるときは `version = version + 1` を明示する。(2) 要求の型を厳密に 400 にしたい API は上の2キーが要り、全体に効く。(3) `@Version` の getter は `Integer`。あわせて plan D4・decisions Q59 に「削除は行バージョンを照合しないが進める」を1行足す。

## 2026-10-27 トーストの文言が通知用の live region にも出るため、e2e の getByText に exact: true が要る（機能010・区間D）
- 種別: 規律昇華
- 何が起きたか: `e2e/charm-save.spec.ts` で、トーストの文言が Reka の通知用 live region にも重複して出て、`getByText` が strict mode 違反で落ちた（`exact: true` で解消）。同じ文言を探す将来の e2e も当たる。
- 提案: `.claude/rules/web-vue.md` の E2E の節に、トーストの文言を `getByText` で探すときは `exact: true` を付ける、と1行足す。また、`e2e/charm-save.spec.ts` が `charm-input.spec.ts` の局所関数（`openCharms`・スキル選択・登録手順）を複製しているので、3つ目の護石系 spec を書く機能で `e2e/support/charms.ts` に切り出す。

## 2026-10-28 契約に書いたマスター ID の pattern が実データの負の ID を拒否していた（機能011・区間C）
- 種別: 規律昇華
- 何が起きたか: 010 の `contracts/components/schemas/charms/CharmSkill.yaml` の `pattern: '^sk:[0-9]+$'` と `entity/CharmSkill.java` の `@Pattern(regexp = "sk:\\d+")` が、実データの防具・武器スキル 137 件のうち 54 件（`sk:-397570464` の弱点特効など、gameId が負のもの）を 400 で拒否する。010 の plan D2・テストの例が `sk:101` だけで、`packages/data/dist/` の実データに当てはめていなかった。011 の plan で、契約と api の pattern を直す。
- 提案: `.claude/rules/contracts-first.md` に「マスター ID の pattern を契約に書くときは、`packages/data/dist/master-*.json` の該当の ID を全件当てはめて確かめ、負の gameId（`sk:-…`・`ar:-…`・`dc:-…`・`sb:-…`）を API のテストの例に1件含める」を足す。
