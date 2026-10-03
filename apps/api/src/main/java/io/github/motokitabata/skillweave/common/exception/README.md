# common.exception

業務例外の置き場所（例: `CharmNotFoundException`）。

- 例外は `common.handler` の `@RestControllerAdvice` で `ProblemDetail` に変換する
- `contracts/components/responses/` のエラーレスポンスと対応させる
