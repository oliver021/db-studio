/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Persists saved connection configs (non-secret) via electron-store.
 * Passwords are stored/retrieved through keytar (OS keychain).
 *
 * Shape stored on disk:
 *   { connections: SavedConnection[] }
 *
 * Password is NEVER written to disk — only in the OS keychain under:
 *   service = 'db-studio', account = <connectionId>
 */

import { randomUUID } from 'node:crypto';
import Store from 'electron-store';
import type { ConnectionConfig } from './models/index.js';

let keytar: typeof import('keytar') | null = null;
try {
  // keytar is optional — if the OS keychain is unavailable (e.g. headless CI) we skip it
  keytar = (await import('keytar')).default ?? (await import('keytar') as any);
} catch {
  console.warn('[ConnectionStore] keytar unavailable — passwords will not be persisted');
}

const KEYTAR_SERVICE = 'db-studio';

export interface SavedConnection {
  id: string;
  name: string;
  /** Config without password field */
  config: ConnectionConfig;
  createdAt: string;
  lastUsed?: string;
}

type StoreSchema = { connections: SavedConnection[] };

const store = new Store<StoreSchema>({
  name: 'connections',
  defaults: { connections: [] },
});

// ── Public API ──────────────────────────────────────────────────────────────

export function listConnections(): SavedConnection[] {
  return store.get('connections');
}

export function getConnection(id: string): SavedConnection | undefined {
  return store.get('connections').find(c => c.id === id);
}

export async function saveConnection(
  name: string,
  config: ConnectionConfig,
  password?: string,
): Promise<SavedConnection> {
  const id = randomUUID();
  const saved: SavedConnection = {
    id,
    name,
    config: withoutPassword(config),
    createdAt: new Date().toISOString(),
  };

  const connections = store.get('connections');
  store.set('connections', [...connections, saved]);

  if (password && keytar) {
    await keytar.setPassword(KEYTAR_SERVICE, id, password);
  }

  return saved;
}

export async function updateConnection(
  id: string,
  name: string,
  config: ConnectionConfig,
  password?: string,
): Promise<SavedConnection | null> {
  const connections = store.get('connections');
  const idx = connections.findIndex(c => c.id === id);
  if (idx === -1) return null;

  const updated: SavedConnection = {
    ...connections[idx],
    name,
    config: withoutPassword(config),
  };
  connections[idx] = updated;
  store.set('connections', connections);

  if (keytar) {
    if (password) {
      await keytar.setPassword(KEYTAR_SERVICE, id, password);
    }
    // If password is explicitly empty string, clear from keychain
    if (password === '') {
      await keytar.deletePassword(KEYTAR_SERVICE, id);
    }
  }

  return updated;
}

export async function deleteConnection(id: string): Promise<void> {
  const connections = store.get('connections').filter(c => c.id !== id);
  store.set('connections', connections);
  if (keytar) {
    await keytar.deletePassword(KEYTAR_SERVICE, id);
  }
}

export async function touchLastUsed(id: string): Promise<void> {
  const connections = store.get('connections');
  const idx = connections.findIndex(c => c.id === id);
  if (idx !== -1) {
    connections[idx] = { ...connections[idx], lastUsed: new Date().toISOString() };
    store.set('connections', connections);
  }
}

/** Resolve a saved connection's full config (with password from keychain). */
export async function resolveConfig(id: string): Promise<ConnectionConfig | null> {
  const saved = getConnection(id);
  if (!saved) return null;

  const config = { ...saved.config } as any;

  if (keytar && (config.kind === 'postgres' || config.kind === 'mysql')) {
    const password = await keytar.getPassword(KEYTAR_SERVICE, id);
    if (password) config.password = password;
  }

  return config as ConnectionConfig;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function withoutPassword(config: ConnectionConfig): ConnectionConfig {
  if (config.kind === 'sqlite') return config;
  const { password: _pw, ...rest } = config as any;
  return rest as ConnectionConfig;
}
