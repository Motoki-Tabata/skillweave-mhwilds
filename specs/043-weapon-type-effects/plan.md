# 043 weapon-type-effects 計画

## スタック
- packages・apps/web: TypeScript・Vitest・Vue 3・Playwright・`yaml`。版はすべて `design/tech-stack.md` の現行どおりで、依存は足さない。
- マスターデータ: `packages/data/dist/master-2026.11.3.*` を `2026.11.4` に上げて再生成する（D2）。MHDB のコミットは `c50a1eb` のまま。
- 出典の取得は `curl`、HTML からの表の抜き出しと下書きの整形は Node の使い捨てのスクリプト（メインの scratchpad に置く）で行う。どちらもリポジトリの依存にしない（038 plan D3 と同じ）。
- 検索の時間の測定は既存の `apps/web/e2e/measure/damage-ui.measure.ts`・`solver-ui.measure.ts` を変えずに使う。

## データモデル
なし

## 決定事項

### マスターの書式（packages/data。data-agent）

- D1: `Effect`（`packages/data/src/main/index.ts`）に任意の項目 `weaponTypes?: string[]`（MHDB の武器種 `MasterWeapon.weaponType` の値）を足す。省略は全武器種に効く。出力は既存の直列化（キーはコード順にそろう）のままで、`weaponTypes` を持たない効果の JSON は変わらない（AC-4）。配列の並びは overlay のまま出力し、整列も並びの検証もしない（画面は `WEAPON_TYPES` の順に並べ直す。D12）。overlay では、ゲーム内の順（大剣・太刀・片手剣・双剣・ハンマー・狩猟笛・ランス・ガンランス・スラッシュアックス・チャージアックス・操虫棍・ライトボウガン・ヘビィボウガン・弓）で書く。
  - 例（会心撃【属性】Lv3。値は §11 の下書きのもの。確定は T2）: `{ stat: element_crit_mul, value: 1.2, weaponTypes: [great-sword, hammer, hunting-horn, gunlance, switch-axe, charge-blade] }` と `{ stat: element_crit_mul, value: 1.15, weaponTypes: [long-sword, sword-shield, dual-blades, lance, insect-glaive, light-bowgun, heavy-bowgun, bow] }`。
- D2: マスターの版は `2026.11.4`（`config.ts` の `MASTER_VERSION`。data-agent が上げる）。`dist.spec.ts` の版の直書き（題名と 2 つの期待値）も追従する。web のテストのマスターのファイル名の直書き（`pwa/precache.spec.ts` 等）は合成の入力なので追従しない（038 plan D2 と同じ）。
- D3: `weaponTypes` の規則（AC-1）は `pipeline/effects.ts` に置き、overlay の読み込み（`overlay.ts`）と出力前の検証（`validate.ts` の規則 `skill-effects`）が共有する。武器種の集合は、そのときの `bundle.weapons` の `weaponType` の集合（2026.11.3 の実データで 14 種。D1 の例の値はすべて含まれる）。
  - 違反: 配列でない・空の配列・文字列でない要素・武器種の集合に無い要素（例: `long_sword`・`tachi`）・重複した要素（例: `[bow, bow]`）。overlay は既存の規則と同じく、ファイル名と行・桁を示して生成を失敗させる。`parseEffect` の許すキーに `weaponTypes` を足す。
- D4: 武器種の重なり（decisions.md Q200 で区間 C に残した問い）は違反にする。同じスキル・同じレベルの中で、`stat`・`element`・`conditionId` がすべて同じ 2 つの効果の武器種の集合（`weaponTypes` の省略は全武器種）が交わるとき、後の効果の位置を示して生成を失敗させ、出力前の検証でも `skill-effects` の違反にする。
  - 理由: 同じ武器種に同じ種類の効果が 2 つ数えられるのを防ぐ。2026.11.3 の実データには、同じレベルで `stat`・`element`・`conditionId` が同じ効果の組が 0 件（区間 C で確かめた）なので、既存の効果は違反にならない。
  - 例: 会心撃【属性】Lv3 の D1 の 2 つは交わらないので通る。`{ stat: attack_add, value: 5, conditionId: cd:burst_5_hits, weaponTypes: [bow] }` と `{ stat: attack_add, value: 8, conditionId: cd:burst_5_hits }` は弓で交わるので違反。`stat` か `conditionId` が違えば交わっても通る。
- D5: 新しい発動条件（AC-3・decisions.md Q202）。ID は既存の規則（スキルの発動中はそのスキルの en の名前の snake_case）に従う。既存の 24 条件に同じきっかけは無い（区間 C で確かめた）。採用した値から参照されない条件は書かない（参照の無い条件は生成が失敗するため）。

  | ID | ja | en | スキル | 書く効果 |
  |---|---|---|---|---|
  | `cd:burst_5_hits` | 連撃の5回継続以降 | Burst after 5 hits | 連撃（`Burst`） | 基礎攻撃力 `attack_add`・属性値 `element_add`（区別なし） |
  | `cd:coalescence` | 災禍転福の発動中 | Coalescence active | 災禍転福（`Coalescence`） | 属性値 `element_mul`・状態異常値 `status_mul`（どちらも区別なし） |

  - 連撃の説明文は「攻撃ヒット時…上昇 ５回継続で効果が強化される」（Lv1）・「５回継続以降の上昇効果が…強化される」（Lv2〜5）で、5 回継続以降が最大の段階である。1〜4 回の段階の値は書かない（AC-3）。
  - 会心撃【属性】は条件を付けない（038 plan D8 と同じく、会心時の倍率そのもの）。`element_crit_mul` で書く。
  - 値の単位は `design/master-data.md` §6・§8 の既存の規則に従う（属性値の加算はマスターの単位 = 表示値 ÷ 10。乗算と会心倍率は倍率）。
- D6: `overlays/effects.yaml`（AC-2・AC-3）。`draft/adopted.md`（D9）の値を、スキル ID の昇順の既存の並びに挿入して書き、既存のスキルの行は変えない。名前のコメントは `# <ja のスキル名>（Web）`。値の定まらないレベルで、どの武器種の組も書けないレベルは `- []` と書く。新しい条件は `conditions` の ID の昇順の位置に挿入する。冒頭のコメントに、`weaponTypes` の書き方（ゲーム内の順・省略は全武器種・同じ種類と条件の効果どうしで武器種を重ねない）を 1〜2 行足す。

### 下書きと採用（区間 D の先頭。メイン）

- D7: 作業ファイルの置き場は `packages/data/.cache/weapon-type-effects/`（`.gitignore` の `packages/data/.cache/` で既に無視される。038 の `skill-effects/` とは分ける）。どれもコミットしない（AC-2）。`.gitignore` は変えない。
  - `html/<サイト>/<ページの短い名前>-<YYYYMMDD>.html`: 取得した HTML の全文（038 の HTML は使わずに取り直す。decisions.md Q201）
  - `license.md`: 各サイトの規約の確認（038 の確認から変わっていないかだけを見る。038 plan D4）
  - `draft/values.md`: スキル・レベル・武器種の組ごとの各サイトの値と、採った値と規則
  - `draft/conflicts.md`: 食い違い・「約」の値・定まらない組
- D8: 取得は 038 plan D5 の候補のサイト（データマインの一次資料・Kiranico・Monster Hunter Wiki・Game8 en/ja・gamerch・Fextralife・GamerTW）の、対象の 3 件の個別のページと武器種別の表のあるページに限る。Phantom Brawlers は取得しない。各 URL を `curl` で 1 回ずつ順に取得する（汎用の User-Agent・間隔 3 秒以上・取り直しは 1 回まで）。要約や切り詰めのある取得手段（WebFetch 等）では読まない。取得日・各ページの最終更新日・ゲームの版を控える。
  - 食い違いは 038 decisions.md Q190 の順で解く（① データマインの一次資料。038 では Kiranico を一次資料として扱った ② 値を載せるサイトの多数 ③ 同数、または値を載せるのが一次資料でない 1 サイトだけなら入れない）。「約」の値しか無い組は入れない（decisions.md Q201）。組の単位は「スキル・レベル・武器種の集合・stat」。
- D9: 採用（T2）。メインは `license.md`・`draft/values.md`・`draft/conflicts.md` のパスと、入れる組の一覧・入れない組と理由・② で採った（未検証の）値・テストの代表（D10）を示して、AskUserQuestion で採用を問う。不採用なら区間 D を止め、handoff の「要確認事項」に理由を書く。採用後、data-agent に渡す値の表（スキル ID・Lv・効果の並び・条件・武器種・入れない組と理由）を `draft/adopted.md` に書く。data-agent はこの表だけを写す。

### データのテスト（data-agent）

- D10: 043 のテスト（AC-5）は `src/test/pipeline/dist.spec.ts` に新しい `describe`（043）として足し、コミット済みの `dist/` の現行の版を読む。期待値は `draft/adopted.md` から書き写す（実装の写しにしない）。
  - 代表（既定。T2 で確定）: 会心撃【属性】Lv3（条件なし・2 つの武器種の組）・災禍転福 Lv3（条件 `cd:coalescence`・`element_mul` と `status_mul`）・連撃 Lv5（条件 `cd:burst_5_hits`・`attack_add` と `element_add`・武器種の組）。各代表は `[ID, 名前, Lv, 効果の配列]` で、効果の並びと `weaponTypes` の並びまで `toEqual` で確かめる。空のままになったスキルの代表は持たない。
  - 対象の 3 件（ID と ja の名前を直書き）: 各スキルは、(a) `effectsByLevel` の長さが最大 Lv で、「空のレベル」の一覧（ID・Lv・理由）に無いレベルがすべて空でない、または (b) 理由を添えた「空のまま」の一覧にあって `effectsByLevel` が `[]`、のどちらか一方に当たる。
  - 武器種: 対象の 3 件の効果の `weaponTypes` の要素が実際の武器の武器種の集合に含まれる。対象の 3 件の外のスキルの効果は `weaponTypes` を持たない（AC-4 の「それ以外の内容を変えない」の一部を兼ねる）。
  - 新しい条件: 採用で参照された条件だけが `conditions` にあり、ja・en の辞書の名前が D5 の表と一致する。
- D11: 既存のテストの追従（data-agent）。
  - 006 受入基準 3 の `EXCLUDED` と 037 AC-6 の `EXCLUDED` から、効果を持つことになった連撃 `sk:565867136` を外す（外さないと「除外の一覧のスキルは効果を持たない」の確認で落ちる）。
  - 038 の「対象の候補は、全レベルが効果を持つか…」のテストは、対象の 3 件を 043 の describe へ移す（`KEPT_EMPTY` から外し、29 件の確認から 3 件を除く旨の一覧を置く）。038 の確認は全レベルが空でないことを求め、043 は値の定まらないレベルを空にしうるため。
  - 038 の「（Web）」のテストの `webIds` に、効果を持つことになった対象のスキルを足す。
  - `overlay.spec.ts`・`validate.spec.ts` に、D3・D4 の規則の違反と正常の場合のテストを足す（既存の fixtures の形で）。
- D12: data-agent の検証で想定内の失敗は、`dist.spec.ts` の版の確認と D10・D11 のうち `dist/` を読むテスト（`dist/` は T5 でメインが再生成するまで `2026.11.3` のまま）と、`generate:check` の「dist/ が再生成の結果と一致しません」（overlay のエラーと検証の違反が 0 件で、出力の比較だけで落ちるもの）だけ。data-agent は `generate` を実行しない（038 plan D14 と同じ）。

### 再生成（メイン）

- D13: `dist/` の再生成（T5）は、生成物なのでワーカーの書込許可に無く、data-agent の後にメインが `pnpm --filter @swv/data run generate` で行う。生成のコマンドが `2026.11.3` の 3 ファイルを削除する。再生成の後に次を確かめる。
  - `generate:check` が一致し、`pnpm --filter @swv/data run test:unit` が通る（D12 の想定内の失敗が解消する）。
  - AC-4: `git show` で HEAD から取り出した `master-2026.11.3` の 3 ファイルと新しい 3 ファイルを、版の値・対象の 3 件の `effectsByLevel`・足した条件（`conditions` の追加分と辞書の条件の名前の追加分）を除いて比べ、一致すること。scratchpad の使い捨てのスクリプトで 1 回だけ行い、結果を D-1 の報告に書く（038 plan D15 と同じ）。
  - AC-2: `git ls-files packages/data/.cache` が空で、区間 D の差分に HTML・下書き・スクリプトが無いこと。

### ソルバー（packages/solver。solver-agent）

- D14: 武器種の受け渡し（AC-6・AC-7）。
  - `DamageBase`（`damage.ts`）に任意の `weaponType?: string` を足す。省略は「武器種が分からない」で、`weaponTypes` を持つ効果を数えない（AC-7）。`evaluateDamage` の引数の形は変えない（Web は `DamageBase` に武器種を入れて渡す。D17）。
  - `isCounted(effect, active)` に第 3 引数 `weaponType: string | undefined` を足し、「条件が無いか有効」かつ「`weaponTypes` が無いか、`weaponType` を含む」を数える。`evaluateDamage` と `damageModel.ts` の `levelEffects` の両方がこれを通る（AC-6 の両方への当てはめを 1 か所の判定にそろえる）。
  - `ResolvedWeapon`（`validate.ts`）に `weaponType: string` を足す。マスターの武器はその武器の `weaponType`、個体差のある武器は `baseWeaponId` の武器の `weaponType`（`validateRequest` が基の武器の存在を既に確かめているので、ソルバーの中では常に分かる。decisions.md Q203）。`toBuild` の `evaluateDamage(master, weapon, …)` はこの `weaponType` をそのまま使う。
  - `damageTargets(master, request)` に第 3 引数 `weaponType: string` を足し、`relevantSkills`・`reduceCandidates`（`dominance.ts`）にも足して、`solveBuilds` の `validateRequest` の結果から渡す。候補の削減（支配の判定）とモデルの対象のスキルが、同じ武器種の絞り込みにそろう。逆引き（`reverseLookup`）は `feasible` で火力を使わないので、`buildModel` の呼び出しで `weapon.weaponType` が渡ることだけで足りる。
- D15: AC-8 は D14 の判定の後ろの既存の分岐（`attack_add`・`attack_mul`・`affinity_add`・`crit_mul` だけを数える）を変えないことで満たす。数える種類を足さない。
- D16: ソルバーのテスト（AC-6〜AC-8）。合成のマスター（`test/support/builders.ts`）で書く。
  - `evaluateDamage`: `weaponTypes` を持つ効果が、武器種を含むときだけ数えられる・含まないときと `weaponType` の省略（AC-7）では数えられない・`weaponTypes` を持たない効果は武器種によらず数えられる。属性値・状態異常値・属性の会心倍率の効果（`weaponTypes` の有無とも）は結果を変えない（AC-8）。
  - `solveBuilds`（`expectedDamage`）: 同じ必須スキルで、武器種だけが違う 2 本の武器（マスターの武器と、基の武器の武器種が違う個体差のある武器を含む）で、1 件目の構成と `score` が武器種に合った効果だけを数えた参照の計算と一致する。候補の削減の後でも総当たり（`bruteForce`）の最大と一致する。
  - 参照の実装の追従: `test/support/damageReference.ts` の `referenceDamage` に武器種の引数を足して同じ絞り込みを独立に書き、`bruteForce.ts`・`verifyBuild.ts` は要求の武器からマスターを引いて武器種を求める（ソルバーの関数を呼ばない）。これをしないと、実マスター（`solveBuilds.real.spec.ts`。発動条件をすべてオン）で連撃の攻撃力の数え方がずれる。
  - 既存の `solveBuilds.effectStats.spec.ts` は既存の 3 条件だけをオンにし、`base` に武器種を渡さないので、043 の値は効かない見込み。T6 の検証で確かめる。

### 画面（apps/web。web-agent）

- D17: 武器種の取り方（AC-10・decisions.md Q203・screen-design.md §3）。火力の材料の `DamageBase` に `weaponType` を入れる。補完の絞り込みもこの値を使い、火力と表示の武器種を 1 つの出どころにそろえる（handoff の要確認事項）。
  - 検索結果: `stores/search.ts` の `damageBase`（送信の写し・`submittedBasis`）に、解決済みの武器（`stores/conditions.ts` の `ResolvedWeapon.weaponType`。個体差のある武器は基の武器の武器種）を入れる。
  - 逆引きの候補: `stores/reverseLookup.ts` の `damageBase` に同じく入れる。
  - 保存した構成・共有した構成: `lib/solver/buildView.ts` で、マスターの武器は見つかった武器の `weaponType`、個体差のある武器は基の武器がマスターにあればその `weaponType`、無ければ `weaponType` を入れない（攻撃力と会心率は今までどおり計算に使い、`weaponTypes` を持つ効果は数えない。AC-7）。
- D18: 補完（AC-9・screen-design.md §2・§3）。
  - `lib/skills/effectSummary.ts` の `summarizeEffects` に任意の引数 `weaponType?: string` を足す。組の鍵を「発動条件と武器種の集合」にし（集合は要素で比べ、並びを問わない）、`weaponTypes` を持つ組の末尾（条件の（）の後ろ）に「［<略称>・…］」を付ける。略称は `constants/weaponTypes.ts` に足す関数（`shortName` を返し、定数に無い値はそのまま返す）で引き、`weaponTypeOrder` の順に並べる（定数に無い値は末尾）。
  - `weaponType` を渡したときは、`weaponTypes` を持たない効果をすべて残し、持つ効果はその武器種を含むものだけを残して［］にはその武器種 1 つを出す。残る効果が無ければ null（補完を出さない）。
  - `lib/skills/levelText.ts` の `skillLevelTexts` と `SkillLevelText.vue` に任意の `weaponType` を通す。`BuildCard.vue` は `damage?.base?.weaponType` を渡す（火力の節を出さない・武器が無い・武器種が分からないときは undefined で、絞らない）。`SkillPickerList.vue`（D2）は渡さない。「スキルの効果を表示（<N>）」の N は変えない。
- D19: Web のテスト（AC-9・AC-10）。
  - `effectSummary.spec.ts`: ［］の書式・ゲーム内の順への並べ直し・集合の同じ組の統合・条件の（）との順・定数に無い武器種・絞り込み（残る・消える・すべて消えて null）・`weaponTypes` を持たない効果の不変。
  - `BuildCard.spec.ts`: 武器種つきの `base` で火力が武器種に合った効果だけを数え、補完が［<その武器種>］だけになる。`damage` が null・`base` に武器種が無いときは絞らない。
  - `buildViewSaved.spec.ts`・`search.spec.ts`・`BuildCard.spec.ts` の `damageBase` の `toEqual`（`{ attack, affinity }` の直書き。区間 C で grep した 6 か所）を `weaponType` つきに追従する。基の武器がマスターに無い個体差のある武器で `weaponType` が無いことを足す。
- D20: E2E（AC-9・AC-10。e2e-agent）。実データの採用した値を使い、`apps/web/e2e/support/masterData.ts` から名前と値を引く（値を直書きしない）。
  - D2 スキルを選ぶダイアログで、採用した代表のスキル（既定は会心撃【属性】Lv3）の補完に 2 つの武器種の組の［］が出る。
  - そのスキルを必須にして、あるマスターの武器（既定は太刀）で検索した構成カードのスキルの効果に、その武器種の値と［太刀］だけが出る。
  - 代表のスキルが空のままになったときは、採用した対象のスキルで替える（T2 で決める）。

### 設計文書（メイン）

- D21: `design/master-data.md` を T3（T2 の採用の後・data-agent への委譲の前）で直す（AC-11）。
  - §6: 効果の箇条に `weaponTypes` の規則（D1・D3・D4）を足し、出力前の検証の `skill-effects` の箇条に同じ規則を足す。
  - §8: 「武器種で値が違う効果は入れない（…Q196）」と「属性の会心倍率・状態異常の会心倍率: …値は入れていない」を、043 で `weaponTypes` を使って入れた旨に改める（spec の AC-11 は §6・§11 を挙げるが、§8 の記述が古くなるため同じ時期に直す）。
  - §11: 043 の小節を足す。読み比べたサイト・取得日・最終更新日・ゲームの版・採った値と武器種の組・入れなかった組と理由・② で採った値。「武器種で値が違うため入れなかった値」の箇条は、043 で入れた旨に改める。
- D22: `design-system/skillweave/MASTER.md` の「スキルの説明と補完」節に、screen-design.md §6 の 2 項目をそのまま足す（T3。委譲の前）。

### 検索の時間（メイン）

- D23: AC-12 の測定は、既存の測り方（実データ・発動条件はすべてオン・`pnpm --filter @swv/web run measure --workers=1`。生産護石のオンとオフの両方）で、038 と同じく基準（T1 と並べて、区間 D の開始時のコード・`2026.11.3`）と再測定（全タスクの後。T9）の 2 回を同じ環境で測る。止める基準は spec AC-12 のとおり、再測定の `expectedDamage` の 1 件目までの時間の最大が 5 秒を超えたら区間 D を止めて報告する。
  - 記録: `design/tech-stack.md` に新しい節「ブラウザの Worker 上の expectedDamage の再測定（043 weapon-type-effects・<日付>）」を足し、038 の節と同じ表の形で 2 回の結果と結論を書く。書く時期は T9（測定の結果に依存するため委譲の前には書けない）。

### 進め方

- D24: 委譲の順は直列にする（solver・web・data・e2e はどれも pnpm workspace を検証するので並列にできない）。data-agent（T4）→ メインの再生成（T5）→ solver-agent（T6）→ web-agent（T7）→ e2e-agent（T8）。solver を再生成の後に置くのは、D16 の参照の実装の追従を実マスターのテストで確かめるため。web は solver の `DamageBase` の型に依存する。基準の測定（T1 の間）はメインの作業で、下書きの待ち時間に並べてよい。

## 常時許可外の変更
- `design/master-data.md`（§6 に weaponTypes の規則、§8 の武器種の記述の改め、§11 に 043 の出典の記録を足す。担当: メイン。時期: T3。理由: D21）
- `design/tech-stack.md`（043 の検索の時間の測定の節を足す。担当: メイン。時期: T9。理由: D23）
- `design-system/skillweave/MASTER.md`（スキルの説明と補完の節に武器種の括弧の書式と構成カードでの絞り込みを足す。担当: メイン。時期: T3。理由: D22）
- `packages/data/dist/master-2026.11.4.json`（生成物。生成のコマンドで書く。担当: メイン。時期: T5。理由: D13）
- `packages/data/dist/master-2026.11.4.ja.json`（同上の ja の辞書。担当: メイン。時期: T5。理由: D13）
- `packages/data/dist/master-2026.11.4.en.json`（同上の en の辞書。担当: メイン。時期: T5。理由: D13）
- `packages/data/dist/master-2026.11.3.json`（旧版。生成のコマンドが削除する。担当: メイン。時期: T5。理由: D13）
- `packages/data/dist/master-2026.11.3.ja.json`（旧版の ja の辞書。同上。担当: メイン。時期: T5）
- `packages/data/dist/master-2026.11.3.en.json`（旧版の en の辞書。同上。担当: メイン。時期: T5）
