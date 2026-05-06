/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import * as dbClient from '../../services/dbClient';
import { generateCreateTableSQL, type ColumnDef } from '../../utils/sqlGeneration';
import { useToast } from '../../hooks/useToast';
import './TableDesign.css';

const COLUMN_TYPES = [
  'TEXT',
  'INTEGER',
  'REAL',
  'BOOLEAN',
  'DATE',
  'BLOB',
  'JSON',
  'VARCHAR',
  'DECIMAL',
];

interface TableDesignModalProps {
  sessionId: string;
  dbKind: string;
  onCreated: () => void;
  onClose: () => void;
}

export default function TableDesignModal({
  sessionId,
  dbKind,
  onCreated,
  onClose,
}: TableDesignModalProps) {
  const [tableName, setTableName] = useState('');
  const [columns, setColumns] = useState<ColumnDef[]>([
    { id: '1', name: 'id', type: 'INTEGER', primaryKey: true },
  ]);
  const [sqlPreview, setSqlPreview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { push: toast } = useToast();

  // Generate SQL preview whenever table or columns change
  useEffect(() => {
    try {
      if (tableName && columns.length > 0) {
        const sql = generateCreateTableSQL(tableName, columns, dbKind);
        setSqlPreview(sql);
        setError('');
      } else {
        setSqlPreview('');
      }
    } catch (err: any) {
      setError(err.message);
      setSqlPreview('');
    }
  }, [tableName, columns, dbKind]);

  const handleAddColumn = () => {
    const newId = String(Date.now());
    setColumns([
      ...columns,
      {
        id: newId,
        name: `column${columns.length + 1}`,
        type: 'TEXT',
        notNull: false,
        primaryKey: false,
        unique: false,
      },
    ]);
  };

  const handleRemoveColumn = (id: string) => {
    if (columns.length > 1) {
      setColumns(columns.filter(c => c.id !== id));
    }
  };

  const handleColumnChange = (id: string, field: keyof ColumnDef, value: any) => {
    setColumns(columns.map(col =>
      col.id === id ? { ...col, [field]: value } : col
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tableName.trim()) {
      toast('Table name is required', 'error');
      return;
    }

    if (columns.length === 0) {
      toast('At least one column is required', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const sql = generateCreateTableSQL(tableName, columns, dbKind);
      await dbClient.createTable(sessionId, sql);
      toast('Table created successfully', 'success');
      onCreated();
    } catch (err: any) {
      toast(err.message || 'Failed to create table', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="table-design-overlay" onClick={onClose}>
      <div className="table-design-modal" onClick={e => e.stopPropagation()}>
        <div className="table-design-header">
          <h2 className="table-design-title">Design Table</h2>
          <button
            className="table-design-close"
            onClick={onClose}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="table-design-form">
          {error && (
            <div className="table-design-error">
              <p>{error}</p>
            </div>
          )}

          <div className="design-section">
            <label className="design-label">Table Name</label>
            <input
              type="text"
              className="design-input"
              value={tableName}
              onChange={e => setTableName(e.target.value)}
              placeholder="table_name"
              autoFocus
            />
          </div>

          <div className="design-section">
            <div className="design-section-header">
              <h3 className="design-section-title">Columns</h3>
              <button
                type="button"
                className="add-column-btn"
                onClick={handleAddColumn}
              >
                <Plus size={14} />
                Add Column
              </button>
            </div>

            <div className="columns-container">
              {/* Header row */}
              <div className="column-header-row">
                <span className="col-header-label">#</span>
                <span className="col-header-label left">Name</span>
                <span className="col-header-label">Type</span>
                <span className="col-header-label">PK</span>
                <span className="col-header-label">NN</span>
                <span className="col-header-label">UQ</span>
                <span className="col-header-label">Default</span>
                <span className="col-header-label"></span>
              </div>

              {columns.map((col, idx) => (
                <div key={col.id} className="column-row">
                  <div className="column-index">{idx + 1}</div>

                  <input
                    type="text"
                    className="column-input column-name"
                    value={col.name}
                    onChange={e => handleColumnChange(col.id, 'name', e.target.value)}
                    placeholder="column_name"
                    title="Column name"
                  />

                  <select
                    className="column-input column-type"
                    value={col.type}
                    onChange={e => handleColumnChange(col.id, 'type', e.target.value)}
                    title="Column type"
                  >
                    {COLUMN_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>

                  <label className="column-checkbox" title="Primary Key">
                    <input
                      type="checkbox"
                      checked={col.primaryKey || false}
                      onChange={e => handleColumnChange(col.id, 'primaryKey', e.target.checked)}
                    />
                    <span>PK</span>
                  </label>

                  <label className="column-checkbox" title="Not Null">
                    <input
                      type="checkbox"
                      checked={col.notNull || false}
                      onChange={e => handleColumnChange(col.id, 'notNull', e.target.checked)}
                    />
                    <span>NN</span>
                  </label>

                  <label className="column-checkbox" title="Unique">
                    <input
                      type="checkbox"
                      checked={col.unique || false}
                      onChange={e => handleColumnChange(col.id, 'unique', e.target.checked)}
                    />
                    <span>U</span>
                  </label>

                  <input
                    type="text"
                    className="column-input column-default"
                    value={col.defaultValue || ''}
                    onChange={e => handleColumnChange(col.id, 'defaultValue', e.target.value)}
                    placeholder="DEFAULT"
                    title="Default value"
                  />

                  <button
                    type="button"
                    className="column-delete-btn"
                    onClick={() => handleRemoveColumn(col.id)}
                    disabled={columns.length === 1}
                    title="Delete column"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="design-section">
            <label className="design-label">SQL Preview</label>
            <textarea
              className="sql-preview-textarea"
              value={sqlPreview}
              readOnly
              rows={10}
            />
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting || !tableName || !!error}
            >
              {isSubmitting ? 'Creating…' : 'Create Table'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
