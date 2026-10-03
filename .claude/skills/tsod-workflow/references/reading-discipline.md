# 読み込みの規律（区間 A〜C）

大きいファイルを丸ごと読むと、メインの文脈が早く膨らみ、下流の判断の質が落ちる。必要な節だけを読む。

- `specs/open-questions.md`・要件定義書（`temp/initial-design.md`）・過去機能の `plan.md`／`tasks.md`・`specs/feature-map.md` は丸ごと読まない。Grep で位置を特定し、Read の `offset`／`limit` で該当する節だけを読む。
- Bash の grep 等が拒否・エラーになっても、全文の Read に切り替えない。Grep ツール（組込み）で位置を特定し直す。それも使えなければ、ユーザーに位置を尋ねる。
- 読んだ範囲は handoff に残さない（必要なら節見出しだけ）。
