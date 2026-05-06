import { useSettingsStore } from '../../../store/useSettingsStore';
import type { AppSettings } from '../../../store/useSettingsStore';

const PAGE_SIZES: Array<AppSettings['dataTable']['defaultPageSize']> = [25, 50, 100, 200];
const NULL_OPTIONS: Array<{ value: AppSettings['dataTable']['nullDisplay']; label: string; desc: string }> = [
  { value: 'NULL', label: 'NULL',  desc: 'Red NULL badge' },
  { value: '—',    label: '—',     desc: 'Em dash'        },
  { value: '',     label: 'empty', desc: 'Blank cell'     },
];

export default function DataTableSection() {
  const { settings, update } = useSettingsStore();
  const dt = settings.dataTable;
  const set = (patch: Partial<typeof dt>) => update({ dataTable: { ...dt, ...patch } });

  return (
    <div>
      <h2 className="settings-section-title">Data Table</h2>
      <p className="settings-section-desc">Controls how table data is displayed and paginated.</p>

      <div className="settings-group">
        <div className="settings-group-label">Pagination</div>

        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Default Page Size</strong>
            <span>Number of rows loaded per page when opening a table</span>
          </div>
          <div className="settings-row-control">
            <div className="settings-radio-group">
              {PAGE_SIZES.map(n => (
                <button
                  key={n}
                  className={`settings-radio-btn${dt.defaultPageSize === n ? ' active' : ''}`}
                  onClick={() => set({ defaultPageSize: n })}
                >{n}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-label">Columns</div>

        <div className="settings-row">
          <div className="settings-row-label">
            <strong>Default Visible Columns</strong>
            <span>How many columns to show by default when opening a table (1–30)</span>
          </div>
          <div className="settings-row-control settings-slider-row">
            <input
              type="range" min={1} max={30} step={1}
              value={dt.defaultVisibleColumns}
              className="settings-slider"
              onChange={e => set({ defaultVisibleColumns: Number(e.target.value) })}
            />
            <span className="settings-slider-value">{dt.defaultVisibleColumns}</span>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-label">Display</div>

        <div className="settings-row">
          <div className="settings-row-label">
            <strong>NULL Display</strong>
            <span>How NULL values appear in cells</span>
          </div>
          <div className="settings-row-control">
            <div className="settings-radio-group">
              {NULL_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`settings-radio-btn${dt.nullDisplay === opt.value ? ' active' : ''}`}
                  title={opt.desc}
                  onClick={() => set({ nullDisplay: opt.value })}
                >{opt.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
