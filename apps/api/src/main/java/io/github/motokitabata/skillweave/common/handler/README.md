# common.handler

例外を HTTP レスポンスへ変換する `@RestControllerAdvice` の置き場所。

- `common/exception` の業務例外を `ProblemDetail`（RFC 9457）に変換する
- 変換の形は `contracts/components/responses/` のエラーレスポンスにそろえる
