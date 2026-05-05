import { randomUUID } from 'crypto';
import type { Driver } from './drivers/Driver.js';
import type { ConnectionConfig } from './models/index.js';
import { SqliteDriver } from './drivers/SqliteDriver.js';

export interface SessionEntry {
  sessionId: string;
  driver: Driver;
  config: ConnectionConfig;
  name: string;
}

/**
 * Owns all active database sessions.
 * One session = one connection = one Driver instance.
 */
export class ConnectionRegistry {
  private sessions = new Map<string, SessionEntry>();

  /** Open a new session; returns the sessionId. */
  async open(config: ConnectionConfig, name?: string): Promise<string> {
    const driver = this.createDriver(config);
    await driver.connect(config);
    const sessionId = randomUUID();
    const displayName = name ?? this.defaultName(config);
    this.sessions.set(sessionId, { sessionId, driver, config, name: displayName });
    return sessionId;
  }

  /** Close a specific session. */
  async close(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    await entry.driver.disconnect();
    this.sessions.delete(sessionId);
  }

  /** Close all open sessions (call on app-quit). */
  async closeAll(): Promise<void> {
    for (const entry of this.sessions.values()) {
      await entry.driver.disconnect().catch(() => {});
    }
    this.sessions.clear();
  }

  get(sessionId: string): SessionEntry {
    const entry = this.sessions.get(sessionId);
    if (!entry) throw new Error(`No session found: ${sessionId}`);
    return entry;
  }

  driver(sessionId: string): Driver {
    return this.get(sessionId).driver;
  }

  list(): Array<{ sessionId: string; name: string; kind: string }> {
    return [...this.sessions.values()].map(e => ({
      sessionId: e.sessionId,
      name: e.name,
      kind: e.config.kind,
    }));
  }

  /** Test a connection without persisting a session. */
  async test(config: ConnectionConfig): Promise<{ ok: boolean; error?: string }> {
    const driver = this.createDriver(config);
    try {
      await driver.connect(config);
      await driver.disconnect();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private createDriver(config: ConnectionConfig): Driver {
    switch (config.kind) {
      case 'sqlite': return new SqliteDriver();
      // Future drivers registered here:
      // case 'postgres': return new PostgresDriver();
      // case 'mysql':    return new MysqlDriver();
      default:
        throw new Error(`Unsupported database kind: ${(config as any).kind}`);
    }
  }

  private defaultName(config: ConnectionConfig): string {
    switch (config.kind) {
      case 'sqlite': return config.path.split(/[/\\]/).pop() ?? config.path;
      case 'postgres':
      case 'mysql':   return `${config.database}@${config.host}`;
      default:        return (config as any).kind;
    }
  }
}
