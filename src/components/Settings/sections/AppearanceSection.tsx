import { useSettingsStore, ACCENT_COLORS } from '../../../store/useSettingsStore';
import type { AppSettings } from '../../../store/useSettingsStore';

const THEMES: Array<{ value: AppSettings['appearance']['editorTheme']; label: string; bg: string; lines: string[] }> = [
  { value: 'sqlitenav-dark', label: 'SQLiteNav',   bg: '#0c0c16', lines: ['#c084fc', '#34d399', '#f59e0b', '#94a3b8'] },
  { value: 'midnight',       label: 'Midnight',    bg: '#080810', lines: ['#60a5fa', '#a7f3d0', '#fbbf24', '#475569'] },
  { value: 'vs-dark',        label: 'VS Dark',     bg: '#1e1e1e', lines: ['#569cd6', '#ce9178', '#b5cea8', '#6a9955'] },
  { value: 'hc-black',       label: 'High Contrast', bg: '#000000', lines: ['#ff00ff', '#00ff00', '#ffff00', '#ffffff'] },
];

const ACCENT_OPTIONS: Array<{ value: AppSettings['appearance']['accentColor']; label: string }> = [
  { value: 'purple', label: 'Purple' },
  { value: 'blue',   label: 'Blue'   },
  { value: 'green',  label: 'Green'  },
  { value: 'orange', label: 'Orange' },
];

export default function AppearanceSection() {
  const { settings, update } = useSettingsStore();
  const { editorTheme, accentColor } = settings.appearance;

  return (
    <div>
      <h2 className="settings-section-title">Appearance</h2>
      <p className="settings-section-desc">Customise the look of the application.</p>

      <div className="settings-group">
        <div className="settings-group-label">Editor Theme</div>
        <div className="settings-theme-grid">
          {THEMES.map(t => (
            <button
              key={t.value}
              className={`settings-theme-tile${editorTheme === t.value ? ' active' : ''}`}
              onClick={() => update({ appearance: { ...settings.appearance, editorTheme: t.value } })}
            >
              <div className="settings-theme-preview" style={{ background: t.bg }}>
                {t.lines.map((color, i) => (
                  <div
                    key={i}
                    className="settings-theme-preview-line"
                    style={{ background: color, width: `${[70, 90, 55, 80][i]}%`, opacity: 0.85 }}
                  />
                ))}
              </div>
              <div className="settings-theme-name">{t.label}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-label">Accent Colour</div>
        <div className="settings-accent-grid">
          {ACCENT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`settings-accent-dot${accentColor === opt.value ? ' active' : ''}`}
              title={opt.label}
              style={{ background: ACCENT_COLORS[opt.value].primary }}
              onClick={() => update({ appearance: { ...settings.appearance, accentColor: opt.value } })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
