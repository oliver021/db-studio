import { Database, TerminalSquare, GitBranch, Table2, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ActiveView } from '../../store/useStore';

interface ConnectedHomeProps {
  sessionName: string;
  dbKind: string;
  tableCount: number;
  viewCount: number;
  onViewChange: (view: ActiveView) => void;
}

export default function ConnectedHome({
  sessionName,
  dbKind,
  tableCount,
  viewCount,
  onViewChange,
}: ConnectedHomeProps) {
  return (
    <motion.div
      key="connected-home"
      className="connected-home"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.22 }}
    >
      <div className="ch-badge">
        <span className="status-dot connected" />
        <span className="ch-kind">{dbKind}</span>
      </div>

      <div className="ch-icon-wrapper">
        <Database size={34} />
      </div>

      <h2 className="ch-title">{sessionName}</h2>

      <p className="ch-stats">
        <Table2 size={13} />
        {tableCount} table{tableCount !== 1 ? 's' : ''}
        {viewCount > 0 && <>, {viewCount} view{viewCount !== 1 ? 's' : ''}</>}
      </p>

      <p className="ch-hint">
        Select a table from the sidebar to browse data, or use one of the tools below.
      </p>

      <div className="ch-actions">
        <button className="ch-action-btn" onClick={() => onViewChange('query')}>
          <TerminalSquare size={16} />
          <span>Query Console</span>
          <ArrowRight size={13} className="ch-action-arrow" />
        </button>
        <button className="ch-action-btn" onClick={() => onViewChange('schema-graph')}>
          <GitBranch size={16} />
          <span>Schema Graph</span>
          <ArrowRight size={13} className="ch-action-arrow" />
        </button>
      </div>
    </motion.div>
  );
}
