import { motion } from 'framer-motion';
import { Table2 } from 'lucide-react';

export default function EmptyState() {
  return (
    <motion.div
      key="empty"
      className="empty-state"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25 }}
    >
      <div className="empty-icon-wrapper"><Table2 size={32} /></div>
      <h2 className="empty-title">Select a table</h2>
      <p className="empty-description">
        Pick a table or view from the sidebar to browse data,
        or open the Query Console to run custom SQL.
      </p>
    </motion.div>
  );
}
