import { describe, expect, it } from 'vitest'
import type { Effect, MasterBundle } from '../../main/index.ts'
import { convert } from '../../main/pipeline/convert.ts'
import {
  applyConditionNames,
  applyOverlays,
  applyReadings,
  formatOverlayError,
  type OverlayFile,
} from '../../main/pipeline/overlay.ts'
import { serializeBundle } from '../../main/pipeline/serialize.ts'
import { formatViolation, validate, type Violation } from '../../main/pipeline/validate.ts'
import { CONFIG, READINGS, assignCategories, makeInput } from '../support/fixtures.ts'

const file = (name: string, text: string): OverlayFile => ({ name, text })
const base = () => convert(makeInput(), CONFIG)

function apply(...files: OverlayFile[]) {
  const { bundle, mismatches } = base()
  return applyOverlays(files, bundle, mismatches)
}

function errorsOf(...files: OverlayFile[]): string[] {
  const result = apply(...files)
  if (result.ok) throw new Error('失敗するはずのオーバーレイが成功しました')
  return result.errors.map(formatOverlayError)
}

/** 条件 cd:a・cd:b を定義する（フィクスチャの sk:100 は最大 Lv2、sk:101 は Lv1） */
const CONDITIONS = `conditions:
  - id: cd:a
    name: { ja: 条件あ, en: Condition A }
  - id: cd:b
    name: { ja: 条件い, en: Condition B }
`

const VALID = `${CONDITIONS}effects:
  sk:100:
    - - { stat: attack_add, value: 3, conditionId: cd:a }
      - { stat: crit_mul, value: 1.3 }
    - []
  sk:101:
    - - { stat: affinity_add, value: 5, conditionId: cd:b }
`

/** 効果の1行だけを差し替えた overlay（条件 cd:a・cd:b を両方参照する） */
const withEffect = (effect: string): string => `${CONDITIONS}effects:
  sk:100:
    - - { stat: affinity_add, value: 1, conditionId: cd:a }
      - { stat: affinity_add, value: 1, conditionId: cd:b }
      - ${effect}
    - []
`

describe('overlay の効果と発動条件（受入基準 1）', () => {
  it('conditions を MasterBundle に、effects を skills の effectsByLevel に入れる。並びは overlay のまま', () => {
    const result = apply(file('effects.yaml', VALID))
    if (!result.ok) throw new Error(result.errors.map(formatOverlayError).join('\n'))
    expect(result.bundle.conditions).toEqual([{ id: 'cd:a' }, { id: 'cd:b' }])
    const skill = (id: string) => result.bundle.skills.find((s) => s.id === id)
    expect(skill('sk:100')?.effectsByLevel).toEqual([
      [
        { stat: 'attack_add', value: 3, conditionId: 'cd:a' },
        { stat: 'crit_mul', value: 1.3 },
      ],
      [],
    ])
    expect(skill('sk:101')?.effectsByLevel).toEqual([
      [{ stat: 'affinity_add', value: 5, conditionId: 'cd:b' }],
    ])
    expect(skill('sk:200')?.effectsByLevel).toEqual([])
    expect(base().bundle.conditions).toEqual([]) // 元の bundle は変えない
  })

  it('条件の名前を ja・en の辞書の { name } に重ねる。元の辞書は変えない', () => {
    const result = apply(file('effects.yaml', VALID))
    if (!result.ok) throw new Error('失敗')
    expect(result.conditionNames).toEqual({
      'cd:a': { ja: '条件あ', en: 'Condition A' },
      'cd:b': { ja: '条件い', en: 'Condition B' },
    })
    const { dictionaries } = base()
    const ja = applyConditionNames(applyReadings(dictionaries.ja, READINGS), result.conditionNames)
    const en = applyConditionNames(dictionaries.en, result.conditionNames)
    expect(ja.entries['cd:a']).toEqual({ name: '条件あ' })
    expect(en.entries['cd:b']).toEqual({ name: 'Condition B' })
    expect(dictionaries.ja.entries['cd:a']).toBeUndefined()
    expect(ja.entries['sk:100']?.reading).toBe('こうげき')
  })

  it('conditions と effects は複数のファイルに分けて書ける', () => {
    const result = apply(
      file('a.yaml', CONDITIONS),
      file(
        'b.yaml',
        'effects:\n  sk:101:\n    - - { stat: attack_add, value: 1, conditionId: cd:a }\n',
      ),
      file(
        'c.yaml',
        'effects:\n  sk:100:\n    - - { stat: attack_add, value: 1, conditionId: cd:b }\n    - []\n',
      ),
    )
    expect(result.ok).toBe(true)
  })

  it('conditions と effects が無くても成功し、conditions は空', () => {
    const result = apply(file('a.yaml', ''))
    if (!result.ok) throw new Error('失敗')
    expect(result.bundle.conditions).toEqual([])
    expect(result.conditionNames).toEqual({})
  })
})

describe('overlay の効果と発動条件の失敗（受入基準 2）', () => {
  it('レベルの数が最大レベルと違うと、ファイル名と行・桁を示して失敗する', () => {
    const text = `${CONDITIONS}effects:
  sk:100:
    - - { stat: attack_add, value: 1, conditionId: cd:a }
      - { stat: attack_add, value: 1, conditionId: cd:b }
`
    expect(errorsOf(file('x.yaml', text))).toEqual([
      expect.stringMatching(/^x\.yaml:7:3: .*sk:100.*レベルの数 1.*最大レベル 2/),
    ])
  })

  it('存在しない条件 ID を参照すると、効果の位置を示して失敗する', () => {
    const messages = errorsOf(
      file('x.yaml', withEffect('{ stat: attack_add, value: 1, conditionId: cd:zz }')),
    )
    expect(messages).toEqual([
      expect.stringMatching(/^x\.yaml:10:9: .*cd:zz.*conditions にありません/),
    ])
  })

  it('値が有限の数でない（文字列・.inf・.nan）と失敗する', () => {
    for (const value of ['"3"', '.inf', '-.inf', '.nan', 'null']) {
      const messages = errorsOf(file('x.yaml', withEffect(`{ stat: attack_add, value: ${value} }`)))
      expect(messages, value).toEqual([expect.stringMatching(/^x\.yaml:10:9: .*有限の数/)])
    }
  })

  it('条件 ID が重複すると失敗する（同一ファイル内・ファイルをまたぐ）', () => {
    const [within] = errorsOf(
      file(
        'x.yaml',
        'conditions:\n  - { id: cd:a, name: { ja: あ, en: A } }\n  - { id: cd:a, name: { ja: い, en: B } }\n',
      ),
    )
    expect(within).toMatch(/^x\.yaml:3:5: .*cd:a.*複数.*x\.yaml:2/)
    const [across] = errorsOf(file('a.yaml', CONDITIONS), file('b.yaml', CONDITIONS))
    expect(across).toMatch(/^b\.yaml:2:5: .*cd:a.*複数.*a\.yaml:2/)
  })

  it('条件の名前が ja・en のどちらかに無いか空だと失敗する', () => {
    const at = (name: string) => `conditions:\n  - id: cd:a\n    name: ${name}\n`
    expect(errorsOf(file('x.yaml', at('{ en: A }')))[0]).toMatch(/^x\.yaml:3:11: .*ja がありません/)
    expect(errorsOf(file('x.yaml', at('{ ja: あ }')))[0]).toMatch(
      /^x\.yaml:3:11: .*en がありません/,
    )
    expect(errorsOf(file('x.yaml', at('{ ja: あ, en: "" }')))[0]).toMatch(
      /^x\.yaml:3:\d+: .*en は空でない文字列/,
    )
    expect(errorsOf(file('x.yaml', at('{ ja: "", en: A }')))[0]).toMatch(
      /^x\.yaml:3:\d+: .*ja は空でない文字列/,
    )
    expect(errorsOf(file('x.yaml', 'conditions:\n  - id: cd:a\n'))[0]).toMatch(
      /^x\.yaml:2:5: .*name がありません/,
    )
  })

  it('条件 ID の形式が cd:<slug> に合わないと失敗する', () => {
    for (const id of ['cond.a', 'cd:A', 'cd:1a', 'cd:a-b', 'cd:']) {
      const messages = errorsOf(
        file('x.yaml', `conditions:\n  - { id: "${id}", name: { ja: あ, en: A } }\n`),
      )
      expect(messages[0], id).toMatch(/^x\.yaml:2:\d+: .*形ではありません/)
    }
  })

  it('どの効果からも参照されない条件は失敗する', () => {
    const text = `${CONDITIONS}effects:
  sk:101:
    - - { stat: attack_add, value: 1, conditionId: cd:a }
`
    expect(errorsOf(file('x.yaml', text))).toEqual([
      expect.stringMatching(/^x\.yaml:4:5: .*cd:b.*参照されていません/),
    ])
  })

  it('存在しないスキル ID・スキル以外の ID・スキルの重複は失敗する', () => {
    const entry = (id: string) => `effects:\n  ${id}:\n    - []\n`
    expect(errorsOf(file('x.yaml', entry('sk:999')))).toEqual([
      expect.stringMatching(/^x\.yaml:2:3: .*sk:999.*存在しません/),
    ])
    expect(errorsOf(file('x.yaml', entry('sb:200')))).toEqual([
      expect.stringMatching(/^x\.yaml:2:3: .*sb:200.*スキル/),
    ])
    const second = 'effects:\n  sk:101:\n    - []\n'
    expect(errorsOf(file('a.yaml', second), file('b.yaml', second))).toEqual([
      expect.stringMatching(/^b\.yaml:2:3: .*sk:101.*複数.*a\.yaml:2/),
    ])
  })

  it('replace で effectsByLevel を置き換えると失敗する', () => {
    const text = 'replace:\n  - id: sk:101\n    field: effectsByLevel\n    value: []\n'
    expect(errorsOf(file('x.yaml', text))).toEqual([
      expect.stringMatching(/^x\.yaml:2:5: .*sk:101.*effectsByLevel.*effects/),
    ])
  })

  it('stat・値の規則に反する効果は失敗する', () => {
    const cases: [string, RegExp][] = [
      ['{ stat: sharpness_add, value: 5 }', /stat "sharpness_add"/],
      ['{ stat: nothing, value: 5 }', /stat "nothing"/],
      ['{ stat: attack_add, value: 1.5 }', /attack_add.*整数/],
      ['{ stat: affinity_add, value: 0.5 }', /affinity_add.*整数/],
      ['{ stat: attack_mul, value: 0 }', /attack_mul.*0 より大きく/],
      ['{ stat: attack_mul, value: -1 }', /attack_mul.*0 より大きく/],
      ['{ stat: crit_mul, value: 1.2 }', /crit_mul.*1.25 以上/],
    ]
    for (const [effect, pattern] of cases) {
      expect(errorsOf(file('x.yaml', withEffect(effect))), effect).toEqual([
        expect.stringMatching(pattern),
      ])
    }
    for (const effect of [
      '{ stat: attack_mul, value: 0.5 }',
      '{ stat: crit_mul, value: 1.25 }',
      '{ stat: affinity_add, value: -3 }',
    ]) {
      const result = apply(file('x.yaml', withEffect(effect)))
      expect(result.ok, effect).toBe(true)
    }
  })

  it('未知のキー・形の誤りは位置つきで失敗する', () => {
    expect(
      errorsOf(file('x.yaml', withEffect('{ stat: attack_add, value: 1, extra: 1 }')))[0],
    ).toMatch(/^x\.yaml:10:\d+: .*extra/)
    expect(errorsOf(file('x.yaml', withEffect('{ stat: attack_add }')))[0]).toMatch(
      /^x\.yaml:10:9: .*value がありません/,
    )
    expect(
      errorsOf(
        file('x.yaml', 'conditions:\n  - { id: cd:a, name: { ja: あ, en: A }, extra: 1 }\n'),
      )[0],
    ).toMatch(/^x\.yaml:2:\d+: .*extra/)
    expect(
      errorsOf(
        file('x.yaml', 'conditions:\n  - { id: cd:a, name: { ja: あ, en: A, fr: B } }\n'),
      )[0],
    ).toMatch(/^x\.yaml:2:\d+: .*fr/)
    expect(errorsOf(file('x.yaml', 'conditions: 1\n'))[0]).toMatch(/^x\.yaml:1:13: .*配列/)
    expect(errorsOf(file('x.yaml', 'effects: 1\n'))[0]).toMatch(/^x\.yaml:1:10: /)
    expect(errorsOf(file('x.yaml', 'effects:\n  sk:101: 1\n'))[0]).toMatch(/^x\.yaml:2:/)
    expect(errorsOf(file('x.yaml', 'effects:\n  sk:101:\n    - 1\n'))[0]).toMatch(/^x\.yaml:3:7: /)
    expect(errorsOf(file('x.yaml', 'effects:\n  sk:101:\n    - [1]\n'))[0]).toMatch(
      /^x\.yaml:3:8: /,
    )
  })

  it('失敗が1件でもあれば bundle を返さない', () => {
    expect(apply(file('x.yaml', withEffect('{ stat: nothing, value: 1 }')))).not.toHaveProperty(
      'bundle',
    )
  })
})

describe('出力前の検証の効果と発動条件（受入基準 2・3）', () => {
  function load(): { bundle: MasterBundle; dictionaries: ReturnType<typeof base>['dictionaries'] } {
    const result = apply(file('effects.yaml', VALID))
    if (!result.ok) throw new Error('失敗')
    assignCategories(result.bundle)
    const { dictionaries } = base()
    return {
      bundle: result.bundle,
      dictionaries: {
        ja: applyConditionNames(applyReadings(dictionaries.ja, READINGS), result.conditionNames),
        en: applyConditionNames(dictionaries.en, result.conditionNames),
      },
    }
  }
  function check(edit?: (bundle: MasterBundle) => void): Violation[] {
    const { bundle, dictionaries } = load()
    edit?.(bundle)
    return validate({ bundle, dictionaries })
  }
  const rules = (violations: Violation[]): string[] => violations.map((v) => v.rule)

  it('正しい効果と条件は違反が0件', () => {
    expect(check().map(formatViolation)).toEqual([])
  })

  it('skill-effects: effectsByLevel の長さが 0 でも最大レベルでもないと違反', () => {
    const violations = check((b) => {
      b.skills.find((s) => s.id === 'sk:200')!.effectsByLevel = [[]]
    })
    expect(rules(violations)).toEqual(['skill-effects'])
    expect(violations[0]?.message).toContain('sk:200')
  })

  it('skill-effects: stat と値の規則に反すると違反', () => {
    const effects = check((b) => {
      b.skills.find((s) => s.id === 'sk:101')!.effectsByLevel = [
        [
          { stat: 'resistance_add', value: 5 },
          { stat: 'attack_mul', value: Number.NaN },
          { stat: 'crit_mul', value: 1.2 },
          { stat: 'attack_add', value: 1.5 },
        ],
      ]
    })
    expect(rules(effects)).toEqual([
      'skill-effects',
      'skill-effects',
      'skill-effects',
      'skill-effects',
    ])
  })

  it('skill-effects: conditions に無い conditionId は違反', () => {
    const violations = check((b) => {
      b.skills.find((s) => s.id === 'sk:101')!.effectsByLevel = [
        [{ stat: 'attack_add', value: 1, conditionId: 'cd:zz' as never }],
      ]
    })
    expect(rules(violations)).toEqual(['skill-effects'])
    expect(violations[0]?.message).toContain('cd:zz')
  })

  it('conditions: ID の形式の違反と重複を検出する', () => {
    const violations = check((b) => {
      b.conditions.push({ id: 'cd:a' as never }, { id: 'cond.x' as never })
    })
    expect(rules(violations)).toEqual([
      'conditions',
      'conditions',
      'dictionary-name',
      'dictionary-name',
    ])
  })

  it('辞書の ja・en の両方に条件の名前が無いと違反', () => {
    const { bundle, dictionaries } = load()
    delete dictionaries.ja.entries['cd:a']
    dictionaries.en.entries['cd:b'] = { name: '' }
    const violations = validate({ bundle, dictionaries })
    expect(violations.map((v) => `${v.rule}:${v.message}`)).toEqual([
      expect.stringContaining('cd:a: 辞書（ja）'),
      expect.stringContaining('cd:b: 辞書（en）'),
    ])
  })
})

// 037 AC-1・AC-2: 新しい種類（属性値・状態異常値・属性/状態異常の会心倍率・防御力・耐性値）と種類の区別
describe('037 AC-2: overlay の新しい種類の規則違反はファイル名と行・桁つきで失敗する', () => {
  const violations: [string, RegExp][] = [
    // 区別の規則
    ['{ stat: resistance_add, value: 5 }', /resistance_add.*element が必要/],
    ['{ stat: resistance_add, value: 5, element: poison }', /resistance_add.*element "poison"/],
    ['{ stat: element_add, value: 5, element: poison }', /element_add.*element "poison"/],
    ['{ stat: element_mul, value: 1.1, element: all }', /element_mul.*element "all"/],
    ['{ stat: status_add, value: 1, element: fire }', /status_add.*element "fire"/],
    ['{ stat: status_mul, value: 1.1, element: all }', /status_mul.*element "all"/],
    ['{ stat: element_add, value: 5, element: unknown }', /element "unknown"/],
    ['{ stat: attack_add, value: 5, element: fire }', /attack_add は element を持てません/],
    ['{ stat: defense_add, value: 5, element: fire }', /defense_add は element を持てません/],
    ['{ stat: element_crit_mul, value: 1.3, element: fire }', /element を持てません/],
    // 値の規則
    ['{ stat: element_add, value: 0.25, element: fire }', /element_add.*小数第1位/],
    ['{ stat: status_add, value: 1.05, element: poison }', /status_add.*小数第1位/],
    ['{ stat: defense_add, value: 1.5 }', /defense_add.*整数/],
    ['{ stat: resistance_add, value: 2.5, element: all }', /resistance_add.*整数/],
    ['{ stat: element_mul, value: 0, element: fire }', /element_mul.*0 より大きく/],
    ['{ stat: status_mul, value: -1 }', /status_mul.*0 より大きく/],
    ['{ stat: defense_mul, value: 0 }', /defense_mul.*0 より大きく/],
    ['{ stat: element_crit_mul, value: 0.9 }', /element_crit_mul.*1 以上/],
    ['{ stat: status_crit_mul, value: 0.99 }', /status_crit_mul.*1 以上/],
  ]
  it.each(violations)('%s', (effect, pattern) => {
    expect(errorsOf(file('x.yaml', withEffect(effect)))).toEqual([
      expect.stringMatching(new RegExp(`^x\\.yaml:10:9: .*${pattern.source}`)),
    ])
  })

  it('正しい例（区別あり・区別なし・all・小数第1位）は通り、element を出力に移す', () => {
    const valid = [
      '{ stat: element_add, value: 6, element: fire }',
      '{ stat: element_add, value: 0.1 }',
      '{ stat: element_mul, value: 1.2, element: dragon }',
      '{ stat: status_add, value: 0.3, element: blastblight }',
      '{ stat: status_mul, value: 1.05 }',
      '{ stat: element_crit_mul, value: 1 }',
      '{ stat: status_crit_mul, value: 1.1 }',
      '{ stat: defense_add, value: -5 }',
      '{ stat: defense_mul, value: 1.1 }',
      '{ stat: resistance_add, value: 5, element: all }',
      '{ stat: resistance_add, value: 20, element: ice }',
    ]
    for (const effect of valid) {
      expect(apply(file('x.yaml', withEffect(effect))).ok, effect).toBe(true)
    }
    const result = apply(
      file('x.yaml', withEffect('{ stat: resistance_add, value: 5, element: all }')),
    )
    if (!result.ok) throw new Error('失敗')
    const effects = result.bundle.skills.find((s) => s.id === 'sk:100')?.effectsByLevel[0]
    expect(effects?.[2]).toEqual({ stat: 'resistance_add', value: 5, element: 'all' })
    expect(effects?.[0]).not.toHaveProperty('element')
  })
})

describe('037 AC-2: 出力前の検証（skill-effects）も同じ規則で検査する', () => {
  const check = (effect: Effect): Violation[] => {
    const result = apply(file('effects.yaml', VALID))
    if (!result.ok) throw new Error('失敗')
    assignCategories(result.bundle)
    result.bundle.skills.find((s) => s.id === 'sk:101')!.effectsByLevel = [[effect]]
    const { dictionaries } = base()
    return validate({
      bundle: result.bundle,
      dictionaries: {
        ja: applyConditionNames(applyReadings(dictionaries.ja, READINGS), result.conditionNames),
        en: applyConditionNames(dictionaries.en, result.conditionNames),
      },
    })
  }

  const bad: Effect[] = [
    { stat: 'resistance_add', value: 5 },
    { stat: 'resistance_add', value: 5, element: 'poison' },
    { stat: 'element_add', value: 5, element: 'sleep' },
    { stat: 'status_add', value: 1, element: 'fire' },
    { stat: 'attack_add', value: 1, element: 'fire' },
    { stat: 'element_add', value: 0.25, element: 'fire' },
    { stat: 'defense_add', value: 1.5 },
    { stat: 'status_mul', value: 0, element: 'poison' },
    { stat: 'element_crit_mul', value: 0.9 },
    { stat: 'status_crit_mul', value: 0.9 },
  ]
  it.each(bad)('違反: %o', (effect) => {
    expect(check(effect).map((v) => v.rule)).toEqual(['skill-effects'])
  })

  it('正しい例（区別あり・区別なし・all）は違反が 0 件', () => {
    const good: Effect[] = [
      { stat: 'element_add', value: 6, element: 'fire' },
      { stat: 'element_mul', value: 1.2 },
      { stat: 'status_add', value: 0.5, element: 'poison' },
      { stat: 'resistance_add', value: 5, element: 'all' },
      { stat: 'defense_mul', value: 1.1 },
      { stat: 'element_crit_mul', value: 1.1 },
    ]
    for (const effect of good) expect(check(effect).map(formatViolation), effect.stat).toEqual([])
  })
})

describe('直列化の条件（受入基準 1）', () => {
  it('conditions は id の昇順、効果は level 内の並びを保ち、キーは昇順に出す', () => {
    const result = apply(file('effects.yaml', VALID))
    if (!result.ok) throw new Error('失敗')
    result.bundle.conditions.reverse()
    const parsed = JSON.parse(serializeBundle(result.bundle)) as MasterBundle
    expect(parsed.conditions).toEqual([{ id: 'cd:a' }, { id: 'cd:b' }])
    const first = parsed.skills.find((s) => s.id === 'sk:100')?.effectsByLevel[0]
    expect(first?.map((e) => e.stat)).toEqual(['attack_add', 'crit_mul'])
    expect(Object.keys(first?.[0] ?? {})).toEqual(['conditionId', 'stat', 'value'])
  })
})

describe('weaponTypes の規則（043 AC-1。D3・D4）', () => {
  const effectOf = (weaponTypes: string): string =>
    `{ stat: attack_add, value: 1, weaponTypes: ${weaponTypes} }`

  it('overlay: 正しい weaponTypes は並びのまま効果に入る。省略した効果は weaponTypes を持たない', () => {
    const result = apply(file('x.yaml', withEffect(effectOf('[charge-blade, bow]'))))
    if (!result.ok) throw new Error(result.errors.map(formatOverlayError).join('\n'))
    const level = result.bundle.skills.find((s) => s.id === 'sk:100')!.effectsByLevel[0]!
    expect(level[2]).toEqual({
      stat: 'attack_add',
      value: 1,
      weaponTypes: ['charge-blade', 'bow'],
    })
    expect('weaponTypes' in level[0]!).toBe(false)
  })

  it('overlay: 配列でない・空・文字列でない要素・武器種に無い要素・重複は、位置を示して失敗する', () => {
    for (const bad of ['bow', '[]', '[1]', '[long_sword]', '[bow, bow]', 'null']) {
      const messages = errorsOf(file('x.yaml', withEffect(effectOf(bad))))
      expect(messages, bad).toEqual([expect.stringMatching(/^x\.yaml:10:9: .*weaponTypes/)])
    }
  })

  it('overlay: stat・element・conditionId が同じ効果の武器種が交わると、後の効果の位置で失敗する', () => {
    // 省略（全武器種）と [bow] は交わる
    const overlap = `${effectOf('[bow]')}\n      - { stat: attack_add, value: 2 }`
    expect(errorsOf(file('x.yaml', withEffect(overlap)))).toEqual([
      expect.stringMatching(/^x\.yaml:11:9: .*重なって/),
    ])
    const both = `${effectOf('[bow, charge-blade]')}\n      - ${effectOf('[bow]')}`
    expect(errorsOf(file('x.yaml', withEffect(both)))).toEqual([
      expect.stringMatching(/^x\.yaml:11:9: .*bow/),
    ])
  })

  it('overlay: 武器種が交わらない、または stat か conditionId が違えば通る', () => {
    const cases = [
      `${effectOf('[bow]')}\n      - ${effectOf('[charge-blade]')}`,
      `${effectOf('[bow]')}\n      - { stat: attack_mul, value: 1.1, weaponTypes: [bow] }`,
      `${effectOf('[bow]')}\n      - { stat: attack_add, value: 2, conditionId: cd:a }`,
    ]
    for (const text of cases) {
      const result = apply(file('x.yaml', withEffect(text)))
      expect(result.ok, text).toBe(true)
    }
  })

  describe('出力前の検証 skill-effects', () => {
    const violationsOf = (effects: Effect[]) => {
      const result = apply(file('effects.yaml', VALID))
      if (!result.ok) throw new Error('失敗')
      assignCategories(result.bundle)
      result.bundle.skills.find((s) => s.id === 'sk:101')!.effectsByLevel = [effects]
      const { dictionaries } = base()
      return validate({
        bundle: result.bundle,
        dictionaries: {
          ja: applyConditionNames(applyReadings(dictionaries.ja, READINGS), result.conditionNames),
          en: applyConditionNames(dictionaries.en, result.conditionNames),
        },
      })
    }

    it('正しい weaponTypes は違反が0件', () => {
      const violations = violationsOf([
        { stat: 'attack_add', value: 1, weaponTypes: ['bow'] },
        { stat: 'attack_add', value: 2, weaponTypes: ['charge-blade'] },
      ])
      expect(violations.map(formatViolation)).toEqual([])
    })

    it('空・非配列・非文字列・武器種に無い要素・重複は違反', () => {
      for (const bad of [[], 'bow', [1], ['long_sword'], ['bow', 'bow']]) {
        const violations = violationsOf([
          { stat: 'attack_add', value: 1, weaponTypes: bad as never },
        ])
        expect(
          violations.map((v) => v.rule),
          JSON.stringify(bad),
        ).toEqual(['skill-effects'])
        expect(violations[0]?.message).toContain('weaponTypes')
      }
    })

    it('stat・element・conditionId が同じ効果の武器種が交わると違反。省略は全武器種', () => {
      const violations = violationsOf([
        { stat: 'attack_add', value: 1, weaponTypes: ['bow'] },
        { stat: 'attack_add', value: 2 },
      ])
      expect(violations.map((v) => v.rule)).toEqual(['skill-effects'])
      expect(violations[0]?.message).toContain('sk:101')
      const different = violationsOf([
        { stat: 'attack_add', value: 1, weaponTypes: ['bow'] },
        { stat: 'attack_mul', value: 1.1 },
      ])
      expect(different).toEqual([])
    })
  })
})
