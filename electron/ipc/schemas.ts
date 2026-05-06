/**
 * Zod schemas for IPC payload validation.
 * Validates all data crossing the preload boundary before it reaches business logic.
 */
import { z } from 'zod';

// ── ConnectionConfig ──────────────────────────────────────────────────────────

export const SqliteConfigSchema = z.object({
  kind: z.literal('sqlite'),
  path: z.string().min(1, 'path is required'),
});

export const PostgresConfigSchema = z.object({
  kind: z.literal('postgres'),
  host: z.string().min(1, 'host is required'),
  port: z.number().int().min(1).max(65535),
  database: z.string().min(1, 'database is required'),
  user: z.string().min(1, 'user is required'),
  password: z.string().optional(),
  ssl: z.boolean().optional(),
});

export const MysqlConfigSchema = z.object({
  kind: z.literal('mysql'),
  host: z.string().min(1, 'host is required'),
  port: z.number().int().min(1).max(65535),
  database: z.string().min(1, 'database is required'),
  user: z.string().min(1, 'user is required'),
  password: z.string().optional(),
  ssl: z.boolean().optional(),
});

export const ConnectionConfigSchema = z.discriminatedUnion('kind', [
  SqliteConfigSchema,
  PostgresConfigSchema,
  MysqlConfigSchema,
]);

// ── Server-only configs (no database required) ────────────────────────────────
// Used by db:listDatabases to enumerate databases before a specific one
// has been chosen. These intentionally omit the `database` field.

export const PostgresServerConfigSchema = z.object({
  kind: z.literal('postgres'),
  host: z.string().min(1, 'host is required'),
  port: z.number().int().min(1).max(65535),
  user: z.string().min(1, 'user is required'),
  password: z.string().optional(),
  ssl: z.boolean().optional(),
});

export const MysqlServerConfigSchema = z.object({
  kind: z.literal('mysql'),
  host: z.string().min(1, 'host is required'),
  port: z.number().int().min(1).max(65535),
  user: z.string().min(1, 'user is required'),
  password: z.string().optional(),
  ssl: z.boolean().optional(),
});

export const ServerConfigSchema = z.discriminatedUnion('kind', [
  PostgresServerConfigSchema,
  MysqlServerConfigSchema,
]);

// ── db:invoke payload ─────────────────────────────────────────────────────────

export const DbInvokeSchema = z.object({
  sessionId: z.string().min(1),
  op: z.string().min(1),
  args: z.array(z.unknown()).default([]),
});

// ── Simple string id ──────────────────────────────────────────────────────────

export const IdSchema = z.string().min(1, 'id is required');

// ── connections:save / connections:update args ────────────────────────────────

export const SaveConnectionArgsSchema = z.object({
  name: z.string().min(1, 'name is required'),
  config: ConnectionConfigSchema,
  password: z.string().optional(),
});

export const UpdateConnectionArgsSchema = z.object({
  id: IdSchema,
  name: z.string().min(1, 'name is required'),
  config: ConnectionConfigSchema,
  password: z.string().optional(),
});
