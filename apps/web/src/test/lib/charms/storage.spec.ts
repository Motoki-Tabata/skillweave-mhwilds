import { describe, expect, it } from 'vitest'
import {
  CharmStorageError,
  STORAGE_FAILURE_MESSAGES,
  classifyStorageError,
  openCharmRepository,
} from '@/lib/charms/storage'
import type { StoredCharm } from '@/lib/charms/storage'

const charm = (id: string, schemaVersion = 1): StoredCharm => ({
  id,
  payload: { rarity: 8, skills: [], slots: [] },
  schemaVersion,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

interface FakeOptions {
  openError?: 'error' | 'blocked' | 'throw'
  /** 書き込みトランザクションを中断させる例外の名前 */
  abortWith?: string
  throwOnTransaction?: string
  seed?: StoredCharm[]
}

/** 必要な範囲だけを模した IDBFactory（実際の IndexedDB は e2e で確かめる）。 */
function fakeFactory(options: FakeOptions = {}) {
  const rows = new Map((options.seed ?? []).map((row) => [row.id, row]))
  const created: string[] = []
  const factory = {
    open: () => {
      if (options.openError === 'throw') throw new DOMException('denied', 'SecurityError')
      const request: Record<string, unknown> = { error: new DOMException('x', 'UnknownError') }
      const db = {
        objectStoreNames: { contains: () => false },
        createObjectStore: (name: string) => created.push(name),
        transaction: (_store: string, mode: string) => {
          if (options.throwOnTransaction) {
            throw new DOMException('closing', options.throwOnTransaction)
          }
          const tx: Record<string, unknown> = {}
          tx.objectStore = () => ({
            getAll: () => finish(tx, mode, { result: [...rows.values()] }),
            put: (row: StoredCharm) =>
              finish(tx, mode, { result: row.id }, () => rows.set(row.id, row)),
            delete: (id: string) => finish(tx, mode, { result: undefined }, () => rows.delete(id)),
          })
          return tx
        },
      }
      queueMicrotask(() => {
        if (options.openError === 'error') {
          ;(request.onerror as () => void)()
        } else if (options.openError === 'blocked') {
          ;(request.onblocked as () => void)()
        } else {
          request.result = db
          ;(request.onupgradeneeded as () => void)()
          ;(request.onsuccess as () => void)()
        }
      })
      return request
    },
  }

  function finish(
    tx: Record<string, unknown>,
    mode: string,
    request: { result: unknown },
    apply: () => void = () => {},
  ) {
    queueMicrotask(() => {
      if (mode === 'readwrite' && options.abortWith) {
        tx.error = new DOMException('fail', options.abortWith)
        ;(tx.onabort as () => void)()
        return
      }
      apply()
      ;(tx.oncomplete as () => void)()
    })
    return request
  }

  return { factory: factory as unknown as IDBFactory, rows, created }
}

// 受入基準 3（端末内の IndexedDB への保存）
describe('openCharmRepository', () => {
  it('ストア charms を作り、登録・一覧・上書き・削除ができる', async () => {
    const fake = fakeFactory()
    const repo = await openCharmRepository(fake.factory)
    expect(fake.created).toEqual(['charms'])
    await repo.put(charm('a'))
    await repo.put(charm('b'))
    expect((await repo.list()).map((c) => c.id)).toEqual(['a', 'b'])
    await repo.put({ ...charm('a'), updatedAt: '2026-02-01T00:00:00.000Z' })
    expect((await repo.list()).find((c) => c.id === 'a')?.updatedAt).toBe(
      '2026-02-01T00:00:00.000Z',
    )
    await repo.delete('a')
    expect((await repo.list()).map((c) => c.id)).toEqual(['b'])
  })

  it('schemaVersion が 1 でない護石があれば、読み飛ばさずに失敗にする', async () => {
    const repo = await openCharmRepository(fakeFactory({ seed: [charm('a', 2)] }).factory)
    await expect(repo.list()).rejects.toMatchObject({ reason: 'unknown' })
  })
})

// 受入基準 11（保存できないときの原因）
describe('保存の失敗', () => {
  it('indexedDB が無ければ unavailable', async () => {
    await expect(openCharmRepository(undefined)).rejects.toMatchObject({ reason: 'unavailable' })
  })

  it('open の失敗・blocked・例外は unavailable', async () => {
    for (const openError of ['error', 'blocked', 'throw'] as const) {
      await expect(openCharmRepository(fakeFactory({ openError }).factory)).rejects.toBeInstanceOf(
        CharmStorageError,
      )
      await expect(openCharmRepository(fakeFactory({ openError }).factory)).rejects.toMatchObject({
        reason: 'unavailable',
      })
    }
  })

  it('書き込みが QuotaExceededError で中断したら quota。保存した内容は変わらない', async () => {
    const fake = fakeFactory({ abortWith: 'QuotaExceededError' })
    const repo = await openCharmRepository(fake.factory)
    await expect(repo.put(charm('a'))).rejects.toMatchObject({ reason: 'quota' })
    expect(fake.rows.size).toBe(0)
  })

  it('それ以外の書き込みの失敗は unknown', async () => {
    const repo = await openCharmRepository(fakeFactory({ abortWith: 'AbortError' }).factory)
    await expect(repo.delete('a')).rejects.toMatchObject({ reason: 'unknown' })
  })

  it('トランザクションを開始できない（InvalidStateError）は unavailable', async () => {
    const repo = await openCharmRepository(
      fakeFactory({ throwOnTransaction: 'InvalidStateError' }).factory,
    )
    await expect(repo.list()).rejects.toMatchObject({ reason: 'unavailable' })
  })
})

describe('classifyStorageError', () => {
  it('例外の名前から原因に変換する', () => {
    expect(classifyStorageError({ name: 'QuotaExceededError' })).toBe('quota')
    expect(classifyStorageError({ name: 'SecurityError' })).toBe('unavailable')
    expect(classifyStorageError({ name: 'InvalidStateError' })).toBe('unavailable')
    expect(classifyStorageError({ name: 'DataError' })).toBe('unknown')
    expect(classifyStorageError(new Error('x'))).toBe('unknown')
    expect(classifyStorageError(null)).toBe('unknown')
    expect(classifyStorageError('x')).toBe('unknown')
  })

  it('CharmStorageError はその原因のまま、文言は画面設計 3.4 のとおり', () => {
    expect(classifyStorageError(new CharmStorageError('quota'))).toBe('quota')
    expect(STORAGE_FAILURE_MESSAGES).toEqual({
      unavailable: 'この端末のブラウザでは、端末への保存（IndexedDB）が使えません。',
      quota: '端末の保存容量が足りません。',
      unknown: '端末への保存（IndexedDB）に失敗しました。',
    })
    expect(new CharmStorageError('unknown').message).toBe(STORAGE_FAILURE_MESSAGES.unknown)
  })
})
