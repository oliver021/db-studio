import { useSettingsStore } from '../../../store/useSettingsStore';

const FONT_FAMILIES = [
  { value: "'JetBrains Mono', 'Fira Code', monospace", label: 'JetBrains Mono' },
  { value: "'Fira Code', monospace",                    label: 'Fira Code'       },
  { value: "'Cascadia Code', monospace",                label: 'Cascadia Code'   },
  { value: "'Source Code Pro', monospace",              label: 'Source Code Pro' },
  { value: "Consolas, monospace",                       label: 'Consolas'        },
  { value: "Monaco, monospace",                         label: 'Monaco'          },
];

export default function EditorSection() {
  const { settings, update } = useSettingsStore();
  const ed = settings.editor;

  const set = (patch: Partial<typeof ed>) =>
    update({ editor: { ...ed, ...patch } });

  return (
    <div>
      <h2 className="settings-section-title">Editor</h2>
      <p className="settings-section-desc">Monaco editor defaults applied to the Query Console.</p>

      <div className="settings-group">
        <div className="settings-group-label">Typography</div>

        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Font Size</strong>
            <span>Size of the editor text in pixels (11–20)</span>
          </div>
          <div className="settings-row-control settings-slider-row">
            <input
              type="range" min={11} max={20} step={1}
              value={ed.fontSize}
              className="settings-slider"
              onChange={e => set({ fontSize: Number(e.target.value) })}
            />
            <span className="settings-slider-value">{ed.fontSize}px</span>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Font Family</strong>
            <span>Monospace font used in the editor</span>
          </div>
          <div className="settings-row-control">
            <select
              className="settings-select"
              value={ed.fontFamily}
              onChange={e => set({ fontFamily: e.target.value })}
            >
              {FONT_FAMILIES.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Tab Size</strong>
            <span>Number of spaces per tab stop</span>
          </div>
          <div className="settings-row-control">
            <div className="settings-radio-group">
              {([2, 4] as const).map(n => (
                <button
                  key={n}
                  className={`settings-radio-btn${ed.tabSize === n ? ' active' : ''}`}
                  onClick={() => set({ tabSize: n })}
                >{n} spaces</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-label">Editor Behaviour</div>

        {([
          ['wordWrap',    'Word Wrap',    'Wrap long lines instead of scrolling horizontally'],
          ['lineNumbers', 'Line Numbers', 'Show line numbers in the gutter'],
          ['minimap',     'Minimap',      'Show the code minimap on the right side'],
        ] as const).map(([key, label, desc]) => (
          <div key={key} className="settings-row">
            <div className="settings-row-label">
              <strong>{label}</strong>
              <span>{desc}</span>
            </div>
            <div className="settings-row-control">
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={ed[key] as boolean}
                  onChange={e => set({ [key]: e.target.checked })}
                />
                <span className="settings-toggle-track" />
                <span className="settings-toggle-thumb" />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="settings-group">
        <div className="settings-group-label">Default Content</div>
        <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
          <div className="settings-row-label">
            <strong>Default SQL</strong>
            <span>Text pre-filled when the Query Console opens</span>
          </div>
          <textarea
            className="settings-textarea"
            value={ed.defaultSql}
            rows={2}
            onChange={e => set({ defaultSql: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
