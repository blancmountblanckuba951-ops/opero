'use strict';

const { app, BrowserWindow, ipcMain, dialog, nativeTheme, clipboard, shell, Menu, screen, nativeImage, protocol, net } = require('electron');
// 3.3: lokalny silnik pisma (Tesseract, Apache-2.0) serwowany z folderu programu własnym
// protokołem — tylko pliki z vendor/tesseract, nic z sieci.
try { protocol.registerSchemesAsPrivileged([{ scheme: 'opero-ocr', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]); } catch {}
const licencja = require('./licencja-offline.js');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFile, execFileSync } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const QRCode = require('./vendor/QRCode');
const QRErrorCorrectLevel = require('./vendor/QRCode/QRErrorCorrectLevel');

// OPERO 1.0 zachowuje dane użytkownika z wcześniejszych wersji OperatAI / OPERO.
const legacyUserData = path.join(app.getPath('appData'), 'OperatAI');
app.setPath('userData', legacyUserData);

// Tryb diagnostyczny (F12 / DevTools, nadpisywanie adresów serwerów przez zmienne środowiskowe)
// jest dostępny wyłącznie poza spakowaną wersją albo po jawnym włączeniu flagą.
const DEBUG_MODE = !app.isPackaged || process.env.OPERO_DEBUG === '1' || process.argv.includes('--opero-debug');

let mainWindow;

// -----------------------------
// Dziennik błędów procesu głównego: %APPDATA%\OperatAI\logs\opero.log
function logFilePath() { return path.join(app.getPath('userData'), 'logs', 'opero.log'); }
function logToFile(level, ...parts) {
  try {
    const file = logFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try { const st = fs.statSync(file); if (st.size > 2 * 1024 * 1024) fs.renameSync(file, file.replace(/\.log$/, '.old.log')); } catch {}
    const line = `${new Date().toISOString()} [${level}] ${parts.map(x => x instanceof Error ? (x.stack || x.message) : (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`;
    fs.appendFileSync(file, line, 'utf8');
  } catch {}
}
process.on('uncaughtException', (e) => { logToFile('FATAL', 'uncaughtException', e); });
process.on('unhandledRejection', (e) => { logToFile('ERROR', 'unhandledRejection', e); });

// Tylko jedna instancja OPERO może pracować na danych użytkownika (history.json, accounts.json).
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// -----------------------------
// Zapamiętywanie rozmiaru i położenia okna.
function windowStatePath() { return path.join(app.getPath('userData'), 'window-state.json'); }
function loadWindowState() {
  const st = safeJsonRead(windowStatePath(), {});
  const out = { width: 1540, height: 980, maximized: false };
  if (st && typeof st === 'object') {
    if (Number(st.width) >= 1120 && Number(st.height) >= 720) { out.width = Math.round(Number(st.width)); out.height = Math.round(Number(st.height)); }
    if (Number.isFinite(Number(st.x)) && Number.isFinite(Number(st.y))) {
      // Przywróć położenie tylko wtedy, gdy okno mieści się na jednym z aktualnych ekranów.
      const x = Math.round(Number(st.x)), y = Math.round(Number(st.y));
      const visible = screen.getAllDisplays().some(d => {
        const a = d.workArea; return x >= a.x - 40 && y >= a.y - 40 && x + 200 <= a.x + a.width && y + 100 <= a.y + a.height;
      });
      if (visible) { out.x = x; out.y = y; }
    }
    out.maximized = !!st.maximized;
  }
  return out;
}
function saveWindowState(win) {
  try {
    if (!win || win.isDestroyed()) return;
    const maximized = win.isMaximized();
    const b = maximized ? (win.getNormalBounds ? win.getNormalBounds() : win.getBounds()) : win.getBounds();
    safeJsonWrite(windowStatePath(), { x: b.x, y: b.y, width: b.width, height: b.height, maximized });
  } catch {}
}

function createWindow() {
  const st = loadWindowState();
  mainWindow = new BrowserWindow({
    width: st.width,
    height: st.height,
    x: st.x,
    y: st.y,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    title: 'OPERO — operaty szacunkowe',
    backgroundColor: '#17140e',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      devTools: DEBUG_MODE,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => { if (st.maximized) mainWindow.maximize(); mainWindow.show(); });
  // Linki otwierane z interfejsu (np. w podglądzie raportu) trafiają do domyślnej przeglądarki,
  // a nie do nowego okna Electrona.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(String(url || ''))) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!String(url || '').startsWith('file://')) { e.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {}); }
  });
  // Blokada przypadkowego powiększania interfejsu (Ctrl + kółko myszy / gesty).
  mainWindow.webContents.on('did-finish-load', () => { try { mainWindow.webContents.setVisualZoomLevelLimits(1, 1); } catch {} });
  mainWindow.webContents.on('before-input-event', (e, input) => {
    if (DEBUG_MODE && input.type === 'keyDown' && input.key === 'F12') { mainWindow.webContents.toggleDevTools(); e.preventDefault(); }
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => logToFile('ERROR', 'render-process-gone', details));
  // Błędy interfejsu trafiają do dziennika — bez tego awaria po stronie okna nie zostawia śladu.
  mainWindow.webContents.on('console-message', (e) => {
    const level = String(e?.level ?? '');
    if (level === 'error' || level === 'warning' || level === '2' || level === '3') {
      logToFile(level === 'error' || level === '3' ? 'ERROR' : 'WARN', 'renderer', `${e.message} (${e.sourceId}:${e.lineNumber})`);
    }
  });
  let stateTimer = null;
  const scheduleState = () => { clearTimeout(stateTimer); stateTimer = setTimeout(() => saveWindowState(mainWindow), 400); };
  mainWindow.on('resize', scheduleState); mainWindow.on('move', scheduleState);
  mainWindow.on('maximize', scheduleState); mainWindow.on('unmaximize', scheduleState);
  mainWindow.on('close', () => { clearTimeout(stateTimer); saveWindowState(mainWindow); });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// OPERO jest programem polskim — wymuszamy polski jezyk interfejsu Chromium,
// zeby pola daty pokazywaly dd.mm.rrrr niezaleznie od jezyka Windows.
app.commandLine.appendSwitch('lang', 'pl-PL');

app.whenReady().then(() => {
  if (!singleInstance) return;
  Menu.setApplicationMenu(null);
  nativeTheme.themeSource = 'light';
  // Przeniesienie danych z układu z kontami (<= 1.4.x) musi nastąpić zanim okno
  // odczyta Historię, inaczej użytkownik zobaczyłby pustą listę operatów.
  try { migrateAccountsToSingleWorkspace(); } catch (e) { logToFile('ERROR', 'migracja przy starcie', e); }
  createWindow();
  try { bibliaZasiej(); } catch (e) { logToFile('ERROR', 'biblia z programu', e); }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('child-process-gone', (_e, details) => logToFile('ERROR', 'child-process-gone', details));

function rootUserData() { return app.getPath('userData'); }
// Od 1.5.0 nie ma kont — wszystkie dane leżą wprost w katalogu danych użytkownika.
function settingsPath() { return path.join(rootUserData(), 'settings.json'); }
function historyPath() { return path.join(rootUserData(), 'history.json'); }
function licenseStatePath() { return path.join(rootUserData(), 'license.json'); }
function deviceStatePath() { return path.join(rootUserData(), 'device.json'); }
function projectsDir() { return path.join(rootUserData(), 'projects'); }
function productionConfigPath() { return path.join(__dirname, 'config.production.json'); }
let productionConfigCache = null;
function productionConfig() {
  if (productionConfigCache) return productionConfigCache;
  const file = safeJsonRead(productionConfigPath(), {});
  // Wiedza jedzie w instalatorze, a licencja sprawdza sie na miejscu. Jedyne
  // miejsce, w ktorym program siega do sieci przy licencji, to JEDNORAZOWA
  // nigdy, takze gdy serwer spi.
  productionConfigCache = {
    productVersion: String(file.productVersion || app.getVersion()),
    knowledgeVersionCode: String(file.knowledgeVersionCode || 'KB-2026.09.01-v1').trim(),
    licenseApiVersion: Number(file.licenseApiVersion || 2),
    aktualizacjeRepo: String(file.aktualizacjeRepo || '').trim(),
    modelAktualizacjaUrl: String(file.modelAktualizacjaUrl || '').trim(),
    // Maly plik JSON z opisem NAJNOWSZEGO modelu. Bez niego program nie ma skad
    // wiedziec, ze cokolwiek sie zmienilo — i uczciwie mowi „nie sprawdzono".
    modelManifestUrl: String(file.modelManifestUrl || '').trim(),
    aktualizacjeStrona: String(file.aktualizacjeStrona || '').trim(),
  };
  return productionConfigCache;
}

function safeJsonRead(file, fallback = null) {
  // Znacznik kolejnosci bajtow (BOM) z plikow pisanych w PowerShellu wywracal
  // tu kazdy odczyt, a `catch` zamieniał to w ciche „pliku nie ma".
  try {
    const tekst = fs.readFileSync(file, 'utf8');
    return JSON.parse(tekst.charCodeAt(0) === 0xFEFF ? tekst.slice(1) : tekst);
  } catch { return fallback; }
}
function safeJsonWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload = JSON.stringify(data, null, 2);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmp, payload, 'utf8');
    try { fs.renameSync(tmp, file); }
    catch { fs.copyFileSync(tmp, file); fs.rmSync(tmp, { force: true }); }
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch {}
  }
}
function cleanNumber(v) {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
function costSummary(project) {
  const c = project?.costing || {};
  const labor = cleanNumber(c.hours) * cleanNumber(c.hourlyRate);
  const travel = cleanNumber(c.travelKm) * cleanNumber(c.costPerKm);
  const direct = cleanNumber(c.documentsCost) + cleanNumber(c.printingCost) + cleanNumber(c.toolsCost ?? c.aiCost) + cleanNumber(c.otherCost);
  const totalCost = labor + travel + direct;
  const feeNet = cleanNumber(c.clientFeeNet);
  const vatRate = cleanNumber(c.vatRate);
  const vat = c.vatExempt ? 0 : feeNet * vatRate / 100;
  const feeGross = feeNet + vat;
  const profit = feeNet - totalCost;
  const margin = feeNet ? profit / feeNet * 100 : 0;
  return { labor, travel, direct, totalCost, feeNet, vat, feeGross, profit, margin };
}
function normalizeProject(project) {
  const p = project && typeof project === 'object' ? project : {};
  p.meta = p.meta || {};
  if (!p.meta.id) p.meta.id = crypto.randomUUID();
  if (!p.meta.createdAt) p.meta.createdAt = new Date().toISOString();
  p.meta.updatedAt = new Date().toISOString();
  if (!p.meta.status || p.meta.status === 'TEST QA') p.meta.status = 'Roboczy';
  delete p.meta.qaScenario;
  delete p.meta.qaLabel;
  p.files = Array.isArray(p.files) ? p.files : [];
  p.photos = Array.isArray(p.photos) ? p.photos : [];
  return p;
}
function historyIndex() {
  const raw = safeJsonRead(historyPath(), []);
  return Array.isArray(raw) ? raw : [];
}
function historyEntry(project, extra = {}) {
  const p = project.property || {};
  const calc = extra.calc || {};
  const costs = costSummary(project);
  const title = [p.city, p.street ? `ul. ${p.street} ${p.buildingNo || ''}`.trim() : '', p.localNo ? `lok. ${p.localNo}` : ''].filter(Boolean).join(' - ') || 'Operat bez adresu';
  return {
    id: project.meta.id,
    title,
    city: p.city || '',
    street: p.street || '',
    buildingNo: p.buildingNo || '',
    localNo: p.localNo || '',
    kw: project.legal?.kwLocal || '',
    status: project.meta.status || 'Roboczy',
    createdAt: project.meta.createdAt,
    updatedAt: project.meta.updatedAt,
    valueRounded: cleanNumber(calc.valueRounded ?? project.meta.lastValueRounded),
    unitValue: cleanNumber(calc.unitAfterRound ?? project.meta.lastUnitValue),
    totalCost: costs.totalCost,
    feeNet: costs.feeNet,
    profit: costs.profit,
    pdfPath: extra.pdfPath || project.meta.lastPdfPath || '',
    // Klient w spisie Historii. Bez tego zakladka Klienci musialaby otwierac
    // KAZDY zapisany operat, zeby sprawdzic, czyj jest - przy stu operatach
    // znaczyloby to wczytanie stu plikow na jedno wejscie w zakladke.
    // Stare wpisy tych pol nie maja i to jest w porzadku: pokazuja sie wtedy
    // jako operaty bez przypisanego klienta, dopoki nie zostana zapisane na nowo.
    clientId: textField(project.client?.id, 64),
    clientName: textField(project.client?.kind === 'firma'
      ? [project.client?.company, project.client?.name].filter(Boolean).join(' · ')
      : [project.client?.name, project.client?.company].filter(Boolean).join(' · '), 200),
  };
}
function saveToHistory(project, extra = {}) {
  const normalized = normalizeProject(project);
  if (extra.calc) {
    normalized.meta.lastValueRounded = cleanNumber(extra.calc.valueRounded);
    normalized.meta.lastUnitValue = cleanNumber(extra.calc.unitAfterRound);
  }
  if (extra.pdfPath) normalized.meta.lastPdfPath = extra.pdfPath;
  fs.mkdirSync(projectsDir(), { recursive: true });
  const projectFile = path.join(projectsDir(), `${normalized.meta.id}.opero.json`);
  safeJsonWrite(projectFile, normalized);
  const idx = historyIndex();
  const entry = historyEntry(normalized, extra);
  const pos = idx.findIndex(x => x.id === entry.id);
  if (pos >= 0) idx[pos] = entry; else idx.unshift(entry);
  idx.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  safeJsonWrite(historyPath(), idx);
  return { entry, projectFile };
}
function historyStats(entries) {
  return entries.reduce((a, x) => {
    a.count += 1;
    a.totalCost += cleanNumber(x.totalCost);
    a.totalFees += cleanNumber(x.feeNet);
    a.totalProfit += cleanNumber(x.profit);
    return a;
  }, { count: 0, totalCost: 0, totalFees: 0, totalProfit: 0 });
}


function projectHasMeaningfulData(project) {
  if (!project) return false;
  const p = project.property || {}, l = project.legal || {};
  return !!(String(p.city||'').trim() || String(p.street||'').trim() || String(p.localNo||'').trim() || Number(p.usableArea||0) > 0 || String(l.kwLocal||'').trim() || (project.market?.transactions||[]).length);
}
// Odcisk ostatnio zapisanej treści projektu — autozapis nie przepisuje na dysk identycznych danych
// (projekty z fotografiami potrafią mieć kilkadziesiąt MB).
const lastAutosaveDigest = new Map();
function projectDigest(project) {
  const clone = { ...project, meta: { ...(project?.meta || {}) } };
  delete clone.meta.updatedAt;
  return crypto.createHash('sha1').update(JSON.stringify(clone)).digest('hex');
}
function writeAutosave(project) {
  requireActiveLicense();
  if (!projectHasMeaningfulData(project)) return { ok: true, skipped: true, savedAt: new Date().toISOString() };
  const id = String(project?.meta?.id || '');
  const digest = projectDigest(project);
  const key = id;
  if (id && lastAutosaveDigest.get(key) === digest && fs.existsSync(path.join(projectsDir(), `${id}.opero.json`))) return { ok: true, skipped: true, unchanged: true, savedAt: new Date().toISOString() };
  const calcMeta = { valueRounded: cleanNumber(project?.meta?.lastValueRounded), unitAfterRound: cleanNumber(project?.meta?.lastUnitValue) };
  const saved = saveToHistory(project, { calc: calcMeta, autosave: true });
  if (id) lastAutosaveDigest.set(key, digest);
  return { ok: true, savedAt: new Date().toISOString(), entry: saved.entry };
}
ipcMain.handle('project:autosave', async (_e, project) => writeAutosave(project));
ipcMain.on('project:autosave-now', (_e, project) => { try { writeAutosave(project); } catch (e) { logToFile('WARN', 'autosave-now', e); } });
// -----------------------------
// Kopia zapasowa danych użytkownika.
// Operat szacunkowy jest dokumentem, za który rzeczoznawca odpowiada zawodowo, a wszystkie
// dane OPERO leżą wyłącznie na jednym dysku — bez kopii awaria dysku oznacza utratę całej
// historii. Kopiujemy cały katalog danych (operaty, Historia, konta, ustawienia).
function folderStats(dir) {
  let files = 0, bytes = 0;
  const walk = (d) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) { files++; try { bytes += fs.statSync(full).size; } catch {} }
    }
  };
  walk(dir);
  return { files, bytes };
}
function backupFolderName() {
  const d = new Date(), pad = (n) => String(n).padStart(2, '0');
  return `OPERO-kopia-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}
ipcMain.handle('backup:create', async () => {
  const src = rootUserData();
  if (!fs.existsSync(src)) throw new Error('Nie znaleziono katalogu danych OPERO. Czy zapisano już jakikolwiek operat?');
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: 'Wybierz miejsce zapisu kopii zapasowej OPERO',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Zapisz kopię tutaj',
  });
  if (picked.canceled || !picked.filePaths?.[0]) return { canceled: true };
  const destRoot = picked.filePaths[0];
  // Kopia do wnętrza katalogu danych zapętliłaby kopiowanie.
  const rel = path.relative(src, destRoot);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    throw new Error('Nie można zapisać kopii wewnątrz katalogu danych OPERO. Wybierz inne miejsce, np. dysk zewnętrzny.');
  }
  let dest = path.join(destRoot, backupFolderName());
  let n = 2;
  while (fs.existsSync(dest)) dest = path.join(destRoot, `${backupFolderName()}-${n++}`);
  const before = folderStats(src);
  try {
    fs.cpSync(src, dest, { recursive: true, errorOnExist: false, force: true });
  } catch (e) {
    logToFile('ERROR', 'backup:create', e);
    throw new Error(`Nie udało się zapisać kopii: ${e.message}`);
  }
  const after = folderStats(dest);
  safeJsonWrite(path.join(dest, 'OPERO-kopia-info.json'), {
    utworzono: new Date().toISOString(),
    wersjaOpero: productionConfig().productVersion,
    katalogZrodlowy: src,
    plikow: after.files,
    bajtow: after.bytes,
    jakPrzywrocic: 'Zamknij OPERO i skopiuj zawartość tego folderu do %APPDATA%\\OperatAI, zastępując istniejące pliki.',
  });
  logToFile('INFO', 'backup', dest, `${after.files} plikow, ${after.bytes} B`);
  return { canceled: false, path: dest, files: after.files, bytes: after.bytes, sourceFiles: before.files };
});
ipcMain.handle('app:open-data-folder', async () => {
  const dir = rootUserData();
  fs.mkdirSync(dir, { recursive: true });
  const err = await shell.openPath(dir);
  if (err) throw new Error(err);
  return { ok: true, path: dir };
});
ipcMain.handle('app:open-log', async () => {
  const file = logFilePath();
  if (!fs.existsSync(file)) return { ok: false, empty: true, path: file };
  const err = await shell.openPath(file);
  if (err) throw new Error(err);
  return { ok: true, path: file };
});
ipcMain.handle('app:info', async () => ({
  version: productionConfig().productVersion,
  appVersion: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  platform: process.platform,
  arch: process.arch,
  debug: DEBUG_MODE,
  userData: rootUserData(),
  logFile: logFilePath(),
  modelAktualizacjaUrl: productionConfig().modelAktualizacjaUrl,
  modelManifestUrl: productionConfig().modelManifestUrl,
}));
// Identyfikatory projektów pochodzą z renderera — dopuszczamy wyłącznie bezpieczne znaki,
// żeby nie dało się zbudować ścieżki poza katalogiem projektów.
function safeProjectId(id) {
  const sid = String(id ?? '').trim();
  if (!/^[A-Za-z0-9_.-]{1,120}$/.test(sid) || sid.startsWith('.')) throw new Error('Nieprawidłowy identyfikator operatu.');
  return sid;
}
ipcMain.handle('project:save', async (_e, project) => {
  const normalized = normalizeProject(project);
  const defaultName = `operat_${String(normalized?.property?.city || 'lokal').replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_-]+/g, '_')}.opero.json`;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Eksportuj kopię projektu OPERO', defaultPath: defaultName,
    filters: [{ name: 'Projekt OPERO', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  safeJsonWrite(result.filePath, normalized);
  return { canceled: false, filePath: result.filePath };
});
ipcMain.handle('project:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Otwórz projekt OPERO', properties: ['openFile'],
    filters: [{ name: 'Projekt OPERO', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const data = safeJsonRead(result.filePaths[0], null);
  if (!data) throw new Error('Nie udało się odczytać projektu.');
  return { canceled: false, filePath: result.filePaths[0], project: normalizeProject(data) };
});


ipcMain.handle('history:save', async (_e, payload) => {
  const result = saveToHistory(payload?.project || payload, { calc: payload?.calc, pdfPath: payload?.pdfPath });
  return { ok: true, ...result };
});
ipcMain.handle('history:list', async () => {
  const entries = historyIndex();
  return { entries, stats: historyStats(entries) };
});
ipcMain.handle('history:open', async (_e, id) => {
  const sid=safeProjectId(id);
  const current = path.join(projectsDir(), `${sid}.opero.json`);
  const legacy = path.join(projectsDir(), `${sid}.operatai.json`);
  const file = fs.existsSync(current) ? current : legacy;
  const project = safeJsonRead(file, null);
  if (!project) throw new Error('Nie znaleziono zapisanego operatu.');
  return { project: normalizeProject(project), filePath: file };
});
ipcMain.handle('history:delete', async (_e, id) => {
  const sid = safeProjectId(id);
  lastAutosaveDigest.delete(sid);
  const entries = historyIndex().filter(x => x.id !== sid);
  safeJsonWrite(historyPath(), entries);
  try { fs.rmSync(path.join(projectsDir(), `${sid}.opero.json`), { force: true }); } catch {}
  try { fs.rmSync(path.join(projectsDir(), `${sid}.operatai.json`), { force: true }); } catch {}
  return { ok: true, stats: historyStats(entries) };
});



function normalizeKwNumber(value) {
  const raw = String(value || '').toUpperCase().replace(/\s+/g, '');
  const m = raw.match(/^([A-Z0-9]{4})\/?([0-9]{1,8})\/?([0-9])$/);
  if (!m) return raw;
  return `${m[1]}/${m[2].padStart(8, '0')}/${m[3]}`;
}

ipcMain.handle('kw:copy-number', async (_e, kwNo) => {
  const value = normalizeKwNumber(kwNo);
  clipboard.writeText(value);
  return { ok: true, value };
});

ipcMain.handle('clipboard:read-text', async () => ({ text: clipboard.readText() || '' }));

ipcMain.handle('kw:open-official', async (_e, kwNo) => {
  const value = normalizeKwNumber(kwNo);
  if (value) clipboard.writeText(value);
  const url = 'https://ekw.ms.gov.pl/';
  await shell.openExternal(url);
  return {
    ok: true,
    kwNo: value,
    url,
    external: true,
    message: 'Oficjalny portal EKW otwarto w domyslnej przegladarce. Numer KW skopiowano do schowka.'
  };
});

/* ============================================================
   WLASNA BAZA TRANSAKCJI

   Zwykly plik JSON obok reszty danych uzytkownika. Czytelny notatnikiem,
   latwy do skopiowania na drugi komputer i do kopii zapasowej. Zadnej bazy
   danych, zadnej chmury - to sa dane rzeczoznawcy, zbierane latami, i maja
   zostac na jego dysku.

   Uszkodzonego pliku NIE traktujemy jak pustego: pierwszy zapis skasowalby
   dorobek kilku lat. Odkladamy go obok i mowimy o tym wprost.
   ============================================================ */
const bazaLogika = require('./renderer/baza.js');

function bazaPath() { return path.join(rootUserData(), 'baza-transakcji.json'); }

function czytajBaze() {
  const plik = bazaPath();
  if (!fs.existsSync(plik)) return { wpisy: [], uszkodzony: null };
  let tekst = '';
  try { tekst = fs.readFileSync(plik, 'utf8'); } catch (e) { throw new Error(`Nie moge odczytac bazy transakcji: ${e.message}`); }
  if (!tekst.trim()) return { wpisy: [], uszkodzony: null };
  try {
    const dane = JSON.parse(tekst.charCodeAt(0) === 0xFEFF ? tekst.slice(1) : tekst);
    const wpisy = Array.isArray(dane) ? dane : Array.isArray(dane.wpisy) ? dane.wpisy : null;
    if (!wpisy) throw new Error('oczekiwano listy transakcji');
    return { wpisy: wpisy.filter(x => x && typeof x === 'object'), uszkodzony: null };
  } catch (e) {
    const kopia = `${plik}.uszkodzony-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    try { fs.copyFileSync(plik, kopia); } catch {}
    logToFile('ERROR', 'Baza transakcji uszkodzona', String(e?.message || e), kopia);
    return { wpisy: [], uszkodzony: kopia };
  }
}

function zapiszBaze(wpisy) {
  safeJsonWrite(bazaPath(), { wersja: 1, zapisano: new Date().toISOString(), wpisy });
  return wpisy.length;
}

ipcMain.handle('baza:lista', async (_e, filtr) => {
  const { wpisy, uszkodzony } = czytajBaze();
  const wybrane = bazaLogika.filtruj(wpisy, filtr || {});
  return {
    wpisy: wybrane.slice(0, 2000),
    ile: wybrane.length,
    razem: wpisy.length,
    statystyki: bazaLogika.statystyki(wpisy),
    statystykiWyboru: bazaLogika.statystyki(wybrane),
    uszkodzony,
  };
});

ipcMain.handle('baza:dodaj', async (_e, ladunek) => {
  requireActiveLicense();
  const nowe = bazaLogika.zWyciagu((ladunek && ladunek.wiersze) || [], { plik: ladunek && ladunek.plik });
  const { wpisy } = czytajBaze();
  const wynik = bazaLogika.scal(wpisy, nowe);
  zapiszBaze(wynik.wpisy);
  logToFile('INFO', `Baza transakcji: +${wynik.dodane}, pominieto ${wynik.pominiete}, razem ${wynik.wpisy.length}`);
  return { dodane: wynik.dodane, pominiete: wynik.pominiete, razem: wynik.wpisy.length };
});

ipcMain.handle('baza:usun', async (_e, idki) => {
  requireActiveLicense();
  const doUsuniecia = new Set((Array.isArray(idki) ? idki : [idki]).map(String));
  const { wpisy } = czytajBaze();
  const zostaja = wpisy.filter(t => !doUsuniecia.has(String(t.id)));
  zapiszBaze(zostaja);
  return { usuniete: wpisy.length - zostaja.length, razem: zostaja.length };
});

ipcMain.handle('baza:dopasuj', async (_e, przedmiot) => {
  const { wpisy } = czytajBaze();
  const kandydaci = bazaLogika.dopasuj(wpisy, przedmiot || {});
  return { kandydaci: kandydaci.slice(0, 200), ile: kandydaci.length, razem: wpisy.length };
});

ipcMain.handle('baza:eksport', async (_e, filtr) => {
  const { wpisy } = czytajBaze();
  const wybrane = bazaLogika.filtruj(wpisy, filtr || {});
  const r = await dialog.showSaveDialog(mainWindow, {
    title: 'Zapisz bazę transakcji',
    defaultPath: `baza-transakcji-${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: 'Arkusz CSV', extensions: ['csv'] }],
  });
  if (r.canceled || !r.filePath) return { canceled: true };
  fs.writeFileSync(r.filePath, bazaLogika.doCsv(wybrane), 'utf8');
  return { canceled: false, filePath: r.filePath, ile: wybrane.length };
});

ipcMain.handle('baza:otworz-folder', async () => {
  const plik = bazaPath();
  if (fs.existsSync(plik)) shell.showItemInFolder(plik);
  else await shell.openPath(rootUserData());
  return { ok: true, plik };
});

/* ============================================================
   OD ADRESU DO DZIALKI (uslugi GUGiK)

   Jedyne miejsce w programie, ktore pyta o cokolwiek uslugi katastralne.
   Dzieje sie to WYLACZNIE po nacisnieciu przycisku przez czlowieka - program
   nie odpytuje niczego w tle i nie wysyla tam zadnych danych operatu poza
   samym adresem, ktory rzeczoznawca wpisal, zeby go wyszukac.

   Obie uslugi sa publiczne i nieodplatne (uldk.gugik.gov.pl,
   services.gugik.gov.pl/uug). Zadna z nich NIE ZWRACA numeru ksiegi
   wieczystej - numer KW jest w ewidencji dana chroniona. Dalsza droga do
   numeru jest w rendererze: wlasne zrodla, geoportal powiatowy, wniosek do
   starosty z art. 155 ust. 3 ugn.
   ============================================================ */
const dzialkaLogika = require('./renderer/dzialka.js');

async function pobierzTekst(url, timeoutMs = 15000) {
  const odp = await fetchWithTimeout(url, { headers: { 'accept': 'text/plain, application/json, */*' } }, timeoutMs, 'uldk');
  if (!odp.ok) throw new Error(zrodlaKontrola.komunikatHttp(odp.status, 'uldk'));
  return await odp.text();
}

/**
 * Wspolrzedne z geokodera podajemy ULDK w takiej kolejnosci, w jakiej przyszly,
 * a gdy pod tym punktem nic nie ma - probujemy raz jeszcze zamienione miejscami.
 * Uklad PUWG 1992 ma os X na polnoc, a roznie opisane zrodla roznie to podaja;
 * jedno dodatkowe zapytanie jest tansze niz kazanie rzeczoznawcy zgadywac,
 * czemu „nie znaleziono dzialki" dla adresu, ktory widzi na mapie.
 */
async function dzialkaZPunktu(x, y, logToFileFn) {
  let wynik = dzialkaLogika.dzialkiZOdpowiedzi(await pobierzTekst(dzialkaLogika.urlDzialkiPoXY(x, y)));
  if (!wynik.ok) {
    try {
      const drugi = dzialkaLogika.dzialkiZOdpowiedzi(await pobierzTekst(dzialkaLogika.urlDzialkiPoXY(y, x)));
      if (drugi.ok) return drugi;
    } catch (e) { logToFileFn?.('WARN', 'ULDK zamienione wspolrzedne', String(e?.message || e)); }
  }
  return wynik;
}

/* --- Transakcje z Rejestru Cen Nieruchomosci (usluga GUGiK) ---------------
   Od lutego 2026 GUGiK udostepnia RCN w geoportal.gov.pl takze jako usluge
   sieciowa: bezplatnie i bez logowania. To te same ceny z aktow notarialnych,
   co w wyciagu ze starostwa. Pytanie leci WYLACZNIE po nacisnieciu przycisku
   i nie wysyla tam zadnych danych operatu - tylko wspolrzedne obszaru. */
const rcnGeo = require('./renderer/rcn-geoportal.js');

let rcnOsOdwrotna = false;   // ktora kolejnosc osi zadzialala ostatnio - od niej zaczynamy
const RCN_LIMIT_STRON = 6; // do 6000 obiektow na rodzaj
function rcnPoliczObiekty(gml){
  const m = String(gml || '').match(/<(?:[A-Za-z0-9_]+:)?member[\s>]/g);
  return m ? m.length : 0;
}
function rcnBezPowtorzen(lista){
  const widziane = new Set(), out = [];
  for (const t of lista || []){
    const k = [t.akt || '', t.adres || '', t.data || '', t.cena || '', t.powierzchnia || '', t.rodzajObiektu || ''].join('|');
    if (k.replace(/\|/g, '') && widziane.has(k)) continue;
    widziane.add(k); out.push(t);
  }
  return out;
}

async function rcnZapytanie(zapytanie) {
  const q = zapytanie || {};
  const bboxPodany = (Array.isArray(q.bbox) && q.bbox.length === 4) ? q.bbox : rcnGeo.prostokat(q.x, q.y, q.promien);
  const rodzaje = Array.isArray(q.typy) && q.typy.length ? q.typy : ['lokale'];
  const maPunkt = Number.isFinite(Number(q.x)) && Number.isFinite(Number(q.y));

  const pobierz = async (bbox) => {
    const wszystkie = []; let pominieto = 0, blad = '', pola = [];
    // 3.1: stronicowanie (STARTINDEX). Rejestr oddaje maks. 1000 obiektow na raz -
    // w duzym obszarze lub dlugim okresie pobieramy kolejne strony, az do limitu.
    const STRONA = rcnGeo.MAKS_OBIEKTOW;
    const limit = Math.min(RCN_LIMIT_STRON * STRONA, Math.max(STRONA, Number(q.maks) || STRONA));
    for (const typ of rodzaje) {
      for (let od = 0; od < limit; od += STRONA) {
        const url = rcnGeo.urlTransakcji({ typ, bbox, ile: Math.min(STRONA, q.ile || STRONA), odKtorego: od, odDaty: q.odDaty || '' });
        logToFile('INFO', `RCN Geoportal: ${typ} od ${od}`, url);
        let tekst = '';
        try {
          const odp = await fetchWithTimeout(url, { headers: { accept: 'text/xml, application/gml+xml, */*' } }, 30000, 'rcn');
          if (!odp.ok) { blad = zrodlaKontrola.komunikatHttp(odp.status, 'rcn'); break; }
          tekst = await odp.text();
        } catch (e) {
          logToFile('WARN', 'RCN Geoportal', String(e?.message || e));
          blad = String(e?.message || e);
          break;
        }
        const wynik = rcnGeo.zGml(tekst, typ);
        if (!wynik.ok) { if (!od) blad = wynik.powod; break; }
        pominieto += wynik.pominieto || 0;
        if (wynik.pola?.length) { pola = wynik.pola; logToFile('INFO', `RCN Geoportal - pola (${typ})`, wynik.pola.join(', ')); }
        for (const t of wynik.transakcje) wszystkie.push({ ...t, rodzajObiektu: typ });
        const naStronie = Number(wynik.razem) || rcnPoliczObiekty(tekst);
        if (naStronie < STRONA) break;
      }
    }
    return { wszystkie: rcnBezPowtorzen(wszystkie), pominieto, blad, pola };
  };

  // Kolejnosc osi sprawdzamy na wyniku, nie zakladamy: obiekty musza lezec przy
  // punkcie wyceny. Jesli w pierwszej kolejnosci nie leza - pytamy w drugiej.
  const kolejnosci = rcnOsOdwrotna ? [true, false] : [false, true];
  let wybrane = null, uwagaOsi = '';
  for (const odwrotna of (maPunkt ? kolejnosci : [false])) {
    const bbox = odwrotna ? rcnGeo.prostokatOdwrotny(bboxPodany) : bboxPodany;
    const r = await pobierz(bbox);
    if (!maPunkt) { wybrane = { ...r, bbox }; break; }
    const u = rcnGeo.uzgodnij(r.wszystkie, { x: q.x, y: q.y, promien: q.promien });
    const zObszaru = rcnGeo.zgodnyTeryt(r.wszystkie, q.teryt);
    logToFile('INFO', 'RCN Geoportal - osie', `odwrotna=${odwrotna} razem=${r.wszystkie.length} terytZgodny=${zObszaru} oczekiwany=${q.teryt || '-'} wObszarze=${u.wObszarze} poza=${u.poza} bezPunktu=${u.bezPunktu}`);
    const kandydat = { wszystkie: u.transakcje, pominieto: r.pominieto + u.poza, blad: r.blad, bbox, zObszaru, u, pola: r.pola };
    if (zObszaru === true) { wybrane = kandydat; rcnOsOdwrotna = odwrotna; break; }
    // Bez punktow nie da sie sprawdzic - bierzemy pierwsza taka odpowiedz, ale tylko gdy druga nie okaze sie lepsza.
    if (!wybrane || (zObszaru === null && wybrane.zObszaru === false) || (kandydat.wszystkie.length && !wybrane.wszystkie.length && zObszaru !== false)) wybrane = kandydat;
  }
  if (wybrane.zObszaru === false) {
    // W zadnej kolejnosci osi transakcje nie sa z naszego powiatu: nie pokazujemy cudzych.
    wybrane.wszystkie = [];
    uwagaOsi = 'Rejestr zwrócił wyłącznie transakcje z innego powiatu niż wyceniana nieruchomość — pominąłem je wszystkie.';
  } else if (wybrane.zObszaru === null && wybrane.wszystkie.length) {
    uwagaOsi = 'Nie mogłem potwierdzić kodem powiatu, że te transakcje są z okolicy adresu — sprawdź adresy na liście.';
  }
  const wszystkie = wybrane.wszystkie;
  // Numeracja musi byc ciagla przez wszystkie rodzaje - inaczej dwie pozycje
  // maja ten sam numer wiersza i zaznaczanie w oknie importu wariuje.
  wszystkie.forEach((t, i) => { t.zrodloWiersz = i + 1; });
  const wynik = { ok: !wybrane.blad || wszystkie.length > 0, transakcje: wszystkie, pominieto: wybrane.pominieto, powod: wybrane.blad, bbox: wybrane.bbox };
  return { ...wynik, uwagaOsi, pola: wybrane.pola || [], komunikat: rcnGeo.komunikat(wynik, { powiat: q.powiat }) + (uwagaOsi ? ` ${uwagaOsi}` : ''), zrodlo: rcnGeo.opisZrodla() };
}


/* 3.2: BAZA RYNKU, KTORA BUDUJE SIE SAMA.
   Kazda odpowiedz rejestru (z operatu i ze zbieracza) trafia do wlasnej bazy
   transakcji — z oznaczeniem zrodla. Zbieracz w tle co kilka godzin pyta
   rejestr o obszary, w ktorych pracowales, takze gdy nie robisz operatu.
   Tylko otwarte, publiczne uslugi GUGiK; zadnego zbierania z portali ofert. */
const ZBIERACZ_CO_MS = 6 * 3600 * 1000, ZBIERACZ_PROMIEN = 5000, ZBIERACZ_MAKS_OBSZAROW = 25;
let zbieraczTrwa = false, zbieraczZegar = null;
function zbieraczStan(){ const z = readAppState().zbieracz || {}; return { wlaczony: z.wlaczony !== false, obszary: Array.isArray(z.obszary) ? z.obszary : [], ostatnio: z.ostatnio || null, dziennik: Array.isArray(z.dziennik) ? z.dziennik.slice(0, 30) : [] }; }
function zbieraczZapisz(zm){ writeAppState({ zbieracz: { ...zbieraczStan(), ...zm } }); }
function bazaDolozRcn(transakcje, opis){
  if (!Array.isArray(transakcje) || !transakcje.length) return { dodane: 0, razem: 0 };
  const nowe = bazaLogika.zWyciagu(transakcje.map(t => ({ ...t, uwagi: [...(t.uwagi || []), `Rodzaj obiektu w RCN: ${t.rodzajObiektu || '—'}`] })), { plik: opis || 'Rejestr Cen Nieruchomości (GUGiK, usługa WFS)' });
  const { wpisy, uszkodzony } = czytajBaze();
  if (uszkodzony) return { dodane: 0, razem: wpisy.length };
  const w = bazaLogika.scal(wpisy, nowe);
  if (w.dodane) zapiszBaze(w.wpisy);
  return { dodane: w.dodane, razem: w.wpisy.length };
}
function zbieraczZapamietaj(q, r){
  const x = Number(q?.x), y = Number(q?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const st = zbieraczStan();
  const klucz = `${Math.round(x / 2000)}:${Math.round(y / 2000)}`;
  const obszary = st.obszary.filter(o => o.klucz !== klucz);
  obszary.unshift({ klucz, x, y, teryt: q.teryt || '', powiat: q.powiat || '', miasto: q.miasto || r?.miasto || '', typy: ['lokale', 'budynki', 'dzialki'], dodano: new Date().toISOString() });
  zbieraczZapisz({ obszary: obszary.slice(0, ZBIERACZ_MAKS_OBSZAROW) });
}
async function zbieraczPrzebieg(powod){
  if (zbieraczTrwa) return { ok: false, powod: 'zbieracz już pracuje' };
  try { requireActiveLicense(); } catch { return { ok: false, powod: 'brak aktywnej licencji' }; }
  const st = zbieraczStan();
  if (!st.wlaczony && powod !== 'reczny') return { ok: false, powod: 'wyłączony' };
  if (!st.obszary.length) return { ok: true, dodane: 0, komunikat: 'Brak obszarów — pojawią się po pierwszym operacie (każdy adres wyceny staje się obszarem zbierania).' };
  zbieraczTrwa = true;
  let dodane = 0, pobrane = 0; const bledy = [];
  try {
    for (const o of st.obszary){
      try {
        const r = await rcnZapytanie({ x: o.x, y: o.y, promien: ZBIERACZ_PROMIEN, typy: o.typy || ['lokale', 'budynki', 'dzialki'], teryt: o.teryt, powiat: o.powiat, maks: 6000, odDaty: new Date(Date.now() - 10 * 365.25 * 864e5).toISOString().slice(0, 10) });
        pobrane += (r.transakcje || []).length;
        dodane += bazaDolozRcn(r.transakcje, `Rejestr Cen Nieruchomości (GUGiK) — zbieracz, obszar ${o.miasto || o.powiat || o.klucz}`).dodane;
        if (r.powod && !(r.transakcje || []).length) bledy.push(`${o.miasto || o.klucz}: ${r.powod}`);
      } catch (e) { bledy.push(`${o.miasto || o.klucz}: ${String(e?.message || e)}`); }
    }
  } finally { zbieraczTrwa = false; }
  const wpis = { kiedy: new Date().toISOString(), powod, obszarow: st.obszary.length, pobrane, dodane, bledy: bledy.slice(0, 5) };
  zbieraczZapisz({ ostatnio: wpis, dziennik: [wpis, ...st.dziennik].slice(0, 30) });
  logToFile('INFO', 'Zbieracz rynku', JSON.stringify(wpis));
  try { mainWindow?.webContents.send('zbieracz:koniec', wpis); } catch {}
  return { ok: true, ...wpis };
}
function zbieraczUruchom(){
  if (zbieraczZegar) return;
  setTimeout(() => { zbieraczPrzebieg('start').catch(() => {}); }, 3 * 60 * 1000);
  zbieraczZegar = setInterval(() => { zbieraczPrzebieg('co 6 godzin').catch(() => {}); }, ZBIERACZ_CO_MS);
}
app.whenReady().then(() => { try { zbieraczUruchom(); } catch {} });
app.whenReady().then(() => {
  const baza = path.join(__dirname, 'vendor', 'tesseract');
  try {
    protocol.handle('opero-ocr', (req) => {
      const u = new URL(req.url);
      const plik = path.resolve(baza, '.' + decodeURIComponent(u.pathname));
      if (plik !== baza && !plik.startsWith(baza + path.sep)) return new Response('zabronione', { status: 403 });
      return net.fetch(require('url').pathToFileURL(plik).toString());
    });
  } catch (e) { logToFile('WARN', 'OCR protokol', String(e?.message || e)); }
});

ipcMain.handle('rcn:geoportal', async (_e, zapytanie) => {
  requireActiveLicense();
  const r = await rcnZapytanie(zapytanie || {});
  try { const b = bazaDolozRcn(r.transakcje); r.bazaDodane = b.dodane; zbieraczZapamietaj(zapytanie, r); } catch (e) { logToFile('WARN', 'Baza z RCN', String(e?.message || e)); }
  return r;
});
ipcMain.handle('zbieracz:stan', async () => {
  const st = zbieraczStan(); const { wpisy } = czytajBaze();
  return { ...st, trwa: zbieraczTrwa, razem: wpisy.length, coGodzin: ZBIERACZ_CO_MS / 3600000, promien: ZBIERACZ_PROMIEN };
});
ipcMain.handle('zbieracz:teraz', async () => { requireActiveLicense(); return zbieraczPrzebieg('reczny'); });
ipcMain.handle('zbieracz:ustaw', async (_e, u) => { zbieraczZapisz({ wlaczony: u?.wlaczony !== false }); return zbieraczStan(); });

/* --- Podpowiedzi adresow z panstwowej uslugi geokodowania ---------------- */
const podpowiedziLogika = require('./renderer/podpowiedzi.js');

ipcMain.handle('adres:podpowiedzi', async (_e, zapytanie) => {
  const q = zapytanie || {};
  const url = podpowiedziLogika.zapytanie(q.fraza, { miasto: q.miasto });
  if (!url) return [];
  try {
    const odp = await fetchWithTimeout(url, { headers: { accept: 'application/json, */*' } }, 8000, 'uug');
    if (!odp.ok) return [];
    return podpowiedziLogika.zOdpowiedzi(await odp.text(), q.rodzaj || 'adres');
  } catch (e) {
    // Brak sieci nie moze przeszkodzic w pisaniu - podpowiedzi sa dodatkiem.
    logToFile('WARN', 'Podpowiedzi adresow', String(e?.message || e));
    return [];
  }
});

/* --- Ceny ofertowe deweloperow z dane.gov.pl ------------------------------
   Art. 19b ust. 1 ustawy deweloperskiej nakazuje deweloperom publikowac ceny
   lokali jako dane otwarte. Program bierze je WPROST ze zrodla, a nie od
   serwisow, ktore je przetwarzaja - wtedy w operacie da sie wskazac nazwe
   dewelopera, adres pliku i date cennika.

   Szukanie potrafi potrwac (katalog, zbiory, zasoby, pliki), dlatego kazdy
   krok leci do okna jako osobne zdarzenie. Cisza w programie zawsze wyglada
   jak awaria, a tu po prostu trwa pobieranie kilku cennikow.

   To sa CENY OFERTOWE. Do zbioru porownawczego nie wchodza i renderer tego
   pilnuje - tu tylko pobieramy i rozkladamy. */
const oferty = require('./renderer/oferty-dane-gov.js');
const xlsxCzytnik = require('./xlsx-czytnik.js');

function ofertyEtap(dane) {
  try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('oferty:etap', dane); } catch {}
}

async function ofertyPobierzJson(url, timeoutMs = 15000) {
  const odp = await fetchWithTimeout(url, { headers: { accept: 'application/json' } }, timeoutMs, 'dane-gov');
  if (!odp.ok) throw new Error(zrodlaKontrola.komunikatHttp(odp.status, 'dane-gov'));
  return await odp.text();
}

/** Plik cennika: CSV czytamy jako tekst, XLSX przez wlasny czytnik arkuszy. */
async function ofertyWczytajPlik(zasob, opcje) {
  const odp = await fetchWithTimeout(zasob.url, { headers: { accept: 'text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*' } }, 25000, 'dane-gov');
  if (!odp.ok) throw new Error(`Cennika „${zasob.tytul || 'bez nazwy'}" nie udalo sie pobrac (blad ${odp.status}).`);
  if (zasob.format === 'csv') return oferty.zCsv(await odp.text(), opcje);
  const bufor = Buffer.from(await odp.arrayBuffer());
  const tmp = path.join(app.getPath('temp'), `opero-cennik-${Date.now()}.xlsx`);
  try {
    fs.writeFileSync(tmp, bufor);
    const arkusze = xlsxCzytnik.czytaj(tmp);
    // Bierzemy arkusz, w ktorym da sie rozpoznac kolumne ceny - cenniki czesto
    // maja na pierwszej karcie instrukcje albo stopke, a dane dalej.
    let najlepszy = null;
    for (const a of arkusze) {
      const w = oferty.zWierszy(a.wiersze, opcje);
      if (w.ok && (!najlepszy || w.oferty.length > najlepszy.oferty.length)) najlepszy = w;
    }
    return najlepszy || oferty.zWierszy(arkusze[0]?.wiersze || [], opcje);
  } finally { try { fs.unlinkSync(tmp); } catch {} }
}

ipcMain.handle('oferty:szukaj', async (_e, zapytanie) => {
  requireActiveLicense();
  const q = zapytanie || {};
  const miasto = String(q.miasto || '').trim();
  const maksCennikow = Math.min(12, Math.max(1, Number(q.maksCennikow) || 6));
  const etapy = [];
  const krok = (id, dane) => {
    const wpis = { id, nazwa: (oferty.ETAPY.find(e => e.id === id) || {}).nazwa || id, opis: oferty.etapOpis(id, dane), ...dane };
    etapy.push(wpis); ofertyEtap(wpis); return wpis;
  };

  krok('katalog', { miasto });
  let zbiory = [];
  try {
    zbiory = oferty.zZbiorow(await ofertyPobierzJson(oferty.urlZbiory({ fraza: 'ceny ofertowe lokali', miasto })));
    // Bez miasta w tytule zbioru nie ma sensu uporu - pytamy szerzej.
    if (!zbiory.length) zbiory = oferty.zZbiorow(await ofertyPobierzJson(oferty.urlZbiory({ fraza: 'ceny ofertowe lokali' })));
  } catch (e) {
    logToFile('WARN', 'dane.gov.pl zbiory', String(e?.message || e));
    const wpis = krok('koniec', { ile: 0, blad: String(e?.message || e) });
    return { ok: false, oferty: [], etapy, zrodla: [], powod: String(e?.message || e), komunikat: `Nie udalo sie zapytac dane.gov.pl: ${e?.message || e}`, podsumowanie: wpis.opis };
  }
  krok('zbiory', { ile: zbiory.length });

  // CENNIKI POBIERAMY ROWNOLEGLE.
  //
  // Dotad szlo to po kolei: katalog, potem zasoby jednego zbioru, potem jego
  // plik (do 45 s), potem nastepny. Szesc cennikow z rzedu to bylo pol minuty
  // patrzenia w kolko, chociaz wszystkie te pliki lezą na tym samym serwerze
  // i nic nie stoi na przeszkodzie, zeby pobrac je naraz.
  //
  // Po czworo naraz, a nie wszystkie: dane.gov.pl to usluga publiczna, od
  // zalewu rownoleglych zapytan z jednego komputera potrafi odpowiedziec
  // bledem 429 i wtedy nie ma sie nic. Czworka skraca czekanie kilkukrotnie
  // i nie wyglada jak atak.
  const wszystkie = [], zrodla = [];
  const doWziecia = zbiory.slice(0, Math.max(maksCennikow, 1) * 2);
  const NARAZ = 4;

  async function jedenZbior(zbior) {
    let zasoby = [];
    try {
      krok('zasoby', { nazwa: zbior.tytul, idZbioru: zbior.id });
      zasoby = oferty.zZasobow(await ofertyPobierzJson(oferty.urlZasoby(zbior.id)));
    } catch (e) { logToFile('WARN', 'dane.gov.pl zasoby', String(e?.message || e)); return null; }
    const zasob = oferty.wybierzZasob(zasoby);
    if (!zasob) return null;
    krok('plik', { nazwa: zasob.tytul || zbior.tytul, format: zasob.format, url: zasob.url });
    try {
      const wynik = await ofertyWczytajPlik(zasob, { miasto, zrodlo: zbior.tytul, deweloper: zbior.instytucja });
      if (!wynik.ok) { krok('czytanie', { nazwa: zbior.tytul, ile: 0, powod: wynik.powod }); return null; }
      krok('czytanie', { nazwa: zbior.tytul, ile: wynik.oferty.length, pozaMiastem: wynik.pozaMiastem || 0 });
      if (!wynik.oferty.length) return null;
      const opis = oferty.opisZrodla({
        deweloper: zbior.instytucja, zbior: zbior.tytul, url: zasob.url, dataDanych: zasob.dataDanych || zbior.aktualizacja,
      });
      return {
        zrodlo: { zbior: zbior.tytul, deweloper: zbior.instytucja, url: zasob.url, format: zasob.format, dataDanych: zasob.dataDanych, opis },
        oferty: wynik.oferty.map(o => ({ ...o, zrodloNazwa: zbior.tytul, zrodloUrl: zasob.url, zrodloOpis: opis })),
      };
    } catch (e) {
      logToFile('WARN', 'dane.gov.pl plik', String(e?.message || e));
      krok('czytanie', { nazwa: zbior.tytul, ile: 0, powod: String(e?.message || e) });
      return null;
    }
  }

  // Kolejnosc wynikow musi odpowiadac kolejnosci zbiorow, a nie temu, ktory
  // plik sciagnal sie pierwszy - inaczej dwa uruchomienia tego samego
  // szukania daja wiersze w innej kolejnosci i nie da sie ich porownac.
  for (let i = 0; i < doWziecia.length && zrodla.length < maksCennikow; i += NARAZ) {
    const paczka = doWziecia.slice(i, i + NARAZ);
    const wyniki = await Promise.all(paczka.map(z => jedenZbior(z).catch(() => null)));
    for (const w of wyniki) {
      if (!w || zrodla.length >= maksCennikow) continue;
      zrodla.push(w.zrodlo);
      for (const o of w.oferty) wszystkie.push(o);
    }
  }
  wszystkie.forEach((o, i) => { o.zrodloWiersz = i + 1; });
  const wpis = krok('koniec', { ile: wszystkie.length, zbiorow: zrodla.length, oferty: wszystkie });
  return {
    ok: true, oferty: wszystkie, etapy, zrodla, powod: '',
    statystyka: oferty.statystyka(wszystkie),
    komunikat: wpis.opis, podsumowanie: wpis.opis,
  };
});

/* --- Jedna rubryka na adres --------------------------------------------
   Czlowiek wpisuje ulice, program szuka w panstwowym rejestrze punktow
   adresowych, w jakim to miescie i dzielnicy. Numer podaje czlowiek i program
   go NIE PODMIENIA - inny numer to inna nieruchomosc.

   Pytanie leci tylko wtedy, gdy czlowiek przestal pisac (zwloka jest w
   rendererze), i nie wysyla nic poza tym, co wlasnie wpisal w pole adresu. */
const adresJedno = require('./renderer/adres-jedno.js');

const adresOsm = require('./renderer/adres-osm.js');
let adresOsmOstatnie = 0;
const adresOsmPamiec = new Map();

/** Drugie zrodlo adresow. Rusza WYLACZNIE po kliknieciu przycisku w programie:
 *  publiczny Nominatim zabrania podpowiadania przy pisaniu i pozwala na jedno
 *  zapytanie na sekunde. Wysylamy tylko ulice, numer i miejscowosc. */
async function adresZOsm(q){
  const url = adresOsm.zapytanie({ ulica: q.ulica, numer: q.numer, miasto: q.miasto });
  if (!url) return { stan: 'brak', kandydaci: [], miejsca: [], proby: [], zrodlo: 'osm',
    pytanie: 'Wpisz nazwe ulicy - co najmniej trzy znaki.' };
  let kandydaci = adresOsmPamiec.get(url);
  if (!kandydaci){
    const czekaj = adresOsm.ileCzekac(adresOsmOstatnie);
    if (czekaj) await new Promise(r => setTimeout(r, czekaj));
    adresOsmOstatnie = Date.now();
    try {
      const odp = await fetchWithTimeout(url, { headers: {
        accept: 'application/json',
        'user-agent': `OPERO/${app.getVersion()} (program do operatow szacunkowych)`,
      } }, 10000, 'osm');
      if (!odp.ok) throw new Error(`usluga odpowiedziala bledem ${odp.status}`);
      kandydaci = adresOsm.zOdpowiedzi(await odp.text());
      if (adresOsmPamiec.size > 200) adresOsmPamiec.clear();
      adresOsmPamiec.set(url, kandydaci);
    } catch (e) {
      const blad = String(e?.message || e);
      logToFile('WARN', 'Adres - OpenStreetMap', blad);
      const tekst = `OpenStreetMap tez nie odpowiada (${blad}). Wpisz miejscowosc i ulice samodzielnie.`;
      return { stan: 'brak', kandydaci: [], miejsca: [], wybrane: null, numerNieZnaleziony: false,
        proby: [{ opis: 'OpenStreetMap', ile: 0, blad }], pytanie: tekst, komunikat: tekst, zrodlo: 'osm' };
    }
  }
  const trafione = adresJedno.odsiejDoFrazy(kandydaci, q.ulica).filter(x => x.ulica);
  const wynik = adresJedno.rozstrzygnij(trafione, { ulica: q.ulica, numer: q.numer });
  const pusto = !trafione.length;
  return { ...wynik, proby: [{ opis: 'OpenStreetMap', ile: trafione.length }], zrodlo: 'osm', podpis: adresOsm.PODPIS,
    pytanie: pusto ? 'OpenStreetMap tez nie zna tej ulicy. Sprawdz pisownie albo wpisz adres samodzielnie.' : wynik.pytanie,
    komunikat: pusto ? '' : adresJedno.komunikat(wynik, { numer: q.numer }).replace(/z rejestru/g, 'z OpenStreetMap').replace(/w rejestrze/g, 'w OpenStreetMap') };
}

/* --- Automat: polozenie, otoczenie i plan miejscowy dla adresu --------------
   Rusza po kliknieciu „Zbierz dane automatycznie". Wysyla wylacznie adres
   (do ustalenia punktu) i sam punkt (do pytania o otoczenie i plan). */
const otoczenieLogika = require('./renderer/otoczenie.js');
ipcMain.handle('otoczenie:zbierz', async (_e, zapytanie) => {
  const q = zapytanie || {};
  const wynik = { ok: false, punkt: null, otoczenie: null, mpzp: null, bledy: [], kiedy: new Date().toISOString() };
  const agent = { 'user-agent': `OPERO/${app.getVersion()} (program do operatow szacunkowych)` };

  // 1. Polozenie: to, co podal czlowiek, albo jedno zapytanie do Nominatim.
  if (otoczenieLogika.punktPoprawny(q.lat, q.lon)) {
    wynik.punkt = { lat: Number(q.lat), lon: Number(q.lon), skad: 'operat', dokladny: true };
  } else {
    const url = adresOsm.zapytanie({ ulica: q.ulica, numer: q.numer, miasto: q.miasto });
    if (!url) { wynik.bledy.push('Podaj ulice i miejscowosc - bez adresu nie ma czego szukac.'); return wynik; }
    try {
      const czekaj = adresOsm.ileCzekac(adresOsmOstatnie);
      if (czekaj) await new Promise(r => setTimeout(r, czekaj));
      adresOsmOstatnie = Date.now();
      const odp = await fetchWithTimeout(url, { headers: { accept: 'application/json', ...agent } }, 10000, 'osm');
      if (!odp.ok) throw new Error(`usluga odpowiedziala bledem ${odp.status}`);
      const pkt = adresOsm.punkt(await odp.text());
      if (!pkt) { wynik.bledy.push('OpenStreetMap nie zna tego adresu - sprawdz pisownie ulicy i numer.'); return wynik; }
      wynik.punkt = { ...pkt, skad: 'OpenStreetMap' };
    } catch (e) {
      logToFile('WARN', 'Automat - polozenie', String(e?.message || e));
      wynik.bledy.push(`Nie udalo sie ustalic polozenia adresu (${String(e?.message || e)}).`);
      return wynik;
    }
  }
  const { lat, lon } = wynik.punkt;

  // 2. Otoczenie i plan - niezaleznie od siebie; jedno nie blokuje drugiego.
  const otoczenie = (async () => {
    const dane = otoczenieLogika.zapytanie(lat, lon, q.promien);
    let ostatni = null;
    for (const serwer of [otoczenieLogika.OVERPASS, ...(otoczenieLogika.OVERPASS_ZAPAS || [])]) {
      try {
        const odp = await fetchWithTimeout(serwer, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', ...agent },
          body: `data=${encodeURIComponent(dane)}`,
        }, 30000, 'osm');
        if (!odp.ok) throw new Error(`usluga odpowiedziala bledem ${odp.status}`);
        return otoczenieLogika.zOdpowiedzi(await odp.text(), lat, lon);
      } catch (e) { ostatni = e; logToFile('WARN', `Overpass ${serwer}`, String(e?.message || e)); }
    }
    throw ostatni || new Error('brak odpowiedzi');
  })();
  const mpzp = (async () => {
    const odp = await fetchWithTimeout(otoczenieLogika.mpzpUrl(lat, lon), { headers: { accept: 'text/html, */*' } }, 15000, 'rcn');
    if (!odp.ok) throw new Error(`usluga odpowiedziala bledem ${odp.status}`);
    return otoczenieLogika.mpzpZOdpowiedzi(await odp.text());
  })();
  const [o, m] = await Promise.allSettled([otoczenie, mpzp]);
  if (o.status === 'fulfilled') wynik.otoczenie = o.value;
  else { logToFile('WARN', 'Automat - otoczenie', String(o.reason?.message || o.reason)); wynik.bledy.push(`Mapa otoczenia nie odpowiedziala (${String(o.reason?.message || o.reason)}).`); }
  if (m.status === 'fulfilled') wynik.mpzp = m.value;
  else { logToFile('WARN', 'Automat - plan', String(m.reason?.message || m.reason)); wynik.bledy.push(`Usluga planow miejscowych nie odpowiedziala (${String(m.reason?.message || m.reason)}).`); }
  wynik.ok = !!(wynik.otoczenie?.ok || wynik.mpzp?.ok);
  return wynik;
});

ipcMain.handle('adres:jedno', async (_e, zapytanie) => {
  const q = zapytanie || {};
  if (q.zapas === 'osm') return adresZOsm(q);
  const proby = adresJedno.zapytania({
    ulica: q.ulica, numer: q.numer, miasto: q.miasto,
    znaneMiasta: Array.isArray(q.znaneMiasta) ? q.znaneMiasta : [],
  });
  if (!proby.length){
    return { stan: 'brak', kandydaci: [], miejsca: [], proby: [],
      pytanie: 'Wpisz nazwe ulicy - od trzech znakow program zacznie szukac.' };
  }

  // Pytamy po kolei i PRZERYWAMY na pierwszym trafieniu. Dalsze proby sa po
  // to, zeby „chrzanowskiego" bez miejscowosci tez cos znalazlo - a nie po to,
  // zeby za kazdym nacisnieciem klawisza isc do uslugi piec razy.
  const wszystkie = [];
  const przebieg = [];
  let ostatniBlad = '';
  for (const proba of proby){
    try {
      const odp = await fetchWithTimeout(proba.url, { headers: { accept: 'application/json, */*' } }, 10000, 'uug');
      if (!odp.ok) throw new Error(`usluga odpowiedziala bledem ${odp.status}`);
      const k = adresJedno.zOdpowiedzi(await odp.text());
      const trafione = adresJedno.odsiejDoFrazy(k, q.ulica).filter(x => x.ulica);
      przebieg.push({ opis: proba.opis, ile: trafione.length });
      for (const x of trafione) wszystkie.push(x);
      if (wszystkie.length) break;
    } catch (e) {
      ostatniBlad = String(e?.message || e);
      przebieg.push({ opis: proba.opis, ile: 0, blad: ostatniBlad });
      logToFile('WARN', 'Adres - jedna rubryka', `${proba.opis}: ${ostatniBlad}`);
    }
  }

  if (!wszystkie.length && ostatniBlad){
    // Brak sieci nie moze zablokowac wpisywania adresu - pola zostaja do
    // wypelnienia recznie, a program mowi dlaczego.
    const tekst = `Nie moglem zapytac panstwowego rejestru adresow (${ostatniBlad}). Wpisz miejscowosc i ulice samodzielnie.`;
    return { stan: 'brak', kandydaci: [], miejsca: [], wybrane: null, numerNieZnaleziony: false,
      proby: przebieg, pytanie: tekst, komunikat: tekst };
  }

  const wynik = adresJedno.rozstrzygnij(wszystkie, { ulica: q.ulica, numer: q.numer });
  return { ...wynik, proby: przebieg, komunikat: adresJedno.komunikat(wynik, { numer: q.numer }) };
});

ipcMain.handle('dzialka:po-adresie', async (_e, zapytanie) => {
  requireActiveLicense();
  const q = zapytanie || {};
  const adres = dzialkaLogika.adresDoZapytania(q);
  logToFile('INFO', `Szukanie dzialki po adresie: ${adres}`);

  const tekst = await pobierzTekst(dzialkaLogika.urlGeokodera(adres));
  const punkty = dzialkaLogika.dopasujPunkty(dzialkaLogika.punktyZGeokodera(tekst), q);
  if (!punkty.length) {
    return { ok: false, adres, punkty: [], dzialki: [],
      powod: 'Geokoder GUGiK nie zna tego adresu. Sprawdz pisownie ulicy albo podaj sam numer dzialki.' };
  }

  const najlepszy = punkty[0];
  let wynik;
  try { wynik = await dzialkaZPunktu(najlepszy.x, najlepszy.y, logToFile); }
  catch (e) {
    logToFile('WARN', 'ULDK', String(e?.message || e));
    return { ok: false, adres, punkty, dzialki: [], powod: String(e?.message || e) };
  }
  return { ok: wynik.ok, adres, punkty, punkt: najlepszy, dzialki: wynik.dzialki, powod: wynik.powod };
});

ipcMain.handle('dzialka:po-numerze', async (_e, zapytanie) => {
  requireActiveLicense();
  const q = zapytanie || {};
  const url = q.id ? dzialkaLogika.urlDzialkiPoId(q.id) : dzialkaLogika.urlDzialkiPoNumerze(q.obreb, q.numer);
  const wynik = dzialkaLogika.dzialkiZOdpowiedzi(await pobierzTekst(url));
  return { ok: wynik.ok, dzialki: wynik.dzialki, powod: wynik.powod };
});

/* Ksiega ustalonych numerow KW. Raz ustalony numer zostaje przy dzialce, wiec
   druga wycena w tym samym budynku jest od reki i nie kosztuje ani zlotowki. */
ipcMain.handle('kwksiega:lista', async () => {
  const w = readAppState().ksiegaKW;
  return Array.isArray(w) ? w : [];
});
ipcMain.handle('kwksiega:zapisz', async (_e, wpis) => {
  requireActiveLicense();
  const w = wpis || {};
  const dzialka = String(w.dzialka || '').trim().slice(0, 60);
  const kw = normalizeKwNumber(w.kw);
  if (!dzialka) throw new Error('Brak identyfikatora dzialki.');
  if (!/^[A-Z0-9]{4}\/[0-9]{8}\/[0-9]$/.test(kw)) throw new Error('To nie wyglada na numer ksiegi wieczystej.');
  const stare = readAppState().ksiegaKW;
  const lista = Array.isArray(stare) ? stare.filter(x => x && x.dzialka !== dzialka) : [];
  lista.unshift({ dzialka, kw, adres: String(w.adres || '').trim().slice(0, 200), kiedy: new Date().toISOString() });
  writeAppState({ ksiegaKW: lista.slice(0, 500) });
  return { ok: true, ile: lista.length };
});

ipcMain.handle('external:open', async (_e, url) => {
  const target = String(url || '').trim();
  if (!/^https?:\/\//i.test(target)) throw new Error('Dozwolone sa tylko adresy http/https.');
  await shell.openExternal(target);
  return { ok: true, url: target };
});



// -----------------------------
// OPERO 1.0 — licencja czasowa z aktywacją serwerową.
// Produkcja: jednorazowy klucz kupiony na stronie OPERO, aktywacja przypisana do urządzenia.
// Wersja sprzedażowa: wyłącznie licencje online wydawane po zakupie lub przez panel administratora.
function normalizeLicenseCode(v) { return String(v || '').trim().replace(/\s+/g, '').toUpperCase(); }
let machineGuidCache = null;
function readWindowsMachineGuid() {
  // MachineGuid nie zmienia się w trakcie pracy programu — odczyt reg.exe (blokujący proces główny)
  // wykonujemy tylko raz, a nie przy każdym autozapisie.
  if (machineGuidCache) return machineGuidCache;
  try {
    if (process.platform !== 'win32') { machineGuidCache = `nonwin:${os.hostname()}:${os.arch()}`; return machineGuidCache; }
    const regExe = path.join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', 'reg.exe');
    const out = execFileSync(fs.existsSync(regExe) ? regExe : 'reg.exe', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true, timeout: 8000 });
    const m = String(out || '').match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i);
    if (m?.[1]) { machineGuidCache = m[1].trim(); return machineGuidCache; }
  } catch (e) { logToFile('WARN', 'MachineGuid', e); }
  // Uwaga: brak buforowania wartości awaryjnej — przy kolejnej próbie reg.exe może już zadziałać.
  return `fallback:${os.hostname()}:${os.arch()}`;
}
let deviceIdentityCache = null;
function deviceIdentity() {
  if (deviceIdentityCache) return deviceIdentityCache;
  let d = safeJsonRead(deviceStatePath(), {});
  if (!d || typeof d !== 'object') d = {};
  if (!d.installSecret) d.installSecret = crypto.randomBytes(32).toString('hex');
  const machine = readWindowsMachineGuid();
  const deviceId = crypto.createHash('sha256').update(`OPERO-DEVICE-V2|${machine}|${d.installSecret}`).digest('hex');
  if (d.deviceId !== deviceId || d.bindingVersion !== 2) {
    d.deviceId = deviceId;
    d.bindingVersion = 2;
    d.createdAt = d.createdAt || new Date().toISOString();
    d.updatedAt = new Date().toISOString();
    safeJsonWrite(deviceStatePath(), d);
  }
  if (machineGuidCache) deviceIdentityCache = d;
  return d;
}
// Node zglasza kazdy problem z siecia jako "TypeError: fetch failed" - komunikat
// bezuzyteczny dla uzytkownika. Tlumaczenie siedzi w osobnym module, bo musi
// NAZYWAC usluge, ktora zawiodla.
//
// Tu byl blad, ktory kosztowal rzeczoznawce zaufanie do programu: jedna
// funkcja, napisana kiedys pod sprawdzanie klucza, tlumaczyla bledy WSZYSTKICH
// zapytan. Gdy milczal Geoportal, program pisal "Polaczenie z serwerem
// licencyjnym zostalo przerwane" - a OPERO nie laczy sie z zadnym serwerem
// licencyjnym, klucz sprawdzany jest na tym komputerze. Czlowiek szukal winy
// w licencji zamiast w uslugie GUGiK.
const zrodlaKontrola = require('./renderer/zrodla-kontrola.js');

function networkErrorMessage(e, zrodlo = '') {
  return zrodlaKontrola.komunikat(e, zrodlo);
}

/**
 * Jedno zapytanie z limitem czasu i JEDNA ponowna proba.
 *
 * Zerwane polaczenie to w sieciach domowych i komorkowych rzecz codzienna.
 * Dotad kazde takie zerwanie konczylo caly etap szukania bledem i czlowiek
 * naciskal przycisk jeszcze raz. Teraz program robi to za niego: czeka
 * sekunde i pyta drugi raz. Powtarzamy TYLKO bledy przejsciowe - odmowa,
 * zly adres czy blad certyfikatu nie przejda i za drugim razem, a czekanie
 * podwajaloby sie bez powodu.
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 20000, zrodlo = '') {
  let ostatni = null;
  for (let proba = 1; proba <= 2; proba++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (e) {
      ostatni = e;
      const przejsciowy = zrodlaKontrola.wartoPowtorzyc(e);
      logToFile('WARN', `fetch (proba ${proba}${przejsciowy ? ', do powtorzenia' : ''})`, url, e);
      if (proba === 1 && przejsciowy) { await new Promise(r => setTimeout(r, 900)); continue; }
      throw new Error(networkErrorMessage(e, zrodlo));
    } finally { clearTimeout(timer); }
  }
  throw new Error(networkErrorMessage(ostatni, zrodlo));
}
function safeIsoDate(value) {
  const t = Date.parse(String(value || ''));
  if (!Number.isFinite(t)) throw new Error('Serwer licencyjny zwrócił nieprawidłową datę ważności licencji.');
  return new Date(t).toISOString();
}
function publicDeviceCode() { const id=deviceIdentity().deviceId; return `DEV-${id.slice(0,8).toUpperCase()}-${id.slice(8,12).toUpperCase()}`; }
function storedLicenseRaw() { return safeJsonRead(licenseStatePath(), null); }
function licenseBindingSnapshot(row=storedLicenseRaw()) {
  if (!row || row.mode !== 'online' || !row.licenseId || !row.token || !row.deviceId) return null;
  return {
    mode:'online', licenseId:String(row.licenseId), plan:String(row.plan||'OPERO'), token:String(row.token),
    deviceId:String(row.deviceId), expiresAt:String(row.expiresAt||''), maxDevices:Number(row.maxDevices||1),
    periodCode:String(row.periodCode||''), activatedAt:String(row.activatedAt||''), lastVerifiedAt:String(row.lastVerifiedAt||''),
    lastSeenEpoch:Number(row.lastSeenEpoch||0)
  };
}
// Kopia zapasowa powiązania licencji w app-state.json. Do 1.4.x tę rolę pełnił profil konta;
// bez kont trzymamy ją tutaj, żeby skasowanie license.json nie wymuszało nowej aktywacji.
function backupLicenseBinding(row = storedLicenseRaw()) {
  const binding = licenseBindingSnapshot(row);
  if (!binding) return null;
  try { writeAppState({ licenseBackup: binding }); } catch (e) { logToFile('WARN', 'kopia licencji', e); }
  return binding;
}
function restoreLicenseFromBackup() {
  const current = storedLicenseRaw();
  if (current) return current;
  const binding = readAppState()?.licenseBackup;
  if (!binding || binding.mode !== 'online' || !binding.token || !binding.licenseId) return null;
  // Kopia jest przypisana do urządzenia — na innym komputerze jest bezużyteczna.
  if (binding.deviceId !== deviceIdentity().deviceId) return null;
  safeJsonWrite(licenseStatePath(), binding);
  logToFile('INFO', 'licencja odtworzona z kopii lokalnej');
  return binding;
}
function daysRemaining(expiresAt) {
  const exp=Date.parse(String(expiresAt||'')); if(!Number.isFinite(exp)) return 0;
  return Math.max(0, Math.ceil((exp-Date.now())/86400000));
}
// Od 1.7.0 nie ma planow ani wersji PRO: kazdy wazny klucz daje caly program.
// Roznica jest wylacznie w czasie, dlatego stan licencji niesie dokladne
// "ile zostalo" (msRemaining), a nie nazwe pakietu.
function msRemaining(expiresAt) {
  const exp = Date.parse(String(expiresAt || ''));
  if (!Number.isFinite(exp)) return 0;
  return Math.max(0, exp - Date.now());
}
function publicLicenseState(row, extra={}) {
  if(!row) return {active:false,status:'activation_required',expiresAt:'',expiresAtEpoch:0,daysRemaining:0,msRemaining:0,
    deviceCode:publicDeviceCode(),mode:'none',bezterminowo:false,plan:'',nabywca:'',numerKlucza:'',...extra};
  const exp = row.wazneDo ? Date.parse(String(row.wazneDo)) : 0;
  return {
    active:true,status:'active',
    expiresAt: row.wazneDo || '', expiresAtEpoch: Number.isFinite(exp)?exp:0,
    daysRemaining: row.wazneDo ? daysRemaining(row.wazneDo) : null,
    msRemaining: row.wazneDo ? msRemaining(row.wazneDo) : null,
    bezterminowo: !row.wazneDo,
    plan: String(row.plan||'OPERO'), nabywca: String(row.nabywca||''),
    numerKlucza: String(row.numer||''), urzadzenie: row.urzadzenie||null,
    mode:'klucz', maxDevices:Number(row.maxUrzadzen||1), deviceCode:publicDeviceCode(), ...extra
  };
}

// -----------------------------
// OPERO 1.14.0 — licencja sprawdzana na miejscu, bez serwera.
//
// Klucz jest podpisanym dokumentem (Ed25519). Program nosi tylko klucz publiczny
// i sprawdza podpis przy każdym starcie — nie pyta nikogo o zdanie. Dzień, w
// którym serwer licencyjny sam się wstrzymał, pokazał, czemu tak ma być: ważny
// klucz przestał wtedy otwierać program, choć z licencją było wszystko w porządku.
function stanLicencji(touch = true) {
  const row = storedLicenseRaw() || restoreLicenseFromBackup();
  if (!row || !row.klucz) return publicLicenseState(null);

  const wynik = licencja.sprawdz(row.klucz, { kodUrzadzenia: publicDeviceCode() });
  if (!wynik.ok) {
    return { ...publicLicenseState(null),
      status: wynik.powod === 'wygasl' ? 'expired' : 'activation_required',
      message: wynik.komunikat, powod: wynik.powod };
  }

  // Cofnięty zegar to jedyny sposób, żeby wygasły klucz znów wyglądał na ważny.
  // Nie blokujemy pracy od razu, ale mówimy wprost, co widzimy.
  const teraz = Date.now(), ostatnio = Number(row.ostatnioWidziano || 0);
  if (ostatnio && teraz + 6 * 3600 * 1000 < ostatnio) {
    return { ...publicLicenseState(wynik.dane), active: false, status: 'clock_error',
      message: 'Zegar komputera został cofnięty. Ustaw prawidłową datę — przy cofniętym zegarze nie da się uczciwie sprawdzić ważności klucza.' };
  }

  if (touch) {
    try { safeJsonWrite(licenseStatePath(), { ...row, ostatnioWidziano: Math.max(ostatnio, teraz) }); }
    catch (e) { logToFile('WARN', 'licencja zapis', e); }
  }
  return publicLicenseState(wynik.dane, { verification: 'local' });
}

/** Zgodność nazw: reszta programu woła te funkcje od 1.5. */
function offlineLicenseState(touch = true) { return stanLicencji(touch); }

/**
 * Program NIE MA SERWERA LICENCJI i nie będzie go miał.
 *
 * Do 1.25 krótki kod aktywacyjny wymieniało się na podpisaną licencję przez
 * usługę w chmurze. Kosztowało to dokładnie tyle, ile kosztuje każda zależność
 * od cudzego serwera: gdy dostawca uśpił projekt po tygodniu bez ruchu, nikt
 * nie mógł aktywować programu — i nie dowiedział się dlaczego.
 *
 * Teraz klucz jest podpisany od razu przy wydaniu, generatorem, który stoi na
 * komputerze autora. Program sprawdza podpis własnym kluczem publicznym i na
 * tym koniec. Nie ma czego uśpić, nie ma czego opłacać, nie ma co paść.
 */

/** Sam klucz z dowolnego tekstu (plik z generatora ma nagłówek i opis). */
function wyciagnijKluczOpero(tekst) {
  const t = String(tekst || '').replace(/[\s"'`]+/g, '');
  const m = t.match(/OPERO1\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{86}/);
  return m ? m[0] : String(tekst || '').trim();
}

async function activateLicenseKey(code) {
  const surowy = wyciagnijKluczOpero(code);
  if (!surowy) throw new Error('Wpisz klucz licencyjny OPERO albo wczytaj go z pliku.');
  // Stary, krótki kod (OPERO-XXXX-...) nie ma już czego pytać. Mówimy o tym
  // wprost, zamiast odbijać się od niezrozumiałego „to nie wygląda na klucz".
  if (/^OPERO-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(surowy.replace(/\s+/g, '').toUpperCase())) {
    throw new Error('To jest stary kod aktywacyjny, który wymagał połączenia z serwerem. Od wersji 1.25 klucz jest pełny i działa bez internetu — poproś autora o nowy klucz, podając kod tego urządzenia.');
  }
  const wynik = licencja.sprawdz(surowy, { kodUrzadzenia: publicDeviceCode() });
  if (!wynik.ok) throw new Error(wynik.komunikat);

  const row = {
    tryb: 'klucz', klucz: licencja.oczysc(surowy),
    plan: wynik.dane.plan, nabywca: wynik.dane.nabywca, numer: wynik.dane.numer,
    wazneDo: wynik.dane.wazneDo, urzadzenie: wynik.dane.urzadzenie, maxUrzadzen: wynik.dane.maxUrzadzen,
    aktywowano: new Date().toISOString(), ostatnioWidziano: Date.now(),
  };
  safeJsonWrite(licenseStatePath(), row);
  backupLicenseBinding(row);
  logToFile('INFO', `Klucz przyjety: ${wynik.dane.plan}, ${wynik.dane.wazneDo ? 'do ' + String(wynik.dane.wazneDo).slice(0, 10) : 'bezterminowo'} (${licencja.skrot(surowy)})`);
  return stanLicencji(true);
}

/** Zostaje dla zgodności — sprawdzenie jest lokalne, więc nie ma czego odpytywać. */
async function verifyCurrentLicense() { return stanLicencji(true); }

async function deactivateCurrentLicense() {
  const row = storedLicenseRaw();
  if (!row) return { ok: true, removed: false };
  try { fs.rmSync(licenseStatePath(), { force: true }); } catch (e) { logToFile('WARN', 'licencja usuwanie', e); }
  // Kopia zapasowa też musi zniknąć, inaczej licencja odtworzyłaby się przy następnym starcie.
  try { writeAppState({ licenseBackup: null }); } catch (e) { logToFile('WARN', 'licencja kopia', e); }
  return { ok: true, removed: true };
}

async function requireValidLicense() {
  const st = await verifyCurrentLicense();
  if (!st.active) throw new Error(st.message || 'OPERO wymaga aktywnej licencji. Wprowadź ważny klucz licencyjny.');
  return st;
}
ipcMain.handle('license:get-state', async (_e, opts) => verifyCurrentLicense(opts && typeof opts === 'object' ? opts : {}));
// Nie ma czego pingowac - klucz sprawdza sie na tym komputerze. Uchwyt zostaje,
// zeby starszy interfejs nie dostal wyjatku, i mowi wprost, jak teraz jest.
/* --- Kontrola zrodel ------------------------------------------------------
   Rzeczoznawca naciska "Sprawdz zrodla" (albo robi to samo szukanie przed
   startem) i w dwie sekundy wie, ktora z czterech publicznych uslug odpowiada,
   ktora odpowiada wolno, a ktora milczy i dlaczego.

   Wszystkie cztery pytamy NARAZ. Sprawdzenie po kolei trwaloby tyle, co suma
   limitow czasu - czyli przy dwoch zawieszonych uslugach ponad czterdziesci
   sekund na sama diagnostyke.

   Nie wysylamy tu zadnych danych operatu: kazde zapytanie jest najmniejsze,
   jakie ta usluga przyjmuje, i nie zawiera adresu wycenianej nieruchomosci. */
ipcMain.handle('zrodla:sprawdz', async (_e, zapytanie) => {
  const q = zapytanie || {};
  const tylko = Array.isArray(q.tylko) && q.tylko.length ? new Set(q.tylko) : null;
  const lista = zrodlaKontrola.ZRODLA.filter(z => !tylko || tylko.has(z.id));
  const stan = zrodlaKontrola.pusty();

  await Promise.all(lista.map(async (z) => {
    const start = Date.now();
    try {
      const odp = await fetchWithTimeout(z.kontrola, { headers: { accept: '*/*' } }, z.limitMs, z.id);
      const ms = Date.now() - start;
      if (!odp.ok) {
        zrodlaKontrola.zapisz(stan, z.id, { ok: false, ms, powod: zrodlaKontrola.komunikatHttp(odp.status, z.id) });
        return;
      }
      // Odpowiedz czytamy do konca, zeby zmierzyc realny czas, a nie sam
      // moment nawiazania polaczenia - usluga potrafi odpowiedziec naglowkiem
      // od reki i potem mielic trzydziesci sekund.
      try { await odp.text(); } catch {}
      zrodlaKontrola.zapisz(stan, z.id, { ok: true, ms: Date.now() - start });
    } catch (e) {
      zrodlaKontrola.zapisz(stan, z.id, { ok: false, ms: Date.now() - start, powod: String(e?.message || e) });
    }
  }));

  const pod = zrodlaKontrola.podsumowanie(stan);
  logToFile('INFO', 'Kontrola zrodel', pod.tekst);
  return { ok: true, stan, podsumowanie: pod, kiedy: new Date().toISOString() };
});

ipcMain.handle('license:ping', async () => ({ ok: true, lokalnie: true, message: 'Klucz sprawdzany na tym komputerze \u2014 OPERO nie \u0142\u0105czy si\u0119 z \u017cadnym serwerem licencyjnym.' }));
ipcMain.handle('license:activate', async (_e, code) => activateLicenseKey(code));
ipcMain.handle('license:deactivate', async () => deactivateCurrentLicense());

// -----------------------------
// Biblia OPERO 1.14.0 — w całości w programie, bez żadnego serwera.
//
// Do 1.13.0 wiedza schodziła z serwera przy pierwszym uruchomieniu. Wystarczyło,
// że baza po drugiej stronie zasnęła, i Agrafek milkł u każdego, kto jeszcze jej
// nie pobrał. Teraz Biblia jedzie w instalatorze: program kopiuje ją do folderu
// danych przy pierwszym starcie i od tej chwili czyta z dysku.
const bibliaLokalna = require('./biblia-lokalna');
const BIBLIA_W_PROGRAMIE = path.join(__dirname, 'zasoby', 'biblia.json');

/** Kopiuje Biblię z instalatora do folderu danych, gdy jej tam nie ma albo jest starsza. */
function bibliaZasiej() {
  try {
    if (!fs.existsSync(BIBLIA_W_PROGRAMIE)) return false;
    const cel = bibliaLokalna.plik(rootUserData());
    const obecna = bibliaLokalna.stan(rootUserData());
    let wProgramie = null;
    try { wProgramie = JSON.parse(fs.readFileSync(BIBLIA_W_PROGRAMIE, 'utf8')); } catch { return false; }
    const kodNowy = wProgramie?.version?.code || '';
    if (obecna.jest && obecna.kod === kodNowy) return false;
    fs.mkdirSync(rootUserData(), { recursive: true });
    const tmp = `${cel}.tmp`;
    fs.copyFileSync(BIBLIA_W_PROGRAMIE, tmp);
    fs.renameSync(tmp, cel);
    logToFile('INFO', `Biblia OPERO rozpakowana z programu: ${kodNowy} (${(wProgramie.rules || []).length} regul)`);
    return true;
  } catch (e) { logToFile('WARN', 'Biblia z programu', e); return false; }
}

const bibliaStan = () => bibliaLokalna.stan(rootUserData());
ipcMain.handle('biblia:stan', async () => bibliaStan());
// „Pobierz" znaczy teraz „wgraj jeszcze raz z programu" — nie ma skąd pobierać.
ipcMain.handle('biblia:pobierz', async () => { requireActiveLicense(); bibliaZasiej(); return bibliaStan(); });

/** Wynik z Biblii na dysku w postaci, której oczekuje panel Agrafka. */
function odpowiedzZBiblii(payload = {}) {
  const w = bibliaLokalna.szukaj(rootUserData(), {
    pytanie: String(payload.question || ''),
    valuationTypeCode: String(payload.valuationTypeCode || ''),
    moduleCode: String(payload.moduleCode || ''),
    regulyKody: payload.regulyKody, tematy: payload.tematy,
  });
  if (w?.error === 'BRAK_BIBLII') throw new Error('Biblia OPERO nie jest jeszcze rozpakowana. Otwórz Ustawienia → Agrafek i kliknij „Wgraj Biblię z programu”.');
  if (w?.error === 'PUSTE_PYTANIE') throw new Error('Wpisz pytanie do Agrafka.');
  const reguly = w.reguly || [];
  return {
    ok: true, route: w.trasa, routeTitle: w.tytulTrasy, answerPolicy: w.polityka || '',
    type: w.rodzajWyceny ? { code: w.rodzajWyceny.kod, name: w.rodzajWyceny.nazwa } : null,
    answer: [w.wstep, ...reguly.slice(0, 4).map(x => x.tresc).filter(Boolean)].join('\n\n'),
    basis: reguly.map(x => ({
      ruleCode: x.oznaczenie, title: x.tytul, text: x.tresc, formula: x.wzor, category: x.kategoria,
      pageFrom: String(x.strony || '').split('–')[0] || '', pageTo: String(x.strony || '').split('–')[1] || '',
      source: x.zrodlo ? { title: x.zrodlo, filename: x.ksiazka } : null,
    })),
    sources: w.zrodla || [],
    limitations: w.ograniczenia || '',
    snapshot: { code: w.snapshot?.kod, legalStateDate: w.snapshot?.stanPrawny, preview: !!w.snapshot?.robocza, lokalna: true },
    privacy: 'Pytanie nie opuszcza tego komputera. Biblia OPERO leży w folderze programu, a odpowiedź powstaje tutaj.',
  };
}

ipcMain.handle('knowledge:ask', async (_e, payload) => {
  requireActiveLicense();
  const question = String(payload?.question || '').trim();
  if (question.length < 2) throw new Error('Wpisz pytanie do Agrafka.');
  if (question.length > 2000) throw new Error('Pytanie jest zbyt długie. Skróć je do 2000 znaków.');
  return odpowiedzZBiblii({ ...payload, question });
});
ipcMain.handle('knowledge:sources', async (_e, payload) => {
  requireActiveLicense();
  const w = bibliaLokalna.zrodla(rootUserData(), {
    temat: String(payload?.question || payload?.topicCode || ''),
    kodTematu: payload?.topicCode ? String(payload.topicCode) : '',
    valuationTypeCode: String(payload?.valuationTypeCode || ''),
  });
  if (w?.error === 'BRAK_BIBLII') throw new Error('Biblia OPERO nie jest jeszcze rozpakowana.');
  return { ok: true, type: w.rodzajWyceny ? { code: w.rodzajWyceny.kod, name: w.rodzajWyceny.nazwa } : null,
    sources: w.zrodla || [], snapshot: { code: w.snapshot?.kod, lokalna: true } };
});
ipcMain.handle('knowledge:status', async () => {
  const s = bibliaStan();
  return { ok: s.jest, lokalna: true,
    snapshot: { code: s.kod, name: s.nazwa, status: s.robocza ? 'draft' : 'active', legalStateDate: s.stanPrawny, preview: !!s.robocza },
    counts: { rules: s.regul, sources: s.ksiazek, types: s.rodzajow, links: s.zrodel },
    message: s.jest ? '' : s.opis };
});

// -----------------------------
// Egzamin Agrafka liczony na tym komputerze. Bank pytań jedzie razem z Biblią,
// więc sprawdzenie jakości odpowiedzi nie zależy od niczyjego serwera.
function egzaminPrzyjmij(test, res) {
  const norm = (v) => String(v || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9§%]+/g, ' ').replace(/\s+/g, ' ').trim();
  const tab = (v) => (Array.isArray(v) ? v : (v == null ? [] : [v])).filter(Boolean);
  const cale = norm(`${res.answer || ''} ${(res.basis || []).map(x => `${x.ruleCode} ${x.title} ${x.text} ${x.formula}`).join(' ')} ${(res.sources || []).map(x => `${x.topicCode} ${x.title} ${x.whatToFind}`).join(' ')}`);
  const oczekiwana = String(test.expected_route_code || '').trim();
  const trasaOk = !oczekiwana || res.route === oczekiwana;
  const regulyRef = tab(test.ref_rule_codes || test.rule_codes);
  const mamyReguly = new Set((res.basis || []).map(x => x.ruleCode));
  const regulyOk = regulyRef.every(x => mamyReguly.has(x));
  const tematyRef = tab(test.ref_topic_codes || test.source_topic_codes);
  const mamyTematy = new Set((res.sources || []).map(x => x.topicCode));
  const tematyOk = tematyRef.every(x => mamyTematy.has(x));
  const musi = tab(test.must_include).map(norm);
  const musiOk = musi.every(x => !x || cale.includes(x));
  const nieWolno = tab(test.must_not_include).map(norm);
  const nieWolnoOk = nieWolno.every(x => !x || !cale.includes(x));
  return { pass: trasaOk && regulyOk && tematyOk && musiOk && nieWolnoOk, routeOk: trasaOk, rulesOk: regulyOk, topicsOk: tematyOk, mustOk: musiOk, bannedOk: nieWolnoOk };
}

ipcMain.handle('knowledge:exam', async (_e, payload) => {
  const lic = requireActiveLicense();
  if (!/CREATOR|TWORCA|TWÓRCA/i.test(String(lic?.plan || ''))) {
    throw new Error('Egzamin Agrafka jest dostępny wyłącznie w licencji OPERO CREATOR.');
  }
  const d = bibliaLokalna.wczytaj(rootUserData());
  const bank = (d && Array.isArray(d.examCases)) ? d.examCases.filter(x => x && x.active !== false) : [];
  if (!bank.length) throw new Error('Bank testów nie jest dołączony do tej Biblii. Wgraj Biblię z programu w Ustawieniach.');
  const offset = Math.max(0, Number(payload?.offset) || 0);
  const limit = Math.min(40, Math.max(1, Number(payload?.limit) || 25));
  const partia = bank.slice(offset, offset + limit);
  const results = [];
  for (const t of partia) {
    const q = String(t.question || t.prompt || t.test_question || '').trim();
    if (!q) { results.push({ testCode: t.test_code, difficulty: t.difficulty, category: t.category, pass: false, error: 'empty_question' }); continue; }
    let res;
    try {
      res = odpowiedzZBiblii({ question: q, valuationTypeCode: t.valuation_type_code || '',
        regulyKody: t.ref_rule_codes || t.rule_codes, tematy: t.ref_topic_codes || t.source_topic_codes });
    } catch (e) { results.push({ testCode: t.test_code, pass: false, error: String(e?.message || e) }); continue; }
    results.push({ testCode: t.test_code, difficulty: t.difficulty, category: t.category,
      route: res.route, expectedRoute: t.expected_route_code, ...egzaminPrzyjmij(t, res) });
  }
  const next = offset + partia.length;
  const s = bibliaStan();
  return { ok: true, batch: true, lokalny: true, offset, limit, total: bank.length,
    done: next >= bank.length, nextOffset: next >= bank.length ? null : next, results,
    snapshot: { code: s.kod, preview: !!s.robocza } };
});

// -----------------------------
// Agrafek rozmawiający (1.9.1). Model działa u użytkownika — lokalnie w Ollamie
// albo na jego własnym kluczu OpenAI. OPERO nie pośredniczy i nie płaci za zapytania.
// -----------------------------
// OPERO 1.18.0 — PER i jego model na tym komputerze.
//
// Silnik i model jada w instalatorze. Program uruchamia serwer modelu po cichu
// przy starcie, gasi go razem z soba i nie pyta uzytkownika o nic. Zadnego
// klucza API, zadnej uslugi zewnetrznej, zadnego wyjscia do sieci.
// -----------------------------
const silnikPer = require('./silnik-per');
const per = require('./per-service').utworz({
  requireActiveLicense, rootUserData, readCollection, safeJsonRead, logToFile,
  biblia: bibliaLokalna,
  // Opcjonalny model w chmurze (Ustawienia). Funkcje sa zdefiniowane nizej;
  // tu przekazujemy tylko odwolania, wolane dopiero przy pisaniu.
  chmura: { aktywna: () => chmuraAktywna(), wywolaj: (w, o) => chmuraWywolaj(w, o) },
});
function slijPostepModelu(dane) {
  try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('per:postep', dane); } catch {}
}
ipcMain.handle('per:status', async () => per.status());
ipcMain.handle('per:ask', async (_e, payload) => per.pytaj(payload || {}));
ipcMain.handle('per:redaguj', async (_e, payload) => per.redaguj(payload || {}));
ipcMain.handle('per:napisz', async (_e, payload) => per.napisz(payload || {}));
ipcMain.handle('per:tools', async () => per.narzedzia());
ipcMain.handle('per:silnik-status', async () => silnikPer.status());
ipcMain.handle('per:uruchom', async () => { requireActiveLicense(); return silnikPer.uruchom(logToFile); });
/**
 * Czy model jest aktualny. Program dziala bez internetu, wiec „aktualny" ma sens
 * tylko wtedy, gdy ktos wystawil plik z opisem najnowszej wersji. Gdy adresu nie
 * ma albo sieci nie ma — mowimy „nieznany", a nie zgadujemy.
 *
 * Plik ma postac: { "nazwa": "...gguf", "rozmiar": 7036000000, "suma": "sha256",
 *                   "url": "https://.../model.gguf", "opis": "co sie zmienilo" }
 */
/**
 * Skad program wie, gdzie szukac informacji o nowszym modelu.
 *
 * Pierwszenstwo ma wpisany na sztywno `modelManifestUrl` — gdyby ktos chcial
 * trzymac plik u siebie. Jesli go nie ma, a jest ustawione repozytorium wydan,
 * bierzemy zalacznik `model.json` z NAJNOWSZEGO wydania tego repozytorium.
 * Dzieki temu nie trzeba niczego wpisywac recznie: wrzucasz model.json do
 * wydania razem z instalatorem i program sam go znajduje. Pytamy przy tym
 * dokladnie ten sam adres (api.github.com), ktorym i tak sprawdzamy nowsza
 * wersje programu — zadnej nowej uslugi w to nie wchodzi.
 */
let manifestZPamieci = { czas: 0, adres: '', pozycja: null };
async function adresManifestuModelu() {
  const cfg = productionConfig();
  const wprost = String(cfg.modelManifestUrl || '').trim();
  if (/^https:\/\//i.test(wprost)) return wprost;
  const repo = String(cfg.aktualizacjeRepo || '').trim();
  if (!repo) return '';
  // Wynik trzymamy kwadrans: panel PER odswieza sie czesto, a lista wydan
  // zmienia sie raz na kilka tygodni.
  if (manifestZPamieci.adres && Date.now() - manifestZPamieci.czas < 15 * 60 * 1000) return manifestZPamieci.adres;
  // Szukamy w dwoch miejscach, bo /releases/latest pomija wydania oznaczone
  // jako wstepne. Gdyby ktos wypuscil wydanie jako „pre-release", samo /latest
  // nigdy by go nie zobaczylo — a program milczalby, zamiast powiedziec, ze jest
  // nowszy model. Dokladnie tak gubil sie wczesniej silnik llama.cpp.
  const naglowki = { 'Accept': 'application/vnd.github+json', 'User-Agent': `OPERO/${cfg.productVersion}` };
  const szukajW = (wydania) => {
    for (const w of [].concat(wydania || [])) {
      const plik = (w?.assets || []).find(a => /^model\.json$/i.test(String(a?.name || '')));
      if (plik?.browser_download_url) return String(plik.browser_download_url);
    }
    return '';
  };
  const pobierzJSON = async (adresApi) => {
    const k = new AbortController();
    const t = setTimeout(() => k.abort(), 8000);
    try {
      const r = await fetch(adresApi, { headers: naglowki, signal: k.signal });
      return r.ok ? await r.json() : null;
    } finally { clearTimeout(t); }
  };
  try {
    let url = szukajW(await pobierzJSON(`https://api.github.com/repos/${repo}/releases/latest`));
    if (!url) url = szukajW(await pobierzJSON(`https://api.github.com/repos/${repo}/releases?per_page=10`));
    if (url) manifestZPamieci = { ...manifestZPamieci, czas: Date.now(), adres: url };
    return url;
  } catch { return ''; }
}

/** Odczyt manifestu modelu. Zwraca null, gdy adresu nie ma albo nie odpowiada. */
async function manifestModelu(adres) {
  if (!/^https:\/\//i.test(String(adres || ''))) return null;
  try {
    const k = new AbortController();
    const t = setTimeout(() => k.abort(), 6000);
    const r = await fetch(adres, { signal: k.signal, redirect: 'follow' });
    clearTimeout(t);
    if (!r.ok) return null;
    const m = await r.json();
    const nazwa = String(m?.nazwa || '').trim();
    if (!nazwa) return null;
    // Model moze byc jednym plikiem albo lista czesci po <2 GB — na GitHubie
    // pojedynczy zalacznik wydania nie moze byc wiekszy.
    const czesci = Array.isArray(m?.czesci) ? m.czesci
      .map(c => ({ url: String(c?.url || ''), rozmiar: Number(c?.rozmiar) || 0, suma: String(c?.suma || '') }))
      .filter(c => /^https:\/\//i.test(c.url)) : [];
    const pozycja = {
      nazwa, opis: String(m?.opis || '').slice(0, 400),
      rozmiar: Number(m?.rozmiar) || 0, suma: String(m?.suma || ''),
      url: /^https:\/\//i.test(String(m?.url || '')) ? String(m.url) : '',
      czesci,
    };
    manifestZPamieci = { ...manifestZPamieci, pozycja };
    return pozycja;
  } catch { return null; }
}

/**
 * Skad program bierze model — po kolei, od najpewniejszego:
 *
 *  1. silnik\model.json z instalatora. Powstaje przy budowie z tego samego
 *     pliku, ktory zostal pobrany i sprawdzony, wiec jest tam nazwa, rozmiar,
 *     suma SHA-256 i adres u zrodla. Dzieki temu program wie, co pobrac, ZANIM
 *     cokolwiek zapyta sieci — i nikt niczego nie musi nigdzie wrzucac.
 *  2. „modelManifestUrl" z ustawien — gdy chcesz trzymac model u siebie.
 *  3. zalacznik model.json z wydania na GitHubie — gdy wolisz tamta droge.
 *
 * Pierwszy, ktory sie znajdzie, wygrywa.
 */
function manifestZInstalatora() {
  try {
    const plik = silnikPer.znajdzPlikSilnika('model.json');
    if (!plik) return null;
    const tekst = fs.readFileSync(plik, 'utf8');
    const m = JSON.parse(tekst.charCodeAt(0) === 0xFEFF ? tekst.slice(1) : tekst);
    if (!m?.nazwa || !/^https:\/\//i.test(String(m?.url || ''))) return null;
    return {
      nazwa: String(m.nazwa), rozmiar: Number(m.rozmiar) || 0,
      suma: String(m.suma || '').toLowerCase(), url: String(m.url),
      repo: String(m.repo || ''), opis: String(m.opis || '').slice(0, 400),
      czesci: Array.isArray(m.czesci) ? m.czesci : [],
      zrodlo: 'instalator',
    };
  } catch { return null; }
}

/**
 * Skad wziac model — trzy miejsca, w tej kolejnosci:
 *
 *   1. manifest wskazany w ustawieniach albo w wydaniu na GitHubie (to tu
 *      trafiaja NOWSZE modele, ktore wypuszcza autor programu),
 *   2. model.json dolozony do folderu silnika przy budowie,
 *   3. ZRODLO WBUDOWANE — adres, z ktorego budowa sciagnela model (Hugging
 *      Face), zapisany w model-domyslny.json.
 *
 * Trzeci punkt jest tu po to, zeby swiezo zainstalowany program NIGDY nie
 * powiedzial „nie wiadomo, skad go pobrac". Zanim powstal, program bez
 * skonfigurowanego wydania byl bezuzyteczny — i to byl powazny blad w pomysle,
 * nie drobiazg.
 */
async function skadPobracModel() {
  const zWprost = await manifestModelu(await adresManifestuModelu());
  if (zWprost) return zWprost;
  const zInstalatora = manifestZInstalatora();
  if (zInstalatora) return zInstalatora;
  const wbudowane = silnikPer.zrodloWbudowane();
  if (wbudowane) return { ...wbudowane, zrodlo: 'wbudowane' };
  // Przedostatnia deska ratunku: Hugging Face wprost.
  // Ostatnia: rejestr Ollamy - inny dom, inny adres, ta sama robota.
  //
  // Po to tu jest: wszystkie powyzsze drogi opieraja sie na pliku, ktory mial
  // powstac przy budowie. Jesli ktorys z nich zabraknie albo bedzie niepelny,
  // rzeczoznawca widzi „nie wskazano, skad go pobrac" i NIE MA czego kliknac -
  // program jest wtedy bezuzyteczny z powodu brakujacego pliku tekstowego.
  // Adres modelu nie jest zadna tajemnica, wiec program potrafi go znalezc sam.
  return (await modelZHuggingFace()) || (await modelZOllama());
}

/**
 * MODEL Z REJESTRU OLLAMY.
 *
 * Druga, niezalezna droga po model. Po co, skoro jest Hugging Face: bo jedno
 * zrodlo to jeden punkt, w ktorym wszystko sie zatrzymuje - zablokowany adres
 * w firmowej sieci, awaria, zmiana regulaminu. Ollama serwuje te same modele
 * GGUF ze swojego rejestru, zwyklym pobraniem po HTTPS, bez konta i bez
 * podpisanych adresow, ktore wygasaja.
 *
 * Suma kontrolna przychodzi tu za darmo: w rejestrze warstwa modelu jest
 * zaadresowana wlasnie swoim skrotem SHA-256 (`digest`), wiec sprawdzamy
 * dokladnie to, co mielismy pobrac.
 *
 * Lista jest krotka i swiadoma - tylko modele, ktorych licencja pozwala
 * sprzedawac program z nich korzystajacy.
 */
const MODELE_OLLAMA = [
  { repo: 'library/qwen2.5', tag: '7b-instruct-q4_K_M', nazwa: 'qwen2.5-7b-instruct-q4_K_M.gguf' },
  { repo: 'library/qwen2.5', tag: '7b-instruct-q4_0', nazwa: 'qwen2.5-7b-instruct-q4_0.gguf' },
];
const OLLAMA_BAZA = 'https://registry.ollama.ai/v2';

async function modelZOllama() {
  for (const m of MODELE_OLLAMA) {
    try {
      const k = new AbortController();
      const t = setTimeout(() => k.abort(), 8000);
      const r = await fetch(`${OLLAMA_BAZA}/${m.repo}/manifests/${m.tag}`, {
        headers: {
          'Accept': 'application/vnd.docker.distribution.manifest.v2+json',
          'User-Agent': `OPERO/${productionConfig().productVersion}`,
        },
        signal: k.signal,
      });
      clearTimeout(t);
      if (!r.ok) continue;
      const manifest = await r.json();
      // Warstwa z samym modelem - reszta to szablon rozmowy i ustawienia.
      const warstwa = (manifest?.layers || []).find(w => String(w?.mediaType || '').includes('image.model'));
      const suma = String(warstwa?.digest || '').replace(/^sha256:/, '').toLowerCase();
      if (!suma) continue;
      logToFile('INFO', `Zrodlo modelu z rejestru Ollamy: ${m.repo}:${m.tag}`);
      return {
        nazwa: m.nazwa,
        rozmiar: Number(warstwa.size) || 0,
        suma,
        url: `${OLLAMA_BAZA}/${m.repo}/blobs/sha256:${suma}`,
        repo: `${m.repo}:${m.tag}`,
        opis: `Model ${m.nazwa} z rejestru Ollamy.`,
        czesci: [],
        zrodlo: 'ollama',
      };
    } catch { /* nastepny kandydat */ }
  }
  return null;
}

/**
 * Lista modeli, ktore wolno sprzedawac razem z programem. Te same repozytoria
 * sprawdza budowa (narzedzia\pobierz-silnik.ps1) i z tego samego powodu:
 * licencja Apache 2.0 pozwala uzywac modelu komercyjnie bez oplat. Modeli na
 * licencji Llama tu nie ma swiadomie - nakladaja dodatkowe obowiazki.
 */
const MODELE_ZAPASOWE = [
  { repo: 'speakleash/Bielik-11B-v2.5-Instruct-GGUF', kwant: ['Q4_K_M', 'Q4_K_S'] },
  { repo: 'speakleash/Bielik-11B-v2.3-Instruct-GGUF', kwant: ['Q4_K_M', 'Q4_K_S'] },
  { repo: 'bartowski/Qwen2.5-7B-Instruct-GGUF', kwant: ['Q4_K_M', 'Q4_K_S'] },
];

/** Spis plikow repozytorium na Hugging Face; `lfs` niesie rozmiar i sume. */
async function spisPlikowHF(repo) {
  const k = new AbortController();
  const t = setTimeout(() => k.abort(), 8000);
  try {
    const r = await fetch(`https://huggingface.co/api/models/${repo}/tree/main`, {
      headers: { 'User-Agent': `OPERO/${productionConfig().productVersion}` }, signal: k.signal,
    });
    if (!r.ok) return [];
    const spis = await r.json();
    return Array.isArray(spis) ? spis : [];
  } catch { return []; }
  finally { clearTimeout(t); }
}

async function modelZHuggingFace() {
  for (const m of MODELE_ZAPASOWE) {
    const spis = await spisPlikowHF(m.repo);
    const gguf = spis.filter(w => /\.gguf$/i.test(String(w?.path || '')) && !/split|part/i.test(String(w.path)));
    for (const kw of m.kwant) {
      const w = gguf.find(x => new RegExp(kw, 'i').test(String(x.path)));
      if (!w) continue;
      const suma = String(w?.lfs?.oid || '').replace(/^sha256:/, '').toLowerCase();
      // Bez sumy nie pobieramy. Plik, ktorego nie ma czym sprawdzic, to plik,
      // o ktorym nie wiemy, czy doszedl caly - a mowa o szesciu gigabajtach.
      if (!suma) continue;
      const nazwa = String(w.path).split('/').pop();
      logToFile('INFO', `Zrodlo modelu znalezione wprost u zrodla: ${m.repo}/${nazwa}`);
      return {
        nazwa, rozmiar: Number(w?.lfs?.size || w?.size) || 0, suma,
        url: `https://huggingface.co/${m.repo}/resolve/main/${encodeURIComponent(w.path)}?download=true`,
        repo: m.repo, opis: `Model ${nazwa} z ${m.repo}.`, czesci: [], zrodlo: 'huggingface',
      };
    }
  }
  return null;
}

/**
 * Czy u zrodla jest nowszy plik modelu.
 *
 * Pytamy Hugging Face o spis plikow w tym samym repozytorium i szukamy pliku
 * o tej samej kwantyzacji (Q4_K_M i tak dalej). Jesli nazwa rozni sie od tej,
 * ktora mamy — jest nowsza wersja. Spis podaje przy okazji rozmiar i sume
 * SHA-256 (w LFS to jest wlasnie suma zawartosci), wiec nowy plik mozna
 * sprawdzic dokladnie tak samo jak ten z instalatora.
 */
async function nowszyUZrodla(repo, obecnaNazwa) {
  if (!repo || !obecnaNazwa) return null;
  const kwant = (String(obecnaNazwa).match(/(Q\d[_A-Z0-9]*)/i) || [])[1] || '';
  try {
    const k = new AbortController();
    const t = setTimeout(() => k.abort(), 8000);
    const r = await fetch(`https://huggingface.co/api/models/${repo}/tree/main`, {
      headers: { 'User-Agent': `OPERO/${productionConfig().productVersion}` }, signal: k.signal,
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const spis = await r.json();
    const pasuje = (Array.isArray(spis) ? spis : []).filter(w =>
      /\.gguf$/i.test(String(w?.path || '')) && !/split|part/i.test(String(w.path)) &&
      (!kwant || new RegExp(kwant, 'i').test(String(w.path))));
    if (!pasuje.length) return null;
    // Najnowszy wpis to ten o najwiekszym pliku tej samej kwantyzacji; przy
    // rownych bierzemy pierwszy. Nazwy wersji (v2.5, v3.0) roznia sie tekstem,
    // wiec porownujemy je wprost z nasza.
    const w = pasuje[0];
    const nazwa = String(w.path).split('/').pop();
    if (nazwa.toLowerCase() === String(obecnaNazwa).toLowerCase()) return null;
    return {
      nazwa,
      rozmiar: Number(w?.lfs?.size || w?.size) || 0,
      suma: String(w?.lfs?.oid || '').replace(/^sha256:/, '').toLowerCase(),
      url: `https://huggingface.co/${repo}/resolve/main/${encodeURIComponent(nazwa)}?download=true`,
      repo, opis: `Nowszy model w ${repo}.`, czesci: [], zrodlo: 'zrodlo',
    };
  } catch { return null; }
}

ipcMain.handle('per:stan-modelu', async () => {
  const stanSilnika = await silnikPer.status();
  const baza = {
    stan: 'nieznany', model: stanSilnika.model, serwerDziala: stanSilnika.serwerDziala,
    silnik: stanSilnika.silnik, nowszy: null,
    pobieranieTrwa: stanSilnika.pobieranieTrwa, postep: stanSilnika.postep,
  };
  // Rozrozniamy rozne „nie dziala", bo kazde znaczy co innego dla czlowieka:
  //   BRAK_SILNIKA — w folderze programu nie ma serwera modelu (zla instalacja),
  //   BRAK_MODELU  — serwer jest, modelu nie ma; model mozna po prostu pobrac,
  //   SERWER       — jedno i drugie jest, ale serwer nie wstaje.
  if (!stanSilnika.silnik) return { ...baza, stan: 'brak', powod: 'BRAK_SILNIKA' };
  if (!stanSilnika.model) {
    const doPobrania = await skadPobracModel();
    return { ...baza, stan: 'brak', powod: 'BRAK_MODELU', nowszy: doPobrania };
  }
  // Model jest. Sprawdzamy, czy u zrodla nie ma nowszego.
  const wskazany = await skadPobracModel();
  const obecna = String(stanSilnika.model.nazwa || '');
  if (wskazany && wskazany.nazwa.toLowerCase() !== obecna.toLowerCase()) {
    return { ...baza, stan: 'nowszy', nowszy: wskazany };
  }
  const zZrodla = await nowszyUZrodla(wskazany?.repo || '', obecna);
  if (zZrodla) return { ...baza, stan: 'nowszy', nowszy: zZrodla };
  return { ...baza, stan: 'aktualny' };
});

ipcMain.handle('per:zatrzymaj-pobieranie', async () => {
  requireActiveLicense();
  return silnikPer.zatrzymajPobieranie();
});

ipcMain.handle('per:aktualizuj-model', async (_e, url, suma) => {
  requireActiveLicense();
  // Gdy manifest opisuje model w czesciach, nie wysylamy adresu, tylko cala
  // pozycje manifestu — silnik sam sciagnie czesci i zlozy je z powrotem.
  const zPamieci = manifestZPamieci.pozycja;
  if (zPamieci && Array.isArray(zPamieci.czesci) && zPamieci.czesci.length) {
    return silnikPer.pobierzModel(zPamieci, slijPostepModelu, logToFile);
  }
  // Suma kontrolna idzie z manifestu. Bez niej plik i tak sie pobierze, ale
  // z nia mamy pewnosc, ze do folderu modeli trafia dokladnie to, co autor
  // wydania tam wlozyl — a nie polowa pliku albo cos podmienionego po drodze.
  return silnikPer.pobierzModel(String(url || '').trim().slice(0, 500), slijPostepModelu, logToFile,
    String(suma || '').trim().toLowerCase().slice(0, 64));
});
ipcMain.handle('per:usun-aktualizacje', async () => { requireActiveLicense(); return silnikPer.usunAktualizacje(); });

/**
 * NARZEDZIE NAPRAWCZE — jeden przycisk na wszystko, co moze byc nie tak.
 *
 * Po co istnieje: rzeczoznawca nie ma obowiazku wiedziec, czym rozni sie
 * „brak silnika" od „braku modelu" ani co znaczy nazwa pliku .gguf. Ma widziec
 * czerwona lampke, kliknac JEDEN przycisk i miec dzialajacego asystenta.
 *
 * Kolejnosc jest taka, bo kazdy krok zalezy od poprzedniego:
 *   1. silnik - bez niego nie ma czego uruchomic, nawet z modelem na dysku,
 *   2. model  - bez niego silnik nie ma na czym pracowac,
 *   3. start  - dopiero teraz ma sens.
 * Kazdy krok melduje, co zastal i co zrobil, zeby bylo wiadomo, co naprawdę
 * sie wydarzylo - a nie tylko „udalo sie" albo „nie udalo sie".
 */
ipcMain.handle('per:napraw', async () => {
  requireActiveLicense();
  const kroki = [];
  const dopisz = (co, stan, szczegol) => { kroki.push({ co, stan, szczegol: szczegol || '' }); };

  // --- 1. Silnik ---
  try {
    silnikPer.zatrzymaj();
  } catch {}
  if (silnikPer.plikSerwera?.()) {
    dopisz('Silnik asystenta', 'ok', 'był na miejscu');
  } else {
    const r = await silnikPer.rozpakujSilnik(logToFile).catch(e => ({ ok: false, powod: String(e?.message || e) }));
    // Silnik zniknal, a model zostal? To nie przypadek. `llama-server.exe` nie
    // ma podpisu wydawcy i programy antywirusowe kasuja go „na wszelki wypadek".
    // Mowimy to wprost, bo inaczej za tydzien bedzie to samo.
    const modelByl = !!silnikPer.wybierzModel();
    if (r?.ok) dopisz('Silnik asystenta', 'naprawione', modelByl
      ? 'rozpakowany na nowo — zniknął, choć model został; sprawdź program antywirusowy'
      : 'rozpakowany na nowo');
    else dopisz('Silnik asystenta', 'blad', r?.powod === 'BRAK_PACZKI'
      ? 'brak paczki w folderze programu — zainstaluj OPERO jeszcze raz'
      : String(r?.powod || 'nie udało się rozpakować'));
  }

  // --- 2. Model ---
  const stanPo = await silnikPer.status();
  if (stanPo.model) {
    dopisz('Model', 'ok', 'jest na dysku');
  } else {
    const zrodlo = await skadPobracModel();
    if (!zrodlo) {
      dopisz('Model', 'blad', 'nie udało się ustalić, skąd go pobrać — sprawdź internet');
    } else {
      slijPostepModelu({ etap: 'start', pobrane: 0, razem: zrodlo.rozmiar || 0, nazwa: zrodlo.nazwa });
      const w = await silnikPer.pobierzModel(zrodlo, slijPostepModelu, logToFile)
        .catch(e => ({ ok: false, blad: String(e?.message || e) }));
      if (w?.ok) {
        slijPostepModelu({ etap: 'gotowe', pobrane: w.rozmiar, razem: w.rozmiar, nazwa: w.nazwa });
        dopisz('Model', 'naprawione', 'pobrany i sprawdzony sumą kontrolną');
      } else {
        slijPostepModelu({ etap: 'blad', blad: String(w?.blad || w?.powod || '') });
        dopisz('Model', 'blad', String(w?.blad || w?.powod || 'pobieranie nie doszło do końca'));
      }
    }
  }

  // --- 3. Uruchomienie ---
  const start = await silnikPer.uruchom(logToFile).catch(e => ({ ok: false, powod: String(e?.message || e) }));
  if (start?.ok) dopisz('Uruchomienie', 'ok', 'asystent odpowiada');
  else dopisz('Uruchomienie', 'blad', String(start?.powod || 'serwer nie wstał'));

  const ok = kroki.every(k => k.stan !== 'blad');
  logToFile(ok ? 'INFO' : 'ERROR', 'Naprawa asystenta PER', kroki.map(k => `${k.co}: ${k.stan}`).join(' | '));
  return { ok, kroki };
});

/**
 * Wlasny model .gguf wskazany z dysku.
 *
 * Po to istnieje: kto ma juz model (sciagniety do innego programu, dostany na
 * dysku zewnetrznym) nie musi pobierac tych samych szesciu gigabajtow drugi raz,
 * a kto ma mocny komputer moze wskazac wiekszy model niz nasz domyslny.
 * Sprawdzamy plik ZANIM go przyjmiemy - zla sciezka objawialaby sie inaczej
 * dopiero przy pytaniu, jako „asystent nie wstaje", i nikt by nie wiedzial czemu.
 */
ipcMain.handle('per:wskaz-wlasny-model', async () => {
  requireActiveLicense();
  const r = await dialog.showOpenDialog({
    title: 'Wskaż plik modelu dla PER-a',
    properties: ['openFile'],
    filters: [{ name: 'Model językowy GGUF', extensions: ['gguf'] }],
  });
  if (r.canceled || !r.filePaths?.length) return { ok: false, anulowane: true };
  const wynik = silnikPer.ustawWlasnyModel(r.filePaths[0]);
  if (wynik.ok) {
    logToFile('INFO', `Wskazano wlasny model: ${wynik.plik} (${Math.round(wynik.rozmiar / 1048576)} MB)`);
    try { silnikPer.zatrzymaj(); } catch {}
    silnikPer.uruchom(logToFile).catch(() => {});
  }
  return wynik;
});
/** Otwiera folder, do ktorego mozna recznie wlozyc silnik albo model. */
ipcMain.handle('per:otworz-folder', async (_e, co) => {
  requireActiveLicense();
  const folder = co === 'silnik' ? silnikPer.folderSilnikaUzytkownika() : silnikPer.folderModeliUzytkownika();
  try { fs.mkdirSync(folder, { recursive: true }); } catch {}
  const blad = await shell.openPath(folder);
  return { ok: !blad, folder, blad: blad || '' };
});

ipcMain.handle('per:zapomnij-wlasny-model', async () => {
  requireActiveLicense();
  const r = silnikPer.zapomnijWlasnyModel();
  try { silnikPer.zatrzymaj(); } catch {}
  silnikPer.uruchom(logToFile).catch(() => {});
  return r;
});

/**
 * Profil rzeczoznawcy - imie, nazwisko, numer uprawnien, pracownia.
 *
 * Te dane sa w KAZDYM operacie i do tej pory trzeba bylo je wpisywac za kazdym
 * razem od nowa. Numer uprawnien wpisany raz z literowka trafia do dokumentu,
 * pod ktorym ktos sie podpisuje - wiec lepiej, zeby byl wpisany raz, porzadnie.
 */
function czysteProfilPole(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
ipcMain.handle('profil:odczytaj', async () => {
  const p = readAppState().profilRzeczoznawcy;
  return (p && typeof p === 'object') ? p : { name: '', licenseNo: '', company: '', address: '', phone: '', email: '' };
});
ipcMain.handle('profil:zapisz', async (_e, dane) => {
  requireActiveLicense();
  const d = dane || {};
  const profil = {
    name: czysteProfilPole(d.name, 160),
    licenseNo: czysteProfilPole(d.licenseNo, 40),
    company: czysteProfilPole(d.company, 160),
    address: czysteProfilPole(d.address, 300),
    phone: czysteProfilPole(d.phone, 60),
    email: czysteProfilPole(d.email, 160),
  };
  writeAppState({ profilRzeczoznawcy: profil });
  return profil;
});
/* --- Wzorce: wlasne uklady dokumentu i szablony operatu --------------------
   Leza w tym samym pliku co profil, na tym komputerze. Przed zapisem wszystko
   przechodzi przez filtr z wzorce.js - plik moze zostac zmieniony recznie,
   a jego zawartosc trafia potem prosto do operatu. */
const wzorceLogika = require('./renderer/wzorce.js');
ipcMain.handle('wzorce:odczytaj', async () => wzorceLogika.stanCzysty(readAppState().wzorce));
ipcMain.handle('wzorce:zapisz', async (_e, stan) => {
  requireActiveLicense();
  const czysty = wzorceLogika.stanCzysty(stan);
  writeAppState({ wzorce: czysty });
  return czysty;
});
app.on('before-quit', () => { try { silnikPer.zatrzymaj(); } catch {} });
/**
 * Model pobiera sie TYLKO z reki czlowieka.
 *
 * Program sam nie siega po kilka gigabajtow. Przy wlaczeniu sprawdza tylko, co
 * ma na dysku, i pokazuje to kolorem w pasku asystenta PER:
 *   czerwony     - modelu nie ma,
 *   pomaranczowy - model jest, ale u zrodla lezy nowszy,
 *   zielony      - model jest i jest aktualny.
 * Pobranie zaczyna sie po klikniecu „Pobierz model" w panelu PER - i nigdy
 * samo. Rzeczoznawca pracuje czasem na laczu, ktore liczy kazdy gigabajt, i to
 * ON decyduje, kiedy sciagnac te 6 GB, a nie program za jego plecami.
 */
app.whenReady().then(() => {
  setTimeout(() => {
    // Gdy model JEST, silnik wstaje tutaj, zeby pierwsze pytanie nie czekalo na
    // wczytanie kilku gigabajtow. Gdy modelu nie ma, nie dzieje sie nic - panel
    // PER pokaze czerwona kropke i przycisk do pobrania.
    silnikPer.uruchom(logToFile).catch(() => {});
  }, 4000);
});

// -----------------------------
// OPERO 1.14.0 — nowa wersja z GitHub Releases.
//
// Program niczego nie instaluje sam: sprawdza, czy jest nowsze wydanie, i otwiera
// stronę pobierania. Rzeczoznawca ma wiedzieć, co się zmienia w narzędziu, którym
// podpisuje się pod wyceną — podmiana w tle byłaby tu nie na miejscu.
function wersjaNaLiczby(v) {
  return String(v || '').replace(/^v/i, '').split(/[.\-+]/).slice(0, 3).map(x => Number(x) || 0);
}
function nowszaWersja(a, b) {
  const x = wersjaNaLiczby(a), y = wersjaNaLiczby(b);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) > (y[i] || 0)) return true; if ((x[i] || 0) < (y[i] || 0)) return false; }
  return false;
}
ipcMain.handle('aktualizacje:sprawdz', async () => {
  const cfg = productionConfig();
  const repo = cfg.aktualizacjeRepo;
  if (!repo) return { ok: false, skonfigurowane: false, wersja: cfg.productVersion,
    message: 'Sprawdzanie aktualizacji nie jest jeszcze skonfigurowane w tej wersji programu.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': `OPERO/${cfg.productVersion}` },
      signal: controller.signal,
    });
    if (r.status === 404) return { ok: true, skonfigurowane: true, jestNowsza: false, wersja: cfg.productVersion,
      message: 'Nie ma jeszcze opublikowanego wydania.' };
    if (!r.ok) throw new Error(`GitHub odpowiedział ${r.status}`);
    const j = await r.json();
    const tag = String(j?.tag_name || '').trim();
    const instalator = (j?.assets || []).find(a => /\.exe$/i.test(String(a?.name || '')));
    return {
      ok: true, skonfigurowane: true,
      wersja: cfg.productVersion, najnowsza: tag.replace(/^v/i, ''),
      jestNowsza: nowszaWersja(tag, cfg.productVersion),
      opis: String(j?.body || '').slice(0, 4000),
      wydano: j?.published_at || '',
      adres: String(instalator?.browser_download_url || j?.html_url || ''),
      rozmiar: Number(instalator?.size || 0),
    };
  } catch (e) {
    return { ok: false, skonfigurowane: true, wersja: cfg.productVersion,
      message: e?.name === 'AbortError' ? 'GitHub nie odpowiedział w ciągu 12 sekund.' : `Nie udało się sprawdzić aktualizacji: ${String(e?.message || e)}` };
  } finally { clearTimeout(timer); }
});
ipcMain.handle('aktualizacje:otworz', async (_e, adres) => {
  const url = String(adres || productionConfig().aktualizacjeStrona || '').trim();
  if (!/^https:\/\/(github\.com|objects\.githubusercontent\.com)\//i.test(url)) {
    return { ok: false, message: 'Pobieranie jest możliwe wyłącznie ze strony wydań OPERO na GitHubie.' };
  }
  await shell.openExternal(url);
  return { ok: true, url };
});

ipcMain.handle('license:import-file', async () => {
  const r = await dialog.showOpenDialog(mainWindow,{title:'Wczytaj klucz OPERO',properties:['openFile'],filters:[{name:'Klucz OPERO',extensions:['opero-license','txt']},{name:'Wszystkie pliki',extensions:['*']}]});
  if(r.canceled||!r.filePaths?.[0])return {canceled:true};
  // Plik z generatora ma nagłówek „KLUCZ LICENCYJNY OPERO" i opis - bierzemy sam klucz.
  const code=wyciagnijKluczOpero(fs.readFileSync(r.filePaths[0],'utf8'));
  return {canceled:false,filePath:r.filePaths[0],code};
});
ipcMain.handle('license:open-purchase', async () => ({
  ok: false, lokalnie: true,
  message: `Klucze OPERO wystawia autor programu — bez żadnego serwera. Podaj mu kod tego urządzenia: ${publicDeviceCode()}. Klucz przyjdzie jednym ciągiem zaczynającym się od „OPERO1." i wklejasz go w pole wyżej.`,
}));

// -----------------------------
// OPERO 1.5 — brak kont lokalnych. Dostępu pilnuje wyłącznie klucz licencyjny,
// kupowany na stronie OPERO i zapamiętywany po pierwszej aktywacji.
// Dane (operaty, Historia, ustawienia) leżą wspólnie w katalogu danych użytkownika Windows.

function appStatePath() { return path.join(rootUserData(), 'app-state.json'); }
function readAppState() { const v = safeJsonRead(appStatePath(), {}); return v && typeof v === 'object' ? v : {}; }
function writeAppState(patch) {
  const next = { ...readAppState(), ...patch, updatedAt: new Date().toISOString() };
  safeJsonWrite(appStatePath(), next);
  return next;
}

// --- Migracja z wersji z kontami (<= 1.4.x) ---------------------------------
// Do 1.4.x każde konto miało własny katalog accounts_data/<id>/ z Historią i operatami.
// Po usunięciu logowania dane muszą trafić do katalogu wspólnego, inaczej użytkownik
// po aktualizacji zobaczyłby pustą Historię mimo że pliki nadal są na dysku.
function migrateAccountsToSingleWorkspace() {
  const root = rootUserData();
  const accFile = path.join(root, 'accounts.json');
  if (!fs.existsSync(accFile)) return null;

  const rows = (() => { const r = safeJsonRead(accFile, []); return Array.isArray(r) ? r : []; })();
  const report = { wykonano: new Date().toISOString(), kontaZnalezione: rows.length, przeniesionePliki: 0, zrodlo: null, pozostaleKonta: [] };

  // Wybór konta: ostatnio zalogowane, a gdy nieznane — ostatnio modyfikowane.
  const session = safeJsonRead(path.join(root, 'session.json'), {});
  const lastLogin = String(session?.lastLogin || '').trim().toLowerCase();
  const byLogin = rows.find(a => String(a?.login || '').trim().toLowerCase() === lastLogin && lastLogin);
  const byDate = [...rows].sort((a, b) => Date.parse(String(b?.updatedAt || 0)) - Date.parse(String(a?.updatedAt || 0)))[0];
  const chosen = byLogin || byDate || null;

  if (chosen) {
    report.zrodlo = { id: String(chosen.id || ''), login: String(chosen.login || ''), storageMode: String(chosen.storageMode || '') };
    // Konto w trybie 'legacy-root' trzymało dane wprost w katalogu głównym — nie ma czego przenosić.
    if (chosen.storageMode !== 'legacy-root') {
      const src = path.join(root, 'accounts_data', String(chosen.id));
      if (fs.existsSync(src)) {
        const przenies = (od, doK) => {
          for (const e of fs.readdirSync(od, { withFileTypes: true })) {
            const a = path.join(od, e.name), b = path.join(doK, e.name);
            if (e.isDirectory()) { fs.mkdirSync(b, { recursive: true }); przenies(a, b); continue; }
            // Nie nadpisujemy plików, które już są w katalogu wspólnym.
            if (fs.existsSync(b)) continue;
            try { fs.renameSync(a, b); } catch { fs.copyFileSync(a, b); try { fs.rmSync(a, { force: true }); } catch {} }
            report.przeniesionePliki++;
          }
        };
        fs.mkdirSync(root, { recursive: true });
        try { przenies(src, root); } catch (e) { logToFile('ERROR', 'migracja', e); report.blad = String(e?.message || e); }
      }
    }
    if (chosen.tutorialDone) writeAppState({ tutorialDone: true });
  }

  // Pozostałe konta zostawiamy nietknięte — użytkownik może chcieć odzyskać z nich dane ręcznie.
  report.pozostaleKonta = rows
    .filter(a => !chosen || String(a.id) !== String(chosen.id))
    .map(a => ({ login: String(a?.login || ''), katalog: path.join(root, 'accounts_data', String(a?.id || '')) }))
    .filter(x => fs.existsSync(x.katalog));

  // accounts.json zachowujemy jako ślad po migracji — zawiera skróty haseł, więc
  // usuwamy z niego dane uwierzytelniające.
  try {
    const okrojone = rows.map(a => ({
      id: a?.id, login: a?.login, name: a?.name, createdAt: a?.createdAt, updatedAt: a?.updatedAt,
      storageMode: a?.storageMode, licenseId: a?.licenseId || a?.licenseBinding?.licenseId || '',
    }));
    safeJsonWrite(path.join(root, 'konta-przed-migracja-1.5.json'), okrojone);
    fs.rmSync(accFile, { force: true });
    fs.rmSync(path.join(root, 'session.json'), { force: true });
  } catch (e) { logToFile('WARN', 'migracja: porzadki', e); }

  safeJsonWrite(path.join(root, 'MIGRACJA-1.5.json'), report);
  logToFile('INFO', 'migracja do 1.5', JSON.stringify(report));
  return report;
}

function requireActiveLicense() {
  const lic = offlineLicenseState(false);
  if (!lic.active) throw new Error(lic.message || 'Licencja OPERO nie jest aktywna. Wprowadź klucz licencyjny.');
  return lic;
}

ipcMain.handle('app:get-state', async () => {
  const st = readAppState();
  const migracja = safeJsonRead(path.join(rootUserData(), 'MIGRACJA-1.5.json'), null);
  return {
    tutorialDone: !!st.tutorialDone,
    productVersion: productionConfig().productVersion,
    license: offlineLicenseState(false),
    // Pokazujemy jednorazowy komunikat, jeśli po aktualizacji zostały dane innych kont.
    migracja: migracja && !st.migracjaPotwierdzona && (migracja.pozostaleKonta || []).length
      ? { pozostaleKonta: migracja.pozostaleKonta, przeniesionePliki: migracja.przeniesionePliki }
      : null,
  };
});
// --- Ksiazka klientow i przypomnienia (1.8.0) --------------------------------
// Oba zbiory leza w katalogu danych uzytkownika, obok Historii. Nic nie wychodzi
// na serwer — to sa dane osobowe klientow rzeczoznawcy.
function clientsPath() { return path.join(rootUserData(), 'klienci.json'); }
function remindersPath() { return path.join(rootUserData(), 'przypomnienia.json'); }

// Uszkodzony plik NIE moze zostac po cichu potraktowany jak pusty — pierwszy zapis
// skasowalby cala ksiazke klientow. Odkladamy go obok jako .uszkodzony-<data>.
function readCollection(file) {
  if (!fs.existsSync(file)) return [];
  let tekst = '';
  try { tekst = fs.readFileSync(file, 'utf8'); }
  catch (e) { logToFile('ERROR', 'odczyt pliku', file, e); throw new Error(`Nie udało się odczytać pliku ${path.basename(file)}. Sprawdź, czy nie jest otwarty przez inny program.`); }
  if (!tekst.trim()) return [];
  try {
    const rows = JSON.parse(tekst.charCodeAt(0) === 0xFEFF ? tekst.slice(1) : tekst);
    if (!Array.isArray(rows)) throw new Error('oczekiwano listy');
    return rows.filter(r => r && typeof r === 'object');
  } catch (e) {
    const kopia = `${file}.uszkodzony-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    try { fs.copyFileSync(file, kopia); } catch {}
    logToFile('ERROR', 'uszkodzony plik danych', `${file} -> ${path.basename(kopia)}`, e);
    throw new Error(`Plik ${path.basename(file)} jest uszkodzony i nie został nadpisany. Kopia leży obok jako ${path.basename(kopia)} — możesz ją otworzyć w notatniku i odzyskać dane.`);
  }
}
function newRowId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function textField(v, max = 200) { return String(v ?? '').trim().slice(0, max); }

function normalizeClient(row = {}, previous = null) {
  const now = new Date().toISOString();
  return {
    id: textField(row.id, 64) || previous?.id || newRowId('kli'),
    kind: row.kind === 'firma' ? 'firma' : 'osoba',
    name: textField(row.name, 160),
    company: textField(row.company, 160),
    nip: textField(row.nip, 20).replace(/[^0-9]/g, ''),
    address: textField(row.address, 300),
    email: textField(row.email, 160),
    phone: textField(row.phone, 60),
    purpose: textField(row.purpose, 300),
    contractNo: textField(row.contractNo, 80),
    contractDate: textField(row.contractDate, 20),
    notes: textField(row.notes, 1000),
    createdAt: previous?.createdAt || textField(row.createdAt, 40) || now,
    updatedAt: now,
  };
}
function normalizeReminder(row = {}, previous = null) {
  const now = new Date().toISOString();
  return {
    id: textField(row.id, 64) || previous?.id || newRowId('prz'),
    title: textField(row.title, 200),
    dueAt: textField(row.dueAt, 40),
    place: textField(row.place, 200),
    note: textField(row.note, 1000),
    projectId: textField(row.projectId, 80),
    projectTitle: textField(row.projectTitle, 200),
    kind: ['oglednie', 'termin', 'platnosc', 'inne'].includes(row.kind) ? row.kind : 'inne',
    done: !!row.done,
    createdAt: previous?.createdAt || textField(row.createdAt, 40) || now,
    updatedAt: now,
  };
}

function saveRow(file, row, normalize) {
  const rows = readCollection(file);
  const id = textField(row?.id, 64);
  const at = id ? rows.findIndex(r => r.id === id) : -1;
  const next = normalize(row, at >= 0 ? rows[at] : null);
  if (at >= 0) rows[at] = next; else rows.push(next);
  safeJsonWrite(file, rows);
  return next;
}
function removeRow(file, id) {
  const wanted = textField(id, 64);
  if (!wanted) return { ok: false, removed: 0 };
  const rows = readCollection(file);
  const left = rows.filter(r => r.id !== wanted);
  safeJsonWrite(file, left);
  return { ok: true, removed: rows.length - left.length };
}

ipcMain.handle('clients:list', async () => (requireActiveLicense(), readCollection(clientsPath()))
  .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))));
ipcMain.handle('clients:save', async (_e, row) => (requireActiveLicense(), saveRow(clientsPath(), row, normalizeClient)));
ipcMain.handle('clients:delete', async (_e, id) => (requireActiveLicense(), removeRow(clientsPath(), id)));

ipcMain.handle('reminders:list', async () => (requireActiveLicense(), readCollection(remindersPath()))
  .sort((a, b) => String(a.dueAt || '').localeCompare(String(b.dueAt || ''))));
ipcMain.handle('reminders:save', async (_e, row) => (requireActiveLicense(), saveRow(remindersPath(), row, normalizeReminder)));
ipcMain.handle('reminders:delete', async (_e, id) => (requireActiveLicense(), removeRow(remindersPath(), id)));

// Eksport do pliku .ics — dziala z Kalendarzem Google, Outlookiem i kazdym innym.
function icsEscape(v) {
  return String(v ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function icsStamp(value) {
  const t = Date.parse(String(value || ''));
  const d = Number.isFinite(t) ? new Date(t) : new Date();
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function icsFold(line) {
  // RFC 5545: linia nie moze przekroczyc 75 oktetow — dluzsze lamiemy spacja.
  const out = [];
  let buf = line;
  while (Buffer.byteLength(buf, 'utf8') > 73) {
    let cut = 73;
    while (cut > 1 && Buffer.byteLength(buf.slice(0, cut), 'utf8') > 73) cut--;
    out.push(buf.slice(0, cut));
    buf = ' ' + buf.slice(cut);
  }
  out.push(buf);
  return out.join('\r\n');
}
function buildICS(rows) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OPERO//Przypomnienia//PL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const r of rows) {
    const poczatek = Date.parse(String(r.dueAt || ''));
    if (!Number.isFinite(poczatek)) continue;      // wiersz z niepoprawna data pomijamy
    const start = icsStamp(r.dueAt);
    const end = icsStamp(new Date(poczatek + 3600000).toISOString());
    lines.push('BEGIN:VEVENT');
    lines.push(icsFold(`UID:${r.id || newRowId('prz')}@opero`));
    lines.push(`DTSTAMP:${icsStamp(new Date().toISOString())}`);
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${end}`);
    lines.push(icsFold(`SUMMARY:${icsEscape(r.title || 'Przypomnienie OPERO')}`));
    if (r.place) lines.push(icsFold(`LOCATION:${icsEscape(r.place)}`));
    const opis = [r.note, r.projectTitle ? `Operat: ${r.projectTitle}` : ''].filter(Boolean).join('\n');
    if (opis) lines.push(icsFold(`DESCRIPTION:${icsEscape(opis)}`));
    lines.push('BEGIN:VALARM', 'TRIGGER:-PT60M', 'ACTION:DISPLAY', icsFold(`DESCRIPTION:${icsEscape(r.title || 'Przypomnienie OPERO')}`), 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

ipcMain.handle('reminders:export-ics', async (_e, payload) => {
  requireActiveLicense();
  const wanted = Array.isArray(payload?.ids) ? payload.ids.map(x => textField(x, 64)) : null;
  const all = readCollection(remindersPath()).filter(r => r.dueAt);
  const wybrane = wanted && wanted.length ? all.filter(r => wanted.includes(r.id)) : all.filter(r => !r.done);
  const rows = wybrane.filter(r => Number.isFinite(Date.parse(String(r.dueAt || ''))));
  const pominiete = wybrane.length - rows.length;
  if (!rows.length) return { ok: false, message: 'Nie ma terminów z poprawną datą do wyeksportowania.' };
  const domyslna = rows.length === 1
    ? `OPERO-${(rows[0].title || 'termin').replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+/g, '_').slice(0, 40)}.ics`
    : 'OPERO-terminy.ics';
  const r = await dialog.showSaveDialog(mainWindow, {
    title: 'Zapisz terminy do kalendarza',
    defaultPath: path.join(app.getPath('documents'), domyslna),
    filters: [{ name: 'Kalendarz (iCalendar)', extensions: ['ics'] }],
  });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  fs.writeFileSync(r.filePath, buildICS(rows), 'utf8');
  logToFile('INFO', 'eksport ics', `${rows.length} terminow, pominieto ${pominiete}`);
  return { ok: true, filePath: r.filePath, count: rows.length, skipped: pominiete };
});

ipcMain.handle('app:set-tutorial', async (_e, done) => ({ ok: true, state: writeAppState({ tutorialDone: !!done }) }));
ipcMain.handle('app:ack-migration', async () => ({ ok: true, state: writeAppState({ migracjaPotwierdzona: true }) }));



// -----------------------------
// Import danych rynkowych z plików tabelarycznych.
function parseDelimited(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(x => x.trim());
  if (!lines.length) return [];
  const candidates = [';', '\t', ','];
  const delimiter = candidates.map(d => [d, (lines[0].match(new RegExp(d === '\t' ? '\\t' : `\\${d}`, 'g')) || []).length]).sort((a,b)=>b[1]-a[1])[0][0];
  function splitLine(line) {
    const out=[]; let cur=''; let quoted=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"') { if(quoted && line[i+1]==='"'){cur+='"';i++;} else quoted=!quoted; }
      else if(ch===delimiter && !quoted){out.push(cur);cur='';}
      else cur+=ch;
    }
    out.push(cur); return out.map(x=>x.trim());
  }
  return lines.map(splitLine);
}

// Pliki CSV zapisywane przez polskiego Excela mają zwykle kodowanie Windows-1250, nie UTF-8.
function readTextFileSmart(file) {
  const buf = fs.readFileSync(file);
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return buf.subarray(3).toString('utf8');
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return buf.subarray(2).toString('utf16le');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch {
    try { return new TextDecoder('windows-1250').decode(buf); }
    catch { return buf.toString('latin1'); }
  }
}

const xlsx = require('./xlsx-czytnik');
// 3.2: bez PowerShella i bez Excela (antywirusy blokuja PowerShell z zakodowanym
// poleceniem). XLSX czyta wlasny czytnik; stary .xls trzeba zapisac jako .xlsx/CSV.
async function readExcelWithCom(file) {
  if (path.extname(file).toLowerCase() !== '.xlsx') throw new Error('Stary format .xls nie jest obsługiwany — zapisz arkusz jako .xlsx albo CSV (Plik → Zapisz jako).');
  return xlsx.czytaj(file).map(a => ({ name: a.nazwa, rows: a.wiersze }));
}

// -----------------------------
// Import wyciagu RCiWN (1.10.0). XLSX czytamy wlasnym czytnikiem, bez Excela:
// wyciag ze starostwa bywa jedynym plikiem, od ktorego zaczyna sie operat, wiec
// import nie moze zalezec od tego, czy ktos ma zainstalowany pakiet Office.
// (czytnik XLSX wczytany wyzej)
ipcMain.handle('rcn:wczytaj', async () => {
  requireActiveLicense();
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Wczytaj wyciąg z rejestru cen (RCiWN)', properties: ['openFile'],
    filters: [{ name: 'Wyciąg RCiWN', extensions: ['xlsx', 'csv', 'txt', 'xls'] }],
  });
  if (r.canceled || !r.filePaths?.[0]) return { canceled: true };
  const plik = r.filePaths[0], ext = path.extname(plik).toLowerCase();
  try {
    if (ext === '.csv' || ext === '.txt') {
      return { canceled: false, plik, arkusze: [{ nazwa: path.basename(plik), wiersze: parseDelimited(readTextFileSmart(plik)) }] };
    }
    if (ext === '.xlsx') return { canceled: false, plik, arkusze: xlsx.czytaj(plik) };
    // Stary .xls to zupelnie inny format binarny — tu nadal potrzebny jest Excel.
    const sheets = await readExcelWithCom(plik);
    return { canceled: false, plik, arkusze: (sheets || []).map(s => ({ nazwa: s.name, wiersze: s.rows })) };
  } catch (e) {
    throw new Error(`Nie udało się odczytać pliku: ${e.message} Jeśli to stary .xls, zapisz go jako .xlsx albo CSV.`);
  }
});

ipcMain.handle('market:import-spreadsheet', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importuj transakcje / pary z arkusza', properties: ['openFile'],
    filters: [{ name: 'Arkusze i CSV', extensions: ['xlsx','xls','csv','txt'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const file = result.filePaths[0];
  const ext = path.extname(file).toLowerCase();
  if (ext === '.csv' || ext === '.txt') {
    return { canceled: false, filePath: file, sheets: [{ name: path.basename(file), rows: parseDelimited(readTextFileSmart(file)) }] };
  }
  try {
    const sheets = await readExcelWithCom(file);
    return { canceled: false, filePath: file, sheets };
  } catch (e) {
    throw new Error(`Nie udalo sie odczytac XLS/XLSX. ${e.message}`);
  }
});

// Fotografie z aparatu / telefonu potrafią mieć 6-12 MB. Trafiają one do projektu jako base64,
// więc bez przeskalowania operat z 30 zdjęciami waży setki MB, a PDF staje się niemożliwy do wysłania.
// Skalujemy do 1920 px dłuższego boku — to znacznie powyżej rozdzielczości druku A4 przy 150 dpi.
const PHOTO_MAX_EDGE = 1920;
const PHOTO_JPEG_QUALITY = 82;
function preparePhoto(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const srcMime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const buf = fs.readFileSync(file);
  const base = { id: crypto.randomUUID(), name: path.basename(file), originalPath: file };
  try {
    let img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) throw new Error('nieobsługiwany format obrazu');
    const size = img.getSize();
    const longest = Math.max(size.width, size.height);
    if (longest > PHOTO_MAX_EDGE) {
      img = size.width >= size.height
        ? img.resize({ width: PHOTO_MAX_EDGE, quality: 'best' })
        : img.resize({ height: PHOTO_MAX_EDGE, quality: 'best' });
    }
    // PNG zachowuje przezroczystość (rzuty, szkice), zdjęcia idą do JPEG.
    const asPng = srcMime === 'image/png';
    const out = asPng ? img.toPNG() : img.toJPEG(PHOTO_JPEG_QUALITY);
    const outMime = asPng ? 'image/png' : 'image/jpeg';
    // Jeżeli konwersja nic nie dała (mały plik), zostaw oryginał.
    if (out.length && out.length < buf.length) {
      const s = img.getSize();
      return { ...base, size: out.length, originalSize: buf.length, width: s.width, height: s.height, dataUrl: `data:${outMime};base64,${out.toString('base64')}` };
    }
  } catch (e) { logToFile('WARN', 'preparePhoto', file, e); }
  return { ...base, size: buf.length, dataUrl: `data:${srcMime};base64,${buf.toString('base64')}` };
}

ipcMain.handle('photos:pick', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Dodaj fotografie do operatu', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Zdjęcia', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
  });
  if (result.canceled) return [];
  const MAX_SOURCE = 80 * 1024 * 1024;
  return result.filePaths.map(file => {
    try {
      if (fs.statSync(file).size > MAX_SOURCE) return { error: `Plik ${path.basename(file)} przekracza limit 80 MB.` };
      return preparePhoto(file);
    } catch (e) {
      logToFile('WARN', 'photos:pick', file, e);
      return { error: `Nie udało się wczytać pliku ${path.basename(file)}: ${e.message}` };
    }
  });
});

/* --- Okno portalu: program czyta strone, ktora czlowiek otworzyl ------------
   Osobne okno z wlasna, odcieta sesja (bez dostepu do plikow i do programu).
   Program nie chodzi po portalu sam: czyta tekst TEJ strony, ktora jest
   otwarta, dopiero po kliknieciu „Wczytaj oferty z tej strony". */
const portalLogika = require('./renderer/portal-czytaj.js');
let portalOkno = null;
ipcMain.handle('portal:otworz', async (_e, zadanie) => {
  requireActiveLicense();
  const url = String(zadanie?.url || '');
  if (!portalLogika.adresDozwolony(url)) throw new Error('Tego adresu nie mogę otworzyć w oknie portalu.');
  if (portalOkno && !portalOkno.isDestroyed()) { await portalOkno.loadURL(url).catch(() => {}); portalOkno.show(); portalOkno.focus(); return { ok: true }; }
  portalOkno = new BrowserWindow({
    width: 1240, height: 860, parent: mainWindow, title: 'OPERO — portal (czytam tylko stronę, którą widzisz)',
    autoHideMenuBar: true,
    webPreferences: { partition: 'persist:opero-portal', nodeIntegration: false, contextIsolation: true, sandbox: true, devTools: false },
  });
  portalOkno.setMenuBarVisibility(false);
  // Nowe karty zostaja w tym samym oknie - inaczej ogloszenie otwarte „w nowej
  // karcie" byloby poza zasiegiem przycisku „Wczytaj".
  portalOkno.webContents.setWindowOpenHandler(({ url: nowy }) => {
    if (portalLogika.adresDozwolony(nowy)) portalOkno.loadURL(nowy).catch(() => {});
    return { action: 'deny' };
  });
  portalOkno.on('closed', () => { portalOkno = null; });
  portalOkno.loadURL(url).catch(e => logToFile('WARN', 'Okno portalu', String(e?.message || e)));
  return { ok: true };
});
ipcMain.handle('portal:czytaj', async () => {
  requireActiveLicense();
  if (!portalOkno || portalOkno.isDestroyed()) return { ok: false, powod: 'Okno portalu jest zamknięte. Otwórz portal i przejdź do listy ogłoszeń.' };
  try {
    const w = await portalOkno.webContents.executeJavaScript(
      '({ url: location.href, tytul: document.title, tekst: document.body ? document.body.innerText.slice(0, 400000) : "" })', true);
    let host = '';
    try { host = new URL(w.url).hostname.replace(/^www\./, ''); } catch {}
    return { ok: true, url: String(w.url || ''), host, tytul: String(w.tytul || '').slice(0, 200), tekst: String(w.tekst || '') };
  } catch (e) {
    logToFile('WARN', 'Okno portalu - odczyt', String(e?.message || e));
    return { ok: false, powod: 'Nie udało się odczytać strony. Poczekaj, aż się wczyta, i spróbuj ponownie.' };
  }
});

/* --- PER szuka w internecie (Brave Search, klucz uzytkownika) ----------------
   Klucz lezy na tym komputerze, zaszyfrowany mechanizmem systemu, gdy system
   go udostepnia. Program wysyla do wyszukiwarki wylacznie tresc zapytania. */
const siecLogika = require('./renderer/siec-szukaj.js');
function siecKluczOdczytaj(){
  const z = readAppState().siecKlucz;
  if (!z || typeof z !== 'object' || !z.dane) return '';
  try {
    const { safeStorage } = require('electron');
    if (z.szyfr === 'system' && safeStorage?.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(z.dane, 'base64'));
    if (z.szyfr === 'brak') return Buffer.from(z.dane, 'base64').toString('utf8');
  } catch (e) { logToFile('WARN', 'Klucz wyszukiwarki', String(e?.message || e)); }
  return '';
}
ipcMain.handle('siec:stan', async () => ({ jestKlucz: !!siecKluczOdczytaj(), dostawca: 'Brave Search' }));
ipcMain.handle('siec:klucz-zapisz', async (_e, klucz) => {
  requireActiveLicense();
  const k = String(klucz || '').trim();
  if (!k) { writeAppState({ siecKlucz: null }); return { jestKlucz: false }; }
  if (!/^[A-Za-z0-9_\-]{16,128}$/.test(k)) throw new Error('To nie wygląda na klucz Brave Search — skopiuj go jeszcze raz, bez spacji.');
  const { safeStorage } = require('electron');
  const szyfrowane = safeStorage?.isEncryptionAvailable();
  writeAppState({ siecKlucz: szyfrowane
    ? { szyfr: 'system', dane: safeStorage.encryptString(k).toString('base64') }
    : { szyfr: 'brak', dane: Buffer.from(k, 'utf8').toString('base64') } });
  return { jestKlucz: true };
});
ipcMain.handle('siec:szukaj', async (_e, zadanie) => {
  requireActiveLicense();
  const klucz = siecKluczOdczytaj();
  if (!klucz) return { ok: false, brakKlucza: true, powod: 'Nie ma klucza wyszukiwarki. Wpisz klucz Brave Search w Ustawieniach.', wyniki: [] };
  const url = siecLogika.url(zadanie?.zapytanie);
  if (!url) return { ok: false, powod: 'Zapytanie jest za krótkie.', wyniki: [] };
  try {
    const odp = await fetchWithTimeout(url, { headers: { accept: 'application/json', 'x-subscription-token': klucz } }, 15000, 'wyszukiwarka');
    if (!odp.ok) return { ok: false, powod: siecLogika.komunikatBledu(odp.status), wyniki: [] };
    return siecLogika.zOdpowiedzi(await odp.text());
  } catch (e) {
    logToFile('WARN', 'Wyszukiwarka', String(e?.message || e));
    return { ok: false, powod: `Wyszukiwarka nie odpowiada (${String(e?.message || e)}).`, wyniki: [] };
  }
});

/* --- Rozpoznawanie pisma ze zrzutow ekranu (3.2: BEZ PowerShella) ---------
   Do wersji 3.1 OCR szedl przez powershell.exe z zakodowanym poleceniem — to
   typowy wzorzec, ktory antywirusy (np. Norton: IDP.HELU.PSE96) blokuja.
   Teraz program nie uruchamia zadnego zewnetrznego procesu:
     1) silnik pisma wbudowany w Windows, wolany przez Chromium wewnatrz
        programu (Shape Detection API: TextDetector, w Windows oparty na
        Windows.Media.Ocr) — w ukrytym, odizolowanym oknie bez dostepu do
        plikow; obraz trafia tam jako dane, nie jako sciezka,
     2) gdy tego silnika brak, a wlaczony jest model w chmurze — odczyt
        obrazu modelem (tylko za zgoda z Ustawien).
   Nic nie jest wysylane, jesli model w chmurze jest wylaczony. */

function ocrPowod(kod){
  const k = String(kod || '');
  if (/BRAK_SILNIKA/.test(k)) return 'Silnik pisma Windows jest niedostępny w tym systemie. Włącz model w chmurze (Ustawienia → Mózg agentów) albo wklej treść księgi tekstem. Jeśli masz Windows 10/11: sprawdź też, czy jest zainstalowane rozpoznawanie pisma dla polskiego. Dodaj je: Ustawienia → Czas i język → Język i region → Polski → Opcje języka → „Optyczne rozpoznawanie znaków".';
  if (/ZA_DUZY/.test(k)) return 'Zrzut jest za duży dla silnika rozpoznawania pisma. Zrób zrzut samego działu księgi, nie całego ekranu w powiększeniu.';
  return `Silnik rozpoznawania pisma zgłosił błąd: ${k.slice(0, 200) || 'nieznany'}.`;
}

let ocrOkno = null;
async function ocrOknoGotowe(){
  if (ocrOkno && !ocrOkno.isDestroyed()) return ocrOkno;
  ocrOkno = new BrowserWindow({ show: false, width: 320, height: 240, skipTaskbar: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, experimentalFeatures: true, javascript: true } });
  ocrOkno.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  ocrOkno.webContents.on('will-navigate', (ev, cel) => { if (!String(cel).startsWith('opero-ocr://')) ev.preventDefault(); });
  try { await ocrOkno.loadURL('opero-ocr://app/ocr.html'); }
  catch (e) { logToFile('WARN', 'OCR okno', String(e?.message || e)); await ocrOkno.loadURL('data:text/html;charset=utf-8,<!doctype html><title>OPERO OCR</title>'); }
  return ocrOkno;
}
app.on('before-quit', () => { try { if (ocrOkno && !ocrOkno.isDestroyed()) ocrOkno.destroy(); } catch {} });

/** Linie z TextDetector -> slowa z przyblizonym polozeniem (szerokosc proporcjonalna do liczby znakow). */
function ocrLinieNaSlowa(linie){
  const slowa = [];
  for (const l of (linie || [])){
    const t = String(l.t || '').trim(); if (!t) continue;
    const czesci = t.split(/\s+/), znaki = czesci.reduce((a, c) => a + c.length, 0) + Math.max(0, czesci.length - 1);
    let x = Number(l.x) || 0; const na = (Number(l.w) || 0) / Math.max(1, znaki);
    for (const c of czesci){ slowa.push({ t: c, x: Math.round(x * 10) / 10, y: Math.round((Number(l.y) || 0) * 10) / 10, w: Math.round(c.length * na * 10) / 10, h: Math.round((Number(l.h) || 0) * 10) / 10 }); x += (c.length + 1) * na; }
  }
  return slowa;
}

async function ocrPrzezChmure(plik){
  if (!chmuraAktywna()) return null;
  let img = nativeImage.createFromPath(plik); if (img.isEmpty()) return null;
  const r = img.getSize(); if (Math.max(r.width, r.height) > 2000) img = r.width >= r.height ? img.resize({ width: 2000, quality: 'best' }) : img.resize({ height: 2000, quality: 'best' });
  const w = await chmuraWywolaj([{ role: 'user', content: [{ type: 'image', dataUrl: `data:image/png;base64,${img.toPNG().toString('base64')}` },
    { type: 'text', text: 'Przepisz DOKŁADNIE cały tekst z obrazu, linia po linii, z zachowaniem polskich znaków, liczb, ukośników i myślników. Nic nie dodawaj ani nie poprawiaj. Bez komentarzy.' }] }], { maks: 4000 });
  const { width, height } = img.getSize();
  const linie = String(w.text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const h = height / Math.max(40, linie.length + 2);
  return { ok: true, jezyk: 'model w chmurze', slowa: ocrLinieNaSlowa(linie.map((t, i) => ({ t, x: 10, y: (i + 1) * h, w: Math.min(width - 20, t.length * h * 0.5), h: h * 0.8 }))) };
}

/** Jeden obraz → slowa z polozeniem. Bez zewnetrznych procesow. */
async function ocrCzytajPlik(plik){
  try {
    const img = nativeImage.createFromPath(plik);
    if (img.isEmpty()) return { ok: false, powod: 'Nie mogę otworzyć tego obrazu.' };
    const okno = await ocrOknoGotowe();
    const dane = 'data:image/png;base64,' + img.toPNG().toString('base64');
    const w = await Promise.race([
      okno.webContents.executeJavaScript(`(async () => {
        if (typeof TextDetector === 'undefined') return { ok: false, powod: 'BRAK_SILNIKA' };
        const b = await createImageBitmap(await (await fetch(${JSON.stringify(dane)})).blob());
        const d = await new TextDetector().detect(b);
        return { ok: true, linie: d.map(x => ({ t: x.rawValue, x: x.boundingBox.x, y: x.boundingBox.y, w: x.boundingBox.width, h: x.boundingBox.height })) };
      })()`, true),
      new Promise(r => setTimeout(() => r({ ok: false, powod: 'CZAS' }), 60000)),
    ]);
    if (w && w.ok && (w.linie || []).length >= 3) return { ok: true, jezyk: 'Windows', slowa: ocrLinieNaSlowa(w.linie) };
    // 3.3: drugi silnik — Tesseract wbudowany w program (działa bez internetu i bez Windows OCR).
    const t = await Promise.race([
      okno.webContents.executeJavaScript(`(async () => { if (!window.operoOcr) return { ok: false, powod: 'BRAK_TESSERACT' }; return await window.operoOcr(${JSON.stringify(dane)}); })()`, true).catch(e => ({ ok: false, powod: String(e?.message || e) })),
      new Promise(r => setTimeout(() => r({ ok: false, powod: 'CZAS' }), 120000)),
    ]);
    if (t && t.ok && (t.slowa || []).length) return { ok: true, jezyk: 'Tesseract (pol)', slowa: t.slowa.map(x => ({ t: x.t, x: x.x, y: x.y, w: x.w, h: x.h })) };
    if (w && w.ok) return { ok: true, jezyk: 'Windows', slowa: ocrLinieNaSlowa(w.linie) };
    logToFile('WARN', 'OCR', `TextDetector: ${w?.powod || (w?.linie || []).length}; Tesseract: ${t?.powod || 'pusto'}`);
    const zChmury = await ocrPrzezChmure(plik).catch(e => { logToFile('WARN', 'OCR chmura', String(e?.message || e)); return null; });
    if (zChmury) return zChmury;
    return { ok: false, powod: w?.powod === 'CZAS' ? 'Rozpoznawanie pisma trwało za długo i zostało przerwane.' : ocrPowod(w?.powod) };
  } catch (e) {
    logToFile('WARN', 'OCR', String(e?.message || e));
    const zChmury = await ocrPrzezChmure(plik).catch(() => null);
    return zChmury || { ok: false, powod: `Rozpoznawanie pisma nie zadziałało: ${String(e?.message || e).slice(0, 160)}` };
  }
}

ipcMain.handle('ocr:zrzuty', async () => {
  requireActiveLicense();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Wskaż zrzuty ekranu księgi wieczystej', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Obrazy', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'webp'] }],
  });
  if (result.canceled) return { canceled: true, zrzuty: [] };
  const zrzuty = [];
  for (const plik of result.filePaths.slice(0, 12)) {
    const w = await ocrCzytajPlik(plik);
    let zdjecie = null;
    try { zdjecie = preparePhoto(plik); } catch (e) { logToFile('WARN', 'OCR - miniatura', plik, e); }
    zrzuty.push({ nazwa: path.basename(plik), ...w, zdjecie });
  }
  return { canceled: false, zrzuty };
});

const MIME = {
  '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain', '.csv': 'text/csv', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'
};
ipcMain.handle('files:pick', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Dodaj pliki źródłowe / załączniki', properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Obsługiwane pliki', extensions: ['pdf','doc','docx','xls','xlsx','txt','csv','jpg','jpeg','png','webp'] },
      { name: 'Wszystkie pliki', extensions: ['*'] },
    ],
  });
  if (result.canceled) return [];
  const MAX = 50 * 1024 * 1024;
  return result.filePaths.map(file => {
    const stat = fs.statSync(file);
    if (stat.size > MAX) return { error: `Plik ${path.basename(file)} przekracza limit 50 MB.` };
    const ext = path.extname(file).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const buf = fs.readFileSync(file);
    const isImage = mime.startsWith('image/');
    return {
      id: crypto.randomUUID(), name: path.basename(file), originalPath: file, extension: ext.slice(1), mime, size: buf.length,
      dataBase64: buf.toString('base64'), previewDataUrl: isImage ? `data:${mime};base64,${buf.toString('base64')}` : '',
    };
  });
});

function qrSvg(text, scale = 5, margin = 4) {
  const qr = new QRCode(0, QRErrorCorrectLevel.M);
  qr.addData(String(text));
  qr.make();
  const count = qr.getModuleCount();
  const size = (count + margin * 2) * scale;
  const rects = [];
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) rects.push(`<rect x="${(c + margin) * scale}" y="${(r + margin) * scale}" width="${scale}" height="${scale}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="white"/><g fill="black">${rects.join('')}</g></svg>`;
}
ipcMain.handle('maps:qr', async (_e, mapsUrl) => {
  const text = String(mapsUrl || '').trim();
  if (!text) return { dataUrl: '', svg: '' };
  const svg = qrSvg(text);
  return { svg, dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}` };
});

function headerFooterTemplates(meta = {}) {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const theme = esc(meta.accent || '#a97700');
  const title = esc(meta.headerText || 'Operat szacunkowy nieruchomości lokalowej');
  const footerLeft = esc(meta.footerText || 'Operat szacunkowy');
  const header = `<div style="font-size:8px;width:100%;margin:0 15mm;color:#666;font-family:Arial,sans-serif;border-bottom:1px solid ${theme};padding-bottom:3px;text-align:center;">${title}</div>`;
  const footer = `<div style="font-size:8px;width:100%;margin:0 15mm;color:#666;font-family:Arial,sans-serif;border-top:1px solid ${theme};padding-top:3px;display:flex;justify-content:space-between;"><span>${footerLeft}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
  return { header, footer };
}

ipcMain.handle('pdf:preview', async (_e, payload) => {
  if (typeof payload?.html !== 'string' || payload.html.length < 100) throw new Error('Generator raportu nie przekazał poprawnej treści HTML.');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opero-preview-'));
  const htmlPath = path.join(tempDir, 'report-preview.html');
  fs.writeFileSync(htmlPath, payload.html, 'utf8');
  const win = new BrowserWindow({
    width: 1180, height: 900, minWidth: 850, minHeight: 650,
    title: 'OPERO — podgląd raportu', backgroundColor:'#eee9dd',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences:{ sandbox:true, javascript:false }
  });
  win.setMenuBarVisibility(false);
  await win.loadFile(htmlPath);
  win.on('closed',()=>{ try{fs.rmSync(tempDir,{recursive:true,force:true});}catch{} });
  return { ok:true };
});

/* ============================================================
   EKSPORT DO .DOCX

   Word nie zastepuje PDF-a - PDF idzie do podpisu, Word do poprawek. Oba
   skladamy z TEGO SAMEGO html-a, zeby wersja, ktora rzeczoznawca poprawia,
   byla tym samym dokumentem, ktory widzial w podgladzie.
   ============================================================ */
const docxOperat = require('./docx-operat.js');

ipcMain.handle('docx:export', async (_e, payload) => {
  if (typeof payload?.html !== 'string' || payload.html.length < 100) {
    throw new Error('Generator raportu nie przekazal poprawnej tresci dokumentu.');
  }
  const r = await dialog.showSaveDialog(mainWindow, {
    title: 'Zapisz operat do edycji (Word)',
    defaultPath: String(payload.defaultName || 'operat_szacunkowy.docx').replace(/\.pdf$/i, '.docx'),
    filters: [{ name: 'Dokument Word', extensions: ['docx'] }],
  });
  if (r.canceled || !r.filePath) return { canceled: true };
  const wynik = docxOperat.zHtml(payload.html, { tytul: payload.tytul, autor: payload.autor });
  fs.writeFileSync(r.filePath, wynik.plik);
  logToFile('INFO', `Operat zapisany do Worda: ${r.filePath} (${wynik.statystyka.akapitow} akapitow, ${wynik.statystyka.obrazow} obrazow)`);
  return { canceled: false, filePath: r.filePath, ...wynik.statystyka };
});

ipcMain.handle('pdf:export', async (_e, payload) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Eksportuj operat do PDF',
    defaultPath: payload?.defaultName || 'operat_szacunkowy.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'operatai-report-'));
  const htmlPath = path.join(tempDir, 'report.html');
  if (typeof payload?.html !== 'string' || payload.html.length < 100) throw new Error('Generator raportu nie przekazal poprawnej tresci HTML.');
  fs.writeFileSync(htmlPath, payload.html, 'utf8');
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await win.loadFile(htmlPath);
    await new Promise(r => setTimeout(r, 450));
    const hf = headerFooterTemplates(payload.meta || {});
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      preferCSSPageSize: true,
      displayHeaderFooter: payload?.meta?.showHeaderFooter !== false,
      headerTemplate: hf.header,
      footerTemplate: hf.footer,
      margins: { top: 0.55, bottom: 0.58, left: 0.42, right: 0.42 },
    });
    fs.writeFileSync(result.filePath, pdf);
  } finally {
    win.destroy();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
  return { canceled: false, filePath: result.filePath };
});

// Przejscie do ChatGPT usuniete w 1.18.0 — redakcja tekstu odbywa sie lokalnie (per:redaguj).

/* ===========================================================================
   OPERO 2.0 — agenci: model w chmurze, WhatsApp, pamiec wzorcow
   ---------------------------------------------------------------------------
   Sekrety (klucz do modelu, token WhatsApp) leza w stanie programu,
   zaszyfrowane przez system. Okno programu NIGDY ich nie dostaje z powrotem –
   pyta tylko „czy jest”. Wysylanie do sieci odbywa sie wylacznie tutaj.
   =========================================================================== */
function sekretOdczytaj(nazwa){
  const z = readAppState()[nazwa];
  if (!z || typeof z !== 'object' || !z.dane) return '';
  try {
    const { safeStorage } = require('electron');
    if (z.szyfr === 'system' && safeStorage?.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(z.dane, 'base64'));
    if (z.szyfr === 'brak') return Buffer.from(z.dane, 'base64').toString('utf8');
  } catch (e) { logToFile('WARN', `Sekret ${nazwa}`, String(e?.message || e)); }
  return '';
}
function sekretZapisz(nazwa, wartosc){
  const k = String(wartosc || '').trim();
  if (!k) { writeAppState({ [nazwa]: null }); return false; }
  const { safeStorage } = require('electron');
  const szyfrowane = safeStorage?.isEncryptionAvailable();
  writeAppState({ [nazwa]: szyfrowane
    ? { szyfr: 'system', dane: safeStorage.encryptString(k).toString('base64') }
    : { szyfr: 'brak', dane: Buffer.from(k, 'utf8').toString('base64') } });
  return true;
}
/* Jedno zapytanie, bez ponawiania: powtorzony POST moglby wyslac wiadomosc
   dwa razy albo dwa razy obciazyc konto u dostawcy modelu. */
async function zapytanieRaz(url, opcje, czasMs){
  const c = new AbortController(); const t = setTimeout(() => c.abort(), czasMs || 30000);
  try {
    const r = await fetch(url, { ...opcje, signal: c.signal, redirect: 'error' });
    return { status: r.status, tekst: await r.text() };
  } catch (e) {
    const s = String(e?.message || e);
    throw new Error(/abort/i.test(s) ? 'serwer nie odpowiedział w wyznaczonym czasie' : /fetch failed|ENOTFOUND|ECONN|EAI_AGAIN/i.test(s) ? 'brak połączenia z serwerem' : s);
  } finally { clearTimeout(t); }
}

/* --- model w chmurze ------------------------------------------------------ */
const chmuraLogika = require('./renderer/model-chmura.js');
const CHMURA_KLUCZ_STAN = 'chmuraKlucz';
function chmuraStan(){
  const ustawienia = chmuraLogika.ustawienia(readAppState().chmura);
  const jestKlucz = !!sekretOdczytaj(CHMURA_KLUCZ_STAN);
  return { ustawienia, jestKlucz, gotowosc: chmuraLogika.gotowosc(ustawienia, jestKlucz), dostawcy: chmuraLogika.DOSTAWCY.map(d => ({ id: d.id, nazwa: d.nazwa, stalaBaza: d.stalaBaza, baza: d.baza })) };
}
function chmuraAktywna(){ return chmuraStan().gotowosc.aktywny; }
async function chmuraWywolaj(wiadomosci, opcje){
  const s = chmuraStan();
  if (!s.gotowosc.aktywny) throw new Error('Model w chmurze nie jest włączony.');
  const z = chmuraLogika.zadanie(s.ustawienia, sekretOdczytaj(CHMURA_KLUCZ_STAN), wiadomosci, opcje);
  if (!z) throw new Error('Nie udało się złożyć zapytania do modelu w chmurze.');
  if (z.wymagaLicencji) {
    // Mózg OPERO wpuszcza tylko program z ważną licencją — wysyłamy klucz licencji (nie klucz prywatny).
    const row = safeJsonRead(licenseStatePath(), null);
    z.body.licencja = String(row?.klucz || '');
    z.body.program = `OPERO ${app.getVersion()}`;
    if (!z.body.licencja) throw new Error('Mózg OPERO wymaga aktywnej licencji OPERO.');
  }
  let odp;
  try { odp = await zapytanieRaz(z.url, { method: 'POST', headers: z.naglowki, body: JSON.stringify(z.body) }, 240000); }
  catch (e) { logToFile('WARN', 'Model w chmurze', String(e?.message || e)); throw new Error(`Model w chmurze: ${String(e?.message || e)}.`); }
  const w = chmuraLogika.zOdpowiedzi(s.ustawienia.dostawca, odp.status, odp.tekst);
  if (!w.ok) { logToFile('WARN', 'Model w chmurze', `${odp.status} ${w.powod}`); throw new Error(w.powod); }
  return w;
}
ipcMain.handle('chmura:stan', async () => chmuraStan());
ipcMain.handle('chmura:zapisz', async (_e, dane) => {
  requireActiveLicense();
  const d = dane || {};
  if (d.ustawienia) {
    const u = chmuraLogika.ustawienia(d.ustawienia);
    // Wlaczenie bez zgody nie przechodzi – zgoda musi byc zaznaczona swiadomie.
    if (u.wlaczony && !u.zgoda) u.wlaczony = false;
    writeAppState({ chmura: u });
  }
  if (d.usunKlucz) sekretZapisz(CHMURA_KLUCZ_STAN, '');
  else if (typeof d.klucz === 'string' && d.klucz.trim()) {
    const k = d.klucz.trim();
    if (!/^[\x21-\x7e]{16,400}$/.test(k)) throw new Error('To nie wygląda na klucz do modelu — skopiuj go jeszcze raz, bez spacji.');
    sekretZapisz(CHMURA_KLUCZ_STAN, k);
  }
  return chmuraStan();
});
ipcMain.handle('chmura:modele', async () => {
  requireActiveLicense();
  const s = chmuraStan();
  const z = chmuraLogika.zadanieListy(s.ustawienia, sekretOdczytaj(CHMURA_KLUCZ_STAN));
  if (!z) return { ok: false, powod: 'Najpierw zapisz klucz (i adres serwera, jeśli to inny dostawca).', modele: [] };
  try {
    const odp = await zapytanieRaz(z.url, { method: 'GET', headers: z.naglowki }, 20000);
    if (!(odp.status >= 200 && odp.status < 300)) return { ok: false, powod: chmuraLogika.komunikatBledu(odp.status, odp.tekst), modele: [] };
    const modele = chmuraLogika.zListy(odp.tekst);
    return modele.length ? { ok: true, modele } : { ok: false, powod: 'Dostawca nie zwrócił listy modeli — wpisz nazwę modelu ręcznie.', modele: [] };
  } catch (e) { return { ok: false, powod: `Nie udało się pobrać listy: ${String(e?.message || e)}.`, modele: [] }; }
});
/* Oględziny ze zdjęć: tylko model w chmurze widzi obrazy. Zdjęcia są
   zmniejszane do 1024 px, zanim wyjdą z komputera. */
ipcMain.handle('chmura:zdjecia', async (_e, z) => {
  requireActiveLicense();
  if (!chmuraAktywna()) return { ok: false, brakChmury: true, powod: 'Model lokalny nie widzi zdjęć. Opisz stan w opisie zlecenia albo włącz model w chmurze (Ustawienia).' };
  const obrazy = [];
  for (const d of (Array.isArray(z?.zdjecia) ? z.zdjecia : []).slice(0, 12)){
    const m = /^data:image\/(?:png|jpeg|webp);base64,(.+)$/.exec(String(d || ''));
    if (!m) continue;
    let img = nativeImage.createFromBuffer(Buffer.from(m[1], 'base64'));
    if (img.isEmpty()) continue;
    const r = img.getSize(); if (Math.max(r.width, r.height) > 1024) img = r.width >= r.height ? img.resize({ width: 1024, quality: 'best' }) : img.resize({ height: 1024, quality: 'best' });
    obrazy.push({ type: 'image', dataUrl: `data:image/jpeg;base64,${img.toJPEG(75).toString('base64')}` });
  }
  if (!obrazy.length) return { ok: false, powod: 'Nie ma zdjęć do obejrzenia.' };
  try {
    const w = await chmuraWywolaj([{ role: 'user', content: [...obrazy, { type: 'text', text: String(z?.polecenie || '').slice(0, 6000) }] }], { maks: 2500 });
    return { ok: true, text: w.text, zdjec: obrazy.length };
  } catch (e) { return { ok: false, powod: String(e?.message || e) }; }
});
/* 3.4: WIZJA — Claude czyta obrazy dokumentów i zdjęcia (zrzuty i skany ksiąg,
   rzuty, zdjęcia elewacji i wnętrz, mapy). Obraz: ścieżka pliku albo data URL. */
function wizjaObraz(zrodlo, krawedz){
  let img = null;
  const t = String(zrodlo || '');
  const m = /^data:image\/(?:png|jpeg|webp);base64,(.+)$/.exec(t);
  if (m) img = nativeImage.createFromBuffer(Buffer.from(m[1], 'base64'));
  else if (t && fs.existsSync(t)) img = nativeImage.createFromPath(t);
  if (!img || img.isEmpty()) return null;
  const r = img.getSize(), k = Math.max(256, Math.min(2000, Number(krawedz) || 1568));
  if (Math.max(r.width, r.height) > k) img = r.width >= r.height ? img.resize({ width: k, quality: 'best' }) : img.resize({ height: k, quality: 'best' });
  return `data:image/jpeg;base64,${img.toJPEG(82).toString('base64')}`;
}
ipcMain.handle('chmura:wizja', async (_e, z) => {
  requireActiveLicense();
  if (!chmuraAktywna()) return { ok: false, brakChmury: true, powod: 'Mózg AI jest wyłączony — włącz go w Ustawieniach (Mózg OPERO, Claude).' };
  const obrazy = (Array.isArray(z?.obrazy) ? z.obrazy : []).slice(0, 20).map(o => wizjaObraz(o, z?.krawedz)).filter(Boolean).map(dataUrl => ({ type: 'image', dataUrl }));
  if (!obrazy.length && !String(z?.polecenie || '').trim()) return { ok: false, powod: 'Brak obrazów i polecenia.' };
  const wiadomosci = [];
  if (z?.system) wiadomosci.push({ role: 'system', content: String(z.system).slice(0, 20000) });
  wiadomosci.push({ role: 'user', content: [...obrazy, { type: 'text', text: String(z?.polecenie || '').slice(0, 150000) }] });
  try {
    const w = await chmuraWywolaj(wiadomosci, { maks: Math.min(8000, Number(z?.maks) || 3000) });
    return { ok: true, text: w.text, obrazow: obrazy.length };
  } catch (e) { return { ok: false, powod: String(e?.message || e) }; }
});

ipcMain.handle('chmura:probuj', async () => {
  requireActiveLicense();
  try { const w = await chmuraWywolaj([{ role: 'user', content: 'Odpowiedz jednym słowem: działa.' }], { maks: 200 }); return { ok: true, tekst: w.text.slice(0, 120) }; }
  catch (e) { return { ok: false, powod: String(e?.message || e) }; }
});

/* --- WhatsApp ------------------------------------------------------------- */
const waLogika = require('./renderer/whatsapp.js');
const WA_TOKEN_STAN = 'whatsappToken';
function waStan(){
  const ustawienia = waLogika.ustawienia(readAppState().whatsapp);
  const jestToken = !!sekretOdczytaj(WA_TOKEN_STAN);
  return { ustawienia, jestToken, gotowosc: waLogika.gotowosc(ustawienia, jestToken) };
}
ipcMain.handle('whatsapp:stan', async () => waStan());
ipcMain.handle('whatsapp:zapisz', async (_e, dane) => {
  requireActiveLicense();
  const d = dane || {};
  if (d.ustawienia) writeAppState({ whatsapp: waLogika.ustawienia(d.ustawienia) });
  if (d.usunToken) sekretZapisz(WA_TOKEN_STAN, '');
  else if (typeof d.token === 'string' && d.token.trim()) {
    const k = d.token.trim();
    if (!/^[A-Za-z0-9_\-|.]{40,600}$/.test(k)) throw new Error('To nie wygląda na token dostępu Meta — skopiuj go jeszcze raz, w całości.');
    sekretZapisz(WA_TOKEN_STAN, k);
  }
  return waStan();
});
ipcMain.handle('whatsapp:wyslij', async (_e, tekst) => {
  requireActiveLicense();
  const s = waStan();
  if (!s.gotowosc.automat) return { ok: false, powod: s.gotowosc.wlaczony ? `Do automatycznej wysyłki brakuje: ${s.gotowosc.brak.join(', ')}.` : 'Automatyczna wysyłka jest wyłączona.', reczne: true };
  const z = waLogika.zadanie(s.ustawienia, tekst);
  if (!z) return { ok: false, powod: 'Wiadomość jest pusta.' };
  try {
    const odp = await zapytanieRaz(z.url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${sekretOdczytaj(WA_TOKEN_STAN)}` }, body: JSON.stringify(z.body) }, 20000);
    const w = waLogika.zOdpowiedzi(odp.status, odp.tekst);
    if (!w.ok) logToFile('WARN', 'WhatsApp', `${odp.status} ${w.kod || ''} ${w.powod}`);
    return w;
  } catch (e) { logToFile('WARN', 'WhatsApp', String(e?.message || e)); return { ok: false, powod: `WhatsApp: ${String(e?.message || e)}.` }; }
});
ipcMain.handle('whatsapp:otworz', async (_e, tekst) => {
  const s = waStan();
  const url = waLogika.link(s.ustawienia.odbiorca, tekst);
  await shell.openExternal(url);
  return { ok: true, zNumerem: !!s.ustawienia.odbiorca };
});

/* --- pamiec wzorcow (wlasne operaty jako wzor stylu) ---------------------- */
const pamiecLogika = require('./renderer/pamiec-wzorcow.js');
/* Pamiec moze urosnac do setek operatow, wiec lezy w osobnym pliku, a nie
   w stanie programu czytanym przy kazdym kliknieciu. */
function pamiecPlik(){ return path.join(rootUserData(), 'pamiec-wzorcow.json'); }
function pamiecOdczytaj(){
  let surowy = safeJsonRead(pamiecPlik(), null);
  if (!surowy) { const stary = readAppState().pamiecWzorcow; if (stary) surowy = stary; }
  return pamiecLogika.stanCzysty(surowy || {});
}
function pamiecZapisz(stan){
  const czysty = pamiecLogika.stanCzysty(stan);
  const plik = pamiecPlik(), tymczasowy = plik + '.tmp';
  fs.mkdirSync(path.dirname(plik), { recursive: true });
  fs.writeFileSync(tymczasowy, JSON.stringify(czysty), 'utf8');
  fs.renameSync(tymczasowy, plik);
  if (readAppState().pamiecWzorcow) writeAppState({ pamiecWzorcow: null });
  return czysty;
}
function pamiecCzytajPlik(sciezka){
  const nazwa = path.basename(sciezka);
  try {
    const st = fs.statSync(sciezka);
    if (st.size > 40 * 1024 * 1024) return { nazwa, ok: false, powod: 'plik jest większy niż 40 MB' };
    let tekst = '';
    if (/\.docx$/i.test(sciezka)) {
      const buf = fs.readFileSync(sciezka);
      const wpis = xlsxCzytnik.katalogZip(buf).get('word/document.xml');
      if (!wpis) return { nazwa, ok: false, powod: 'to nie jest dokument Word (.docx)' };
      tekst = pamiecLogika.tekstZDocx(xlsxCzytnik.rozpakuj(buf, wpis).toString('utf8'));
    } else tekst = fs.readFileSync(sciezka, 'utf8');
    return { nazwa, ok: true, tekst: tekst.slice(0, 400000) };
  } catch (e) { return { nazwa, ok: false, powod: String(e?.message || e).slice(0, 160) }; }
}
/** Wszystkie operaty z folderu i podfolderow (do 6 poziomow, do 3000 plikow). */
function pamiecPlikiZFolderu(folder){
  const wynik = [];
  const idz = (dir, poziom) => {
    if (poziom > 6 || wynik.length >= 3000) return;
    let wpisy = []; try { wpisy = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const w of wpisy) {
      if (wynik.length >= 3000) return;
      if (w.name.startsWith('.') || w.name.startsWith('~$')) continue;
      const pelna = path.join(dir, w.name);
      if (w.isDirectory()) idz(pelna, poziom + 1);
      else if (w.isFile() && /\.(docx|txt|md)$/i.test(w.name)) wynik.push(pelna);
    }
  };
  idz(folder, 0);
  return wynik;
}
ipcMain.handle('pamiec:odczytaj', async () => pamiecOdczytaj());
ipcMain.handle('pamiec:zapisz', async (_e, stan) => { requireActiveLicense(); return pamiecZapisz(stan); });
/* Import calego folderu odbywa sie w procesie glownym: tysiac plikow nie
   przechodzi przez okno, wraca tylko nowy stan i lista tego, co odrzucono. */
ipcMain.handle('pamiec:wczytaj-folder', async (_e, opcje) => {
  requireActiveLicense();
  const r = await dialog.showOpenDialog(mainWindow, { title: 'Wybierz folder ze swoimi operatami', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths.length) return { canceled: true };
  const sciezki = pamiecPlikiZFolderu(r.filePaths[0]);
  if (!sciezki.length) return { canceled: false, znaleziono: 0, dodane: [], odrzucone: [], stan: pamiecOdczytaj() };
  let stan = pamiecOdczytaj(); const dodane = [], odrzucone = [];
  for (let i = 0; i < sciezki.length; i += 25) {
    const paczka = sciezki.slice(i, i + 25).map(pamiecCzytajPlik);
    const w = pamiecLogika.dodajWiele(stan, paczka, { rodzaj: String(opcje?.rodzaj || '') });
    stan = w.stan; dodane.push(...w.dodane); odrzucone.push(...w.odrzucone);
    try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('pamiec:postep', { zrobione: Math.min(i + 25, sciezki.length), razem: sciezki.length }); } catch {}
    await new Promise(ok => setImmediate(ok));
  }
  stan = pamiecZapisz(stan);
  return { canceled: false, znaleziono: sciezki.length, dodane, odrzucone: odrzucone.slice(0, 200), odrzuconych: odrzucone.length, stan };
});
ipcMain.handle('pamiec:wczytaj-pliki', async () => {
  requireActiveLicense();
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Wybierz swoje operaty (Word albo tekst)', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Operaty', extensions: ['docx', 'txt', 'md'] }],
  });
  if (r.canceled || !r.filePaths.length) return { canceled: true, pliki: [] };
  const pliki = r.filePaths.slice(0, 50).map(pamiecCzytajPlik);
  return { canceled: false, pliki };
});

/* ===========================================================================
   OPERO 3.0 — „Wrzuć wszystko": jedno okno na wszystkie dokumenty
   ---------------------------------------------------------------------------
   Rzeczoznawca wrzuca pliki jak do czatu: zrzuty księgi, rzut, zdjęcia,
   PDF-y (księga, wypisy, podręcznik), Word (wzory, operaty), Excel (wyciąg
   z rejestru cen). Program sam rozpoznaje, co jest czym:
     - obraz z tekstem księgi        → księga (odczyt pisma, dwa przebiegi),
     - obraz z nazwami pomieszczeń   → rzut,
     - pozostałe obrazy              → zdjęcia,
     - PDF                           → do odczytu w oknie (pdf.js; skany przez
                                       rozpoznawanie pisma),
     - Word                          → tekst (wzór albo dokument),
     - Excel / CSV                   → wiersze (wyciąg z rejestru cen).
   Pliki nie wychodzą z komputera.
   =========================================================================== */
const WSAD_OBRAZY = /\.(png|jpe?g|webp|bmp)$/i;
const WSAD_LIMIT = 200 * 1024 * 1024;

/** Czy obraz wygląda na dokument (jasne tło, mało koloru) – wtedy warto go czytać. */
function wsadCzyDokument(img){
  try {
    const bmp = img.resize({ width: 64, height: 64, quality: 'good' }).toBitmap(); // BGRA
    let jasne = 0, kolor = 0; const n = bmp.length / 4;
    for (let i = 0; i < bmp.length; i += 4){
      const B = bmp[i], G = bmp[i + 1], R = bmp[i + 2];
      if ((R + G + B) / 3 > 200) jasne++;
      if (Math.max(R, G, B) - Math.min(R, G, B) > 45) kolor++;
    }
    return { dokument: (jasne / n > 0.42 && kolor / n < 0.18) || (kolor / n < 0.06), jasne: jasne / n, kolor: kolor / n };
  } catch { return { dokument: true, jasne: 0, kolor: 0 }; }
}

/**
 * Przygotowanie obrazu do odczytu pisma: powiększenie (drobne pismo zrzutów)
 * i drugi wariant „spłaszczony": szare tło i szare komórki tabel stają się
 * białe, pismo czarne, linki niebieskie też czarne. Ramki tabel przestają
 * udawać litery, a pogrubione wartości w białych komórkach czytają się lepiej.
 */
function ocrPrzygotuj(img){
  const { width, height } = img.getSize();
  const skala = Math.max(1, Math.min(3, 2600 / Math.max(width, 1), 9000 / Math.max(height, 1)));
  const duzy = skala > 1.05 ? img.resize({ width: Math.round(width * skala), quality: 'best' }) : img;
  const s = duzy.getSize();
  const bmp = duzy.toBitmap(), out = Buffer.alloc(bmp.length);
  for (let i = 0; i < bmp.length; i += 4){
    const B = bmp[i], G = bmp[i + 1], R = bmp[i + 2];
    const L = (R + G + B) / 3, niebieski = B - R > 60;
    const v = (L < 95 || niebieski) ? 0 : 255;
    out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255;
  }
  return { org: duzy.toPNG(), plaski: nativeImage.createFromBitmap(out, { width: s.width, height: s.height }).toPNG(), skala: skala > 1.05 ? skala : 1 };
}

/** Odczyt pisma w dwóch przebiegach. Współrzędne wracają w pikselach oryginału. */
async function ocrDwaPrzebiegi(img, { tylkoOryginal = false } = {}){
  const prep = ocrPrzygotuj(img);
  const katalog = fs.mkdtempSync(path.join(app.getPath('temp'), 'opero-ocr-'));
  const przelicz = (lista) => (lista || []).map(w => ({ t: w.t, x: w.x / prep.skala, y: w.y / prep.skala, w: w.w / prep.skala, h: w.h / prep.skala }));
  try {
    const p1 = path.join(katalog, 'org.png'); fs.writeFileSync(p1, prep.org);
    const a = await ocrCzytajPlik(p1);
    if (!a.ok) return a;
    let b = { ok: true, slowa: [] };
    if (!tylkoOryginal) { const p2 = path.join(katalog, 'plaski.png'); fs.writeFileSync(p2, prep.plaski); b = await ocrCzytajPlik(p2); }
    const { width, height } = img.getSize();
    return { ok: true, jezyk: a.jezyk, szer: width, wys: height, slowa: b.ok && (b.slowa || []).length >= (a.slowa || []).length * 0.6 ? przelicz(b.slowa) : przelicz(a.slowa), slowaOryginal: przelicz(a.slowa) };
  } finally { try { fs.rmSync(katalog, { recursive: true, force: true }); } catch {} }
}

function wsadTekstSlow(slowa){ return (slowa || []).map(w => w.t).join(' '); }

function wsadRodzajObrazu(tekst){
  const t = String(tekst || '');
  if (/KSI[ĘE]G[IA]\s+WIECZYST|DZIA[ŁL]\s+I+-?\s*(O|SP)\b|OZNACZENIE\s+NIERUCHOMO|SPIS\s+PRAW\s+ZWI|HIPOTEKA|PRAWA,\s*ROSZCZENIA/i.test(t)) return 'kw';
  const pomieszczenia = (t.match(/\b(SALON|SYPIALNIA|[ŁL]AZIENKA|KUCHNIA|POK[ÓO]J|HOL|KORYTARZ|WC|GARA[ŻZ]|WIATRO[ŁL]AP|GARDEROBA|POM\.?\s*GOSP|PRZEDPOK[ÓO]J|BALKON|TARAS)\b/gi) || []).length;
  const wymiary = (t.match(/\b\d{2,4}[,.]\d\b/g) || []).length;
  if (pomieszczenia >= 2 && wymiary >= 3) return 'rzut';
  if (pomieszczenia >= 3) return 'rzut';
  if (/WYPIS|REJESTR\s+GRUNT|MIEJSCOWY\s+PLAN|AKT\s+NOTARIALNY|ZA[ŚS]WIADCZENIE/i.test(t)) return 'dokument';
  return '';
}

async function wsadJeden(plik, postep){
  const nazwa = path.basename(plik);
  let st; try { st = fs.statSync(plik); } catch (e) { return { nazwa, ok: false, powod: 'nie ma takiego pliku' }; }
  if (!st.isFile()) return { nazwa, ok: false, powod: 'to nie jest plik' };
  if (st.size > WSAD_LIMIT) return { nazwa, ok: false, powod: 'plik jest większy niż 200 MB' };
  const ext = path.extname(plik).toLowerCase();
  try {
    if (WSAD_OBRAZY.test(plik)){
      const img = nativeImage.createFromBuffer(fs.readFileSync(plik));
      if (img.isEmpty()) return { nazwa, ok: false, powod: 'nieobsługiwany format obrazu' };
      // 3.4: przy włączonym mózgu AI obraz rozpoznaje Claude (rodzaj, treść, okładka) — bez lokalnego OCR.
      if (chmuraAktywna()) return { nazwa, ok: true, rodzaj: 'obraz', sciezka: plik, zdjecie: preparePhoto(plik) };
      const ocena = wsadCzyDokument(img);
      const nazwaMowi = /kw|ksi[eę]g|ekw|rzut|plan|szkic|wypis|mapa/i.test(nazwa);
      if (ocena.dokument || nazwaMowi || ext === '.png'){
        postep && postep(`czytam pismo: ${nazwa}`);
        const o = await ocrDwaPrzebiegi(img, { tylkoOryginal: false });
        const tekst = o.ok ? wsadTekstSlow(o.slowaOryginal) + ' ' + wsadTekstSlow(o.slowa) : '';
        const rodzaj = o.ok ? wsadRodzajObrazu(tekst) : '';
        if (rodzaj === 'kw') return { nazwa, ok: true, rodzaj: 'kw', ocr: { slowa: o.slowa, slowaOryginal: o.slowaOryginal, szer: o.szer, wys: o.wys }, zdjecie: preparePhoto(plik) };
        if (rodzaj === 'rzut') return { nazwa, ok: true, rodzaj: 'rzut', tekst: wsadTekstSlow(o.slowaOryginal), zdjecie: preparePhoto(plik) };
        if (rodzaj === 'dokument') return { nazwa, ok: true, rodzaj: 'dokument-obraz', tekst: wsadTekstSlow(o.slowaOryginal), zdjecie: preparePhoto(plik) };
        if (!o.ok && ocena.dokument) return { nazwa, ok: true, rodzaj: 'zdjecie', zdjecie: preparePhoto(plik), uwaga: o.powod };
      }
      return { nazwa, ok: true, rodzaj: 'zdjecie', zdjecie: preparePhoto(plik) };
    }
    if (ext === '.pdf') return { nazwa, ok: true, rodzaj: 'pdf', sciezka: plik, rozmiar: st.size };
    if (ext === '.docx'){
      const buf = fs.readFileSync(plik);
      const wpis = xlsxCzytnik.katalogZip(buf).get('word/document.xml');
      if (!wpis) return { nazwa, ok: false, powod: 'to nie jest dokument Word (.docx)' };
      return { nazwa, ok: true, rodzaj: 'word', tekst: pamiecLogika.tekstZDocx(xlsxCzytnik.rozpakuj(buf, wpis).toString('utf8')).slice(0, 600000), sciezka: plik, rozmiar: st.size };
    }
    if (ext === '.doc') return { nazwa, ok: false, powod: 'stary format Word (.doc) – zapisz plik jako .docx' };
    if (ext === '.xlsx' || ext === '.xls' || ext === '.csv'){
      if (ext === '.xls') return { nazwa, ok: false, powod: 'stary format Excel (.xls) – zapisz plik jako .xlsx' };
      const arkusze = ext === '.csv'
        ? [{ nazwa, wiersze: fs.readFileSync(plik, 'utf8').split(/\r?\n/).filter(Boolean).map(l => l.split(l.includes(';') ? ';' : ',')) }]
        : xlsxCzytnik.czytaj(plik).map(a => ({ nazwa: a.nazwa, wiersze: a.wiersze }));
      return { nazwa, ok: true, rodzaj: 'arkusz', arkusze, sciezka: plik };
    }
    if (ext === '.txt' || ext === '.md') return { nazwa, ok: true, rodzaj: 'tekst', tekst: fs.readFileSync(plik, 'utf8').slice(0, 600000) };
    return { nazwa, ok: true, rodzaj: 'zalacznik', sciezka: plik, rozmiar: st.size };
  } catch (e) {
    logToFile('WARN', 'Wsad', nazwa, String(e?.message || e));
    return { nazwa, ok: false, powod: String(e?.message || e).slice(0, 200) };
  }
}

async function wsadWiele(sciezki){
  const lista = [...new Set((sciezki || []).map(String).filter(Boolean))].slice(0, 300);
  const wynik = [];
  for (let i = 0; i < lista.length; i++){
    const wyslij = (krok) => { try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('wsad:postep', { zrobione: i, razem: lista.length, krok }); } catch {} };
    wyslij(`czytam: ${path.basename(lista[i])}`);
    wynik.push(await wsadJeden(lista[i], wyslij));
  }
  try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('wsad:postep', { zrobione: lista.length, razem: lista.length, krok: 'gotowe' }); } catch {}
  return wynik;
}

ipcMain.handle('wsad:wybierz', async () => {
  requireActiveLicense();
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Wrzuć dokumenty operatu: księgę, rzut, zdjęcia, PDF, Word, Excel', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Dokumenty operatu', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'pdf', 'docx', 'xlsx', 'csv', 'txt', 'md'] }, { name: 'Wszystkie pliki', extensions: ['*'] }],
  });
  if (r.canceled) return { canceled: true, pliki: [] };
  return { canceled: false, pliki: await wsadWiele(r.filePaths) };
});
ipcMain.handle('wsad:sciezki', async (_e, sciezki) => { requireActiveLicense(); return { canceled: false, pliki: await wsadWiele(Array.isArray(sciezki) ? sciezki : []) }; });

/** Odczyt pisma z obrazu przysłanego z okna (strona zeskanowanego PDF). */
ipcMain.handle('ocr:obraz', async (_e, dane) => {
  requireActiveLicense();
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(String(dane?.dataUrl || ''));
  if (!m) return { ok: false, powod: 'To nie jest obraz.' };
  const img = nativeImage.createFromBuffer(Buffer.from(m[2], 'base64'));
  if (img.isEmpty()) return { ok: false, powod: 'Pusty obraz.' };
  return ocrDwaPrzebiegi(img, { tylkoOryginal: !dane?.splaszcz });
});

/* --- Podręcznik: Twoja wiedza wzorcowa ----------------------------------
   Tekst podręcznika (z Twoich plików PDF) leży wyłącznie na tym komputerze.
   Agenci szukają w nim zasad dla danego kroku operatu. */
const podrecznikLogika = require('./renderer/wiedza-podrecznik.js');
function podrecznikPlik(){ return path.join(rootUserData(), 'wiedza-podrecznik.json'); }
function podrecznikOdczytaj(){ return podrecznikLogika.stanCzysty(safeJsonRead(podrecznikPlik(), {})); }
ipcMain.handle('podrecznik:stan', async () => podrecznikLogika.podsumowanie(podrecznikOdczytaj()));
ipcMain.handle('podrecznik:dodaj', async (_e, dok) => {
  requireActiveLicense();
  const stan = podrecznikLogika.dodaj(podrecznikOdczytaj(), dok);
  const plik = podrecznikPlik(), tmp = plik + '.tmp';
  fs.mkdirSync(path.dirname(plik), { recursive: true }); fs.writeFileSync(tmp, JSON.stringify(stan), 'utf8'); fs.renameSync(tmp, plik);
  return podrecznikLogika.podsumowanie(stan);
});
ipcMain.handle('podrecznik:usun', async (_e, id) => {
  requireActiveLicense();
  const stan = podrecznikLogika.usun(podrecznikOdczytaj(), id);
  fs.writeFileSync(podrecznikPlik(), JSON.stringify(stan), 'utf8');
  return podrecznikLogika.podsumowanie(stan);
});
ipcMain.handle('podrecznik:szukaj', async (_e, z) => podrecznikLogika.szukaj(podrecznikOdczytaj(), z || {}));

/* --- PDF: tekst, a gdy strona jest skanem – odczyt pisma ------------------
   pdf.js (Apache-2.0) w procesie głównym. Strona z warstwą tekstu oddaje
   tekst od razu. Strona bez tekstu (skan z telefonu, skaner) oddaje obraz,
   który czyta silnik rozpoznawania pisma Windows. */
let pdfjsModul = null;
async function pdfjsWczytaj(){
  if (pdfjsModul) return pdfjsModul;
  require('./vendor/pdfjs/polyfill.cjs');
  const { pathToFileURL } = require('url');
  let katalog = path.join(__dirname, 'vendor', 'pdfjs');
  const zaladuj = async (k) => {
    const m = await import(pathToFileURL(path.join(k, 'pdf.min.mjs')).href);
    m.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(k, 'pdf.worker.min.mjs')).href;
    return m;
  };
  try { pdfjsModul = await zaladuj(katalog); }
  catch (e) {
    // Moduły ES z archiwum programu: gdy system ich nie przyjmie, kopiujemy je obok danych.
    const cel = path.join(rootUserData(), 'pdfjs');
    fs.mkdirSync(cel, { recursive: true });
    for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) fs.copyFileSync(path.join(katalog, f), path.join(cel, f));
    pdfjsModul = await zaladuj(cel);
  }
  return pdfjsModul;
}

/** Największy obraz strony (skan) → nativeImage. */
async function pdfObrazStrony(pdfjs, strona){
  const ops = await strona.getOperatorList();
  let naj = null;
  for (let i = 0; i < ops.fnArray.length; i++){
    if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
    const nazwa = ops.argsArray[i][0];
    const img = await new Promise(ok => { try { strona.objs.get(nazwa, ok); } catch { try { strona.commonObjs.get(nazwa, ok); } catch { ok(null); } } });
    if (img && img.data && img.width * img.height > (naj ? naj.width * naj.height : 0)) naj = img;
  }
  if (!naj) return null;
  const { width, height, data } = naj, n = width * height, bgra = Buffer.alloc(n * 4);
  const kanaly = data.length / n;
  for (let p = 0; p < n; p++){
    const s = p * kanaly;
    const r = data[s], g = kanaly >= 3 ? data[s + 1] : r, b = kanaly >= 3 ? data[s + 2] : r;
    bgra[p * 4] = b; bgra[p * 4 + 1] = g; bgra[p * 4 + 2] = r; bgra[p * 4 + 3] = 255;
  }
  let img = nativeImage.createFromBitmap(bgra, { width, height });
  if (Math.max(width, height) > 3200) img = width >= height ? img.resize({ width: 3200, quality: 'best' }) : img.resize({ height: 3200, quality: 'best' });
  return img;
}

const ocrUklad = require('./renderer/ocr-uklad.js');
async function pdfCzytaj(dane, { postep = null, maksStron = 900 } = {}){
  const pdfjs = await pdfjsWczytaj();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(dane), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const strony = []; let zOcr = 0;
  const ile = Math.min(doc.numPages, maksStron);
  for (let nr = 1; nr <= ile; nr++){
    const strona = await doc.getPage(nr);
    const tc = await strona.getTextContent();
    let tekst = ''; let ostY = null;
    for (const it of tc.items){ const y = it.transform ? Math.round(it.transform[5]) : null; if (ostY !== null && y !== null && Math.abs(y - ostY) > 2) tekst += '\n'; else if (tekst && !tekst.endsWith(' ')) tekst += ' '; tekst += it.str; ostY = y; }
    tekst = tekst.replace(/[ \t]+\n/g, '\n').trim();
    let zrodlo = 'tekst';
    if (tekst.replace(/\s/g, '').length < 40){
      const img = await pdfObrazStrony(pdfjs, strona);
      // 3.4: krótkie skany (księga, wypis, decyzja) czyta Claude — strona idzie jako obraz.
      if (img && chmuraAktywna() && doc.numPages <= 12){
        const r = img.getSize(); const k = 1568; const m = Math.max(r.width, r.height) > k ? (r.width >= r.height ? img.resize({ width: k, quality: 'best' }) : img.resize({ height: k, quality: 'best' })) : img;
        strony.push({ nr, tekst, zrodlo: 'obraz', obraz: `data:image/jpeg;base64,${m.toJPEG(82).toString('base64')}` });
        strona.cleanup();
        continue;
      }
      if (img){
        postep && postep(`odczyt pisma: strona ${nr} z ${ile}`);
        const o = await ocrDwaPrzebiegi(img, { tylkoOryginal: true });
        if (o.ok){ tekst = ocrUklad.tekst(o.slowaOryginal).replace(/\t/g, ' '); zrodlo = 'ocr'; zOcr++; }
      }
    }
    strony.push({ nr, tekst, zrodlo });
    strona.cleanup();
    if (nr % 5 === 0) postep && postep(`strona ${nr} z ${ile}`);
  }
  await doc.destroy();
  return { stron: doc.numPages, strony, zOcr };
}

ipcMain.handle('pdf:czytaj', async (_e, z) => {
  requireActiveLicense();
  const plik = String(z?.sciezka || '');
  let dane = null;
  if (plik && fs.existsSync(plik)) dane = fs.readFileSync(plik);
  else if (z?.dane) dane = Buffer.from(String(z.dane), 'base64');
  if (!dane) return { ok: false, powod: 'Nie ma pliku PDF.' };
  const wyslij = (krok) => { try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('wsad:postep', { krok: `${path.basename(plik || 'PDF')}: ${krok}` }); } catch {} };
  try { return { ok: true, ...(await pdfCzytaj(dane, { postep: wyslij })) }; }
  catch (e) { logToFile('WARN', 'PDF', String(e?.message || e)); return { ok: false, powod: `Nie udało się odczytać PDF: ${String(e?.message || e).slice(0, 200)}` }; }
});

/* ============================================================
   3.1 — AGENT GEOPORTALU
   Ta sama droga, ktora rzeczoznawca przechodzi recznie na geoportalu:
   dzialka (ULDK) -> ortofotomapa, ewidencja, plan miejscowy, uzbrojenie
   (WMS GetMap) -> legendy (GetLegendGraphic + odczyt OCR) -> opis szczegolowy
   dzialki (GetFeatureInfo). Wszystko wraca jako zalaczniki z podanym zrodlem.
   Opcjonalnie: widoczne okno geoportalu ustawione na dzialce i zrzut ekranu.
   Uruchamia to wylacznie Agent Geoportalu po starcie zespolu przez czlowieka.
   ============================================================ */
const geoAgent = require('./renderer/geoportal-agent.js');
const geoCapCache = new Map();

async function geoPobierz(url, { binarnie = false, czas = 25000 } = {}){
  const odp = await fetchWithTimeout(url, { headers: { accept: binarnie ? 'image/png, image/jpeg, */*' : 'text/xml, text/html, text/plain, */*' } }, czas, 'uldk');
  if (!odp.ok) throw new Error(`HTTP ${odp.status}`);
  if (!binarnie) return await odp.text();
  const typ = String(odp.headers.get('content-type') || '');
  const buf = Buffer.from(await odp.arrayBuffer());
  if (/xml|html|text/i.test(typ) || buf.slice(0, 5).toString() === '<?xml') throw new Error('usługa zwróciła komunikat zamiast obrazu');
  return { buf, typ: /jpeg|jpg/i.test(typ) ? 'image/jpeg' : 'image/png' };
}

async function geoWarstwy(usluga){
  if (geoCapCache.has(usluga.id)) return geoCapCache.get(usluga.id);
  const w = geoAgent.warstwyZCap(await geoPobierz(geoAgent.capUrl(usluga), { czas: 30000 }));
  if (w.length) geoCapCache.set(usluga.id, w);
  return w;
}

async function geoportalDzialka(zapytanie) {
  const q = zapytanie || {};
  const kiedy = new Date().toISOString();
  const bledy = [];
  let dz;
  try { dz = geoAgent.zUldk(await geoPobierz(geoAgent.uldkUrl(q.id))); }
  catch (e) { return { ok: false, powod: `ULDK: ${String(e?.message || e)}` }; }
  if (!dz.ok) return dz;
  const kadr = geoAgent.kadr(dz.zasieg);
  const SZ = 1200;
  const obrys = geoAgent.naPiksele(dz.wkt, kadr, SZ, SZ);
  const mapy = [], legendy = [], info = [];
  const wybrane = (Array.isArray(q.uslugi) && q.uslugi.length ? q.uslugi : geoAgent.USLUGI.map(u => u.id)).map(geoAgent.usluga).filter(Boolean);
  for (const u of wybrane){
    let warstwy = [];
    try { warstwy = geoAgent.wybierzWarstwy(u, await geoWarstwy(u)); }
    catch (e) { bledy.push(`${u.tytul}: nie odczytałem listy warstw (${String(e?.message || e)})`); continue; }
    if (!warstwy.length){ bledy.push(`${u.tytul}: usługa nie podała warstw`); continue; }
    try {
      const o = await geoPobierz(geoAgent.mapaUrl({ usluga: u, warstwy, kadr, szer: SZ, wys: SZ }), { binarnie: true, czas: 40000 });
      mapy.push({ id: u.id, tytul: u.tytul, dataUrl: `data:${o.typ};base64,${o.buf.toString('base64')}`, przezroczysta: u.przezroczysta,
        warstwy: warstwy.map(w => w.tytul), zrodlo: u.url, podpis: geoAgent.podpis(u, dz, kiedy) });
    } catch (e) { bledy.push(`${u.tytul}: mapa — ${String(e?.message || e)}`); }
    if (u.legenda){
      for (const w of warstwy.slice(0, 4)){
        try {
          const o = await geoPobierz(geoAgent.legendaUrl(u, w), { binarnie: true, czas: 20000 });
          const img = nativeImage.createFromBuffer(o.buf);
          if (img.isEmpty()) continue;
          const { width, height } = img.getSize();
          if (width < 24 || height < 24) continue;
          let tekst = '';
          try { const r = await ocrDwaPrzebiegi(img, { tylkoOryginal: true }); if (r.ok) tekst = (r.slowaOryginal || []).map(x => x.t).join(' ').trim(); } catch {}
          legendy.push({ usluga: u.id, tytul: `Legenda: ${u.tytul} — ${w.tytul}`, dataUrl: `data:${o.typ};base64,${o.buf.toString('base64')}`, tekst, zrodlo: u.url });
        } catch (e) { logToFile('WARN', 'Geoportal legenda', `${u.id}/${w.nazwa}: ${String(e?.message || e)}`); }
      }
    }
    if (u.info){
      let pyt = [];
      try { pyt = geoAgent.wybierzWarstwy(u, await geoWarstwy(u), 'info'); } catch {}
      if (pyt.length){
        try {
          const html = await geoPobierz(geoAgent.infoUrl({ usluga: u, warstwy: pyt, kadr, szer: SZ, wys: SZ }));
          const tekst = geoAgent.infoTekst(html);
          if (tekst) info.push({ usluga: u.id, tytul: `Opis szczegółowy: ${u.tytul}`, tekst: tekst.slice(0, 20000), pola: geoAgent.polaZInfo(tekst, u.id), zrodlo: u.url });
        } catch (e) { bledy.push(`${u.tytul}: opis szczegółowy — ${String(e?.message || e)}`); }
      }
    }
  }
  logToFile('INFO', 'Agent Geoportalu', `dzialka=${dz.id} mapy=${mapy.length} legendy=${legendy.length} info=${info.length} bledy=${bledy.length}`);
  return { ok: mapy.length > 0 || info.length > 0, dzialka: { ...dz, wkt: undefined }, kadr, obrys, rozmiar: SZ, mapy, legendy, info, bledy, kiedy };
}
ipcMain.handle('geoportal:dzialka', async (_e, zapytanie) => { requireActiveLicense(); return geoportalDzialka(zapytanie); });

/* Widoczne okno geoportalu ustawione na dzialce — agent „patrzy" jak czlowiek
   i robi zrzut ekranu jako zalacznik. Okno bez dostepu do programu (bez preload). */
ipcMain.handle('geoportal:okno', async (_e, zapytanie) => {
  requireActiveLicense();
  const id = String(zapytanie?.id || '').trim();
  const url = id ? dzialkaLogika.urlGeoportalu(id) : dzialkaLogika.GEOPORTAL;
  const czekaj = Math.min(30000, Math.max(4000, Number(zapytanie?.czekajMs) || 12000));
  const okno = new BrowserWindow({
    width: 1400, height: 900, show: true, title: 'Agent Geoportalu — podgląd działki', autoHideMenuBar: true,
    parent: mainWindow || undefined,
    webPreferences: { partition: 'persist:opero-geoportal', sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  okno.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  okno.webContents.on('will-navigate', (ev, cel) => { if (!/^https:\/\/([a-z0-9-]+\.)*geoportal\.gov\.pl\//i.test(cel)) ev.preventDefault(); });
  try {
    await Promise.race([okno.loadURL(url), new Promise((_, rej) => setTimeout(() => rej(new Error('geoportal nie załadował się w 45 s')), 45000))]);
    await new Promise(r => setTimeout(r, czekaj));
    if (okno.isDestroyed()) return { ok: false, powod: 'okno zamknięto przed zrzutem' };
    const img = await okno.webContents.capturePage();
    if (img.isEmpty()) return { ok: false, powod: 'pusty zrzut' };
    return { ok: true, url, dataUrl: 'data:image/png;base64,' + img.toPNG().toString('base64'), kiedy: new Date().toISOString() };
  } catch (e) {
    return { ok: false, url, powod: String(e?.message || e) };
  } finally {
    if (!okno.isDestroyed() && !zapytanie?.zostawOtwarte) okno.close();
  }
});

/* ============================================================
   3.3 — OKNO EKW: Ty przeglądasz księgę, program przepisuje.
   Program otwiera przeglądarkę ksiąg Ministerstwa Sprawiedliwości z numerem
   księgi w schowku (i w polach formularza, jeśli je rozpozna). Wyszukujesz
   i otwierasz działy sam — tak jak zawsze. Każdą stronę z treścią działu, którą
   wyświetlisz, program od razu przepisuje do operatu (jak Ctrl+A, Ctrl+C).
   Nie omija żadnych zabezpieczeń portalu i nie pobiera niczego bez Ciebie.
   ============================================================ */
let ekwOkno = null;
const EKW_START = 'https://przegladarka-ekw.ms.gov.pl/eukw_prz/KsiegiWieczyste/wyszukiwanieKW';
function ekwWyslij(kanal, dane) { try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(kanal, dane); } catch {} }
ipcMain.handle('ekw:okno', async (_e, zapytanie) => {
  requireActiveLicense();
  const kw = normalizeKwNumber(zapytanie?.kw || '');
  const m = /^([A-Z0-9]{4})\/(\d{8})\/(\d)$/.exec(kw);
  if (m) clipboard.writeText(kw);
  if (ekwOkno && !ekwOkno.isDestroyed()) { ekwOkno.focus(); return { ok: true, kw, juzOtwarte: true }; }
  ekwOkno = new BrowserWindow({
    width: 1280, height: 900, show: true, title: 'Księgi wieczyste — OPERO przepisuje każdy otwarty dział', autoHideMenuBar: true,
    parent: mainWindow || undefined,
    webPreferences: { partition: 'persist:opero-ekw', sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  const okno = ekwOkno;
  okno.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\/([a-z0-9-]+\.)*ms\.gov\.pl\//i.test(url)) okno.loadURL(url); return { action: 'deny' }; });
  okno.webContents.on('will-navigate', (ev, cel) => { if (!/^https:\/\/([a-z0-9-]+\.)*ms\.gov\.pl\//i.test(cel)) ev.preventDefault(); });
  const widziane = new Set();
  okno.webContents.on('did-finish-load', async () => {
    try {
      if (m) await okno.webContents.executeJavaScript(`(() => {
        const ustaw = (sel, v) => { const el = document.querySelector(sel); if (el && !el.value) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } };
        ustaw('#kodWydzialuInput, input[name="kodWydzialu"], input[id*="kodWydzial"]', ${JSON.stringify(m[1])});
        ustaw('#numerKsiegiWieczystej, input[name="numerKw"], input[id*="numerKsiegi"]', ${JSON.stringify(m[2])});
        ustaw('#cyfraKontrolna, input[name="cyfraKontrolna"], input[id*="cyfraKontrol"]', ${JSON.stringify(m[3])});
      })()`, true);
      const tekst = String(await okno.webContents.executeJavaScript('document.body ? document.body.innerText : ""', true) || '');
      if (!/DZIA[ŁL]\s+I+V?\s*-?\s*(O|SP)?\b|TREŚĆ KSIĘGI WIECZYSTEJ|OZNACZENIE NIERUCHOMO|SPIS PRAW|HIPOTEKA/i.test(tekst)) return;
      const klucz = require('crypto').createHash('sha1').update(tekst).digest('hex');
      if (widziane.has(klucz)) return; widziane.add(klucz);
      ekwWyslij('ekw:tekst', { tekst: tekst.slice(0, 400000), url: okno.webContents.getURL(), kiedy: new Date().toISOString() });
    } catch (e) { logToFile('WARN', 'Okno EKW', String(e?.message || e)); }
  });
  okno.on('closed', () => { ekwOkno = null; ekwWyslij('ekw:koniec', { stron: widziane.size }); });
  try { await okno.loadURL(EKW_START); } catch (e) { logToFile('WARN', 'Okno EKW start', String(e?.message || e)); }
  return { ok: true, kw };
});
