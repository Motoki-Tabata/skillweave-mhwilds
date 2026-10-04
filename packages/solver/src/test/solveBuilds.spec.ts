import highsLoader, { type Highs } from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'
import { SolveCancelledError } from '../main/errors'
import type { SolverRequest } from '../main/request'
import { solveBuilds } from '../main/solveBuilds'
import {
  armor,
  armorId,
  buildMaster,
  charm,
  decoration,
  makeRequest,
  masterSkill,
  PARTS,
  plainArmors,
  setBonus,
  setBonusId,
  skill,
  slot,
  uuid,
  weapon,
  weaponId,
  BASE_WEAPON_ID,
} from './support/builders'
import { fakeClock, solve, solveVerified } from './support/harness'

let highs: Highs

beforeAll(async () => {
  highs = await highsLoader()
})

const SKILLS = [
  masterSkill('A'),
  masterSkill('B'),
  masterSkill('S', 'series', 2),
  masterSkill('G', 'group', 1),
]
const BONUSES = [
  setBonus('S', [
    { pieces: 2, level: 1 },
    { pieces: 4, level: 2 },
  ]),
  setBonus('G', [{ pieces: 3, level: 1 }]),
]

const headsOf = (builds: { armor: { head: string | null } }[]) => builds.map((b) => b.armor.head)

describe('[AC1] 必須スキルの下限を満たす構成を求める', () => {
  it('必須スキルの合計レベルが下限以上の構成だけを返す（防御力が高くても下限未満は選ばない）', async () => {
    const master = buildMaster({
      skills: SKILLS,
      armors: plainArmors({
        head: [
          armor('head-low', 'head', { skills: [skill('A')], defense: 10 }),
          armor('head-high', 'head', { defense: 99 }),
        ],
        chest: [armor('chest1', 'chest', { skills: [skill('A')] })],
      }),
    })
    const request = makeRequest(master, {
      required: [skill('A', 2)],
      objective: { kind: 'maximize', metric: 'defense' },
    })
    const result = await solveVerified(highs, master, request)
    expect(result.status).toBe('optimal')
    expect(headsOf(result.builds)).toEqual(['head-low'])
  })

  it('個体差のある武器・護石・防具のスキルを合算して下限と比べる', async () => {
    const master = buildMaster({
      skills: SKILLS,
      armors: plainArmors({ head: [armor('head1', 'head', { skills: [skill('A')] })] }),
    })
    const request = makeRequest(master, {
      weapon: {
        kind: 'custom',
        id: uuid('custom-1'),
        baseWeaponId: weaponId(BASE_WEAPON_ID),
        attack: 200,
        affinity: 10,
        slots: [],
        skills: [skill('A')],
        setBonusIds: [],
      },
      charms: [charm('c-none'), charm('c-a', { skills: [skill('A')] })],
      required: [skill('A', 3)],
    })
    const result = await solveVerified(highs, master, request)
    expect(result.builds.map((b) => b.charmId)).toEqual(['c-a'])
  })

  it('マスターの武器のスキルも数える', async () => {
    const master = buildMaster({
      skills: SKILLS,
      weapons: [weapon('w-a', { skills: [skill('A', 2)] })],
    })
    const request = makeRequest(master, { required: [skill('A', 2)] })
    const result = await solveVerified(highs, master, request)
    expect(result.status).toBe('feasible')
    expect(result.builds).toHaveLength(1)
  })

  it('下限に届く組が無ければ解なし（エラーではない）', async () => {
    const master = buildMaster({ skills: SKILLS })
    const result = await solveVerified(
      highs,
      master,
      makeRequest(master, { required: [skill('A')] }),
    )
    expect(result).toMatchObject({ status: 'infeasible', builds: [] })
  })

  it('必須スキルが空なら制約なしで列挙する', async () => {
    const master = buildMaster({ skills: SKILLS })
    const result = await solveVerified(highs, master, makeRequest(master))
    expect(result.status).toBe('feasible')
    expect(result.builds).toHaveLength(1)
  })
})

describe('[AC2] シリーズ／グループスキルの部位数と段', () => {
  /** 各部位に「シリーズ S を持つ防具」と「持たない防具」の2択を置く */
  function seriesMaster(options: { weaponHasS?: boolean; extra?: string[] } = {}) {
    const armors = PARTS.flatMap((p) => [
      armor(`${p}0`, p),
      armor(`${p}S`, p, { setBonusIds: ['sb:S'] }),
    ])
    const weapons = [
      weapon(BASE_WEAPON_ID),
      weapon('w-s', { setBonusIds: options.weaponHasS ? ['sb:S'] : [] }),
    ]
    return buildMaster({ skills: SKILLS, setBonuses: BONUSES, armors, weapons })
  }

  const countS = (build: { armor: Record<string, string | null> }) =>
    PARTS.filter((p) => build.armor[p]?.endsWith('S')).length

  it('Lv1 は2部位以上（5部位から2部位以上を選ぶ 26 通り）', async () => {
    const master = seriesMaster()
    const result = await solveVerified(
      highs,
      master,
      makeRequest(master, { required: [skill('S', 1)] }),
    )
    expect(result.builds).toHaveLength(26)
    expect(result.builds.every((b) => countS(b) >= 2)).toBe(true)
  })

  it('Lv2 は4部位以上（6 通り）で、level と rawLevel は段のレベルと同値', async () => {
    const master = seriesMaster()
    const result = await solveVerified(
      highs,
      master,
      makeRequest(master, { required: [skill('S', 2)] }),
    )
    expect(result.builds).toHaveLength(6)
    expect(result.builds.every((b) => countS(b) >= 4)).toBe(true)
    for (const b of result.builds) {
      expect(b.skills).toEqual([{ skillId: 'S', level: 2, rawLevel: 2 }])
    }
  })

  it('武器の setBonusIds も1部位として数える（マスターの武器）', async () => {
    const master = seriesMaster({ weaponHasS: true })
    const request = makeRequest(master, {
      weapon: { kind: 'master', weaponId: weaponId('w-s') },
      required: [skill('S', 2)],
    })
    const result = await solveVerified(highs, master, request)
    // 武器で1部位 + 防具3部位以上: C(5,3)+C(5,4)+C(5,5)
    expect(result.builds).toHaveLength(16)
    expect(result.builds.every((b) => countS(b) >= 3)).toBe(true)
  })

  it('武器の setBonusIds も1部位として数える（個体差のある武器）', async () => {
    const master = seriesMaster()
    const request = makeRequest(master, {
      weapon: {
        kind: 'custom',
        id: uuid('custom-s'),
        baseWeaponId: weaponId(BASE_WEAPON_ID),
        attack: 1,
        affinity: 0,
        slots: [],
        skills: [],
        setBonusIds: [setBonusId('sb:S')],
      },
      required: [skill('S', 2)],
    })
    const result = await solveVerified(highs, master, request)
    expect(result.builds).toHaveLength(16)
  })

  it('グループスキルも同じ数え方（3部位以上）', async () => {
    const armors = PARTS.flatMap((p) =>
      p === 'legs'
        ? [armor(`${p}0`, p)]
        : [armor(`${p}0`, p), armor(`${p}G`, p, { setBonusIds: ['sb:G'] })],
    )
    const master = buildMaster({ skills: SKILLS, setBonuses: BONUSES, armors })
    const result = await solveVerified(
      highs,
      master,
      makeRequest(master, { required: [skill('G', 1)] }),
    )
    // G を持てるのは4部位。そのうち3部位以上: C(4,3)+C(4,4)
    expect(result.builds).toHaveLength(5)
    expect(result.builds[0]?.skills).toEqual([{ skillId: 'G', level: 1, rawLevel: 1 }])
  })

  it('護石と装飾品のスキル値は部位数に数えない', async () => {
    const armors = plainArmors({
      head: [armor('headS', 'head', { setBonusIds: ['sb:S'] })],
    })
    const master = buildMaster({
      skills: SKILLS,
      setBonuses: BONUSES,
      armors,
      decorations: [decoration('d-s', 'armor', 1, [skill('S', 2)])],
    })
    const request = makeRequest(master, {
      charms: [charm('c-s', { skills: [skill('S', 2)], slots: [slot(1)] })],
      required: [skill('S', 1)],
    })
    const result = await solveVerified(highs, master, request)
    expect(result.status).toBe('infeasible')
  })

  it('段が無い下限・SetBonus が無いスキルは解なし（エラーではない）', async () => {
    // X は series だが SetBonus が無い。S は maxLevel 3 だが段は Lv1 までしか無い
    const master = buildMaster({
      skills: [masterSkill('X', 'series', 2), masterSkill('S', 'series', 3)],
      setBonuses: [setBonus('S', [{ pieces: 2, level: 1 }])],
      armors: PARTS.map((p) => armor(`${p}S`, p, { setBonusIds: ['sb:S'] })),
    })
    for (const required of [skill('X', 1), skill('S', 3)]) {
      const result = await solve(highs, master, makeRequest(master, { required: [required] }))
      expect(result).toMatchObject({ status: 'infeasible', builds: [] })
    }
  })

  it('通常のスキルと同時に必須にできる', async () => {
    const armors = plainArmors({
      head: [armor('headSA', 'head', { setBonusIds: ['sb:S'], skills: [skill('A')] })],
      chest: [armor('chestS', 'chest', { setBonusIds: ['sb:S'] })],
    })
    const master = buildMaster({ skills: SKILLS, setBonuses: BONUSES, armors })
    const request = makeRequest(master, { required: [skill('S', 1), skill('A', 1)] })
    const result = await solveVerified(highs, master, request)
    expect(result.builds).toHaveLength(1)
    expect(result.builds[0]?.skills).toEqual([
      { skillId: 'A', level: 1, rawLevel: 1 },
      { skillId: 'S', level: 1, rawLevel: 1 },
    ])
  })
})

describe('[AC3] 防具の候補・固定・除外', () => {
  const heads = [armor('h1', 'head'), armor('h2', 'head'), armor('h3', 'head')]
  const master = buildMaster({
    skills: SKILLS,
    armors: plainArmors({ head: heads }),
  })

  it('固定されていない部位は全防具から選ぶ', async () => {
    const result = await solveVerified(highs, master, makeRequest(master))
    expect(headsOf(result.builds).toSorted()).toEqual(['h1', 'h2', 'h3'])
  })

  it('固定した部位はその防具に限る', async () => {
    const request = makeRequest(master, { fixedArmor: { head: heads[1]?.id ?? null } })
    const result = await solveVerified(highs, master, request)
    expect(headsOf(result.builds)).toEqual(['h2'])
  })

  it('null 固定の部位には何も付けず、その防具のスキルも得ない', async () => {
    const withSkill = buildMaster({
      skills: SKILLS,
      armors: plainArmors({ head: [armor('hA', 'head', { skills: [skill('A')] })] }),
    })
    const ok = await solveVerified(
      highs,
      withSkill,
      makeRequest(withSkill, { fixedArmor: { head: null } }),
    )
    expect(ok.builds).toHaveLength(1)
    expect(ok.builds[0]?.armor.head).toBeNull()
    const ng = await solveVerified(
      highs,
      withSkill,
      makeRequest(withSkill, { fixedArmor: { head: null }, required: [skill('A')] }),
    )
    expect(ng.status).toBe('infeasible')
  })

  it('全部位が null 固定で護石の候補も空なら、何も付けない1件で終える', async () => {
    const request = makeRequest(master, {
      fixedArmor: { head: null, chest: null, arms: null, waist: null, legs: null },
      objective: { kind: 'maximize', metric: 'defense' },
    })
    const result = await solveVerified(highs, master, request)
    expect(result.status).toBe('optimal')
    expect(result.builds).toHaveLength(1)
    expect(result.builds[0]).toMatchObject({
      armor: { head: null, chest: null, arms: null, waist: null, legs: null },
      charmId: null,
      score: 0,
    })
  })

  it('除外した防具は選ばない', async () => {
    const request = makeRequest(master, { excludedArmorIds: [armorId('h1')] })
    const result = await solveVerified(highs, master, request)
    expect(headsOf(result.builds).toSorted()).toEqual(['h2', 'h3'])
  })

  it('除外で部位の候補が空になったら解なし（エラーではない）', async () => {
    const only = buildMaster({ skills: SKILLS })
    const request = makeRequest(only, { excludedArmorIds: [armorId('head0')] })
    const result = await solve(highs, only, request)
    expect(result).toMatchObject({ status: 'infeasible', builds: [] })
  })
})

describe('[AC4] 護石と装飾品', () => {
  it('護石の候補があればちょうど1つ選び、空なら護石なし', async () => {
    const master = buildMaster({ skills: SKILLS })
    const withCharms = await solveVerified(
      highs,
      master,
      makeRequest(master, { charms: [charm('c1'), charm('c2')] }),
    )
    expect(withCharms.builds.map((b) => b.charmId).toSorted()).toEqual(['c1', 'c2'])
    const without = await solveVerified(highs, master, makeRequest(master))
    expect(without.builds.map((b) => b.charmId)).toEqual([null])
  })

  const decoMaster = (
    headSlots: ReturnType<typeof slot>[],
    weaponSlots: ReturnType<typeof slot>[],
    deco: ReturnType<typeof decoration>,
  ) =>
    buildMaster({
      skills: SKILLS,
      armors: plainArmors({ head: [armor('head1', 'head', { slots: headSlots })] }),
      weapons: [weapon(BASE_WEAPON_ID, { slots: weaponSlots })],
      decorations: [deco],
    })

  it('武器用の珠は武器用のスロットにだけ付く', async () => {
    const deco = decoration('wd', 'weapon', 1, [skill('A')])
    const noWeaponSlot = decoMaster([slot(3)], [], deco)
    const ng = await solveVerified(
      highs,
      noWeaponSlot,
      makeRequest(noWeaponSlot, { required: [skill('A')] }),
    )
    expect(ng.status).toBe('infeasible')
    const withWeaponSlot = decoMaster([slot(3)], [slot(1, 'weapon')], deco)
    const ok = await solveVerified(
      highs,
      withWeaponSlot,
      makeRequest(withWeaponSlot, { required: [skill('A')] }),
    )
    expect(ok.builds[0]?.decorations).toEqual([
      { slot: { owner: 'weapon', index: 0 }, decorationId: 'wd' },
    ])
  })

  it('防具用の珠は防具用のスロットにだけ付く', async () => {
    const deco = decoration('ad', 'armor', 1, [skill('A')])
    const weaponOnly = decoMaster([], [slot(3, 'weapon')], deco)
    const ng = await solveVerified(
      highs,
      weaponOnly,
      makeRequest(weaponOnly, { required: [skill('A')] }),
    )
    expect(ng.status).toBe('infeasible')
  })

  it('珠の Lv 以上のスロットにだけ付く（Lv3 の珠は Lv2 のスロットに入らない）', async () => {
    const deco = decoration('ad3', 'armor', 3, [skill('A')])
    const small = decoMaster([slot(2)], [], deco)
    const ng = await solveVerified(highs, small, makeRequest(small, { required: [skill('A')] }))
    expect(ng.status).toBe('infeasible')
    const big = decoMaster([slot(4)], [], deco)
    const ok = await solveVerified(highs, big, makeRequest(big, { required: [skill('A')] }))
    expect(ok.builds[0]?.decorations).toHaveLength(1)
  })

  it('複数の装飾品を複数の部位・護石のスロットに付けてスキルの下限を満たす', async () => {
    const master = buildMaster({
      skills: [...SKILLS, masterSkill('C', 'armor', 5)],
      armors: plainArmors({
        head: [armor('head1', 'head', { slots: [slot(1), slot(1)] })],
        chest: [armor('chest1', 'chest', { slots: [slot(1)] })],
      }),
      decorations: [decoration('ad1', 'armor', 1, [skill('C')])],
    })
    const request = makeRequest(master, {
      charms: [charm('c1', { slots: [slot(1)] })],
      required: [skill('C', 4)],
    })
    const result = await solveVerified(highs, master, request)
    expect(result.builds).toHaveLength(1)
    expect(result.builds[0]?.decorations).toHaveLength(4)
    expect(result.builds[0]?.freeSlots).toEqual([])
  })
})

describe('[AC5] 目的関数', () => {
  const heads = [armor('h-low', 'head', { defense: 10 }), armor('h-hi', 'head', { defense: 50 })]

  it('defense は防御力の合計を最大にする（件数を増やすと降順に並ぶ）', async () => {
    const master = buildMaster({ skills: SKILLS, armors: plainArmors({ head: heads }) })
    const request = makeRequest(master, {
      objective: { kind: 'maximize', metric: 'defense' },
    })
    const result = await solveVerified(highs, master, request)
    expect(result.status).toBe('optimal')
    expect(result.builds.map((b) => [b.armor.head, b.score])).toEqual([
      ['h-hi', 90],
      ['h-low', 50],
    ])
  })

  it('defense が同点なら防具用の空きスロットの Lv の合計が大きい構成を選ぶ', async () => {
    const master = buildMaster({
      skills: SKILLS,
      armors: plainArmors({
        head: [
          armor('h-a', 'head', { defense: 50, slots: [slot(1)] }),
          armor('h-b', 'head', { defense: 50, slots: [slot(3)] }),
          armor('h-low', 'head', { defense: 10, slots: [slot(4)] }),
        ],
      }),
    })
    const request = makeRequest(master, {
      maxResults: 3,
      objective: { kind: 'maximize', metric: 'defense' },
    })
    const result = await solveVerified(highs, master, request)
    expect(headsOf(result.builds)).toEqual(['h-b', 'h-a', 'h-low'])
  })

  it('freeSlots は防具用の空き Lv の合計を最大にし、種別ごとの合計を分けて返す', async () => {
    const master = buildMaster({
      skills: SKILLS,
      armors: plainArmors({
        head: [
          armor('h-s3', 'head', { slots: [slot(3)] }),
          armor('h-s1', 'head', { slots: [slot(1)] }),
        ],
      }),
      weapons: [weapon(BASE_WEAPON_ID, { slots: [slot(2, 'weapon')] })],
    })
    const request = makeRequest(master, {
      maxResults: 1,
      objective: { kind: 'maximize', metric: 'freeSlots' },
    })
    const result = await solveVerified(highs, master, request)
    expect(result.builds[0]).toMatchObject({
      armor: { head: 'h-s3' },
      score: 3,
      freeSlotLevels: { armor: 3, weapon: 2 },
    })
  })

  it('freeSlots が同点なら武器用の空きスロットの Lv の合計が大きい構成を選ぶ', async () => {
    const master = buildMaster({ skills: SKILLS })
    const request = makeRequest(master, {
      charms: [
        charm('c-w1', { slots: [slot(2), slot(1, 'weapon')] }),
        charm('c-w3', { slots: [slot(2), slot(3, 'weapon')] }),
      ],
      maxResults: 1,
      objective: { kind: 'maximize', metric: 'freeSlots' },
    })
    const result = await solveVerified(highs, master, request)
    expect(result.builds[0]).toMatchObject({
      charmId: 'c-w3',
      freeSlotLevels: { armor: 2, weapon: 3 },
    })
  })

  it('freeSlots は装飾品が使ったスロットを空きに数えず、小さいスロットから使う', async () => {
    const master = buildMaster({
      skills: SKILLS,
      armors: plainArmors({
        head: [
          armor('h-big', 'head', { slots: [slot(3), slot(1)] }),
          armor('h-small', 'head', { slots: [slot(1)] }),
        ],
      }),
      decorations: [decoration('ad1', 'armor', 1, [skill('A')])],
    })
    const request = makeRequest(master, {
      required: [skill('A')],
      maxResults: 1,
      objective: { kind: 'maximize', metric: 'freeSlots' },
    })
    const result = await solveVerified(highs, master, request)
    expect(result.builds[0]).toMatchObject({
      armor: { head: 'h-big' },
      decorations: [{ slot: { owner: 'head', index: 1 }, decorationId: 'ad1' }],
      freeSlots: [{ owner: 'head', index: 0 }],
      freeSlotLevels: { armor: 3, weapon: 0 },
      score: 3,
    })
  })
})

describe('[AC6] 同点のあいだの選び方と不要な装飾品', () => {
  it('feasible でも同点なら防具用、次に武器用の空きスロットの Lv の合計が大きい構成を選ぶ', async () => {
    const armorMaster = buildMaster({
      skills: SKILLS,
      armors: plainArmors({
        head: [
          armor('h-a', 'head', { slots: [slot(1)] }),
          armor('h-b', 'head', { slots: [slot(3)] }),
        ],
      }),
    })
    const byArmor = await solveVerified(
      highs,
      armorMaster,
      makeRequest(armorMaster, { maxResults: 1 }),
    )
    expect(headsOf(byArmor.builds)).toEqual(['h-b'])

    const master = buildMaster({ skills: SKILLS })
    const byWeapon = await solveVerified(
      highs,
      master,
      makeRequest(master, {
        charms: [
          charm('c1', { slots: [slot(1, 'weapon')] }),
          charm('c3', { slots: [slot(3, 'weapon')] }),
        ],
        maxResults: 1,
      }),
    )
    expect(byWeapon.builds.map((b) => b.charmId)).toEqual(['c3'])
  })

  it('必須スキルが防具だけで足りるなら、使える装飾品があっても付けない', async () => {
    const master = buildMaster({
      skills: SKILLS,
      armors: plainArmors({
        head: [armor('h-a', 'head', { skills: [skill('A')], slots: [slot(3), slot(3)] })],
      }),
      decorations: [decoration('ad1', 'armor', 1, [skill('A')])],
    })
    const request = makeRequest(master, { required: [skill('A')] })
    const result = await solveVerified(highs, master, request)
    expect(result.builds[0]?.decorations).toEqual([])
    expect(result.builds[0]?.freeSlots).toHaveLength(2)
  })

  it('必須スキルを持たない装飾品は付けない', async () => {
    const master = buildMaster({
      skills: SKILLS,
      armors: plainArmors({ head: [armor('h-a', 'head', { slots: [slot(3)] })] }),
      decorations: [decoration('b-only', 'armor', 1, [skill('B')])],
    })
    const result = await solveVerified(highs, master, makeRequest(master))
    expect(result.builds[0]?.decorations).toEqual([])
  })
})

describe('[AC7] 列挙・重複なし・状態', () => {
  const master = buildMaster({
    skills: SKILLS,
    armors: plainArmors({
      head: ['h1', 'h2', 'h3', 'h4'].map((id, i) => armor(id, 'head', { defense: 10 + i })),
    }),
  })

  it('件数の上限に達するまで列挙し、feasible は状態 feasible', async () => {
    const result = await solveVerified(highs, master, makeRequest(master, { maxResults: 2 }))
    expect(result.status).toBe('feasible')
    expect(result.builds).toHaveLength(2)
  })

  it('解が尽きるまで列挙し、防具と護石の組は重ならない', async () => {
    const request = makeRequest(master, {
      charms: [charm('c1'), charm('c2'), charm('c3')],
    })
    const result = await solveVerified(highs, master, request)
    expect(result.builds).toHaveLength(12) // 防具4 x 護石3
  })

  it('maximize で1件以上あれば optimal、主目的は降順に並ぶ', async () => {
    const request = makeRequest(master, { objective: { kind: 'maximize', metric: 'defense' } })
    const result = await solveVerified(highs, master, request)
    expect(result.status).toBe('optimal')
    const scores = result.builds.map((b) => b.score ?? 0)
    expect(scores).toEqual(scores.toSorted((a, b) => b - a))
    expect(scores).toHaveLength(4)
  })

  it('1件も無ければ infeasible', async () => {
    const result = await solve(
      highs,
      master,
      makeRequest(master, {
        required: [skill('A')],
        objective: { kind: 'maximize', metric: 'defense' },
      }),
    )
    expect(result).toMatchObject({ status: 'infeasible', builds: [] })
  })
})

describe('[AC8] 構成の出力', () => {
  it('装飾品を付けたスロット（持ち主と添字）・空きスロット・発動スキルを返す', async () => {
    const master = buildMaster({
      skills: SKILLS,
      armors: plainArmors({ head: [armor('head1', 'head', { slots: [slot(2)] })] }),
      weapons: [weapon(BASE_WEAPON_ID, { slots: [slot(1, 'weapon'), slot(3, 'weapon')] })],
      decorations: [
        decoration('wd', 'weapon', 1, [skill('B')]),
        decoration('ad', 'armor', 2, [skill('A')]),
      ],
    })
    const request = makeRequest(master, {
      charms: [charm('c1', { slots: [slot(1)] })],
      required: [skill('A'), skill('B')],
    })
    const result = await solveVerified(highs, master, request)
    const build = result.builds[0]
    const byKey = (a: { owner: string; index: number }, b: { owner: string; index: number }) =>
      `${a.owner}${a.index}`.localeCompare(`${b.owner}${b.index}`)
    expect(
      build?.decorations.map((d) => [d.slot.owner, d.slot.index, d.decorationId]).toSorted(),
    ).toEqual([
      ['head', 0, 'ad'],
      ['weapon', 0, 'wd'],
    ])
    expect(build?.freeSlots.toSorted(byKey)).toEqual([
      { owner: 'charm', index: 0 },
      { owner: 'weapon', index: 1 },
    ])
    expect(build?.skills).toEqual([
      { skillId: 'A', level: 1, rawLevel: 1 },
      { skillId: 'B', level: 1, rawLevel: 1 },
    ])
    expect(build?.armor).toEqual({
      head: 'head1',
      chest: 'chest0',
      arms: 'arms0',
      waist: 'waist0',
      legs: 'legs0',
    })
  })

  it('発動スキルは最大レベルで頭打ちした値と頭打ち前の合計を分けて返す', async () => {
    const master = buildMaster({
      skills: SKILLS,
      armors: plainArmors({
        head: [armor('h', 'head', { skills: [skill('A', 2)] })],
        chest: [armor('c', 'chest', { skills: [skill('A', 2)] })],
      }),
    })
    const result = await solveVerified(
      highs,
      master,
      makeRequest(master, { required: [skill('A', 3)] }),
    )
    expect(result.builds[0]?.skills).toEqual([{ skillId: 'A', level: 3, rawLevel: 4 }])
  })

  it('レベル 0 のスキルは入れない', async () => {
    const master = buildMaster({ skills: SKILLS })
    const result = await solveVerified(highs, master, makeRequest(master))
    expect(result.builds[0]?.skills).toEqual([])
  })

  it('freeSlotLevels は freeSlots のときだけ、score は maximize のときだけ入る', async () => {
    const master = buildMaster({ skills: SKILLS })
    const feasible = await solve(highs, master, makeRequest(master))
    const defense = await solve(
      highs,
      master,
      makeRequest(master, { objective: { kind: 'maximize', metric: 'defense' } }),
    )
    const free = await solve(
      highs,
      master,
      makeRequest(master, { objective: { kind: 'maximize', metric: 'freeSlots' } }),
    )
    expect(feasible.builds[0]).not.toHaveProperty('score')
    expect(feasible.builds[0]).not.toHaveProperty('freeSlotLevels')
    expect(defense.builds[0]).toHaveProperty('score', 50)
    expect(defense.builds[0]).not.toHaveProperty('freeSlotLevels')
    expect(free.builds[0]).toMatchObject({ score: 0, freeSlotLevels: { armor: 0, weapon: 0 } })
  })
})

describe('[AC10] 時間の上限（偽の時計）', () => {
  const master = buildMaster({
    skills: SKILLS,
    armors: plainArmors({ head: ['h1', 'h2', 'h3', 'h4'].map((id) => armor(id, 'head')) }),
  })
  const request = (timeoutMs: number): SolverRequest => makeRequest(master, { timeoutMs })

  it('求解の合間で上限を超えたら、それまでの構成を timeout で返す', async () => {
    const clock = fakeClock(100) // 求解の前に 100ms 進む
    const result = await solveBuilds(highs, master, request(250), clock.options)
    // 100ms・200ms の求解は上限内、300ms で打ち切る
    expect(result.status).toBe('timeout')
    expect(result.builds).toHaveLength(2)
  })

  it('1件も見つからないうちに超えたら、infeasible ではなく timeout で空の構成を返す', async () => {
    const clock = fakeClock(100)
    const result = await solveBuilds(highs, master, request(50), clock.options)
    expect(result).toMatchObject({ status: 'timeout', builds: [] })
  })

  it('上限内に尽きれば timeout にならない', async () => {
    const clock = fakeClock(1)
    const result = await solveBuilds(highs, master, request(1_000_000), clock.options)
    expect(result.status).toBe('feasible')
    expect(result.builds).toHaveLength(4)
  })
})

describe('[AC11][AC12] 進捗とキャンセル（solveBuilds）', () => {
  const master = buildMaster({
    skills: SKILLS,
    armors: plainArmors({ head: ['h1', 'h2', 'h3'].map((id) => armor(id, 'head')) }),
  })

  it('構成を1件見つけるごとに件数を進捗として通知する', async () => {
    const found: number[] = []
    const clock = fakeClock(0, { onProgress: (n) => found.push(n) })
    const result = await solveBuilds(highs, master, makeRequest(master), clock.options)
    expect(found).toEqual([1, 2, 3])
    expect(result.builds).toHaveLength(3)
  })

  it('最初の求解の前にキャンセルされていれば、構成を返さずに SolveCancelledError', async () => {
    const clock = fakeClock(0, { isCancelled: () => true })
    await expect(
      solveBuilds(highs, master, makeRequest(master), clock.options),
    ).rejects.toBeInstanceOf(SolveCancelledError)
  })

  it('求解の合間でキャンセルされたら、次の求解に進まず SolveCancelledError', async () => {
    let cancelled = false
    const found: number[] = []
    const clock = fakeClock(0, {
      isCancelled: () => cancelled,
      onProgress: (n) => {
        found.push(n)
        cancelled = true
      },
    })
    await expect(
      solveBuilds(highs, master, makeRequest(master), clock.options),
    ).rejects.toBeInstanceOf(SolveCancelledError)
    expect(found).toEqual([1])
  })
})
