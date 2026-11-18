'use strict';
/**
 * OPERO — STABILNOSC WIDOKU PRZY WIELOKROTNYM PRZERYSOWANIU
 *
 * Program przerysowuje ekran po KAZDEJ zmianie pola. Przy kilkuset polach
 * i godzinie pracy to tysiace przerysowan. Kazdy element dokladany do strony
 * „przy okazji" musi wiec byc dokladany RAZ - inaczej narasta po cichu
 * i wychodzi dopiero u rzeczoznawcy.
 *
 * Tak wlasnie wyszedl blad, ktory ten test ma zamknac na zawsze: straz
 * pilnujaca znaku pomocy pytala o BEZPOSREDNIE dziecko <label>, a znak
 * wladowal sie od pewnej wersji do srodka <span class="pole-naglowek">.
 * Straz go nie widziala i dokladala nastepny przy kazdym przerysowaniu.
 * Po kilkunastu rzeczoznawca mial przy nazwie pola rzad znakow zapytania:
 *   AUTOR OPRACOWANIA ? ? ? ? ? ?
 */
const { Przegladarka } = require('./przegladarka');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };

const ZAKLADKI = ['dashboard', 'project', 'express', 'baza', 'kw', 'clients', 'history', 'result', 'settings'];
// Elementy dokladane przez program do gotowej strony - kazdy jest kandydatem
// na mnozenie sie przy przerysowaniu.
const DOKLADANE = ['help-dot', 'pole-naglowek', 'lista-strzalka', 'aj-wybor', 'aj-stan',
  'szuk-etap', 'cechy-pozycja', 'kw-trzy'];

(async () => {
  const p = await Przegladarka.uruchom('file:///tmp/widok/index.html');
  console.log('OPERO — stabilność widoku przy wielokrotnym przerysowaniu\n');
  await p.pauza(1800);
  T('strona wstaje bez błędu', (await p.ocen('return (window.__bledy||[]).length;')) === 0,
    await p.ocen('return (window.__bledy||[]).slice(0,3);'));

  await p.ocen(`document.querySelector('#tutorialSkip')?.click();
    document.querySelector('#app')?.classList.remove('hidden-until-auth');
    const a=document.querySelector('#authScreen')||document.querySelector('#authGate'); if(a)a.style.display='none';
    window.confirm=()=>true; document.body.classList.add('motion-reduced');
    uiPrefs.mode='expert'; return 1;`);

  /* ============== 1. ZNAK POMOCY: DOKLADNIE JEDEN NA POLE */
  const znaki = await p.ocen(`
    switchTab('project'); renderAll();
    await new Promise(r=>setTimeout(r,450));
    const licz=()=>[...document.querySelectorAll('label')].map(l=>l.querySelectorAll('.help-dot').length);
    const przed=licz();
    for(let i=0;i<8;i++){ renderAll(); await new Promise(r=>setTimeout(r,70)); }
    const po=licz();
    return {labeli: po.length, maxPrzed: Math.max(0,...przed), maxPo: Math.max(0,...po),
      zWieloma: po.filter(n=>n>1).length,
      naglowkow: document.querySelectorAll('label .pole-naglowek').length,
      wNaglowku: document.querySelectorAll('label .pole-naglowek .help-dot').length};`);
  T('pól na tej zakładce jest kilkaset — jest co sprawdzać', znaki.labeli > 100, znaki.labeli);
  T('po pierwszym rysowaniu przy polu stoi jeden znak pomocy', znaki.maxPrzed === 1, znaki.maxPrzed);
  T('po ośmiu przerysowaniach NADAL jeden — znaki się nie mnożą', znaki.maxPo === 1, znaki.maxPo);
  T('ani jedno pole nie ma dwóch znaków', znaki.zWieloma === 0, znaki.zWieloma);
  T('znak siedzi w nagłówku pola, więc rubryki się nie rozjeżdżają',
    znaki.wNaglowku > 100, znaki.wNaglowku);

  /* ============== 2. ZADEN DOKLADANY ELEMENT SIE NIE MNOZY */
  for (const zakladka of ZAKLADKI) {
    const w = await p.ocen(`
      switchTab('${zakladka}'); renderAll();
      await new Promise(r=>setTimeout(r,220));
      const zdjecie=()=>{const m={};${JSON.stringify(DOKLADANE)}.forEach(k=>m[k]=document.querySelectorAll('.'+k).length);
        m.__elementow=document.querySelectorAll('*').length; return m;};
      const a1=zdjecie();
      for(let i=0;i<5;i++){ renderAll(); await new Promise(r=>setTimeout(r,70)); }
      const a2=zdjecie();
      const rosnie={};
      for(const k of Object.keys(a1)) if(a2[k]>a1[k]) rosnie[k]=a1[k]+' -> '+a2[k];
      return {rosnie, bledy:(window.__bledy||[]).length};`);
    T(`zakładka „${zakladka}": nic się nie mnoży przy przerysowaniu`,
      Object.keys(w.rosnie).length === 0, w.rosnie);
    T(`zakładka „${zakladka}": bez błędu w konsoli`, w.bledy === 0);
  }

  /* ============== 3. PRZELACZANIE TAM I Z POWROTEM TEZ NIE NARASTA */
  const tamIzPowrotem = await p.ocen(`
    const zdjecie=()=>document.querySelectorAll('*').length;
    switchTab('project'); renderAll(); await new Promise(r=>setTimeout(r,250));
    const a1=zdjecie();
    for(let i=0;i<3;i++){
      for(const t of ${JSON.stringify(ZAKLADKI)}){ switchTab(t); await new Promise(r=>setTimeout(r,45)); }
    }
    switchTab('project'); renderAll(); await new Promise(r=>setTimeout(r,250));
    return {a1, a2: zdjecie(), bledy:(window.__bledy||[]).slice(0,3)};`);
  T('po trzech obiegach wszystkich zakładek strona ma tyle samo elementów',
    tamIzPowrotem.a2 === tamIzPowrotem.a1, [tamIzPowrotem.a1, tamIzPowrotem.a2]);
  T('i nadal ani jednego błędu', tamIzPowrotem.bledy.length === 0, tamIzPowrotem.bledy);

  /* ============== 4. STRONA NIE MA POWTORZONYCH IDENTYFIKATOROW */
  const duble = await p.ocen(`
    const widziane={}, duble=[];
    document.querySelectorAll('[id]').forEach(e=>{ if(widziane[e.id]) duble.push(e.id); widziane[e.id]=1; });
    return duble.slice(0,10);`);
  T('żaden identyfikator nie powtarza się na stronie', duble.length === 0, duble);

  await p.zamknij();
  console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error('BLAD TESTU', e); process.exit(1); });
