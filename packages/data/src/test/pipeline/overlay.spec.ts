import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { convert } from '../../main/pipeline/convert.ts'
import {
  applyOverlays,
  formatOverlayError,
  readOverlayFiles,
  type OverlayFile,
} from '../../main/pipeline/overlay.ts'
import { CONFIG, makeInput, useTempDirs } from '../support/fixtures.ts'

const makeTempDir = useTempDirs()
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

const file = (name: string, text: string): OverlayFile => ({ name, text })

describe('オーバーレイの適用（受入基準 6）', () => {
  it('ID を指定してエントリの項目をまるごと置き換える', () => {
    const result = apply(
      file(
        'a.yaml',
        `replace:
  - id: sb:200
    field: thresholds
    value:
      - { pieces: 3, level: 1 }
  - id: sk:100
    field: maxLevel
    value: 5
`,
      ),
    )
    if (!result.ok) throw new Error('失敗')
    expect(result.bundle.setBonuses[0]?.thresholds).toEqual([{ pieces: 3, level: 1 }])
    expect(result.bundle.skills[0]?.maxLevel).toBe(5)
    expect(base().bundle.skills[0]?.maxLevel).toBe(2) // 元の bundle は変えない
  })

  it('sb: の thresholds の置換が、防具セット間の不一致を解消する', () => {
    const input = makeInput()
    const second = input.armors[1]
    if (second?.set_bonus) second.set_bonus.ranks = [{ pieces: 3, skill_level: 1 }]
    const converted = convert(input, CONFIG)
    expect(converted.mismatches).toHaveLength(1)
    const yaml =
      'replace:\n  - id: sb:200\n    field: thresholds\n    value: [{ pieces: 2, level: 1 }]\n'
    const result = applyOverlays([file('a.yaml', yaml)], converted.bundle, converted.mismatches)
    if (!result.ok) throw new Error('失敗')
    expect(result.mismatches).toEqual([])
    const other = applyOverlays([], converted.bundle, converted.mismatches)
    if (!other.ok) throw new Error('失敗')
    expect(other.mismatches).toHaveLength(1)
  })

  it('appraisedCharm を定義する。定義が無ければ空', () => {
    const none = apply(file('a.yaml', ''))
    if (!none.ok) throw new Error('失敗')
    expect(none.bundle.appraisedCharm).toEqual({ patterns: [], groups: [] })

    const defined = apply(
      file(
        'a.yaml',
        `appraisedCharm:
  patterns:
    - { rarity: 8, skillGroups: [A, null], slotPatterns: [[{ target: armor, level: 1 }]] }
  groups:
    - { group: A, skills: [{ skillId: "sk:100", level: 1 }] }
`,
      ),
    )
    if (!defined.ok) throw new Error('失敗')
    expect(defined.bundle.appraisedCharm.patterns).toHaveLength(1)
    expect(defined.bundle.appraisedCharm.groups[0]?.group).toBe('A')
  })

  it('空の appraisedCharm の配列は許す', () => {
    const result = apply(file('a.yaml', 'appraisedCharm:\n  patterns: []\n  groups: []\n'))
    expect(result.ok).toBe(true)
  })

  it('ファイル名の昇順で読む（ディレクトリの読み込み）', async () => {
    const dir = await makeTempDir()
    await writeFile(join(dir, 'b.yaml'), 'b')
    await writeFile(join(dir, 'a.yaml'), 'a')
    await writeFile(join(dir, 'note.txt'), 'x')
    const files = await readOverlayFiles(dir)
    expect(files.map((f) => f.name)).toEqual(['a.yaml', 'b.yaml'])
    expect(await readOverlayFiles(join(dir, 'none'))).toEqual([])
  })
})

describe('オーバーレイの失敗（受入基準 7・plan 決定事項 12）', () => {
  it('YAML の構文エラーはファイル名と行・桁を示す', () => {
    const [message] = errorsOf(file('bad.yaml', 'replace:\n  - id: [unclosed\n'))
    expect(message).toMatch(/^bad\.yaml:\d+:\d+: /)
  })

  it('最上位の未知のキー・形の誤りを行番号つきで示す', () => {
    expect(errorsOf(file('x.yaml', 'foo: 1\n'))).toEqual([
      expect.stringMatching(/^x\.yaml:1:1: .*foo/),
    ])
    expect(errorsOf(file('x.yaml', '- a\n'))[0]).toMatch(/^x\.yaml:1:1: /)
    expect(errorsOf(file('x.yaml', 'replace: 1\n'))[0]).toMatch(/^x\.yaml:1:10: .*配列/)
    expect(errorsOf(file('x.yaml', 'replace:\n  - 1\n'))[0]).toMatch(/^x\.yaml:2:5: /)
    expect(errorsOf(file('x.yaml', 'appraisedCharm: 1\n'))[0]).toMatch(/^x\.yaml:1:17: /)
  })

  it('replace の要素に id・field・value が欠ける・型が違うと失敗する', () => {
    expect(errorsOf(file('x.yaml', 'replace:\n  - { id: sb:200 }\n'))[0]).toMatch(
      /^x\.yaml:2:5: .*field・value/,
    )
    expect(errorsOf(file('x.yaml', 'replace:\n  - { id: 1, field: a, value: 1 }\n'))[0]).toMatch(
      /^x\.yaml:2:5: .*文字列/,
    )
  })

  it('存在しない ID・存在しない項目・id 自体の置換は失敗する', () => {
    const at = (id: string, field: string) =>
      `replace:\n  - id: ${id}\n    field: ${field}\n    value: 1\n`
    expect(errorsOf(file('x.yaml', at('sb:999', 'thresholds')))[0]).toMatch(
      /^x\.yaml:2:5: ID sb:999 が存在しません/,
    )
    expect(errorsOf(file('x.yaml', at('zz:1', 'a')))[0]).toMatch(/ID zz:1 が存在しません/)
    expect(errorsOf(file('x.yaml', at('sb:200', 'nothing')))[0]).toMatch(/項目 nothing/)
    expect(errorsOf(file('x.yaml', at('sb:200', 'id')))[0]).toMatch(/項目 id/)
  })

  it('同じ id と field の組が複数の箇所にあると失敗する（ファイルをまたいでも）', () => {
    const entry = 'replace:\n  - id: sk:100\n    field: maxLevel\n    value: 3\n'
    const [message] = errorsOf(file('a.yaml', entry), file('b.yaml', entry))
    expect(message).toMatch(/^b\.yaml:2:5: sk:100 の maxLevel が複数.*a\.yaml:2/)
  })

  it('appraisedCharm が複数のファイルにあると失敗する', () => {
    const def = 'appraisedCharm:\n  patterns: []\n'
    const [message] = errorsOf(file('a.yaml', def), file('b.yaml', def))
    expect(message).toMatch(/^b\.yaml:\d+:\d+: .*複数のファイル.*a\.yaml:/)
  })

  it('appraisedCharm の未知のキー・配列でない値は失敗する', () => {
    const messages = errorsOf(file('x.yaml', 'appraisedCharm:\n  other: []\n  groups: 1\n'))
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatch(/^x\.yaml:2:3: .*other/)
    expect(messages[1]).toMatch(/^x\.yaml:3:/)
  })

  it('失敗が1件でもあれば結果に bundle を返さない', () => {
    const result = apply(file('x.yaml', 'foo: 1\n'))
    expect(result).not.toHaveProperty('bundle')
  })
})
