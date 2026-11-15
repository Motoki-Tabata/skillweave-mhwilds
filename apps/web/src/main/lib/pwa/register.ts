import { useAppUpdateStore } from '@/stores/appUpdate'

/** 画面が見えるようになったとき、前回の確認からこれだけたっていれば新しい版を確かめる。 */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

type AppUpdateStore = ReturnType<typeof useAppUpdateStore>

/** 新しい版の SW が事前キャッシュを取り終えた（installed）ときに通知する。初回の訪問（controller 無し）では出さない。 */
function watchInstalling(registration: ServiceWorkerRegistration, store: AppUpdateStore): void {
  const worker = registration.installing
  if (!worker) return
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) store.setWaiting()
  })
}

function watchVisibility(registration: ServiceWorkerRegistration): void {
  let lastCheck = Date.now()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return
    lastCheck = Date.now()
    registration.update().catch(() => {})
  })
}

async function start(store: AppUpdateStore): Promise<void> {
  const container = navigator.serviceWorker
  // 初回の訪問の `clients.claim()` による最初の controllerchange では読み込み直さない。
  let reloadOnChange = container.controller !== null
  container.addEventListener('controllerchange', () => {
    if (reloadOnChange) location.reload()
    reloadOnChange = true
  })
  const registration = await container.register(`${import.meta.env.BASE_URL}sw.js`)
  store.setReloadHandler(() => registration.waiting?.postMessage({ type: 'SKIP_WAITING' }))
  if (registration.waiting && container.controller) store.setWaiting()
  registration.addEventListener('updatefound', () => watchInstalling(registration, store))
  watchVisibility(registration)
}

/** 本番のビルドだけで SW を `load` の後に登録する。失敗は何も出さない（AC-10・AC-11）。 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const store = useAppUpdateStore()
  window.addEventListener('load', () => {
    start(store).catch(() => {})
  })
}
