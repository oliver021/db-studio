// SQLite dialect helpers — quoting, introspection SQL, WHERE clause builder.
// All identifier quoting in SqliteDriver must go through these helpers.

import type { FilterRule } from '../drivers/Driver.js';

/** Safely quote a SQLite identifier. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Build pagination SQL fragment. */
export function paginationClause(limit: number, offset: number): string {
  return `LIMIT ${limit} OFFSET ${offset}`;
}

// ── Introspection SQL ───────────────────────────────────────────────────────

export const SCHEMA_SQL = `
  SELECT name, type, sql
  FROM sqlite_master
  WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
  ORDER BY type, name
`;

export function tableInfoSQL(tableName: string): string {
  return `PRAGMA table_info(${quoteIdent(tableName)})`;
}

export function indexListSQL(tableName: string): string {
  return `PRAGMA index_list(${quoteIdent(tableName)})`;
}

export function indexInfoSQL(indexName: string): string {
  return `PRAGMA index_info(${quoteIdent(indexName)})`;
}

export function foreignKeyListSQL(tableName: string): string {
  return `PRAGMA foreign_key_list(${quoteIdent(tableName)})`;
}

export const TABLES_SQL = `
  SELECT name FROM sqlite_master
  WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
`;

// ── WHERE clause builder ────────────────────────────────────────────────────

interface WhereResult {
  clause: string;
  params: unknown[];
}

/**
 * Build a WHERE clause from an optional full-text search term and structured
 * filter rules. Column names come from the caller (already validated against
 * schema) so no need to parameterise them, but we do quote them.
 */
export function buildWhereClause(
  columnNames: string[],
  search?: string,
  filters: FilterRule[] = [],
): WhereResult {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (search?.trim()) {
    const searchClauses = columnNames.map(c => `${quoteIdent(c)} LIKE ?`);
    const searchParam = `%${search.trim()}%`;
    clauses.push(`(${searchClauses.join(' OR ')})`);
    params.push(...columnNames.map(() => searchParam));
  }

  for (const f of filters) {
    const { column, operator, value } = f;
    if (!column || !operator) continue;

    let sqlOp = operator;
    let sqlVal = value;

    switch (operator) {
      case 'contains': sqlOp = 'LIKE'; sqlVal = `%${value}%`; break;
      case 'starts':   sqlOp = 'LIKE'; sqlVal = `${value}%`; break;
      case 'ends':     sqlOp = 'LIKE'; sqlVal = `%${value}`; break;
      case 'null':     sqlOp = 'IS NULL'; sqlVal = undefined; break;
      case 'not_null': sqlOp = 'IS NOT NULL'; sqlVal = undefined; break;
    }

    if (sqlOp === 'IS NULL' || sqlOp === 'IS NOT NULL') {
      clauses.push(`${quoteIdent(column)} ${sqlOp}`);
    } else {
      clauses.push(`${quoteIdent(column)} ${sqlOp} ?`);
      params.push(sqlVal);
    }
  }

  return {
    clause: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}
