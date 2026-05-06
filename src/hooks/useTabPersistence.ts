/**
 * Persists non-session tabs (Connections, Settings) to localStorage so they
 * survive page reloads. Session tabs are always ephemeral — DB connections
 * don't survive a restart, so we never try to restore them.
 */
import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import type { Tab } from '../store/useStore';

const KEY = 'db-studio:tabs-v1';

interface Persisted {
  /** Only static (non-session) tabs are saved. */
  staticTabs: Array<{ kind: string; id: string; title: string; pinned: boolean }>;
  /** Only persisted when it pointed at a static tab. */
  activeTabId: string | null;
}

export function useTabPersistence() {
  const { tabs, activeTabId, openTab, switchTab } = useStore();
  const restored = useRef(false);

  // ── Restore once on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const saved: Persisted = JSON.parse(raw);
      for (const t of saved.staticTabs) {
        if (t.kind === 'connections') {
          openTab({ kind: 'connections', id: 'connections', title: 'Connections', pinned: t.pinned, dirty: false });
        } else if (t.kind === 'settings') {
          openTab({ kind: 'settings', id: 'settings', title: 'Settings', pinned: t.pinned, dirty: false });
        }
      }
      if (saved.activeTabId && saved.staticTabs.some(t => t.id === saved.activeTabId)) {
        switchTab(saved.activeTabId);
      }
    } catch {
      // corrupt storage — ignore
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist on every tabs / activeTabId change ─────────────────────────────
  useEffect(() => {
    const staticTabs = tabs
      .filter((t): t is Exclude<Tab, { kind: 'session' }> => t.kind !== 'session')
      .map(t => ({ kind: t.kind, id: t.id, title: t.title, pinned: t.pinned }));

    const activeIsStatic = tabs.find(t => t.id === activeTabId)?.kind !== 'session';
    const saved: Persisted = {
      staticTabs,
      activeTabId: activeIsStatic ? activeTabId : null,
    };
    localStorage.setItem(KEY, JSON.stringify(saved));
  }, [tabs, activeTabId]);
}
