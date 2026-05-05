import { Database, FolderOpen, TerminalSquare, GitBranch, Layers, Table2, Eye, ShieldCheck } from 'lucide-react';
import type { Capabilities, ActiveView } from '../../store/useStore';

interface SidebarProps {
  /** sessionId of the active connection (null = no connection). */
  connectionString: string | null;
  connectionName?: string;
  capabilities: Capabilities | null;
  onOpenDatabase: () => void;
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  tables: any[];
  views: any[];
  activeTableName: string | null;
  onTableSelect: (name: string) => void;
}

export default function Sidebar({
  connectionString,
  connectionName,
  capabilities,
  onOpenDatabase,
  activeView,
  onViewChange,
  tables,
  views,
  activeTableName,
  onTableSelect,
}: SidebarProps) {
  const showMaintenance = !!capabilities?.hasMaintenance;

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo"><Database size={18} /></div>
        <div>
          <h1 className="sidebar-title">DB Studio</h1>
          <p className="sidebar-subtitle">Database Manager</p>
        </div>
      </div>

      <div className="sidebar-actions">
        <button className="btn-gradient" onClick={onOpenDatabase}>
          <FolderOpen size={15} />
          {connectionString ? 'Open Another DB' : 'Open Database'}
        </button>
      </div>

      <nav className="sidebar-nav">
        {connectionString && (
          <div className="nav-section">
            <ul className="nav-list">
              <li>
                <button
                  className={`nav-item${activeView === 'query' ? ' active' : ''}`}
                  onClick={() => onViewChange('query')}
                >
                  <TerminalSquare size={14} className="nav-item-icon" />
                  <span className="nav-item-label">Query Console</span>
                </button>
              </li>
              <li>
                <button
                  className={`nav-item${activeView === 'schema-graph' ? ' active' : ''}`}
                  onClick={() => onViewChange('schema-graph')}
                >
                  <GitBranch size={14} className="nav-item-icon" />
                  <span className="nav-item-label">Schema Graph</span>
                </button>
              </li>
              {showMaintenance && (
                <li>
                  <button
                    className={`nav-item${activeView === 'maintenance' ? ' active' : ''}`}
                    onClick={() => onViewChange('maintenance')}
                  >
                    <ShieldCheck size={14} className="nav-item-icon" />
                    <span className="nav-item-label">Maintenance</span>
                  </button>
                </li>
              )}
            </ul>
          </div>
        )}

        {tables.length > 0 && (
          <div className="nav-section">
            <h2 className="nav-section-title">
              <Layers size={12} /> Tables <span className="nav-count">{tables.length}</span>
            </h2>
            <ul className="nav-list">
              {tables.map(t => (
                <li key={t.name}>
                  <button
                    className={`nav-item${activeTableName === t.name ? ' active' : ''}`}
                    onClick={() => onTableSelect(t.name)}
                  >
                    <Table2 size={14} className="nav-item-icon" />
                    <span className="nav-item-label">{t.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {views.length > 0 && (
          <div className="nav-section">
            <h2 className="nav-section-title">
              <Eye size={12} /> Views <span className="nav-count">{views.length}</span>
            </h2>
            <ul className="nav-list">
              {views.map(v => (
                <li key={v.name}>
                  <button
                    className={`nav-item${activeTableName === v.name ? ' active' : ''}`}
                    onClick={() => onTableSelect(v.name)}
                  >
                    <Eye size={14} className="nav-item-icon" />
                    <span className="nav-item-label">{v.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      {connectionString && (
        <div className="sidebar-footer">
          <div className="connection-indicator">
            <span className="status-dot connected" />
            <span className="connection-path" title={connectionString}>
              {connectionName ?? connectionString}
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}
