import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('エントリ（受入基準 15）', () => {
  it('src/main/index.ts は import 文を持たない', async () => {
    const text = await readFile(fileURLToPath(new URL('../main/index.ts', import.meta.url)), 'utf8')
    expect(text).not.toMatch(/^\s*(import|export\s+.*\s+from)\b/m)
  })
})
