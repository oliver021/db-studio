import { useState } from 'react';
import { Trash2, Zap, Loader2 } from 'lucide-react';

export interface SavedConnection {
  id: string;
  name: string;
  config: { kind: string; path?: string; host?: string; database?: string; user?: string };
  lastConnected: string | null;
}

interface ConnectionCardProps {
  conn: SavedConnection;
  error: string | null;
  onConnect: (conn: SavedConnection) => Promise<void>;
  onDelete: (id: string) => void;
}

function engineBadgeClass(kind: string): string {
  if (kind === 'postgres') return 'conn-engine-badge conn-engine-badge--postgres';
  if (kind === 'mysql')    return 'conn-engine-badge conn-engine-badge--mysql';
  return 'conn-engine-badge conn-engine-badge--sqlite';
}

function connectionLabel(conn: SavedConnection): string {
  const { config } = conn;
  if (config.kind === 'sqlite') return config.path ?? '';
  const host = config.host ?? 'localhost';
  const db   = config.database ?? '';
  return `${config.kind}://${host}/${db}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never connected';
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return 'just now';
  if (hours < 1)  return `${mins}m ago`;
  if (days < 1)   return `${hours}h ago`;
  return `${days}d ago`;
}

export default function ConnectionCard({ conn, error, onConnect, onDelete }: ConnectionCardProps) {
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await onConnect(conn);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className={`conn-card${error ? ' conn-card--error' : ''}`}>
      <div className="conn-card-info">
        <div className="conn-card-top">
          <span className={engineBadgeClass(conn.config.kind)}>{conn.config.kind}</span>
          <span className="conn-card-name">{conn.name}</span>
        </div>
        <div className="conn-card-meta">
          <span className="conn-card-path">{connectionLabel(conn)}</span>
          <span className="conn-card-dot">·</span>
          <span className="conn-card-time">{timeAgo(conn.lastConnected)}</span>
        </div>
        {error && <div className="conn-card-error-msg">{error}</div>}
      </div>

      <div className="conn-card-actions">
        <button
          className="conn-card-delete"
          title="Remove connection"
          onClick={() => onDelete(conn.id)}
        >
          <Trash2 size={14} />
        </button>
        <button
          className="conn-card-connect"
          onClick={handleConnect}
          disabled={connecting}
        >
          {connecting
            ? <Loader2 size={13} className="spin" />
            : <Zap size={13} />}
          Connect
        </button>
      </div>
    </div>
  );
}
