// Which page the panel shows. Per panel, not shared.

import { defineStore } from 'pinia'
import { ref } from 'vue'

export type Page = 'wheels' | 'presets'

export const useUiStore = defineStore('ui', () => {
  const page = ref<Page>('wheels')
  return { page }
})
