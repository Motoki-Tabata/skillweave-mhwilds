import type { Page } from '@playwright/test'

const ME_URL = '**/api/auth/me'
const BUILDS_URL = '**/api/builds'
const BUILD_URL = '**/api/builds/*'
export const FIXED_TIME = '2026-01-01T00:00:00Z'

/** 契約の BuildPayload.charm の3つの形（護石なし・鑑定護石・生産護石）。 */
export type FakeCharm =
  null | { id: string; payload: Record<string, unknown> } | { kind: 'crafted'; charmId: string }

export interface FakeBuild {
  id: string
  name: string
  masterVersion: string
  payload: {
    weapon: { kind: 'master'; weaponId: string }
    armor: Record<'head' | 'chest' | 'arms' | 'waist' | 'legs', string | null>
    charm: FakeCharm
    decorations: []
    skills: []
    freeSlots: []
    activeConditionIds: string[]
  }
  schemaVersion: 1
  version: number
  createdAt: string
  updatedAt: string
}

export function json(status: number, body: unknown) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) }
}

/** /api/auth/me と /api/builds/** を、テストの中のメモリ上の状態で差し替える。 */
export async function mockApi(page: Page, initial: { loggedIn: boolean; builds?: FakeBuild[] }) {
  const state = {
    loggedIn: initial.loggedIn,
    builds: [...(initial.builds ?? [])],
    /** true のあいだ、PATCH は 409 を返す */
    conflictOnPatch: false,
    /** PATCH が 409 を返すときに、サーバー側で行う変更 */
    onConflict: undefined as undefined | (() => void),
    listCalls: 0,
    posts: [] as FakeBuild[],
  }
  await page.route(ME_URL, (route) =>
    state.loggedIn
      ? route.fulfill(json(200, { displayName: 'モンハン太郎' }))
      : route.fulfill({ status: 401 }),
  )
  await page.route(BUILDS_URL, (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      state.listCalls++
      return route.fulfill(json(200, state.builds))
    }
    const body = request.postDataJSON() as Pick<
      FakeBuild,
      'id' | 'name' | 'masterVersion' | 'payload' | 'schemaVersion'
    >
    const build: FakeBuild = { ...body, version: 0, createdAt: FIXED_TIME, updatedAt: FIXED_TIME }
    state.posts.push(build)
    state.builds = [build, ...state.builds]
    return route.fulfill(json(201, build))
  })
  await page.route(BUILD_URL, (route) => {
    if (route.request().method() === 'PATCH' && state.conflictOnPatch) {
      state.onConflict?.()
      return route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        body: JSON.stringify({ status: 409 }),
      })
    }
    return route.fulfill({ status: 500 })
  })
  return state
}
