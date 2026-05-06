import { useSettingsStore } from '../../../store/useSettingsStore';

export default function ConnectionsSection() {
  const { settings, update } = useSettingsStore();
  const conn = settings.connections;
  const set = (patch: Partial<typeof conn>) => update({ connections: { ...conn, ...patch } });

  return (
    <div>
      <h2 className="settings-section-title">Connections</h2>
      <p className="settings-section-desc">Default behaviour for new database connections.</p>

      <div className="settings-group">
        <div className="settings-group-label">Timeouts</div>

        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Connect Timeout</strong>
            <span>Maximum time to wait when opening a connection (milliseconds)</span>
          </div>
          <div className="settings-row-control">
            <input
              type="number" min={0} step={1000}
              value={conn.connectTimeoutMs}
              className="settings-number"
              onChange={e => set({ connectTimeoutMs: Math.max(0, Number(e.target.value)) })}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ms</span>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Query Timeout</strong>
            <span>Maximum time to wait for a query result (0 = unlimited)</span>
          </div>
          <div className="settings-row-control">
            <input
              type="number" min={0} step={1000}
              value={conn.queryTimeoutMs}
              className="settings-number"
              onChange={e => set({ queryTimeoutMs: Math.max(0, Number(e.target.value)) })}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ms</span>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-label">Security</div>

        <div className="settings-row">
          <div className="settings-row-label">
            <strong>SSL by Default</strong>
            <span>Pre-check the SSL option when creating a new PostgreSQL or MySQL connection</span>
          </div>
          <div className="settings-row-control">
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={conn.sslByDefault}
                onChange={e => set({ sslByDefault: e.target.checked })}
              />
              <span className="settings-toggle-track" />
              <span className="settings-toggle-thumb" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
