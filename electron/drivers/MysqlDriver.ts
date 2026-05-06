/* eslint-disable @typescript-eslint/no-explicit-any */
import mysql from 'mysql2/promise';
import type { Pool, PoolConnection } from 'mysql2/promise';
import type { Driver, PaginationOptions, FilterRule } from './Driver.js';
import type {
  TableMeta, ColumnMeta, IndexMeta, RelationMeta,
  QueryResult, DbStats, Capabilities, ConnectionConfig, MaintenanceTask,
} from '../models/index.js';
import {
  quoteIdent, paginationClause,
  TABLES_SQL, COLUMNS_SQL, INDEXES_SQL, RELATIONS_SQL, REFERENTIAL_CONSTRAINTS_SQL,
  buildWhereClause,
} from '../dialect/mysql.js';

const MYSQL_CAPABILITIES: Capabilities = {
  dialect: 'mysql',
  supportsTransactions: true,
  supportsExplain: true,
  hasMaintenance: true,
  identifierQuote: '`',
  defaultPort: 3306,
  maintenanceTasks: [
    {
      id: 'optimize',
      name: 'OPTIMIZE TABLE',
      description: 'Defragments and reclaims unused space for all tables in the database.',
      buttonLabel: 'Optimize All Tables',
      style: 'primary',
    },
    {
      id: 'analyze',
      name: 'ANALYZE TABLE',
      description: 'Updates key distribution statistics used by the query optimizer.',
      buttonLabel: 'Analyze All Tables',
      style: 'primary',
    },
    {
      id: 'check',
      name: 'CHECK TABLE',
      description: 'Checks all tables for errors and consistency.',
      buttonLabel: 'Check All Tables',
      style: 'secondary',
    },
  ] satisfies MaintenanceTask[],
};

export class MysqlDriver implements Driver {
  private pool: Pool | null = null;
  private database = '';
  private txConn: PoolConnection | null = null;
  private inTx = false;

  capabilities(): Capabilities {
    return MYSQL_CAPABILITIES;
  }

  async connect(config: ConnectionConfig): Promise<void> {
    if (config.kind !== 'mysql') throw new Error('MysqlDriver only handles mysql configs');
    if (this.pool) await this.pool.end();
    this.database = config.database || '';
    this.pool = mysql.createPool({
      host:              config.host,
      port:              config.port,
      // Omit database when empty — MySQL allows connecting at the server level
      // without selecting a database, enabling SHOW DATABASES to be called.
      ...(config.database ? { database: config.database } : {}),
      user:              config.user,
      password:          config.password,
      ssl:               config.ssl ? { rejectUnauthorized: false } : undefined,
      connectionLimit:   5,
      waitForConnections: true,
      connectTimeout:    10_000,
    });
    // Verify connectivity
    const conn = await this.pool.getConnection();
    conn.release();
  }

  async listDatabases(): Promise<string[]> {
    const pool = this.requirePool();
    const SYSTEM_DBS = new Set(['information_schema', 'mysql', 'performance_schema', 'sys']);
    const [rows] = await pool.query('SHOW DATABASES') as any;
    return (rows as any[])
      .map((r: any) => String(r.Database ?? r.database ?? ''))
      .filter((name: string) => name && !SYSTEM_DBS.has(name.toLowerCase()));
  }

  async disconnect(): Promise<void> {
    if (this.txConn) {
      // eslint-disable-next-line no-empty
      try { await this.txConn.query('ROLLBACK'); } catch {}
      this.txConn.release();
      this.txConn = null;
      this.inTx = false;
    }
    await this.pool?.end();
    this.pool = null;
  }

  async getSchema(): Promise<TableMeta[]> {
    const pool = this.requirePool();
    const [tableRows] = await pool.query(TABLES_SQL, [this.database]) as any;
    const tables = tableRows as { name: string; table_type: string }[];

    return Promise.all(tables.map(async t => {
      const [[colRows], [idxRows], [refRows]] = await Promise.all([
        pool.query(COLUMNS_SQL, [this.database, t.name]),
        pool.query(INDEXES_SQL, [this.database, t.name]),
        pool.query(REFERENTIAL_CONSTRAINTS_SQL, [this.database]),
      ]) as any;

      const columns: ColumnMeta[] = (colRows as any[]).map(c => ({
        name:         c.name,
        type:         c.type,
        pk:           c.column_key === 'PRI',
        notNull:      c.is_nullable === 'NO',
        defaultValue: c.default_value ?? null,
      }));

      const indexes: IndexMeta[] = (idxRows as any[]).map(i => ({
        name:   i.name,
        unique: i.non_unique === 0,
      }));

      void refRows; // used in getRelations, not here

      return {
        name:    t.name,
        type:    t.table_type === 'VIEW' ? 'view' : 'table',
        sql:     null,
        columns,
        indexes,
      } satisfies TableMeta;
    }));
  }

  async getRelations(): Promise<RelationMeta[]> {
    const pool = this.requirePool();
    const [kRows] = await pool.query(RELATIONS_SQL, [this.database]) as any;
    const [rRows] = await pool.query(REFERENTIAL_CONSTRAINTS_SQL, [this.database]) as any;

    const rcMap = new Map<string, { on_update: string; on_delete: string }>();
    for (const r of (rRows as any[])) {
      rcMap.set(r.CONSTRAINT_NAME ?? r.constraint_name, {
        on_update: r.on_update,
        on_delete: r.on_delete,
      });
    }

    return (kRows as any[]).map(r => {
      const rc = rcMap.get(r.constraint_name ?? '') ?? { on_update: 'NO ACTION', on_delete: 'NO ACTION' };
      return {
        fromTable:  r.from_table,
        fromColumn: r.from_column,
        toTable:    r.to_table,
        toColumn:   r.to_column,
        onUpdate:   rc.on_update,
        onDelete:   rc.on_delete,
      };
    });
  }

  async getTableRowCount(tableName: string, search?: string, filters: FilterRule[] = []): Promise<number> {
    const pool = this.requirePool();
    const colNames = await this.getColumnNames(tableName);
    const { clause, params } = buildWhereClause(colNames, search, filters);
    const sql = `SELECT COUNT(*) AS \`count\` FROM ${quoteIdent(tableName)}${clause}`;
    const [rows] = await pool.query(sql, params) as any;
    return Number((rows as any[])[0].count);
  }

  async getTableData(tableName: string, opts: PaginationOptions): Promise<Record<string, unknown>[]> {
    const pool = this.requirePool();
    const { limit = 50, offset = 0, sortColumn, sortDirection, search, filters = [] } = opts;
    const colNames = await this.getColumnNames(tableName);
    const { clause, params } = buildWhereClause(colNames, search, filters);

    let sql = `SELECT * FROM ${quoteIdent(tableName)}${clause}`;
    if (sortColumn) {
      const dir = sortDirection === 'desc' ? 'DESC' : 'ASC';
      sql += ` ORDER BY ${quoteIdent(sortColumn)} ${dir}`;
    }
    sql += ` ${paginationClause(limit, offset)}`;

    const [rows] = await pool.query(sql, params) as any;
    return rows as Record<string, unknown>[];
  }

  async executeQuery(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const client: any = this.txConn ?? this.requirePool();
    try {
      const [result] = await client.query(sql, params);
      if (Array.isArray(result)) {
        return { success: true, data: result as Record<string, unknown>[] };
      }
      return { success: true, info: { changes: (result as any).affectedRows ?? 0, lastInsertRowid: (result as any).insertId } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async explainQueryPlan(sql: string): Promise<Record<string, unknown>[]> {
    const pool = this.requirePool();
    const [rows] = await pool.query(`EXPLAIN FORMAT=JSON ${sql}`) as any;
    return rows as Record<string, unknown>[];
  }

  async updateRow(tableName: string, pkColumn: string, pkValue: unknown, changes: Record<string, unknown>): Promise<QueryResult> {
    const keys = Object.keys(changes);
    if (keys.length === 0) return { success: true, info: { changes: 0 } };
    const setClause = keys.map(k => `${quoteIdent(k)} = ?`).join(', ');
    const values = [...keys.map(k => changes[k]), pkValue];
    const sql = `UPDATE ${quoteIdent(tableName)} SET ${setClause} WHERE ${quoteIdent(pkColumn)} = ?`;
    try {
      const client: any = this.txConn ?? this.requirePool();
      const [result] = await client.query(sql, values);
      return { success: true, info: { changes: (result as any).affectedRows ?? 0 } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async insertRow(tableName: string, data: Record<string, unknown>): Promise<QueryResult> {
    const keys = Object.keys(data);
    const cols = keys.map(quoteIdent).join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO ${quoteIdent(tableName)} (${cols}) VALUES (${placeholders})`;
    try {
      const client: any = this.txConn ?? this.requirePool();
      const [result] = await client.query(sql, keys.map(k => data[k]));
      return { success: true, info: { changes: (result as any).affectedRows ?? 1, lastInsertRowid: (result as any).insertId } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async deleteRow(tableName: string, pkColumn: string, pkValue: unknown): Promise<QueryResult> {
    const sql = `DELETE FROM ${quoteIdent(tableName)} WHERE ${quoteIdent(pkColumn)} = ?`;
    try {
      const client: any = this.txConn ?? this.requirePool();
      const [result] = await client.query(sql, [pkValue]);
      return { success: true, info: { changes: (result as any).affectedRows ?? 0 } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async beginTransaction(): Promise<void> {
    if (this.inTx) return;
    this.txConn = await this.requirePool().getConnection();
    await this.txConn.beginTransaction();
    this.inTx = true;
  }

  async commitTransaction(): Promise<void> {
    if (!this.txConn) return;
    await this.txConn.commit();
    this.txConn.release();
    this.txConn = null;
    this.inTx = false;
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.txConn) return;
    await this.txConn.rollback();
    this.txConn.release();
    this.txConn = null;
    this.inTx = false;
  }

  getTransactionStatus(): boolean {
    return this.inTx;
  }

  async getStats(): Promise<DbStats> {
    const pool = this.requirePool();
    const [sizeRows] = await pool.query(
      `SELECT SUM(data_length + index_length) AS size
       FROM information_schema.TABLES
       WHERE table_schema = ?`,
      [this.database],
    ) as any;
    const size = Number((sizeRows as any[])[0].size ?? 0);

    const [tableRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
       WHERE table_schema = ? AND TABLE_TYPE = 'BASE TABLE'`,
      [this.database],
    ) as any;
    const tableCount = Number((tableRows as any[])[0].cnt);

    const [verRows] = await pool.query(`SELECT VERSION() AS ver`) as any;
    const version: string = (verRows as any[])[0].ver;

    return {
      items: [
        { label: 'Database Size', value: size, format: 'bytes', icon: 'HardDrive' },
        { label: 'Tables', value: tableCount, icon: 'Table2' },
        { label: 'Database', value: this.database, icon: 'Layers' },
        { label: 'Server Version', value: version, icon: 'Server' },
      ],
    };
  }

  async runMaintenance(taskId: string): Promise<{ success: boolean; message?: string; rows?: Record<string, unknown>[] }> {
    const pool = this.requirePool();
    try {
      // Get all table names in the current database
      const [tableRows] = await pool.query(
        `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
        [this.database],
      ) as any;
      const tables = (tableRows as any[]).map(r => quoteIdent(r.TABLE_NAME ?? r.table_name)).join(', ');
      if (!tables) return { success: true, message: 'No tables found' };

      let stmt = '';
      let label = '';
      switch (taskId) {
        case 'optimize':      stmt = `OPTIMIZE TABLE ${tables}`; label = 'OPTIMIZE'; break;
        case 'analyze':       stmt = `ANALYZE TABLE ${tables}`;  label = 'ANALYZE';  break;
        case 'check':         stmt = `CHECK TABLE ${tables}`;    label = 'CHECK';    break;
        default: return { success: false, message: `Unknown task: ${taskId}` };
      }

      const [rows] = await pool.query(stmt) as any;
      return {
        success: true,
        message: `${label} completed`,
        rows: rows as Record<string, unknown>[],
      };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private requirePool(): Pool {
    if (!this.pool) throw new Error('MysqlDriver not connected');
    return this.pool;
  }

  private async getColumnNames(tableName: string): Promise<string[]> {
    const [rows] = await this.requirePool().query(COLUMNS_SQL, [this.database, tableName]) as any;
    return (rows as any[]).map(r => r.name);
  }
}
