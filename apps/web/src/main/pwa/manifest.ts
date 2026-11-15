import { rasterize, iconSvg, type IconKind } from './icon'
import { encodePng } from './png'

export const THEME_COLOR = '#0f1317'

/** ビルドが出す asset（`fileName` は dist の中の相対パス）。 */
export interface BuildFile {
  fileName: string
  source: string | Uint8Array
}

interface PngIcon {
  fileName: string
  size: number
  kind: IconKind
}

const PNG_ICONS: PngIcon[] = [
  { fileName: 'icons/icon-192.png', size: 192, kind: 'any' },
  { fileName: 'icons/icon-512.png', size: 512, kind: 'any' },
  { fileName: 'icons/icon-maskable-512.png', size: 512, kind: 'maskable' },
]

export function buildManifest(base: string) {
  return {
    name: 'SkillWeave（非公式の二次創作）',
    short_name: 'SkillWeave',
    lang: 'ja',
    start_url: base,
    scope: base,
    display: 'standalone',
    theme_color: THEME_COLOR,
    background_color: THEME_COLOR,
    icons: PNG_ICONS.map(({ fileName, size, kind }) => ({
      src: `${base}${fileName}`,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: kind,
    })),
  }
}

/** マニフェスト・SVG・PNG のアイコンを作る（ビルドのたびに生成し、リポジトリには置かない）。 */
export async function buildPwaAssets(base: string): Promise<BuildFile[]> {
  const pngs = await Promise.all(
    PNG_ICONS.map(async ({ fileName, size, kind }) => ({
      fileName,
      source: await encodePng(size, size, rasterize(kind, size)),
    })),
  )
  return [
    {
      fileName: 'manifest.webmanifest',
      source: `${JSON.stringify(buildManifest(base), null, 2)}\n`,
    },
    { fileName: 'icons/icon.svg', source: iconSvg() },
    ...pngs,
  ]
}
