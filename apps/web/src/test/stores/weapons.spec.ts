import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WeaponId } from '@swv/data'
import { createMemoryWeaponRepository } from '../support/weaponRepository'
import { loadStores, restoreStubs, stubBackend } from '../support/mount'
import {
  ARTIA_BOW,
  GROUP_BONUS,
  makePayload,
  makeWeaponBundle,
  makeWeaponDictionary,
  storedWeapon,
  weaponId,
} from '../support/weapons'
import { useToastStore } from '@/stores/toast'

describe('weapons ストア', () => {
  beforeEach(() => stubBackend({ bundle: makeWeaponBundle(), dictionary: makeWeaponDictionary() }))
  afterEach(restoreStubs)

  // 受入基準 3・4（保存と一覧の並び）
  it('読み込むと状態が ready になり、一覧は ID の降順に並ぶ', async () => {
    const repo = createMemoryWeaponRepository([storedWeapon(1), storedWeapon(3), storedWeapon(2)])
    const { weapons } = await loadStores(undefined, repo)
    expect(weapons.status).toBe('loading')
    await weapons.ensureLoaded()
    expect(weapons.status).toBe('ready')
    expect(weapons.weapons.map((w) => w.id)).toEqual([weaponId(3), weaponId(2), weaponId(1)])
  })

  // 受入基準 3（UUIDv7 の採番と端末への保存）
  it('登録: UUIDv7 を振って保存してから一覧の先頭に足し、トーストを出す', async () => {
    const repo = createMemoryWeaponRepository([storedWeapon(1)])
    const { weapons, pinia } = await loadStores(undefined, repo)
    await weapons.ensureLoaded()
    expect(await weapons.save(makePayload({ name: '新しい武器' }))).toBe('saved')
    const saved = repo.snapshot().find((w) => w.id !== weaponId(1))!
    expect(saved.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(saved.schemaVersion).toBe(1)
    expect(saved.payload).toEqual(makePayload({ name: '新しい武器' }))
    expect(weapons.weapons[0].id).toBe(saved.id)
    expect(useToastStore(pinia).items.map((i) => i.message)).toEqual([
      '個体差のある武器を登録しました。',
    ])
  })

  it('上書き: 同じ ID・登録日時のまま中身と更新日時を変え、並びは変えない', async () => {
    const repo = createMemoryWeaponRepository([storedWeapon(1), storedWeapon(2)])
    const { weapons, pinia } = await loadStores(undefined, repo)
    await weapons.ensureLoaded()
    const target = weapons.weapons[1]
    expect(await weapons.save(makePayload({ attack: 250 }), target)).toBe('saved')
    expect(weapons.weapons.map((w) => w.id)).toEqual([weaponId(2), weaponId(1)])
    const saved = repo.snapshot().find((w) => w.id === weaponId(1))!
    expect(saved.payload.attack).toBe(250)
    expect(saved.createdAt).toBe(target.createdAt)
    expect(saved.updatedAt).not.toBe(target.updatedAt)
    expect(useToastStore(pinia).items.map((i) => i.message)).toEqual([
      '個体差のある武器を保存しました。',
    ])
  })

  it('削除: 端末から消えてから一覧を変え、トーストを出す', async () => {
    const repo = createMemoryWeaponRepository([storedWeapon(1), storedWeapon(2)])
    const { weapons, pinia } = await loadStores(undefined, repo)
    await weapons.ensureLoaded()
    expect(await weapons.remove(weaponId(2))).toBe('saved')
    expect(repo.snapshot().map((w) => w.id)).toEqual([weaponId(1)])
    expect(weapons.weapons.map((w) => w.id)).toEqual([weaponId(1)])
    expect(useToastStore(pinia).items.map((i) => i.message)).toEqual([
      '個体差のある武器を削除しました。',
    ])
  })

  // 受入基準 12（書き込みの失敗）
  it('書き込みに失敗したら、ストアも端末も変えず、destructive のトーストを出す', async () => {
    const repo = createMemoryWeaponRepository([storedWeapon(1)])
    const { weapons, pinia } = await loadStores(undefined, repo)
    await weapons.ensureLoaded()
    repo.failWith('put', 'quota')
    expect(await weapons.save(makePayload({ attack: 300 }), weapons.weapons[0])).toBe('failed')
    expect(await weapons.save(makePayload())).toBe('failed')
    expect(weapons.weapons).toHaveLength(1)
    expect(weapons.weapons[0].payload.attack).toBe(200)
    expect(repo.snapshot()).toHaveLength(1)
    const toast = useToastStore(pinia).items[0]
    expect(toast.tone).toBe('destructive')
    expect(toast.message).toBe(
      '個体差のある武器を保存できませんでした。端末の保存容量が足りません。 もう一度お試しください。',
    )
  })

  it('削除に失敗したら、一覧を変えず、「削除できませんでした」のトーストを出す', async () => {
    const repo = createMemoryWeaponRepository([storedWeapon(1)])
    const { weapons, pinia } = await loadStores(undefined, repo)
    await weapons.ensureLoaded()
    repo.failWith('delete', 'unknown')
    expect(await weapons.remove(weaponId(1))).toBe('failed')
    expect(weapons.weapons).toHaveLength(1)
    expect(useToastStore(pinia).items[0].message).toContain(
      '個体差のある武器を削除できませんでした。',
    )
  })

  it('読み込めていないあいだは、保存も削除もしない', async () => {
    const { weapons } = await loadStores()
    expect(await weapons.save(makePayload())).toBe('failed')
    expect(await weapons.remove(weaponId(1))).toBe('failed')
  })

  it('保存先を開けないときは unavailable になり、原因を持つ。「再読み込み」で回復する', async () => {
    const repo = createMemoryWeaponRepository()
    const { weapons } = await loadStores()
    let attempts = 0
    weapons.setRepositoryOpener(async () => {
      attempts += 1
      if (attempts === 1) throw Object.assign(new Error('x'), { name: 'SecurityError' })
      return repo
    })
    await weapons.ensureLoaded()
    expect(weapons.status).toBe('unavailable')
    expect(weapons.failureMessage).toContain('IndexedDB')
    await weapons.reload()
    expect(weapons.status).toBe('ready')
    expect(weapons.failureMessage).toBe('')
  })

  it('一覧を読めないときは failed になる', async () => {
    const repo = createMemoryWeaponRepository()
    repo.failWith('list', 'unknown')
    const { weapons } = await loadStores(undefined, repo)
    await weapons.ensureLoaded()
    expect(weapons.status).toBe('failed')
    expect(weapons.failureMessage).not.toBe('')
  })

  it('ensureLoaded は1回しか開かない', async () => {
    const { weapons } = await loadStores()
    let opened = 0
    weapons.setRepositoryOpener(async () => {
      opened += 1
      return createMemoryWeaponRepository()
    })
    await Promise.all([weapons.ensureLoaded(), weapons.ensureLoaded()])
    await weapons.ensureLoaded()
    expect(opened).toBe(1)
  })

  // 受入基準 10（基の武器・付与スキルが現行のマスターに無ければ候補から外す）
  describe('検索の候補と検索対象外', () => {
    it('基の武器・付与スキルが現行のマスターにある武器だけが候補になり、外す武器に理由を持つ', async () => {
      const repo = createMemoryWeaponRepository([
        storedWeapon(1),
        storedWeapon(2, { baseWeaponId: 'wp:gone' as WeaponId }),
        storedWeapon(3, { seriesBonusId: GROUP_BONUS }),
        storedWeapon(4, { baseWeaponId: ARTIA_BOW, seriesBonusId: null, groupBonusId: null }),
      ])
      const { weapons } = await loadStores(undefined, repo)
      await weapons.ensureLoaded()
      expect(weapons.candidates.map((w) => w.id)).toEqual([weaponId(4), weaponId(1)])
      expect(weapons.candidateCount).toBe(2)
      expect(weapons.excludedCount).toBe(2)
      expect(weapons.excluded).toEqual([
        { id: weaponId(3), reasons: ['シリーズスキルが現行のマスターにありません。'] },
        { id: weaponId(2), reasons: ['基の武器が現行のマスターにありません。'] },
      ])
    })
  })

  // AC-8（削除の応答待ちの間は同じ武器の削除を重ねて受け付けない）
  it('削除の応答を待つ間は、同じ武器の削除を受け付けない', async () => {
    const repo = createMemoryWeaponRepository([storedWeapon(1)])
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const deleteSpy = vi.fn(async (id: string) => {
      await gate
      await repo.delete(id)
    })
    const { weapons } = await loadStores(undefined, { ...repo, delete: deleteSpy })
    await weapons.ensureLoaded()
    const first = weapons.remove(weaponId(1))
    expect(await weapons.remove(weaponId(1))).toBe('failed')
    release()
    expect(await first).toBe('saved')
    expect(deleteSpy).toHaveBeenCalledTimes(1)
  })
})
