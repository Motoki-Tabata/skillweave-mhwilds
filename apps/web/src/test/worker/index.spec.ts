import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
