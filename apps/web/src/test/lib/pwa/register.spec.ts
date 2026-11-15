import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { registerServiceWorker, UPDATE_CHECK_INTERVAL_MS } from '@/lib/pwa/register'
import { useAppUpdateStore } from '@/stores/appUpdate'

class FakeWorker extends EventTarget {
  state = 'installing'
  postMessage = vi.fn()
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null
  installing: FakeWorker | null = null
  update = vi.fn(async () => undefined)
}

class FakeContainer extends EventTarget {
  controller: object | null = null
  registration = new FakeRegistration()
  register = vi.fn(async (_url: string) => this.registration)
}

const added: [EventTarget, string, EventListenerOrEventListenerObject][] = []

/** テスト間でリスナーが残らないよう、追加したものを控えて後で外す。 */
function trackListeners(target: EventTarget): void {
  const original = target.addEventListener.bind(target)
  vi.spyOn(target, 'addEventListener').mockImplementation((type, listener, options) => {
    if (listener) added.push([target, type, listener])
    original(type, listener, options)
  })
}

let container: FakeContainer
let reload: ReturnType<typeof vi.fn>

async function boot(): Promise<void> {
  registerServiceWorker()
  window.dispatchEvent(new Event('load'))
  await vi.waitFor(() => expect(container.register).toHaveBeenCalled())
  // register の解決後の続き（リスナーの追加）が終わるのを待つ
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('lib/pwa/register', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    trackListeners(window)
    trackListeners(document)
    container = new FakeContainer()
    Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true })
    reload = vi.fn()
    vi.stubGlobal('location', { reload })
    vi.stubEnv('PROD', true)
  })

  afterEach(() => {
    for (const [target, type, listener] of added) target.removeEventListener(type, listener)
    added.length = 0
    vi.restoreAllMocks()
    Reflect.deleteProperty(navigator, 'serviceWorker')
    Reflect.deleteProperty(document, 'visibilityState')
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('AC-11: 本番以外では登録しない', async () => {
    vi.stubEnv('PROD', false)
    registerServiceWorker()
    window.dispatchEvent(new Event('load'))
    await Promise.resolve()
    expect(container.register).not.toHaveBeenCalled()
  })

  it('AC-2: 本番では load の後に sw.js を登録する。load の前には登録しない', async () => {
    registerServiceWorker()
    await Promise.resolve()
    expect(container.register).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('load'))
    await vi.waitFor(() => expect(container.register).toHaveBeenCalledWith('/sw.js'))
  })

  it('AC-8: 初回の訪問（controller が無い）では、待っていても通知しない', async () => {
    container.registration.waiting = new FakeWorker()
    await boot()
    expect(useAppUpdateStore().visible).toBe(false)
  })

  it('AC-8: 登録の時点で waiting があり controller もあれば通知する', async () => {
    container.controller = {}
    container.registration.waiting = new FakeWorker()
    await boot()
    expect(useAppUpdateStore().visible).toBe(true)
  })

  it('AC-8: updatefound の installing が installed になり controller があれば通知する', async () => {
    container.controller = {}
    await boot()
    const worker = new FakeWorker()
    container.registration.installing = worker
    container.registration.dispatchEvent(new Event('updatefound'))
    expect(useAppUpdateStore().visible).toBe(false)
    worker.state = 'installed'
    worker.dispatchEvent(new Event('statechange'))
    expect(useAppUpdateStore().visible).toBe(true)
  })

  it('AC-8: 初回の訪問で installed になっても通知しない', async () => {
    await boot()
    const worker = new FakeWorker()
    container.registration.installing = worker
    container.registration.dispatchEvent(new Event('updatefound'))
    worker.state = 'installed'
    worker.dispatchEvent(new Event('statechange'))
    expect(useAppUpdateStore().visible).toBe(false)
  })

  it('AC-9: 再読み込みの操作で waiting に SKIP_WAITING を送り、再読み込み中にする', async () => {
    container.controller = {}
    const waiting = new FakeWorker()
    container.registration.waiting = waiting
    await boot()
    const store = useAppUpdateStore()
    store.reload()
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(store.reloading).toBe(true)
  })

  it('AC-9: 起動の時点で controller があれば、controllerchange で読み込み直す', async () => {
    container.controller = {}
    await boot()
    container.dispatchEvent(new Event('controllerchange'))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('AC-2: 初回の訪問の最初の controllerchange（claim）では読み込み直さず、2回目からは読み込み直す', async () => {
    await boot()
    container.dispatchEvent(new Event('controllerchange'))
    expect(reload).not.toHaveBeenCalled()
    container.dispatchEvent(new Event('controllerchange'))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('AC-10: 登録の失敗は握りつぶし、通知も出さない', async () => {
    container.register.mockRejectedValueOnce(new Error('offline'))
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    registerServiceWorker()
    window.dispatchEvent(new Event('load'))
    await vi.waitFor(() => expect(container.register).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
    expect(useAppUpdateStore().visible).toBe(false)
  })

  it('AC-8: 画面が見えるようになったとき、1 時間未満なら update を呼ばず、1 時間以上なら呼ぶ', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(0)
    await boot()
    vi.setSystemTime(UPDATE_CHECK_INTERVAL_MS - 1000)
    setVisibility('visible')
    expect(container.registration.update).not.toHaveBeenCalled()
    vi.setSystemTime(UPDATE_CHECK_INTERVAL_MS + 1000)
    setVisibility('hidden')
    expect(container.registration.update).not.toHaveBeenCalled()
    setVisibility('visible')
    expect(container.registration.update).toHaveBeenCalledTimes(1)
    setVisibility('visible')
    expect(container.registration.update).toHaveBeenCalledTimes(1)
  })

  it('AC-10: update の失敗は握りつぶす', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(0)
    await boot()
    container.registration.update.mockRejectedValueOnce(new Error('offline'))
    vi.setSystemTime(UPDATE_CHECK_INTERVAL_MS + 1000)
    expect(() => setVisibility('visible')).not.toThrow()
    await Promise.resolve()
    expect(container.registration.update).toHaveBeenCalledTimes(1)
  })
})
