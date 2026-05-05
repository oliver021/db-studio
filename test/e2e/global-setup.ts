import { execSync } from 'node:child_process';

export default function globalSetup() {
  // Ensure the Electron bundle is built before any E2E test runs
  execSync('npm run build', { stdio: 'inherit' });
}
