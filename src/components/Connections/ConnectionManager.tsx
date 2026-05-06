import { useEffect, useState } from 'react';
import { Plus, FolderOpen, AlertCircle, X } from 'lucide-react';
import './Connections.css';
import * as dbClient from '../../services/dbClient';
import ConnectionCard, { type SavedConnection } from './ConnectionCard';
import NewConnectionForm from './NewConnectionForm';

interface OpenResult { ok: boolean; sessionId?: string; error?: string; }

interface ConnectionManagerProps {
  onConnected: (sessionId: string, name: string, kind: string) => void;
  onOpenDialog: () => Promise<void>;
}

export default function ConnectionManager({ onConnected, onOpenDialog }: ConnectionManagerProps) {
  const [saved, setSaved]           = useState<SavedConnection[]>([]);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [showForm, setShowForm]     = useState(false);

  useEffect(() => {
    dbClient.listSavedConnections().then(list => setSaved(list ?? [])).catch(() => {});
  }, []);

  const clearCardError = (id: string) =>
    setCardErrors(prev => { const next = { ...prev }; delete next[id]; return next; });

  const handleCardConnect = async (conn: SavedConnection) => {
    clearCardError(conn.id);
    try {
      const result = await dbClient.openSession(conn.config, conn.name) as OpenResult;
      if (!result.ok) {
        setCardErrors(prev => ({ ...prev, [conn.id]: result.error ?? 'Connection failed' }));
        return;
      }
      await dbClient.updateSavedLastConnected(conn.id);
      setSaved(prev => prev.map(c =>
        c.id === conn.id ? { ...c, lastConnected: new Date().toISOString() } : c,
      ));
      onConnected(result.sessionId ?? '', conn.name, conn.config.kind);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setCardErrors(prev => ({ ...prev, [conn.id]: msg }));
    }
  };

  const handleDelete = async (id: string) => {
    await dbClient.deleteSavedConnection(id).catch(() => {});
    setSaved(prev => prev.filter(c => c.id !== id));
    clearCardError(id);
  };

  const handleFormConnect = async (config: unknown, name: string) => {
    setBannerError(null);
    const result = await dbClient.openSession(config, name) as OpenResult;
    if (!result.ok) throw new Error(result.error ?? 'Connection failed');
    const savedConn = await dbClient.saveConnection(config, name) as SavedConnection;
    await dbClient.updateSavedLastConnected(savedConn.id);
    setSaved(prev => [...prev, { ...savedConn, lastConnected: new Date().toISOString() }]);
    const kind = (config as { kind: string }).kind;
    onConnected(result.sessionId ?? '', name, kind);
  };

  const handleOpenDialog = async () => {
    setBannerError(null);
    try {
      await onOpenDialog();
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : 'Failed to open file');
    }
  };

  return (
    <div className="conn-manager">
      <h2 className="conn-manager-heading">Connections</h2>

      {bannerError && (
        <div className="conn-error-banner">
          <AlertCircle size={15} className="conn-error-icon" />
          <div className="conn-error-body">
            <p className="conn-error-title">Connection failed</p>
            <p className="conn-error-msg">{bannerError}</p>
          </div>
          <button className="conn-error-dismiss" onClick={() => setBannerError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {saved.length > 0 && (
        <div className="conn-list">
          {saved.map(conn => (
            <ConnectionCard
              key={conn.id}
              conn={conn}
              error={cardErrors[conn.id] ?? null}
              onConnect={handleCardConnect}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <div className="conn-actions">
        <button className="conn-btn-new" onClick={() => setShowForm(true)}>
          <Plus size={15} /> New Connection
        </button>
        <button className="conn-btn-open-file" onClick={handleOpenDialog}>
          <FolderOpen size={14} /> Open SQLite File
        </button>
      </div>

      {showForm && (
        <NewConnectionForm
          onConnect={handleFormConnect}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
