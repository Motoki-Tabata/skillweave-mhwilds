import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sk, makeTableBundle } from '../support/fixtures'
import { createMemoryCharmRepository } from '../support/charmRepository'
import { charmId, storedCharm } from '../support/charms'
import { loadStores, restoreStubs, stubBackend } from '../support/mount'
import { useToastStore } from '@/stores/toast'
import type { CharmPayload } from '@/lib/charms/types'

const passing: CharmPayload = {
  rarity: 8,
  skills: [{ skillId: sk('a1'), level: 2 }],
  slots: [{ target: 'weapon', level: 1 }],
}
const mismatching: CharmPayload = { ...passing, skills: [{ skillId: sk('a1'), level: 3 }] }
const unchecked: CharmPayload = { ...passing, rarity: 6 }
const overLevel: CharmPayload = { ...passing, skills: [{ skillId: sk('a1'), level: 9 }] }
const unknownSkill: CharmPayload = { ...passing, skills: [{ skillId: sk('zz'), level: 1 }] }

describe('charms ストア', () => {
  beforeEach(() => stubBackend({ bundle: makeTableBundle() }))
  afterEach(restoreStubs)

  // 受入基準 3・4（保存と一覧の並び）
  it('読み込むと状態が ready になり、一覧は ID の降順に並ぶ', async () => {
    const repo = createMemoryCharmRepository([
      storedCharm(1, passing),
      storedCharm(3, passing),
      storedCharm(2, passing),
    ])
    const { charms } = await loadStores(repo)
    expect(charms.status).toBe('loading')
    await charms.ensureLoaded()
    expect(charms.status).toBe('ready')
    expect(charms.charms.map((c) => c.id)).toEqual([charmId(3), charmId(2), charmId(1)])
  })

  it('登録: UUIDv7 を振って保存してから一覧の先頭に足し、トーストを出す', async () => {
    const repo = createMemoryCharmRepository([storedCharm(1, passing)])
    const { charms, pinia } = await loadStores(repo)
    await charms.ensureLoaded()
    expect(await charms.save(unchecked)).toBe(true)
    const saved = repo.snapshot().find((c) => c.id !== charmId(1))!
    expect(saved.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(saved.schemaVersion).toBe(1)
    expect(saved.payload).toEqual(unchecked)
    expect(charms.charms[0].id).toBe(saved.id)
    expect(useToastStore(pinia).items.map((i) => i.message)).toEqual(['護石を登録しました。'])
  })

  it('上書き: 同じ ID・登録日時のまま中身と更新日時を変え、並びは変えない', async () => {
    const repo = createMemoryCharmRepository([storedCharm(1, passing), storedCharm(2, passing)])
    const { charms, pinia } = await loadStores(repo)
    await charms.ensureLoaded()
    const target = charms.charms[1]
    expect(await charms.save(unchecked, target)).toBe(true)
    expect(charms.charms.map((c) => c.id)).toEqual([charmId(2), charmId(1)])
    const saved = repo.snapshot().find((c) => c.id === charmId(1))!
    expect(saved.payload).toEqual(unchecked)
    expect(saved.createdAt).toBe(target.createdAt)
    expect(saved.updatedAt).not.toBe(target.updatedAt)
    expect(useToastStore(pinia).items.map((i) => i.message)).toEqual(['護石を保存しました。'])
  })

  it('削除: 端末から消えてから一覧を変え、トーストを出す', async () => {
    const repo = createMemoryCharmRepository([storedCharm(1, passing), storedCharm(2, passing)])
    const { charms, pinia } = await loadStores(repo)
    await charms.ensureLoaded()
    expect(await charms.remove(charmId(2))).toBe(true)
    expect(repo.snapshot().map((c) => c.id)).toEqual([charmId(1)])
    expect(charms.charms.map((c) => c.id)).toEqual([charmId(1)])
    expect(useToastStore(pinia).items[0].message).toBe('護石を削除しました。')
  })

  // 受入基準 10（書き込みの失敗）
  it('書き込みに失敗したら、一覧を変えず、原因つきの destructive のトーストを出す', async () => {
    const repo = createMemoryCharmRepository([storedCharm(1, passing)])
    const { charms, pinia } = await loadStores(repo)
    await charms.ensureLoaded()
    repo.failWith('put', 'quota')
    expect(await charms.save(unchecked)).toBe(false)
    expect(await charms.save(unchecked, charms.charms[0])).toBe(false)
    expect(charms.charms).toHaveLength(1)
    expect(charms.charms[0].payload).toEqual(passing)
    repo.failWith('delete', 'unknown')
    expect(await charms.remove(charmId(1))).toBe(false)
    expect(charms.charms).toHaveLength(1)
    const toasts = useToastStore(pinia).items
    expect(toasts.map((t) => t.tone)).toEqual(['destructive', 'destructive', 'destructive'])
    expect(toasts[0].message).toBe(
      '護石を保存できませんでした。端末の保存容量が足りません。 もう一度お試しください。',
    )
    expect(toasts[2].message).toBe(
      '護石を削除できませんでした。端末への保存（IndexedDB）に失敗しました。 もう一度お試しください。',
    )
  })

  it('保存先を開けないときは「端末に保存できない」になり、原因を持ち、書き込まない', async () => {
    const { charms, pinia } = await loadStores()
    charms.setRepositoryOpener(async () => {
      throw Object.assign(new Error('x'), { name: 'SecurityError' })
    })
    await charms.ensureLoaded()
    expect(charms.status).toBe('unavailable')
    expect(charms.failureMessage).toBe(
      'この端末のブラウザでは、端末への保存（IndexedDB）が使えません。',
    )
    expect(await charms.save(unchecked)).toBe(false)
    expect(useToastStore(pinia).items).toHaveLength(0)
  })

  it('一覧を読めないときは「読み込みの失敗」になり、再読み込みで回復する', async () => {
    const repo = createMemoryCharmRepository([storedCharm(1, passing)])
    const { charms } = await loadStores(repo)
    repo.failWith('list', 'unknown')
    await charms.ensureLoaded()
    expect(charms.status).toBe('failed')
    expect(charms.failureMessage).toBe('端末への保存（IndexedDB）に失敗しました。')
    repo.failWith('list', null)
    await charms.reload()
    expect(charms.status).toBe('ready')
    expect(charms.charms).toHaveLength(1)
  })

  it('ensureLoaded は1回だけ開く', async () => {
    const { charms } = await loadStores()
    let opened = 0
    charms.setRepositoryOpener(async () => {
      opened += 1
      return createMemoryCharmRepository()
    })
    await Promise.all([charms.ensureLoaded(), charms.ensureLoaded()])
    await charms.ensureLoaded()
    expect(opened).toBe(1)
  })

  // 受入基準 6・7・9（照合の結果）、8（候補と検索対象外）
  it('各護石の照合の結果を、現行のマスターで求める', async () => {
    const repo = createMemoryCharmRepository([
      storedCharm(1, passing),
      storedCharm(2, mismatching),
      storedCharm(3, unchecked),
    ])
    const { charms } = await loadStores(repo)
    await charms.ensureLoaded()
    expect(charms.entries.map((e) => e.match?.status)).toEqual(['unchecked', 'mismatch', 'pass'])
  })

  it('候補は構造上の制約を満たすものすべて（未検査・不一致を含む）で、外す護石は件数と理由を返す', async () => {
    const repo = createMemoryCharmRepository([
      storedCharm(1, passing),
      storedCharm(2, mismatching),
      storedCharm(3, unchecked),
      storedCharm(4, overLevel),
      storedCharm(5, unknownSkill),
    ])
    const { charms } = await loadStores(repo)
    await charms.ensureLoaded()
    expect(charms.candidates.map((c) => c.id).sort()).toEqual(
      [charmId(1), charmId(2), charmId(3)].sort(),
    )
    expect(charms.candidateCount).toBe(3)
    expect(charms.excludedCount).toBe(2)
    expect(charms.excluded.find((e) => e.id === charmId(4))?.reasons).toEqual([
      '「攻撃 Lv9」が最大レベル（Lv3）を超えています。',
    ])
    expect(charms.excluded.find((e) => e.id === charmId(5))?.reasons[0]).toContain(
      'が現行のマスターにありません。',
    )
  })
})
