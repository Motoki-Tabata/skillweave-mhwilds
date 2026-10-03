import highsLoader, { type Highs } from 'highs'
import { beforeAll, describe, expect, it } from 'vitest'
import { searchBuilds } from '../main/searchBuilds'
import type { ArmorPart, SearchInput } from '../main/types'
import { armor, baseArmors, charm, decoration, input, skill, slot } from './support/builders'
import {
  generateData,
  makeFeasibleRequired,
  makeInfeasibleRequired,
  PARTS,
  toInput,
} from './support/syntheticData'
import { armorCharmKey, verifyBuild } from './support/verifyBuild'

let highs: Highs

beforeAll(async () => {
  highs = await highsLoader()
})

describe('searchBuilds: 手作りデータ', () => {
  // 受入基準 1
  it('[AC1] 必須スキルの合計レベルが下限以上の構成だけを返す（防御力が高くても下限未満は選ばない）', () => {
    const result = searchBuilds(
      highs,
      input({
        required: [skill('X', 2)],
        armors: baseArmors({
          head: [
            armor('head-low', 'head', { skills: [skill('X', 1)], defense: 10 }),
            armor('head-high', 'head', { defense: 99 }),
          ],
          chest: [armor('chest1', 'chest', { skills: [skill('X', 1)] })],
        }),
      }),
    )
    expect(result.status).toBe('optimal')
    expect(result.builds).toHaveLength(1)
    expect(result.builds[0]?.armor.head).toBe('head-low')
  })

  it('[AC1] 武器・護石・防具のスキルを合算して下限と比べる', () => {
    const data = input({
      required: [skill('X', 3)],
      weapon: { slots: [], skills: [skill('X', 1)] },
      armors: baseArmors({ head: [armor('head1', 'head', { skills: [skill('X', 1)] })] }),
      charms: [charm('c-none'), charm('c-x', { skills: [skill('X', 1)] })],
    })
    const result = searchBuilds(highs, data)
    expect(result.status).toBe('optimal')
    expect(result.builds.map((b) => b.charmId)).toEqual(['c-x'])
  })

  // 受入基準 2
  it('[AC2] 武器用の装飾品は武器のスロットにだけ入る（防具のスロットでは足りない）', () => {
    const decos = [decoration('wd', 'weapon', 1, [skill('X')])]
    const base = {
      required: [skill('X')],
      decorations: decos,
      armors: baseArmors({ head: [armor('head1', 'head', { slots: [slot(3)] })] }),
    }
    expect(searchBuilds(highs, input({ ...base })).status).toBe('infeasible')
    const withWeaponSlot = searchBuilds(
      highs,
      input({ ...base, weapon: { slots: [slot(1, 'weapon')], skills: [] } }),
    )
    expect(withWeaponSlot.status).toBe('optimal')
    expect(withWeaponSlot.builds[0]?.decorations).toEqual([{ decorationId: 'wd', count: 1 }])
  })

  it('[AC2] 防具用の装飾品は防具（と護石）のスロットにだけ入る（武器のスロットでは足りない）', () => {
    const base = {
      required: [skill('X')],
      decorations: [decoration('ad', 'armor', 1, [skill('X')])],
      weapon: { slots: [slot(3, 'weapon')], skills: [] },
    }
    expect(searchBuilds(highs, input({ ...base })).status).toBe('infeasible')
    const onCharm = searchBuilds(
      highs,
      input({ ...base, charms: [charm('c1', { slots: [slot(1)] })] }),
    )
    expect(onCharm.status).toBe('optimal')
  })

  it('[AC2] 装飾品はスロット Lv 以下のものだけを付けられる（Lv2 の装飾品は Lv1 のスロットに入らない）', () => {
    const decos = [decoration('d2', 'armor', 2, [skill('X')])]
    const lv1 = baseArmors({ head: [armor('head1', 'head', { slots: [slot(1), slot(1)] })] })
    expect(
      searchBuilds(highs, input({ required: [skill('X')], decorations: decos, armors: lv1 }))
        .status,
    ).toBe('infeasible')
    const lv2 = baseArmors({ head: [armor('head1', 'head', { slots: [slot(2)] })] })
    expect(
      searchBuilds(highs, input({ required: [skill('X')], decorations: decos, armors: lv2 }))
        .status,
    ).toBe('optimal')
  })

  it('[AC2] 小さい装飾品は大きいスロットに入るが、スロット数を超えては付けられない', () => {
    const decos = [decoration('d1', 'armor', 1, [skill('X')])]
    const armors = baseArmors({ head: [armor('head1', 'head', { slots: [slot(3), slot(1)] })] })
    const two = searchBuilds(
      highs,
      input({ required: [skill('X', 2)], decorations: decos, armors }),
    )
    expect(two.builds[0]?.decorations).toEqual([{ decorationId: 'd1', count: 2 }])
    expect(
      searchBuilds(highs, input({ required: [skill('X', 3)], decorations: decos, armors })).status,
    ).toBe('infeasible')
  })

  // 受入基準 3
  it('[AC3] 防御力の合計が最大の構成を最初に返し、以降は防御力が増えない順に返す', () => {
    const data = input({
      armors: baseArmors({
        head: [armor('h1', 'head', { defense: 10 }), armor('h2', 'head', { defense: 30 })],
        legs: [armor('l1', 'legs', { defense: 20 }), armor('l2', 'legs', { defense: 5 })],
      }),
    })
    const result = searchBuilds(highs, data)
    expect(result.builds.map((b) => b.defense)).toEqual([80, 65, 60, 45])
    expect(result.builds[0]?.armor.head).toBe('h2')
    expect(result.builds[0]?.armor.legs).toBe('l1')
  })

  // 受入基準 4・5
  describe('[AC4][AC5] 列挙', () => {
    const manyArmors = baseArmors({
      head: [armor('h1', 'head', { defense: 1 }), armor('h2', 'head', { defense: 2 })],
      chest: [armor('c1', 'chest', { defense: 1 }), armor('c2', 'chest', { defense: 2 })],
      arms: [armor('a1', 'arms', { defense: 1 }), armor('a2', 'arms', { defense: 2 })],
      waist: [armor('w1', 'waist', { defense: 1 }), armor('w2', 'waist', { defense: 2 })],
      legs: [armor('l1', 'legs', { defense: 1 }), armor('l2', 'legs', { defense: 2 })],
    })

    it('[AC4] 解が 32 通りあるとき 30 件で打ち切る（既定）', () => {
      const result = searchBuilds(highs, input({ armors: manyArmors }))
      expect(result.status).toBe('optimal')
      expect(result.builds).toHaveLength(30)
    })

    it('[AC4] maxResults で打ち切る件数を変えられる', () => {
      expect(searchBuilds(highs, input({ armors: manyArmors, maxResults: 5 })).builds).toHaveLength(
        5,
      )
    })

    it('[AC4] 解が 30 件未満なら尽きるまで列挙し、全組み合わせを過不足なく返す', () => {
      const data = input({
        armors: baseArmors({
          head: [armor('h1', 'head'), armor('h2', 'head')],
          chest: [armor('c1', 'chest'), armor('c2', 'chest')],
        }),
        charms: [charm('k1'), charm('k2'), charm('k3')],
      })
      const result = searchBuilds(highs, data)
      expect(result.status).toBe('optimal')
      expect(result.builds).toHaveLength(12)
      const expected = new Set<string>()
      for (const h of ['h1', 'h2'])
        for (const c of ['c1', 'c2'])
          for (const k of ['k1', 'k2', 'k3']) expected.add(`${h},${c},arms1,waist1,legs1|${k}`)
      expect(new Set(result.builds.map(armorCharmKey))).toEqual(expected)
    })

    it('[AC4] 下限を満たす組み合わせだけを数え上げる（総当たりと一致）', () => {
      const data = input({
        required: [skill('X', 2)],
        armors: baseArmors({
          head: [
            armor('h1', 'head', { skills: [skill('X')], defense: 30 }),
            armor('h2', 'head', { defense: 50 }),
          ],
          chest: [
            armor('c1', 'chest', { skills: [skill('X')], defense: 20 }),
            armor('c2', 'chest', { skills: [skill('X')], defense: 40 }),
          ],
        }),
        charms: [
          charm('k1', { skills: [skill('X')] }),
          charm('k2', { skills: [skill('X')] }),
          charm('k3'),
        ],
      })
      const levelOf = (s: { skills: { level: number }[] }) =>
        s.skills.reduce((sum, v) => sum + v.level, 0)
      const expected: { key: string; defense: number }[] = []
      const byPart = (p: ArmorPart) => data.armors.filter((a) => a.part === p)
      for (const h of byPart('head'))
        for (const c of byPart('chest'))
          for (const k of data.charms)
            if (levelOf(h) + levelOf(c) + levelOf(k) >= 2)
              expected.push({
                key: `${h.id},${c.id},arms1,waist1,legs1|${k.id}`,
                defense: h.defense + c.defense + 30,
              })
      const result = searchBuilds(highs, data)
      expect(result.builds).toHaveLength(expected.length)
      expect(new Set(result.builds.map(armorCharmKey))).toEqual(new Set(expected.map((e) => e.key)))
      expect(result.builds.map((b) => b.defense)).toEqual(
        expected.map((e) => e.defense).sort((a, b) => b - a),
      )
    })

    it('[AC5] 1回の検索で防具と護石の組が同じ構成を2回返さない（装飾品の違いだけの構成も含めない）', () => {
      const data = input({
        required: [skill('X')],
        armors: baseArmors({ head: [armor('h1', 'head', { slots: [slot(3), slot(3)] })] }),
        decorations: [
          decoration('d1', 'armor', 1, [skill('X')]),
          decoration('d2', 'armor', 2, [skill('X')]),
        ],
        charms: [charm('k1'), charm('k2')],
      })
      const result = searchBuilds(highs, data)
      const keys = result.builds.map(armorCharmKey)
      expect(keys).toHaveLength(2)
      expect(new Set(keys).size).toBe(keys.length)
      const big = searchBuilds(highs, input({ armors: manyArmors }))
      expect(new Set(big.builds.map(armorCharmKey)).size).toBe(big.builds.length)
    })
  })

  // 受入基準 6
  describe('[AC6] 解なし', () => {
    it('どの組み合わせでも下限に届かないとき、構成を返さず infeasible を返す', () => {
      const result = searchBuilds(
        highs,
        input({
          required: [skill('X', 2)],
          armors: baseArmors({ head: [armor('h1', 'head', { skills: [skill('X')] })] }),
        }),
      )
      expect(result).toEqual({ status: 'infeasible', builds: [] })
    })

    it('必須スキルを持つ候補がそもそも無いとき infeasible を返す', () => {
      expect(searchBuilds(highs, input({ required: [skill('Z')] }))).toEqual({
        status: 'infeasible',
        builds: [],
      })
    })

    it('部位のどれかの候補が空なら infeasible を返す', () => {
      const armors = baseArmors().filter((a) => a.part !== 'waist')
      expect(searchBuilds(highs, input({ armors }))).toEqual({ status: 'infeasible', builds: [] })
    })
  })
})

describe('searchBuilds: 合成データ', () => {
  const data = generateData(20261003)
  const keys = (r: SearchInput, max: number) => searchBuilds(highs, { ...r, maxResults: max })

  // 受入基準 7（plan 決定事項 11 の独立な検算）
  it.each([3, 6, 10])(
    '[AC7] 解あり（必須スキル %i 個）で返した全構成が、独立な検算で下限とスロットを満たす',
    (k) => {
      const required = makeFeasibleRequired(data, 100 + k, k)
      const search = toInput(data, required)
      const result = keys(search, 30)
      expect(result.status).toBe('optimal')
      expect(result.builds.length).toBeGreaterThan(0)
      for (const build of result.builds) expect(verifyBuild(search, build)).toEqual([])
      expect(new Set(result.builds.map(armorCharmKey)).size).toBe(result.builds.length)
    },
  )

  it('[AC7] 検算が下限未満を検出できる（検算自体の確認）', () => {
    const required = makeFeasibleRequired(data, 103, 3)
    const search = toInput(data, required)
    const build = searchBuilds(highs, { ...search, maxResults: 1 }).builds[0]
    if (build === undefined) throw new Error('構成が見つからない')
    const stricter = { ...search, required: required.map((r) => ({ ...r, level: r.level + 100 })) }
    expect(verifyBuild(stricter, build)).not.toEqual([])
  })

  it('[AC7] 検算がスロットに収まらない構成を検出できる（検算自体の確認）', () => {
    const required = makeFeasibleRequired(data, 103, 3)
    const search = toInput(data, required)
    const build = searchBuilds(highs, { ...search, maxResults: 1 }).builds[0]
    const first = build?.decorations[0]
    if (build === undefined || first === undefined)
      throw new Error('装飾品を使う構成が見つからない')
    // 全スロット数を超える個数にすれば、どの割り当てでも置けない
    const overfull = {
      ...build,
      decorations: [{ ...first, count: first.count + 100 }, ...build.decorations.slice(1)],
    }
    expect(verifyBuild(search, build)).toEqual([])
    expect(verifyBuild(search, overfull).some((p) => p.includes('置けない'))).toBe(true)
  })

  it.each([3, 6, 10])('[AC6] 解なし（必須スキル %i 個）は構成を返さず infeasible を返す', (k) => {
    const required = makeInfeasibleRequired(data, 200 + k, k)
    expect(keys(toInput(data, required), 30)).toEqual({ status: 'infeasible', builds: [] })
  })

  it('[AC2] 防具の部位は5つそろっている', () => {
    const result = keys(toInput(data, makeFeasibleRequired(data, 103, 3)), 1)
    expect(Object.keys(result.builds[0]?.armor ?? {}).sort()).toEqual([...PARTS].sort())
  })
})
