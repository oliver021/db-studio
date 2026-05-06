/* eslint-disable @typescript-eslint/no-explicit-any */
import './App.css';
import { useState, useRef, useEffect } from 'react';
import { useStore } from './store/useStore';
import { Search, Columns3, Zap, Filter } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

// Hooks & Utils
import { useToast } from './hooks/useToast';
import { getPrimaryKey } from './utils/db';
import * as dbClient from './services/dbClient';

// Components
import Sidebar from './components/Layout/Sidebar';
import Breadcrumbs from './components/Layout/Breadcrumbs';
import DataTable from './components/DataTable/DataTable';
import Pagination from './components/DataTable/Pagination';
import EmptyState from './components/UI/EmptyState';
import StatusBar from './components/Layout/StatusBar';
import ConfirmDialog from './components/UI/ConfirmDialog';
import ColumnPicker from './components/DataTable/ColumnPicker';
import ToastContainer from './components/UI/ToastContainer';
import QueryConsole from './components/QueryConsole/QueryConsole';
import SchemaGraph from './components/SchemaGraph/SchemaGraph';
import FilterModal from './components/DataTable/FilterModal';
import MaintenanceView from './components/Maintenance/MaintenanceView';
import ConnectionManager from './components/Connections/ConnectionManager';

export default function App() {
  const {
    activeSessionId, activeSession,
    openDialog,
    addSession, switchSession, refreshSchema,
    activeTableName, setActiveTable, activeTableData,
    currentPage, pageSize, totalRows,
    setPage, setPageSize, isLoading,
    sortColumn, sortDirection, setSort,
    searchTerm, setSearchTerm,
    filters, setFilters,
    visibleColumnsMap, setVisibleColumns, showAllColumns, setShowAllColumns,
    activeView, setActiveView,
  } = useStore();

  const session = activeSession();
  const schema = session?.schema ?? [];
  const capabilities = session?.capabilities ?? null;

  const { toasts, push: toast } = useToast();

  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [editCell, setEditCell] = useState<{ rowIdx: number; col: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ pkCol: string; pkVal: any; label: string } | null>(null);
  const searchTimerRef = useRef<any>(null);
  const [localSearch, setLocalSearch] = useState('');

  const tables   = schema.filter((t: any) => t.type === 'table');
  const views    = schema.filter((t: any) => t.type === 'view');
  const tableDef = schema.find((t: any) => t.name === activeTableName);
  const allCols: any[] = tableDef?.columns ?? [];
  const allColNames = allCols.map((c: any) => c.name);
  const pkCol = getPrimaryKey(allCols);

  const visibleNames = showAllColumns
    ? allColNames
    : (visibleColumnsMap[activeTableName ?? ''] ?? allColNames.slice(0, 8));
  const visibleCols = allCols.filter((c: any) => visibleNames.includes(c.name));

   
  useEffect(() => { setLocalSearch(searchTerm); }, [activeTableName, searchTerm]);

  // Guard: if activeView is 'maintenance' but engine doesn't support it, fall back to 'data'
  useEffect(() => {
    if (activeView === 'maintenance' && capabilities && !capabilities.hasMaintenance) {
      setActiveView('data');
    }
  }, [activeView, capabilities, setActiveView]);

  const handleOpenDialog = async () => {
    await openDialog();
  };

  const handleConnected = (sessionId: string, name: string, kind: string) => {
    addSession({ sessionId, name, kind });
    switchSession(sessionId);
    refreshSchema();
  };

  const handleSearchChange = (value: string) => {
    setLocalSearch(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setSearchTerm(value), 350);
  };

  const startEdit = (rowIdx: number, col: string, currentValue: any) => {
    setEditCell({ rowIdx, col });
    setEditValue(currentValue != null ? String(currentValue) : '');
  };

  const commitEdit = async () => {
    if (!editCell || !activeTableName || !pkCol || !activeSessionId) return;
    const row = activeTableData[editCell.rowIdx];
    const pkVal = row[pkCol];
    const newVal = editValue === '' ? null : editValue;
    const result = await dbClient.updateRow(activeSessionId, activeTableName, pkCol, pkVal, { [editCell.col]: newVal });
    setEditCell(null);
    if (result.success) {
      toast('Row updated', 'success');
      useStore.getState().refreshTableData();
    } else {
      toast(result.error || 'Update failed', 'error');
    }
  };

  const handleCopyRow = (row: any) => {
    navigator.clipboard.writeText(JSON.stringify(row, null, 2));
    toast('Row copied to clipboard', 'info');
  };

  const handleDeleteRow = async () => {
    if (!deleteTarget || !activeTableName || !activeSessionId) return;
    const result = await dbClient.deleteRow(activeSessionId, activeTableName, deleteTarget.pkCol, deleteTarget.pkVal);
    setDeleteTarget(null);
    if (result.success) {
      toast('Row deleted', 'success');
      useStore.getState().refreshTableData();
    } else {
      toast(result.error || 'Delete failed', 'error');
    }
  };

  return (
    <div className="app-shell">
      <Sidebar
        connectionString={activeSessionId}
        connectionName={session?.name}
        capabilities={capabilities}
        onOpenDatabase={handleOpenDialog}
        activeView={activeView}
        onViewChange={setActiveView}
        tables={tables}
        views={views}
        activeTableName={activeTableName}
        onTableSelect={setActiveTable}
      />

      <main className="main-content">
        <header className="toolbar">
          <Breadcrumbs
            connectionString={activeSessionId}
            activeView={activeView}
            activeTableName={activeTableName}
          />
        </header>

        <div className="content-area">
          <AnimatePresence mode="wait">
            {activeView === 'query' ? (
              <motion.div
                key="query-console"
                className="table-view"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <QueryConsole />
              </motion.div>
            ) : activeView === 'schema-graph' ? (
              <motion.div
                key="schema-graph"
                className="table-view"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <SchemaGraph />
              </motion.div>
            ) : activeView === 'maintenance' && capabilities?.hasMaintenance ? (
              <motion.div
                key="maintenance"
                className="table-view"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <MaintenanceView />
              </motion.div>
            ) : activeTableName ? (
              <motion.div
                key={activeTableName}
                className="table-view"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <div className="table-info-bar">
                  <h2 className="table-title">{activeTableName}</h2>
                  <div className="table-meta">
                    <span className="row-count">
                      <Zap size={13} /> {totalRows.toLocaleString()} rows
                    </span>
                  </div>
                </div>

                <div className="table-toolbar">
                  <div className="search-box">
                    <Search size={14} />
                    <input
                      className="search-input"
                      placeholder="Search across all columns…"
                      value={localSearch}
                      onChange={e => handleSearchChange(e.target.value)}
                    />
                  </div>

                  <div className="col-picker-anchor">
                    <button
                      className={`icon-btn${colPickerOpen ? ' active' : ''}`}
                      title="Toggle columns"
                      onClick={() => setColPickerOpen(o => !o)}
                    >
                      <Columns3 size={15} />
                    </button>
                    {colPickerOpen && (
                      <ColumnPicker
                        allColumns={allColNames}
                        visible={visibleNames}
                        onChange={cols => {
                          if (activeTableName) setVisibleColumns(activeTableName, cols);
                          setShowAllColumns(false);
                        }}
                        onClose={() => setColPickerOpen(false)}
                      />
                    )}
                  </div>

                  <button
                    className={`icon-btn${filters.length > 0 ? ' active' : ''}`}
                    title="Advanced Filters"
                    onClick={() => setFilterModalOpen(true)}
                  >
                    <Filter size={15} />
                    {filters.length > 0 && <span className="btn-badge">{filters.length}</span>}
                  </button>
                </div>

                {filterModalOpen && activeTableName && (
                  <FilterModal
                    columns={tableDef?.columns || []}
                    filters={filters}
                    onApply={(newFilters) => {
                      setFilters(newFilters);
                      setFilterModalOpen(false);
                    }}
                    onClose={() => setFilterModalOpen(false)}
                  />
                )}

                <DataTable
                  isLoading={isLoading}
                  columns={visibleCols}
                  data={activeTableData}
                  pkCol={pkCol}
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  searchTerm={searchTerm}
                  onSort={setSort}
                  editCell={editCell}
                  editValue={editValue}
                  onStartEdit={startEdit}
                  onEditValueChange={setEditValue}
                  onCommitEdit={commitEdit}
                  onCancelEdit={() => setEditCell(null)}
                  onCopyRow={handleCopyRow}
                  onDeleteRow={(row) => setDeleteTarget({
                    pkCol: pkCol!,
                    pkVal: row[pkCol!],
                    label: `${pkCol} = ${row[pkCol!]}`,
                  })}
                />

                <Pagination
                  currentPage={currentPage}
                  pageSize={pageSize}
                  totalRows={totalRows}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                />
              </motion.div>
            ) : !activeSessionId ? (
              <motion.div
                key="connection-manager"
                className="empty-state"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2 }}
              >
                <ConnectionManager
                  onConnected={handleConnected}
                  onOpenDialog={handleOpenDialog}
                />
              </motion.div>
            ) : (
              <EmptyState />
            )}
          </AnimatePresence>
        </div>

        <StatusBar
          connectionString={activeSessionId}
          activeTableName={activeTableName}
          visibleColsCount={visibleCols.length}
          allColsCount={allCols.length}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
        />
      </main>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Row"
          description={
            <>
              Are you sure you want to delete the row where{' '}
              <span className="modal-highlight">{deleteTarget.label}</span>?
              This action cannot be undone.
            </>
          }
          confirmLabel="Delete"
          onConfirm={handleDeleteRow}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <ToastContainer toasts={toasts} />
    </div>
  );
}
