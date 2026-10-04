import highsLoader, { type Highs } from 'highs'
import type { MasterVersion } from '@swv/data'
import { beforeAll, describe, expect, it } from 'vitest'
import { InvalidRequestError } from '../main/errors'
import type { SolverRequest } from '../main/request'
import {
  armor,
  armorId,
  BASE_WEAPON_ID,
  buildMaster,
  charm,
  makeRequest,
  masterSkill,
  plainArmors,
  setBonus,
  setBonusId,
  skill,
  uuid,
  weaponId,
} from './support/builders'
import { solve } from './support/harness'

let highs: Highs

beforeAll(async () => {
  highs = await highsLoader()
})

const master = buildMaster({
  skills: [masterSkill('A'), masterSkill('S', 'series', 2)],
  setBonuses: [setBonus('S', [{ pieces: 2, level: 1 }])],
  armors: plainArmors({ head: [armor('h1', 'head'), armor('h2', 'head')] }),
})

/** 要求を変えて解き、InvalidRequestError で拒否され、message に手がかりが入ることを確かめる */
async function expectInvalid(overrides: Partial<SolverRequest>, messagePart: string) {
  const rejected = solve(highs, master, makeRequest(master, overrides))
  await expect(rejected).rejects.toBeInstanceOf(InvalidRequestError)
  await expect(rejected).rejects.toThrow(messagePart)
}

describe('[AC9] 不正な要求はエラー（解なしとは分ける）', () => {
  it('masterVersion の不一致', async () => {
    await expectInvalid({ masterVersion: 'other' as MasterVersion }, 'masterVersion')
  })

  it('マスターに無い武器（マスターの武器・個体差のある武器の基の武器）', async () => {
    await expectInvalid({ weapon: { kind: 'master', weaponId: weaponId('nope') } }, '武器')
    await expectInvalid(
      {
        weapon: {
          kind: 'custom',
          id: uuid('c'),
          baseWeaponId: weaponId('nope'),
          attack: 1,
          affinity: 0,
          slots: [],
          skills: [],
          setBonusIds: [],
        },
      },
      '基の武器',
    )
  })

  it('マスターに無いスキル（必須・護石・個体差のある武器）', async () => {
    await expectInvalid({ required: [skill('nope')] }, '必須スキル')
    await expectInvalid({ charms: [charm('c', { skills: [skill('nope')] })] }, '護石')
    await expectInvalid(
      {
        weapon: {
          kind: 'custom',
          id: uuid('c'),
          baseWeaponId: weaponId(BASE_WEAPON_ID),
          attack: 1,
          affinity: 0,
          slots: [],
          skills: [skill('nope')],
          setBonusIds: [],
        },
      },
      '個体差のある武器',
    )
  })

  it('マスターに無いシリーズ／グループスキルを持つ個体差のある武器', async () => {
    await expectInvalid(
      {
        weapon: {
          kind: 'custom',
          id: uuid('c'),
          baseWeaponId: weaponId(BASE_WEAPON_ID),
          attack: 1,
          affinity: 0,
          slots: [],
          skills: [],
          setBonusIds: [setBonusId('sb:nope')],
        },
      },
      'シリーズ／グループスキル',
    )
  })

  it('マスターに無い防具の固定・除外', async () => {
    await expectInvalid({ fixedArmor: { head: armorId('nope') } }, '固定の防具')
    await expectInvalid({ excludedArmorIds: [armorId('nope')] }, '除外の防具')
  })

  it('部位の違う防具の固定', async () => {
    await expectInvalid({ fixedArmor: { chest: armorId('h1') } }, '部位')
  })

  it('同じ防具の固定と除外', async () => {
    await expectInvalid(
      { fixedArmor: { head: armorId('h1') }, excludedArmorIds: [armorId('h1')] },
      '固定と除外',
    )
  })

  it('最大レベルを超える下限・1 未満・整数でない下限', async () => {
    await expectInvalid({ required: [skill('A', 4)] }, '最大レベル')
    await expectInvalid({ required: [skill('S', 3)] }, '最大レベル')
    await expectInvalid({ required: [skill('A', 0)] }, '下限')
    await expectInvalid({ required: [skill('A', 1.5)] }, '下限')
  })

  it.each([0, -1, 31, 1.5, Number.NaN])('maxResults が 1〜30 の整数でない（%s）', async (value) => {
    await expectInvalid({ maxResults: value }, 'maxResults')
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'timeoutMs が 0 より大きい有限の数でない（%s）',
    async (value) => {
      await expectInvalid({ timeoutMs: value }, 'timeoutMs')
    },
  )

  it('目的関数が expectedDamage', async () => {
    await expectInvalid(
      { objective: { kind: 'maximize', metric: 'expectedDamage' } },
      'expectedDamage',
    )
  })

  it('境界の値（maxResults 1 と 30・最大レベルちょうどの下限）は不正ではない', async () => {
    const statuses: string[] = []
    for (const overrides of [
      { maxResults: 1 },
      { maxResults: 30 },
      { required: [skill('A', 3)] },
    ]) {
      const result = await solve(highs, master, makeRequest(master, overrides))
      statuses.push(result.status)
    }
    expect(statuses).toEqual(['feasible', 'feasible', 'infeasible'])
  })

  it('候補の絞り込みの結果として満たせないものは、エラーではなく解なし', async () => {
    const cases: Partial<SolverRequest>[] = [
      { required: [skill('A', 1)] }, // 誰も持たないスキル
      { excludedArmorIds: [armorId('h1'), armorId('h2')] }, // 部位の候補が空
      { fixedArmor: { head: null }, required: [skill('S', 1)] }, // 部位数が足りない
    ]
    for (const overrides of cases) {
      const result = await solve(highs, master, makeRequest(master, overrides))
      expect(result).toMatchObject({ status: 'infeasible', builds: [] })
    }
  })
})
