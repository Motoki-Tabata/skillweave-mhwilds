import type { Build, BuildPayload } from '@/lib/api/builds'

/** 固定の UUIDv7（先頭が時刻なので、末尾の数字が大きいほど新しい）。 */
export const buildId = (n: number): string =>
  `01900000-0000-7000-8000-${String(n).padStart(12, '0')}`

/** マスターの武器を使い、防具・装飾品・スキルを持たない最小の payload。 */
export function minimalPayload(overrides: Partial<BuildPayload> = {}): BuildPayload {
  return {
    weapon: { kind: 'master', weaponId: 'wp:great-sword:1' },
    armor: { head: null, chest: null, arms: null, waist: null, legs: null },
    charm: null,
    decorations: [],
    skills: [],
    freeSlots: [],
    activeConditionIds: [],
    ...overrides,
  }
}

/** 保存した構成（サーバーの応答の形）。 */
export function savedBuild(
  n: number,
  overrides: Partial<Omit<Build, 'id'>> & { payload?: BuildPayload } = {},
): Build {
  return {
    id: buildId(n),
    name: `構成${n}`,
    masterVersion: 'test-1',
    payload: minimalPayload(),
    schemaVersion: 1,
    version: 0,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}
