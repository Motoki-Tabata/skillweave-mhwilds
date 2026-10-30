import { afterEach, describe, expect, it, vi } from 'vitest'
import { toAccountWeapon, weaponsApi } from '@/lib/api/weapons'

const row = {
  id: '01900000-0000-7000-8000-000000000001',
  payload: {
    baseWeaponId: 'wp:great-sword:artia2',
    name: '巨戟ブレイド',
    attack: 200,
    affinity: 15,
    element: { type: 'fire', value: 30 },
    slots: [{ target: 'weapon', level: 3 }],
    seriesBonusId: null,
    groupBonusId: 'sb:group',
  },
  schemaVersion: 1,
  version: 3,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
}
const request = { id: row.id, payload: row.payload, schemaVersion: 1 } as never

function stubFetch(response: Response | Error): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

// 受入基準 2, 8, 12（武器の API の層）
describe('weaponsApi', () => {
  it('AC-2: list は GET /api/weapons の配列を AccountWeapon にする', async () => {
    const fn = stubFetch(Response.json([row]))
    expect(await weaponsApi.list()).toEqual({ kind: 'ok', value: [row] })
    expect(fn).toHaveBeenCalledWith('/api/weapons', expect.objectContaining({ method: 'GET' }))
  })

  it('AC-2: create は POST、update は PUT、remove は DELETE（204 は成功）', async () => {
    const fn = stubFetch(Response.json(row))
    expect(await weaponsApi.create(request)).toEqual({ kind: 'ok', value: row })
    expect(fn).toHaveBeenLastCalledWith('/api/weapons', expect.objectContaining({ method: 'POST' }))
    const fn2 = stubFetch(Response.json(row))
    expect(
      await weaponsApi.update(row.id, { ...(request as object), version: 3 } as never),
    ).toEqual({ kind: 'ok', value: row })
    expect(fn2).toHaveBeenLastCalledWith(
      `/api/weapons/${row.id}`,
      expect.objectContaining({ method: 'PUT' }),
    )
    stubFetch(new Response(null, { status: 204 }))
    expect(await weaponsApi.remove(row.id)).toEqual({ kind: 'ok', value: true })
  })

  it.each([
    [401, { kind: 'unauthorized' }],
    [409, { kind: 'conflict' }],
    [404, { kind: 'notFound' }],
    [400, { kind: 'failed', cause: 'server' }],
    [403, { kind: 'failed', cause: 'server' }],
    [500, { kind: 'failed', cause: 'server' }],
  ])('AC-8/12: status %i は失敗の種類に分ける', async (status, expected) => {
    stubFetch(new Response('{}', { status }))
    expect(await weaponsApi.update(row.id, request)).toEqual(expected)
    expect(await weaponsApi.list()).toEqual(expected)
    expect(await weaponsApi.remove(row.id)).toEqual(expected)
  })

  it('AC-12: fetch が届かないときは network', async () => {
    stubFetch(new TypeError('Failed to fetch'))
    expect(await weaponsApi.list()).toEqual({ kind: 'failed', cause: 'network' })
  })

  it('AC-12: 応答が JSON でない・形が合わないときは server', async () => {
    stubFetch(new Response('not json', { status: 200 }))
    expect(await weaponsApi.list()).toEqual({ kind: 'failed', cause: 'server' })
    stubFetch(Response.json({ ...row, version: -1 }))
    expect(await weaponsApi.create(request)).toEqual({ kind: 'failed', cause: 'server' })
    stubFetch(Response.json([row, { id: 'x' }]))
    expect(await weaponsApi.list()).toEqual({ kind: 'failed', cause: 'server' })
    stubFetch(Response.json({}))
    expect(await weaponsApi.list()).toEqual({ kind: 'failed', cause: 'server' })
  })
})

describe('toAccountWeapon', () => {
  it('AC-2: 余分なキーを落として正しい形を通し、element の省略を許す', () => {
    expect(toAccountWeapon({ ...row, userId: 'x' })).toEqual(row)
    const { element: _element, ...withoutElement } = row.payload
    const bare = { ...row, payload: withoutElement }
    expect(toAccountWeapon(bare)).toEqual(bare)
  })

  it.each([
    ['null', null],
    ['schemaVersion が 1 でない', { ...row, schemaVersion: 2 }],
    ['id が無い', { ...row, id: undefined }],
    ['version が小数', { ...row, version: 1.5 }],
    ['updatedAt が無い', { ...row, updatedAt: undefined }],
    ['payload が無い', { ...row, payload: null }],
    ['element が null', { ...row, payload: { ...row.payload, element: null } }],
    ['slots が配列でない', { ...row, payload: { ...row.payload, slots: 1 } }],
  ])('AC-12: %s は形の不正として null', (_label, value) => {
    expect(toAccountWeapon(value)).toBeNull()
  })
})
