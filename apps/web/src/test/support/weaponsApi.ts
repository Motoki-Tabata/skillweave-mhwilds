import type { WeaponPayload } from '@/lib/weapons/types'
import type { AccountWeapon, WeaponsApi, WeaponsResult } from '@/lib/api/weapons'

export type WeaponsApiOperation = 'list' | 'create' | 'update' | 'remove'

export interface MemoryWeaponsApi extends WeaponsApi {
  /** サーバーに保存されている武器（コピー。ID の降順） */
  snapshot: () => AccountWeapon[]
  /** 別の端末での変更を真似る（行を直接置く。行バージョンは呼び出し側で決める） */
  seed: (weapon: AccountWeapon) => void
  /** 別の端末での削除を真似る */
  drop: (id: string) => void
  /** 次の呼び出しから、その操作を指定の失敗で返す（null で戻す） */
  failWith: (
    operation: WeaponsApiOperation,
    failure: Exclude<WeaponsResult<never>, { kind: 'ok' }> | null,
  ) => void
  /** その操作の応答を、返された関数を呼ぶまで保留する（古い応答のテスト用） */
  hold: (operation: WeaponsApiOperation) => () => void
  /** 指定の ID の作成だけを指定の失敗で返す（null で戻す） */
  failCreateOf: (id: string, failure: Exclude<WeaponsResult<never>, { kind: 'ok' }> | null) => void
  /** 作成の要求の記録（送った順） */
  createRequests: { id: string; payload: unknown; schemaVersion: number }[]
  /** 呼び出しの回数 */
  calls: Record<WeaponsApiOperation, number>
}

/** メモリ上の WeaponsApi。サーバーと同じ行バージョン・降順・冪等な削除の振る舞いを持つ。 */
export function createMemoryWeaponsApi(initial: AccountWeapon[] = []): MemoryWeaponsApi {
  const rows = new Map(initial.map((weapon) => [weapon.id, structuredClone(weapon)]))
  const failures = new Map<WeaponsApiOperation, Exclude<WeaponsResult<never>, { kind: 'ok' }>>()
  const createFailures = new Map<string, Exclude<WeaponsResult<never>, { kind: 'ok' }>>()
  const createRequests: { id: string; payload: unknown; schemaVersion: number }[] = []
  const holds = new Map<WeaponsApiOperation, Promise<void>>()
  const calls: Record<WeaponsApiOperation, number> = { list: 0, create: 0, update: 0, remove: 0 }

  const snapshot = (): AccountWeapon[] =>
    Array.from(rows.values(), (weapon) => structuredClone(weapon)).sort((a, b) =>
      a.id < b.id ? 1 : -1,
    )

  async function enter(operation: WeaponsApiOperation) {
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
      createRequests.push(structuredClone(request))
      const failure = await enter('create')
      if (failure) return failure
      const failureOfId = createFailures.get(request.id)
      if (failureOfId) return failureOfId
      if (rows.has(request.id)) return { kind: 'conflict' }
      const now = new Date().toISOString()
      const row: AccountWeapon = {
        id: request.id,
        payload: structuredClone(request.payload) as unknown as WeaponPayload,
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
      const next: AccountWeapon = {
        ...row,
        payload: structuredClone(request.payload) as unknown as WeaponPayload,
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
    seed: (weapon) => {
      rows.set(weapon.id, structuredClone(weapon))
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
    failCreateOf: (id, failure) => {
      if (failure === null) createFailures.delete(id)
      else createFailures.set(id, failure)
    },
    createRequests,
    calls,
  }
}

/** 偽のアカウントの武器（行バージョン付き）。 */
export function accountWeapon(stored: Omit<AccountWeapon, 'version'>, version = 0): AccountWeapon {
  return { ...stored, version }
}
