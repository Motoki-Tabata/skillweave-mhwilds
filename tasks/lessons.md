# 教訓台帳

`.claude/**`・`CLAUDE.md` への改修要求と作業の教訓を、その場で起票する唯一の台帳です。
書式と行き先の正は `.claude/skills/tsod-workflow/references/lessons-guide.md` です。
項目を直したコミットの中で、直した人が台帳から消します。


## 2026-10-26 見出しの font-semibold（600）が MASTER.md のウェイト3種（400・500・700）と食い違う（機能007・区間D）
- 種別: 矛盾是正
- 何が起きたか: reviewer が、007 で足した `ActivationConditionsCard.vue` の h2 の `font-semibold` を MASTER.md「Typography」のウェイト3種と突合して指摘した。既存の全カード（`WeaponCard`・`CharmCard`・`RequiredSkillsCard`・`ConditionsCard`・`BuildCard` の h3 など）が同じ書き方で、007 の欠陥ではない。
- 提案: MASTER.md のウェイトに 600 を足すか、既存カードを `font-bold` に揃えるかを、次に UI の見出しを触る機能の区間 B で決める。

## 2026-10-27 Spring Boot の版を上げたコミットで design/tech-stack.md の表が更新されなかった（機能009・区間C）
- 種別: 規律昇華
- 何が起きたか: 3563ad4 で `apps/api/gradle/libs.versions.toml` の Spring Boot を 4.1.2 に上げたが、`design/tech-stack.md` の表（Spring Boot の行・更新の方針の表）は 4.1.1 のまま残った。009 の T2 で表を実測に合わせる（specs/009-discord-login/plan.md D17）。
- 提案: `design/tech-stack.md` 204 行の「更新の方針」の表を、実測の版と確認日に直す。区間 E の drift-scan で `libs.versions.toml`・`package.json` の版と `design/tech-stack.md` の表の一致を検査することも検討する。

## 2026-10-28 MASTER.md の Typography／Shape と、shadcn-vue の既定・既存画面が食い違ったまま増えている（機能011・区間D）
- 種別: 矛盾是正
- 何が起きたか: MASTER.md は「ウェイトは 400・500・700」「影を使わない」と定めるが、既存の画面（SearchView・CharmsView・WeaponsView・PickerDialog）の見出しの `font-semibold`、`shadow-lg`、`ui/` の既定がこれに反し、011 の新規画面（BuildsView・BuildDialogFrame・BuildCard の見出し）も同じ書き方を引き継いだ（レビュー記録 1 回目 web 2）。D8 の AlertDialog のオーバーレイも `ui/` 既定の `bg-black/80` で MASTER の Modals（0.6）と違う（web 6）。
- 提案: MASTER.md 側で shadcn の既定の扱い（許容するか、`ui/` を CLI で更新して合わせるか）を決め、規約か実装のどちらかを揃える専用の作業を切る。

## 2026-10-30 契約の enum と web の内部型の string が合わず、API の要求型で payload を web の型に差し替えている（機能013・区間D）
- 種別: 矛盾是正
- 何が起きたか: 契約では `element.type` が列挙だが、web の `WeaponPayload` は string で、`schema.ts` の `CreateCustomWeaponRequest` をそのまま使うと型が合わなかった。`lib/api/weapons.ts` の要求型で `payload` だけを web の型に差し替えて対処した。
- 提案: web の `WeaponPayload`（と同じ形の `CustomWeaponPayload`）の `element.type` を契約の列挙に揃えるか、契約の型を使う境界を決めて `.claude/rules/` に書く。差し替えが護石など他の API の層にも増えないよう、方針を先に決める。

## 2026-10-30 e2e の `uuidV7()` が 3 本の spec に複製されている（機能012・区間D）
- 種別: 規律昇華
- 何が起きたか: 012 の `e2e/build-share.spec.ts` のローカル関数 `uuidV7()` が、`build-save.spec.ts`・`charm-save.spec.ts` の同形と重複し、3 本目になった（レビュー記録 1 回目 web）。2026-10-27 の護石系の教訓の基準（3 本目で切り出す）に達している。
- 提案: `e2e/support/` に `uuidV7` を切り出し、3 本の spec から使う。

