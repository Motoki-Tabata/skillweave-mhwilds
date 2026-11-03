import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  installDomPolyfills,
  loggedInAuth,
  mountApp,
  restoreStubs,
  stubBackend,
  textOf,
} from '../support/mount'
import type { Mounted } from '../support/mount'

// 030 privacy-notice の AC-1・AC-3〜AC-11、032 privacy-analytics の AC-1〜AC-8
describe('PrivacyView（/privacy）', () => {
  let mounted: Mounted | null = null

  const scrollTo = vi.fn()
  beforeAll(installDomPolyfills)
  beforeEach(() => {
    scrollTo.mockClear()
    // jsdom には window.scrollTo の実装が無い
    vi.stubGlobal('scrollTo', scrollTo)
  })
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
    vi.restoreAllMocks()
  })

  async function open(options: Parameters<typeof mountApp>[0] = {}): Promise<void> {
    mounted = await mountApp({ path: '/privacy', ...options })
    await vi.waitFor(() => {
      if (mounted?.wrapper.find('h1').exists() !== true) throw new Error('no h1')
    })
  }

  function main(): string {
    return textOf(document.body)
  }

  function link(name: string): HTMLAnchorElement {
    const found = Array.from(document.body.querySelectorAll<HTMLAnchorElement>('a')).find((a) =>
      textOf(a).includes(name),
    )
    if (found === undefined) throw new Error(`リンク「${name}」が無い`)
    return found
  }

  describe('AC-1: ログインの状態・マスターの状態にかかわらず同じ表記とタイトル', () => {
    it('認証状態の取得不能（既定）でも h1 と本文が出て、タイトルが付く', async () => {
      stubBackend()
      await open()
      expect(textOf(mounted!.wrapper.get('h1').element)).toBe('プライバシー')
      expect(main()).toContain('Discord でのログイン')
      expect(document.title).toBe('プライバシー | SkillWeave')
    })

    it('ログイン中でも同じ h1 が出る', async () => {
      stubBackend()
      await open({ authApi: loggedInAuth() })
      expect(textOf(mounted!.wrapper.get('h1').element)).toBe('プライバシー')
      expect(main()).toContain('サーバーに保存するデータ')
    })

    it('マスターの読込失敗でも本文が出る', async () => {
      stubBackend({ failMaster: true })
      await open()
      // この画面はマスターを読まないので、読込の結果にかかわらず本文が出る
      expect(textOf(mounted!.wrapper.get('h1').element)).toBe('プライバシー')
      expect(main()).toContain('データの削除')
    })
  })

  describe('本文', () => {
    it('AC-3: Google への送信を書き、FAQ へ新しいタブでリンクし、用途を断定しない', async () => {
      stubBackend()
      await open()
      const text = main()
      expect(text).toContain('IP アドレス・要求の URL・User-Agent などが Google に届きます')
      const a = link('Google Fonts の FAQ')
      expect(a.getAttribute('href')).toBe('https://fonts.google.com/faq#privacy')
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
      expect(textOf(a)).toContain('（新しいタブで開く）')
      expect(text).not.toMatch(/広告に(利用|使)|解析に(利用|使)|学習/)
    })

    it('AC-4: Discord の ID と表示名だけで、メールとトークンを持たない', async () => {
      stubBackend()
      await open()
      const text = main()
      expect(text).toContain('Discord の ID と表示名だけ')
      expect(text).toContain('メールアドレスは受け取らず、アクセストークンは保持しません')
      expect(text).toContain('表示名（最長 30 日）')
      expect(text).toContain('他の項目は保存しません')
    })

    it('AC-5: 日本国外のデータベースに保存し、IP を保存しない', async () => {
      stubBackend()
      await open()
      const text = main()
      expect(text).toContain('護石・構成・個体差のある武器・共有')
      expect(text).toContain('データベース（シンガポールなど日本国外）')
      expect(text).toContain('データベースに IP アドレスは保存しません')
    })

    it('AC-6: 削除してもデータが残り、完全な消去は連絡先へ依頼する', async () => {
      stubBackend()
      await open()
      expect(main()).toContain('画面から削除しても、データはデータベース上に残ります')
      expect(main()).toContain('完全に消去したいときは、下の連絡先へ依頼してください')
    })

    it('AC-7: 共有は URL を知っていれば読め、Discord の情報は含まれない', async () => {
      stubBackend()
      await open()
      expect(main()).toContain('名前を含めて、URL を知っていれば誰でも読めます')
      expect(main()).toContain('Discord の ID や表示名は含まれません')
    })

    it('AC-8: 端末内のデータ・取り込み・ブラウザ内計算を書く', async () => {
      stubBackend()
      await open()
      const text = main()
      expect(text).toContain('装備検索の計算はブラウザ内で行います')
      expect(text).toContain('護石と個体差のある武器の下書き')
      expect(text).toContain('テーマの設定')
      expect(text).toContain('ログイン後に戻る画面')
      expect(text).toContain('ログインして取り込むとサーバーへ送られます')
    })

    it('AC-9: Cookie の用途を書き、広告を入れていない', async () => {
      stubBackend()
      await open()
      const text = main()
      expect(text).toContain('SESSION: ログインの維持')
      expect(text).toContain('XSRF-TOKEN: 不正な要求の防止')
      expect(text).toContain('広告は入れていません')
      expect(text).not.toMatch(/アクセス解析[^。]*入れていません/)
    })

    it('AC-10: ログの記録を書き、30 日は Google Cloud だけ、Cloudflare は方針へリンクする', async () => {
      stubBackend()
      await open()
      const text = main()
      expect(text).toContain('Cloudflare と Google Cloud のアクセスログ')
      expect(text).toContain('IP アドレス・User-Agent・参照元・要求の URL')
      expect(text).toContain('Google Cloud のログの保持期間は、既定で 30 日です')
      expect(text.match(/30 日/g)?.length).toBe(2) // 表示名の最長 30 日と Google Cloud の既定
      const logStart = text.indexOf('Cloudflare と Google Cloud のアクセスログ')
      const logBody = text.slice(logStart, text.indexOf('を確認してください', logStart))
      expect(logBody).toContain('Cloudflare の処理については') // 節の本文を切り出せている
      const withoutGoogleRetention = logBody.replace(
        'Google Cloud のログの保持期間は、既定で 30 日です',
        '',
      )
      expect(withoutGoogleRetention).not.toMatch(/\d/)
      const a = link('Cloudflare のプライバシーポリシー')
      expect(a.getAttribute('href')).toBe('https://www.cloudflare.com/privacypolicy/')
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
      expect(textOf(a)).toContain('（新しいタブで開く）')
    })

    it('AC-11: 連絡先を mailto で出し、最終更新日を書く', async () => {
      stubBackend()
      await open()
      expect(link('contact@skillweave.app').getAttribute('href')).toBe(
        'mailto:contact@skillweave.app',
      )
      expect(main()).toMatch(/最終更新日: \d{4}\/\d{2}\/\d{2}/)
    })
  })

  describe('032 アクセス解析の節', () => {
    function analyticsSection(): string {
      const h2 = Array.from(document.body.querySelectorAll('h2')).find(
        (h) => textOf(h) === 'アクセス解析',
      )
      const section = h2?.closest('section')
      if (section === null || section === undefined) throw new Error('アクセス解析の節が無い')
      return textOf(section)
    }

    function analyticsLink(): HTMLAnchorElement {
      const a = Array.from(document.body.querySelectorAll('h2'))
        .find((h) => textOf(h) === 'アクセス解析')
        ?.closest('section')
        ?.querySelector('a')
      if (a === null || a === undefined) throw new Error('節のリンクが無い')
      return a
    }

    it('032 AC-1: アクセス数と表示の速さのために Cloudflare Web Analytics を使う', async () => {
      stubBackend()
      await open()
      expect(analyticsSection()).toContain(
        'アクセス数と表示の速さを知るために、Cloudflare Web Analytics を使っています',
      )
    })

    it('032 AC-2: 送る内容と集計する項目を書く', async () => {
      stubBackend()
      await open()
      const text = analyticsSection()
      expect(text).toContain(
        'ブラウザは、開いたページの URL と読み込みの時間などの計測値を Cloudflare へ送ります',
      )
      expect(text).toContain(
        'Cloudflare は、国・ページのパス・参照元・ブラウザ・OS・端末の種類を集計します',
      )
    })

    it('032 AC-3: IP アドレスが届くと書き、保存の有無とクエリ文字列には触れない', async () => {
      stubBackend()
      await open()
      const text = analyticsSection()
      expect(text).toContain('この通信でも IP アドレスが Cloudflare に届きます')
      expect(text).not.toContain('保存')
      expect(text).not.toContain('クエリ')
    })

    it('032 AC-4: Cookie と localStorage を使わず、7 日間保持して約 10% に集約する', async () => {
      stubBackend()
      await open()
      const text = analyticsSection()
      expect(text).toContain(
        'Cloudflare の説明では、この計測に Cookie と localStorage を使いません',
      )
      expect(text).toContain('詳細なデータは 7 日間保持され、その後は約 10% に集約されます')
    })

    it('032 AC-5: Cloudflare Web Analytics の説明へ新しいタブでリンクする', async () => {
      stubBackend()
      await open()
      const a = analyticsLink()
      expect(textOf(a)).toContain('Cloudflare Web Analytics の説明')
      expect(a.getAttribute('href')).toBe('https://www.cloudflare.com/web-analytics/')
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
      expect(textOf(a)).toContain('（新しいタブで開く）')
    })

    it('032 AC-6: アクセス解析を入れていない文が無く、Cookie の用途と広告なしは残る', async () => {
      stubBackend()
      await open()
      const text = main()
      expect(text).not.toMatch(/アクセス解析[^。]*入れていません/)
      expect(text).toContain('SESSION: ログインの維持')
      expect(text).toContain('XSRF-TOKEN: 不正な要求の防止')
      expect(text).toContain('広告は入れていません')
    })

    it('032 AC-7: アクセスログの導入文が End Users の項を案内し、期間は書かない', async () => {
      stubBackend()
      await open()
      const text = main()
      expect(text).toContain('Cloudflare の処理については')
      expect(text).toContain('「End Users」の項を確認してください')
      expect(text).toContain('このポリシーは個々のサイトの扱いを定めるものではありません')
      const a = link('Cloudflare のプライバシーポリシー')
      expect(a.getAttribute('href')).toBe('https://www.cloudflare.com/privacypolicy/')
    })

    it('032 AC-8: 最終更新日は変えた日の日付', async () => {
      stubBackend()
      await open()
      expect(main()).toContain('最終更新日: 2026/11/03')
    })

    it('032 AC-1（節の順）: h2 の並びはアクセス解析を Web フォントとアクセスログの間に置く', async () => {
      stubBackend()
      await open()
      const headings = Array.from(document.body.querySelectorAll('h2')).map((h) => textOf(h))
      expect(headings).toEqual([
        'この端末に保存するデータ',
        'Discord でのログイン',
        'サーバーに保存するデータ',
        'データの削除',
        '共有',
        'Cookie',
        'Web フォント',
        'アクセス解析',
        'アクセスログ',
        '連絡先',
      ])
    })
  })

  it('AC-1（遷移）: h1 にフォーカスを移し、画面の先頭へ戻す', async () => {
    stubBackend()
    await open()
    expect(document.activeElement).toBe(mounted!.wrapper.get('h1').element)
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })
})
