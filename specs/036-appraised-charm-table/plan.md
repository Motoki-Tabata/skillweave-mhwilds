# 036 appraised-charm-table 計画

## スタック
- packages: TypeScript・Vitest・`yaml`。Web: Vitest・@playwright/test（Chromium）。版はすべて `design/tech-stack.md` の現行どおりで、依存は足さない。
- マスターデータ: `packages/data/dist/master-2026.10.5.*` を `2026.11.1` に上げて再生成する（D1）。MHDB のコミットは `c50a1eb` のまま。
- 出典の取得は `curl`、下書きの整形と名前→ID の変換は Node の使い捨てのスクリプト（scratchpad に置く。D2）で行う。どちらもリポジトリの依存にしない。

## データモデル
なし

## 決定事項

### 下書きと採用（区間 D の先頭。メイン）

- D1: マスターの版は `2026.11.1`（`config.ts` の `MASTER_VERSION`。data-agent が上げる）。既存の版の付け方（`YYYY.MM.N`、月が替われば N を 1 に戻す）に従う。`dist.spec.ts` の版を直書きしたテスト（`2026.10.5` の 3 か所）も追従する。
- D2: 作業ファイルの置き場は `packages/data/.cache/appraised-charm/`（`.gitignore` の `packages/data/.cache/` で既に無視される。セッションをまたいで残るので、オーナーの確認が後日になっても下書きを失わない）。構成は次のとおり。
  - `html/<サイト>-<YYYYMMDD>.html`: 取得した HTML の全文（例: `html/gamerch-20261116.html`）
  - `owned/charms.md`: オーナーの手持ちの鑑定護石（D5）
  - `draft/table.md`・`draft/conflicts.md`: 下書きと食い違いの記録（D4）
  - `out/appraised-charm.yaml`・`out/owned-charms.json`: 変換の結果（D7）
  - スクリプト（HTML から表を抜き出す・名前を ID に直す）は、lint の対象（`eslint .` は `.cache` も見る）に入らないよう、`.cache` ではなくメインの scratchpad に置く。使い捨てで、必要なら作り直す。
  - どれもコミットしない（AC-10）。`.gitignore` は変えない。
- D3: 取得の対象は次の 5 ページ。各ページを `curl` で 1 回ずつ手で取得し（汎用の User-Agent。繰り返しの自動取得はしない）、HTML の全文を `html/` に保存する。要約や切り詰めのある取得手段（WebFetch 等）では読まない（decisions.md Q170）。Phantom Brawlers は取得しない（AC-10）。
  - gamerch `https://gamerch.com/mhwilds/937094`
  - mhw-blog `https://www.mhw-blog.com/mh-wilds-kamiohma-goseki-skill-slot-list/`
  - nettoge `https://nettoge.com/mhwilds-talisman-patterns-simulator/`（群の中身は対話式で、HTML に無ければ「群の中身なし」として扱う）
  - Monster Hunter HQ `https://monsterhunterhq.com/gaming/monster-hunter-wilds-complete-appraised-talismans-guide/`
  - Monster Hunter Wiki `https://monsterhunterwiki.org/wiki/MHWilds/Talismans`（表が無ければ「表なし」と記録する）
  - 表の抜き出しは scratchpad のスクリプトで HTML から機械的に行い、抜き出した件数（群ごとの件数・パターン数）を HTML の見た目と突き合わせる。取得日と、各ページの最終更新日（HTML にあれば）を控える（AC-7）。
- D4: 下書き `draft/table.md` は日本語のスキル名で書く。中身は、群 A〜J の（スキル名, レベル）の一覧、レア5〜8 のパターン（スキル1〜3 の群。枠なしは `ー`）、パターンごとのスロットの並び。英語の出典（MHHQ）のスキル名は、ja・en の辞書（現行の `dist/` の 2026.10.5）の ID を介して日本語に直して比べる。mhw-blog の群の番号 (1)〜(10) は、中身の一致で A〜J に対応させ、対応表を `draft/conflicts.md` に書く。
  - 食い違いは decisions.md Q171 の順で解く。①手持ちの護石（D5）で裏付けられた側、②裏付けが無ければ、その項目を載せているサイトのうち多数が一致する側（項目を載せていないサイトは数えない）、③同数なら和集合。
  - `draft/conflicts.md` に、食い違った項目ごとに、各サイトの値・採った値・採った規則（①〜③）を書く。②③で採った項目は AC-7 の「未検証の箇所」になる。
  - Q171 の手順でも解けないレア度（例: どのサイトもそのレア度のパターンを載せていない）だけを表から外し、理由を `draft/conflicts.md` に書く（decisions.md Q172）。
  - 実例の当てはめ（`temp/appraised-charm-table.md` §3）: レア6 は gamerch・nettoge が 7 件、mhw-blog が 6 件なので、手持ちの裏付けが無ければ ② で 7 件側を採る。レア7 B-A-G のスロットは gamerch 3 種・mhw-blog 4 種で、MHHQ・nettoge が載せていなければ同数なので ③ で 4 種（②① を含む）を採る。
- D5: オーナーの手持ちの鑑定護石は、下書きの前にオーナーが `owned/charms.md` に書く（または会話に貼り、メインが書き写す）。1 行 1 件で、レア度・スキル1〜3 の名前と Lv（ゲームの表示順のまま）・スロットの並び（`[1]①①` の記法）を書く。目安は表に入れるレア度ごとに 3 件以上で、満たないレア度も表には入れる（decisions.md Q176）。
- D6: 採用の判断（T2）。メインは `draft/table.md` と `draft/conflicts.md` のパス、群ごとの件数・パターン数・外したレア度の要約、手持ちの護石を下書きに照らした結果（全件がどれかのパターンに合うか。合わない護石の一覧）を示して、AskUserQuestion で採用を問う。
  - 採用しないときは区間 D を止め、handoff の「要確認事項」に理由を書いて、出典の扱いの決め直しを案内する（decisions.md Q170）。T3 以降へ進まない。
  - 下書きの修正を求められたら、`draft/` を直して同じ問いを繰り返す。
- D7: 変換（T2 の採用の後）。scratchpad のスクリプトで、`draft/table.md` と `owned/charms.md` の日本語のスキル名を、現行の ja の辞書（`dist/master-2026.10.5.ja.json`）で `sk:` の ID に直す（decisions.md Q175）。
  - 対象は `MasterSkill.kind` が `weapon`・`armor` のスキルに限り、名前が完全一致する 1 件を採る。見つからない名前・2 件以上に当たる名前があれば、その名前の一覧を示して止め、オーナーに表記を確かめてもらう（`draft/` を直して変換し直す）。
  - 出力は `out/appraised-charm.yaml`（D8 の形のまま overlay に置ける YAML）と `out/owned-charms.json`（`[{ rarity, skills: [{ skillId, level, name }], slots: [{ target, level }] }]`）。変換したスキルの最大 Lv を超えるレベルがあれば止める（出力前の検証でも落ちるが、先に気づくため）。

### マスターデータ（packages/data。data-agent）

- D8: overlay は新しいファイル `overlays/appraised-charm.yaml` の最上位キー `appraisedCharm` に書く（AC-1）。中身は T2 の `out/appraised-charm.yaml` をそのまま置き、data-agent は形と注記だけを整える（表の中身を変えない）。形は次のとおり。
  - `groups` は A→J の順。群の中のスキルは下書きの並びのまま。1 行に 1 件を flow の形で書き、行末に ja のスキル名のコメントを付ける（AC-2。`categories.yaml` と同じ注記）。ID は `sk:` を含むので引用符で囲む。実データに当てはめた例:
    - `- { skillId: 'sk:1', level: 1 } # 攻撃`
    - `- { skillId: 'sk:-2096489472', level: 2 } # 見切り`
    - `- { skillId: 'sk:-857543744', level: 1 } # ボマー`
  - `patterns` はレア度の昇順、同じレア度の中は下書きの並び。`skillGroups` は常に長さ 3 で、枠なしは `null`（例: レア5 A-G-ー → `[A, G, null]`）。`slotPatterns` はスロットの並びの配列で、1 つの並びを 1 行の flow で書く（例: レア8 の `[1]①①` → `- [{ target: weapon, level: 1 }, { target: armor, level: 1 }, { target: armor, level: 1 }]`）。
  - ファイルの先頭のコメントに、出典の記録は `design/master-data.md` §10 にあることだけを書く（出典の詳細を YAML に重複させない）。
- D9: データのテスト（AC-2・AC-4）は `src/test/pipeline/dist.spec.ts` に足し、コミット済みの `dist/` の現行の版を読んで次を確かめる。
  - パターンのレア度がすべて 5〜8 で、パターンが 1 件以上ある。
  - パターンの `skillGroups` の非 null の名前がすべて `groups` にある。
  - 群のスキルのレベルが 1 以上、そのスキルの `maxLevel` 以下。
  - レア5〜7 のスロットの並びに `target: weapon` が無い。レア8 のスロットの並びは、すべて 1 枠目が `{ target: weapon, level: 1 }` で、2 枠目以降に `weapon` が無い。
  - AC-2: `overlays/appraised-charm.yaml` の本文を読み、`skillId` を含む行がすべて `# <名前>` で終わり、その名前が ja の辞書のそのスキルの名前と一致する。
- D10: `dist/` の再生成（T5）は生成物なのでワーカーの書込許可に無く、data-agent の実装の後にメインが `pnpm --filter @swv/data run generate` で行う。生成のコマンドが `2026.10.5` の 3 ファイルを削除する。再生成の後に次を確かめる。
  - `pnpm --filter @swv/data run generate:check` が一致し、`pnpm --filter @swv/data run test:unit` が通る。
  - AC-3: `git show` で HEAD から取り出した `master-2026.10.5` の 3 ファイルと新しい 3 ファイルを、版の値と `appraisedCharm` を除いて比べ、一致すること。旧版は `dist/` から消えるので恒久のテストにせず、scratchpad の使い捨てのスクリプトで 1 回だけ行い、結果を D-1 の報告に書く。

### 設計文書（メイン）

- D11: `design/master-data.md` に新しい節「§10 鑑定護石の抽選テーブルの出典」を足す（AC-7）。§1〜§9 の番号は変えない。書く時期は T2 の採用の後・data-agent への委譲の前（T3）で、内容は T1・T2 の結果に依存する。
  - 読み比べたサイト（D3 の 5 ページ。Phantom Brawlers を外した理由も 1 行）、取得日、出典ごとの最終更新日、ゲームの版（「不明（取得日時点の最新と推定）」。手持ちの護石の入手時期で裏付けられれば併記）。
  - 未検証の箇所: D4 の ②・③ で採った項目と、手持ちの護石が 3 件に満たないレア度。
  - 外したレア度とその理由（無ければ「なし」）。
  - 表は overlay `overlays/appraised-charm.yaml` にあること。下書き・HTML・スクリプトはコミットしていないこと。
  - §6 の規則 `appraised-charm` の記述（レア度の範囲は検証しない）は変えない。レア度とスロットの検査は `dist.spec.ts` のテストで行う（D9）。

### Web（apps/web。web-agent）

- D12: 照合を実際のマスターで確かめる単体テストを、新しい `src/test/lib/charms/match.master.spec.ts` に置く（AC-5・AC-6）。マスターと ja の辞書は既存の `src/test/support/masterFixture.ts` の `bundle`・`dictionary` を使い、`nameOf` は辞書の名前を引く。
  - 手持ちの護石の fixture は新しい `src/test/support/ownedAppraisedCharms.ts` に、T2 の `out/owned-charms.json` を `CharmPayload[]` として書き写す。スキルの行には ja の名前をコメントで添える。スキルの並びはゲームの表示順のまま（照合は枠の順に群を照らすため）。
  - AC-5: fixture の全件で `matchCharm` が `{ status: 'pass' }` を返す。失敗時に分かるよう、`it.each` で 1 件ずつのテストにする。
  - AC-6: 表に入れたレア度ごとに、そのレア度のどのスロットの並びにも無い並び（例: 防具用 Lv3 ×3）を持つ護石を 1 件作り、`mismatch` を返すことを確かめる。5〜8 のうちパターンが無いレア度には、`unchecked` を返すことを確かめる（外したレア度が無ければ、この確認は空になる）。期待するレア度の集合はマスターから求めず、T2 の採用の結果を固定値で書く（外したレア度の取り違えを検出するため）。
- D13: AC-8 のため、web-agent は `src/main/**` を変えない。D-1 の前に、メインが `git diff --stat <区間 D の開始コミット>..HEAD -- apps/web/src/main` が空であることを確かめる。

### E2E（apps/web/e2e。e2e-agent）

- D14: 表に合う護石を登録する形ではなく、テーブル不一致の確認を経て登録する形に追従する（AC-9）。理由: 既存の E2E の護石（スキル 1 つ・防具用 Lv3 ×3）は、表のどのレア度でも不一致になる見込み（レア8 は 1 枠目が武器用、レア5〜7 に ③③③ は無い）で、表に合う護石に変えると一覧の文言の期待値も変わり、表に入れたレア度に依存する。確認を経る形なら、外したレア度（「未検査」）にも同じ手順で通る。
  - `e2e/support/charms.ts` に、`登録` を押した後に「登録のトースト」か「確認のチェックボックス（`テーブルに合わないことを確認しました`）」のどちらかが出るのを `or` で待ち、チェックボックスが出ていればチェックして `登録` を押し直す補助を足す。`registerCharm` はこれを使う。
  - `charm-input.spec.ts` の手書きの登録の手順も、同じ補助に置き換える。一覧の文言（`防具用 Lv3・防具用 Lv3・防具用 Lv3` 等）の期待値は変えない。
  - `charm-save.spec.ts`・`guest-draft-import.spec.ts` は `registerCharm` の追従だけで通る見込み。`charm-ocr.spec.ts` は既に確認を経る分岐を持つので変えない（通ることだけ確かめる）。
  - E2E の実行は、T5 で `dist/` が `2026.11.1` になった後に行う。

### 進め方

- D15: 委譲の順は T1 → T7 の直列にする。途中の検証の失敗を次のとおり想定内として報告させる。
  - T4（data-agent）: `dist.spec.ts` の失敗（`master-2026.11.1.json` が無い。T5 で解消）と、`generate:check` の「dist/ が再生成の結果と一致しません」（overlay のエラーと検証の違反が 0 件で、出力の比較で落ちる失敗だけが想定内。T5 で解消）。data-agent は `generate`（`dist/` を書く）を実行しない。
  - T6 以降は、T5 の後なので想定内の失敗は無い。
- D16: AC-10 の確認は D-1 の前にメインが行う。`git ls-files packages/data/.cache` が空であること、区間 D の差分に HTML・下書き・スクリプトが無いことを確かめる。
- D17: `design/master-data.md` は T3 で書く（D11。T2 の結果に依存するため、他の常時許可外の変更より後になるが、data-agent への委譲より前）。`packages/data/dist/` は data-agent の実装の後の T5 で書く（D10）。

## 常時許可外の変更
- `design/master-data.md`（§10 に抽選テーブルの出典・取得日・ゲームの版・未検証の箇所・外したレア度を足す。担当: メイン。時期: T3。理由: D11）
- `packages/data/dist/master-2026.11.1.json`（生成物。生成のコマンドで書く。担当: メイン。時期: T5。理由: D10）
- `packages/data/dist/master-2026.11.1.ja.json`（同上の ja の辞書。担当: メイン。時期: T5。理由: D10）
- `packages/data/dist/master-2026.11.1.en.json`（同上の en の辞書。担当: メイン。時期: T5。理由: D10）
- `packages/data/dist/master-2026.10.5.json`（旧版。生成のコマンドが削除する。担当: メイン。時期: T5。理由: D10）
- `packages/data/dist/master-2026.10.5.ja.json`（旧版の ja の辞書。同上。担当: メイン。時期: T5）
- `packages/data/dist/master-2026.10.5.en.json`（旧版の en の辞書。同上。担当: メイン。時期: T5）
