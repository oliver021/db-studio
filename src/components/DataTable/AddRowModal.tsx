/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { X } from 'lucide-react';
import * as dbClient from '../../services/dbClient';
import { getInputTypeForColumnType, validateRowData } from '../../utils/db';
import { useToast } from '../../hooks/useToast';
import './AddRowModal.css';

interface AddRowModalProps {
  sessionId: string;
  tableName: string;
  columns: any[];
  onInserted: () => void;
  onClose: () => void;
}

export default function AddRowModal({
  sessionId,
  tableName,
  columns,
  onInserted,
  onClose,
}: AddRowModalProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { push: toast } = useToast();

  const handleFieldChange = (colName: string, value: any) => {
    setFormData(prev => ({ ...prev, [colName]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    const validation = validateRowData(columns, formData);
    if (!validation.valid) {
      toast(validation.error || 'Validation failed', 'error');
      return;
    }

    // Convert form data to proper types and handle NULL
    const data: Record<string, unknown> = {};
    for (const col of columns) {
      const value = formData[col.name];

      // Empty string means NULL for optional fields
      if (value === '' || value === null) {
        data[col.name] = col.notNull ? null : null;
        continue;
      }

      // Type conversion based on column type
      const inputType = getInputTypeForColumnType(col.type);
      if (inputType === 'number') {
        data[col.name] = value !== '' ? Number(value) : null;
      } else if (inputType === 'checkbox') {
        data[col.name] = Boolean(value);
      } else if (inputType === 'date' || inputType === 'datetime-local') {
        data[col.name] = value || null;
      } else {
        data[col.name] = value;
      }
    }

    setIsSubmitting(true);
    try {
      const result = await dbClient.insertRow(sessionId, tableName, data);
      if (result.success) {
        toast('Row inserted', 'success');
        onInserted();
      } else {
        toast(result.error || 'Failed to insert row', 'error');
      }
    } catch (err: any) {
      toast(err.message || 'Failed to insert row', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="add-row-overlay" onClick={onClose}>
      <div className="add-row-modal" onClick={e => e.stopPropagation()}>
        <div className="add-row-header">
          <h2 className="add-row-title">Add Row to {tableName}</h2>
          <button
            className="add-row-close"
            onClick={onClose}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="add-row-form">
          <div className="form-fields">
            {columns.map(col => {
              const inputType = getInputTypeForColumnType(col.type);
              const value = formData[col.name];
              const isOptional = !col.notNull;

              return (
                <div key={col.name} className="form-group">
                  <label className="form-label">
                    {col.name}
                    {col.type && <span className="type-badge">{col.type}</span>}
                    {isOptional && <span className="optional-label">(optional)</span>}
                  </label>

                  {inputType === 'disabled' ? (
                    <div className="form-disabled-notice">
                      Cannot edit {col.type} data
                    </div>
                  ) : inputType === 'checkbox' ? (
                    <input
                      type="checkbox"
                      className="form-checkbox"
                      checked={Boolean(value)}
                      onChange={e => handleFieldChange(col.name, e.target.checked)}
                    />
                  ) : inputType === 'textarea' ? (
                    <textarea
                      className="form-textarea"
                      value={String(value ?? '')}
                      onChange={e => handleFieldChange(col.name, e.target.value)}
                      placeholder={col.defaultValue ?? ''}
                      rows={4}
                    />
                  ) : (
                    <input
                      type={inputType}
                      className="form-input"
                      value={String(value ?? '')}
                      onChange={e => handleFieldChange(col.name, e.target.value)}
                      placeholder={col.defaultValue ? String(col.defaultValue) : ''}
                      step={inputType === 'number' && col.type?.toUpperCase().includes('FLOAT') ? '0.01' : undefined}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="form-actions">
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving…' : 'Save'}
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
