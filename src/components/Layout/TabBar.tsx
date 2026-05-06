import { useRef } from 'react';
import { X, Database, ServerCog, Settings2, Pin, Plus } from 'lucide-react';
import type { Tab, ConnectionsTab } from '../../store/useStore';

interface Props {
  tabs: Tab[];
  activeTabId: string | null;
  onSwitch: (id: string) => void;
  onClose: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  onNewTab?: () => void;   // opens Connections tab
}

function tabIcon(tab: Tab) {
  if (tab.kind === 'connections') return <ServerCog size={13} />;
  if (tab.kind === 'settings')    return <Settings2 size={13} />;
  const k = (tab as Extract<Tab, { kind: 'session' }>).dbKind;
  if (k === 'postgres') return <span className="tab-db-badge pg">PG</span>;
  if (k === 'mysql')    return <span className="tab-db-badge my">MY</span>;
  return <Database size={13} />;
}

export default function TabBar({ tabs, activeTabId, onSwitch, onClose, onReorder, onNewTab }: Props) {
  const dragSrc = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Horizontal scroll on mouse-wheel (works even when no horizontal scrollbar)
  const handleWheel = (e: React.WheelEvent) => {
    if (!scrollRef.current) return;
    e.preventDefault();
    scrollRef.current.scrollLeft += e.deltaY + e.deltaX;
  };

  if (tabs.length === 0 && !onNewTab) return null;

  return (
    <div className="tab-bar-shell">
      <div
        className="tab-bar"
        role="tablist"
        ref={scrollRef}
        onWheel={handleWheel}
      >
        {tabs.map((tab, idx) => (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeTabId}
            className={[
              'tab-item',
              tab.id === activeTabId ? 'active' : '',
              tab.pinned ? 'pinned' : '',
            ].filter(Boolean).join(' ')}
            title={tab.title}
            onClick={() => onSwitch(tab.id)}
            // Middle-click closes
            onMouseDown={e => {
              if (e.button === 1) {
                e.preventDefault();
                if (!tab.pinned) onClose(tab.id);
              }
            }}
            // Drag-to-reorder
            draggable
            onDragStart={() => { dragSrc.current = idx; }}
            onDragOver={e => e.preventDefault()}
            onDrop={() => {
              if (dragSrc.current !== null && dragSrc.current !== idx) {
                onReorder(dragSrc.current, idx);
              }
              dragSrc.current = null;
            }}
            onDragEnd={() => { dragSrc.current = null; }}
          >
            <span className="tab-icon">{tabIcon(tab)}</span>
            <span className="tab-title">{tab.title}</span>
            {tab.dirty && <span className="tab-dirty" title="Unsaved changes">●</span>}
            {tab.pinned
              ? <span className="tab-pin" title="Pinned"><Pin size={10} /></span>
              : (
                <button
                  className="tab-close"
                  title="Close tab (Ctrl+W)"
                  onClick={e => { e.stopPropagation(); onClose(tab.id); }}
                >
                  <X size={11} />
                </button>
              )
            }
          </div>
        ))}
      </div>

      {onNewTab && (
        <button
          className="tab-new-btn"
          title="New connection (Ctrl+Shift+C)"
          onClick={onNewTab}
        >
          <Plus size={13} />
        </button>
      )}
    </div>
  );
}

/** Helper to build a Connections tab — exported for consumers. */
export const CONNECTIONS_TAB: ConnectionsTab = {
  kind: 'connections',
  id: 'connections',
  title: 'Connections',
  pinned: false,
  dirty: false,
};
