import { StorageError } from '@/lib/storage/database'
import type { StorageFailureReason } from '@/lib/storage/database'
import type { CharmRepository, StoredCharm } from '@/lib/charms/storage'

export interface MemoryCharmRepository extends CharmRepository {
  /** 保存されている護石（コピー） */
  snapshot: () => StoredCharm[]
  /** 次の操作から失敗させる（null で戻す） */
  failWith: (operation: 'list' | 'put' | 'delete', reason: StorageFailureReason | null) => void
}

/** メモリ上の CharmRepository。値は structuredClone で受け渡し、参照の共有を起こさない。 */
export function createMemoryCharmRepository(initial: StoredCharm[] = []): MemoryCharmRepository {
  const store = new Map(initial.map((charm) => [charm.id, structuredClone(charm)]))
  const failures = new Map<string, StorageFailureReason>()
  const check = (operation: string): void => {
    const reason = failures.get(operation)
    if (reason !== undefined) throw new StorageError(reason)
  }
  return {
    list: async () => {
      check('list')
      return Array.from(store.values(), (charm) => structuredClone(charm))
    },
    put: async (charm) => {
      check('put')
      store.set(charm.id, structuredClone(charm))
    },
    delete: async (id) => {
      check('delete')
      store.delete(id)
    },
    snapshot: () => Array.from(store.values(), (charm) => structuredClone(charm)),
    failWith: (operation, reason) => {
      if (reason === null) failures.delete(operation)
      else failures.set(operation, reason)
    },
  }
}
