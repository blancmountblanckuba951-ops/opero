'use strict';
/* Wspólne dla testów NA ŻYWO: wycina prawdziwy kod z main.js i uruchamia go w Node
   z prawdziwym fetch (przez serwer pośredniczący środowiska). */
const fs = require('fs'), path = require('path');
const APP = '/root/work/build/app';
const MAIN = fs.readFileSync(path.join(APP, 'main.js'), 'utf8');
function wytnij(poczatek, koniec = '\n}\n') {
  const a = MAIN.indexOf(poczatek); if (a < 0) throw new Error('brak: ' + poczatek);
  const b = MAIN.indexOf(koniec, a); return MAIN.slice(a, b + koniec.length);
}
async function fetchWithTimeout(url, opt = {}, ms = 30000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...opt, signal: c.signal }); } finally { clearTimeout(t); }
}
const dziennik = [];
const logToFile = (...a) => dziennik.push(a.map(String).join(' | ').slice(0, 400));
module.exports = { APP, MAIN, wytnij, fetchWithTimeout, logToFile, dziennik };
/** Treść handlera IPC jako funkcja: wytnij `ipcMain.handle('nazwa', async (...) => { ... });`. */
function handler(nazwa) {
  const a = MAIN.indexOf(`ipcMain.handle('${nazwa}', `); if (a < 0) throw new Error('brak handlera ' + nazwa);
  const b = MAIN.indexOf('\n});\n', a);
  return MAIN.slice(a + `ipcMain.handle('${nazwa}', `.length, b + 2);
}
module.exports.handler = handler;
