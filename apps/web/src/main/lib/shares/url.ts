import type { Router } from 'vue-router'

/** 共有の URL（`location.origin` と、ルート `shared-build` の `href`）。 */
export function shareUrl(
  router: Router,
  shortId: string,
  origin: string = location.origin,
): string {
  return origin + router.resolve({ name: 'shared-build', params: { shortId } }).href
}

/** URL をクリップボードへ写す。使えない・拒否されたときは false（例外にしない）。 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // clipboard が undefined のとき（TypeError）も拒否されたときも失敗として扱う
    return false
  }
}
