/**
 * Per-dialect query plan renderer.
 * SQLite  → flat table (id / parent / detail rows from EXPLAIN QUERY PLAN)
 * Postgres → tree from EXPLAIN (FORMAT JSON) QUERY PLAN JSON
 * MySQL    → tree from EXPLAIN FORMAT=JSON (nested JSON object)
 */
import './QueryConsole.css';

interface Props {
  plan: Record<string, unknown>[];
  dialect: string;
}

// ── SQLite ────────────────────────────────────────────────────────────────────

function SqlitePlan({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="qc-results-table">
      <thead>
        <tr><th>ID</th><th>Parent</th><th>Detail</th></tr>
      </thead>
      <tbody>
        {rows.map((p, i) => (
          <tr key={i}>
            <td>{String(p.id ?? '')}</td>
            <td>{String(p.parent ?? '')}</td>
            <td style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
              {String(p.detail ?? '')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Postgres ──────────────────────────────────────────────────────────────────
// EXPLAIN (FORMAT JSON) returns [{QUERY PLAN: [{Plan: {...}, Planning Time: ..., Execution Time: ...}]}]

function PgNode({ node, depth = 0 }: { node: Record<string, unknown>; depth?: number }) {
  const nodeType = String(node['Node Type'] ?? '');
  const relation = node['Relation Name'] ? ` on ${node['Relation Name']}` : '';
  const alias    = node['Alias']         ? ` (${node['Alias']})`           : '';
  const cost     = node['Total Cost']    != null ? ` cost=..${node['Total Cost']}` : '';
  const rows     = node['Plan Rows']     != null ? ` rows=${node['Plan Rows']}`    : '';
  const subplans = (node['Plans'] as Record<string, unknown>[] | undefined) ?? [];

  return (
    <div className="qp-node" style={{ paddingLeft: depth * 16 }}>
      <div className="qp-node-header">
        <span className="qp-node-type">{nodeType}{relation}{alias}</span>
        <span className="qp-node-cost">{cost}{rows}</span>
      </div>
      {subplans.map((sub, i) => (
        <PgNode key={i} node={sub} depth={depth + 1} />
      ))}
    </div>
  );
}

function PostgresPlan({ rows }: { rows: Record<string, unknown>[] }) {
  try {
    // rows[0] has key "QUERY PLAN" which is an array
    const plans = rows[0]?.['QUERY PLAN'] as Record<string, unknown>[] | undefined;
    const root  = plans?.[0]?.['Plan'] as Record<string, unknown> | undefined;
    const planningTime   = plans?.[0]?.['Planning Time'];
    const executionTime  = plans?.[0]?.['Execution Time'];

    if (!root) {
      return <pre className="qp-raw">{JSON.stringify(rows, null, 2)}</pre>;
    }

    return (
      <div className="qp-pg-tree">
        {(planningTime != null || executionTime != null) && (
          <div className="qp-timing">
            {planningTime  != null && <span>Planning: {Number(planningTime).toFixed(2)} ms</span>}
            {executionTime != null && <span>Execution: {Number(executionTime).toFixed(2)} ms</span>}
          </div>
        )}
        <PgNode node={root} />
      </div>
    );
  } catch {
    return <pre className="qp-raw">{JSON.stringify(rows, null, 2)}</pre>;
  }
}

// ── MySQL ─────────────────────────────────────────────────────────────────────
// EXPLAIN FORMAT=JSON returns [{EXPLAIN: "<json string>"}]

function MysqlPlan({ rows }: { rows: Record<string, unknown>[] }) {
  try {
    const raw = rows[0]?.['EXPLAIN'] ?? rows[0]?.['explain'];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;

    return (
      <pre className="qp-raw" style={{ maxHeight: '100%', overflow: 'auto' }}>
        {JSON.stringify(parsed, null, 2)}
      </pre>
    );
  } catch {
    return <pre className="qp-raw">{JSON.stringify(rows, null, 2)}</pre>;
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export default function QueryPlanRenderer({ plan, dialect }: Props) {
  return (
    <div className="qc-query-plan">
      {dialect === 'postgres' ? (
        <PostgresPlan rows={plan} />
      ) : dialect === 'mysql' ? (
        <MysqlPlan rows={plan} />
      ) : (
        <SqlitePlan rows={plan} />
      )}
    </div>
  );
}
