import { computed } from 'vue'
import { defineStore } from 'pinia'
import { weaponsApi } from '@/lib/api/weapons'
import { openWeaponRepository } from '@/lib/weapons/storage'
import type { WeaponRepository } from '@/lib/weapons/storage'
import { WEAPON_SCHEMA_VERSION } from '@/lib/weapons/types'
import type { StoredWeapon, WeaponPayload } from '@/lib/weapons/types'
import { weaponEligibility } from '@/lib/weapons/validate'
import type { ValidateContext, WeaponEligibility } from '@/lib/weapons/validate'
import { useSavedItems } from '@/stores/savedItems'
import type { SavedItemsStatus } from '@/stores/savedItems'
import { useMasterStore } from '@/stores/master'

/** 読込中・読込済み・端末に保存できない（IndexedDB を開けない）・読み込みの失敗（一覧を読めない）。 */
export type WeaponsStatus = SavedItemsStatus

/** 武器の保存先を開く関数。テストで差し替える。 */
export type WeaponRepositoryOpener = () => Promise<WeaponRepository>

/** 一覧の1件。マスターの読み込み前は、候補の判定を持たない。 */
export interface WeaponEntry {
  weapon: StoredWeapon
  eligibility: WeaponEligibility | null
}

const MESSAGE_CONFLICT =
  'この個体差のある武器は別の端末で変更されていたため、保存しませんでした。一覧を読み直しました。内容を確かめて、もう一度編集してください。'
const MESSAGE_NOT_FOUND =
  'この個体差のある武器は別の端末で削除されていたため、保存しませんでした。一覧を読み直しました。'
const MESSAGE_EXPIRED_WRITE =
  'ログインの有効期限が切れたため、保存しませんでした。端末内の個体差のある武器に切り替えました。アカウントに保存するには、もう一度「Discord でログイン」を押してください。'
const MESSAGE_EXPIRED_LIST =
  'ログインの有効期限が切れました。端末内の個体差のある武器に切り替えました。もう一度「Discord でログイン」を押すと、アカウントの個体差のある武器を使えます。'

/** リアクティブな値を、IndexedDB に渡せる（structuredClone できる）素のオブジェクトにする。 */
function plainPayload(payload: WeaponPayload): WeaponPayload {
  return {
    baseWeaponId: payload.baseWeaponId,
    name: payload.name,
    attack: payload.attack,
    affinity: payload.affinity,
    ...(payload.element === undefined
      ? {}
      : { element: { type: payload.element.type, value: payload.element.value } }),
    slots: payload.slots.map((slot) => ({ target: slot.target, level: slot.level })),
    seriesBonusId: payload.seriesBonusId,
    groupBonusId: payload.groupBonusId,
  }
}

/** 個体差のある武器の一覧と、端末への保存（S3 と検索画面が共有する）。 */
export const useWeaponsStore = defineStore('weapons', () => {
  const master = useMasterStore()

  const saved = useSavedItems<StoredWeapon, WeaponPayload, 1>({
    plainPayload,
    schemaVersion: WEAPON_SCHEMA_VERSION,
    openDefault: () => openWeaponRepository(),
    noun: '個体差のある武器',
    api: weaponsApi,
    messages: {
      conflict: MESSAGE_CONFLICT,
      notFound: MESSAGE_NOT_FOUND,
      expiredWrite: MESSAGE_EXPIRED_WRITE,
      expiredList: MESSAGE_EXPIRED_LIST,
    },
  })
  const weapons = saved.items

  const context = computed<ValidateContext | null>(() => {
    const bundle = master.bundle
    return bundle === null ? null : { bundle, nameOf: master.nameOf }
  })

  /** 各武器の候補の判定。保存はせず、表示のたびに現行のマスターで求める。 */
  const entries = computed<WeaponEntry[]>(() => {
    const ctx = context.value
    return weapons.value.map((weapon) => ({
      weapon,
      eligibility: ctx === null ? null : weaponEligibility(weapon.payload, ctx),
    }))
  })

  /** 検索の候補にする武器（基の武器・付与スキルが現行のマスターにあるもの）。 */
  const candidates = computed<StoredWeapon[]>(() =>
    entries.value.filter((entry) => entry.eligibility?.eligible === true).map((e) => e.weapon),
  )
  const candidateCount = computed(() => candidates.value.length)

  /** 検索の候補から外す武器と、その理由。 */
  const excluded = computed(() =>
    entries.value.flatMap(({ weapon, eligibility }) =>
      eligibility !== null && !eligibility.eligible
        ? [{ id: weapon.id, reasons: eligibility.reasons }]
        : [],
    ),
  )
  const excludedCount = computed(() => excluded.value.length)

  return {
    status: saved.status,
    source: saved.source,
    failureMessage: saved.failureMessage,
    weapons,
    deviceWeaponCount: saved.deviceCount,
    deletingIds: saved.deletingIds,
    entries,
    candidates,
    candidateCount,
    excluded,
    excludedCount,
    setRepositoryOpener: saved.setRepositoryOpener,
    setApi: saved.setApi,
    ensureLoaded: saved.ensureLoaded,
    reload: saved.reload,
    save: saved.save,
    remove: saved.remove,
  }
})
