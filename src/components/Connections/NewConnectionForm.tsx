import { useState } from 'react';
import { X, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import * as dbClient from '../../services/dbClient';

type Engine = 'sqlite' | 'postgres' | 'mysql';

interface NewConnectionFormProps {
  onConnect: (config: unknown, name: string) => Promise<void>;
  onClose: () => void;
}

type TestStatus = 'idle' | 'testing' | 'ok' | 'fail';

export default function NewConnectionForm({ onConnect, onClose }: NewConnectionFormProps) {
  const [engine, setEngine]         = useState<Engine>('sqlite');
  const [name, setName]             = useState('');
  const [path, setPath]             = useState('');
  const [host, setHost]             = useState('localhost');
  const [port, setPort]             = useState('');
  const [database, setDatabase]     = useState('');
  const [user, setUser]             = useState('');
  const [password, setPassword]     = useState('');
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMsg, setTestMsg]       = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function buildConfig(): unknown {
    if (engine === 'sqlite') return { kind: 'sqlite', path };
    const defaultPort = engine === 'postgres' ? 5432 : 3306;
    return {
      kind: engine,
      host,
      port: parseInt(port || String(defaultPort), 10),
      database,
      user,
      password,
    };
  }

  function defaultName(): string {
    if (engine === 'sqlite') return path.split(/[/\\]/).pop() ?? 'database.db';
    return `${database || engine}@${host}`;
  }

  const handleTest = async () => {
    setTestStatus('testing');
    setTestMsg('');
    try {
      const result = await dbClient.testConnection(buildConfig());
      if (result.ok) {
        setTestStatus('ok');
        setTestMsg('Connection successful');
      } else {
        setTestStatus('fail');
        setTestMsg(result.error ?? 'Connection failed');
      }
    } catch (err: unknown) {
      setTestStatus('fail');
      setTestMsg(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  const handleSubmit = async () => {
    setSubmitError('');
    setSubmitting(true);
    const displayName = name.trim() || defaultName();
    try {
      await onConnect(buildConfig(), displayName);
      onClose();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = engine === 'sqlite' ? !!path.trim() : !!(host && database && user);

  return (
    <div className="conn-form-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="conn-form-modal">
        <div className="conn-form-header">
          <h2 className="conn-form-title">New Connection</h2>
          <button className="conn-form-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="conn-form-engine-tabs">
          {(['sqlite', 'postgres', 'mysql'] as Engine[]).map(e => (
            <button
              key={e}
              className={`conn-form-engine-tab${engine === e ? ' active' : ''}`}
              onClick={() => { setEngine(e); setTestStatus('idle'); setTestMsg(''); }}
            >
              {e === 'sqlite' ? 'SQLite' : e === 'postgres' ? 'PostgreSQL' : 'MySQL'}
            </button>
          ))}
        </div>

        {engine === 'sqlite' ? (
          <div className="conn-form-field">
            <label className="conn-form-label">File path</label>
            <input
              className="conn-form-input"
              placeholder="/path/to/database.db"
              value={path}
              onChange={e => setPath(e.target.value)}
            />
          </div>
        ) : (
          <>
            <div className="conn-form-row-3">
              <div className="conn-form-field">
                <label className="conn-form-label">Host</label>
                <input
                  className="conn-form-input"
                  value={host}
                  onChange={e => setHost(e.target.value)}
                />
              </div>
              <div className="conn-form-field">
                <label className="conn-form-label">Port</label>
                <input
                  className="conn-form-input"
                  placeholder={engine === 'postgres' ? '5432' : '3306'}
                  value={port}
                  onChange={e => setPort(e.target.value)}
                />
              </div>
            </div>
            <div className="conn-form-field" style={{ marginTop: 14 }}>
              <label className="conn-form-label">Database</label>
              <input
                className="conn-form-input"
                value={database}
                onChange={e => setDatabase(e.target.value)}
              />
            </div>
            <div className="conn-form-row" style={{ marginTop: 14 }}>
              <div className="conn-form-field">
                <label className="conn-form-label">Username</label>
                <input
                  className="conn-form-input"
                  value={user}
                  onChange={e => setUser(e.target.value)}
                />
              </div>
              <div className="conn-form-field">
                <label className="conn-form-label">Password</label>
                <input
                  className="conn-form-input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
            </div>
          </>
        )}

        <div className="conn-form-field" style={{ marginTop: 14 }}>
          <label className="conn-form-label">Display name (optional)</label>
          <input
            className="conn-form-input"
            placeholder={defaultName()}
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>

        <div className="conn-form-test-row" style={{ marginTop: 14 }}>
          <button
            className="conn-form-test-btn"
            onClick={handleTest}
            disabled={!canSubmit || testStatus === 'testing'}
          >
            {testStatus === 'testing'
              ? <><Loader2 size={13} className="spin" /> Testing…</>
              : 'Test Connection'}
          </button>
          {testStatus !== 'idle' && testStatus !== 'testing' && (
            <div className={`conn-form-test-status ${testStatus}`}>
              {testStatus === 'ok'
                ? <><CheckCircle size={13} /> {testMsg}</>
                : <><XCircle size={13} /> {testMsg}</>}
            </div>
          )}
        </div>

        {submitError && <div className="conn-form-error">{submitError}</div>}

        <div className="conn-form-footer">
          <button className="conn-form-cancel" onClick={onClose}>Cancel</button>
          <button
            className="conn-form-submit"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
          >
            {submitting ? <><Loader2 size={13} className="spin" /> Connecting…</> : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}
