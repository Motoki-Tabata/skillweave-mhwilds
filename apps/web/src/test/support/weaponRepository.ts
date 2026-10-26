import { StorageError } from '@/lib/storage/database'
import type { StorageFailureReason } from '@/lib/storage/database'
import type { WeaponRepository } from '@/lib/weapons/storage'
import type { StoredWeapon } from '@/lib/weapons/types'

export interface MemoryWeaponRepository extends WeaponRepository {
  /** 保存されている武器（コピー） */
  snapshot: () => StoredWeapon[]
  /** 次の操作から失敗させる（null で戻す） */
  failWith: (operation: 'list' | 'put' | 'delete', reason: StorageFailureReason | null) => void
}

/** メモリ上の WeaponRepository。値は structuredClone で受け渡し、参照の共有を起こさない。 */
export function createMemoryWeaponRepository(initial: StoredWeapon[] = []): MemoryWeaponRepository {
  const store = new Map(initial.map((weapon) => [weapon.id, structuredClone(weapon)]))
  const failures = new Map<string, StorageFailureReason>()
  const check = (operation: string): void => {
    const reason = failures.get(operation)
    if (reason !== undefined) throw new StorageError(reason)
  }
  return {
    list: async () => {
      check('list')
      return Array.from(store.values(), (weapon) => structuredClone(weapon))
    },
    put: async (weapon) => {
      check('put')
      store.set(weapon.id, structuredClone(weapon))
    },
    delete: async (id) => {
      check('delete')
      store.delete(id)
    },
    snapshot: () => Array.from(store.values(), (weapon) => structuredClone(weapon)),
    failWith: (operation, reason) => {
      if (reason === null) failures.delete(operation)
      else failures.set(operation, reason)
    },
  }
}
