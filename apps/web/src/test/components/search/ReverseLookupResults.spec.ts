import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { ReverseLookupResponse } from '@swv/solver'
import { FakeWorker, makeCandidate, makeTableBundle, makeBuild, wp } from '../../support/fixtures'
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

const panel = () => document.querySelector('section[aria-labelledby="results-heading"]')!
const text = () => textOf(panel())
const heading = () => document.getElementById('results-heading')!

// 017 の結果パネルの逆引き（R1〜R6・要約・見出し・フォーカス。D17）
describe('結果パネルの逆引き', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
    document.body.innerHTML = ''
  })

  async function start(prepare?: (m: Mounted) => void) {
    stubBackend({ bundle: makeTableBundle() })
    const m = await mountReadyApp()
    mounted = m
    m.conditions.selectWeapon(wp('great-sword:1'))
    prepare?.(m)
    await flushPromises()
    await click(findButton('護石を逆引き'))
    return { m, worker: FakeWorker.last }
  }

  async function finish(worker: FakeWorker, response: ReverseLookupResponse) {
    worker.emit({ type: 'reverseResult', requestId: worker.lastReverseId, response })
    await flushPromises()
  }

  const candidates = (n: number) => Array.from({ length: n }, makeCandidate)

  it('AC-9: 逆引きを始めると見出しを「逆引きの結果」にして、そこへフォーカスを移す', async () => {
    await start()
    expect(heading().textContent?.trim()).toBe('逆引きの結果')
    expect(document.activeElement).toBe(heading())
  })

  it('AC-12: 逆引きしていないときの見出しは「検索結果」で、検索の実行後も変わらない', async () => {
    stubBackend({ bundle: makeTableBundle() })
    mounted = await mountReadyApp()
    expect(heading().textContent?.trim()).toBe('検索結果')
    mounted.conditions.selectWeapon(wp('great-sword:1'))
    await flushPromises()
    await click(document.querySelector('button[type="submit"]')!)
    expect(heading().textContent?.trim()).toBe('検索結果')
    expect(text()).toContain('見つけた構成:')
  })

  it('AC-9: R1 実行中は件数と「キャンセル」と、見つけた順の候補・要約を出す', async () => {
    const { worker } = await start()
    expect(text()).toContain('見つけた護石: 0 件')
    expect(text()).not.toContain('見つけた順に表示しています')
    worker.emit({
      type: 'reverseProgress',
      requestId: worker.lastReverseId,
      found: 1,
      candidate: makeCandidate(),
    })
    await flushPromises()
    expect(text()).toContain('見つけた護石: 1 件')
    expect(text()).toContain(
      '見つけた順に表示しています。逆引きが終わると、要るスキルが少ない順に並べ直します。',
    )
    expect(text()).toContain('候補 1')
    expect(text()).toContain('抽選テーブル: レア8')
    expect(text()).not.toContain('目的')
    expect(
      Array.from(panel().querySelectorAll('button')).some((b) => textOf(b) === 'キャンセル'),
    ).toBe(true)
  })

  it('AC-5: R2 件数未満のときは全部である旨と並びの補助文を出す', async () => {
    const { worker } = await start()
    await finish(worker, { status: 'feasible', candidates: candidates(2), elapsedMs: 1 })
    expect(text()).toContain('2 件の護石が見つかりました')
    expect(text()).toContain('条件を満たせる護石はこれで全部です。')
    expect(text()).toContain(
      '抽選の出やすさは示していません。要るスキルが少ない順・レベルの合計が低い順・レア度が低い順に並べています。',
    )
    expect(text()).toContain('候補 2')
    expect(text()).not.toContain('候補 3')
  })

  it('AC-5: R2 10 件のときは上限に達した旨を出す', async () => {
    const { worker } = await start()
    await finish(worker, { status: 'feasible', candidates: candidates(10), elapsedMs: 1 })
    expect(text()).toContain('10 件の護石が見つかりました')
    expect(text()).toContain(
      '件数の上限（10 件）に達しました。必須スキルを増やすと、候補を絞り込めます。',
    )
  })

  it('AC-4: 要約に武器・必須スキル・発動条件・固定・除外・抽選テーブルを出し、目的と件数・護石は出さない', async () => {
    const { worker } = await start()
    await finish(worker, { status: 'feasible', candidates: candidates(1), elapsedMs: 1 })
    expect(text()).toContain(
      '／ 必須スキル 0 件 ／ 発動条件: なし ／ 固定なし ／ 除外なし ／ 抽選テーブル: レア8',
    )
    expect(text()).not.toContain('鑑定護石')
    expect(text()).not.toContain('件まで')
  })

  it('AC-7: R3 見つからないときは条件を満たせない旨と、全ランク・固定なしでは出さない行動を示す', async () => {
    const { worker } = await start((m) => m.conditions.setRank('low', true))
    await finish(worker, { status: 'infeasible', candidates: [], elapsedMs: 1 })
    expect(text()).toContain('抽選テーブルのどの護石でも条件を満たせません')
    expect(text()).toContain('必須スキルを減らす')
    expect(text()).toContain('下限レベルを下げる')
    expect(text()).not.toContain('候補にするランクを広げる')
    expect(text()).not.toContain('部位の固定や除外を減らす')
  })

  it('AC-7: R3 ランクを絞り、防具を除外しているときは広げる・減らす行動も示す', async () => {
    const { worker } = await start((m) => {
      m.conditions.setRank('low', false)
      m.pinia.state.value.lockExclude.excludedArmorIds = ['x']
    })
    await finish(worker, { status: 'infeasible', candidates: [], elapsedMs: 1 })
    expect(text()).toContain('候補にするランクを広げる')
    expect(text()).toContain('部位の固定や除外を減らす')
  })

  it('AC-9: R4 打ち切りで候補があるときは打ち切った旨と件数、候補を出す', async () => {
    const { worker } = await start()
    await finish(worker, { status: 'timeout', candidates: candidates(1), elapsedMs: 1 })
    expect(text()).toContain(
      '時間の上限で逆引きを打ち切りました。それまでに見つけた 1 件を表示しています。',
    )
    expect(text()).toContain(
      '必須スキルを減らす・下限レベルを下げると、最後まで探せることがあります。',
    )
    expect(text()).toContain('候補 1')
  })

  it('AC-9: R5 打ち切りで候補が無いときは見つかっていない旨を出す', async () => {
    const { worker } = await start()
    await finish(worker, { status: 'timeout', candidates: [], elapsedMs: 1 })
    expect(text()).toContain('時間の上限で逆引きを打ち切りました。護石は見つかっていません。')
    expect(text()).not.toContain('条件を満たせません')
  })

  it('AC-9: R6 エラーは「逆引きできませんでした」と原因を出す', async () => {
    const { worker } = await start()
    worker.emit({ type: 'error', requestId: worker.lastReverseId, message: '原因の文言' })
    await flushPromises()
    expect(text()).toContain('逆引きできませんでした')
    expect(text()).toContain('原因の文言')
    expect(text()).toContain(
      '条件を変えて逆引きし直してください。直らないときは、ページを再読み込みしてください。',
    )
  })

  it('AC-12: 逆引きの後に検索を始めると、見出しも表示も検索に戻る', async () => {
    const { worker } = await start()
    await finish(worker, { status: 'feasible', candidates: candidates(1), elapsedMs: 1 })
    await click(document.querySelector('button[type="submit"]')!)
    expect(heading().textContent?.trim()).toBe('検索結果')
    expect(text()).toContain('見つけた構成:')
    worker.emit({
      type: 'result',
      requestId: worker.lastSolveId,
      response: { status: 'optimal', builds: [makeBuild()], elapsedMs: 1 },
    })
    await flushPromises()
    expect(text()).toContain('1 件の構成が見つかりました')
    expect(text()).not.toContain('候補 1')
  })
})
