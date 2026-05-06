import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: [
                // Native addons / Electron-only packages
                'better-sqlite3', 'keytar', 'electron-store',
                // Database drivers — use regex to cover all subpath exports
                // (e.g. 'mysql2/promise', 'pg/lib/…') not just the root package.
                /^pg/, /^mysql2/,
                // node-sql-parser is CJS-only and must never be bundled into
                // an ESM output — keep it external even if nothing currently
                // imports it, so a future import can't silently break startup.
                'node-sql-parser',
                // Catch-all: every node: built-in protocol import.
                // Rolldown (Vite 8) outputs ESM for the main process; any
                // package that calls require('node:buffer') etc. at runtime
                // must be external so Node.js resolves it natively.
                /^node:/,
              ],
            },
          },
        }
      }
    ]),
    renderer(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'lucide-react', 'framer-motion', 'monaco-editor'],
  },
})
