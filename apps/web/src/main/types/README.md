# types

画面をまたいで使う型定義の置き場所。

- API のリクエスト・レスポンスの型は `lib/api/schema.ts`（`contracts/openapi.yaml` から生成）を使う。ここには置かない
- ソルバー・マスターデータの型は `@swv/solver`・`@swv/data` の公開 API から import する。ここに複製しない
- 画面・状態管理をまたぐ、Web 固有の型だけをここに置く
