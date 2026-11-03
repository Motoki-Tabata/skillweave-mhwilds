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


## 2026-11-02 @MockitoSpyBean の Spring Data リポジトリでは callRealMethod が使えず、楽観ロックの競合テストの作り方が規約に無い（機能029・区間D）
- 種別: 規律昇華
- 何が起きたか: plan D1 の主案（`doAnswer` で `saveAndFlush` の直前に `version` を進めて `callRealMethod()`）は、リポジトリがインターフェースのプロキシのため `Cannot call abstract real method on java object!` で動かなかった。レビューで、detach 済みの実体を finder から取り、jdbc で `version` を進め、finder を `doReturn(Optional.of(古い実体))` で差し替える形なら本物の楽観ロックの失敗を起こせると分かった（078c7c5）。
- 提案: `.claude/rules/api-spring.md` に、楽観ロックの競合は `doThrow` で模擬せず、finder 差し替えで本物の失敗を起こす（`callRealMethod` は使えない）、と足す（経路 (a)）。直す前に `.claude/**` の同じ文面を grep する。

## 2026-11-02 apps/web/tsconfig.e2e.json に DOM 型が無く、evaluate 内のブラウザ API で e2e 全体が起動しない（機能029・区間D）
- 種別: 規律昇華
- 何が起きたか: `locator.evaluate` の中で `window`・`getComputedStyle` を使うと `vue-tsc` が落ち、webServer が exit 2 で起動せず e2e が全件走らない。029 の `md-outline-hover.spec.ts` は `globalThis` を最小の型にキャストして回避した。
- 提案: `.claude/rules/web-vue.md` の E2E の節に、`evaluate` 内でブラウザ API を使うときは最小の型で受ける（`tsconfig.e2e.json` に DOM 型は無い）と足す。型の置き場を `e2e/support/` の補助にするか `lib: ["DOM"]` を足すかは、次に必要になった機能で決める。

## 2026-11-02 MASTER.md の「小見出し（刻印風）」が実装に1か所も無く、既存の h3 と標準が食い違っている（機能022・区間B）
- 種別: 矛盾是正
- 何が起きたか: `design-system/skillweave/MASTER.md`「小見出し（刻印風）」は角と線の付いた形を定めるが、`apps/web/src/main` に実装は無く、既存の h3（`RequiredSkillsCard.vue`・`SkillDialog.vue` のフッター・`ExcludeCard.vue`）は `text-xs font-bold` の文字だけである。026 の整合でも対象にならなかった。022 の画面設計は分類の見出しに標準の形を採ったので、同じダイアログのフッターの h3 と形が違う状態になる。
- 提案: 既存の h3 を標準の形へ揃えるか、MASTER.md の節を「区切りが要る一覧の見出しだけに使う」と狭めるかを決める（行き先: `design-system/skillweave/MASTER.md`「小見出し（刻印風）」、揃えるなら別の機能として起票する）。022 ではどちらも変えない。

## 2026-11-02 Playwright の `hasNot` と `pressed: false` のロケーターで E2E の期待が空振りした（機能022・区間D）
- 種別: 規律昇華
- 何が起きたか: `locator.filter({ hasNot })` に `dialog.getByRole(...)` のような親起点のロケーターを渡すと、要素の内側を起点に探されて何も除外されなかった。`getByRole('button', { pressed: false }).first()` を変数に持つと、クリック後に別のボタンへ解決し直された。どちらも `apps/web/e2e/skill-category.spec.ts` の初回の実行で落ちて分かった（e2e-agent の完了報告）。
- 提案: `.claude/rules/web-vue.md` の E2E の項に、`hasNot` には `page` 起点のロケーターを渡す、状態で絞ったロケーターはクリック後の確認に使い回さない、の2行を足す。

## 2026-11-03 未登録のビルドスクリプトを持つ依存があると、allowBuilds がマップ形式でも pnpm add が pnpm-workspace.yaml を書き足す（公開作業・区間外）
- 種別: 規律昇華
- 何が起きたか: wrangler 4.153.0 を `pnpm add` したとき、`allowBuilds` が正しいマップ形式でも、ビルドスクリプトを持つ未登録の依存（`esbuild`・`workerd`）について、pnpm が `pnpm-workspace.yaml` に `set this to true or false` を書き足した。`pnpm-workspace.md` の「`allowBuilds` はマップ形式」節は、リスト形式で書いたときの現象としてしか書いていない。確認して両方を `false` にした（PR #82）。
- 提案: `.claude/rules/pnpm-workspace.md` の「`allowBuilds` はマップ形式」節に、形式が正しくても、依存の追加で未登録のビルドスクリプトを持つ依存が入ると書き足されることがある、と足す。`pnpm add` の後に `git diff pnpm-workspace.yaml` で確かめ、`set this to true or false` が残っていれば、依存ごとに真偽を決める（経路 (a)）。

## 2026-11-03 test:e2e のビルドには OCR の測定ページが入るので、その後の dist はデプロイに使えない（公開作業・区間外）
- 種別: 規律昇華
- 何が起きたか: `apps/web/playwright.config.ts` の `webServer` は `SWV_OCR_MEASURE=1` でビルドし、`apps/web/vite.config.ts` がこのとき測定用のページ（`e2e/measure/charm-ocr/index.html`）を入力に足す。`pnpm --filter @swv/web run test:e2e` の後の `apps/web/dist` には、そのページが入っている。
- 提案: 公開の手順（Q88 で `design/` に記録する）に、デプロイの直前に `pnpm build` をやり直す、を入れる。`.claude/rules/web-vue.md` の E2E の項にも、`test:e2e` の後の `dist` は配備物でない、と足す（経路 (a)）。

## 2026-11-03 oauth2Login は接続元のアドレスを認証の詳細としてセッションの行に保存する（機能030・区間A）
- 種別: 規律昇華
- 何が起きたか: `OAuth2LoginAuthenticationFilter` が `WebAuthenticationDetails`（`remoteAddress` を含む）を認証に付けるので、Spring Session JDBC では `spring_session_attributes` の `SPRING_SECURITY_CONTEXT` に入る。一時テストで実際の行を確認した（`specs/030-privacy-notice/decisions.md` Q137）。「DB に書かない」は `users` だけを見ると誤り、`DiscordOAuth2UserService` のコメントも表示名について同じ誤りをしていた。
- 提案: `.claude/rules/api-spring.md` に、セッションへ入れる主体と認証の詳細はそのまま DB に直列化されるので、DB に何が残るかを述べるときはセッションの行も確かめる、と足す（経路 (a)）。

## 2026-11-03 配信経路が挿入するスクリプトは、リポジトリの検索では見つからない（公開作業・区間外）
- 種別: 規律昇華
- 何が起きたか: 030 は「アクセス解析を入れていない」を `apps/web` の検索で確かめて `/privacy` に書いたが、デプロイすると Cloudflare がビーコン（`static.cloudflareinsights.com/beacon.min.js`）を HTML に挿入し、ブラウザが `/cdn-cgi/rum` へ計測値を送った。`Accept: text/html` を付けない `curl` の応答には入らず、ブラウザの通信先を見て分かった。
- 提案: 外部への送信について表記するときは、配信経路を通した本番の画面で、ブラウザの通信先を確かめる、を行き先のルールに足す（行き先: `.claude/rules/web-vue.md`。経路 (a)）。

## 2026-11-03 ExternalTextLink のリンクは exact: true で探すと見つからない（機能032・区間D）
- 種別: 規律昇華
- 何が起きたか: e2e で `getByRole('link', { name, exact: true })` を使ったところ、`ExternalTextLink.vue` が末尾に sr-only の「（新しいタブで開く）」を付けるためアクセシブルネームが完全一致せず落ちた。部分一致に直して通った。
- 提案: `.claude/rules/web-vue.md` の Playwright の `exact: true` の注意に、`ExternalTextLink` のリンクは例外（アクセシブルネームに「（新しいタブで開く）」が付く）、と足す（経路 (a)）。直す前に `.claude/**` の同じ文面を grep する。

## 2026-11-03 apps/web/worker/** がどのワーカーの書込範囲にも入っていない（機能031・区間A）
- 種別: 矛盾是正
- 何が起きたか: `apps/web/worker/index.ts` は区間の外の作業（e342489）で足されたので、`.claude/skills/impact-scope/write-scopes.json` のどの役割にも入っていない。031 で転送のロジックをここに書くが、`direct-edit.md` はロジックをワーカーに直させると定めており、web-agent は書けない。Sonar の解析対象（`sonar-project.properties` の `sonar.sources`）と vitest の coverage にも入っていない。
- 提案: `write-scopes.json` の web-agent に `apps/web/worker/**` を足し、`impact-scope/SKILL.md` の表と web-agent の定義を合わせる（経路 (a)。区間 D の前に行う）。`sonar.sources` に `apps/web/worker` を足す（検査機構なので人間の明示指示を要する）。
