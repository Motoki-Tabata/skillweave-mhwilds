import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { FakeWorker, makeCandidate, makeTableBundle, wp } from '../../support/fixtures'
import {
  click,
  findButton,
  flushPromises,
  installDomPolyfills,
  mountReadyApp,
  restoreStubs,
  stubBackend,
  textOf,
} from '../../support/mount'
import type { Mounted } from '../../support/mount'

// 017 の候補のカード（AC-4・D18）
describe('ReverseCandidateCard', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
    document.body.innerHTML = ''
  })

  async function showCandidate(candidate = makeCandidate()) {
    stubBackend({ bundle: makeTableBundle() })
    mounted = await mountReadyApp()
    mounted.conditions.selectWeapon(wp('great-sword:1'))
    await flushPromises()
    await click(findButton('護石を逆引き'))
    const worker = FakeWorker.last
    worker.emit({
      type: 'reverseResult',
      requestId: worker.lastReverseId,
      response: { status: 'feasible', candidates: [candidate], elapsedMs: 1 },
    })
    await flushPromises()
    return document.querySelector('section[aria-labelledby="results-heading"] ul > li')!
  }

  const section = (card: Element, name: string) =>
    Array.from(card.querySelectorAll('h4'))
      .find((h) => textOf(h) === name)
      ?.closest('section') ?? null

  it('AC-4: 見出し「候補 1」に狙う護石のレア度・スキル・スロットを示す', async () => {
    const card = await showCandidate()
    expect(textOf(card.querySelector('h3'))).toBe('候補 1')
    const target = section(card, '狙う護石')!
    expect(target).not.toBeNull()
    const rows = Array.from(target.querySelectorAll('dt')).map((dt) => textOf(dt))
    expect(rows).toEqual(['レア度', 'スキル', 'スロット'])
    expect(textOf(target)).toContain('レア度8')
    expect(textOf(target)).toContain('武器用 Lv1・防具用 Lv2')
    expect(textOf(target.querySelector('ul'))).toContain('Lv2')
  })

  it('AC-4: 構成に効かない枠は「任意」のチップ（破線・文言）で示す', async () => {
    const card = await showCandidate()
    const chips = Array.from(section(card, '狙う護石')!.querySelectorAll('li'))
    expect(chips).toHaveLength(2)
    expect(textOf(chips[1]!)).toBe('任意')
    expect(chips[1]!.classList.contains('border-dashed')).toBe(true)
    expect(chips[1]!.classList.contains('text-muted-foreground')).toBe(true)
    expect(chips[0]!.classList.contains('border-dashed')).toBe(false)
  })

  it('AC-4: スロットが無い護石は「スロットなし」', async () => {
    const candidate = makeCandidate()
    candidate.charm.slots = []
    candidate.build.decorations = []
    const card = await showCandidate(candidate)
    expect(textOf(section(card, '狙う護石'))).toContain('スロットなし')
  })

  it('AC-4: 構成のカードの「護石」の節は出さず（二重にしない）、装飾品の持ち主は「護石」にする', async () => {
    const card = await showCandidate()
    expect(section(card, '護石')).toBeNull()
    const decorationRow = textOf(section(card, '装飾品')!.querySelector('tbody tr'))
    expect(decorationRow).toBe('護石Lv2攻撃珠【２】')
    expect(textOf(card)).toContain('防具')
    expect(textOf(card)).toContain('発動スキル')
  })

  it('AC-4: 「狙う護石」は火力の節の上（見出しの直下）にある', async () => {
    const card = await showCandidate()
    const headings = Array.from(card.querySelectorAll('h4')).map((h) => textOf(h))
    expect(headings.indexOf('狙う護石')).toBe(0)
    expect(headings).toContain('火力')
  })

  it('AC-4: 構成の保存は示さない', async () => {
    const card = await showCandidate()
    expect(card.querySelector('[data-save-index]')).toBeNull()
    expect(textOf(card)).not.toContain('保存')
  })
})
