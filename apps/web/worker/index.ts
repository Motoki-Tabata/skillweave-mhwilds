// `/api/*` だけがここに来る（wrangler.jsonc の run_worker_first）。それ以外は静的ファイルとして配信される。
// `/api/*` は Secret `API_ORIGIN` の上流へそのまま転送する。セッションの Cookie が無い `GET /api/auth/me` だけは、上流を起こさず 401 を返す。
export interface Env {
  API_ORIGIN?: string
}

const PROBLEM_JSON = 'application/problem+json'
const ME_PATH = '/api/auth/me'
const STRIPPED_HEADERS = new Set([
  'host',
  'forwarded',
  'x-real-ip',
  'cf-connecting-ip',
  'cf-connecting-ipv6',
])

function problem(
  body: Record<string, unknown>,
  status: number,
  extra: Record<string, string> = {},
): Response {
  return Response.json(body, { status, headers: { 'Content-Type': PROBLEM_JSON, ...extra } })
}

function resolveOrigin(raw: string | undefined): string | null {
  if (!raw || !URL.canParse(raw)) return null
  const url = new URL(raw)
  return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
}

function hasSessionCookie(cookie: string | null): boolean {
  if (!cookie) return false
  return cookie.split(';').some((part) => {
    const trimmed = part.trim()
    return trimmed.startsWith('SESSION=') && trimmed.length > 'SESSION='.length
  })
}

function upstreamHeaders(source: Headers): Headers {
  const headers = new Headers(source)
  const names = [...headers.keys()]
  for (const name of names) {
    if (STRIPPED_HEADERS.has(name) || name.startsWith('x-forwarded-')) headers.delete(name)
  }
  return headers
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = resolveOrigin(env.API_ORIGIN)
    if (!origin) return problem({ title: 'Service Unavailable', status: 503 }, 503)

    const url = new URL(request.url)
    if (
      request.method === 'GET' &&
      url.pathname === ME_PATH &&
      !hasSessionCookie(request.headers.get('Cookie'))
    ) {
      return problem(
        { type: 'about:blank', title: 'Unauthorized', status: 401, instance: ME_PATH },
        401,
        {
          'Cache-Control': 'no-store',
        },
      )
    }

    try {
      return await fetch(`${origin}${url.pathname}${url.search}`, {
        method: request.method,
        headers: upstreamHeaders(request.headers),
        body: request.body,
        redirect: 'manual',
      })
    } catch {
      return problem({ title: 'Bad Gateway', status: 502 }, 502)
    }
  },
}
