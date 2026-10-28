import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { buildsApi, BUILD_SCHEMA_VERSION } from '@/lib/api/builds'
import type { Build, BuildPayload, BuildsApi } from '@/lib/api/builds'
import { failureCauseText } from '@/lib/api/result'
import { uuidv7 } from '@/lib/uuidv7'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

/**
 * 判定中・読込中（`loading`）、ログインが必要（`loginRequired`）、一覧あり（`ready`。0件を含む）、
 * 一覧の読込失敗（`failed`）。
 */
export type BuildsStatus = 'loading' | 'loginRequired' | 'ready' | 'failed'

/** ログインが必要の理由。未ログインと「取得できない」を区別する。 */
export type LoginRequiredReason = 'unauthenticated' | 'unavailable'

/**
 * `save`・`rename`・`remove` の結果。`saved` は成功、`conflict`（409）・`notFound`（404）は
 * 別の端末で変更・削除されていた（名前の変更だけ）、`expired` は 401 またはログイン中でない、
 * `discarded` はログイン中でなくなって応答を捨てた。
 */
export type BuildWriteResult =
  'saved' | 'failed' | 'conflict' | 'notFound' | 'expired' | 'discarded'

const MESSAGE_EXPIRED_SAVE =
  'ログインの有効期限が切れたため、保存しませんでした。もう一度「Discord でログイン」を押してください。ログインするとこのページを離れるため、いまの検索結果は消えます。'
const MESSAGE_EXPIRED =
  'ログインの有効期限が切れました。もう一度「Discord でログイン」を押すと、保存した構成を使えます。'
const MESSAGE_CONFLICT =
  'この構成は別の端末で変更されていたため、名前を変更しませんでした。一覧を読み直しました。内容を確かめて、もう一度お試しください。'
const MESSAGE_NOT_FOUND =
  'この構成は別の端末で削除されていたため、名前を変更しませんでした。一覧を読み直しました。'

/** 新しい ID が大きい（UUIDv7 は先頭が時刻）。 */
function byIdDescending(a: Build, b: Build): number {
  if (a.id === b.id) return 0
  return a.id < b.id ? 1 : -1
}

/** 保存した構成の一覧と、保存・名前の変更・削除（S1・S4・S5 が共有する）。 */
export const useBuildsStore = defineStore('builds', () => {
  const auth = useAuthStore()
  const toast = useToastStore()

  const status = ref<BuildsStatus>('loading')
  /** 一覧の読込失敗の原因（画面にそのまま出す文言） */
  const failureMessage = ref('')
  const builds = ref<Build[]>([])
  /** 削除の応答待ちの ID */
  const deletingIds = ref<string[]>([])
  let api: BuildsApi = buildsApi
  let loading: Promise<void> | null = null
  /** ログイン中でなくなるたびに進める。それより前に送った書込の応答を捨てる印 */
  let session = 0
  /** 一覧の読込を始めるたびに進める。重なったときは新しい読込を勝たせる印 */
  let listSeq = 0

  const loginRequiredReason = computed<LoginRequiredReason>(() =>
    auth.status === 'unavailable' ? 'unavailable' : 'unauthenticated',
  )

  function resetState(): void {
    session += 1
    listSeq += 1
    loading = null
    builds.value = []
    status.value = 'loading'
    failureMessage.value = ''
    deletingIds.value = []
  }

  /** 構成の API を差し替える（テスト用）。読み込み済みの状態は捨てる。 */
  function setApi(next: BuildsApi): void {
    api = next
    resetState()
  }

  function toLoginRequired(): void {
    session += 1
    listSeq += 1
    loading = null
    builds.value = []
    deletingIds.value = []
    failureMessage.value = ''
    status.value = 'loginRequired'
  }

  // ログアウトと 401 は、その場でログインが必要の状態にする（判定中は何もしない）
  watch(
    () => auth.status,
    (next) => {
      if (next !== 'authenticated' && next !== 'checking' && status.value !== 'loginRequired') {
        toLoginRequired()
      }
    },
    { flush: 'sync' },
  )

  /** 401。`expire()` が変えたときだけトーストを出す（同時の 401 で1回）。 */
  function handleExpired(message: string): void {
    if (auth.expire()) toast.push(message, 'destructive')
    toLoginRequired()
  }

  /** 一覧を読む。重なったときは新しい読込の結果だけを反映する。 */
  async function loadList(): Promise<void> {
    const seq = (listSeq += 1)
    const current = session
    status.value = 'loading'
    failureMessage.value = ''
    const result = await api.list()
    if (seq !== listSeq || current !== session) return
    if (result.kind === 'ok') {
      builds.value = [...result.value].sort(byIdDescending)
      status.value = 'ready'
    } else if (result.kind === 'unauthorized') {
      handleExpired(MESSAGE_EXPIRED)
    } else {
      builds.value = []
      failureMessage.value = failureCauseText(result)
      status.value = 'failed'
    }
  }

  async function loadAfterAuth(): Promise<void> {
    status.value = 'loading'
    const current = session
    await auth.initialize()
    if (current !== session) return
    if (auth.status === 'authenticated') {
      await loadList()
    } else {
      toLoginRequired()
    }
  }

  /** 画面を開くたびに、認証の判定を待ってから、ログイン中なら一覧をサーバーから読む。 */
  function ensureLoaded(): Promise<void> {
    if (loading !== null) return loading
    const started: Promise<void> = loadAfterAuth().finally(() => {
      if (loading === started) loading = null
    })
    loading = started
    return started
  }

  /** 一覧だけを読み直す（「再読み込み」）。認証状態は読み直さない。 */
  function reload(): Promise<void> {
    if (auth.status !== 'authenticated') return Promise.resolve()
    return loadList()
  }

  function reportFailure(subject: string, cause: string): void {
    toast.push(`${subject}できませんでした。${cause} もう一度お試しください。`, 'destructive')
  }

  /** 409・404 のあと、トーストを出して一覧を読み直す。読み直しが失敗したら読込失敗になる。 */
  async function reloadAfterRace(message: string): Promise<void> {
    toast.push(message, 'destructive')
    await loadList()
  }

  /** ログイン中でなければ要求を送らない（`expired`）。判定中なら待つ。 */
  async function requireLogin(): Promise<boolean> {
    await auth.initialize()
    return auth.status === 'authenticated'
  }

  /**
   * 構成を保存する。ID は押すたびに採番する（押し直しは新しい ID）。
   * 一覧を読んでいるときだけ、サーバーの応答を先頭に足す。
   */
  async function save(
    name: string,
    masterVersion: string,
    payload: BuildPayload,
  ): Promise<BuildWriteResult> {
    if (!(await requireLogin())) return 'expired'
    const current = session
    const result = await api.create({
      id: uuidv7(),
      name,
      masterVersion,
      payload,
      schemaVersion: BUILD_SCHEMA_VERSION,
    })
    if (current !== session) return 'discarded'
    if (result.kind === 'ok') {
      if (status.value === 'ready') builds.value = [result.value, ...builds.value]
      toast.push(`「${name}」を保存しました。「保存した構成」から開けます。`)
      return 'saved'
    }
    if (result.kind === 'unauthorized') {
      handleExpired(MESSAGE_EXPIRED_SAVE)
      return 'expired'
    }
    // 作成の 409 は ID の衝突で、読み直す意味が無い。一般の失敗として扱う
    reportFailure('構成を保存', failureCauseText(result))
    return 'failed'
  }

  /** 名前の変更。読んだ時点の `version` で送る。名前の変更は並びを変えない。 */
  async function rename(id: string, name: string): Promise<BuildWriteResult> {
    const target = builds.value.find((item) => item.id === id)
    if (target === undefined || !(await requireLogin())) return 'failed'
    const current = session
    const result = await api.rename(id, { name, version: target.version })
    if (current !== session) return 'discarded'
    if (result.kind === 'ok') {
      const saved = result.value
      builds.value = builds.value.map((item) => (item.id === saved.id ? saved : item))
      toast.push('名前を変更しました。')
      return 'saved'
    }
    if (result.kind === 'unauthorized') {
      handleExpired(MESSAGE_EXPIRED)
      return 'expired'
    }
    if (result.kind === 'conflict') {
      await reloadAfterRace(MESSAGE_CONFLICT)
      return 'conflict'
    }
    if (result.kind === 'notFound') {
      await reloadAfterRace(MESSAGE_NOT_FOUND)
      return 'notFound'
    }
    reportFailure('名前を変更', failureCauseText(result))
    return 'failed'
  }

  /** 削除。サーバーから消えてから一覧を変える。応答を待つ間は `deletingIds` に入れる。 */
  async function remove(id: string): Promise<BuildWriteResult> {
    if (deletingIds.value.includes(id)) return 'failed'
    deletingIds.value = [...deletingIds.value, id]
    const current = session
    try {
      if (!(await requireLogin())) return 'expired'
      const result = await api.remove(id)
      if (current !== session) return 'discarded'
      if (result.kind === 'ok') {
        builds.value = builds.value.filter((item) => item.id !== id)
        toast.push('構成を削除しました。')
        return 'saved'
      }
      if (result.kind === 'unauthorized') {
        handleExpired(MESSAGE_EXPIRED)
        return 'expired'
      }
      reportFailure('構成を削除', failureCauseText(result))
      return 'failed'
    } finally {
      if (current === session) deletingIds.value = deletingIds.value.filter((item) => item !== id)
    }
  }

  return {
    status,
    failureMessage,
    builds,
    deletingIds,
    loginRequiredReason,
    setApi,
    ensureLoaded,
    reload,
    save,
    rename,
    remove,
  }
})
