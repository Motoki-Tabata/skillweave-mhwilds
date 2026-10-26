import { describe, expect, it } from 'vitest'
import { openWeaponRepository } from '@/lib/weapons/storage'
import type { StoredWeapon } from '@/lib/weapons/types'
import { makeStoredWeapon } from '../../support/weapons'

/** 必要な範囲だけを模した IDBFactory（実際の IndexedDB は e2e で確かめる）。 */
function fakeFactory(seed: StoredWeapon[] = [], abortWith?: string) {
  const rows = new Map(seed.map((row) => [row.id, row]))
  const used: string[] = []
  const factory = {
    open: () => {
      const request: Record<string, unknown> = {}
      const db = {
        objectStoreNames: { contains: () => true },
        transaction: (store: string, mode: string) => {
          used.push(store)
          const tx: Record<string, unknown> = {}
          const finish = (result: unknown, apply: () => void = () => {}) => {
            queueMicrotask(() => {
              if (mode === 'readwrite' && abortWith) {
                tx.error = new DOMException('fail', abortWith)
                ;(tx.onabort as () => void)()
                return
              }
              apply()
              ;(tx.oncomplete as () => void)()
            })
            return { result }
          }
          tx.objectStore = () => ({
            getAll: () => finish([...rows.values()]),
            put: (row: StoredWeapon) => finish(row.id, () => rows.set(row.id, row)),
            delete: (id: string) => finish(undefined, () => rows.delete(id)),
          })
          return tx
        },
      }
      queueMicrotask(() => {
        request.result = db
        ;(request.onsuccess as () => void)()
      })
      return request
    },
  }
  return { factory: factory as unknown as IDBFactory, rows, used }
}

// 受入基準 3（登録・編集・削除を端末内の IndexedDB へ保存する）
describe('openWeaponRepository', () => {
  it('ストア weapons で登録・一覧・上書き・削除ができる', async () => {
    const fake = fakeFactory()
    const repo = await openWeaponRepository(fake.factory)
    await repo.put(makeStoredWeapon('a'))
    await repo.put(makeStoredWeapon('b'))
    expect((await repo.list()).map((w) => w.id)).toEqual(['a', 'b'])
    await repo.put({
      ...makeStoredWeapon('a', { attack: 300 }),
      updatedAt: '2026-02-01T00:00:00.000Z',
    })
    expect((await repo.list()).find((w) => w.id === 'a')?.payload.attack).toBe(300)
    await repo.delete('a')
    expect((await repo.list()).map((w) => w.id)).toEqual(['b'])
    expect(new Set(fake.used)).toEqual(new Set(['weapons']))
  })

  it('保存する形は id・payload・schemaVersion・createdAt・updatedAt', async () => {
    const fake = fakeFactory()
    const repo = await openWeaponRepository(fake.factory)
    await repo.put(makeStoredWeapon('a'))
    expect(Object.keys(fake.rows.get('a')!).sort()).toEqual([
      'createdAt',
      'id',
      'payload',
      'schemaVersion',
      'updatedAt',
    ])
  })

  it('schemaVersion が 1 でない武器があれば、読み飛ばさずに失敗にする', async () => {
    const repo = await openWeaponRepository(fakeFactory([makeStoredWeapon('a', {}, 2)]).factory)
    await expect(repo.list()).rejects.toMatchObject({ reason: 'unknown' })
  })

  it('構造に反する武器（攻撃力が範囲外）があれば失敗にする', async () => {
    const repo = await openWeaponRepository(
      fakeFactory([makeStoredWeapon('a', { attack: 0 })]).factory,
    )
    await expect(repo.list()).rejects.toMatchObject({ reason: 'unknown' })
  })

  it('payload が壊れている武器があれば失敗にする', async () => {
    const broken = { ...makeStoredWeapon('a'), payload: null } as unknown as StoredWeapon
    const repo = await openWeaponRepository(fakeFactory([broken]).factory)
    await expect(repo.list()).rejects.toMatchObject({ reason: 'unknown' })
  })

  it('現行のマスターに無い ID は構造のエラーではない（読み込める）', async () => {
    const stored = makeStoredWeapon('a', { baseWeaponId: 'wp:gone' as never })
    const repo = await openWeaponRepository(fakeFactory([stored]).factory)
    expect(await repo.list()).toHaveLength(1)
  })
})

// 受入基準 12（保存できないときの原因）
describe('保存の失敗', () => {
  it('indexedDB が無ければ unavailable', async () => {
    await expect(openWeaponRepository(undefined)).rejects.toMatchObject({ reason: 'unavailable' })
  })

  it('書き込みが QuotaExceededError で中断したら quota。保存した内容は変わらない', async () => {
    const fake = fakeFactory([], 'QuotaExceededError')
    const repo = await openWeaponRepository(fake.factory)
    await expect(repo.put(makeStoredWeapon('a'))).rejects.toMatchObject({ reason: 'quota' })
    expect(fake.rows.size).toBe(0)
  })
})
