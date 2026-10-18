---
paths:
  - apps/web/src/main/**
  - design-system/**
---

# UI のデザインシステムの要点（`apps/web/src/main/`）

正は `design-system/skillweave/MASTER.md`。画面ごとの上書きとして `design-system/skillweave/pages/<page>.md` があれば、その画面については MASTER.md より優先する。本ファイルは値・規約を再掲せず、実装・レビュー時に正へ辿るための要点だけを示す。

- フォントサイズ・色などの値の正は MASTER.md にある。本ファイルには値を書かず、`.vue` の実装・レビュー時にここから正へ辿れるようにする。
- UI コンポーネントは shadcn-vue + Reka UI を用いる（`CLAUDE.md` の憲法を参照）。
- `apps/web/src/main/components/ui/` は shadcn-vue の CLI 生成物で、**手で編集しない**。追加・更新は、宣言駆動の例外としてメインが CLI で行う（web-agent の書込許可 `apps/web/src/main/**` は `ui/` を含むが、web-agent は `ui/` を書かない）。
- `reviewer-agent` は `.vue` 差分の文字サイズのクラスを MASTER.md の「Typography」節の「Type Scale」と、色の直書きを「Color Palette」節と突合する。許容値の一覧は MASTER.md に任せ、本ファイルに重複して書かない。
- 画面設計（`/tsod-screen-table` の画面設計の工程）で標準を読むときも、MASTER.md（と、あれば `pages/<page>.md`）を直接参照する。
- 表の見出しセル（`<th scope="col">`）の書き方は `web-vue.md` の「Sonar で繰り返し出たルールの避け方（web）」節を参照する。
