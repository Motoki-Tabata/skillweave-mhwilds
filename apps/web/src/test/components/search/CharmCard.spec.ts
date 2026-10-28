import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import type { CharmPayload } from '@/lib/charms/types'
import { createMemoryCharmRepository } from '../../support/charmRepository'
import { storedCharm } from '../../support/charms'
import { accountCharm, createMemoryCharmsApi } from '../../support/charmsApi'
import { makeBundle, makeTableBundle, sk } from '../../support/fixtures'
import {
  click,
  fakeAuthApi,
  installDomPolyfills,
  mountReadyApp,
  restoreStubs,
  stubBackend,
  textOf,
} from '../../support/mount'
import type { Mounted } from '../../support/mount'
import type { CharmRepository } from '@/lib/charms/storage'

const good: CharmPayload = {
  rarity: 8,
  skills: [{ skillId: sk('a1'), level: 2 }],
  slots: [{ target: 'weapon', level: 1 }],
}
const overLevel: CharmPayload = { ...good, skills: [{ skillId: sk('a1'), level: 9 }] }

// 受入基準 8・10・11（S1 の「護石」カードの4つの状態と S2 へのリンク）
describe('CharmCard（S1 の護石カード）', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  beforeEach(() => stubBackend({ bundle: makeTableBundle() }))
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
  })

  const card = () =>
    Array.from(document.querySelectorAll('section, div')).find(
      (el) => el.querySelector(':scope > h2')?.textContent === '護石',
    ) as HTMLElement

  it('カードは武器・必須スキル・護石・検索条件の順に並ぶ', async () => {
    mounted = await mountReadyApp()
    const headings = Array.from(document.querySelectorAll('form h2')).map((h) => textOf(h))
    expect(headings.slice(0, 3)).toEqual(['武器', '必須スキル', '護石'])
  })

  it('登録が0件: 護石なしで検索する旨と、S2 へのリンクを出す', async () => {
    mounted = await mountReadyApp()
    expect(textOf(card())).toContain(
      '鑑定護石が登録されていません。生産護石だけを候補にして検索します。',
    )
    const link = card().querySelector('a')!
    expect(textOf(link)).toBe('護石の一覧へ')
    expect(link.getAttribute('href')).toBe('/charms')
  })

  it('候補が1件以上: 候補の件数を出し、外す護石が無ければ補助文を出さない', async () => {
    mounted = await mountReadyApp({
      charmRepository: createMemoryCharmRepository([storedCharm(1, good), storedCharm(2, good)]),
    })
    expect(textOf(card())).toContain('候補にする鑑定護石: 2 件')
    expect(textOf(card())).not.toContain('候補から外しています')
  })

  it('検索対象外の護石があるとき、登録数と外す件数を補助文に出す', async () => {
    mounted = await mountReadyApp({
      charmRepository: createMemoryCharmRepository([
        storedCharm(1, good),
        storedCharm(2, overLevel),
      ]),
    })
    expect(textOf(card())).toContain('候補にする鑑定護石: 1 件')
    expect(textOf(card())).toContain(
      '登録した 2 件のうち 1 件は、スキルが現行のマスターに合わないため候補から外しています。',
    )
  })

  it('読込失敗: 原因つきの警告を出し、護石なしで検索できる。S2 へのリンクは残る', async () => {
    const repository = createMemoryCharmRepository([storedCharm(1, good)])
    repository.failWith('list', 'unknown')
    mounted = await mountReadyApp({ charmRepository: repository })
    await vi.waitFor(() => expect(mounted!.charms.status).toBe('failed'))
    await flushPromises()
    expect(textOf(card())).toContain(
      '護石を読み込めませんでした（端末への保存（IndexedDB）に失敗しました）。生産護石だけを候補にして検索します。',
    )
    expect(card().querySelector('a')).not.toBeNull()
    expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')).not.toBeNull()
  })

  // 010 AC-1: ログイン中はアカウントの護石から数える
  it('ログイン中: 候補の件数はアカウントの護石から数え、端末内の護石は数えない', async () => {
    mounted = await mountReadyApp({
      authApi: fakeAuthApi({
        fetchCurrentUser: async () => ({ kind: 'authenticated', displayName: 'テスト' }),
      }),
      charmsApi: createMemoryCharmsApi([accountCharm(storedCharm(1, good))]),
      charmRepository: createMemoryCharmRepository([storedCharm(2, good), storedCharm(3, good)]),
    })
    await vi.waitFor(() => expect(textOf(card())).toContain('候補にする鑑定護石: 1 件'))
  })

  // 010 AC-12: 原因の文末の「。」を重ねない
  it('ログイン中の読込失敗: サーバーの原因を括弧に入れ、句点を重ねない', async () => {
    const api = createMemoryCharmsApi()
    api.failWith('list', { kind: 'failed', cause: 'network' })
    mounted = await mountReadyApp({
      authApi: fakeAuthApi({
        fetchCurrentUser: async () => ({ kind: 'authenticated', displayName: 'テスト' }),
      }),
      charmsApi: api,
    })
    await vi.waitFor(() => expect(mounted!.charms.status).toBe('failed'))
    await flushPromises()
    expect(textOf(card())).toContain(
      '護石を読み込めませんでした（サーバーに接続できませんでした）。生産護石だけを候補にして検索します。',
    )
  })

  it('読込中: 300ms 未満は何も出さず、超えたら読み込み中の文言を出す', async () => {
    let release: (r: CharmRepository) => void = () => {}
    const pending = new Promise<CharmRepository>((resolve) => {
      release = resolve
    })
    const base = createMemoryCharmRepository()
    mounted = await mountReadyApp()
    mounted.charms.setRepositoryOpener(() => pending)
    void mounted.charms.ensureLoaded()
    await flushPromises()
    expect(textOf(card())).not.toContain('護石を読み込んでいます…')
    await vi.waitFor(() => expect(textOf(card())).toContain('護石を読み込んでいます…'))
    release(base)
    await vi.waitFor(() => expect(textOf(card())).toContain('鑑定護石が登録されていません'))
  })

  // AC-2・AC-5・AC-6（021）
  describe('生産護石の切り替え', () => {
    const toggle = () => document.querySelector<HTMLElement>('#include-crafted-charms')!

    it('AC-2: 「生産護石を候補に含める」の切り替えを置き、既定はオン', async () => {
      mounted = await mountReadyApp()
      expect(textOf(card())).toContain('生産護石を候補に含める')
      expect(toggle().getAttribute('aria-checked')).toBe('true')
      expect(mounted.conditions.includeCraftedCharms).toBe(true)
    })

    it('AC-5: 補助テキストに系統ごとの最上位ランクの件数を出し、切り替えで文言の後半が変わる', async () => {
      stubBackend({ bundle: makeBundle({ craftedCharms: true }) })
      mounted = await mountReadyApp()
      expect(textOf(card())).toContain('系統ごとに最上位ランクの 2 件）。')
      expect(textOf(card())).toContain(
        '鑑定護石が登録されていません。生産護石だけを候補にして検索します。',
      )
      await click(toggle())
      expect(mounted.conditions.includeCraftedCharms).toBe(false)
      expect(textOf(card())).toContain('鑑定護石が登録されていません。護石なしで検索します。')
    })

    it('AC-6: 読込失敗のときも切り替えを操作でき、オフなら護石なしで検索する旨を出す', async () => {
      const repository = createMemoryCharmRepository([storedCharm(1, good)])
      repository.failWith('list', 'unknown')
      mounted = await mountReadyApp({ charmRepository: repository })
      await vi.waitFor(() => expect(mounted!.charms.status).toBe('failed'))
      await click(toggle())
      expect(textOf(card())).toContain('。護石なしで検索します。')
    })
  })
})
