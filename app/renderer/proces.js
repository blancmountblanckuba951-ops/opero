/* OPERO 3.5 — okno procesu.
 *
 * Każdy dłuższy proces w programie (czytanie dokumentów, agenci, Claude, RCN,
 * Geoportal, eksport, podręcznik) pokazuje animowane okienko: co się teraz
 * dzieje, ile już zrobione, co było przed chwilą. Kilka procesów naraz
 * układa się jeden nad drugim. Okienko znika samo chwilę po końcu.
 *
 * API (window.OperoProces):
 *   start(tytul, { id, ikona, opis }) -> id
 *   krok(id, opis)                     — nowy krok (poprzedni idzie do historii z ✓)
 *   postep(id, 0..1)                   — pasek; bez wywołania pasek „płynie”
 *   koniec(id, opis, ok = true)        — sukces albo błąd, potem znika
 *   sledz(tytul, async fn(id), opcje)  — start + koniec wokół obietnicy
 * id można pominąć: wtedy dotyczy ostatnio rozpoczętego procesu.
 */
'use strict';

(function () {
  const IKONY = { dok: '▤', ai: '✦', agenci: '♛', rynek: '◈', mapa: '◎', kw: '⚖', pdf: '⎙', ksiazka: '❏', szukaj: '⌕', zapis: '⇩', domyslna: '◌' };
  const procesy = new Map();
  let ostatni = null, licznik = 0;

  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bezRuchu = () => document.body?.dataset?.ruch === 'brak' || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const czas = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`; };

  function warstwa() {
    let w = document.getElementById('procesWarstwa');
    if (w) return w;
    w = document.createElement('div');
    w.id = 'procesWarstwa'; w.setAttribute('aria-live', 'polite'); w.setAttribute('role', 'status');
    document.body.appendChild(w);
    return w;
  }

  function rysuj(p) {
    if (!p.el) {
      p.el = document.createElement('section');
      p.el.className = 'proces-okno wchodzi';
      p.el.innerHTML = `<div class="proces-glowa"><div class="proces-orbita" aria-hidden="true"><i></i><i></i><i></i><b>${esc(IKONY[p.ikona] || IKONY.domyslna)}</b></div>
        <div class="proces-tytuly"><strong></strong><span class="proces-czas"></span></div><button type="button" class="proces-zwin" title="Zwiń">–</button></div>
        <p class="proces-teraz"></p><div class="proces-pasek"><i></i></div><ol class="proces-historia"></ol>`;
      p.el.querySelector('.proces-zwin').addEventListener('click', () => p.el.classList.toggle('zwiniete'));
      warstwa().appendChild(p.el);
      requestAnimationFrame(() => p.el && p.el.classList.remove('wchodzi'));
    }
    const el = p.el;
    el.dataset.stan = p.stan;
    el.querySelector('.proces-tytuly strong').textContent = p.tytul;
    el.querySelector('.proces-czas').textContent = p.stan === 'trwa' ? czas(Date.now() - p.od) : `${p.stan === 'ok' ? 'gotowe' : 'przerwane'} · ${czas((p.do || Date.now()) - p.od)}`;
    const teraz = el.querySelector('.proces-teraz');
    if (teraz.dataset.t !== p.teraz) {
      teraz.dataset.t = p.teraz;
      teraz.classList.remove('nowy'); void teraz.offsetWidth; teraz.classList.add('nowy');
      teraz.textContent = p.stan === 'trwa' ? p.teraz.replace(/\s*(\.\.\.|…)\s*$/, '') : p.teraz;
    }
    const pasek = el.querySelector('.proces-pasek');
    pasek.classList.toggle('plynie', p.postep == null && p.stan === 'trwa');
    pasek.querySelector('i').style.width = p.stan !== 'trwa' ? '100%' : p.postep == null ? '' : `${Math.round(Math.min(1, Math.max(0, p.postep)) * 100)}%`;
    const hist = el.querySelector('.proces-historia'), html = p.historia.slice(-4).map((h) => `<li>${esc(h)}</li>`).join('');
    if (hist.dataset.h !== html) { hist.dataset.h = html; hist.innerHTML = html; }
  }

  function zegar() {
    if (zegar.t) return;
    zegar.t = setInterval(() => {
      let ktos = false;
      for (const p of procesy.values()) if (p.stan === 'trwa') { ktos = true; rysuj(p); }
      if (!ktos) { clearInterval(zegar.t); zegar.t = null; }
    }, 1000);
  }

  function start(tytul, o = {}) {
    if (typeof document === 'undefined') return null;
    const id = o.id || `p${++licznik}`;
    const juz = procesy.get(id);
    if (juz && juz.stan === 'trwa') { if (o.opis) krok(id, o.opis); return id; }
    if (juz) usun(juz, true);
    const p = { id, tytul: String(tytul || 'Pracuję'), ikona: o.ikona || 'domyslna', teraz: String(o.opis || 'zaczynam…'), historia: [], postep: null, stan: 'trwa', od: Date.now(), el: null };
    procesy.set(id, p); ostatni = id;
    rysuj(p); zegar();
    return id;
  }

  function znajdz(id) { return procesy.get(id || ostatni) || null; }

  function krok(id, opis) {
    const p = znajdz(id); if (!p || p.stan !== 'trwa') return;
    const t = String(opis || '').trim(); if (!t || t === p.teraz) return;
    if (p.teraz && p.teraz !== 'zaczynam…') p.historia.push(p.teraz);
    p.teraz = t.length > 160 ? t.slice(0, 157) + '…' : t;
    rysuj(p);
  }

  function postep(id, x) {
    if (typeof id === 'number') { x = id; id = null; }
    const p = znajdz(id); if (!p || p.stan !== 'trwa') return;
    p.postep = Number.isFinite(Number(x)) ? Number(x) : null; rysuj(p);
  }

  function usun(p, odRazu) {
    const el = p.el; procesy.delete(p.id); if (ostatni === p.id) ostatni = [...procesy.keys()].pop() || null;
    if (!el) return;
    if (odRazu || bezRuchu()) { el.remove(); return; }
    el.classList.add('wychodzi'); setTimeout(() => el.remove(), 420);
  }

  function koniec(id, opis, ok = true) {
    const p = znajdz(id); if (!p || p.stan !== 'trwa') return;
    if (p.teraz && p.teraz !== 'zaczynam…') p.historia.push(p.teraz);
    p.stan = ok ? 'ok' : 'blad'; p.do = Date.now();
    p.teraz = String(opis || (ok ? 'Gotowe.' : 'Nie udało się.'));
    rysuj(p);
    setTimeout(() => { if (procesy.get(p.id) === p) usun(p); }, ok ? 2600 : 7000);
  }

  async function sledz(tytul, fn, o = {}) {
    const id = start(tytul, o);
    try {
      const w = await fn(id);
      const zle = w && typeof w === 'object' && w.ok === false;
      koniec(id, zle ? (w.powod || 'Nie udało się.') : (o.gotowe || 'Gotowe.'), !zle);
      return w;
    } catch (e) {
      koniec(id, (e && e.message) || String(e), false);
      throw e;
    }
  }

  function aktywne() { return [...procesy.values()].filter((p) => p.stan === 'trwa').map((p) => ({ id: p.id, tytul: p.tytul, teraz: p.teraz, postep: p.postep })); }

  window.OperoProces = { start, krok, postep, koniec, sledz, aktywne, IKONY };

  /* Długie funkcje programu, które same nie pokazują postępu, dostają okno procesu z zewnątrz. */
  function owin(nazwa, tytul, ikona, kiedy) {
    const f = window[nazwa];
    if (typeof f !== 'function' || f.__proces) return;
    const w = function (...a) {
      if (kiedy && !kiedy(a)) return f.apply(this, a);
      return sledz(tytul, () => f.apply(this, a), { ikona });
    };
    w.__proces = true;
    try { window[nazwa] = w; } catch {}
  }
  window.addEventListener('DOMContentLoaded', () => setTimeout(() => {
    owin('rcnZGeoportalu', 'Pobieram transakcje z rejestru cen (RCN)', 'rynek', (a) => !(a[0] && a[0].cicho));
    owin('szybkiKwZeZrzutow', 'Czytam zrzuty księgi wieczystej', 'kw');
    owin('automatZbierz', 'Zbieram dane z rejestrów i map', 'mapa');
  }, 0));
})();
