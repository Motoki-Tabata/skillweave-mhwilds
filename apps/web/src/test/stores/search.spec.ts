import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SolverRequest, SolverResponse } from '@swv/solver'
import type { CharmPayload } from '@/lib/charms/types'
import { CANCELLED_TOAST_MESSAGE } from '@/stores/search'
import { useLockExcludeStore } from '@/stores/lockExclude'
import { useToastStore } from '@/stores/toast'
import { SOLVE_TIMEOUT_MS } from '@/constants/search'
import { FakeWorker, armorId, dc, makeBuild, makeBundle, sk, wp } from '../support/fixtures'
import { flushPromises, loadStores, restoreStubs, stubBackend } from '../support/mount'
import { createMemoryCharmRepository } from '../support/charmRepository'
import { charmId, storedCharm } from '../support/charms'
import { createMemoryWeaponRepository } from '../support/weaponRepository'
import type { WeaponPayload } from '@/lib/weapons/types'
import {
  ARTIA_GREAT_SWORD,
  GROUP_BONUS,
  SERIES_BONUS,
  makeWeaponBundle,
  makeWeaponDictionary,
  storedWeapon,
  weaponId,
} from '../support/weapons'

// 受入基準 8（検索の状態 Q0〜Q7）
describe('search ストア', () => {
  const response: SolverResponse = { status: 'optimal', builds: [makeBuild()], elapsedMs: 5 }

  beforeEach(() => stubBackend())
  afterEach(restoreStubs)

  async function setup() {
    const stores = await loadStores()
    await stores.charms.ensureLoaded()
    stores.conditions.selectWeapon(wp('great-sword:1'))
    return { ...stores, worker: FakeWorker.last }
  }

  it('武器が未選択なら検索せず false を返し、武器欄のエラーを出す', async () => {
    const { search, conditions, worker } = await loadStores().then((s) => ({
      ...s,
      worker: FakeWorker.last,
    }))
    expect(search.submit()).toBe(false)
    expect(conditions.weaponErrorShown).toBe(true)
    expect(worker.messages('solve')).toHaveLength(0)
    expect(search.status).toBe('idle')
  })

  // 受入基準 8（送信した時点の候補を渡し、要約に件数を持つ）
  describe('護石の候補', () => {
    const good: CharmPayload = {
      rarity: 8,
      skills: [{ skillId: sk('a1'), level: 2 }],
      slots: [{ target: 'weapon', level: 1 }],
    }
    const overLevel = { ...good, skills: [{ skillId: sk('a1'), level: 9 }] }

    async function withCharms() {
      const repository = createMemoryCharmRepository([
        storedCharm(1, good),
        storedCharm(2, overLevel),
      ])
      const stores = await loadStores(repository)
      await stores.charms.ensureLoaded()
      stores.conditions.selectWeapon(wp('great-sword:1'))
      return { ...stores, worker: FakeWorker.last }
    }

    it('構造上の制約を満たす護石を SolverRequest.charms に渡し、要約に件数を持つ', async () => {
      const { search, worker } = await withCharms()
      search.submit()
      const sent = worker.messages('solve')[0]
      expect(sent).toMatchObject({
        request: {
          charms: [{ id: charmId(1), rarity: 8, skills: good.skills, slots: good.slots }],
        },
      })
      expect(search.summary?.charmCount).toBe(1)
    })

    it('護石が1つも無ければ charms は空で、件数は 0', async () => {
      const { search, worker } = await setup()
      search.submit()
      expect(worker.messages('solve')[0]).toMatchObject({ request: { charms: [] } })
      expect(search.summary?.charmCount).toBe(0)
    })

    // 受入基準 8（読込の完了を待ってから送る）
    it('護石の読込の前に検索しても、読込の完了を待ち、読み込んだ護石を渡して件数を一致させる', async () => {
      const repository = createMemoryCharmRepository([storedCharm(1, good)])
      const { search, charms, conditions } = await loadStores(repository)
      conditions.selectWeapon(wp('great-sword:1'))
      const worker = FakeWorker.last
      expect(charms.status).toBe('loading')
      expect(search.submit()).toBe(true)
      expect(search.status).toBe('searching')
      expect(worker.messages('solve')).toHaveLength(0)
      await charms.ensureLoaded()
      await flushPromises()
      expect(worker.messages('solve')).toHaveLength(1)
      expect(worker.messages('solve')[0]).toMatchObject({
        request: { charms: [{ id: charmId(1), rarity: 8 }] },
      })
      expect(search.summary?.charmCount).toBe(1)
    })

    // 受入基準 8（待ち中の再送信は二重に送らない）
    it('読込を待っている間に再び検索しても、solve は 1 回だけ送られる', async () => {
      const repository = createMemoryCharmRepository([storedCharm(1, good)])
      const { search, charms, conditions } = await loadStores(repository)
      conditions.selectWeapon(wp('great-sword:1'))
      const worker = FakeWorker.last
      expect(search.submit()).toBe(true)
      expect(search.submit()).toBe(true)
      await charms.ensureLoaded()
      await flushPromises()
      expect(worker.messages('solve')).toHaveLength(1)
    })

    // 受入基準 11（読込中に始めて、読込が失敗しても護石なしで解く）
    it('読込中に始めた検索は、読込が failed で終わっても charms 空で送り、件数は 0', async () => {
      const repository = createMemoryCharmRepository([storedCharm(1, good)])
      const { search, charms, conditions } = await loadStores(repository)
      repository.failWith('list', 'unknown')
      conditions.selectWeapon(wp('great-sword:1'))
      const worker = FakeWorker.last
      expect(charms.status).toBe('loading')
      search.submit()
      await charms.ensureLoaded()
      await flushPromises()
      expect(charms.status).toBe('failed')
      expect(worker.messages('solve')).toHaveLength(1)
      expect(worker.messages('solve')[0]).toMatchObject({ request: { charms: [] } })
      expect(search.summary?.charmCount).toBe(0)
    })

    it('読込中に始めた検索は、読込が unavailable で終わっても charms 空で送り、件数は 0', async () => {
      const { search, charms, conditions } = await loadStores()
      charms.setRepositoryOpener(async () => {
        throw Object.assign(new Error('x'), { name: 'SecurityError' })
      })
      conditions.selectWeapon(wp('great-sword:1'))
      const worker = FakeWorker.last
      const loaded = charms.ensureLoaded()
      expect(charms.status).toBe('loading')
      search.submit()
      await loaded
      await flushPromises()
      expect(charms.status).toBe('unavailable')
      expect(worker.messages('solve')).toHaveLength(1)
      expect(worker.messages('solve')[0]).toMatchObject({ request: { charms: [] } })
      expect(search.summary?.charmCount).toBe(0)
    })

    // 受入基準 8（待っている間に条件を変えても、送信時の条件で送る）
    it('読込を待っている間に条件を変えても、送る要求と要約は送信時の条件のまま', async () => {
      const repository = createMemoryCharmRepository([storedCharm(1, good)])
      const { search, charms, conditions } = await loadStores(repository)
      conditions.selectWeapon(wp('great-sword:1'))
      conditions.toggleSkill(sk('a1'))
      conditions.setMaxResults(4)
      const worker = FakeWorker.last
      search.submit()
      conditions.toggleSkill(sk('a1'))
      conditions.toggleSkill(sk('a2'))
      conditions.setObjective('defense')
      conditions.setMaxResults(9)
      await charms.ensureLoaded()
      await flushPromises()
      const sent = worker.messages('solve')[0] as unknown as { request: Record<string, unknown> }
      expect(sent.request).toMatchObject({
        weapon: { kind: 'master', weaponId: wp('great-sword:1') },
        objective: { kind: 'feasible' },
        maxResults: 4,
      })
      expect(JSON.stringify(sent.request)).toContain(sk('a1'))
      expect(JSON.stringify(sent.request)).not.toContain(sk('a2'))
      expect(search.summary).toMatchObject({ maxResults: 4, requiredCount: 1 })
    })

    // 受入基準 8（待ち中のキャンセル）
    it('読込を待っている間にキャンセルすると、読込の後も送らず Q0 に戻る', async () => {
      const repository = createMemoryCharmRepository([storedCharm(1, good)])
      const { search, charms, conditions } = await loadStores(repository)
      conditions.selectWeapon(wp('great-sword:1'))
      const worker = FakeWorker.last
      search.submit()
      search.cancel()
      await charms.ensureLoaded()
      await flushPromises()
      expect(worker.messages('solve')).toHaveLength(0)
      expect(search.status).toBe('idle')
    })

    // 受入基準 11（護石なしの検索は引き続き使える）
    it('護石を端末に保存できない（unavailable）ときも、charms 空で検索を送り、件数は 0', async () => {
      const { search, charms, conditions, worker } = await loadStores().then((s) => ({
        ...s,
        worker: FakeWorker.last,
      }))
      charms.setRepositoryOpener(async () => {
        throw Object.assign(new Error('x'), { name: 'SecurityError' })
      })
      await charms.ensureLoaded()
      expect(charms.status).toBe('unavailable')
      conditions.selectWeapon(wp('great-sword:1'))
      expect(search.submit()).toBe(true)
      expect(worker.messages('solve')[0]).toMatchObject({ request: { charms: [] } })
      expect(search.summary?.charmCount).toBe(0)
    })

    it('護石の一覧を読めない（failed）ときも、charms 空で検索を送り、件数は 0', async () => {
      const repository = createMemoryCharmRepository([storedCharm(1, good)])
      const { search, charms, conditions } = await loadStores(repository)
      repository.failWith('list', 'unknown')
      await charms.ensureLoaded()
      expect(charms.status).toBe('failed')
      conditions.selectWeapon(wp('great-sword:1'))
      expect(search.submit()).toBe(true)
      expect(FakeWorker.last.messages('solve')[0]).toMatchObject({ request: { charms: [] } })
      expect(search.summary?.charmCount).toBe(0)
    })

    it('検索の後に護石を削除しても、送信した時点の候補を ID で引ける', async () => {
      const { search, charms } = await withCharms()
      search.submit()
      await charms.remove(charmId(1))
      expect(charms.candidateCount).toBe(0)
      expect(search.submittedCharms.get(charmId(1))?.rarity).toBe(8)
      expect(search.summary?.charmCount).toBe(1)
    })
  })

  it('ランクが0個なら検索しない', async () => {
    const { search, conditions, worker } = await setup()
    conditions.setRank('high', false)
    expect(search.submit()).toBe(false)
    expect(worker.messages('solve')).toHaveLength(0)
  })

  it('検索は Worker に SolverRequest を送り、検索中（Q1）になる。進捗は 0 件から', async () => {
    const { search, conditions, worker } = await setup()
    conditions.toggleSkill(sk('a1'))
    conditions.setSkillLevel(sk('a1'), 2)
    conditions.setObjective('defense')
    conditions.setMaxResults(5)
    expect(search.submit()).toBe(true)
    expect(search.status).toBe('searching')
    expect(search.found).toBe(0)
    const sent = worker.messages('solve')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      type: 'solve',
      request: {
        weapon: { kind: 'master', weaponId: wp('great-sword:1') },
        charms: [],
        required: [{ skillId: sk('a1'), level: 2 }],
        objective: { kind: 'maximize', metric: 'defense' },
        maxResults: 5,
        timeoutMs: SOLVE_TIMEOUT_MS,
      },
    })
    // 既定のランクは上位だけなので、下位の防具が除外される
    const excluded = (sent[0] as { request: { excludedArmorIds: string[] } }).request
      .excludedArmorIds
    expect(excluded).toContain(armorId('low', 'head'))
    expect(excluded).not.toContain(armorId('high', 'head'))
    expect(search.runCount).toBe(1)
  })

  it('検索条件の要約は検索したときの値で、後から条件を変えても変わらない', async () => {
    const { search, conditions } = await setup()
    conditions.toggleSkill(sk('a1'))
    conditions.setMaxResults(4)
    search.submit()
    conditions.selectWeapon(wp('bow:1'))
    conditions.toggleSkill(sk('a2'))
    conditions.setMaxResults(9)
    expect(search.summary).toMatchObject({
      weaponSlots: [{ level: 3 }, { level: 1 }],
      weaponName: '鉄の大剣',
      requiredCount: 1,
      objectiveLabel: '条件を満たす構成',
      maxResults: 4,
      allRanksSelected: false,
    })
  })

  // 受入基準 3（オンの条件を目的にかかわらず要求へ。無ければ空）
  it('要求の activeConditionIds は目的にかかわらずオンの条件で、無ければ空の配列', async () => {
    const { search, conditions, worker } = await setup()
    search.submit()
    expect(worker.messages('solve')[0]).toMatchObject({ request: { activeConditionIds: [] } })
    const [first, , third] = conditions.conditionOptions.map((o) => o.id)
    conditions.setConditionActive(third, true)
    conditions.setConditionActive(first, true)
    for (const objective of ['feasible', 'expectedDamage'] as const) {
      conditions.setObjective(objective)
      search.submit()
      expect(worker.messages('solve').at(-1)).toMatchObject({
        request: { activeConditionIds: [first, third] },
      })
    }
    expect(worker.messages('solve').at(-1)).toMatchObject({
      request: { objective: { kind: 'maximize', metric: 'expectedDamage' } },
    })
  })

  // 受入基準 3・6（検索したときの写しと要約の発動条件。検索の後の変更で変わらない）
  it('検索したときの武器・オンの条件を写しに持ち、後からトグル・武器を変えても変わらない', async () => {
    const { search, conditions } = await setup()
    const [first, second] = conditions.conditionOptions
    conditions.setConditionActive(first.id, true)
    search.submit()
    conditions.setConditionActive(first.id, false)
    conditions.setConditionActive(second.id, true)
    conditions.selectWeapon(wp('bow:1'))
    expect(search.submittedBasis).toEqual({
      damageBase: { attack: 250, affinity: -15 },
      activeConditionIds: [first.id],
    })
    expect(search.summary?.activeConditionNames).toEqual([first.name])
  })

  it('オンの条件が無いとき、要約の発動条件の名前は空', async () => {
    const { search } = await setup()
    search.submit()
    expect(search.summary?.activeConditionNames).toEqual([])
  })

  it('進捗で件数を更新し、結果で完了（Q2〜Q5）にする', async () => {
    const { search, worker } = await setup()
    search.submit()
    worker.emit({ type: 'progress', requestId: worker.lastSolveId, found: 2, build: makeBuild() })
    expect(search.found).toBe(2)
    worker.emit({ type: 'result', requestId: worker.lastSolveId, response })
    expect(search.status).toBe('done')
    expect(search.response).toEqual(response)
    expect(search.found).toBe(1)
  })

  it('ソルバーの error は原因を保持して Q6 にする', async () => {
    const { search, worker } = await setup()
    search.submit()
    worker.emit({ type: 'error', requestId: worker.lastSolveId, message: '原因です' })
    expect(search.status).toBe('error')
    expect(search.errorMessage).toBe('原因です')
  })

  it('Worker が異常終了したら Q6（停止しました）', async () => {
    const { search, worker } = await setup()
    search.submit()
    worker.crash()
    expect(search.status).toBe('error')
    expect(search.errorMessage).toBe('検索を実行するプログラムが停止しました。')
  })

  it('やり直すと前の結果と進捗をすぐ消し、前の検索の応答は反映しない', async () => {
    const { search, worker } = await setup()
    search.submit()
    const firstId = worker.lastSolveId
    worker.emit({ type: 'progress', requestId: firstId, found: 4, build: makeBuild() })
    worker.emit({ type: 'result', requestId: firstId, response })
    expect(search.response).not.toBeNull()
    search.submit()
    expect(search.status).toBe('searching')
    expect(search.found).toBe(0)
    expect(search.response).toBeNull()
    expect(search.runCount).toBe(2)
    // 前の検索の遅れた応答
    worker.emit({ type: 'progress', requestId: firstId, found: 7, build: makeBuild() })
    worker.emit({ type: 'result', requestId: firstId, response })
    expect(search.found).toBe(0)
    expect(search.response).toBeNull()
    expect(search.status).toBe('searching')
  })

  it('検索中にやり直したとき、前の検索の進捗は反映しない', async () => {
    const { search, worker } = await setup()
    search.submit()
    const firstId = worker.lastSolveId
    search.submit()
    worker.emit({ type: 'progress', requestId: firstId, found: 8, build: makeBuild() })
    expect(search.found).toBe(0)
    worker.emit({ type: 'progress', requestId: worker.lastSolveId, found: 1, build: makeBuild() })
    expect(search.found).toBe(1)
  })

  it('キャンセルは Q0 に戻し、トーストを出し、以降の結果と進捗を反映しない', async () => {
    const { search, worker, pinia } = await setup()
    search.submit()
    const id = worker.lastSolveId
    worker.emit({ type: 'progress', requestId: id, found: 3, build: makeBuild() })
    search.cancel()
    expect(search.status).toBe('idle')
    expect(search.found).toBe(0)
    expect(search.response).toBeNull()
    expect(worker.sent.at(-1)).toEqual({ type: 'cancel', requestId: id })
    expect(useToastStore(pinia).items.map((i) => i.message)).toEqual([CANCELLED_TOAST_MESSAGE])
    worker.emit({ type: 'progress', requestId: id, found: 5, build: makeBuild() })
    worker.emit({ type: 'result', requestId: id, response })
    expect(search.status).toBe('idle')
    expect(search.found).toBe(0)
    expect(search.response).toBeNull()
  })

  it('検索中でないときのキャンセルは何もしない', async () => {
    const { search, worker, pinia } = await setup()
    search.cancel()
    expect(worker.messages('cancel')).toHaveLength(0)
    expect(useToastStore(pinia).items).toEqual([])
  })

  // 受入基準 11〜13（逐次表示の構成の列。decisions.md Q46・Q47）
  describe('逐次表示の構成', () => {
    const other = { ...makeBuild(), charmId: null, freeSlots: [] }

    it('届いた構成を届いた順に足し、検索が終わったらソルバーの結果で置き換える（列は空になる）', async () => {
      const { search, worker } = await setup()
      search.submit()
      const id = worker.lastSolveId
      worker.emit({ type: 'progress', requestId: id, found: 1, build: makeBuild() })
      worker.emit({ type: 'progress', requestId: id, found: 2, build: other })
      expect(search.progressBuilds).toEqual([makeBuild(), other])
      worker.emit({ type: 'result', requestId: id, response })
      expect(search.progressBuilds).toEqual([])
      expect(search.response).toEqual(response)
    })

    it('取り消すと、届いた構成も消す', async () => {
      const { search, worker } = await setup()
      search.submit()
      worker.emit({
        type: 'progress',
        requestId: worker.lastSolveId,
        found: 1,
        build: makeBuild(),
      })
      search.cancel()
      expect(search.progressBuilds).toEqual([])
    })

    it('エラーになると、届いた構成を消す', async () => {
      const { search, worker } = await setup()
      search.submit()
      const id = worker.lastSolveId
      worker.emit({ type: 'progress', requestId: id, found: 1, build: makeBuild() })
      worker.emit({ type: 'error', requestId: id, message: '原因です' })
      expect(search.progressBuilds).toEqual([])
      expect(search.status).toBe('error')
    })

    it('検索し直すとすぐに消し、前の検索の構成は足さない', async () => {
      const { search, worker } = await setup()
      search.submit()
      const firstId = worker.lastSolveId
      worker.emit({ type: 'progress', requestId: firstId, found: 1, build: makeBuild() })
      search.submit()
      expect(search.progressBuilds).toEqual([])
      worker.emit({ type: 'progress', requestId: firstId, found: 2, build: makeBuild() })
      expect(search.progressBuilds).toEqual([])
    })
  })

  it('全ランクを選んだことを要約に持つ', async () => {
    const { search, conditions } = await setup()
    conditions.setRank('low', true)
    search.submit()
    expect(search.summary?.allRanksSelected).toBe(true)
  })
})

// 受入基準 7・8（個体差のある武器での検索。送信した時点の写し）
describe('search ストアの個体差のある武器', () => {
  beforeEach(() => stubBackend({ bundle: makeWeaponBundle(), dictionary: makeWeaponDictionary() }))
  afterEach(restoreStubs)

  async function setup(payload: Partial<WeaponPayload> = {}) {
    const stores = await loadStores(
      undefined,
      createMemoryWeaponRepository([storedWeapon(1, payload)]),
    )
    await stores.charms.ensureLoaded()
    await stores.weapons.ensureLoaded()
    stores.conditions.selectCustomWeapon(weaponId(1))
    return { ...stores, worker: FakeWorker.last }
  }

  it('kind: custom の SolverWeapon（武器スキルは空）を要求に渡し、火力の元を入力した攻撃力・会心率にする', async () => {
    const { search, worker } = await setup()
    expect(search.submit()).toBe(true)
    expect(worker.messages('solve')[0]).toMatchObject({
      request: {
        weapon: {
          kind: 'custom',
          id: weaponId(1),
          baseWeaponId: ARTIA_GREAT_SWORD,
          attack: 200,
          affinity: 15,
          element: { type: 'fire', value: 30 },
          slots: [
            { target: 'weapon', level: 3 },
            { target: 'weapon', level: 1 },
          ],
          skills: [],
          setBonusIds: [SERIES_BONUS, GROUP_BONUS],
        },
      },
    })
    expect(search.submittedBasis?.damageBase).toEqual({ attack: 200, affinity: 15 })
  })

  it('要約の武器は「<表示名>（個体差）」で、構成の表示用に武器のスロットを持つ', async () => {
    const { search } = await setup()
    search.submit()
    expect(search.summary?.weaponName).toBe('巨戟ブレイド（個体差）')
    expect(search.summary?.weaponSlots).toEqual([{ level: 3 }, { level: 1 }])
  })

  it('名前が空なら基の武器の名前で要約に出す', async () => {
    const { search } = await setup({ name: '' })
    search.submit()
    expect(search.summary?.weaponName).toBe('アーティアブレイドⅡ（個体差）')
  })

  it('検索の後に武器を編集・削除しても、要約・火力の元・スロットは変わらない', async () => {
    const { search, weapons } = await setup()
    search.submit()
    const stored = weapons.weapons[0]
    await weapons.save(
      { ...stored.payload, name: '別名', attack: 999, slots: [{ target: 'weapon', level: 2 }] },
      stored,
    )
    await weapons.remove(weaponId(1))
    expect(search.summary?.weaponName).toBe('巨戟ブレイド（個体差）')
    expect(search.summary?.weaponSlots).toEqual([{ level: 3 }, { level: 1 }])
    expect(search.submittedBasis?.damageBase).toEqual({ attack: 200, affinity: 15 })
  })

  it('選んだ個体差のある武器が解決できないときは検索しない', async () => {
    const { search, conditions, worker } = await setup()
    conditions.selectCustomWeapon(weaponId(9))
    expect(search.submit()).toBe(false)
    expect(worker.messages('solve')).toHaveLength(0)
  })

  // AC-3・AC-4・AC-5・AC-6（021）
  describe('生産護石の候補', () => {
    const good: CharmPayload = {
      rarity: 8,
      skills: [{ skillId: sk('a1'), level: 2 }],
      slots: [{ target: 'weapon', level: 1 }],
    }
    const craftedIds = ['ch:-1:2', 'ch:-2:1']

    async function ready(repository = createMemoryCharmRepository([storedCharm(1, good)])) {
      stubBackend({ bundle: makeBundle({ craftedCharms: true }) })
      const stores = await loadStores(repository)
      await stores.charms.ensureLoaded()
      stores.conditions.selectWeapon(wp('great-sword:1'))
      return stores
    }
    const sentIds = () =>
      (
        FakeWorker.last.messages('solve')[0] as { request: { charms: { id: string }[] } }
      ).request.charms.map((c) => c.id)

    it('AC-3: 既定（オン）では鑑定護石の後ろに、系統ごとの最上位ランクの生産護石だけを渡す', async () => {
      const { search } = await ready()
      search.submit()
      expect(sentIds()).toEqual([charmId(1), ...craftedIds])
      expect(search.summary).toMatchObject({ charmCount: 1, includeCraftedCharms: true })
      expect(search.submittedCharms.has('ch:-1:2')).toBe(true)
      expect(search.submittedCharms.has('ch:-1:1')).toBe(false)
    })

    it('AC-4: オフでは鑑定護石だけを渡し、鑑定護石が無ければ護石なし', async () => {
      const { search, conditions } = await ready()
      conditions.includeCraftedCharms = false
      search.submit()
      expect(sentIds()).toEqual([charmId(1)])
      expect(search.summary?.includeCraftedCharms).toBe(false)
      const empty = await ready(createMemoryCharmRepository([]))
      empty.conditions.includeCraftedCharms = false
      empty.search.submit()
      expect(sentIds()).toEqual([])
    })

    it('AC-6: 鑑定護石を読み込めなくても、オンなら生産護石だけで検索する', async () => {
      const repository = createMemoryCharmRepository([storedCharm(1, good)])
      stubBackend({ bundle: makeBundle({ craftedCharms: true }) })
      const { search, charms, conditions } = await loadStores(repository)
      conditions.selectWeapon(wp('great-sword:1'))
      repository.failWith('list', 'unknown')
      await charms.ensureLoaded()
      expect(charms.status).toBe('failed')
      search.submit()
      expect(sentIds()).toEqual(craftedIds)
      expect(search.summary?.charmCount).toBe(0)
    })

    it('AC-3: 護石の読込を待つ間に切り替えても、押した時点の値を使う', async () => {
      stubBackend({ bundle: makeBundle({ craftedCharms: true }) })
      const { search, charms, conditions } = await loadStores(createMemoryCharmRepository([]))
      conditions.selectWeapon(wp('great-sword:1'))
      expect(charms.status).toBe('loading')
      search.submit()
      conditions.includeCraftedCharms = false
      await charms.ensureLoaded()
      await flushPromises()
      expect(sentIds()).toEqual(craftedIds)
    })
  })
})

// 受入基準 4・6・7（固定と除外を要求に渡す）・8（要約の件数）・10 は lockExclude.spec.ts
describe('search ストアの固定と除外', () => {
  beforeEach(() => stubBackend())
  afterEach(restoreStubs)

  async function setup() {
    const stores = await loadStores()
    await stores.charms.ensureLoaded()
    stores.conditions.selectWeapon(wp('great-sword:1'))
    const lock = useLockExcludeStore(stores.pinia)
    return { ...stores, lock, worker: FakeWorker.last }
  }

  function sentRequest(worker: FakeWorker) {
    return (worker.messages('solve')[0] as { request: SolverRequest }).request
  }

  it('AC-6: 固定も除外も無い検索の要求にはキーが入らず、要約の件数は 0', async () => {
    const { search, worker } = await setup()
    search.submit()
    const request = sentRequest(worker)
    expect('fixedArmor' in request).toBe(false)
    expect('excludedDecorationIds' in request).toBe(false)
    expect(search.summary).toMatchObject({
      fixedPartCount: 0,
      excludedArmorCount: 0,
      excludedDecorationCount: 0,
    })
  })

  it('AC-4・AC-6: 固定と除外を要求に渡し、要約に件数を持つ（ランクの除外は数えない）', async () => {
    const { search, lock, worker } = await setup()
    lock.setFixed('head', armorId('low', 'head'))
    lock.setFixed('legs', null)
    lock.addExcludedArmor(armorId('high', 'chest'))
    lock.addExcludedDecoration(dc('1'))
    search.submit()
    const request = sentRequest(worker)
    expect(request.fixedArmor).toEqual({ head: armorId('low', 'head'), legs: null })
    expect(request.excludedArmorIds).toContain(armorId('high', 'chest'))
    expect(request.excludedArmorIds).not.toContain(armorId('low', 'head'))
    expect(request.excludedDecorationIds).toEqual([dc('1')])
    expect(search.summary).toMatchObject({
      fixedPartCount: 2,
      excludedArmorCount: 1,
      excludedDecorationCount: 1,
    })
  })

  it('AC-8: 送信の後に固定・除外を変えても、要約は変わらない', async () => {
    const { search, lock } = await setup()
    lock.setFixed('head', null)
    search.submit()
    lock.setFixed('chest', null)
    lock.addExcludedDecoration(dc('1'))
    expect(search.summary).toMatchObject({ fixedPartCount: 1, excludedDecorationCount: 0 })
  })
})
