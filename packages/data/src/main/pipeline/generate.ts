import { fileURLToPath } from 'node:url'
import { MASTER_VERSION, MHDB_COMMIT, MHDB_REPOSITORY } from './config.ts'
import { convert } from './convert.ts'
import { fetchMhdb } from './fetch.ts'
import { formatList } from './format.ts'
import type { FetchFn } from './fetch.ts'
import { diffOutput, outputContents, writeOutput } from './output.ts'
import { applyOverlays, formatOverlayError, readOverlayFiles } from './overlay.ts'
import { serializeBundle, serializeDictionary } from './serialize.ts'
import { formatViolation, validate } from './validate.ts'

/** `packages/data/` の絶対パス */
const PACKAGE_DIR = fileURLToPath(new URL('../../../', import.meta.url))

export interface RunOptions {
  /** true なら dist/ を書かず、既存のファイルとバイト単位で比べる */
  check: boolean
  fetchFn?: FetchFn
  packageDir?: string
  log?: (message: string) => void
}

/** 取得→変換→オーバーレイ→検証→出力を順に実行する。失敗は Error を投げる（dist/ には何も書かない） */
export async function run(options: RunOptions): Promise<void> {
  const packageDir = options.packageDir ?? PACKAGE_DIR
  const log = options.log ?? console.log
  const fetchFn: FetchFn = options.fetchFn ?? ((url) => fetch(url))

  const input = await fetchMhdb({
    repository: MHDB_REPOSITORY,
    commit: MHDB_COMMIT,
    cacheRoot: `${packageDir}.cache/mhdb`,
    fetchFn,
  })
  const converted = convert(input, {
    repository: MHDB_REPOSITORY,
    commit: MHDB_COMMIT,
    version: MASTER_VERSION,
  })

  const overlayResult = applyOverlays(
    await readOverlayFiles(`${packageDir}overlays`),
    converted.bundle,
    converted.mismatches,
  )
  if (!overlayResult.ok) {
    const lines = overlayResult.errors.map(formatOverlayError)
    throw new Error(formatList(`オーバーレイのエラー（${lines.length}件）`, lines))
  }

  const violations = validate({
    bundle: overlayResult.bundle,
    dictionaries: converted.dictionaries,
    mismatches: overlayResult.mismatches,
  })
  if (violations.length > 0) {
    const lines = violations.map(formatViolation)
    throw new Error(formatList(`検証の違反（${lines.length}件）`, lines))
  }
  log('検証の違反: 0件')

  const contents = outputContents(MASTER_VERSION, {
    bundle: serializeBundle(overlayResult.bundle),
    ja: serializeDictionary(converted.dictionaries.ja),
    en: serializeDictionary(converted.dictionaries.en),
  })
  const distDir = `${packageDir}dist`

  if (options.check) {
    const diffs = await diffOutput(distDir, contents)
    if (diffs.length > 0) {
      const lines = diffs.map(
        (d) => `${d.name}（${d.state === 'missing' ? '存在しません' : '内容が異なります'}）`,
      )
      throw new Error(formatList('dist/ が再生成の結果と一致しません', lines))
    }
    log('dist/ は再生成の結果とバイト単位で一致しています')
    return
  }

  const { written, removed } = await writeOutput(distDir, contents)
  log(`書いたファイル: ${written.join(', ') || 'なし'}`)
  if (removed.length > 0) log(`削除した旧版のファイル: ${removed.join(', ')}`)
}

if (import.meta.main) {
  try {
    await run({ check: process.argv.includes('--check') })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
