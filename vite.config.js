import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  publicDir: 'data', // serves data/state.json (backtest output) at /state.json
  server: {
    port: 3000,
    proxy: {
      // Live engine state from `npm run paper`
      '/api': 'http://localhost:8787',
    },
  },
})
