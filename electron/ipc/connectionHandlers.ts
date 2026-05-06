import { ipcMain } from 'electron';
import {
  listConnections, getConnection, saveConnection,
  updateConnection, deleteConnection, resolveConfig, touchLastUsed,
} from '../ConnectionStore.js';
import type { ConnectionRegistry } from '../ConnectionRegistry.js';
import { IdSchema, SaveConnectionArgsSchema, UpdateConnectionArgsSchema } from './schemas.js';

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
    const id = IdSchema.parse(rawId);
    const config = await resolveConfig(id);
    if (!config) throw new Error(`Connection ${id} not found`);
    const saved = await import('../ConnectionStore.js').then(m => m.getConnection(id));
    const sessionId = await registry.open(config, saved?.name);
    await touchLastUsed(id);
    return { sessionId, name: saved?.name };
  });
}
