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
  listDatabases:  (config: unknown) => ipcRenderer.invoke('db:listDatabases', config),

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

  // ── DDL (Data Definition Language) ────────────────────────────────────
  createTable: (sessionId: string, sql: string) =>
    ipcRenderer.invoke('db:createTable', sessionId, sql),

  // ── Settings ──────────────────────────────────────────────────────────
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: unknown) => ipcRenderer.invoke('settings:set', patch),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),

  // ── Saved connections ─────────────────────────────────────────────────
  listConnections: () => ipcRenderer.invoke('connections:list'),
  getConnection: (id: string) => ipcRenderer.invoke('connections:get', id),
  saveConnection: (name: string, config: unknown, password?: string) =>
    ipcRenderer.invoke('connections:save', { name, config, password }),
  updateConnection: (id: string, name: string, config: unknown, password?: string) =>
    ipcRenderer.invoke('connections:update', { id, name, config, password }),
  deleteConnection: (id: string) => ipcRenderer.invoke('connections:delete', id),
  connectSaved: (id: string) => ipcRenderer.invoke('connections:connect', id),
});
