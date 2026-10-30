import { afterEach, describe, expect, it, vi } from 'vitest'
import { sharesApi, toShare, toSharedBuild } from '@/lib/api/shares'
import { minimalPayload } from '../../support/builds'
import { savedShare } from '../../support/sharesApi'

const share = savedShare(1)
const shared = {
  name: '構成1',
  masterVersion: 'test-1',
  payload: minimalPayload(),
  schemaVersion: 1,
  createdAt: '2026-10-01T00:00:00Z',
}

function stubFetch(response: Response | Error): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('sharesApi', () => {
  it('AC-8: list は GET /api/shares の配列を共有にする', async () => {
    const fn = stubFetch(Response.json([share]))
    expect(await sharesApi.list()).toEqual({ kind: 'ok', value: [share] })
    expect(fn).toHaveBeenCalledWith('/api/shares', expect.objectContaining({ method: 'GET' }))
  })

  it('AC-1: create は id と buildId だけを POST し、構成の内容を含めない', async () => {
    const fn = stubFetch(Response.json(share, { status: 201 }))
    await sharesApi.create({ id: share.id, buildId: share.buildId })
    expect(fn).toHaveBeenCalledWith(
      '/api/shares',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id: share.id, buildId: share.buildId }),
      }),
    )
  })

  it('AC-1: 応答の id が要求の id と同じなら created（201）', async () => {
    stubFetch(Response.json(share, { status: 201 }))
    expect(await sharesApi.create({ id: share.id, buildId: share.buildId })).toEqual({
      kind: 'ok',
      value: { share, created: true },
    })
  })

  it('AC-3: 応答の id が要求の id と違えば既存の共有（created ではない）', async () => {
    stubFetch(Response.json(share))
    expect(await sharesApi.create({ id: savedShare(9).id, buildId: share.buildId })).toEqual({
      kind: 'ok',
      value: { share, created: false },
    })
  })

  it('AC-9: revoke は DELETE で、204 は成功', async () => {
    const fn = stubFetch(new Response(null, { status: 204 }))
    expect(await sharesApi.revoke(share.id)).toEqual({ kind: 'ok', value: true })
    expect(fn).toHaveBeenCalledWith(
      `/api/shares/${share.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('AC-5: view は GET /api/shared-builds/{shortId} の応答を返す', async () => {
    const fn = stubFetch(Response.json(shared))
    expect(await sharesApi.view('Ab3dE6gH9jK2')).toEqual({ kind: 'ok', value: shared })
    expect(fn).toHaveBeenCalledWith(
      '/api/shared-builds/Ab3dE6gH9jK2',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it.each([
    [401, { kind: 'unauthorized' }],
    [404, { kind: 'notFound' }],
    [409, { kind: 'conflict' }],
    [400, { kind: 'failed', cause: 'server' }],
    [500, { kind: 'failed', cause: 'server' }],
  ])('AC-10, AC-12: status %i は %o にする', async (status, expected) => {
    stubFetch(new Response('', { status }))
    expect(await sharesApi.view('Ab3dE6gH9jK2')).toEqual(expected)
    expect(await sharesApi.create({ id: share.id, buildId: share.buildId })).toEqual(expected)
  })

  it('AC-10: fetch が届かないときは network', async () => {
    stubFetch(new TypeError('Failed to fetch'))
    expect(await sharesApi.view('Ab3dE6gH9jK2')).toEqual({ kind: 'failed', cause: 'network' })
  })

  it('AC-10: 閲覧の応答の形が不正なときは failed（server）', async () => {
    stubFetch(Response.json({ ...shared, schemaVersion: 2 }))
    expect(await sharesApi.view('Ab3dE6gH9jK2')).toEqual({ kind: 'failed', cause: 'server' })
  })

  it('AC-8: 一覧が配列でない・要素の形が不正なときは failed（server）', async () => {
    stubFetch(Response.json({}))
    expect(await sharesApi.list()).toEqual({ kind: 'failed', cause: 'server' })
    stubFetch(Response.json([share, { ...share, shortId: 'short' }]))
    expect(await sharesApi.list()).toEqual({ kind: 'failed', cause: 'server' })
  })
})

describe('toShare・toSharedBuild（応答の形の検査）', () => {
  it('AC-1: 正しい形は受け入れる', () => {
    expect(toShare(share)).toEqual(share)
    expect(toSharedBuild(shared)).toEqual(shared)
  })

  it.each([
    ['項目の欠落', { ...share, name: undefined }],
    ['短縮 ID の形の違反', { ...share, shortId: 'Ab3dE6gH9jK-' }],
    ['null', null],
  ])('AC-8: 共有の %s は null', (_label, value) => {
    expect(toShare(value)).toBeNull()
  })

  it.each([
    ['payload の欠落', { ...shared, payload: undefined }],
    ['createdAt の型', { ...shared, createdAt: 1 }],
    ['masterVersion の型', { ...shared, masterVersion: null }],
    ['name の型', { ...shared, name: 1 }],
  ])('AC-5: 共有した構成の %s は null', (_label, value) => {
    expect(toSharedBuild(value)).toBeNull()
  })
})
