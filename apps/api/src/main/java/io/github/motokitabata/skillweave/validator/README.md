# validator

カスタム Bean Validation（`@Constraint` の実装）の置き場所。

- `jakarta.validation` の標準アノテーションで表せないルール（相関チェック、複数の規則をまとめた方針）だけをここに置く
- アノテーションと `*Validator` を対で置く
