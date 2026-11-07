// `/api/*` だけがここに来る（wrangler.jsonc の run_worker_first）。それ以外は静的ファイルとして配信される。
// `/api/*` は Secret `API_ORIGIN` の上流へそのまま転送する。セッションの Cookie が無い `GET /api/auth/me` だけは、上流を起こさず 401 を返す。
// Secret `API_INVOKER_KEY`（サービスアカウントの鍵の JSON）があれば、ID トークンを取り（期限の 5 分前まで使い回す）、`X-Serverless-Authorization` で付ける。
export interface Env {
  API_ORIGIN?: string
  API_INVOKER_KEY?: string
}

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const REFRESH_MARGIN_MS = 300_000
let cached: { value: string; expiresAt: number } | null = null

const PROBLEM_JSON = 'application/problem+json'
const ME_PATH = '/api/auth/me'
const STRIPPED_HEADERS = new Set([
  'host',
  'forwarded',
  'x-real-ip',
  'cf-connecting-ip',
  'cf-connecting-ipv6',
  'x-serverless-authorization',
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

function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function b64urlText(text: string): string {
  return b64url(new TextEncoder().encode(text))
}

function isFilled(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

// 鍵の解析から署名まで。失敗は呼び出し側で 503 にする。
async function signAssertion(rawKey: string, audience: string): Promise<string> {
  const key: unknown = JSON.parse(rawKey)
  const { client_email: email, private_key: pem } = (key ?? {}) as Record<string, unknown>
  if (!isFilled(email) || !isFilled(pem)) throw new Error('invalid key')
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----|\s/g, '')
  const der = Uint8Array.from(atob(body), (c) => c.codePointAt(0)!)
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const iat = Math.floor(Date.now() / 1000)
  const header = b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64urlText(
    JSON.stringify({
      iss: email,
      sub: email,
      aud: TOKEN_ENDPOINT,
      target_audience: audience,
      iat,
      exp: iat + 3600,
    }),
  )
  const input = `${header}.${claims}`
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(input),
  )
  return `${input}.${b64url(new Uint8Array(sig))}`
}

// 交換の fetch から応答の解釈まで。失敗は呼び出し側で 502 にする。
async function exchangeToken(assertion: string): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) throw new Error('token endpoint failed')
  const json = (await res.json()) as { id_token?: unknown } | null
  if (!isFilled(json?.id_token)) throw new Error('no id_token')
  return json.id_token
}

function readExp(token: string): number | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1]!.replaceAll('-', '+').replaceAll('_', '/')
    const exp = (
      JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))) as { exp?: unknown }
    ).exp
    return typeof exp === 'number' && Number.isFinite(exp) ? exp : null
  } catch {
    return null
  }
}

// ID トークンを返す。取れなければ 503（鍵の誤り）か 502（交換の失敗）の応答を返す。
async function obtainIdToken(rawKey: string, audience: string): Promise<string | Response> {
  if (cached && Date.now() < cached.expiresAt * 1000 - REFRESH_MARGIN_MS) return cached.value
  let assertion: string
  try {
    assertion = await signAssertion(rawKey, audience)
  } catch {
    return problem({ title: 'Service Unavailable', status: 503 }, 503)
  }
  let token: string
  try {
    token = await exchangeToken(assertion)
  } catch {
    return problem({ title: 'Bad Gateway', status: 502 }, 502)
  }
  const exp = readExp(token)
  if (exp !== null) cached = { value: token, expiresAt: exp }
  return token
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

    const headers = upstreamHeaders(request.headers)
    if (env.API_INVOKER_KEY) {
      const token = await obtainIdToken(env.API_INVOKER_KEY, origin)
      if (token instanceof Response) return token
      headers.set('X-Serverless-Authorization', `Bearer ${token}`)
    }

    try {
      return await fetch(`${origin}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body: request.body,
        redirect: 'manual',
      })
    } catch {
      return problem({ title: 'Bad Gateway', status: 502 }, 502)
    }
  },
}
