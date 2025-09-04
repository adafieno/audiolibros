import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Force an inline, empty PostCSS config so cosmiconfig doesn't search JSON files.
export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [] } },
})
