import Database from 'better-sqlite3';
import type { Driver, PaginationOptions, FilterRule } from './Driver.js';
import type {
  TableMeta, ColumnMeta, IndexMeta, RelationMeta,
  QueryResult, DbStats, Capabilities, ConnectionConfig,
  MaintenanceTask,
} from '../models/index.js';
import {
  quoteIdent, SCHEMA_SQL, tableInfoSQL, indexListSQL,
  foreignKeyListSQL, TABLES_SQL, buildWhereClause, paginationClause,
} from '../dialect/sqlite.js';

const SQLITE_CAPABILITIES: Capabilities = {
  dialect: 'sqlite',
  supportsTransactions: true,
  supportsExplain: true,
  hasMaintenance: true,
  identifierQuote: '"',
  maintenanceTasks: [
    {
      id: 'vacuum',
      name: 'VACUUM',
      description: 'Rebuilds the database file, reclaiming unused space and defragmenting.',
      buttonLabel: 'Run Vacuum',
      style: 'primary',
    },
    {
      id: 'optimize',
      name: 'PRAGMA Optimize',
      description: 'Analyzes tables to improve query planner decisions.',
      buttonLabel: 'Optimize',
      style: 'primary',
    },
    {
      id: 'integrity',
      name: 'Integrity Check',
      description: 'Scans the entire database for corruption, mismatched indices, and malformed data.',
      buttonLabel: 'Check Integrity',
      style: 'secondary',
    },
  ] satisfies MaintenanceTask[],
};

export class SqliteDriver implements Driver {
  private db: Database.Database | null = null;
  private dbPath: string | null = null;
  private inTransaction = false;

  capabilities(): Capabilities {
    return SQLITE_CAPABILITIES;
  }

  async connect(config: ConnectionConfig): Promise<void> {
    if (config.kind !== 'sqlite') throw new Error('SqliteDriver only handles sqlite configs');
    if (this.db) this.db.close();
    this.db = new Database(config.path, { fileMustExist: false });
    this.dbPath = config.path;
  }

  async disconnect(): Promise<void> {
    this.db?.close();
    this.db = null;
    this.dbPath = null;
    this.inTransaction = false;
  }

  async getSchema(): Promise<TableMeta[]> {
    const db = this.requireDb();
    const rows = db.prepare(SCHEMA_SQL).all() as { name: string; type: string; sql: string | null }[];

    return rows.map(t => {
      const rawCols = db.prepare(tableInfoSQL(t.name)).all() as any[];
      const rawIdxs = db.prepare(indexListSQL(t.name)).all() as any[];

      const columns: ColumnMeta[] = rawCols.map(c => ({
        name: c.name,
        type: (c.type as string) || '',
        pk: c.pk === 1,
        notNull: c.notnull === 1,
        defaultValue: c.dflt_value ?? null,
      }));

      const indexes: IndexMeta[] = rawIdxs.map(i => ({
        name: i.name as string,
        unique: i.unique === 1,
      }));

      return {
        name: t.name,
        type: t.type as 'table' | 'view',
        sql: t.sql,
        columns,
        indexes,
      };
    });
  }

  async getRelations(): Promise<RelationMeta[]> {
    const db = this.requireDb();
    const tables = db.prepare(TABLES_SQL).all() as { name: string }[];
    const relations: RelationMeta[] = [];
    for (const t of tables) {
      const fks = db.prepare(foreignKeyListSQL(t.name)).all() as any[];
      for (const fk of fks) {
        relations.push({
          fromTable: t.name,
          fromColumn: fk.from,
          toTable: fk.table,
          toColumn: fk.to,
          onUpdate: fk.on_update,
          onDelete: fk.on_delete,
        });
      }
    }
    return relations;
  }

  async getTableRowCount(tableName: string, search?: string, filters: FilterRule[] = []): Promise<number> {
    const db = this.requireDb();
    const colNames = this.getColumnNames(db, tableName);
    const { clause, params } = buildWhereClause(colNames, search, filters);
    const row = db.prepare(`SELECT COUNT(*) as count FROM ${quoteIdent(tableName)}${clause}`).get(...params) as any;
    return row.count as number;
  }

  async getTableData(tableName: string, opts: PaginationOptions): Promise<Record<string, unknown>[]> {
    const db = this.requireDb();
    const { limit = 50, offset = 0, sortColumn, sortDirection, search, filters = [] } = opts;
    const colNames = this.getColumnNames(db, tableName);
    const { clause, params } = buildWhereClause(colNames, search, filters);

    let sql = `SELECT * FROM ${quoteIdent(tableName)}${clause}`;
    if (sortColumn) {
      const dir = sortDirection === 'desc' ? 'DESC' : 'ASC';
      sql += ` ORDER BY ${quoteIdent(sortColumn)} ${dir}`;
    }
    sql += ` ${paginationClause(limit, offset)}`;

    return db.prepare(sql).all(...params) as Record<string, unknown>[];
  }

  async executeQuery(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const db = this.requireDb();
    const trimmed = sql.trim().toUpperCase();
    const isRead = trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA') || trimmed.startsWith('WITH') || trimmed.startsWith('EXPLAIN');
    try {
      const stmt = db.prepare(sql);
      if (isRead) {
        return { success: true, data: stmt.all(...params) as Record<string, unknown>[] };
      } else {
        const info = stmt.run(...params);
        return { success: true, info: { changes: info.changes, lastInsertRowid: info.lastInsertRowid } };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async explainQueryPlan(sql: string): Promise<Record<string, unknown>[]> {
    const db = this.requireDb();
    return db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as Record<string, unknown>[];
  }

  async updateRow(tableName: string, pkColumn: string, pkValue: unknown, changes: Record<string, unknown>): Promise<QueryResult> {
    const db = this.requireDb();
    const keys = Object.keys(changes);
    if (keys.length === 0) return { success: true, info: { changes: 0 } };
    const setClause = keys.map(k => `${quoteIdent(k)} = ?`).join(', ');
    const values = [...keys.map(k => changes[k]), pkValue];
    try {
      const info = db.prepare(`UPDATE ${quoteIdent(tableName)} SET ${setClause} WHERE ${quoteIdent(pkColumn)} = ?`).run(...values);
      return { success: true, info: { changes: info.changes } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async insertRow(tableName: string, data: Record<string, unknown>): Promise<QueryResult> {
    const db = this.requireDb();
    const keys = Object.keys(data);
    const cols = keys.map(quoteIdent).join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    try {
      const info = db.prepare(`INSERT INTO ${quoteIdent(tableName)} (${cols}) VALUES (${placeholders})`).run(...keys.map(k => data[k]));
      return { success: true, info: { changes: info.changes, lastInsertRowid: info.lastInsertRowid } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async deleteRow(tableName: string, pkColumn: string, pkValue: unknown): Promise<QueryResult> {
    const db = this.requireDb();
    try {
      const info = db.prepare(`DELETE FROM ${quoteIdent(tableName)} WHERE ${quoteIdent(pkColumn)} = ?`).run(pkValue);
      return { success: true, info: { changes: info.changes } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async beginTransaction(): Promise<void> {
    if (this.inTransaction) return;
    this.requireDb().prepare('BEGIN TRANSACTION').run();
    this.inTransaction = true;
  }

  async commitTransaction(): Promise<void> {
    if (!this.inTransaction) return;
    this.requireDb().prepare('COMMIT').run();
    this.inTransaction = false;
  }

  async rollbackTransaction(): Promise<void> {
    if (!this.inTransaction) return;
    this.requireDb().prepare('ROLLBACK').run();
    this.inTransaction = false;
  }

  getTransactionStatus(): boolean {
    return this.inTransaction;
  }

  async getStats(): Promise<DbStats> {
    const db = this.requireDb();
    if (!this.dbPath) throw new Error('No database path');
    const journalMode = (db.prepare('PRAGMA journal_mode').get() as any)['journal_mode'];
    const synchronous = (db.prepare('PRAGMA synchronous').get() as any)['synchronous'];
    const foreignKeys = (db.prepare('PRAGMA foreign_keys').get() as any)['foreign_keys'];
    const pageSize = (db.prepare('PRAGMA page_size').get() as any)['page_size'] as number;
    const pageCount = (db.prepare('PRAGMA page_count').get() as any)['page_count'] as number;

    return {
      items: [
        { label: 'Database Size', value: pageSize * pageCount, format: 'bytes', icon: 'HardDrive' },
        { label: 'Journal Mode', value: journalMode, format: 'uppercase', icon: 'FileText' },
        { label: 'Foreign Keys', value: foreignKeys, format: 'boolean', icon: 'ShieldCheck' },
        { label: 'Page Count', value: pageCount, icon: 'Zap' },
      ],
      extra: { path: this.dbPath, pageSize, synchronous },
    };
  }

  async runMaintenance(taskId: string): Promise<{ success: boolean; message?: string; rows?: Record<string, unknown>[] }> {
    const db = this.requireDb();
    try {
      switch (taskId) {
        case 'vacuum':
          db.prepare('VACUUM').run();
          return { success: true, message: 'VACUUM completed successfully' };
        case 'optimize':
          db.prepare('PRAGMA optimize').run();
          return { success: true, message: 'PRAGMA optimize completed successfully' };
        case 'integrity': {
          const rows = db.prepare('PRAGMA integrity_check').all() as Record<string, unknown>[];
          const ok = rows.length > 0 && (rows[0] as any)['integrity_check'] === 'ok';
          return {
            success: true,
            message: ok ? 'Integrity Check: PASSED' : 'Integrity Check: FAILED',
            rows,
          };
        }
        default:
          return { success: false, message: `Unknown task: ${taskId}` };
      }
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private requireDb(): Database.Database {
    if (!this.db) throw new Error('Database not connected');
    return this.db;
  }

  private getColumnNames(db: Database.Database, tableName: string): string[] {
    const cols = db.prepare(tableInfoSQL(tableName)).all() as { name: string }[];
    return cols.map(c => c.name);
  }
}
