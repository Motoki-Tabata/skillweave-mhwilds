import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../../../worker/index'

const ORIGIN = 'https://swv-api-abc.a.run.app'
const env = { API_ORIGIN: ORIGIN }

describe('worker /api/* proxy', () => {
  const upstream = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()

  beforeEach(() => {
    upstream.mockReset()
    upstream.mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', upstream)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function call(path: string, init: RequestInit = {}, e: { API_ORIGIN?: string } = env) {
    return worker.fetch(new Request(`https://skillweave.app${path}`, init), e)
  }

  function sentHeaders(): Headers {
    return upstream.mock.calls[0]![1].headers as Headers
  }

  it('AC-1: forwards method, path, query, body, Cookie and X-XSRF-TOKEN to API_ORIGIN', async () => {
    await call('/api/builds?x=1&y=2', {
      method: 'POST',
      body: '{"a":1}',
      headers: { Cookie: 'SESSION=abc', 'X-XSRF-TOKEN': 'tok', 'Content-Type': 'application/json' },
    })
    const [url, init] = upstream.mock.calls[0]!
    expect(url).toBe(`${ORIGIN}/api/builds?x=1&y=2`)
    expect(init.method).toBe('POST')
    expect(await new Response(init.body).text()).toBe('{"a":1}')
    expect(sentHeaders().get('Cookie')).toBe('SESSION=abc')
    expect(sentHeaders().get('X-XSRF-TOKEN')).toBe('tok')
  })

  it('AC-1: uses only the origin of API_ORIGIN, even with a path or a // path', async () => {
    await call('//evil.example/x', {}, { API_ORIGIN: `${ORIGIN}/foo` })
    expect(upstream.mock.calls[0]![0]).toBe(`${ORIGIN}//evil.example/x`)
  })

  it('AC-2: returns upstream status, headers, body and separate Set-Cookie values', async () => {
    const headers = new Headers({ 'X-Custom': 'v' })
    headers.append('Set-Cookie', 'a=1; Path=/')
    headers.append('Set-Cookie', 'b=2; Path=/')
    upstream.mockResolvedValue(new Response('body', { status: 201, headers }))
    const res = await call('/api/builds', { method: 'POST' })
    expect(res.status).toBe(201)
    expect(res.headers.get('X-Custom')).toBe('v')
    expect(res.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/'])
    expect(await res.text()).toBe('body')
  })

  it('AC-3: does not follow redirects and returns Location unchanged', async () => {
    upstream.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: 'https://discord.com/oauth2/x?a=%2F' },
      }),
    )
    const res = await call('/api/oauth2/authorization/discord')
    expect(upstream.mock.calls[0]![1].redirect).toBe('manual')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://discord.com/oauth2/x?a=%2F')
  })

  it.each([undefined, '', 'not a url', 'localhost:8080', 'ftp://example.com'])(
    'AC-4: returns 503 problem without forwarding when API_ORIGIN is %j',
    async (value) => {
      const res = await call('/api/builds', {}, { API_ORIGIN: value })
      expect(res.status).toBe(503)
      expect(res.headers.get('Content-Type')).toBe('application/problem+json')
      expect(await res.json()).toEqual({ title: 'Service Unavailable', status: 503 })
      expect(upstream).not.toHaveBeenCalled()
    },
  )

  it('AC-4: checks API_ORIGIN before the /api/auth/me 401 shortcut', async () => {
    const res = await call('/api/auth/me', {}, {})
    expect(res.status).toBe(503)
  })

  it('AC-5: returns 401 problem with no-store for GET /api/auth/me without a session cookie', async () => {
    const res = await call('/api/auth/me')
    expect(res.status).toBe(401)
    expect(res.headers.get('Content-Type')).toBe('application/problem+json')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
      instance: '/api/auth/me',
    })
    expect(upstream).not.toHaveBeenCalled()
  })

  it.each(['SESSION=abc', 'a=1; SESSION=abc', 'a=1;SESSION=abc;b=2'])(
    'AC-6: forwards GET /api/auth/me with Cookie %j',
    async (cookie) => {
      await call('/api/auth/me', { headers: { Cookie: cookie } })
      expect(upstream).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['XSESSION=abc', 'SESSION=', 'session=abc'])(
    'AC-6: treats Cookie %j as no session',
    async (cookie) => {
      const res = await call('/api/auth/me', { headers: { Cookie: cookie } })
      expect(res.status).toBe(401)
      expect(upstream).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['GET', '/api/oauth2/authorization/discord'],
    ['GET', '/api/shared-builds/abc'],
    ['POST', '/api/auth/me'],
    ['HEAD', '/api/auth/me'],
    ['GET', '/api/auth/me/'],
    ['GET', '/api/builds'],
  ])('AC-7: forwards %s %s without a session cookie', async (method, path) => {
    await call(path, { method })
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it('AC-8: forwards the OAuth callback path and query (%2F and +) unchanged', async () => {
    await call('/api/login/oauth2/code/discord?code=a%2Fb+c&state=d')
    expect(upstream.mock.calls[0]![0]).toBe(
      `${ORIGIN}/api/login/oauth2/code/discord?code=a%2Fb+c&state=d`,
    )
  })

  it('AC-9: strips client address and forwarding headers, and sets no Host', async () => {
    await call('/api/builds', {
      headers: {
        Forwarded: 'for=1.1.1.1',
        'X-Forwarded-For': '1.1.1.1',
        'X-Forwarded-Proto': 'https',
        'X-Real-IP': '1.1.1.1',
        'CF-Connecting-IP': '1.1.1.1',
        'CF-Connecting-IPv6': '::1',
        Host: 'skillweave.app',
        Accept: 'application/json',
      },
    })
    const h = sentHeaders()
    for (const name of [
      'forwarded',
      'x-forwarded-for',
      'x-forwarded-proto',
      'x-real-ip',
      'cf-connecting-ip',
      'cf-connecting-ipv6',
      'host',
    ]) {
      expect(h.has(name)).toBe(false)
    }
    expect(h.get('Accept')).toBe('application/json')
  })

  it('AC-10: returns 502 problem when the upstream fetch throws', async () => {
    upstream.mockRejectedValue(new TypeError('network'))
    const res = await call('/api/builds')
    expect(res.status).toBe(502)
    expect(res.headers.get('Content-Type')).toBe('application/problem+json')
    expect(await res.json()).toEqual({ title: 'Bad Gateway', status: 502 })
  })
})

// 034: ID トークンの取得・使い回し・付与
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const EMAIL = 'swv-web-invoker@example-project.iam.gserviceaccount.com'
const T0 = Date.parse('2026-01-01T00:00:00Z')

function b64u(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function unb64u(s: string): Uint8Array<ArrayBuffer> {
  const b = s.replaceAll('-', '+').replaceAll('_', '/')
  return Uint8Array.from(atob(b.padEnd(Math.ceil(b.length / 4) * 4, '=')), (c) => c.codePointAt(0)!)
}

function fakeIdToken(exp: number, tag = 'a'): string {
  return `${b64u('{"alg":"RS256"}')}.${b64u(JSON.stringify({ exp, tag }))}.sig`
}

async function toPem(key: CryptoKey): Promise<string> {
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', key))
  let bin = ''
  for (const b of der) bin += String.fromCharCode(b)
  const lines = btoa(bin)
    .match(/.{1,64}/g)!
    .join('\n')
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----\n`
}

describe('worker ID token (034)', () => {
  let publicKey: CryptoKey
  let keyJson: string
  let ecPem: string
  let proxy: (typeof import('../../../worker/index'))['default']
  const mock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()
  let tokenHandler: (init: RequestInit) => Response | Promise<Response>

  beforeAll(async () => {
    const pair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    )
    publicKey = pair.publicKey
    keyJson = JSON.stringify({
      type: 'service_account',
      client_email: EMAIL,
      private_key: await toPem(pair.privateKey),
      private_key_id: 'k1',
      token_uri: 'https://example.invalid/token',
    })
    const ec = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
    ])
    ecPem = await toPem(ec.privateKey)
  })

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)
    vi.resetModules()
    proxy = (await import('../../../worker/index')).default
    mock.mockReset()
    tokenHandler = () => Response.json({ id_token: fakeIdToken(T0 / 1000 + 3600) })
    mock.mockImplementation(async (url, init) =>
      url === TOKEN_URL ? tokenHandler(init) : new Response('ok'),
    )
    vi.stubGlobal('fetch', mock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  type TestEnv = { API_ORIGIN?: string; API_INVOKER_KEY?: string }
  const withKey = (): TestEnv => ({ API_ORIGIN: ORIGIN, API_INVOKER_KEY: keyJson })

  function call(path = '/api/builds', init: RequestInit = {}, e: TestEnv = withKey()) {
    return proxy.fetch(new Request(`https://skillweave.app${path}`, init), e)
  }

  const tokenCalls = () => mock.mock.calls.filter(([u]) => u === TOKEN_URL)
  const upstreamCalls = () => mock.mock.calls.filter(([u]) => u !== TOKEN_URL)
  const upstreamHeaders = (i = 0) => upstreamCalls()[i]![1].headers as Headers

  it('AC-1/AC-2: posts a signed JWT and forwards the id_token in X-Serverless-Authorization', async () => {
    await call('/api/builds')
    expect(tokenCalls()).toHaveLength(1)
    const init = tokenCalls()[0]![1]
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    )
    const form = new URLSearchParams((init.body as URLSearchParams).toString())
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    const [h, c, s] = form.get('assertion')!.split('.') as [string, string, string]
    expect(JSON.parse(new TextDecoder().decode(unb64u(h)))).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(JSON.parse(new TextDecoder().decode(unb64u(c)))).toEqual({
      iss: EMAIL,
      sub: EMAIL,
      aud: TOKEN_URL,
      target_audience: ORIGIN,
      iat: T0 / 1000,
      exp: T0 / 1000 + 3600,
    })
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      unb64u(s),
      new TextEncoder().encode(`${h}.${c}`),
    )
    expect(ok).toBe(true)
    expect(upstreamHeaders().get('X-Serverless-Authorization')).toBe(
      `Bearer ${fakeIdToken(T0 / 1000 + 3600)}`,
    )
  })

  it('AC-1: target_audience is the origin of API_ORIGIN without path', async () => {
    await call('/api/builds', {}, { API_ORIGIN: `${ORIGIN}/foo/`, API_INVOKER_KEY: keyJson })
    const form = new URLSearchParams((tokenCalls()[0]![1].body as URLSearchParams).toString())
    const claims = JSON.parse(
      new TextDecoder().decode(unb64u(form.get('assertion')!.split('.')[1]!)),
    )
    expect(claims.target_audience).toBe(ORIGIN)
  })

  it('AC-3: replaces the client X-Serverless-Authorization and keeps Authorization (key set)', async () => {
    await call('/api/builds', {
      headers: { 'X-Serverless-Authorization': 'Bearer evil', Authorization: 'Bearer abc' },
    })
    expect(upstreamHeaders().get('X-Serverless-Authorization')).toBe(
      `Bearer ${fakeIdToken(T0 / 1000 + 3600)}`,
    )
    expect(upstreamHeaders().get('Authorization')).toBe('Bearer abc')
  })

  it('AC-3/AC-7: drops the client X-Serverless-Authorization and keeps Authorization (no key)', async () => {
    await call(
      '/api/builds',
      { headers: { 'X-Serverless-Authorization': 'Bearer evil', Authorization: 'Bearer abc' } },
      { API_ORIGIN: ORIGIN },
    )
    expect(upstreamHeaders().has('X-Serverless-Authorization')).toBe(false)
    expect(upstreamHeaders().get('Authorization')).toBe('Bearer abc')
  })

  it.each([
    ['T+3299s reuses the token', 3299, 1],
    ['T+3300s refreshes', 3300, 2],
    ['T+3301s refreshes', 3301, 2],
  ])('AC-4: %s', async (_name, seconds, expected) => {
    let n = 0
    tokenHandler = () =>
      Response.json({ id_token: fakeIdToken(T0 / 1000 + 3600, n++ === 0 ? 'a' : 'b') })
    await call()
    vi.setSystemTime(T0 + seconds * 1000)
    await call()
    expect(tokenCalls()).toHaveLength(expected)
    expect(upstreamCalls()).toHaveLength(2)
    const tag = expected === 1 ? 'a' : 'b'
    expect(upstreamHeaders(0).get('X-Serverless-Authorization')).toBe(
      `Bearer ${fakeIdToken(T0 / 1000 + 3600, 'a')}`,
    )
    expect(upstreamHeaders(1).get('X-Serverless-Authorization')).toBe(
      `Bearer ${fakeIdToken(T0 / 1000 + 3600, tag)}`,
    )
  })

  it('AC-5: retries the exchange on the next request after a failure', async () => {
    tokenHandler = () => new Response('', { status: 500 })
    expect((await call()).status).toBe(502)
    tokenHandler = () => Response.json({ id_token: fakeIdToken(T0 / 1000 + 3600) })
    expect((await call()).status).toBe(200)
    expect(tokenCalls()).toHaveLength(2)
    expect(upstreamCalls()).toHaveLength(1)
  })

  it('AC-5: a token whose exp is unreadable is used once but not held', async () => {
    tokenHandler = () => Response.json({ id_token: 'opaque' })
    await call()
    await call()
    expect(tokenCalls()).toHaveLength(2)
    expect(upstreamHeaders().get('X-Serverless-Authorization')).toBe('Bearer opaque')
  })

  it('AC-6: does not call the token endpoint when API_ORIGIN is missing', async () => {
    const res = await call('/api/builds', {}, { API_INVOKER_KEY: keyJson })
    expect(res.status).toBe(503)
    expect(mock).not.toHaveBeenCalled()
  })

  it('AC-6: does not call the token endpoint for GET /api/auth/me without a session cookie', async () => {
    const res = await call('/api/auth/me')
    expect(res.status).toBe(401)
    expect(mock).not.toHaveBeenCalled()
  })

  it.each([
    ['undefined', undefined],
    ['empty string', ''],
  ])('AC-7: forwards without a header when the key is %s', async (_n, key) => {
    await call('/api/builds', {}, { API_ORIGIN: ORIGIN, API_INVOKER_KEY: key })
    expect(tokenCalls()).toHaveLength(0)
    expect(upstreamCalls()).toHaveLength(1)
    expect(upstreamHeaders().has('X-Serverless-Authorization')).toBe(false)
  })

  it.each([
    ['not JSON', () => 'not json'],
    ['no client_email', () => JSON.stringify({ private_key: JSON.parse(keyJson).private_key })],
    ['no private_key', () => JSON.stringify({ client_email: EMAIL })],
    ['PEM is not a PEM', () => JSON.stringify({ client_email: EMAIL, private_key: '%%%' })],
    ['EC key', () => JSON.stringify({ client_email: EMAIL, private_key: ecPem })],
  ])('AC-8: returns 503 without forwarding when the key is invalid (%s)', async (_n, make) => {
    const res = await call('/api/builds', {}, { API_ORIGIN: ORIGIN, API_INVOKER_KEY: make() })
    expect(res.status).toBe(503)
    expect(res.headers.get('Content-Type')).toBe('application/problem+json')
    expect(await res.json()).toEqual({ title: 'Service Unavailable', status: 503 })
    expect(mock).not.toHaveBeenCalled()
  })

  it.each([
    [
      'fetch throws',
      () => {
        throw new Error('network')
      },
    ],
    ['status 500', () => new Response('x', { status: 500 })],
    ['200 without id_token', () => Response.json({})],
    ['200 non-JSON body', () => new Response('<html>')],
  ])('AC-9: returns 502 without forwarding when the exchange fails (%s)', async (_n, handler) => {
    tokenHandler = handler
    const res = await call()
    expect(res.status).toBe(502)
    expect(res.headers.get('Content-Type')).toBe('application/problem+json')
    expect(await res.json()).toEqual({ title: 'Bad Gateway', status: 502 })
    expect(upstreamCalls()).toHaveLength(0)
  })

  it.each([401, 403])(
    'AC-10: returns upstream %i as is with no refresh and no retry',
    async (status) => {
      mock.mockImplementation(async (url, init) =>
        url === TOKEN_URL ? tokenHandler(init) : new Response('denied', { status }),
      )
      const res = await call()
      expect(res.status).toBe(status)
      expect(await res.text()).toBe('denied')
      expect(tokenCalls()).toHaveLength(1)
      expect(upstreamCalls()).toHaveLength(1)
    },
  )
})
