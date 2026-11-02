# 教訓台帳

`.claude/**`・`CLAUDE.md` への改修要求と作業の教訓を、その場で起票する唯一の台帳です。
書式と行き先の正は `.claude/skills/tsod-workflow/references/lessons-guide.md` です。
項目を直したコミットの中で、直した人が台帳から消します。


## 2026-10-27 Spring Boot の版を上げたコミットで design/tech-stack.md の表が更新されなかった（機能009・区間C）
- 種別: 規律昇華
- 何が起きたか: 3563ad4 で `apps/api/gradle/libs.versions.toml` の Spring Boot を 4.1.2 に上げたが、`design/tech-stack.md` の「更新の方針」の表は 4.1.1 のまま残った（表の修正は教訓の消化の作業で済み）。`@types/node` の行にも同じ取り残しがあった。`drift-checklist.md` の手動の項目だけでは漏れている。
- 提案: 区間 E の drift-scan で、`libs.versions.toml`・`package.json`・`pnpm-workspace.yaml` の版と `design/tech-stack.md` の表の一致を機械的に検査する。スクリプトの機能追加なので、文面の修正の経路 (a) でなく、機能か canon の run で扱う。

## 2026-11-02 解消済みの項目が台帳に残り、古い提案のまま次の作業の判断材料になる（教訓の消化・区間外）
- 種別: 規律昇華
- 何が起きたか: 026 は MASTER.md と `ui/` の食い違いを解消し、spec のスコープ外と plan D3 で台帳の 2026-10-26・2026-10-28 の始末を「区間 E で行う」としたが、区間 E で消されないまま残った。台帳の規律（直したコミットの中で消す）とも合っていなかった。
- 提案: `.claude/skills/tsod-ship/references/drift-checklist.md` の検査項目に、spec・plan が区間 E で始末するとした台帳の項目と、機能が解消した事項が `tasks/lessons.md` に残っていないかを見る1行を足す。

## 2026-11-02 規約を変える提案に、同じ文面を持つ別のファイルが挙がっていない（教訓の消化・区間外）
- 種別: 規律昇華
- 何が起きたか: B／C の判定の項目は `tsod-spec` だけを挙げたが、`tsod-screen-table` の UI 判定にも同じ文があった。`ui/` の扱いの項目は `ui-design.md` だけを挙げたが、`web-agent.md` と `web-vue.md` にも「書かない」「編集禁止」があった。どちらも直す前の grep で分かった。
- 提案: `.claude/skills/tsod-workflow/references/canon-boundary.md` の「同じ規約・同じ手順が…」の項に、`.claude/**` の中の複数のファイルにも同じ文面がありうるので、直す前に grep する、を足す。

## 2026-11-02 数行の文面の修正でも、2 つの Skill にまたがると経路 (b) の条件に当たる（教訓の消化・区間外）
- 種別: 矛盾是正
- 何が起きたか: `canon-boundary.md` の経路 (b) の条件「複数の Skill にまたがる手順の変更」に、試作の位置と B／C の判定の文面の修正が当たった。手順を増やさない各 1〜2 行の修正で、ユーザーの確認のうえ例外として経路 (a) で直した（3b1052e）。
- 提案: 同文書の経路の表で、(a) の条件を「手順を増減しない文面の修正（複数ファイルでも可）」に、(b) の条件を「手順の増減を伴う変更」に改める。

## 2026-11-02 契約の型を使う境界が規約に書かれていない（機能029・区間A）
- 種別: 規律昇華
- 何が起きたか: `lib/weapons/types.ts` の `WeaponPayload.element.type` が `string` のままで契約の列挙とずれ、`lib/api/weapons.ts` の `Omit` の差し替えと `lib/builds/payload.ts` のキャストで吸収していた。`lib/api/schema` の import は事実として `lib/api/` の中だけだが、規約に書かれていない（029 decisions.md Q120）。
- 提案: 029 のマージの後に、`.claude/rules/web-vue.md` に節を足す（経路 (a)）。`lib/api/schema.ts` を import するのは `lib/api/` の中だけにする。端末に保存する型などの web の型は自前で持ち、`lib/api/` の要求の型は差し替えずに契約の型を使って、ずれを型検査で検出する。直す前に `.claude/**` の同じ文面を grep する。

