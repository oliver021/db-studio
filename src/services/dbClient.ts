/**
 * Renderer-side facade over window.dbstudio.
 * Components and the store must call this module — never window.dbstudio directly.
 * Swapping the transport (e.g. HTTP for a web build) only requires changing this file.
 */

const api = () => window.dbstudio;

// ── Session management ──────────────────────────────────────────────────────

export const openDialog = () => api().openDialog();
export const openSession = (config: unknown, name?: string) => api().openSession(config, name);
export const closeSession = (sessionId: string) => api().closeSession(sessionId);
export const listSessions = () => api().listSessions();
export const testConnection = (config: unknown) => api().testConnection(config);

export const listDatabases = async (config: unknown): Promise<string[]> => {
  const result = await api().listDatabases(config);
  if (!result.ok) throw new Error(result.error ?? 'Failed to list databases');
  return result.databases ?? [];
};

// ── Schema ──────────────────────────────────────────────────────────────────

export const getSchema = (sessionId: string) => api().getSchema(sessionId);
export const getRelations = (sessionId: string) => api().getRelations(sessionId);
export const capabilities = (sessionId: string) => api().capabilities(sessionId);

// ── Table data ──────────────────────────────────────────────────────────────

export const getTableRowCount = (
  sessionId: string,
  tableName: string,
  search?: string,
  filters?: unknown[],
) => api().getTableRowCount(sessionId, tableName, search, filters);

export interface TableDataOpts {
  limit?: number;
  offset?: number;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  search?: string;
  filters?: unknown[];
}

export const getTableData = (sessionId: string, tableName: string, opts: TableDataOpts) =>
  api().getTableData(sessionId, tableName, opts);

// ── Query ───────────────────────────────────────────────────────────────────

export const executeQuery = (sessionId: string, sql: string, params?: unknown[]) =>
  api().executeQuery(sessionId, sql, params);

export const explainQueryPlan = (sessionId: string, sql: string) =>
  api().explainQueryPlan(sessionId, sql);

// ── CRUD ────────────────────────────────────────────────────────────────────

export const updateRow = (
  sessionId: string,
  tableName: string,
  pkColumn: string,
  pkValue: unknown,
  changes: Record<string, unknown>,
) => api().updateRow(sessionId, tableName, pkColumn, pkValue, changes);

export const insertRow = (sessionId: string, tableName: string, data: Record<string, unknown>) =>
  api().insertRow(sessionId, tableName, data);

export const deleteRow = (sessionId: string, tableName: string, pkColumn: string, pkValue: unknown) =>
  api().deleteRow(sessionId, tableName, pkColumn, pkValue);

// ── Transactions ─────────────────────────────────────────────────────────────

export const beginTransaction = (sessionId: string) => api().beginTransaction(sessionId);
export const commitTransaction = (sessionId: string) => api().commitTransaction(sessionId);
export const rollbackTransaction = (sessionId: string) => api().rollbackTransaction(sessionId);
export const getTransactionStatus = (sessionId: string) => api().getTransactionStatus(sessionId);

// ── Maintenance ───────────────────────────────────────────────────────────────

export const getStats = (sessionId: string) => api().getStats(sessionId);
export const runMaintenance = (sessionId: string, taskId: string) =>
  api().runMaintenance(sessionId, taskId);

// ── Saved connections ─────────────────────────────────────────────────────────

export const listConnections = () => api().listConnections();
export const getConnection = (id: string) => api().getConnection(id);
export const saveConnection = (name: string, config: unknown, password?: string) =>
  api().saveConnection(name, config, password);
export const updateConnection = (id: string, name: string, config: unknown, password?: string) =>
  api().updateConnection(id, name, config, password);
export const deleteConnection = (id: string) => api().deleteConnection(id);
export const connectSaved = async (id: string) => {
  const result = await api().connectSaved(id);
  if (!result.ok) throw new Error(result.error ?? 'Failed to connect');
  return result as { ok: true; sessionId: string; name?: string };
};
