/**
 * バックエンド API 用の fetch ラッパー。
 *
 * axios は使わない。外部依存を1つ減らすことで npm サプライチェーン
 * 攻撃の攻撃面を減らす（プロジェクト方針）。
 *
 * - credentials: 'include' でセッション Cookie を送受信する
 * - Spring Security の CookieCsrfTokenRepository が発行する XSRF-TOKEN
 *   Cookie を読み、状態変更系メソッド（POST/PUT/DELETE/PATCH）のリクエストに
 *   X-XSRF-TOKEN ヘッダとして載せる。axios の自動 XSRF 機能は使わない方針の
 *   ため、ここで唯一の対応箇所とする（vehicle-intake-management から流用）。
 */

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown,
  ) {
    super(`HTTP ${status} ${statusText}`)
    this.name = 'HttpError'
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE'])

function readCookie(name: string): string | null {
  const match = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie)
  return match ? decodeURIComponent(match[1]) : null
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')

  if (!SAFE_METHODS.has(method)) {
    const csrfToken = readCookie('XSRF-TOKEN')
    if (csrfToken) {
      headers.set('X-XSRF-TOKEN', csrfToken)
    }
    if (init.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
  }

  const response = await fetch(path, {
    ...init,
    method,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    const body = await response.text().catch(() => null)
    throw new HttpError(response.status, response.statusText, body)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export const http = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: 'GET' }),
  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, {
      ...init,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  put: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, {
      ...init,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: 'DELETE' }),
}
