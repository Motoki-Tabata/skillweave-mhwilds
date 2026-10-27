# 読み込みの規律（区間 A〜E）

大きいファイルを丸ごと読むと、メインの文脈が早く膨らみ、下流の判断の質が落ちる。セッションの開始時に全文を読むと、持ち越す文脈の大半をそれが占める。必要な節だけを読む。

- `specs/open-questions.md`・要件定義書（`temp/initial-design.md`）・過去機能の `spec.md`／`decisions.md`／`handoff.md`／`plan.md`／`tasks.md`・`specs/feature-map.md`・`design/` 配下の大きな文書は丸ごと読まない。範囲指定の無い `cat` で読まず、Grep で位置を特定し、Read の `offset`／`limit` で該当する節だけを読む。
- 例外は、いま進めている機能の `handoff.md`。区間コマンドの開始時に全文を読む。
- Bash の grep 等が拒否・エラーになっても、全文の Read に切り替えない。Grep ツール（組込み）で位置を特定し直す。それも使えなければ、ユーザーに位置を尋ねる。
- 読んだ範囲は handoff に残さない（必要なら節見出しだけ）。
