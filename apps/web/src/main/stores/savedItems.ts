import { ref, shallowRef, toRaw, watch } from 'vue'
import type { Ref } from 'vue'
import { API_FAILURE_MESSAGES } from '@/lib/api/result'
import type { ApiFailure, ApiResult } from '@/lib/api/result'
import { STORAGE_FAILURE_MESSAGES, classifyStorageError } from '@/lib/storage/database'
import { byIdDescending, nowIso, uuidv7 } from '@/lib/uuidv7'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

/** 読込中・読込済み・端末に保存できない（IndexedDB を開けない）・読み込みの失敗（一覧を読めない）。 */
export type SavedItemsStatus = 'loading' | 'ready' | 'unavailable' | 'failed'

/** 保存先。判定中は未定。 */
export type SavedItemsSource = 'unknown' | 'account' | 'device'

/**
 * `save`・`remove` の結果。`saved` は保存・削除した、`conflict`（409）・`notFound`（404）は
 * 別の端末で変更・削除されていた、`expired` は 401、`discarded` は保存先が変わって応答を捨てた。
 */
export type SavedWriteResult =
  'saved' | 'failed' | 'conflict' | 'notFound' | 'expired' | 'discarded'

/**
 * `importFromDevice` の結果。`done` はすべて取り込んだ、`partial` は拒否（400・409）あり、
 * `stopped` は通信・サーバー・端末の失敗で止めた、`expired` は 401、
 * `discarded` は保存先が変わって止めた、`ignored` は始めなかった。
 */
export type SavedImportResult = 'done' | 'partial' | 'stopped' | 'expired' | 'discarded' | 'ignored'

/** 取り込みの1件ごとの結果。 */
type ImportStep =
  | { kind: 'imported' }
  | { kind: 'rejected' }
  | { kind: 'discarded' }
  | { kind: 'halt'; failure: ApiFailure }

/** 保存する1件。アカウントのものは、これに行バージョン（`version`）を加えた形。 */
export interface SavedItem<P> {
  id: string
  payload: P
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

/** 端末の保存先。 */
export interface SavedRepository<T> {
  list: () => Promise<T[]>
  put: (item: T) => Promise<void>
  delete: (id: string) => Promise<void>
}

/** 端末の保存先を開く関数。テストで差し替える。 */
export type SavedRepositoryOpener<T> = () => Promise<SavedRepository<T>>

/** アカウントの API。例外は投げない。`V` は要求の版の型（護石は 1）。 */
export interface SavedItemsApi<T, P, V extends number = number> {
  list: () => Promise<ApiResult<T[]>>
  create: (request: { id: string; payload: P; schemaVersion: V }) => Promise<ApiResult<T>>
  update: (
    id: string,
    request: { payload: P; schemaVersion: V; version: number },
  ) => Promise<ApiResult<T>>
  remove: (id: string) => Promise<ApiResult<true>>
}

/** API の失敗や競合のときに出すトーストの文言（API を渡すときだけ要る）。 */
export interface SavedItemsMessages {
  conflict: string
  notFound: string
  expiredWrite: string
  expiredList: string
}

export interface SavedItemsOptions<T extends SavedItem<P>, P, V extends number> {
  /** リアクティブな値を、IndexedDB に渡せる（structuredClone できる）素のオブジェクトにする */
  plainPayload: (payload: P) => P
  schemaVersion: V
  openDefault: SavedRepositoryOpener<T>
  /** トーストの名詞（例: 護石） */
  noun: string
  /** 渡さないときは、認証の判定を待たずに端末の保存先を開き、ログイン・ログアウト・401 で変えない */
  api?: SavedItemsApi<T, P, V>
  messages?: SavedItemsMessages
}

/** 失敗の原因を画面に出す文言にする（端末の保存先）。 */
function failureText(error: unknown): string {
  return STORAGE_FAILURE_MESSAGES[classifyStorageError(error)]
}

function causeText(failure: ApiFailure): string {
  return API_FAILURE_MESSAGES[failure.kind === 'failed' ? failure.cause : 'server']
}

/** 読んだ時点の行バージョン（アカウントのものだけが持つ）。 */
function versionOf(item: object): number {
  const version = (item as { version?: unknown }).version
  return typeof version === 'number' ? version : 0
}

/**
 * 保存先（アカウントか端末）の状態機械。`defineStore` のセットアップの中で呼び、返した ref と関数をストアが公開する。
 * 一覧は ID の降順に並べる。
 */
export function useSavedItems<T extends SavedItem<P>, P, V extends number = number>(
  options: SavedItemsOptions<T, P, V>,
) {
  const { plainPayload, schemaVersion, noun } = options
  const toast = useToastStore()
  const hasApi = options.api !== undefined
  const auth = hasApi ? useAuthStore() : null
  const messages = options.messages

  const status = ref<SavedItemsStatus>('loading')
  const source = ref<SavedItemsSource>(hasApi ? 'unknown' : 'device')
  /** 端末に保存できない・読み込みの失敗の原因（画面にそのまま出す文言） */
  const failureMessage = ref('')
  const items = ref<T[]>([]) as Ref<T[]>
  /** アカウントの一覧を読んだときに数えた端末内の件数。開けない・読めないときは null */
  const deviceCount = ref<number | null>(null)
  /** 削除の応答待ちの ID */
  const deletingIds = ref<string[]>([])
  /** 端末内の取り込みの最中 */
  const importing = ref(false)
  const opener = shallowRef<SavedRepositoryOpener<T>>(options.openDefault)
  let api = options.api
  let repository: SavedRepository<T> | null = null
  let loading: Promise<void> | null = null
  /** 保存先が変わるたびに進める。古い応答を捨てる印 */
  let generation = 0

  function resetState(): void {
    generation += 1
    repository = null
    loading = null
    items.value = []
    status.value = 'loading'
    source.value = hasApi ? 'unknown' : 'device'
    failureMessage.value = ''
    deviceCount.value = null
    deletingIds.value = []
    importing.value = false
  }

  /** 保存先の開き方を差し替える（テスト用）。読み込み済みの状態は捨てる。 */
  function setRepositoryOpener(next: SavedRepositoryOpener<T>): void {
    opener.value = next
    resetState()
  }

  /** API を差し替える（テスト用）。読み込み済みの状態は捨てる。 */
  function setApi(next: SavedItemsApi<T, P, V>): void {
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
      items.value = (await repository.list()).sort(byIdDescending)
      status.value = 'ready'
    } catch (error) {
      failureMessage.value = failureText(error)
      status.value = 'failed'
    }
  }

  /** 端末の保存先を開いて一覧を読む。 */
  async function loadDevice(): Promise<void> {
    status.value = 'loading'
    failureMessage.value = ''
    if (await open()) await read()
  }

  /** 端末内の件数。開けない・読めないときは null（エラーは出さない）。 */
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
    items.value = []
    deviceCount.value = null
    deletingIds.value = []
    loading = loadDevice()
  }

  /** API の 401。最初の1回だけトーストを出して端末に切り替える。 */
  function handleExpired(message: string): void {
    if (auth?.expire()) toast.push(message, 'destructive')
    if (source.value === 'account') switchToDevice()
  }

  /** アカウントの一覧を読む。`recount` のときは端末内の件数も数える。 */
  async function loadAccount(recount: boolean): Promise<void> {
    if (api === undefined || messages === undefined) return
    const gen = generation
    status.value = 'loading'
    failureMessage.value = ''
    const [result, count] = await Promise.all([
      api.list(),
      recount ? countDevice() : Promise.resolve(deviceCount.value),
    ])
    if (gen !== generation) return
    if (result.kind === 'ok') {
      items.value = [...result.value].sort(byIdDescending)
      deviceCount.value = count
      status.value = 'ready'
    } else if (result.kind === 'unauthorized') {
      handleExpired(messages.expiredList)
      await loading
    } else {
      items.value = []
      failureMessage.value = causeText(result)
      status.value = 'failed'
    }
  }

  /** 認証の判定を待ってから、保存先を決めて一覧を読む。API が無ければ待たずに端末を開く。 */
  async function loadInitial(): Promise<void> {
    status.value = 'loading'
    failureMessage.value = ''
    const gen = generation
    if (auth !== null) {
      await auth.initialize()
      if (gen !== generation) return
    }
    if (auth?.status === 'authenticated') {
      source.value = 'account'
      await loadAccount(true)
    } else {
      source.value = 'device'
      await loadDevice()
    }
  }

  // ログアウトと 401 は、その場で端末に切り替える（判定中に戻るときは何もしない）。API が無いときは見ない
  if (auth !== null) {
    watch(
      () => auth.status,
      (next) => {
        if (source.value === 'account' && next !== 'authenticated' && next !== 'checking') {
          switchToDevice()
        }
      },
      { flush: 'sync' },
    )
  }

  /** 最初に使われたときに1回だけ、保存先を決めて一覧を読む。 */
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
    toast.push(
      `${noun}を${action}できませんでした。${text} もう一度お試しください。`,
      'destructive',
    )
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

  function savedMessage(existing: T | undefined): string {
    return existing ? `${noun}を保存しました。` : `${noun}を登録しました。`
  }

  function applySaved(next: T, existing: T | undefined): void {
    items.value = existing
      ? items.value.map((item) => (item.id === next.id ? next : item))
      : [...items.value, next].sort(byIdDescending)
    toast.push(savedMessage(existing))
  }

  async function saveToDevice(payload: P, existing?: T): Promise<SavedWriteResult> {
    const now = nowIso()
    const next = (
      existing
        ? { ...toRaw(existing), payload: plainPayload(payload), updatedAt: now }
        : {
            id: uuidv7(),
            payload: plainPayload(payload),
            schemaVersion,
            createdAt: now,
            updatedAt: now,
          }
    ) as T
    try {
      await repository?.put(next)
    } catch (error) {
      reportFailure('保存', failureText(error))
      return 'failed'
    }
    applySaved(next, existing)
    return 'saved'
  }

  async function saveToAccount(
    account: SavedItemsApi<T, P, V>,
    text: SavedItemsMessages,
    payload: P,
    existing?: T,
  ): Promise<SavedWriteResult> {
    const gen = generation
    const body = { payload: plainPayload(payload), schemaVersion }
    const result = existing
      ? await account.update(existing.id, { ...body, version: versionOf(existing) })
      : await account.create({ ...body, id: uuidv7() })
    if (gen !== generation) return 'discarded'
    if (result.kind === 'ok') {
      applySaved(result.value, existing)
      return 'saved'
    }
    if (result.kind === 'unauthorized') {
      handleExpired(text.expiredWrite)
      return 'expired'
    }
    // 作成の 409 は ID の衝突で、読み直す意味が無い。更新の競合だけを別扱いにする
    if (existing && result.kind === 'conflict') {
      await reloadAfterRace(text.conflict)
      return 'conflict'
    }
    if (existing && result.kind === 'notFound') {
      await reloadAfterRace(text.notFound)
      return 'notFound'
    }
    reportFailure('保存', causeText(result))
    return 'failed'
  }

  /**
   * 登録（`existing` が無いとき）か上書き（ID はそのまま）。保存に成功してから一覧を変える。
   * 失敗の種類は結果で返し、トーストはここで出す。
   */
  async function save(payload: P, existing?: T): Promise<SavedWriteResult> {
    if (!isWritable()) return 'failed'
    return source.value === 'account' && api !== undefined && messages !== undefined
      ? saveToAccount(api, messages, payload, existing)
      : saveToDevice(payload, existing)
  }

  function applyRemoved(id: string): void {
    items.value = items.value.filter((item) => item.id !== id)
    toast.push(`${noun}を削除しました。`)
  }

  async function removeFromDevice(id: string): Promise<SavedWriteResult> {
    try {
      await repository?.delete(id)
    } catch (error) {
      reportFailure('削除', failureText(error))
      return 'failed'
    }
    applyRemoved(id)
    return 'saved'
  }

  async function removeFromAccount(
    account: SavedItemsApi<T, P, V>,
    text: SavedItemsMessages,
    id: string,
  ): Promise<SavedWriteResult> {
    const gen = generation
    const result = await account.remove(id)
    if (gen !== generation) return 'discarded'
    if (result.kind === 'ok') {
      applyRemoved(id)
      return 'saved'
    }
    if (result.kind === 'unauthorized') {
      handleExpired(text.expiredWrite)
      return 'expired'
    }
    reportFailure('削除', causeText(result))
    return 'failed'
  }

  async function removeFromSource(id: string): Promise<SavedWriteResult> {
    return source.value === 'account' && api !== undefined && messages !== undefined
      ? removeFromAccount(api, messages, id)
      : removeFromDevice(id)
  }

  /** 削除。保存先から消えてから一覧を変える。応答を待つ間は `deletingIds` に入れ、同じ ID の削除を重ねて受け付けない。 */
  async function remove(id: string): Promise<SavedWriteResult> {
    if (!isWritable() || deletingIds.value.includes(id)) return 'failed'
    deletingIds.value = [...deletingIds.value, id]
    try {
      return await removeFromSource(id)
    } finally {
      deletingIds.value = deletingIds.value.filter((item) => item !== id)
    }
  }

  async function deleteQuietly(local: SavedRepository<T>, id: string): Promise<void> {
    try {
      await local.delete(id)
    } catch {
      // 消せなくても取り込んだものとして数える。次の取り込みで AC-5 のとおり扱う
    }
  }

  /** 受け付けた1件を端末から消す。応答の時点で保存先が変わっていたら、切り替えの読み込みの後に一覧からも除く。 */
  async function afterAccepted(
    local: SavedRepository<T>,
    id: string,
    gen: number,
  ): Promise<ImportStep> {
    await deleteQuietly(local, id)
    if (gen === generation) return { kind: 'imported' }
    await loading
    items.value = items.value.filter((item) => item.id !== id)
    return { kind: 'discarded' }
  }

  async function importOne(
    account: SavedItemsApi<T, P, V>,
    local: SavedRepository<T>,
    row: T,
    known: Set<string>,
    gen: number,
  ): Promise<ImportStep> {
    if (gen !== generation) return { kind: 'discarded' }
    if (known.has(row.id)) {
      await deleteQuietly(local, row.id)
      return { kind: 'imported' }
    }
    const result = await account.create({
      id: row.id,
      payload: row.payload,
      schemaVersion: row.schemaVersion as V,
    })
    if (result.kind === 'ok') return afterAccepted(local, row.id, gen)
    if (gen !== generation) return { kind: 'discarded' }
    if (result.kind === 'badRequest' || result.kind === 'conflict') return { kind: 'rejected' }
    return { kind: 'halt', failure: result }
  }

  function importDoneMessage(imported: number, kept: number): string {
    return kept === 0
      ? `${noun}を ${imported} 件アカウントに取り込みました。`
      : `${noun}の取り込みが終わりました。取り込んだのは ${imported} 件で、${kept} 件はアカウントに保存できなかったため、この端末に残しています。`
  }

  function importHaltMessage(failure: ApiFailure, imported: number, kept: number): string {
    const counts = `取り込んだのは ${imported} 件で、${kept} 件はこの端末に残しています。`
    return failure.kind === 'unauthorized'
      ? `ログインの有効期限が切れたため、取り込みを止めました。${counts}端末内の${noun}に切り替えました。もう一度「Discord でログイン」を押すと、続きを取り込めます。`
      : `${noun}の取り込みを途中で止めました。${causeText(failure)} ${counts}通信の状態を確かめて、もう一度「アカウントに取り込む」を押してください。`
  }

  /** 最後まで送った。拒否があれば destructive。 */
  async function finishCompleted(imported: number, kept: number): Promise<SavedImportResult> {
    toast.push(importDoneMessage(imported, kept), kept === 0 ? undefined : 'destructive')
    await loadAccount(true)
    return kept === 0 ? 'done' : 'partial'
  }

  /** 401 または通信・サーバーの失敗で止めた。 */
  async function finishHalted(
    failure: ApiFailure,
    imported: number,
    kept: number,
  ): Promise<SavedImportResult> {
    toast.push(importHaltMessage(failure, imported, kept), 'destructive')
    if (failure.kind !== 'unauthorized') {
      await loadAccount(true)
      return 'stopped'
    }
    auth?.expire()
    if (source.value === 'account') switchToDevice()
    await loading
    return 'expired'
  }

  async function finishDeviceFailure(error: unknown): Promise<SavedImportResult> {
    toast.push(
      `${noun}を取り込めませんでした。${failureText(error)} もう一度お試しください。`,
      'destructive',
    )
    await loadAccount(true)
    return 'stopped'
  }

  /** 端末の一覧を送る順（ID の昇順）で読む。 */
  async function readDeviceRows(): Promise<{ local: SavedRepository<T>; rows: T[] }> {
    const local = await opener.value()
    return { local, rows: (await local.list()).sort(byIdDescending).reverse() }
  }

  async function sendAll(
    account: SavedItemsApi<T, P, V>,
    local: SavedRepository<T>,
    rows: T[],
    known: Set<string>,
    gen: number,
  ): Promise<SavedImportResult> {
    let imported = 0
    let rejected = 0
    for (const [index, row] of rows.entries()) {
      const step = await importOne(account, local, row, known, gen)
      if (step.kind === 'discarded') return 'discarded'
      if (step.kind === 'halt') {
        return finishHalted(step.failure, imported, rejected + rows.length - index)
      }
      if (step.kind === 'imported') imported += 1
      else rejected += 1
    }
    return finishCompleted(imported, rejected)
  }

  async function runImport(
    account: SavedItemsApi<T, P, V>,
    gen: number,
  ): Promise<SavedImportResult> {
    let device: { local: SavedRepository<T>; rows: T[] }
    try {
      device = await readDeviceRows()
    } catch (error) {
      return finishDeviceFailure(error)
    }
    const listed = await account.list()
    if (gen !== generation) return 'discarded'
    if (listed.kind !== 'ok') return finishHalted(listed, 0, device.rows.length)
    const known = new Set(listed.value.map((item) => item.id))
    return sendAll(account, device.local, device.rows, known, gen)
  }

  /**
   * 端末内の一覧を、アカウントへ1件ずつ順に送って取り込む。アカウントの保存先で、取り込み中でないときだけ始める。
   * 終わり方ごとにトーストを1回出し、読み直すまで `importing` を立てる。
   */
  async function importFromDevice(): Promise<SavedImportResult> {
    if (api === undefined || source.value !== 'account' || importing.value) return 'ignored'
    importing.value = true
    try {
      return await runImport(api, generation)
    } finally {
      importing.value = false
    }
  }

  return {
    status,
    source,
    failureMessage,
    items,
    deviceCount,
    deletingIds,
    importing,
    importFromDevice,
    setRepositoryOpener,
    setApi,
    ensureLoaded,
    reload,
    save,
    remove,
  }
}
