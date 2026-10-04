import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ConfigEnv } from 'vitest/config'
import config from '../../vitest.config'

const TEST_DIR = import.meta.dirname

function includeFor(mode: string): string[] {
  const env: ConfigEnv = { mode, command: 'serve', isSsrBuild: false, isPreview: false }
  const resolved = typeof config === 'function' ? config(env) : config
  if (resolved instanceof Promise) throw new Error('同期の設定を想定している')
  return resolved.test?.include ?? []
}

function specFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? specFiles(join(dir, e.name))
      : e.name.endsWith('.spec.ts')
        ? [join(dir, e.name)]
        : [],
  )
}

// 受入基準 14（時間の測定を CI の検証コマンドで実行せず、CI のテストで時間を検査しない）
describe('[AC14] 時間の測定は CI のテストから分かれている', () => {
  it('通常のテスト実行（test:unit・test:coverage の mode）は *.spec.ts だけを対象にし、*.measure.ts を含めない', () => {
    for (const mode of ['test', 'development']) {
      const include = includeFor(mode)
      expect(include).toEqual(['src/test/**/*.spec.ts'])
    }
  })

  it('測定（--mode measure）だけが *.measure.ts を対象にする', () => {
    expect(includeFor('measure')).toEqual(['src/test/**/*.measure.ts'])
  })

  it('*.spec.ts は時間の API を使わない（時間を検査しない）', () => {
    const forbidden = ['perfor' + 'mance.', 'Date' + '.now', 'new ' + 'Date', 'testTime' + 'out']
    for (const file of specFiles(TEST_DIR)) {
      const text = readFileSync(file, 'utf8')
      const used = forbidden.filter(
        (word) => text.includes(word) && !file.endsWith('ciTiming.spec.ts'),
      )
      expect(used, file).toEqual([])
    }
  })
})
