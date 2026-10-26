/** 端末の IndexedDB（データベース `swv`）。護石と武器の保存層が共有する。 */
export const DB_NAME = 'swv'
/** 版。ストアを足すときに上げる（2: 武器のストア `weapons` を足した）。護石と武器で同じ版を開く。 */
export const DB_VERSION = 2
export const CHARM_STORE = 'charms'
export const WEAPON_STORE = 'weapons'

const STORE_NAMES = [CHARM_STORE, WEAPON_STORE] as const
export type StoreName = (typeof STORE_NAMES)[number]

/** 保存に失敗した原因（screen-design.md 3.4 の文言に対応）。 */
export type StorageFailureReason = 'unavailable' | 'quota' | 'unknown'

export const STORAGE_FAILURE_MESSAGES: Record<StorageFailureReason, string> = {
  unavailable: 'この端末のブラウザでは、端末への保存（IndexedDB）が使えません。',
  quota: '端末の保存容量が足りません。',
  unknown: '端末への保存（IndexedDB）に失敗しました。',
}

export class StorageError extends Error {
  readonly reason: StorageFailureReason

  constructor(reason: StorageFailureReason, cause?: unknown) {
    super(STORAGE_FAILURE_MESSAGES[reason], { cause })
    this.name = 'StorageError'
    this.reason = reason
  }
}

const UNAVAILABLE_ERRORS = new Set(['SecurityError', 'InvalidStateError'])

/** 例外を失敗の原因に変換する（純粋な関数）。 */
export function classifyStorageError(error: unknown): StorageFailureReason {
  if (error instanceof StorageError) return error.reason
  const name =
    typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : ''
  if (name === 'QuotaExceededError') return 'quota'
  if (UNAVAILABLE_ERRORS.has(name)) return 'unavailable'
  return 'unknown'
}

export function toStorageError(error: unknown): StorageError {
  return error instanceof StorageError
    ? error
    : new StorageError(classifyStorageError(error), error)
}

/**
 * データベースを開く。無いストアは作る（新規の端末も、版 1 の端末も同じ処理）。
 * 失敗は `StorageError`。
 */
export function openDatabase(factory: IDBFactory | undefined): Promise<IDBDatabase> {
  if (factory === undefined) return Promise.reject(new StorageError('unavailable'))
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
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' })
        }
      }
    }
    request.onsuccess = () => {
      const db = request.result
      // 別のタブが版を上げようとしたら閉じる（古いタブの接続で blocked にしない）
      db.onversionchange = () => db.close()
      resolve(db)
    }
    // open の失敗は、原因によらず「使えない」として扱う
    request.onerror = () => reject(new StorageError('unavailable', request.error))
    request.onblocked = () => reject(new StorageError('unavailable'))
  })
}

export function runTransaction<T>(
  db: IDBDatabase,
  storeName: StoreName,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(storeName, mode)
      const request = work(transaction.objectStore(storeName))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(toStorageError(transaction.error ?? request.error))
      transaction.onabort = () => reject(toStorageError(transaction.error ?? request.error))
    } catch (error) {
      reject(toStorageError(error))
    }
  })
}
