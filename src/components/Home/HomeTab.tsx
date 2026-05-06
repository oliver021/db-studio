/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { Plus, FolderOpen, Plug } from 'lucide-react';
import { useStore } from '../../store/useStore';
import * as dbClient from '../../services/dbClient';
import { useToast } from '../../hooks/useToast';
import './Home.css';

interface SavedConnection {
  id: string;
  name: string;
  config: { kind: string; path?: string; host?: string; database?: string };
  createdAt: string;
  lastUsed?: string;
}

interface Props {
  onOpenConnections: () => void;  // Opens Connections tab with form
  onOpenFile: () => void;           // Opens file picker dialog
}

export default function HomeTab({ onOpenConnections, onOpenFile }: Props) {
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState<string | null>(null);
  const { push: toast } = useToast();

  const loadConnections = async () => {
    try {
      setLoading(true);
      const list = await dbClient.listConnections();
      setConnections(list ?? []);
      setError('');
    } catch (err: any) {
      setError(err.message ?? 'Failed to load connections');
      setConnections([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConnections();
  }, []);

  const handleConnect = async (connectionId: string) => {
    setConnecting(connectionId);
    try {
      const result = await dbClient.connectSaved(connectionId);
      // Switch to new session tab
      const { addSession, switchSession, refreshSchema } = useStore.getState();
      addSession({ sessionId: result.sessionId, name: result.name ?? connectionId, kind: 'unknown' });
      switchSession(result.sessionId);
      await refreshSchema();
    } catch (err: any) {
      toast(err.message ?? 'Connection failed', 'error');
    } finally {
      setConnecting(null);
    }
  };

  const connSubtitle = (c: SavedConnection) => {
    if (c.config.kind === 'sqlite') return c.config.path ?? '';
    return `${c.config.kind}://${c.config.host}/${c.config.database ?? 'default'}`;
  };

  const timeAgo = (iso?: string) => {
    if (!iso) return null;
    // eslint-disable-next-line react-hooks/purity
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="home-panel">
      <div className="home-header">
        <h1 className="home-title">DB Studio</h1>
        <p className="home-subtitle">Welcome back</p>
      </div>

      {error && (
        <div className="home-error">
          <p>{error}</p>
        </div>
      )}

      <div className="home-section">
        <h2 className="home-section-title">Saved Connections</h2>

        {loading ? (
          <div className="home-loading">Loading connections…</div>
        ) : connections.length === 0 ? (
          <div className="home-empty">
            <p>No saved connections yet.</p>
            <p className="home-empty-hint">Click <strong>New Connection</strong> to get started.</p>
          </div>
        ) : (
          <div className="home-connections-grid">
            {connections.map(conn => (
              <div key={conn.id} className="home-connection-card">
                <div className="card-header">
                  <span className={`engine-badge engine-${conn.config.kind}`}>
                    {conn.config.kind.toUpperCase()}
                  </span>
                  <span className="card-name">{conn.name}</span>
                </div>
                <div className="card-path" title={connSubtitle(conn)}>
                  {connSubtitle(conn)}
                </div>
                {conn.lastUsed && (
                  <div className="card-last-used">
                    • {timeAgo(conn.lastUsed)}
                  </div>
                )}
                <div className="card-actions">
                  <button
                    className="card-btn connect-btn"
                    onClick={() => handleConnect(conn.id)}
                    disabled={connecting === conn.id}
                    title="Connect"
                  >
                    <Plug size={14} />
                    {connecting === conn.id ? 'Connecting…' : 'Connect'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="home-actions">
        <button className="home-btn home-btn-primary" onClick={onOpenConnections}>
          <Plus size={16} />
          New Connection
        </button>
        <button className="home-btn home-btn-secondary" onClick={onOpenFile}>
          <FolderOpen size={16} />
          Open SQLite File
        </button>
      </div>
    </div>
  );
}
