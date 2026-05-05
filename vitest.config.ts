import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        // Electron-side: drivers, dialect, IPC handlers
        extends: true,
        test: {
          name: 'node',
          include: ['test/unit/**/*.spec.ts', 'test/integration/**/*.spec.ts'],
          environment: 'node',
          globals: true,
        },
      },
      {
        // Renderer-side: React components
        extends: true,
        plugins: [react()],
        test: {
          name: 'browser',
          include: ['test/components/**/*.spec.tsx'],
          environment: 'jsdom',
          globals: true,
          setupFiles: ['test/setup.ts'],
        },
      },
    ],
  },
});
