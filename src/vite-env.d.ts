/// <reference types="vite/client" />
/* eslint-disable @typescript-eslint/no-explicit-any */

// Renderer-side shape of window.dbstudio (matches electron/preload.cts).
// Use src/services/dbClient.ts instead of accessing this global directly.
interface DbStudio {
  // Session management
  openDialog: () => Promise<{ ok: boolean; sessionId?: string; name?: string; path?: string; error?: string } | null>;
  openSession: (config: unknown, name?: string) => Promise<{ ok: boolean; sessionId?: string; error?: string }>;
  closeSession: (sessionId: string) => Promise<{ ok: boolean }>;
  listSessions: () => Promise<Array<{ sessionId: string; name: string; kind: string }>>;
  testConnection: (config: unknown) => Promise<{ ok: boolean; error?: string }>;

  // Schema & relations
  getSchema: (sessionId: string) => Promise<any[]>;
  getRelations: (sessionId: string) => Promise<any[]>;
  capabilities: (sessionId: string) => Promise<any>;

  // Table data
  getTableRowCount: (sessionId: string, tableName: string, search?: string, filters?: any[]) => Promise<number>;
  getTableData: (sessionId: string, tableName: string, opts: any) => Promise<any[]>;

  // Query
  executeQuery: (sessionId: string, sql: string, params?: unknown[]) => Promise<any>;
  explainQueryPlan: (sessionId: string, sql: string) => Promise<any[]>;

  // CRUD
  updateRow: (sessionId: string, tableName: string, pkColumn: string, pkValue: unknown, changes: any) => Promise<any>;
  insertRow: (sessionId: string, tableName: string, data: any) => Promise<any>;
  deleteRow: (sessionId: string, tableName: string, pkColumn: string, pkValue: unknown) => Promise<any>;

  // Transactions
  beginTransaction: (sessionId: string) => Promise<void>;
  commitTransaction: (sessionId: string) => Promise<void>;
  rollbackTransaction: (sessionId: string) => Promise<void>;
  getTransactionStatus: (sessionId: string) => Promise<boolean>;

  // Maintenance
  getStats: (sessionId: string) => Promise<any>;
  runMaintenance: (sessionId: string, taskId: string) => Promise<any>;

  // Settings
  getSettings: () => Promise<any>;
  setSettings: (patch: unknown) => Promise<any>;
  resetSettings: () => Promise<any>;

  // Saved connections
  listConnections: () => Promise<any[]>;
  getConnection: (id: string) => Promise<any | null>;
  saveConnection: (name: string, config: unknown, password?: string) => Promise<any>;
  updateConnection: (id: string, name: string, config: unknown, password?: string) => Promise<any>;
  deleteConnection: (id: string) => Promise<{ ok: boolean }>;
  connectSaved: (id: string) => Promise<{ ok: boolean; sessionId?: string; name?: string; error?: string }>;
}

interface Window {
  dbstudio: DbStudio;
}
