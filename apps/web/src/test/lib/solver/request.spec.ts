import { describe, expect, it } from 'vitest'
import type { SolverWeapon, Uuid } from '@swv/solver'
import type { SearchConditions } from '@/lib/solver/request'
import { buildSolverRequest, excludedArmorIds, toObjective } from '@/lib/solver/request'
import { SOLVE_TIMEOUT_MS } from '@/constants/search'
import { VERSION, armorId, cd, makeBundle, sk, wp } from '../../support/fixtures'

// 受入基準 6（SolverRequest への変換）
describe('buildSolverRequest', () => {
  const bundle = makeBundle()
  const base: SearchConditions = {
    weapon: { kind: 'master', weaponId: wp('great-sword:1') },
    required: [
      { skillId: sk('a1'), level: 2 },
      { skillId: sk('w1'), level: 5 },
    ],
    objective: 'feasible',
    maxResults: 7,
    ranks: ['high'],
    activeConditionIds: [],
    charms: [],
  }

  it('版・武器・必須スキル・件数・timeoutMs を渡し、護石の候補は空にする', () => {
    const request = buildSolverRequest(bundle, base)
    expect(request.masterVersion).toBe(VERSION)
    expect(request.weapon).toEqual({ kind: 'master', weaponId: wp('great-sword:1') })
    expect(request.charms).toEqual([])
    expect(request.required).toEqual(base.required)
    expect(request.maxResults).toBe(7)
    expect(request.timeoutMs).toBe(SOLVE_TIMEOUT_MS)
    expect(request.fixedArmor).toBeUndefined()
  })

  // 受入基準 7（個体差のある武器を kind: custom の SolverWeapon のまま渡す）
  it('個体差のある武器は kind: custom の SolverWeapon のまま要求に渡す', () => {
    const custom: SolverWeapon = {
      kind: 'custom',
      id: '01900000-0000-7000-8000-000000000001' as Uuid,
      baseWeaponId: wp('great-sword:1'),
      attack: 200,
      affinity: 15,
      slots: [{ target: 'weapon', level: 3 }],
      skills: [],
      setBonusIds: [],
    }
    expect(buildSolverRequest(bundle, { ...base, weapon: custom }).weapon).toEqual(custom)
  })

  it('必須スキルは元の配列と別のオブジェクトにする', () => {
    const request = buildSolverRequest(bundle, base)
    expect(request.required[0]).not.toBe(base.required[0])
  })

  it('選ばれていないランクの防具だけを除外の指定にする', () => {
    const request = buildSolverRequest(bundle, base)
    const lowIds = bundle.armors.filter((a) => a.rank === 'low').map((a) => a.id)
    expect(request.excludedArmorIds).toEqual(lowIds)
    expect(request.excludedArmorIds).not.toContain(armorId('high', 'head'))
  })

  it('全ランクを選んだときは除外が空', () => {
    expect(excludedArmorIds(bundle, ['low', 'high'])).toEqual([])
  })

  it('ランクが0個のときは防具のすべてを除外する', () => {
    expect(excludedArmorIds(bundle, [])).toHaveLength(bundle.armors.length)
  })

  // 受入基準 1（火力の最大化の要求）
  it('火力の最大化は expectedDamage の最大化で要求する', () => {
    expect(toObjective('expectedDamage')).toEqual({ kind: 'maximize', metric: 'expectedDamage' })
  })

  // 受入基準 3（オンの条件を目的にかかわらず入れる。無ければ空の配列）
  it('activeConditionIds を目的にかかわらず入れ、無ければ空の配列', () => {
    expect(buildSolverRequest(bundle, base).activeConditionIds).toEqual([])
    const ids = [cd('wound'), cd('weak_point')]
    for (const objective of ['feasible', 'expectedDamage'] as const) {
      const request = buildSolverRequest(bundle, { ...base, objective, activeConditionIds: ids })
      expect(request.activeConditionIds).toEqual(ids)
    }
  })

  it('目的の対応: 条件を満たす・防御力・空きスロット', () => {
    expect(toObjective('feasible')).toEqual({ kind: 'feasible' })
    expect(toObjective('defense')).toEqual({ kind: 'maximize', metric: 'defense' })
    expect(toObjective('freeSlots')).toEqual({ kind: 'maximize', metric: 'freeSlots' })
    expect(buildSolverRequest(bundle, { ...base, objective: 'defense' }).objective).toEqual({
      kind: 'maximize',
      metric: 'defense',
    })
  })
})

// 受入基準 8（護石の候補を SolverRequest に渡す）
describe('buildSolverRequest の護石', () => {
  const bundle = makeBundle()
  const conditions: SearchConditions = {
    weapon: { kind: 'master', weaponId: wp('great-sword:1') },
    required: [],
    objective: 'feasible',
    maxResults: 5,
    ranks: ['high'],
    activeConditionIds: [],
    charms: [
      {
        id: '018f0000-0000-7000-8000-000000000001' as Uuid,
        rarity: 8,
        skills: [{ skillId: sk('a1'), level: 2 }],
        slots: [{ target: 'weapon', level: 1 }],
      },
    ],
  }

  it('護石の候補をそのまま charms に渡す', () => {
    expect(buildSolverRequest(bundle, conditions).charms).toEqual(conditions.charms)
  })

  it('護石が1つも無ければ charms は空（護石なしで解く）', () => {
    expect(buildSolverRequest(bundle, { ...conditions, charms: [] }).charms).toEqual([])
  })
})
