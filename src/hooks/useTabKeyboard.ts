/**
 * Global keyboard shortcuts for tab management.
 *
 *  Ctrl/Cmd + W              close active (non-pinned) tab
 *  Ctrl/Cmd + Tab            switch to next tab
 *  Ctrl/Cmd + Shift + Tab    switch to previous tab
 *  Ctrl/Cmd + Shift + C      open / focus Connections tab
 *  Ctrl/Cmd + Shift + ,      open / focus Settings tab
 *  Ctrl/Cmd + 1-9            jump to tab by position
 */
import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import type { ConnectionsTab, SettingsTab } from '../store/useStore';

export function useTabKeyboard() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      const { tabs, activeTabId, closeTab, switchTab, openTab } = useStore.getState();

      // ── Ctrl+W — close active tab ──────────────────────────────────────────
      if (e.key === 'w' && !e.shiftKey && !e.altKey) {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab && !tab.pinned) {
          e.preventDefault();
          closeTab(tab.id);
        }
        return;
      }

      // ── Ctrl+Tab / Ctrl+Shift+Tab — cycle tabs ─────────────────────────────
      if (e.key === 'Tab') {
        if (tabs.length < 2) return;
        e.preventDefault();
        const idx = tabs.findIndex(t => t.id === activeTabId);
        if (e.shiftKey) {
          switchTab(tabs[(idx - 1 + tabs.length) % tabs.length].id);
        } else {
          switchTab(tabs[(idx + 1) % tabs.length].id);
        }
        return;
      }

      // ── Ctrl+Shift+C — Connections tab ────────────────────────────────────
      if (e.key === 'C' && e.shiftKey) {
        e.preventDefault();
        const tab: ConnectionsTab = { kind: 'connections', id: 'connections', title: 'Connections', pinned: false, dirty: false };
        openTab(tab);
        return;
      }

      // ── Ctrl+Shift+, — Settings tab ───────────────────────────────────────
      if ((e.key === '<' || e.key === ',') && e.shiftKey) {
        e.preventDefault();
        const tab: SettingsTab = { kind: 'settings', id: 'settings', title: 'Settings', pinned: false, dirty: false };
        openTab(tab);
        return;
      }

      // ── Ctrl+1…9 — jump to Nth tab ────────────────────────────────────────
      const digit = parseInt(e.key, 10);
      if (!e.shiftKey && !e.altKey && digit >= 1 && digit <= 9) {
        const target = digit === 9
          ? tabs[tabs.length - 1]     // Ctrl+9 always = last tab
          : tabs[digit - 1];
        if (target) {
          e.preventDefault();
          switchTab(target.id);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
