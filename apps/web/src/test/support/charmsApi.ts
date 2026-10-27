import type { CharmPayload } from '@/lib/charms/types'
import type { AccountCharm, CharmsApi, CharmsResult } from '@/lib/api/charms'

export type CharmsApiOperation = 'list' | 'create' | 'update' | 'remove'

export interface MemoryCharmsApi extends CharmsApi {
  /** サーバーに保存されている護石（コピー。ID の降順） */
  snapshot: () => AccountCharm[]
  /** 別の端末での変更を真似る（行を直接置く。行バージョンは呼び出し側で決める） */
  seed: (charm: AccountCharm) => void
  /** 別の端末での削除を真似る */
  drop: (id: string) => void
  /** 次の呼び出しから、その操作を指定の失敗で返す（null で戻す） */
  failWith: (
    operation: CharmsApiOperation,
    failure: Exclude<CharmsResult<never>, { kind: 'ok' }> | null,
  ) => void
  /** その操作の応答を、返された関数を呼ぶまで保留する（古い応答のテスト用） */
  hold: (operation: CharmsApiOperation) => () => void
  /** 呼び出しの回数 */
  calls: Record<CharmsApiOperation, number>
}

/** メモリ上の CharmsApi。サーバーと同じ行バージョン・降順・冪等な削除の振る舞いを持つ。 */
export function createMemoryCharmsApi(initial: AccountCharm[] = []): MemoryCharmsApi {
  const rows = new Map(initial.map((charm) => [charm.id, structuredClone(charm)]))
  const failures = new Map<CharmsApiOperation, Exclude<CharmsResult<never>, { kind: 'ok' }>>()
  const holds = new Map<CharmsApiOperation, Promise<void>>()
  const calls: Record<CharmsApiOperation, number> = { list: 0, create: 0, update: 0, remove: 0 }

  const snapshot = (): AccountCharm[] =>
    Array.from(rows.values(), (charm) => structuredClone(charm)).sort((a, b) =>
      a.id < b.id ? 1 : -1,
    )

  async function enter(operation: CharmsApiOperation) {
    calls[operation] += 1
    await holds.get(operation)
    return failures.get(operation) ?? null
  }

  return {
    list: async () => {
      const failure = await enter('list')
      return failure ?? { kind: 'ok', value: snapshot() }
    },
    create: async (request) => {
      const failure = await enter('create')
      if (failure) return failure
      if (rows.has(request.id)) return { kind: 'conflict' }
      const now = new Date().toISOString()
      const row: AccountCharm = {
        id: request.id,
        payload: structuredClone(request.payload) as unknown as CharmPayload,
        schemaVersion: request.schemaVersion,
        version: 0,
        createdAt: now,
        updatedAt: now,
      }
      rows.set(row.id, row)
      return { kind: 'ok', value: structuredClone(row) }
    },
    update: async (id, request) => {
      const failure = await enter('update')
      if (failure) return failure
      const row = rows.get(id)
      if (row === undefined) return { kind: 'notFound' }
      if (row.version !== request.version) return { kind: 'conflict' }
      const next: AccountCharm = {
        ...row,
        payload: structuredClone(request.payload) as unknown as CharmPayload,
        version: row.version + 1,
        updatedAt: new Date().toISOString(),
      }
      rows.set(id, next)
      return { kind: 'ok', value: structuredClone(next) }
    },
    remove: async (id) => {
      const failure = await enter('remove')
      if (failure) return failure
      rows.delete(id)
      return { kind: 'ok', value: true }
    },
    snapshot,
    seed: (charm) => {
      rows.set(charm.id, structuredClone(charm))
    },
    drop: (id) => {
      rows.delete(id)
    },
    failWith: (operation, failure) => {
      if (failure === null) failures.delete(operation)
      else failures.set(operation, failure)
    },
    hold: (operation) => {
      let release = (): void => {}
      holds.set(
        operation,
        new Promise<void>((resolve) => {
          release = () => {
            holds.delete(operation)
            resolve()
          }
        }),
      )
      return release
    },
    calls,
  }
}

/** 偽のアカウントの護石（行バージョン付き）。 */
export function accountCharm(stored: Omit<AccountCharm, 'version'>, version = 0): AccountCharm {
  return { ...stored, version }
}
