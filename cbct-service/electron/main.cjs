/**
 * PineClinic Lokal Servisler — Electron Masaüstü Yöneticisi (`electron/main.cjs`).
 *
 * Mimari Rolü:
 * - Yerel FastAPI + PyTorch MPS servisini (`127.0.0.1:8000`) başlatır, izler ve kapatır.
 * - Web arayüzünden gelen `pineclinic://start` özel protokol çağrılarını karşılayarak
 *   servisi otomatik ayağa kaldırır.
 * - Port 8000 üzerinde zaten çalışan uyumlu (API v3) bir PineClinic servisi varsa hata
 *   vermek yerine onu sahiplenir (`adopted: true`) ve canlı durumunu izler.
 */
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

app.name = 'PineClinic Lokal Servisler';

const PORT = 8000;
const BASE = `http://127.0.0.1:${PORT}`;
const API_VERSION = 3;

let windowRef;
let service;
let controlToken = crypto.randomBytes(24).toString('hex');
let eventAbort;
let stopping = false;
let status = {
  state: 'stopped',
  apiBase: '',
  logs: [],
  detail: '',
  viewers: 0,
  datasets: [],
  jobs: [],
  engine: '',
  provider: '',
  adopted: false,
};

/** Yönetici kodunun kısa SHA-1 sürüm parmak izini hesaplar. */
function managerCodeVersion() {
  const digest = crypto.createHash('sha1');
  try {
    for (const name of fs.readdirSync(__dirname).sort()) {
      digest.update(name).update(fs.readFileSync(path.join(__dirname, name)));
    }
  } catch (_) {
    digest.update('unreadable');
  }
  return `${app.getVersion()}+${digest.digest('hex').slice(0, 8)}`;
}
let MANAGER_VERSION = 'unknown';

function pushLog(line) {
  if (!line) return;
  status.logs = [...status.logs, line].slice(-500);
  publish();
}

/** Pencere açık ve hazırsa güncel durumu IPC üzerinden arayüze gönderir. */
function publish() {
  if (quitting || !windowRef || windowRef.isDestroyed()) return;
  const contents = windowRef.webContents;
  if (!contents || contents.isDestroyed()) return;
  try {
    contents.send('service:update', status);
  } catch (_) { /* pencere kapanıyor */ }
}

process.on('uncaughtException', (error) => {
  try { pushLog(`Beklenmeyen hata: ${error.stack || error}`); } catch (_) {}
});
process.on('unhandledRejection', (reason) => {
  try { pushLog(`İşlenmeyen söz (Promise) hatası: ${(reason && reason.stack) || reason}`); } catch (_) {}
});

function setStatus(next) {
  status = { ...status, ...next };
  publish();
}
const clearLive = () => ({ viewers: 0, datasets: [], jobs: [], engine: '', provider: '', adopted: false });

/** Paketlenmiş (.app/.exe) veya geliştirme ortamına göre Python/Backend komutunu döndürür. */
function backendCommand(port) {
  if (app.isPackaged) {
    const binary = process.platform === 'win32' ? 'pineclinic-local-services.exe' : 'pineclinic-local-services';
    const executable = path.join(process.resourcesPath, 'backend', 'pineclinic-local-services', binary);
    return { command: executable, args: ['--host', '127.0.0.1', '--port', String(port)] };
  }
  const python = process.platform === 'win32'
    ? path.join(__dirname, '..', 'backend', '.venv', 'Scripts', 'python.exe')
    : path.join(__dirname, '..', 'backend', '.venv', 'bin', 'python');
  return { command: python, args: [path.join(__dirname, '..', 'backend', 'main.py'), '--host', '127.0.0.1', '--port', String(port)] };
}

/** Port 8000 üzerindeki servisi kontrol eder (`free`, `pineclinic` veya `foreign`). */
async function probe() {
  try {
    const reply = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (!reply.ok) return { kind: 'foreign' };
    const body = await reply.json();
    return body && body.instanceId ? { kind: 'pineclinic', body } : { kind: 'foreign' };
  } catch (_) {
    return { kind: 'free' };
  }
}

// ---- Canlı SSE Olay İşleme ------------------------------------------------------------------
function applyEvent(event, data) {
  switch (event) {
    case 'hello':
      setStatus({
        viewers: data.clients?.viewers ?? 0,
        datasets: data.datasets ?? [],
        jobs: data.jobs ?? [],
        engine: data.engine ?? '',
        provider: data.provider ?? '',
      });
      break;
    case 'clients':
      setStatus({ viewers: data.viewers });
      break;
    case 'dataset.opened':
      setStatus({ datasets: [...status.datasets.filter((d) => d.datasetId !== data.datasetId), data] });
      break;
    case 'dataset.released':
      setStatus({
        datasets: status.datasets.filter((d) => d.datasetId !== data.datasetId),
        jobs: status.jobs.filter((j) => j.datasetId !== data.datasetId),
      });
      break;
    case 'job.queued':
    case 'job.running':
    case 'job.progress':
    case 'job.done':
    case 'job.failed':
    case 'job.cancelled':
      setStatus({ jobs: [...status.jobs.filter((j) => j.jobId !== data.jobId), data] });
      if (event === 'job.done' || event === 'job.failed' || event === 'job.cancelled') {
        pushLog(`AI işi ${data.jobId.slice(0, 8)} ${event.slice(4)}${data.detail ? `: ${data.detail}` : ''}`);
      }
      break;
    case 'pick-folder.request':
      pickFolder(data.requestId);
      break;
    case 'service.stopping':
      stopping = true;
      setStatus({ state: 'stopping' });
      break;
    default:
      break;
  }
}

async function pickFolder(requestId) {
  let chosen = null;
  try {
    app.focus({ steal: true });
    if (!windowRef) createWindow();
    const result = await dialog.showOpenDialog(windowRef, {
      title: 'DICOM seri klasörünü seçin',
      properties: ['openDirectory'],
    });
    chosen = result.canceled ? null : result.filePaths[0];
  } catch (error) {
    pushLog(`Klasör seçme penceresi hatası: ${error.message}`);
  }
  try {
    await fetch(`${BASE}/api/control/pick-folder/${requestId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Control-Token': controlToken },
      body: JSON.stringify({ path: chosen }),
    });
  } catch (error) {
    pushLog(`Klasör seçimi iletilemedi: ${error.message}`);
  }
}

async function watchEvents(role = 'manager') {
  eventAbort?.abort();
  const abort = (eventAbort = new AbortController());
  try {
    const headers = role === 'manager' ? { 'X-Control-Token': controlToken } : {};
    const response = await fetch(`${BASE}/api/events?role=${role}`, { headers, signal: abort.signal });
    if (!response.ok || !response.body) throw new Error(`SSE akışı reddedildi (${response.status})`);
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let split;
      while ((split = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const event = /^event: (.+)$/m.exec(frame)?.[1];
        const data = /^data: (.+)$/m.exec(frame)?.[1];
        if (event && data && event !== 'heartbeat') applyEvent(event, JSON.parse(data));
      }
    }
  } catch (error) {
    if (abort.signal.aborted) return;
    pushLog(`Olay akışı sona erdi: ${error.message}`);
  }
  if (!abort.signal.aborted && eventAbort === abort && status.state === 'running') {
    setStatus({ state: 'error', detail: 'Yerel servisle bağlantı koptu.', ...clearLive() });
  }
}

// ---- Servis Başlatma ve Durdurma ------------------------------------------------------------
async function startService() {
  if (service || status.state === 'starting' || status.state === 'running') return;
  const existing = await probe();
  if (existing.kind === 'foreign') {
    setStatus({ state: 'error', detail: `Port ${PORT} başka bir uygulama tarafından kullanılıyor. Kapatıp tekrar deneyin.` });
    return;
  }
  if (existing.kind === 'pineclinic') {
    // Port 8000'de zaten uyumlu bir PineClinic servisi çalışıyorsa hata vermek yerine onu sahiplen.
    if (existing.body.apiVersion === API_VERSION) {
      setStatus({
        state: 'running',
        apiBase: BASE,
        detail: 'Mevcut çalışan yerel servis devralındı.',
        engine: existing.body.engine,
        provider: existing.body.provider,
        adopted: true,
      });
      pushLog(`Mevcut çalışan servis (kod ${existing.body.codeVersion || 'bilinmiyor'}, API v${existing.body.apiVersion}) sahiplenildi.`);
      void watchEvents('viewer');
      return;
    }
    setStatus({ state: 'error', detail: `Port ${PORT} üzerinde uyumsuz bir servis sürümü (v${existing.body.apiVersion}) çalışıyor.` });
    return;
  }

  stopping = false;
  controlToken = crypto.randomBytes(24).toString('hex');
  const spec = backendCommand(PORT);
  setStatus({ state: 'starting', apiBase: BASE, detail: '', logs: [], ...clearLive() });
  pushLog(`Yönetici kodu ${MANAGER_VERSION}; yerel servis başlatılıyor.`);
  try {
    service = spawn(spec.command, spec.args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PINECLINIC_CONTROL_TOKEN: controlToken, PINECLINIC_MANAGER_PID: String(process.pid) },
    });
  } catch (error) {
    service = undefined;
    setStatus({ state: 'error', detail: String(error) });
    return;
  }
  const child = service;
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on('data', (data) => String(data).split(/\r?\n/).forEach(pushLog));
  }
  child.once('error', (error) => {
    if (service === child) service = undefined;
    setStatus({ state: 'error', detail: error.message, ...clearLive() });
    pushLog(error.stack || error.message);
  });
  child.once('exit', (code, signal) => {
    if (service === child) service = undefined;
    eventAbort?.abort();
    if (status.state === 'stopped' || stopping) {
      setStatus({ state: 'stopped', apiBase: '', detail: '', ...clearLive() });
      return;
    }
    setStatus({ state: 'error', detail: `Servis kapandı (${signal || code})`, ...clearLive() });
  });

  for (let attempt = 0; attempt < 240; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (service !== child) return;
    const result = await probe();
    if (result.kind === 'pineclinic') {
      if (result.body.apiVersion !== API_VERSION) {
        setStatus({ state: 'error', detail: `Servis API v${result.body.apiVersion} yönetici v${API_VERSION} ile uyumsuz.` });
        return;
      }
      setStatus({ state: 'running', detail: '', engine: result.body.engine, provider: result.body.provider, adopted: false });
      pushLog(`Servis sağlık kontrolü başarılı. Backend kodu ${result.body.codeVersion || 'bilinmiyor'} (API v${result.body.apiVersion}).`);
      void watchEvents('manager');
      return;
    }
  }
  setStatus({ state: 'error', detail: 'Servis 60 saniye içinde yanıt vermedi. Aşağıdaki günlüğü kontrol edin.' });
}

function activeWork() {
  const running = status.jobs.filter((j) => j.state === 'queued' || j.state === 'running').length;
  return { running, viewers: status.viewers, datasets: status.datasets.length };
}

async function stopService({ force = false } = {}) {
  const child = service;
  if (!child) {
    eventAbort?.abort();
    setStatus({ state: 'stopped', apiBase: '', detail: '', ...clearLive() });
    return true;
  }
  const work = activeWork();
  if (!force && (work.running || work.viewers)) {
    const parts = [];
    if (work.running) parts.push(`${work.running} aktif AI analizi`);
    if (work.viewers) parts.push(`${work.viewers} açık görüntüleyici sekmesi`);
    const { response } = await dialog.showMessageBox(windowRef, {
      type: 'warning',
      buttons: ['Servisi Durdur', 'Vazgeç'],
      defaultId: 1,
      cancelId: 1,
      message: 'Yerel servis durdurulsun mu?',
      detail: `${parts.join(' ve ')} bulunuyor. Servis durdurulduğunda yeni yükleme yapmak için tekrar başlatmanız gerekir.`,
    });
    if (response !== 0) return false;
  }
  stopping = true;
  setStatus({ state: 'stopping' });
  pushLog('Servis durduruluyor…');
  const exited = new Promise((resolve) => child.once('exit', resolve));
  fetch(`${BASE}/api/control/shutdown`, {
    method: 'POST',
    headers: { 'X-Control-Token': controlToken },
    signal: AbortSignal.timeout(2000),
  }).catch(() => undefined);
  const outcome = await Promise.race([exited.then(() => 'exited'), new Promise((r) => setTimeout(() => r('timeout'), 3000))]);
  if (outcome === 'timeout') {
    if (process.platform === 'win32' && child.pid) {
      try {
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      } catch (_) {}
    } else {
      try { child.kill(); } catch (_) {}
    }
    const second = await Promise.race([exited.then(() => 'exited'), new Promise((r) => setTimeout(() => r('timeout'), 3000))]);
    if (second === 'timeout') {
      try { child.kill('SIGKILL'); } catch (_) {}
      await Promise.race([exited, new Promise((r) => setTimeout(r, 2000))]);
    }
  }
  service = undefined;
  eventAbort?.abort();
  stopping = false;
  setStatus({ state: 'stopped', apiBase: '', detail: '', ...clearLive() });
  pushLog('Servis kullanıcı tarafından durduruldu.');
  return true;
}

function createWindow() {
  windowRef = new BrowserWindow({
    width: 760,
    height: 760,
    minWidth: 620,
    minHeight: 560,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  windowRef.on('closed', () => { windowRef = undefined; });
  windowRef.webContents.on('render-process-gone', (_event, details) => pushLog(`Yönetici penceresi kapandı: ${details.reason}`));
  windowRef.loadFile(path.join(__dirname, 'service-manager.html'));
}

// `pineclinic://start` protokolü web arayüzünden masaüstü uygulamasını uyandırır.
const PROTOCOL = 'pineclinic';
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

let pendingLaunch = process.argv.some((arg) => arg.startsWith(`${PROTOCOL}://`));
function handleLaunchUrl(url) {
  if (!String(url).startsWith(`${PROTOCOL}://`)) return;
  pushLog(`Web arayüzünden başlatma isteği alındı: ${url}`);
  if (!status || status.state === 'stopped' || status.state === 'error') {
    startService().catch((error) => pushLog(`Otomatik başlatma hatası: ${error.message}`));
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (windowRef && !windowRef.isDestroyed()) {
      if (windowRef.isMinimized()) windowRef.restore();
      windowRef.focus();
    } else if (app.isReady()) {
      createWindow();
    }
    const url = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (url) handleLaunchUrl(url);
  });
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (app.isReady()) handleLaunchUrl(url);
    else pendingLaunch = true;
  });
}

app.whenReady().then(() => {
  ipcMain.handle('service:status', () => status);
  ipcMain.handle('service:start', startService);
  ipcMain.handle('service:stop', () => stopService());
  ipcMain.handle('service:cancel-job', async (_event, jobId) => {
    try {
      await fetch(`${BASE}/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST', signal: AbortSignal.timeout(2000) });
    } catch (_) {}
  });
  ipcMain.handle('service:release-dataset', async (_event, datasetId) => {
    try {
      await fetch(`${BASE}/api/datasets/${encodeURIComponent(datasetId)}`, { method: 'DELETE', signal: AbortSignal.timeout(2000) });
    } catch (_) {}
  });
  MANAGER_VERSION = managerCodeVersion();
  pushLog(`PineClinic Lokal Servisler yönetici kodu ${MANAGER_VERSION}.`);
  createWindow();
  // Açılışta çalışan servisi kontrol et veya `pineclinic://start` ile başlat
  if (pendingLaunch) {
    handleLaunchUrl(`${PROTOCOL}://start`);
  } else {
    probe().then((res) => {
      if (res.kind === 'pineclinic' && res.body.apiVersion === API_VERSION) {
        void startService();
      }
    });
  }
});

app.on('window-all-closed', () => { app.quit(); });
let quitting = false;
app.on('before-quit', (event) => {
  if (quitting || !service) return;
  event.preventDefault();
  quitting = true;
  stopService({ force: true }).finally(() => app.quit());
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
