import { CHARM_STORE, StorageError, openDatabase, runTransaction } from '@/lib/storage/database'
import type { CharmPayload } from '@/lib/charms/types'

/** 端末に保存する護石（010 charm-save のサーバー側と同じ形。userId・version・deletedAt は持たない）。 */
export interface StoredCharm {
  id: string
  payload: CharmPayload
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

export const CHARM_SCHEMA_VERSION = 1

/** 護石の保存先。画面のストアは、これを差し替えてテストする。一覧の並びは呼び出し側で決める。 */
export interface CharmRepository {
  list: () => Promise<StoredCharm[]>
  put: (charm: StoredCharm) => Promise<void>
  delete: (id: string) => Promise<void>
}

function assertSchema(charms: StoredCharm[]): StoredCharm[] {
  // 005 には移行が無い。読み飛ばさずに失敗にする
  if (charms.some((charm) => charm.schemaVersion !== CHARM_SCHEMA_VERSION)) {
    throw new StorageError('unknown')
  }
  return charms
}

/** IndexedDB（データベース `swv`・ストア `charms`）を開く。失敗は `StorageError`。 */
export async function openCharmRepository(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): Promise<CharmRepository> {
  const db = await openDatabase(factory)
  return {
    list: async () =>
      assertSchema(
        await runTransaction(
          db,
          CHARM_STORE,
          'readonly',
          (store) => store.getAll() as IDBRequest<StoredCharm[]>,
        ),
      ),
    put: async (charm) => {
      await runTransaction(db, CHARM_STORE, 'readwrite', (store) => store.put(charm))
    },
    delete: async (id) => {
      await runTransaction(db, CHARM_STORE, 'readwrite', (store) => store.delete(id))
    },
  }
}
