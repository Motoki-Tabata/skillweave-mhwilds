---
paths:
  - apps/web/src/main/**
---

# UI 設計標準の要点（`apps/web/src/main/`）

正は `design/ui-design-standard.md`。本ファイルは全文を再掲せず、実装・レビュー時に思い出すべき要点だけを示す。`web-agent`・`reviewer-agent`・`screen-design-agent`・`tsod-screen-table` はいずれも本ファイル経由で要点を得る（数値の正は `design/` 側の1箇所に集約し、二重管理しない）。

- フォントサイズ等の数値の正は `design/ui-design-standard.md` にある。本ファイルには数値を書かず、`.vue` 実装・レビュー時にここから正へ辿れるようにする。
- UI コンポーネントは shadcn-vue + Reka UI を用いる（`CLAUDE.md` の憲法を参照）。
- `apps/web/src/main/components/ui/` は shadcn-vue の CLI 生成物で、**手で編集しない**。shadcn-vue を導入する機能で作られる予約の場所である。追加・更新は、宣言駆動の例外としてメインが CLI で行う（web-agent の書込許可 `apps/web/src/main/**` は `ui/` を含むが、web-agent は `ui/` を書かない）。
- `reviewer-agent` は `.vue` 差分の `text-(xs|sm|base|lg|xl|2xl)` 等のクラスを抽出し、`design/ui-design-standard.md` の許容スケールと突合する。突合先は常に `design/ui-design-standard.md` とし、数値を本ファイルに重複して書かない。
- 画面設計（`/tsod-screen-table` の画面設計の工程）で標準を読み込む際も、要点はここを起点にし、詳細は `design/ui-design-standard.md` を直接参照する。
- 表の見出しセル（`<th scope="col">`）の書き方は `web-vue.md` の「Sonar で繰り返し出たルールの避け方（web）」節を参照する。
