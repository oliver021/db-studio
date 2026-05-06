import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { ConnectionRegistry } from '../ConnectionRegistry.js';
import type { ConnectionConfig } from '../models/index.js';
import type { PaginationOptions, FilterRule } from '../drivers/Driver.js';

// ── Saved connections persistence ──────────────────────────────────────────

interface SavedConnection {
  id: string;
  name: string;
  config: ConnectionConfig;
  lastConnected: string | null;
}

function savedConnectionsPath(): string {
  return path.join(app.getPath('userData'), 'saved-connections.json');
}

function readSaved(): SavedConnection[] {
  try {
    const raw = fs.readFileSync(savedConnectionsPath(), 'utf-8');
    return JSON.parse(raw) as SavedConnection[];
  } catch {
    return [];
  }
}

function writeSaved(list: SavedConnection[]): void {
  fs.writeFileSync(savedConnectionsPath(), JSON.stringify(list, null, 2), 'utf-8');
}

// ── Friendly error messages ────────────────────────────────────────────────

function friendlyError(err: unknown): string {
  const e = err as Record<string, unknown>;
  const code: string = e?.code ?? '';
  const name: string = e?.name ?? '';
  const msg: string = e?.message ?? String(err);

  if (code === 'ECONNREFUSED') return 'Connection refused — is the server running?';
  if (code === 'ENOTFOUND')    return 'Host not found — check the hostname';
  if (code === 'ETIMEDOUT')    return 'Connection timed out — check host and port';
  if (code === 'EACCES')       return 'Permission denied — check file permissions';
  if (msg.includes('ER_ACCESS_DENIED_ERROR') || msg.includes('Access denied'))
    return 'Access denied — wrong username or password';
  if (msg.includes('SQLITE_NOTADB'))
    return 'File is not a valid SQLite database';
  if (msg.includes('SQLITE_CANTOPEN'))
    return 'Cannot open database file — check the path and permissions';
  if (name === 'AggregateError' || msg.includes('AggregateError'))
    return 'Could not reach the server — check host and port';
  // Strip Electron's "Error invoking remote method '...': " prefix if present
  return msg.replace(/^Error invoking remote method '[^']+': /, '');
}

/**
 * Register all db:* IPC handlers.
 * Single generic channel (db:invoke) plus session-management channels.
 */
export function registerDbHandlers(
  registry: ConnectionRegistry,
  getWindow: () => BrowserWindow | null,
): void {

  // ── Session management ─────────────────────────────────────────────────

  /** Open a dialog (SQLite file picker) then open a session. */
  ipcMain.handle('db:openDialog', async () => {
    const win = getWindow();
    if (!win) return { ok: false, error: 'No window available' };
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'SQLite Databases', extensions: ['db', 'sqlite', 'sqlite3'] }],
    });
    if (canceled || filePaths.length === 0) return null;
    try {
      const config: ConnectionConfig = { kind: 'sqlite', path: filePaths[0] };
      const sessionId = await registry.open(config);
      const name = filePaths[0].split(/[/\\]/).pop()!;
      return { ok: true, sessionId, name, path: filePaths[0] };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  });

  /** Open a session from an explicit ConnectionConfig (Postgres, MySQL, etc.). */
  ipcMain.handle('db:open', async (_evt, config: ConnectionConfig, name?: string) => {
    try {
      const sessionId = await registry.open(config, name);
      return { ok: true, sessionId };
    } catch (err) {
      return { ok: false, error: friendlyError(err) };
    }
  });

  // ── Saved connections ──────────────────────────────────────────────────

  ipcMain.handle('db:listSavedConnections', () => readSaved());

  ipcMain.handle('db:saveConnection', (_evt, config: ConnectionConfig, name: string) => {
    const list = readSaved();
    const entry: SavedConnection = { id: randomUUID(), name, config, lastConnected: null };
    writeSaved([...list, entry]);
    return entry;
  });

  ipcMain.handle('db:updateSavedLastConnected', (_evt, id: string) => {
    const list = readSaved().map(c =>
      c.id === id ? { ...c, lastConnected: new Date().toISOString() } : c,
    );
    writeSaved(list);
  });

  ipcMain.handle('db:deleteSavedConnection', (_evt, id: string) => {
    writeSaved(readSaved().filter(c => c.id !== id));
    return { ok: true };
  });

  ipcMain.handle('db:close', async (_evt, sessionId: string) => {
    await registry.close(sessionId);
    return { ok: true };
  });

  ipcMain.handle('db:list', () => registry.list());

  ipcMain.handle('db:test', async (_evt, config: ConnectionConfig) => {
    return registry.test(config);
  });

  // ── Generic driver-op dispatcher ───────────────────────────────────────

  ipcMain.handle('db:invoke', async (_evt, payload: { sessionId: string; op: string; args: unknown[] }) => {
    const { sessionId, op, args } = payload;
    const driver = registry.driver(sessionId);

    switch (op) {
      case 'getSchema':          return driver.getSchema();
      case 'getRelations':       return driver.getRelations();
      case 'capabilities':       return driver.capabilities();

      case 'getTableRowCount': {
        const [tableName, search, filters] = args as [string, string | undefined, FilterRule[] | undefined];
        return driver.getTableRowCount(tableName, search, filters);
      }
      case 'getTableData': {
        const [tableName, opts] = args as [string, PaginationOptions];
        return driver.getTableData(tableName, opts);
      }
      case 'executeQuery': {
        const [sql, params] = args as [string, unknown[] | undefined];
        return driver.executeQuery(sql, params);
      }
      case 'explainQueryPlan': {
        const [sql] = args as [string];
        return driver.explainQueryPlan(sql);
      }
      case 'updateRow': {
        const [tableName, pkColumn, pkValue, changes] = args as [string, string, unknown, Record<string, unknown>];
        return driver.updateRow(tableName, pkColumn, pkValue, changes);
      }
      case 'insertRow': {
        const [tableName, data] = args as [string, Record<string, unknown>];
        return driver.insertRow(tableName, data);
      }
      case 'deleteRow': {
        const [tableName, pkColumn, pkValue] = args as [string, string, unknown];
        return driver.deleteRow(tableName, pkColumn, pkValue);
      }
      case 'beginTransaction':    return driver.beginTransaction();
      case 'commitTransaction':   return driver.commitTransaction();
      case 'rollbackTransaction': return driver.rollbackTransaction();
      case 'getTransactionStatus': return driver.getTransactionStatus();

      case 'getStats':            return driver.getStats();
      case 'runMaintenance': {
        const [taskId] = args as [string];
        return driver.runMaintenance(taskId);
      }

      default:
        throw new Error(`Unknown db op: ${op}`);
    }
  });
}
