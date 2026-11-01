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

## 2026-10-27 Spring Boot の版を上げたコミットで design/tech-stack.md の表が更新されなかった（機能009・区間C）
- 種別: 規律昇華
- 何が起きたか: 3563ad4 で `apps/api/gradle/libs.versions.toml` の Spring Boot を 4.1.2 に上げたが、`design/tech-stack.md` の表（Spring Boot の行・更新の方針の表）は 4.1.1 のまま残った。009 の T2 で表を実測に合わせる（specs/009-discord-login/plan.md D17）。
- 提案: `design/tech-stack.md` 204 行の「更新の方針」の表を、実測の版と確認日に直す。区間 E の drift-scan で `libs.versions.toml`・`package.json` の版と `design/tech-stack.md` の表の一致を検査することも検討する。

## 2026-10-27 並列の条件「同じ契約ファイルを前提にしない」と、009 の api・web の並列が食い違う（機能010・区間C）
- 種別: 矛盾是正
- 何が起きたか: `.claude/skills/tsod-build/SKILL.md`「委譲」節の並列の条件は「同じ契約ファイルを前提にしない」とするが、009 の plan D19 は、契約のタスクが済んだ後の api-agent と web-agent を「どちらも契約だけを前提にする」として並列にした。010 の plan D16 は条文どおり直列にした。契約が確定した後の api と web の並列を許すのか、条文の意図が読み取れない。
- 提案: 「委譲」節の条件に、先行タスクで確定済みの契約を両者が読むだけなら並列にしてよいかを明記する。

## 2026-10-28 MASTER.md の Typography／Shape と、shadcn-vue の既定・既存画面が食い違ったまま増えている（機能011・区間D）
- 種別: 矛盾是正
- 何が起きたか: MASTER.md は「ウェイトは 400・500・700」「影を使わない」と定めるが、既存の画面（SearchView・CharmsView・WeaponsView・PickerDialog）の見出しの `font-semibold`、`shadow-lg`、`ui/` の既定がこれに反し、011 の新規画面（BuildsView・BuildDialogFrame・BuildCard の見出し）も同じ書き方を引き継いだ（レビュー記録 1 回目 web 2）。D8 の AlertDialog のオーバーレイも `ui/` 既定の `bg-black/80` で MASTER の Modals（0.6）と違う（web 6）。
- 提案: MASTER.md 側で shadcn の既定の扱い（許容するか、`ui/` を CLI で更新して合わせるか）を決め、規約か実装のどちらかを揃える専用の作業を切る。

## 2026-10-28 区間 A の終わりの B／C の判定が、見た目を変えないリファクタで文字どおりと意図の食い違いを生む（機能025・区間A）
- 種別: 矛盾是正
- 何が起きたか: `.claude/skills/tsod-spec/SKILL.md`「区間の終わり」は「`apps/web/src/main/**` の画面・部品を変える」なら区間 B とする。025 は部品（削除確認・オーバーレイ・ストア）を変えるが、見た目・操作・永続化を変えないため、区間 B で合意する画面設計・テーブル設計が無い。ゲート A-2 でユーザーに A→C を選んでもらった。
- 提案: 同節の判定を「画面の見た目・操作を変える、または新しい永続化がある」なら B とし、見た目と操作を変えない部品の作り替え（リファクタ）は C とする旨を足す。

## 2026-10-28 既定値を変える機能の plan が、既存 e2e の「下限ちょうど」前提を洗い出さず、実行して初めて落ちた（機能021・区間D）
- 種別: 規律昇華
- 何が起きたか: 021 は生産護石の切り替えを既定オンにした。plan D14 は `build-save` など 3 種の追従だけを列挙し、「ほかの spec はオンのまま通る」と書いたが、`solver-ui.spec.ts` 13(a) は護石なしで必須スキルが下限ちょうどの Lv で出ることを期待していたため、生産護石で上振れして落ちた（e2e-agent の切り分け。追従は f71b813）。
- 提案: `.claude/skills/tsod-plan/SKILL.md` の plan の作り方に「既定値・既定の候補を変える機能は、既存の単体・e2e が結果の値（レベル・件数・文言）を護石なし等の旧既定のまま期待していないかを、plan で grep して洗い出し、追従の対象を列挙する」を足す。

## 2026-10-29 画面設計が MASTER.md への追記を決めたのに、spec の影響範囲に載らず plan で初めて「常時許可外」になる（機能027・区間D）
- 種別: 矛盾是正
- 何が起きたか: 027 は区間 B（screen-design.md 5）で `design-system/skillweave/MASTER.md` への追記が決まったが、区間 A の spec.md の影響範囲は「常時許可外の変更予定: なし」のままだった。plan で常時許可外に載せ、C-1 で承認された（レビュー記録 1 回目の構成ファイル領域）。
- 提案: `.claude/skills/tsod-screen-table/SKILL.md` に「画面設計が共有構成ファイル（MASTER.md など）の変更を決めたら、spec.md の影響範囲の『常時許可外の変更予定』も更新して `spec-check` を通す」を足す。

## 2026-10-29 「区間 C で試作」と決定に書いても tsod-plan に試作の工程が無く、plan が区間 D の先頭に置き直す（機能019・024・区間C／D）
- 種別: 矛盾是正
- 何が起きたか: 019 Q41・024 Q50 の決定と 024 の AC-8 は「区間 C で試作」と書くが、`.claude/skills/tsod-plan/SKILL.md` の手順に試作の工程は無い。019・024 とも plan で試作を区間 D の最初のタスク（024 は T3）に置いた。024 の試作の測定は約 2.5 時間かかり、区間 C には収まらない規模だった。
- 提案: `.claude/skills/tsod-spec/` で決定に試作の時期を書くときは「区間 D の最初のタスク」と書く。`.claude/skills/tsod-plan/SKILL.md` に「試作が要る機能は、そのタスクを区間 D の先頭に置き、採る方式を決めるタスク（人間の確認つき）を後ろに置く」と明記する。

## 2026-10-30 契約の enum と web の内部型の string が合わず、API の要求型で payload を web の型に差し替えている（機能013・区間D）
- 種別: 矛盾是正
- 何が起きたか: 契約では `element.type` が列挙だが、web の `WeaponPayload` は string で、`schema.ts` の `CreateCustomWeaponRequest` をそのまま使うと型が合わなかった。`lib/api/weapons.ts` の要求型で `payload` だけを web の型に差し替えて対処した。
- 提案: web の `WeaponPayload`（と同じ形の `CustomWeaponPayload`）の `element.type` を契約の列挙に揃えるか、契約の型を使う境界を決めて `.claude/rules/` に書く。差し替えが護石など他の API の層にも増えないよう、方針を先に決める。

## 2026-10-30 e2e の `uuidV7()` が 3 本の spec に複製されている（機能012・区間D）
- 種別: 規律昇華
- 何が起きたか: 012 の `e2e/build-share.spec.ts` のローカル関数 `uuidV7()` が、`build-save.spec.ts`・`charm-save.spec.ts` の同形と重複し、3 本目になった（レビュー記録 1 回目 web）。2026-10-27 の護石系の教訓の基準（3 本目で切り出す）に達している。
- 提案: `e2e/support/` に `uuidV7` を切り出し、3 本の spec から使う。

## 2026-11-01 web 単体テストの補助ファイルの置き場が規約に無い（機能015・区間D）
- 種別: 規律昇華
- 何が起きたか: 015 で web-agent が実マスターを読む補助 `src/test/lib/ocr/masterFixture.ts` を spec と同じフォルダに置いた。既存の補助は `src/test/support/`（`charms.ts`・`fixtures.ts` など）にあるが、`conventions.md`「テスト配置・命名規約」節の web 単体の項は補助の置き場を定めておらず、reviewer が指摘した。
- 提案: `conventions.md` の web 単体の項に、spec でない補助は `src/test/support/` に置く、と1行足す。あわせて `masterFixture.ts` を移すかを次に lib/ocr を触る機能（016 など）で決める。

## 2026-11-02 検証の下限に、bootRun のダミー値と web の prettier のパスの指定が無い（申し送りの整理・区間外）
- 種別: 規律昇華
- 何が起きたか: 025 で、bootRun の起動確認に `DISCORD_CLIENT_ID`・`DISCORD_CLIENT_SECRET` のダミー値が要ることと、web ワーカーの prettier は `pnpm --filter @swv/web exec prettier` で `apps/web` からの相対パスを指定することが分かった。次の機能の区間 C で扱うとされたが、未反映のまま残っていた（025 handoff.md「未起票の教訓」）。
- 提案: `.claude/skills/tsod-build/SKILL.md`「検証の下限」節の api-agent と web-agent の行に、それぞれ1行で足す。
