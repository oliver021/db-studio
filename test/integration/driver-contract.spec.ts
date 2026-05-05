/**
 * Driver contract test suite.
 * Runs the same behavioural spec against every concrete Driver implementation.
 * Adding a new driver: import it, add an entry to DRIVERS below.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SqliteDriver } from '../../electron/drivers/SqliteDriver';
import type { Driver } from '../../electron/drivers/Driver';
import type { ConnectionConfig } from '../../electron/models/index';

// ── Driver registry ──────────────────────────────────────────────────────────

type DriverEntry = {
  name: string;
  makeConfig: (dbPath: string) => ConnectionConfig;
  makeDriver: () => Driver;
  /** True if driver needs a temp file path; false for in-memory / server-based. */
  fileDb: boolean;
};

const DRIVERS: DriverEntry[] = [
  {
    name: 'SqliteDriver',
    fileDb: true,
    makeConfig: (p) => ({ kind: 'sqlite', path: p }),
    makeDriver: () => new SqliteDriver(),
  },
  // Phase C: add PostgresDriver and MysqlDriver here with testcontainers setup
];

// ── Contract suite ───────────────────────────────────────────────────────────

describe.each(DRIVERS)('Driver contract — $name', ({ makeDriver, makeConfig, fileDb }) => {
  let driver: Driver;
  let dbPath: string;

  beforeEach(async () => {
    driver = makeDriver();
    dbPath = fileDb
      ? path.join(os.tmpdir(), `contract-test-${Date.now()}.db`)
      : ':memory:';
    await driver.connect(makeConfig(dbPath));

    // Seed a minimal schema
    await driver.executeQuery(`
      CREATE TABLE users (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE
      )
    `);
    await driver.executeQuery(`
      CREATE TABLE orders (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        total   REAL
      )
    `);
  });

  afterEach(async () => {
    await driver.disconnect();
    if (fileDb && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  // ── capabilities ────────────────────────────────────────────────────────────

  it('capabilities() returns required flags', () => {
    const caps = driver.capabilities();
    expect(typeof caps.supportsTransactions).toBe('boolean');
    expect(typeof caps.supportsExplain).toBe('boolean');
    expect(typeof caps.hasMaintenance).toBe('boolean');
    expect(Array.isArray(caps.maintenanceTasks)).toBe(true);
  });

  // ── schema ───────────────────────────────────────────────────────────────────

  it('getSchema() returns both tables with columns', async () => {
    const schema = await driver.getSchema();
    const names = schema.map(t => t.name);
    expect(names).toContain('users');
    expect(names).toContain('orders');

    const users = schema.find(t => t.name === 'users')!;
    expect(users.columns.some(c => c.name === 'id' && c.pk === true)).toBe(true);
    expect(users.columns.some(c => c.name === 'name')).toBe(true);
  });

  // ── relations ────────────────────────────────────────────────────────────────

  it('getRelations() detects the FK from orders to users', async () => {
    const rels = await driver.getRelations();
    const fk = rels.find(r => r.fromTable === 'orders' && r.toTable === 'users');
    expect(fk).toBeDefined();
    expect(fk!.fromColumn).toBe('user_id');
  });

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  it('insertRow → getTableData round-trips', async () => {
    await driver.insertRow('users', { name: 'Alice', email: 'alice@example.com' });
    const rows = await driver.getTableData('users', { limit: 100, offset: 0 });
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Alice');
  });

  it('updateRow changes the correct field', async () => {
    await driver.insertRow('users', { name: 'Bob', email: 'bob@example.com' });
    await driver.updateRow('users', 'id', 1, { name: 'Bobby' });
    const rows = await driver.getTableData('users', { limit: 100, offset: 0 });
    expect(rows[0].name).toBe('Bobby');
  });

  it('deleteRow removes the row', async () => {
    await driver.insertRow('users', { name: 'Charlie', email: 'charlie@example.com' });
    expect((await driver.getTableData('users', { limit: 100, offset: 0 })).length).toBe(1);
    await driver.deleteRow('users', 'id', 1);
    expect((await driver.getTableData('users', { limit: 100, offset: 0 })).length).toBe(0);
  });

  // ── row count ────────────────────────────────────────────────────────────────

  it('getTableRowCount reflects inserts', async () => {
    expect(await driver.getTableRowCount('users')).toBe(0);
    await driver.insertRow('users', { name: 'D', email: 'd@x.com' });
    expect(await driver.getTableRowCount('users')).toBe(1);
  });

  // ── query execution ──────────────────────────────────────────────────────────

  it('executeQuery returns rows for SELECT', async () => {
    await driver.insertRow('users', { name: 'Eve', email: 'eve@x.com' });
    const result = await driver.executeQuery('SELECT * FROM users');
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect((result.data as any[]).length).toBe(1);
  });

  it('executeQuery returns success + changes for INSERT', async () => {
    const result = await driver.executeQuery(
      `INSERT INTO users (name, email) VALUES ('F', 'f@x.com')`,
    );
    expect(result.success).toBe(true);
    expect(result.info?.changes).toBeGreaterThan(0);
  });

  // ── transactions ─────────────────────────────────────────────────────────────

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

  // ── pagination & search ──────────────────────────────────────────────────────

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

  // ── stats & maintenance ──────────────────────────────────────────────────────

  it('getStats() returns an items array', async () => {
    if (!driver.capabilities().hasMaintenance) return;
    const stats = await driver.getStats();
    expect(Array.isArray(stats.items)).toBe(true);
    expect(stats.items.length).toBeGreaterThan(0);
  });

  it('runMaintenance(vacuum) succeeds', async () => {
    if (!driver.capabilities().hasMaintenance) return;
    const result = await driver.runMaintenance('vacuum');
    expect(result.success).toBe(true);
  });
});
