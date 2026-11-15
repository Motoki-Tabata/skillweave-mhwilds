import highsLoader, { type Highs } from 'highs'
import type { MasterBundle } from '@swv/data'
import { beforeAll, describe, expect, it } from 'vitest'
import { InvalidRequestError, SolveCancelledError } from '../main/errors'
import {
  reverseLookup,
  type ReverseLookupCandidate,
  type ReverseLookupOptions,
  type ReverseLookupRequest,
} from '../main/reverseLookup'
import {
  armor,
  armorId,
  buildMaster,
  decoration,
  decorationId,
  lotteryGroup,
  lotteryPattern,
  masterSkill,
  BASE_WEAPON_ID,
  plainArmors,
  skill,
  slot,
  TEST_VERSION,
  weaponId,
} from './support/builders'
import { verifyBuild } from './support/verifyBuild'
import {
  bruteReverse,
  candidateKeys,
  compareKeys,
  isStricterOnly,
  orderOf,
  toSolverCharm,
  toSolverRequest,
} from './support/reverse'
import { fakeClock } from './support/harness'

let highs: Highs

beforeAll(async () => {
  highs = await highsLoader()
})

const SKILLS = [masterSkill('A'), masterSkill('B'), masterSkill('C')]

const GROUPS = [
  lotteryGroup('g1', [skill('A', 1), skill('B', 1)]),
  lotteryGroup('g2', [skill('A', 2), skill('C', 1)]),
]

/** レア5・6・7 の 3 パターン（g2 を 2 枠持つパターンと、枠なしを持つパターンを含む） */
const PATTERNS = [
  lotteryPattern(5, ['g1', null], [[], [slot(1)]]),
  lotteryPattern(6, ['g1', 'g2'], [[slot(2)], [slot(1, 'weapon'), slot(1)]]),
  lotteryPattern(7, ['g2', 'g2'], [[]]),
]

function makeMaster(patterns = PATTERNS): MasterBundle {
  return buildMaster({
    skills: SKILLS,
    armors: plainArmors({
      head: [armor('hB', 'head', { skills: [skill('B')] }), armor('h0', 'head')],
      chest: [armor('cA', 'chest', { skills: [skill('A')], slots: [slot(1)] })],
    }),
    decorations: [
      decoration('dA', 'armor', 1, [skill('A')]),
      decoration('dC', 'armor', 2, [skill('C')]),
    ],
    appraisedCharm: { patterns, groups: GROUPS },
  })
}

function makeRequest(
  master: MasterBundle,
  overrides: Partial<ReverseLookupRequest> = {},
): ReverseLookupRequest {
  return {
    masterVersion: master.version,
    weapon: { kind: 'master', weaponId: weaponId(BASE_WEAPON_ID) },
    required: [],
    maxResults: 30,
    timeoutMs: 10_000,
    ...overrides,
  }
}

/** 偽の時計（進まない）。進捗は持たない */
function plainOptions(): ReverseLookupOptions {
  const { now, yieldControl } = fakeClock().options
  return { now, yieldControl }
}

function run(
  master: MasterBundle,
  request: ReverseLookupRequest,
  options: ReverseLookupOptions = plainOptions(),
) {
  return reverseLookup(highs, master, request, options)
}

/** 返した候補の構成を、その護石だけを候補にした通常の要求で検算する（AC-4） */
function expectVerified(
  master: MasterBundle,
  request: ReverseLookupRequest,
  candidates: ReverseLookupCandidate[],
) {
  for (const { charm, build } of candidates) {
    const solverCharm = toSolverCharm(charm)
    expect(build.charmId).toBeNull()
    const problems = verifyBuild(master, toSolverRequest(request, [solverCharm]), {
      ...build,
      charmId: solverCharm.id,
    })
    expect(problems).toEqual([])
  }
}

describe('[AC-2][AC-5][AC-6] 総当たりとの一致', () => {
  const REQUIRED_SETS: [string, [string, number][]][] = [
    ['必須なし', []],
    ['A1', [['A', 1]]],
    ['A2', [['A', 2]]],
    ['A3', [['A', 3]]],
    [
      'A1 C1',
      [
        ['A', 1],
        ['C', 1],
      ],
    ],
    [
      'A2 C1',
      [
        ['A', 2],
        ['C', 1],
      ],
    ],
    [
      'B1 C1',
      [
        ['B', 1],
        ['C', 1],
      ],
    ],
    [
      'A2 B1 C1',
      [
        ['A', 2],
        ['B', 1],
        ['C', 1],
      ],
    ],
    ['B2', [['B', 2]]],
  ]

  it.each(REQUIRED_SETS)('件数の上限に達しないとき、候補の集合が一致する: %s', async (_, pairs) => {
    const master = makeMaster()
    const request = makeRequest(master, { required: pairs.map(([id, lv]) => skill(id, lv)) })
    const expected = await bruteReverse(highs, master, request)
    expect(expected.length).toBeLessThan(request.maxResults)
    const result = await run(master, request)
    expect(result.status).toBe(expected.length === 0 ? 'infeasible' : 'feasible')
    const asText = (keys: unknown[]) => keys.map((k) => JSON.stringify(k)).toSorted()
    expect(asText(candidateKeys(result.candidates))).toEqual(asText(expected))
    expectVerified(master, request, result.candidates)
  })

  it.each(REQUIRED_SETS)(
    'maxResults で打ち切ると、先頭からの並びの値が一致する: %s',
    async (_, pairs) => {
      const master = makeMaster()
      const request = makeRequest(master, {
        required: pairs.map(([id, lv]) => skill(id, lv)),
        maxResults: 2,
      })
      const expected = await bruteReverse(highs, master, request)
      const result = await run(master, request)
      expect(candidateKeys(result.candidates).map(orderOf)).toEqual(
        expected.slice(0, 2).map(orderOf),
      )
    },
  )

  it('返した候補は AC-5 の順に並び、先の候補より厳しいだけの候補を含まない', async () => {
    const master = makeMaster()
    const result = await run(master, makeRequest(master, { required: [skill('A', 2), skill('C')] }))
    const keys = candidateKeys(result.candidates)
    expect(keys.length).toBeGreaterThan(1)
    expect(keys).toEqual(keys.toSorted(compareKeys))
    keys.forEach((key, i) => {
      for (const earlier of keys.slice(0, i)) expect(isStricterOnly(key, earlier)).toBe(false)
    })
  })

  it('互いに異なる護石だけを返す', async () => {
    const master = makeMaster()
    const result = await run(master, makeRequest(master, { required: [skill('A', 2)] }))
    const texts = candidateKeys(result.candidates).map((k) => JSON.stringify([k.skills, k.slots]))
    expect(new Set(texts).size).toBe(texts.length)
  })
})

describe('[AC-1] 検索画面の条件をそのまま使う', () => {
  it('必須スキルを防具だけで満たせるときは、要るスキルが無い護石を先頭に返す', async () => {
    const master = makeMaster()
    const result = await run(master, makeRequest(master, { required: [skill('B')] }))
    expect(candidateKeys(result.candidates)[0]?.skills).toEqual([])
  })

  it('防具の除外・固定が効く（防具で満たせなくなると護石のスキルが要る）', async () => {
    const master = makeMaster()
    const base = makeRequest(master, { required: [skill('B')] })
    const excluded = await run(master, { ...base, excludedArmorIds: [armorId('hB')] })
    expect(excluded.candidates.length).toBeGreaterThan(0)
    for (const c of excluded.candidates) {
      expect(c.build.armor.head).not.toBe('hB')
      expect(candidateKeys([c])[0]?.skills.map((s) => s.skillId)).toEqual(['B'])
    }
    const fixed = await run(master, { ...base, fixedArmor: { head: armorId('h0') } })
    for (const c of fixed.candidates) expect(c.build.armor.head).toBe('h0')
    expect(candidateKeys(fixed.candidates)[0]?.skills).toHaveLength(1)
    const none = await run(master, { ...base, fixedArmor: { head: null } })
    expect(candidateKeys(none.candidates)[0]?.skills).toHaveLength(1)
    expectVerified(master, { ...base, fixedArmor: { head: null } }, none.candidates)
  })

  it('装飾品の除外が効く（除外すると装飾品の分を護石が持つ必要がある）', async () => {
    const master = makeMaster()
    const base = makeRequest(master, { required: [skill('A', 2)] })
    const withDeco = await run(master, base)
    const withoutDeco = await run(master, {
      ...base,
      excludedDecorationIds: [decorationId('dA')],
    })
    for (const c of withoutDeco.candidates) {
      expect(c.build.decorations.map((d) => d.decorationId)).not.toContain('dA')
    }
    expectVerified(
      master,
      { ...base, excludedDecorationIds: [decorationId('dA')] },
      withoutDeco.candidates,
    )
    // 装飾品を使える方が、要るスキルのレベルの合計が低い（または同じ）候補を先頭にできる
    const sum = (r: typeof withDeco) => orderOf(candidateKeys(r.candidates)[0]!)[1]
    expect(sum(withDeco)).toBeLessThanOrEqual(sum(withoutDeco))
  })

  it('登録した護石を使わない（要求は護石を持たず、構成の護石 ID は null）', async () => {
    const master = makeMaster()
    const result = await run(master, makeRequest(master, { required: [skill('A', 2)] }))
    for (const c of result.candidates) expect(c.build.charmId).toBeNull()
  })
})

describe('[AC-3] 同じスキルを 2 つ持たない', () => {
  it('同じグループが 2 枠のパターンでも、同じスキルは 1 つまで', async () => {
    // g2 を 2 枠持つレア7 だけのテーブル。C は g2 の Lv1 しか無いので、護石 1 つで C Lv2 には届かない
    const master = makeMaster([lotteryPattern(7, ['g2', 'g2'], [[]])])
    const result = await run(master, makeRequest(master, { required: [skill('C', 2)] }))
    expect(result.status).toBe('infeasible')
  })

  it('同じ必須スキルを 2 つ持つ候補を返さない', async () => {
    const master = makeMaster()
    const result = await run(
      master,
      makeRequest(master, { required: [skill('A', 3), skill('C', 1)] }),
    )
    for (const c of result.candidates) {
      const ids = c.charm.skills.flatMap((s) => (s === null ? [] : [s.skillId]))
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})

describe('[AC-4] 候補の内容', () => {
  it('レア度・スキルとレベル・スロットの並びと構成を持ち、構成に効かない枠は null（任意）', async () => {
    const master = makeMaster()
    // 装飾品 dC を除外して、C を護石が持つ必要がある条件にする
    const request = makeRequest(master, {
      required: [skill('C')],
      excludedDecorationIds: [decorationId('dC')],
    })
    const result = await run(master, request)
    expect(result.candidates.length).toBeGreaterThan(0)
    for (const { charm, build } of result.candidates) {
      const pattern = master.appraisedCharm.patterns.find((p) => p.rarity === charm.rarity)
      expect(charm.skills).toHaveLength(pattern?.skillGroups.filter((g) => g !== null).length ?? -1)
      expect(build.skills.some((s) => s.skillId === 'C')).toBe(true)
    }
    // C を持たない枠は null
    const first = result.candidates[0]
    expect(first?.charm.skills.filter((s) => s !== null)).toEqual([skill('C', 1)])
    expect(first?.charm.skills.some((s) => s === null)).toBe(true)
    expectVerified(master, request, result.candidates)
  })

  it('装飾品は仮想の護石のスロットに収まる（owner が charm の index は charm.slots の添字）', async () => {
    const master = makeMaster()
    const request = makeRequest(master, { required: [skill('A', 3), skill('C', 1)] })
    const result = await run(master, request)
    for (const { charm, build } of result.candidates) {
      const refs = [...build.decorations.map((d) => d.slot), ...build.freeSlots]
      for (const ref of refs.filter((r) => r.owner === 'charm')) {
        expect(charm.slots[ref.index]).toBeDefined()
      }
    }
    expectVerified(master, request, result.candidates)
  })

  it('必須スキルが 0 件のとき「任意」だけの候補を、スロットの並びごとに返す', async () => {
    const master = makeMaster()
    const result = await run(master, makeRequest(master))
    expect(result.status).toBe('feasible')
    expect(result.candidates.every((c) => c.charm.skills.every((s) => s === null))).toBe(true)
    expect(result.candidates.map((c) => c.charm.rarity)).toEqual([5, 5, 6, 6])
  })
})

describe('[AC-5] 件数', () => {
  it('maxResults 件で打ち切る', async () => {
    const master = makeMaster()
    const result = await run(master, makeRequest(master, { maxResults: 2 }))
    expect(result.candidates).toHaveLength(2)
    expect(result.status).toBe('feasible')
  })

  it('要るスキルの少ない順（同数ならレベルの合計・レア度の低い順）に並べる', async () => {
    const master = makeMaster()
    const result = await run(master, makeRequest(master, { required: [skill('A', 2)] }))
    const orders = candidateKeys(result.candidates).map(orderOf)
    expect(orders).toEqual(orders.toSorted((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]))
  })
})

describe('[AC-7] 解なし', () => {
  it('どの仮想の護石でも組めないとき infeasible で候補は空', async () => {
    const master = makeMaster()
    const result = await run(master, makeRequest(master, { required: [skill('B', 3)] }))
    expect(result).toMatchObject({ status: 'infeasible', candidates: [] })
  })
})

describe('[AC-8] 抽選テーブルが無いレア度', () => {
  it('テーブルにあるレア度だけが出る', async () => {
    const full = makeMaster()
    const request = makeRequest(full, { required: [skill('A', 1), skill('C', 1)] })
    const rarities = (r: Awaited<ReturnType<typeof run>>) => r.candidates.map((c) => c.charm.rarity)
    expect(rarities(await run(full, request))).toContain(6)
    const partial = makeMaster(PATTERNS.filter((p) => p.rarity !== 6))
    const rest = rarities(await run(partial, request))
    expect(rest.length).toBeGreaterThan(0)
    for (const r of rest) expect([5, 7]).toContain(r)
  })

  it('テーブルが空のマスターでは InvalidRequestError', async () => {
    const master = makeMaster([])
    await expect(run(master, makeRequest(master))).rejects.toBeInstanceOf(InvalidRequestError)
  })
})

describe('[AC-9] 時間の上限とキャンセル', () => {
  it('時間の上限で timeout になり、それまでに見つけた候補を返す', async () => {
    const master = makeMaster()
    // 求解 1 回につき 6ms 進む。上限 10ms なので 1 件見つけたところで時間切れ
    const { now, yieldControl } = fakeClock(6).options
    const result = await run(master, makeRequest(master, { timeoutMs: 10 }), { now, yieldControl })
    expect(result.status).toBe('timeout')
    expect(result.candidates).toHaveLength(1)
  })

  it('1 件も見つける前に時間切れなら timeout で候補は空', async () => {
    const master = makeMaster()
    const { now, yieldControl } = fakeClock(100).options
    const result = await run(master, makeRequest(master, { timeoutMs: 10 }), { now, yieldControl })
    expect(result).toMatchObject({ status: 'timeout', candidates: [] })
  })

  it('キャンセルで SolveCancelledError を投げる', async () => {
    const master = makeMaster()
    const { now, yieldControl } = fakeClock().options
    await expect(
      run(master, makeRequest(master), { now, yieldControl, isCancelled: () => true }),
    ).rejects.toBeInstanceOf(SolveCancelledError)
  })

  it('候補を 1 件見つけるごとに onProgress を呼ぶ', async () => {
    const master = makeMaster()
    const seen: number[] = []
    const { now, yieldControl } = fakeClock().options
    const result = await run(master, makeRequest(master), {
      now,
      yieldControl,
      onProgress: (found) => seen.push(found),
    })
    expect(seen).toEqual(result.candidates.map((_, i) => i + 1))
  })
})

describe('[AC-10] 1 回の求解で護石と構成を同時に決める', () => {
  it('maxResults 1 の逆引きは求解を 1 回だけ行う', async () => {
    const master = makeMaster()
    let solves = 0
    const { now } = fakeClock().options
    const result = await run(
      master,
      makeRequest(master, { required: [skill('A', 2)], maxResults: 1 }),
      {
        now,
        yieldControl: () => {
          solves++
          return Promise.resolve()
        },
      },
    )
    expect(result.candidates).toHaveLength(1)
    expect(solves).toBe(1)
  })
})

describe('要求の検査', () => {
  it('masterVersion が違うと InvalidRequestError', async () => {
    const master = makeMaster()
    const request = makeRequest(master)
    await expect(
      run(master, { ...request, masterVersion: `${TEST_VERSION}x` as typeof TEST_VERSION }),
    ).rejects.toBeInstanceOf(InvalidRequestError)
  })

  it('maxResults が 0 だと InvalidRequestError', async () => {
    const master = makeMaster()
    await expect(run(master, makeRequest(master, { maxResults: 0 }))).rejects.toBeInstanceOf(
      InvalidRequestError,
    )
  })
})
