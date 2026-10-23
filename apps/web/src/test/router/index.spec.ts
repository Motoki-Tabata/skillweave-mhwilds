import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { installTitleHook, routes } from '@/router'

// 受入基準 4（護石の画面を /charms で開き、ページのタイトルを出す。D14）
describe('router', () => {
  const original = document.title
  afterEach(() => {
    document.title = original
  })

  it('/charms のルート（名前 charms）を持つ', () => {
    expect(routes.find((route) => route.path === '/charms')?.name).toBe('charms')
  })

  it('遷移のたびに meta.title を document.title に書く', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    installTitleHook(router)
    await router.push('/charms')
    expect(document.title).toBe('護石 | SkillWeave')
    await router.push('/')
    expect(document.title).toBe('装備検索 | SkillWeave')
  })
})
