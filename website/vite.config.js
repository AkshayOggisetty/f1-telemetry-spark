import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' keeps every asset path relative, so the build works from any
// folder or GitHub Pages sub-path. Routing uses HashRouter for the same reason.
export default defineConfig({
  base: './',
  plugins: [react()],
})
