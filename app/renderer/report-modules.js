(function(){
'use strict';
/**
 * OPERO 1.9.3 — operaty dla modułów kosztowego, wywłaszczeniowego, opłat,
 * służebności i rolno-leśnego.
 *
 * Sekcje danych budują się z tej samej definicji, z której powstaje ekran
 * (`calc-modules.js`), więc dokument nie może się rozjechać z formularzem.
 * Ręcznie pisany jest wyłącznie blok wyniku — bo tylko on różni się między
 * modułami sposobem pokazania toku obliczeń.
 *
 * Styl pożyczamy z zamrożonego `report.bundle.js` przez `buildCSS`.
 */
function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function nl(v){ return esc(v).replace(/\n/g,'<br>'); }
function fmt(n,d){ d=(d==null?2:d); return Number(n||0).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d}); }
function zl(n,d){ return (n==null)?'<span class="missing">[DO USTALENIA]</span>':`${fmt(n,d==null?0:d)} zł`; }
function proc(n,d){ return (n==null)?'<span class="missing">[DO USTALENIA]</span>':`${fmt(n,d==null?2:d)}%`; }
function datePL(v){
  if(!v) return '';
  const d=new Date(`${v}T12:00:00`);
  return Number.isNaN(d.getTime())?esc(v):d.toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function brak(v,t){ return (v==null||String(v).trim()==='')?`<span class="missing">[${t||'DO UZUPEŁNIENIA'}]</span>`:esc(v); }

function wartoscPola(pole,d){
  const v=d[pole.kod];
  if(pole.typ==='data') return v?datePL(v):'<span class="missing">[DATA]</span>';
  if(pole.typ==='liczba') return Number(v)?fmt(v,2):'<span class="missing">[DO UZUPEŁNIENIA]</span>';
  if(pole.typ==='procent') return Number(v)?`${fmt(v,2)}%`:'<span class="missing">[DO UZUPEŁNIENIA]</span>';
  if(pole.typ==='wybor'){ const o=(pole.opcje||[]).find(x=>x[0]===v); return o?esc(o[1]):brak(v); }
  if(pole.typ==='obszar') return v?nl(v):'<span class="missing">[DO UZUPEŁNIENIA]</span>';
  return brak(v);
}

function sekcjeDanych(m,d){
  return m.sekcje.map(s=>`<h2>${esc(s.tytul)}</h2><table class="data-table kv"><tbody>`
    +s.pola.map(p=>`<tr><td>${esc(p.etykieta)}</td><td>${wartoscPola(p,d)}</td></tr>`).join('')
    +`</tbody></table>`).join('');
}

function tabeleDanych(m,d){
  return m.tabele.map(t=>{
    const rows=(d[t.kod]||[]);
    const naglowki=t.kolumny.map(k=>`<th>${esc(k.etykieta)}</th>`).join('');
    const tresc=rows.length
      ? rows.map(r=>`<tr>${t.kolumny.map(k=>{
          const v=r[k.kod];
          return `<td>${k.typ==='liczba'?(Number(v)?fmt(v,2):'—'):brak(v)}</td>`;
        }).join('')}</tr>`).join('')
      : `<tr><td colspan="${t.kolumny.length}"><span class="missing">[BRAK POZYCJI]</span></td></tr>`;
    return `<h2>${esc(t.tytul)}</h2><p class="small">${esc(t.opis||'')}</p>`
      +`<table class="data-table market-table"><thead><tr>${naglowki}</tr></thead><tbody>${tresc}</tbody></table>`;
  }).join('');
}

/* ---------- blok wyniku, osobny dla każdego modułu ---------- */
function wynikHTML(kod,d,w){
  if(kod==='cost'){
    return `<div class="calc-box">`
      +`<div class="formula">Koszt w stanie nowym = ${fmt(d.ilosc,2)} × ${fmt(d.cenaJednostkowa,2)} zł = ${zl(w.kosztNowy)}</div>`
      +(w.zuzycieElementy!=null?`<p>Zużycie techniczne metodą elementów scalonych: S = Σ(udział × zużycie) = ${proc(w.zuzycieElementy)}. Suma udziałów: ${proc(w.sumaUdzialow)}.</p>`:'')
      +(w.zuzycieCzasowe!=null&&d.sposobZuzycia==='wiek'?`<p>Zużycie techniczne metodą czasową: ${fmt(d.wiek,0)} / ${fmt(d.trwalosc,0)} = ${proc(w.zuzycieCzasowe)}.</p>`:'')
      +`<p>Zużycie łączne (techniczne + funkcjonalne + środowiskowe): ${proc(w.zuzycieLaczne)}.</p>`
      +`<div class="formula">V = ${zl(w.kosztNowy)} × (1 − ${proc(w.zuzycieLaczne)}) = ${zl(w.poZuzyciu)}</div>`
      +(w.wartoscGruntu>0?`<p>Wartość gruntu doliczona do wyniku: ${zl(w.wartoscGruntu)}.</p>`:'')
      +`<div class="highlight-value">${zl(w.marketValue)}</div></div>`;
  }
  if(kod==='expropriation'){
    return `<div class="calc-box">`
      +`<div class="formula">Wartość bazowa = ${fmt(d.powierzchniaPrzejeta,2)} m² × ${fmt(d.wartoscJednostkowa,2)} zł/m² = ${zl(w.wartoscBazowa)}</div>`
      +(w.powiekszenie>0?`<p>Powiększenie k = ${proc(w.powiekszenie)}${w.przekroczonyLimit?' <span class="missing">— przekracza dopuszczalne 50%</span>':''}. Po powiększeniu: ${zl(w.poPowiekszeniu)}.</p>`:'')
      +(w.skladniki?`<p>Wartość składników (nakłady, drzewostan): ${zl(w.skladniki)}.</p>`:'')
      +(w.zmniejszenieReszty?`<p>Zmniejszenie wartości części pozostałej: ${zl(w.zmniejszenieReszty)}.</p>`:'')
      +`<div class="highlight-value">${zl(w.marketValue)}</div></div>`;
  }
  if(kod==='fees'){
    return `<div class="calc-box">`
      +`<div class="formula">ΔW = ${zl(w.wartoscPo)} − ${zl(w.wartoscPrzed)} = ${zl(w.delta)}</div>`
      +(w.brakWzrostu?`<p><b>Wzrost wartości nie wystąpił.</b> Przy braku dodatniej różnicy opłata nie powstaje.</p>`:'')
      +`<div class="formula">Opłata = ${proc(w.stawka)} × max(ΔW, 0) = ${zl(w.oplata)}</div>`
      +`<div class="highlight-value">${zl(w.marketValue)}</div></div>`;
  }
  if(kod==='easement'){
    const opis={rynkowa:'stawka rynkowa × powierzchnia pasa',roznicowa:'różnica wartości bez i z obciążeniem',
      wskaznikowa:'W × (1 − S) × P × k',dcf:'suma zdyskontowanych wynagrodzeń okresowych'}[d.metoda]||'';
    let tok='';
    if(d.metoda==='rynkowa') tok=`<div class="formula">W = ${fmt(d.stawkaRynkowa,2)} zł/m² × ${fmt(d.powierzchniaPasa,2)} m² = ${zl(w.rynkowa)}</div>`;
    if(d.metoda==='roznicowa') tok=`<div class="formula">W = ${zl(d.wartoscBezObciazenia)} − ${zl(d.wartoscZObciazeniem)} = ${zl(w.roznicowa)}</div>`;
    if(d.metoda==='wskaznikowa') tok=`<div class="formula">W = ${fmt(d.wartoscJednostkowaGruntu,2)} × (1 − ${proc(d.wspolczynnikS)}) × ${fmt(d.powierzchniaPasa,2)} × ${fmt(d.wspolczynnikK,2)} = ${zl(w.wskaznikowa)}</div>`;
    if(d.metoda==='dcf'){
      tok=`<table class="data-table"><thead><tr><th>Okres</th><th>Wynagrodzenie</th><th>Dyskonto</th><th>PV</th><th>Podstawa</th></tr></thead><tbody>`
        +w.dcf.wiersze.map(x=>`<tr><td>${x.okres}</td><td>${zl(x.kwota)}</td><td>${x.dyskonto==null?'—':fmt(x.dyskonto,4)}</td><td>${zl(x.pv)}</td><td>${brak(x.podstawa,'BRAK PODSTAWY')}</td></tr>`).join('')
        +`</tbody></table><div class="formula">W = Σ D<sub>t</sub>/(1+r)<sup>t</sup> = ${zl(w.dcf.wartosc)}, r = ${proc(w.dcf.stopa)}</div>`;
    }
    return `<div class="calc-box"><p>Metoda przyjęta: <b>${esc(opis)}</b>.</p>${tok}`
      +`<div class="highlight-value">${zl(w.marketValue)}</div></div>`;
  }
  if(kod==='agri_forest'){
    const drzewa=w.drzewa.length
      ? `<table class="data-table"><thead><tr><th>Gatunek</th><th>Wiek</th><th>Bonitacja</th><th>Stopień zadrzewienia Z</th><th>Źródło tablic</th></tr></thead><tbody>`
        +w.drzewa.map(x=>`<tr><td>${esc(x.gatunek)}</td><td>${x.wiek||'—'}</td><td>${esc(x.bonitacja)}</td><td>${fmt(x.zadrzewienie,2)}</td><td>${brak(x.zrodloTablic,'BRAK ŹRÓDŁA')}</td></tr>`).join('')
        +`</tbody></table>` : '';
    return `<div class="calc-box">`
      +(w.wartoscRolna>0?`<p>Grunty rolne: ${fmt(w.powRolna,4)} ha, wartość ${zl(w.wartoscRolna)}.</p>`:'')
      +(w.wartoscGruntuLesnego!=null?`<div class="formula">V<sub>gruntu leśnego</sub> = N × ha × cena drewna × korekty = ${fmt(d.wskaznikN,4)} × ${fmt(d.powierzchniaLesnaHa,4)} × ${fmt(d.cenaDrewna,2)} × ${fmt(w.korekty,4)} = ${zl(w.wartoscGruntuLesnego)}</div>`:'')
      +drzewa
      +(w.wartoscDrzewostanu>0?`<p>Wartość drzewostanu: ${zl(w.wartoscDrzewostanu)}.</p>`:'')
      +(w.wartoscLesna!=null?`<div class="formula">V<sub>leśna</sub> = V<sub>gruntu</sub> + V<sub>drzewostanu</sub> = ${zl(w.wartoscLesna)}</div>`:'')
      +`<div class="highlight-value">${zl(w.marketValue)}</div></div>`;
  }
  return '';
}

function buildHTML(project,kod){
  const M=(typeof window!=='undefined'&&window.OperoModuly)||require('./calc-modules');
  const m=M.spec(kod); if(!m) return '';
  const w=M.oblicz(kod,project);
  const braki=M.braki(kod,project);
  const d=project.modul||{};
  const R=(typeof window!=='undefined'&&window.OperatReport)||null;
  const css=R&&R.buildCSS?R.buildCSS(project):'';
  const prop=project.property||{};
  const adres=[prop.street,prop.buildingNo].filter(Boolean).join(' ')+(prop.localNo?`/${prop.localNo}`:'');
  const baner=braki.length
    ? `<div class="qa-banner">OPERAT NIEKOMPLETNY — ${braki.length} ${braki.length===1?'brak krytyczny':'braków krytycznych'}<small>${braki.slice(0,6).map(esc).join(' · ')}</small></div>`
    : '';

  const tresc=[
    `<div class="report-section"><h1>1. Przedmiot i cel wyceny</h1>`
      +`<table class="data-table kv"><tbody>`
      +`<tr><td>Przedmiot wyceny</td><td>${esc(m.tytul)}</td></tr>`
      +`<tr><td>Adres</td><td>${brak(prop.city,'MIASTO')}, ${brak(adres,'ADRES')}</td></tr>`
      +`<tr><td>Cel wyceny</td><td>${brak(project.valuation&&project.valuation.purpose,'CEL WYCENY')}</td></tr>`
      +`<tr><td>Data wyceny</td><td>${brak(datePL(project.valuation&&project.valuation.valuationDate),'DATA')}</td></tr>`
      +`<tr><td>Data oględzin</td><td>${brak(datePL(project.valuation&&project.valuation.inspectionDate),'DATA')}</td></tr>`
      +`</tbody></table></div>`,
    `<div class="report-section"><h1>2. Podstawy formalne i metodyczne</h1>`
      +`<p>${nl(project.formalBasis||'[DO UZUPEŁNIENIA]')}</p>`
      +`<p>${nl(project.methodicalBasis||'[DO UZUPEŁNIENIA]')}</p>`
      +`<p class="small">${esc(m.wstep)}</p></div>`,
    `<div class="report-section"><h1>3. Dane przyjęte do wyceny</h1>${sekcjeDanych(m,d)}${tabeleDanych(m,d)}</div>`,
    `<div class="report-section"><h1>4. Określenie wartości</h1>${wynikHTML(kod,d,w)}`
      +`<h2>Wynik</h2><table class="data-table kv"><tbody>`
      +`<tr><td>Wartość</td><td><b>${zl(w.marketValue)}</b></td></tr>`
      +(w.pricePerM2!=null?`<tr><td>Wartość jednostkowa</td><td>${fmt(w.pricePerM2,2)} zł/jedn.</td></tr>`:'')
      +`</tbody></table></div>`,
    `<div class="report-section"><h1>5. Klauzule i zastrzeżenia</h1><p>${nl(project.clauses||'[DO UZUPEŁNIENIA]')}</p>`
      +`<div class="signature"><div>${esc((project.author&&project.author.name)||'[DO UZUPEŁNIENIA]')}<br>rzeczoznawca majątkowy</div></div></div>`,
  ].join('');

  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Operat szacunkowy — ${esc(m.tytul)}</title><style>${css}</style></head><body>`
    +`<div class="cover ${esc((project.appearance&&project.appearance.coverStyle)||'classic')}"><div class="cover-rule"></div>`
    +`<h1>OPERAT SZACUNKOWY</h1><h2>${esc(m.tytul.toUpperCase())}</h2>`
    +`<div class="placeholder">Miejsce na fotografię okładkową</div>`
    +`<div class="cover-address">${esc(prop.city||'')}<br>${esc(adres)}</div>`
    +`<div class="cover-meta">Autor opracowania: ${esc((project.author&&project.author.name)||'[DO UZUPEŁNIENIA]')}<br>${esc(prop.city||'')}, ${datePL(project.valuation&&project.valuation.reportDate)}</div></div>`
    +baner+tresc+`</body></html>`;
}

const API={ buildHTML };
if(typeof module!=='undefined'&&module.exports) module.exports=API;
if(typeof window!=='undefined') window.OperoModulyRaport=API;
})();
