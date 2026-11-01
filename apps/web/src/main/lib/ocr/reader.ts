import type { MasterBundle, MasterDictionary } from '@swv/data'
import { buildCandidates } from '@/lib/ocr/match'
import { parseSkillLines } from '@/lib/ocr/parse'
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
 */
async function createRecognizer(): Promise<{
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
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
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
  const recognizer = await createRecognizer()
  return {
    async read(image: Blob): Promise<CharmReadResult> {
      const prepared = await prepareImage(image)
      const text = await recognizer.recognize(prepared.skillImage)
      return {
        skills: parseSkillLines(text, candidates),
        slots: readSlots(prepared.slotPixels, prepared.slotWidth, prepared.slotHeight),
        lines: text.split(/\r?\n/).filter((line) => line.trim() !== ''),
      }
    },
    terminate: recognizer.terminate,
  }
}
