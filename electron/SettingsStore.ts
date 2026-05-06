/**
 * Persists application settings via electron-store.
 * A single store instance is created lazily and reused.
 */
import Store from 'electron-store';

// ── Types ─────────────────────────────────────────────────────────────────────

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
  appearance: {
    editorTheme: 'sqlitenav-dark',
    accentColor: 'purple',
  },
  editor: {
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    tabSize: 2,
    wordWrap: true,
    lineNumbers: true,
    minimap: false,
    defaultSql: 'SELECT * FROM ',
  },
  dataTable: {
    defaultPageSize: 50,
    defaultVisibleColumns: 8,
    nullDisplay: 'NULL',
  },
  connections: {
    connectTimeoutMs: 10_000,
    queryTimeoutMs: 0,
    sslByDefault: false,
  },
};

// ── Store instance ─────────────────────────────────────────────────────────────

const store = new Store<{ settings: AppSettings }>({
  name: 'app-settings',
  defaults: { settings: DEFAULT_SETTINGS },
});

// ── Public API ────────────────────────────────────────────────────────────────

export function getSettings(): AppSettings {
  // Deep-merge so new keys added in future versions get their defaults
  const saved = store.get('settings', DEFAULT_SETTINGS);
  return deepMerge(DEFAULT_SETTINGS, saved);
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const next = deepMerge(current, patch) as AppSettings;
  store.set('settings', next);
  return next;
}

export function resetSettings(): AppSettings {
  store.set('settings', DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    const b = base[key];
    const o = override[key];
    if (isPlainObject(b) && isPlainObject(o)) {
      result[key] = deepMerge(b as Record<string, unknown>, o as Record<string, unknown>);
    } else if (o !== undefined) {
      result[key] = o;
    }
  }
  return result;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
