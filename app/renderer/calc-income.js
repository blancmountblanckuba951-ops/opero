(function(){
'use strict';
/**
 * OPERO 1.9.2 — podejście dochodowe.
 *
 * Osobny plik, bo `calc.bundle.js` musi zostać bajt w bajt taki jak w 1.4.1 —
 * matematyka podejścia porównawczego jest zamrożona i nie wolno jej ruszać przy
 * dokładaniu nowego modułu.
 *
 * Ścieżka obliczeń jest dokładnie ta, którą opisuje Biblia OPERO:
 *   PGI = Σ(czynsz × powierzchnia × 12) + inne wpływy
 *   EGI = PGI − pustostany − nieściągalność
 *   NOI = EGI − koszty operacyjne właściciela
 *   V   = NOI / R                                    (kapitalizacja prosta)
 *   V   = Σ CF_t/(1+r)^t + RV/(1+r)^n, RV = NOI/R_k  (DCF)
 *
 * Zasada, której pilnuje cały plik: nic się nie domyśla. Brakujący parametr daje
 * null i pozycję na liście braków, a nie „rozsądną" wartość domyślną. Operat
 * z wymyśloną stopą kapitalizacji jest groźniejszy niż operat niedokończony.
 */
const R2=(v)=>Math.round(Number(v||0)*100)/100;
const num=(v)=>{const n=Number(v);return Number.isFinite(n)?n:0;};
const pct=(v)=>num(v)/100;

/** Miesiące między dwiema datami, zaokrąglone w dół do pełnych miesięcy. */
function miesiaceDo(data, od){
  const a=Date.parse(od||new Date().toISOString().slice(0,10)), b=Date.parse(data);
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a) return 0;
  return Math.floor((b-a)/(30.4375*86400000));
}

/**
 * WAULT — średni ważony powierzchnią pozostały okres najmu, w latach.
 * Biblia wymaga pokazania sposobu ważenia, więc zwracamy też składniki.
 */
function wault(leases, naDzien){
  const rows=(leases||[]).filter(l=>num(l.area)>0&&l.end);
  if(!rows.length) return {value:null, basis:'Brak umów z datą zakończenia — WAULT nieokreślony.', parts:[]};
  let sumaPow=0, sumaIloczyn=0; const parts=[];
  for(const l of rows){
    const lata=miesiaceDo(l.end, naDzien)/12, pow=num(l.area);
    sumaPow+=pow; sumaIloczyn+=pow*lata;
    parts.push({tenant:l.tenant||'—', area:R2(pow), lata:R2(lata)});
  }
  if(sumaPow<=0) return {value:null, basis:'Suma powierzchni umów wynosi zero.', parts};
  return {value:R2(sumaIloczyn/sumaPow), parts,
    basis:`Ważone powierzchnią najmu: Σ(powierzchnia × pozostały okres) / Σ(powierzchnia) = ${R2(sumaIloczyn)} / ${R2(sumaPow)}.`};
}

/** Czynsz rynkowy przyjęty do modelu — średnia ze stawek oznaczonych jako przyjęte. */
function czynszRynkowy(evidence){
  const przyjete=(evidence||[]).filter(x=>x.accepted&&num(x.rent)>0);
  if(!przyjete.length) return {value:null, count:0, oferty:0};
  const suma=przyjete.reduce((s,x)=>s+num(x.rent),0);
  return {value:R2(suma/przyjete.length), count:przyjete.length,
    oferty:przyjete.filter(x=>String(x.evidenceType||'').toLowerCase().includes('ofert')).length};
}

/** Stopa przyjęta do modelu — z dowodów oznaczonych jako przyjęte, po korekcie. */
function stopaZDowodow(evidence){
  const przyjete=(evidence||[]).filter(x=>x.adopted&&num(x.rate)>0);
  if(!przyjete.length) return {value:null, count:0};
  const suma=przyjete.reduce((s,x)=>s+num(x.rate)+num(x.adjustment),0);
  return {value:R2(suma/przyjete.length), count:przyjete.length};
}

/** PGI — potencjalny dochód brutto. Powierzchnia niewynajęta liczona po stawce rynkowej. */
function pgi(inc){
  const leases=(inc.leases||[]).filter(l=>num(l.area)>0);
  const zUmow=leases.reduce((s,l)=>s+num(l.effectiveRent||l.baseRent)*num(l.area)*12,0);
  const powWynajeta=leases.reduce((s,l)=>s+num(l.area),0);
  const powCalkowita=num(inc.areaLettable);
  const rynkowy=czynszRynkowy(inc.rentEvidence);
  const powWolna=Math.max(0, powCalkowita-powWynajeta);
  const zWolnych=(powWolna>0&&rynkowy.value!=null)?rynkowy.value*powWolna*12:0;
  const inne=num(inc.otherIncome);
  return {
    wartosc:R2(zUmow+zWolnych+inne),
    zUmow:R2(zUmow), zWolnych:R2(zWolnych), inne:R2(inne),
    powWynajeta:R2(powWynajeta), powWolna:R2(powWolna), powCalkowita:R2(powCalkowita),
    czynszRynkowy:rynkowy.value, dowodowCzynszu:rynkowy.count,
    brakStawkiDlaWolnych: powWolna>0 && rynkowy.value==null,
  };
}

function oblicz(project){
  const inc=(project&&project.income)||{};
  const P=pgi(inc);
  const stratyPustostan=R2(P.wartosc*pct(inc.vacancyPct));
  const stratyNiesciagalnosc=R2(P.wartosc*pct(inc.collectionPct));
  const EGI=R2(P.wartosc-stratyPustostan-stratyNiesciagalnosc);

  const opexWlasciciela=(inc.opex||[]).filter(x=>String(x.bearer||'właściciel').toLowerCase().startsWith('wła'));
  const opexSuma=R2(opexWlasciciela.reduce((s,x)=>s+num(x.amount),0));
  const NOI=R2(EGI-opexSuma);

  const dowodStopy=stopaZDowodow(inc.rateEvidence);
  const R=num(inc.capRate)>0?num(inc.capRate):(dowodStopy.value||0);
  const wartoscKapitalizacja=R>0?R2(NOI/pct(R)):null;

  const r=num(inc.discountRate), Rk=num(inc.terminalRate);
  const lata=(inc.dcf||[]).filter(x=>num(x.year)>0).sort((a,b)=>num(a.year)-num(b.year));
  let sumaPV=0; const wiersze=[];
  for(let i=0;i<lata.length;i++){
    const y=lata[i];
    const przychod=num(y.rentIncome), pustostan=num(y.vacancy), inne=num(y.otherIncome);
    const opex=num(y.opex), capex=num(y.capex);
    const cf=R2(przychod-pustostan+inne-opex-capex);
    const t=i+1;
    const dyskonto=r>0?Math.round(1/Math.pow(1+pct(r),t)*10000)/10000:null;
    const pv=dyskonto!=null?R2(cf*dyskonto):null;
    if(pv!=null) sumaPV+=pv;
    wiersze.push({rok:num(y.year), przychod:R2(przychod), pustostan:R2(pustostan), inne:R2(inne),
      opex:R2(opex), capex:R2(capex), cf, dyskonto, pv, uwaga:String(y.note||'')});
  }
  const noiKoncowe=wiersze.length?wiersze[wiersze.length-1].cf:null;
  const RV=(Rk>0&&noiKoncowe!=null)?R2(noiKoncowe/pct(Rk)):null;
  const pvRV=(RV!=null&&r>0&&wiersze.length)?R2(RV/Math.pow(1+pct(r),wiersze.length)):null;
  const wartoscDCF=(pvRV!=null)?R2(sumaPV+pvRV):null;

  const technika=inc.technique==='dcf'?'dcf':'cap';
  const wartosc=technika==='dcf'?wartoscDCF:wartoscKapitalizacja;
  const pow=num(inc.areaLettable);

  return {
    technika,
    pgi:P, stratyPustostan, stratyNiesciagalnosc, egi:EGI,
    opex:{suma:opexSuma, pozycje:opexWlasciciela.map(x=>({nazwa:x.name||'', kwota:R2(num(x.amount)), zrodlo:x.source||''}))},
    noi:NOI,
    stopaKapitalizacji:R||null, stopaZDowodow:dowodStopy.value, dowodowStopy:dowodStopy.count,
    wartoscKapitalizacja,
    dcf:{stopaDyskontowa:r||null, stopaRezydualna:Rk||null, wiersze, sumaPV:R2(sumaPV),
         noiKoncowe, rv:RV, pvRV, wartosc:wartoscDCF},
    wault:wault(inc.leases, project&&project.valuation&&project.valuation.valuationDate),
    marketValue:wartosc,
    pricePerM2:(wartosc!=null&&pow>0)?R2(wartosc/pow):null,
    powierzchnia:pow,
  };
}

/**
 * Braki krytyczne modułu dochodowego.
 * Lista odpowiada `required_level` z wymagań danych w Biblii OPERO: pozycje
 * „required" blokują PDF, „conditional" tylko wtedy, gdy dotyczą wybranej techniki.
 */
function braki(project){
  const inc=(project&&project.income)||{};
  const out=[];
  const dodaj=(w,t)=>{ if(w) out.push(t); };
  dodaj(!(num(inc.areaLettable)>0),'Dochodowa: powierzchnia efektywna / najmu większa od 0');
  dodaj(!String(inc.classStandard||'').trim(),'Dochodowa: standard / klasa obiektu z uzasadnieniem');
  dodaj(!(inc.leases||[]).length,'Dochodowa: rejestr umów najmu (co najmniej jedna pozycja)');
  dodaj((inc.leases||[]).some(l=>!l.end),'Dochodowa: każda umowa najmu musi mieć datę zakończenia');
  dodaj((inc.leases||[]).some(l=>!String(l.source||'').trim()),'Dochodowa: każda umowa najmu musi mieć wskazane źródło');
  dodaj(!(inc.rentEvidence||[]).some(x=>x.accepted),'Dochodowa: co najmniej jeden przyjęty dowód czynszu rynkowego');
  dodaj(!(num(inc.vacancyPct)>0||inc.vacancyAccepted),'Dochodowa: założenie pustostanu / nieściągalności');
  dodaj(!(inc.opex||[]).length,'Dochodowa: koszty operacyjne właściciela');
  dodaj(!String(inc.waultBasis||'').trim(),'Dochodowa: sposób policzenia WAULT');
  dodaj(!String(inc.techniqueJustification||'').trim(),'Dochodowa: uzasadnienie wyboru techniki dochodowej');
  if(inc.technique==='dcf'){
    dodaj(!(inc.dcf||[]).length,'Dochodowa (DCF): prognoza rok po roku');
    dodaj(!(num(inc.discountRate)>0),'Dochodowa (DCF): stopa dyskontowa');
    dodaj(!(num(inc.terminalRate)>0),'Dochodowa (DCF): stopa kapitalizacji rezydualnej');
    dodaj((inc.dcf||[]).some(x=>!String(x.note||'').trim()),'Dochodowa (DCF): każdy rok prognozy musi mieć źródło założenia');
  }else{
    dodaj(!(num(inc.capRate)>0||(inc.rateEvidence||[]).some(x=>x.adopted)),'Dochodowa: stopa kapitalizacji z dowodem rynkowym');
  }
  const P=pgi(inc);
  dodaj(P.brakStawkiDlaWolnych,'Dochodowa: powierzchnia niewynajęta bez przyjętej stawki rynkowej');
  return out;
}

const API={ oblicz, braki, wault, pgi, czynszRynkowy, stopaZDowodow };
if(typeof module!=='undefined'&&module.exports) module.exports=API;
if(typeof window!=='undefined') window.OperoIncome=API;
})();
