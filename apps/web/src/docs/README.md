# apps/web/src/docs

apps/web の内部の設計資料の置き場所（画面遷移図、状態管理の方針など）。

- API の定義書は置かない。契約の正は `contracts/`（リポジトリ直下）で、読める形の定義書も `contracts/dist/`（`pnpm contract:docs` の Redoc 版・`pnpm contract:swagger` の Swagger UI 版）に一本化する
- 業務ルール・受入基準は `specs/NNN-<slug>/spec.md`（薄仕様）に書く。ここは補足の設計資料だけを置く
