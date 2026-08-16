import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src')
    }
  },
  logLevel: 'warn', // suppress the per-file build listing, keep warnings/errors
  build: {
    chunkSizeWarningLimit: 1000, // kB — quiet false-alarm on vendor-y chunks
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/exceljs')) {
            return 'exceljs'
          }
        }
      }
    }
  }
})
