import { Database } from 'lucide-react';
import { useSettingsStore } from '../../../store/useSettingsStore';

// Electron exposes process.versions in the renderer when nodeIntegration is off
// but contextIsolation is on — we read from a safe global.
const versions: Record<string, string> = (window as unknown as { process?: { versions?: Record<string, string> } })
  .process?.versions ?? {};

export default function AboutSection() {
  const { reset } = useSettingsStore();

  return (
    <div>
      <h2 className="settings-section-title">About</h2>
      <p className="settings-section-desc">DB Studio — multi-engine database manager.</p>

      <div className="settings-about-logo">
        <Database size={28} />
      </div>
      <p className="settings-about-name">DB Studio</p>
      <p className="settings-about-version">Version 0.0.0</p>

      <div className="settings-about-grid">
        {[
          { label: 'Electron',   value: versions['electron'] ?? '—' },
          { label: 'Node.js',    value: versions['node']     ?? '—' },
          { label: 'Chrome',     value: versions['chrome']   ?? '—' },
        ].map(card => (
          <div key={card.label} className="settings-about-card">
            <div className="settings-about-card-label">{card.label}</div>
            <div className="settings-about-card-value">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="settings-group">
        <div className="settings-group-label">Reset</div>
        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Reset All Settings</strong>
            <span>Restore every setting to its factory default. This cannot be undone.</span>
          </div>
          <div className="settings-row-control">
            <button className="settings-reset-btn" onClick={reset}>
              Reset to defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
