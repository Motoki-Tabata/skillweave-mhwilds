import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Pinia } from 'pinia'
import { vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '@/App.vue'
import { installTitleHook, routes } from '@/router'
import { createMemoryCharmRepository } from './charmRepository'
import { createMemoryWeaponRepository } from './weaponRepository'
import type { AuthApi } from '@/lib/api/auth'
import type { CharmsApi } from '@/lib/api/charms'
import { createMemoryCharmsApi } from './charmsApi'
import type { BuildsApi } from '@/lib/api/builds'
import { createMemoryBuildsApi } from './buildsApi'
import { useBuildsStore } from '@/stores/builds'
import type { CharmRepository } from '@/lib/charms/storage'
import type { WeaponRepository } from '@/lib/weapons/storage'
import { useAuthStore } from '@/stores/auth'
import { useWeaponsStore } from '@/stores/weapons'
import { useCharmsStore } from '@/stores/charms'
import { useConditionsStore } from '@/stores/conditions'
import { useMasterStore } from '@/stores/master'
import { useSearchStore } from '@/stores/search'
import { FakeWorker, createFetchStub } from './fixtures'
import type { FetchStubOptions } from './fixtures'

/** jsdom に無いブラウザ API（Reka UI が使う）を足す。`beforeAll` で呼ぶ。 */
export function installDomPolyfills(): void {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.scrollIntoView ??= () => {}
  proto.hasPointerCapture ??= () => false
  proto.releasePointerCapture ??= () => {}
  proto.setPointerCapture ??= () => {}
}

/** Worker と fetch を偽物にする。`beforeEach` で呼び、`afterEach` で `restoreStubs` を呼ぶ。 */
export function stubBackend(options: FetchStubOptions = {}): void {
  FakeWorker.reset()
  vi.stubGlobal('Worker', FakeWorker)
  vi.stubGlobal('fetch', vi.fn(createFetchStub(options)))
}

export function restoreStubs(): void {
  vi.unstubAllGlobals()
  FakeWorker.reset()
}

export function newPinia(): Pinia {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}

/** 護石の保存先を差し替える。既定はメモリ上の実装（IndexedDB は jsdom に無い）。 */
function installRepository(pinia: Pinia, given?: CharmRepository): CharmRepository {
  const repository = given ?? createMemoryCharmRepository()
  useCharmsStore(pinia).setRepositoryOpener(async () => repository)
  return repository
}

/** 護石の API を差し替える。既定はメモリ上の実装（サーバーに届かない）。 */
function installCharmsApi(pinia: Pinia, given?: CharmsApi): CharmsApi {
  const api = given ?? createMemoryCharmsApi()
  useCharmsStore(pinia).setApi(api)
  return api
}

/** 構成の API を差し替える。既定はメモリ上の実装（サーバーに届かない）。 */
function installBuildsApi(pinia: Pinia, given?: BuildsApi): BuildsApi {
  const api = given ?? createMemoryBuildsApi()
  useBuildsStore(pinia).setApi(api)
  return api
}

/** 武器の保存先を差し替える。既定はメモリ上の実装。 */
function installWeaponRepository(pinia: Pinia, given?: WeaponRepository): WeaponRepository {
  const repository = given ?? createMemoryWeaponRepository()
  useWeaponsStore(pinia).setRepositoryOpener(async () => repository)
  return repository
}

/** 認証 API の偽物。既定は「取得できない」（ヘッダーに何も出さない）。 */
export function fakeAuthApi(overrides: Partial<AuthApi> = {}): AuthApi {
  return {
    fetchCurrentUser: async () => ({ kind: 'unavailable' }),
    logout: async () => true,
    ...overrides,
  }
}

function newRouter() {
  const router = createRouter({ history: createMemoryHistory(), routes })
  installTitleHook(router)
  return router
}

export interface MountOptions {
  /** 初期のパス。既定は `/` */
  path?: string
  /** 護石の保存先。既定は空のメモリ上の実装 */
  charmRepository?: CharmRepository
  /** 武器の保存先。既定は空のメモリ上の実装 */
  weaponRepository?: WeaponRepository
  /** 護石の API。既定は空のメモリ上の実装 */
  charmsApi?: CharmsApi
  /** 認証 API。既定は「取得できない」を返す偽物 */
  authApi?: AuthApi
  /** 構成の API。既定は空のメモリ上の実装 */
  buildsApi?: BuildsApi
}

export interface Mounted {
  wrapper: VueWrapper
  pinia: Pinia
  charms: ReturnType<typeof useCharmsStore>
  weapons: ReturnType<typeof useWeaponsStore>
  /** 武器の保存先（既定のときはメモリ上の実装） */
  weaponRepository: WeaponRepository
  /** 既定のとき（メモリ上の実装）だけ、保存の中身を見られる */
  repository: CharmRepository
  /** アカウントの護石の API（既定のときはメモリ上の実装） */
  charmsApi: CharmsApi
  /** 構成の API（既定のときはメモリ上の実装） */
  buildsApi: BuildsApi
  builds: ReturnType<typeof useBuildsStore>
  master: ReturnType<typeof useMasterStore>
  conditions: ReturnType<typeof useConditionsStore>
  search: ReturnType<typeof useSearchStore>
}

/** アプリ全体（App.vue + SearchView）をマウントする。読み込みは終わらせない。 */
export async function mountApp(options: MountOptions = {}): Promise<Mounted> {
  const pinia = newPinia()
  const repository = installRepository(pinia, options.charmRepository)
  const charmsApi = installCharmsApi(pinia, options.charmsApi)
  const buildsApi = installBuildsApi(pinia, options.buildsApi)
  const weaponRepository = installWeaponRepository(pinia, options.weaponRepository)
  useAuthStore(pinia).setApi(options.authApi ?? fakeAuthApi())
  const router = newRouter()
  await router.push(options.path ?? '/')
  await router.isReady()
  const wrapper = mount(App, { global: { plugins: [pinia, router] }, attachTo: document.body })
  await flushPromises()
  return {
    wrapper,
    pinia,
    charms: useCharmsStore(pinia),
    weapons: useWeaponsStore(pinia),
    weaponRepository,
    repository,
    charmsApi,
    buildsApi,
    builds: useBuildsStore(pinia),
    master: useMasterStore(pinia),
    conditions: useConditionsStore(pinia),
    search: useSearchStore(pinia),
  }
}

/** 読み込みが終わった（P3）アプリ。 */
export async function mountReadyApp(options: MountOptions = {}): Promise<Mounted> {
  const mounted = await mountApp(options)
  await vi.waitFor(() => {
    if (mounted.master.status !== 'ready') throw new Error('not ready')
  })
  await flushPromises()
  return mounted
}

/** ストアだけを読み込む（コンポーネントは別にマウントする）。 */
export async function loadStores(
  charmRepository?: CharmRepository,
  weaponRepositoryGiven?: WeaponRepository,
  backends: { authApi?: AuthApi; charmsApi?: CharmsApi; buildsApi?: BuildsApi } = {},
): Promise<Omit<Mounted, 'wrapper'>> {
  const pinia = newPinia()
  const repository = installRepository(pinia, charmRepository)
  const charmsApi = installCharmsApi(pinia, backends.charmsApi)
  const buildsApi = installBuildsApi(pinia, backends.buildsApi)
  useAuthStore(pinia).setApi(backends.authApi ?? fakeAuthApi())
  const weaponRepository = installWeaponRepository(pinia, weaponRepositoryGiven)
  const master = useMasterStore(pinia)
  await master.load()
  return {
    pinia,
    repository,
    charmsApi,
    buildsApi,
    builds: useBuildsStore(pinia),
    master,
    charms: useCharmsStore(pinia),
    weapons: useWeaponsStore(pinia),
    weaponRepository,
    conditions: useConditionsStore(pinia),
    search: useSearchStore(pinia),
  }
}

export { flushPromises }

/** 余分な空白をたたんだ本文。 */
export function textOf(element: Element | null): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** body 全体（ダイアログ・トーストを含む）から、本文が一致するボタンを探す。 */
export function findButton(text: string, root: ParentNode = document.body): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find((b) => textOf(b) === text)
  if (found === undefined) throw new Error(`ボタン「${text}」が見つかりません`)
  return found
}

export function findByLabel(label: string, root: ParentNode = document.body): HTMLElement {
  const found = root.querySelector<HTMLElement>(`[aria-label="${label}"]`)
  if (found === null) throw new Error(`aria-label「${label}」が見つかりません`)
  return found
}

/** クリックして描画を待つ。 */
export async function click(element: Element): Promise<void> {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  await flushPromises()
}

/** 入力欄に文字を入れて描画を待つ。 */
export async function typeInto(input: HTMLInputElement, text: string): Promise<void> {
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

/** フォーカスを外して（blur）描画を待つ。 */
export async function blur(element: HTMLElement): Promise<void> {
  element.dispatchEvent(new FocusEvent('blur'))
  await flushPromises()
}

/** 認証 API の偽物（ログイン中）。 */
export function loggedInAuth(): AuthApi {
  return fakeAuthApi({
    fetchCurrentUser: async () => ({ kind: 'authenticated', displayName: 'テスト' }),
  })
}
