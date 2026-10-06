/// <reference types="vite/client" />

/** vite.config.ts が packages/data/dist/ のマスターから埋め込む、マスターの版と取得元。 */
declare const __SWV_MASTER__: {
  version: string
  source: { repository: string; commit: string }
}
