import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { http, HttpError } from '@/lib/http'

// CSRF ヘッダ付与・エラー変換・204 処理を検証する。fetch はここで直接 stub する。
describe('http', () => {
  const originalCookie = document.cookie

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    // jsdom の Cookie は空文字代入では消えないため、失効日時を指定して明示的に消す。
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.cookie = originalCookie
  })

  function mockResponse(overrides: Partial<Response> = {}) {
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({ ok: true }),
      text: vi.fn().mockResolvedValue(''),
      ...overrides,
    } as unknown as Response
  }

  it('sends credentials: include and Accept: application/json on every request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse())

    await http.get('/api/users')

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init?.credentials).toBe('include')
    expect((init!.headers as Headers).get('Accept')).toBe('application/json')
  })

  it('does not attach X-XSRF-TOKEN for GET requests even if the cookie exists', async () => {
    document.cookie = 'XSRF-TOKEN=token-value'
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse())

    await http.get('/api/users')

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init!.headers as Headers).has('X-XSRF-TOKEN')).toBe(false)
  })

  it('attaches X-XSRF-TOKEN for POST requests when the cookie exists', async () => {
    document.cookie = 'XSRF-TOKEN=token-value'
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse())

    await http.post('/api/users', { loginId: 'a' })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init!.headers as Headers).get('X-XSRF-TOKEN')).toBe('token-value')
  })

  it('URL-decodes the XSRF-TOKEN cookie value', async () => {
    document.cookie = 'XSRF-TOKEN=' + encodeURIComponent('a b/c')
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse())

    await http.post('/api/users', { loginId: 'a' })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init!.headers as Headers).get('X-XSRF-TOKEN')).toBe('a b/c')
  })

  it('does not attach X-XSRF-TOKEN for POST requests when the cookie is absent', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse())

    await http.post('/api/users', { loginId: 'a' })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init!.headers as Headers).has('X-XSRF-TOKEN')).toBe(false)
  })

  it('sets Content-Type: application/json when a body is present and Content-Type is not set', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse())

    await http.post('/api/users', { loginId: 'a' })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init!.headers as Headers).get('Content-Type')).toBe('application/json')
  })

  it('does not overwrite an explicit Content-Type header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse())

    await http.post('/api/users', { loginId: 'a' }, { headers: { 'Content-Type': 'text/plain' } })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init!.headers as Headers).get('Content-Type')).toBe('text/plain')
  })

  it('does not set Content-Type when a POST has no body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ status: 204, json: vi.fn() }))

    await http.post('/api/users/1/password-reset')

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init!.headers as Headers).has('Content-Type')).toBe(false)
    expect(init?.body).toBeUndefined()
  })

  it('serializes the body with JSON.stringify when present', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse())

    await http.put('/api/users/1', { lastName: '田中' })

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(init?.body).toBe(JSON.stringify({ lastName: '田中' }))
  })

  it('throws HttpError with status/statusText/body when the response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: vi.fn().mockResolvedValue('unauthorized'),
      }),
    )

    await expect(http.get('/api/users')).rejects.toMatchObject({
      status: 401,
      statusText: 'Unauthorized',
      body: 'unauthorized',
    })
  })

  it('is an instance of HttpError and Error when the response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ ok: false, status: 404, statusText: 'Not Found' }),
    )

    let caught: unknown
    try {
      await http.get('/api/users/1')
    } catch (e) {
      caught = e
    }

    expect(caught).toBeInstanceOf(HttpError)
    expect(caught).toBeInstanceOf(Error)
  })

  it('falls back to a null body when response.text() rejects', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: vi.fn().mockRejectedValue(new Error('boom')),
      }),
    )

    await expect(http.get('/api/users')).rejects.toMatchObject({ body: null })
  })

  it('returns undefined for a 204 No Content response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ status: 204, json: vi.fn() }))

    const result = await http.delete('/api/users/1')

    expect(result).toBeUndefined()
  })

  it('parses the response body as JSON otherwise', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ json: vi.fn().mockResolvedValue({ id: '1' }) }),
    )

    const result = await http.get('/api/users/1')

    expect(result).toEqual({ id: '1' })
  })
})
