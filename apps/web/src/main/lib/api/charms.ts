import { http } from '@/lib/http'
import { isNumber, isRecord, run } from '@/lib/api/result'
import type { ApiFailure, ApiFailureCause, ApiResult } from '@/lib/api/result'
import type { components } from '@/lib/api/schema'
import type { StoredCharm } from '@/lib/charms/storage'
import { CHARM_SCHEMA_VERSION } from '@/lib/charms/storage'
import type { CharmPayload } from '@/lib/charms/types'
import type { Slot } from '@swv/data'

type SkillId = CharmPayload['skills'][number]['skillId']

export type CreateCharmRequest = components['schemas']['CreateCharmRequest']
export type UpdateCharmRequest = components['schemas']['UpdateCharmRequest']

/** アカウントの護石。端末の `StoredCharm` に行バージョンを加えた形。 */
export type AccountCharm = StoredCharm & { version: number }

/** 失敗の原因。`network` は fetch が届かない、`server` はそれ以外（status・応答の形の不正）。 */
export type CharmsFailureCause = ApiFailureCause

/** 画面に出す原因の文言。 */
export { API_FAILURE_MESSAGES as CHARMS_FAILURE_MESSAGES } from '@/lib/api/result'

export type CharmsFailure = ApiFailure

/** API の結果。例外にせず、成功と失敗の種類で返す。 */
export type CharmsResult<T> = ApiResult<T>

/** 護石の API。ストアへ差し替えられる形にして、テストで偽物を渡す。例外は投げない。 */
export interface CharmsApi {
  list: () => Promise<CharmsResult<AccountCharm[]>>
  create: (request: CreateCharmRequest) => Promise<CharmsResult<AccountCharm>>
  update: (id: string, request: UpdateCharmRequest) => Promise<CharmsResult<AccountCharm>>
  remove: (id: string) => Promise<CharmsResult<true>>
}

/** 護石の内容の形（rarity・skills・slots）を検査する。合わなければ null。構成の護石の写しの検査にも使う。 */
export function toPayload(value: unknown): CharmPayload | null {
  if (!isRecord(value) || !isNumber(value.rarity)) return null
  const { skills, slots } = value
  if (!Array.isArray(skills) || !Array.isArray(slots)) return null
  const parsedSkills: CharmPayload['skills'] = []
  for (const skill of skills as unknown[]) {
    if (!isRecord(skill) || typeof skill.skillId !== 'string' || !isNumber(skill.level)) return null
    parsedSkills.push({ skillId: skill.skillId as SkillId, level: skill.level })
  }
  const parsedSlots: CharmPayload['slots'] = []
  for (const slot of slots as unknown[]) {
    if (
      !isRecord(slot) ||
      (slot.target !== 'weapon' && slot.target !== 'armor') ||
      !isNumber(slot.level)
    ) {
      return null
    }
    parsedSlots.push({ target: slot.target, level: slot.level as Slot['level'] })
  }
  return { rarity: value.rarity, skills: parsedSkills, slots: parsedSlots }
}

/** 応答の形（id・payload・schemaVersion が 1・version・createdAt・updatedAt）を検査する。合わなければ null。 */
export function toAccountCharm(value: unknown): AccountCharm | null {
  if (!isRecord(value)) return null
  const { id, schemaVersion, version, createdAt, updatedAt } = value
  const payload = toPayload(value.payload)
  if (
    typeof id !== 'string' ||
    payload === null ||
    schemaVersion !== CHARM_SCHEMA_VERSION ||
    !Number.isInteger(version) ||
    (version as number) < 0 ||
    typeof createdAt !== 'string' ||
    typeof updatedAt !== 'string'
  ) {
    return null
  }
  return { id, payload, schemaVersion, version: version as number, createdAt, updatedAt }
}

function toCharmList(body: unknown): AccountCharm[] | null {
  if (!Array.isArray(body)) return null
  const charms: AccountCharm[] = []
  for (const item of body as unknown[]) {
    const charm = toAccountCharm(item)
    if (charm === null) return null
    charms.push(charm)
  }
  return charms
}

export const charmsApi: CharmsApi = {
  list: () => run(() => http.get<unknown>('/api/charms'), toCharmList),
  create: (request) => run(() => http.post<unknown>('/api/charms', request), toAccountCharm),
  update: (id, request) =>
    run(() => http.put<unknown>(`/api/charms/${encodeURIComponent(id)}`, request), toAccountCharm),
  remove: (id) =>
    run(
      () => http.delete<unknown>(`/api/charms/${encodeURIComponent(id)}`),
      () => true as const,
    ),
}
