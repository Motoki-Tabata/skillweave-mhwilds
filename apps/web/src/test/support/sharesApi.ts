import type { Share, SharedBuild, SharesApi } from '@/lib/api/shares'
import type { ApiFailure } from '@/lib/api/result'

export type SharesApiOperation = 'list' | 'create' | 'revoke' | 'view'

export interface MemorySharesApi extends SharesApi {
  /** サーバーにある有効な共有（コピー。ID の降順） */
  snapshot: () => Share[]
  /** 別の端末での作成を真似る（行を直接置く） */
  seed: (share: Share) => void
  /** 閲覧できる共有を置く（短縮 ID で引く） */
  seedShared: (shortId: string, shared: SharedBuild) => void
  /** 元の構成の有無を決める関数を差し替える（既定はすべてある） */
  setBuildExists: (exists: (buildId: string) => boolean) => void
  /** 次の呼び出しから、その操作を指定の失敗で返す（null で戻す） */
  failWith: (operation: SharesApiOperation, failure: ApiFailure | null) => void
  /** その操作の応答を、返された関数を呼ぶまで保留する（古い応答のテスト用） */
  hold: (operation: SharesApiOperation) => () => void
  calls: Record<SharesApiOperation, number>
  /** create に渡された要求（受け取った順・コピー） */
  created: unknown[]
}

/**
 * メモリ上の SharesApi。有効な共有は構成につき1つ（2回目は既存を返す）、取り消しは冪等。
 * 短縮 ID は連番から作る（決定的）。
 */
export function createMemorySharesApi(initial: Share[] = []): MemorySharesApi {
  const rows = new Map(initial.map((share) => [share.id, structuredClone(share)]))
  const shared = new Map<string, SharedBuild>()
  const failures = new Map<SharesApiOperation, ApiFailure>()
  const holds = new Map<SharesApiOperation, Promise<void>>()
  const calls: Record<SharesApiOperation, number> = { list: 0, create: 0, revoke: 0, view: 0 }
  const created: unknown[] = []
  let buildExists = (_buildId: string): boolean => true
  let serial = 0

  const snapshot = (): Share[] =>
    Array.from(rows.values(), (share) => structuredClone(share)).sort((a, b) =>
      a.id < b.id ? 1 : -1,
    )

  async function enter(operation: SharesApiOperation) {
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
      created.push(body)
      const failure = await enter('create')
      if (failure) return failure
      if (!buildExists(body.buildId)) return { kind: 'notFound' }
      const existing = Array.from(rows.values()).find((row) => row.buildId === body.buildId)
      if (existing)
        return { kind: 'ok', value: { share: structuredClone(existing), created: false } }
      if (rows.has(body.id)) return { kind: 'conflict' }
      serial += 1
      const share: Share = {
        id: body.id,
        shortId: `Fake${String(serial).padStart(8, '0')}`,
        buildId: body.buildId,
        name: `共有${serial}`,
        createdAt: '2026-10-01T00:00:00Z',
      }
      rows.set(share.id, share)
      return { kind: 'ok', value: { share: structuredClone(share), created: true } }
    },
    revoke: async (id) => {
      const failure = await enter('revoke')
      if (failure) return failure
      rows.delete(id)
      return { kind: 'ok', value: true }
    },
    view: async (shortId) => {
      const failure = await enter('view')
      if (failure) return failure
      const found = shared.get(shortId)
      return found ? { kind: 'ok', value: structuredClone(found) } : { kind: 'notFound' }
    },
    snapshot,
    seed: (share) => {
      rows.set(share.id, structuredClone(share))
    },
    seedShared: (shortId, value) => {
      shared.set(shortId, structuredClone(value))
    },
    setBuildExists: (exists) => {
      buildExists = exists
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

/** 共有の行（サーバーの応答の形）。ID は n が大きいほど新しい。 */
export function savedShare(n: number, overrides: Partial<Share> = {}): Share {
  return {
    id: `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`,
    shortId: `Ab3dE6gH9j${String(n).padStart(2, '0')}`,
    buildId: `01900000-0000-7000-8000-${String(n + 100).padStart(12, '0')}`,
    name: `構成${n}`,
    createdAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}
