import { computed, ref, shallowRef, toRaw, watch } from 'vue'
import { defineStore } from 'pinia'
import type { SolverCharm } from '@swv/solver'
import { CHARMS_FAILURE_MESSAGES, charmsApi } from '@/lib/api/charms'
import type { AccountCharm, CharmsApi, CharmsFailure } from '@/lib/api/charms'
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
import { useAuthStore } from '@/stores/auth'
import { useMasterStore } from '@/stores/master'
import { useToastStore } from '@/stores/toast'

/** 失敗の原因を画面に出す文言にする（端末の保存先）。 */
function failureText(error: unknown): string {
  return STORAGE_FAILURE_MESSAGES[classifyStorageError(error)]
}

/** 読込中・読込済み・端末に保存できない（IndexedDB を開けない）・読み込みの失敗（一覧を読めない）。 */
export type CharmsStatus = 'loading' | 'ready' | 'unavailable' | 'failed'

/** 護石の保存先。判定中は未定。 */
export type CharmSource = 'unknown' | 'account' | 'device'

/**
 * `save`・`remove` の結果。`saved` は保存・削除した、`conflict`（409）・`notFound`（404）は
 * 別の端末で変更・削除されていた、`expired` は 401、`discarded` は保存先が変わって応答を捨てた。
 */
export type CharmWriteResult =
  'saved' | 'failed' | 'conflict' | 'notFound' | 'expired' | 'discarded'

/** 護石の保存先を開く関数。テストで差し替える。 */
export type CharmRepositoryOpener = () => Promise<CharmRepository>

/** 一覧の1件。マスターの読み込み前は、照合の結果と候補の判定を持たない。 */
export interface CharmEntry {
  charm: StoredCharm
  match: CharmMatch | null
  eligibility: CharmEligibility | null
}

const MESSAGE_CONFLICT =
  'この護石は別の端末で変更されていたため、保存しませんでした。一覧を読み直しました。内容を確かめて、もう一度編集してください。'
const MESSAGE_NOT_FOUND =
  'この護石は別の端末で削除されていたため、保存しませんでした。一覧を読み直しました。'
const MESSAGE_EXPIRED_WRITE =
  'ログインの有効期限が切れたため、保存しませんでした。端末内の護石に切り替えました。アカウントに保存するには、もう一度「Discord でログイン」を押してください。'
const MESSAGE_EXPIRED_LIST =
  'ログインの有効期限が切れました。端末内の護石に切り替えました。もう一度「Discord でログイン」を押すと、アカウントの護石を使えます。'

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

function causeText(failure: CharmsFailure): string {
  return CHARMS_FAILURE_MESSAGES[failure.kind === 'failed' ? failure.cause : 'server']
}

/** 読んだ時点の行バージョン（アカウントの護石だけが持つ）。 */
function versionOf(charm: StoredCharm): number {
  const version = (charm as Partial<AccountCharm>).version
  return typeof version === 'number' ? version : 0
}

/** 護石の一覧と、保存先（アカウントか端末）への保存（S1 と S2 が共有する）。 */
export const useCharmsStore = defineStore('charms', () => {
  const master = useMasterStore()
  const toast = useToastStore()
  const auth = useAuthStore()

  const status = ref<CharmsStatus>('loading')
  const source = ref<CharmSource>('unknown')
  /** 端末に保存できない・読み込みの失敗の原因（画面にそのまま出す文言） */
  const failureMessage = ref('')
  const charms = ref<StoredCharm[]>([])
  /** アカウントの一覧を読んだときに数えた端末内の護石の件数。開けない・読めないときは null */
  const deviceCharmCount = ref<number | null>(null)
  /** 削除の応答待ちの ID */
  const deletingIds = ref<string[]>([])
  const opener = shallowRef<CharmRepositoryOpener>(() => openCharmRepository())
  let api: CharmsApi = charmsApi
  let repository: CharmRepository | null = null
  let loading: Promise<void> | null = null
  /** 保存先が変わるたびに進める。古い応答を捨てる印 */
  let generation = 0

  function resetState(): void {
    generation += 1
    repository = null
    loading = null
    charms.value = []
    status.value = 'loading'
    source.value = 'unknown'
    failureMessage.value = ''
    deviceCharmCount.value = null
    deletingIds.value = []
  }

  /** 保存先の開き方を差し替える（テスト用）。読み込み済みの状態は捨てる。 */
  function setRepositoryOpener(next: CharmRepositoryOpener): void {
    opener.value = next
    resetState()
  }

  /** 護石の API を差し替える（テスト用）。読み込み済みの状態は捨てる。 */
  function setApi(next: CharmsApi): void {
    api = next
    resetState()
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

  /** 端末の保存先を開いて一覧を読む（005）。 */
  async function loadDevice(): Promise<void> {
    status.value = 'loading'
    failureMessage.value = ''
    if (await open()) await read()
  }

  /** 端末内の護石の件数。開けない・読めないときは null（エラーは出さない）。 */
  async function countDevice(): Promise<number | null> {
    try {
      return (await (await opener.value()).list()).length
    } catch {
      return null
    }
  }

  /** ログアウト・401 で端末の一覧に切り替える。古い要求の応答は捨てる。 */
  function switchToDevice(): void {
    generation += 1
    source.value = 'device'
    repository = null
    charms.value = []
    deviceCharmCount.value = null
    deletingIds.value = []
    loading = loadDevice()
  }

  /** 護石の API の 401。最初の1回だけトーストを出して端末に切り替える。 */
  function handleExpired(message: string): void {
    if (auth.expire()) toast.push(message, 'destructive')
    if (source.value === 'account') switchToDevice()
  }

  /** アカウントの一覧を読む。`recount` のときは端末内の件数も数える。 */
  async function loadAccount(recount: boolean): Promise<void> {
    const gen = generation
    status.value = 'loading'
    failureMessage.value = ''
    const [result, count] = await Promise.all([
      api.list(),
      recount ? countDevice() : Promise.resolve(deviceCharmCount.value),
    ])
    if (gen !== generation) return
    if (result.kind === 'ok') {
      charms.value = [...result.value].sort(byIdDescending)
      deviceCharmCount.value = count
      status.value = 'ready'
    } else if (result.kind === 'unauthorized') {
      handleExpired(MESSAGE_EXPIRED_LIST)
      await loading
    } else {
      charms.value = []
      failureMessage.value = causeText(result)
      status.value = 'failed'
    }
  }

  /** 認証の判定を待ってから、保存先を決めて一覧を読む。 */
  async function loadInitial(): Promise<void> {
    status.value = 'loading'
    failureMessage.value = ''
    const gen = generation
    await auth.initialize()
    if (gen !== generation) return
    if (auth.status === 'authenticated') {
      source.value = 'account'
      await loadAccount(true)
    } else {
      source.value = 'device'
      await loadDevice()
    }
  }

  // ログアウトと 401 は、その場で端末に切り替える（判定中に戻るときは何もしない）
  watch(
    () => auth.status,
    (next) => {
      if (source.value === 'account' && next !== 'authenticated' && next !== 'checking') {
        switchToDevice()
      }
    },
    { flush: 'sync' },
  )

  /** 最初に使われたときに1回だけ、認証の判定を待って保存先を開き、一覧を読む。 */
  function ensureLoaded(): Promise<void> {
    loading ??= loadInitial()
    return loading
  }

  /** 読み直す（「再読み込み」）。アカウントなら一覧と端末の件数を、端末なら開き直して読む。認証状態は読み直さない。 */
  function reload(): Promise<void> {
    if (source.value === 'account') {
      loading = loadAccount(true)
      return loading
    }
    repository = null
    loading = loadDevice()
    return loading
  }

  function reportFailure(action: '保存' | '削除', text: string): void {
    toast.push(`護石を${action}できませんでした。${text} もう一度お試しください。`, 'destructive')
  }

  /** 409・404 のあと、トーストを出して一覧を読み直す。読み直しが失敗したら読込失敗になる。 */
  async function reloadAfterRace(message: string): Promise<void> {
    toast.push(message, 'destructive')
    loading = loadAccount(false)
    await loading
  }

  function isWritable(): boolean {
    if (status.value !== 'ready') return false
    return source.value === 'account' || (source.value === 'device' && repository !== null)
  }

  async function saveToDevice(
    payload: CharmPayload,
    existing?: StoredCharm,
  ): Promise<CharmWriteResult> {
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
      await repository?.put(next)
    } catch (error) {
      reportFailure('保存', failureText(error))
      return 'failed'
    }
    charms.value = existing
      ? charms.value.map((item) => (item.id === next.id ? next : item))
      : [...charms.value, next].sort(byIdDescending)
    toast.push(existing ? '護石を保存しました。' : '護石を登録しました。')
    return 'saved'
  }

  async function saveToAccount(
    payload: CharmPayload,
    existing?: StoredCharm,
  ): Promise<CharmWriteResult> {
    const gen = generation
    const body = { payload: plainPayload(payload), schemaVersion: CHARM_SCHEMA_VERSION } as const
    const result = existing
      ? await api.update(existing.id, { ...body, version: versionOf(existing) })
      : await api.create({ ...body, id: uuidv7() })
    if (gen !== generation) return 'discarded'
    if (result.kind === 'ok') {
      const saved = result.value
      charms.value = existing
        ? charms.value.map((item) => (item.id === saved.id ? saved : item))
        : [...charms.value, saved].sort(byIdDescending)
      toast.push(existing ? '護石を保存しました。' : '護石を登録しました。')
      return 'saved'
    }
    if (result.kind === 'unauthorized') {
      handleExpired(MESSAGE_EXPIRED_WRITE)
      return 'expired'
    }
    // 作成の 409 は ID の衝突で、読み直す意味が無い。更新の競合だけを別扱いにする
    if (existing && result.kind === 'conflict') {
      await reloadAfterRace(MESSAGE_CONFLICT)
      return 'conflict'
    }
    if (existing && result.kind === 'notFound') {
      await reloadAfterRace(MESSAGE_NOT_FOUND)
      return 'notFound'
    }
    reportFailure('保存', causeText(result))
    return 'failed'
  }

  /**
   * 登録（`existing` が無いとき）か上書き（ID はそのまま）。保存に成功してから一覧を変える。
   * 失敗の種類は結果で返し、トーストは store が出す。
   */
  async function save(payload: CharmPayload, existing?: StoredCharm): Promise<CharmWriteResult> {
    if (!isWritable()) return 'failed'
    return source.value === 'account'
      ? saveToAccount(payload, existing)
      : saveToDevice(payload, existing)
  }

  async function removeFromDevice(id: string): Promise<CharmWriteResult> {
    try {
      await repository?.delete(id)
    } catch (error) {
      reportFailure('削除', failureText(error))
      return 'failed'
    }
    charms.value = charms.value.filter((item) => item.id !== id)
    toast.push('護石を削除しました。')
    return 'saved'
  }

  async function removeFromAccount(id: string): Promise<CharmWriteResult> {
    const gen = generation
    const result = await api.remove(id)
    if (gen !== generation) return 'discarded'
    if (result.kind === 'ok') {
      charms.value = charms.value.filter((item) => item.id !== id)
      toast.push('護石を削除しました。')
      return 'saved'
    }
    if (result.kind === 'unauthorized') {
      handleExpired(MESSAGE_EXPIRED_WRITE)
      return 'expired'
    }
    reportFailure('削除', causeText(result))
    return 'failed'
  }

  /** 削除。保存先から消えてから一覧を変える。応答を待つ間は `deletingIds` に入れる。 */
  async function remove(id: string): Promise<CharmWriteResult> {
    if (!isWritable() || deletingIds.value.includes(id)) return 'failed'
    deletingIds.value = [...deletingIds.value, id]
    try {
      return source.value === 'account' ? await removeFromAccount(id) : await removeFromDevice(id)
    } finally {
      deletingIds.value = deletingIds.value.filter((item) => item !== id)
    }
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
    source,
    failureMessage,
    charms,
    deviceCharmCount,
    deletingIds,
    entries,
    candidates,
    candidateCount,
    excluded,
    excludedCount,
    setRepositoryOpener,
    setApi,
    ensureLoaded,
    reload,
    save,
    remove,
  }
})
