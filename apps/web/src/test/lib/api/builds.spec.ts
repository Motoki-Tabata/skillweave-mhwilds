import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildsApi, toBuild } from '@/lib/api/builds'
import { savedBuild } from '../../support/builds'

const row = savedBuild(1, {
  version: 3,
  payload: {
    weapon: {
      kind: 'custom',
      id: '01900000-0000-7000-8000-0000000000aa',
      payload: {
        baseWeaponId: 'wp:great-sword:1',
        name: '',
        attack: 100,
        affinity: 5,
        slots: [{ target: 'weapon', level: 2 }],
        seriesBonusId: null,
        groupBonusId: null,
      },
    },
    armor: { head: 'ar:1:head', chest: null, arms: null, waist: null, legs: null },
    charm: {
      id: '01900000-0000-7000-8000-0000000000bb',
      payload: { rarity: 8, skills: [{ skillId: 'sk:1', level: 2 }], slots: [] },
    },
    decorations: [{ slot: { owner: 'head', index: 0 }, decorationId: 'dc:1' }],
    skills: [{ skillId: 'sk:1', level: 1, rawLevel: 1 }],
    freeSlots: [{ owner: 'weapon', index: 0 }],
    activeConditionIds: ['cd:weak_point'],
  },
})

function stubFetch(response: Response | Error): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('buildsApi', () => {
  it('AC-3: list は GET /api/builds の配列を構成にする', async () => {
    const fn = stubFetch(Response.json([row]))
    expect(await buildsApi.list()).toEqual({ kind: 'ok', value: [row] })
    expect(fn).toHaveBeenCalledWith('/api/builds', expect.objectContaining({ method: 'GET' }))
  })

  it('AC-1, AC-6: create は POST、rename は PATCH、remove は DELETE（204 は成功）', async () => {
    const request = {
      id: row.id,
      name: row.name,
      masterVersion: row.masterVersion,
      payload: row.payload,
      schemaVersion: 1 as const,
    }
    const post = stubFetch(Response.json(row))
    expect(await buildsApi.create(request)).toEqual({ kind: 'ok', value: row })
    expect(post).toHaveBeenLastCalledWith(
      '/api/builds',
      expect.objectContaining({ method: 'POST' }),
    )
    const patch = stubFetch(Response.json(row))
    expect(await buildsApi.rename(row.id, { name: 'x', version: 3 })).toEqual({
      kind: 'ok',
      value: row,
    })
    expect(patch).toHaveBeenLastCalledWith(
      `/api/builds/${row.id}`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'x', version: 3 }) }),
    )
    const del = stubFetch(new Response(null, { status: 204 }))
    expect(await buildsApi.remove(row.id)).toEqual({ kind: 'ok', value: true })
    expect(del).toHaveBeenLastCalledWith(
      `/api/builds/${row.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it.each([
    [401, { kind: 'unauthorized' }],
    [409, { kind: 'conflict' }],
    [404, { kind: 'notFound' }],
    [400, { kind: 'badRequest' }],
    [500, { kind: 'failed', cause: 'server' }],
  ])('AC-9, AC-12: status %i は %o にする', async (status, expected) => {
    stubFetch(new Response('', { status }))
    expect(await buildsApi.list()).toEqual(expected)
  })

  it('AC-12: fetch が届かないときは network、本文が JSON でないときは server', async () => {
    stubFetch(new TypeError('Failed to fetch'))
    expect(await buildsApi.list()).toEqual({ kind: 'failed', cause: 'network' })
    stubFetch(new Response('not json', { status: 200 }))
    expect(await buildsApi.list()).toEqual({ kind: 'failed', cause: 'server' })
  })

  it('AC-12: 一覧が配列でない・要素の形が不正なときは failed（server）', async () => {
    stubFetch(Response.json({}))
    expect(await buildsApi.list()).toEqual({ kind: 'failed', cause: 'server' })
    stubFetch(Response.json([row, { ...row, name: 1 }]))
    expect(await buildsApi.list()).toEqual({ kind: 'failed', cause: 'server' })
  })
})

describe('toBuild（応答の形の検査）', () => {
  it('正しい形は受け入れる（マスターの武器・個体差のある武器・護石・属性）', () => {
    expect(toBuild(row)).toEqual(row)
    expect(toBuild(savedBuild(2))).not.toBeNull()
    const custom = structuredClone(row)
    if (custom.payload.weapon.kind === 'custom') {
      custom.payload.weapon.payload.element = { type: 'fire', value: 10 }
    }
    expect(toBuild(custom)).not.toBeNull()
  })

  it('027 AC-9: 生産護石の形の護石を受け入れる', () => {
    const crafted = structuredClone(row) as Record<string, unknown>
    ;(crafted.payload as Record<string, unknown>).charm = {
      kind: 'crafted',
      charmId: 'ch:-1:2',
    }
    expect(toBuild(crafted)).not.toBeNull()
  })

  const broken: [string, (b: Record<string, unknown>) => void][] = [
    [
      '027 AC-9: 護石の kind が crafted 以外',
      (b) =>
        ((b.payload as Record<string, unknown>).charm = { kind: 'appraised', charmId: 'ch:-1:2' }),
    ],
    [
      '027 AC-9: 生産護石の charmId が無い',
      (b) => ((b.payload as Record<string, unknown>).charm = { kind: 'crafted' }),
    ],
    [
      '027 AC-9: 生産護石の charmId が文字列でない',
      (b) => ((b.payload as Record<string, unknown>).charm = { kind: 'crafted', charmId: 1 }),
    ],
    ['schemaVersion が 1 でない', (b) => (b.schemaVersion = 2)],
    ['version が負', (b) => (b.version = -1)],
    ['version が整数でない', (b) => (b.version = 0.5)],
    ['createdAt が文字列でない', (b) => (b.createdAt = 1)],
    ['masterVersion が無い', (b) => delete b.masterVersion],
    ['payload が無い', (b) => delete b.payload],
    ['武器の kind が不明', (b) => ((b.payload as Record<string, unknown>).weapon = { kind: 'x' })],
    [
      'マスターの武器に weaponId が無い',
      (b) => ((b.payload as Record<string, unknown>).weapon = { kind: 'master' }),
    ],
    [
      '個体差のある武器の写しが不正',
      (b) =>
        ((b.payload as Record<string, unknown>).weapon = { kind: 'custom', id: 'a', payload: {} }),
    ],
    [
      '個体差のある武器の属性が不正',
      (b) =>
        ((b.payload as Record<string, unknown>).weapon = {
          kind: 'custom',
          id: 'a',
          payload: {
            baseWeaponId: 'wp:great-sword:1',
            name: '',
            attack: 1,
            affinity: 0,
            element: { type: 1 },
            slots: [],
            seriesBonusId: null,
            groupBonusId: null,
          },
        }),
    ],
    [
      '防具の部位が欠ける',
      (b) => delete (b.payload as { armor: Record<string, unknown> }).armor.legs,
    ],
    [
      '護石の写しが不正',
      (b) => ((b.payload as Record<string, unknown>).charm = { id: 'a', payload: {} }),
    ],
    [
      '装飾品のスロットが不正',
      (b) =>
        ((b.payload as Record<string, unknown>).decorations = [
          { slot: { owner: 'x', index: 0 }, decorationId: 'dc:1' },
        ]),
    ],
    [
      'スキルの rawLevel が無い',
      (b) => ((b.payload as Record<string, unknown>).skills = [{ skillId: 'sk:1', level: 1 }]),
    ],
    ['空きスロットが配列でない', (b) => ((b.payload as Record<string, unknown>).freeSlots = {})],
    [
      '発動条件が文字列でない',
      (b) => ((b.payload as Record<string, unknown>).activeConditionIds = [1]),
    ],
  ]

  it.each(broken)('AC-12: %s ときは null', (_name, mutate) => {
    const copy = structuredClone(savedBuild(1)) as unknown as Record<string, unknown>
    mutate(copy)
    expect(toBuild(copy)).toBeNull()
  })

  it('AC-12: オブジェクトでない値は null', () => {
    expect(toBuild(null)).toBeNull()
    expect(toBuild('x')).toBeNull()
  })
})
