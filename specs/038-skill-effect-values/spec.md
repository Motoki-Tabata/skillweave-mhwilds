# 038: skill-effect-values

## 目的 / ユーザーストーリー
プレイヤーとして、会心撃【属性】・会心撃【特殊】・黒蝕竜の力のように、説明文に「上昇する」としか書かれていないスキルについても、効果の数値を説明文の後ろの補完で確かめたい。火力に効くものは、発動条件をオンにすれば火力の期待値に数えてほしい。開発者としては、023 element-damage（属性の期待値）の前提になる会心撃【属性】の倍率などの値と、023 の前提のゲーム仕様（decisions.md Q188）をマスターと設計文書に揃えたい。今のマスターは効果の数値の出典をゲーム内の説明文に限っている（006 decisions.md Q37）。そのため、説明文に数値が無いスキルは効果が空のままである。

用語:
- 対象の候補: decisions.md Q195 に列挙した、037 decisions.md Q187 の 9 種類に当たり、説明文に数値が無い効果を持つスキル。
- Web の情報源: MHDB とゲーム内の説明文の外にある、オーナーが採用を決めたサイト（decisions.md Q185）。
- 下書き: エージェントが Web の情報源から作る、スキルごとの値と出典の表。コミットしない。
- 補完: スキルの説明文の後ろに `effectsByLevel` から画面で作る「効果: 」で始まる文（007 screen-design.md §4）。

画面に出す値の出どころ: 補完と発動条件のトグルは、`packages/data` が生成する JSON（`effectsByLevel`・`conditions`）から、既存のコード（`apps/web/src/main/lib/skills/effectSummary.ts`・`stores/conditions.ts`）が作る。火力の数値は、同じ JSON からソルバー（`packages/solver/src/main/damage.ts`）が計算する。038 はどのコードも変えない。

## 受入基準（EARS記法）
- AC-1: THE system SHALL 対象の候補のうち、出典で値が定まった効果を `packages/data/overlays/effects.yaml` に書かなければならない。値は、エージェントが Web の情報源を `curl` で 1 ページずつ全文取得して作った下書きのうち、オーナーが確かめて採用したものに限らなければならない（decisions.md Q185）。出典の間の食い違いは decisions.md Q190 の順で解き、定まらない効果は空のままにしなければならない。
- AC-2: THE system SHALL decisions.md Q195 の対象外のスキルと、037 decisions.md Q187 で書かないとした値を、Web の値があっても書いてはならない。出典で武器種によって値が違うと分かった効果は、空のままにしなければならない（decisions.md Q196）。
- AC-3: WHERE 効果がヒット数・経過時間・回数などの積み重ねで段階的に強まる THE system SHALL 最大の段階の値だけを 1 つの発動条件の値として書き、条件の名前で最大の段階と分かるようにしなければならない。きっかけが質的に違う段階は条件を分け、既存の条件と同じきっかけには既存の条件を使わなければならない（decisions.md Q189）。
- AC-4: THE system SHALL Web 由来の値を持つスキルの `effects.yaml` の名前のコメントに `（Web）` を添え、冒頭のコメントの出典の記述を decisions.md Q185 の方針に改めなければならない（decisions.md Q186）。
- AC-5: WHEN 値を足したマスターを生成したとき THE system SHALL 版を 2026.11.2 から上げて `dist/` に現行の版だけを残さなければならない。2026.11.2 から変えてよいのは、対象の候補の `effectsByLevel`、足した発動条件（`conditions` と ja・en の辞書の条件の名前）、および AC-8 で直す属性値・状態異常値の加算だけで、それ以外の内容（ID・名前・読み・分類・既存の効果・抽選テーブル・防具など）を変えてはならない。
- AC-6: THE system SHALL 生成した実際のマスターについて、次を `packages/data` のテストで検証しなければならない。値を入れたスキルの全レベルが空でなく、代表の値が採用した値と一致する（代表は区間 C で決める）。対象の候補の各スキルは、効果を持つか、理由（出典で定まらない・武器種で違う、など）を添えた「空のまま」の一覧にある。対象外のスキルは効果を持たない。
- AC-7: THE system SHALL `design/master-data.md` の §2 と §8 を decisions.md Q185 の方針に改め、効果の数値の出典の節を足さなければならない。この節には、読み比べたサイト、取得日、出典ごとの最終更新日、ゲームの版、スキルごとの出典、未検証の箇所（多数決で採った値）、武器種で違うため入れなかった値（武器種ごとの値を含む）を記録しなければならない（decisions.md Q186・Q190・Q196）。
- AC-8: THE system SHALL 023 の前提の 4 つの事実を確かめ、出典と合わせて `design/master-data.md` §9 に記録しなければならない（decisions.md Q188）。4 つは、説明文の属性値の単位・会心撃【属性】が無いときの属性の会心倍率・負会心が属性に効くか・会心撃【特殊】の倍率である。定まらない事実は「未確定」と書かなければならない。IF 説明文の属性値・状態異常値の単位が表示値でないと分かったなら THEN システムは、`effects.yaml` の該当の加算の値を直さなければならない（037 decisions.md Q193）。
- AC-9: THE system SHALL 画面・ソルバー・API・契約のコードを変えてはならない。Web 由来の値は、補完と発動条件のトグルに既存の書式のまま出さなければならない。出典の区別を画面に示してはならない（decisions.md Q191）。
- AC-10: WHEN 値を入れたマスターで検索の時間を測るとき THE system SHALL `design/tech-stack.md` の既存の測り方（実データ・発動条件はすべてオン・`pnpm --filter @swv/web run measure --workers=1`）で測り、結果を `design/tech-stack.md` に記録しなければならない。IF 火力の最大化の検索 1 回の合計時間の最大が 3 秒を超えたなら THEN システムは、区間 D を止めて報告しなければならない（006 decisions.md Q36）。
- AC-11: THE system SHALL 取得したサイトの HTML と下書きをリポジトリにコミットしてはならない。取得の対象から Phantom Brawlers を外さなければならない（decisions.md Q185・Q186）。

## スコープ外
- 効果に武器種の区別を足すことと、連撃など武器種で値が違う効果の値（decisions.md Q196。区間 E で `/tsod-discover` により起票する）
- 037 decisions.md Q187 の 9 種類に当たらない値（攻撃の種類・部位・斬れ味で範囲を限る倍率、追加ダメージ、オトモ、被ダメージの軽減、行動の数値。Q194）
- 値がビルドの他の値で決まる効果（耐性変換【水】【雷】。decisions.md Q189）
- 段階の途中の値と、発動率の扱い（006 decisions.md Q39）
- 出典の区別を画面に示すことと、マスターの型に出典の項目を足すこと（decisions.md Q191）
- 属性値・属性の会心倍率の火力の計算（023 element-damage）。038 は 023 の前提の事実を記録するだけで、023 decisions.md Q40・Q184 は直さない
- ソルバーの性能の改善（AC-10 で目標を超えたら止めて別に扱う）
- Web の情報源の定期的な取得や更新と、取得のスクリプトのパイプラインへの組み込み

## 契約差分
- なし（API は効果を持たない。マスターは静的配信の JSON で、保存済みの構成の `masterVersion` の形も変えない）

## 影響範囲
触る領域: data
常時許可外の変更予定:
- `design/master-data.md`（§2・§8 の出典の方針を改め、効果の数値の出典の節を足し、§9 に 023 の前提の事実を記録する）
- `design/tech-stack.md`（値を入れたマスターでの検索の時間の測定の結果を記録する）
- `packages/data/dist/master-2026.11.3.json`（生成物。効果を足すため、版を上げて生成のコマンドで書く。版の値は plan で決める）
- `packages/data/dist/master-2026.11.3.ja.json`（生成物の ja の辞書。同上）
- `packages/data/dist/master-2026.11.3.en.json`（生成物の en の辞書。同上）
- `packages/data/dist/master-2026.11.2.json`（旧版。生成のコマンドが削除する）
- `packages/data/dist/master-2026.11.2.ja.json`（旧版の ja の辞書。同上）
- `packages/data/dist/master-2026.11.2.en.json`（旧版の en の辞書。同上）

## 依存する機能ID
- 006
- 007
- 037
