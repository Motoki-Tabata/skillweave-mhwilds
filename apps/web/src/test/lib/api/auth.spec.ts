import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCurrentUser, logout } from '@/lib/api/auth'

function stubFetch(response: Response | Error): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

// 受入基準 5, 11（認証状態の取得）
describe('fetchCurrentUser', () => {
  it('[5] 200 で表示名があればログイン中', async () => {
    stubFetch(Response.json({ displayName: '狩人太郎' }))
    expect(await fetchCurrentUser()).toEqual({ kind: 'authenticated', displayName: '狩人太郎' })
  })

  it('[5] 401 は未ログイン', async () => {
    stubFetch(new Response('{}', { status: 401 }))
    expect(await fetchCurrentUser()).toEqual({ kind: 'unauthenticated' })
  })

  it.each([
    ['500', () => new Response('x', { status: 500 })],
    ['届かない', () => new TypeError('network')],
    ['表示名が空', () => Response.json({ displayName: '' })],
    ['形が不正', () => Response.json({ name: 'a' })],
    ['null', () => Response.json(null)],
  ])('[11] %s は取得できない（例外を投げない）', async (_label, make) => {
    stubFetch(make())
    expect(await fetchCurrentUser()).toEqual({ kind: 'unavailable' })
  })
})

// 受入基準 6（ログアウト）
describe('logout', () => {
  it('[6] 204 は成功。POST で X-XSRF-TOKEN を載せる', async () => {
    document.cookie = 'XSRF-TOKEN=tok1'
    const fn = stubFetch(new Response(null, { status: 204 }))
    expect(await logout()).toBe(true)
    const [path, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/api/auth/logout')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('X-XSRF-TOKEN')).toBe('tok1')
    document.cookie = 'XSRF-TOKEN=; max-age=0'
  })

  it('[6] 401（既に切れている）も成功', async () => {
    stubFetch(new Response('{}', { status: 401 }))
    expect(await logout()).toBe(true)
  })

  it.each([
    ['403', () => new Response('{}', { status: 403 })],
    ['500', () => new Response('{}', { status: 500 })],
    ['届かない', () => new TypeError('network')],
  ])('[6] %s は失敗', async (_label, make) => {
    stubFetch(make())
    expect(await logout()).toBe(false)
  })
})
