'use strict';
/**
 * OPERO — PRZEGLAD CALEGO INTERFEJSU
 *
 * Kazdy modul wyceny, kazdy krok kreatora, dwa tryby pracy. Na kazdym ekranie
 * sprawdzamy to, co rzeczoznawca zobaczyl na zrzutach i nazwal po imieniu:
 *   - pola w rzedzie stoja w jednej linii (bez schodkow),
 *   - przy polu jest jeden znak pomocy i jedna strzalka listy,
 *   - panel liczbowy nie wisi przy polu slownym,
 *   - podpowiedz PER-a nie zaslania pol formularza,
 *   - zaden przycisk nie ma ucietego napisu,
 *   - strona nie zglasza bledu.
 */
const { chromium } = require('playwright');
const MODULY = ['local_kcm', 'developed_pairs', 'income', 'cost', 'expropriation', 'fees', 'easement', 'agri_forest'];

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 400) : '')); } };

(async () => {
  const b = await chromium.launch();
  console.log('OPERO — przegląd całego interfejsu\n');
  const wszystkie = [];
  const bledyStrony = [];
  for (const szer of [1440, 1180]) {
    const p = await b.newPage({ viewport: { width: szer, height: 900 } });
    p.on('pageerror', e => bledyStrony.push(e.message));
    await p.goto('file:///tmp/widok/index.html'); await p.waitForTimeout(1500);
    await p.evaluate(() => {
      document.querySelector('#tutorialSkip')?.click();
      document.querySelector('#app')?.classList.remove('hidden-until-auth');
      const a = document.querySelector('#authScreen') || document.querySelector('#authGate'); if (a) a.style.display = 'none';
      window.confirm = () => true; document.body.classList.add('motion-reduced');
    });
    for (const mod of MODULY) for (const tryb of ['guide', 'expert']) {
      const r = await p.evaluate(async ({ mod, tryb }) => {
        const czekaj = (ms) => new Promise(r => setTimeout(r, ms));
        project.module = { ...(project.module || {}), code: mod };
        project = normalizeLoadedProject(project);
        uiPrefs.mode = tryb; document.body.classList.toggle('expert-mode', tryb === 'expert');
        renderAll(); await czekaj(150);
        const out = [];
        for (const tab of WIZARD_STEPS.map(s => s.tab)) {
          switchTab(tab); renderAll(); await czekaj(140); renderAll(); await czekaj(320);
          const sekcja = document.querySelector('#tab-' + tab) || document;
          const widoczny = (el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
          let schodki = 0;
          sekcja.querySelectorAll('.form-grid').forEach(g => {
            const wiersze = [];
            [...g.children].filter(l => l.tagName === 'LABEL' && widoczny(l) && !l.classList.contains('check')).forEach(l => {
              const k = l.querySelector(':scope > input:not([type=checkbox]), :scope > select, :scope > .lista-obudowa, :scope > textarea');
              if (!k || !k.getClientRects().length) return;
              wiersze.push({ top: l.getBoundingClientRect().top, t: k.getBoundingClientRect().top });
            });
            wiersze.sort((a, b) => a.top - b.top);
            let grupa = [], ostatni = -1e9;
            const zamknij = () => { if (grupa.length > 1) schodki = Math.max(schodki, Math.max(...grupa) - Math.min(...grupa)); grupa = []; };
            for (const w of wiersze) { if (w.top - ostatni > 6) zamknij(); ostatni = w.top; grupa.push(w.t); }
            zamknij();
          });
          const wieleZnakow = [...sekcja.querySelectorAll('label')].filter(l => l.querySelectorAll('.help-dot').length > 1).length;
          const dwieStrzalki = sekcja.querySelectorAll('.lista-obudowa > input[list]').length;
          const liczbyPrzyLiscie = [...sekcja.querySelectorAll('label')].filter(l => l.querySelector('.lista-obudowa') && l.querySelector('.liczby-panel')).length;
          const coach = document.querySelector('#contextCoach');
          let coachNaPolach = 0;
          if (coach && widoczny(coach) && !coach.classList.contains('hidden') && getComputedStyle(coach).position === 'fixed') {
            const c = coach.getBoundingClientRect();
            sekcja.querySelectorAll('.form-grid > label').forEach(l => { if (!widoczny(l)) return;
              const q = l.getBoundingClientRect();
              if (!(c.right < q.left || c.left > q.right || c.bottom < q.top || c.top > q.bottom)) coachNaPolach++; });
          }
          const uciete = [...sekcja.querySelectorAll('button.btn')].filter(x => { if (!widoczny(x)) return false;
            const rg = document.createRange(); rg.selectNodeContents(x);
            const t = rg.getBoundingClientRect(), q = x.getBoundingClientRect();
            return t.width > q.width + 1 || t.left < q.left - 1 || t.right > q.right + 1; }).map(x => x.textContent.trim().slice(0, 24));
          out.push({ tab, schodki: Math.round(schodki), wieleZnakow, dwieStrzalki, liczbyPrzyLiscie, coachNaPolach, uciete });
        }
        return out;
      }, { mod, tryb });
      for (const x of r) wszystkie.push({ szer, mod, tryb, ...x });
    }
    await p.close();
  }
  await b.close();

  const opis = (x) => `${x.mod}/${x.tab}/${x.tryb}/${x.szer}`;
  T('przejrzano wszystkie moduły, kroki, tryby i dwie szerokości okna', wszystkie.length >= 200, wszystkie.length);
  const zSchodkami = wszystkie.filter(x => x.schodki > 1);
  T('na żadnym ekranie pola w rzędzie nie stoją schodkami', zSchodkami.length === 0, zSchodkami.slice(0, 4).map(x => opis(x) + ':' + x.schodki + 'px'));
  const zeZnakami = wszystkie.filter(x => x.wieleZnakow);
  T('przy żadnym polu nie ma więcej niż jednego znaku pomocy', zeZnakami.length === 0, zeZnakami.slice(0, 4).map(opis));
  const zeStrzalkami = wszystkie.filter(x => x.dwieStrzalki);
  T('żadna lista nie ma dwóch strzałek', zeStrzalkami.length === 0, zeStrzalkami.slice(0, 4).map(opis));
  const zLiczbami = wszystkie.filter(x => x.liczbyPrzyLiscie);
  T('panel liczbowy nie wisi przy żadnym polu słownym', zLiczbami.length === 0, zLiczbami.slice(0, 4).map(opis));
  const zCoachem = wszystkie.filter(x => x.coachNaPolach);
  T('podpowiedź PER-a nigdzie nie zasłania pól formularza', zCoachem.length === 0, zCoachem.slice(0, 4).map(opis));
  const zUcietymi = wszystkie.filter(x => x.uciete.length);
  T('żaden przycisk nie ma uciętego napisu', zUcietymi.length === 0, zUcietymi.slice(0, 4).map(x => opis(x) + ':' + x.uciete.join(',')));
  T('strona nie zgłosiła żadnego błędu', bledyStrony.length === 0, [...new Set(bledyStrony)].slice(0, 3));

  console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error('BLAD TESTU', e); process.exit(1); });
