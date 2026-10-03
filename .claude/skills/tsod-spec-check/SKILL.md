---
name: tsod-spec-check
description: spec.md の数えられる条件（必須6節・受入基準5〜15個・分量・触る領域3つ以下・影響範囲の書式・常時許可外の妥当性）を決定論スクリプトで判定し、判定表をそのまま返す。plan.md との常時許可外の変更の突合（--compare-plan）も行う。ファイルは書かない。「薄仕様をチェックして」「spec.md の体裁を確認して」「受入基準の数を数えて」等のときに使う。
effort: low
---

# tsod-spec-check: 薄仕様の機械判定

`tsod-spec`（区間 A）と `tsod-plan`（区間 C）から呼ばれる、または単体で `specs/NNN-<slug>/spec.md` を指定して呼ばれる。**判定のみを行い、ファイルは一切書かない。**

薄仕様の必須6節は、`specs/README.md` の「`spec.md` の必須6節」の箇所を正とする。このスクリプトはその6節の在否と、「影響範囲」節の書式を機械で判定する。

## 判定項目（この列挙が正）

| # | 項目 | 条件 |
|---|---|---|
| 1 | 必須6節の在否 | 目的 / ユーザーストーリー・受入基準（EARS記法）・スコープ外・契約差分・影響範囲・依存する機能ID の6節がある |
| 2 | 受入基準5〜15個 | 受入基準の項目数が5以上15以下 |
| 3 | 分量（目安・150行以内） | spec.md の行数が150以下（目安であり厳密なページ数ではない） |
| 4 | 触る領域3つ以下・語彙適合 | `触る領域:` 行があり、語彙（`api`・`web`・`solver`・`data`・`contracts`・`docker`）に収まり、1〜3個 |
| 5 | 影響範囲の書式 | `常時許可外の変更予定:` 行があり、「なし」なら箇条書き0件、そうでなければ1行1パス（バッククォート囲みのリテラルパスがちょうど1個・glob 不可） |
| 6 | 常時許可外の妥当性 | 列挙されたパスが、どのワーカーの常設の書込フォルダ（`write-scopes.json`）にも含まれない |

語彙の正は `.claude/skills/impact-scope/SKILL.md` の「影響範囲節（spec.md）の定義」で、スクリプトの `AREA_VOCAB` はそれと一致させてある。意味判断を要する2条件（単独でデモできる縦切りか・1〜3日でマージ到達できるか）はここに含めない（`tsod-spec` の責務）。

## 実行方法

次を実行し（[scripts/spec-check.mjs](./scripts/spec-check.mjs)）、出力された判定表を**加工・要約せずそのまま**返す。自分で数え直したり判定を上書きしたりしない。

```
node .claude/skills/tsod-spec-check/scripts/spec-check.mjs <spec.md のパス>
```

## 終了コード

- 0: すべて OK。
- 1: NG あり。
- 2: 読込・解析不能（fail-closed。判定不能を OK と扱わない）。

## `--compare-plan <plan.md>` の用途（ゲート C-1）

```
node .claude/skills/tsod-spec-check/scripts/spec-check.mjs <spec.md のパス> --compare-plan <plan.md のパス>
```

plan にだけ現れる常時許可外の変更と、spec にだけ現れる変更予定を突き合わせる。`tsod-plan` がゲート C-1 の提示に用いる。plan.md に `## 常時許可外の変更` 節が無いときは判定不能として、終了コード 2 を返す。

回帰テストは `node --test .claude/skills/tsod-spec-check/scripts/spec-check.test.mjs`。
