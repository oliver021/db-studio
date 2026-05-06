import { useState, useEffect } from 'react';
import { Plus, Plug, Trash2, X, Clock } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import * as dbClient from '../../services/dbClient';
import NewConnectionForm from './NewConnectionForm';
import './ConnectionManager.css';

interface SavedConnection {
  id: string;
  name: string;
  config: { kind: string; path?: string; host?: string; database?: string };
  createdAt: string;
  lastUsed?: string;
}

interface Props {
  onConnected: (sessionId: string, name: string) => void;
  onClose?: () => void;
  /** When true, renders as page content instead of a modal overlay. */
  inline?: boolean;
}

export default function ConnectionManager({ onConnected, onClose, inline = false }: Props) {
  const [connections, setConnections] = useState<SavedConnection[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    const list = await dbClient.listConnections();
    setConnections(list ?? []);
  };

  useEffect(() => { load(); }, []);

  const handleConnect = async (id: string) => {
    setConnecting(id);
    setError('');
    try {
      const result = await dbClient.connectSaved(id);
      onConnected(result.sessionId, result.name ?? id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setConnecting(null);
    }
  };

  const handleDelete = async (id: string) => {
    await dbClient.deleteConnection(id);
    setDeleteConfirm(null);
    load();
  };

  const connSubtitle = (c: SavedConnection) => {
    if (c.config.kind === 'sqlite') return c.config.path ?? '';
    return `${c.config.kind}://${c.config.host}/${c.config.database}`;
  };

  const timeAgo = (iso?: string) => {
    if (!iso) return null;
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const inner = (
    <>
        <div className="cm-header">
          <h2 className="cm-title">Connections</h2>
          {!inline && onClose && (
            <button className="cm-close" onClick={onClose}><X size={16} /></button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {showForm ? (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <NewConnectionForm
                onConnected={(sessionId, name) => {
                  setShowForm(false);
                  onConnected(sessionId, name);
                  load();
                }}
                onCancel={() => setShowForm(false)}
              />
            </motion.div>
          ) : (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="cm-body">
                {error && <p className="cm-error">{error}</p>}

                {connections.length === 0 ? (
                  <div className="cm-empty">
                    <p>No saved connections yet.</p>
                    <p className="cm-empty-hint">Click <strong>New Connection</strong> to get started.</p>
                  </div>
                ) : (
                  <ul className="cm-list">
                    {connections.map(c => (
                      <li key={c.id} className="cm-item">
                        <div className="cm-item-info">
                          <span className="cm-item-engine cm-item-engine--{c.config.kind}">
                            {c.config.kind}
                          </span>
                          <span className="cm-item-name">{c.name}</span>
                          <span className="cm-item-sub" title={connSubtitle(c)}>{connSubtitle(c)}</span>
                          {c.lastUsed && (
                            <span className="cm-item-last">
                              <Clock size={11} /> {timeAgo(c.lastUsed)}
                            </span>
                          )}
                        </div>
                        <div className="cm-item-actions">
                          {deleteConfirm === c.id ? (
                            <>
                              <span className="cm-delete-confirm-label">Delete?</span>
                              <button className="cm-btn cm-btn--danger" onClick={() => handleDelete(c.id)}>Yes</button>
                              <button className="cm-btn" onClick={() => setDeleteConfirm(null)}>No</button>
                            </>
                          ) : (
                            <>
                              <button
                                className="cm-btn cm-btn--icon"
                                title="Delete"
                                onClick={() => setDeleteConfirm(c.id)}
                              >
                                <Trash2 size={13} />
                              </button>
                              <button
                                className="cm-btn cm-btn--primary"
                                disabled={connecting === c.id}
                                onClick={() => handleConnect(c.id)}
                              >
                                <Plug size={13} />
                                {connecting === c.id ? 'Connecting…' : 'Connect'}
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="cm-footer">
                <button className="cm-btn cm-btn--primary cm-btn--full" onClick={() => setShowForm(true)}>
                  <Plus size={14} /> New Connection
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
    </>
  );

  if (inline) {
    return <div className="cm-panel cm-panel--inline">{inner}</div>;
  }

  return (
    <div className="cm-overlay" onClick={onClose}>
      <motion.div
        className="cm-panel"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.18 }}
        onClick={e => e.stopPropagation()}
      >
        {inner}
      </motion.div>
    </div>
  );
}
