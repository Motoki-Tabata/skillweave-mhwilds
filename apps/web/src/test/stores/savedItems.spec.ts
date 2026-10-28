import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineStore } from 'pinia'
import { fakeAuthApi, loggedInAuth, newPinia, restoreStubs, stubBackend } from '../support/mount'
import { useAuthStore } from '@/stores/auth'
import { useSavedItems } from '@/stores/savedItems'
import type { SavedItem } from '@/stores/savedItems'

interface Payload {
  name: string
}
type Item = SavedItem<Payload>

function item(n: number): Item {
  const id = `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`
  return { id, payload: { name: `n${n}` }, schemaVersion: 1, createdAt: 't', updatedAt: 't' }
}

function memoryRepository(initial: Item[]) {
  const store = new Map(initial.map((i) => [i.id, i]))
  return {
    list: async () => [...store.values()],
    put: async (i: Item) => {
      store.set(i.id, i)
    },
    delete: async (id: string) => {
      store.delete(id)
    },
  }
}

// API を渡さずに使うテスト用のストア
const useTestStore = defineStore('savedItemsTest', () => {
  const saved = useSavedItems<Item, Payload>({
    plainPayload: (p) => ({ name: p.name }),
    schemaVersion: 1,
    openDefault: async () => memoryRepository([]),
    noun: 'テスト',
  })
  return { ...saved }
})

describe('useSavedItems（API なし）', () => {
  beforeEach(() => stubBackend())
  afterEach(restoreStubs)

  // AC-6・AC-13 (1)
  it('認証の判定が解決しないままでも、端末の一覧を読み終える', async () => {
    const pinia = newPinia()
    const auth = useAuthStore(pinia)
    auth.setApi(fakeAuthApi({ fetchCurrentUser: () => new Promise(() => undefined) }))
    const store = useTestStore(pinia)
    store.setRepositoryOpener(async () => memoryRepository([item(1), item(2)]))
    await store.ensureLoaded()
    expect(store.status).toBe('ready')
    expect(store.source).toBe('device')
    expect(store.items.map((i) => i.payload.name)).toEqual(['n2', 'n1'])
  })

  // AC-6・AC-13 (2)
  it('ログイン済みでも端末のまま、読み終えた後に 401 になっても、一覧と状態を変えない', async () => {
    const pinia = newPinia()
    const auth = useAuthStore(pinia)
    auth.setApi(loggedInAuth())
    await auth.initialize()
    const store = useTestStore(pinia)
    store.setRepositoryOpener(async () => memoryRepository([item(1)]))
    await store.ensureLoaded()
    auth.expire()
    expect(store.status).toBe('ready')
    expect(store.source).toBe('device')
    expect(store.items).toHaveLength(1)
  })

  // AC-8・AC-13 (3)
  it('削除の応答を待つ間は、同じ ID の削除を受け付けず、保存先の delete は1回だけ', async () => {
    const pinia = newPinia()
    const base = memoryRepository([item(1)])
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const del = vi.fn(async (id: string) => {
      await gate
      await base.delete(id)
    })
    const store = useTestStore(pinia)
    store.setRepositoryOpener(async () => ({ ...base, delete: del }))
    await store.ensureLoaded()
    const first = store.remove(item(1).id)
    expect(await store.remove(item(1).id)).toBe('failed')
    release()
    expect(await first).toBe('saved')
    expect(del).toHaveBeenCalledTimes(1)
    expect(store.items).toHaveLength(0)
  })
})
