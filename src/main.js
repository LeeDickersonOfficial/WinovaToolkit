const { app, BrowserWindow, ipcMain, clipboard, shell, nativeTheme } = require('electron');
const path = require('path');
const os = require('os');
const dns = require('dns').promises;
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { autoUpdater } = require('electron-updater');
const execFileAsync = promisify(execFile);

let mainWindow;
let cachedDeviceDetails;

function sendUpdateStatus(status, payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:status', { status, ...payload });
}

function setupUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => sendUpdateStatus('checking'));
  autoUpdater.on('update-available', info => sendUpdateStatus('available', { version: info.version }));
  autoUpdater.on('update-not-available', info => sendUpdateStatus('current', { version: info.version || app.getVersion() }));
  autoUpdater.on('download-progress', progress => sendUpdateStatus('downloading', { percent: Math.round(progress.percent) }));
  autoUpdater.on('update-downloaded', info => sendUpdateStatus('downloaded', { version: info.version }));
  autoUpdater.on('error', error => sendUpdateStatus('error', { message: error.message.replace(/https?:\/\/[^\s]+/g, 'update service') }));
}

async function runPowerShell(script, timeout = 12000) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true, timeout });
  return stdout.trim();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1060,
    minHeight: 700,
    backgroundColor: '#090b10',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#090b10', symbolColor: '#aeb5c4', height: 44 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

function networkInterfaces() {
  return Object.entries(os.networkInterfaces()).flatMap(([name, items]) =>
    (items || []).filter(x => x.family === 'IPv4').map(x => ({ name, address: x.address, internal: x.internal, mac: x.mac }))
  );
}

ipcMain.handle('system:snapshot', async () => ({
  hostname: os.hostname(),
  platform: `${os.type()} ${os.release()}`,
  arch: os.arch(),
  cpu: os.cpus()[0]?.model?.trim() || 'Unknown CPU',
  cores: os.cpus().length,
  totalMemory: os.totalmem(),
  freeMemory: os.freemem(),
  uptime: os.uptime(),
  user: os.userInfo().username,
  network: networkInterfaces(),
  appVersion: app.getVersion()
}));
ipcMain.handle('system:details', async () => {
  if (cachedDeviceDetails) return cachedDeviceDetails;
  const script = `$cs=Get-CimInstance Win32_ComputerSystem;$os=Get-CimInstance Win32_OperatingSystem;$bios=Get-CimInstance Win32_BIOS;$gpu=Get-CimInstance Win32_VideoController|Select-Object -First 1;$board=Get-CimInstance Win32_BaseBoard|Select-Object -First 1;$disks=Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3"|ForEach-Object {@{name=$_.DeviceID;label=$_.VolumeName;size=[double]$_.Size;free=[double]$_.FreeSpace}};@{manufacturer=$cs.Manufacturer;model=$cs.Model;windows=$os.Caption;build=$os.BuildNumber;installed=$os.InstallDate.ToString('o');lastBoot=$os.LastBootUpTime.ToString('o');bios=$bios.SMBIOSBIOSVersion;board=($board.Manufacturer+' '+$board.Product).Trim();gpu=$gpu.Name;gpuMemory=[double]$gpu.AdapterRAM;disks=@($disks)}|ConvertTo-Json -Depth 4 -Compress`;
  cachedDeviceDetails = JSON.parse(await runPowerShell(script));
  return cachedDeviceDetails;
});

ipcMain.handle('clipboard:read', () => clipboard.readText());
ipcMain.handle('clipboard:write', (_event, text) => clipboard.writeText(String(text)));
ipcMain.handle('utility:hash', (_event, { text, algorithm }) => {
  const allowed = ['md5', 'sha1', 'sha256', 'sha512'];
  const safeAlgorithm = allowed.includes(algorithm) ? algorithm : 'sha256';
  return crypto.createHash(safeAlgorithm).update(String(text)).digest('hex');
});
ipcMain.handle('network:lookup', async (_event, host) => {
  const clean = String(host).trim().replace(/^https?:\/\//, '').split('/')[0];
  if (!/^[a-zA-Z0-9.-]{1,253}$/.test(clean)) throw new Error('Enter a valid hostname');
  const started = performance.now();
  const result = await dns.lookup(clean, { all: true });
  return { host: clean, addresses: result, elapsed: Math.round(performance.now() - started) };
});
ipcMain.handle('windows:action', async (_event, action) => {
  const folders = { temp: os.tmpdir(), downloads: path.join(os.homedir(), 'Downloads') };
  if (folders[action]) {
    const error = await shell.openPath(folders[action]);
    if (error) throw new Error(error);
    return true;
  }
  if (action === 'settings') {
    await shell.openExternal('ms-settings:');
    return true;
  }
  if (action === 'recycle') {
    await shell.openExternal('shell:RecycleBinFolder');
    return true;
  }
  if (action === 'taskmgr') {
    const script = `$p=Get-Process -Name Taskmgr -ErrorAction SilentlyContinue|Select-Object -First 1;if($p -and $p.MainWindowHandle -ne 0){Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class WinovaWindow{[DllImport("user32.dll")]public static extern bool ShowWindowAsync(IntPtr hWnd,int nCmdShow);[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr hWnd);}';[WinovaWindow]::ShowWindowAsync($p.MainWindowHandle,9)|Out-Null;[WinovaWindow]::SetForegroundWindow($p.MainWindowHandle)|Out-Null;exit 0};if($p){Stop-Process -Id $p.Id -Force;Start-Sleep -Milliseconds 250};Start-Process -FilePath "$env:SystemRoot\\System32\\Taskmgr.exe"`;
    await runPowerShell(script, 15000);
    return true;
  }
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const systemApps = {
    control: path.join(systemRoot, 'System32', 'control.exe')
  };
  if (!systemApps[action]) throw new Error('Unknown action');
  const error = await shell.openPath(systemApps[action]);
  if (error) throw new Error(error);
  return true;
});
ipcMain.handle('shell:openExternal', (_event, url) => {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Unsupported URL');
  return shell.openExternal(parsed.toString());
});
ipcMain.handle('theme:set', (_event, theme) => { nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark'; });
ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) return { development: true, version: app.getVersion() };
  await autoUpdater.checkForUpdates();
  return { started: true };
});
ipcMain.handle('update:download', async () => { await autoUpdater.downloadUpdate(); return true; });
ipcMain.handle('update:install', () => { setImmediate(() => autoUpdater.quitAndInstall(false, true)); return true; });

app.whenReady().then(() => {
  setupUpdater();
  createWindow();
  setTimeout(() => { if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {}); }, 10000);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
