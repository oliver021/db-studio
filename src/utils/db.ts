/* eslint-disable @typescript-eslint/no-explicit-any */
export function getPrimaryKey(columns: any[]): string | null {
  const pk = columns.find((c: any) => c.pk === 1 || c.pk === true);
  return pk ? pk.name : null;
}

/**
 * Detect the appropriate HTML input type for a database column type.
 */
export function getInputTypeForColumnType(columnType: string):
  'text' | 'number' | 'date' | 'datetime-local' | 'checkbox' | 'textarea' | 'disabled' {
  const upper = columnType.toUpperCase();

  if (upper.includes('INT')) return 'number';
  if (upper.includes('BOOL') || upper.includes('BIT')) return 'checkbox';
  if (upper.includes('DATE') && !upper.includes('TIME')) return 'date';
  if (upper.includes('TIMESTAMP') || upper.includes('DATETIME') || upper.includes('TIME')) return 'datetime-local';
  if (upper.includes('BLOB') || upper.includes('BYTEA') || upper.includes('BINARY')) return 'disabled';
  if (upper.includes('JSON')) return 'textarea';
  if (upper.includes('FLOAT') || upper.includes('REAL') || upper.includes('DECIMAL')) return 'number';

  return 'text';
}

/**
 * Validate row data before insertion, checking NOT NULL constraints.
 */
export function validateRowData(columns: any[], data: Record<string, unknown>):
  { valid: boolean; error?: string } {
  for (const col of columns) {
    const value = data[col.name];
    if (col.notNull && (value === null || value === undefined || value === '')) {
      return { valid: false, error: `Column '${col.name}' is required` };
    }
  }
  return { valid: true };
}
