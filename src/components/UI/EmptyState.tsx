import { motion } from 'framer-motion';
import { Database, FolderOpen } from 'lucide-react';

interface EmptyStateProps {
  onOpenDatabase: () => void;
}

export default function EmptyState({ onOpenDatabase }: EmptyStateProps) {
  return (
    <motion.div
      key="empty"
      className="empty-state"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25 }}
    >
      <div className="empty-icon-wrapper"><Database size={36} /></div>
      <h2 className="empty-title">DB Studio</h2>
      <p className="empty-description">
        Connect to a database to explore tables, run queries,
        and inspect schemas across multiple engines.
      </p>
      <div className="empty-cta">
        <button className="btn-gradient" onClick={onOpenDatabase}>
          <FolderOpen size={15} /> Open SQLite File
        </button>
        <span className="shortcut-hint">
          or press <kbd className="kbd">Ctrl</kbd><span>+</span><kbd className="kbd">O</kbd>
        </span>
      </div>
    </motion.div>
  );
}
