// `/api/*` だけがここに来る（wrangler.jsonc の run_worker_first）。それ以外は静的ファイルとして配信される。
// API を接続するまでは 503 を返す。Web は 401 以外の失敗を「取得できない」として扱う（lib/api/auth.ts）。
export default {
  fetch(): Response {
    return Response.json(
      { title: 'Service Unavailable', status: 503 },
      { status: 503, headers: { 'Content-Type': 'application/problem+json' } },
    )
  },
}
