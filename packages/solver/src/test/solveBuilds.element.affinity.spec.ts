import highsLoader, { type Highs } from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'
import { DAMAGE_EPSILON } from '../main/solveBuilds'
import {
  armor,
  BASE_WEAPON_ID,
  buildMaster,
  makeRequest,
  masterSkill,
  plainArmors,
  skill,
  weapon,
} from './support/builders'
import { bruteForce } from './support/bruteForce'
import { solveVerified } from './support/harness'

let highs: Highs

beforeAll(async () => {
  highs = await highsLoader()
})

/**
 * 別の属性（火）の element を持つ affinity_add が、雷の武器の属性の最大化でも会心率に数えられること。
 * 参照（damageReference.referenceElement）は affinity_add を常に数える。
 * 数えないと、AFFF の頭（36）より EADD の頭（32）を選んでしまい、総当たりと一致しない。
 */
describe('[AC-7] 種類付きの affinity_add は属性の最大化でも会心率に数える', () => {
  const master = buildMaster({
    skills: [
      masterSkill('ECRIT', 'armor', 1, [[{ stat: 'element_crit_mul', value: 1.5 }]]),
      masterSkill('AFFF', 'armor', 1, [[{ stat: 'affinity_add', value: 40, element: 'fire' }]]),
      masterSkill('EADD', 'armor', 1, [[{ stat: 'element_add', value: 2 }]]),
    ],
    weapons: [weapon(BASE_WEAPON_ID, { affinity: 0, element: { type: 'thunder', value: 30 } })],
    armors: plainArmors({
      head: [
        armor('h-aff', 'head', { skills: [skill('AFFF')] }),
        armor('h-add', 'head', { skills: [skill('EADD')] }),
      ],
      chest: [armor('c-crit', 'chest', { skills: [skill('ECRIT')] })],
    }),
  })
  const request = makeRequest(master, {
    objective: { kind: 'maximize', metric: 'expectedElement' },
  })

  it('1 件目は AFFF の頭で、score は総当たりの最大（30 × (1 + 0.4 × 0.5) = 36）に一致し、検算に通る', async () => {
    const best = Math.max(...bruteForce(master, request).map((c) => c.expected))
    expect(best).toBeCloseTo(36, 9)
    const result = await solveVerified(highs, master, request)
    expect(result.builds[0]?.armor.head).toBe('h-aff')
    expect(Math.abs((result.builds[0]?.score ?? Number.NaN) - best)).toBeLessThanOrEqual(
      DAMAGE_EPSILON,
    )
  })
})
