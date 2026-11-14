import type { MasterBundle, MasterDictionary } from '@swv/data'
import { buildCandidates, buildCharWhitelist } from '@/lib/ocr/match'
import { assembleSkills, parseSkillFrame, type FrameReading } from '@/lib/ocr/parse'
import { prepareImage } from '@/lib/ocr/preprocess'
import { readSlots } from '@/lib/ocr/slots'
import type { CharmReader, CharmReadResult } from '@/lib/ocr/types'

/** worker・WASM コア・言語データは、vite.config.ts のプラグインが自オリジンの固定のパスで配信する。 */
function tesseractPaths(): { workerPath: string; corePath: string; langPath: string } {
  const base = import.meta.env.BASE_URL
  return {
    workerPath: `${base}tesseract/worker.min.js`,
    corePath: `${base}tesseract/core`,
    langPath: `${base}tesseract/lang`,
  }
}

/**
 * Tesseract.js の worker を作る。既定の取得先（jsDelivr）を使わせないよう、3つのパスを必ず渡す。
 * Blob の URL を経由せず（workerBlobURL: false）、言語データは IndexedDB に保存しない（cacheMethod: 'none'）。
 * tesseract.js は動的 import にして、既存の画面のバンドルに入れない。
 * setParameters が失敗したら、作りかけの worker を終了してから例外を投げ直す（D9）。
 */
async function createRecognizer(whitelist: string): Promise<{
  recognize: (image: Blob) => Promise<string>
  terminate: () => Promise<void>
}> {
  const { createWorker, OEM, PSM } = await import('tesseract.js')
  const worker = await createWorker('jpn', OEM.LSTM_ONLY, {
    ...tesseractPaths(),
    workerBlobURL: false,
    gzip: true,
    cacheMethod: 'none',
  })
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
      tessedit_char_whitelist: whitelist,
    })
  } catch (error) {
    await worker.terminate().catch(() => undefined)
    throw error
  }
  return {
    recognize: async (image) => (await worker.recognize(image)).data.text,
    terminate: async () => {
      await worker.terminate()
    },
  }
}

/** 護石の詳細画面の画像からスキルとスロットを読む。画像はブラウザ内だけで処理し、どこへも送らない。 */
export async function createCharmReader(
  bundle: MasterBundle,
  dictionary: MasterDictionary,
): Promise<CharmReader> {
  const candidates = buildCandidates(bundle, dictionary)
  const recognizer = await createRecognizer(buildCharWhitelist(candidates))
  return {
    async read(image: Blob): Promise<CharmReadResult> {
      const prepared = await prepareImage(image)
      const readings: FrameReading[] = []
      const lines: string[] = []
      for (const frame of prepared.skillFrames) {
        if (frame.empty) {
          readings.push('empty')
          continue
        }
        const text = await recognizer.recognize(frame.image)
        lines.push(...text.split(/\r?\n/).filter((line) => line.trim() !== ''))
        readings.push(parseSkillFrame(text, candidates))
      }
      return {
        skills: assembleSkills(readings),
        slots: readSlots(prepared.slotPixels, prepared.slotWidth, prepared.slotHeight),
        lines,
      }
    },
    terminate: recognizer.terminate,
  }
}
