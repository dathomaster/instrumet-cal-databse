import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import wasm from 'vite-plugin-wasm'

export default defineConfig(({ mode }) => {
  // Only PUBLIC values are injected into the renderer. Never add
  // PS_ADMIN_TOKEN, SUPABASE_ACCESS_TOKEN or PS_DATABASE_PASSWORD here.
  const env = loadEnv(mode, process.cwd(), '')
  for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'POWERSYNC_URL']) {
    if (!env[k]) throw new Error(`Missing ${k} in .env (see .env.example)`)
  }
  return {
    main: {},
    preload: {},
    renderer: {
      resolve: { alias: { '@': resolve('src/renderer/src') } },
      define: {
        __SUPABASE_URL__: JSON.stringify(env.SUPABASE_URL),
        __SUPABASE_ANON_KEY__: JSON.stringify(env.SUPABASE_ANON_KEY),
        __POWERSYNC_URL__: JSON.stringify(env.POWERSYNC_URL),
        __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version)
      },
      plugins: [react(), tailwindcss(), wasm()],
      optimizeDeps: { exclude: ['@journeyapps/wa-sqlite', '@powersync/web'] },
      worker: { format: 'es', plugins: () => [wasm()] },
      build: { target: 'esnext' }
    }
  }
})
