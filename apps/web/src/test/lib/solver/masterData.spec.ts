import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoadError } from '@/lib/solver/client'
import {
  DICTIONARY_FAILED_MESSAGE,
  MASTER_FAILED_MESSAGE,
  UNKNOWN_FAILED_MESSAGE,
  dictionaryUrl,
  fetchMasterData,
  loadFailureMessage,
  masterUrl,
} from '@/lib/solver/masterData'
import { createFetchStub, makeBundle, makeDictionary } from '../../support/fixtures'

// 受入基準 1・2（マスターと辞書の取得、失敗の原因）
describe('masterData', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('同一オリジンの静的ファイル（版つき）の URL を取る', async () => {
    const fetchMock = vi.fn(createFetchStub())
    vi.stubGlobal('fetch', fetchMock)
    await fetchMasterData()
    const urls = fetchMock.mock.calls.map(([url]) => String(url)).sort()
    expect(urls).toEqual([dictionaryUrl(), masterUrl()].sort())
    expect(masterUrl()).toBe(`/master-${__SWV_MASTER__.version}.json`)
    expect(dictionaryUrl()).toBe(`/master-${__SWV_MASTER__.version}.ja.json`)
    expect(urls.every((url) => url.startsWith('/'))).toBe(true)
  })

  it('マスターと辞書を返す', async () => {
    vi.stubGlobal('fetch', vi.fn(createFetchStub()))
    const data = await fetchMasterData()
    expect(data.bundle).toEqual(makeBundle())
    expect(data.dictionary).toEqual(makeDictionary())
  })

  it('マスターの取得失敗は master の LoadError', async () => {
    vi.stubGlobal('fetch', vi.fn(createFetchStub({ failMaster: true })))
    const error = await fetchMasterData().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(LoadError)
    expect(error).toMatchObject({ kind: 'master', message: MASTER_FAILED_MESSAGE })
  })

  it('辞書の取得失敗は dictionary の LoadError', async () => {
    vi.stubGlobal('fetch', vi.fn(createFetchStub({ failDictionary: true })))
    const error = await fetchMasterData().catch((e: unknown) => e)
    expect(error).toMatchObject({ kind: 'dictionary', message: DICTIONARY_FAILED_MESSAGE })
  })

  describe('loadFailureMessage', () => {
    it('原因が分かる LoadError はその文言', () => {
      expect(loadFailureMessage(new LoadError('highs', 'h'))).toBe('h')
      expect(loadFailureMessage(new LoadError('master', 'm'))).toBe('m')
    })

    it('unknown の LoadError・それ以外の例外は、原因を特定できない文言', () => {
      expect(loadFailureMessage(new LoadError('unknown', 'x'))).toBe(UNKNOWN_FAILED_MESSAGE)
      expect(loadFailureMessage(new Error('boom'))).toBe(UNKNOWN_FAILED_MESSAGE)
      expect(UNKNOWN_FAILED_MESSAGE).toBe('データの読み込みに失敗しました。')
    })
  })
})
