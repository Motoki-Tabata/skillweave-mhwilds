import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { sharesApi } from '@/lib/api/shares'
import type { Share, SharedBuild, SharesApi } from '@/lib/api/shares'
import { failureCauseText } from '@/lib/api/result'
import type { ApiResult } from '@/lib/api/result'
import { byIdDescending, uuidv7 } from '@/lib/uuidv7'
import { useAuthStore } from '@/stores/auth'
import { useBuildsStore } from '@/stores/builds'
import { useToastStore } from '@/stores/toast'

/** 判定中・読込中（`loading`）、ログインが必要、一覧あり（0件を含む）、一覧の読込失敗。 */
export type SharesStatus = 'loading' | 'loginRequired' | 'ready' | 'failed'

export type LoginRequiredReason = 'unauthenticated' | 'unavailable'

/**
 * `create` の結果。`created` は 201、`existing` は 200（既存の有効な共有）、`notFound` は元の構成が無い、
 * `expired` は 401 またはログイン中でない、`discarded` はログイン中でなくなって応答を捨てた。
 */
export type CreateShareResult =
  'created' | 'existing' | 'notFound' | 'failed' | 'expired' | 'discarded'

/** `revoke` の結果。 */
export type RevokeShareResult = 'revoked' | 'failed' | 'expired' | 'discarded'

const MESSAGE_EXPIRED =
  'ログインの有効期限が切れました。もう一度「Discord でログイン」を押すと、保存した構成と共有を使えます。'
const MESSAGE_NOT_FOUND =
  'この構成は別の端末で削除されていたため、共有しませんでした。一覧を読み直しました。'

/** 共有の一覧と、作成・取り消し・閲覧（S5・S6・S7 が使う）。 */
export const useSharesStore = defineStore('shares', () => {
  const auth = useAuthStore()
  const toast = useToastStore()

  const status = ref<SharesStatus>('loading')
  const failureMessage = ref('')
  const shares = ref<Share[]>([])
  /** 取り消しの応答待ちの ID */
  const revokingIds = ref<string[]>([])
  let api: SharesApi = sharesApi
  let loading: Promise<void> | null = null
  /** ログイン中でなくなるたびに進める。それより前に送った要求の応答を捨てる印 */
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
    shares.value = []
    status.value = 'loading'
    failureMessage.value = ''
    revokingIds.value = []
  }

  /** 共有の API を差し替える（テスト用）。読み込み済みの状態は捨てる。 */
  function setApi(next: SharesApi): void {
    api = next
    resetState()
  }

  function toLoginRequired(): void {
    resetState()
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

  /** 401。`expire()` が変えたときだけトーストを出す（構成の API と同時の 401 で1回）。 */
  function handleExpired(): void {
    if (auth.expire()) toast.push(MESSAGE_EXPIRED, 'destructive')
    toLoginRequired()
  }

  async function loadList(): Promise<void> {
    const seq = (listSeq += 1)
    const current = session
    status.value = 'loading'
    failureMessage.value = ''
    const result = await api.list()
    if (seq !== listSeq || current !== session) return
    if (result.kind === 'ok') {
      shares.value = [...result.value].sort(byIdDescending)
      status.value = 'ready'
    } else if (result.kind === 'unauthorized') {
      handleExpired()
    } else {
      shares.value = []
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

  async function requireLogin(): Promise<boolean> {
    await auth.initialize()
    return auth.status === 'authenticated'
  }

  function reportFailure(message: string, cause: string): void {
    toast.push(`${message}${cause} もう一度お試しください。`, 'destructive')
  }

  /**
   * 構成の共有を作る。ID は押すたびに採番する（押し直しは新しい ID）。
   * 戻り値の `share` は `created`・`existing` のときだけ入る。
   */
  async function create(buildId: string): Promise<{ result: CreateShareResult; share?: Share }> {
    if (!(await requireLogin())) return { result: 'expired' }
    const current = session
    const result = await api.create({ id: uuidv7(), buildId })
    if (current !== session) return { result: 'discarded' }
    if (result.kind === 'ok') {
      const { share, created } = result.value
      if (created && status.value === 'ready') shares.value = [share, ...shares.value]
      return { result: created ? 'created' : 'existing', share }
    }
    if (result.kind === 'unauthorized') {
      handleExpired()
      return { result: 'expired' }
    }
    if (result.kind === 'notFound') {
      toast.push(MESSAGE_NOT_FOUND, 'destructive')
      await useBuildsStore().reload()
      return { result: 'notFound' }
    }
    // 409（ID の衝突）は読み直す意味が無い。一般の失敗として扱う
    reportFailure('構成を共有できませんでした。', failureCauseText(result))
    return { result: 'failed' }
  }

  /** 取り消し。サーバーから消えてから一覧を変える。応答を待つ間は `revokingIds` に入れる。 */
  async function revoke(id: string): Promise<RevokeShareResult> {
    if (revokingIds.value.includes(id)) return 'failed'
    revokingIds.value = [...revokingIds.value, id]
    const current = session
    try {
      if (!(await requireLogin())) return 'expired'
      const result = await api.revoke(id)
      if (current !== session) return 'discarded'
      if (result.kind === 'ok') {
        shares.value = shares.value.filter((item) => item.id !== id)
        toast.push('共有を取り消しました。')
        return 'revoked'
      }
      if (result.kind === 'unauthorized') {
        handleExpired()
        return 'expired'
      }
      reportFailure('共有を取り消せませんでした。', failureCauseText(result))
      return 'failed'
    } finally {
      if (current === session) revokingIds.value = revokingIds.value.filter((item) => item !== id)
    }
  }

  /** 共有された構成を読む（S7）。ログインの状態を待たず、結果をそのまま返す。 */
  function fetchShared(shortId: string): Promise<ApiResult<SharedBuild>> {
    return api.view(shortId)
  }

  return {
    status,
    failureMessage,
    shares,
    revokingIds,
    loginRequiredReason,
    setApi,
    ensureLoaded,
    reload,
    create,
    revoke,
    fetchShared,
  }
})
