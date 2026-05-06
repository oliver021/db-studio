import { useState, useEffect } from 'react';
import { Palette, Code2, Table2, Plug, Keyboard, Info } from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import AppearanceSection  from './sections/AppearanceSection';
import EditorSection      from './sections/EditorSection';
import DataTableSection   from './sections/DataTableSection';
import ConnectionsSection from './sections/ConnectionsSection';
import ShortcutsSection   from './sections/ShortcutsSection';
import AboutSection       from './sections/AboutSection';
import './Settings.css';

type SectionId = 'appearance' | 'editor' | 'datatable' | 'connections' | 'shortcuts' | 'about';

const NAV: Array<{ id: SectionId; label: string; icon: React.ReactNode }> = [
  { id: 'appearance',  label: 'Appearance',  icon: <Palette size={15} />   },
  { id: 'editor',      label: 'Editor',      icon: <Code2 size={15} />     },
  { id: 'datatable',   label: 'Data Table',  icon: <Table2 size={15} />    },
  { id: 'connections', label: 'Connections', icon: <Plug size={15} />      },
  { id: 'shortcuts',   label: 'Shortcuts',   icon: <Keyboard size={15} />  },
  { id: 'about',       label: 'About',       icon: <Info size={15} />      },
];

const SECTIONS: Record<SectionId, React.ReactNode> = {
  appearance:  <AppearanceSection />,
  editor:      <EditorSection />,
  datatable:   <DataTableSection />,
  connections: <ConnectionsSection />,
  shortcuts:   <ShortcutsSection />,
  about:       <AboutSection />,
};

export default function SettingsTab() {
  const [active, setActive] = useState<SectionId>('appearance');
  const { hydrate, hydrated } = useSettingsStore();

  useEffect(() => { hydrate(); }, [hydrate]);

  if (!hydrated) {
    return <div className="settings-root" style={{ alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading settings…</div>;
  }

  return (
    <div className="settings-root">
      <nav className="settings-nav">
        {NAV.map(item => (
          <button
            key={item.id}
            className={`settings-nav-item${active === item.id ? ' active' : ''}`}
            onClick={() => setActive(item.id)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      <div className="settings-content">
        {SECTIONS[active]}
      </div>
    </div>
  );
}
