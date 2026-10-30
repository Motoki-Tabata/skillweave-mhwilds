import { http } from '@/lib/http'
import { isRecord, run } from '@/lib/api/result'
import type { ApiResult } from '@/lib/api/result'
import { isCustomWeaponPayload } from '@/lib/api/builds'
import type { components } from '@/lib/api/schema'
import { WEAPON_SCHEMA_VERSION } from '@/lib/weapons/types'
import type { StoredWeapon, WeaponPayload } from '@/lib/weapons/types'

/** 契約の要求の形。payload は端末の武器と同じ `WeaponPayload`（属性の種類は契約では列挙、web では文字列）。 */
export type CreateWeaponRequest = Omit<
  components['schemas']['CreateCustomWeaponRequest'],
  'payload'
> & {
  payload: WeaponPayload
}
export type UpdateWeaponRequest = Omit<
  components['schemas']['UpdateCustomWeaponRequest'],
  'payload'
> & {
  payload: WeaponPayload
}

/** アカウントの個体差のある武器。端末の `StoredWeapon` に行バージョンを加えた形。 */
export type AccountWeapon = StoredWeapon & { version: number }

/** 武器の API の結果。例外にせず、成功と失敗の種類で返す。 */
export type WeaponsResult<T> = ApiResult<T>

/** 武器の API。ストアへ差し替えられる形にして、テストで偽物を渡す。例外は投げない。 */
export interface WeaponsApi {
  list: () => Promise<WeaponsResult<AccountWeapon[]>>
  create: (request: CreateWeaponRequest) => Promise<WeaponsResult<AccountWeapon>>
  update: (id: string, request: UpdateWeaponRequest) => Promise<WeaponsResult<AccountWeapon>>
  remove: (id: string) => Promise<WeaponsResult<true>>
}

/** 応答の形（id・payload・schemaVersion が 1・version・createdAt・updatedAt）を検査する。合わなければ null。 */
export function toAccountWeapon(value: unknown): AccountWeapon | null {
  if (!isRecord(value)) return null
  const { id, payload, schemaVersion, version, createdAt, updatedAt } = value
  if (
    typeof id !== 'string' ||
    !isCustomWeaponPayload(payload) ||
    schemaVersion !== WEAPON_SCHEMA_VERSION ||
    !Number.isInteger(version) ||
    (version as number) < 0 ||
    typeof createdAt !== 'string' ||
    typeof updatedAt !== 'string'
  ) {
    return null
  }
  return {
    id,
    payload: payload as WeaponPayload,
    schemaVersion,
    version: version as number,
    createdAt,
    updatedAt,
  }
}

function toWeaponList(body: unknown): AccountWeapon[] | null {
  if (!Array.isArray(body)) return null
  const weapons: AccountWeapon[] = []
  for (const item of body as unknown[]) {
    const weapon = toAccountWeapon(item)
    if (weapon === null) return null
    weapons.push(weapon)
  }
  return weapons
}

export const weaponsApi: WeaponsApi = {
  list: () => run(() => http.get<unknown>('/api/weapons'), toWeaponList),
  create: (request) => run(() => http.post<unknown>('/api/weapons', request), toAccountWeapon),
  update: (id, request) =>
    run(
      () => http.put<unknown>(`/api/weapons/${encodeURIComponent(id)}`, request),
      toAccountWeapon,
    ),
  remove: (id) =>
    run(
      () => http.delete<unknown>(`/api/weapons/${encodeURIComponent(id)}`),
      () => true as const,
    ),
}
