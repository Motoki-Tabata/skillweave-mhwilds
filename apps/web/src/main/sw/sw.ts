// Service Worker の入口。イベントの結線だけを書く（処理は同じフォルダの別モジュール）。
// 事前キャッシュの一覧と版は、ビルドが `self.__SWV_PRECACHE__ = {…};` として chunk の先頭に前置する。
import type { PrecacheConfig } from './config'
import { handleFetch } from './handlers'
import { activate, install, isSkipWaiting } from './lifecycle'

declare const self: ServiceWorkerGlobalScope & { __SWV_PRECACHE__: PrecacheConfig }

const config = self.__SWV_PRECACHE__

self.addEventListener('install', (event) => {
  event.waitUntil(install(config, self.caches, self.location.origin))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(activate(config, self.caches, self.location.origin, () => self.clients.claim()))
})

self.addEventListener('message', (event) => {
  if (isSkipWaiting(event.data)) event.waitUntil(self.skipWaiting())
})

self.addEventListener('fetch', (event) => {
  const response = handleFetch(event.request, {
    caches: self.caches,
    fetch: (request) => fetch(request),
    config,
    origin: self.location.origin,
    waitUntil: (promise) => event.waitUntil(promise),
  })
  if (response) event.respondWith(response)
})
