import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource/open-sans/400.css'
import '@fontsource/open-sans/600.css'
import './styles/tokens.css'
import './styles/base.css'
import App from './App.vue'

createApp(App).use(createPinia()).mount('#app')
