---
paths:
  - specs/**
---

# 薄仕様の直接編集（`specs/`）

区間コマンド（`/tsod-spec`・`/tsod-screen-table`・`/tsod-plan`・`/tsod-build`・`/tsod-ship`）の外で `specs/NNN-<slug>/spec.md` を直接編集する場合にも、以下の最小限の遵守事項を守る。規約本文の正は [`specs/README.md`](../../specs/README.md)。ここでは再定義しない。

- 必須6節を欠かさない: 目的／ユーザーストーリー・受入基準（EARS）・スコープ外・契約差分・影響範囲・依存する機能ID。
- 影響範囲節は新書式（`触る領域:` 行と `常時許可外の変更予定:` の小見出し。該当が無ければ「なし」と明記する。1行1パス・glob 不可）で書く。定義の正は `.claude/skills/impact-scope/SKILL.md`。書いたら `node .claude/skills/tsod-spec-check/scripts/spec-check.mjs <spec.md>` で確かめる。
- **`specs/open-questions.md` の運用（正はここ）**:
  - 置くのは未解消の項目だけ。解消したら、対象機能の `specs/NNN-<slug>/decisions.md` へ Q 番号と本文のまま移し、`open-questions.md` から削除する。
  - Q 番号は永久欠番（再利用しない）。次の番号は `open-questions.md` の冒頭に書く。
  - `specs/open-questions.md` は、最初の未解消項目が出たときにメインが作る（それまでは存在しない予約の場所）。
  - どの区間で判明した未解決事項も追記してよい。書き手はメインだけ（ワーカーは報告し、メインが追記する）。
  - 正をここに置く理由は、`specs/**` に触れる文脈で必ずロードされるため。同じ運用は `specs/README.md`「要確認事項と決定記録」節にも書かれているので、そちらは節見出しで参照する。
