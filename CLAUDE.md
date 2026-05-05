# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project overview

**DB Studio** is an Electron + React desktop application for managing relational databases. It evolved from a SQLite-only explorer (`SQLiteNav`) into a multi-engine studio: SQLite today, PostgreSQL and MySQL planned, with the architecture set up so that adding a new engine never touches the UI.

Tech stack:
- **Renderer**: React 19, TypeScript, Vite, Zustand, HeroUI, Monaco Editor, Mermaid, Framer Motion, Lucide.
- **Main**: Electron, `better-sqlite3` (planned: `pg`, `mysql2`).
- **Tooling**: Vitest, ESLint, electron-builder.

## Architecture layers

```
Renderer (React)
  components/   driver-agnostic UI
  store/        multi-session Zustand state
  services/     dbClient — typed facade over IPC
        │  window.dbstudio.* (preload)
        ▼
Electron main
  ipc/          single db:invoke dispatcher + session mgmt
  ConnectionRegistry   sessionId -> Driver instance
  drivers/      Driver interface + SqliteDriver / PostgresDriver / MysqlDriver
  dialect/      per-engine quoting, pagination, introspection SQL
  models/       normalized DTOs (TableMeta, ColumnMeta, RelationMeta, QueryResult, Capabilities, ConnectionConfig)
```

Key files (post-refactor):
- `electron/drivers/Driver.ts` — driver interface + shared types.
- `electron/drivers/SqliteDriver.ts` — `better-sqlite3` implementation.
- `electron/dialect/` — pure SQL builders per engine.
- `electron/ConnectionRegistry.ts` — owns connection lifecycle.
- `electron/ipc/dbHandlers.ts` — IPC dispatcher.
- `src/services/dbClient.ts` — renderer-side facade; **components/store call this, never `window.*` directly**.
- `src/store/useStore.ts` — multi-session state keyed by `sessionId`.

## Adding a new database engine

1. Implement `Driver` in `electron/drivers/<Name>Driver.ts`. Return normalized DTOs from `electron/models/`.
2. Add `electron/dialect/<name>.ts` with identifier quoting, pagination, and introspection SQL.
3. Register the driver in `ConnectionRegistry` keyed by `kind`.
4. Extend the `ConnectionConfig` discriminated union (`kind: 'sqlite' | 'postgres' | 'mysql' | ...`).
5. Add fields to `src/components/Connections/NewConnectionForm.tsx` for the new engine.
6. Add a per-dialect keyword/function set in `src/config/sqlConstants.ts` and `src/utils/sqlAutocompletion.ts`.
7. Add the driver to the contract test suite under `test/`.

## IPC contract

- One generic channel: `db:invoke` with payload `{ sessionId, op, args }`.
- Plus session management: `db:open`, `db:close`, `db:list`, `db:test`.
- **Do not add bespoke per-feature channels** (the legacy `ag:*` pattern is being removed).

## UI rules

- Components must be driver-agnostic. They consume normalized DTOs from `dbClient`, not engine-shaped rows.
- Gate engine-specific features on `capabilities()` — never on `kind === 'sqlite'`.
- Never import `better-sqlite3` (or any driver lib) in the renderer.
- **QueryConsole** renders for every connection. It adapts via dialect: Monaco language id, autocompletion set, EXPLAIN button shown only when `capabilities().supportsExplain`, plan renderer chosen by dialect.
- **DataTable, SchemaGraph, Sidebar** are fully engine-agnostic.
- **Maintenance** is gated on `capabilities().hasMaintenance`. The view is data-driven: it renders the task list returned by `capabilities().maintenanceTasks` plus stats from `driver.getStats()`. SQLite (Vacuum / Integrity / Optimize) is the first implementation of that shape, not a special case. If the active session has no maintenance support, the route silently redirects to the data view.

## Conventions

- Identifier quoting goes through dialect helpers — never inline `"..."` or `` `...` ``.
- Do not sniff SQL with string ops (e.g. `startsWith('SELECT')`). Use `node-sql-parser` or the driver's own statement metadata.
- Validate IPC payloads with `zod` at the boundary.
- Secrets (DB passwords) go in `keytar`, never in `electron-store` or plain JSON.

## Dev commands

```bash
npm install
npm run dev           # vite + electron (preload built first)
npm run build         # tsc -b && vite build
npm run lint
npx vitest            # tests
npm run seed          # seed sample SQLite DB
npm run seed:crm      # seed CRM sample
```

## Testing

- Vitest in `test/`.
- Driver contract test: same suite (open → schema → CRUD → tx → close) runs against each driver. New drivers must pass it before merge.
