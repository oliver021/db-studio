import { useState, useRef, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import type { OnMount } from '@monaco-editor/react';
import { useStore } from '../../store/useStore';
import { useShallow } from 'zustand/react/shallow';
import { Play, Trash2, History, Clock, Table2, CheckCircle } from 'lucide-react';

import { THEMES, SQLITENAV_THEME, MIDNIGHT_THEME } from '../../config/editorThemes';
import { useQueryExecution } from '../../hooks/useQueryExecution';
import { createSqlCompletionProvider } from '../../utils/sqlAutocompletion';
import { useSettingsStore } from '../../store/useSettingsStore';
import * as dbClient from '../../services/dbClient';

import QueryResults from './QueryResults';
import QueryHistory from './QueryHistory';
import QueryPlanRenderer from './QueryPlanRenderer';
import './QueryConsole.css';

export default function QueryConsole() {
  const { activeSessionId, activeSession } = useStore(useShallow(s => ({
    activeSessionId: s.activeSessionId,
    activeSession: s.activeSession,
  })));
  const session = activeSession();
  const schema = session?.schema ?? [];
  const capabilities = session?.capabilities ?? null;
  const dialect = capabilities?.dialect ?? 'sqlite';

  const {
    results, writeInfo, error, isRunning, execTime, history,
    execute, clear,
  } = useQueryExecution();

  const [inTransaction, setInTransaction] = useState(false);
  const [queryPlan, setQueryPlan] = useState<any[] | null>(null);
  const [isAutoCommit, setIsAutoCommit] = useState(true);

  const editorSettings = useSettingsStore(s => s.settings.editor);
  const globalTheme    = useSettingsStore(s => s.settings.appearance.editorTheme);

  const [sql, setSql] = useState(editorSettings.defaultSql);
  const [theme, setTheme] = useState<string>(globalTheme);
  const [tab, setTab] = useState<'results' | 'history'>('results');
  const [splitRatio, setSplitRatio] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const runQuery = useCallback(async () => {
    const query = editorRef.current?.getValue()?.trim();
    if (!query || !activeSessionId) return;

    if (!isAutoCommit && !inTransaction) {
      await dbClient.beginTransaction(activeSessionId);
      setInTransaction(true);
    }

    setTab('results');
    setQueryPlan(null);
    execute(query);
  }, [execute, isAutoCommit, inTransaction, activeSessionId]);

  const analyzeQuery = async () => {
    const query = editorRef.current?.getValue()?.trim();
    if (!query || !activeSessionId || !capabilities?.supportsExplain) return;
    try {
      const plan = await dbClient.explainQueryPlan(activeSessionId, query);
      setQueryPlan(plan);
      setTab('results');
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleCommit = async () => {
    if (!activeSessionId) return;
    await dbClient.commitTransaction(activeSessionId);
    setInTransaction(false);
  };

  const handleRollback = async () => {
    if (!activeSessionId) return;
    await dbClient.rollbackTransaction(activeSessionId);
    setInTransaction(false);
  };

  const handleClear = () => {
    editorRef.current?.setValue('');
    setSql('');
    clear();
  };

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    monacoRef.current?.editor.setTheme(newTheme);
  };

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    monaco.editor.defineTheme('sqlitenav-dark', SQLITENAV_THEME);
    monaco.editor.defineTheme('midnight', MIDNIGHT_THEME);
    monaco.editor.setTheme(theme);

    editor.addAction({
      id: 'run-query',
      label: 'Run Query',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: runQuery,
    });

    const completionProvider = monaco.languages.registerCompletionItemProvider(
      'sql',
      createSqlCompletionProvider(schema as any, dialect),
    );
    return () => completionProvider.dispose();
  };

  // Sync editor options when settings change
  useEffect(() => {
    editorRef.current?.updateOptions({
      fontSize:    editorSettings.fontSize,
      fontFamily:  editorSettings.fontFamily,
      tabSize:     editorSettings.tabSize,
      wordWrap:    editorSettings.wordWrap ? 'on' : 'off',
      lineNumbers: editorSettings.lineNumbers ? 'on' : 'off',
      minimap:     { enabled: editorSettings.minimap },
    });
  }, [editorSettings]);

  // Sync global theme change into this console
  useEffect(() => {
    setTheme(globalTheme);
    monacoRef.current?.editor.setTheme(globalTheme);
  }, [globalTheme]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = ((e.clientY - rect.top) / rect.height) * 100;
      setSplitRatio(Math.max(20, Math.min(80, ratio)));
    };
    const onUp = () => {
      dragging.current = false;
      setIsDragging(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const showExplain = capabilities?.supportsExplain ?? false;
  const showTransactions = capabilities?.supportsTransactions ?? false;

  return (
    <div className="query-console" ref={containerRef}>
      <div className="qc-editor-section" style={{ height: `${splitRatio}%` }}>
        <div className="qc-toolbar">
          <button className="qc-run-btn" onClick={runQuery} disabled={isRunning}>
            <Play size={13} />
            {isRunning ? 'Running…' : 'Run'}
          </button>

          {showExplain && (
            <button className="qc-secondary-btn" onClick={analyzeQuery} title="Explain Query Plan">
              Analyze
            </button>
          )}

          {showTransactions && (
            <>
              <div className="qc-divider-v" />
              <div className="qc-transaction-toggle" title="Auto-commit mode">
                <input
                  type="checkbox"
                  id="autocommit"
                  checked={isAutoCommit}
                  onChange={e => {
                    setIsAutoCommit(e.target.checked);
                    if (e.target.checked && inTransaction) handleCommit();
                  }}
                />
                <label htmlFor="autocommit">Auto-commit</label>
              </div>

              {inTransaction && (
                <div className="qc-transaction-actions">
                  <button className="qc-commit-btn" onClick={handleCommit}>Commit</button>
                  <button className="qc-rollback-btn" onClick={handleRollback}>Rollback</button>
                </div>
              )}
            </>
          )}

          <div className="qc-spacer" />

          <select
            className="qc-theme-select"
            value={theme}
            onChange={e => handleThemeChange(e.target.value)}
          >
            {THEMES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          <button className="qc-clear-btn" onClick={handleClear}>
            <Trash2 size={12} /> Clear
          </button>
        </div>

        <div className="qc-editor-wrapper">
          <Editor
            defaultLanguage="sql"
            defaultValue={sql}
            theme={theme}
            onChange={v => setSql(v ?? '')}
            onMount={handleEditorMount}
            options={{
              minimap:     { enabled: editorSettings.minimap },
              fontSize:    editorSettings.fontSize,
              fontFamily:  editorSettings.fontFamily,
              tabSize:     editorSettings.tabSize,
              wordWrap:    editorSettings.wordWrap ? 'on' : 'off',
              lineNumbers: editorSettings.lineNumbers ? 'on' : 'off',
              lineHeight: 22,
              padding: { top: 12, bottom: 12 },
              scrollBeyondLastLine: false,
              renderLineHighlight: 'line',
              suggestOnTriggerCharacters: true,
              quickSuggestions: true,
              automaticLayout: true,
              scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            }}
          />
        </div>
      </div>

      <div
        className={`qc-divider${isDragging ? ' dragging' : ''}`}
        onMouseDown={() => {
          dragging.current = true;
          setIsDragging(true);
        }}
      />

      <div className="qc-results-section" style={{ height: `${100 - splitRatio}%` }}>
        <div className="qc-results-header">
          <button
            className={`qc-tab${tab === 'results' ? ' active' : ''}`}
            onClick={() => setTab('results')}
          >
            Results
          </button>
          <button
            className={`qc-tab${tab === 'history' ? ' active' : ''}`}
            onClick={() => setTab('history')}
          >
            <History size={11} /> History
          </button>

          <div className="qc-spacer" />

          {execTime != null && (
            <span className="qc-results-badge time">
              <Clock size={11} /> {execTime < 1 ? '<1' : Math.round(execTime)}ms
            </span>
          )}
          {results && (
            <span className="qc-results-badge rows">
              <Table2 size={11} /> {results.length} rows
            </span>
          )}
          {writeInfo && (
            <span className="qc-results-badge success">
              <CheckCircle size={11} /> {writeInfo.changes ?? 0} affected
            </span>
          )}
        </div>

        <div className="qc-results-body">
          {tab === 'history' ? (
            <QueryHistory
              history={history}
              onSelect={(h) => {
                editorRef.current?.setValue(h);
                setTab('results');
              }}
            />
          ) : queryPlan ? (
            <QueryPlanRenderer plan={queryPlan} dialect={dialect} />
          ) : (
            <QueryResults results={results} writeInfo={writeInfo} error={error} />
          )}
        </div>
      </div>
    </div>
  );
}
