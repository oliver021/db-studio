import { ipcMain, dialog, BrowserWindow } from 'electron';
import type { ConnectionRegistry } from '../ConnectionRegistry.js';
import type { PaginationOptions, FilterRule } from '../drivers/Driver.js';
import { ConnectionConfigSchema, DbInvokeSchema } from './schemas.js';

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
    if (!win) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'SQLite Databases', extensions: ['db', 'sqlite', 'sqlite3'] }],
    });
    if (canceled || filePaths.length === 0) return null;
    const config: ConnectionConfig = { kind: 'sqlite', path: filePaths[0] };
    const sessionId = await registry.open(config);
    return { sessionId, name: filePaths[0].split(/[/\\]/).pop(), path: filePaths[0] };
  });

  /** Open a session from an explicit ConnectionConfig (Postgres, MySQL, etc.). */
  ipcMain.handle('db:open', async (_evt, rawConfig: unknown, name?: string) => {
    const config = ConnectionConfigSchema.parse(rawConfig);
    const sessionId = await registry.open(config, name);
    return { sessionId };
  });

  ipcMain.handle('db:close', async (_evt, sessionId: string) => {
    await registry.close(sessionId);
    return { ok: true };
  });

  ipcMain.handle('db:list', () => registry.list());

  ipcMain.handle('db:test', async (_evt, rawConfig: unknown) => {
    const config = ConnectionConfigSchema.parse(rawConfig);
    return registry.test(config);
  });

  // ── Generic driver-op dispatcher ───────────────────────────────────────

  ipcMain.handle('db:invoke', async (_evt, rawPayload: unknown) => {
    const { sessionId, op, args } = DbInvokeSchema.parse(rawPayload);
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
