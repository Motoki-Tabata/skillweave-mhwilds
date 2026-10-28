import { http } from '@/lib/http'
import { toPayload } from '@/lib/api/charms'
import { isNumber, isRecord, run } from '@/lib/api/result'
import type { ApiResult } from '@/lib/api/result'
import type { components } from '@/lib/api/schema'

export type Build = components['schemas']['Build']
export type BuildPayload = components['schemas']['BuildPayload']
export type BuildWeapon = components['schemas']['BuildWeapon']
export type CustomWeaponPayload = components['schemas']['CustomWeaponPayload']
export type CreateBuildRequest = components['schemas']['CreateBuildRequest']
export type RenameBuildRequest = components['schemas']['RenameBuildRequest']

/** 構成の API の結果（護石と同じ種類）。 */
export type BuildsResult<T> = ApiResult<T>

/** 構成の API。ストアへ差し替えられる形にして、テストで偽物を渡す。例外は投げない。 */
export interface BuildsApi {
  list: () => Promise<BuildsResult<Build[]>>
  create: (request: CreateBuildRequest) => Promise<BuildsResult<Build>>
  rename: (id: string, request: RenameBuildRequest) => Promise<BuildsResult<Build>>
  remove: (id: string) => Promise<BuildsResult<true>>
}

export const BUILD_SCHEMA_VERSION = 1

const ARMOR_PARTS = ['head', 'chest', 'arms', 'waist', 'legs'] as const
const SLOT_OWNERS = new Set(['weapon', 'head', 'chest', 'arms', 'waist', 'legs', 'charm'])

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isArrayOf(value: unknown, check: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && (value as unknown[]).every(check)
}

function isSlotRef(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.owner === 'string' &&
    SLOT_OWNERS.has(value.owner) &&
    Number.isInteger(value.index)
  )
}

function isWeaponSlot(value: unknown): boolean {
  return isRecord(value) && value.target === 'weapon' && isNumber(value.level)
}

function isElement(value: unknown): boolean {
  if (value === undefined) return true
  return isRecord(value) && typeof value.type === 'string' && isNumber(value.value)
}

function isCustomWeaponPayload(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.baseWeaponId === 'string' &&
    typeof value.name === 'string' &&
    isNumber(value.attack) &&
    isNumber(value.affinity) &&
    isElement(value.element) &&
    isArrayOf(value.slots, isWeaponSlot) &&
    isStringOrNull(value.seriesBonusId) &&
    isStringOrNull(value.groupBonusId)
  )
}

function isBuildWeapon(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (value.kind === 'master') return typeof value.weaponId === 'string'
  if (value.kind === 'custom') {
    return typeof value.id === 'string' && isCustomWeaponPayload(value.payload)
  }
  return false
}

function isBuildArmor(value: unknown): boolean {
  return isRecord(value) && ARMOR_PARTS.every((part) => isStringOrNull(value[part]))
}

function isBuildCharm(value: unknown): boolean {
  if (value === null) return true
  return isRecord(value) && typeof value.id === 'string' && toPayload(value.payload) !== null
}

function isBuildDecoration(value: unknown): boolean {
  return isRecord(value) && typeof value.decorationId === 'string' && isSlotRef(value.slot)
}

function isBuildSkill(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.skillId === 'string' &&
    isNumber(value.level) &&
    isNumber(value.rawLevel)
  )
}

function isString(value: unknown): boolean {
  return typeof value === 'string'
}

function isBuildPayload(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBuildWeapon(value.weapon) &&
    isBuildArmor(value.armor) &&
    isBuildCharm(value.charm) &&
    isArrayOf(value.decorations, isBuildDecoration) &&
    isArrayOf(value.skills, isBuildSkill) &&
    isArrayOf(value.freeSlots, isSlotRef) &&
    isArrayOf(value.activeConditionIds, isString)
  )
}

function hasBuildFields(value: Record<string, unknown>): boolean {
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.masterVersion === 'string' &&
    value.schemaVersion === BUILD_SCHEMA_VERSION &&
    Number.isInteger(value.version) &&
    (value.version as number) >= 0 &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

/** 応答の形（上位の項目・schemaVersion が 1・payload の各項目の有無と型）を検査する。合わなければ null。 */
export function toBuild(value: unknown): Build | null {
  if (!isRecord(value) || !hasBuildFields(value) || !isBuildPayload(value.payload)) return null
  return value as unknown as Build
}

function toBuildList(body: unknown): Build[] | null {
  if (!Array.isArray(body)) return null
  const builds: Build[] = []
  for (const item of body as unknown[]) {
    const build = toBuild(item)
    if (build === null) return null
    builds.push(build)
  }
  return builds
}

export const buildsApi: BuildsApi = {
  list: () => run(() => http.get<unknown>('/api/builds'), toBuildList),
  create: (request) => run(() => http.post<unknown>('/api/builds', request), toBuild),
  rename: (id, request) =>
    run(() => http.patch<unknown>(`/api/builds/${encodeURIComponent(id)}`, request), toBuild),
  remove: (id) =>
    run(
      () => http.delete<unknown>(`/api/builds/${encodeURIComponent(id)}`),
      () => true as const,
    ),
}
