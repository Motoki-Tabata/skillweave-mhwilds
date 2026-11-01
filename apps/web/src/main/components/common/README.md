# components/common

プロジェクト共通のコンポーネントの置き場所（ヘッダー、レイアウト、共通のフォーム部品など）。

- shadcn-vue の CLI が生成するプリミティブは `components/ui/` に置く（ここには置かない。`ui/` のソースを直してよいのは `design-system/skillweave/MASTER.md`「生成部品（`components/ui`）の扱い」に列挙したものだけ）
- 複数の画面から使う、`ui/` を合成したプロジェクト固有の部品をここに置く
