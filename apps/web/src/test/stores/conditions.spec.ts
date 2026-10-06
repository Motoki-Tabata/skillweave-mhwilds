import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NO_RANK_REASON, NO_WEAPON_REASON } from '@/stores/conditions'
import { MAX_RESULTS_DEFAULT } from '@/constants/search'
import { makeBundle, makeDictionary, sk, wp } from '../support/fixtures'
import { loadStores, restoreStubs, stubBackend } from '../support/mount'

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
      expect(conditions.weaponId).toBeNull()
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

    it('スキルを外す', async () => {
      const { conditions } = await loadStores()
      conditions.toggleSkill(sk('a1'))
      conditions.toggleSkill(sk('a2'))
      conditions.removeSkill(sk('a1'))
      expect(conditions.required.map((r) => r.skillId)).toEqual([sk('a2')])
    })
  })
})
