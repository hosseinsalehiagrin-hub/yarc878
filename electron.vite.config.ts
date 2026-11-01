import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true,
      rollupOptions: { input: { index: resolve('src/main/index.ts') } }
    }
  },
  preload: {
    build: {
      externalizeDeps: true,
      rollupOptions: { input: { ui: resolve('src/preload/ui.ts') } }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          overlay: resolve('src/renderer/overlay.html'),
          little: resolve('src/renderer/little.html')
        }
      }
    }
  }
})
