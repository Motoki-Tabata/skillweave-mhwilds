import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** クラス名を結合し、Tailwind の競合するクラスは後のものを残す（shadcn-vue の部品が使う）。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
