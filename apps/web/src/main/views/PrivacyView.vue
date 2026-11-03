<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ExternalTextLink from '@/components/common/ExternalTextLink.vue'

/** 最終更新日。文面を変えたらこの値も変える。 */
const LAST_UPDATED = '2026/11/03'

const heading = ref<HTMLElement | null>(null)

// ルーターに scrollBehavior が無く、前の画面のスクロール位置を引き継ぐため、この画面の中で先頭へ戻す
onMounted(() => {
  heading.value?.focus({ preventScroll: true })
  window.scrollTo(0, 0)
})

const linkClass = 'underline'
const h2Class = 'text-base leading-snug font-bold'
</script>

<template>
  <div class="mx-auto w-full px-4 py-4 md:max-w-[720px] md:px-6 lg:max-w-[1280px]">
    <div class="flex max-w-[720px] flex-col gap-6">
      <header class="flex flex-col gap-2">
        <h1 ref="heading" tabindex="-1" class="text-xl leading-snug font-bold outline-none">
          プライバシー
        </h1>
        <p class="text-sm">
          SkillWeave で、データがどこへ送られ、何が保存され、どう消せるかを説明します。
        </p>
        <p class="text-muted-foreground text-xs">最終更新日: {{ LAST_UPDATED }}</p>
      </header>

      <section class="flex flex-col gap-2 text-sm">
        <h2 :class="h2Class">この端末に保存するデータ</h2>
        <p>装備検索の計算はブラウザ内で行います。次のデータはこの端末に保存します。</p>
        <ul class="list-disc pl-5">
          <li>護石と個体差のある武器の下書き</li>
          <li>テーマの設定</li>
          <li>ログイン後に戻る画面</li>
        </ul>
        <p>下書きは、ログインして取り込むとサーバーへ送られます。</p>
      </section>

      <section class="flex flex-col gap-2 text-sm">
        <h2 :class="h2Class">Discord でのログイン</h2>
        <p>
          ログインで使うのは Discord の ID
          と表示名だけです。メールアドレスは受け取らず、アクセストークンは保持しません。Discord
          から受け取る項目のうち、保存するのは Discord の ID
          と、ログインの維持のために記録する表示名（最長 30 日）だけで、他の項目は保存しません。
        </p>
      </section>

      <section class="flex flex-col gap-2 text-sm">
        <h2 :class="h2Class">サーバーに保存するデータ</h2>
        <p>
          ログイン中に保存した護石・構成・個体差のある武器・共有は、サーバーのデータベース（シンガポールなど日本国外）に保存します。データベースに
          IP アドレスは保存しません。
        </p>
      </section>

      <section class="flex flex-col gap-2 text-sm">
        <h2 :class="h2Class">データの削除</h2>
        <p>
          画面から削除しても、データはデータベース上に残ります。完全に消去したいときは、下の連絡先へ依頼してください。
        </p>
      </section>

      <section class="flex flex-col gap-2 text-sm">
        <h2 :class="h2Class">共有</h2>
        <p>
          共有した構成は、名前を含めて、URL を知っていれば誰でも読めます。共有の内容に Discord の ID
          や表示名は含まれません。
        </p>
      </section>

      <section class="flex flex-col gap-2 text-sm">
        <h2 :class="h2Class">Cookie</h2>
        <ul class="list-disc pl-5">
          <li><code>SESSION</code>: ログインの維持</li>
          <li><code>XSRF-TOKEN</code>: 不正な要求の防止</li>
        </ul>
        <p>広告は入れていません。</p>
      </section>

      <section class="flex flex-col gap-2 text-sm">
        <h2 :class="h2Class">Web フォント</h2>
        <p>
          画面の文字に Google Fonts を使っています。フォントの読み込みで、IP アドレス・要求の
          URL・User-Agent などが Google に届きます。Google での扱いは
          <ExternalTextLink href="https://fonts.google.com/faq#privacy"
            >Google Fonts の FAQ</ExternalTextLink
          >
          を確認してください。
        </p>
      </section>

      <section class="flex flex-col gap-2 text-sm">
        <h2 :class="h2Class">アクセス解析</h2>
        <p>アクセス数と表示の速さを知るために、Cloudflare Web Analytics を使っています。</p>
        <p>
          ブラウザは、開いたページの URL と読み込みの時間などの計測値を Cloudflare
          へ送ります。この通信でも IP アドレスが Cloudflare に届きます。Cloudflare
          は、国・ページのパス・参照元・ブラウザ・OS・端末の種類を集計します。
        </p>
        <p>
          Cloudflare の説明では、この計測に Cookie と localStorage を使いません。詳細なデータは 7
          日間保持され、その後は約 10% に集約されます。詳しくは
          <ExternalTextLink href="https://www.cloudflare.com/web-analytics/"
            >Cloudflare Web Analytics の説明</ExternalTextLink
          >
          を確認してください。
        </p>
      </section>

      <section class="flex flex-col gap-2 text-sm">
        <h2 :class="h2Class">アクセスログ</h2>
        <p>
          Cloudflare と Google Cloud のアクセスログに、IP アドレス・User-Agent・参照元・要求の URL
          などが記録されることがあります。Google Cloud のログの保持期間は、既定で 30
          日です。Cloudflare の処理については、
          <ExternalTextLink href="https://www.cloudflare.com/privacypolicy/"
            >Cloudflare のプライバシーポリシー</ExternalTextLink
          >
          の「End
          Users」の項を確認してください。このポリシーは個々のサイトの扱いを定めるものではありません。
        </p>
      </section>

      <section class="flex flex-col gap-2 text-sm">
        <h2 :class="h2Class">連絡先</h2>
        <p>
          データの消去などの依頼は
          <a href="mailto:contact@skillweave.app" :class="linkClass">contact@skillweave.app</a>
          へ送ってください。
        </p>
      </section>
    </div>
  </div>
</template>
