---
name: lessons-ledger
description: canon の配置時に tasks/lessons.md（教訓台帳）を照合・更新する。canon が生成時に記録した台帳のスナップショットと配置直前の台帳を突き合わせ（check）、一致すれば配置後に反映済みの項目だけを削除する（apply）。canon の配置手順で実行する。台帳が無いとき・反映済みの項目が0件のときは、何も消さずに正常終了する。
disable-model-invocation: true
argument-hint: "check|apply [--root <リポジトリ root>] [--accept-additions]"
effort: low
---

# lessons-ledger（教訓台帳の照合と反映済み項目の削除）

## 目的

反映済みの教訓の台帳（`tasks/lessons.md`）からの削除を、配置と同じ手順の中で決定論的に行う（手作業に依らない）。生成時点から配置時点までに台帳へ追記があれば止め、差分を人間に見せる。

## 何が記録されているか

- [reflection.json](./reflection.json): 反映した項目の見出しと反映先、および canon の生成の ts。
- [ledger-snapshot.txt](./ledger-snapshot.txt): canon が生成時に記録した、台帳の逐語コピー。

どちらも canon の生成物で、手で編集しない。台帳が生成時点で存在しなかったときは、`entries` が空の配列で、スナップショットは空になる。この場合、反映済みの項目は0件で、check も apply も台帳に触れない。

## 実行方法

```
node .claude/skills/lessons-ledger/scripts/lessons-ledger.mjs check --root <root>
node .claude/skills/lessons-ledger/scripts/lessons-ledger.mjs apply --root <root>
```

canon の配置手順で、配置前に（生成ツリーのスクリプトで）check、配置後に（配置したスクリプトで）apply の順に実行する。スクリプトは [scripts/lessons-ledger.mjs](./scripts/lessons-ledger.mjs)、回帰テストは [scripts/lessons-ledger.test.mjs](./scripts/lessons-ledger.test.mjs)。

## 台帳が無いとき・反映済みの項目が0件のとき

- 台帳（`<root>/tasks/lessons.md`）が存在しなくても、エラーにしない。反映済みの項目が0件なら、台帳が無いことは異常ではない。
- 反映済みの項目が0件（`entries` が空）のとき、check は「反映済み 0 件・未反映 0 件」と表示して終了コード 0 で終わる。apply は何も削除せず、台帳も書き換えずに終了コード 0 で終わる。台帳の中身（案内文や、対象側で追記した項目）は、スナップショットと違っていても止めない。
- 反映済みの項目があるのに台帳が無い場合は、全件が反映済みで台帳ごと消えた状態と同じ扱いにする（スナップショットの項目をすべて反映した結果と台帳が一致するとき）。それ以外は不一致として止める。

## 終了コード

- 0: 一致（未適用）・適用済み、または反映済みの項目が0件。
- 1: 台帳がスナップショットと違う（差分を表示する）。配置を止めて人間が判断する。
- 2: 実行不能（引数誤り、reflection.json の見出しがスナップショットに無い等）。

## `--accept-additions`（apply のみ）

人間が差分を見て「追記分を残したまま反映済み項目を消してよい」と判断したときだけ付ける。スナップショットにある項目が変更・削除されていないこと、差分が末尾への追記だけであることを確かめてから、反映済み項目だけを消す。

## 書込の範囲

書込むのは `<root>/tasks/lessons.md` だけである。実行の最後に「監査: `git diff --stat -- tasks/lessons.md` で、差分が反映済み N 件の削除だけであることを確かめる」の1行が出る。

## 使わない場面

TSOD の区間コマンドはこの Skill を使わない（台帳への追記は、メインが行う）。
