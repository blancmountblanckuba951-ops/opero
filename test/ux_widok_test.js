'use strict';
/**
 * OPERO — UX, o ktory poprosil rzeczoznawca:
 *
 *   1. MARTWY PRZYCISK. „Klikam i nie ma zadnego odzewu" — przycisk wylaczony
 *      wygladal jak gotowy do nacisniecia.
 *   2. RUBRYKI ROWNO. Dluzsza nazwa pola spychala swoje pole nizej i rzad
 *      formularza rozjezdzal sie schodkami.
 *   3. WSPOMAGANIE PRZY LICZBACH. Suwak, krok i szybkie wartosci przy
 *      metrazu, cenach, pokojach i pietrze.
 *   4. DEWELOPERUCH OSOBNO, inne portale jako ostatecznosc.
 */
const { Przegladarka } = require('./przegladarka');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };

(async () => {
  const p = await Przegladarka.uruchom('file:///tmp/widok/index.html');
  console.log('OPERO — UX: przyciski, równe rubryki, liczby, portale\n');
  await p.pauza(1800);
  T('strona wstaje bez błędu', (await p.ocen('return (window.__bledy||[]).length;')) === 0,
    await p.ocen('return (window.__bledy||[]).slice(0,3);'));

  await p.ocen(`document.querySelector('#tutorialSkip')?.click();
    document.querySelector('#app')?.classList.remove('hidden-until-auth');
    const a=document.querySelector('#authScreen')||document.querySelector('#authGate'); if(a)a.style.display='none';
    window.confirm=()=>true; document.body.classList.add('motion-reduced');
    uiPrefs.mode='expert'; switchTab('project'); renderAll();
    await new Promise(r=>setTimeout(r,500)); return 1;`);

  /* ============== 1. WYLACZONY PRZYCISK WYGLADA NA WYLACZONY */
  const guziki = await p.ocen(`
    const b=document.createElement('button');
    b.className='btn primary'; b.textContent='Test'; b.disabled=true;
    document.body.appendChild(b);
    const s=getComputedStyle(b);
    const wynik={kursor:s.cursor, przezroczystosc:Number(s.opacity), filtr:s.filter};
    b.remove(); return wynik;`);
  T('wyłączony przycisk ma kursor „nie wolno"', guziki.kursor === 'not-allowed', guziki.kursor);
  T('jest wyraźnie przygaszony', guziki.przezroczystosc <= 0.6, guziki.przezroczystosc);
  T('i odbarwiony, żeby nie udawał złotego', /grayscale/.test(guziki.filtr), guziki.filtr);

  /* ============== 2. RUBRYKI W RZEDZIE STOJA ROWNO */
  const rowno = await p.ocen(`
    const pola=[...document.querySelectorAll('.form-grid > label')]
      .filter(l=>l.querySelector(':scope > input, :scope > select'));
    // Grupujemy po wierszu siatki: pola z tym samym gornym brzegiem ETYKIETY.
    const wiersze={};
    for(const l of pola){
      const kon=l.querySelector(':scope > input, :scope > select');
      const g=Math.round(l.getBoundingClientRect().top);
      (wiersze[g]=wiersze[g]||[]).push(Math.round(kon.getBoundingClientRect().bottom));
    }
    let najgorszy=0, zbadane=0;
    for(const g of Object.keys(wiersze)){
      const d=wiersze[g]; if(d.length<2) continue;
      zbadane++;
      najgorszy=Math.max(najgorszy, Math.max(...d)-Math.min(...d));
    }
    return {zbadane, najgorszy, pol:pola.length};`);
  T('na zakładce operatu jest kilkadziesiąt pól do sprawdzenia', rowno.pol > 30, rowno.pol);
  T('i kilka rzędów po kilka pól obok siebie', rowno.zbadane >= 6, rowno.zbadane);
  T('w każdym rzędzie pola kończą się w tej samej linii — bez schodków',
    rowno.najgorszy <= 1, `największa różnica: ${rowno.najgorszy} px`);

  /* ============== 3. WSPOMAGANIE PRZY LICZBACH */
  const liczby = await p.ocen(`
    const S='[data-path="property.usableArea"]';
    const pole=()=>document.querySelector(S);
    const panel=()=>pole().closest('label').querySelector('.liczby-panel');
    pole().click(); await new Promise(r=>setTimeout(r,250));
    const widoczny=!panel().classList.contains('hidden');
    const chipy=[...panel().querySelectorAll('.liczby-chip')].map(x=>x.textContent);
    const maSuwak=Boolean(panel().querySelector('.liczby-suwak'));
    [...panel().querySelectorAll('.liczby-chip')].find(x=>x.textContent==='55 m²').click();
    await new Promise(r=>setTimeout(r,350));
    const poChipie=project.property.usableArea;
    [...panel().querySelectorAll('.liczby-krok')][1].click();
    await new Promise(r=>setTimeout(r,350));
    const poPlusie=project.property.usableArea;
    [...panel().querySelectorAll('.liczby-krok')][0].click();
    await new Promise(r=>setTimeout(r,350));
    const poMinusie=project.property.usableArea;
    const suwak=panel().querySelector('.liczby-suwak');
    suwak.value='72'; suwak.dispatchEvent(new Event('input'));
    await new Promise(r=>setTimeout(r,350));
    return {widoczny, chipy, maSuwak, poChipie, poPlusie, poMinusie,
      poSuwaku:project.property.usableArea,
      teraz:panel().querySelector('.liczby-teraz').textContent,
      opis:(panel().querySelector('.liczby-opis')||{}).textContent||''};`);
  T('kliknięcie w pole metrażu otwiera wspomaganie', liczby.widoczny === true);
  T('są szybkie wartości w metrach', liczby.chipy.includes('55 m²'), liczby.chipy);
  T('jest suwak do zgrubnego ustawienia', liczby.maSuwak === true);
  T('szybka wartość wchodzi do operatu', liczby.poChipie === 55, liczby.poChipie);
  T('„+" dodaje jeden krok, a nie czyści pola',
    Math.abs(liczby.poPlusie - 55.1) < 0.001, liczby.poPlusie);
  T('„−" wraca', Math.abs(liczby.poMinusie - 55) < 0.001, liczby.poMinusie);
  T('suwak ustawia wartość', liczby.poSuwaku === 72, liczby.poSuwaku);
  T('program pokazuje bieżącą wartość z jednostką', /72 m²/.test(liczby.teraz), liczby.teraz);
  T('i tłumaczy, czym jest to pole', liczby.opis.length > 20, liczby.opis);

  const pietro = await p.ocen(`
    const pole=document.querySelector('[data-path="property.floor"]');
    if(!pole) return {brak:true};
    pole.click(); await new Promise(r=>setTimeout(r,250));
    const panel=pole.closest('label').querySelector('.liczby-panel');
    const chipy=[...panel.querySelectorAll('.liczby-chip')].map(x=>x.textContent);
    [...panel.querySelectorAll('.liczby-chip')].find(x=>/parter/.test(x.textContent))?.click();
    await new Promise(r=>setTimeout(r,300));
    return {chipy, teraz:panel.querySelector('.liczby-teraz').textContent};`);
  T('przy piętrze „0" nazywa się parterem', pietro.chipy && pietro.chipy.includes('parter'), pietro.chipy);
  T('i po wybraniu program tak je pokazuje', /parter/.test(pietro.teraz || ''), pietro.teraz);

  const panelePoPrzerysowaniu = await p.ocen(`
    for(let i=0;i<5;i++){ renderAll(); await new Promise(r=>setTimeout(r,80)); }
    const lab=document.querySelector('[data-path="property.usableArea"]').closest('label');
    return lab.querySelectorAll('.liczby-panel').length;`);
  T('przerysowanie nie mnoży paneli pod polem', panelePoPrzerysowaniu === 1, panelePoPrzerysowaniu);

  /* ============== 4. DEWELOPERUCH OSOBNO, INNE PORTALE NA KONCU */
  const portale = await p.ocen(`
    szukOtworz(); await new Promise(r=>setTimeout(r,800));
    const etapy=[...document.querySelectorAll('#szukEtapy .szuk-etap b')].map(x=>x.textContent);
    const det=document.querySelector('#szukPortale');
    return {etapy: etapy.map(x=>x.split('transakcje')[0].split('oferty')[0].split('przepisane')[0].trim()),
      maPanelPortali: Boolean(det),
      zwiniety: det ? !det.open : null,
      etykieta: det ? det.querySelector('summary i').textContent : '',
      naglowekDeweloperuch: (document.querySelector('.szuk-serwisy-glowa b')||{}).textContent||''};`);
  T('Deweloperuch jest osobnym, pierwszym krokiem',
    /Deweloperuch\.pl$/.test(portale.etapy[0] || ''), portale.etapy[0]);
  T('a inne portale stoją na samym końcu',
    /Inne portale/.test(portale.etapy[4] || ''), portale.etapy[4]);
  T('Deweloperuch ma własny nagłówek „Krok 1"',
    /Krok 1/.test(portale.naglowekDeweloperuch), portale.naglowekDeweloperuch);
  T('panel innych portali jest zwinięty — to nie jest równorzędne źródło',
    portale.zwiniety === true);
  T('i podpisany jako ostateczność z cenami ofertowymi',
    /ostateczność/.test(portale.etykieta) && /ofertowe/.test(portale.etykieta), portale.etykieta);


  /* ============== 5. AUDYT PRZED PODPISEM */
  const audyt = await p.ocen(`
    szukZamknij();
    switchTab('result'); await new Promise(r=>setTimeout(r,400));
    document.querySelector('#audytUruchom').click();
    await new Promise(r=>setTimeout(r,500));
    return {dzialow: document.querySelectorAll('#audytDzialy .audyt-dzial').length,
      nazwy: [...document.querySelectorAll('#audytDzialy .audyt-dzial summary b')].map(x=>x.textContent),
      stan: document.querySelector('#audytStan')?.textContent||'',
      waga: document.querySelector('#audytStan')?.dataset.waga||'',
      pozycji: document.querySelectorAll('#audytDzialy .audyt-lista li').length,
      maPrzyciskPer: Boolean(document.querySelector('#audytPer'))};`);
  T('audyt sprawdza osiem działów operatu', audyt.dzialow === 8, audyt.dzialow);
  T('w tym zgodność tekstu z tabelami',
    audyt.nazwy.includes('Kontrola tekstu'), audyt.nazwy);
  T('i tabelę transakcyjną', audyt.nazwy.includes('Tabela transakcyjna'));
  T('przy pustym operacie mówi wprost, że nie nadaje się do podpisu',
    /nie nadaje się jeszcze do podpisu/.test(audyt.stan), audyt.stan);
  T('i świeci na czerwono', audyt.waga === 'blad');
  T('każda pozycja jest wypisana osobno', audyt.pozycji > 10, audyt.pozycji);
  T('PER może przeczytać operat jak weryfikator', audyt.maPrzyciskPer === true);

  T('po całej tej drodze strona nadal działa bez błędu',
    (await p.ocen('return (window.__bledy||[]).length;')) === 0,
    await p.ocen('return (window.__bledy||[]).slice(0,3);'));

  await p.zamknij();
  console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error('BLAD TESTU', e); process.exit(1); });
