'use strict';
/**
 * OPERO — sterowanie przeglądarką w testach.
 *
 * Najmniejszy możliwy sterownik: uruchamia Chromium bez okna, łączy się z nim
 * protokołem debugowania i pozwala wykonać kod na stronie. Bez bibliotek —
 * paczka testowa ma działać także tam, gdzie nie ma internetu.
 *
 * Jedna pułapka, która kosztowała kiedyś pół dnia: w trybie bez okna zegar
 * animacji stoi, więc `scroll-behavior: smooth` nigdy się nie kończy i test
 * wisi. Dlatego przewijanie w testach zawsze robimy natychmiastowe.
 */
const { spawn } = require('node:child_process');
const http = require('node:http');
const crypto = require('node:crypto');
const net = require('node:net');

function czekaj(ms) { return new Promise(r => setTimeout(r, ms)); }

function pobierzJSON(url) {
  return new Promise((ok, zle) => {
    http.get(url, res => {
      let dane = '';
      res.on('data', c => { dane += c; });
      res.on('end', () => { try { ok(JSON.parse(dane)); } catch (e) { zle(e); } });
    }).on('error', zle);
  });
}

/** Minimalny klient WebSocket — tyle, ile potrzeba do rozmowy z Chromium. */
class Gniazdo {
  constructor(socket) { this.socket = socket; this.bufor = Buffer.alloc(0); this.naWiadomosc = () => {}; }

  static polacz(url) {
    return new Promise((ok, zle) => {
      const u = new URL(url);
      const socket = net.connect(Number(u.port), u.hostname, () => {
        const klucz = crypto.randomBytes(16).toString('base64');
        socket.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\n`
          + `Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${klucz}\r\n`
          + 'Sec-WebSocket-Version: 13\r\n\r\n');
      });
      let naglowek = '';
      const czytajNaglowek = (c) => {
        naglowek += c.toString('latin1');
        const koniec = naglowek.indexOf('\r\n\r\n');
        if (koniec < 0) return;
        socket.removeListener('data', czytajNaglowek);
        const g = new Gniazdo(socket);
        const reszta = Buffer.from(naglowek.slice(koniec + 4), 'latin1');
        socket.on('data', d => g.odbierz(d));
        if (reszta.length) g.odbierz(reszta);
        ok(g);
      };
      socket.on('data', czytajNaglowek);
      socket.on('error', zle);
    });
  }

  wyslij(tekst) {
    const dane = Buffer.from(tekst, 'utf8');
    const maska = crypto.randomBytes(4);
    let naglowek;
    if (dane.length < 126) {
      naglowek = Buffer.alloc(2); naglowek[1] = 0x80 | dane.length;
    } else if (dane.length < 65536) {
      naglowek = Buffer.alloc(4); naglowek[1] = 0x80 | 126; naglowek.writeUInt16BE(dane.length, 2);
    } else {
      naglowek = Buffer.alloc(10); naglowek[1] = 0x80 | 127; naglowek.writeBigUInt64BE(BigInt(dane.length), 2);
    }
    naglowek[0] = 0x81;
    const zamaskowane = Buffer.from(dane);
    for (let i = 0; i < zamaskowane.length; i++) zamaskowane[i] ^= maska[i % 4];
    this.socket.write(Buffer.concat([naglowek, maska, zamaskowane]));
  }

  odbierz(kawalek) {
    this.bufor = Buffer.concat([this.bufor, kawalek]);
    for (;;) {
      if (this.bufor.length < 2) return;
      const dlugoscPola = this.bufor[1] & 127;
      let przesun = 2, dlugosc = dlugoscPola;
      if (dlugoscPola === 126) { if (this.bufor.length < 4) return; dlugosc = this.bufor.readUInt16BE(2); przesun = 4; }
      else if (dlugoscPola === 127) { if (this.bufor.length < 10) return; dlugosc = Number(this.bufor.readBigUInt64BE(2)); przesun = 10; }
      if (this.bufor.length < przesun + dlugosc) return;
      const tresc = this.bufor.slice(przesun, przesun + dlugosc).toString('utf8');
      this.bufor = this.bufor.slice(przesun + dlugosc);
      try { this.naWiadomosc(JSON.parse(tresc)); } catch {}
    }
  }

  zamknij() { try { this.socket.destroy(); } catch {} }
}

class Przegladarka {
  constructor(proc, ws) { this.proc = proc; this.ws = ws; this.id = 0; this.oczekujace = new Map(); }

  static async uruchom(adres, { port = 9400 + Math.floor(Math.random() * 400) } = {}) {
    const sciezka = process.env.PLAYWRIGHT_BROWSERS_PATH
      ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`
      : 'chromium';
    const proc = spawn(sciezka, [
      '--headless=new', `--remote-debugging-port=${port}`, '--no-sandbox', '--disable-gpu',
      '--disable-dev-shm-usage', '--window-size=1600,900', '--allow-file-access-from-files',
      '--hide-scrollbars', 'about:blank',
    ], { stdio: 'ignore' });

    let cele = null;
    for (let i = 0; i < 80; i++) {
      try { cele = await pobierzJSON(`http://127.0.0.1:${port}/json/list`); if (cele.length) break; } catch {}
      await czekaj(150);
    }
    if (!cele || !cele.length) { try { proc.kill(); } catch {} throw new Error('Chromium nie wstał.'); }

    const strona = cele.find(c => c.type === 'page') || cele[0];
    const ws = await Gniazdo.polacz(strona.webSocketDebuggerUrl);
    const p = new Przegladarka(proc, ws);
    ws.naWiadomosc = (m) => {
      if (m.id && p.oczekujace.has(m.id)) {
        const { ok, zle } = p.oczekujace.get(m.id);
        p.oczekujace.delete(m.id);
        if (m.error) zle(new Error(m.error.message || 'blad protokolu'));
        else ok(m.result);
      }
    };
    await p.wyslij('Page.enable');
    await p.wyslij('Runtime.enable');
    // Bledy strony zbieramy od pierwszej chwili - test ma je zobaczyc.
    await p.wyslij('Page.addScriptToEvaluateOnNewDocument', {
      source: 'window.__bledy=[];window.addEventListener("error",e=>window.__bledy.push(String(e.message)));'
        + 'window.addEventListener("unhandledrejection",e=>window.__bledy.push("promise: "+String(e.reason)));',
    });
    await p.wyslij('Page.navigate', { url: adres });
    await czekaj(400);
    return p;
  }

  wyslij(method, params = {}) {
    const id = ++this.id;
    return new Promise((ok, zle) => {
      this.oczekujace.set(id, { ok, zle });
      this.ws.wyslij(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.oczekujace.has(id)) { this.oczekujace.delete(id); zle(new Error(`${method}: brak odpowiedzi`)); }
      }, 30000);
    });
  }

  /** Wykonanie kodu na stronie. Kod może być asynchroniczny i zwracać wartość. */
  async ocen(kod) {
    const r = await this.wyslij('Runtime.evaluate', {
      expression: `(async()=>{${kod}})()`,
      awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'blad na stronie');
    }
    return r.result?.value;
  }

  async klik(selektor) {
    return this.ocen(`const el=document.querySelector(${JSON.stringify(selektor)});
      if(!el) throw new Error('nie ma elementu ${selektor}');
      el.scrollIntoView({behavior:'instant',block:'center'}); el.click(); return 1;`);
  }

  pauza(ms) { return czekaj(ms); }

  zamknij() { try { this.ws.zamknij(); } catch {} try { this.proc.kill(); } catch {} }
}

module.exports = { Przegladarka };
