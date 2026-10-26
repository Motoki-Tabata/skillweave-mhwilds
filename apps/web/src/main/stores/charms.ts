import { computed, ref, shallowRef, toRaw } from 'vue'
import { defineStore } from 'pinia'
import type { SolverCharm } from '@swv/solver'
import { matchCharm } from '@/lib/charms/match'
import type { CharmMatch } from '@/lib/charms/match'
import { eligibleSolverCharms } from '@/lib/charms/eligible'
import { CHARM_SCHEMA_VERSION, openCharmRepository } from '@/lib/charms/storage'
import { STORAGE_FAILURE_MESSAGES, classifyStorageError } from '@/lib/storage/database'
import type { CharmRepository, StoredCharm } from '@/lib/charms/storage'
import type { CharmPayload } from '@/lib/charms/types'
import { charmEligibility } from '@/lib/charms/validate'
import type { CharmEligibility, ValidateContext } from '@/lib/charms/validate'
import { nowIso, uuidv7 } from '@/lib/uuidv7'
import { useMasterStore } from '@/stores/master'
import { useToastStore } from '@/stores/toast'

/** 失敗の原因を画面に出す文言にする。 */
function failureText(error: unknown): string {
  return STORAGE_FAILURE_MESSAGES[classifyStorageError(error)]
}

/** 読込中・読込済み・端末に保存できない（IndexedDB を開けない）・読み込みの失敗（一覧を読めない）。 */
export type CharmsStatus = 'loading' | 'ready' | 'unavailable' | 'failed'

/** 護石の保存先を開く関数。テストで差し替える。 */
export type CharmRepositoryOpener = () => Promise<CharmRepository>

/** 一覧の1件。マスターの読み込み前は、照合の結果と候補の判定を持たない。 */
export interface CharmEntry {
  charm: StoredCharm
  match: CharmMatch | null
  eligibility: CharmEligibility | null
}

/** リアクティブな値を、IndexedDB に渡せる（structuredClone できる）素のオブジェクトにする。 */
function plainPayload(payload: CharmPayload): CharmPayload {
  return {
    rarity: payload.rarity,
    skills: payload.skills.map((skill) => ({ skillId: skill.skillId, level: skill.level })),
    slots: payload.slots.map((slot) => ({ target: slot.target, level: slot.level })),
  }
}

/** 新しい ID が大きい（UUIDv7 は先頭が時刻）。 */
function byIdDescending(a: StoredCharm, b: StoredCharm): number {
  if (a.id === b.id) return 0
  return a.id < b.id ? 1 : -1
}

/** 護石の一覧と、端末への保存（S1 と S2 が共有する）。 */
export const useCharmsStore = defineStore('charms', () => {
  const master = useMasterStore()
  const toast = useToastStore()

  const status = ref<CharmsStatus>('loading')
  /** 端末に保存できない・読み込みの失敗の原因（画面にそのまま出す文言） */
  const failureMessage = ref('')
  const charms = ref<StoredCharm[]>([])
  const opener = shallowRef<CharmRepositoryOpener>(() => openCharmRepository())
  let repository: CharmRepository | null = null
  let loading: Promise<void> | null = null

  /** 保存先の開き方を差し替える（テスト用）。読み込み済みの状態は捨てる。 */
  function setRepositoryOpener(next: CharmRepositoryOpener): void {
    opener.value = next
    repository = null
    loading = null
    charms.value = []
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
      charms.value = (await repository.list()).sort(byIdDescending)
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
      `護石を${action}できませんでした。${failureText(error)} もう一度お試しください。`,
      'destructive',
    )
  }

  /**
   * 登録（`existing` が無いとき）か上書き（ID はそのまま）。保存に成功してから一覧を変える。
   * 失敗したときはトーストを出して false を返す。
   */
  async function save(payload: CharmPayload, existing?: StoredCharm): Promise<boolean> {
    if (repository === null || status.value !== 'ready') return false
    const now = nowIso()
    const next: StoredCharm = existing
      ? { ...toRaw(existing), payload: plainPayload(payload), updatedAt: now }
      : {
          id: uuidv7(),
          payload: plainPayload(payload),
          schemaVersion: CHARM_SCHEMA_VERSION,
          createdAt: now,
          updatedAt: now,
        }
    try {
      await repository.put(next)
    } catch (error) {
      reportFailure('保存', error)
      return false
    }
    charms.value = existing
      ? charms.value.map((item) => (item.id === next.id ? next : item))
      : [...charms.value, next].sort(byIdDescending)
    toast.push(existing ? '護石を保存しました。' : '護石を登録しました。')
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
    charms.value = charms.value.filter((item) => item.id !== id)
    toast.push('護石を削除しました。')
    return true
  }

  const context = computed<ValidateContext | null>(() => {
    const bundle = master.bundle
    return bundle === null ? null : { bundle, nameOf: master.nameOf }
  })

  /** 各護石の照合の結果と候補の判定。保存はせず、表示のたびに現行のマスターで求める。 */
  const entries = computed<CharmEntry[]>(() => {
    const ctx = context.value
    return charms.value.map((charm) =>
      ctx === null
        ? { charm, match: null, eligibility: null }
        : {
            charm,
            match: matchCharm(charm.payload, ctx.bundle, ctx.nameOf),
            eligibility: charmEligibility(charm.payload, ctx),
          },
    )
  })

  /** 検索の候補にする護石（構造上の制約を満たすものすべて。未検査・テーブル不一致を含む）。 */
  const candidates = computed<SolverCharm[]>(() =>
    context.value === null ? [] : eligibleSolverCharms(charms.value, context.value),
  )
  const candidateCount = computed(() => candidates.value.length)

  /** 検索の候補から外す護石と、その理由。 */
  const excluded = computed(() =>
    entries.value.flatMap(({ charm, eligibility }) =>
      eligibility !== null && !eligibility.eligible
        ? [{ id: charm.id, reasons: eligibility.reasons }]
        : [],
    ),
  )
  const excludedCount = computed(() => excluded.value.length)

  return {
    status,
    failureMessage,
    charms,
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
