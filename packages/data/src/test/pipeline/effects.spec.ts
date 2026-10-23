import { describe, expect, it } from 'vitest'
import type { MasterBundle } from '../../main/index.ts'
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
import { CONFIG, READINGS, makeInput } from '../support/fixtures.ts'

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
      ['{ stat: element_add, value: 5 }', /stat "element_add"/],
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
          { stat: 'element_add', value: 1 },
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
