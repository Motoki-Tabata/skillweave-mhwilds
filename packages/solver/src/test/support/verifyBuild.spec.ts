import highsLoader, { type Highs } from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SolvedBuild } from '../../main/request'
import {
  armor,
  armorId,
  buildMaster,
  decoration,
  makeRequest,
  masterSkill,
  plainArmors,
  skill,
  slot,
} from './builders'
import { solve } from './harness'
import { verifyBuild } from './verifyBuild'

let highs: Highs

beforeAll(async () => {
  highs = await highsLoader()
})

const master = buildMaster({
  skills: [masterSkill('A')],
  armors: plainArmors({ head: [armor('h1', 'head', { slots: [slot(2), slot(1)] })] }),
  decorations: [decoration('d1', 'armor', 1, [skill('A')])],
})
const request = makeRequest(master, {
  required: [skill('A')],
  objective: { kind: 'maximize', metric: 'freeSlots' },
})

async function validBuild(): Promise<SolvedBuild> {
  const build = (await solve(highs, master, request)).builds[0]
  if (build === undefined) throw new Error('検算の対象の構成が無い')
  return build
}

describe('[AC13] 検算 verifyBuild は違反を検出する', () => {
  it('正しい構成は違反なし', async () => {
    expect(verifyBuild(master, request, await validBuild())).toEqual([])
  })

  it('必須スキルの下限割れ（装飾品が無い）', async () => {
    const build = { ...(await validBuild()), decorations: [] }
    expect(verifyBuild(master, request, build).join('\n')).toContain('下限')
  })

  it('同じスロットに2つの装飾品', async () => {
    const base = await validBuild()
    const first = base.decorations[0]
    if (first === undefined) throw new Error('装飾品が無い')
    const build = { ...base, decorations: [first, first] }
    expect(verifyBuild(master, request, build).join('\n')).toContain('2つ')
  })

  it('存在しないスロットへの配置', async () => {
    const build = await validBuild()
    const placed = build.decorations[0]
    if (placed === undefined) throw new Error('装飾品が無い')
    const wrong: SolvedBuild = {
      ...build,
      decorations: [{ slot: { owner: 'weapon', index: 0 }, decorationId: placed.decorationId }],
    }
    expect(verifyBuild(master, request, wrong).join('\n')).toContain('存在しない')
  })

  it('発動スキルの食い違い', async () => {
    const build = { ...(await validBuild()), skills: [] }
    expect(verifyBuild(master, request, build).join('\n')).toContain('発動スキル')
  })

  it('空きスロットの食い違い', async () => {
    const build = { ...(await validBuild()), freeSlots: [] }
    expect(verifyBuild(master, request, build).join('\n')).toContain('空きスロット')
  })

  it('除外した防具の使用', async () => {
    const build = await validBuild()
    const withExcluded = makeRequest(master, { ...request, excludedArmorIds: [armorId('h1')] })
    expect(verifyBuild(master, withExcluded, build).join('\n')).toContain('除外')
  })
})
