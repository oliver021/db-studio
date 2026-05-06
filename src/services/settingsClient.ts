/**
 * Renderer-side facade for settings IPC.
 * Components/stores call this; never access window.dbstudio directly.
 */
import type { AppSettings } from '../store/useSettingsStore';

export async function getSettings(): Promise<AppSettings> {
  return window.dbstudio.getSettings();
}

export async function setSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  return window.dbstudio.setSettings(patch);
}

export async function resetSettings(): Promise<AppSettings> {
  return window.dbstudio.resetSettings();
}
