# repository（テスト）

main の `repository` パッケージのテストの置き場所。

- テストは検証対象の main クラスと同じパッケージに置く（配置の正は `.claude/skills/impact-scope/conventions.md`「テスト配置・命名規約」節）
- DB は H2 を使わず、`TestcontainersConfiguration` の PostgreSQL を `@Import` で使う
