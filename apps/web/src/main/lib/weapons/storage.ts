import { StorageError, WEAPON_STORE, openDatabase, runTransaction } from '@/lib/storage/database'
import { validatePayload } from '@/lib/weapons/validate'
import { WEAPON_SCHEMA_VERSION } from '@/lib/weapons/types'
import type { StoredWeapon } from '@/lib/weapons/types'

/** 武器の保存先。画面のストアは、これを差し替えてテストする。一覧の並びは呼び出し側で決める。 */
export interface WeaponRepository {
  list: () => Promise<StoredWeapon[]>
  put: (weapon: StoredWeapon) => Promise<void>
  delete: (id: string) => Promise<void>
}

function isValidStored(weapon: unknown): boolean {
  if (typeof weapon !== 'object' || weapon === null) return false
  const { schemaVersion, payload } = weapon as Partial<StoredWeapon>
  if (schemaVersion !== WEAPON_SCHEMA_VERSION) return false
  if (typeof payload !== 'object' || payload === null) return false
  try {
    return validatePayload(payload).length === 0
  } catch {
    return false
  }
}

function assertValid(weapons: StoredWeapon[]): StoredWeapon[] {
  // 移行が無い。読み飛ばさずに失敗にする
  if (!weapons.every(isValidStored)) throw new StorageError('unknown')
  return weapons
}

/** IndexedDB（データベース `swv`・ストア `weapons`）を開く。失敗は `StorageError`。 */
export async function openWeaponRepository(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): Promise<WeaponRepository> {
  const db = await openDatabase(factory)
  return {
    list: async () =>
      assertValid(
        await runTransaction(
          db,
          WEAPON_STORE,
          'readonly',
          (store) => store.getAll() as IDBRequest<StoredWeapon[]>,
        ),
      ),
    put: async (weapon) => {
      await runTransaction(db, WEAPON_STORE, 'readwrite', (store) => store.put(weapon))
    },
    delete: async (id) => {
      await runTransaction(db, WEAPON_STORE, 'readwrite', (store) => store.delete(id))
    },
  }
}
