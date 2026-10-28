import { describe, expect, it } from 'vitest'
import { byIdDescending, nowIso, uuidv7 } from '@/lib/uuidv7'

// 受入基準 3（新しい護石の ID はクライアントで採番した UUIDv7）
describe('uuidv7', () => {
  const fixed = (time: number, fill: number) => ({
    now: () => time,
    fillRandom: (bytes: Uint8Array) => bytes.fill(fill),
  })

  it('小文字の 8-4-4-4-12 で、版は 7・variant は 10', () => {
    const id = uuidv7(fixed(1_700_000_000_000, 0xff))
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('先頭 48 ビットは UNIX ミリ秒', () => {
    const time = 1_700_000_000_000
    const id = uuidv7(fixed(time, 0))
    expect(Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16)).toBe(time)
  })

  it('版と variant 以外のビットは乱数をそのまま使う', () => {
    expect(uuidv7(fixed(0, 0))).toBe('00000000-0000-7000-8000-000000000000')
    expect(uuidv7(fixed(0, 0xff))).toBe('00000000-0000-7fff-bfff-ffffffffffff')
  })

  it('既定の源でも UUIDv7 の形になる', () => {
    expect(uuidv7()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('時刻が後の ID は文字列として大きい', () => {
    expect(uuidv7(fixed(2_000, 0)) > uuidv7(fixed(1_000, 0xff))).toBe(true)
  })
})

describe('nowIso', () => {
  it('UTC の ISO 8601', () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})

// AC-9（ID の降順の並べ替えを護石・武器・構成のストアで共有する）
describe('byIdDescending', () => {
  it('新しい（大きい）ID が先に並ぶ', () => {
    const items = [{ id: 'a' }, { id: 'c' }, { id: 'b' }]
    expect([...items].sort(byIdDescending).map((i) => i.id)).toEqual(['c', 'b', 'a'])
  })

  it('同じ ID は 0 を返す', () => {
    expect(byIdDescending({ id: 'a' }, { id: 'a' })).toBe(0)
  })
})
