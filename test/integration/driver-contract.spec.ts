/**
 * Driver contract test suite.
 *
 * Runs the same behavioural spec against every concrete Driver implementation.
 * MySQL and PostgreSQL containers are started automatically by the Vitest
 * globalSetup (test/setup/globalSetup.ts) using testcontainers. Connection URLs
 * are injected via Vitest's provide/inject mechanism.
 *
 * Adding a new driver:
 *   1. Import it below.
 *   2. Add an entry to DRIVERS with dialect-specific `createSql`.
 *   3. If it needs a container, add it to globalSetup.ts.
 */
import { describe, it, expect, beforeEach, afterEach, inject } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SqliteDriver }   from '../../electron/drivers/SqliteDriver';
import { PostgresDriver } from '../../electron/drivers/PostgresDriver';
import { MysqlDriver }    from '../../electron/drivers/MysqlDriver';
import type { Driver }    from '../../electron/drivers/Driver';
import type { ConnectionConfig } from '../../electron/models/index';

// ── Helpers ──────────────────────────────────────────────────────────────────

function parsePgUrl(url: string): ConnectionConfig & { kind: 'postgres' } {
  const u = new URL(url);
  return {
    kind:     'postgres',
    host:     u.hostname,
    port:     Number(u.port) || 5432,
    database: u.pathname.replace(/^\//, ''),
    user:     u.username,
    password: decodeURIComponent(u.password) || undefined,
  };
}

function parseMySqlUrl(url: string): ConnectionConfig & { kind: 'mysql' } {
  const u = new URL(url);
  return {
    kind:     'mysql',
    host:     u.hostname,
    port:     Number(u.port) || 3306,
    database: u.pathname.replace(/^\//, ''),
    user:     u.username,
    password: decodeURIComponent(u.password) || undefined,
  };
}

// ── Driver registry ──────────────────────────────────────────────────────────

type DriverEntry = {
  name: string;
  /** Returns the ConnectionConfig. Called lazily (inside beforeEach) so that
   *  inject() resolves correctly after globalSetup has run. */
  getConfig: (dbPath: string) => ConnectionConfig;
  makeDriver: () => Driver;
  /** True when the driver writes to a temp file that should be deleted after. */
  fileDb: boolean;
  /** Dialect-specific DDL for the seed schema. */
  createSql: string[];
  /** Task id to use for the runMaintenance smoke-test. */
  maintenanceTask: string;
};

const DRIVERS: DriverEntry[] = [
  // ── SQLite ──────────────────────────────────────────────────────────────────
  {
    name:   'SqliteDriver',
    fileDb: true,
    maintenanceTask: 'vacuum',
    getConfig: (p) => ({ kind: 'sqlite', path: p }),
    makeDriver: () => new SqliteDriver(),
    createSql: [
      `CREATE TABLE IF NOT EXISTS users (
         id    INTEGER PRIMARY KEY AUTOINCREMENT,
         name  TEXT    NOT NULL,
         email TEXT    UNIQUE
       )`,
      `CREATE TABLE IF NOT EXISTS orders (
         id      INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id INTEGER NOT NULL REFERENCES users(id),
         total   REAL
       )`,
    ],
  },

  // ── PostgreSQL ──────────────────────────────────────────────────────────────
  // URL provided by globalSetup via inject('postgresUrl').
  {
    name:   'PostgresDriver',
    fileDb: false,
    maintenanceTask: 'vacuum',
    getConfig: () => parsePgUrl(inject('postgresUrl')),
    makeDriver: () => new PostgresDriver(),
    createSql: [
      `CREATE TABLE IF NOT EXISTS users (
         id    SERIAL       PRIMARY KEY,
         name  TEXT         NOT NULL,
         email TEXT         UNIQUE
       )`,
      `CREATE TABLE IF NOT EXISTS orders (
         id      SERIAL          PRIMARY KEY,
         user_id INTEGER         NOT NULL REFERENCES users(id),
         total   DOUBLE PRECISION
       )`,
    ],
  },

  // ── MySQL ────────────────────────────────────────────────────────────────────
  // URL provided by globalSetup via inject('mysqlUrl').
  {
    name:   'MysqlDriver',
    fileDb: false,
    maintenanceTask: 'optimize',
    getConfig: () => parseMySqlUrl(inject('mysqlUrl')),
    makeDriver: () => new MysqlDriver(),
    createSql: [
      `CREATE TABLE IF NOT EXISTS users (
         id    INT          AUTO_INCREMENT PRIMARY KEY,
         name  VARCHAR(255) NOT NULL,
         email VARCHAR(255) UNIQUE
       )`,
      `CREATE TABLE IF NOT EXISTS orders (
         id      INT    AUTO_INCREMENT PRIMARY KEY,
         user_id INT    NOT NULL,
         total   DOUBLE,
         CONSTRAINT fk_orders_users FOREIGN KEY (user_id) REFERENCES users(id)
       )`,
    ],
  },
];

// ── Contract suite ───────────────────────────────────────────────────────────

describe.each(DRIVERS)('Driver contract — $name', ({
  name, makeDriver, getConfig, fileDb, createSql, maintenanceTask,
}) => {
  let driver: Driver;
  let dbPath: string;

  beforeEach(async () => {
    driver = makeDriver();
    dbPath = fileDb
      ? path.join(os.tmpdir(), `contract-${name}-${Date.now()}.db`)
      : '';

    await driver.connect(getConfig(dbPath));

    // For server-based drivers, drop tables first so each test starts clean.
    if (!fileDb) {
      // Drop in reverse FK order; ignore errors if they don't exist yet.
      await driver.executeQuery('DROP TABLE IF EXISTS orders').catch(() => {});
      await driver.executeQuery('DROP TABLE IF EXISTS users').catch(() => {});
    }

    for (const sql of createSql) {
      await driver.executeQuery(sql);
    }
  });

  afterEach(async () => {
    await driver.disconnect();
    if (fileDb && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  // ── capabilities ─────────────────────────────────────────────────────────────

  it('capabilities() returns required flags', () => {
    const caps = driver.capabilities();
    expect(typeof caps.supportsTransactions).toBe('boolean');
    expect(typeof caps.supportsExplain).toBe('boolean');
    expect(typeof caps.hasMaintenance).toBe('boolean');
    expect(Array.isArray(caps.maintenanceTasks)).toBe(true);
    expect(typeof caps.dialect).toBe('string');
  });

  // ── schema ────────────────────────────────────────────────────────────────────

  it('getSchema() returns both tables with columns', async () => {
    const schema = await driver.getSchema();
    const names  = schema.map(t => t.name);
    expect(names).toContain('users');
    expect(names).toContain('orders');

    const users = schema.find(t => t.name === 'users')!;
    expect(users.columns.some(c => c.name === 'id' && c.pk === true)).toBe(true);
    expect(users.columns.some(c => c.name === 'name')).toBe(true);
  });

  // ── relations ─────────────────────────────────────────────────────────────────

  it('getRelations() detects the FK from orders to users', async () => {
    const rels = await driver.getRelations();
    const fk   = rels.find(r => r.fromTable === 'orders' && r.toTable === 'users');
    expect(fk).toBeDefined();
    expect(fk!.fromColumn).toBe('user_id');
  });

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  it('insertRow → getTableData round-trips', async () => {
    await driver.insertRow('users', { name: 'Alice', email: 'alice@example.com' });
    const rows = await driver.getTableData('users', { limit: 100, offset: 0 });
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Alice');
  });

  it('updateRow changes the correct field', async () => {
    const inserted = await driver.insertRow('users', { name: 'Bob', email: 'bob@example.com' });
    // Resolve the real PK regardless of dialect (SQLite bigint, Postgres int, MySQL int)
    const id = (inserted.data?.[0]?.id as number | bigint | undefined)
      ?? (inserted.info?.lastInsertRowid as number | bigint | undefined)
      ?? 1;
    await driver.updateRow('users', 'id', id, { name: 'Bobby' });
    const rows = await driver.getTableData('users', { limit: 100, offset: 0 });
    expect(rows[0].name).toBe('Bobby');
  });

  it('deleteRow removes the row', async () => {
    const inserted = await driver.insertRow('users', { name: 'Charlie', email: 'charlie@example.com' });
    const id = (inserted.data?.[0]?.id as number | bigint | undefined)
      ?? (inserted.info?.lastInsertRowid as number | bigint | undefined)
      ?? 1;
    expect((await driver.getTableData('users', { limit: 100, offset: 0 })).length).toBe(1);
    await driver.deleteRow('users', 'id', id);
    expect((await driver.getTableData('users', { limit: 100, offset: 0 })).length).toBe(0);
  });

  // ── row count ─────────────────────────────────────────────────────────────────

  it('getTableRowCount reflects inserts', async () => {
    expect(await driver.getTableRowCount('users')).toBe(0);
    await driver.insertRow('users', { name: 'D', email: 'd@x.com' });
    expect(await driver.getTableRowCount('users')).toBe(1);
  });

  // ── query execution ───────────────────────────────────────────────────────────

  it('executeQuery returns rows for SELECT', async () => {
    await driver.insertRow('users', { name: 'Eve', email: 'eve@x.com' });
    const result = await driver.executeQuery('SELECT * FROM users');
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as Record<string, unknown>[]).length).toBe(1);
  });

  it('executeQuery returns success + changes for INSERT', async () => {
    const result = await driver.executeQuery(
      `INSERT INTO users (name, email) VALUES ('F', 'f@x.com')`,
    );
    expect(result.success).toBe(true);
    expect(result.info?.changes).toBeGreaterThan(0);
  });

  // ── transactions ──────────────────────────────────────────────────────────────

  it('rollback undoes inserts within a transaction', async () => {
    if (!driver.capabilities().supportsTransactions) return;
    await driver.beginTransaction();
    await driver.insertRow('users', { name: 'Rollback', email: 'rb@x.com' });
    await driver.rollbackTransaction();
    expect((await driver.getTableData('users', { limit: 100, offset: 0 })).length).toBe(0);
  });

  it('commit persists inserts', async () => {
    if (!driver.capabilities().supportsTransactions) return;
    await driver.beginTransaction();
    await driver.insertRow('users', { name: 'Commit', email: 'cm@x.com' });
    await driver.commitTransaction();
    expect((await driver.getTableData('users', { limit: 100, offset: 0 })).length).toBe(1);
  });

  // ── pagination ────────────────────────────────────────────────────────────────

  it('pagination limits returned rows', async () => {
    for (let i = 0; i < 10; i++) {
      await driver.insertRow('users', { name: `User${i}`, email: `u${i}@x.com` });
    }
    const page1 = await driver.getTableData('users', { limit: 3, offset: 0, sortColumn: 'id', sortDirection: 'asc' });
    expect(page1.length).toBe(3);
    const page2 = await driver.getTableData('users', { limit: 3, offset: 3, sortColumn: 'id', sortDirection: 'asc' });
    expect(page2.length).toBe(3);
    expect(page1[0].name).not.toBe(page2[0].name);
  });

  // ── stats & maintenance ───────────────────────────────────────────────────────

  it('getStats() returns an items array', async () => {
    const stats = await driver.getStats();
    expect(Array.isArray(stats.items)).toBe(true);
    expect(stats.items.length).toBeGreaterThan(0);
    // Every item must have a label and a value
    for (const item of stats.items) {
      expect(typeof item.label).toBe('string');
      expect(item.value).toBeDefined();
    }
  });

  it(`runMaintenance('${maintenanceTask}') succeeds`, async () => {
    if (!driver.capabilities().hasMaintenance) return;
    const result = await driver.runMaintenance(maintenanceTask);
    expect(result.success).toBe(true);
  });
});
