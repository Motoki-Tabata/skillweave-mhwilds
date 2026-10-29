import highsLoader, { type Highs } from 'highs'
import type { ArmorId, CharmId, DecorationId, MasterBundle } from '@swv/data'
import { beforeAll, describe, expect, it } from 'vitest'
import { profileLe, reduceCandidates, undominated, type Profile } from '../main/dominance'
import type { SolverRequest } from '../main/request'
import { DAMAGE_EPSILON } from '../main/solveBuilds'
import {
  armor,
  buildMaster,
  charm,
  decoration,
  makeRequest,
  masterSkill,
  plainArmors,
  skill,
  slot,
} from './support/builders'
import { bruteForce, type BruteConfig } from './support/bruteForce'
import { solveVerified } from './support/harness'

let highs: Highs

beforeAll(async () => {
  highs = await highsLoader()
})

const profile = (p: Partial<Profile>): Profile => ({
  levels: [],
  sets: [],
  weaponSlots: [],
  armorSlots: [],
  ...p,
})

describe('[AC2] 支配の判定の関数（profileLe・undominated）', () => {
  it('スキルのレベルとシリーズ／グループの所属がすべて以下なら支配される', () => {
    expect(profileLe(profile({ levels: [1, 0] }), profile({ levels: [1, 2] }))).toBe(true)
    expect(profileLe(profile({ levels: [2, 0] }), profile({ levels: [1, 2] }))).toBe(false)
    expect(profileLe(profile({ sets: [true] }), profile({ sets: [false] }))).toBe(false)
    expect(profileLe(profile({ sets: [false] }), profile({ sets: [true] }))).toBe(true)
  })

  it('スロットは種別ごとに Lv を降順に並べて要素ごとに比べ、足りない側は 0 とみなす', () => {
    expect(profileLe(profile({ armorSlots: [1] }), profile({ armorSlots: [2, 1] }))).toBe(true)
    expect(profileLe(profile({ armorSlots: [2, 2] }), profile({ armorSlots: [3] }))).toBe(false)
    expect(profileLe(profile({ armorSlots: [3] }), profile({ armorSlots: [2, 2] }))).toBe(false)
    expect(profileLe(profile({ weaponSlots: [1] }), profile({ armorSlots: [3] }))).toBe(false)
  })

  it('互いに等しい要素は並びの最初だけ残し、支配される要素は外す', () => {
    const items = [
      { id: 'a', v: 1 },
      { id: 'b', v: 1 },
      { id: 'c', v: 0 },
      { id: 'd', v: 2 },
      { id: 'e', v: 2 },
    ]
    const kept = undominated(items, (x, y) => x.v <= y.v)
    expect(kept.map((i) => i.id)).toEqual(['d'])
    const same = undominated(items.slice(0, 2), (x, y) => x.v <= y.v)
    expect(same.map((i) => i.id)).toEqual(['a'])
  })
})

/**
 * 支配される候補（×）と互いに等しい候補（＝）を含むマスター。
 * 関係するスキル: Q（必須）・ATK（期待値の対象）。
 */
function dominanceMaster(): MasterBundle {
  const base = buildMaster({
    skills: [
      masterSkill('Q', 'armor', 2),
      masterSkill('ATK', 'armor', 3, [
        [{ stat: 'attack_add', value: 4 }],
        [{ stat: 'attack_add', value: 9 }],
        [{ stat: 'attack_add', value: 15 }],
      ]),
    ],
    armors: plainArmors({
      head: [
        armor('h1', 'head', { skills: [skill('ATK')], slots: [slot(1)] }),
        armor('h2', 'head', { skills: [skill('ATK')], slots: [slot(1)] }), // h1 と等しい（＝）
        armor('h3', 'head', { slots: [slot(1)] }), // h1 に支配される（×）
        armor('h4', 'head', { skills: [skill('Q')], slots: [slot(2)] }),
      ],
      chest: [
        armor('c1', 'chest', { skills: [skill('ATK', 2)] }),
        armor('c2', 'chest', { skills: [skill('ATK')], slots: [slot(1)] }),
        armor('c3', 'chest', { skills: [skill('ATK')] }), // c1 に支配される（×）
      ],
    }),
    decorations: [
      decoration('dATK', 'armor', 1, [skill('ATK')]),
      decoration('dATKb', 'armor', 1, [skill('ATK')]), // dATK と等しい（＝）
      decoration('dATK3', 'armor', 3, [skill('ATK')]), // dATK に支配される（×。Lv が大きい）
      decoration('dQ', 'armor', 1, [skill('Q')]),
      decoration('dATK2', 'armor', 2, [skill('ATK', 2)]),
    ],
  })
  const crafted = (
    id: string,
    rarity: number,
    skills: MasterBundle['charms'][number]['skills'],
  ) => ({
    id: id as CharmId,
    rarity,
    skills,
  })
  return {
    ...base,
    charms: [
      { ...crafted('ch:a:1', 5, [skill('ATK')]), slots: [slot(1)] },
      { ...crafted('ch:a:2', 6, [skill('ATK')]), slots: [slot(2)] },
      { ...crafted('ch:b:1', 6, [skill('ATK')]), slots: [slot(2)] }, // ch:a:2 と等しい（＝）
      { ...crafted('ch:c:1', 6, [skill('Q')]), slots: [] },
    ],
  }
}

/** マスターの生産護石 4 件に、マスターに無い ID の鑑定護石 1 件（ch:a:1 と同じ性能）を足した候補 */
function dominanceRequest(master: MasterBundle, overrides: Partial<SolverRequest> = {}) {
  return makeRequest(master, {
    charms: [
      charm('ch:a:1', { skills: [skill('ATK')], slots: [slot(1)] }),
      charm('ch:a:2', { skills: [skill('ATK')], slots: [slot(2)] }),
      charm('ch:b:1', { skills: [skill('ATK')], slots: [slot(2)] }),
      charm('ch:c:1', { skills: [skill('Q')] }),
      charm('appraised-1', { skills: [skill('ATK')], slots: [slot(1)] }),
    ],
    required: [skill('Q')],
    objective: { kind: 'maximize', metric: 'expectedDamage' },
    maxResults: 30,
    ...overrides,
  })
}

const armorIds = (m: MasterBundle) => m.armors.map((a) => a.id as string)
const decoIds = (m: MasterBundle) => m.decorations.map((d) => d.id as string)

describe('[AC2] reduceCandidates', () => {
  const master = dominanceMaster()

  it('支配される防具・装飾品・生産護石と、互いに等しい候補の後ろ側を外す。鑑定護石は残す', () => {
    const reduced = reduceCandidates(master, dominanceRequest(master))
    expect(armorIds(reduced.master)).toEqual(['h1', 'h4', 'c1', 'c2', 'arms0', 'waist0', 'legs0'])
    expect(decoIds(reduced.master)).toEqual(['dATK', 'dQ', 'dATK2'])
    expect(reduced.request.charms.map((c) => c.id as string)).toEqual([
      'ch:a:2',
      'ch:c:1',
      'appraised-1',
    ])
  })

  it('鑑定護石は、性能が生産護石に支配されても外さず、外す側にもならない', () => {
    const request = dominanceRequest(master, {
      charms: [
        charm('appraised-1', { skills: [skill('ATK')], slots: [slot(1)] }),
        charm('appraised-2', { skills: [skill('ATK')], slots: [slot(1)] }),
        charm('ch:a:1', { skills: [skill('ATK')], slots: [slot(1)] }),
      ],
    })
    const ids = reduceCandidates(master, request).request.charms.map((c) => c.id as string)
    expect(ids).toEqual(['appraised-1', 'appraised-2', 'ch:a:1'])
  })

  it('固定・除外を適用した後の候補の中で判定する', () => {
    const excluded = reduceCandidates(
      master,
      dominanceRequest(master, {
        excludedArmorIds: ['h1' as ArmorId],
        excludedDecorationIds: ['dATK' as DecorationId],
      }),
    ).master
    // h1 を除くと h2 が最初の等しい候補になり、h3 は h2 に支配される
    expect(armorIds(excluded).filter((id) => id.startsWith('h'))).toEqual(['h2', 'h4'])
    // dATK を除くと dATKb が残り、dATK3 は dATKb に支配される
    expect(decoIds(excluded)).toEqual(['dATKb', 'dQ', 'dATK2'])

    const fixed = reduceCandidates(
      master,
      dominanceRequest(master, { fixedArmor: { head: 'h3' as ArmorId, chest: null } }),
    ).master
    // 固定した部位はその 1 件だけ（支配されても残す）、null の部位は候補が無い
    expect(armorIds(fixed)).toEqual(['h3', 'arms0', 'waist0', 'legs0'])
  })

  it('スキルを持たない・関係しないものだけが違う候補は、等しい候補として 1 件にまとまる', () => {
    const m = buildMaster({
      armors: plainArmors({
        head: [armor('x1', 'head', { defense: 10 }), armor('x2', 'head', { defense: 99 })],
      }),
    })
    const reduced = reduceCandidates(m, makeRequest(m))
    expect(armorIds(reduced.master).filter((id) => id.startsWith('x'))).toEqual(['x1'])
  })
})

/** 防具・護石の組ごとの最大の期待値（総当たり）の降順 */
function bestPerKey(configs: BruteConfig[]): number[] {
  const best = new Map<string, number>()
  for (const c of configs) best.set(c.key, Math.max(best.get(c.key) ?? -Infinity, c.expected))
  return [...best.values()].sort((a, b) => b - a)
}

/** D4 の候補の定義で外した後のマスターと要求（手で書いた、reduceCandidates の実装に頼らない写し） */
function handReduced(master: MasterBundle, request: SolverRequest) {
  const dropArmors = new Set(['h2', 'h3', 'c3'])
  const dropDecos = new Set(['dATKb', 'dATK3'])
  const dropCharms = new Set(['ch:a:1', 'ch:b:1'])
  return {
    master: {
      ...master,
      armors: master.armors.filter((a) => !dropArmors.has(a.id)),
      decorations: master.decorations.filter((d) => !dropDecos.has(d.id)),
    },
    request: { ...request, charms: request.charms.filter((c) => !dropCharms.has(c.id)) },
  }
}

describe('[AC4] 生産護石を含む手作りのマスターで総当たりと一致する', () => {
  const master = dominanceMaster()
  const request = dominanceRequest(master)
  const all = bruteForce(master, request)
  const reduced = handReduced(master, request)
  const expectedScores = bestPerKey(bruteForce(reduced.master, reduced.request))

  it('1件目の期待値が、全候補の総当たりの最大に等しい', async () => {
    const result = await solveVerified(highs, master, request, 'optimal')
    expect(result.builds.length).toBeGreaterThan(0)
    const first = result.builds[0]?.score ?? Number.NaN
    expect(Math.abs(first - Math.max(...all.map((c) => c.expected)))).toBeLessThanOrEqual(
      DAMAGE_EPSILON,
    )
  })

  it('全件が検算に通り、score が降順で、2件目以降も D4 の候補の総当たりの最大と一致する', async () => {
    const result = await solveVerified(highs, master, request, 'optimal')
    const scores = result.builds.map((b) => b.score ?? Number.NaN)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
    expect(scores).toHaveLength(expectedScores.length)
    scores.forEach((s, i) => {
      expect(Math.abs(s - (expectedScores[i] ?? Number.NaN))).toBeLessThanOrEqual(DAMAGE_EPSILON)
    })
  })

  it('返した構成は、外した候補の防具・装飾品・生産護石を含まない', async () => {
    const result = await solveVerified(highs, master, request, 'optimal')
    const dropped = new Set(['h2', 'h3', 'c3', 'ch:a:1', 'ch:b:1'])
    const droppedDecorations = new Set(['dATKb', 'dATK3'])
    expect(result.builds.length).toBeGreaterThan(0)
    for (const b of result.builds) {
      expect(b.decorations.some((d) => droppedDecorations.has(d.decorationId))).toBe(false)
      expect(Object.values(b.armor).some((id) => dropped.has(id ?? ''))).toBe(false)
      expect(dropped.has(b.charmId ?? '')).toBe(false)
    }
  })
})

describe('[AC3] 他の目的関数は支配の除外の影響を受けない', () => {
  // 組の数が maxResults（上限 30）に収まるよう、胴は 1 件にする（頭 4 × 護石 5 = 20 組）
  const full = dominanceMaster()
  const master = { ...full, armors: full.armors.filter((a) => a.id !== 'c2' && a.id !== 'c3') }
  const objectives = [
    { kind: 'feasible' },
    { kind: 'maximize', metric: 'defense' },
    { kind: 'maximize', metric: 'freeSlots' },
  ] as const

  it.each(objectives)('目的関数 %j は、外される候補を含む全組を返す', async (objective) => {
    const request = dominanceRequest(master, { objective })
    const result = await solveVerified(highs, master, request)
    expect(result.status).toBe(objective.kind === 'feasible' ? 'feasible' : 'optimal')
    const keys = new Set(bruteForce(master, request).map((c) => c.key))
    expect(result.builds).toHaveLength(keys.size)
    const heads = new Set(result.builds.map((b) => b.armor.head as string))
    expect([...heads].sort()).toEqual(['h1', 'h2', 'h3', 'h4'])
    expect(new Set(result.builds.map((b) => b.charmId))).toContain('ch:a:1')
  })
})
