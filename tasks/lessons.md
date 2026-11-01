# 教訓台帳

`.claude/**`・`CLAUDE.md` への改修要求と作業の教訓を、その場で起票する唯一の台帳です。
書式と行き先の正は `.claude/skills/tsod-workflow/references/lessons-guide.md` です。
項目を直したコミットの中で、直した人が台帳から消します。


## 2026-10-27 Spring Boot の版を上げたコミットで design/tech-stack.md の表が更新されなかった（機能009・区間C）
- 種別: 規律昇華
- 何が起きたか: 3563ad4 で `apps/api/gradle/libs.versions.toml` の Spring Boot を 4.1.2 に上げたが、`design/tech-stack.md` の表（Spring Boot の行・更新の方針の表）は 4.1.1 のまま残った。009 の T2 で表を実測に合わせる（specs/009-discord-login/plan.md D17）。
- 提案: `design/tech-stack.md` 204 行の「更新の方針」の表を、実測の版と確認日に直す。区間 E の drift-scan で `libs.versions.toml`・`package.json` の版と `design/tech-stack.md` の表の一致を検査することも検討する。

