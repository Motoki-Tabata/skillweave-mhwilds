import { describe, expect, it } from 'vitest'
import {
  BUILD_NAME_EMPTY_MESSAGE,
  BUILD_NAME_TOO_LONG_MESSAGE,
  codePointLength,
  defaultBuildName,
  validateBuildName,
} from '@/lib/builds/name'

// 空白類・サロゲートペアはコードポイントから組み立てる
const IDEOGRAPHIC_SPACE = String.fromCodePoint(0x3000)
const NBSP = String.fromCodePoint(0x00a0)
const SURROGATE_CHAR = String.fromCodePoint(0x20bb7)

describe('validateBuildName', () => {
  it('AC-6: 前後の空白（全角・NBSP を含む）を除いた名前を返す', () => {
    expect(validateBuildName(`${IDEOGRAPHIC_SPACE} a b ${NBSP}`)).toEqual({ ok: true, name: 'a b' })
  })

  it('AC-6: 空・空白だけの名前は送らない', () => {
    expect(validateBuildName('')).toEqual({ ok: false, message: BUILD_NAME_EMPTY_MESSAGE })
    expect(validateBuildName(`  ${IDEOGRAPHIC_SPACE}`)).toEqual({
      ok: false,
      message: BUILD_NAME_EMPTY_MESSAGE,
    })
  })

  it('AC-6: 50 コードポイントは通り、51 は送らない（サロゲートペアは 1 文字）', () => {
    expect(validateBuildName(SURROGATE_CHAR.repeat(50)).ok).toBe(true)
    expect(validateBuildName(SURROGATE_CHAR.repeat(51))).toEqual({
      ok: false,
      message: BUILD_NAME_TOO_LONG_MESSAGE,
    })
  })

  it('AC-6: 空白を除いて 50 文字に収まる名前は通る', () => {
    expect(validateBuildName(` ${'a'.repeat(50)} `).ok).toBe(true)
  })
})

describe('defaultBuildName', () => {
  it('AC-1: 「<武器名> 構成<N>」にする', () => {
    expect(defaultBuildName('鉄刀【神楽】', 3)).toBe('鉄刀【神楽】 構成3')
  })

  it('AC-6: 50 コードポイントを超えるときは武器名を切り詰め、サロゲートペアを割らない', () => {
    const name = defaultBuildName(SURROGATE_CHAR.repeat(60), 12)
    expect(codePointLength(name)).toBe(50)
    expect(name.endsWith(' 構成12')).toBe(true)
    expect(validateBuildName(name).ok).toBe(true)
    expect(name.startsWith(SURROGATE_CHAR.repeat(44))).toBe(true)
  })
})
