/* eslint-disable @typescript-eslint/no-explicit-any */
import { Database, TerminalSquare, GitBranch, Layers, Table2, Eye, ShieldCheck, ServerCog, Settings2, HardDrive, X } from 'lucide-react';
import type { Capabilities, ActiveView, BrowsingState } from '../../store/useStore';

interface SidebarProps {
  /** sessionId of the active connection (null = no connection). */
  connectionString: string | null;
  connectionName?: string;
  capabilities: Capabilities | null;
  onManageConnections: () => void;
  onOpenSettings?: () => void;
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  tables: any[];
  views: any[];
  activeTableName: string | null;
  onTableSelect: (name: string) => void;
  /** Set when user connected to a server without choosing a database yet. */
  browsingState: BrowsingState | null;
  onSelectDatabase: (dbName: string) => void;
  onCancelBrowse: () => void;
}

export default function Sidebar({
  connectionString,
  connectionName,
  capabilities,
  onManageConnections,
  onOpenSettings,
  activeView,
  onViewChange,
  tables,
  views,
  activeTableName,
  onTableSelect,
  browsingState,
  onSelectDatabase,
  onCancelBrowse,
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
        <button className="btn-gradient" onClick={onManageConnections}>
          <ServerCog size={15} />
          Connections
        </button>
      </div>

      <nav className="sidebar-nav">
        {/* ── Database browser mode ─────────────────────────────────── */}
        {browsingState && (
          <div className="nav-section">
            <h2 className="nav-section-title nav-section-title--browsing">
              <HardDrive size={12} />
              {browsingState.connectionName}
              <button
                className="nav-browse-cancel"
                title="Cancel"
                onClick={onCancelBrowse}
              >
                <X size={11} />
              </button>
            </h2>
            <p className="nav-browse-hint">Select a database to connect</p>
            <ul className="nav-list">
              {browsingState.databases.map(dbName => (
                <li key={dbName}>
                  <button
                    className="nav-item nav-item--db"
                    onClick={() => onSelectDatabase(dbName)}
                  >
                    <Database size={13} className="nav-item-icon" />
                    <span className="nav-item-label">{dbName}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Session nav items (only when session is open) ─────────── */}
        {connectionString && !browsingState && (
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

        {!browsingState && tables.length > 0 && (
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

        {!browsingState && views.length > 0 && (
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

      <div className="sidebar-footer">
        {browsingState && (
          <div className="connection-indicator">
            <span className="status-dot" style={{ background: '#f59e0b', boxShadow: '0 0 8px rgba(245,158,11,0.4)' }} />
            <span className="connection-path">
              {browsingState.serverConfig.kind} · {browsingState.serverConfig.host}
            </span>
          </div>
        )}
        {connectionString && !browsingState && (
          <div className="connection-indicator">
            <span className="status-dot connected" />
            <span className="connection-path" title={connectionString}>
              {connectionName ?? connectionString}
            </span>
          </div>
        )}
        {onOpenSettings && (
          <button className="sidebar-settings-btn" onClick={onOpenSettings} title="Settings">
            <Settings2 size={15} />
          </button>
        )}
      </div>
    </aside>
  );
}
