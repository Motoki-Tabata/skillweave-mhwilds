import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MasterBundle } from '@swv/data'

/**
 * `packages/data/dist/` の現行のマスター（`master-<版>.json`）を読む（plan 決定事項 13）。
 * 辞書（`.ja.json`・`.en.json`）は除き、ちょうど 1 つであることを確かめる。
 * `@swv/data` の exports は型の入口だけで JSON を import できないため、node:fs で読む。
 */
const DIST_DIR = join(import.meta.dirname, '../../../../data/dist')
const MASTER_FILE = /^master-[^.]+(\.[^.]+)*\.json$/
const DICTIONARY_FILE = /\.(ja|en)\.json$/

export function loadRealMaster(): MasterBundle {
  const files = readdirSync(DIST_DIR).filter((f) => MASTER_FILE.test(f) && !DICTIONARY_FILE.test(f))
  const [file, ...rest] = files
  if (file === undefined || rest.length > 0) {
    throw new Error(`packages/data/dist/ のマスターがちょうど 1 つではない: [${files}]`)
  }
  return JSON.parse(readFileSync(join(DIST_DIR, file), 'utf8')) as MasterBundle
}
