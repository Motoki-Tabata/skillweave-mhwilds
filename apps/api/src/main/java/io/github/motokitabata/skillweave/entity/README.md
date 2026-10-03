# entity

JPA エンティティの置き場所。

- スキーマの正は Flyway のマイグレーション（`src/main/resources/db/migration/`）。`ddl-auto` は `none` で、エンティティからスキーマを作らない
- ユーザーデータの ID はクライアント採番の UUIDv7。サーバー側で採番しない
- 命名・型・監査カラムの規約は `design/data-model-standard.md` に従う
