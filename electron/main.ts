import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { ConnectionRegistry } from './ConnectionRegistry.js';
import { registerDbHandlers } from './ipc/dbHandlers.js';
import { registerConnectionHandlers } from './ipc/connectionHandlers.js';
import { registerSettingsHandlers } from './ipc/settingsHandlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const registry = new ConnectionRegistry();
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f172a',
      symbolColor: '#f8fafc',
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  registerDbHandlers(registry, () => mainWindow);
  registerConnectionHandlers(registry);
  registerSettingsHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  await registry.closeAll();
  if (process.platform !== 'darwin') app.quit();
});
