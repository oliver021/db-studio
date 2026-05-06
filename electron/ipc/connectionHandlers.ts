import { ipcMain } from 'electron';
import {
  listConnections, getConnection, saveConnection,
  updateConnection, deleteConnection, resolveConfig, touchLastUsed,
} from '../ConnectionStore.js';
import type { ConnectionRegistry } from '../ConnectionRegistry.js';
import { IdSchema, SaveConnectionArgsSchema, UpdateConnectionArgsSchema } from './schemas.js';

// ── Friendly error messages ────────────────────────────────────────────────

function friendlyError(err: unknown): string {
  const e = err as Record<string, unknown>;
  const code = String(e?.code ?? '');
  const name  = String(e?.name  ?? '');
  const msg   = String(e?.message ?? err);

  if (code === 'ECONNREFUSED') return 'Connection refused — is the server running?';
  if (code === 'ENOTFOUND')    return 'Host not found — check the hostname';
  if (code === 'ETIMEDOUT')    return 'Connection timed out — check host and port';
  if (code === 'EACCES')       return 'Permission denied — check file permissions';
  if (msg.includes('ER_ACCESS_DENIED_ERROR') || msg.includes('Access denied'))
    return 'Access denied — wrong username or password';
  if (msg.includes('SQLITE_NOTADB'))  return 'File is not a valid SQLite database';
  if (msg.includes('SQLITE_CANTOPEN')) return 'Cannot open database file — check the path and permissions';
  if (name === 'AggregateError' || msg.includes('AggregateError'))
    return 'Could not reach the server — check host and port';
  return msg.replace(/^Error invoking remote method '[^']+': /, '');
}

/**
 * Register connections:* IPC handlers for saved-connection management.
 * These are separate from db:* session handlers intentionally — saving a
 * connection config and opening a live session are different operations.
 */
export function registerConnectionHandlers(registry: ConnectionRegistry): void {

  ipcMain.handle('connections:list', () => listConnections());

  ipcMain.handle('connections:get', (_evt, rawId: unknown) => {
    const id = IdSchema.parse(rawId);
    return getConnection(id) ?? null;
  });

  ipcMain.handle('connections:save', async (_evt, rawArgs: unknown) => {
    const { name, config, password } = SaveConnectionArgsSchema.parse(rawArgs);
    return saveConnection(name, config, password);
  });

  ipcMain.handle('connections:update', async (_evt, rawArgs: unknown) => {
    const { id, name, config, password } = UpdateConnectionArgsSchema.parse(rawArgs);
    return updateConnection(id, name, config, password);
  });

  ipcMain.handle('connections:delete', async (_evt, rawId: unknown) => {
    const id = IdSchema.parse(rawId);
    await deleteConnection(id);
    return { ok: true };
  });

  /**
   * Open a live session from a saved connection id.
   * Resolves the config (injects password from keychain) then calls registry.open().
   */
  ipcMain.handle('connections:connect', async (_evt, rawId: unknown) => {
    try {
      const id = IdSchema.parse(rawId);
      const config = await resolveConfig(id);
      if (!config) throw new Error(`Connection ${id} not found`);
      const saved = await import('../ConnectionStore.js').then(m => m.getConnection(id));
      const sessionId = await registry.open(config, saved?.name);
      await touchLastUsed(id);
      return { ok: true, sessionId, name: saved?.name };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  });
}
