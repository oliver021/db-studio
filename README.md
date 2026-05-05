# DB Studio

A modern, multi-engine database manager built with React, Electron, and TypeScript. Explore, query, and optimize relational databases with a unified interface — SQLite today, PostgreSQL and MySQL support planned.

Evolved from SQLiteNav into a general-purpose database studio with a layered architecture that makes adding new database engines trivial.

## Features

### 🗄️ Multi-Engine Support
- **SQLite** — fully featured (read, write, transactions, PRAGMA introspection)
- **PostgreSQL** — planned (Phase C)
- **MySQL** — planned (Phase C)

Single UI adapts to every engine; add a new database type without touching components.

### 📊 Data Explorer
High-performance table view with server-side sorting, advanced filtering, and pagination. Edit cells inline, bulk actions, and smart column visibility.

### 💻 SQL Query Console
Pro-grade editor powered by Monaco. Context-aware autocompletion adapts per SQL dialect, query plan visualization, and transaction control.

### 🕸️ Schema Visualization
Mermaid-based ER diagrams showing tables, columns, and foreign key relationships. Export as SVG, PlantUML, or SQL DDL.

### 🔧 Database Maintenance
Engine-specific health checks and optimization tools. Currently SQLite (Vacuum, Integrity Check, PRAGMA Optimize); extensible to Postgres VACUUM/ANALYZE and MySQL OPTIMIZE TABLE.

## Architecture

**Phase A (current)** — Refactored SQLite support into a multi-engine architecture:
- **Driver layer** (`electron/drivers/`) — abstract interface + SQLiteDriver implementation
- **Dialect layer** (`electron/dialect/`) — pure SQL helpers (quoting, introspection, WHERE builders)
- **Connection registry** — manage multiple concurrent database sessions
- **IPC dispatcher** — single generic channel replacing legacy ad-hoc handlers
- **Renderer facade** (`src/services/dbClient.ts`) — typed wrapper so components never touch Electron globals

See [CLAUDE.md](CLAUDE.md) for architecture details and how to add a new engine.

## Tech Stack

- **Frontend**: React 19, TypeScript, Zustand, Framer Motion, Lucide, Monaco Editor
- **Backend**: Electron, better-sqlite3 (planned: `pg`, `mysql2`)
- **Testing**: Vitest (unit + integration), @testing-library/react, Playwright (E2E)
- **Styling**: Vanilla CSS with modern variables and animations
- **Docs**: TypeDoc for API reference

## Development

### Setup

```bash
npm install
npm run build:preload  # Build Electron preload first
npm run dev           # Vite + Electron
```

### Testing

```bash
npm test              # Run all tests (Vitest)
npm run test:watch   # Watch mode
npm run test:e2e     # Playwright (set ELECTRON_E2E=1 to actually run)
```

### Database Seeding

```bash
npm run seed          # Create a small test database
npm run seed:crm      # Create a more complex sample (customers, orders, products)
```

### Build & Package

```bash
npm run build         # Compile for production
npm run preview       # Preview the production build locally
```

Binaries are packaged via `electron-builder`:
- Windows: `.exe` installer
- macOS: `.dmg` (unsigned)
- Linux: `.AppImage`

### Code Style

```bash
npm run lint          # Run ESLint on all source files
```

Pre-commit hook runs Vitest on related tests automatically.

## Project Structure

```
├── electron/
│   ├── main.ts                     # Electron main process
│   ├── preload.cts                 # IPC bridge to renderer
│   ├── drivers/
│   │   ├── Driver.ts               # Abstract driver interface
│   │   ├── SqliteDriver.ts         # SQLite implementation
│   │   ├── PostgresDriver.ts       # (Phase C)
│   │   └── MysqlDriver.ts          # (Phase C)
│   ├── dialect/
│   │   ├── sqlite.ts               # SQLite SQL helpers
│   │   ├── postgres.ts             # (Phase C)
│   │   └── mysql.ts                # (Phase C)
│   ├── models/                     # Normalized DTOs
│   ├── ipc/                        # IPC handlers
│   └── ConnectionRegistry.ts       # Session management
├── src/
│   ├── components/                 # React UI (driver-agnostic)
│   ├── services/
│   │   └── dbClient.ts            # Typed IPC facade
│   ├── store/                      # Zustand multi-session state
│   ├── hooks/                      # Custom React hooks
│   └── utils/                      # Shared utilities
└── test/
    ├── unit/                       # Pure function tests
    ├── integration/
    │   └── driver-contract.spec.ts # Driver compliance suite
    ├── components/                 # React component tests
    └── e2e/                        # Playwright Electron tests
```

## Contributing

New engines welcome! See [CLAUDE.md](CLAUDE.md) → "Adding a new database engine" for the checklist.

### Key Rules

- Components must be driver-agnostic (consume normalized DTOs)
- Gate engine-specific features via `capabilities()`
- Never use `better-sqlite3` types in the renderer
- All identifier quoting goes through dialect helpers
- Driver contract tests must pass

## License

See [LICENSE.txt](LICENSE.txt)

---

## Roadmap

**Phase B** — Connection Manager UI
- Saved connections, password storage (Keytar), connection test button

**Phase C** — PostgreSQL & MySQL drivers
- Per-dialect SQL autocompletion and EXPLAIN format
- Server-side stats and maintenance tasks

**Phase D** — Engine-specific polish
- Postgres EXPLAIN (ANALYZE, FORMAT JSON)
- MySQL SHOW ENGINE STATUS
- Advanced index management
