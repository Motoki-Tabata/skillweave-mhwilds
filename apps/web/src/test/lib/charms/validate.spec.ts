import { describe, expect, it } from 'vitest'
import type { Slot } from '@swv/data'
import { eligibleSolverCharms } from '@/lib/charms/eligible'
import type { StoredCharm } from '@/lib/charms/storage'
import type { CharmDraft } from '@/lib/charms/types'
import { charmEligibility, validateCharm } from '@/lib/charms/validate'
import { NAMES, makeBundle, sk } from '../../support/fixtures'

const ctx = { bundle: makeBundle(), nameOf: (id: string) => NAMES[id] ?? id }
const slot = (target: Slot['target'], level: Slot['level']): Slot => ({ target, level })
const draft = (over: Partial<CharmDraft>): CharmDraft => ({
  rarity: 8,
  skills: [null, null, null],
  slots: [null, null, null],
  ...over,
})
const messages = (d: CharmDraft) =>
  validateCharm(d, ctx).map((e) => [e.field, e.index, e.message] as const)

// 受入基準 1・5（入力の範囲と構造上の制約）
describe('validateCharm', () => {
  it('制約を満たす護石・空の護石（レア度だけ）はエラーなし', () => {
    expect(validateCharm(draft({}), ctx)).toEqual([])
    expect(
      validateCharm(
        draft({
          skills: [{ skillId: sk('a1'), level: 3 }, { skillId: sk('w1'), level: 5 }, null],
          slots: [slot('weapon', 1), slot('armor', 3), null],
        }),
        ctx,
      ),
    ).toEqual([])
  })

  it('レア度の未選択・範囲外', () => {
    expect(messages(draft({ rarity: null }))).toEqual([['rarity', 0, 'レア度を選んでください。']])
    expect(messages(draft({ rarity: 4 }))).toEqual([
      ['rarity', 0, 'レア度は 5〜8 から選んでください。'],
    ])
    expect(messages(draft({ rarity: 9 }))).toHaveLength(1)
  })

  it('同じスキルは後の行に、前の行の番号つきで出す', () => {
    expect(
      messages(
        draft({
          skills: [
            { skillId: sk('a1'), level: 1 },
            { skillId: sk('a2'), level: 1 },
            { skillId: sk('a1'), level: 2 },
          ],
        }),
      ),
    ).toEqual([['skills', 2, 'スキル1と同じスキルです。別のスキルを選ぶか空にしてください。']])
  })

  it('空の行の下にスキルがあれば、空の行に出す', () => {
    expect(messages(draft({ skills: [null, { skillId: sk('a1'), level: 1 }, null] }))).toEqual([
      ['skills', 0, 'スキル1が空です。スキルは上の行から順に入力してください。'],
    ])
  })

  it('空のスロットの下にスロットがあれば、空の行に出す', () => {
    expect(messages(draft({ slots: [slot('weapon', 1), null, slot('armor', 1)] }))).toEqual([
      ['slots', 1, 'スロット2が「なし」です。スロットは上の行から順に入力してください。'],
    ])
  })

  it('現行のマスターに無いスキル', () => {
    expect(messages(draft({ skills: [{ skillId: sk('zzz'), level: 1 }, null, null] }))).toEqual([
      ['skills', 0, 'このスキルは現行のマスターにありません。別のスキルを選ぶか空にしてください。'],
    ])
  })

  it('シリーズ・グループスキルは拒否する', () => {
    expect(messages(draft({ skills: [{ skillId: sk('s1'), level: 1 }, null, null] }))[0][1]).toBe(0)
    expect(
      validateCharm(draft({ skills: [{ skillId: sk('g1'), level: 1 }, null, null] }), ctx)[0],
    ).toMatchObject({ code: 'skill-kind' })
  })

  it('最大レベルの超過と 1 未満', () => {
    expect(messages(draft({ skills: [{ skillId: sk('a1'), level: 4 }, null, null] }))).toEqual([
      ['skills', 0, 'Lv4 は最大レベル（Lv3）を超えています。レベルを選び直してください。'],
    ])
    expect(
      validateCharm(draft({ skills: [{ skillId: sk('a1'), level: 0 }, null, null] }), ctx)[0],
    ).toMatchObject({ code: 'level-range' })
  })

  it('スロットの種別と Lv の範囲外', () => {
    expect(validateCharm(draft({ slots: [slot('weapon', 4), null, null] }), ctx)[0]).toMatchObject({
      field: 'slots',
      index: 0,
      code: 'slot-level',
    })
    expect(
      validateCharm(
        draft({ slots: [{ target: 'x' as Slot['target'], level: 1 }, null, null] }),
        ctx,
      )[0],
    ).toMatchObject({ code: 'slot-target' })
  })

  it('スキル4個・スロット4枠は拒否する', () => {
    const skill = { skillId: sk('a1'), level: 1 }
    const errors = validateCharm(
      draft({
        skills: [skill, { skillId: sk('a2'), level: 1 }, { skillId: sk('w1'), level: 1 }, skill],
        slots: [slot('weapon', 1), slot('weapon', 1), slot('weapon', 1), slot('weapon', 1)],
      }),
      ctx,
    )
    expect(errors.filter((e) => e.code === 'too-many').map((e) => [e.field, e.index])).toEqual([
      ['skills', 3],
      ['slots', 3],
    ])
  })

  it('エラーはレア度・スキル・スロットの順に複数返す', () => {
    const errors = validateCharm(
      draft({
        rarity: null,
        skills: [null, { skillId: sk('a1'), level: 1 }, null],
        slots: [null, slot('weapon', 1), null],
      }),
      ctx,
    )
    expect(errors.map((e) => e.field)).toEqual(['rarity', 'skills', 'slots'])
  })
})

// 受入基準 8・10（検索の候補の判定と候補への変換）
describe('charmEligibility', () => {
  it('制約を満たせば候補', () => {
    expect(
      charmEligibility({ rarity: 8, skills: [{ skillId: sk('a1'), level: 3 }], slots: [] }, ctx),
    ).toEqual({ eligible: true })
  })

  it('マスターに無いスキルは候補から外し、理由を一覧の文言で返す', () => {
    expect(
      charmEligibility({ rarity: 8, skills: [{ skillId: sk('gone'), level: 1 }], slots: [] }, ctx),
    ).toEqual({
      eligible: false,
      reasons: [`スキル「${sk('gone')}」が現行のマスターにありません。`],
    })
  })

  it('現行のマスターの最大レベルを超えるスキルは候補から外す', () => {
    expect(
      charmEligibility({ rarity: 8, skills: [{ skillId: sk('a1'), level: 4 }], slots: [] }, ctx),
    ).toEqual({ eligible: false, reasons: ['「攻撃 Lv4」が最大レベル（Lv3）を超えています。'] })
  })

  it('それ以外の制約違反も候補から外す', () => {
    const result = charmEligibility({ rarity: 3, skills: [], slots: [] }, ctx)
    expect(result).toEqual({ eligible: false, reasons: ['レア度は 5〜8 から選んでください。'] })
  })
})

describe('eligibleSolverCharms', () => {
  const stored = (id: string, level: number): StoredCharm => ({
    id,
    payload: { rarity: 8, skills: [{ skillId: sk('a1'), level }], slots: [slot('weapon', 1)] },
    schemaVersion: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })

  it('制約を満たす護石だけを SolverCharm にする（id・レア度・スキル・スロット）', () => {
    expect(eligibleSolverCharms([stored('a', 2), stored('b', 9)], ctx)).toEqual([
      { id: 'a', rarity: 8, skills: [{ skillId: sk('a1'), level: 2 }], slots: [slot('weapon', 1)] },
    ])
  })

  it('護石が無ければ空', () => {
    expect(eligibleSolverCharms([], ctx)).toEqual([])
  })
})
