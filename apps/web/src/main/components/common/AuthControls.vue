<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useRoute } from 'vue-router'
import { CircleUser, Loader2, LogIn, LogOut, User } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LOGIN_PATH, saveLoginReturn } from '@/lib/auth/loginReturn'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const loginLink = ref<HTMLAnchorElement | null>(null)

function onLoginClick(): void {
  saveLoginReturn(route.fullPath)
}

async function onLogout(): Promise<void> {
  const ok = await auth.logout()
  if (!ok) return
  // 押したボタンが消えるため、フォーカスをログインのリンクへ移す
  await nextTick()
  loginLink.value?.focus()
}
</script>

<template>
  <div v-if="auth.status === 'unauthenticated'" data-slot="auth-login" class="flex shrink-0">
    <Button
      as-child
      variant="ghost"
      class="size-11 md:bg-background md:dark:bg-input/30 md:dark:border-input md:dark:hover:bg-input/50 md:h-10 md:w-auto md:border md:px-4 md:shadow-xs"
    >
      <a
        ref="loginLink"
        :href="LOGIN_PATH"
        aria-label="Discord でログイン"
        title="Discord でログイン"
        @click="onLoginClick"
      >
        <LogIn class="size-5 md:size-4" aria-hidden="true" />
        <span class="hidden md:inline" aria-hidden="true">Discord でログイン</span>
      </a>
    </Button>
  </div>
  <div
    v-else-if="auth.status === 'authenticated'"
    data-slot="auth-account"
    class="flex shrink-0 items-center gap-2"
  >
    <span class="hidden items-center gap-1 text-sm md:flex">
      <User class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
      <span class="sr-only">ログイン中: </span>
      <span class="text-foreground max-w-60 truncate" :title="auth.displayName">{{
        auth.displayName
      }}</span>
    </span>
    <Button
      type="button"
      variant="outline"
      class="hidden h-10 md:inline-flex"
      :disabled="auth.loggingOut"
      @click="onLogout"
    >
      <Loader2 v-if="auth.loggingOut" class="size-4 animate-spin" aria-hidden="true" />
      <LogOut v-else class="size-4" aria-hidden="true" />
      ログアウト
    </Button>
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button
          type="button"
          variant="ghost"
          class="size-11 md:hidden"
          :aria-label="`アカウント（${auth.displayName}）`"
          :title="auth.displayName"
          :disabled="auth.loggingOut"
        >
          <Loader2 v-if="auth.loggingOut" class="size-5 animate-spin" aria-hidden="true" />
          <CircleUser v-else class="size-5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-60 max-w-[calc(100vw-2rem)] rounded-sm shadow-none">
        <DropdownMenuLabel class="font-normal">
          <span class="text-muted-foreground block text-xs">ログイン中</span>
          <span class="block text-sm font-medium break-all">{{ auth.displayName }}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem class="h-11" @select="onLogout">
          <LogOut class="size-4" aria-hidden="true" />
          ログアウト
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
