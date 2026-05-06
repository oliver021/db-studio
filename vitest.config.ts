import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        // Electron-side: drivers, dialect, IPC handlers, integration
        extends: true,
        test: {
          name: 'node',
          include: ['test/unit/**/*.spec.ts', 'test/integration/**/*.spec.ts'],
          environment: 'node',
          globals: true,

          // globalSetup runs once per test run (not per worker).
          // It starts Docker containers and provides URLs via inject().
          globalSetup: ['test/setup/globalSetup.ts'],

          // Container startup + first-connect can take time.
          // Unit tests are fast; only integration tests hit the limit.
          testTimeout: 30_000,
          hookTimeout: 30_000,

          // Type augmentation for inject() — picked up by all node tests.
          typecheck: {
            include: ['test/setup/vitest.d.ts'],
          },
        },
      },
      {
        // Renderer-side: React components (jsdom, no Docker)
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
