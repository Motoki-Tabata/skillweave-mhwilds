import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NO_RANK_REASON, NO_WEAPON_REASON } from '@/stores/conditions'
import { MAX_RESULTS_DEFAULT } from '@/constants/search'
import { compareJa } from '@/lib/text'
import { CONDITIONS, NAMES, makeBundle, makeDictionary, sk, wp } from '../support/fixtures'
import { loadStores, restoreStubs, stubBackend } from '../support/mount'
import { createMemoryWeaponRepository } from '../support/weaponRepository'
import {
  ARTIA_GREAT_SWORD,
  GROUP_BONUS,
  SERIES_BONUS,
  makeWeaponBundle,
  makeWeaponDictionary,
  storedWeapon,
  weaponId,
} from '../support/weapons'

// 受入基準 3〜5（条件の入力）・6（検索できない理由）
describe('conditions ストア', () => {
  afterEach(restoreStubs)

  describe('既定値', () => {
    beforeEach(() => stubBackend())

    it('目的は条件を満たす構成、件数は 10、必須スキルは空、武器は未選択', async () => {
      const { conditions } = await loadStores()
      expect(conditions.objective).toBe('feasible')
      expect(conditions.maxResults).toBe(MAX_RESULTS_DEFAULT)
      expect(conditions.required).toEqual([])
      expect(conditions.selection).toBeNull()
      expect(conditions.weapon).toBeNull()
    })

    it('ランクの既定はマスターに含まれる最も高いランクだけ（下位・上位 → 上位）', async () => {
      const { conditions } = await loadStores()
      expect(conditions.ranks).toEqual(['high'])
    })
  })

  it('ランクの既定: マスターランクが含まれるときはマスターだけ', async () => {
    const options = { ranks: ['low', 'high', 'master'] as const }
    stubBackend({
      bundle: makeBundle({ ranks: [...options.ranks] }),
      dictionary: makeDictionary({ ranks: [...options.ranks] }),
    })
    const { conditions, master } = await loadStores()
    expect(master.availableRanks).toEqual(['low', 'high', 'master'])
    expect(conditions.ranks).toEqual(['master'])
  })

  describe('操作', () => {
    beforeEach(() => stubBackend())

    it('ランクを0個にするとエラーで、検索できない理由は武器の次に評価する', async () => {
      const { conditions } = await loadStores()
      conditions.setRank('high', false)
      expect(conditions.ranks).toEqual([])
      expect(conditions.rankError).toBe(true)
      // 武器が未選択のときは武器の理由が先
      expect(conditions.unavailableReason).toBe(NO_WEAPON_REASON)
      conditions.selectWeapon(wp('bow:1'))
      expect(conditions.unavailableReason).toBe(NO_RANK_REASON)
      conditions.setRank('low', true)
      expect(conditions.rankError).toBe(false)
      expect(conditions.unavailableReason).toBeNull()
    })

    it('ランクはマスターの順（低い順）に並べる', async () => {
      const { conditions } = await loadStores()
      conditions.setRank('low', true)
      expect(conditions.ranks).toEqual(['low', 'high'])
    })

    it('件数は 1〜30 の整数に丸める', async () => {
      const { conditions } = await loadStores()
      conditions.setMaxResults(0)
      expect(conditions.maxResults).toBe(1)
      conditions.setMaxResults(99)
      expect(conditions.maxResults).toBe(30)
      conditions.setMaxResults(3.6)
      expect(conditions.maxResults).toBe(4)
      conditions.setMaxResults(30)
      expect(conditions.maxResults).toBe(30)
    })

    it('目的を変えられる', async () => {
      const { conditions } = await loadStores()
      conditions.setObjective('defense')
      expect(conditions.objective).toBe('defense')
    })

    it('武器を選ぶと weapon が引け、武器欄のエラーが消える', async () => {
      const { conditions } = await loadStores()
      conditions.showWeaponError()
      expect(conditions.weaponErrorShown).toBe(true)
      conditions.selectWeapon(wp('great-sword:1'))
      expect(conditions.weaponErrorShown).toBe(false)
      expect(conditions.weapon?.id).toBe(wp('great-sword:1'))
    })

    it('武器が選ばれているときは武器欄のエラーを出さない', async () => {
      const { conditions } = await loadStores()
      conditions.selectWeapon(wp('bow:1'))
      conditions.showWeaponError()
      expect(conditions.weaponErrorShown).toBe(false)
    })

    it('スキルの追加は最大レベルを下限にし、もう一度で外す', async () => {
      const { conditions } = await loadStores()
      conditions.toggleSkill(sk('a2'))
      expect(conditions.required).toEqual([{ skillId: sk('a2'), level: 4 }])
      expect(conditions.isRequired(sk('a2'))).toBe(true)
      conditions.toggleSkill(sk('a2'))
      expect(conditions.required).toEqual([])
      expect(conditions.isRequired(sk('a2'))).toBe(false)
    })

    it('マスターに無いスキルは追加しない', async () => {
      const { conditions } = await loadStores()
      conditions.toggleSkill(sk('nothing'))
      expect(conditions.required).toEqual([])
    })

    it('下限は 1〜最大レベルの範囲に丸める', async () => {
      const { conditions } = await loadStores()
      conditions.toggleSkill(sk('a2'))
      conditions.setSkillLevel(sk('a2'), 0)
      expect(conditions.required[0].level).toBe(1)
      conditions.setSkillLevel(sk('a2'), 9)
      expect(conditions.required[0].level).toBe(4)
      conditions.setSkillLevel(sk('a2'), 2)
      expect(conditions.required[0].level).toBe(2)
      conditions.setSkillLevel(sk('nothing'), 2)
      expect(conditions.required).toHaveLength(1)
    })

    it('必須スキルを種類の順（武器・防具・シリーズ・グループ）にまとめ、種類の中は追加した順', async () => {
      const { conditions } = await loadStores()
      for (const id of ['g1', 'a2', 's1', 'a1', 'w1']) conditions.toggleSkill(sk(id))
      expect(conditions.requiredGroups.map((g) => g.label)).toEqual([
        '武器',
        '防具',
        'シリーズ',
        'グループ',
      ])
      expect(conditions.requiredGroups[1].rows.map((r) => r.skill.id)).toEqual([sk('a2'), sk('a1')])
    })

    it('該当の無い種類はまとめに出さない', async () => {
      const { conditions } = await loadStores()
      conditions.toggleSkill(sk('s1'))
      expect(conditions.requiredGroups.map((g) => g.kind)).toEqual(['series'])
    })

    // 受入基準 2（すべてのトグルを辞書の名前で。既定はオフ）
    it('発動条件はマスターのすべてを ja の名前の順に出し、既定はすべてオフ', async () => {
      const { conditions } = await loadStores()
      const names = conditions.conditionOptions.map((o) => o.name)
      expect([...names].sort(compareJa)).toEqual(names)
      expect(new Set(names)).toEqual(new Set(CONDITIONS.map((c) => NAMES[c.id])))
      expect(names).toHaveLength(CONDITIONS.length)
      expect(conditions.activeConditionIds).toEqual([])
    })

    // 受入基準 3（オンの ID はトグルの並びの順）
    it('オンにした条件の ID をトグルの並びの順で持ち、オフで外す', async () => {
      const { conditions } = await loadStores()
      const order = conditions.conditionOptions.map((o) => o.id)
      conditions.setConditionActive(order[2], true)
      conditions.setConditionActive(order[0], true)
      expect(conditions.activeConditionIds).toEqual([order[0], order[2]])
      conditions.setConditionActive(order[0], false)
      expect(conditions.activeConditionIds).toEqual([order[2]])
    })

    // 受入基準 11（削除した武器を選んでいれば、選択を外す）
    it('この ID の個体差のある武器を選んでいれば選択を外し、別の武器を選んでいれば何もしない', async () => {
      const { conditions } = await loadStores()
      conditions.selectCustomWeapon(weaponId(1))
      expect(conditions.isWeaponSelected(weaponId(1))).toBe(true)
      expect(conditions.isWeaponSelected(weaponId(2))).toBe(false)
      conditions.releaseWeapon(weaponId(2))
      expect(conditions.selection).toEqual({ kind: 'custom', id: weaponId(1) })
      conditions.releaseWeapon(weaponId(1))
      expect(conditions.selection).toBeNull()
      expect(conditions.weaponErrorShown).toBe(false)
    })

    it('マスターの武器を選んでいるとき、同じ文字列の ID を外す操作では外れない', async () => {
      const { conditions } = await loadStores()
      conditions.selectWeapon(wp('great-sword:1'))
      conditions.releaseWeapon(wp('great-sword:1'))
      expect(conditions.selection).toEqual({ kind: 'master', weaponId: wp('great-sword:1') })
    })

    it('スキルを外す', async () => {
      const { conditions } = await loadStores()
      conditions.toggleSkill(sk('a1'))
      conditions.toggleSkill(sk('a2'))
      conditions.removeSkill(sk('a1'))
      expect(conditions.required.map((r) => r.skillId)).toEqual([sk('a2')])
    })
  })
})

// 受入基準 6・7・11（個体差のある武器の選択と解決）
describe('conditions ストアの個体差のある武器', () => {
  beforeEach(() => stubBackend({ bundle: makeWeaponBundle(), dictionary: makeWeaponDictionary() }))
  afterEach(restoreStubs)

  async function setup(...numbers: number[]) {
    const stores = await loadStores(
      undefined,
      createMemoryWeaponRepository(numbers.map((n) => storedWeapon(n))),
    )
    await stores.weapons.ensureLoaded()
    return stores
  }

  it('個体差のある武器を選ぶと、表示名・武器種・攻撃力・会心率・スロット・custom の SolverWeapon に解決する', async () => {
    const { conditions } = await setup(1)
    conditions.selectCustomWeapon(weaponId(1))
    expect(conditions.unavailableReason).toBeNull()
    expect(conditions.weapon).toMatchObject({
      kind: 'custom',
      id: weaponId(1),
      name: '巨戟ブレイド',
      weaponType: 'great-sword',
      attack: 200,
      affinity: 15,
      slots: [{ level: 3 }, { level: 1 }],
      solverWeapon: {
        kind: 'custom',
        id: weaponId(1),
        baseWeaponId: ARTIA_GREAT_SWORD,
        skills: [],
        setBonusIds: [SERIES_BONUS, GROUP_BONUS],
      },
    })
  })

  it('S3 で編集すると、解決した武器は編集後の内容になり、選択は外れない', async () => {
    const { conditions, weapons } = await setup(1)
    conditions.selectCustomWeapon(weaponId(1))
    const stored = weapons.weapons[0]
    await weapons.save({ ...stored.payload, attack: 300 }, stored)
    expect(conditions.weapon?.attack).toBe(300)
    expect(conditions.selection).toEqual({ kind: 'custom', id: weaponId(1) })
  })

  it('武器のストアに無い ID を選んでいるとき、weapon は null', async () => {
    const { conditions } = await setup()
    conditions.selectCustomWeapon(weaponId(9))
    expect(conditions.weapon).toBeNull()
  })

  it('基の武器が現行のマスターに無い個体差のある武器は解決しない', async () => {
    const stores = await loadStores(
      undefined,
      createMemoryWeaponRepository([storedWeapon(1, { baseWeaponId: wp('great-sword:1') })]),
    )
    await stores.weapons.ensureLoaded()
    stores.conditions.selectCustomWeapon(weaponId(1))
    expect(stores.conditions.weapon).toBeNull()
  })

  it('マスターの武器は kind: master の SolverWeapon に解決する', async () => {
    const { conditions } = await setup()
    conditions.selectWeapon(wp('great-sword:1'))
    expect(conditions.weapon).toMatchObject({
      kind: 'master',
      name: '鉄の大剣',
      solverWeapon: { kind: 'master', weaponId: wp('great-sword:1') },
    })
  })
})
