# dto.request

リクエストボディの DTO の置き場所。

- `contracts/paths/<ドメイン>/*.yaml` の `requestBody` スキーマと 1:1 で対応させる
- バリデーションは `jakarta.validation` のアノテーションをフィールドに直接付ける
