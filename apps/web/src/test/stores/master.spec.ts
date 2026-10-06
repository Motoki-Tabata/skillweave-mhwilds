import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMasterStore } from '@/stores/master'
import { FakeWorker, sk, wp } from '../support/fixtures'
import { flushPromises, loadStores, newPinia, restoreStubs, stubBackend } from '../support/mount'

// 受入基準 1・2（読み込み P1〜P3）
describe('master ストア', () => {
  afterEach(() => {
    vi.useRealTimers()
    restoreStubs()
  })

  it('読み込み中は loading で、成功すると ready。マスターを Worker に1回だけ渡す', async () => {
    stubBackend()
    const master = useMasterStore(newPinia())
    const loading = master.load()
    expect(master.status).toBe('loading')
    await loading
    expect(master.status).toBe('ready')
    expect(master.bundle?.version).toBe('test-1')
    expect(FakeWorker.last.messages('loadMaster')).toHaveLength(1)
  })

  it('マスターの取得失敗は failed と原因の文言', async () => {
    stubBackend({ failMaster: true })
    const { master } = await loadStores()
    expect(master.status).toBe('failed')
    expect(master.failureMessage).toBe('マスターデータを取得できませんでした。')
  })

  it('辞書の取得失敗は failed と原因の文言', async () => {
    stubBackend({ failDictionary: true })
    const { master } = await loadStores()
    expect(master.status).toBe('failed')
    expect(master.failureMessage).toBe('名前の辞書を取得できませんでした。')
  })

  it('HiGHS の初期化失敗は failed と原因の文言', async () => {
    stubBackend()
    FakeWorker.failInit = true
    const { master } = await loadStores()
    expect(master.status).toBe('failed')
    expect(master.failureMessage).toBe('ソルバー（HiGHS）を初期化できませんでした。')
  })

  it('Worker の異常終了は原因を特定できない文言', async () => {
    stubBackend()
    FakeWorker.autoReply = false
    const master = useMasterStore(newPinia())
    const loading = master.load()
    await flushPromises()
    FakeWorker.last.crash()
    await loading
    expect(master.status).toBe('failed')
    expect(master.failureMessage).toBe('データの読み込みに失敗しました。')
  })

  it('再読み込みは Worker を作り直し、取得からやり直して ready になる', async () => {
    stubBackend({ failMaster: true })
    const master = useMasterStore(newPinia())
    await master.load()
    expect(master.status).toBe('failed')
    stubBackend()
    await master.load()
    expect(master.status).toBe('ready')
    expect(master.failureMessage).toBe('')
  })

  it('読み込みをやり直したとき、前の読み込みの結果は反映しない', async () => {
    stubBackend()
    FakeWorker.autoReply = false
    const master = useMasterStore(newPinia())
    void master.load()
    await flushPromises()
    FakeWorker.autoReply = true
    const second = master.load()
    await second
    expect(master.status).toBe('ready')
  })

  it('辞書に名前が無い ID は ID の文字列をそのまま返す', async () => {
    stubBackend()
    const { master } = await loadStores()
    expect(master.nameOf(wp('great-sword:1'))).toBe('鉄の大剣')
    expect(master.nameOf('xx:unknown')).toBe('xx:unknown')
  })

  it('スキルを種類ごとに ja の名前順で並べる', async () => {
    stubBackend()
    const { master } = await loadStores()
    // 防具スキル: ガード（a2）、攻撃（a1）の五十音順
    expect(master.skillsByKind.get('armor')?.map((s) => s.id)).toEqual([sk('a2'), sk('a1')])
    expect(master.skillsByKind.get('series')?.map((s) => s.id)).toEqual([sk('s1')])
  })

  it('マスターに含まれるランクだけを低い順に出す', async () => {
    stubBackend()
    const { master } = await loadStores()
    expect(master.availableRanks).toEqual(['low', 'high'])
  })

  it('読み込み前は索引が空で、availableRanks も空', () => {
    stubBackend()
    const master = useMasterStore(newPinia())
    expect(master.availableRanks).toEqual([])
    expect(master.weaponById.size).toBe(0)
    expect(master.skillById.size).toBe(0)
    expect(master.armorById.size).toBe(0)
    expect(master.decorationById.size).toBe(0)
  })
})
