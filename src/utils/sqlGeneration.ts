/**
 * SQL generation utilities for creating tables across different database engines.
 */

export interface ColumnDef {
  id: string;
  name: string;
  type: string;
  notNull?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  defaultValue?: string;
}

/**
 * Generate a CREATE TABLE SQL statement based on the engine dialect.
 * Supports SQLite, PostgreSQL, and MySQL.
 */
export function generateCreateTableSQL(
  tableName: string,
  columns: ColumnDef[],
  dialect: 'sqlite' | 'postgres' | 'mysql' | string,
): string {
  if (!tableName || columns.length === 0) {
    throw new Error('Table name and at least one column are required');
  }

  // Validate column names are unique and not empty
  const columnNames = columns.map(c => c.name);
  if (new Set(columnNames).size !== columnNames.length) {
    throw new Error('Column names must be unique');
  }
  if (columnNames.some(n => !n)) {
    throw new Error('All columns must have names');
  }

  const columnDefs = columns.map(col => generateColumnDef(col, dialect)).join(',\n  ');

  return `CREATE TABLE ${quoteIdentifier(tableName, dialect)} (\n  ${columnDefs}\n)`;
}

function generateColumnDef(col: ColumnDef, dialect: string): string {
  const parts: string[] = [];

  // Column name and type
  parts.push(quoteIdentifier(col.name, dialect));
  parts.push(mapColumnType(col.type, dialect));

  // Constraints
  if (col.primaryKey) {
    if (dialect === 'postgres' || dialect === 'mysql') {
      parts.push('PRIMARY KEY');
    } else {
      // SQLite: PRIMARY KEY is handled with type for INTEGER PRIMARY KEY
      if (col.type.toUpperCase().includes('INT')) {
        // Already added as type
      }
    }
  }

  if (col.notNull) {
    parts.push('NOT NULL');
  }

  if (col.unique && !col.primaryKey) {
    // Don't add UNIQUE if it's already a PRIMARY KEY
    parts.push('UNIQUE');
  }

  if (col.defaultValue && col.defaultValue.trim()) {
    const defaultVal = col.defaultValue.trim();
    // Try to detect if it's a number or needs quoting
    const isNumber = /^-?\d+(\.\d+)?$/.test(defaultVal);
    const isBoolean = /^(true|false|TRUE|FALSE)$/.test(defaultVal);
    if (isNumber || isBoolean) {
      parts.push(`DEFAULT ${defaultVal}`);
    } else {
      parts.push(`DEFAULT '${defaultVal.replace(/'/g, "''")}'`);
    }
  }

  return parts.join(' ');
}

/**
 * Quote an identifier (table name, column name) appropriately for the dialect.
 */
function quoteIdentifier(name: string, dialect: string): string {
  if (dialect === 'mysql') {
    return `\`${name}\``;
  } else if (dialect === 'postgres') {
    return `"${name}"`;
  } else {
    // SQLite and default
    return `"${name}"`;
  }
}

/**
 * Map generic column types to dialect-specific types.
 */
function mapColumnType(type: string, dialect: string): string {
  const upper = type.toUpperCase();

  if (dialect === 'postgres') {
    if (upper === 'INT' || upper === 'INTEGER') return 'INTEGER';
    if (upper === 'FLOAT' || upper === 'REAL') return 'NUMERIC';
    if (upper === 'BOOL' || upper === 'BOOLEAN') return 'BOOLEAN';
    if (upper === 'TEXT' || upper === 'VARCHAR') return 'TEXT';
    if (upper === 'DATE') return 'DATE';
    if (upper === 'DATETIME' || upper === 'TIMESTAMP') return 'TIMESTAMP';
    if (upper === 'BLOB' || upper === 'BYTEA') return 'BYTEA';
    if (upper === 'JSON' || upper === 'JSONB') return 'JSONB';
    return upper;
  } else if (dialect === 'mysql') {
    if (upper === 'INT' || upper === 'INTEGER') return 'INT';
    if (upper === 'FLOAT' || upper === 'REAL') return 'FLOAT';
    if (upper === 'BOOL' || upper === 'BOOLEAN') return 'BOOLEAN';
    if (upper === 'TEXT') return 'TEXT';
    if (upper === 'VARCHAR') return 'VARCHAR(255)';
    if (upper === 'DATE') return 'DATE';
    if (upper === 'DATETIME' || upper === 'TIMESTAMP') return 'DATETIME';
    if (upper === 'BLOB') return 'BLOB';
    if (upper === 'JSON' || upper === 'JSONB') return 'JSON';
    return upper;
  } else {
    // SQLite
    if (upper === 'INT' || upper === 'INTEGER') return 'INTEGER';
    if (upper === 'FLOAT' || upper === 'REAL') return 'REAL';
    if (upper === 'BOOL' || upper === 'BOOLEAN') return 'INTEGER';
    if (upper === 'TEXT' || upper === 'VARCHAR') return 'TEXT';
    if (upper === 'DATE' || upper === 'DATETIME' || upper === 'TIMESTAMP') return 'TEXT';
    if (upper === 'BLOB') return 'BLOB';
    if (upper === 'JSON' || upper === 'JSONB') return 'TEXT';
    return upper;
  }
}
