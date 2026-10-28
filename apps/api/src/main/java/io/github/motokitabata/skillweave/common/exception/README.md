# common.exception

業務例外の置き場所。404 は `ResourceNotFoundException`、409 は `ResourceConflictException`。

- 例外に機能名を付けない。`detail` の文言は引数で渡し、機能ごとにサービスの定数に1か所だけ置く
- 例外は `common.handler` の `@RestControllerAdvice` で `ProblemDetail` に変換する
- `contracts/components/responses/` のエラーレスポンスと対応させる
