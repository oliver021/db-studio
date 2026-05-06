import { useState } from 'react';
import { FolderOpen, TestTube2, Save, Database } from 'lucide-react';
import * as dbClient from '../../services/dbClient';
import { useStore } from '../../store/useStore';

type DriverKind = 'sqlite' | 'postgres' | 'mysql';

interface FormState {
  kind: DriverKind;
  name: string;
  // SQLite
  path: string;
  // Server-based
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

const DEFAULT_PORTS: Record<DriverKind, number> = {
  sqlite: 0,
  postgres: 5432,
  mysql: 3306,
};

const INITIAL: FormState = {
  kind: 'sqlite',
  name: '',
  path: '',
  host: 'localhost',
  port: '5432',
  database: '',
  user: '',
  password: '',
  ssl: false,
};

interface Props {
  onConnected: (sessionId: string, name: string) => void;
  onCancel: () => void;
  /** Called when the user triggers database-browse mode (no database specified). */
  onBrowse?: () => void;
}

export default function NewConnectionForm({ onConnected, onCancel, onBrowse }: Props) {
  const setBrowsingState = useStore(s => s.setBrowsingState);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (patch: Partial<FormState>) => setForm(f => ({ ...f, ...patch }));

  const handleKindChange = (kind: DriverKind) => {
    set({ kind, port: String(DEFAULT_PORTS[kind]) });
  };

  const buildConfig = () => {
    if (form.kind === 'sqlite') {
      return { kind: 'sqlite' as const, path: form.path };
    }
    return {
      kind: form.kind,
      host: form.host,
      port: Number(form.port),
      database: form.database,
      user: form.user,
      ssl: form.ssl,
    };
  };

  const handleTest = async () => {
    setTestStatus('testing');
    setTestMsg('');
    try {
      const result = await dbClient.testConnection(buildConfig());
      if (result?.ok) {
        setTestStatus('ok');
        setTestMsg('Connection successful');
      } else {
        setTestStatus('fail');
        setTestMsg(result?.error ?? 'Connection failed');
      }
    } catch (err: unknown) {
      setTestStatus('fail');
      setTestMsg(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  /** True when the user left database blank for a server engine. */
  const wantsBrowse = form.kind !== 'sqlite' && !form.database.trim();

  const validateServer = () => {
    if (!form.host.trim()) { setError('Host is required'); return false; }
    if (!form.user.trim()) { setError('Username is required'); return false; }
    return true;
  };

  /** Fetch database list and hand off to the sidebar browser. */
  const handleBrowse = async () => {
    if (!validateServer()) return;
    setSaving(true);
    setError('');
    try {
      const serverConfig = {
        kind: form.kind as 'postgres' | 'mysql',
        host: form.host,
        port: Number(form.port),
        user: form.user,
        ...(form.password ? { password: form.password } : {}),
        ...(form.ssl ? { ssl: true } : {}),
      };
      const databases = await dbClient.listDatabases(serverConfig);
      setBrowsingState({
        serverConfig: { ...serverConfig, ...(form.password ? { password: form.password } : {}) },
        connectionName: `${form.user}@${form.host}`,
        databases,
      });
      onBrowse?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to list databases');
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async () => {
    if (!validateFull()) return;
    setSaving(true);
    setError('');
    try {
      const config = buildConfig();
      const name = form.name.trim() || defaultName();
      const saved = await dbClient.saveConnection(name, config, form.password || undefined);
      const result = await dbClient.connectSaved(saved.id);
      onConnected(result.sessionId, result.name ?? name);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setSaving(false);
    }
  };

  const validateFull = () => {
    if (form.kind === 'sqlite' && !form.path) { setError('Database file path is required'); return false; }
    if (form.kind !== 'sqlite' && !form.host.trim()) { setError('Host is required'); return false; }
    if (form.kind !== 'sqlite' && !form.user.trim()) { setError('Username is required'); return false; }
    if (form.kind !== 'sqlite' && !form.database.trim()) { setError('Database name is required'); return false; }
    return true;
  };

  const defaultName = () => {
    if (form.kind === 'sqlite') return form.path.split(/[/\\]/).pop() ?? 'database';
    return `${form.database}@${form.host}`;
  };

  return (
    <div className="conn-form">
      <div className="conn-form-header">
        <h2 className="conn-form-title">New Connection</h2>
      </div>

      {/* Engine selector */}
      <div className="conn-form-row">
        <label className="conn-label">Engine</label>
        <div className="conn-engine-tabs">
          {(['sqlite', 'postgres', 'mysql'] as DriverKind[]).map(k => (
            <button
              key={k}
              className={`conn-engine-tab${form.kind === k ? ' active' : ''}`}
              onClick={() => handleKindChange(k)}
              type="button"
            >
              {k === 'sqlite' ? 'SQLite' : k === 'postgres' ? 'PostgreSQL' : 'MySQL'}
            </button>
          ))}
        </div>
      </div>

      {/* Display name */}
      <div className="conn-form-row">
        <label className="conn-label">Display Name</label>
        <input
          className="conn-input"
          placeholder={defaultName()}
          value={form.name}
          onChange={e => set({ name: e.target.value })}
        />
      </div>

      {/* SQLite fields */}
      {form.kind === 'sqlite' && (
        <div className="conn-form-row">
          <label className="conn-label">File Path</label>
          <div className="conn-file-row">
            <input
              className="conn-input"
              placeholder="/path/to/database.db"
              value={form.path}
              onChange={e => set({ path: e.target.value })}
            />
            <button
              className="conn-browse-btn"
              type="button"
              title="Browse"
              onClick={async () => {
                // Use the existing openDialog to get a file path from the OS picker
                const result = await dbClient.openDialog();
                if (result?.path) set({ path: result.path, name: form.name || result.name });
              }}
            >
              <FolderOpen size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Server-based fields */}
      {form.kind !== 'sqlite' && (
        <>
          <div className="conn-form-row conn-form-row--2col">
            <div>
              <label className="conn-label">Host</label>
              <input className="conn-input" value={form.host} onChange={e => set({ host: e.target.value })} />
            </div>
            <div>
              <label className="conn-label">Port</label>
              <input className="conn-input conn-input--short" type="number" value={form.port} onChange={e => set({ port: e.target.value })} />
            </div>
          </div>
          <div className="conn-form-row">
            <label className="conn-label">Database</label>
            <input className="conn-input" value={form.database} onChange={e => set({ database: e.target.value })} />
          </div>
          <div className="conn-form-row">
            <label className="conn-label">Username</label>
            <input className="conn-input" value={form.user} onChange={e => set({ user: e.target.value })} autoComplete="username" />
          </div>
          <div className="conn-form-row">
            <label className="conn-label">Password</label>
            <input
              className="conn-input"
              type="password"
              value={form.password}
              onChange={e => set({ password: e.target.value })}
              autoComplete="current-password"
              placeholder="Stored securely in OS keychain"
            />
          </div>
          <div className="conn-form-row conn-form-row--inline">
            <input id="ssl-toggle" type="checkbox" checked={form.ssl} onChange={e => set({ ssl: e.target.checked })} />
            <label htmlFor="ssl-toggle" className="conn-label">Use SSL / TLS</label>
          </div>
        </>
      )}

      {/* Error */}
      {error && <p className="conn-error">{error}</p>}

      {/* Test status */}
      {testStatus !== 'idle' && (
        <p className={`conn-test-msg conn-test-msg--${testStatus}`}>
          {testStatus === 'testing' ? 'Testing…' : testMsg}
        </p>
      )}

      {/* Actions */}
      <div className="conn-form-actions">
        {/* Hide Test button when about to browse (no database to test against) */}
        {!wantsBrowse && (
          <button className="conn-btn" type="button" onClick={handleTest} disabled={testStatus === 'testing'}>
            <TestTube2 size={13} /> Test
          </button>
        )}
        <div className="conn-form-actions-right">
          <button className="conn-btn" type="button" onClick={onCancel}>Cancel</button>
          {wantsBrowse ? (
            <button className="conn-btn conn-btn--primary" type="button" onClick={handleBrowse} disabled={saving}>
              <Database size={13} /> {saving ? 'Fetching…' : 'Browse Databases'}
            </button>
          ) : (
            <button className="conn-btn conn-btn--primary" type="button" onClick={handleConnect} disabled={saving}>
              <Save size={13} /> {saving ? 'Connecting…' : 'Save & Connect'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
