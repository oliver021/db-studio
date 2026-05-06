// MySQL dialect helpers — quoting, introspection SQL, WHERE clause builder.
// All identifier quoting in MysqlDriver must go through these helpers.

import type { FilterRule } from '../drivers/Driver.js';

/** Safely quote a MySQL identifier using backticks. */
export function quoteIdent(name: string): string {
  return `\`${name.replace(/`/g, '``')}\``;
}

/** Build pagination SQL fragment (LIMIT/OFFSET). */
export function paginationClause(limit: number, offset: number): string {
  return `LIMIT ${limit} OFFSET ${offset}`;
}

// ── Introspection SQL ───────────────────────────────────────────────────────
// All queries are parameterised (? positional placeholders, mysql2 style).

export const TABLES_SQL = `
  SELECT TABLE_NAME  AS \`name\`, TABLE_TYPE AS table_type
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = ?
    AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
  ORDER BY TABLE_TYPE, TABLE_NAME
`;

export const COLUMNS_SQL = `
  SELECT
    COLUMN_NAME                 AS \`name\`,
    DATA_TYPE                   AS \`type\`,
    IS_NULLABLE                 AS is_nullable,
    COLUMN_DEFAULT              AS default_value,
    COLUMN_KEY                  AS column_key,
    ORDINAL_POSITION
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = ?
    AND TABLE_NAME   = ?
  ORDER BY ORDINAL_POSITION
`;

export const INDEXES_SQL = `
  SELECT
    INDEX_NAME  AS \`name\`,
    NON_UNIQUE  AS non_unique
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = ?
    AND TABLE_NAME   = ?
  GROUP BY INDEX_NAME, NON_UNIQUE
  ORDER BY INDEX_NAME
`;

export const RELATIONS_SQL = `
  SELECT
    TABLE_NAME            AS from_table,
    COLUMN_NAME           AS from_column,
    REFERENCED_TABLE_NAME AS to_table,
    REFERENCED_COLUMN_NAME AS to_column,
    'NO ACTION'           AS on_update,
    'NO ACTION'           AS on_delete
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = ?
    AND REFERENCED_TABLE_NAME IS NOT NULL
  ORDER BY from_table, from_column
`;

// For FK on_update / on_delete we need REFERENTIAL_CONSTRAINTS
export const REFERENTIAL_CONSTRAINTS_SQL = `
  SELECT
    CONSTRAINT_NAME,
    UPDATE_RULE AS on_update,
    DELETE_RULE AS on_delete
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = ?
`;

// ── WHERE clause builder (uses ? positional params) ────────────────────────

interface WhereResult {
  clause: string;
  params: unknown[];
}

export function buildWhereClause(
  columnNames: string[],
  search?: string,
  filters: FilterRule[] = [],
): WhereResult {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (search?.trim()) {
    const searchClauses = columnNames.map(col => `${quoteIdent(col)} LIKE ?`);
    const searchParam = `%${search.trim()}%`;
    clauses.push(`(${searchClauses.join(' OR ')})`);
    params.push(...columnNames.map(() => searchParam));
  }

  for (const f of filters) {
    const { column, operator, value } = f;
    if (!column || !operator) continue;

    let sqlOp = operator;
    let sqlVal: unknown = value;

    switch (operator) {
      case 'contains': sqlOp = 'LIKE'; sqlVal = `%${value}%`; break;
      case 'starts':   sqlOp = 'LIKE'; sqlVal = `${value}%`;  break;
      case 'ends':     sqlOp = 'LIKE'; sqlVal = `%${value}`;  break;
      case 'null':     sqlOp = 'IS NULL';     sqlVal = undefined; break;
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
