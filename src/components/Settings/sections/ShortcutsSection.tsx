const isMac = navigator.platform.toUpperCase().includes('MAC');
const Mod = isMac ? '⌘' : 'Ctrl';

interface ShortcutRow { description: string; keys: string[][] }

const GROUPS: Array<{ title: string; rows: ShortcutRow[] }> = [
  {
    title: 'Tabs',
    rows: [
      { description: 'Close active tab',         keys: [[Mod, 'W']] },
      { description: 'Next tab',                 keys: [[Mod, 'Tab']] },
      { description: 'Previous tab',             keys: [[Mod, '⇧', 'Tab']] },
      { description: 'Jump to tab 1–8',          keys: [[Mod, '1'], ['…'], [Mod, '8']] },
      { description: 'Jump to last tab',         keys: [[Mod, '9']] },
      { description: 'Open Connections tab',     keys: [[Mod, '⇧', 'C']] },
      { description: 'Open Settings tab',        keys: [[Mod, '⇧', ',']] },
    ],
  },
  {
    title: 'Query Console',
    rows: [
      { description: 'Run query',               keys: [[Mod, '↵']] },
      { description: 'Auto-complete',           keys: [['Ctrl', 'Space']] },
    ],
  },
  {
    title: 'Data Table',
    rows: [
      { description: 'Edit focused cell',       keys: [['F2']] },
      { description: 'Commit cell edit',        keys: [['↵']] },
      { description: 'Cancel cell edit',        keys: [['Esc']] },
    ],
  },
];

function Kbd({ keys }: { keys: string[][] }) {
  return (
    <span className="kbd">
      {keys.map((combo, ci) => (
        <span key={ci} className="kbd">
          {ci > 0 && <span className="kbd-sep">/</span>}
          {combo.map((k, ki) => (
            <span key={ki}>
              {ki > 0 && <span className="kbd-sep">+</span>}
              <kbd className="kbd-key">{k}</kbd>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

export default function ShortcutsSection() {
  return (
    <div>
      <h2 className="settings-section-title">Keyboard Shortcuts</h2>
      <p className="settings-section-desc">Reference for all global keyboard shortcuts. Shortcuts are not editable.</p>

      {GROUPS.map(group => (
        <div key={group.title} className="settings-group">
          <div className="settings-group-label">{group.title}</div>
          <table className="settings-shortcuts-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Keys</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map(row => (
                <tr key={row.description}>
                  <td>{row.description}</td>
                  <td><Kbd keys={row.keys} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
