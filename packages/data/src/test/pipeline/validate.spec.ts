import { describe, expect, it } from 'vitest'
import type { MasterBundle } from '../../main/index.ts'
import { convert } from '../../main/pipeline/convert.ts'
import { formatViolation, validate, type Violation } from '../../main/pipeline/validate.ts'
import { CONFIG, makeInput } from '../support/fixtures.ts'

function check(edit?: (bundle: MasterBundle) => void): Violation[] {
  const { bundle, dictionaries, mismatches } = convert(makeInput(), CONFIG)
  edit?.(bundle)
  return validate({ bundle, dictionaries, mismatches })
}

const rules = (violations: Violation[]): string[] => violations.map((v) => v.rule)

describe('検証（受入基準 8）', () => {
  it('正しい入力は違反が0件', () => {
    expect(check()).toEqual([])
  })

  it('防具の rank が low・high・master 以外なら armor-rank の違反にする（12）', () => {
    const violations = check((b) => {
      b.armors[0]!.rank = 'legend' as never
    })
    expect(rules(violations)).toEqual(['armor-rank'])
    expect(violations[0]?.message).toContain('ar:10:head')
  })

  it('ID の重複を検出する（集合をまたぐ重複を含む）', () => {
    const violations = check((b) => {
      b.decorations.push({ ...b.decorations[0]! })
      b.charms.push({ ...b.charms[0]!, id: 'sk:100' as never })
    })
    expect(rules(violations)).toEqual(['duplicate-id', 'duplicate-id'])
    expect(violations[0]?.message).toContain('dc:1')
  })

  it('存在しないスキル ID・sb: の ID の参照を検出する', () => {
    const violations = check((b) => {
      b.armors[0]!.skills.push({ skillId: 'sk:9' as never, level: 1 })
      b.armors[0]!.setBonusIds.push('sb:9' as never)
      b.weapons[0]!.setBonusIds.push('sb:8' as never)
      b.setBonuses[0]!.skillId = 'sk:7' as never
      b.appraisedCharm.groups.push({ group: 'A', skills: [{ skillId: 'sk:6' as never, level: 1 }] })
    })
    expect(rules(violations).sort()).toEqual([
      'missing-set-bonus',
      'missing-set-bonus',
      'missing-skill',
      'missing-skill',
      'missing-skill',
    ])
    const text = violations.map(formatViolation).join('\n')
    for (const id of ['sk:9', 'sb:9', 'sb:8', 'sk:7', 'sk:6']) expect(text).toContain(id)
  })

  it('スキルのレベルが 1 未満・最大レベル超過・整数でないときを検出する', () => {
    const violations = check((b) => {
      b.armors[0]!.skills = [{ skillId: 'sk:100' as never, level: 3 }]
      b.decorations[0]!.skills = [{ skillId: 'sk:100' as never, level: 0 }]
      b.charms[0]!.skills = [{ skillId: 'sk:100' as never, level: 1.5 }]
      b.setBonuses[0]!.thresholds = [{ pieces: 2, level: 3 }]
      b.skills[3]!.maxLevel = 0
    })
    expect(rules(violations)).toEqual([
      'skill-level',
      'skill-level',
      'skill-level',
      'skill-level',
      'skill-level',
    ])
  })

  it.each([
    ['欠落（undefined）', undefined],
    ['小数（1.5）', 1.5],
  ])('シリーズ／グループスキルの発動レベルが %s のとき skill-level を検出する', (_label, level) => {
    const violations = check((b) => {
      b.setBonuses[0]!.thresholds = [{ pieces: 2, level: level as never }]
    })
    expect(rules(violations)).toEqual(['skill-level'])
  })

  it.each([
    ['欠落（undefined）', undefined],
    ['小数（2.5）', 2.5],
  ])(
    'シリーズ／グループスキルの発動部位数が %s のとき threshold-pieces を検出する',
    (_label, pieces) => {
      const violations = check((b) => {
        b.setBonuses[0]!.thresholds = [{ pieces: pieces as never, level: 1 }]
      })
      expect(rules(violations)).toEqual(['threshold-pieces'])
    },
  )

  it('スロット Lv が 1〜4 でないときを検出する（防具・武器・装飾品・護石・鑑定護石）', () => {
    const violations = check((b) => {
      b.armors[0]!.slots = [{ target: 'armor', level: 5 as never }]
      b.weapons[0]!.slots = [{ target: 'weapon', level: 0 as never }]
      b.decorations[0]!.slotLevel = 9 as never
      b.charms[0]!.slots = [{ target: 'armor', level: 1.5 as never }]
      b.appraisedCharm.patterns.push({
        rarity: 8,
        skillGroups: [null],
        slotPatterns: [[{ target: 'armor', level: 7 as never }]],
      })
    })
    expect(rules(violations)).toEqual(Array(5).fill('slot-level'))
  })

  it('発動部位数が昇順でない・重複するときを検出する', () => {
    const violations = check((b) => {
      b.setBonuses[0]!.thresholds = [
        { pieces: 2, level: 1 },
        { pieces: 2, level: 2 },
      ]
      b.setBonuses[1]!.thresholds = [
        { pieces: 4, level: 1 },
        { pieces: 2, level: 1 },
      ]
    })
    expect(rules(violations)).toEqual(['threshold-order', 'threshold-order'])
  })

  it('同じスキルを持つ防具セットの間の不一致を、防具セットごとの値つきで示す', () => {
    const input = makeInput()
    const second = input.armors[1]
    if (second?.set_bonus) second.set_bonus.ranks = [{ pieces: 3, skill_level: 1 }]
    const { bundle, dictionaries, mismatches } = convert(input, CONFIG)
    const violations = validate({ bundle, dictionaries, mismatches })
    expect(rules(violations)).toEqual(['set-bonus-mismatch'])
    expect(violations[0]?.message).toContain('sb:200')
    expect(violations[0]?.message).toContain('防具セット 10: 2部位→Lv1, 4部位→Lv2')
    expect(violations[0]?.message).toContain('防具セット 11: 3部位→Lv1')
  })

  it('辞書に全 ID の ja と en の名前が無いときを検出する', () => {
    const { bundle, dictionaries, mismatches } = convert(makeInput(), CONFIG)
    delete dictionaries.ja.entries['sk:100']
    dictionaries.en.entries['dc:1'] = { name: '' }
    const violations = validate({ bundle, dictionaries, mismatches })
    expect(rules(violations)).toEqual(['dictionary-name', 'dictionary-name'])
    expect(violations[0]?.message).toContain('sk:100')
    expect(violations[0]?.message).toContain('ja')
    expect(violations[1]?.message).toContain('en')
  })

  it('違反は全件を返し、formatViolation は規則名を前置する', () => {
    const violations = check((b) => {
      b.armors[0]!.slots = [{ target: 'armor', level: 5 as never }]
      b.decorations.push({ ...b.decorations[0]! })
    })
    expect(violations.length).toBeGreaterThanOrEqual(2)
    expect(formatViolation(violations[0]!)).toMatch(/^\[[a-z-]+\] /)
  })

  it('mismatches を省くと不一致を検査しない（dist の検証）', () => {
    const { bundle, dictionaries } = convert(makeInput(), CONFIG)
    expect(validate({ bundle, dictionaries })).toEqual([])
  })
})
