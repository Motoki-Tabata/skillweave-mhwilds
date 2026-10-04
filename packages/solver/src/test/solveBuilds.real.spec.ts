import highsLoader, { type Highs } from 'highs'
import type { MasterBundle, SkillId } from '@swv/data'
import { beforeAll, describe, expect, it } from 'vitest'
import { makeRequest, skill, weaponId } from './support/builders'
import { solveVerified } from './support/harness'
import { loadRealMaster } from './support/realMaster'

let highs: Highs
let master: MasterBundle

beforeAll(async () => {
  highs = await highsLoader()
  master = loadRealMaster()
})

/** 実データから固定で選んだスキル（名前は 2026.10.1 の辞書。ID が変わったらこのテストが落ちて気づける） */
const SKILL = {
  fire: 'sk:-3666104', // 火竜の力（シリーズ。2 部位で Lv1・4 部位で Lv2）
  scale: 'sk:1487598336', // 鱗張りの技法（グループ。3 部位で Lv1）
  frenzy: 'sk:-62248528', // 闢獣の力（シリーズ）
  evade: 'sk:144660544', // 回避性能（最大 Lv5）
  taijutsu: 'sk:-1689391744', // 体術（最大 Lv5）
} as const

const required = (...pairs: [string, number][]) => pairs.map(([id, level]) => skill(id, level))

describe('実データ（現行のマスター）で解く', () => {
  it('マスターが読めて、テストが使うスキルが存在する', () => {
    const ids = new Set<string>(master.skills.map((s: { id: SkillId }) => s.id))
    for (const id of Object.values(SKILL)) expect(ids.has(id)).toBe(true)
  })

  it('[AC2][AC13] シリーズ／グループスキルを含む必須スキルの組（解あり）を解き、全構成を検算する', async () => {
    const request = makeRequest(master, {
      weapon: { kind: 'master', weaponId: master.weapons[0]?.id ?? weaponId('') },
      required: required([SKILL.fire, 2], [SKILL.scale, 1], [SKILL.evade, 3]),
      objective: { kind: 'maximize', metric: 'defense' },
      maxResults: 5,
    })
    const result = await solveVerified(highs, master, request)
    expect(result.status).toBe('optimal')
    expect(result.builds.length).toBeGreaterThan(0)
    const names = result.builds[0]?.skills.map((s) => s.skillId) ?? []
    expect(names).toEqual(expect.arrayContaining([SKILL.fire, SKILL.scale, SKILL.evade]))
  })

  it('[AC2][AC13] 部位数が5を超えるシリーズスキルの組（解なし）は infeasible', async () => {
    const request = makeRequest(master, {
      required: required([SKILL.fire, 2], [SKILL.frenzy, 2]),
      objective: { kind: 'maximize', metric: 'defense' },
    })
    const result = await solveVerified(highs, master, request)
    expect(result).toMatchObject({ status: 'infeasible', builds: [] })
  })

  it('[AC13] freeSlots の最大化と装飾品の配置も実データで検算を通る', async () => {
    const request = makeRequest(master, {
      required: required([SKILL.fire, 1], [SKILL.taijutsu, 3]),
      objective: { kind: 'maximize', metric: 'freeSlots' },
      maxResults: 3,
    })
    const result = await solveVerified(highs, master, request)
    expect(result.status).toBe('optimal')
    expect(result.builds.length).toBeGreaterThan(0)
  })
})
