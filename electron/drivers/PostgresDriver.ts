/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool, type PoolClient } from 'pg';
import type { Driver, PaginationOptions, FilterRule } from './Driver.js';
import type {
  TableMeta, ColumnMeta, IndexMeta, RelationMeta,
  QueryResult, DbStats, Capabilities, ConnectionConfig, MaintenanceTask,
} from '../models/index.js';
import {
  quoteIdent,
  TABLES_SQL, COLUMNS_SQL, PK_COLUMNS_SQL, INDEXES_SQL, RELATIONS_SQL,
  buildWhereClause,
} from '../dialect/postgres.js';

const PG_CAPABILITIES: Capabilities = {
  dialect: 'postgres',
  supportsTransactions: true,
  supportsExplain: true,
  hasMaintenance: true,
  identifierQuote: '"',
  maintenanceTasks: [
    {
      id: 'vacuum',
      name: 'VACUUM',
      description: 'Reclaims storage occupied by dead tuples.',
      buttonLabel: 'Run VACUUM',
      style: 'primary',
    },
    {
      id: 'analyze',
      name: 'ANALYZE',
      description: 'Collects statistics used by the query planner.',
      buttonLabel: 'Run ANALYZE',
      style: 'primary',
    },
    {
      id: 'vacuum_analyze',
      name: 'VACUUM ANALYZE',
      description: 'VACUUM followed by ANALYZE in one pass.',
      buttonLabel: 'VACUUM ANALYZE',
      style: 'secondary',
    },
  ] satisfies MaintenanceTask[],
};

export class PostgresDriver implements Driver {
  private pool: Pool | null = null;
  private schema = 'public';
  private txClient: PoolClient | null = null;
  private inTx = false;
  capabilities(): Capabilities {
    return PG_CAPABILITIES;
  }

  async connect(config: ConnectionConfig): Promise<void> {
    if (config.kind !== 'postgres') throw new Error('PostgresDriver only handles postgres configs');
    if (this.pool) await this.pool.end();
    this.pool = new Pool({
      host:     config.host,
      port:     config.port,
      // Fall back to 'postgres' system database when no specific database is
      // provided — used for server-level connections that list databases.
      database: config.database || 'postgres',
      user:     config.user,
      password: config.password,
      ssl:      config.ssl ? { rejectUnauthorized: false } : false,
      max:      5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    // Verify connectivity
    const client = await this.pool.connect();
    client.release();
  }

  async listDatabases(): Promise<string[]> {
    const pool = this.requirePool();
    const result = await pool.query(
      `SELECT datname FROM pg_database
       WHERE datistemplate = false AND datallowconn = true
       ORDER BY datname`,
    );
    return (result.rows as { datname: string }[]).map(r => r.datname);
  }

  async disconnect(): Promise<void> {
    if (this.txClient) {
      // eslint-disable-next-line no-empty
      try { await this.txClient.query('ROLLBACK'); } catch {}
      this.txClient.release();
      this.txClient = null;
      this.inTx = false;
    }
    await this.pool?.end();
    this.pool = null;
  }

  async getSchema(): Promise<TableMeta[]> {
    const pool = this.requirePool();
    const tables = (await pool.query(TABLES_SQL, [this.schema])).rows as { name: string; table_type: string }[];

    return Promise.all(tables.map(async t => {
      const [colRows, pkRows, idxRows] = await Promise.all([
        pool.query(COLUMNS_SQL, [this.schema, t.name]),
        pool.query(PK_COLUMNS_SQL, [this.schema, t.name]),
        pool.query(INDEXES_SQL, [this.schema, t.name]),
      ]);

      const pkSet = new Set<string>((pkRows.rows as { column_name: string }[]).map(r => r.column_name));

      const columns: ColumnMeta[] = (colRows.rows as any[]).map(c => ({
        name: c.name,
        type: c.type,
        pk: pkSet.has(c.name),
        notNull: c.is_nullable === 'NO',
        defaultValue: c.default_value ?? null,
      }));

      const indexes: IndexMeta[] = (idxRows.rows as any[]).map(i => ({
        name: i.name,
        unique: i.unique === true || i.unique === 't',
      }));

      return {
        name: t.name,
        type: t.table_type === 'VIEW' ? 'view' : 'table',
        sql: null,
        columns,
        indexes,
      } satisfies TableMeta;
    }));
  }

  async getRelations(): Promise<RelationMeta[]> {
    const pool = this.requirePool();
    const rows = (await pool.query(RELATIONS_SQL, [this.schema])).rows as any[];
    return rows.map(r => ({
      fromTable:  r.from_table,
      fromColumn: r.from_column,
      toTable:    r.to_table,
      toColumn:   r.to_column,
      onUpdate:   r.on_update,
      onDelete:   r.on_delete,
    }));
  }

  async getTableRowCount(tableName: string, search?: string, filters: FilterRule[] = []): Promise<number> {
    const pool = this.requirePool();
    const colNames = await this.getColumnNames(tableName);
    const { clause, params } = buildWhereClause(colNames, search, filters);
    const sql = `SELECT COUNT(*)::int AS count FROM ${quoteIdent(tableName)}${clause}`;
    const result = await pool.query(sql, params);
    return result.rows[0].count as number;
  }

  async getTableData(tableName: string, opts: PaginationOptions): Promise<Record<string, unknown>[]> {
    const pool = this.requirePool();
    const { limit = 50, offset = 0, sortColumn, sortDirection, search, filters = [] } = opts;
    const colNames = await this.getColumnNames(tableName);
    const { clause, params, nextIdx } = buildWhereClause(colNames, search, filters);

    let sql = `SELECT * FROM ${quoteIdent(tableName)}${clause}`;
    if (sortColumn) {
      const dir = sortDirection === 'desc' ? 'DESC' : 'ASC';
      sql += ` ORDER BY ${quoteIdent(sortColumn)} ${dir}`;
    }
    sql += ` LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    params.push(limit, offset);

    const result = await pool.query(sql, params);
    return result.rows;
  }

  async executeQuery(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const client = this.txClient ?? this.requirePool();
    try {
      const result = await (client as any).query(sql, params);
      // pg sets result.command to the SQL verb ('SELECT', 'INSERT', 'UPDATE', etc.)
      const isRead = result.command === 'SELECT' || result.command === 'WITH';
      if (isRead) {
        return { success: true, data: result.rows };
      }
      return { success: true, info: { changes: result.rowCount ?? 0 } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async explainQueryPlan(sql: string): Promise<Record<string, unknown>[]> {
    const pool = this.requirePool();
    const result = await pool.query(`EXPLAIN (FORMAT JSON, ANALYZE false) ${sql}`);
    // Returns one row: { "QUERY PLAN": [...] } — wrap for consistent shape
    return result.rows;
  }

  async updateRow(tableName: string, pkColumn: string, pkValue: unknown, changes: Record<string, unknown>): Promise<QueryResult> {
    const keys = Object.keys(changes);
    if (keys.length === 0) return { success: true, info: { changes: 0 } };
    let idx = 1;
    const setClause = keys.map(k => `${quoteIdent(k)} = $${idx++}`).join(', ');
    const values = [...keys.map(k => changes[k]), pkValue];
    const sql = `UPDATE ${quoteIdent(tableName)} SET ${setClause} WHERE ${quoteIdent(pkColumn)} = $${idx}`;
    try {
      const client = this.txClient ?? this.requirePool();
      const result = await (client as any).query(sql, values);
      return { success: true, info: { changes: result.rowCount ?? 0 } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async insertRow(tableName: string, data: Record<string, unknown>): Promise<QueryResult> {
    const keys = Object.keys(data);
    const cols = keys.map(quoteIdent).join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO ${quoteIdent(tableName)} (${cols}) VALUES (${placeholders}) RETURNING *`;
    try {
      const client = this.txClient ?? this.requirePool();
      const result = await (client as any).query(sql, keys.map(k => data[k]));
      return { success: true, data: result.rows, info: { changes: result.rowCount ?? 1 } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async deleteRow(tableName: string, pkColumn: string, pkValue: unknown): Promise<QueryResult> {
    const sql = `DELETE FROM ${quoteIdent(tableName)} WHERE ${quoteIdent(pkColumn)} = $1`;
    try {
      const client = this.txClient ?? this.requirePool();
      const result = await (client as any).query(sql, [pkValue]);
      return { success: true, info: { changes: result.rowCount ?? 0 } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async beginTransaction(): Promise<void> {
    if (this.inTx) return;
    const pool = this.requirePool();
    this.txClient = await pool.connect();
    await this.txClient.query('BEGIN');
    this.inTx = true;
  }

  async commitTransaction(): Promise<void> {
    if (!this.txClient) return;
    await this.txClient.query('COMMIT');
    this.txClient.release();
    this.txClient = null;
    this.inTx = false;
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.txClient) return;
    await this.txClient.query('ROLLBACK');
    this.txClient.release();
    this.txClient = null;
    this.inTx = false;
  }

  getTransactionStatus(): boolean {
    return this.inTx;
  }

  async getStats(): Promise<DbStats> {
    const pool = this.requirePool();
    const [sizeRes, pgRes] = await Promise.all([
      pool.query(`SELECT pg_database_size(current_database())::bigint AS size`),
      pool.query(`SELECT version() AS ver`),
    ]);
    const size = Number(sizeRes.rows[0].size);
    const version: string = pgRes.rows[0].ver;
    const shortVersion = version.match(/PostgreSQL ([^\s,]+)/)?.[1] ?? version;

    const tableCount = (await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      [this.schema],
    )).rows[0].cnt as number;

    return {
      items: [
        { label: 'Database Size', value: size, format: 'bytes', icon: 'HardDrive' },
        { label: 'Tables', value: tableCount, icon: 'Table2' },
        { label: 'Schema', value: this.schema, icon: 'Layers' },
        { label: 'Server Version', value: shortVersion, icon: 'Server' },
      ],
    };
  }

  async runMaintenance(taskId: string): Promise<{ success: boolean; message?: string; rows?: Record<string, unknown>[] }> {
    const pool = this.requirePool();
    try {
      switch (taskId) {
        case 'vacuum':
          await pool.query('VACUUM');
          return { success: true, message: 'VACUUM completed successfully' };
        case 'analyze':
          await pool.query('ANALYZE');
          return { success: true, message: 'ANALYZE completed successfully' };
        case 'vacuum_analyze':
          await pool.query('VACUUM ANALYZE');
          return { success: true, message: 'VACUUM ANALYZE completed successfully' };
        default:
          return { success: false, message: `Unknown task: ${taskId}` };
      }
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private requirePool(): Pool {
    if (!this.pool) throw new Error('PostgresDriver not connected');
    return this.pool;
  }

  private async getColumnNames(tableName: string): Promise<string[]> {
    const rows = (await this.requirePool().query(COLUMNS_SQL, [this.schema, tableName])).rows as { name: string }[];
    return rows.map(r => r.name);
  }
}
