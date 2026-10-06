import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { SolverResponse } from '@swv/solver'
import { LOADING_SKELETON_DELAY_MS } from '@/constants/search'
import { FakeWorker, makeBuild, sk, wp } from '../support/fixtures'
import {
  click,
  findButton,
  installDomPolyfills,
  mountApp,
  mountReadyApp,
  restoreStubs,
  stubBackend,
  textOf,
} from '../support/mount'
import type { Mounted } from '../support/mount'

const body = () => textOf(document.body)

describe('SearchView', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    vi.useRealTimers()
    restoreStubs()
  })

  // 受入基準 1（P1 読込中）
  describe('P1 読込中', () => {
    it('300ms 未満は何も出さず、超えたらスケルトンと読込中の文言を出す。条件フォームは描画しない', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      stubBackend({ hang: true })
      mounted = await mountApp()
      expect(mounted.master.status).toBe('loading')
      expect(body()).not.toContain('マスターデータとソルバーを読み込んでいます…')
      vi.advanceTimersByTime(LOADING_SKELETON_DELAY_MS - 1)
      await nextTick()
      expect(body()).not.toContain('マスターデータとソルバーを読み込んでいます…')
      vi.advanceTimersByTime(1)
      await nextTick()
      expect(body()).toContain('マスターデータとソルバーを読み込んでいます…')
      expect(document.querySelector('output')?.textContent).toContain('読み込んでいます')
      expect(document.querySelector('form')).toBeNull()
    })

    it('画面を開くと、マスターを Worker に1回だけ渡して P3 になる', async () => {
      stubBackend()
      mounted = await mountReadyApp()
      expect(FakeWorker.instances).toHaveLength(1)
      expect(FakeWorker.last.messages('loadMaster')).toHaveLength(1)
      expect(document.querySelector('form')).not.toBeNull()
      expect(body()).not.toContain('マスターデータとソルバーを読み込んでいます…')
    })
  })

  // 受入基準 2（P2 読込失敗）
  describe('P2 読込失敗', () => {
    it.each([
      ['マスター', { failMaster: true }, 'マスターデータを取得できませんでした。'],
      ['辞書', { failDictionary: true }, '名前の辞書を取得できませんでした。'],
    ])(
      '%s の取得失敗: 原因と次の行動・再読み込みを出し、条件フォームを描画しない',
      async (_, options, cause) => {
        stubBackend(options)
        mounted = await mountApp()
        await vi.waitFor(() => expect(mounted?.master.status).toBe('failed'))
        await flushPromises()
        expect(body()).toContain('データを読み込めませんでした')
        expect(body()).toContain(cause)
        expect(body()).toContain('通信状況を確かめて、「再読み込み」を押してください。')
        expect(document.querySelector('form')).toBeNull()
        expect(
          Array.from(document.querySelectorAll('button')).some((b) => textOf(b) === '検索'),
        ).toBe(false)
        expect(findButton('再読み込み')).toBeTruthy()
      },
    )

    it('HiGHS の初期化失敗の原因を出す', async () => {
      stubBackend()
      FakeWorker.failInit = true
      mounted = await mountApp()
      await vi.waitFor(() => expect(mounted?.master.status).toBe('failed'))
      await flushPromises()
      expect(body()).toContain('ソルバー（HiGHS）を初期化できませんでした。')
    })

    it('「再読み込み」で最初からやり直し、成功すると P3 になる', async () => {
      stubBackend({ failMaster: true })
      mounted = await mountApp()
      await vi.waitFor(() => expect(mounted?.master.status).toBe('failed'))
      await flushPromises()
      stubBackend()
      await click(findButton('再読み込み'))
      await vi.waitFor(() => expect(mounted?.master.status).toBe('ready'))
      await flushPromises()
      expect(document.querySelector('form')).not.toBeNull()
      expect(body()).not.toContain('データを読み込めませんでした')
    })
  })

  // 受入基準 5・6・8・9（P3 と検索の状態 Q0〜Q7）
  describe('P3 準備完了', () => {
    function submitButton(): HTMLButtonElement {
      return document.querySelector<HTMLButtonElement>('button[type="submit"]')!
    }

    async function ready(): Promise<Mounted & { worker: FakeWorker }> {
      stubBackend()
      mounted = await mountReadyApp()
      return { ...mounted, worker: FakeWorker.last }
    }

    async function startSearch(m: Mounted): Promise<void> {
      m.conditions.selectWeapon(wp('great-sword:1'))
      await flushPromises()
      await click(submitButton())
    }

    it('Q0: 未検索の表示と、武器が未選択のときの「武器を選ぶ」の導線', async () => {
      await ready()
      expect(body()).toContain('検索条件を選んで「検索」を押すと、構成がここに表示されます。')
      expect(findButton('武器を選ぶ').getAttribute('aria-haspopup')).toBe('dialog')
      expect(document.querySelector('h1')?.textContent).toBe('装備検索')
      expect(document.querySelector('#results-heading')?.textContent?.trim()).toBe('検索結果')
    })

    it('武器が未選択のとき、検索ボタンは無効で、理由の補助文を aria-describedby で関連づける', async () => {
      await ready()
      const button = submitButton()
      expect(button.disabled).toBe(true)
      const reason = document.getElementById(button.getAttribute('aria-describedby') ?? '')
      expect(textOf(reason)).toBe('武器を選ぶと検索できます。')
    })

    it('武器を選ぶと、検索ボタンが有効になり、理由と導線が消える', async () => {
      const { conditions } = await ready()
      conditions.selectWeapon(wp('great-sword:1'))
      await flushPromises()
      expect(submitButton().disabled).toBe(false)
      expect(body()).not.toContain('武器を選ぶと検索できます。')
      expect(
        Array.from(document.querySelectorAll('button')).some((b) => textOf(b) === '武器を選ぶ'),
      ).toBe(false)
    })

    it('ランクを0個にすると、エラーと理由を出し、検索ボタンは無効', async () => {
      const { conditions } = await ready()
      conditions.selectWeapon(wp('great-sword:1'))
      conditions.setRank('high', false)
      await flushPromises()
      expect(body()).toContain('候補にするランクを1つ以上選んでください。')
      expect(textOf(document.getElementById('search-reason'))).toBe(
        '候補にするランクを選ぶと検索できます。',
      )
      expect(submitButton().disabled).toBe(true)
    })

    it('無効のあいだに入力欄で Enter を押すと、武器欄のエラーを出し、武器のボタンにフォーカスする', async () => {
      await ready()
      const input = document.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!
      input.focus()
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )
      await flushPromises()
      expect(body()).toContain('武器を選んでください。')
      expect(document.activeElement?.getAttribute('aria-haspopup')).toBe('dialog')
      expect(textOf(document.activeElement)).toContain('武器を選択')
    })

    it('ランクが0個で Enter を押すと、最初の不正な項目（ランク）にフォーカスする', async () => {
      const { conditions, search } = await ready()
      conditions.selectWeapon(wp('great-sword:1'))
      conditions.setRank('high', false)
      await flushPromises()
      const input = document.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )
      await flushPromises()
      expect(document.activeElement?.hasAttribute('data-rank-checkbox')).toBe(true)
      expect(search.status).toBe('idle')
    })

    it('Q1: 検索中は進捗 0 件から。検索し直す・キャンセルが2か所（操作と進捗の行）。結果の見出しにフォーカスする', async () => {
      const m = await ready()
      await startSearch(m)
      expect(m.search.status).toBe('searching')
      expect(body()).toContain('見つけた構成: 0 件')
      expect(textOf(submitButton())).toBe('検索し直す')
      expect(submitButton().disabled).toBe(false)
      const cancels = Array.from(document.querySelectorAll('button')).filter(
        (b) => textOf(b) === 'キャンセル',
      )
      expect(cancels).toHaveLength(2)
      expect(document.activeElement?.id).toBe('results-heading')
      const bar = document.querySelector('[role="progressbar"]')!
      expect(bar.getAttribute('aria-valuenow')).toBe('0')
      expect(bar.getAttribute('aria-valuemax')).toBe('10')
    })

    it('Q1: 進捗のメッセージのたびに件数と進捗バーを更新する', async () => {
      const m = await ready()
      await startSearch(m)
      m.worker.emit({ type: 'progress', requestId: m.worker.lastSolveId, found: 4 })
      await flushPromises()
      expect(body()).toContain('見つけた構成: 4 件')
      expect(document.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe(
        '4',
      )
    })

    it('Q1: メインスレッドではなく Worker に solve を送る', async () => {
      const m = await ready()
      await startSearch(m)
      expect(m.worker.messages('solve')).toHaveLength(1)
    })

    const found: SolverResponse = { status: 'optimal', builds: [makeBuild()], elapsedMs: 3 }

    it('Q2: 件数が上限より少ないとき「これで全部です」と、検索条件の要約・構成カードを出す', async () => {
      const m = await ready()
      m.conditions.toggleSkill(sk('a1'))
      await startSearch(m)
      m.worker.emit({ type: 'result', requestId: m.worker.lastSolveId, response: found })
      await flushPromises()
      expect(body()).toContain('1 件の構成が見つかりました')
      expect(body()).toContain('条件を満たす構成はこれで全部です。')
      expect(body()).toContain('武器: 鉄の大剣 ／ 必須スキル 1 件 ／ 条件を満たす構成 ／ 10 件まで')
      expect(body()).toContain('構成 1')
      expect(document.querySelector('[role="progressbar"]')).toBeNull()
    })

    it('Q2: 件数の上限に達したときは増やす案内を出す', async () => {
      const m = await ready()
      m.conditions.setMaxResults(1)
      await startSearch(m)
      m.worker.emit({ type: 'result', requestId: m.worker.lastSolveId, response: found })
      await flushPromises()
      expect(body()).toContain(
        '件数の上限に達しました。件数を増やすと、さらに見つかることがあります。',
      )
    })

    it('Q3: infeasible は見つからなかったことと次の行動3つ（ランクが一部のとき）', async () => {
      const m = await ready()
      await startSearch(m)
      m.worker.emit({
        type: 'result',
        requestId: m.worker.lastSolveId,
        response: { status: 'infeasible', builds: [], elapsedMs: 1 },
      })
      await flushPromises()
      expect(body()).toContain('条件を満たす構成が見つかりませんでした')
      const items = Array.from(document.querySelectorAll('li')).map((li) => textOf(li))
      expect(items).toEqual(
        expect.arrayContaining([
          '必須スキルを減らす',
          '下限レベルを下げる',
          '候補にするランクを広げる',
        ]),
      )
    })

    it('Q3: 全ランクを選んでいるときは「ランクを広げる」を出さない', async () => {
      const m = await ready()
      m.conditions.setRank('low', true)
      await startSearch(m)
      m.worker.emit({
        type: 'result',
        requestId: m.worker.lastSolveId,
        response: { status: 'infeasible', builds: [], elapsedMs: 1 },
      })
      await flushPromises()
      expect(body()).toContain('必須スキルを減らす')
      expect(body()).not.toContain('候補にするランクを広げる')
    })

    it('Q4: timeout で構成があるとき、打ち切った旨と件数・要約・構成カードを出す', async () => {
      const m = await ready()
      await startSearch(m)
      m.worker.emit({
        type: 'result',
        requestId: m.worker.lastSolveId,
        response: { ...found, status: 'timeout' },
      })
      await flushPromises()
      expect(body()).toContain(
        '時間の上限で検索を打ち切りました。それまでに見つけた 1 件を表示しています。',
      )
      expect(body()).toContain(
        '必須スキルを減らす・下限レベルを下げる・件数を減らすと、最後まで探せることがあります。',
      )
      expect(body()).toContain('武器: 鉄の大剣')
      expect(body()).toContain('構成 1')
      expect(body()).not.toContain('件の構成が見つかりました')
    })

    it('Q5: timeout で構成が0件のとき、見つかっていない旨を出す', async () => {
      const m = await ready()
      await startSearch(m)
      m.worker.emit({
        type: 'result',
        requestId: m.worker.lastSolveId,
        response: { status: 'timeout', builds: [], elapsedMs: 1 },
      })
      await flushPromises()
      expect(body()).toContain('時間の上限で検索を打ち切りました。構成は見つかっていません。')
      expect(body()).toContain('最後まで探せることがあります。')
      expect(body()).not.toContain('構成 1')
    })

    it('Q6: ソルバーの error は message を原因として出す', async () => {
      const m = await ready()
      await startSearch(m)
      m.worker.emit({
        type: 'error',
        requestId: m.worker.lastSolveId,
        message: '不正な要求です: x',
      })
      await flushPromises()
      expect(body()).toContain('検索できませんでした')
      expect(body()).toContain('不正な要求です: x')
      expect(body()).toContain(
        '条件を変えて検索し直してください。直らないときは、ページを再読み込みしてください。',
      )
    })

    it('Q6: Worker の異常終了は「停止しました」を出し、次の検索で Worker を作り直す', async () => {
      const m = await ready()
      await startSearch(m)
      m.worker.crash()
      await flushPromises()
      expect(body()).toContain('検索を実行するプログラムが停止しました。')
      await click(submitButton())
      expect(FakeWorker.instances).toHaveLength(2)
      expect(FakeWorker.last.messages('loadMaster')).toHaveLength(1)
      expect(FakeWorker.last.messages('solve')).toHaveLength(1)
      expect(m.search.status).toBe('searching')
    })

    it('Q1: 結果を出した後にやり直すと、前の結果を消して 0 件から始める。前の検索の結果は出さない', async () => {
      const m = await ready()
      await startSearch(m)
      const firstId = m.worker.lastSolveId
      m.worker.emit({ type: 'result', requestId: firstId, response: found })
      await flushPromises()
      expect(body()).toContain('構成 1')
      await click(submitButton())
      expect(body()).not.toContain('構成 1')
      expect(body()).toContain('見つけた構成: 0 件')
      m.worker.emit({ type: 'result', requestId: firstId, response: found })
      m.worker.emit({ type: 'progress', requestId: firstId, found: 9 })
      await flushPromises()
      expect(body()).not.toContain('構成 1')
      expect(body()).toContain('見つけた構成: 0 件')
    })

    it('Q7: キャンセルで Q0 に戻り、トーストを出し、前の結果と進捗を出さない', async () => {
      const m = await ready()
      await startSearch(m)
      const id = m.worker.lastSolveId
      m.worker.emit({ type: 'progress', requestId: id, found: 5 })
      await flushPromises()
      const cancel = Array.from(document.querySelectorAll('button')).find(
        (b) => textOf(b) === 'キャンセル',
      )!
      await click(cancel)
      expect(body()).toContain('検索条件を選んで「検索」を押すと、構成がここに表示されます。')
      expect(body()).not.toContain('見つけた構成')
      expect(body()).toContain('検索をキャンセルしました。')
      expect(m.worker.sent.at(-1)).toEqual({ type: 'cancel', requestId: id })
      m.worker.emit({ type: 'result', requestId: id, response: found })
      m.worker.emit({ type: 'progress', requestId: id, found: 6 })
      await flushPromises()
      expect(body()).not.toContain('構成 1')
      expect(body()).not.toContain('見つけた構成')
      expect(textOf(submitButton())).toBe('検索')
    })
  })
})
