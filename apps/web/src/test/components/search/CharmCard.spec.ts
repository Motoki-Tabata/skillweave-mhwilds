import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import type { CharmPayload } from '@/lib/charms/types'
import { createMemoryCharmRepository } from '../../support/charmRepository'
import { storedCharm } from '../../support/charms'
import { makeTableBundle, sk } from '../../support/fixtures'
import {
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

// 受入基準 2・10（S1 の「護石」カードの4つの状態と S2 へのリンク）
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
    expect(textOf(card())).toContain('護石が登録されていません。護石なしで検索します。')
    const link = card().querySelector('a')!
    expect(textOf(link)).toBe('護石の一覧へ')
    expect(link.getAttribute('href')).toBe('/charms')
  })

  it('候補が1件以上: 候補の件数を出し、外す護石が無ければ補助文を出さない', async () => {
    mounted = await mountReadyApp({
      charmRepository: createMemoryCharmRepository([storedCharm(1, good), storedCharm(2, good)]),
    })
    expect(textOf(card())).toContain('候補にする護石: 2 件')
    expect(textOf(card())).not.toContain('候補から外しています')
  })

  it('検索対象外の護石があるとき、登録数と外す件数を補助文に出す', async () => {
    mounted = await mountReadyApp({
      charmRepository: createMemoryCharmRepository([
        storedCharm(1, good),
        storedCharm(2, overLevel),
      ]),
    })
    expect(textOf(card())).toContain('候補にする護石: 1 件')
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
      '護石を読み込めませんでした（端末への保存（IndexedDB）に失敗しました。）。護石なしで検索します。',
    )
    expect(card().querySelector('a')).not.toBeNull()
    expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')).not.toBeNull()
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
    await vi.waitFor(() => expect(textOf(card())).toContain('護石が登録されていません'))
  })
})
