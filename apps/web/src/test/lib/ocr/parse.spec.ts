import type { SkillId } from '@swv/data'
import { describe, expect, it } from 'vitest'
import { buildCandidates } from '@/lib/ocr/match'
import { assembleSkills, parseSkillFrame, parseSkillLines } from '@/lib/ocr/parse'
import { bundle, dictionary, skillByName } from '../../support/masterFixture'

const candidates = buildCandidates(bundle, dictionary)
const id = (name: string) => skillByName(name).id

describe('parseSkillLines（AC-2・AC-3・AC-6）', () => {
  it('名前と Lv の行を、並びを保ってスキルにする', () => {
    expect(parseSkillLines('見切り Lv3\n渾身 Lv1\n精霊の加護 Lv1\n', candidates)).toEqual([
      { skillId: id('見切り'), level: 3 },
      { skillId: id('渾身'), level: 1 },
      { skillId: id('精霊の加護'), level: 1 },
    ])
  })

  it('全角の Ｌｖ３ と、名前の認識誤りを読む', () => {
    expect(parseSkillLines('納刀衡 Ｌｖ２', candidates)).toEqual([
      { skillId: id('納刀術'), level: 2 },
    ])
  })

  it('未知の名前・Lv なし・Lv が最大超えの行は null で位置に残す', () => {
    const max = skillByName('見切り').maxLevel
    const text = [
      '見切り Lv1',
      'ABCDEFG Lv1',
      '渾身',
      `見切り Lv${max + 1}`,
      '見切り Lv0',
      '精霊の加護 Lv1',
    ].join('\n')
    expect(parseSkillLines(text, candidates)).toEqual([
      { skillId: id('見切り'), level: 1 },
      null,
      null,
      null,
      null,
      { skillId: id('精霊の加護'), level: 1 },
    ])
  })

  it('空白だけの行は数えない', () => {
    expect(parseSkillLines('\n  \n見切り Lv2\r\n\n', candidates)).toEqual([
      { skillId: id('見切り'), level: 2 },
    ])
    expect(parseSkillLines('', candidates)).toEqual([])
  })
})

describe('枠ごとの読み取りの組み立て（AC-7）', () => {
  const atk = { skillId: id('見切り') as SkillId, level: 3 }
  const crit = { skillId: id('渾身') as SkillId, level: 1 }

  it('枠が [読めた・読めない・空] なら、読めない枠を null で残し、末尾の空は入れない', () => {
    expect(assembleSkills([atk, null, 'empty'])).toEqual([atk, null])
  })

  it('途中の空の枠は null にし、以降の枠を前に詰めない', () => {
    expect(assembleSkills([atk, 'empty', crit])).toEqual([atk, null, crit])
  })

  it('読めない枠があっても、以降の枠は元の位置に残る', () => {
    expect(assembleSkills([null, atk, crit])).toEqual([null, atk, crit])
  })

  it('すべて空なら空配列', () => {
    expect(assembleSkills(['empty', 'empty', 'empty'])).toEqual([])
  })

  it('枠1つの認識結果を解釈し、読めなければ null（推測で埋めない）', () => {
    expect(parseSkillFrame('見切り Lv3', candidates)).toEqual(atk)
    expect(parseSkillFrame('身 Lv1', candidates)).toBeNull()
    expect(parseSkillFrame('', candidates)).toBeNull()
  })
})
