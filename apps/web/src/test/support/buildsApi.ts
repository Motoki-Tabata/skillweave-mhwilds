import type { Build, BuildsApi, BuildsResult } from '@/lib/api/builds'

export type BuildsApiOperation = 'list' | 'create' | 'rename' | 'remove'

export interface MemoryBuildsApi extends BuildsApi {
  /** サーバーに保存されている構成（コピー。ID の降順） */
  snapshot: () => Build[]
  /** 別の端末での変更を真似る（行を直接置く。行バージョンは呼び出し側で決める） */
  seed: (build: Build) => void
  /** 別の端末での削除を真似る */
  drop: (id: string) => void
  /** 次の呼び出しから、その操作を指定の失敗で返す（null で戻す） */
  failWith: (
    operation: BuildsApiOperation,
    failure: Exclude<BuildsResult<never>, { kind: 'ok' }> | null,
  ) => void
  /** その操作の応答を、返された関数を呼ぶまで保留する（古い応答のテスト用） */
  hold: (operation: BuildsApiOperation) => () => void
  /** 呼び出しの回数 */
  calls: Record<BuildsApiOperation, number>
  /** create に渡された要求（受け取った順・コピー） */
  created: unknown[]
}

/**
 * メモリ上の BuildsApi。サーバーと同じ行バージョン・降順・冪等な削除の振る舞いを持つ。
 * 要求は structuredClone して受け取る（リアクティブなプロキシを渡すと DataCloneError になる）。
 */
export function createMemoryBuildsApi(initial: Build[] = []): MemoryBuildsApi {
  const rows = new Map(initial.map((build) => [build.id, structuredClone(build)]))
  const failures = new Map<BuildsApiOperation, Exclude<BuildsResult<never>, { kind: 'ok' }>>()
  const holds = new Map<BuildsApiOperation, Promise<void>>()
  const calls: Record<BuildsApiOperation, number> = { list: 0, create: 0, rename: 0, remove: 0 }
  const created: unknown[] = []

  const snapshot = (): Build[] =>
    Array.from(rows.values(), (build) => structuredClone(build)).sort((a, b) =>
      a.id < b.id ? 1 : -1,
    )

  async function enter(operation: BuildsApiOperation) {
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
      const body = structuredClone(request)
      const failure = await enter('create')
      if (failure) return failure
      created.push(body)
      if (rows.has(body.id)) return { kind: 'conflict' }
      const now = '2026-10-01T00:00:00Z'
      const row: Build = {
        id: body.id,
        name: body.name,
        masterVersion: body.masterVersion,
        payload: body.payload,
        schemaVersion: body.schemaVersion,
        version: 0,
        createdAt: now,
        updatedAt: now,
      }
      rows.set(row.id, row)
      return { kind: 'ok', value: structuredClone(row) }
    },
    rename: async (id, request) => {
      const body = structuredClone(request)
      const failure = await enter('rename')
      if (failure) return failure
      const row = rows.get(id)
      if (row === undefined) return { kind: 'notFound' }
      if (row.version !== body.version) return { kind: 'conflict' }
      const next: Build = { ...row, name: body.name, version: row.version + 1 }
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
    seed: (build) => {
      rows.set(build.id, structuredClone(build))
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
    created,
  }
}
