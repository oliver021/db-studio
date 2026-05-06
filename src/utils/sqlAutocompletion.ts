import * as monaco from 'monaco-editor';
import { getDialectConstants, type DialectKind } from '../config/sqlConstants';

interface SchemaItem {
  name: string;
  type: 'table' | 'view';
  columns: { name: string; type: string; pk?: boolean | number }[];
}

/**
 * Create a Monaco completion provider for SQL, adapting keyword and function
 * suggestions to the active session's dialect (sqlite | postgres | mysql).
 */
export function createSqlCompletionProvider(schema: SchemaItem[], dialect: DialectKind = 'sqlite') {
  const { keywords, functions } = getDialectConstants(dialect);

  return {
    triggerCharacters: ['.', ' '],
    provideCompletionItems: (model: monaco.editor.ITextModel, position: monaco.IPosition) => {
      const word = model.getWordUntilPosition(position);
      const fullText = model.getValue();
      const lines = fullText.split('\n');
      const currentLine = lines[position.lineNumber - 1];
      const textUntilPosition = currentLine.substring(0, position.column - 1);

      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber:   position.lineNumber,
        startColumn:     word.startColumn,
        endColumn:       word.endColumn,
      };

      const suggestions: monaco.languages.CompletionItem[] = [];

      // ── Detect context ────────────────────────────────────────────────────
      const isAfterFrom = /\bFROM\s+[a-zA-Z0-9_" `]*$/i.test(textUntilPosition);
      const isAfterJoin = /\bJOIN\s+[a-zA-Z0-9_" `]*$/i.test(textUntilPosition);
      const isAfterSelect = /\bSELECT\s+[^]*$/i.test(textUntilPosition) && !isAfterFrom;
      const isAfterDot = textUntilPosition.endsWith('.');

      // ── Extract table aliases from current query ───────────────────────────
      const tableMatches = [...fullText.matchAll(/\b(?:FROM|JOIN)\s+([a-zA-Z0-9_"`]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_"`]+))?/gi)];
      const activeTables = tableMatches.map(m => ({
        name:  m[1].replace(/["`]/g, ''),
        alias: m[2] ? m[2].replace(/["`]/g, '') : null,
      }));

      // ── After a dot — suggest columns of the qualifying table/alias ───────
      if (isAfterDot) {
        const parts = textUntilPosition.split(/\s+/);
        const lastPart = parts[parts.length - 1];
        const prefix = lastPart.substring(0, lastPart.length - 1).replace(/["`]/g, '');
        const tableEntry = activeTables.find(t => t.alias === prefix || t.name === prefix) ?? { name: prefix };
        const schemaTable = schema.find(t => t.name.toLowerCase() === tableEntry.name.toLowerCase());
        if (schemaTable) {
          schemaTable.columns.forEach(col => {
            suggestions.push({
              label: col.name,
              kind:  monaco.languages.CompletionItemKind.Field,
              insertText: col.name,
              range,
              detail: `${col.type}${col.pk ? ' (PK)' : ''}`,
              documentation: `Column in ${schemaTable.name}`,
              sortText: '0',
            });
          });
          return { suggestions };
        }
      }

      // ── After FROM / JOIN — suggest tables ────────────────────────────────
      if (isAfterFrom || isAfterJoin) {
        schema.forEach(t => {
          suggestions.push({
            label: t.name,
            kind:  monaco.languages.CompletionItemKind.Class,
            insertText: t.name,
            range,
            detail: `${t.type} · ${t.columns.length} columns`,
            sortText: '0',
          });
        });
        return { suggestions };
      }

      // ── Default: keywords, functions, tables, columns ─────────────────────

      keywords.forEach(kw => {
        suggestions.push({
          label: kw,
          kind:  monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          range,
          detail: 'Keyword',
          sortText: '2',
        });
      });

      functions.forEach(fn => {
        suggestions.push({
          label: fn,
          kind:  monaco.languages.CompletionItemKind.Function,
          insertText: `${fn}($0)`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          detail: 'Function',
          sortText: '3',
        });
      });

      schema.forEach(t => {
        suggestions.push({
          label: t.name,
          kind:  monaco.languages.CompletionItemKind.Class,
          insertText: t.name,
          range,
          detail: t.type,
          sortText: '1',
        });
      });

      if (activeTables.length > 0) {
        activeTables.forEach(at => {
          const schemaTable = schema.find(t => t.name.toLowerCase() === at.name.toLowerCase());
          if (schemaTable) {
            schemaTable.columns.forEach(col => {
              const label = at.alias ? `${at.alias}.${col.name}` : col.name;
              suggestions.push({
                label,
                kind:  monaco.languages.CompletionItemKind.Field,
                insertText: label,
                range,
                detail: `${schemaTable.name}.${col.type}`,
                sortText: '0',
              });
            });
          }
        });
      } else if (isAfterSelect) {
        schema.forEach(t => {
          t.columns.forEach(col => {
            suggestions.push({
              label: col.name,
              kind:  monaco.languages.CompletionItemKind.Field,
              insertText: col.name,
              range,
              detail: `${t.name}.${col.type}`,
              sortText: '4',
            });
          });
        });
      }

      return { suggestions };
    },
  };
}
