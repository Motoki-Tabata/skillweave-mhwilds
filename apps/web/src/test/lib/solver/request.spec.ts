import { describe, expect, it } from 'vitest'
import type { SearchConditions } from '@/lib/solver/request'
import { buildSolverRequest, excludedArmorIds, toObjective } from '@/lib/solver/request'
import { SOLVE_TIMEOUT_MS } from '@/constants/search'
import { VERSION, armorId, makeBundle, sk, wp } from '../../support/fixtures'

// 受入基準 6（SolverRequest への変換）
describe('buildSolverRequest', () => {
  const bundle = makeBundle()
  const base: SearchConditions = {
    weaponId: wp('great-sword:1'),
    required: [
      { skillId: sk('a1'), level: 2 },
      { skillId: sk('w1'), level: 5 },
    ],
    objective: 'feasible',
    maxResults: 7,
    ranks: ['high'],
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
