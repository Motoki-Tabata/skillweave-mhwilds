# stores

Pinia のストアの置き場所。

- API の呼び出しは `lib/http.ts` の fetch ラッパーを通す（ストアから `fetch` を直接呼ばない）
- ストアが共有する、セットアップの中で呼ぶ関数も置く（例: `savedItems.ts` の `useSavedItems`）
