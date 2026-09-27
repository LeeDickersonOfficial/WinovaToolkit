const { app, BrowserWindow, ipcMain, clipboard, shell, nativeTheme, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const dns = require('dns').promises;
const crypto = require('crypto');
const net = require('net');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { autoUpdater } = require('electron-updater');
const execFileAsync = promisify(execFile);

let mainWindow;
let cachedDeviceDetails;
let updaterState = 'idle';

function sendUpdateStatus(status, payload = {}) {
  updaterState = status;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:status', { status, ...payload });
}

async function checkForUpdatesSafely() {
  if (!app.isPackaged || ['checking', 'available', 'downloading', 'downloaded'].includes(updaterState)) return;
  try { await autoUpdater.checkForUpdates(); } catch { /* surfaced by autoUpdater's error event */ }
}

function setupUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.fullChangelog = true;
  autoUpdater.on('checking-for-update', () => sendUpdateStatus('checking'));
  autoUpdater.on('update-available', info => {
    const rawNotes = Array.isArray(info.releaseNotes) ? info.releaseNotes.map(item => item.note).filter(Boolean).join('\n\n') : info.releaseNotes;
    sendUpdateStatus('available', { version: info.version, releaseNotes: rawNotes || 'See the GitHub release page for details.' });
  });
  autoUpdater.on('update-not-available', () => sendUpdateStatus('current', { version: app.getVersion() }));
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

async function windowsNetworkAdapters() {
  const [{ stdout }, routeResult] = await Promise.all([
    execFileAsync('netsh.exe', ['interface', 'show', 'interface'], { windowsHide: true, timeout: 10000 }),
    execFileAsync('route.exe', ['print', '-4'], { windowsHide: true, timeout: 10000 }).catch(() => ({ stdout: '' }))
  ]);
  const addresses = os.networkInterfaces();
  const gateways = new Map();
  for (const line of routeResult.stdout.split(/\r?\n/)) {
    const route = line.trim().match(/^0\.0\.0\.0\s+0\.0\.0\.0\s+(\S+)\s+(\S+)\s+\d+$/);
    if (route && route[1] !== 'On-link') gateways.set(route[2], route[1]);
  }
  return stdout.split(/\r?\n/).map(line => line.match(/^\s*(Enabled|Disabled)\s+(Connected|Disconnected)\s+\S+\s+(.+?)\s*$/i)).filter(Boolean).map(match => {
    const name = match[3];
    const details = addresses[name] || [];
    const mac = details.find(item => item.mac && item.mac !== '00:00:00:00:00:00')?.mac || '—';
    const ipv4 = details.filter(item => item.family === 'IPv4').map(item => item.address);
    const gateway = ipv4.map(address => gateways.get(address)).find(Boolean) || '—';
    return { name, description: 'Windows network adapter', status: match[1].toLowerCase() === 'disabled' ? 'Disabled' : match[2], mac, ipv4, gateway, speed: '—', virtual: /tailscale|vpn|virtual|vethernet|loopback/i.test(name) };
  });
}

function requestNetworkService(action, name = '', enabled = false) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection('\\\\.\\pipe\\WinovaToolkitNetwork.v1');
    let response = '';
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('Winova network service did not respond')), action === 'getStatus' ? 3000 : 65000);
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(`${JSON.stringify({ Action: action, Name: name, Enabled: enabled })}\n`));
    socket.on('data', chunk => {
      response += chunk;
      if (!response.includes('\n')) return;
      try {
        const result = JSON.parse(response.split('\n')[0]);
        const ok = result.Ok ?? result.ok;
        if (!ok) throw new Error(result.Error || result.error || 'The network service rejected the request');
        finish(null, result);
      } catch (error) { finish(error); }
    });
    socket.on('error', error => finish(error));
    socket.on('end', () => { if (!settled) finish(new Error('Winova network service closed unexpectedly')); });
  });
}

async function pingHost(target) {
  const started = performance.now();
  try {
    await execFileAsync('ping.exe', ['-n', '1', '-w', '1800', target], { windowsHide: true, timeout: 3500 });
    return { reachable: true, latency: Math.max(1, Math.round(performance.now() - started)) };
  } catch { return { reachable: false, latency: null }; }
}

async function verifyAdapterState(name, enabled) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = (await windowsNetworkAdapters()).find(item => item.name === name);
    const isEnabled = current && String(current.status).toLowerCase() !== 'disabled';
    if (Boolean(isEnabled) === enabled) return current;
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  throw new Error('Windows did not confirm the adapter state');
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
  const script = `$cs=Get-CimInstance Win32_ComputerSystem;$os=Get-CimInstance Win32_OperatingSystem;$bios=Get-CimInstance Win32_BIOS;$gpu=Get-CimInstance Win32_VideoController|Select-Object -First 1;$board=Get-CimInstance Win32_BaseBoard|Select-Object -First 1;$cv=Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion';$displayVersion=if($cv.DisplayVersion){$cv.DisplayVersion}else{$cv.ReleaseId};$fullBuild=if($cv.UBR -ne $null){$os.BuildNumber+'.'+$cv.UBR}else{$os.BuildNumber};$disks=Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3"|ForEach-Object {@{name=$_.DeviceID;label=$_.VolumeName;size=[double]$_.Size;free=[double]$_.FreeSpace}};@{manufacturer=$cs.Manufacturer;model=$cs.Model;systemType=$cs.SystemType;hypervisor=[bool]$cs.HypervisorPresent;windows=$os.Caption;edition=$cv.EditionID;displayVersion=$displayVersion;build=$fullBuild;osVersion=$os.Version;installed=$os.InstallDate.ToString('o');lastBoot=$os.LastBootUpTime.ToString('o');serial=$bios.SerialNumber;bios=$bios.SMBIOSBIOSVersion;biosDate=if($bios.ReleaseDate){$bios.ReleaseDate.ToString('o')}else{$null};board=($board.Manufacturer+' '+$board.Product).Trim();gpu=$gpu.Name;gpuMemory=[double]$gpu.AdapterRAM;disks=@($disks)}|ConvertTo-Json -Depth 4 -Compress`;
  cachedDeviceDetails = JSON.parse(await runPowerShell(script));
  return cachedDeviceDetails;
});
ipcMain.handle('network:adapters', async () => {
  return windowsNetworkAdapters();
});
ipcMain.handle('network:service-status', async () => {
  try {
    const result = await requestNetworkService('getStatus');
    return { available: true, version: result.Version || result.version || app.getVersion(), mode: 'Installed service' };
  } catch { return { available: false, version: null, mode: app.isPackaged ? 'Elevation fallback' : 'Development mode' }; }
});
ipcMain.handle('network:health', async () => {
  const adapters = await windowsNetworkAdapters();
  const active = adapters.find(item => String(item.status).toLowerCase() === 'connected' && item.gateway !== '—');
  const gateway = active?.gateway && active.gateway !== '—' ? active.gateway : null;
  const [gatewayTest, internetTest, dnsTest] = await Promise.all([
    gateway ? pingHost(gateway) : Promise.resolve({ reachable: false, latency: null }),
    pingHost('1.1.1.1'),
    (async () => { const started = performance.now(); try { await dns.lookup('google.com'); return { reachable: true, latency: Math.max(1, Math.round(performance.now() - started)) }; } catch { return { reachable: false, latency: null }; } })()
  ]);
  return { checkedAt: Date.now(), gateway: { target: gateway || 'Not detected', ...gatewayTest }, internet: { target: '1.1.1.1', ...internetTest }, dns: { target: 'google.com', ...dnsTest } };
});
ipcMain.handle('network:repair', async (_event, { action, name }) => {
  const allowed = new Set(['flushDns', 'renewDhcp', 'restartAdapter']);
  if (!allowed.has(action)) throw new Error('Unsupported network repair action');
  if (action === 'restartAdapter') {
    const selected = (await windowsNetworkAdapters()).find(item => item.name === String(name));
    if (!selected) throw new Error('Choose a valid network adapter');
    await requestNetworkService(action, selected.name);
  } else await requestNetworkService(action);
  return true;
});
ipcMain.handle('network:toggle-adapter', async (_event, { name, enabled }) => {
  const adapters = await windowsNetworkAdapters();
  const selected = adapters.find(item => item.name === String(name));
  if (!selected) throw new Error('Network adapter was not found');
  try {
    await requestNetworkService('setAdapterState', selected.name, Boolean(enabled));
  } catch {
    const safeName = selected.name.replace(/'/g, "''");
    const adminState = enabled ? 'enabled' : 'disabled';
    const outer = `$p=Start-Process netsh.exe -Verb RunAs -WindowStyle Hidden -ArgumentList @('interface','set','interface','name="${safeName}"','admin=${adminState}') -Wait -PassThru;if($p.ExitCode -ne 0){throw 'Windows did not apply the adapter change'}`;
    await runPowerShell(outer, 60000);
  }
  const current = await verifyAdapterState(selected.name, Boolean(enabled));
  return { verified: true, status: current.status };
});

ipcMain.handle('clipboard:read', () => clipboard.readText());
ipcMain.handle('clipboard:write', (_event, text) => clipboard.writeText(String(text)));
ipcMain.handle('file:checksum', async (_event, algorithm = 'sha256') => {
  const allowed = ['sha256', 'sha512', 'md5'];
  const safeAlgorithm = allowed.includes(algorithm) ? algorithm : 'sha256';
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], title: 'Choose a file to inspect' });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const stat = await fs.promises.stat(filePath);
  const digest = await new Promise((resolve, reject) => {
    const hash = crypto.createHash(safeAlgorithm);
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
  return { name: path.basename(filePath), path: filePath, size: stat.size, algorithm: safeAlgorithm, digest };
});
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
ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) return { development: true, version: app.getVersion() };
  updaterState = 'idle';
  await checkForUpdatesSafely();
  return { started: true };
});
ipcMain.handle('update:download', async () => { await autoUpdater.downloadUpdate(); return true; });
ipcMain.handle('update:install', () => { setImmediate(() => autoUpdater.quitAndInstall(false, true)); return true; });

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  setupUpdater();
  createWindow();
  setTimeout(checkForUpdatesSafely, 3000);
  setInterval(checkForUpdatesSafely, 60000);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
