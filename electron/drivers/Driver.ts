import type {
  TableMeta, RelationMeta, QueryResult,
  DbStats, Capabilities, ConnectionConfig,
} from '../models/index.js';

export interface PaginationOptions {
  limit: number;
  offset: number;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  search?: string;
  filters?: FilterRule[];
}

export interface FilterRule {
  column: string;
  operator: string;
  value?: unknown;
}

/** Every database engine implements this contract. */
export interface Driver {
  /** Engine identity & feature flags — cheap, synchronous-friendly. */
  capabilities(): Capabilities;

  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;

  getSchema(): Promise<TableMeta[]>;
  getRelations(): Promise<RelationMeta[]>;

  getTableRowCount(tableName: string, search?: string, filters?: FilterRule[]): Promise<number>;
  getTableData(tableName: string, opts: PaginationOptions): Promise<Record<string, unknown>[]>;

  executeQuery(sql: string, params?: unknown[]): Promise<QueryResult>;
  explainQueryPlan(sql: string): Promise<Record<string, unknown>[]>;

  updateRow(tableName: string, pkColumn: string, pkValue: unknown, changes: Record<string, unknown>): Promise<QueryResult>;
  insertRow(tableName: string, data: Record<string, unknown>): Promise<QueryResult>;
  deleteRow(tableName: string, pkColumn: string, pkValue: unknown): Promise<QueryResult>;

  beginTransaction(): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(): Promise<void>;
  getTransactionStatus(): boolean;

  getStats(): Promise<DbStats>;
  runMaintenance(taskId: string): Promise<{ success: boolean; message?: string; rows?: Record<string, unknown>[] }>;
}
