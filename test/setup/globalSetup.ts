/**
 * Vitest globalSetup — starts MySQL and PostgreSQL containers once before the
 * entire test run and tears them down after.
 *
 * Connection URLs are provided to all test workers via Vitest's provide/inject
 * mechanism (no env-var hackery needed).
 *
 * MySQL 8.0 image is expected to be present locally.
 * PostgreSQL 16-alpine is pulled automatically if missing (~80 MB).
 */
import { MySqlContainer, type StartedMySqlContainer }       from '@testcontainers/mysql';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { ProvidedContext } from 'vitest';

// Containers are module-level so the teardown closure can reference them.
let mysqlContainer:    StartedMySqlContainer       | null = null;
let postgresContainer: StartedPostgreSqlContainer  | null = null;

export default async function setup({
  provide,
}: {
  provide: <K extends keyof ProvidedContext>(key: K, value: ProvidedContext[K]) => void;
}) {
  console.log('\n🐳  Starting test containers…');

  // Start both containers in parallel for speed.
  // testcontainers waits for the health-check before resolving, so by the time
  // we provide the URLs the engines are ready to accept connections.
  [mysqlContainer, postgresContainer] = await Promise.all([
    new MySqlContainer('mysql:8.0')
      .withDatabase('testdb')
      .withUsername('test')
      .withUserPassword('test')
      .withRootPassword('rootpass')
      .start(),

    new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('testdb')
      .withUsername('test')
      .withPassword('test')
      .start(),
  ]);

  const mysqlUrl    = mysqlContainer.getConnectionUri();
  const postgresUrl = postgresContainer.getConnectionUri();

  console.log(`  ✓ MySQL     → ${mysqlUrl.replace(/:([^@]+)@/, ':***@')}`);
  console.log(`  ✓ Postgres  → ${postgresUrl.replace(/:([^@]+)@/, ':***@')}\n`);

  provide('mysqlUrl',    mysqlUrl);
  provide('postgresUrl', postgresUrl);

  // Return a teardown function — Vitest calls this after all tests finish.
  return async () => {
    console.log('\n🐳  Stopping test containers…');
    await Promise.all([
      mysqlContainer?.stop(),
      postgresContainer?.stop(),
    ]);
    console.log('  ✓ Done\n');
  };
}
