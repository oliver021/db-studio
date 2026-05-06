/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import * as db from '../services/dbClient';

// ── Types ────────────────────────────────────────────────────────────────────

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

  return {
    sessions: {},
    activeSessionId: null,

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
      const info: SessionInfo = { sessionId: result.sessionId, name: result.name, kind: 'sqlite' };
      get().addSession(info);
      get().switchSession(result.sessionId);
      await get().refreshSchema();
    },

    openSession: async (config: unknown, name: string) => {
      const result = await db.openSession(config, name);
      if (!result.ok) throw new Error(result.error ?? 'Failed to connect');
      const kind = (config as any).kind ?? 'unknown';
      const info: SessionInfo = { sessionId: result.sessionId, name, kind };
      get().addSession(info);
      get().switchSession(result.sessionId);
      await get().refreshSchema();
    },

    addSession: (info) => {
      const session = newSession(info);
      set(state => ({ sessions: { ...state.sessions, [info.sessionId]: session } }));
    },

    removeSession: async (sessionId) => {
      await db.closeSession(sessionId);
      const { sessions, activeSessionId } = get();
      const next = { ...sessions };
      delete next[sessionId];
      const nextActive = activeSessionId === sessionId
        ? (Object.keys(next)[0] ?? null)
        : activeSessionId;
      const flat = nextActive ? flatFrom(next[nextActive]) : {
        connectionString: null, schema: [], activeTableName: null,
        activeTableData: [], activeQueryResults: [], currentPage: 1,
        pageSize: 50, totalRows: 0, isLoading: false, sortColumn: null,
        sortDirection: 'asc' as const, searchTerm: '', filters: [],
        visibleColumnsMap: {}, showAllColumns: false, activeView: 'data' as ActiveView,
      };
      set({ sessions: next, activeSessionId: nextActive, ...flat });
    },

    switchSession: (sessionId) => {
      const { sessions } = get();
      const session = sessions[sessionId];
      if (!session) return;
      set({ activeSessionId: sessionId, ...flatFrom(session) });
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
