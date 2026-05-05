const { contextBridge, ipcRenderer } = require('electron');

/** Helper: call a driver op on a specific session. */
const invoke = (sessionId: string, op: string, ...args: unknown[]) =>
  ipcRenderer.invoke('db:invoke', { sessionId, op, args });

contextBridge.exposeInMainWorld('dbstudio', {
  // ── Session management ────────────────────────────────────────────────
  /** Open a native file picker and start a SQLite session. */
  openDialog: () => ipcRenderer.invoke('db:openDialog'),
  /** Open a session from an explicit config (Postgres, MySQL, etc.). */
  openSession: (config: unknown, name?: string) => ipcRenderer.invoke('db:open', config, name),
  closeSession: (sessionId: string) => ipcRenderer.invoke('db:close', sessionId),
  listSessions: () => ipcRenderer.invoke('db:list'),
  testConnection: (config: unknown) => ipcRenderer.invoke('db:test', config),

  // ── Schema & relations ────────────────────────────────────────────────
  getSchema: (sessionId: string) => invoke(sessionId, 'getSchema'),
  getRelations: (sessionId: string) => invoke(sessionId, 'getRelations'),
  capabilities: (sessionId: string) => invoke(sessionId, 'capabilities'),

  // ── Table data ────────────────────────────────────────────────────────
  getTableRowCount: (sessionId: string, tableName: string, search?: string, filters?: unknown[]) =>
    invoke(sessionId, 'getTableRowCount', tableName, search, filters),
  getTableData: (sessionId: string, tableName: string, opts: unknown) =>
    invoke(sessionId, 'getTableData', tableName, opts),

  // ── Query ─────────────────────────────────────────────────────────────
  executeQuery: (sessionId: string, sql: string, params?: unknown[]) =>
    invoke(sessionId, 'executeQuery', sql, params),
  explainQueryPlan: (sessionId: string, sql: string) =>
    invoke(sessionId, 'explainQueryPlan', sql),

  // ── CRUD ──────────────────────────────────────────────────────────────
  updateRow: (sessionId: string, tableName: string, pkColumn: string, pkValue: unknown, changes: unknown) =>
    invoke(sessionId, 'updateRow', tableName, pkColumn, pkValue, changes),
  insertRow: (sessionId: string, tableName: string, data: unknown) =>
    invoke(sessionId, 'insertRow', tableName, data),
  deleteRow: (sessionId: string, tableName: string, pkColumn: string, pkValue: unknown) =>
    invoke(sessionId, 'deleteRow', tableName, pkColumn, pkValue),

  // ── Transactions ──────────────────────────────────────────────────────
  beginTransaction: (sessionId: string) => invoke(sessionId, 'beginTransaction'),
  commitTransaction: (sessionId: string) => invoke(sessionId, 'commitTransaction'),
  rollbackTransaction: (sessionId: string) => invoke(sessionId, 'rollbackTransaction'),
  getTransactionStatus: (sessionId: string) => invoke(sessionId, 'getTransactionStatus'),

  // ── Maintenance ───────────────────────────────────────────────────────
  getStats: (sessionId: string) => invoke(sessionId, 'getStats'),
  runMaintenance: (sessionId: string, taskId: string) => invoke(sessionId, 'runMaintenance', taskId),
});
