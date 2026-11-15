import { FONTS_CSS_ORIGIN, FONTS_STATIC_ORIGIN, type PrecacheConfig } from './config'

// fetch の振り分け（plan.md D6）。'ignore' は respondWith を呼ばず、ブラウザが普通にネットワークへ送る。
export type Route = 'ignore' | 'shell' | 'precache' | 'ocr' | 'fonts-static' | 'fonts-css'

function isDocumentPath(pathname: string): boolean {
  return !pathname.slice(pathname.lastIndexOf('/') + 1).includes('.')
}

function classifySameOrigin(request: Request, url: URL, config: PrecacheConfig): Route {
  const { pathname } = url
  if (pathname.startsWith(`${config.base}api/`)) return 'ignore'
  if (request.mode === 'navigate' && isDocumentPath(pathname)) return 'shell'
  if (config.urls.includes(pathname)) return 'precache'
  if (pathname.startsWith(`${config.base}tesseract/`) && pathname in config.ocrHashes) return 'ocr'
  return 'ignore'
}

export function classify(request: Request, origin: string, config: PrecacheConfig): Route {
  if (request.method !== 'GET') return 'ignore'
  const url = new URL(request.url)
  if (url.origin === origin) return classifySameOrigin(request, url, config)
  if (url.origin === FONTS_STATIC_ORIGIN) return 'fonts-static'
  if (url.origin === FONTS_CSS_ORIGIN) return 'fonts-css'
  return 'ignore'
}
