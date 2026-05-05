// Normalized DTOs shared between drivers and the renderer (via IPC).
// The renderer never sees engine-specific row shapes.

export interface ColumnMeta {
  name: string;
  type: string;
  pk: boolean;
  notNull: boolean;
  defaultValue: string | null;
}

export interface IndexMeta {
  name: string;
  unique: boolean;
}

export interface TableMeta {
  name: string;
  type: 'table' | 'view';
  sql: string | null;
  columns: ColumnMeta[];
  indexes: IndexMeta[];
}

export interface RelationMeta {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  onUpdate: string;
  onDelete: string;
}

export interface QueryResult {
  success: boolean;
  data?: Record<string, unknown>[];
  info?: { changes: number; lastInsertRowid?: number | bigint };
  error?: string;
}

export interface StatItem {
  label: string;
  value: string | number;
  /** Optional hint for formatting ('bytes' | 'boolean' | 'uppercase') */
  format?: 'bytes' | 'boolean' | 'uppercase';
  icon?: string;
}

export interface DbStats {
  items: StatItem[];
  /** Engine-specific extras passed through opaquely for advanced display */
  extra?: Record<string, unknown>;
}

export interface MaintenanceTask {
  id: string;
  name: string;
  description: string;
  buttonLabel: string;
  /** 'primary' | 'secondary' */
  style?: 'primary' | 'secondary';
}

export interface Capabilities {
  dialect: 'sqlite' | 'postgres' | 'mysql' | string;
  supportsTransactions: boolean;
  supportsExplain: boolean;
  /** Whether the Maintenance view should be shown for this engine */
  hasMaintenance: boolean;
  maintenanceTasks: MaintenanceTask[];
  defaultPort?: number;
  identifierQuote: '"' | '`';
}

// ── Connection Configs ──────────────────────────────────────────────────────

export interface SqliteConnectionConfig {
  kind: 'sqlite';
  path: string;
}

export interface PostgresConnectionConfig {
  kind: 'postgres';
  host: string;
  port: number;
  database: string;
  user: string;
  /** Password should come from keytar at open time, not stored here */
  password?: string;
  ssl?: boolean;
}

export interface MysqlConnectionConfig {
  kind: 'mysql';
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  ssl?: boolean;
}

export type ConnectionConfig =
  | SqliteConnectionConfig
  | PostgresConnectionConfig
  | MysqlConnectionConfig;

export type DriverKind = ConnectionConfig['kind'];
