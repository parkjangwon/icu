import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { supabase } from './supabase'; // Import the Supabase client

const app = createApp(App)

app.use(router)

// Make Supabase client globally available
app.config.globalProperties.$supabase = supabase;

app.mount('#app')
