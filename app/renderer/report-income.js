(function(){
'use strict';
/**
 * OPERO 1.9.2 — generator operatu dla podejścia dochodowego.
 *
 * Osobny plik z tego samego powodu co `calc-income.js`: `report.bundle.js` jest
 * zamrożony bajt w bajt względem 1.4.1. Ten generator pożycza z niego wyłącznie
 * `buildCSS` i `THEMES` przez publiczne API, więc dokument wygląda identycznie
 * jak operaty porównawcze — motyw, marginesy, font i styl tabel są wspólne.
 *
 * Układ sekcji wynika z blueprintu `office_income` w Biblii OPERO: dochód musi
 * być pokazany jako jawne przejście PGI → EGI → NOI, a każdy parametr (czynsz,
 * pustostan, stopa) musi mieć widoczne źródło. Dlatego tabele dowodów są
 * częścią operatu, a nie załącznikiem — bez nich wynik jest nie do sprawdzenia.
 */
function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function nl(v){ return esc(v).replace(/\n/g,'<br>'); }
function fmt(n,d){ d=(d==null?2:d); return Number(n||0).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d}); }
function zl(n,d){ return (n==null)?'<span class="missing">[DO USTALENIA]</span>':`${fmt(n,d==null?0:d)} zł`; }
function proc(n,d){ return (n==null)?'<span class="missing">[DO USTALENIA]</span>':`${fmt(n,d==null?2:d)}%`; }
function datePL(v){
  if(!v) return '';
  const d=new Date(`${v}T12:00:00`);
  if(Number.isNaN(d.getTime())) return esc(v);
  return d.toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function brak(v,t){ return (v==null||String(v).trim()==='')?`<span class="missing">[${t||'DO UZUPEŁNIENIA'}]</span>`:esc(v); }

function tabela(naglowki, wiersze, klasa){
  if(!wiersze.length) return '<p class="small">Brak pozycji.</p>';
  return `<table class="data-table ${klasa||''}"><thead><tr>${naglowki.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead>`
    +`<tbody>${wiersze.map(r=>`<tr>${r.map(c=>`<td>${c==null?'':c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function sekcjaNajmu(inc){
  const rows=(inc.leases||[]).map(l=>[
    brak(l.tenant,'NAJEMCA'), fmt(l.area,2), datePL(l.start), l.end?datePL(l.end):'<span class="missing">[BRAK DATY]</span>',
    fmt(l.baseRent,2), fmt(l.effectiveRent||l.baseRent,2), esc(l.terms||''), brak(l.source,'BRAK ŹRÓDŁA')
  ]);
  return `<h2>Rejestr umów najmu</h2>`
    +`<p>Umowy wprowadzono pojedynczo. Uśrednianie warunków przed kontrolą zniekształciłoby zarówno dochód, jak i ocenę ryzyka.</p>`
    +tabela(['Najemca','Pow. [m²]','Start','Koniec','Czynsz bazowy','Czynsz efektywny','Istotne warunki','Źródło'],rows,'market-table');
}

function sekcjaCzynszu(inc, wynik){
  const rows=(inc.rentEvidence||[]).map(x=>[
    brak(x.source,'ŹRÓDŁO'), esc(x.location||''), esc(x.cls||''), datePL(x.date), fmt(x.rent,2),
    esc(x.conditions||''), esc(x.evidenceType||''), x.accepted?'tak':'nie', esc(x.reason||'')
  ]);
  const cz=wynik.pgi.czynszRynkowy;
  return `<h2>Czynsz rynkowy — dowody</h2>`
    +`<p>Dane rynkowe oddzielono od czynszu umownego i od benchmarków publikowanych dla całego rynku. Do modelu przyjęto wyłącznie pozycje oznaczone w kolumnie „Do modelu".</p>`
    +tabela(['Źródło','Rynek / podrynek','Klasa','Data','Czynsz','Warunki','Typ dowodu','Do modelu','Uzasadnienie'],rows,'market-table')
    +`<div class="calc-box"><b>Stawka przyjęta do modelu:</b> ${cz==null?'<span class="missing">[BRAK PRZYJĘTEGO DOWODU]</span>':`${fmt(cz,2)} zł/m²/mies.`}`
    +` — średnia z ${wynik.pgi.dowodowCzynszu} ${wynik.pgi.dowodowCzynszu===1?'pozycji':'pozycji'} przyjętych do modelu.</div>`;
}

function sekcjaStopy(inc, wynik){
  const rows=(inc.rateEvidence||[]).map(x=>[
    brak(x.source,'ŹRÓDŁO'), esc(x.market||''), datePL(x.date), fmt(x.rate,2),
    esc(x.incomeDef||''), esc(x.risk||''), fmt(x.adjustment,2), x.adopted?'tak':'nie'
  ]);
  return `<h2>Stopa kapitalizacji / dyskontowa — dowody</h2>`
    +`<p>Stopa musi odpowiadać przyjętej definicji dochodu. Stawka prime yield z raportu rynkowego jest punktem odniesienia dla najlepszych aktywów, a nie parametrem konkretnego obiektu — jej użycie wymaga korekty i uzasadnienia.</p>`
    +tabela(['Źródło','Rynek','Data','Stopa [%]','Definicja dochodu','Ryzyko aktywa','Korekta [p.p.]','Przyjęta'],rows,'market-table')
    +`<div class="calc-box"><b>Stopa przyjęta:</b> ${proc(wynik.stopaKapitalizacji)}`
    +(wynik.stopaZDowodow!=null?` (średnia z dowodów po korekcie: ${proc(wynik.stopaZDowodow)}, pozycji: ${wynik.dowodowStopy})`:'')
    +`</div>`;
}

function sekcjaDochodu(inc, wynik){
  const P=wynik.pgi;
  const rows=[
    ['Czynsz z umów najmu', `${fmt(P.powWynajeta,2)} m² wynajęte`, zl(P.zUmow), 'Rejestr umów najmu', 'właściciel'],
    ['Powierzchnia niewynajęta po stawce rynkowej', `${fmt(P.powWolna,2)} m² × ${P.czynszRynkowy==null?'—':fmt(P.czynszRynkowy,2)} zł/m²/mies. × 12`, P.brakStawkiDlaWolnych?'<span class="missing">[BRAK STAWKI]</span>':zl(P.zWolnych), 'Dowody czynszu rynkowego', 'właściciel'],
    ['Inne wpływy właściciela', 'rocznie', zl(P.inne), 'Dokumenty finansowe', 'właściciel'],
    ['<b>PGI — potencjalny dochód brutto</b>', '', `<b>${zl(P.wartosc)}</b>`, 'suma powyższych', ''],
    [`Straty z pustostanów (${fmt(inc.vacancyPct,2)}%)`, 'od PGI', `− ${zl(wynik.stratyPustostan)}`, 'Założenie pustostanu', ''],
    [`Straty z nieściągalności (${fmt(inc.collectionPct,2)}%)`, 'od PGI', `− ${zl(wynik.stratyNiesciagalnosc)}`, 'Założenie strat', ''],
    ['<b>EGI — efektywny dochód brutto</b>', '', `<b>${zl(wynik.egi)}</b>`, 'PGI − straty', ''],
  ];
  for(const p of wynik.opex.pozycje) rows.push([esc(p.nazwa||'Koszt operacyjny'), 'rocznie', `− ${zl(p.kwota)}`, esc(p.zrodlo||''), 'właściciel']);
  rows.push(['<b>NOI — dochód operacyjny netto</b>','',`<b>${zl(wynik.noi)}</b>`,'EGI − koszty właściciela','']);
  return `<h2>Rachunek dochodu nieruchomości</h2>`
    +`<p>Do dochodu operacyjnego netto odjęto wyłącznie koszty obciążające właściciela. Koszty przenoszone na najemców, koszty finansowania i podatek dochodowy nie wchodzą do NOI — ich ujęcie zniekształciłoby relację dochodu do stopy kapitalizacji.</p>`
    +tabela(['Pozycja','Podstawa','Kwota roczna','Źródło / założenie','Kto ponosi'],rows);
}

function sekcjaWault(wynik){
  const w=wynik.wault;
  const rows=(w.parts||[]).map(p=>[esc(p.tenant), fmt(p.area,2), fmt(p.lata,2)]);
  return `<h2>WAULT — średni ważony pozostały okres najmu</h2>`
    +tabela(['Najemca','Powierzchnia [m²]','Pozostały okres [lata]'],rows)
    +`<div class="calc-box"><div class="formula">WAULT = ${w.value==null?'—':`${fmt(w.value,2)} lat`}</div><p class="small">${esc(w.basis)}</p></div>`;
}

function sekcjaKapitalizacja(wynik){
  return `<h2>Określenie wartości — kapitalizacja prosta</h2>`
    +`<div class="calc-box"><div class="formula">V = NOI / R = ${zl(wynik.noi)} / ${proc(wynik.stopaKapitalizacji)}</div>`
    +`<div class="highlight-value">${zl(wynik.wartoscKapitalizacja)}</div></div>`;
}

function sekcjaDCF(wynik){
  const d=wynik.dcf;
  const rows=d.wiersze.map(x=>[
    x.rok, zl(x.przychod), `− ${zl(x.pustostan)}`, zl(x.inne), `− ${zl(x.opex)}`, `− ${zl(x.capex)}`,
    `<b>${zl(x.cf)}</b>`, x.dyskonto==null?'—':fmt(x.dyskonto,4), zl(x.pv), esc(x.uwaga||'')
  ]);
  return `<h2>Określenie wartości — zdyskontowane strumienie dochodów</h2>`
    +`<p>Każdy rok prognozy pokazano osobno wraz z założeniem, które za nim stoi. Wartość rezydualna wynika z kapitalizacji dochodu po okresie prognozy.</p>`
    +tabela(['Rok','Przychód','Pustostan','Inne','OPEX','CAPEX','Przepływ','Dyskonto','PV','Źródło założenia'],rows,'market-table')
    +`<div class="calc-box">`
    +`<div class="formula">V = Σ CF<sub>t</sub>/(1+r)<sup>t</sup> + RV/(1+r)<sup>n</sup></div>`
    +`<p>Stopa dyskontowa r = ${proc(d.stopaDyskontowa)}; stopa kapitalizacji rezydualnej R<sub>k</sub> = ${proc(d.stopaRezydualna)}.</p>`
    +`<p>Suma wartości bieżących przepływów: ${zl(d.sumaPV)}. Wartość rezydualna RV = ${zl(d.noiKoncowe)} / ${proc(d.stopaRezydualna)} = ${zl(d.rv)}; jej wartość bieżąca: ${zl(d.pvRV)}.</p>`
    +`<div class="highlight-value">${zl(d.wartosc)}</div></div>`;
}

function buildHTML(project, wynik){
  const R=(typeof window!=='undefined'&&window.OperatReport)||(typeof require==='function'?require('./report.bundle'):null);
  const css=R&&R.buildCSS?R.buildCSS(project):'';
  const inc=project.income||{};
  const prop=project.property||{};
  const adres=[prop.street,prop.buildingNo].filter(Boolean).join(' ')+(prop.localNo?`/${prop.localNo}`:'');
  const braki=(typeof window!=='undefined'&&window.OperoIncome?window.OperoIncome.braki(project):[]);
  const baner=braki.length
    ? `<div class="qa-banner">OPERAT NIEKOMPLETNY — ${braki.length} ${braki.length===1?'brak krytyczny':'braków krytycznych'}<small>${braki.slice(0,6).map(esc).join(' · ')}</small></div>`
    : '';

  const tresc=[
    `<div class="report-section"><h1>1. Przedmiot i cel wyceny</h1>`
      +`<table class="data-table kv"><tbody>`
      +`<tr><td>Przedmiot wyceny</td><td>Nieruchomość dochodowa — ${brak(inc.classStandard,'STANDARD / KLASA')}</td></tr>`
      +`<tr><td>Adres</td><td>${brak(prop.city,'MIASTO')}, ${brak(adres,'ADRES')}</td></tr>`
      +`<tr><td>Powierzchnia efektywna / najmu</td><td>${inc.areaLettable>0?`${fmt(inc.areaLettable,2)} m²`:'<span class="missing">[DO UZUPEŁNIENIA]</span>'}</td></tr>`
      +`<tr><td>Cel wyceny</td><td>${brak(project.valuation&&project.valuation.purpose,'CEL WYCENY')}</td></tr>`
      +`<tr><td>Data wyceny</td><td>${brak(datePL(project.valuation&&project.valuation.valuationDate),'DATA')}</td></tr>`
      +`<tr><td>Data oględzin</td><td>${brak(datePL(project.valuation&&project.valuation.inspectionDate),'DATA')}</td></tr>`
      +`</tbody></table></div>`,
    `<div class="report-section"><h1>2. Podstawy formalne i metodyczne</h1>`
      +`<p>${nl(project.formalBasis||'[DO UZUPEŁNIENIA]')}</p>`
      +`<p>${nl(project.methodicalBasis||'[DO UZUPEŁNIENIA]')}</p>`
      +`<h2>Wybór techniki dochodowej</h2>`
      +`<p>Przyjęto technikę: <b>${wynik.technika==='dcf'?'zdyskontowanych strumieni dochodów (DCF)':'kapitalizacji prostej'}</b>.</p>`
      +`<p>${nl(inc.techniqueJustification||'[DO UZUPEŁNIENIA — uzasadnienie wyboru techniki]')}</p></div>`,
    `<div class="report-section"><h1>3. Struktura najmu</h1>${sekcjaNajmu(inc)}${sekcjaWault(wynik)}`
      +`<p class="small">${nl(inc.waultBasis||'')}</p></div>`,
    `<div class="report-section"><h1>4. Analiza rynku</h1>${sekcjaCzynszu(inc,wynik)}${sekcjaStopy(inc,wynik)}</div>`,
    `<div class="report-section"><h1>5. Dochód nieruchomości</h1>${sekcjaDochodu(inc,wynik)}</div>`,
    `<div class="report-section"><h1>6. Określenie wartości</h1>`
      +(wynik.technika==='dcf'?sekcjaDCF(wynik):sekcjaKapitalizacja(wynik))
      +`<h2>Wynik</h2><table class="data-table kv"><tbody>`
      +`<tr><td>Wartość rynkowa</td><td><b>${zl(wynik.marketValue)}</b></td></tr>`
      +`<tr><td>Wartość jednostkowa</td><td>${wynik.pricePerM2==null?'<span class="missing">[DO USTALENIA]</span>':`${fmt(wynik.pricePerM2,2)} zł/m²`}</td></tr>`
      +`</tbody></table></div>`,
    `<div class="report-section"><h1>7. Klauzule i zastrzeżenia</h1><p>${nl(project.clauses||'[DO UZUPEŁNIENIA]')}</p>`
      +`<div class="signature"><div>${esc((project.author&&project.author.name)||'[DO UZUPEŁNIENIA]')}<br>rzeczoznawca majątkowy</div></div></div>`,
  ].join('');

  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Operat szacunkowy — nieruchomość dochodowa</title><style>${css}</style></head><body>`
    +`<div class="cover ${esc((project.appearance&&project.appearance.coverStyle)||'classic')}"><div class="cover-rule"></div>`
    +`<h1>OPERAT SZACUNKOWY</h1><h2>NIERUCHOMOŚCI DOCHODOWEJ</h2>`
    +`<div class="placeholder">Miejsce na fotografię okładkową</div>`
    +`<div class="cover-address">${esc(prop.city||'')}<br>${esc(adres)}</div>`
    +`<div class="cover-meta">Autor opracowania: ${esc((project.author&&project.author.name)||'[DO UZUPEŁNIENIA]')}<br>${esc(prop.city||'')}, ${datePL(project.valuation&&project.valuation.reportDate)}</div></div>`
    +baner+tresc+`</body></html>`;
}

const API={ buildHTML };
if(typeof module!=='undefined'&&module.exports) module.exports=API;
if(typeof window!=='undefined') window.OperoIncomeReport=API;
})();
