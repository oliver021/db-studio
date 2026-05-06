import { ipcMain } from 'electron';
import { z } from 'zod';
import { getSettings, setSettings, resetSettings } from '../SettingsStore.js';

const SettingsPatchSchema = z.object({
  appearance: z.object({
    editorTheme: z.enum(['sqlitenav-dark', 'midnight', 'vs-dark', 'hc-black']),
    accentColor: z.enum(['purple', 'blue', 'green', 'orange']),
  }).partial().optional(),
  editor: z.object({
    fontSize: z.number().int().min(11).max(20),
    fontFamily: z.string().min(1),
    tabSize: z.union([z.literal(2), z.literal(4)]),
    wordWrap: z.boolean(),
    lineNumbers: z.boolean(),
    minimap: z.boolean(),
    defaultSql: z.string(),
  }).partial().optional(),
  dataTable: z.object({
    defaultPageSize: z.union([z.literal(25), z.literal(50), z.literal(100), z.literal(200)]),
    defaultVisibleColumns: z.number().int().min(1).max(30),
    nullDisplay: z.union([z.literal('NULL'), z.literal('—'), z.literal('')]),
  }).partial().optional(),
  connections: z.object({
    connectTimeoutMs: z.number().int().min(0),
    queryTimeoutMs: z.number().int().min(0),
    sslByDefault: z.boolean(),
  }).partial().optional(),
}).strict();

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', () => getSettings());

  ipcMain.handle('settings:set', (_evt, rawPatch: unknown) => {
    const patch = SettingsPatchSchema.parse(rawPatch);
    return setSettings(patch as Parameters<typeof setSettings>[0]);
  });

  ipcMain.handle('settings:reset', () => resetSettings());
}
