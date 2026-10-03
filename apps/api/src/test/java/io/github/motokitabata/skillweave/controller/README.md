# controller（テスト）

main の `controller` パッケージのテストの置き場所。

- テストは検証対象の main クラスと同じパッケージに置く（配置の正は `.claude/skills/impact-scope/conventions.md`「テスト配置・命名規約」節）
- `@SpringBootTest(webEnvironment = RANDOM_PORT)` で `TestRestTemplate` を使うときは `@AutoConfigureTestRestTemplate` を付ける。エンコード済みのパスは `URI` で渡す（`.claude/rules/api-spring.md`）
