import { computed, ref, shallowRef, toRaw } from 'vue'
import { defineStore } from 'pinia'
import { STORAGE_FAILURE_MESSAGES, classifyStorageError } from '@/lib/storage/database'
import { openWeaponRepository } from '@/lib/weapons/storage'
import type { WeaponRepository } from '@/lib/weapons/storage'
import { WEAPON_SCHEMA_VERSION } from '@/lib/weapons/types'
import type { StoredWeapon, WeaponPayload } from '@/lib/weapons/types'
import { weaponEligibility } from '@/lib/weapons/validate'
import type { ValidateContext, WeaponEligibility } from '@/lib/weapons/validate'
import { nowIso, uuidv7 } from '@/lib/uuidv7'
import { useMasterStore } from '@/stores/master'
import { useToastStore } from '@/stores/toast'

/** 失敗の原因を画面に出す文言にする。 */
function failureText(error: unknown): string {
  return STORAGE_FAILURE_MESSAGES[classifyStorageError(error)]
}

/** 読込中・読込済み・端末に保存できない（IndexedDB を開けない）・読み込みの失敗（一覧を読めない）。 */
export type WeaponsStatus = 'loading' | 'ready' | 'unavailable' | 'failed'

/** 武器の保存先を開く関数。テストで差し替える。 */
export type WeaponRepositoryOpener = () => Promise<WeaponRepository>

/** 一覧の1件。マスターの読み込み前は、候補の判定を持たない。 */
export interface WeaponEntry {
  weapon: StoredWeapon
  eligibility: WeaponEligibility | null
}

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

/** 新しい ID が大きい（UUIDv7 は先頭が時刻）。 */
function byIdDescending(a: StoredWeapon, b: StoredWeapon): number {
  if (a.id === b.id) return 0
  return a.id < b.id ? 1 : -1
}

/** 個体差のある武器の一覧と、端末への保存（S3 と検索画面が共有する）。 */
export const useWeaponsStore = defineStore('weapons', () => {
  const master = useMasterStore()
  const toast = useToastStore()

  const status = ref<WeaponsStatus>('loading')
  /** 端末に保存できない・読み込みの失敗の原因（画面にそのまま出す文言） */
  const failureMessage = ref('')
  const weapons = ref<StoredWeapon[]>([])
  const opener = shallowRef<WeaponRepositoryOpener>(() => openWeaponRepository())
  let repository: WeaponRepository | null = null
  let loading: Promise<void> | null = null

  /** 保存先の開き方を差し替える（テスト用）。読み込み済みの状態は捨てる。 */
  function setRepositoryOpener(next: WeaponRepositoryOpener): void {
    opener.value = next
    repository = null
    loading = null
    weapons.value = []
    status.value = 'loading'
    failureMessage.value = ''
  }

  async function open(): Promise<boolean> {
    try {
      repository = await opener.value()
      return true
    } catch (error) {
      failureMessage.value = failureText(error)
      status.value = 'unavailable'
      return false
    }
  }

  async function read(): Promise<void> {
    if (repository === null) return
    try {
      weapons.value = (await repository.list()).sort(byIdDescending)
      status.value = 'ready'
    } catch (error) {
      failureMessage.value = failureText(error)
      status.value = 'failed'
    }
  }

  async function loadOnce(): Promise<void> {
    status.value = 'loading'
    failureMessage.value = ''
    if (await open()) await read()
  }

  /** 最初に使われたときに1回だけ、保存先を開いて一覧を読む。 */
  function ensureLoaded(): Promise<void> {
    loading ??= loadOnce()
    return loading
  }

  /** 開き直して読み直す（「再読み込み」）。 */
  function reload(): Promise<void> {
    repository = null
    loading = loadOnce()
    return loading
  }

  function reportFailure(action: '保存' | '削除', error: unknown): void {
    toast.push(
      `個体差のある武器を${action}できませんでした。${failureText(error)} もう一度お試しください。`,
      'destructive',
    )
  }

  /**
   * 登録（`existing` が無いとき）か上書き（ID はそのまま）。保存に成功してから一覧を変える。
   * 失敗したときはトーストを出して false を返す。
   */
  async function save(payload: WeaponPayload, existing?: StoredWeapon): Promise<boolean> {
    if (repository === null || status.value !== 'ready') return false
    const now = nowIso()
    const next: StoredWeapon = existing
      ? { ...toRaw(existing), payload: plainPayload(payload), updatedAt: now }
      : {
          id: uuidv7(),
          payload: plainPayload(payload),
          schemaVersion: WEAPON_SCHEMA_VERSION,
          createdAt: now,
          updatedAt: now,
        }
    try {
      await repository.put(next)
    } catch (error) {
      reportFailure('保存', error)
      return false
    }
    weapons.value = existing
      ? weapons.value.map((item) => (item.id === next.id ? next : item))
      : [...weapons.value, next].sort(byIdDescending)
    toast.push(existing ? '個体差のある武器を保存しました。' : '個体差のある武器を登録しました。')
    return true
  }

  /** 削除。端末から消えてから一覧を変える。失敗したときはトーストを出して false を返す。 */
  async function remove(id: string): Promise<boolean> {
    if (repository === null || status.value !== 'ready') return false
    try {
      await repository.delete(id)
    } catch (error) {
      reportFailure('削除', error)
      return false
    }
    weapons.value = weapons.value.filter((item) => item.id !== id)
    toast.push('個体差のある武器を削除しました。')
    return true
  }

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
    status,
    failureMessage,
    weapons,
    entries,
    candidates,
    candidateCount,
    excluded,
    excludedCount,
    setRepositoryOpener,
    ensureLoaded,
    reload,
    save,
    remove,
  }
})
