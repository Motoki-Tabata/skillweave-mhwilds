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
export const DB_NAME = 'swv'
export const DB_VERSION = 1
export const CHARM_STORE = 'charms'

/** 保存に失敗した原因（screen-design.md 3.4 の文言に対応）。 */
export type StorageFailureReason = 'unavailable' | 'quota' | 'unknown'

export const STORAGE_FAILURE_MESSAGES: Record<StorageFailureReason, string> = {
  unavailable: 'この端末のブラウザでは、端末への保存（IndexedDB）が使えません。',
  quota: '端末の保存容量が足りません。',
  unknown: '端末への保存（IndexedDB）に失敗しました。',
}

export class CharmStorageError extends Error {
  readonly reason: StorageFailureReason

  constructor(reason: StorageFailureReason, cause?: unknown) {
    super(STORAGE_FAILURE_MESSAGES[reason], { cause })
    this.name = 'CharmStorageError'
    this.reason = reason
  }
}

/** 護石の保存先。画面のストアは、これを差し替えてテストする。一覧の並びは呼び出し側で決める。 */
export interface CharmRepository {
  list: () => Promise<StoredCharm[]>
  put: (charm: StoredCharm) => Promise<void>
  delete: (id: string) => Promise<void>
}

const UNAVAILABLE_ERRORS = new Set(['SecurityError', 'InvalidStateError'])

/** 例外を失敗の原因に変換する（純粋な関数）。 */
export function classifyStorageError(error: unknown): StorageFailureReason {
  if (error instanceof CharmStorageError) return error.reason
  const name =
    typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : ''
  if (name === 'QuotaExceededError') return 'quota'
  if (UNAVAILABLE_ERRORS.has(name)) return 'unavailable'
  return 'unknown'
}

function toStorageError(error: unknown): CharmStorageError {
  return error instanceof CharmStorageError
    ? error
    : new CharmStorageError(classifyStorageError(error), error)
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = factory.open(DB_NAME, DB_VERSION)
    } catch (error) {
      reject(toStorageError(error))
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CHARM_STORE)) {
        db.createObjectStore(CHARM_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    // open の失敗は、原因によらず「使えない」として扱う
    request.onerror = () => reject(new CharmStorageError('unavailable', request.error))
    request.onblocked = () => reject(new CharmStorageError('unavailable'))
  })
}

function runTransaction<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(CHARM_STORE, mode)
      const request = work(transaction.objectStore(CHARM_STORE))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(toStorageError(transaction.error ?? request.error))
      transaction.onabort = () => reject(toStorageError(transaction.error ?? request.error))
    } catch (error) {
      reject(toStorageError(error))
    }
  })
}

function assertSchema(charms: StoredCharm[]): StoredCharm[] {
  // 005 には移行が無い。読み飛ばさずに失敗にする
  if (charms.some((charm) => charm.schemaVersion !== CHARM_SCHEMA_VERSION)) {
    throw new CharmStorageError('unknown')
  }
  return charms
}

/** IndexedDB（データベース `swv`・ストア `charms`）を開く。失敗は `CharmStorageError`。 */
export async function openCharmRepository(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): Promise<CharmRepository> {
  if (factory === undefined) throw new CharmStorageError('unavailable')
  const db = await openDatabase(factory)
  return {
    list: async () =>
      assertSchema(
        await runTransaction(
          db,
          'readonly',
          (store) => store.getAll() as IDBRequest<StoredCharm[]>,
        ),
      ),
    put: async (charm) => {
      await runTransaction(db, 'readwrite', (store) => store.put(charm))
    },
    delete: async (id) => {
      await runTransaction(db, 'readwrite', (store) => store.delete(id))
    },
  }
}
