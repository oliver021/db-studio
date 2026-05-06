import { describe, it, expect } from 'vitest';
import {
  quoteIdent,
  paginationClause,
  buildWhereClause,
  tableInfoSQL,
  foreignKeyListSQL,
} from '../../electron/dialect/sqlite';

describe('dialect/sqlite', () => {
  describe('quoteIdent', () => {
    it('wraps plain identifiers in double quotes', () => {
      expect(quoteIdent('users')).toBe('"users"');
    });

    it('escapes embedded double quotes', () => {
      expect(quoteIdent('my"table')).toBe('"my""table"');
    });
  });

  describe('paginationClause', () => {
    it('generates LIMIT/OFFSET', () => {
      expect(paginationClause(50, 100)).toBe('LIMIT 50 OFFSET 100');
    });

    it('handles zero offset', () => {
      expect(paginationClause(25, 0)).toBe('LIMIT 25 OFFSET 0');
    });
  });

  describe('buildWhereClause', () => {
    it('returns empty string when no search or filters', () => {
      const { clause, params } = buildWhereClause(['name', 'email']);
      expect(clause).toBe('');
      expect(params).toEqual([]);
    });

    it('builds LIKE clause for search across all columns', () => {
      const { clause, params } = buildWhereClause(['name', 'email'], 'alice');
      expect(clause).toContain('LIKE');
      expect(params).toEqual(['%alice%', '%alice%']);
    });

    it('builds filter clause for a single eq filter', () => {
      const { clause, params } = buildWhereClause(
        ['id', 'name'],
        undefined,
        [{ column: 'name', operator: 'eq', value: 'Bob' }],
      );
      expect(clause).toContain('WHERE');
      expect(params).toContain('Bob');
    });

    it('handles contains filter', () => {
      const { params } = buildWhereClause(
        ['name'],
        undefined,
        [{ column: 'name', operator: 'contains', value: 'ali' }],
      );
      expect(params).toContain('%ali%');
    });

    it('handles null filter', () => {
      const { clause, params } = buildWhereClause(
        ['email'],
        undefined,
        [{ column: 'email', operator: 'null', value: '' }],
      );
      expect(clause).toContain('IS NULL');
      expect(params).toEqual([]);
    });
  });

  describe('SQL generators', () => {
    it('tableInfoSQL returns a PRAGMA statement', () => {
      expect(tableInfoSQL('users')).toContain('PRAGMA');
    });

    it('foreignKeyListSQL returns a PRAGMA statement', () => {
      expect(foreignKeyListSQL('orders')).toContain('PRAGMA');
    });
  });
});
