/**
 * Unit tests for ConnectionStore.
 *
 * electron-store and keytar are both native / Electron-specific and can't run
 * in plain Node. We replace them with lightweight in-memory fakes so the pure
 * business logic (CRUD, password stripping, keychain delegation) can be
 * tested without any OS or Electron dependency.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── In-memory electron-store fake ───────────────────────────────────────────
const storeData: Record<string, unknown> = {};
class MockStore {
  get(key: string) { return storeData[key]; }
  set(key: string, val: unknown) { storeData[key] = val; }
}
vi.mock('electron-store', () => ({ default: MockStore }));

// ── keytar fake ──────────────────────────────────────────────────────────────
const keychainData: Record<string, string> = {};
vi.mock('keytar', () => ({
  default: {
    setPassword: vi.fn((_svc: string, account: string, pw: string) => {
      keychainData[account] = pw;
    }),
    getPassword: vi.fn((_svc: string, account: string) => keychainData[account] ?? null),
    deletePassword: vi.fn((_svc: string, account: string) => {
      delete keychainData[account];
    }),
  },
}));

// Import AFTER mocks are registered
const {
  listConnections,
  getConnection,
  saveConnection,
  updateConnection,
  deleteConnection,
  touchLastUsed,
  resolveConfig,
} = await import('../../electron/ConnectionStore');

// ── Helpers ──────────────────────────────────────────────────────────────────

function reset() {
  // Clear the in-memory store between tests
  storeData['connections'] = [];
  for (const k of Object.keys(keychainData)) delete keychainData[k];
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ConnectionStore', () => {
  beforeEach(reset);

  // ── listConnections ────────────────────────────────────────────────────────

  it('listConnections returns empty array initially', () => {
    expect(listConnections()).toEqual([]);
  });

  // ── saveConnection ─────────────────────────────────────────────────────────

  it('saveConnection persists a SQLite connection without password', async () => {
    const saved = await saveConnection('My DB', { kind: 'sqlite', path: '/tmp/test.db' });

    expect(saved.id).toBeTruthy();
    expect(saved.name).toBe('My DB');
    expect(saved.config).toEqual({ kind: 'sqlite', path: '/tmp/test.db' });
    expect(listConnections()).toHaveLength(1);
  });

  it('saveConnection strips password from the stored config', async () => {
    await saveConnection('Prod PG', {
      kind: 'postgres',
      host: 'db.example.com',
      port: 5432,
      database: 'prod',
      user: 'admin',
      password: 's3cr3t',
    });

    const [conn] = listConnections();
    expect((conn.config as Record<string, unknown>).password).toBeUndefined();
  });

  it('saveConnection stores password in keychain for server connections', async () => {
    const saved = await saveConnection(
      'Prod PG',
      { kind: 'postgres', host: 'db.example.com', port: 5432, database: 'prod', user: 'admin' },
      's3cr3t',
    );

    expect(keychainData[saved.id]).toBe('s3cr3t');
  });

  it('saveConnection does NOT write to keychain when no password provided', async () => {
    const saved = await saveConnection('SQLite', { kind: 'sqlite', path: '/tmp/x.db' });
    expect(keychainData[saved.id]).toBeUndefined();
  });

  // ── getConnection ──────────────────────────────────────────────────────────

  it('getConnection returns undefined for unknown id', () => {
    expect(getConnection('not-a-real-id')).toBeUndefined();
  });

  it('getConnection returns the saved record by id', async () => {
    const saved = await saveConnection('Test', { kind: 'sqlite', path: '/x.db' });
    expect(getConnection(saved.id)?.name).toBe('Test');
  });

  // ── updateConnection ───────────────────────────────────────────────────────

  it('updateConnection changes name and config', async () => {
    const saved = await saveConnection('Old Name', { kind: 'sqlite', path: '/old.db' });
    await updateConnection(saved.id, 'New Name', { kind: 'sqlite', path: '/new.db' });
    expect(getConnection(saved.id)?.name).toBe('New Name');
    expect((getConnection(saved.id)?.config as { path: string }).path).toBe('/new.db');
  });

  it('updateConnection updates keychain password when provided', async () => {
    const saved = await saveConnection(
      'PG',
      { kind: 'postgres', host: 'h', port: 5432, database: 'd', user: 'u' },
      'old-pw',
    );
    await updateConnection(
      saved.id, 'PG', { kind: 'postgres', host: 'h', port: 5432, database: 'd', user: 'u' },
      'new-pw',
    );
    expect(keychainData[saved.id]).toBe('new-pw');
  });

  it('updateConnection clears keychain when password is empty string', async () => {
    const saved = await saveConnection(
      'PG',
      { kind: 'postgres', host: 'h', port: 5432, database: 'd', user: 'u' },
      'pw',
    );
    await updateConnection(
      saved.id, 'PG', { kind: 'postgres', host: 'h', port: 5432, database: 'd', user: 'u' },
      '',
    );
    expect(keychainData[saved.id]).toBeUndefined();
  });

  it('updateConnection returns null for unknown id', async () => {
    const result = await updateConnection('no-such-id', 'x', { kind: 'sqlite', path: '/x.db' });
    expect(result).toBeNull();
  });

  // ── deleteConnection ───────────────────────────────────────────────────────

  it('deleteConnection removes the record', async () => {
    const saved = await saveConnection('Test', { kind: 'sqlite', path: '/x.db' });
    await deleteConnection(saved.id);
    expect(listConnections()).toHaveLength(0);
  });

  it('deleteConnection removes password from keychain', async () => {
    const saved = await saveConnection(
      'PG',
      { kind: 'postgres', host: 'h', port: 5432, database: 'd', user: 'u' },
      'pw',
    );
    await deleteConnection(saved.id);
    expect(keychainData[saved.id]).toBeUndefined();
  });

  // ── touchLastUsed ──────────────────────────────────────────────────────────

  it('touchLastUsed sets lastUsed timestamp', async () => {
    const saved = await saveConnection('Test', { kind: 'sqlite', path: '/x.db' });
    expect(getConnection(saved.id)?.lastUsed).toBeUndefined();

    await touchLastUsed(saved.id);
    const lastUsed = getConnection(saved.id)?.lastUsed;
    expect(lastUsed).toBeTruthy();
    expect(new Date(lastUsed!).getTime()).toBeLessThanOrEqual(Date.now());
  });

  // ── resolveConfig ──────────────────────────────────────────────────────────

  it('resolveConfig returns null for unknown id', async () => {
    expect(await resolveConfig('no-such-id')).toBeNull();
  });

  it('resolveConfig returns SQLite config without keychain lookup', async () => {
    const saved = await saveConnection('SQLite', { kind: 'sqlite', path: '/tmp/x.db' });
    const config = await resolveConfig(saved.id);
    expect(config).toEqual({ kind: 'sqlite', path: '/tmp/x.db' });
  });

  it('resolveConfig injects password from keychain for postgres', async () => {
    const saved = await saveConnection(
      'PG',
      { kind: 'postgres', host: 'h', port: 5432, database: 'd', user: 'u' },
      's3cr3t',
    );
    const config = await resolveConfig(saved.id) as Record<string, unknown>;
    expect(config.password).toBe('s3cr3t');
  });

  it('resolveConfig returns config without password field if no keychain entry', async () => {
    const saved = await saveConnection(
      'PG',
      { kind: 'postgres', host: 'h', port: 5432, database: 'd', user: 'u' },
      // no password
    );
    const config = await resolveConfig(saved.id) as Record<string, unknown>;
    expect(config.password).toBeUndefined();
  });
});
