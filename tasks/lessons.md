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

## 2026-10-26 護石の読込失敗の帯に、文末の「。」が重なる同じ不具合が残っている（機能008・区間D）
- 種別: 矛盾是正
- 何が起きたか: 008 のレビューで、`WeaponDialog.vue` の帯が `failureMessage`（文末が「。」）を「（…）。」に入れて句点が重なる不具合を直した（350e262）。同じ書き方の `components/search/CharmCard.vue` の読込失敗の帯（49 行付近）と、`CharmCard.spec.ts`（83 行付近）の期待値が、005 から重なったまま残っている。
- 提案: 次に護石の画面を触る機能で、`failureMessage` の末尾の「。」を除いてから括弧に入れる形に直し、`CharmCard.spec.ts` の期待値を合わせる。

## 2026-10-27 Spring Boot の版を上げたコミットで design/tech-stack.md の表が更新されなかった（機能009・区間C）
- 種別: 規律昇華
- 何が起きたか: 3563ad4 で `apps/api/gradle/libs.versions.toml` の Spring Boot を 4.1.2 に上げたが、`design/tech-stack.md` の表（Spring Boot の行・更新の方針の表）は 4.1.1 のまま残った。009 の T2 で表を実測に合わせる（specs/009-discord-login/plan.md D17）。
- 提案: `design/tech-stack.md` 204 行の「更新の方針」の表を、実測の版と確認日に直す。区間 E の drift-scan で `libs.versions.toml`・`package.json` の版と `design/tech-stack.md` の表の一致を検査することも検討する。
