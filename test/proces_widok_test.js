'use strict';
/** OPERO 3.5 — w programie: animowane okno procesu, „Zapytaj zespół ekspertów”, Agent Prawny i Planistyczny. */
const { Przegladarka } = require('./przegladarka');
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 900) : '')); } };
(async () => {
  const p = await Przegladarka.uruchom('file:///tmp/widok/index.html');
  console.log('OPERO 3.5 — okno procesu i super-agenci (widok)\n');
  await p.pauza(1500);
  await p.ocen(`document.querySelector('#tutorialSkip')?.click(); document.querySelector('#app')?.classList.remove('hidden-until-auth');
    const a=document.querySelector('#authScreen')||document.querySelector('#authGate'); if(a)a.style.display='none';
    window.confirm=()=>true; switchTab('dashboard'); return 1;`);
  // Okno procesu
  const o = await p.ocen(`
    const P = window.OperoProces;
    const id = P.start('Test procesu', { ikona: 'ai', opis: 'pierwszy krok' });
    P.krok(id, 'drugi krok'); P.krok(id, 'trzeci krok'); P.postep(id, 0.5);
    const el = document.querySelector('#procesWarstwa .proces-okno');
    const stan1 = { jest: !!el, tytul: el?.querySelector('strong')?.textContent, teraz: el?.querySelector('.proces-teraz')?.textContent, historia: [...el.querySelectorAll('.proces-historia li')].map(x => x.textContent), pasek: el?.querySelector('.proces-pasek i')?.style.width, stan: el?.dataset.stan, aktywne: P.aktywne().length };
    P.koniec(id, 'Wszystko gotowe');
    const stan2 = { stan: el.dataset.stan, teraz: el.querySelector('.proces-teraz').textContent, czas: el.querySelector('.proces-czas').textContent };
    const id2 = P.start('Drugi', {}); P.koniec(id2, 'Zepsute', false);
    const bl = document.querySelectorAll('#procesWarstwa .proces-okno')[1]?.dataset.stan;
    let rzut = ''; try { await P.sledz('Sledz', async () => { throw new Error('x'); }); } catch (e) { rzut = e.message; }
    showStatus('Generowanie PDF…', 'info', 0); const pdf = P.aktywne().find(x => /Generowanie PDF/.test(x.tytul));
    showStatus('PDF zapisany', 'info', 5000); const poPdf = P.aktywne().some(x => /Generowanie PDF/.test(x.tytul));
    return { stan1, stan2, bl, rzut, pdf: !!pdf, poPdf };`);
  T('okno procesu: tytuł, bieżący krok, historia z ✓, pasek postępu', o.stan1.jest && o.stan1.tytul === 'Test procesu' && o.stan1.teraz === 'trzeci krok' && o.stan1.historia.join('|') === 'pierwszy krok|drugi krok' && o.stan1.pasek === '50%' && o.stan1.stan === 'trwa', o.stan1);
  T('koniec procesu: stan „ok”, opis wyniku, czas trwania', o.stan2.stan === 'ok' && o.stan2.teraz === 'Wszystko gotowe' && /gotowe/.test(o.stan2.czas), o.stan2);
  T('błąd procesu: stan „blad”; sledz przekazuje wyjątek dalej', o.bl === 'blad' && o.rzut === 'x', o);
  T('komunikat „trwa” programu (np. PDF) otwiera okno procesu, następny je zamyka', o.pdf && !o.poPdf, o);
  // Zapytaj zespół
  const z = await p.ocen(`
    window.__chmura = { wlaczony: true, zgoda: true, dostawca: 'opero' }; studioMozg = null; window.__wizjaZapytania = [];
    window.__wizjaOdp = (q) => ({ ok: true, text: '**Prawnik:** Służebność przesyłu obniża wartość.\\n- ujmij ją w stanie prawnym\\n- art. 305¹ k.c.', zrodla: [{ url: 'https://isap.sejm.gov.pl/kc', tytul: 'Kodeks cywilny' }, { url: 'https://www.saos.org.pl/x', znalezione: true }], wyszukiwan: 3 });
    project.property.city = 'Gdańsk'; project.property.street = 'Ikara';
    document.querySelector('#zespolPytanie').value = 'Czy służebność przesyłu obniża wartość?';
    await zespolZapytaj();
    const q = window.__wizjaZapytania[0] || {};
    const w = [...document.querySelectorAll('#zespolOdpowiedzi .zespol-wpis')];
    return { ile: w.length, pyt: w[0]?.textContent, odp: w[1]?.innerHTML, linki: [...document.querySelectorAll('.zespol-zrodla a')].map(a => a.dataset.url), internet: q.internet, tryb: q.tryb, kontekst: /Ikara/.test(q.polecenie || ''), pole: document.querySelector('#zespolPytanie').value };`);
  T('zespół: pytanie i odpowiedź w oknie, Markdown → HTML', z.ile === 2 && /służebność/i.test(z.pyt) && /<b>Prawnik:<\/b>/.test(z.odp) && /<li>/.test(z.odp), z);
  T('zespół: Claude z wyszukiwarką, najlepszy model, kontekst operatu', z.internet === true && z.tryb === 'najlepszy' && z.kontekst, z);
  T('zespół: źródła jako linki (cytowane najpierw)', z.linki[0] === 'https://isap.sejm.gov.pl/kc' && z.linki.length === 2 && z.pole === '', z.linki);
  // Agent Prawny i Planistyczny
  const a = await p.ocen(`
    window.__wizjaZapytania = [];
    window.__wizjaOdp = (q) => /prawnik nieruchomości oceń/.test(q.polecenie)
      ? { ok: true, text: JSON.stringify({ stanPrawny: 'Odrębna własność lokalu; w dziale III służebność przesyłu.', rodzajPrawa: 'odrębna własność lokalu', ryzyka: [{ opis: 'Służebność przesyłu', waga: 'srednia', wplywNaWartosc: 'ogranicza zabudowę' }], podstawy: [{ akt: 'Kodeks cywilny', publikator: 'Dz.U. 2025 poz. 1071', przepis: 'art. 305¹' }], doWyjasnienia: [] }), zrodla: [{ url: 'https://isap.sejm.gov.pl/kc' }], wyszukiwan: 2 }
      : /planista ustal przeznaczenie/.test(q.polecenie)
      ? { ok: true, text: JSON.stringify({ jestPlan: true, planName: 'MPZP Brzeźno', resolution: 'Uchwała nr XL/1/21', designation: 'zabudowa jednorodzinna', zoneSymbol: '012-MN1', pewnosc: 'srednia', sourceUrl: 'https://bip.gdansk.pl/plan', doSprawdzenia: 'symbol terenu' }), zrodla: [], wyszukiwan: 4 }
      : { ok: false, powod: 'inne' };
    studioMozg = await window.operatAPI.chmuraStan();
    studioStan().kwTekstPelny = 'TREŚĆ KSIĘGI WIECZYSTEJ NR GD1G/00012345/6\\nDZIAŁ III\\nSłużebność przesyłu\\nDZIAŁ II\\nImię pierwsze: Anna\\nNazwisko: Nowak';
    project.legal.kwNotes = ''; project.legal.ownershipType = ''; project.planning = {};
    const kroki = []; const k = { krok: t => kroki.push(t) };
    const wp = await AGENCI_PRACA.prawnik(k);
    const wl = await AGENCI_PRACA.planista(k);
    const zap = window.__wizjaZapytania;
    return { wp, wl, kroki, notatka: project.legal.kwNotes, prawo: project.legal.ownershipType, plan: project.planning, nazwiska: zap.some(q => /Nowak/.test(q.polecenie)), internet: zap.every(q => q.internet), agentow: window.OperoAgenci.ZESPOL.length, lista: document.querySelector('#agenciCzas')?.textContent };`);
  T('Agent Prawny: stan prawny i rodzaj prawa w operacie, ryzyko jako uwaga, podstawa z Dz.U.', /służebność przesyłu/.test(a.notatka) && a.prawo === 'odrębna własność lokalu' && a.wp.braki.some(x => /Ryzyko średnie/.test(x)) && a.wp.zrobione.some(x => /Dz\.U\. 2025/.test(x)), a.wp);
  T('Agent Planistyczny: plan i przeznaczenie wpisane, symbol bez pewności nie, uwaga do potwierdzenia', a.plan.planName === 'MPZP Brzeźno' && a.plan.designation === 'zabudowa jednorodzinna' && !a.plan.zoneSymbol && a.wl.braki.some(x => /średnia/.test(x)), [a.plan, a.wl]);
  T('super-agenci: zawsze z wyszukiwarką, nazwiska z księgi nie wychodzą do Claude', a.internet && !a.nazwiska, a);
  T('zespół ma 18 agentów (z Prawnym i Planistycznym)', a.agentow === 18 && /18 agentów/.test(a.lista), a);
  await p.zamknij();
  console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
