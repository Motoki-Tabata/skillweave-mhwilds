import { describe, expect, it } from 'vitest'
import type { MasterBundle } from '../../main/index.ts'
import { convert } from '../../main/pipeline/convert.ts'
import { formatViolation, validate, type Violation } from '../../main/pipeline/validate.ts'
import { CONFIG, READINGS, makeInput } from '../support/fixtures.ts'
import { applyReadings } from '../../main/pipeline/overlay.ts'

/** 変換の結果に、フィクスチャの読みを ja の辞書へ重ねたもの */
function load(input = makeInput()) {
  const converted = convert(input, CONFIG)
  return {
    ...converted,
    dictionaries: {
      ja: applyReadings(converted.dictionaries.ja, READINGS),
      en: converted.dictionaries.en,
    },
  }
}

function check(edit?: (bundle: MasterBundle) => void): Violation[] {
  const { bundle, dictionaries, mismatches } = load()
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
    const { bundle, dictionaries, mismatches } = load(input)
    const violations = validate({ bundle, dictionaries, mismatches })
    expect(rules(violations)).toEqual(['set-bonus-mismatch'])
    expect(violations[0]?.message).toContain('sb:200')
    expect(violations[0]?.message).toContain('防具セット 10: 2部位→Lv1, 4部位→Lv2')
    expect(violations[0]?.message).toContain('防具セット 11: 3部位→Lv1')
  })

  it('辞書に全 ID の ja と en の名前が無いときを検出する', () => {
    const { bundle, dictionaries, mismatches } = load()
    // 項目ごと消すと読みの欠落（dictionary-reading）も出るので、名前だけを空にする
    dictionaries.ja.entries['sk:100']!.name = ''
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
    const { bundle, dictionaries } = load()
    expect(validate({ bundle, dictionaries })).toEqual([])
  })
})

describe('読みの検証（受入基準 13・plan D2）', () => {
  const readingRules = (
    edit: (d: ReturnType<typeof load>['dictionaries']) => void,
  ): Violation[] => {
    const { bundle, dictionaries } = load()
    edit(dictionaries)
    return validate({ bundle, dictionaries })
  }

  it('ja のスキルに読みが無いと dictionary-reading の違反にする', () => {
    const violations = readingRules((d) => {
      delete d.ja.entries['sk:100']!.reading
    })
    expect(rules(violations)).toEqual(['dictionary-reading'])
    expect(violations[0]?.message).toContain('sk:100')
  })

  it.each([
    ['空文字列', ''],
    ['漢字', '攻撃'],
    ['カタカナ', 'コウゲキ'],
    ['記号（・）', 'こう・げき'],
    ['英字', 'ko'],
    ['空白', 'こう げき'],
    ['文字列でない', 5],
  ])('読みが文字種に合わない（%s）と違反にする', (_label, reading) => {
    const violations = readingRules((d) => {
      d.ja.entries['sk:101']!.reading = reading as never
    })
    expect(rules(violations)).toEqual(['dictionary-reading'])
    expect(violations[0]?.message).toContain('sk:101')
  })

  it('長音符「ー」とひらがなの両端（ぁ・ゖ）は許す', () => {
    const violations = readingRules((d) => {
      d.ja.entries['sk:101']!.reading = 'ぁゖー'
    })
    expect(violations).toEqual([])
  })

  it('en の辞書と、スキル以外の項目に読みがあると違反にする', () => {
    const violations = readingRules((d) => {
      d.en.entries['sk:100']!.reading = 'こうげき'
      d.ja.entries['dc:1']!.reading = 'たま'
    })
    expect(rules(violations)).toEqual(['dictionary-reading', 'dictionary-reading'])
    const text = violations.map(formatViolation).join('\n')
    expect(text).toContain('辞書（en）')
    expect(text).toContain('dc:1')
  })
})

describe('抽選テーブルの検証（受入基準 12・plan D3）', () => {
  const group = (name: string, skillId = 'sk:100') => ({
    group: name,
    skills: [{ skillId: skillId as never, level: 1 }],
  })
  const pattern = (
    skillGroups: (string | null)[],
    slotPatterns: MasterBundle['appraisedCharm']['patterns'][number]['slotPatterns'] = [],
  ) => ({
    rarity: 8,
    skillGroups,
    slotPatterns,
  })
  const slot = { target: 'armor', level: 1 } as const

  it('正しいテーブルは違反が0件', () => {
    expect(
      check((b) => {
        b.appraisedCharm.groups = [group('A'), group('B', 'sk:101')]
        b.appraisedCharm.patterns = [pattern(['A', 'B', null], [[slot, slot, slot], []])]
      }),
    ).toEqual([])
  })

  it('グループ名の重複を検出する', () => {
    const violations = check((b) => {
      b.appraisedCharm.groups = [group('A'), group('A')]
    })
    expect(rules(violations)).toEqual(['appraised-charm'])
    expect(violations[0]?.message).toContain('重複')
  })

  it('skillGroups の要素が null でも groups にある名前でもないときを検出する', () => {
    const violations = check((b) => {
      b.appraisedCharm.groups = [group('A')]
      b.appraisedCharm.patterns = [pattern(['A', 'Z'])]
    })
    expect(rules(violations)).toEqual(['appraised-charm'])
    expect(violations[0]?.message).toContain('Z')
  })

  it('skillGroups の長さが 3 を超えるときを検出する', () => {
    const violations = check((b) => {
      b.appraisedCharm.groups = [group('A')]
      b.appraisedCharm.patterns = [pattern(['A', 'A', 'A', null])]
    })
    expect(rules(violations)).toEqual(['appraised-charm'])
    expect(violations[0]?.message).toContain('skillGroups')
  })

  it('スロットの並びの長さが 3 を超えるときを検出する', () => {
    const violations = check((b) => {
      b.appraisedCharm.patterns = [pattern([], [[slot, slot, slot, slot]])]
    })
    expect(rules(violations)).toEqual(['appraised-charm'])
    expect(violations[0]?.message).toContain('スロット')
  })

  it('groups の skills に武器スキル・防具スキル以外があるときを検出する', () => {
    const violations = check((b) => {
      b.appraisedCharm.groups = [group('A', 'sk:200'), group('B', 'sk:201')]
    })
    expect(rules(violations)).toEqual(['appraised-charm', 'appraised-charm'])
    expect(violations[0]?.message).toContain('sk:200')
  })

  it('レア度の範囲（5〜8）は検証しない', () => {
    expect(
      check((b) => {
        b.appraisedCharm.patterns = [{ ...pattern([]), rarity: 1 }]
      }),
    ).toEqual([])
  })
})
