import { useState, useEffect } from 'react';
import {
  ShieldCheck, Zap, HardDrive, FileText, CheckCircle, AlertTriangle,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import * as dbClient from '../../services/dbClient';
import './MaintenanceView.css';

// Icon registry for stat items returned by driver.getStats()
const STAT_ICONS: Record<string, React.ReactNode> = {
  HardDrive: <HardDrive size={20} />,
  FileText:  <FileText size={20} />,
  ShieldCheck: <ShieldCheck size={20} />,
  Zap:       <Zap size={20} />,
};

const STAT_ICON_COLORS = ['purple', 'blue', 'green', 'cyan'];

function formatStatValue(value: string | number, format?: string): string {
  if (format === 'bytes') {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = Number(value);
    let idx = 0;
    while (size > 1024 && idx < units.length - 1) { size /= 1024; idx++; }
    return `${size.toFixed(2)} ${units[idx]}`;
  }
  if (format === 'boolean') return Number(value) ? 'ENABLED' : 'DISABLED';
  if (format === 'uppercase') return String(value).toUpperCase();
  return String(value);
}

export default function MaintenanceView() {
  const { activeSessionId, activeSession } = useStore(s => ({
    activeSessionId: s.activeSessionId,
    activeSession: s.activeSession,
  }));

  const session = activeSession();
  const capabilities = session?.capabilities ?? null;
  const tasks = capabilities?.maintenanceTasks ?? [];

  const [stats, setStats] = useState<any | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadStats = async () => {
    if (!activeSessionId) return;
    try {
      const s = await dbClient.getStats(activeSessionId);
      setStats(s);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { loadStats(); }, [activeSessionId]);

  // If engine has no maintenance support, silently redirect (App.tsx guards this view).
  if (!capabilities?.hasMaintenance) return null;

  const handleTask = async (taskId: string) => {
    if (!activeSessionId) return;
    setIsRunning(true);
    setMessage(null);
    try {
      const res = await dbClient.runMaintenance(activeSessionId, taskId);
      setMessage({
        text: res.message ?? (res.success ? 'Task completed' : 'Task failed'),
        type: res.success ? 'success' : 'error',
      });
      await loadStats();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setIsRunning(false);
    }
  };

  if (!stats) return <div className="maintenance-loading">Loading database statistics...</div>;

  const statItems: any[] = stats.items ?? [];
  const extraPath: string | undefined = stats.extra?.path as string | undefined;

  return (
    <div className="maintenance-view fade-in">
      <div className="maintenance-header">
        <h2 className="maintenance-title">Database Health &amp; Maintenance</h2>
        <p className="maintenance-subtitle">Monitor performance and perform optimization tasks</p>
      </div>

      {/* ── Stats cards (data-driven) ───────────────────────────────────── */}
      <div className="maintenance-grid">
        {statItems.map((item, i) => (
          <div key={item.label} className="stats-card">
            <div className={`stats-icon ${STAT_ICON_COLORS[i % STAT_ICON_COLORS.length]}`}>
              {STAT_ICONS[item.icon ?? ''] ?? <Zap size={20} />}
            </div>
            <div className="stats-info">
              <label>{item.label}</label>
              <span className={item.format === 'uppercase' ? 'uppercase' : undefined}>
                {formatStatValue(item.value, item.format)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Result message ──────────────────────────────────────────────── */}
      {message && (
        <div className={`maintenance-message ${message.type}`}>
          {message.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          {message.text}
        </div>
      )}

      {/* ── Task buttons (data-driven from capabilities) ─────────────────── */}
      <div className="maintenance-sections">
        <div className="maintenance-section">
          <div className="section-content">
            {tasks.map(task => (
              <div key={task.id} className="task-item">
                <div className="task-info">
                  <h4>{task.name}</h4>
                  <p>{task.description}</p>
                </div>
                <button
                  className={`task-btn${task.style === 'secondary' ? ' secondary' : ''}`}
                  disabled={isRunning}
                  onClick={() => handleTask(task.id)}
                >
                  {task.buttonLabel}
                </button>
              </div>
            ))}
          </div>
        </div>

        {extraPath && (
          <div className="maintenance-section">
            <div className="section-content">
              <div className="info-box">
                <p>Current Path: <code>{extraPath}</code></p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
