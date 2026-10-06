import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Pinia } from 'pinia'
import { vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '@/App.vue'
import SearchView from '@/views/SearchView.vue'
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

function newRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: SearchView }],
  })
}

export interface Mounted {
  wrapper: VueWrapper
  pinia: Pinia
  master: ReturnType<typeof useMasterStore>
  conditions: ReturnType<typeof useConditionsStore>
  search: ReturnType<typeof useSearchStore>
}

/** アプリ全体（App.vue + SearchView）をマウントする。読み込みは終わらせない。 */
export async function mountApp(): Promise<Mounted> {
  const pinia = newPinia()
  const router = newRouter()
  await router.push('/')
  await router.isReady()
  const wrapper = mount(App, { global: { plugins: [pinia, router] }, attachTo: document.body })
  await flushPromises()
  return {
    wrapper,
    pinia,
    master: useMasterStore(pinia),
    conditions: useConditionsStore(pinia),
    search: useSearchStore(pinia),
  }
}

/** 読み込みが終わった（P3）アプリ。 */
export async function mountReadyApp(): Promise<Mounted> {
  const mounted = await mountApp()
  await vi.waitFor(() => {
    if (mounted.master.status !== 'ready') throw new Error('not ready')
  })
  await flushPromises()
  return mounted
}

/** ストアだけを読み込む（コンポーネントは別にマウントする）。 */
export async function loadStores(): Promise<Omit<Mounted, 'wrapper'>> {
  const pinia = newPinia()
  const master = useMasterStore(pinia)
  await master.load()
  return { pinia, master, conditions: useConditionsStore(pinia), search: useSearchStore(pinia) }
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
