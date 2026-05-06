import { useState, useEffect, useRef, useCallback } from 'react';
import mermaid from 'mermaid';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import * as dbClient from '../../services/dbClient';
import {
  ZoomIn, ZoomOut, Maximize2, Download, Copy, X,
  GitBranch, Table2, ArrowRight, FileCode2,
} from 'lucide-react';
import './SchemaGraph.css';

/* ==========================================================================
   TYPES
   ========================================================================== */
interface Relation {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  onUpdate: string;
  onDelete: string;
}

interface TableDef {
  name: string;
  type: string;
  columns: { name: string; type: string; pk: number | boolean; notnull?: number; notNull?: boolean }[];
}

/* ==========================================================================
   MERMAID CONFIG
   ========================================================================== */
const MERMAID_CONFIG = {
  startOnLoad: false,
  theme: 'dark' as const,
  themeVariables: {
    darkMode: true,
    primaryColor: '#7c3aed',
    primaryTextColor: '#e2e8f0',
    primaryBorderColor: '#3a3a5c',
    lineColor: '#6366f1',
    secondaryColor: '#14142a',
    tertiaryColor: '#0c0c18',
    noteBkgColor: '#1a1a30',
    noteTextColor: '#94a3b8',
    fontFamily: 'Inter, sans-serif',
    fontSize: '12px',
  },
  er: {
    diagramPadding: 30,
    layoutDirection: 'TB' as const,
    minEntityWidth: 140,
    minEntityHeight: 50,
    entityPadding: 12,
    useMaxWidth: false,
    fontSize: 12,
  },
  securityLevel: 'loose' as const,
};

/* ==========================================================================
   MERMAID ER DIAGRAM GENERATOR
   ========================================================================== */
function sanitize(name: string): string {
  // Mermaid identifiers can't have spaces or special chars
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

function mapSqliteType(rawType: string): string {
  const t = (rawType || 'TEXT').toUpperCase();
  if (t.includes('INT'))   return 'int';
  if (t.includes('REAL') || t.includes('FLOAT') || t.includes('DOUBLE') || t.includes('NUMERIC'))  return 'float';
  if (t.includes('BLOB'))  return 'blob';
  if (t.includes('BOOL'))  return 'bool';
  if (t.includes('DATE') || t.includes('TIME')) return 'datetime';
  return 'text';
}

function generateMermaidER(tables: TableDef[], relations: Relation[]): string {
  const lines: string[] = ['erDiagram'];

  // Build a set of FK columns per table for tagging
  const fkSet = new Set<string>();
  for (const r of relations) {
    fkSet.add(`${r.fromTable}.${r.fromColumn}`);
  }

  // Entity definitions
  for (const table of tables) {
    if (table.type !== 'table') continue;
    const id = sanitize(table.name);
    lines.push(`    ${id} {`);
    for (const col of table.columns) {
      const typeStr = mapSqliteType(col.type);
      let constraint = '';
      if (col.pk === 1 || col.pk === true) constraint = ' PK';
      else if (fkSet.has(`${table.name}.${col.name}`)) constraint = ' FK';
      const nn = (col.notnull || col.notNull) ? '"NOT NULL"' : '';
      lines.push(`        ${typeStr} ${sanitize(col.name)}${constraint} ${nn}`.trimEnd());
    }
    lines.push('    }');
  }

  // Relationships
  for (const r of relations) {
    const from = sanitize(r.fromTable);
    const to   = sanitize(r.toTable);
    // fromTable has FK referencing toTable → toTable is the "one" side
    const label = `${r.fromColumn} -> ${r.toColumn}`;
    lines.push(`    ${to} ||--o{ ${from} : "${label}"`);
  }

  return lines.join('\n');
}

/* ==========================================================================
   PLANTUML EXPORTER
   ========================================================================== */
function generatePlantUML(tables: TableDef[], relations: Relation[]): string {
  const lines: string[] = ['@startuml', '', 'skinparam linetype ortho', ''];

  const fkSet = new Set<string>();
  for (const r of relations) {
    fkSet.add(`${r.fromTable}.${r.fromColumn}`);
  }

  for (const table of tables) {
    if (table.type !== 'table') continue;
    lines.push(`entity "${table.name}" {`);
    const pkCols = table.columns.filter(c => c.pk === 1 || c.pk === true);
    const otherCols = table.columns.filter(c => c.pk !== 1 && c.pk !== true);

    for (const col of pkCols) {
      lines.push(`  * ${col.name} : ${col.type || 'TEXT'} <<PK>>`);
    }
    if (pkCols.length > 0 && otherCols.length > 0) {
      lines.push('  --');
    }
    for (const col of otherCols) {
      const fkTag = fkSet.has(`${table.name}.${col.name}`) ? ' <<FK>>' : '';
      const nn = (col.notnull || col.notNull) ? ' NOT NULL' : '';
      lines.push(`  ${col.name} : ${col.type || 'TEXT'}${nn}${fkTag}`);
    }
    lines.push('}');
    lines.push('');
  }

  for (const r of relations) {
    lines.push(`"${r.toTable}" ||--o{ "${r.fromTable}" : "${r.fromColumn}"`);
  }

  lines.push('', '@enduml');
  return lines.join('\n');
}

/* ==========================================================================
   SQL DDL EXPORTER
   ========================================================================== */
function generateDDL(tables: TableDef[], relations: Relation[]): string {
  const lines: string[] = ['-- SQLiteNav Schema Export', `-- Generated: ${new Date().toISOString()}`, ''];

  for (const table of tables) {
    if (table.type !== 'table') continue;
    lines.push(`CREATE TABLE "${table.name}" (`);
    const colDefs: string[] = [];
    for (const col of table.columns) {
      let def = `  "${col.name}" ${col.type || 'TEXT'}`;
      if (col.pk === 1 || col.pk === true) def += ' PRIMARY KEY';
      if (col.notnull || col.notNull) def += ' NOT NULL';
      colDefs.push(def);
    }
    // Add FK constraints
    const tableFks = relations.filter(r => r.fromTable === table.name);
    for (const fk of tableFks) {
      colDefs.push(`  FOREIGN KEY ("${fk.fromColumn}") REFERENCES "${fk.toTable}"("${fk.toColumn}")`);
    }
    lines.push(colDefs.join(',\n'));
    lines.push(');');
    lines.push('');
  }

  return lines.join('\n');
}

/* ==========================================================================
   COMPONENT
   ========================================================================== */
let renderCounter = 0;

export default function SchemaGraph() {
  const { schema, activeSessionId } = useStore(useShallow(s => ({
    schema: s.schema,
    activeSessionId: s.activeSessionId,
  })));

  const [relations, setRelations] = useState<Relation[]>([]);
  const [svg, setSvg] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [exportOpen, setExportOpen] = useState(false);
  const [exportTab, setExportTab] = useState<'mermaid' | 'plantuml' | 'ddl'>('mermaid');
  const [, setIsLoading] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });

  const tables = (schema as TableDef[]).filter(t => t.type === 'table');

  /* ----- Load relations ----- */
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (!activeSessionId) return;
        const rels = await dbClient.getRelations(activeSessionId);
        if (active) setRelations(rels);
      } catch {
        // No FK support or no DB
      }
    }
    load();
    return () => { active = false; };
  }, [schema, activeSessionId]);

  /* ----- Generate & render diagram ----- */
  useEffect(() => {
    if (tables.length === 0) {
      setSvg('');
      return;
    }

    let active = true;
    setIsLoading(true);
    const code = generateMermaidER(tables, relations);

    // Mermaid needs unique IDs
    const graphId = `schema-er-${++renderCounter}`;

    mermaid.initialize(MERMAID_CONFIG);
    mermaid.render(graphId, code)
      .then(({ svg: renderedSvg }) => {
        if (active) {
          setSvg(renderedSvg);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          console.error('Mermaid render error:', err);
          setSvg('');
          setIsLoading(false);
        }
      });
    return () => { active = false; };
  }, [tables, relations, setSvg, setIsLoading]);

  /* ----- Zoom ----- */
  const handleZoom = useCallback((delta: number) => {
    setZoom(z => Math.max(0.2, Math.min(3, z + delta)));
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      handleZoom(e.deltaY > 0 ? -0.1 : 0.1);
    }
  }, [handleZoom]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  /* ----- Pan ----- */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isPanning.current = true;
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  }, [pan]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isPanning.current) return;
      setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
    };
    const onUp = () => { isPanning.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  /* ----- Export helpers ----- */
  const getMermaidCode = () => generateMermaidER(tables, relations);
  const getPlantUML = () => generatePlantUML(tables, relations);
  const getDDL = () => generateDDL(tables, relations);

  const getActiveExport = () => {
    switch (exportTab) {
      case 'mermaid':  return getMermaidCode();
      case 'plantuml': return getPlantUML();
      case 'ddl':      return getDDL();
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(getActiveExport());
  };

  const downloadSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schema-diagram.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ----- Render ----- */
  return (
    <div className="schema-graph">
      {/* ---- Toolbar ---- */}
      <div className="sg-toolbar">
        <div className="sg-toolbar-group">
          <GitBranch size={14} color="var(--accent-cyan)" />
          <span className="sg-label">ER Diagram</span>
        </div>

        <div className="sg-toolbar-divider" />

        <div className="sg-zoom-controls">
          <button className="sg-zoom-btn" onClick={() => handleZoom(-0.1)} title="Zoom out">
            <ZoomOut size={14} />
          </button>
          <span className="sg-zoom-label">{Math.round(zoom * 100)}%</span>
          <button className="sg-zoom-btn" onClick={() => handleZoom(0.1)} title="Zoom in">
            <ZoomIn size={14} />
          </button>
          <button className="sg-zoom-btn" onClick={resetView} title="Reset view">
            <Maximize2 size={14} />
          </button>
        </div>

        <div className="sg-spacer" />

        <button className="sg-btn" onClick={downloadSvg} disabled={!svg}>
          <Download size={12} /> SVG
        </button>
        <button className="sg-btn primary" onClick={() => setExportOpen(true)} disabled={tables.length === 0}>
          <FileCode2 size={12} /> Export Schema
        </button>
      </div>

      {/* ---- Canvas ---- */}
      {tables.length > 0 ? (
        <div
          className="sg-canvas"
          ref={canvasRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
        >
          <div
            className="sg-canvas-inner"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      ) : (
        <div className="sg-empty">
          <GitBranch size={36} />
          <span>No tables in this database</span>
          <span className="sg-empty-hint">Open a database with tables to visualize the schema</span>
        </div>
      )}

      {/* ---- Info Bar ---- */}
      <div className="sg-info-bar">
        <div className="sg-stat">
          <Table2 size={12} /> <strong>{tables.length}</strong> tables
        </div>
        <div className="sg-stat">
          <ArrowRight size={12} /> <strong>{relations.length}</strong> relationships
        </div>
        <div className="sg-spacer" />
        <div className="sg-stat">
          Ctrl+Scroll to zoom · Drag to pan
        </div>
      </div>

      {/* ---- Export Modal ---- */}
      {exportOpen && (
        <div className="sg-export-modal" onClick={() => setExportOpen(false)}>
          <div className="sg-export-box" onClick={e => e.stopPropagation()}>
            <div className="sg-export-header">
              <span className="sg-export-title">Export Schema</span>
              <button className="sg-export-close" onClick={() => setExportOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="sg-export-tabs">
              <button
                className={`sg-export-tab${exportTab === 'mermaid' ? ' active' : ''}`}
                onClick={() => setExportTab('mermaid')}
              >
                Mermaid ER
              </button>
              <button
                className={`sg-export-tab${exportTab === 'plantuml' ? ' active' : ''}`}
                onClick={() => setExportTab('plantuml')}
              >
                PlantUML
              </button>
              <button
                className={`sg-export-tab${exportTab === 'ddl' ? ' active' : ''}`}
                onClick={() => setExportTab('ddl')}
              >
                SQL DDL
              </button>
            </div>

            <div className="sg-export-code">
              <pre>{getActiveExport()}</pre>
            </div>

            <div className="sg-export-actions">
              <button className="sg-btn" onClick={copyToClipboard}>
                <Copy size={12} /> Copy to Clipboard
              </button>
              <button className="sg-btn primary" onClick={() => {
                const content = getActiveExport();
                const ext = exportTab === 'mermaid' ? 'mmd' : exportTab === 'plantuml' ? 'puml' : 'sql';
                const blob = new Blob([content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `schema.${ext}`;
                a.click();
                URL.revokeObjectURL(url);
              }}>
                <Download size={12} /> Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
