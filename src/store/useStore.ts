/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import * as db from '../services/dbClient';

// ── Tab types ─────────────────────────────────────────────────────────────────

/** A tab backed by an open DB session (SQLite / Postgres / MySQL). */
export interface SessionTab {
  kind: 'session';
  id: string;        // == sessionId
  sessionId: string;
  title: string;     // human label (file name, connection name…)
  dbKind: string;    // 'sqlite' | 'postgres' | 'mysql'
  pinned: boolean;
  dirty: boolean;    // unsaved changes (future use)
}

/** A tab showing the connection manager / new-connection form. */
export interface ConnectionsTab {
  kind: 'connections';
  id: 'connections';
  title: 'Connections';
  pinned: boolean;
  dirty: boolean;
}

/** A tab showing global app settings. */
export interface SettingsTab {
  kind: 'settings';
  id: 'settings';
  title: 'Settings';
  pinned: boolean;
  dirty: boolean;
}

/** A tab showing saved connections and entry point for new users. */
export interface HomeTab {
  kind: 'home';
  id: 'home';
  title: 'Home';
  pinned: boolean;
  dirty: boolean;
}

export type Tab = SessionTab | ConnectionsTab | SettingsTab | HomeTab;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SessionInfo {
  sessionId: string;
  name: string;
  kind: string;
}

export interface Capabilities {
  dialect: string;
  supportsTransactions: boolean;
  supportsExplain: boolean;
  hasMaintenance: boolean;
  maintenanceTasks: MaintenanceTask[];
  identifierQuote: '"' | '`';
}

export interface MaintenanceTask {
  id: string;
  name: string;
  description: string;
  buttonLabel: string;
  style?: 'primary' | 'secondary';
}

export type ActiveView = 'data' | 'query' | 'schema-graph' | 'maintenance';

/**
 * Transient state used when the user connects to a server without specifying
 * a database. The sidebar shows the database list until the user picks one.
 */
export interface BrowsingState {
  /** Server-level config (no database field). */
  serverConfig: {
    kind: 'postgres' | 'mysql';
    host: string;
    port: number;
    user: string;
    password?: string;
    ssl?: boolean;
  };
  /** Display label (e.g. "user@host"). */
  connectionName: string;
  /** Databases available on the server. */
  databases: string[];
}

// ── Per-session state ────────────────────────────────────────────────────────

interface SessionState {
  sessionId: string;
  name: string;
  kind: string;
  schema: any[];
  capabilities: Capabilities | null;

  activeTableName: string | null;
  activeTableData: any[];
  activeQueryResults: any[];

  currentPage: number;
  pageSize: number;
  totalRows: number;
  isLoading: boolean;

  sortColumn: string | null;
  sortDirection: 'asc' | 'desc';
  searchTerm: string;
  filters: any[];

  visibleColumnsMap: Record<string, string[]>;
  showAllColumns: boolean;
  activeView: ActiveView;
}

function newSession(info: SessionInfo): SessionState {
  return {
    sessionId: info.sessionId,
    name: info.name,
    kind: info.kind,
    schema: [],
    capabilities: null,
    activeTableName: null,
    activeTableData: [],
    activeQueryResults: [],
    currentPage: 1,
    pageSize: 50,
    totalRows: 0,
    isLoading: false,
    sortColumn: null,
    sortDirection: 'asc',
    searchTerm: '',
    filters: [],
    visibleColumnsMap: {},
    showAllColumns: false,
    activeView: 'data',
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface StoreState {
  sessions: Record<string, SessionState>;
  activeSessionId: string | null;

  // ── Database-browser state (server connected, no DB selected yet) ────────
  browsingState: BrowsingState | null;
  setBrowsingState: (state: BrowsingState | null) => void;
  /** Connect to a specific database chosen from the browser. */
  connectToDatabase: (dbName: string) => Promise<void>;

  // ── Tab state ────────────────────────────────────────────────────────────
  tabs: Tab[];
  activeTabId: string | null;

  // ── Tab actions ──────────────────────────────────────────────────────────
  openTab: (tab: Tab) => void;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  pinTab: (tabId: string, pinned?: boolean) => void;
  markTabDirty: (tabId: string, dirty?: boolean) => void;
  openHomeTab: () => void;

  // ── Selectors (derived from active session) ──────────────────────────────
  activeSession: () => SessionState | null;

  // ── Session actions ──────────────────────────────────────────────────────
  /** Open the native SQLite file dialog and create a session. Throws on error. */
  openDialog: () => Promise<void>;
  /** Connect using an explicit config object. Throws on error. */
  openSession: (config: unknown, name: string) => Promise<void>;
  addSession: (info: SessionInfo) => void;
  removeSession: (sessionId: string) => Promise<void>;
  switchSession: (sessionId: string) => void;

  // ── Per-session actions (operate on activeSessionId) ─────────────────────
  refreshSchema: () => Promise<void>;
  refreshTableData: () => Promise<void>;

  setActiveTable: (tableName: string) => void;
  setActiveTableData: (data: any[]) => void;
  setActiveQueryResults: (results: any[]) => void;

  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setSort: (column: string | null, direction?: 'asc' | 'desc') => void;
  setSearchTerm: (term: string) => void;
  setFilters: (filters: any[]) => void;
  setVisibleColumns: (tableName: string, columns: string[]) => void;
  setShowAllColumns: (show: boolean) => void;
  setActiveView: (view: ActiveView) => void;

  // ── Legacy compat ─────────────────────────────────────────────────────────
  /** @deprecated use activeSession()?.sessionId */
  connectionString: string | null;
  /** @deprecated use activeSession()?.schema */
  schema: any[];
  activeTableName: string | null;
  activeTableData: any[];
  activeQueryResults: any[];
  currentPage: number;
  pageSize: number;
  totalRows: number;
  isLoading: boolean;
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc';
  searchTerm: string;
  filters: any[];
  visibleColumnsMap: Record<string, string[]>;
  showAllColumns: boolean;
  activeView: ActiveView;
}

const DEFAULT_VISIBLE_COUNT = 8;

export const useStore = create<StoreState>((set, get) => {

  // Helper: patch the active session's state + mirror flat compat fields.
  const patchActive = (patch: Partial<SessionState>) => {
    const { activeSessionId, sessions } = get();
    if (!activeSessionId) return;
    const updated = { ...sessions[activeSessionId], ...patch };
    set({ sessions: { ...sessions, [activeSessionId]: updated }, ...flatFrom(updated) });
  };

  // Derive flat compat fields from a session state.
  const flatFrom = (s: SessionState) => ({
    connectionString: s.sessionId,
    schema: s.schema,
    activeTableName: s.activeTableName,
    activeTableData: s.activeTableData,
    activeQueryResults: s.activeQueryResults,
    currentPage: s.currentPage,
    pageSize: s.pageSize,
    totalRows: s.totalRows,
    isLoading: s.isLoading,
    sortColumn: s.sortColumn,
    sortDirection: s.sortDirection,
    searchTerm: s.searchTerm,
    filters: s.filters,
    visibleColumnsMap: s.visibleColumnsMap,
    showAllColumns: s.showAllColumns,
    activeView: s.activeView,
  });

  // ── Tab helpers ────────────────────────────────────────────────────────────

  /** Pick the next activeTabId after removing `removedId`. */
  const nextTabId = (tabs: Tab[], removedId: string, currentId: string | null): string | null => {
    const remaining = tabs.filter(t => t.id !== removedId);
    if (remaining.length === 0) return null;
    if (currentId !== removedId) return currentId;
    const idx = tabs.findIndex(t => t.id === removedId);
    // prefer the tab to the left, fall back to the right
    return (remaining[Math.max(0, idx - 1)] ?? remaining[0]).id;
  };

  return {
    sessions: {},
    activeSessionId: null,

    // ── Database-browser state ───────────────────────────────────────────────
    browsingState: null,

    setBrowsingState: (state) => set({ browsingState: state }),

    connectToDatabase: async (dbName) => {
      const { browsingState, addSession, switchSession, refreshSchema, closeTab } = get();
      if (!browsingState) return;
      const { serverConfig, connectionName } = browsingState;
      const fullConfig = { ...serverConfig, database: dbName };
      const name = `${dbName}@${serverConfig.host}`;
      try {
        // Save this specific database connection, then open it
        const saved = await db.saveConnection(name, fullConfig, serverConfig.password);
        const result = await db.connectSaved(saved.id);
        // Clear browsing state before adding session so sidebar switches cleanly
        set({ browsingState: null });
        addSession({ sessionId: result.sessionId, name: result.name ?? name, kind: serverConfig.kind });
        switchSession(result.sessionId);
        // Close connections tab if open
        closeTab('connections');
        void connectionName; // used for display, kept in scope
        await refreshSchema();
      } catch (err: any) {
        throw new Error(err?.message ?? 'Failed to connect', { cause: err });
      }
    },

    // ── Tab initial state ────────────────────────────────────────────────────
    tabs: [],
    activeTabId: null,

    // ── Tab actions ──────────────────────────────────────────────────────────
    openTab: (tab) => {
      set(state => {
        const exists = state.tabs.find(t => t.id === tab.id);
        if (exists) {
          // Just switch to it
          return { activeTabId: tab.id };
        }
        return { tabs: [...state.tabs, tab], activeTabId: tab.id };
      });
    },

    closeTab: (tabId) => {
      set(state => {
        const nextId = nextTabId(state.tabs, tabId, state.activeTabId);
        const nextTabs = state.tabs.filter(t => t.id !== tabId);
        return { tabs: nextTabs, activeTabId: nextId };
      });
    },

    switchTab: (tabId) => {
      const { tabs, sessions } = get();
      const tab = tabs.find(t => t.id === tabId);
      if (!tab) return;
      if (tab.kind === 'session') {
        const session = sessions[tab.sessionId];
        if (session) {
          set({ activeTabId: tabId, activeSessionId: tab.sessionId, ...flatFrom(session) });
          return;
        }
      }
      set({ activeTabId: tabId });
    },

    reorderTabs: (fromIndex, toIndex) => {
      set(state => {
        const tabs = [...state.tabs];
        const [moved] = tabs.splice(fromIndex, 1);
        tabs.splice(toIndex, 0, moved);
        return { tabs };
      });
    },

    pinTab: (tabId, pinned = true) => {
      set(state => ({
        tabs: state.tabs.map(t => t.id === tabId ? { ...t, pinned } : t),
      }));
    },

    markTabDirty: (tabId, dirty = true) => {
      set(state => ({
        tabs: state.tabs.map(t => t.id === tabId ? { ...t, dirty } : t),
      }));
    },

    openHomeTab: () => {
      set(state => {
        const existing = state.tabs.find(t => t.id === 'home');
        if (existing) {
          return { activeTabId: 'home' };
        }
        const homeTab: HomeTab = {
          kind: 'home',
          id: 'home',
          title: 'Home',
          pinned: false,
          dirty: false,
        };
        return { tabs: [...state.tabs, homeTab], activeTabId: 'home' };
      });
    },

    // flat compat defaults
    connectionString: null,
    schema: [],
    activeTableName: null,
    activeTableData: [],
    activeQueryResults: [],
    currentPage: 1,
    pageSize: 50,
    totalRows: 0,
    isLoading: false,
    sortColumn: null,
    sortDirection: 'asc',
    searchTerm: '',
    filters: [],
    visibleColumnsMap: {},
    showAllColumns: false,
    activeView: 'data' as ActiveView,

    activeSession: () => {
      const { activeSessionId, sessions } = get();
      return activeSessionId ? sessions[activeSessionId] ?? null : null;
    },

    // ── Session actions ────────────────────────────────────────────────────

    openDialog: async () => {
      const result = await db.openDialog();
      if (!result) return;
      if (!result.ok) throw new Error(result.error ?? 'Failed to open database');
      const info: SessionInfo = { sessionId: result.sessionId!, name: result.name!, kind: 'sqlite' };
      get().addSession(info);
      get().switchSession(result.sessionId!);
      await get().refreshSchema();
    },

    openSession: async (config: unknown, name: string) => {
      const result = await db.openSession(config, name);
      if (!result.ok) throw new Error(result.error ?? 'Failed to connect');
      const kind = (config as any).kind ?? 'unknown';
      const info: SessionInfo = { sessionId: result.sessionId!, name, kind };
      get().addSession(info);
      get().switchSession(result.sessionId!);
      await get().refreshSchema();
    },

    addSession: (info) => {
      const session = newSession(info);
      set(state => ({ sessions: { ...state.sessions, [info.sessionId]: session } }));
      // Auto-open a session tab
      const tab: SessionTab = {
        kind: 'session',
        id: info.sessionId,
        sessionId: info.sessionId,
        title: info.name,
        dbKind: info.kind,
        pinned: false,
        dirty: false,
      };
      get().openTab(tab);
    },

    removeSession: async (sessionId) => {
      await db.closeSession(sessionId);
      const { sessions, tabs, activeTabId } = get();
      const next = { ...sessions };
      delete next[sessionId];

      // Close the corresponding tab and derive next tab
      const nextTabIdVal = nextTabId(tabs, sessionId, activeTabId);
      const nextTabs = tabs.filter(t => t.id !== sessionId);

      // Determine next active session from remaining session tabs
      const nextSessionTab = nextTabs.find((t): t is SessionTab => t.kind === 'session');
      const nextActive = nextSessionTab?.sessionId ?? null;

      const flat = nextActive ? flatFrom(next[nextActive]) : {
        connectionString: null, schema: [], activeTableName: null,
        activeTableData: [], activeQueryResults: [], currentPage: 1,
        pageSize: 50, totalRows: 0, isLoading: false, sortColumn: null,
        sortDirection: 'asc' as const, searchTerm: '', filters: [],
        visibleColumnsMap: {}, showAllColumns: false, activeView: 'data' as ActiveView,
      };
      set({ sessions: next, activeSessionId: nextActive, tabs: nextTabs, activeTabId: nextTabIdVal, ...flat });
    },

    switchSession: (sessionId) => {
      const { sessions } = get();
      const session = sessions[sessionId];
      if (!session) return;
      set({ activeSessionId: sessionId, activeTabId: sessionId, ...flatFrom(session) });
    },

    // ── Per-session actions ────────────────────────────────────────────────

    refreshSchema: async () => {
      const { activeSessionId } = get();
      if (!activeSessionId) return;
      patchActive({ isLoading: true });
      const [schema, caps] = await Promise.all([
        db.getSchema(activeSessionId),
        db.capabilities(activeSessionId),
      ]);
      patchActive({
        schema,
        capabilities: caps,
        isLoading: false,
        activeTableName: null,
        activeTableData: [],
        currentPage: 1,
        totalRows: 0,
        sortColumn: null,
        sortDirection: 'asc',
        searchTerm: '',
        visibleColumnsMap: {},
        showAllColumns: false,
      });
    },

    refreshTableData: async () => {
      const { activeSessionId, sessions } = get();
      if (!activeSessionId) return;
      const s = sessions[activeSessionId];
      if (!s.activeTableName) return;
      patchActive({ isLoading: true });
      const offset = (s.currentPage - 1) * s.pageSize;
      const search = s.searchTerm.trim() || undefined;
      const [data, count] = await Promise.all([
        db.getTableData(activeSessionId, s.activeTableName, {
          limit: s.pageSize,
          offset,
          sortColumn: s.sortColumn ?? undefined,
          sortDirection: s.sortDirection,
          search,
          filters: s.filters,
        }),
        db.getTableRowCount(activeSessionId, s.activeTableName, search, s.filters),
      ]);
      patchActive({ activeTableData: data, totalRows: count, isLoading: false });
    },

    setActiveTable: (tableName) => {
      const { activeSessionId, sessions } = get();
      if (!activeSessionId) return;
      const s = sessions[activeSessionId];
      const patch: Partial<SessionState> = {
        activeView: 'data',
        activeTableName: tableName,
        currentPage: 1,
        totalRows: 0,
        sortColumn: null,
        sortDirection: 'asc',
        searchTerm: '',
        filters: [],
        showAllColumns: false,
      };
      // Initialise default visible columns
      if (!s.visibleColumnsMap[tableName]) {
        const tableDef = s.schema.find(t => t.name === tableName);
        if (tableDef) {
          const allCols: string[] = tableDef.columns.map((c: any) => c.name);
          patch.visibleColumnsMap = { ...s.visibleColumnsMap, [tableName]: allCols.slice(0, DEFAULT_VISIBLE_COUNT) };
        }
      }
      patchActive(patch);
      get().refreshTableData();
    },

    setActiveTableData: (data) => patchActive({ activeTableData: data }),
    setActiveQueryResults: (results) => patchActive({ activeQueryResults: results }),

    setPage: (page) => {
      patchActive({ currentPage: page });
      get().refreshTableData();
    },
    setPageSize: (size) => {
      patchActive({ pageSize: size, currentPage: 1 });
      get().refreshTableData();
    },
    setSort: (column, direction) => {
      const s = get().activeSession();
      if (!s) return;
      if (column === s.sortColumn) {
        if (s.sortDirection === 'asc') {
          patchActive({ sortDirection: 'desc', currentPage: 1 });
        } else {
          patchActive({ sortColumn: null, sortDirection: 'asc', currentPage: 1 });
        }
      } else {
        patchActive({ sortColumn: column, sortDirection: direction ?? 'asc', currentPage: 1 });
      }
      get().refreshTableData();
    },
    setSearchTerm: (term) => {
      patchActive({ searchTerm: term, currentPage: 1 });
      get().refreshTableData();
    },
    setFilters: (filters) => {
      patchActive({ filters, currentPage: 1 });
      get().refreshTableData();
    },
    setVisibleColumns: (tableName, columns) => {
      const s = get().activeSession();
      if (!s) return;
      patchActive({ visibleColumnsMap: { ...s.visibleColumnsMap, [tableName]: columns } });
    },
    setShowAllColumns: (show) => patchActive({ showAllColumns: show }),
    setActiveView: (view) => patchActive({ activeView: view }),
  };
});
