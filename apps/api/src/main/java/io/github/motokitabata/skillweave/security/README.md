# security

Spring Security の部品（認証の入口・認可の判定・フィルタなど）の置き場所。

- Spring Security は認証の機能（009 discord-login）で導入する
- `SecurityFilterChain` などの登録は `config/` で行い、ここには部品の実装だけを置く
