import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works from a GitHub Pages subpath.
  base: './',
  // Fixed port so study links stay stable; 5173 is commonly taken by other projects.
  server: { port: 5317, strictPort: true },
})
