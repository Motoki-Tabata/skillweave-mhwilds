import type { MasterBundle, MasterDictionary } from '@swv/data'
import { http } from '@/lib/http'
import { LoadError } from '@/lib/solver/client'

export const MASTER_FAILED_MESSAGE = 'マスターデータを取得できませんでした。'
export const DICTIONARY_FAILED_MESSAGE = '名前の辞書を取得できませんでした。'
export const UNKNOWN_FAILED_MESSAGE = 'データの読み込みに失敗しました。'

/** マスターと ja の辞書の URL（同一オリジンの静的ファイル。版はビルド時に埋め込む）。 */
export function masterUrl(): string {
  return `${import.meta.env.BASE_URL}master-${__SWV_MASTER__.version}.json`
}

export function dictionaryUrl(): string {
  return `${import.meta.env.BASE_URL}master-${__SWV_MASTER__.version}.ja.json`
}

async function fetchOrFail<T>(url: string, kind: 'master' | 'dictionary'): Promise<T> {
  try {
    return await http.get<T>(url)
  } catch {
    const message = kind === 'master' ? MASTER_FAILED_MESSAGE : DICTIONARY_FAILED_MESSAGE
    throw new LoadError(kind, message)
  }
}

/** マスターと辞書を並行して取得する。失敗の原因は `LoadError.kind` で区別する。 */
export async function fetchMasterData(): Promise<{
  bundle: MasterBundle
  dictionary: MasterDictionary
}> {
  const [bundle, dictionary] = await Promise.all([
    fetchOrFail<MasterBundle>(masterUrl(), 'master'),
    fetchOrFail<MasterDictionary>(dictionaryUrl(), 'dictionary'),
  ])
  return { bundle, dictionary }
}

/** 読み込みの失敗を、画面に出す原因の文言にする。 */
export function loadFailureMessage(error: unknown): string {
  return error instanceof LoadError && error.kind !== 'unknown'
    ? error.message
    : UNKNOWN_FAILED_MESSAGE
}
