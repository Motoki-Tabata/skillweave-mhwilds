import { describe, expect, it } from 'vitest'
import {
  DB_NAME,
  DB_VERSION,
  StorageError,
  classifyStorageError,
  openDatabase,
} from '@/lib/storage/database'

interface FakeDb {
  objectStoreNames: { contains: (name: string) => boolean }
  createObjectStore: (name: string, options: unknown) => void
  onversionchange?: () => void
  close: () => void
}

/** 既存のストアを持つ端末（版 0 は空、版 1 は charms）を模した IDBFactory。 */
function fakeFactory(existing: string[]) {
  const stores = new Set(existing)
  const calls: { name: string; version: number }[] = []
  const state = { closed: false }
  const db: FakeDb = {
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore: (name) => stores.add(name),
    close: () => {
      state.closed = true
    },
  }
  const factory = {
    open: (name: string, version: number) => {
      calls.push({ name, version })
      const request: Record<string, unknown> = { result: db }
      queueMicrotask(() => {
        ;(request.onupgradeneeded as () => void)()
        ;(request.onsuccess as () => void)()
      })
      return request
    },
  }
  return { factory: factory as unknown as IDBFactory, stores, calls, db, state }
}

// 受入基準 3（端末内の IndexedDB への保存。護石と武器が同じ版を開く）
describe('openDatabase', () => {
  it('版 2 でデータベース swv を開く', async () => {
    const fake = fakeFactory([])
    await openDatabase(fake.factory)
    expect(fake.calls).toEqual([{ name: 'swv', version: 2 }])
    expect([DB_NAME, DB_VERSION]).toEqual(['swv', 2])
  })

  it('新規の端末（版 0 → 2）では charms と weapons の両方を作る', async () => {
    const fake = fakeFactory([])
    await openDatabase(fake.factory)
    expect([...fake.stores].sort()).toEqual(['charms', 'weapons'])
  })

  it('005 の端末（版 1 → 2）では既存の charms を作り直さず、weapons だけを足す', async () => {
    const fake = fakeFactory(['charms'])
    const created: string[] = []
    const original = fake.db.createObjectStore
    fake.db.createObjectStore = (name, options) => {
      created.push(name)
      original(name, options)
    }
    await openDatabase(fake.factory)
    expect(created).toEqual(['weapons'])
  })

  it('別のタブが版を上げようとしたら接続を閉じる（onversionchange）', async () => {
    const fake = fakeFactory([])
    const db = (await openDatabase(fake.factory)) as unknown as FakeDb
    expect(fake.state.closed).toBe(false)
    db.onversionchange?.()
    expect(fake.state.closed).toBe(true)
  })

  it('indexedDB が無ければ unavailable', async () => {
    await expect(openDatabase(undefined)).rejects.toMatchObject({ reason: 'unavailable' })
  })
})

describe('classifyStorageError', () => {
  it('StorageError はその原因のまま', () => {
    expect(classifyStorageError(new StorageError('quota'))).toBe('quota')
    expect(new StorageError('quota').name).toBe('StorageError')
  })
})
