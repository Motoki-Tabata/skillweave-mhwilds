import { afterEach, describe, expect, it, vi } from 'vitest'
import { charmsApi, toAccountCharm } from '@/lib/api/charms'

const row = {
  id: '01900000-0000-7000-8000-000000000001',
  payload: {
    rarity: 8,
    skills: [{ skillId: 'sk:1', level: 2 }],
    slots: [{ target: 'weapon', level: 1 }],
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

// 受入基準 2, 3, 8, 11, 12（護石の API の層）
describe('charmsApi', () => {
  it('AC-2: list は GET /api/charms の配列を AccountCharm にする', async () => {
    const fn = stubFetch(Response.json([row]))
    expect(await charmsApi.list()).toEqual({ kind: 'ok', value: [row] })
    expect(fn).toHaveBeenCalledWith('/api/charms', expect.objectContaining({ method: 'GET' }))
  })

  it('AC-2: create は POST、update は PUT、remove は DELETE（204 は成功）', async () => {
    const fn = stubFetch(Response.json(row))
    expect(await charmsApi.create(request)).toEqual({ kind: 'ok', value: row })
    expect(fn).toHaveBeenLastCalledWith('/api/charms', expect.objectContaining({ method: 'POST' }))
    const fn2 = stubFetch(Response.json(row))
    expect(await charmsApi.update(row.id, { ...(request as object), version: 3 } as never)).toEqual(
      {
        kind: 'ok',
        value: row,
      },
    )
    expect(fn2).toHaveBeenLastCalledWith(
      `/api/charms/${row.id}`,
      expect.objectContaining({ method: 'PUT' }),
    )
    stubFetch(new Response(null, { status: 204 }))
    expect(await charmsApi.remove(row.id)).toEqual({ kind: 'ok', value: true })
  })

  it.each([
    [401, { kind: 'unauthorized' }],
    [409, { kind: 'conflict' }],
    [404, { kind: 'notFound' }],
    [400, { kind: 'failed', cause: 'server' }],
    [403, { kind: 'failed', cause: 'server' }],
    [500, { kind: 'failed', cause: 'server' }],
  ])('AC-8/11/12: status %i は失敗の種類に分ける', async (status, expected) => {
    stubFetch(new Response('{}', { status }))
    expect(await charmsApi.update(row.id, request)).toEqual(expected)
    expect(await charmsApi.list()).toEqual(expected)
    expect(await charmsApi.remove(row.id)).toEqual(expected)
  })

  it('AC-12: fetch が届かないときは network', async () => {
    stubFetch(new TypeError('Failed to fetch'))
    expect(await charmsApi.list()).toEqual({ kind: 'failed', cause: 'network' })
  })

  it('AC-12: 応答が JSON でない・形が合わないときは server', async () => {
    stubFetch(new Response('not json', { status: 200 }))
    expect(await charmsApi.list()).toEqual({ kind: 'failed', cause: 'server' })
    stubFetch(Response.json({ ...row, version: -1 }))
    expect(await charmsApi.create(request)).toEqual({ kind: 'failed', cause: 'server' })
    stubFetch(Response.json([row, { id: 'x' }]))
    expect(await charmsApi.list()).toEqual({ kind: 'failed', cause: 'server' })
    stubFetch(Response.json({}))
    expect(await charmsApi.list()).toEqual({ kind: 'failed', cause: 'server' })
  })
})

describe('toAccountCharm', () => {
  it('AC-12: 余分なキーを落として正しい形を通す', () => {
    expect(toAccountCharm({ ...row, userId: 'x' })).toEqual(row)
  })

  it.each([
    ['null', null],
    ['schemaVersion が 1 でない', { ...row, schemaVersion: 2 }],
    ['id が無い', { ...row, id: undefined }],
    ['version が小数', { ...row, version: 1.5 }],
    ['createdAt が無い', { ...row, createdAt: undefined }],
    ['payload が無い', { ...row, payload: null }],
    ['skills が配列でない', { ...row, payload: { ...row.payload, skills: 1 } }],
    [
      'skill の形が不正',
      { ...row, payload: { ...row.payload, skills: [{ skillId: 1, level: 1 }] } },
    ],
    [
      'slot の種別が不正',
      { ...row, payload: { ...row.payload, slots: [{ target: 'x', level: 1 }] } },
    ],
    ['rarity が数でない', { ...row, payload: { ...row.payload, rarity: '8' } }],
  ])('AC-12: %s は不正（null）', (_label, value) => {
    expect(toAccountCharm(value)).toBeNull()
  })
})
