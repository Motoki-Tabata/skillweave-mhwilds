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

## 2026-10-28 例外クラスと ApiExceptionHandler のハンドラが機能ごとに並行して増える（機能011・区間D）
- 種別: 規律昇華
- 何が起きたか: 011 の api で `BuildNotFoundException`・`BuildConflictException` と `ApiExceptionHandler` の同形のハンドラを足した。010 の `CharmNotFoundException`・`CharmConflictException` と構造が同じで、plan D7 が「構成用のものを足す」と決めていたため並行して増えた（レビュー記録 1 回目 api F7）。
- 提案: `.claude/rules/api-spring.md` に「404・409 の例外は機能名を付けず共有する」を足す。

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

## 2026-10-29 検索用 Combobox の入力欄が機能ごとに複製され、Enter と blur の落とし穴が部品ごとに再発する（機能020・区間D）
- 種別: 規律昇華
- 何が起きたか: `CharmSkillRow.vue`・`ArmorLockRow.vue`・`ExcludeCard.vue` が reka-ui の `ComboboxInput` を Input 風のクラス列ごと別々に組んでいる（レビュー記録 1 回目 web F2）。020 では (1) `SearchView.vue` の `onEnter` が全 `HTMLInputElement` の Enter で送信し、Combobox の候補選択の Enter でも検索が走った、(2) 入力欄の blur で表示名に戻す実装が、候補の mousedown と競合して絞り込み後のクリックが選べなかった（4417e3c。jsdom では再現できず e2e で発見）。
- 提案: `.claude/rules/web-vue.md` に「Combobox を足すときは、フォームの Enter 横取りから `role=combobox` を除く。blur でリセットするなら候補リストの `mousedown.prevent` を付け、入力して絞り込んでから候補をクリックする e2e を通す」を足す。2 箇所以上の複製は `components/common/` への共通化を別の作業で切る。

## 2026-10-29 Jackson の DEDUCTION は複数の型に当たる値を曖昧として拒否せず、ignoreUnknown=false も効かない（機能027・区間D）
- 種別: 規律昇華
- 何が起きたか: 027 の plan D3 は、`BuildPayloadCharm` を `@JsonTypeInfo(use = DEDUCTION)` にすれば、両方の形の項目を持つ値は 400 になると書いたが、実際は 1 つの型に決まって 201 になった。`@JsonIgnoreProperties(ignoreUnknown = false)` は既定値と区別できず、Spring の `FAIL_ON_UNKNOWN_PROPERTIES=false` を上書きできなかった（api-agent の報告。回避は 各 record の `@JsonIgnore @JsonAnySetter @Size(max = 0) Map<String,Object> unknown`）。
- 提案: `.claude/rules/api-spring.md` の Jackson の項に「DEDUCTION は曖昧な値を拒否しない。型ごとに未知の項目を 400 にするには `@JsonAnySetter` の受け皿に `@Size(max = 0)` を付ける」を足す。

## 2026-10-29 テストの期待値の `?? <ID>` が辞書の欠落を隠す（機能027・区間D）
- 種別: 規律昇華
- 何が起きたか: `buildViewSaved.spec.ts` の期待値 `NAMES[id] ?? id` が、`savedBuildView` 用の `nameOf` に生産護石の名前が無いことを隠し、名前の検証として通ってしまっていた（レビュー記録 1 回目 web 3。固定値にしたら落ち、`nameOf` を辞書から引くよう直した）。
- 提案: `.claude/rules/web-vue.md` に「名前・文言の期待値は固定値にする。辞書や定数にフォールバックする式を期待値に使わない」を足す。

## 2026-10-29 画面設計が MASTER.md への追記を決めたのに、spec の影響範囲に載らず plan で初めて「常時許可外」になる（機能027・区間D）
- 種別: 矛盾是正
- 何が起きたか: 027 は区間 B（screen-design.md 5）で `design-system/skillweave/MASTER.md` への追記が決まったが、区間 A の spec.md の影響範囲は「常時許可外の変更予定: なし」のままだった。plan で常時許可外に載せ、C-1 で承認された（レビュー記録 1 回目の構成ファイル領域）。
- 提案: `.claude/skills/tsod-screen-table/SKILL.md` に「画面設計が共有構成ファイル（MASTER.md など）の変更を決めたら、spec.md の影響範囲の『常時許可外の変更予定』も更新して `spec-check` を通す」を足す。

## 2026-10-29 「区間 C で試作」と決定に書いても tsod-plan に試作の工程が無く、plan が区間 D の先頭に置き直す（機能019・024・区間C／D）
- 種別: 矛盾是正
- 何が起きたか: 019 Q41・024 Q50 の決定と 024 の AC-8 は「区間 C で試作」と書くが、`.claude/skills/tsod-plan/SKILL.md` の手順に試作の工程は無い。019・024 とも plan で試作を区間 D の最初のタスク（024 は T3）に置いた。024 の試作の測定は約 2.5 時間かかり、区間 C には収まらない規模だった。
- 提案: `.claude/skills/tsod-spec/` で決定に試作の時期を書くときは「区間 D の最初のタスク」と書く。`.claude/skills/tsod-plan/SKILL.md` に「試作が要る機能は、そのタスクを区間 D の先頭に置き、採る方式を決めるタスク（人間の確認つき）を後ろに置く」と明記する。

## 2026-10-29 候補の除外を採る plan が、同点の順を確かめる既存テストのマスターが支配されて縮むことを洗い出さず、実装して初めて落ちた（機能024・区間D）
- 種別: 規律昇華
- 何が起きたか: 024 plan D5 は「Q36 の同点の順を含む既存テストを変えずに通す」と書いたが、D4 の支配の除外を入れると、そのテストのマスター（`h-q` が `h-big`・`h-small` を支配）が除外で縮んで落ちた（solver-agent の報告。ユーザー承認で組み替え。plan D5 に例外を記載）。
- 提案: `.claude/rules/solver.md` に「候補を絞る処理（支配の除外など）を足すときは、既存テストの手作りのマスターが支配し合わない形かを先に確かめる。同点の順や総当たりとの一致を見るテストの候補は、支配し合わない形にする」を足す。

## 2026-10-29 長い測定は候補とケースを環境変数で絞り、ふるい分け（1 回）と上位（3 回）の 2 段で回すと半分で済む（機能024・区間D）
- 種別: 規律昇華
- 何が起きたか: 024 T3 の試作は全候補を 3 回ずつ測ると約 2.5 時間のところ、`PROTO_CANDIDATES`・`PROTO_CASES`・`PROTO_CRAFTED`・`PROTO_REPEATS` で絞り、2 段にして約 1 時間 45 分に抑えた（solver-agent の報告）。plan D2 の指示は「ふるい分けは各ケース 1 回、上位は各 3 回」だけで、所要の見込みを書いていなかった。
- 提案: `.claude/rules/solver.md` の測定の項に、試作の測定の進め方（環境変数で絞る・2 段で回す・所要の見込みを plan に書く）を足す。

## 2026-10-30 ui-design.md の「`components/ui/` は手で編集しない・web-agent は `ui/` を書かない」が、026 の決定（`ui/` のソースを直す）と食い違う（機能026・区間B）
- 種別: 矛盾是正
- 何が起きたか: `specs/026-design-system-alignment/decisions.md` Q97 は、MASTER.md と食い違う生成部品（Title のウェイト・Button の `outline`・オーバーレイの濃さ）を `components/ui/` のソースで直すと決めた。一方 `.claude/rules/ui-design.md` は「`ui/` は CLI 生成物で手で編集しない。追加・更新はメインが CLI で行い、web-agent は `ui/` を書かない」と定めており、026 の区間 D で `ui/` を誰が直すかが規則から決まらない。MASTER.md「Component Specs」冒頭の「生成物は手で編集しない」は 026 の AC-9 の節の追加とあわせて区間 D で直す（`screen-design.md` 6）。
- 提案: `.claude/rules/ui-design.md` の該当の項目を、「見た目はトークンで変える。トークンで変えられないものは MASTER.md『生成部品（`components/ui`）の扱い』に列挙したうえでソースを直す。CLI で上書きしたら列挙したものを直し直す」に改め、`ui/` のソースの手直しを担当するワーカー（web-agent に許すか、メインの直接修正にするか）を明記する。

## 2026-10-30 作成の catch が DataIntegrityViolationException をすべて 409 にするため、DB が拒否した値が「ID の衝突」に化ける（機能013・区間C）
- 種別: 規律昇華
- 何が起きたか: 013 の区間 C の実測（`specs/013-user-weapon-save/plan.md` D1）で、構成名・武器の写しの名前に U+0000 を送ると、PostgreSQL の拒否（SQLState 22021・22P05）を `BuildService#create` の `catch (DataIntegrityViolationException e)` が拾い、409「Build id already exists」を返した。`CharmService#create` も同じ形で、013 の `WeaponService` もこれに倣う（plan D5）。U+0000 は plan D6 で DB に届かなくなるが、主キー違反以外の拒否（外部キー・CHECK・文字コード）が衝突に化ける構造は残る。
- 提案: `.claude/rules/api-spring.md` に「クライアント採番の ID の作成で主キー違反を 409 にするときは、`DataIntegrityViolationException` を丸ごと捕まえず、主キーの制約名（`pk_<table>_id`）か SQLState 23505 で主キー違反だけを 409 にする」を足す。`CharmService`・`BuildService`・`WeaponService` の catch を直す作業は別に切る。
