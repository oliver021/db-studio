// PostgreSQL dialect helpers — quoting, introspection SQL, WHERE clause builder.
// All identifier quoting in PostgresDriver must go through these helpers.

import type { FilterRule } from '../drivers/Driver.js';

/** Safely quote a PostgreSQL identifier. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Build pagination SQL fragment (LIMIT/OFFSET, same as SQLite). */
export function paginationClause(limit: number, offset: number): string {
  return `LIMIT ${limit} OFFSET ${offset}`;
}

// ── Introspection SQL ───────────────────────────────────────────────────────
// All queries are parameterised ($1 = schema, $2 = table where applicable).

export const TABLES_SQL = `
  SELECT table_name AS name, table_type
  FROM information_schema.tables
  WHERE table_schema = $1
    AND table_type IN ('BASE TABLE', 'VIEW')
  ORDER BY table_type, table_name
`;

export const COLUMNS_SQL = `
  SELECT
    column_name                           AS name,
    udt_name                              AS type,
    is_nullable                           AS is_nullable,
    column_default                        AS default_value,
    ordinal_position
  FROM information_schema.columns
  WHERE table_schema = $1
    AND table_name   = $2
  ORDER BY ordinal_position
`;

export const PK_COLUMNS_SQL = `
  SELECT kcu.column_name
  FROM information_schema.table_constraints  tc
  JOIN information_schema.key_column_usage   kcu
    ON  tc.constraint_name  = kcu.constraint_name
    AND tc.table_schema     = kcu.table_schema
  WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema = $1
    AND tc.table_name   = $2
`;

export const INDEXES_SQL = `
  SELECT
    i.relname     AS name,
    ix.indisunique AS unique
  FROM pg_class      t
  JOIN pg_index      ix ON t.oid   = ix.indrelid
  JOIN pg_class      i  ON i.oid   = ix.indexrelid
  JOIN pg_namespace  n  ON n.oid   = t.relnamespace
  WHERE n.nspname = $1
    AND t.relname = $2
    AND t.relkind = 'r'
  ORDER BY i.relname
`;

export const RELATIONS_SQL = `
  SELECT
    kcu.table_name        AS from_table,
    kcu.column_name       AS from_column,
    ccu.table_name        AS to_table,
    ccu.column_name       AS to_column,
    rc.update_rule        AS on_update,
    rc.delete_rule        AS on_delete
  FROM information_schema.referential_constraints   rc
  JOIN information_schema.key_column_usage          kcu
    ON  kcu.constraint_name   = rc.constraint_name
    AND kcu.constraint_schema = rc.constraint_schema
  JOIN information_schema.constraint_column_usage   ccu
    ON  ccu.constraint_name   = rc.unique_constraint_name
    AND ccu.constraint_schema = rc.constraint_schema
  WHERE rc.constraint_schema = $1
  ORDER BY from_table, from_column
`;

// ── WHERE clause builder (uses $N positional params) ───────────────────────

interface WhereResult {
  clause: string;
  params: unknown[];
  nextIdx: number;
}

/**
 * Build a WHERE clause for Postgres using $N positional placeholders.
 * @param startIdx  The first $N index to use (default 1). Callers that already
 *                  have params before the WHERE can pass the next available idx.
 */
export function buildWhereClause(
  columnNames: string[],
  search?: string,
  filters: FilterRule[] = [],
  startIdx = 1,
): WhereResult {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = startIdx;

  if (search?.trim()) {
    const searchClauses: string[] = [];
    for (const col of columnNames) {
      searchClauses.push(`${quoteIdent(col)}::text ILIKE $${idx}`);
      params.push(`%${search.trim()}%`);
      idx++;
    }
    if (searchClauses.length > 0) clauses.push(`(${searchClauses.join(' OR ')})`);
  }

  for (const f of filters) {
    const { column, operator, value } = f;
    if (!column || !operator) continue;

    let sqlOp = operator;
    let sqlVal: unknown = value;

    switch (operator) {
      case 'contains': sqlOp = 'ILIKE'; sqlVal = `%${value}%`; break;
      case 'starts':   sqlOp = 'ILIKE'; sqlVal = `${value}%`;  break;
      case 'ends':     sqlOp = 'ILIKE'; sqlVal = `%${value}`;  break;
      case 'null':     sqlOp = 'IS NULL';     sqlVal = undefined; break;
      case 'not_null': sqlOp = 'IS NOT NULL'; sqlVal = undefined; break;
    }

    if (sqlOp === 'IS NULL' || sqlOp === 'IS NOT NULL') {
      clauses.push(`${quoteIdent(column)} ${sqlOp}`);
    } else {
      clauses.push(`${quoteIdent(column)} ${sqlOp} $${idx}`);
      params.push(sqlVal);
      idx++;
    }
  }

  return {
    clause: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
    params,
    nextIdx: idx,
  };
}
