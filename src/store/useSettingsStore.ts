import { create } from 'zustand';
import * as settingsClient from '../services/settingsClient';

// ── Types (mirrors electron/SettingsStore.ts) ─────────────────────────────────

export interface AppSettings {
  appearance: {
    editorTheme: 'sqlitenav-dark' | 'midnight' | 'vs-dark' | 'hc-black';
    accentColor: 'purple' | 'blue' | 'green' | 'orange';
  };
  editor: {
    fontSize: number;
    fontFamily: string;
    tabSize: 2 | 4;
    wordWrap: boolean;
    lineNumbers: boolean;
    minimap: boolean;
    defaultSql: string;
  };
  dataTable: {
    defaultPageSize: 25 | 50 | 100 | 200;
    defaultVisibleColumns: number;
    nullDisplay: 'NULL' | '—' | '';
  };
  connections: {
    connectTimeoutMs: number;
    queryTimeoutMs: number;
    sslByDefault: boolean;
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  appearance: { editorTheme: 'sqlitenav-dark', accentColor: 'purple' },
  editor: {
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    tabSize: 2,
    wordWrap: true,
    lineNumbers: true,
    minimap: false,
    defaultSql: 'SELECT * FROM ',
  },
  dataTable: { defaultPageSize: 50, defaultVisibleColumns: 8, nullDisplay: 'NULL' },
  connections: { connectTimeoutMs: 10_000, queryTimeoutMs: 0, sslByDefault: false },
};

// ── Accent colour map ─────────────────────────────────────────────────────────

export const ACCENT_COLORS: Record<AppSettings['appearance']['accentColor'], { primary: string; indigo: string; cyan: string }> = {
  purple: { primary: '#7c3aed', indigo: '#4f46e5', cyan: '#22d3ee' },
  blue:   { primary: '#3b82f6', indigo: '#6366f1', cyan: '#38bdf8' },
  green:  { primary: '#10b981', indigo: '#059669', cyan: '#34d399' },
  orange: { primary: '#f59e0b', indigo: '#d97706', cyan: '#fbbf24' },
};

// ── Store ─────────────────────────────────────────────────────────────────────

interface SettingsState {
  settings: AppSettings;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  update: (patch: Partial<AppSettings>) => Promise<void>;
  reset: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const settings = await settingsClient.getSettings();
    set({ settings, hydrated: true });
    applyAccent(settings.appearance.accentColor);
  },

  update: async (patch) => {
    const next = await settingsClient.setSettings(patch);
    set({ settings: next });
    if (patch.appearance?.accentColor) applyAccent(patch.appearance.accentColor);
  },

  reset: async () => {
    const next = await settingsClient.resetSettings();
    set({ settings: next });
    applyAccent(next.appearance.accentColor);
  },
}));

// ── Apply accent colour to CSS variables ──────────────────────────────────────

function applyAccent(color: AppSettings['appearance']['accentColor']) {
  const { primary, indigo, cyan } = ACCENT_COLORS[color] ?? ACCENT_COLORS.purple;
  const root = document.documentElement.style;
  root.setProperty('--accent-primary', primary);
  root.setProperty('--accent-indigo', indigo);
  root.setProperty('--accent-cyan', cyan);
}
