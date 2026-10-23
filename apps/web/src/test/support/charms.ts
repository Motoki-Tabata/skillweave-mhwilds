import type { StoredCharm } from '@/lib/charms/storage'
import type { CharmPayload } from '@/lib/charms/types'

/** 固定の UUIDv7（先頭が時刻なので、末尾の数字が大きいほど新しい）。 */
export const charmId = (n: number): string =>
  `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`

export function storedCharm(n: number, payload: CharmPayload): StoredCharm {
  return {
    id: charmId(n),
    payload,
    schemaVersion: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  }
}
