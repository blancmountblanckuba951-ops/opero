'use strict';

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));
const fmt = (n,d=2) => Number(n||0).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d});
const money = (n,d=0) => `${fmt(n,d)} zł`;
const todayISO = () => new Date().toISOString().slice(0,10);
const newId = () => globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const escapeHTML = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const APP_VERSION='1.23.0';
function getCalc(){ if(!window.OperatCalc?.calculate) throw new Error('Moduł obliczeń nie został załadowany. Uruchom ponownie OPERO.'); return window.OperatCalc; }
function getReport(){ if(!window.OperatReport?.buildHTML) throw new Error(`Moduł generatora PDF nie został załadowany. Zainstaluj ponownie OPERO ${APP_VERSION}.`); return window.OperatReport; }

const LEGAL_BASES_2026 = [
  'Ustawa z dnia 21 sierpnia 1997 r. o gospodarce nieruchomościami – tekst jednolity: Dz.U. z 2026 r. poz. 399, z późn. zm.',
  'Rozporządzenie Ministra Rozwoju i Technologii z dnia 5 września 2023 r. w sprawie wyceny nieruchomości – Dz.U. z 2023 r. poz. 1832.',
  'Ustawa z dnia 24 czerwca 1994 r. o własności lokali – tekst jednolity: Dz.U. z 2026 r. poz. 232, z późn. zm.',
  'Ustawa z dnia 6 lipca 1982 r. o księgach wieczystych i hipotece – tekst jednolity: Dz.U. z 2026 r. poz. 1066, z późn. zm.',
  'Ustawa z dnia 27 marca 2003 r. o planowaniu i zagospodarowaniu przestrzennym – tekst jednolity: Dz.U. z 2026 r. poz. 538, z późn. zm. – jeżeli informacje planistyczne są wykorzystywane w opracowaniu.'
];

const OPERAT_MODULES = {
  local_kcm:{code:'local_kcm',short:'Lokal mieszkalny',title:'Nieruchomość lokalowa / spółdzielcze własnościowe prawo',method:'Korygowanie ceny średniej',description:'Lokale mieszkalne i odpowiednie prawa do lokali w podejściu porównawczym.',icon:'🏢',status:'live'},
  developed_pairs:{code:'developed_pairs',short:'Nieruchomość zabudowana',title:'Nieruchomość gruntowa zabudowana',method:'Porównywanie parami',description:'Grunt wraz z zabudową, bezpośrednie porównania z co najmniej trzema nieruchomościami podobnymi.',icon:'🏠',status:'live'},
  income:{code:'income',short:'Dochodowa',title:'Nieruchomość dochodowa',method:'Podejście dochodowe',description:'Kapitalizacja prosta oraz zdyskontowane strumienie dochodów (DCF), z rejestrem najmu i dowodami stopy.',icon:'💰',status:'live'},
  cost:{code:'cost',short:'Kosztowa',title:'Budynek lub budowla',method:'Podejście kosztowe',description:'Koszt odtworzenia lub zastąpienia z uwzględnieniem zużycia.',icon:'🏗️',status:'live'},
  expropriation:{code:'expropriation',short:'Odszkodowanie',title:'Wywłaszczenie / przejęcie z mocy prawa',method:'Ustalenie odszkodowania',description:'Wycena z kontrolą właściwych dat, stanu, przeznaczenia i celu publicznego.',icon:'🛣️',status:'live'},
  agri_forest:{code:'agri_forest',short:'Rolna / leśna',title:'Nieruchomość rolna lub leśna',method:'Moduł rolny i leśny',description:'Grunty rolne, klasy bonitacyjne, użytki oraz grunty leśne i drzewostany.',icon:'🌲',status:'live'},
  fees:{code:'fees',short:'Opłaty',title:'Opłata adiacencka / planistyczna',method:'Wartość przed i po',description:'Równoległe określenie wartości dla stanów wymaganych przy naliczaniu opłat.',icon:'📐',status:'live'},
  easement:{code:'easement',short:'Służebność',title:'Nieruchomość obciążona służebnością',method:'Wynagrodzenie za ustanowienie',description:'Docelowo służebności gruntowe i przesyłu, powierzchnie pasów i współczynniki korzystania.',icon:'⚡',status:'live'}
};
function moduleCode(){return project?.module?.code||'local_kcm';}
function moduleInfo(){return OPERAT_MODULES[moduleCode()]||OPERAT_MODULES.local_kcm;}
function isPairModule(){return moduleCode()==='developed_pairs';}


function defaultFeatures(module='local_kcm'){
  const mk=(name,scaleMin,scaleAvg,scaleMax)=>({id:newId(),name,scaleMode:'three',weight:0,rating:'Przeciętna',scaleMin,scaleLow:'',scaleAvg,scaleHigh:'',scaleMax,ratingNote:'',pairs:[]});
  if(module==='developed_pairs') return [
    mk('Lokalizacja szczegółowa','lokalizacja mniej korzystna na tle rynku','lokalizacja typowa dla rynku','lokalizacja bardzo korzystna na tle rynku'),
    mk('Działka — dostęp, kształt i uzbrojenie','cechy działki niekorzystne','cechy działki typowe','cechy działki bardzo korzystne'),
    mk('Powierzchnia i funkcjonalność budynku','powierzchnia / układ mniej korzystne','parametry typowe','powierzchnia / układ bardzo korzystne'),
    mk('Stan techniczny i standard','stan słaby / istotne nakłady','stan typowy / użytkowy','stan bardzo dobry / wysoki standard'),
    mk('Wiek, technologia i energooszczędność','rozwiązania mniej korzystne','rozwiązania typowe','rozwiązania nowoczesne / korzystne')
  ];
  return [
    mk('Lokalizacja szczegółowa','lokalizacja mniej korzystna na tle badanego rynku','lokalizacja typowa dla badanego rynku','lokalizacja bardzo korzystna na tle badanego rynku'),
    mk('Standard lokalu','standard słaby / wymagane istotne nakłady','standard przeciętny / użytkowy','standard dobry lub bardzo dobry / brak istotnych nakładów'),
    mk('Stan techniczny budynku','stan słabszy / wymagane nakłady','stan typowy / dobry','bardzo dobry stan / po modernizacji'),
    mk('Kondygnacja i dostęp do windy','położenie niekorzystne / brak windy, gdy ma znaczenie rynkowe','położenie typowe','położenie korzystne / dogodny dostęp'),
    mk('Powierzchnia, układ i elementy dodatkowe','układ mniej funkcjonalny / brak elementów dodatkowych','układ typowy','układ funkcjonalny / korzystne elementy dodatkowe')
  ];
}
function freshProject(moduleCode='local_kcm'){
  const d=todayISO();
  return {
    schemaVersion:11, module:{code:moduleCode},
    // Modul dochodowy. Zadne pole nie ma „rozsadnej” wartosci domyslnej —
    // wymyslona stopa albo pustostan sa grozniejsze niz operat niedokonczony.
    income:{technique:'cap',areaLettable:0,classStandard:'',leases:[],rentEvidence:[],rateEvidence:[],
            opex:[],dcf:[],otherIncome:0,vacancyPct:0,collectionPct:0,capRate:0,discountRate:0,terminalRate:0,
            waultBasis:'',techniqueJustification:''},
    // Dane pozostalych modulow (kosztowy, wywlaszczenie, oplaty, sluzebnosc, rolna/lesna).
    modul:(typeof window!=='undefined'&&window.OperoModuly)?window.OperoModuly.pustaStruktura(moduleCode):{}, meta:{id:newId(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'Roboczy'},
    author:{name:'',licenseNo:'',company:''},
    property:{city:'',district:'',street:'',buildingNo:'',localNo:'',staircase:'',usableArea:0,kwArea:0,rooms:0,floor:'',balconyArea:0,basementName:'',basementArea:0,landArea:0,plotDescription:'',auxiliaryBuildings:'',rightType:moduleCode==='developed_pairs'?'prawo własności nieruchomości gruntowej zabudowanej':'prawo odrębnej własności lokalu mieszkalnego'},
    valuation:{methodCode:moduleCode==='developed_pairs'?'pairs':'kcm',approachCode:'comparative',purpose:moduleCode==='developed_pairs'?'Określenie wartości rynkowej nieruchomości gruntowej zabudowanej dla potrzeb sprzedaży':'Określenie wartości rynkowej prawa do lokalu dla potrzeb sprzedaży',reportDate:d,valuationDate:d,priceLevelDate:d,inspectionDate:d,legalStateDate:'',roundTo:1000,approachDescription:moduleCode==='developed_pairs'?'Określono wartość rynkową nieruchomości gruntowej zabudowanej. Z uwagi na dostępność danych o cenach i cechach nieruchomości podobnych przyjęto podejście porównawcze, metodę porównywania parami.':'Określono wartość rynkową prawa do lokalu. Z uwagi na dostępność danych o cenach i cechach nieruchomości podobnych przyjęto podejście porównawcze, metodę korygowania ceny średniej.'},
    formalBasis:'',
    // Zleceniodawca (1.8.0). Puste pola oznaczaja operat bez wskazanego klienta.
    client:{id:'',kind:'osoba',name:'',company:'',nip:'',address:'',email:'',phone:'',purpose:'',contractNo:'',contractDate:'',notes:''},
    methodicalBasis:moduleCode==='developed_pairs'?'Podejście porównawcze – metoda porównywania parami. Nieruchomość wycenianą porównuje się kolejno z co najmniej trzema nieruchomościami podobnymi, a korekty cen wynikają z różnic ocen cech rynkowych w przyjętych skalach. Dobór cech, skal, wag i nieruchomości porównawczych wymaga uzasadnienia w konkretnym operacie.':'Podejście porównawcze – metoda korygowania ceny średniej. Jednostkę porównawczą i zakres rynku należy wskazać zgodnie z charakterem wycenianej nieruchomości i dostępnymi danymi. Wybór podejścia i metody wymaga uzasadnienia w konkretnym operacie.',
    legal:{kwLocal:'',kwCommon:'',ioRooms:'',ispRightType:'',ownerNames:'',ownershipType:'',commonShare:'',court:'',currentEntryBasis:'',sectionIII:'',sectionIV:'',kwNotes:'',commonProperty:{plotNo:'',plotId:'',area:'',landUse:'',buildingId:'',buildingStoreys:'',buildingUnits:'',sectionISP:'',sectionII:'',sectionIII:'',sectionIV:''},ekwImport:{rawText:'',sections:{IO:'',ISP:'',II:'',III:'',IV:''},activeSection:'IO',importedAt:'',sourceUrl:'https://ekw.ms.gov.pl/'}},
    egib:{unit:'',district:'',plotNo:'',plotId:'',plotArea:'',buildingId:'',notes:''},
    planning:{planNumber:'',planName:'',resolution:'',zoneSymbol:'',designation:'',parameters:'',protections:'',sourceUrl:'',description:''},
    location:{transport:'',services:'',recreation:'',surroundings:'',description:'',latitude:'',longitude:'',manualMapsUrl:'',mapsUrl:'',mapsQrDataUrl:'',includeMapsQR:true},
    building:{type:moduleCode==='developed_pairs'?'budynek mieszkalny jednorodzinny':'budynek mieszkalny wielorodzinny',year:'',storeys:'',construction:'',lift:'',condition:'',roof:'',facade:'',commonAreas:'',parking:'',manager:'',surroundings:'',installations:'',description:''},
    local:{kitchenType:'',bathrooms:'',orientation:'',floors:'',walls:'',windows:'',standardLevel:'',technicalCondition:'',installations:'',layout:'',description:''},
    market:{segmentDescription:'',marketDescription:'',trendSourceMode:'pairs',manualTrendRate:0,regressionBasis:'mean',trendPrecisionMode:'rounded',trendRoundDigits:4,ratingMode:'three',weightMethod:'manual',weightJustification:'',transactions:[],trendPairs:[],features:defaultFeatures(moduleCode)},
    narratives:{subject:'',scope:'',legal:'',egib:'',planning:'',location:'',building:'',local:'',market:'',extremes:'',extremeMax:'',extremeMin:'',result:''},
    photos:[], files:[],
    costing:{hours:0,hourlyRate:0,travelKm:0,costPerKm:0,documentsCost:0,printingCost:0,toolsCost:0,otherCost:0,clientFeeNet:0,vatRate:23,vatExempt:false,includeInPDF:false},
    appearance:{theme:'gold',accent:'#c99a2e',fontFamily:"Georgia, 'Times New Roman', serif",headingStyle:'line',coverStyle:'classic',bodyFontSize:10.2,lineHeight:1.38,pageMarginMm:15,tableDensity:'normal',photoColumns:2,showToc:true,showIndexes:true,headerText:moduleCode==='developed_pairs'?'Operat szacunkowy nieruchomości zabudowanej':'Operat szacunkowy nieruchomości lokalowej',footerText:'Operat szacunkowy',showHeaderFooter:true},
    legalBases:moduleCode==='developed_pairs'?LEGAL_BASES_2026.filter(x=>!x.includes('własności lokali')):[...LEGAL_BASES_2026],
    sources:moduleCode==='developed_pairs'?['Badanie aktualnej treści księgi wieczystej nieruchomości.','Dane EGiB i materiały ewidencyjne dotyczące działki i budynku.','Informacje planistyczne właściwe dla nieruchomości.','Dane o cenach transakcyjnych nieruchomości gruntowych zabudowanych podobnych z właściwego źródła.','Oględziny nieruchomości i dokumentacja fotograficzna.']:['Badanie aktualnej treści księgi wieczystej.','Dokumentacja lokalu i rzut z zestawieniem powierzchni.','Dane EGiB i materiały ewidencyjne.','Dane o cenach transakcyjnych nieruchomości podobnych z właściwego źródła.','Oględziny nieruchomości i dokumentacja fotograficzna.','Informacje planistyczne właściwe dla nieruchomości.'],
    clauses:'', attachments:moduleCode==='developed_pairs'?['Dokumentacja stanu prawnego / wydruk KW','Materiały EGiB dotyczące działki i budynku','Materiały planistyczne','Dokumentacja fotograficzna nieruchomości','Zestawienie transakcji i tabela bezpośrednich porównań']:['Dokumentacja stanu prawnego / wydruk KW','Rzut lokalu','Materiały ewidencyjne','Dokumentacja fotograficzna','Zestawienie transakcji i charakterystyka cech rynkowych']
  };
}
function normalizeLoadedProject(p){
  p=p&&typeof p==='object'?p:{};
  const detectedModule=p.module?.code||(p.valuation?.methodCode==='pairs'?'developed_pairs':'local_kcm');
  const base=freshProject(detectedModule);
  const sourceSchema=Number(p.schemaVersion||0);
  const out={...base,...p};
  out.schemaVersion=11; out.module={...base.module,...(p.module||{})};
  // Operaty sprzed 1.8.0 nie znaja klienta — dokladamy pusta strukture.
  out.client={...base.client,...(p.client||{})};
  // Operaty sprzed 1.9.2 nie znaja modulu dochodowego.
  out.income={...base.income,...(p.income||{})};
  for(const k of ['leases','rentEvidence','rateEvidence','opex','dcf']) if(!Array.isArray(out.income[k])) out.income[k]=[];
  // Operaty sprzed 1.9.3 nie znaja pozostalych modulow.
  out.modul={...(base.modul||{}),...(p.modul||{})};
  out.meta={...base.meta,...(p.meta||{})}; out.meta.id=out.meta.id||newId(); if(out.meta.status==='TEST QA')out.meta.status='Roboczy'; delete out.meta.qaScenario; delete out.meta.qaLabel;
  out.author={...base.author,...(p.author||{})}; out.property={...base.property,...(p.property||{})}; out.valuation={...base.valuation,...(p.valuation||{})};
  out.legal={...base.legal,...(p.legal||{})}; out.legal.commonProperty={...base.legal.commonProperty,...(p.legal?.commonProperty||{})}; out.legal.ekwImport={...base.legal.ekwImport,...(p.legal?.ekwImport||{})}; out.legal.ekwImport.sections={...base.legal.ekwImport.sections,...(p.legal?.ekwImport?.sections||{})};
  if(!out.legal.ekwImport.rawText && Array.isArray(p.legal?.ekwImport?.parts)) out.legal.ekwImport.rawText=p.legal.ekwImport.parts.map(x=>x.text||'').join('\n\n');
  if(out.legal.ekwImport.rawText && !Object.values(out.legal.ekwImport.sections||{}).some(Boolean)){ const raw=out.legal.ekwImport.rawText; const defs=[['IO','I-O'],['ISP','I-Sp'],['II','II'],['III','III'],['IV','IV']]; defs.forEach(([k,n])=>{out.legal.ekwImport.sections[k]=extractEkwSection(raw,n)||'';}); }
  out.egib={...base.egib,...(p.egib||{})}; out.planning={...base.planning,...(p.planning||{})}; out.location={...base.location,...(p.location||{})};
  out.building={...base.building,...(p.building||{})}; out.local={...base.local,...(p.local||{})};
  out.market={...base.market,...(p.market||{})}; out.market.transactions=(Array.isArray(p.market?.transactions)?p.market.transactions:[]).map(t=>({...t,autoMonthsToValuation:t.autoMonthsToValuation??(sourceSchema>=6),featureRatings:{...(t.featureRatings||{})}})); out.market.trendPairs=Array.isArray(p.market?.trendPairs)?p.market.trendPairs:[];
  out.market.ratingMode = p.market?.ratingMode==='excel3' ? 'three' : (p.market?.ratingMode||'three');
  out.market.trendPrecisionMode = p.market?.trendPrecisionMode==='excel4' ? 'rounded' : (p.market?.trendPrecisionMode||'rounded');
  out.market.features=(Array.isArray(p.market?.features)&&p.market.features.length?p.market.features:defaultFeatures(detectedModule)).map(f=>{
    let rating=f.rating||'Przeciętna';
    if(out.market.ratingMode==='three'){
      const n=String(rating).toLowerCase();
      // Ocena, ktora JUZ jest jedna z trzech wlasciwych, zostaje nietknieta.
      // Wczesniej przepadala tu po cichu: „Korzystna" nie zaczyna sie od
      // „max" ani „bardzo korz", wiec wpadala do ostatniej galezi i wracala
      // jako „Przecietna". Rzeczoznawca ustawial ocene korzystna, a program
      // przy nastepnym przerysowaniu ekranu cofal ja do przecietnej -
      // i wartosc operatu spadala bez slowa.
      if(['Niekorzystna','Przeciętna','Korzystna'].includes(rating)){ /* zostaje */ }
      else if(n.startsWith('min')||n.startsWith('bardzo nie')) rating='Niekorzystna';
      else if(n.startsWith('max')||n.startsWith('mak')||n==='bardzo korzystna') rating='Korzystna';
      else rating='Przeciętna';
    }
    const scaleMode=['two','three','five'].includes(f.scaleMode)?f.scaleMode:(out.market.ratingMode||'three');
    if(scaleMode==='two' && !['Niekorzystna','Korzystna'].includes(rating)) rating=String(rating).toLowerCase().includes('korz')&&!String(rating).toLowerCase().includes('niekorz')?'Korzystna':'Niekorzystna';
    return {id:f.id||newId(),name:'Cecha rynkowa',scaleMode,weight:0,rating,scaleMin:'',scaleLow:'',scaleAvg:'',scaleHigh:'',scaleMax:'',ratingNote:'',pairs:[],...f,id:f.id||newId(),scaleMode,rating,pairs:Array.isArray(f.pairs)?f.pairs:[]};
  });
  out.photos=Array.isArray(p.photos)?p.photos:[]; out.files=Array.isArray(p.files)?p.files:[]; out.costing={...base.costing,...(p.costing||{})}; if((p.costing||{}).toolsCost===undefined && (p.costing||{}).aiCost!==undefined) out.costing.toolsCost=Number(p.costing.aiCost||0); out.appearance={...base.appearance,...(p.appearance||{})};
  out.narratives={...base.narratives,...(p.narratives||{})}; out.legalBases=Array.isArray(p.legalBases)?p.legalBases:[...base.legalBases]; out.sources=Array.isArray(p.sources)?p.sources:[...base.sources]; out.attachments=Array.isArray(p.attachments)?p.attachments:[...base.attachments];
  return out;
}

let project=normalizeLoadedProject(freshProject());
let calc=obliczProjekt();
let autosaveTimer=null, autosaveDirty=false, isAuthenticated=false, periodicAutosaveTimer=null, licenseRuntimeTimer=null, historyEntries=[];
function uiRead(key,fallback){try{return localStorage.getItem(key)||fallback}catch{return fallback}}
function uiWrite(key,value){try{localStorage.setItem(key,value)}catch{}}
// tlo: 'fale' | 'spokojne' | 'bez' - osobno od animacji interfejsu, bo to dwie
// rozne rzeczy: jedna dotyczy ozdoby, druga reakcji programu na klikniecie.
let uiPrefs={mode:uiRead('operoUxMode','guide'),motion:uiRead('operoMotionMode','full'),celebrate:uiRead('operoCelebrate','tak')!=='nie',tlo:uiRead('operoTlo','fale')};
let lastMetricValue=null;
function setSaveStateUI(text,state='saved'){
  if($('#saveState'))$('#saveState').textContent=text;
  const chip=$('#topSaveState');if(chip){chip.classList.remove('saving','error');if(state==='saving')chip.classList.add('saving');if(state==='error')chip.classList.add('error');const span=chip.querySelector('span:last-child');if(span)span.textContent=text.replace(/^Autozapis do Historii · /,'Zapisano ').replace('Zmiany · zapisuję do Historii…','Zapisywanie…').replace('Błąd autozapisu','Błąd zapisu');}
}
function applyUIPrefs(){
  const app=$('#app');if(!app)return;app.classList.toggle('expert-mode',uiPrefs.mode==='expert');app.classList.toggle('guide-mode',uiPrefs.mode!=='expert');app.classList.toggle('motion-reduced',uiPrefs.motion!=='full');
  $$('.ux-mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.uxMode===uiPrefs.mode));
  const rg=$('#railGuideToggle');if(rg)rg.textContent=uiPrefs.mode==='expert'?'Tryb ekspert — szybka praca':'✦ Tryb prowadzenia';
  const motionLabel=({full:'pełne',reduced:'ograniczone',off:'wyłączone'}[uiPrefs.motion]||'pełne');const mm=$('#motionModeBtn');if(mm)mm.textContent=`Animacje: ${motionLabel}`;if($('#settingsMotion'))$('#settingsMotion').textContent=`Animacje: ${motionLabel}`;$('#settingsUxGuide')?.classList.toggle('gold-outline',uiPrefs.mode==='guide');$('#settingsUxExpert')?.classList.toggle('gold-outline',uiPrefs.mode==='expert');syncPiorekDock();
  const gr=$('#settingsCelebrate');
  if(gr)gr.textContent=`Gratulacje: ${uiPrefs.celebrate?'włączone':'wyłączone'}`;
  // Ruch tla idzie na <body>, bo samo tlo lezy OBOK #app, a nie w srodku.
  document.body.dataset.ruch = uiPrefs.motion==='full' ? 'pelne' : uiPrefs.motion==='reduced' ? 'spokojne' : 'brak';
  document.body.dataset.tloStyl = uiPrefs.tlo;
  const tl=$('#settingsTlo');
  if(tl)tl.textContent=`Tło: ${({fale:'falujące',spokojne:'spokojne',bez:'wyłączone'}[uiPrefs.tlo]||'falujące')}`;
}

/** Tlo: falujace -> spokojne -> wylaczone -> falujace. */
function przelaczTlo(){
  const kolejne={fale:'spokojne',spokojne:'bez',bez:'fale'};
  uiPrefs.tlo=kolejne[uiPrefs.tlo]||'fale';
  uiWrite('operoTlo',uiPrefs.tlo);
  applyUIPrefs();
  showStatus(`Tło: ${({fale:'falujące',spokojne:'spokojne',bez:'wyłączone'}[uiPrefs.tlo])}.`,'info',4000);
}

/**
 * Fala od miejsca klikniecia.
 *
 * Delegacja na calym dokumencie, bo przyciskow jest ponad setka i powstaja tez
 * pozniej - wieszanie zdarzenia na kazdym z osobna skonczyloby sie tym, ze nowe
 * przyciski nie reaguja. Element sprzata po sobie sam, po animacji.
 */
document.addEventListener('pointerdown',e=>{
  if(uiPrefs.motion!=='full')return;
  const b=e.target.closest?.('.btn');
  if(!b||b.disabled)return;
  const r=b.getBoundingClientRect();
  const f=document.createElement('span');
  f.className='btn-fala';
  const d=Math.max(r.width,r.height)*2.2;
  f.style.width=f.style.height=`${d}px`;
  f.style.left=`${e.clientX-r.left}px`;
  f.style.top=`${e.clientY-r.top}px`;
  b.appendChild(f);
  setTimeout(()=>f.remove(),600);
},{passive:true});
function przelaczGratulacje(){
  uiPrefs.celebrate=!uiPrefs.celebrate;
  uiWrite('operoCelebrate',uiPrefs.celebrate?'tak':'nie');
  applyUIPrefs();
  showStatus(uiPrefs.celebrate?'Gratulacje i konfetti włączone.':'Gratulacje wyciszone — zostają same komunikaty.','info');
}
function setUXMode(mode){uiPrefs.mode=mode==='expert'?'expert':'guide';uiWrite('operoUxMode',uiPrefs.mode);applyUIPrefs();renderWorkflowUI();clearTimeout(guideTimer);if(uiPrefs.mode==='guide')guideTimer=setTimeout(()=>guideCurrentStep(false),80);}
function cycleMotionMode(){const order=['full','reduced','off'];uiPrefs.motion=order[(order.indexOf(uiPrefs.motion)+1)%order.length];uiWrite('operoMotionMode',uiPrefs.motion);applyUIPrefs();}

const PIOREK_STATES=['idle','fly','point','explain','success'];let piorekStateTimer=null;
function setPiorekState(el,state='idle',{restart=true,after=0,next=null}={}){
  if(!el)return;state=PIOREK_STATES.includes(state)?state:'idle';PIOREK_STATES.forEach(x=>el.classList.remove(`state-${x}`));if(restart){void el.offsetWidth;}el.classList.add(`state-${state}`);el.dataset.state=state;
  if(after&&next){clearTimeout(piorekStateTimer);piorekStateTimer=setTimeout(()=>{if(el?.isConnected)setPiorekState(el,next,{restart:true});},after);}
}
function syncPiorekDock(){const dock=$('#piorekDock'),copy=dock?.querySelector('.piorek-dock-copy small'),status=dock?.querySelector('.piorek-dock-status');if(copy)copy.textContent=uiPrefs.mode==='expert'?'Tryb cichy':'Jestem pod ręką';if(status)status.title=uiPrefs.mode==='expert'?'PER działa na żądanie':'PER prowadzi aktywnie';setPiorekState($('#dockPiorek'),uiPrefs.mode==='expert'?'idle':'idle',{restart:false});}
function openPiorekPanel(){const p=$('#piorekPanel');if(!p)return;p.classList.remove('hidden');setPiorekState($('#dockPiorek'),'explain',{after:780,next:'idle'});const st=WIZARD_STEPS[wizardIndex],issues=st?validateStep(st.tab):[];const txt=$('#piorekPanelText');if(txt)txt.textContent=st?`${dynamicStepName(st)}: ${issues.length?`widzę ${issues.length} ${issues.length===1?'element do uzupełnienia':'elementów do uzupełnienia'}.`:'etap wygląda kompletnie.'} Wybierz, jak mam Ci pomóc.`:'Jestem pod ręką. Mogę wskazać następne działanie albo wyjaśnić interfejs OPERO.';}
function closePiorekPanel(){$('#piorekPanel')?.classList.add('hidden');setPiorekState($('#dockPiorek'),'idle',{restart:false});}
function piorekExplainCurrentStep(){closePiorekPanel();if(uiPrefs.mode==='expert')setUXMode('guide');const st=WIZARD_STEPS[wizardIndex];if(!st){showStatus('PER jest najbardziej aktywny podczas tworzenia operatu. Otwórz operat albo rozpocznij nowy.','info',5500);return;}const g=guideTargetForStep(st.tab);if(g?.el){const expl={...g,text:`${g.text} PER wskazuje to miejsce, ponieważ jest ono potrzebne do prawidłowego ukończenia etapu „${dynamicStepName(st)}”.`};showContextCoach(expl,{scroll:true,state:'explain'});}else showStatus(`PER: etap „${dynamicStepName(st)}” wygląda kompletnie. Możesz przejść dalej.`,'info',5500);}
function piorekShowMissing(){closePiorekPanel();const st=WIZARD_STEPS[wizardIndex];if(!st){switchTab('dashboard');return;}const issues=validateStep(st.tab);if(!issues.length){showStepSuccess(dynamicStepName(st),'PER sprawdził etap — nie widzę braków krytycznych.');return;}showStatus(`PER znalazł ${issues.length} ${issues.length===1?'brak':'braków'} w etapie „${dynamicStepName(st)}”. Pokazuję pierwszy.`, 'info',6500);if(uiPrefs.mode==='expert')setUXMode('guide');guideCurrentStep(true,true);}
function runPiorekAction(action){if(action==='next'){closePiorekPanel();if(uiPrefs.mode==='expert')setUXMode('guide');guideCurrentStep(true,true);}else if(action==='explain')piorekExplainCurrentStep();else if(action==='missing')piorekShowMissing();else if(action==='ask')setPiorekView('ask');else if(action==='quiet'){closePiorekPanel();setUXMode('expert');showStatus('PER przechodzi w tryb cichy. Nadal możesz otworzyć go w górnym pasku.','info',5500);}}

const PIOREK_KB_MODULE_MAP={local_kcm:'local_ownership_kcm',developed_pairs:'developed_property_pairs',income:'commercial_income_cap',cost:'building_reproduction_cost',expropriation:'expropriation_general',agri_forest:'agricultural_pairs',fees:'planning_fee',easement:'transmission_easement'};
let piorekKnowledgeStatus=null,piorekLastAnswer=null,piorekKnowledgeBusy=false;
function currentKnowledgeTypeCode(){return PIOREK_KB_MODULE_MAP[moduleCode()]||'';}
function setPiorekView(view='nav'){
  const ask=view==='ask';$('#piorekNavView')?.classList.toggle('hidden',ask);$('#piorekAskView')?.classList.toggle('hidden',!ask);$('#piorekNavTab')?.classList.toggle('active',!ask);$('#piorekAskTab')?.classList.toggle('active',ask);if(ask){setPiorekState($('#dockPiorek'),'explain',{after:850,next:'idle'});refreshPiorekKnowledgeStatus(false);if(!window.__agrafekPodpiety){window.__agrafekPodpiety=true;hookAgrafek191();agrafekStartGestow();hookAgrafek194();hookAgrafek195();hookAgrafekPilot();hookAsystent1171();}asystentRysuj();agrafekOdswiezStatus(false);agrafekOdswiezKontekst();setTimeout(()=>$('#piorekQuestion')?.focus(),40);}
}
function knowledgeScreenCode(){return WIZARD_STEPS?.[wizardIndex]?.tab||document.querySelector('.tab.active')?.id?.replace(/^tab-/,'')||'dashboard';}
function renderPiorekKnowledgeStatus(){
  const st=piorekKnowledgeStatus,meta=$('#piorekKbMeta'),title=$('#piorekKbTitle'),dot=$('#piorekKbDot');if(!meta||!title||!dot)return;
  if(!st){title.textContent='Biblia OPERO';meta.textContent='Snapshot wiedzy nie został jeszcze sprawdzony.';dot.dataset.state='idle';return;}
  const snap=st.snapshot||{};title.textContent=snap.preview?'Biblia OPERO · WERSJA ROBOCZA':'Biblia OPERO';meta.textContent=`${snap.code||'—'} · stan prawny ${snap.legalStateDate||'—'} · ${st.counts?.rules||0} reguł`;dot.dataset.state=st.ok?'ok':'error';try{agrafekWskazniki();}catch{}
}
async function refreshPiorekKnowledgeStatus(showErrors=true){
  try{piorekKnowledgeStatus=await window.operatAPI.getKnowledgeStatus();renderPiorekKnowledgeStatus();return piorekKnowledgeStatus;}catch(e){piorekKnowledgeStatus={ok:false,error:cleanRemoteError(e)};const meta=$('#piorekKbMeta'),dot=$('#piorekKbDot');if(meta)meta.textContent=piorekKnowledgeStatus.error;if(dot)dot.dataset.state='error';if(showErrors)showStatus(`PER: ${piorekKnowledgeStatus.error}`,'error',7000);return null;}
}
function piorekBasisLabel(b){const s=b?.source;if(!s)return b?.title||'Reguła Biblii';const pages=b.pageFrom?` · s. ${b.pageFrom}${b.pageTo&&b.pageTo!==b.pageFrom?`–${b.pageTo}`:''}`:'';return `${s.title||s.filename||'Źródło'}${pages}`;}
function renderPiorekAnswer(res){
  piorekLastAnswer=res;const root=$('#piorekAnswer');if(!root)return;root.classList.remove('hidden');if(!res?.ok){root.innerHTML=`<div class="piorek-answer-error"><b>Nie udało się odpowiedzieć</b><p>${escapeHTML(res?.error||'Brak odpowiedzi Biblii OPERO.')}</p></div>`;return;}
  const route=escapeHTML(res.routeTitle||res.route||'Biblia OPERO'),type=res.type?.name?` · ${escapeHTML(res.type.name)}`:'',preview=res.snapshot?.preview?'<span class="piorek-preview-badge">WERSJA ROBOCZA</span>':'';
  const answer=String(res.answer||'').split(/\n\n+/).filter(Boolean).map((p,i)=>i===0?`<b class="piorek-answer-lead">${escapeHTML(p)}</b>`:`<p>${escapeHTML(p)}</p>`).join('');
  const basis=(res.basis||[]).slice(0,5).map(b=>`<details class="piorek-basis"><summary>${escapeHTML(b.title||b.ruleCode||'Reguła')}</summary><p>${escapeHTML(b.text||'')}</p>${b.formula?`<code>${escapeHTML(b.formula)}</code>`:''}<small>${escapeHTML(piorekBasisLabel(b))}</small></details>`).join('');
  const sources=(res.sources||[]).map((x,i)=>`<button class="piorek-source" type="button" data-piorek-source-index="${i}"><span>${i+1}</span><div><b>${escapeHTML(x.title||'Źródło')}</b><small>${escapeHTML(x.whatToFind||x.authority||'Otwórz źródło')}</small></div><i>↗</i></button>`).join('');
  root.innerHTML=`<div class="piorek-answer-head"><span>${route}${type}</span>${preview}</div><div class="piorek-answer-copy">${answer}</div>${res.limitations?`<div class="piorek-answer-limit"><b>Granica odpowiedzi</b><span>${escapeHTML(res.limitations)}</span></div>`:''}${basis?`<div class="piorek-answer-section"><b>Skąd to wiem?</b>${basis}</div>`:''}${sources?`<div class="piorek-answer-section"><b>Gdzie sprawdzić / pobrać dane?</b>${sources}</div>`:''}<small class="piorek-answer-privacy">${escapeHTML(res.privacy||'')}</small>`;
  $$('[data-piorek-source-index]',root).forEach(b=>b.addEventListener('click',async()=>{const src=(res.sources||[])[Number(b.dataset.piorekSourceIndex)];if(src?.url)try{await window.operatAPI.openExternal(src.url);}catch(e){showStatus(cleanRemoteError(e),'error');}}));
}
async function askPiorekKnowledge(question=null){
  if(piorekKnowledgeBusy)return;const input=$('#piorekQuestion'),q=String(question??input?.value??'').trim();if(q.length<2){showStatus('Wpisz pytanie do PER.','info',4500);input?.focus();return;}piorekKnowledgeBusy=true;const btn=$('#piorekAskBtn');if(btn){btn.disabled=true;btn.textContent='PER sprawdza Biblię…';}setPiorekState($('#dockPiorek'),'explain',{restart:true});const root=$('#piorekAnswer');if(root){root.classList.remove('hidden');root.innerHTML='<div class="piorek-answer-loading"><i></i><span>Przeszukuję Biblię OPERO, reguły i mapę źródeł…</span></div>';}try{const res=await window.operatAPI.askPiorek({question:q,valuationTypeCode:currentKnowledgeTypeCode(),moduleCode:moduleCode(),screen:knowledgeScreenCode()});renderPiorekAnswer(res);setPiorekState($('#dockPiorek'),'point',{after:900,next:'idle'});}catch(e){renderPiorekAnswer({ok:false,error:cleanRemoteError(e)});setPiorekState($('#dockPiorek'),'idle',{restart:true});}finally{piorekKnowledgeBusy=false;if(btn){btn.disabled=false;btn.textContent='Zapytaj PER →';}}
}
function clearPiorekAnswer(){piorekLastAnswer=null;const r=$('#piorekAnswer');if(r){r.innerHTML='';r.classList.add('hidden');}const e=$('#piorekExamResult');if(e){e.innerHTML='';e.classList.add('hidden');}}


let contextCoachTarget=null,contextCoachGuide=null,guideTimer=null,coachRaf=0,commandActiveIndex=0,fieldHelpTarget=null;
function hideCoachLink(){const l=$('#contextCoachLink');if(l)l.classList.add('hidden');}
function hideContextCoach(){const c=$('#contextCoach');if(c)c.classList.add('hidden');hideCoachLink();contextCoachTarget?.classList?.remove('coach-anchor-target');contextCoachTarget=null;contextCoachGuide=null;}
function coachTargetIsVisible(target){
  if(!target?.isConnected)return false;const tab=target.closest('.tab');if(tab&&!tab.classList.contains('active'))return false;const style=getComputedStyle(target);if(style.display==='none'||style.visibility==='hidden')return false;return target.getClientRects().length>0;
}
function coachFocusRect(target){const control=contextCoachGuide?.el;if(control?.isConnected&&control.getClientRects().length)return control.getBoundingClientRect();return target.getBoundingClientRect();}
function scheduleCoachPlacement(){if(!contextCoachTarget)return;if(coachRaf)cancelAnimationFrame(coachRaf);coachRaf=requestAnimationFrame(()=>{coachRaf=0;placeContextCoach(contextCoachTarget);});}
function drawCoachLink(target,placement){
  const link=$('#contextCoachLink'),c=$('#contextCoach');if(!link||!c||c.classList.contains('hidden'))return hideCoachLink();
  const r=coachFocusRect(target),b=c.getBoundingClientRect();let sx,sy,ex,ey;
  if(placement==='right'){sx=b.left;sy=Math.min(b.bottom-25,Math.max(b.top+25,r.top+r.height/2));ex=r.right;ey=r.top+r.height/2;}
  else if(placement==='left'){sx=b.right;sy=Math.min(b.bottom-25,Math.max(b.top+25,r.top+r.height/2));ex=r.left;ey=r.top+r.height/2;}
  else if(placement==='above'){sx=Math.min(b.right-28,Math.max(b.left+28,r.left+r.width/2));sy=b.bottom;ex=r.left+r.width/2;ey=r.top;}
  else{sx=Math.min(b.right-28,Math.max(b.left+28,r.left+r.width/2));sy=b.top;ex=r.left+r.width/2;ey=r.bottom;}
  const dx=ex-sx,dy=ey-sy,len=Math.max(0,Math.hypot(dx,dy)),ang=Math.atan2(dy,dx)*180/Math.PI;
  link.classList.remove('hidden');link.style.left=`${Math.round(sx)}px`;link.style.top=`${Math.round(sy)}px`;link.style.width=`${Math.round(len)}px`;link.style.transform=`rotate(${ang}deg)`;
}
/**
 * PODPOWIEDZ PRZY POLU NIE MOZE ZASLANIAC FORMULARZA.
 *
 * Dymek stawal obok wskazanego pola — czyli w trzykolumnowym formularzu
 * dokladnie NA polach z sasiednich kolumn. Rzeczoznawca czytal „uzupelnij
 * Miasto" i nie widzial przez to „Dzielnicy" ani „Ulicy".
 *
 * Zasada jest teraz jedna: podpowiedz NIGDY nie plywa nad trescia.
 *   - Gdy po prawej widac karte „Nastepny krok", ona JEST podpowiedzia:
 *     mowi to samo i ma przycisk „Pokaz mi gdzie". Dymek sie nie pokazuje.
 *   - Gdy karty nie widac (waskie okno), podpowiedz staje W TRESCI strony,
 *     nad formularzem — zajmuje wlasne miejsce i niczego nie przykrywa.
 * Samo pole ma zlota obwodke i znacznik „PER → TU".
 */
function placeContextCoach(target){
  const c=$('#contextCoach');if(!c||!target||!coachTargetIsVisible(target)){hideContextCoach();return;}
  hideCoachLink();
  c.classList.remove('above','below','left','right');
  const karta=$('#nextActionCard');
  const kartaWidoczna=karta&&karta.getClientRects().length>0&&karta.getBoundingClientRect().width>40;
  if(kartaWidoczna){c.classList.add('hidden');return;}
  const sekcja=target.closest('section.tab')||target.closest('.tab');
  if(!sekcja){c.classList.add('hidden');return;}
  c.classList.add('w-tresci');c.classList.remove('hidden');
  c.style.left='';c.style.top='';
  const tytul=sekcja.querySelector(':scope > .section-title');
  const przed=tytul?tytul.nextSibling:sekcja.firstChild;
  if(c.parentNode!==sekcja||c.previousElementSibling!==tytul) sekcja.insertBefore(c,przed);
}
function showContextCoach(g,{scroll=false,state='point'}={}){
  // Przy otwartym samouczku glos ma JEDEN przewodnik. Podpowiedz przy polu
  // zaslanialaby wtedy to, co samouczek wlasnie pokazuje, i mowila o czym innym.
  if(przewodnikAktywny){hideContextCoach();return;}
  hideFieldHelp();if(uiPrefs.mode==='expert'||!g?.el){hideContextCoach();return;}const target=g.el.closest('label')||g.el;if(!coachTargetIsVisible(target)){hideContextCoach();return;}hideContextCoach();contextCoachTarget=target;contextCoachGuide=g;target.classList.add('coach-anchor-target');
  const paint=()=>{if(contextCoachTarget!==target||!coachTargetIsVisible(target))return hideContextCoach();const st=WIZARD_STEPS[wizardIndex],field=g.title||'wskazane pole',c=$('#contextCoach'),piorek=$('#contextPiorek');if($('#contextCoachStep'))$('#contextCoachStep').textContent=`ETAP ${wizardIndex+1} Z ${WIZARD_STEPS.length} · ${dynamicStepName(st)}`;if($('#contextCoachField'))$('#contextCoachField').textContent=field;if($('#contextCoachEyebrow'))$('#contextCoachEyebrow').textContent=state==='explain'?'PER · WYJAŚNIAM':'PER · PROWADZENIE';if($('#contextCoachTitle'))$('#contextCoachTitle').textContent=state==='explain'?`Dlaczego: ${field}?`:`Teraz uzupełnij: ${field}`;if($('#contextCoachText'))$('#contextCoachText').textContent=g.text||'Uzupełnij wskazane pole.';if(c)c.dataset.piorekState=state;placeContextCoach(target);if(piorek){if(uiPrefs.motion==='full'&&scroll&&state!=='explain')setPiorekState(piorek,'fly',{after:560,next:'point'});else setPiorekState(piorek,state==='explain'?'explain':'point',{restart:true});}};
  if(scroll){target.scrollIntoView({behavior:uiPrefs.motion==='full'?'smooth':'auto',block:'center',inline:'nearest'});clearTimeout(guideTimer);guideTimer=setTimeout(paint,uiPrefs.motion==='full'?320:30);}else paint();
}
function refreshContextCoach(){if(uiPrefs.mode==='expert'||!contextCoachTarget||$('#contextCoach')?.classList.contains('hidden'))return;const st=WIZARD_STEPS[wizardIndex],g=st?guideTargetForStep(st.tab):null;if(!g?.el)return hideContextCoach();const nextTarget=g.el.closest('label')||g.el;if(nextTarget!==contextCoachTarget){hideContextCoach();if(coachTargetIsVisible(nextTarget))showContextCoach(g,{scroll:false});}else{contextCoachGuide=g;scheduleCoachPlacement();}}
function showStepSuccess(title,text='Etap jest kompletny. Przechodzę dalej.'){
  if(uiPrefs.motion==='off')return;const el=$('#stepSuccess');if(!el)return;if($('#stepSuccessTitle'))$('#stepSuccessTitle').textContent=title||'Gotowe';if($('#stepSuccessText'))$('#stepSuccessText').textContent=text;setPiorekState($('#successPiorek'),'success',{restart:true});el.classList.remove('hidden');void el.offsetWidth;el.style.animation='none';void el.offsetWidth;el.style.animation='';setTimeout(()=>el.classList.add('hidden'),1700);
}
function notificationItems(){
  const step=WIZARD_STEPS?.[wizardIndex],issues=step?validateStep(step.tab):[],g=step?guideTargetForStep(step.tab):null,total=overallCompleteness(),lic=licenseStateCache||{};const items=[];
  if(step&&issues.length)items.push({kind:'warn',icon:'!',title:`${issues.length} ${odmianaElementu(issues.length)}`,text:g?.text||`Sprawdź bieżący etap: ${dynamicStepName(step)}.`,action:'guide'});
  else if(step)items.push({kind:'ok',icon:'✓',title:'Bieżący etap wygląda dobrze',text:`${dynamicStepName(step)} — możesz przejść dalej.`,action:'next'});
  if(total<100)items.push({kind:'',icon:'◔',title:`Operat kompletny w ${total}%`,text:'OPERO liczy postęp na podstawie rzeczywiście uzupełnionych danych.',action:'dashboard'});else items.push({kind:'ok',icon:'◆',title:'Kompletność 100%',text:'Przejdź do Wyniku i wykonaj kontrolę przed PDF.',action:'result'});
  if(lic.active)items.push({kind:licenseMsLeft(lic)<=7*86400000?'warn':'ok',icon:'⏳',title:`Dostęp: pozostało ${licenseCountdownText(lic)}`,text:`Cały program jest odblokowany do ${licenseExpiryFull(lic)}.`,action:'settings'});
  if(autosaveDirty)items.push({kind:'',icon:'↻',title:'Zmiany czekają na autozapis',text:'OPERO zapisze je automatycznie do Historii.',action:null});
  if(uiPrefs.mode==='guide')items.push({kind:'notification-guide-only',icon:'✦',title:'PER prowadzi aktywnie',text:'PER przeskakuje do następnego działania i pozostaje przywiązany do wskazywanego pola.',action:'guide'});
  return items;
}
function runNotificationAction(action){
  $('#notificationPanel')?.classList.add('hidden');if(action==='guide')guideCurrentStep(true);else if(action==='next')wizardMove(1);else if(action==='dashboard')switchTab('dashboard');else if(action==='result')switchTab('result');else if(action==='settings')switchTab('settings');
}
/** 1 element wymaga · 2 elementy wymagają · 5 elementów wymaga. */
function odmianaElementu(n){
  n=Number(n)||0;
  if(n===1) return 'element wymaga';
  const dwie=n%100, jedna=n%10;
  return (jedna>=2 && jedna<=4 && !(dwie>=12 && dwie<=14)) ? 'elementy wymagają' : 'elementów wymaga';
}
/** 1 uwaga · 2 uwagi · 5 uwag — tak, jak mówi się po polsku. */
function odmianaUwagi(n){
  n=Number(n)||0;
  if(n===1) return 'uwaga';
  const dwie=n%100, jedna=n%10;
  return (jedna>=2 && jedna<=4 && !(dwie>=12 && dwie<=14)) ? 'uwagi' : 'uwag';
}
/** 1 informacja · 2 informacje · 5 informacji. */
function odmianaInfo(n){
  n=Number(n)||0;
  if(n===1) return 'informacja';
  const dwie=n%100, jedna=n%10;
  return (jedna>=2 && jedna<=4 && !(dwie>=12 && dwie<=14)) ? 'informacje' : 'informacji';
}

/* ===========================================================================
   OKIENKO STANU — ILE CZEGO I W JAKIM KOLORZE
   ---------------------------------------------------------------------------
   Rzeczoznawca ma jednym spojrzeniem wiedziec, czy moze isc dalej. Trzy
   kolory i trzy liczby, zawsze w tym samym miejscu:

     CZERWONY  — blokuje. Operat z tym bledem nie powinien wyjsc jako PDF.
     POMARANCZ — do zaakceptowania. Program cos przyjal za Ciebie albo o cos
                 pyta; nic sie nie zepsuje, ale podpisujesz to Ty.
     ZIELONY   — nic groznego. To, co juz jest zrobione dobrze.

   Kolory nie sa ozdoba. Rzeczoznawca pracuje w programie godzinami i musi
   umiec odroznic „zajrzyj, gdy bedziesz mial chwile" od „nie wysylaj tego
   klientowi" - bez czytania listy.
   ======================================================================== */
function stanProgramu(){
  const O = window.OperoOkno;
  const k = kontrolaWynik?.podsumowanie || null;
  const n = (O && oknoStan) ? O.nieprzeczytane(oknoStan) : { wpisy: [] };

  // CZERWONE: to, co blokuje. Bledy kontroli operatu i bledy, ktore program
  // zglosil w trakcie pracy (zrodlo nie odpowiedzialo, pliku nie wczytano).
  const bledyOkna = n.wpisy.filter(w => w.rodzaj === 'blad');
  const czerwone = (k?.bledy || 0) + bledyOkna.length;

  // POMARANCZOWE: do zaakceptowania. Uwagi kontroli, pytania programu
  // i rozdzialy napisane przez model, w ktorych sa wartosci spoza danych.
  const pytania = n.wpisy.filter(w => w.rodzaj === 'pytanie');
  const doSprawdzenia = (project.narrativesMeta?.doSprawdzenia || []).length;
  const pomaranczowe = (k?.uwagi || 0) + pytania.length + doSprawdzenia;

  const zielone = k?.ok || 0;
  const waga = czerwone ? 'blad' : (pomaranczowe ? 'uwaga' : 'ok');

  const czesci = [];
  if (czerwone) czesci.push(`${czerwone} do poprawy`);
  if (pomaranczowe) czesci.push(`${pomaranczowe} do zaakceptowania`);
  if (!czerwone && !pomaranczowe) czesci.push(k ? 'bez zastrzeżeń' : 'nic nie czeka');

  return {
    czerwone, pomaranczowe, zielone, waga,
    gotowosc: k?.gotowosc ?? null,
    tekst: czesci.join(' · '),
    bledyOkna, pytania,
    opis: czerwone
      ? 'Czerwone blokuje: z takim operatem nie wychodź do klienta.'
      : pomaranczowe
        ? 'Pomarańczowe nie blokuje, ale podpisujesz to Ty — przejrzyj przed podpisem.'
        : 'Nic groźnego. To, co program sprawdził, jest w porządku.',
  };
}

function renderNotifications(){
  const root=$('#notificationList'),badge=$('#notificationBadge');if(!root||!badge)return;const items=notificationItems();const attention=items.filter(x=>x.kind==='warn').length;
  const stan=stanProgramu();
  // Liczba w rogu pokazuje to, co NAJPILNIEJSZE: najpierw czerwone, potem
  // pomaranczowe. Suma wszystkiego nie powiedzialaby nic - „7" moze znaczyc
  // siedem drobiazgow albo siedem bledow blokujacych PDF.
  badge.textContent=String(stan.czerwone || stan.pomaranczowe || items.length || 0);
  // Gdy obok stoi juz napis z liczba („33 do poprawy"), kolko z ta sama
  // liczba jest powtorzeniem. Zostawiamy jedno - to, ktore mowi, CZEGO jest
  // tyle; sama cyfra zostaje tylko wtedy, gdy na napis nie ma miejsca.
  const bedzieNapis = Boolean(stan.czerwone || stan.pomaranczowe || items.length);
  badge.dataset.empty=bedzieNapis?'0':'1';
  badge.dataset.zNapisem=bedzieNapis?'1':'0';
  badge.dataset.waga=stan.waga;
  const kropki=$('#notificationStan');
  if(kropki){
    kropki.innerHTML=
      `<span class="stan-kropka stan-blad${stan.czerwone?'':' pusta'}" title="Blokuje — nie wychodź z tym do klienta">✕ ${stan.czerwone}</span>`+
      `<span class="stan-kropka stan-uwaga${stan.pomaranczowe?'':' pusta'}" title="Do zaakceptowania — nic się nie zepsuje, ale podpisujesz to Ty">! ${stan.pomaranczowe}</span>`+
      `<span class="stan-kropka stan-ok${stan.zielone?'':' pusta'}" title="Zrobione dobrze">✓ ${stan.zielone}</span>`;
    kropki.dataset.waga=stan.waga;
  }
  if($('#notificationOpis')) $('#notificationOpis').textContent=stan.opis;
  // Sama liczba w rogu ginie wsrod innych przyciskow. Stan idzie wiec takze na
  // przycisk i na jego otoczenie, zeby bylo widac KATEM OKA, ze cos czeka -
  // i czy to uwaga do poprawienia, czy zwykla informacja.
  badge.dataset.uwaga = attention ? '1' : '0';
  const dzwonek=$('#notificationBtn');
  if(dzwonek){
    dzwonek.dataset.uwagi = stan.waga==='blad' ? 'blad' : stan.waga==='uwaga' ? 'uwaga' : (items.length?'info':'brak');
    dzwonek.title = `${stan.tekst}. ${stan.opis}`;
  }
  // Sama cyfra w rogu nie mowi, CZEGO jest dwa. Gdy cos czeka, przycisk
  // przestaje byc ikona i staje sie napisem - „2 uwagi" widac bez najezdzania
  // kursorem i bez zgadywania, co oznacza kolko w pasku.
  const napis=$('#notificationNapis');
  if(napis){
    // Sama cyfra nie mowi, CZEGO jest trzy. Napis mowi wprost.
    napis.textContent = stan.czerwone ? `${stan.czerwone} do poprawy`
      : stan.pomaranczowe ? `${stan.pomaranczowe} do zaakceptowania`
      : items.length ? `${items.length} ${odmianaInfo(items.length)}` : '';
  }
  root.innerHTML=items.map((x,i)=>`<div class="notification-item ${escapeHTML(x.kind||'')}" data-notification-index="${i}"><span class="notification-icon">${escapeHTML(x.icon)}</span><div><b>${escapeHTML(x.title)}</b><p>${escapeHTML(x.text)}</p></div>${x.action?'<button type="button" aria-label="Otwórz">›</button>':''}</div>`).join('');
  $$('[data-notification-index]',root).forEach(el=>{const i=Number(el.dataset.notificationIndex),it=items[i];if(it?.action)el.addEventListener('click',()=>runNotificationAction(it.action));});
}
const COMMANDS=[
  {id:'new',icon:'＋',title:'Nowy operat',desc:'Wybierz rodzaj wyceny',keys:'Ctrl+N',run:()=>openModuleSelector()},
  {id:'next',icon:'→',title:'Następny krok',desc:'Przejdź dalej w kreatorze',keys:'Ctrl+Enter',run:()=>wizardMove(1)},
  {id:'guide',icon:'✦',title:'Pokaż następne działanie',desc:'Wskaż pole, które warto uzupełnić teraz',keys:'',run:()=>guideCurrentStep(true)},
  {id:'piorek',icon:'🧷',title:'Zapytaj PER',desc:'Biblia OPERO, źródła i trudne pytania',keys:'',slowa:'agrafek PER piorek piorko pytanie biblia asystent pomoc metodyka',run:()=>{openPiorekPanel();setPiorekView('ask');}},
  {id:'result',icon:'◆',title:'Wynik i kontrola PDF',desc:'Przejdź do wyniku wyceny',keys:'Ctrl+P',run:()=>switchTab('result')},
  {id:'history',icon:'◷',title:'Historia operatów',desc:'Otwórz zapisane projekty',keys:'',run:()=>switchTab('history')},
  {id:'settings',icon:'⚙',title:'Ustawienia',desc:'Licencja, interfejs i konto',keys:'',run:()=>switchTab('settings')},
  {id:'save',icon:'✓',title:'Zapisz teraz',desc:'Wymuś autozapis do Historii',keys:'Ctrl+S',run:()=>forceAutosave({silent:false})},
  {id:'expert',icon:'↔',title:'Przełącz Prowadzenie / Ekspert',desc:'Zmień gęstość interfejsu i podpowiedzi',keys:'',run:()=>setUXMode(uiPrefs.mode==='expert'?'guide':'expert')},
  {id:'help',icon:'?',title:'Samouczek OPERO',desc:'Uruchom pomoc krok po kroku',keys:'',slowa:'samouczek przewodnik tutorial pomoc start',run:()=>pokazPrzewodnik(0)}
];
// Wyszukiwanie w palecie musi radzic sobie z polska odmiana i brakiem ogonkow:
// „piorek" ma znalezc „Zapytaj PER", a „zdjecia" — „Zdjęcia i pliki".
function bezOgonkow(v){
  return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l');
}
function rdzen(slowo){ return slowo.length>=5?slowo.slice(0,-2):slowo; }
function commandMatches(cmd,q){
  const zapytanie=bezOgonkow(q).trim();
  if(!zapytanie) return true;
  const tekst=bezOgonkow(`${cmd.title} ${cmd.desc} ${cmd.keys} ${cmd.slowa||''}`);
  return zapytanie.split(/\s+/).filter(Boolean).every(w=>tekst.includes(w)||tekst.includes(rdzen(w)));
}
function renderCommandResults(){const root=$('#commandResults');if(!root)return;const q=$('#commandSearch')?.value||'',list=COMMANDS.filter(c=>commandMatches(c,q));commandActiveIndex=Math.max(0,Math.min(commandActiveIndex,list.length-1));root.innerHTML=list.length?list.map((c,i)=>`<button type="button" class="command-item ${i===commandActiveIndex?'active':''}" data-command-id="${c.id}"><span>${c.icon}</span><div><b>${escapeHTML(c.title)}</b><small>${escapeHTML(c.desc)}</small></div><kbd>${escapeHTML(c.keys)}</kbd></button>`).join(''):'<div class="empty-project-state"><b>Brak takiego działania</b><p>Spróbuj wpisać np. „wynik”, „historia” albo „nowy”.</p></div>';$$('[data-command-id]',root).forEach(b=>b.addEventListener('click',()=>executeCommand(b.dataset.commandId)));}
function openCommandPalette(){const o=$('#commandPalette');if(!o)return;o.classList.remove('hidden');commandActiveIndex=0;if($('#commandSearch'))$('#commandSearch').value='';if($('#commandProjectContext'))$('#commandProjectContext').textContent=dashboardAddress();renderCommandResults();setTimeout(()=>$('#commandSearch')?.focus(),20);}
function closeCommandPalette(){$('#commandPalette')?.classList.add('hidden');}
function executeCommand(id){
  const c=COMMANDS.find(x=>x.id===id); if(!c)return;
  closeCommandPalette();
  setTimeout(()=>{ Promise.resolve(c.run()).catch(e=>showStatus(cleanRemoteError(e),'error')); },0);
}
function moveCommandSelection(delta){const list=COMMANDS.filter(c=>commandMatches(c,$('#commandSearch')?.value||''));if(!list.length)return;commandActiveIndex=(commandActiveIndex+delta+list.length)%list.length;renderCommandResults();$('#commandResults .command-item.active')?.scrollIntoView({block:'nearest'});}
function updateScrollTopButton(){const b=$('#scrollTopBtn');if(!b)return;b.classList.toggle('hidden',window.scrollY<420||$('#app')?.classList.contains('hidden-until-auth'));}


function getPath(obj,path){ return String(path).split('.').reduce((o,k)=>o?.[k],obj); }
function setPath(obj,path,value){ const parts=String(path).split('.'); let o=obj; for(let i=0;i<parts.length-1;i++){if(!o[parts[i]]||typeof o[parts[i]]!=='object')o[parts[i]]={};o=o[parts[i]];} o[parts.at(-1)]=value; }
function coerce(el){ if(el.type==='checkbox')return el.checked; if(el.type==='number')return el.value===''?0:Number(el.value); return el.value; }
function isFilled(v){ return !(v===null||v===undefined||String(v).trim()===''||String(v).includes('[DO UZUPEŁNIENIA')); }
function bindStaticFields(){
  $$('[data-path]').forEach(el=>{
    const v=getPath(project,el.dataset.path); if(el.type==='checkbox')el.checked=!!v;else el.value=v??'';
    if(el.dataset.bound)return;
    const evt=(el.tagName==='SELECT'||['checkbox','date','color'].includes(el.type))?'change':'input';
    el.addEventListener(evt,()=>{
      const path=el.dataset.path,value=coerce(el);
      if(path==='market.ratingMode') convertRatings(value);
      if(path==='appearance.theme'){ setPath(project,path,value); zastosujMotyw(value); changed(); return; }
      setPath(project,path,value); changed({fullDynamic:path.startsWith('market.')||path==='valuation.valuationDate'});
    }); el.dataset.bound='1';
  });
}
function convertRatings(mode){
  const target=['two','three','five'].includes(mode)?mode:'three';
  (project.market.features||[]).forEach(f=>{
    f.scaleMode=target;
    const r=String(f.rating||'Przeciętna'),n=r.toLowerCase();
    if(target==='two') f.rating=(n.includes('korz')&&!n.includes('niekorz'))?'Korzystna':'Niekorzystna';
    else if(target==='five'){
      if(['Niekorzystna','Przeciętna','Korzystna'].includes(r)) f.rating=r;
      else if(n.includes('bardzo nie')) f.rating='Bardzo niekorzystna';
      else if(n.includes('bardzo korz')) f.rating='Bardzo korzystna';
      else f.rating='Przeciętna';
    } else {
      if(n.includes('niekorz')) f.rating='Niekorzystna';
      else if(n.includes('korz')) f.rating='Korzystna';
      else f.rating='Przeciętna';
    }
  });
  (project.market.transactions||[]).forEach(t=>{t.featureRatings=t.featureRatings||{};(project.market.features||[]).forEach(f=>{const r=String(t.featureRatings[f.id]||'');if(!r)return;const n=r.toLowerCase(),mode=f.scaleMode||target;if(mode==='two')t.featureRatings[f.id]=(n.includes('korz')&&!n.includes('niekorz'))?'Korzystna':'Niekorzystna';else if(mode==='five'){if(['Niekorzystna','Przeciętna','Korzystna'].includes(r))return;t.featureRatings[f.id]=n.includes('bardzo nie')?'Bardzo niekorzystna':n.includes('bardzo korz')?'Bardzo korzystna':'Przeciętna';}else t.featureRatings[f.id]=n.includes('niekorz')?'Niekorzystna':n.includes('korz')?'Korzystna':'Przeciętna';});});
}
function convertFeatureScale(f,mode){
  const target=['two','three','five'].includes(mode)?mode:'three';f.scaleMode=target;const n=String(f.rating||'').toLowerCase();
  if(target==='two')f.rating=(n.includes('korz')&&!n.includes('niekorz'))?'Korzystna':'Niekorzystna';
  else if(target==='three')f.rating=n.includes('niekorz')?'Niekorzystna':n.includes('korz')?'Korzystna':'Przeciętna';
  else if(!['Bardzo niekorzystna','Niekorzystna','Przeciętna','Korzystna','Bardzo korzystna'].includes(f.rating))f.rating='Przeciętna';
  (project.market.transactions||[]).forEach(t=>{t.featureRatings=t.featureRatings||{};const r=String(t.featureRatings[f.id]||'');if(!r)return;const x=r.toLowerCase();if(target==='two')t.featureRatings[f.id]=(x.includes('korz')&&!x.includes('niekorz'))?'Korzystna':'Niekorzystna';else if(target==='three')t.featureRatings[f.id]=x.includes('niekorz')?'Niekorzystna':x.includes('korz')?'Korzystna':'Przeciętna';});
}
async function forceAutosave({silent=false}={}){
  if(!isAuthenticated) return {ok:false,skipped:true};
  clearTimeout(autosaveTimer);
  try{
    calc=obliczProjekt(); project.meta.lastValueRounded=calc.valueRounded; project.meta.lastUnitValue=calc.unitAfterRound;
    const r=await window.operatAPI.autosave(project);
    autosaveDirty=false;
    const t=new Date(r?.savedAt||Date.now()).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    setSaveStateUI(`Autozapis do Historii · ${t}`,'saved');
    return {ok:true};
  }catch(e){
    setSaveStateUI('Błąd autozapisu','error');
    if(!silent)showStatus(`Autozapis: ${cleanRemoteError(e)}`,'error',7000);
    return {ok:false,error:e};
  }
}
function changed({fullDynamic=false}={}){
  project.meta.updatedAt=new Date().toISOString(); calc=obliczProjekt(); invalidateValidationCache();
  updateKPIs();updateHeader();updateCompleteness();updateCosting();renderMapsQRPreview();renderFinalIssues();
  if(fullDynamic){renderTransactions();renderTrendPairs();renderFeatures();renderPairComparisons();applyHelpTooltips();}
  renderThemePreview();renderWorkflowUI();renderDashboard();refreshContextCoach();kontrolaOdswiezPozniej();
  if($('#tab-result')?.classList.contains('active')) scheduleReportPreview();
  clearTimeout(autosaveTimer);
  if(isAuthenticated){autosaveDirty=true;setSaveStateUI('Zmiany · zapisuję do Historii…','saving');autosaveTimer=setTimeout(()=>forceAutosave({silent:true}),800);}
}
function updateHeader(){const p=project.property||{},mi=moduleInfo();$('#projectHeader').textContent=[mi.title,p.city,p.street?`ul. ${p.street} ${p.buildingNo||''}`:'',(!isPairModule()&&p.localNo)?`lok. ${p.localNo}`:''].filter(Boolean).join(' · ')||'Operat szacunkowy';}
function renderModuleUI(){
  const mi=moduleInfo(),pair=isPairModule();
  // Plakietka rodzaju operatu usunieta w 1.8.1 — ta sama informacja jest w naglowku projektu i na karcie „Operat na zywo”.
  if($('#currentModuleTitle'))$('#currentModuleTitle').textContent=mi.title;
  if($('#currentModuleDescription'))$('#currentModuleDescription').textContent=`Podejście porównawcze · metoda ${mi.method.toLowerCase()}.`;
  $$('.developed-only').forEach(x=>x.classList.toggle('hidden',!pair));
  ['#localNoField','#staircaseField','#balconyField','#basementNameField','#basementAreaField'].forEach(s=>$(s)?.classList.toggle('hidden',pair));
  if($('#usableAreaLabel'))$('#usableAreaLabel').textContent=pair?'Powierzchnia użytkowa budynku [m²]':'Powierzchnia użytkowa lokalu [m²]';
  $('#pairComparisonCard')?.classList.toggle('hidden',!pair);
  if($('#kpiUiLabel'))$('#kpiUiLabel').textContent=pair?'Liczba porównań':'Σ Ui';
  if($('#resultMethod'))$('#resultMethod').textContent=mi.method.toLowerCase();
  if($('#resultLogic'))$('#resultLogic').innerHTML=pair?'<li>Wyznaczenie / przyjęcie trendu czasowego.</li><li>Aktualizacja cen transakcyjnych na datę wyceny.</li><li>Wybór co najmniej 3 nieruchomości podobnych do bezpośrednich porównań.</li><li>Porównanie ocen każdej cechy w tej samej skali.</li><li>Obliczenie jawnych korekt cech i skorygowanych cen porównawczych.</li><li>WN = powierzchnia × średnia skorygowanych cen z porównań.</li>':'<li>Wyznaczenie / przyjęcie trendu czasowego.</li><li>Aktualizacja cen transakcyjnych na datę wyceny.</li><li>Wyznaczenie Cmin, Cśred, Cmax i ΔC.</li><li>Ustalenie cech rynkowych, wag i zakresów Ui.</li><li>Ocena nieruchomości i obliczenie ΣUi.</li><li>WN = Pu × Cśred × ΣUi.</li>';
  const localTitle=$('#tab-local .section-title h2');if(localTitle)localTitle.textContent=pair?'Wnętrza, funkcjonalność i standard zabudowy':'Lokal';
  $$('.local-legal-only').forEach(el=>el.classList.toggle('hidden',pair));
  $('#commonPropertyCard')?.classList.toggle('hidden',pair); $('#cooperativeLegalHint')?.classList.toggle('hidden',pair);
  const kwLabel=$('#kwMainLabel');if(kwLabel&&kwLabel.firstChild)kwLabel.firstChild.nodeValue=pair?'Numer KW nieruchomości':'Numer KW lokalu';
  const projectTask=$('[data-per-target="methodicalBasis"]');if(projectTask)projectTask.dataset.perTask=pair?'Zredaguj podstawę metodyczną dla nieruchomości gruntowej zabudowanej wycenianej w podejściu porównawczym metodą porównywania parami. Nie dopisuj niepotwierdzonych standardów ani aktów prawnych.':'Zredaguj podstawę metodyczną dla lokalu mieszkalnego wycenianego w podejściu porównawczym metodą korygowania ceny średniej. Nie dopisuj niepotwierdzonych standardów ani aktów prawnych.';
}
let moduleSelectorTryb='nowy';
function renderModuleTiles(){
  const root=$('#moduleTiles');if(!root)return;
  const zmiana=moduleSelectorTryb==='zmiana', obecny=moduleCode();
  root.innerHTML=Object.values(OPERAT_MODULES).map(m=>{
    const tenSam=zmiana&&m.code===obecny, wylaczony=m.status==='planned'||tenSam;
    const znaczek=tenSam?'Obecny rodzaj':m.status==='live'?'Dostępny':'Wkrótce';
    return `<button class="module-tile ${m.status==='planned'?'planned':''}${tenSam?' obecny':''}" data-module="${m.code}" ${wylaczony?'disabled':''}><span class="module-status ${m.status==='live'?'live':''}">${znaczek}</span><span class="module-icon">${m.icon}</span><b>${escapeHTML(m.title)}</b><small>${escapeHTML(m.method)}<br>${escapeHTML(m.description)}</small></button>`;
  }).join('');
  $$('[data-module]',root).forEach(b=>b.addEventListener('click',()=>{
    if(moduleSelectorTryb==='zmiana') zmienRodzajOperatu(b.dataset.module); else createProjectFromModule(b.dataset.module);
  }));
}
/** Okno wyboru rodzaju ma dwa zadania i musi mowic, ktore wlasnie wykonuje:
 *  „nowy" zaklada operat od zera, „zmiana" przestawia rodzaj BIEZACEGO operatu
 *  i zachowuje wspolne dane. Wczesniej przycisk „Zmien rodzaj operatu"
 *  po cichu zakladal nowy, pusty operat. */
function openModuleSelector(tryb){
  moduleSelectorTryb=tryb==='zmiana'?'zmiana':'nowy';
  const zmiana=moduleSelectorTryb==='zmiana', okno=$('#moduleSelectorOverlay');
  const glowa=okno?.querySelector('.modal-head');
  if(glowa){
    const e=glowa.querySelector('.eyebrow'),h=glowa.querySelector('h2'),p=glowa.querySelector('p');
    if(e)e.textContent=zmiana?'ZMIANA RODZAJU OPERATU':'NOWY OPERAT';
    if(h)h.textContent=zmiana?'Wybierz nowy rodzaj dla tego operatu':'Wybierz rodzaj wyceny';
    if(p)p.textContent=zmiana?'Operat zostaje ten sam — zmienia się metoda i formularze. Wspólne dane przechodzą dalej.':'OPERO korzysta ze wspólnego rdzenia danych, a metoda i formularze dopasowują się do rodzaju wyceny.';
  }
  const info=$('#moduleZmianaInfo');
  if(info){
    if(zmiana&&window.OperoWzorce){
      const plan=window.OperoWzorce.zmianaPlan(project);
      info.innerHTML=`<div><b>Zostaje</b><ul>${plan.zostaje.map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul></div>`
        +`<div class="przepada"><b>Nie przechodzi</b><ul>${plan.przepada.map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul></div>`
        +`<p>Obecna wersja operatu zostanie przed zmianą zapisana w Historii — można do niej wrócić.</p>`;
      info.classList.remove('hidden');
    } else info.classList.add('hidden');
  }
  renderModuleTiles();
  szablonyRysuj();
  okno?.classList.remove('hidden');
}
function closeModuleSelector(){$('#moduleSelectorOverlay')?.classList.add('hidden');}
async function createProjectFromModule(code,szablon){const mi=OPERAT_MODULES[code];if(!mi||mi.status!=='live'){showStatus('Ten moduł jest już przewidziany w architekturze OPERO, ale jego silnik obliczeniowy będzie dodany w kolejnej wersji.','info',7000);return;}const tile=document.querySelector(`[data-module="${code}"]`);tile?.classList.add('launching');if(uiPrefs.motion==='full')await new Promise(r=>setTimeout(r,170));if(autosaveDirty)await forceAutosave({silent:true});visitedSteps=new Set();let nowy=freshProject(code);ukladDomyslnyWstaw(nowy);let zSzablonu='';if(szablon&&window.OperoWzorce){try{window.OperoWzorce.szablonZastosuj(nowy,szablon,{noweId:newId});zSzablonu=szablon.nazwa;}catch(e){showStatus(String(e.message||e),'error',7000);}}project=normalizeLoadedProject(nowy);wstawProfilDoNowego();renderAll();changed();closeModuleSelector();wizardIndex=0;switchTab('project');setTimeout(()=>$('#szybkiKarta')?.scrollIntoView({block:'start'}),60);showStatus(zSzablonu?`Utworzono nowy operat z szablonu „${zSzablonu}": ${mi.title}.`:`Utworzono nowy operat: ${mi.title} · ${mi.method}.`,'info',6000);}

/** Zmiana rodzaju biezacego operatu z zachowaniem wspolnych danych. */
async function zmienRodzajOperatu(code){
  const mi=OPERAT_MODULES[code], W=window.OperoWzorce;
  if(!mi||mi.status!=='live'||!W) return;
  if(code===moduleCode()){ showStatus('Operat ma już ten rodzaj.','info',4000); return; }
  const plan=W.zmianaPlan(project);
  if(!confirm(`Zmienić rodzaj operatu na: ${mi.title}?\n\nZOSTAJE:\n• ${plan.zostaje.join('\n• ')}\n\nNIE PRZECHODZI:\n• ${plan.przepada.join('\n• ')}\n\nObecna wersja zostanie zapisana w Historii.`)) return;
  try{
    // Najpierw kopia tego, co jest - zmiana rodzaju kasuje transakcje i cechy,
    // wiec musi istniec droga powrotu.
    try{ await saveCurrentToHistory(); }catch(e){ console.warn('Kopia przed zmianą rodzaju:',e); }
    const nowy=W.zmienRodzaj(project,freshProject(code));
    visitedSteps=new Set();
    project=normalizeLoadedProject(nowy);
    renderAll(); changed(); closeModuleSelector(); switchTab('project');
    showStatus(`Rodzaj operatu zmieniony na: ${mi.title}. Adres, klient, księga, zdjęcia i daty zostały. Transakcje i cechy rynkowe trzeba dobrać od nowa.`,'info',11000);
  }catch(e){ console.error(e); showStatus(`Nie udało się zmienić rodzaju: ${cleanRemoteError(e)}`,'error',9000); }
}

function renderPairComparisons(){
  const root=$('#pairComparisonTable'),summary=$('#pairComparisonSummary');if(!root||!summary)return;
  if(!isPairModule()){root.innerHTML='';summary.innerHTML='';return;}
  const rows=calc.pairComparisons||[];
  summary.innerHTML=`<div><span>Wybrane porównania</span><b>${rows.length}</b></div><div><span>Średnia po korektach</span><b>${fmt(calc.pairUnitRaw||0,2)} zł/m²</b></div><div><span>Rozpiętość ΔC</span><b>${fmt(calc.deltaC||0,2)} zł/m²</b></div><div><span>Wartość</span><b>${money(calc.valueRounded||0,0)}</b></div>`;
  if(!rows.length){root.innerHTML='<p class="hint">W tabeli transakcji zaznacz nieruchomości „Do porównania”. Potrzebne są minimum 3 kompletne pozycje.</p>';return;}
  const features=project.market.features||[];
  const html=rows.map(r=>`<tr><td>${r.id}</td><td>${escapeHTML(r.address||'')}</td><td>${fmt(r.correctedPrice,2)}</td><td class="pair-detail">${r.featureCorrections.map(c=>`<div><b>${escapeHTML(c.name)}</b>: ${escapeHTML(c.comparableRating||'—')} → ${escapeHTML(c.subjectRating||'—')} = ${c.correction>=0?'+':''}${fmt(c.correction,2)}</div>`).join('')}</td><td>${r.totalCorrection>=0?'+':''}${fmt(r.totalCorrection,2)}</td><td><b>${fmt(r.adjustedPrice,2)}</b></td></tr>`).join('');
  root.innerHTML=`<table class="edit-table"><thead><tr><th>Nr</th><th>Nieruchomość podobna</th><th>Cena po trendzie [zł/m²]</th><th>Korekty cech [zł/m²]</th><th>Σ korekt</th><th>Cena po porównaniu [zł/m²]</th></tr></thead><tbody>${html}</tbody></table>`;
}

// Generator dokumentu zalezny od rodzaju wyceny. `report.bundle.js` jest zamrozony,
// wiec operat dochodowy sklada osobny plik, pozyczajac z niego wylacznie styl (buildCSS).
/* 3.4: okładka. Generator raportu bierze zdjęcie z kategorii „Okładka", a gdy jej
   nie ma — PIERWSZE zdjęcie (bywał nim zrzut księgi). Do wydruku podajemy kopię
   projektu, w której pierwsze jest zdjęcie wybrane na okładkę (elewacja domu). */
function okladkaZdjecie(p){
  const ph=(p&&p.photos)||[];
  const dok=x=>['kw','dokument','rzut','mapa','legenda'].includes(x.rodzajDokumentu)||['Dokumenty','Załącznik'].includes(x.category);
  return ph.find(x=>x.category==='Okładka')||ph.find(x=>x.cover&&!dok(x))||ph.find(x=>x.category==='Budynek'&&!dok(x))||ph.find(x=>!dok(x))||null;
}
function projektDoWydruku(){
  const c=okladkaZdjecie(project); const ph=project.photos||[];
  if(!c||ph[0]===c||ph.some(x=>x.category==='Okładka')) return project;
  return {...project,photos:[c,...ph.filter(x=>x!==c)]};
}
function zbudujRaportSurowy(){
  const p=projektDoWydruku();
  if(jestModulOgolny()&&window.OperoModulyRaport) return window.OperoModulyRaport.buildHTML(p,moduleCode());
  if(moduleCode()==='income'&&window.OperoIncomeReport) return window.OperoIncomeReport.buildHTML(p,calc);
  return getReport().buildHTML(p,calc);
}
// Operat przygotowany przez agentow ma na wydruku znak wodny az do zatwierdzenia
// (studio.js). Sam generator raportu pozostaje nietkniety.
function zbudujRaport(){const html=zbudujRaportSurowy();return typeof studioZnakWodny==='function'?studioZnakWodny(html):html;}
function obliczProjekt(){
  if(jestModulOgolny()&&window.OperoModuly){
    const baza0=getCalc().calculate(project);
    const w0=window.OperoModuly.oblicz(moduleCode(),project)||{};
    return {...baza0,...w0,valueRounded:w0.marketValue||0,unitAfterRound:w0.pricePerM2||0,
            cmin:0,cavg:0,cmax:0,sumUi:0,trendApplied:0,weightSum:1,ogolny:true};
  }
  if(moduleCode()!=='income'||!window.OperoIncome) return getCalc().calculate(project);
  // Baze bierzemy z zamrozonego silnika, zeby wynik mial wszystkie pola, ktorych
  // szuka interfejs (features, transactions, statystyki) — a dopiero na wierzch
  // kladziemy wynik dochodowy. Inaczej renderery porownawcze wywracaja sie na
  // brakujacej tablicy zamiast po prostu nic nie pokazac.
  const baza=getCalc().calculate(project);
  const w=window.OperoIncome.oblicz(project);
  return {
    ...baza, ...w,
    valueRounded:w.marketValue||0, unitAfterRound:w.pricePerM2||0,
    cmin:0, cavg:0, cmax:0, sumUi:0, trendApplied:0, weightSum:1,
    pairComparisonCount:(project.income&&project.income.leases||[]).length,
    dochodowy:true,
  };
}
function updateKPIs(){calc=obliczProjekt();const set=(id,v)=>{const e=$(id);if(e)e.textContent=v;};const prev=lastMetricValue;lastMetricValue=Number(calc.valueRounded||0);set('#kpiValue',money(calc.valueRounded,0));set('#kpiUnit',`${fmt(calc.unitAfterRound,2)} zł/m²`);set('#kpiMin',`${fmt(calc.cmin,2)} zł/m²`);set('#kpiAvg',`${fmt(calc.cavg,2)} zł/m²`);set('#kpiMax',`${fmt(calc.cmax,2)} zł/m²`);set('#kpiUi',isPairModule()?`${calc.pairComparisonCount||0} nieruch.`:fmt(calc.sumUi,4));set('#kpiTrend',`${fmt(calc.trendApplied,4)}%`);set('#kpiWeights',fmt(calc.weightSum,4));const kw=$('#kpiWeights');if(kw)kw.style.color=Math.abs(calc.weightSum-1)<.001?'var(--ok)':'var(--danger)';set('#resultArea',`${fmt(project.property?.usableArea||0,2)} m²`);set('#resultStatus',project.meta?.status||'Roboczy');const issues=allCriticalIssues();set('#resultReady',issues.length?`Nie — ${issues.length} braków`:'Tak');const rr=$('#resultReady');if(rr)rr.style.color=issues.length?'var(--danger)':'var(--ok)';if(prev!==null&&prev!==lastMetricValue&&$('#tab-result')?.classList.contains('active')){const el=$('#kpiValue');el?.classList.remove('metric-pop');if(el){void el.offsetWidth;el.classList.add('metric-pop');}}}
function completenessScore(paths){const got=paths.filter(x=>{const v=getPath(project,x);return isFilled(v)&&(!(typeof v==='number')||v>0);}).length;return paths.length?Math.round(got/paths.length*100):100;}
function completenessGroups(){
  const cooperative=stripDiacritics(project.property?.rightType||'').includes('spoldzielcze');
  const legalPaths=cooperative&&!isFilled(project.legal?.kwLocal)?['legal.ownerNames','legal.ownershipType','legal.currentEntryBasis','legal.kwNotes']:['legal.kwLocal','legal.ownerNames','legal.ownershipType','legal.sectionIII','legal.sectionIV'];
  return [[isPairModule()?'Dane nieruchomości':'Dane lokalu',isPairModule()?['property.city','property.street','property.buildingNo','property.usableArea','property.landArea','valuation.purpose']:['property.city','property.street','property.buildingNo','property.localNo','property.usableArea','valuation.purpose']],['Stan prawny',legalPaths],['EGiB / plan',['egib.plotNo','egib.district','planning.description','location.description']],['Opis techniczny',isPairModule()?['building.description','property.plotDescription','local.layout','local.description']:['building.description','local.layout','local.description']],['Rynek',['market.segmentDescription','market.marketDescription']],['Finalizacja',['clauses']]];
}
function overallCompleteness(){const groups=completenessGroups();const vals=groups.map(([,paths])=>completenessScore(paths));let base=vals.reduce((a,b)=>a+b,0)/(vals.length||1);const tx=(project.market.transactions||[]).filter(t=>Number(t.priceUnit)>0&&isFilled(t.address)&&isFilled(t.date)&&Number(t.area)>0).length;const txNeed=isPairModule()?3:12;base=(base*5+Math.min(100,Math.round(tx/txNeed*100)))/6;return Math.max(0,Math.min(100,Math.round(base)));}
function updateCompleteness(){const groups=completenessGroups();const root=$('#completeness');if(root)root.innerHTML=groups.map(([name,paths])=>{const sc=completenessScore(paths);return `<div class="completeness-row"><span>${name}</span><div class="meter"><i style="width:${sc}%"></i></div><b class="${sc>=80?'ok-text':'warn-text'}">${sc}%</b></div>`}).join('');const total=overallCompleteness();if($('#dashboardCompletenessBadge'))$('#dashboardCompletenessBadge').textContent=`${total}%`;}

const GUIDE_PATHS={
  project:['property.city','property.street','property.buildingNo','property.localNo','property.usableArea','property.landArea','valuation.purpose','formalBasis','methodicalBasis','valuation.approachDescription'],
  legal:['legal.ownerNames','legal.ownershipType','valuation.legalStateDate','legal.kwLocal','legal.sectionIII','legal.sectionIV','legal.kwNotes'],
  egib:['egib.district','egib.plotNo','planning.description','location.description'],
  building:['building.type','building.year','building.condition','building.description'],
  local:['local.layout','local.description','property.plotDescription'],
  market:['market.segmentDescription','market.marketDescription'],
  clauses:['clauses']
};
function dynamicStepName(step){if(!step)return'';return isPairModule()?(step.tab==='project'?'Dane nieruchomości i podstawy':step.tab==='local'?'Grunt, funkcjonalność i standard':step.name):step.name;}
function guideHelpForPath(path){
  if(isPairModule()){
    const pairHelp={
      'property.city':'Miejscowość położenia wycenianej nieruchomości, zgodna z dokumentami stanu prawnego i ewidencyjnego.',
      'property.street':'Nazwa ulicy lub lokalizacji nieruchomości; porównaj zapis z księgą wieczystą i EGiB.',
      'property.buildingNo':'Numer budynku znajdującego się na wycenianej nieruchomości.',
      'property.usableArea':'Powierzchnia użytkowa budynku przyjęta do obliczeń. Zweryfikuj źródło i zakres powierzchni.',
      'property.landArea':'Powierzchnia działki lub działek objętych wyceną, zgodna z dokumentacją ewidencyjną.',
      'property.rightType':'Prawo będące przedmiotem wyceny nieruchomości gruntowej zabudowanej.'
    };
    if(pairHelp[path])return pairHelp[path];
  }
  return HELP_MAP?.[path]||'Uzupełnij tę informację, aby OPERO mogło bezpiecznie prowadzić Cię dalej.';
}
function guideFieldLabel(el,path){
  const lab=el?.closest('label');if(!lab)return String(path||'Pole');const clone=lab.cloneNode(true);clone.querySelectorAll?.('.help-dot,.field-help-dot,.hint,.muted-inline,small').forEach(x=>x.remove());const text=(clone.textContent||'').replace(/\s+/g,' ').replace(/\s*[?？]+\s*$/,'').trim();return text||String(path||'Pole');
}
function guideTargetForStep(tab){
  if(tab==='market'){
    const complete=(project.market.transactions||[]).filter(t=>Number(t.priceUnit)>0&&isFilled(t.address)&&isFilled(t.date)&&Number(t.area)>0&&(!isPairModule()||t.useForPair!==false));
    if(complete.length<(isPairModule()?3:12))return {el:$('#addTransaction'),title:'Rozbuduj zbiór porównawczy',text:`Masz ${complete.length} kompletnych pozycji. Potrzebujesz ${isPairModule()?'minimum 3':'minimum 12'} do bieżącej metody.`};
  }
  if(tab==='features'){
    if(Math.abs(Number(calc.weightSum||0)-1)>.001)return {el:$('#featuresEditor'),title:'Ustal cechy i wagi',text:'Suma wag powinna wynosić 1,00, a każda cecha musi mieć zdefiniowaną skalę i ocenę.'};
    return {el:$('#featureRatingMatrix'),title:'Sprawdź macierz ocen',text:'Zweryfikuj oceny nieruchomości porównawczych według tych samych skal.'};
  }
  if(tab==='photos'&&!(project.photos||[]).length)return {el:$('#addPhotos'),title:'Dodaj dokumentację fotograficzną',text:'Fotografie nie są obowiązkowe dla rachunku, ale wspierają dokumentację stanu nieruchomości.'};
  if(tab==='costing')return {el:$('[data-path="costing.hours"]'),title:'Koszt wykonania jest opcjonalny',text:'Możesz policzyć ekonomię zlecenia albo przejść dalej bez tej sekcji.'};
  if(tab==='clauses'){
    if(!(project.legalBases||[]).length)return {el:$('#legalBasesList'),title:'Sprawdź podstawy prawne',text:'Uzupełnij i zweryfikuj akty prawne właściwe dla tego konkretnego operatu.'};
    if(!(project.sources||[]).length)return {el:$('#sourcesList'),title:'Dodaj źródła danych',text:'Wskaż dokumenty i zbiory danych wykorzystane w wycenie.'};
  }
  const paths=(GUIDE_PATHS[tab]||[]).filter(path=>!(isPairModule()&&['property.localNo'].includes(path))&&(!(!isPairModule()&&path==='property.landArea')));
  for(const path of paths){const v=getPath(project,path);if(!isFilled(v)||(typeof v==='number'&&v<=0)){const el=document.querySelector(`[data-path="${path}"]`);if(el){const title=guideFieldLabel(el,path).slice(0,80);return {el,title,text:guideHelpForPath(path)};}}}
  return {el:null,title:'Etap wygląda dobrze',text:'Nie widzę oczywistego braku w najważniejszych polach tego kroku. Możesz zweryfikować dane i przejść dalej.'};
}
/**
 * Prowadzenie do nastepnego pola.
 *
 * `naZadanie` znaczy: czlowiek sam kliknal „Pokaz mi gdzie". Wtedy prowadzimy go
 * ZAWSZE, takze w trybie Ekspert. Wczesniej przycisk w tym trybie milczal — nic
 * sie nie dzialo i wygladalo to na zepsuty program, a nie na swiadome „mniej
 * podpowiedzi". Sama z siebie podpowiedz nadal w Ekspercie nie wyskakuje.
 */
function guideCurrentStep(scroll=true, naZadanie=false){if(uiPrefs.mode==='expert'&&!naZadanie){hideContextCoach();return;}$$('.guided-focus').forEach(x=>x.classList.remove('guided-focus'));const step=WIZARD_STEPS[wizardIndex];if(!step)return;const g=guideTargetForStep(step.tab);
  if(!g?.el){
    // Nie ma czego wskazac: mowimy to wprost zamiast udawac, ze klikniecie nic
    // nie znaczylo.
    if(naZadanie) showStatus('Na tym etapie nie ma juz pola, do ktorego moglbym Cie zaprowadzic.','info',5000);
    hideContextCoach(); return;
  }
  const target=g.el.closest('label')||g.el;target.classList.remove('guided-focus');void target.offsetWidth;target.classList.add('guided-focus');setTimeout(()=>target.classList.remove('guided-focus'),1700);
  if(uiPrefs.mode!=='expert') showContextCoach(g,{scroll});
  else if(scroll) target.scrollIntoView({behavior:uiPrefs.motion==='full'?'smooth':'auto',block:'center',inline:'nearest'});if(scroll)setTimeout(()=>{g.el.focus?.({preventScroll:true});
  // PER staje przy polu, do ktorego wlasnie przeniosl wzrok uzytkownika.
  try{ perPrzyElemencie(target,'To jest następne pole do uzupełnienia.',{mina:'znalazl',czas:5000}); }catch{}
},uiPrefs.motion==='full'?340:30);}
function renderWorkflowUI(){
  const step=WIZARD_STEPS[wizardIndex],total=overallCompleteness(),mi=moduleInfo(),p=project.property||{};
  if($('#railModuleName'))$('#railModuleName').textContent=mi.short||mi.title;if($('#railProgressText'))$('#railProgressText').textContent=`${total}% kompletności`;
  const root=$('#workflowSteps');if(root)root.innerHTML=WIZARD_STEPS.map((st,i)=>{const issues=validateStep(st.tab),optional=['photos','costing'].includes(st.tab),visited=visitedSteps.has(st.tab);const done=visited&&issues.length===0;const cls=i===wizardIndex?'active':done?'done':visited&&issues.length?'warn':'';const status=done?'Gotowe':optional&&!visited?'Opcjonalne':issues.length?`${issues.length} do sprawdzenia`:visited?'Sprawdzone':'Oczekuje';return `<button type="button" class="workflow-step ${cls}" data-workflow-index="${i}"><span class="workflow-step-dot">${done?'✓':String(i+1).padStart(2,'0')}</span><span class="workflow-step-text"><b>${escapeHTML(dynamicStepName(st))}</b><small>${status}</small></span></button>`}).join('');
  $$('[data-workflow-index]',root||document).forEach(b=>b.addEventListener('click',()=>switchTab(WIZARD_STEPS[Number(b.dataset.workflowIndex)].tab)));
  const address=[p.city,p.street?`ul. ${p.street} ${p.buildingNo||''}`:'',(!isPairModule()&&p.localNo)?`lok. ${p.localNo}`:''].filter(Boolean).join(' · ');
  if($('#livePanelType'))$('#livePanelType').textContent=mi.title;if($('#livePanelAddress'))$('#livePanelAddress').textContent=address||'Uzupełnij adres';if($('#liveProgressValue'))$('#liveProgressValue').textContent=`${total}%`;if($('#liveProgressRing'))$('#liveProgressRing').style.setProperty('--p',total);
  const completeTx=(project.market.transactions||[]).filter(t=>Number(t.priceUnit)>0&&isFilled(t.address)&&isFilled(t.date)&&Number(t.area)>0);if($('#liveTransactions'))$('#liveTransactions').textContent=`${completeTx.length} transakcji`;if($('#liveMethod'))$('#liveMethod').textContent=mi.method;if($('#liveValue'))$('#liveValue').textContent=Number(calc.valueRounded||0)>0?money(calc.valueRounded,0):'—';
  const stepIssues=step?validateStep(step.tab):[];if($('#liveStepName'))$('#liveStepName').textContent=step?dynamicStepName(step):'—';if($('#liveStepIssues')){$('#liveStepIssues').textContent=stepIssues.length?`${stepIssues.length} ${stepIssues.length===1?'element wymaga':'elementy wymagają'} uzupełnienia`:'✓ Etap kompletny';$('#liveStepIssues').classList.toggle('ok',!stepIssues.length);}const g=guideTargetForStep(step?.tab);if($('#nextActionTitle'))$('#nextActionTitle').textContent=g?.title||'Sprawdź etap';if($('#nextActionText'))$('#nextActionText').textContent=g?.text||'Zweryfikuj dane przed przejściem dalej.';if($('#showNextFieldBtn'))$('#showNextFieldBtn').disabled=!g?.el;
  applyUIPrefs();renderNotifications();
}
function dashboardAddress(){const p=project.property||{};return [p.city,p.street?`ul. ${p.street} ${p.buildingNo||''}`:'',(!isPairModule()&&p.localNo)?`lok. ${p.localNo}`:''].filter(Boolean).join(' · ')||'Nowy projekt';}
async function openHistoryEntry(id){try{if(autosaveDirty)await forceAutosave({silent:true});const r=await window.operatAPI.openHistory(id);project=normalizeLoadedProject(r.project);renderAll();changed();switchTab('dashboard');showStatus('Otworzono operat z Historii. Dalsze zmiany będą automatycznie aktualizować ten wpis.','info');}catch(e){showStatus(cleanRemoteError(e),'error');}}
function renderDashboard(){
  const total=overallCompleteness(),mi=moduleInfo();if($('#dashboardCurrentType'))$('#dashboardCurrentType').textContent=mi.short||mi.title;if($('#dashboardCurrentAddress'))$('#dashboardCurrentAddress').textContent=dashboardAddress();if($('#dashboardProgressFill'))$('#dashboardProgressFill').style.width=`${total}%`;if($('#dashboardProgressText'))$('#dashboardProgressText').textContent=`${total}% kompletności`;if($('#dashboardCurrentValue'))$('#dashboardCurrentValue').textContent=Number(calc.valueRounded||0)>0?money(calc.valueRounded,0):'—';
  const root=$('#recentProjects');if(!root)return;const list=(historyEntries||[]).slice(0,4);if(!list.length){root.innerHTML='<div class="empty-project-state"><b>Historia jest jeszcze pusta</b><p>Po rozpoczęciu pracy OPERO zapisze bieżący operat automatycznie. Nie musisz pilnować osobnego pliku roboczego.</p><button id="emptyNewProject" class="btn primary small">＋ Utwórz pierwszy operat</button></div>';$('#emptyNewProject')?.addEventListener('click',openModuleSelector);return;}
  root.innerHTML=list.map(x=>`<button class="recent-project-card" type="button" data-recent-id="${escapeHTML(x.id)}"><span class="recent-icon">◆</span><b>${escapeHTML(x.title||'Operat')}</b><small>${escapeHTML(x.status||'Roboczy')} · ${x.updatedAt?new Date(x.updatedAt).toLocaleString('pl-PL'):''}</small><strong>${Number(x.valueRounded||0)>0?money(x.valueRounded,0):'W trakcie'}</strong></button>`).join('');$$('[data-recent-id]',root).forEach(b=>b.addEventListener('click',()=>openHistoryEntry(b.dataset.recentId)));
}
let statusHideTimer=null;
// Stan okna odpowiedzi stoi TU, a nie przy reszcie okna nizej: pisze do niego
// showStatus, a ten jest wyzej w pliku. Deklaracja `let` nizej znaczylaby, ze
// pierwszy komunikat wywolany w trakcie wczytywania strony wywraca program.
let oknoStan = (typeof window !== 'undefined' && window.OperoOkno) ? window.OperoOkno.nowe() : null;

/**
 * Pasek statusu na dole. Gasnie po kilku sekundach - i to jest jego wada,
 * bo rzeczoznawca patrzy w pole, ktore wypelnia, a nie w dol ekranu.
 *
 * Dlatego KAZDY komunikat programu, ktorykolwiek z nich i skadkolwiek,
 * idzie takze do okna odpowiedzi i do paska na gorze. Nie trzeba przerabiac
 * stu miejsc w programie - wystarczy, ze przechodza tedy wszystkie.
 */
let statusWTrakcie = false;
function showStatusPasek(msg,type='info',ms=4500){const el=$('#statusBar');if(!el)return;clearTimeout(statusHideTimer);el.textContent=msg;el.className=`status ${type}`;if(ms)statusHideTimer=setTimeout(()=>el.classList.add('hidden'),ms);}

const STATUS_RODZAJE = { error: 'blad', warn: 'ostrzezenie', success: 'sukces', info: 'info' };

let statusPierwszyPlanDo = 0;
/** Komunikat TLA (kontrola operatu liczaca bledy po kazdej zmianie). Nie wolno
 *  mu zaslonic odpowiedzi na to, o co czlowiek wlasnie poprosil - np. „PER
 *  napisal opis" znikalo po ulamku sekundy pod „Do poprawy doszlo: ...". */
function showStatusTlo(msg,type='info',ms=4500){
  if (Date.now() < statusPierwszyPlanDo) return;
  const do_ = statusPierwszyPlanDo;
  showStatus(msg,type,ms);
  statusPierwszyPlanDo = do_;
}
function showStatus(msg,type='info',ms=4500){
  statusPierwszyPlanDo = Date.now() + Math.min(9000, Math.max(3500, ms || 9000));
  showStatusPasek(msg,type,ms);
  // Straznik: mowi() samo wola showStatus, wiec bez tego kazdy komunikat
  // trafialby do okna dwa razy.
  if (statusWTrakcie || !window.OperoOkno || !oknoStan) return;
  const tekst = String(msg ?? '').trim();
  if (!tekst) return;
  statusWTrakcie = true;
  try {
    window.OperoOkno.dodaj(oknoStan, {
      rodzaj: STATUS_RODZAJE[type] || 'info',
      grupa: oknoGrupaZakladki(),
      tekst,
      // Komunikat z paska statusu jest tlem: czesto jest to kontrola operatu
      // albo autozapis, a nie odpowiedz na to, o co czlowiek poprosil.
      tlo: true,
    });
    oknoRysuj();
  } finally { statusWTrakcie = false; }
}

/** Nazwa zadania dla komunikatu, ktory sam jej nie podal: biezaca rubryka. */
const OKNO_ZAKLADKI = {
  dashboard: 'Start', project: 'Dane operatu', legal: 'Stan prawny', egib: 'EGiB i plan',
  building: 'Budynek', local: 'Lokal', market: 'Rynek i transakcje', features: 'Cechy rynkowe',
  income: 'Dochód i najem', modul: 'Dane wyceny', photos: 'Zdjęcia i pliki', costing: 'Koszt operatu',
  clauses: 'Podstawy i finalizacja', result: 'Wynik', express: 'Express', baza: 'Baza rynku',
  kw: 'Księgi wieczyste', clients: 'Klienci', history: 'Historia', settings: 'Ustawienia',
};
function oknoGrupaZakladki(){
  const aktywna = document.querySelector('.nav-btn.active')?.dataset.tab || '';
  return OKNO_ZAKLADKI[aktywna] || 'Program';
}
function showValidationBubble(messages){const el=$('#wizardBubble');if(!messages.length){el.classList.add('hidden');return;}hideContextCoach();el.innerHTML=`<b>Jeszcze ${messages.length} ${messages.length===1?'rzecz':'rzeczy'} do uzupełnienia</b><span>OPERO nie przejdzie dalej, dopóki pola wymagane w tym etapie nie będą kompletne.</span><ul>${messages.slice(0,5).map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul>${messages.length>5?`<small>+ ${messages.length-5} kolejnych</small>`:''}<button id="validationGuideBtn" class="validation-guide-btn" type="button">✦ Pokaż pierwszy brak →</button>`;el.classList.remove('hidden');$('#validationGuideBtn',el)?.addEventListener('click',()=>{el.classList.add('hidden');guideCurrentStep(true);});setTimeout(()=>el.classList.add('hidden'),12000);}

// Kroki kreatora zaleza od rodzaju wyceny. Podejscie dochodowe nie ma cech
// rynkowych ani tabeli transakcji — ma rejestr najmu, dowody czynszu i stopy.
function stepsForModule(code){
  if(['cost','expropriation','fees','easement','agri_forest'].includes(code)) return [
    {tab:'project',name:'Dane nieruchomości i podstawy'},{tab:'legal',name:'Stan prawny / EKW'},
    {tab:'egib',name:'EGiB, MPZP i lokalizacja'},{tab:'modul',name:'Dane wyceny'},
    {tab:'photos',name:'Zdjęcia i pliki'},{tab:'costing',name:'Koszt operatu'},
    {tab:'clauses',name:'Podstawy i finalizacja'}
  ];
  if(code==='income') return [
    {tab:'project',name:'Dane nieruchomości i podstawy'},{tab:'legal',name:'Stan prawny / EKW'},
    {tab:'egib',name:'EGiB, MPZP i lokalizacja'},{tab:'building',name:'Budynek'},
    {tab:'income',name:'Dochód, najem i stopa'},{tab:'photos',name:'Zdjęcia i pliki'},
    {tab:'costing',name:'Koszt operatu'},{tab:'clauses',name:'Podstawy i finalizacja'}
  ];
  return [
    {tab:'project',name:'Dane lokalu i podstawy'},{tab:'legal',name:'Stan prawny / EKW'},{tab:'egib',name:'EGiB, MPZP i lokalizacja'},{tab:'building',name:'Budynek'},{tab:'local',name:'Lokal'},{tab:'market',name:'Rynek i transakcje'},{tab:'features',name:'Cechy, skale i wagi'},{tab:'photos',name:'Zdjęcia i pliki'},{tab:'costing',name:'Koszt operatu'},{tab:'clauses',name:'Podstawy i finalizacja'}
  ];
}
let WIZARD_STEPS=stepsForModule('local_kcm');
function refreshWizardSteps(){
  const nowe=stepsForModule(moduleCode());
  if(JSON.stringify(nowe)!==JSON.stringify(WIZARD_STEPS)){ WIZARD_STEPS=nowe; if(wizardIndex>=WIZARD_STEPS.length) wizardIndex=WIZARD_STEPS.length-1; }
}
function isIncomeModule(){return moduleCode()==='income';}
let wizardIndex=0;let visitedSteps=new Set();
function requirement(path,label,test){const v=getPath(project,path);return (test?test(v):isFilled(v))?null:label;}
// Walidacja etapu bywa wywolywana kilkadziesiat razy przy jednym nacisnieciu klawisza
// (updateKPIs -> allCriticalIssues, renderWorkflowUI, renderNotifications, renderWizard,
// renderFinalIssues). Kazde wywolanie przechodzi po wszystkich transakcjach i cechach,
// wiec przy kilkunastu transakcjach interfejs zaczynal zauwazalnie zwalniac.
// Wynik jest wazny do najblizszej zmiany danych — changed() unieważnia pamiec podreczna.
let validationGeneration=0,validationCache=new Map();
function invalidateValidationCache(){validationGeneration++;validationCache=new Map();}
function validateStep(tab){
  const key=`${validationGeneration}|${tab}`;
  const hit=validationCache.get(key);
  if(hit)return hit;
  const out=computeStepIssues(tab);
  validationCache.set(key,out);
  return out;
}
function computeStepIssues(tab){
  const issues=[]; const add=x=>x&&issues.push(x);
  // Braki modulu dochodowego liczy calc-income.js na podstawie wymagan danych z Biblii OPERO.
  if(tab==='income') return window.OperoIncome?window.OperoIncome.braki(project):[];
  if(tab==='modul') return window.OperoModuly?window.OperoModuly.braki(moduleCode(),project):[];
  if(tab==='project'){
    [['property.city','miasto'],['property.street','ulica'],['property.buildingNo','numer budynku'],...(isPairModule()?[]:[['property.localNo','numer lokalu']]),['valuation.purpose','cel wyceny'],['valuation.valuationDate','data wyceny'],['valuation.inspectionDate','data oględzin'],['formalBasis','podstawa formalna'],['methodicalBasis','podstawa metodyczna'],['valuation.approachDescription','uzasadnienie wyboru podejścia / metody']].forEach(([p,l])=>add(requirement(p,l)));
    add(requirement('property.usableArea',isPairModule()?'powierzchnia użytkowa budynku większa od 0':'powierzchnia użytkowa większa od 0',v=>Number(v)>0));if(isPairModule())add(requirement('property.landArea','powierzchnia działki większa od 0',v=>Number(v)>0));
  }
  if(tab==='legal'){
    const rt=stripDiacritics(project.property?.rightType||'');
    const cooperative=rt.includes('spoldzielcze');
    const hasKw=isFilled(project.legal?.kwLocal);
    [['legal.ownerNames','właściciel / uprawniony'],['legal.ownershipType','sposób przysługiwania prawa / rodzaj wspólności'],['valuation.legalStateDate','data badania stanu prawnego']].forEach(([p,l])=>add(requirement(p,l)));
    if(!cooperative || hasKw) add(requirement('legal.kwLocal','numer księgi wieczystej'));
    if(hasKw){
      add(requirement('legal.sectionIII','treść lub jednoznaczna informacja o Dziale III'));
      add(requirement('legal.sectionIV','treść lub jednoznaczna informacja o Dziale IV'));
    } else if(cooperative){
      add(requirement('legal.currentEntryBasis','dokument / podstawa potwierdzająca spółdzielcze własnościowe prawo'));
      add(requirement('legal.kwNotes','opis sposobu ustalenia stanu prawnego przy braku księgi wieczystej'));
    }
    if(!isPairModule() && !cooperative && /odrebnej wlasnosci|wlasnosc/i.test(rt)) add(requirement('legal.commonShare','udział w nieruchomości wspólnej z Działu I-Sp'));
    const kwa=Number(project.property?.kwArea||0),ua=Number(project.property?.usableArea||0),ba=Number(project.property?.basementArea||0);
    if(!isPairModule()&&kwa>0&&ua>0&&Math.abs(kwa-ua-ba)>0.02&&!isFilled(project.legal?.kwNotes))issues.push(`rozbieżność powierzchni: KW ${fmt(kwa,2)} m² ≠ lokal ${fmt(ua,2)} m² + pomieszczenie przynależne ${fmt(ba,2)} m² — wyjaśnij ją w uwagach do stanu prawnego`);
  }
  if(tab==='egib') [['egib.district','obręb ewidencyjny'],['egib.plotNo','numer działki'],['planning.description','opis uwarunkowań planistycznych (również informacja o braku planu)'],['location.description','opis lokalizacji i otoczenia']].forEach(([p,l])=>add(requirement(p,l)));
  if(tab==='building') [['building.type','rodzaj zabudowy'],['building.year','rok budowy albo informacja „brak danych”'],['building.condition','stan techniczny budynku'],['building.description','opis budynku']].forEach(([p,l])=>add(requirement(p,l)));
  if(tab==='local') (isPairModule()?[['local.layout','opis funkcjonalności i układu budynku'],['local.description','opis standardu wnętrz / wykończenia'],['property.plotDescription','opis kształtu, dostępu i uzbrojenia działki']]:[['local.layout','opis układu pomieszczeń'],['local.description','opis standardu i stanu technicznego']]).forEach(([p,l])=>add(requirement(p,l)));
  if(tab==='market'){
    [['market.segmentDescription','zakres / segment rynku'],['market.marketDescription','charakterystyka rynku lokalnego']].forEach(([p,l])=>add(requirement(p,l)));
    const complete=(project.market.transactions||[]).filter(t=>Number(t.priceUnit)>0&&isFilled(t.address)&&isFilled(t.date)&&Number(t.area)>0);
    if(isPairModule()){const chosen=complete.filter(t=>t.useForPair!==false);if(chosen.length<3)issues.push(`co najmniej 3 kompletne nieruchomości podobne wybrane do bezpośrednich porównań; obecnie: ${chosen.length}`);}else if(complete.length<12) issues.push(`co najmniej kilkanaście nieruchomości podobnych — OPERO przyjmuje minimum 12 kompletnych transakcji; obecnie kompletnych: ${complete.length}`);
    const future=(project.market.transactions||[]).filter(t=>isFilled(t.date)&&monthsBetween(t.date,project.valuation.valuationDate)<0);
    if(future.length) issues.push('data transakcji nie może przypadać po dacie wyceny');
    if(project.market.trendSourceMode==='pairs'){
      if(!(project.market.trendPairs||[]).length) issues.push('co najmniej jedna poprawna para do trendu albo wybór trendu ręcznego / regresji / 0%');
      (calc.trendPairs||[]).forEach((r,i)=>{if(!r.valid)issues.push(`para trendu nr ${i+1}: ${r.issue||'nieprawidłowe dane'}`);});
    }
    if(project.market.trendSourceMode==='regression'&&!calc.regression?.valid)issues.push('regresja wymaga co najmniej 3 transakcji z prawidłową datą i ceną jednostkową');
  }
  if(tab==='features'){
    if(!isFilled(project.market.weightMethod)) issues.push('sposób ustalenia wag cech rynkowych');
    if(!isFilled(project.market.weightJustification)) issues.push('uzasadnienie sposobu ustalenia wag cech rynkowych');
    if(Math.abs(calc.weightSum-1)>.001)issues.push(`suma wag cech = 1,00 (teraz ${fmt(calc.weightSum,4)})`);
    const completeTx=(project.market.transactions||[]).filter(t=>Number(t.priceUnit)>0&&isFilled(t.address)&&isFilled(t.date)&&Number(t.area)>0&&(!isPairModule()||t.useForPair!==false));
    const missingRatings=completeTx.reduce((n,t)=>n+(project.market.features||[]).filter(f=>!isFilled(t.featureRatings?.[f.id])).length,0);
    if(missingRatings)issues.push(`oceny cech nieruchomości porównawczych — brakuje ${missingRatings} ocen w macierzy transakcji`);
    if(project.market.weightMethod==='pairs'){
      (project.market.features||[]).forEach((f,i)=>{const pairs=Array.isArray(f.pairs)?f.pairs:[];if(!pairs.length)issues.push(`pary „pozostałe równe” dla cechy „${f.name||i+1}”`);pairs.forEach((pr,pi)=>{if(!pr.cwId||!pr.cmId||Number(pr.cwId)===Number(pr.cmId)||Number(pr.steps||1)<1)issues.push(`prawidłowa para cechy „${f.name||i+1}” nr ${pi+1}`);});});
    }
    if(project.market.weightMethod==='correlation'){
      (calc.features||[]).forEach((f,i)=>{if(Number(f.correlationCount||0)<3)issues.push(`co najmniej 3 kompletne obserwacje do korelacji cechy „${f.name||i+1}”`);});
    }
    (project.market.features||[]).forEach((f,i)=>{
      if(!isFilled(f.name))issues.push(`nazwa cechy nr ${i+1}`);
      if(!(Number(f.weight)>0))issues.push(`waga cechy „${f.name||i+1}” większa od 0`);
      if(!isFilled(f.rating))issues.push(`ocena cechy „${f.name||i+1}”`);
      const sm=f.scaleMode||project.market.ratingMode||'three';const defs=sm==='five'?[f.scaleMin,f.scaleLow,f.scaleAvg,f.scaleHigh,f.scaleMax]:sm==='two'?[f.scaleMin,f.scaleMax]:[f.scaleMin,f.scaleAvg,f.scaleMax];
      if(defs.some(x=>!isFilled(x)))issues.push(`pełne definicje ${sm==='five'?'5-stopniowej':sm==='two'?'2-stopniowej':'3-stopniowej'} skali cechy „${f.name||i+1}”`);
    });
  }
  if(tab==='clauses'){
    if((project.legalBases||[]).length<2)issues.push('podstawy prawne'); if((project.sources||[]).length<1)issues.push('materiały źródłowe'); add(requirement('clauses','klauzule i ustalenia dodatkowe'));
  }
  return issues;
}
function allCriticalIssues(){
  const key=`${validationGeneration}|__all__`;
  const hit=validationCache.get(key);
  if(hit)return hit;
  const out=WIZARD_STEPS.filter(s=>!['photos','costing','appearance'].includes(s.tab)).flatMap(s=>validateStep(s.tab).map(x=>`${s.name}: ${x}`));
  validationCache.set(key,out);
  return out;
}
function renderWizard(){const step=WIZARD_STEPS[wizardIndex],stepName=dynamicStepName(step),issues=validateStep(step.tab);$('#wizardStepNo').textContent=`${wizardIndex+1}/${WIZARD_STEPS.length}`;$('#wizardStepName').textContent=stepName;const ic=$('#wizardIssueCount');if(ic){ic.textContent=issues.length?`${issues.length} ${issues.length===1?'brak':'braków'}`:'✓ kompletny';ic.classList.toggle('ok',!issues.length);ic.classList.toggle('warn',!!issues.length);}$('#wizardProgressFill').style.width=`${((wizardIndex+1)/WIZARD_STEPS.length)*100}%`;$('#wizardBack').disabled=wizardIndex===0;$('#wizardNext').textContent=wizardIndex===WIZARD_STEPS.length-1?'Przejdź do wyniku →':'Dalej →';renderWorkflowUI();}
function syncWizardWithTab(name){const i=WIZARD_STEPS.findIndex(x=>x.tab===name),bar=$('#wizardBar'),app=$('#app'),rail=$('#workflowRail'),live=$('#livePanel');if(i>=0){wizardIndex=i;visitedSteps.add(name);bar?.classList.remove('hidden');rail?.classList.remove('hidden');live?.classList.remove('hidden');app?.classList.add('workflow-active');renderWizard();}else{bar?.classList.add('hidden');rail?.classList.add('hidden');live?.classList.add('hidden');app?.classList.remove('workflow-active');$('#wizardBubble')?.classList.add('hidden');}applyUIPrefs();}
function switchTab(name){
  // 3.2: tylko tryb agentow — etapy recznej edycji nie sa juz miejscem pracy.
  // Kazde przejscie do etapu konczy sie na zakladce Wynik (operat do sprawdzenia).
  try{ if(!window.__edycjaReczna && (name==='project' || name==='kw' || (Array.isArray(WIZARD_STEPS) && WIZARD_STEPS.some(x=>x&&x.tab===name)))) name='result'; }catch(e){}
  // Tlo bierze nazwe zakladki, zeby przestawic swoja temperature (patrz styles.css).
  try{ document.body.dataset.tlo=name; }catch(e){}
  clearTimeout(guideTimer);hideContextCoach();hideFieldHelp();$('#notificationPanel')?.classList.add('hidden');
  const target=$(`#tab-${name}`);$$('.tab').forEach(x=>x.classList.toggle('active',x===target));
  // Zakladka dopiero teraz jest widoczna, wiec dopiero teraz da sie zmierzyc jej rzedy.
  wyrownajRzedyPozniej();
  const isWizard=WIZARD_STEPS.some(x=>x.tab===name);$$('.nav-btn').forEach(x=>x.classList.toggle('active',x.dataset.tab===name || (isWizard && x.dataset.main==='operaty')));
  syncWizardWithTab(name);if(target&&uiPrefs.motion==='full'){target.classList.remove('premium-enter');void target.offsetWidth;target.classList.add('premium-enter');setTimeout(()=>target.classList.remove('premium-enter'),420);}
  if(name==='settings')renderSettingsPage();if(name==='result')setTimeout(renderReportPreview,30);if(name==='dashboard')renderDashboard();if(name==='clients')renderKlienci();if(name==='baza')bazaOdswiez();
  window.scrollTo({top:0,behavior:uiPrefs.motion==='full'?'smooth':'auto'});if(isWizard&&uiPrefs.mode==='guide'){guideTimer=setTimeout(()=>{if($(`#tab-${name}`)?.classList.contains('active'))guideCurrentStep(false);},180);}
}
function wizardMove(delta){
  if(delta>0){const step=WIZARD_STEPS[wizardIndex];const issues=validateStep(step.tab);if(issues.length){showValidationBubble(issues);renderNotifications();return;}showStepSuccess(dynamicStepName(step)); if(wizardIndex===WIZARD_STEPS.length-1){setTimeout(()=>{switchTab('result');renderFinalIssues();},uiPrefs.motion==='full'?260:0);return;}}
  wizardIndex=Math.max(0,Math.min(WIZARD_STEPS.length-1,wizardIndex+delta));const go=()=>switchTab(WIZARD_STEPS[wizardIndex].tab);if(delta>0&&uiPrefs.motion==='full')setTimeout(go,180);else go();
}
function renderFinalIssues(){const root=$('#finalIssues');if(!root)return;const issues=allCriticalIssues();root.innerHTML=issues.length?`<div class="issue-list"><b>Do uzupełnienia przed PDF (${issues.length}):</b><ul>${issues.map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul></div>`:'<div class="ok-box">✓ Dane krytyczne są uzupełnione. Możesz przejść do generowania PDF.</div>';}

const HELP_MAP={
  'author.name':'Twoje imię i nazwisko jako autora operatu — dane rzeczoznawcy majątkowego podpisującego opracowanie.',
  'author.licenseNo':'Numer uprawnień zawodowych rzeczoznawcy majątkowego sporządzającego i podpisującego operat.',
  'author.company':'Nazwa firmy, kancelarii lub pracowni, pod którą sporządzany jest operat.',
  'property.city':'Miejscowość położenia wycenianego lokalu, zgodna z dokumentami stanu prawnego i ewidencyjnego.',
  'property.district':'Dzielnica, osiedle lub część miasta pomagająca zdefiniować lokalizację i rynek lokalny.',
  'property.street':'Nazwa ulicy położenia lokalu; porównaj zapis z Działem I-O KW.',
  'property.buildingNo':'Numer budynku, w którym znajduje się lokal.',
  'property.localNo':'Numer wycenianego lokalu mieszkalnego.',
  'property.staircase':'Oznaczenie klatki schodowej, jeżeli występuje i pomaga jednoznacznie zidentyfikować lokal.',
  'property.usableArea':'Powierzchnia użytkowa przyjęta do wyceny jako liczba jednostek porównawczych. Nie musi być równa powierzchni ujawnionej w KW.',
  'property.kwArea':'Powierzchnia ujawniona w KW; może obejmować pomieszczenie przynależne. Porównaj ją z powierzchnią użytkową przyjętą do obliczeń.',
  'property.rooms':'Liczba pokoi wynikająca z dokumentacji lub oględzin.',
  'property.floor':'Piętro / kondygnacja lokalu. Numer kondygnacji w KW może różnić się od potocznego numeru piętra.',
  'property.balconyArea':'Powierzchnia balkonu, loggii lub tarasu, jeśli jest znana; zwykle stanowi element dodatkowy.',
  'property.basementName':'Nazwa pomieszczenia przynależnego, np. piwnica albo komórka lokatorska.',
  'property.basementArea':'Powierzchnia pomieszczenia przynależnego; zweryfikuj, czy została ujawniona w KW.',
  'property.rightType':'Prawo będące przedmiotem wyceny, np. odrębna własność lokalu albo spółdzielcze własnościowe prawo.',
  'valuation.purpose':'Cel wyceny, czyli do czego ma służyć określona wartość; cel wpływa na zakres i sposób opracowania.',
  'valuation.reportDate':'Data sporządzenia i oznaczenia operatu.',
  'valuation.valuationDate':'Data, na którą określa się wartość nieruchomości.',
  'valuation.priceLevelDate':'Data poziomu cen przyjętego w wycenie.',
  'valuation.inspectionDate':'Data oględzin stanowiących podstawę opisu stanu techniczno-użytkowego.',
  'valuation.legalStateDate':'Data i opcjonalnie godzina badania aktualnego stanu prawnego, np. treści EKW.',
  'valuation.roundTo':'Dokładność końcowego zaokrąglenia wartości; dobierz ją do jakości i dokładności danych.',
  'formalBasis':'Podstawa formalna wyjaśnia, na czyje zlecenie i na jakiej podstawie sporządzono operat, np. umowa, zlecenie lub postanowienie.',
  'methodicalBasis':'Podstawy metodyczne opisują standardy, podejście, metodę, jednostkę porównawczą i zasady zastosowane w procesie wyceny.',
  'valuation.approachDescription':'Uzasadnienie wyboru rodzaju wartości, podejścia i metody dla tego konkretnego zlecenia.',
  'legal.kwLocal':'Elektroniczny numer księgi wieczystej lokalu, np. GD1G/00212545/4.',
  'legal.kwCommon':'Numer księgi wieczystej nieruchomości wspólnej / macierzystej związanej z lokalem.',
  'legal.ioRooms':'Opis izb i pomieszczeń ujawnionych w Dziale I-O KW.',
  'legal.ispRightType':'Rodzaj prawa ujawnionego w Dziale I-Sp, najczęściej udział związany z własnością lokalu.',
  'legal.ownerNames':'Właściciel lub uprawniony ujawniony w Dziale II KW.',
  'legal.ownershipType':'Sposób przysługiwania prawa w Dziale II, np. własność 1/1, współwłasność ułamkowa lub wspólność ustawowa majątkowa małżeńska.',
  'legal.commonShare':'Udział związany z własnością lokalu w nieruchomości wspólnej z Działu I-Sp; nie myl go z udziałem właściciela w lokalu.',
  'legal.court':'Sąd i wydział prowadzący księgę wieczystą.',
  'legal.currentEntryBasis':'Dokument będący podstawą aktualnego wpisu własności, jeżeli został odczytany i jest istotny dla opracowania.',
  'legal.sectionIII':'Dział III zawiera prawa, roszczenia i ograniczenia. Jeżeli brak wpisów, zapisz to jednoznacznie.',
  'legal.sectionIV':'Dział IV zawiera hipoteki. Jeżeli brak wpisów, zapisz to jednoznacznie.',
  'legal.kwNotes':'Wnioski z badania stanu prawnego: typ prawa, uprawnieni, udział, istotne wpisy i rozbieżności wymagające wyjaśnienia.',
  'legal.commonProperty.plotNo':'Numer działki związanej z nieruchomością wspólną / gruntową, zweryfikowany w KW lub EGiB.',
  'legal.commonProperty.plotId':'Pełny identyfikator działki związanej z nieruchomością wspólną, jeżeli został zweryfikowany w EGiB lub KW.',
  'legal.commonProperty.area':'Powierzchnia gruntu nieruchomości wspólnej zgodna z dokumentem źródłowym; podaj także jednostkę, jeśli pole ma formę tekstową.',
  'legal.commonProperty.landUse':'Sposób korzystania lub oznaczenie użytku ujawnione w KW / EGiB, np. B – tereny mieszkaniowe.',
  'legal.commonProperty.buildingId':'Identyfikator budynku z EGiB, jeżeli został zweryfikowany i jest potrzebny do identyfikacji nieruchomości.',
  'legal.commonProperty.buildingStoreys':'Liczba kondygnacji budynku wynikająca z danych źródłowych, a nie z przypuszczenia na podstawie wyglądu.',
  'legal.commonProperty.buildingUnits':'Liczba lokali ujawniona w dokumentach źródłowych, jeżeli jest istotna dla opisu nieruchomości wspólnej.',
  'legal.commonProperty.sectionISP':'Treść lub wniosek z Działu I-Sp KW nieruchomości wspólnej; wpisuj prawa rzeczywiście ujawnione w tej księdze.',
  'legal.commonProperty.sectionII':'Treść lub wniosek z Działu II KW nieruchomości wspólnej dotyczący własności / współwłasności.',
  'legal.commonProperty.sectionIII':'Treść lub wniosek z Działu III KW nieruchomości wspólnej, np. prawa, roszczenia, sposób korzystania lub ograniczenia.',
  'legal.commonProperty.sectionIV':'Treść lub wniosek z Działu IV KW nieruchomości wspólnej dotyczący hipotek; brak wpisów również należy odnotować.',
  'egib.unit':'Jednostka ewidencyjna identyfikująca obszar prowadzenia EGiB.',
  'egib.district':'Obręb ewidencyjny, w którym znajduje się działka związana z budynkiem.',
  'egib.plotNo':'Numer działki ewidencyjnej związanej z budynkiem.',
  'egib.plotId':'Pełny identyfikator działki z EGiB / Geoportalu.',
  'egib.plotArea':'Powierzchnia działki ewidencyjnej z wiarygodnego źródła.',
  'egib.buildingId':'Identyfikator budynku w EGiB, jeżeli jest dostępny.',
  'egib.notes':'Opis danych ewidencyjnych i ewentualnych rozbieżności między EGiB, KW i stanem faktycznym.',
  'planning.planNumber':'Numer lub oznaczenie obowiązującego miejscowego planu, jeżeli nieruchomość jest nim objęta.',
  'planning.planName':'Pełna nazwa miejscowego planu zagospodarowania przestrzennego.',
  'planning.resolution':'Numer i data uchwały przyjmującej plan.',
  'planning.zoneSymbol':'Symbol terenu / jednostki planistycznej przypisany nieruchomości.',
  'planning.designation':'Przeznaczenie terenu wynikające z ustaleń planu.',
  'planning.parameters':'Istotne parametry planu: np. intensywność, wysokość, PBC, linie zabudowy albo inne wskaźniki.',
  'planning.protections':'Ochrona i ograniczenia, np. konserwatorskie, osuwiskowe lub infrastrukturalne.',
  'planning.sourceUrl':'Link do oficjalnego źródła planu, najlepiej BIP lub systemu informacji przestrzennej właściwej gminy.',
  'planning.description':'Gotowy opis uwarunkowań planistycznych do operatu, oparty wyłącznie na zweryfikowanych danych.',
  'location.transport':'Dostępność komunikacyjna i transport publiczny istotne dla lokalizacji.',
  'location.services':'Dostęp do usług istotnych dla funkcji mieszkaniowej; wpisuj tylko zweryfikowane fakty.',
  'location.recreation':'Dostęp do zieleni, rekreacji i terenów wypoczynkowych.',
  'location.surroundings':'Pozostałe cechy otoczenia, w tym potencjalne uciążliwości.',
  'location.description':'Profesjonalny opis lokalizacji i otoczenia oraz ich znaczenia dla segmentu rynku.',
  'location.latitude':'Szerokość geograficzna punktu lokalizacji do precyzyjnego linku Google Maps.',
  'location.longitude':'Długość geograficzna punktu lokalizacji do precyzyjnego linku Google Maps.',
  'location.manualMapsUrl':'Opcjonalny własny link Google Maps; ma pierwszeństwo przed linkiem tworzonym z adresu lub współrzędnych.',
  'location.includeMapsQR':'Decyduje, czy kod QR prowadzący do Google Maps zostanie umieszczony w PDF.',
  'building.type':'Rodzaj budynku / zabudowy, np. wielorodzinny niski, wysoki, kamienica lub apartamentowiec.',
  'building.year':'Rok budowy z dokumentu lub wiarygodnego źródła; jeżeli nieznany, nie zgaduj.',
  'building.storeys':'Liczba kondygnacji budynku.',
  'building.construction':'Technologia i konstrukcja budynku, np. murowana, prefabrykowana lub żelbetowa.',
  'building.lift':'Informacja o windzie / dźwigu i dostępności komunikacyjnej budynku.',
  'building.condition':'Ogólna ocena stanu technicznego budynku wynikająca z oględzin i dostępnych materiałów.',
  'building.roof':'Rodzaj dachu i jego stan, jeżeli możliwy do oceny.',
  'building.facade':'Rodzaj i stan elewacji, w tym ocieplenie lub modernizacja, jeżeli zweryfikowane.',
  'building.commonAreas':'Stan części wspólnych, np. klatki schodowej, wejścia i korytarzy.',
  'building.parking':'Sposób zapewnienia miejsc postojowych.',
  'building.manager':'Zarządca, wspólnota albo spółdzielnia, jeżeli informacja jest znana.',
  'building.surroundings':'Zagospodarowanie terenu bezpośrednio przy budynku.',
  'building.installations':'Instalacje dostępne w budynku.',
  'building.description':'Zbiorczy opis stanu techniczno-użytkowego budynku oparty na danych strukturalnych i oględzinach.',
  'local.kitchenType':'Sposób organizacji kuchni w lokalu — wybierz z listy.',
  'local.bathrooms':'Liczba i układ łazienek / WC.',
  'local.orientation':'Ekspozycja lokalu / kierunki świata, jeżeli zostały ustalone.',
  'local.floors':'Materiały i stan podłóg.',
  'local.walls':'Wykończenie i stan ścian oraz sufitów.',
  'local.windows':'Rodzaj i stan stolarki okiennej.',
  'local.standardLevel':'Poziom standardu lokalu na tle badanego segmentu rynku.',
  'local.technicalCondition':'Stan techniczny lokalu wynikający z oględzin, niezależny od poziomu standardu wykończenia.',
  'local.installations':'Instalacje występujące w lokalu i ich stan, jeżeli był możliwy do oceny.',
  'local.layout':'Opis funkcjonalny układu: pomieszczenia, komunikacja, relacje między nimi, ewentualnie powierzchnie i orientacja.',
  'local.description':'Opis standardu i stanu technicznego lokalu: materiały, zużycie, remonty, stałe wyposażenie i potrzeba nakładów.',
  'market.segmentDescription':'Definicja rynku właściwego: rodzaj prawa, funkcja, lokalizacja, powierzchnia, typ zabudowy, rynek pierwotny/wtórny i okres analizy.',
  'market.marketDescription':'Charakterystyka rynku: liczba i rozpiętość transakcji, zmiany cen i cechy różnicujące ceny.',
  'narratives.extremeMax':'Charakterystyka nieruchomości o najwyższej skorygowanej cenie jednostkowej Cmax: podaj dane transakcji i jej zweryfikowane oceny cech, bez wnioskowania wyłącznie z ceny.',
  'narratives.extremeMin':'Charakterystyka nieruchomości o najniższej skorygowanej cenie jednostkowej Cmin: podaj dane transakcji i jej zweryfikowane oceny cech, bez wnioskowania wyłącznie z ceny.',
  'market.trendSourceMode':'Sposób ustalenia zmiany cen w czasie: z par transakcji, ręcznie albo bez korekty przy uzasadnieniu.',
  'market.manualTrendRate':'Miesięczna stopa zmiany cen [%/m-c] wpisywana ręcznie, gdy trend został ustalony poza automatycznym obliczeniem z par.',
  'market.trendPrecisionMode':'Określa, czy do korekty używana jest pełna precyzja trendu czy wartość wcześniej zaokrąglona.',
  'market.trendRoundDigits':'Liczba miejsc po przecinku dla trendu w trybie zaokrąglonym.',
  'market.weightMethod':'Sposób, w jaki rzeczoznawca ustalił wpływ poszczególnych cech na zróżnicowanie cen: z par „pozostałe równe”, z analizy korelacji, z szerszej analizy rynku lub innym wiarygodnym sposobem.',
  'market.weightJustification':'Opis danych i rozumowania, na podstawie których przyjęto wagi. Powinien umożliwiać odtworzenie toku analizy i nie może być automatycznym uzasadnieniem wygenerowanym wyłącznie pod oczekiwany wynik.',
  'market.ratingMode':'Skala ocen cech rynkowych: 3 poziomy dla prostszej klasyfikacji albo 5 dla większej gradacji.',
  'costing.hours':'Łączny czas pracy nad zleceniem używany w wewnętrznej kalkulacji kosztu.',
  'costing.hourlyRate':'Wewnętrzna stawka kosztu godziny pracy do analizy rentowności.',
  'costing.travelKm':'Łączna liczba kilometrów związana ze zleceniem.',
  'costing.costPerKm':'Przyjęty wewnętrzny koszt jednego kilometra.',
  'costing.documentsCost':'Koszt pozyskania dokumentów i danych.',
  'costing.printingCost':'Koszt wydruku, oprawy i przygotowania egzemplarzy.',
  'costing.toolsCost':'Koszt zewnętrznych narzędzi lub usług użytych przy zleceniu, jeżeli chcesz uwzględnić go w kalkulacji.',
  'costing.otherCost':'Pozostałe koszty bezpośrednio związane z operatem.',
  'costing.clientFeeNet':'Wynagrodzenie netto ustalone z klientem.',
  'costing.vatRate':'Stawka VAT używana w kalkulacji wynagrodzenia brutto, jeżeli dotyczy.',
  'costing.vatExempt':'Zaznacz wyłącznie, gdy rozliczenie jest zwolnione z VAT zgodnie z właściwymi zasadami podatkowymi.',
  'costing.includeInPDF':'Pozwala świadomie dołączyć wewnętrzną kalkulację kosztu do PDF.',
  'appearance.coverStyle':'Układ pierwszej strony raportu. Klasyczny eksponuje tytuł i dane opracowania, minimalistyczny ogranicza ozdobniki, a fotograficzny mocniej wykorzystuje zdjęcie nieruchomości.',
  'appearance.theme':'Gotowy motyw wizualny raportu PDF.',
  'appearance.bodyFontSize':'Podstawowa wielkość tekstu raportu w punktach. Zmiana dotyczy składu dokumentu, a nie danych merytorycznych.',
  'appearance.lineHeight':'Interlinia, czyli odstęp pomiędzy wierszami tekstu. Większa wartość zwiększa czytelność, ale wydłuża dokument.',
  'appearance.pageMarginMm':'Margines głównej treści na stronach A4 podany w milimetrach. Nagłówek i stopka są składane niezależnie.',
  'appearance.tableDensity':'Odstępy wewnątrz tabel. Tryb kompaktowy mieści więcej danych, a luźny zwiększa czytelność.',
  'appearance.photoColumns':'Liczba fotografii ustawianych obok siebie w dokumentacji zdjęciowej. Wybierz ją pod kątem czytelności kadrów.',
  'appearance.showToc':'Włącza lub wyłącza automatyczny spis treści w raporcie końcowym.',
  'appearance.showIndexes':'Włącza lub wyłącza automatyczny spis tabel, rysunków i fotografii.',
  'appearance.accent':'Kolor akcentu nagłówków, linii i tabel w PDF.',
  'appearance.fontFamily':'Krój pisma głównego tekstu raportu.',
  'appearance.headingStyle':'Sposób prezentacji nagłówków rozdziałów.',
  'appearance.headerText':'Tekst powtarzany w nagłówku stron PDF.',
  'appearance.footerText':'Tekst powtarzany w stopce PDF obok numeru strony.',
  'appearance.showHeaderFooter':'Włącza drukowany nagłówek i stopkę z numeracją stron.',
  'clauses':'Klauzule i ustalenia dodatkowe opisujące zakres wykorzystania, założenia i ograniczenia operatu; muszą odpowiadać konkretnemu zleceniu.'
};
function hideFieldHelp(){const p=$('#fieldHelpPopover');if(p)p.classList.add('hidden');fieldHelpTarget=null;}
function placeFieldHelp(dot){const p=$('#fieldHelpPopover');if(!p||!dot?.isConnected)return hideFieldHelp();const r=dot.getBoundingClientRect(),w=Math.min(340,innerWidth-28),h=Math.max(120,p.offsetHeight||120);let left=Math.min(innerWidth-w-14,Math.max(14,r.right+10)),top=Math.max(104,Math.min(innerHeight-h-14,r.top-18));if(r.right+10+w>innerWidth-14)left=Math.max(14,r.left-w-10);p.style.left=`${Math.round(left)}px`;p.style.top=`${Math.round(top)}px`;}
function showFieldHelp(dot){if(!dot)return;hideContextCoach();fieldHelpTarget=dot;const p=$('#fieldHelpPopover'),label=dot.closest('label');if(!p)return;const clone=label?.cloneNode(true);clone?.querySelectorAll?.('input,textarea,select,.help-dot,.hint,small').forEach(x=>x.remove());const title=(clone?.textContent||'Pole').replace(/\s+/g,' ').trim()||'Pole';if($('#fieldHelpTitle'))$('#fieldHelpTitle').textContent=title;if($('#fieldHelpText'))$('#fieldHelpText').textContent=dot.dataset.tooltip||'Uzupełnij pole zgodnie z dokumentem źródłowym i celem wyceny.';p.classList.remove('hidden');placeFieldHelp(dot);}
// Czarne chmurki systemowe (atrybut title) pojawialy sie po najechaniu i zaslanialy
// pola — czesto dokladnie to, co uzytkownik wlasnie wybieral z listy. Tresc nie ginie:
// wedruje pod znak „?" przy etykiecie, ktory pokazuje ja po klknieciu.
function usunNatywneDymki(root=document){
  for(const el of root.querySelectorAll('input[title], select[title], textarea[title]')){
    const tresc=el.getAttribute('title');
    if(!tresc) continue;
    el.dataset.pomoc=tresc;        // zostaje w danych, gdyby byla potrzebna
    el.removeAttribute('title');
  }
}
/**
 * Znak „?" musi stac W LINII Z NAZWA POLA, a nie pod nia.
 *
 * Etykiety w formularzach sa siatkami (`display:grid`), wiec kazdy element
 * wstawiony wprost do etykiety zajmuje WLASNY WIERSZ. Znak pomocy spychal
 * przez to pole w dol - i w jednym rzedzie formularza jedne rubryki stoja
 * nizej od drugich, zaleznie od tego, ktore maja wyjasnienie. Formularz
 * wyglada wtedy na zlozony z kawalkow.
 *
 * Dlatego nazwa pola i znak lada razem w jednym naglowku.
 */
function wstawZnakPomocy(label, dot){
  // Naglowek ma DWIE warstwy: zewnetrzna trzyma wspolna wysokosc i dosuwa
  // tresc do dolu, wewnetrzna jest zwyklym blokiem tekstu, w ktorym znak
  // pomocy plynie razem ze slowami. Gdy znak byl osobnym elementem ukladu,
  // spadal do wlasnego wiersza i rzad formularza dostawal dodatkowe pietro.
  // Pole wyboru (ptaszek): nazwa stoi ZA kratka, wiec znak pomocy idzie na koniec,
  // a nie przed kratke do pustego naglowka.
  const kratka = label.querySelector(':scope > input[type="checkbox"], :scope > input[type="radio"]');
  if (label.classList.contains('check') || kratka){ label.appendChild(dot); return; }
  let naglowek = label.querySelector(':scope > .pole-naglowek');
  const pierwszy = label.firstElementChild;
  if (!naglowek && pierwszy && pierwszy.tagName === 'SPAN' && !pierwszy.classList.contains('help-dot')){
    // Pola Expressu maja juz nazwe w <span>.
    naglowek = pierwszy;
    naglowek.classList.add('pole-naglowek');
  }
  if (!naglowek){
    naglowek = document.createElement('span');
    naglowek.className = 'pole-naglowek';
    const przenies = [];
    // Sam tekst nazwy - wszystko, co stoi przed pierwszym elementem.
    while (label.firstChild && label.firstChild.nodeType === Node.TEXT_NODE) przenies.push(label.removeChild(label.firstChild));
    przenies.forEach(n => naglowek.appendChild(n));
    label.insertBefore(naglowek, label.firstChild);
  }
  let tresc = naglowek.querySelector(':scope > .pole-naglowek-tresc');
  if (!tresc){
    tresc = document.createElement('span');
    tresc.className = 'pole-naglowek-tresc';
    while (naglowek.firstChild) tresc.appendChild(naglowek.firstChild);
    naglowek.appendChild(tresc);
  }
  tresc.appendChild(dot);
}

/* --------------------------------------------------- rowne rzedy formularza */

/**
 * Nazwy pol w jednym rzedzie dostaja TE SAMA wysokosc.
 *
 * Sam CSS zalatwia przypadek typowy (nazwa na jeden albo dwa wiersze), ale
 * w modulach trafiaja sie nazwy trzywierszowe, a przy wezszym oknie kazda
 * nazwa moze sie zlamac inaczej. Zamiast zgadywac wysokosc z gory, mierzymy:
 * w kazdym rzedzie siatki najwyzsza nazwa wyznacza wysokosc pozostalych.
 * Pola staja wtedy w jednej linii przy kazdej szerokosci okna.
 */
let rzedyRaf = 0;
function wyrownajRzedy(zasieg = document){
  const siatki = zasieg.querySelectorAll('.form-grid, .pf-grid');
  siatki.forEach(g => {
    // Pola modulow nie maja znaku pomocy, wiec nikt nie opakowal ich nazwy
    // w naglowek — a bez naglowka nie ma czego wyrownywac. Opakowujemy tutaj.
    [...g.children].forEach(l => {
      if (l.tagName !== 'LABEL' || l.classList.contains('check')) return;
      if (l.querySelector(':scope > .pole-naglowek')) return;
      const pierwszy = l.firstChild;
      if (!pierwszy || pierwszy.nodeType !== Node.TEXT_NODE || !pierwszy.textContent.trim()) return;
      const naglowek = document.createElement('span');
      naglowek.className = 'pole-naglowek';
      const tresc = document.createElement('span');
      tresc.className = 'pole-naglowek-tresc';
      while (l.firstChild && l.firstChild.nodeType === Node.TEXT_NODE) tresc.appendChild(l.firstChild);
      naglowek.appendChild(tresc);
      l.insertBefore(naglowek, l.firstChild);
    });
    const naglowki = [...g.children]
      .filter(l => l.tagName === 'LABEL' && l.getClientRects().length)
      .map(l => ({ l, n: l.querySelector(':scope > .pole-naglowek') }))
      .filter(x => x.n);
    if (naglowki.length < 2) return;
    // Najpierw zdejmujemy poprzednie wyrownanie — inaczej raz podniesiona
    // wysokosc nigdy by nie zmalala po poszerzeniu okna.
    naglowki.forEach(x => { x.n.style.minHeight = ''; });
    // Rzad rozpoznajemy z tolerancja: gorne krawedzie komorek tego samego
    // rzedu roznia sie o ulamki piksela i po zaokragleniu potrafia wpasc
    // w dwie rozne liczby — a wtedy sasiedzi nie byliby wyrownani.
    const wiersze = new Map();
    const posortowane = naglowki.map(x => ({ ...x, top: x.l.getBoundingClientRect().top }))
      .sort((a, b) => a.top - b.top);
    let klucz = null, ostatni = -1e9;
    posortowane.forEach(x => {
      if (x.top - ostatni > 6) klucz = x.top;
      ostatni = x.top;
      if (!wiersze.has(klucz)) wiersze.set(klucz, []);
      wiersze.get(klucz).push(x.n);
    });
    wiersze.forEach(lista => {
      if (lista.length < 2) return;
      const wys = lista.map(n => n.getBoundingClientRect().height);
      const maks = Math.max(...wys);
      if (maks - Math.min(...wys) < 0.5) return;
      lista.forEach(n => { n.style.minHeight = `${Math.ceil(maks)}px`; });
    });
  });
}
function wyrownajRzedyPozniej(){
  if (rzedyRaf) cancelAnimationFrame(rzedyRaf);
  rzedyRaf = requestAnimationFrame(() => { rzedyRaf = 0; wyrownajRzedy(); });
}
window.addEventListener('resize', wyrownajRzedyPozniej);
// Formularze rysuje kilka niezaleznych funkcji (kreator, moduly, Express).
// Zamiast dopisywac wywolanie w kazdej z nich i zapomniec o nastepnej,
// obserwujemy obszar roboczy: gdy cos w nim sie zmieni, rzedy sa mierzone
// na nowo. Wyrownanie zmienia tylko styl naglowkow, wiec samo nie budzi
// obserwatora ponownie (sledzimy liste dzieci, nie atrybuty).
document.addEventListener('DOMContentLoaded', () => {
  const obszar = document.querySelector('.main') || document.body;
  let zajety = false;
  new MutationObserver(() => {
    if (zajety) return;
    zajety = true;
    requestAnimationFrame(() => { zajety = false; wyrownajRzedy(); });
  }).observe(obszar, { childList: true, subtree: true });
});

function applyHelpTooltips(){
  $$('label').forEach(label=>{
    // Znak pomocy siedzi teraz WEWNATRZ <span class="pole-naglowek">, a nie
    // bezposrednio w <label>. Stara straz pytala o BEZPOSREDNIE dziecko labela,
    // wiec po kazdym przerysowaniu nie widziala wstawionego znaku i dokladala
    // nastepny - stad rzad znakow zapytania przy kazdej rubryce.
    if(label.querySelector('.help-dot'))return;const control=label.querySelector('[data-path]');const path=control?.dataset.path;const kontrolkaTitle=control?.getAttribute('title')||'';let text=label.dataset.help||HELP_MAP[path]||kontrolkaTitle;if(!text&&path){const name=(label.childNodes[0]?.textContent||path).trim();text=`Pole „${name}” dotyczy danych sekcji ${path.split('.')[0]}. Uzupełnij je zgodnie z dokumentem źródłowym, oględzinami lub analizą rynkową właściwą dla tego pola.`;}if(!text)return;const dot=document.createElement('button');dot.type='button';dot.className='help-dot';dot.textContent='?';dot.dataset.tooltip=text;dot.setAttribute('aria-label','Wyjaśnij to pole');dot.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();showFieldHelp(dot);});wstawZnakPomocy(label,dot);});
  usunNatywneDymki(document);
  wyrownajRzedyPozniej();
}

function detectHeadings(raw){const u=String(raw||'').toUpperCase();return ['I-O','I-SP','II','III','IV'].filter(k=>{const re=k==='I-SP'?/DZIAŁ\s+I-?SP/:new RegExp(`DZIAŁ\\s+${k.replace('-','-?')}`);return re.test(u);});}
function extractEkwSection(raw,name){
  const text=String(raw||''); const defs=[['I-O',/DZIAŁ\s+I-?O\b/i],['I-Sp',/DZIAŁ\s+I-?SP\b/i],['II',/DZIAŁ\s+II\b/i],['III',/DZIAŁ\s+III\b/i],['IV',/DZIAŁ\s+IV\b/i]];
  const pos=defs.map(([n,re])=>{const m=re.exec(text);return m?{n,i:m.index}:{n,i:-1};}).filter(x=>x.i>=0).sort((a,b)=>a.i-b.i);const p=pos.find(x=>x.n.toLowerCase()===name.toLowerCase());if(!p)return '';const ix=pos.indexOf(p);return text.slice(p.i,ix+1<pos.length?pos[ix+1].i:text.length);
}
function labelValue(text,label){const safe=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');for(const re of [new RegExp(`${safe}\\s*[:–-]?\\s*([^\\n\\r]{1,220})`,'i'),new RegExp(`${safe}[^\\n\\r]*[\\n\\r]+\\s*([^\\n\\r]{1,220})`,'i')]){const m=String(text||'').match(re);if(m?.[1])return m[1].trim().replace(/\s{2,}/g,' ');}return '';}
function numericArea(value){const m=String(value||'').replace(/\s/g,'').match(/([0-9]+(?:[.,][0-9]+)?)/);return m?Number(m[1].replace(',','.')):0;}
function conciseSection(text){const t=String(text||'').trim();if(!t)return '';if(/BRAK\s+WPISÓW/i.test(t))return 'BRAK WPISÓW – według aktualnej treści EKW z dnia badania.';return t.replace(/\n{3,}/g,'\n\n').slice(0,6500);}
function kwMatches(text){return [...String(text||'').toUpperCase().matchAll(/\b[A-Z0-9]{4}\/[0-9]{8}\/[0-9]\b/g)].map(m=>m[0]);}
function normalizeKwLocal(value){const raw=String(value||'').toUpperCase().replace(/\s+/g,'');const m=raw.match(/^([A-Z0-9]{4})\/?([0-9]{1,8})\/?([0-9])$/);return m?`${m[1]}/${m[2].padStart(8,'0')}/${m[3]}`:raw;}
function kwNearLabel(text,label){const src=String(text||'');const pos=stripDiacritics(src).indexOf(stripDiacritics(label));if(pos<0)return'';return kwMatches(src.slice(pos,pos+500))[0]||'';}
function parseEkwImported(){
  const all=String(project.legal?.ekwImport?.rawText||'');const io=extractEkwSection(all,'I-O')||project.legal?.ekwImport?.sections?.IO||'',isp=extractEkwSection(all,'I-Sp')||project.legal?.ekwImport?.sections?.ISP||'',ii=extractEkwSection(all,'II')||project.legal?.ekwImport?.sections?.II||'';
  const found={};
  found.kwLocal=kwMatches(io)[0]||kwMatches(all)[0]||'';
  found.kwCommon=kwNearLabel(isp,'numer księgi wieczystej, z której wyodrębniono lokal')||kwNearLabel(io,'przyłączenie')||kwNearLabel(isp,'księga wieczysta nieruchomości wspólnej')||'';
  if(found.kwCommon===found.kwLocal)found.kwCommon='';
  found.court=labelValue(all,'Sąd')||labelValue(all,'Wydział');found.city=labelValue(io,'Miejscowość');found.street=labelValue(io,'Ulica');found.buildingNo=labelValue(io,'Numer budynku');found.localNo=labelValue(io,'Numer lokalu');found.floor=labelValue(io,'Kondygnacja');
  for(const a of ['Pole powierzchni użytkowej lokalu wraz z powierzchnią pomieszczeń przynależnych','Powierzchnia użytkowa lokalu','Obszar']){const n=numericArea(labelValue(io,a));if(n){found.kwArea=n;break;}}
  const share=isp.match(/Wielkość\s+udziału[\s\S]{0,120}?([0-9]+\s*\/\s*[0-9]+)/i);found.commonShare=share?share[1].replace(/\s/g,''):labelValue(isp,'Wielkość udziału');found.ownershipType=labelValue(ii,'Rodzaj wspólności')||labelValue(ii,'Wielkość udziału');
  const first=labelValue(ii,'Imię pierwsze'), second=labelValue(ii,'Imię drugie'), last=labelValue(ii,'Nazwisko');found.ownerNames=[first,second,last].filter(Boolean).join(' ')||labelValue(ii,'Nazwa');found.sectionIII=conciseSection(extractEkwSection(all,'III'));found.sectionIV=conciseSection(extractEkwSection(all,'IV'));return found;
}
let ekwActiveSection='IO';
const EKW_SECTION_META={
  IO:{label:'I-O',title:'Dział I-O — oznaczenie nieruchomości',help:'Skopiuj część dotyczącą oznaczenia lokalu: miejscowość, ulicę, budynek, lokal, opis izb, kondygnację i powierzchnię.'},
  ISP:{label:'I-Sp',title:'Dział I-Sp — spis praw związanych z własnością',help:'Skopiuj prawa związane z własnością lokalu, w szczególności rodzaj prawa, udział i numer księgi nieruchomości wspólnej.'},
  II:{label:'II',title:'Dział II — własność',help:'Skopiuj aktualne dane właściciela lub uprawnionego, wielkość udziału i rodzaj wspólności.'},
  III:{label:'III',title:'Dział III — prawa, roszczenia i ograniczenia',help:'Skopiuj aktualną treść Działu III. Jeżeli brak wpisów, również zapisz tę informację.'},
  IV:{label:'IV',title:'Dział IV — hipoteka',help:'Skopiuj aktualną treść Działu IV. Jeżeli brak wpisów, również zapisz tę informację.'}
};
function rebuildEkwRawText(){
  const sec=project.legal.ekwImport.sections||{};
  project.legal.ekwImport.rawText=[['IO','DZIAŁ I-O'],['ISP','DZIAŁ I-Sp'],['II','DZIAŁ II'],['III','DZIAŁ III'],['IV','DZIAŁ IV']]
    .filter(([k])=>String(sec[k]||'').trim())
    .map(([k,h])=>`${h}\n${sec[k]}`).join('\n\n');
  return project.legal.ekwImport.rawText;
}
function selectEkwSection(key){
  if(!EKW_SECTION_META[key])return;
  const current=$('#ekwRawText');
  if(current && current.value.trim()!==String(project.legal.ekwImport.sections?.[ekwActiveSection]||'').trim()){
    project.legal.ekwImport.sections[ekwActiveSection]=current.value.trim();rebuildEkwRawText();
  }
  ekwActiveSection=key;project.legal.ekwImport.activeSection=key;renderEkwImport();changed();
}
function renderEkwImport(){
  const imp=project.legal?.ekwImport||{}; imp.sections=imp.sections||{IO:'',ISP:'',II:'',III:'',IV:''};
  ekwActiveSection=EKW_SECTION_META[imp.activeSection]?imp.activeSection:'IO';
  const meta=EKW_SECTION_META[ekwActiveSection], raw=String(imp.sections[ekwActiveSection]||'');
  if($('#ekwRawText')&&document.activeElement!==$('#ekwRawText'))$('#ekwRawText').value=raw;
  if($('#ekwRawLabel'))$('#ekwRawLabel').firstChild.textContent=`Treść ${meta.title} `;
  if($('#ekwSectionHelp'))$('#ekwSectionHelp').innerHTML=`<b>${escapeHTML(meta.title)}</b><p>${escapeHTML(meta.help)}</p>`;
  $$('.ekw-tab').forEach(b=>b.classList.toggle('active',b.dataset.ekwSection===ekwActiveSection));
  const saved=Object.entries(imp.sections).filter(([,v])=>String(v||'').trim().length>=10).map(([k])=>k);
  $('#ekwImportStatus').textContent=saved.length?`Zapisano ${saved.length}/5 działów EKW. Ostatni zapis: ${imp.importedAt?new Date(imp.importedAt).toLocaleString('pl-PL'):'-'}.`:'Nie zapisano jeszcze działów EKW.';
  $('#ekwSections').innerHTML=['IO','ISP','II','III','IV'].map(k=>`<span class="ekw-section-chip ${saved.includes(k)?'ok':''}">${EKW_SECTION_META[k].label}${saved.includes(k)?' ✓':''}</span>`).join('');
}
function ingestEkwText(text){
  const raw=String(text||'').trim();
  if(raw.length<5){showStatus(`Wklej treść ${EKW_SECTION_META[ekwActiveSection].label} z EKW albo informację o braku wpisów.`,'error');return false;}
  project.legal.ekwImport.sections=project.legal.ekwImport.sections||{IO:'',ISP:'',II:'',III:'',IV:''};
  project.legal.ekwImport.sections[ekwActiveSection]=raw;
  project.legal.ekwImport.activeSection=ekwActiveSection;
  project.legal.ekwImport.importedAt=new Date().toISOString();
  project.legal.ekwImport.sourceUrl='https://ekw.ms.gov.pl/';
  rebuildEkwRawText();renderEkwImport();changed();return true;
}
function applyEkwData(){
  rebuildEkwRawText();const f=parseEkwImported();
  const expected=normalizeKwLocal(project.legal.kwLocal||'');const detected=normalizeKwLocal(f.kwLocal||'');
  if(expected&&detected&&expected!==detected){showStatus(`BŁĄD EKW: wpisany numer ${expected} nie zgadza się z numerem rozpoznanym w Dziale I-O: ${detected}. Nie uzupełniono danych.`,`error`,12000);return;}
  const expectedCommon=normalizeKwLocal(project.legal.kwCommon||'');const detectedCommon=normalizeKwLocal(f.kwCommon||'');
  if(expectedCommon&&detectedCommon&&expectedCommon!==detectedCommon){showStatus(`BŁĄD EKW: KW nieruchomości wspólnej ${expectedCommon} nie zgadza się z numerem rozpoznanym w I-Sp/I-O: ${detectedCommon}.`,`error`,12000);return;}
  const io=project.legal.ekwImport.sections?.IO||'', isp=project.legal.ekwImport.sections?.ISP||'', ii=project.legal.ekwImport.sections?.II||'';
  f.ioRooms=labelValue(io,'Opis izby')||labelValue(io,'Opis izb');
  f.ispRightType=labelValue(isp,'Rodzaj prawa');
  f.currentEntryBasis=labelValue(ii,'Podstawa wpisu')||labelValue(ii,'Podstawa aktualnego wpisu własności');
  const map=[['legal.kwLocal',f.kwLocal],['legal.kwCommon',f.kwCommon],['legal.court',f.court],['legal.commonShare',f.commonShare],['legal.ispRightType',f.ispRightType],['legal.ioRooms',f.ioRooms],['legal.ownershipType',f.ownershipType],['legal.ownerNames',f.ownerNames],['legal.currentEntryBasis',f.currentEntryBasis],['legal.sectionIII',f.sectionIII],['legal.sectionIV',f.sectionIV],['property.city',f.city],['property.street',f.street],['property.buildingNo',f.buildingNo],['property.localNo',f.localNo],['property.floor',f.floor],['property.kwArea',f.kwArea],['valuation.legalStateDate',f.legalStateDate]];
  const avail=map.filter(([,v])=>isFilled(v)&&v!==0);
  if(!avail.length){showStatus('Nie rozpoznano danych. Sprawdź, czy wkleiłeś treść właściwych działów EKW.','error',7000);return;}
  const conflicts=avail.filter(([path,v])=>isFilled(getPath(project,path))&&String(getPath(project,path)).trim()!==String(v).trim());
  if(conflicts.length&&!confirm(`Import może nadpisać ${conflicts.length} już uzupełnionych pól. Kontynuować?`))return;
  avail.forEach(([path,v])=>setPath(project,path,v));
  project.sources=project.sources||[];
  if(!project.sources.some(x=>/Elektroniczne Księgi Wieczyste/i.test(x)))project.sources.unshift(`Elektroniczne Księgi Wieczyste – ekw.ms.gov.pl; badanie aktualnej treści: ${new Date(project.legal.ekwImport.importedAt).toLocaleString('pl-PL')}.`);
  bindStaticFields();renderLists();renderEkwImport();changed();showStatus(`Rozpoznano i uzupełniono ${avail.length} pól. Sprawdź je z EKW przed przejściem dalej.`,'info',7000);
}

function transactionOptions(selected){return (project.market.transactions||[]).map(t=>`<option value="${t.id}" ${Number(selected)===Number(t.id)?'selected':''}>${t.id} · ${escapeHTML(t.address||'bez adresu')}</option>`).join('');}
function nextTransactionId(){return Math.max(0,...(project.market.transactions||[]).map(x=>Number(x.id)||0))+1;}
// Aktualizuje wylacznie komorki liczone (Δt i C skorygowane) w istniejacych
// wierszach. Do 1.8.0 kazda zmiana pola przebudowywala cala tabele: lista
// rozwijana zamykala sie w trakcie wyboru, fokus uciekal, a poziomy suwak
// wracal na poczatek. Tabeli nie ruszamy — zmieniamy tylko liczby.
function odswiezKomorkiTransakcji(){
  const body=$('#transactionsBody'); if(!body) return;
  for(const tr of body.querySelectorAll('tr[data-tx-id]')){
    const id=Number(tr.dataset.txId);
    const t=(project.market?.transactions||[]).find(x=>Number(x.id)===id);
    const c=(calc?.correctedTransactions||[]).find(x=>Number(x.id)===id);
    const komorki=tr.querySelectorAll('.calc-cell');
    if(!komorki.length) continue;
    const miesiace=Number(c?.monthsToValuation ?? t?.monthsToValuation ?? 0);
    komorki[0].textContent=fmt(miesiace,2);
    if(komorki[1]) komorki[1].textContent=c?fmt(c.correctedPrice,2):'-';
  }
  renderPairComparisons();
}
function renderTransactions(){
  const body=$('#transactionsBody');if(!body)return;
  const features=project.market.features||[];const table=body.closest('table');const head=table?.querySelector('thead tr');
  if(head)head.innerHTML=[...(isPairModule()?['Do porównania']:[]),'Lp.','Adres','Data','Pow. m²',isPairModule()?'Opis/kond.':'Izby/kond.',...features.map(f=>escapeHTML(f.name||'Cecha')),'Cₜ zł/m²','Δt do daty wyceny [m-c]','Cₛ zł/m²',''].map(x=>`<th>${x}</th>`).join('');
  body.innerHTML='';if(!project.market.transactions.length){body.innerHTML=`<tr><td colspan="${9+features.length+(isPairModule()?1:0)}" class="empty-cell">Brak transakcji. Kliknij „+ Transakcja” albo „Importuj XLS/XLSX/CSV”.</td></tr>`;return;}
  project.market.transactions.forEach((t,i)=>{
    t.featureRatings=t.featureRatings||{};const c=calc.correctedTransactions.find(x=>x.id===Number(t.id));const autoMonths=Number(c?.monthsToValuation??t.monthsToValuation??0);const tr=document.createElement('tr');tr.dataset.txId=String(t.id);
    const pairCell=isPairModule()?`<td><input class="pair-use" type="checkbox" ${t.useForPair!==false?'checked':''} title="Uwzględnij tę nieruchomość w bezpośrednim porównaniu parami"></td>`:'';
    const featureCells=features.map(f=>`<td><select class="tx-feature" title="Ocena tej cechy dla nieruchomości podobnej według tej samej skali, którą zdefiniowano w dziale Cechy." data-fid="${escapeHTML(f.id)}"><option value="">— wybierz —</option>${ratingOptions(t.featureRatings[f.id],true,f)}</select></td>`).join('');
    tr.innerHTML=`${pairCell}<td><input class="tx-id" title="Numer porządkowy transakcji używany do odwołań w parach trendu i parach cech." type="number" value="${t.id}"></td><td><input class="tx-address" title="Adres lub jednoznaczne oznaczenie nieruchomości podobnej; dane identyfikacyjne w raporcie ogranicz do niezbędnego zakresu." value="${escapeHTML(t.address||'')}"></td><td><input class="tx-date" title="Data zawarcia transakcji. Na jej podstawie OPERO liczy okres do daty wyceny." type="date" value="${t.date||''}"></td><td><input class="tx-area" title="Powierzchnia użytkowa przyjęta dla nieruchomości podobnej i zgodna z przyjętą jednostką porównawczą." type="number" step="0.1" value="${t.area||0}"></td><td><input class="tx-rooms" title="Zwięzła informacja o liczbie izb i/lub kondygnacji, jeżeli jest używana do identyfikacji lub analizy podobieństwa." value="${escapeHTML(t.roomsFloor||'')}"></td>${featureCells}<td><input class="tx-price" title="Cena jednostkowa Cₜ przed aktualizacją na datę wyceny." type="number" step="1" value="${t.priceUnit||0}"></td><td class="calc-cell">${fmt(autoMonths,2)}</td><td class="calc-cell">${c?fmt(c.correctedPrice,2):'-'}</td><td><button class="icon-btn" data-edytuj-tx="${escapeHTML(String(t.id))}" title="Otwórz w osobnym oknie">✎</button><button class="icon-btn" title="Usuń">✕</button></td>`;
    const bind=(sel,key,numeric=false)=>$(sel,tr)?.addEventListener('change',e=>{t[key]=numeric?Number(e.target.value):e.target.value;if(key==='date'){t.autoMonthsToValuation=true;t.monthsToValuation=0;}changed();odswiezKomorkiTransakcji();});
    $('.tx-id',tr)?.addEventListener('change',e=>{
      const oldId=Number(t.id),next=Math.trunc(Number(e.target.value));
      if(!Number.isFinite(next)||next<1){e.target.value=oldId;showStatus('Numer transakcji musi być dodatnią liczbą całkowitą.','error');return;}
      if(next!==oldId&&project.market.transactions.some(x=>x!==t&&Number(x.id)===next)){e.target.value=oldId;showStatus(`Numer ${next} jest już użyty przez inną transakcję. Numery muszą być niepowtarzalne, bo pary trendu i pary cech odwołują się właśnie do nich.`,'error',8000);return;}
      if(next!==oldId){
        // Przenumerowanie musi objąć wszystkie odwołania, inaczej pary wskazywałyby nieistniejącą transakcję.
        (project.market.trendPairs||[]).forEach(pr=>{if(Number(pr.c1Id)===oldId)pr.c1Id=next;if(Number(pr.c2Id)===oldId)pr.c2Id=next;});
        (project.market.features||[]).forEach(f=>(f.pairs||[]).forEach(pr=>{if(Number(pr.cwId)===oldId)pr.cwId=next;if(Number(pr.cmId)===oldId)pr.cmId=next;}));
      }
      changed({fullDynamic:true});
    });
    $('.pair-use',tr)?.addEventListener('change',e=>{t.useForPair=e.target.checked;changed({fullDynamic:true});});bind('.tx-address','address');bind('.tx-date','date');bind('.tx-area','area',true);bind('.tx-rooms','roomsFloor');bind('.tx-price','priceUnit',true);
    $$('.tx-feature',tr).forEach(sel=>sel.addEventListener('change',()=>{t.featureRatings[sel.dataset.fid]=sel.value;changed();odswiezKomorkiTransakcji();}));
    $('.icon-btn',tr).addEventListener('click',()=>{project.market.transactions.splice(i,1);changed({fullDynamic:true});});body.appendChild(tr);
  });
  usunNatywneDymki($('#transactionsBody')||document);
}
function renderTrendPairs(){
  const body=$('#trendPairsBody');if(!body)return;body.innerHTML='';if(!project.market.trendPairs.length){body.innerHTML='<tr><td colspan="6" class="empty-cell">Brak par. Dodaj parę tylko wtedy, gdy trend wyznaczasz z transakcji.</td></tr>';return;}
  project.market.trendPairs.forEach((p,i)=>{const res=calc.trendPairs[i];const tr=document.createElement('tr');tr.innerHTML=`<td>${i+1}</td><td><select class="c1" title="C₁: transakcja późniejsza, bliższa dacie wyceny.">${transactionOptions(p.c1Id)}</select></td><td><select class="c2" title="C₂: transakcja wcześniejsza, dalsza od daty wyceny.">${transactionOptions(p.c2Id)}</select></td><td class="calc-cell">${res?.months?fmt(res.months,2):'-'}</td><td class="calc-cell ${res?.valid?'':'bad-cell'}">${res?.valid?fmt(res.rate,4)+'%':escapeHTML(res?.issue||'-')}</td><td><button class="icon-btn">✕</button></td>`;const sels=$$('select',tr);sels[0]?.addEventListener('change',()=>{p.c1Id=Number(sels[0].value);changed({fullDynamic:true});});sels[1]?.addEventListener('change',()=>{p.c2Id=Number(sels[1].value);changed({fullDynamic:true});});$('.icon-btn',tr).addEventListener('click',()=>{project.market.trendPairs.splice(i,1);changed({fullDynamic:true});});body.appendChild(tr);});
}
function stripDiacritics(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ł/g,'l').replace(/\s+/g,' ').trim();}
function numCell(v){const n=Number(String(v??'').replace(/\s/g,'').replace(/zł|zl|m²|m2/gi,'').replace(',','.'));return Number.isFinite(n)?n:0;}
function weightCell(v){const raw=String(v??'').trim(),pct=raw.includes('%');const n=Number(raw.replace(/\s/g,'').replace('%','').replace(',','.'));if(!Number.isFinite(n)||n<0)return 0;return pct?n/100:(n>1&&n<=100?n/100:n);}
function dateCell(v){if(typeof v==='number'&&Number.isFinite(v)&&v>20000&&v<100000){const d=new Date(Date.UTC(1899,11,30)+Math.round(v)*86400000);return d.toISOString().slice(0,10);}const s=String(v||'').trim();if(/^\d{5}(?:[.,]\d+)?$/.test(s)){const n=Number(s.replace(',','.'));if(n>20000&&n<100000){const d=new Date(Date.UTC(1899,11,30)+Math.round(n)*86400000);return d.toISOString().slice(0,10);}}let m=s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?s:'';}
function monthsBetween(date,valuationDate){const a=new Date(date),b=new Date(valuationDate);if(!Number.isFinite(a.getTime())||!Number.isFinite(b.getTime()))return 0;return Math.round(((b-a)/86400000/30.4375)*100)/100;}
function findHeader(rows,pred){for(let i=0;i<Math.min(rows.length,120);i++){const n=rows[i].map(stripDiacritics);if(pred(n))return i;}return -1;}
function parseTransactionsRows(rows){const hi=findHeader(rows,r=>r.some(x=>x.includes('adres'))&&r.some(x=>x.includes('data'))&&r.some(x=>x.includes('zl/m')||x.includes('c_t')||x==='ct' || x.includes('cena')));if(hi<0)return[];const h=rows[hi].map(stripDiacritics);const idx=(patterns)=>h.findIndex(x=>patterns.some(p=>x.includes(p)));const ia=idx(['adres']),idate=idx(['data']),iarea=idx(['pow']),iroom=idx(['izby','kond']),iprice=idx(['c_t','ct [','cena jednostk','zl/m']),imonth=idx(['t [m','m-c','liczba mies']);const iid=idx(['lp.','lp','nr']);const out=[];for(let r=hi+1;r<rows.length;r++){const row=rows[r]||[];const address=String(row[ia]||'').trim(),price=numCell(row[iprice]);if(!address&&!price){if(out.length&&r>hi+out.length+8)break;continue;}if(!price)continue;const date=dateCell(row[idate]);const featureRatings={};(project.market.features||[]).forEach(f=>{const fi=h.findIndex(x=>x===stripDiacritics(f.name)||x.includes(stripDiacritics(f.name)));if(fi>=0&&String(row[fi]||'').trim())featureRatings[f.id]=String(row[fi]).trim();});out.push({id:numCell(row[iid])||out.length+1,address,date,area:numCell(row[iarea]),roomsFloor:String(row[iroom]||'').trim(),priceUnit:price,monthsToValuation:0,autoMonthsToValuation:true,featureRatings,useForPair:isPairModule()});}return out;}
function parseTrendRows(rows){
  let hi=findHeader(rows,r=>r.some(x=>x.includes('nr c1'))&&r.some(x=>x.includes('nr c2'))&&r.some(x=>x.includes('t [m')||x.includes('m-c')));
  if(hi>=0){const h=rows[hi].map(stripDiacritics);const c1=h.findIndex(x=>x.includes('nr c1')),c2=h.findIndex(x=>x.includes('nr c2')),tm=h.findIndex(x=>x.includes('t [m')||x.includes('m-c'));const out=[];for(let r=hi+1;r<Math.min(rows.length,hi+80);r++){const c1Id=numCell(rows[r]?.[c1]),c2Id=numCell(rows[r]?.[c2]),months=numCell(rows[r]?.[tm]);if(c1Id&&c2Id&&months>0)out.push({c1Id,c2Id,months});else if(out.length&&r>hi+out.length+4)break;}return out;}
  hi=findHeader(rows,r=>r.some(x=>x.includes('transakcja'))&&r.some(x=>x.includes('liczba mies')));if(hi<0)return[];const h=rows[hi].map(stripDiacritics);const idcol=h.findIndex(x=>x.includes('transakcja'));const mcol=h.findIndex(x=>x.includes('liczba mies'));const items=[];for(let r=hi+1;r<Math.min(rows.length,hi+80);r++){const id=numCell(rows[r]?.[idcol]),months=numCell(rows[r]?.[mcol]);if(id)items.push({id,months});}const pairs=[];for(let i=0;i+1<items.length;i+=2){pairs.push({c1Id:items[i].id,c2Id:items[i+1].id,months:items[i].months||items[i+1].months||0});}return pairs.filter(x=>x.months>0);
}
function parseFeatureRows(rows){
  const defsHi=findHeader(rows,r=>r.some(x=>x.includes('cecha rynkowa'))&&r.some(x=>x.includes('ocena minimal'))&&r.some(x=>x.includes('ocena sred'))&&r.some(x=>x.includes('ocena maks')));
  if(defsHi<0)return[];const dh=rows[defsHi].map(stripDiacritics);const nameCol=dh.findIndex(x=>x.includes('cecha rynkowa')),minCol=dh.findIndex(x=>x.includes('ocena minimal')),avgCol=dh.findIndex(x=>x.includes('ocena sred')),maxCol=dh.findIndex(x=>x.includes('ocena maks'));const features=[];
  for(let r=defsHi+1;r<Math.min(rows.length,defsHi+25);r++){const name=String(rows[r]?.[nameCol]||'').trim();if(!name){if(features.length)break;continue;}features.push({id:newId(),name,weight:0,rating:'Przeciętna',scaleMin:String(rows[r]?.[minCol]||'').trim(),scaleLow:'',scaleAvg:String(rows[r]?.[avgCol]||'').trim(),scaleHigh:'',scaleMax:String(rows[r]?.[maxCol]||'').trim(),ratingNote:'',pairs:[]});}
  const pairHi=findHeader(rows,r=>r.some(x=>x==='cecha')&&r.some(x=>x.includes('cw nr'))&&r.some(x=>x.includes('cm nr')));
  if(pairHi>=0){const h=rows[pairHi].map(stripDiacritics);const cn=h.findIndex(x=>x==='cecha'),cw=h.findIndex(x=>x.includes('cw nr')),cm=h.findIndex(x=>x.includes('cm nr')),st=h.findIndex(x=>x.includes('roznica stopni')),wt=h.findIndex(x=>x.includes('przyjeta waga'));let current=null;for(let r=pairHi+1;r<Math.min(rows.length,pairHi+80);r++){const name=String(rows[r]?.[cn]||'').trim();if(name){current=features.find(f=>stripDiacritics(f.name)===stripDiacritics(name))||null;}const cwId=numCell(rows[r]?.[cw]),cmId=numCell(rows[r]?.[cm]);if(current&&cwId&&cmId)current.pairs.push({cwId,cmId,steps:Math.max(1,numCell(rows[r]?.[st])||1)});const weight=weightCell(rows[r]?.[wt]);if(current&&weight>0)current.weight=weight;}}
  return features;
}
async function importMarketSpreadsheet(){
  try{
    const r=await window.operatAPI.importMarketSpreadsheet();if(r.canceled)return;
    let pairs=[],features=[];
    for(const sh of r.sheets||[]){const pr=parseTrendRows(sh.rows||[]);if(pr.length>pairs.length)pairs=pr;const fr=parseFeatureRows(sh.rows||[]);if(fr.length>features.length)features=fr;}
    let importedFeatureSet=false;
    if(features.length&&confirm(`Arkusz zawiera także ${features.length} definicji cech rynkowych. Wczytać je przed odczytem ocen transakcji?`)){project.market.features=features;importedFeatureSet=true;}
    let best=[];for(const sh of r.sheets||[]){const tr=parseTransactionsRows(sh.rows||[]);if(tr.length>best.length)best=tr;}
    if(!best.length){showStatus('Nie rozpoznano tabeli transakcji. Oczekiwane są nagłówki m.in. Adres, Data i Cₜ / cena zł/m². Możesz zapisać arkusz jako CSV albo wpisać transakcje ręcznie.','error',8500);return;}
    if(project.market.transactions.length&&!confirm(`Import znaleziono ${best.length} transakcji. Zastąpić aktualną tabelę?`))return;
    project.market.transactions=best;if(pairs.length){project.market.trendPairs=pairs;project.market.trendSourceMode='pairs';}
    $('#importSummary').textContent=`Zaimportowano ${best.length} transakcji${pairs.length?` · ${pairs.length} par trendu`:''}${importedFeatureSet?` · ${features.length} cech rynkowych`:''} z: ${r.filePath}. Δt wyliczono z dat. Sprawdź ceny, oceny cech i źródło wag przed wyceną.`;
    changed({fullDynamic:true});showStatus('Import zakończony. Silnik OPERO przeliczył okresy z dat i powiązał rozpoznane kolumny cech z transakcjami. Zweryfikuj dane wejściowe.','info',8000);
  }catch(e){showStatus(`Import arkusza: ${cleanRemoteError(e)}`,'error',9000);}
}
function featureScaleMode(f){return f?.scaleMode||project.market.ratingMode||'three';}
function ratingOptions(current,allowBlank=false,feature=null){const mode=typeof feature==='string'?feature:featureScaleMode(feature);const arr=mode==='five'?['Bardzo niekorzystna','Niekorzystna','Przeciętna','Korzystna','Bardzo korzystna']:mode==='two'?['Niekorzystna','Korzystna']:['Niekorzystna','Przeciętna','Korzystna'];let c=current;if(!arr.includes(c))c=allowBlank?'':(mode==='two'?'Niekorzystna':'Przeciętna');const desc=feature&&typeof feature==='object'?{'Bardzo niekorzystna':feature.scaleMin,'Niekorzystna':mode==='five'?feature.scaleLow:feature.scaleMin,'Przeciętna':feature.scaleAvg,'Korzystna':mode==='five'?feature.scaleHigh:feature.scaleMax,'Bardzo korzystna':feature.scaleMax}:{};return arr.map(x=>`<option value="${x}" ${x===c?'selected':''}>${x}${desc[x]?` — ${escapeHTML(String(desc[x]).slice(0,55))}`:''}</option>`).join('');}
function selectedRatingDescription(f){const sm=featureScaleMode(f);const map={'Bardzo niekorzystna':f.scaleMin,'Niekorzystna':sm==='five'?f.scaleLow:f.scaleMin,'Przeciętna':f.scaleAvg,'Korzystna':sm==='five'?f.scaleHigh:f.scaleMax,'Bardzo korzystna':f.scaleMax};return map[f.rating]||'';}
function renderFeatureRatingMatrix(){
  const root=$('#featureRatingMatrix');if(!root)return;const tx=(project.market.transactions||[]).filter(t=>Number(t.priceUnit)>0||isFilled(t.address));const feats=project.market.features||[];
  if(!tx.length){root.innerHTML='<p class="hint">Najpierw dodaj transakcje porównawcze w dziale Rynek.</p>';return;}
  const rows=tx.map(t=>{t.featureRatings=t.featureRatings||{};return `<tr><td>${t.id}</td><td>${escapeHTML(t.address||'')}</td><td>${fmt(t.priceUnit||0,2)}</td>${feats.map(f=>`<td><select class="matrix-rating" title="Ocena cechy dla nieruchomości podobnej według tej samej skali, która obowiązuje dla nieruchomości wycenianej." data-tid="${t.id}" data-fid="${escapeHTML(f.id)}"><option value="">— brak —</option>${ratingOptions(t.featureRatings[f.id],true,f)}</select></td>`).join('')}</tr>`;}).join('');
  root.innerHTML=`<table class="edit-table"><thead><tr><th>Lp.</th><th>Adres</th><th>Cₜ zł/m²</th>${feats.map(f=>`<th>${escapeHTML(f.name)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
  usunNatywneDymki(root);
  $$('.matrix-rating',root).forEach(sel=>sel.addEventListener('change',()=>{
    const t=project.market.transactions.find(x=>Number(x.id)===Number(sel.dataset.tid));
    if(!t) return;
    t.featureRatings=t.featureRatings||{};
    t.featureRatings[sel.dataset.fid]=sel.value;
    // Bez przebudowy macierzy — inaczej lista zamykalaby sie przy kazdym wyborze.
    changed();
    odswiezKomorkiTransakcji();
    const bliz=$(`#transactionsBody tr[data-tx-id="${t.id}"] .tx-feature[data-fid="${sel.dataset.fid}"]`);
    if(bliz) bliz.value=sel.value;
  }));
}
/* ===========================================================================
   POMOC PRZY CECHACH RYNKOWYCH I WAGACH
   ---------------------------------------------------------------------------
   Trzy decyzje, ktorym weryfikator przyglada sie najuwazniej: ktore cechy,
   jaka waga, jaka ocena. Program podpowiada zestaw stosowany na tym rynku,
   typowe przedzialy wag z praktyki i definicje trzech stopni - ale nie
   wybiera za rzeczoznawce i nie ustala wag.

   Najgrozniejszy blad w tej tabeli nie wyglada na blad: gdy wagi sumuja sie
   do 90% zamiast 100%, silnik policzy wartosc, operat wyjdzie, PDF sie
   wygeneruje - a wynik bedzie zanizony o dziesiec procent i nikt tego nie
   zobaczy. Dlatego suma wag stoi na wierzchu, w kolorze.

   UWAGA NA JEDNOSTKI: silnik liczy wagi w skali 0-1, a czlowiek mysli
   procentami. Modul cech podaje procenty; tutaj dzielimy przez sto.
   ========================================================================= */

function cechyRodzajOperatu(){
  const C = window.OperoCechy;
  return C ? C.rodzaj(project.module?.code || '', { zabudowana: isPairModule() }) : 'lokal';
}

/** Suma wag i uwagi — zawsze widoczne nad tabelą cech. */
function cechyRysujPomoc(){
  const C = window.OperoCechy;
  const karta = $('#cechyPomoc');
  if (!C || !karta) return;
  const wProcentach = (project.market?.features || []).map(f => ({
    nazwa: f.name || '(bez nazwy)', waga: Math.round(Number(f.weight || 0) * 1000) / 10,
  }));
  const w = C.sprawdzWagi(wProcentach);
  const suma = $('#cechySuma');
  if (suma){
    suma.dataset.waga = w.waga;
    suma.innerHTML = `<b>Suma wag: ${w.suma.toLocaleString('pl-PL')}%</b>`
      + `<span>${w.waga === 'ok' ? 'Wagi sumują się poprawnie.'
        : w.waga === 'blad' ? 'Tak nie wolno zostawić — wynik będzie zaniżony albo zawyżony.'
        : 'Da się policzyć, ale przejrzyj uwagi niżej.'}</span>`
      + `<i>${(project.market?.features || []).length} ${window.OperoSzukanie
        ? window.OperoSzukanie.odmien((project.market?.features || []).length, 'cecha', 'cechy', 'cech') : 'cech'}</i>`;
  }
  const uwagi = $('#cechyUwagi');
  if (uwagi){
    uwagi.innerHTML = w.uwagi.map(u => `<li>${escapeHTML(u)}</li>`).join('');
    uwagi.classList.toggle('hidden', !w.uwagi.length);
  }
}

/** Lista cech z katalogu do zaznaczenia. */
function cechyPokazWybor(){
  const C = window.OperoCechy;
  const root = $('#cechyWybor');
  if (!C || !root) return;
  const rodzaj = cechyRodzajOperatu();
  const zestaw = C.zestaw(rodzaj);
  const juzSa = new Set((project.market?.features || []).map(f => String(f.name || '').toLowerCase()));
  root.classList.remove('hidden');
  root.innerHTML = `
    <p class="cechy-wybor-wstep">Zestaw stosowany najczęściej przy wycenie: <b>${escapeHTML(zestaw.nazwa.toLowerCase())}</b>.
      Zaznacz te, które na Twoim rynku rzeczywiście różnicują ceny. Podane widełki wag to
      <b>przedziały spotykane w praktyce, a nie norma</b> — żaden przepis nie ustala wag, ustala je rzeczoznawca na podstawie analizy rynku.</p>
    <div class="cechy-lista">${zestaw.cechy.map((c, i) => `
      <label class="cechy-pozycja">
        <input type="checkbox" data-cecha-i="${i}" ${juzSa.has(c.nazwa.toLowerCase()) ? '' : 'checked'}>
        <div>
          <b>${escapeHTML(c.nazwa)}<i>${c.wagaOd}–${c.wagaDo}%</i></b>
          <p>${escapeHTML(c.opis)}</p>
          ${c.uwaga ? `<small>${escapeHTML(c.uwaga)}</small>` : ''}
          <div class="cechy-stopnie">${C.skala(c).map(s =>
            `<span><b>${escapeHTML(s.ocena)}</b> ${escapeHTML(s.opis)}</span>`).join('')}</div>
        </div>
      </label>`).join('')}</div>
    <div class="button-row">
      <button type="button" class="btn primary" data-cechy-wstaw="1">Wstaw zaznaczone do tabeli</button>
      <button type="button" class="btn ghost" data-cechy-anuluj="1">Zamknij</button>
    </div>`;

  root.querySelector('[data-cechy-anuluj]')?.addEventListener('click', () => root.classList.add('hidden'));
  root.querySelector('[data-cechy-wstaw]')?.addEventListener('click', () => {
    const wybrane = [...root.querySelectorAll('[data-cecha-i]')]
      .filter(ch => ch.checked).map(ch => zestaw.cechy[Number(ch.dataset.cechaI)]);
    if (!wybrane.length){
      mowi('Nie zaznaczyłeś żadnej cechy.', { rodzaj: 'pytanie', grupa: 'Cechy rynkowe' });
      return;
    }
    cechyWstaw(wybrane, rodzaj);
    root.classList.add('hidden');
  });
}

/**
 * Wstawienie cech do tabeli operatu.
 *
 * Razem z cecha wchodza DEFINICJE TRZECH STOPNI. Bez nich ocena „korzystna"
 * jest slowem bez tresci, a weryfikator pyta wlasnie o to: co konkretnie
 * znaczy ten stopien dla tej cechy na tym rynku.
 */
function cechyWstaw(wybrane, rodzaj){
  const C = window.OperoCechy;
  const zPropozycja = C.sugeruj(rodzaj).filter(p => wybrane.some(w => w.id === p.id));
  // Wagi przeliczamy jeszcze raz TYLKO dla wybranych, zeby sumowaly sie do 100%.
  const wyrownane = C.wyrownaj(zPropozycja.map(p => ({ ...p, waga: C.srodekWagi(p) })));
  const istniejace = project.market.features || [];
  const nowe = wyrownane.map((p, i) => {
    const skala = C.skala(p.id);
    return {
      id: Date.now() + i,
      name: p.nazwa,
      weight: Math.round(p.waga) / 100,
      scaleMode: 'three',
      rating: 'Przeciętna',
      ratingNote: '',
      scaleMin: skala[0].opis,
      scaleAvg: skala[1].opis,
      scaleMax: skala[2].opis,
      pairs: [],
    };
  });
  const zastap = istniejace.length
    ? confirm(`W tabeli jest już ${istniejace.length} cech. Zastąpić je ${nowe.length} podpowiedzianymi?\n\n`
      + 'Anuluj = dopisze podpowiedziane do istniejących.')
    : true;
  project.market.features = zastap ? nowe : [...istniejace, ...nowe];
  if (!zastap) project.market.features = window.OperoCechy.wyrownaj(
    project.market.features.map(f => ({ ...f, waga: Math.round(Number(f.weight || 0) * 1000) / 10 })))
    .map(f => ({ ...f, weight: Math.round(f.waga * 10) / 1000 }));
  changed({ fullDynamic: true });
  renderAll();
  mowi(`Wstawiłem ${nowe.length} ${window.OperoSzukanie ? window.OperoSzukanie.odmien(nowe.length, 'cechę', 'cechy', 'cech') : 'cech'} `
    + 'razem z definicjami trzech stopni oceny.', {
    rodzaj: 'sukces', grupa: 'Cechy rynkowe',
    szczegoly: 'Wagi to środki przedziałów spotykanych w praktyce, wyrównane do 100%. '
      + 'Przyjmij własne na podstawie analizy rynku — przy każdej cesze stoi przedział, z którego pochodzi podpowiedź.',
  });
}

/** Wyrównanie wag w tabeli do 100% z zachowaniem proporcji. */
function cechyWyrownajWagi(){
  const C = window.OperoCechy;
  const lista = project.market?.features || [];
  if (!C || !lista.length) return;
  const wyrownane = C.wyrownaj(lista.map(f => ({ waga: Math.round(Number(f.weight || 0) * 1000) / 10 })));
  lista.forEach((f, i) => { f.weight = Math.round(wyrownane[i].waga * 10) / 1000; });
  changed({ fullDynamic: true });
  renderAll();
  mowi('Wyrównałem wagi do 100%, zachowując proporcje między cechami.', {
    rodzaj: 'sukces', grupa: 'Cechy rynkowe',
    szczegoly: 'Proporcje zostały Twoje — zmieniła się tylko skala, żeby suma wyniosła dokładnie 100%.',
  });
}

/** Przyjęcie wag policzonych przez silnik z par albo z korelacji. */
function cechyZSugestii(){
  const lista = project.market?.features || [];
  const c = calc || obliczProjekt();
  const metoda = project.market?.weightMethod || 'manual';
  if (metoda === 'manual'){
    mowi('Najpierw wybierz, skąd mają pochodzić wagi: z analizy par czy z analizy statystycznej. '
      + 'Przy ustawieniu „ręcznie" program nie ma czego podpowiedzieć.',
      { rodzaj: 'pytanie', grupa: 'Cechy rynkowe' });
    return;
  }
  const sugestie = (c.features || []).map(f => Number(f.suggestedWeight) || 0);
  const suma = sugestie.reduce((s, x) => s + x, 0);
  if (!suma){
    mowi('Program nie ma jeszcze z czego policzyć wag: przy analizie par potrzebne są pary transakcji, '
      + 'a przy analizie statystycznej — oceny cech przy transakcjach porównawczych.',
      { rodzaj: 'ostrzezenie', grupa: 'Cechy rynkowe' });
    return;
  }
  lista.forEach((f, i) => { f.weight = Math.round(sugestie[i] / suma * 1000) / 1000; });
  changed({ fullDynamic: true });
  renderAll();
  mowi(`Przyjąłem wagi z ${metoda === 'pairs' ? 'analizy par nieruchomości' : 'analizy statystycznej zbioru'}.`, {
    rodzaj: 'sukces', grupa: 'Cechy rynkowe',
    szczegoly: window.OperoCechy
      ? window.OperoCechy.uzasadnienieWag(metoda, { ile: lista.length })
      : '',
  });
}

function hookCechy(){
  $('#cechyPodpowiedz')?.addEventListener('click', cechyPokazWybor);
  $('#cechyWyrownaj')?.addEventListener('click', cechyWyrownajWagi);
  $('#cechyZSugestii')?.addEventListener('click', cechyZSugestii);
}

function renderFeatures(){const root=$('#featuresEditor');if(!root)return;root.innerHTML='';project.market.features.forEach((f,fi)=>{const cf=calc.features[fi];const div=document.createElement('div');div.className='feature-card';const sm=featureScaleMode(f);const scaleHtml=sm==='five'?`<div class="feature-scales five"><label data-help="Definicja najniższego poziomu cechy.">Bardzo niekorzystna<textarea class="fmin" rows="2">${escapeHTML(f.scaleMin||'')}</textarea></label><label data-help="Definicja poziomu pomiędzy minimum a poziomem przeciętnym.">Niekorzystna<textarea class="flow" rows="2">${escapeHTML(f.scaleLow||'')}</textarea></label><label data-help="Definicja poziomu typowego / przeciętnego dla badanego rynku.">Przeciętna<textarea class="favg" rows="2">${escapeHTML(f.scaleAvg||'')}</textarea></label><label data-help="Definicja poziomu pomiędzy przeciętnym a maksimum.">Korzystna<textarea class="fhigh" rows="2">${escapeHTML(f.scaleHigh||'')}</textarea></label><label data-help="Definicja najwyższego poziomu cechy.">Bardzo korzystna<textarea class="fmax" rows="2">${escapeHTML(f.scaleMax||'')}</textarea></label></div>`:sm==='two'?`<div class="feature-scales"><label data-help="Definicja niższego poziomu cechy.">Niekorzystna<textarea class="fmin" rows="2">${escapeHTML(f.scaleMin||'')}</textarea></label><label data-help="Definicja wyższego poziomu cechy.">Korzystna<textarea class="fmax" rows="2">${escapeHTML(f.scaleMax||'')}</textarea></label></div>`:`<div class="feature-scales"><label data-help="Definicja najniższego poziomu cechy w skali 3-stopniowej.">Niekorzystna<textarea class="fmin" rows="2">${escapeHTML(f.scaleMin||'')}</textarea></label><label data-help="Definicja poziomu przeciętnego / typowego dla badanego rynku.">Przeciętna<textarea class="favg" rows="2">${escapeHTML(f.scaleAvg||'')}</textarea></label><label data-help="Definicja najwyższego poziomu cechy w skali 3-stopniowej.">Korzystna<textarea class="fmax" rows="2">${escapeHTML(f.scaleMax||'')}</textarea></label></div>`;
  div.innerHTML=`<div class="feature-main"><div class="feature-index">${fi+1}</div><label data-help="Nazwa czynnika, który według analizy rynku rzeczywiście różnicuje ceny nieruchomości podobnych.">Nazwa cechy<input class="fname" value="${escapeHTML(f.name||'')}"></label><label data-help="Liczba poziomów skali może być różna dla różnych cech, jeżeli wynika to z analizy rynku.">Skala cechy<select class="fscale"><option value="two" ${sm==='two'?'selected':''}>2-stopniowa</option><option value="three" ${sm==='three'?'selected':''}>3-stopniowa</option><option value="five" ${sm==='five'?'selected':''}>5-stopniowa</option></select></label><label data-help="Waga nie jest wartością domyślną. Musi zostać świadomie przyjęta na podstawie analizy i łącznie z pozostałymi wagami dawać 1,00.">Waga<input class="fweight" type="number" step="0.01" min="0" max="1" value="${Number(f.weight||0)}"></label><label data-help="Ocena wycenianej nieruchomości w odniesieniu do zdefiniowanej skali tej cechy.">Ocena<select class="frating">${ratingOptions(f.rating,false,f)}</select></label><div class="weight-badge">Sugestia (${escapeHTML(project.market.weightMethod||'brak')}): <b>${fmt(cf?.suggestedWeight||0,4)}</b>${cf?.correlation!=null?`<small> r=${fmt(cf.correlation,3)}</small>`:''}</div><button class="btn danger small delete-feature" ${project.market.features.length<=1?'disabled':''}>Usuń cechę</button></div>
  <div class="selected-rating-box"><span>Wybrano: <b>${escapeHTML(f.rating||'')}</b></span><p>${escapeHTML(selectedRatingDescription(f)||'Uzupełnij definicję dokładnie tego poziomu skali.')}</p><label data-help="Wyjaśnij, które fakty o wycenianej nieruchomości odpowiadają wybranemu poziomowi zdefiniowanej skali cechy.">Uzasadnienie tej konkretnej oceny<textarea class="fratingnote" rows="3" placeholder="Dlaczego wyceniany lokal otrzymuje właśnie tę ocenę?">${escapeHTML(f.ratingNote||'')}</textarea></label><button class="btn per-inline feature-per" data-per-target="market.features.${fi}.ratingNote" data-per-task="Zredaguj uzasadnienie wybranej oceny cechy rynkowej „${escapeHTML(f.name||'')}” na podstawie tekstu wpisanego przez użytkownika, wybranej oceny i definicji skali. Nie zmieniaj oceny ani wagi.">✦ Zredaguj (PER)</button></div>
  <details class="scale-details" open><summary>Definicje ${sm==='five'?'5-stopniowej':sm==='two'?'2-stopniowej':'3-stopniowej'} skali cechy</summary>${scaleHtml}</details>
  <div class="feature-pairs"><div class="card-head"><div><strong>Pary transakcji do oszacowania wpływu tej cechy</strong><p class="hint">To materiał do uzasadnienia wagi cechy. Liczba par nie jest ograniczona.</p></div><button class="btn small add-pair">+ Para dla tej cechy</button></div><div class="pairs"></div></div>`;
    const update=(key,el,numeric=false)=>el&&el.addEventListener('change',()=>{f[key]=numeric?Number(el.value):el.value;changed({fullDynamic:true});});update('name',$('.fname',div));$('.fscale',div)?.addEventListener('change',e=>{convertFeatureScale(f,e.target.value);changed({fullDynamic:true});});update('weight',$('.fweight',div),true);update('rating',$('.frating',div));update('scaleMin',$('.fmin',div));update('scaleLow',$('.flow',div));update('scaleAvg',$('.favg',div));update('scaleHigh',$('.fhigh',div));update('scaleMax',$('.fmax',div));$('.fratingnote',div).addEventListener('input',e=>{f.ratingNote=e.target.value;changed();});
    const pairs=$('.pairs',div);(f.pairs||[]).forEach((pr,pi)=>{const r=cf?.pairResults?.[pi];const line=document.createElement('div');line.className='pair-line';line.innerHTML=`<label data-help="Numer transakcji reprezentującej korzystniejszy poziom analizowanej cechy przy możliwie podobnych pozostałych cechach.">Cw — nr<select class="cw">${transactionOptions(pr.cwId)}</select></label><label data-help="Numer transakcji reprezentującej mniej korzystny poziom analizowanej cechy przy możliwie podobnych pozostałych cechach.">Cm — nr<select class="cm">${transactionOptions(pr.cmId)}</select></label><label data-help="Liczba poziomów skali dzieląca oceny Cw i Cm; służy do przeliczenia obserwowanej różnicy ceny na wpływ jednego stopnia cechy.">Różnica stopni<input class="steps" type="number" step="1" min="1" value="${pr.steps||1}"></label><div class="pair-result">Wpływ po uwzgl. stopni:<br><b>${fmt(r?.rawInfluence||0,4)}</b></div><button class="icon-btn">✕</button>`;$('.cw',line).addEventListener('change',e=>{pr.cwId=Number(e.target.value);changed({fullDynamic:true});});$('.cm',line).addEventListener('change',e=>{pr.cmId=Number(e.target.value);changed({fullDynamic:true});});$('.steps',line).addEventListener('change',e=>{pr.steps=Math.max(1,Number(e.target.value));changed({fullDynamic:true});});$('.icon-btn',line).addEventListener('click',()=>{f.pairs.splice(pi,1);changed({fullDynamic:true});});pairs.appendChild(line);});
    $('.add-pair',div).addEventListener('click',()=>{if(project.market.transactions.length<2){showStatus('Najpierw dodaj co najmniej 2 transakcje porównawcze.','error');return;}f.pairs=f.pairs||[];f.pairs.push({cwId:project.market.transactions[0].id,cmId:project.market.transactions[1].id,steps:1});changed({fullDynamic:true});});$('.delete-feature',div).addEventListener('click',()=>{if(confirm(`Usunąć cechę „${f.name}”?`)){project.market.features.splice(fi,1);project.market.transactions.forEach(t=>{if(t.featureRatings)delete t.featureRatings[f.id];});changed({fullDynamic:true});}});root.appendChild(div);});renderFeatureRatingMatrix();cechyRysujPomoc();applyHelpTooltips();bindPerButtons();}

function renderPhotos(){const root=$('#photoGrid');if(!root)return;root.innerHTML='';if(!project.photos.length){root.innerHTML='<p class="hint">Nie dodano jeszcze fotografii.</p>';return;}project.photos.forEach((ph,i)=>{const div=document.createElement('div');div.className='photo-card';div.innerHTML=`<img src="${ph.dataUrl}" alt=""><div class="photo-fields"><label>Kategoria<select class="pcat">${['Okładka','Działka','Budynek','Otoczenie','Części wspólne','Lokal','Wnętrze','Załącznik'].map(x=>`<option ${x===ph.category?'selected':''}>${x}</option>`).join('')}</select></label><label>Podpis<input class="pcap" value="${escapeHTML(ph.caption||ph.name||'')}"></label><div class="photo-actions"><label class="check"><input class="pcover" type="checkbox" ${ph.cover?'checked':''}> Okładka</label><button class="btn danger small">Usuń</button></div></div>`;$('.pcat',div).addEventListener('change',e=>{ph.category=e.target.value;changed();});$('.pcap',div).addEventListener('input',e=>{ph.caption=e.target.value;changed();});$('.pcover',div).addEventListener('change',e=>{project.photos.forEach(x=>x.cover=false);ph.cover=e.target.checked;renderPhotos();changed();});$('.btn.danger',div).addEventListener('click',()=>{project.photos.splice(i,1);renderPhotos();changed();});root.appendChild(div);});}
function bytesLabel(n){const v=Number(n||0);return v>=1048576?`${fmt(v/1048576,2)} MB`:`${fmt(v/1024,0)} KB`;}
function renderFiles(){const root=$('#fileList');if(!root)return;root.innerHTML='';if(!project.files.length){root.innerHTML='<p class="hint">Nie dodano plików źródłowych.</p>';return;}project.files.forEach((f,i)=>{const row=document.createElement('div');row.className='file-editor-item';const icon=String(f.mime||'').startsWith('image/')&&f.previewDataUrl?`<img class="file-thumb" src="${f.previewDataUrl}">`:`<div class="file-icon">${escapeHTML((f.extension||'PLIK').toUpperCase().slice(0,5))}</div>`;row.innerHTML=`${icon}<div class="file-meta"><strong>${escapeHTML(f.name||'plik')}</strong><small>${escapeHTML(f.mime||f.extension||'plik')} · ${bytesLabel(f.size)}</small><label>Opis / podpis<input class="fdesc" value="${escapeHTML(f.description||'')}"></label></div><div class="file-actions"><label class="check"><input class="finclude" type="checkbox" ${f.includeInPDF===false?'':'checked'}> Pokaż w PDF</label><button class="btn danger small">Usuń</button></div>`;$('.fdesc',row).addEventListener('input',e=>{f.description=e.target.value;changed();});$('.finclude',row).addEventListener('change',e=>{f.includeInPDF=e.target.checked;changed();});$('.btn.danger',row).addEventListener('click',()=>{project.files.splice(i,1);renderFiles();changed();});root.appendChild(row);});}
function buildMapsUrl(){const l=project.location||{};if(String(l.manualMapsUrl||'').trim())return String(l.manualMapsUrl).trim();const lat=Number(l.latitude),lng=Number(l.longitude);const hasCoords=String(l.latitude)!==''&&String(l.longitude)!==''&&Number.isFinite(lat)&&Number.isFinite(lng);const q=hasCoords?`${lat},${lng}`:[project.property.street?`ul. ${project.property.street}`:'',project.property.buildingNo,project.property.city,'Polska'].filter(Boolean).join(' ');return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;}
async function ensureMapsQR(force=false){if(project.location.includeMapsQR===false){project.location.mapsQrDataUrl='';renderMapsQRPreview();return;}const url=buildMapsUrl();if(force||!project.location.mapsQrDataUrl||project.location._qrFor!==url){const r=await window.operatAPI.generateMapsQR(url);project.location.mapsUrl=url;project.location.mapsQrDataUrl=r.dataUrl||'';project.location._qrFor=url;}renderMapsQRPreview();}
function renderMapsQRPreview(){const img=$('#mapsQrPreview');if(!img)return;const url=project.location.mapsUrl||buildMapsUrl(),data=project.location.mapsQrDataUrl||'';img.src=data;img.style.display=data?'block':'none';$('#mapsQrUrl').textContent=url;$('#mapsQrAddress').textContent=[project.property.city,project.property.street?`ul. ${project.property.street} ${project.property.buildingNo||''}`:''].filter(Boolean).join(' · ')||'Brak adresu';}
function updateCosting(){if(!$('#costTotal'))return;const c=getCalc().calculateCost(project);$('#costLabor').textContent=money(c.labor,2);$('#costTravel').textContent=money(c.travel,2);$('#costTotal').textContent=money(c.totalCost,2);$('#costGross').textContent=money(c.feeGross,2);$('#costProfit').textContent=money(c.profit,2);$('#costMargin').textContent=`${fmt(c.margin,1)}%`;$('#costBreakdown').innerHTML=`<div><span>Praca</span><b>${money(c.labor,2)}</b></div><div><span>Dojazd</span><b>${money(c.travel,2)}</b></div><div><span>Dokumenty / dane</span><b>${money(c.documents,2)}</b></div><div><span>Druk / oprawa</span><b>${money(c.printing,2)}</b></div><div><span>Narzędzia zewnętrzne</span><b>${money(c.tools,2)}</b></div><div><span>Inne</span><b>${money(c.other,2)}</b></div><div class="total"><span>Łączny koszt</span><b>${money(c.totalCost,2)}</b></div><div class="total"><span>Wynagrodzenie netto</span><b>${money(c.feeNet,2)}</b></div>`;}
async function loadHistory(){try{const r=await window.operatAPI.listHistory();historyEntries=r.entries||[];renderHistory(r.stats||{});renderDashboard();}catch(e){showStatus(`Historia: ${cleanRemoteError(e)}`,'error');}}
function renderHistory(stats){if(!$('#historyList'))return;$('#historyCount').textContent=stats.count??historyEntries.length;$('#historyCost').textContent=money(stats.totalCost||0,2);$('#historyFees').textContent=money(stats.totalFees||0,2);$('#historyProfit').textContent=money(stats.totalProfit||0,2);const q=($('#historySearch').value||'').toLowerCase().trim();const list=historyEntries.filter(x=>!q||`${x.title} ${x.kw} ${x.status}`.toLowerCase().includes(q));const root=$('#historyList');root.innerHTML='';if(!list.length){root.innerHTML=q?'<p class="hint">Brak zapisanych operatów.</p>':'<div class="historia-pusto"><span>◷</span><b>Historia jest jeszcze pusta</b><p>Brak zapisanych operatów. Każdy operat zapisuje się tutaj sam — razem z wartością, kosztem wykonania i wynikiem.</p><button class="btn primary" type="button" id="historiaDoStartu">Opisz pierwszy operat →</button></div>';$('#historiaDoStartu')?.addEventListener('click',()=>{switchTab('dashboard');setTimeout(()=>$('#opisTekst')?.focus(),120);});return;}list.forEach(x=>{const row=document.createElement('div');row.className='history-item';const zatw=/zatwierdz/i.test(String(x.status||''));row.dataset.stan=zatw?'zatwierdzony':'roboczy';row.innerHTML=`<div class="history-main"><strong>${escapeHTML(x.title)}</strong><span><i class="historia-stan">${escapeHTML(x.status||'Roboczy')}</i>${x.kw?`KW ${escapeHTML(x.kw)} · `:''}${new Date(x.updatedAt).toLocaleString('pl-PL')}</span></div><div class="history-numbers"><span>Wartość <b>${money(x.valueRounded||0,0)}</b></span><span>Koszt <b>${money(x.totalCost||0,2)}</b></span><span>Wynik <b>${money(x.profit||0,2)}</b></span></div><div class="history-actions"><button class="btn small open-history">Otwórz</button><button class="btn danger small delete-history">Usuń</button></div>`;$('.open-history',row).addEventListener('click',()=>openHistoryEntry(x.id));$('.delete-history',row).addEventListener('click',async()=>{if(confirm(`Usunąć z historii: ${x.title}?`)){try{await window.operatAPI.deleteHistory(x.id);await loadHistory();showStatus('Operat usunięty z Historii.','info');}catch(e){showStatus(`Nie udało się usunąć: ${cleanRemoteError(e)}`,'error',7000);}}});root.appendChild(row);});}
async function saveCurrentToHistory(pdfPath=''){calc=obliczProjekt();if(pdfPath)project.meta.lastPdfPath=pdfPath;project.meta.lastValueRounded=calc.valueRounded;project.meta.lastUnitValue=calc.unitAfterRound;const r=await window.operatAPI.saveHistory({project,calc:{valueRounded:calc.valueRounded,unitAfterRound:calc.unitAfterRound},pdfPath});await loadHistory();return r;}
function renderLists(){if($('#legalBasesList'))$('#legalBasesList').value=(project.legalBases||[]).join('\n');if($('#sourcesList'))$('#sourcesList').value=(project.sources||[]).join('\n');if($('#attachmentsList'))$('#attachmentsList').value=(project.attachments||[]).join('\n');}
// Wybor motywu musi byc widoczny w podgladzie. Generator raportu liczy kolor tak:
// accent = project.appearance.accent || motyw.accent — a accent jest ustawiony ZAWSZE
// (domyslnie zloty), wiec sam wybor motywu nigdy nic nie zmienial. Dlatego przy zmianie
// motywu przepisujemy jego kolor i font do ustawien i odswiezamy kontrolki.
function bezCudzyslowow(v){ return String(v||'').replace(/["']/g,'').replace(/\s+/g,' ').trim().toLowerCase(); }
function zastosujMotyw(klucz){
  let motyw=null;
  try { motyw=(getReport().THEMES||{})[klucz]||null; } catch(e){ motyw=null; }
  if(!motyw) return;
  project.appearance.accent=motyw.accent;
  // Te same pola wystepuja w dwoch miejscach (Ustawienia i Edytor koncowego raportu) —
  // przepisujemy kolor i font do wszystkich kontrolek, nie tylko do pierwszej znalezionej.
  document.querySelectorAll('[data-path="appearance.accent"]').forEach(p=>{p.value=motyw.accent;});
  const polaMotywu=[...document.querySelectorAll('[data-path="appearance.theme"]')];
  polaMotywu.forEach(p=>{p.value=klucz;});
  const poleFontu=document.querySelector('[data-path="appearance.fontFamily"]');
  if(poleFontu){
    const szukany=bezCudzyslowow(motyw.font);
    const pierwsza=szukany.split(',')[0].trim();
    const opcja=[...poleFontu.options].find(o=>bezCudzyslowow(o.value)===szukany)
             || [...poleFontu.options].find(o=>bezCudzyslowow(o.value).split(',')[0].trim()===pierwsza);
    if(opcja){ document.querySelectorAll('[data-path="appearance.fontFamily"]').forEach(p=>{p.value=opcja.value;}); project.appearance.fontFamily=opcja.value; }
  }
  renderThemePreview();
}
function renderThemePreview(){const R=getReport();const theme=R.THEMES[project.appearance.theme]||R.THEMES.gold,el=$('#themePreview');if(!el)return;el.style.setProperty('--preview-accent',project.appearance.accent||theme.accent);el.style.setProperty('--preview-soft',theme.accent2);el.style.setProperty('--preview-font',project.appearance.fontFamily||theme.font);}

let reportPreviewTimer=null;
async function renderReportPreview(){
  const frame=$('#reportPreviewFrame'); if(!frame)return;
  try{
    calc=obliczProjekt();
    try{await ensureMapsQR(false);}catch{}
    const html=zbudujRaport();
    frame.srcdoc=html;
    const stamp=$('#reportPreviewStamp');if(stamp)stamp.textContent=`Odświeżono ${new Date().toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}`;
  }catch(e){frame.srcdoc=`<html><body style="font-family:Arial;padding:30px;color:#8a3434">Nie udało się zbudować podglądu: ${escapeHTML(e.message)}</body></html>`;}
}
function scheduleReportPreview(){clearTimeout(reportPreviewTimer);reportPreviewTimer=setTimeout(()=>{if($('#tab-result')?.classList.contains('active'))renderReportPreview();},450);}
async function openFullReportPreview(){try{calc=obliczProjekt();try{await ensureMapsQR(false);}catch{}const html=zbudujRaport();await window.operatAPI.previewPDF({html});}catch(e){showStatus(`Podgląd raportu: ${cleanRemoteError(e)}`,'error',8000);}}

function cleanRemoteError(error){
  let msg=String(error?.message||error||'Nieznany błąd').trim();
  msg=msg.replace(/^Error invoking remote method '[^']+':\s*/i,'').replace(/^Error:\s*/i,'').trim();
  return msg;
}

async function renderSettingsPage(){

  // Numer wersji bierzemy z procesu głównego — HTML nie musi być aktualizowany przy każdym wydaniu.
  if($('#creatorVersionValue')){try{const i=await window.operatAPI.getAppInfo();if(i?.version)$('#creatorVersionValue').textContent=i.version;}catch{}}
  if($('#settingsAccessState')){const l=licenseStateCache||{};$('#settingsAccessState').textContent=l.active?`Klucz aktywny · pozostało ${licenseCountdownText(l)}`:'Brak aktywnego klucza';}
  if($('#settingsAccessExpiry'))$('#settingsAccessExpiry').textContent=licenseDisplayExpiry(licenseStateCache||{});

  try{
    const lic=await window.operatAPI.getLicenseState();licenseStateCache=lic;
    if($('#settingsLicenseState'))$('#settingsLicenseState').textContent=lic.active?'Klucz aktywny · cały program odblokowany':(lic.message||'Brak aktywnego klucza');
    if($('#settingsLicenseExpiry'))$('#settingsLicenseExpiry').textContent=licenseExpiryFull(lic);
    if($('#settingsLicenseRemaining'))$('#settingsLicenseRemaining').textContent=lic.active?licenseCountdownText(lic):'—';
    if($('#settingsLicenseDevice'))$('#settingsLicenseDevice').textContent=lic.deviceCode||'—';
    if($('#settingsLicenseId'))$('#settingsLicenseId').textContent=lic.licenseId||'—';
    renderLicenseTimer();
  }catch{}
}
function renderAll(){project=normalizeLoadedProject(project);refreshWizardSteps();calc=obliczProjekt();invalidateValidationCache();bindStaticFields();renderIncome();if(!window.__incomePodpiety){window.__incomePodpiety=true;hookIncome192();}renderModulOgolny();if(!window.__modulyPodpiete){window.__modulyPodpiete=true;hookModuly193();}renderTransactions();renderTrendPairs();renderFeatures();renderPairComparisons();renderModuleUI();renderPhotos();renderFiles();renderLists();updateKPIs();updateHeader();updateCompleteness();updateCosting();renderMapsQRPreview();renderEkwImport();renderThemePreview();renderWizard();renderFinalIssues();renderDashboard();renderWorkflowUI();applyUIPrefs();applyHelpTooltips();hookPola();podpowiedziWczytajMiejscowosci();bindPerButtons();renderNotifications();const active=($('.tab.active')?.id||'tab-dashboard').replace('tab-','');syncWizardWithTab(active);if(active==='result')scheduleReportPreview();renderKlientKarta();szataRysuj();ukladyRysuj();if(typeof szybkiStanDokumentow==='function')szybkiStanDokumentow();if(typeof autoOznacz==='function')autoOznacz();if(typeof studioRysuj==='function')studioRysuj();}

/* ============================================================
   OPERO 1.18.0 — redakcja tekstu przez PER

   Przejscie do ChatGPT zostalo usuniete. Teraz przycisk przy polu wysyla
   TWOJ tekst roboczy do modelu dzialajacego na tym komputerze i pokazuje
   propozycje obok oryginalu. Nic nie podmienia sie samo: to Ty decydujesz,
   czy wstawic nowa wersje, czy zostawic swoja.
   ============================================================ */
function perPolePodglad(stary, nowy, naWstaw){
  const stare=$('#perRedakcja'); if(stare) stare.remove();
  const box=document.createElement('div');
  box.id='perRedakcja'; box.className='per-redakcja';
  box.innerHTML=`<div class="pr-okno">
    <div class="pr-glowa"><div><span class="eyebrow">PER — PROPOZYCJA REDAKCJI</span>
      <b>Porownaj i zdecyduj</b></div><button class="pr-zamknij" type="button" aria-label="Zamknij">×</button></div>
    <div class="pr-kolumny">
      <div class="pr-kolumna"><small>Twoj tekst</small><div class="pr-tresc">${escapeHTML(stary)}</div></div>
      <div class="pr-kolumna nowa"><small>Propozycja PER</small><div class="pr-tresc">${escapeHTML(nowy)}</div></div>
    </div>
    <p class="pr-uwaga">PER nie dodaje faktow. Jesli czegos brakowalo, zostawil [DO UZUPELNIENIA]. Tekst i tak odpowiada za Ciebie — sprawdz go przed wklejeniem do operatu.</p>
    <div class="pr-akcje"><button class="btn primary" data-pr="wstaw" type="button">Wstaw propozycje</button>
      <button class="text-action" data-pr="odrzuc" type="button">Zostaw moj tekst</button></div>
  </div>`;
  document.body.appendChild(box);
  const zamknij=()=>box.remove();
  box.querySelector('.pr-zamknij').addEventListener('click',zamknij);
  box.querySelector('[data-pr="odrzuc"]').addEventListener('click',zamknij);
  box.querySelector('[data-pr="wstaw"]').addEventListener('click',()=>{ naWstaw(nowy); zamknij(); });
  box.addEventListener('click',e=>{ if(e.target===box) zamknij(); });
}

async function perRedagujPole(btn){
  const cel=btn.dataset.perTarget, zadanie=btn.dataset.perTask;
  if(!cel) return;
  const pole=document.querySelector(`[data-path="${cel}"]`);
  const tablicowe=new Set(['legalBases','sources']);
  const tekst=tablicowe.has(cel)?(project[cel]||[]).join('\n'):String(pole?.value ?? getPath(project,cel) ?? '').trim();
  if(tekst.trim().length<10){
    // Puste pole: PER PISZE z danych, ktore sa juz w operacie. Wczesniej
    // przycisk odsylal czlowieka, zeby najpierw napisal tekst sam.
    if(tablicowe.has(cel)){ showStatus('Ta lista jest pusta — dodaj pozycje, a PER je uporządkuje.','info',6000); return; }
    await perNapiszPole(btn,cel,zadanie,pole); return;
  }
  const stary=btn.textContent; btn.disabled=true; btn.textContent='PER redaguje…';
  agrafekStan('czyta');
  try{
    const r=await window.operatAPI.perRedaguj({text:tekst, task:zadanie||''});
    agrafekStan('znalazl'); setTimeout(()=>agrafekStan(null),2000);
    perPolePodglad(tekst, r.text, (nowy)=>{
      if(tablicowe.has(cel)){ project[cel]=nowy.split(/\n+/).map(x=>x.trim()).filter(Boolean); }
      else { setPath(project,cel,nowy); if(pole) pole.value=nowy; }
      changed(); renderAll();
      showStatus('Tekst wstawiony. Przeczytaj go jeszcze raz przed podpisaniem operatu.','success',6000);
    });
  }catch(e){
    agrafekStan('ostrzega'); setTimeout(()=>agrafekStan(null),2200);
    showStatus(`PER: ${cleanRemoteError(e)}`,'error',9000);
  }finally{ btn.disabled=false; btn.textContent=stary; }
}
/* ============================================================
   PER PISZE POLE Z DANYCH OPERATU
   Puste pole + przycisk „Zredaguj (PER)" = program zbiera wszystko, co
   o tej czesci operatu juz wie, i pisze z tego tekst. Najpierw model lokalny;
   gdy model nie dziala, a pole ma gotowy wzor zdan - szkic z samych danych.
   Kazda liczba w tekscie modelu jest porownywana z danymi operatu.
   ============================================================ */
const PER_GRUPY_POL = [
  ['location.', ['location.', 'property.city', 'property.district', 'property.street', 'property.buildingNo']],
  ['planning.', ['planning.', 'egib.plotNo', 'egib.district', 'property.city']],
  ['egib.', ['egib.', 'property.city', 'property.landArea', 'property.usableArea']],
  ['legal.', ['legal.', 'property.rightType', 'valuation.legalStateDate']],
  ['building.', ['building.', 'property.city', 'property.street', 'property.buildingNo']],
  ['local.', ['local.', 'property.usableArea', 'property.rooms', 'property.floor', 'property.balconyArea', 'property.basementArea']],
  ['formalBasis', ['client.', 'valuation.purpose', 'valuation.reportDate', 'author.']],
];

function perNazwaPola(el){
  const label = el.closest('label'); if (!label) return '';
  const k = label.cloneNode(true);
  k.querySelectorAll('input,select,textarea,button,.help-dot,.z-rejestru,.pole-adres-stan,.pole-adres-wybor,.lista-rozwijana,.liczby-panel,small').forEach(x => x.remove());
  return k.textContent.replace(/\s+/g, ' ').replace(/[*?]/g, '').trim();
}

/** Fakty dla jednego pola: to, co czlowiek (albo automat) wpisal w tej czesci operatu. */
function perFaktyPola(cel){
  const grupa = PER_GRUPY_POL.find(([prefiks]) => cel.startsWith(prefiks));
  const P = window.OperoPisanie;
  const fakty = [];
  const widziane = new Set();
  const dodaj = (nazwa, wartosc) => {
    const t = String(wartosc ?? '').replace(/\s+/g, ' ').trim();
    if (!nazwa || !t || t === '0' || widziane.has(nazwa + '|' + t)) return;
    widziane.add(nazwa + '|' + t);
    fakty.push({ nazwa, wartosc: t.slice(0, 900), liczba: P?.liczba ? P.liczba(t) : null });
  };
  const p = project.property || {};
  dodaj('adres', [p.street && `ul. ${p.street}`, p.buildingNo, p.localNo && `lok. ${p.localNo}`, p.postcode, p.city].filter(Boolean).join(' '));
  dodaj('dzielnica', p.district);
  if (grupa){
    for (const prefiks of grupa[1]){
      document.querySelectorAll(`[data-path^="${prefiks}"]`).forEach(el => {
        const sciezka = el.dataset.path;
        if (sciezka === cel || el.type === 'checkbox' || el.type === 'hidden' || el.type === 'color') return;
        const wartosc = getPath(project, sciezka);
        if (typeof wartosc === 'object') return;
        dodaj(perNazwaPola(el) || sciezka, wartosc);
      });
    }
  } else if (P){
    for (const f of P.fakty(project, calc || obliczProjekt(), { zrodla: typeof pisanieZrodlaOperatu === 'function' ? pisanieZrodlaOperatu() : [] })) dodaj(f.nazwa, f.wartosc);
  }
  return fakty;
}

/** Szkic z samych danych - bez modelu. Tylko tam, gdzie zdania da sie ulozyc uczciwie. */
function perSzkicZDanych(cel){
  const O = window.OperoOtoczenie, p = project.property || {};
  if (cel === 'location.description'){
    const l = project.location || {};
    const adres = [p.street && `ul. ${p.street}`, p.buildingNo].filter(Boolean).join(' ');
    const cz = [];
    const gdzie = [adres, p.district && `dzielnica ${p.district}`, p.city].filter(Boolean).join(', ');
    if (gdzie) cz.push(`Nieruchomość położona jest pod adresem: ${gdzie}.`);
    if (l.transport) cz.push(`Komunikacja: ${l.transport}.`);
    if (l.services) cz.push(`Usługi w otoczeniu: ${l.services}.`);
    if (l.recreation) cz.push(`Zieleń i rekreacja: ${l.recreation}.`);
    if (l.surroundings) cz.push(`${l.surroundings}.`);
    return (l.transport || l.services || l.recreation || l.surroundings) ? cz.join('\n').replace(/\.\./g, '.') : '';
  }
  if (cel === 'planning.description'){
    const pl = project.planning || {};
    if (!(pl.planName || pl.planNumber || pl.resolution || pl.designation || pl.zoneSymbol)) return '';
    const cz = [];
    cz.push(`Dla terenu, na którym położona jest nieruchomość, obowiązuje miejscowy plan zagospodarowania przestrzennego${pl.planName ? ` „${pl.planName}"` : ''}${pl.planNumber ? ` (${pl.planNumber})` : ''}${pl.resolution ? `, przyjęty: ${pl.resolution}` : ''}.`);
    if (pl.zoneSymbol || pl.designation) cz.push(`Nieruchomość leży w terenie${pl.zoneSymbol ? ` oznaczonym symbolem ${pl.zoneSymbol}` : ''}${pl.designation ? ` o przeznaczeniu: ${pl.designation}` : ''}.`);
    if (pl.parameters) cz.push(`Istotne ustalenia planu: ${pl.parameters}.`);
    if (pl.protections) cz.push(`Ochrona i ograniczenia: ${pl.protections}.`);
    if (pl.sourceUrl) cz.push(`Źródło: ${pl.sourceUrl}.`);
    return cz.join('\n').replace(/\.\./g, '.');
  }
  if (cel === 'egib.notes'){
    const e = project.egib || {};
    if (!(e.plotNo || e.plotId)) return '';
    const cz = [`Według ewidencji gruntów i budynków nieruchomość stanowi działkę nr ${e.plotNo || '[DO UZUPEŁNIENIA]'}${e.district ? `, obręb ${e.district}` : ''}${e.unit ? `, jednostka ewidencyjna ${e.unit}` : ''}.`];
    if (e.plotId) cz.push(`Identyfikator działki: ${e.plotId}.`);
    if (e.plotArea) cz.push(`Powierzchnia działki według ewidencji: ${e.plotArea}.`);
    if (e.buildingId) cz.push(`Identyfikator budynku: ${e.buildingId}.`);
    if (e.extractDate) cz.push(`Dane według wypisu z dnia ${e.extractDate}.`);
    return cz.join(' ');
  }
  return O ? '' : '';
}

function perPolecenieDlaPola(zadanie, nazwaPola, fakty){
  return [
    `POLE OPERATU: ${nazwaPola || 'opis'}`,
    `ZADANIE: ${zadanie || 'Napisz treść tego pola operatu szacunkowego.'}`,
    '',
    'ZASADY:',
    '1. Pisz wyłącznie na podstawie FAKTÓW poniżej. Nie dodawaj nazw, odległości, liczb, dat ani przepisów, których tam nie ma.',
    '2. Gdy brakuje danej potrzebnej w zdaniu, wstaw dokładnie [DO UZUPEŁNIENIA].',
    '3. Styl operatu szacunkowego: rzeczowo, pełnymi zdaniami, w trzeciej osobie, bez wypunktowań i bez nagłówków.',
    '4. Zwróć sam tekst pola — bez wstępu i bez komentarza.',
    '',
    'FAKTY (jedyny dopuszczalny materiał):',
    fakty.map(f => `- ${f.nazwa}: ${f.wartosc}`).join('\n'),
  ].join('\n');
}

async function perNapiszPole(btn, cel, zadanie, pole, { cicho = false } = {}){
  const P = window.OperoPisanie;
  const fakty = perFaktyPola(cel);
  const nazwa = pole ? perNazwaPola(pole) : cel;
  const szkic = perSzkicZDanych(cel);
  // Sam adres to za malo, zeby cokolwiek uczciwie napisac.
  if (fakty.length < 3 && !szkic){
    if (cicho) return { ok: false, powod: 'brak-danych', nazwa };
    const automat = /^(location|planning|egib)\./.test(cel) && $('#automatBtn');
    showStatus(automat
      ? `Za mało danych, żeby napisać „${nazwa}". Kliknij „Zbierz dane automatycznie" u góry tej strony albo uzupełnij rubryki powyżej — PER napisze opis z nich.`
      : `Za mało danych, żeby napisać „${nazwa}". Uzupełnij rubryki tej części operatu — PER napisze tekst z nich.`, 'info', 10000);
    if (automat) $('#automatKarta')?.scrollIntoView({ behavior: uiPrefs.motion === 'full' ? 'smooth' : 'auto', block: 'center' });
    return { ok: false, powod: 'brak-danych' };
  }
  const stary = btn ? btn.textContent : ''; if (btn){ btn.disabled = true; btn.textContent = 'PER pisze…'; }
  agrafekStan('czyta');
  let tekst = '', zModelu = false, powodModelu = '';
  try {
    const w = await window.operatAPI.perNapisz({ prompt: perPolecenieDlaPola(zadanie, nazwa, fakty) + (typeof studioWzorDlaPola === 'function' ? studioWzorDlaPola(cel) : ''), rozdzial: cel });
    tekst = String(w?.text || '').trim(); zModelu = !!tekst;
  } catch (e) { powodModelu = cleanRemoteError(e); }
  if (btn){ btn.disabled = false; btn.textContent = stary; }
  if (!tekst && szkic) tekst = szkic;
  if (!tekst && cicho) return { ok: false, powod: powodModelu || 'model nie odpowiedział', nazwa, model: true };
  if (!tekst){
    agrafekStan('ostrzega'); setTimeout(() => agrafekStan(null), 2200);
    showStatus(`PER nie napisał tekstu: ${powodModelu || 'model nie odpowiedział'}. Sprawdź w Ustawieniach, czy model PER jest wczytany.`, 'error', 11000);
    return { ok: false, powod: powodModelu };
  }
  agrafekStan('znalazl'); setTimeout(() => agrafekStan(null), 2000);
  const wstaw = (nowy) => {
    setPath(project, cel, nowy); if (pole) pole.value = nowy;
    changed(); renderAll();
  };
  // Liczba, ktorej nie ma w danych operatu, to najczestszy blad modelu.
  // Taki tekst nie wchodzi sam - idzie do porownania i decyzji czlowieka.
  const kontrola = zModelu && P?.sprawdzTekst ? P.sprawdzTekst(tekst, fakty) : { ok: true };
  if (!kontrola.ok && cicho) return { ok: true, doDecyzji: true, tekst, nazwa };
  if (!kontrola.ok){
    perPolePodglad('(pole było puste)', tekst, (nowy) => { wstaw(nowy); showStatus('Tekst wstawiony. Sprawdź wartości, których nie było w danych operatu.', 'info', 8000); });
    showStatus(`PER napisał „${nazwa}", ale w tekście są wartości, których nie ma w danych operatu. Przejrzyj propozycję, zanim ją przyjmiesz.`, 'error', 10000);
    return { ok: true, doDecyzji: true, tekst };
  }
  if (cicho){ setPath(project, cel, tekst); if (pole) pole.value = tekst; return { ok: true, tekst, zModelu, nazwa }; }
  wstaw(tekst);
  showStatus(zModelu
    ? `PER napisał „${nazwa}" z ${fakty.length} danych operatu. Przeczytaj tekst przed podpisem.`
    : `Wpisałem „${nazwa}" jako szkic z danych operatu${powodModelu ? ` (model PER nie odpowiedział: ${powodModelu})` : ''}. Przeczytaj i popraw.`, 'success', 9000);
  return { ok: true, tekst, zModelu };
}

/** Wszystkie puste pola opisowe po kolei. Jedno klikniecie zamiast dwudziestu. */
let perWszystkieTrwa = false;
async function perNapiszWszystkie(){
  if (perWszystkieTrwa) return;
  const GRUPA = 'PER pisze opisy';
  const guziki = $$('.per-inline').filter(b => b.dataset.perTarget && !['legalBases', 'sources'].includes(b.dataset.perTarget));
  const puste = guziki.filter(b => String(getPath(project, b.dataset.perTarget) ?? '').trim().length < 10);
  const box = $('#perWszystkieWynik');
  const rysuj = (html, stan) => { if (box){ box.innerHTML = html; box.dataset.stan = stan || ''; box.classList.toggle('hidden', !html); } };
  if (!puste.length){ rysuj('<p>Wszystkie pola opisowe mają już tekst. Pojedyncze pole wygładzisz przyciskiem „Zredaguj (PER)" przy nim.</p>', 'sukces'); return; }
  perWszystkieTrwa = true;
  const btn = $('#perWszystkieBtn'); const napis = btn?.textContent; if (btn) btn.disabled = true;
  const napisane = [], szkice = [], brakDanych = [], doDecyzji = [], bledy = [];
  let modelPadl = '';
  for (let i = 0; i < puste.length; i++){
    const b = puste[i], cel = b.dataset.perTarget, pole = document.querySelector(`[data-path="${cel}"]`);
    if (btn) btn.textContent = `PER pisze… ${i + 1} z ${puste.length}`;
    rysuj(`<p class="automat-praca">Piszę pole ${i + 1} z ${puste.length}: ${escapeHTML(pole ? perNazwaPola(pole) : cel)}…</p>`, 'praca');
    mowiEtap(`Piszę pole ${i + 1} z ${puste.length}.`, GRUPA);
    let w;
    try { w = await perNapiszPole(null, cel, b.dataset.perTask, pole, { cicho: true }); }
    catch (e) { w = { ok: false, powod: cleanRemoteError(e), nazwa: cel, model: true }; }
    const nazwa = w.nazwa || cel;
    if (w.ok && w.doDecyzji) doDecyzji.push(nazwa);
    else if (w.ok && w.zModelu) napisane.push(nazwa);
    else if (w.ok) szkice.push(nazwa);
    else if (w.powod === 'brak-danych') brakDanych.push(nazwa);
    else { bledy.push(nazwa); modelPadl = w.powod || modelPadl; }
  }
  perWszystkieTrwa = false;
  if (btn){ btn.disabled = false; btn.textContent = napis; }
  window.OperoOkno?.zakonczEtapy(oknoStan, GRUPA);
  if (napisane.length || szkice.length){ changed(); renderAll(); }
  const blok = (tytul, lista, klasa = '') => lista.length ? `<div class="${klasa}"><b>${tytul} (${lista.length})</b><ul>${lista.map(x => `<li>${escapeHTML(x)}</li>`).join('')}</ul></div>` : '';
  rysuj(`<div class="automat-kolumny">
      ${blok('Napisane przez PER', napisane) || blok('Wpisane jako szkic z danych', szkice) || '<div><b>Napisane (0)</b><p>Żadne pole nie zostało wypełnione.</p></div>'}
      <div>${napisane.length ? blok('Wpisane jako szkic z danych', szkice) : ''}${blok('Za mało danych — uzupełnij rubryki tej części', brakDanych)}</div>
    </div>
    ${blok('Do Twojej decyzji — w tekście były wartości spoza danych operatu; kliknij „Zredaguj (PER)" przy polu', doDecyzji, 'automat-uwagi')}
    ${bledy.length ? `<div class="automat-uwagi"><b>Model PER nie napisał (${bledy.length})</b><p>${escapeHTML(modelPadl || 'model nie odpowiedział')}. Sprawdź w Ustawieniach, czy model PER jest wczytany. Pola: ${escapeHTML(bledy.join(', '))}.</p></div>` : ''}
    <p class="automat-mniej">Każdy tekst powstał wyłącznie z danych wpisanych w operacie. Przeczytaj je przed podpisem — odpowiadasz za każde zdanie.</p>`,
    (napisane.length || szkice.length) ? 'sukces' : 'uwaga');
  showStatus(`PER: napisane ${napisane.length + szkice.length} z ${puste.length} pustych pól${brakDanych.length ? `, ${brakDanych.length} czeka na dane` : ''}${doDecyzji.length ? `, ${doDecyzji.length} do decyzji` : ''}.`,
    (napisane.length || szkice.length) ? 'success' : 'info', 9000);
  return { napisane, szkice, brakDanych, doDecyzji, bledy };
}

/* ============================================================
   AUTOMAT — SLAD: co program wpisal, w ktorym etapie, i co juz sprawdzono
   Kazde pole wypelnione przez program dostaje znacznik „AUTO". Znika, gdy
   czlowiek pole poprawi. Kazdy etap z takimi polami czeka na „sprawdzone".
   ============================================================ */
const AUTO_KORZENIE = ['property', 'legal', 'egib', 'planning', 'location', 'building', 'local', 'market', 'narratives', 'valuation', 'formalBasis', 'methodicalBasis', 'clauses'];
const AUTO_POMIJANE = /^(legal\.ekwImport|location\.(mapsQrDataUrl|mapsUrl|automat)|property\.punkt|market\.(transactions|features|trendPairs)|valuation\.(reportDate|valuationDate|priceLevelDate|inspectionDate))/;
let autoPisze = false;

/** Plaski obraz pol operatu: sciezka → wartosc tekstowa. */
function autoMigawka(){
  const out = {};
  const idz = (v, sciezka) => {
    if (AUTO_POMIJANE.test(sciezka)) return;
    if (v === null || v === undefined) { out[sciezka] = ''; return; }
    if (Array.isArray(v)) return;
    if (typeof v === 'object') { for (const [k, w] of Object.entries(v)) idz(w, `${sciezka}.${k}`); return; }
    out[sciezka] = String(v);
  };
  for (const k of AUTO_KORZENIE) idz(project[k], k);
  out['market.transactions'] = String((project.market?.transactions || []).length);
  return out;
}
/** Wykonuje czynnosc programu i zapisuje, ktore pola po niej sie zmienily. */
async function autoSledz(fn, zrodlo){
  const przed = autoMigawka();
  autoPisze = true;
  let wynik;
  try { wynik = await fn(); } finally { autoPisze = false; }
  const po = autoMigawka();
  project.autoWpisane = project.autoWpisane || {};
  const zmienione = [];
  for (const [sciezka, v] of Object.entries(po)){
    if (v === (przed[sciezka] ?? '') || v === '' || v === '0') continue;
    if (sciezka === 'market.transactions'){ const ile = Number(v) - Number(przed[sciezka] || 0); if (ile > 0){ project.autoWpisane[sciezka] = { zrodlo, ile: (project.autoWpisane[sciezka]?.ile || 0) + ile, kiedy: new Date().toISOString() }; zmienione.push(sciezka); } continue; }
    project.autoWpisane[sciezka] = { zrodlo, kiedy: new Date().toISOString() };
    zmienione.push(sciezka);
  }
  // Etap, w ktorym program cos dopisal, wraca do „do sprawdzenia".
  if (zmienione.length){ project.autoSprawdzone = project.autoSprawdzone || {}; for (const s of zmienione){ const t = autoEtapPola(s); if (t) delete project.autoSprawdzone[t]; } }
  return { wynik, zmienione };
}
function autoEtapPola(sciezka){
  if (sciezka === 'market.transactions') return 'market';
  if (sciezka === 'market.features') return 'features';
  const el = document.querySelector(`[data-path="${sciezka}"]`);
  const sek = el?.closest('section.tab');
  return sek ? sek.id.replace('tab-', '') : '';
}
/** Zestawienie: etap → pola wpisane przez program. */
function autoEtapy(){
  const mapa = {};
  for (const [sciezka, wpis] of Object.entries(project.autoWpisane || {})){
    const tab = autoEtapPola(sciezka); if (!tab) continue;
    const el = document.querySelector(`[data-path="${sciezka}"]`);
    const nazwa = sciezka === 'market.transactions' ? `${wpis.ile} ${wpis.ile === 1 ? 'transakcja' : wpis.ile < 5 ? 'transakcje' : 'transakcji'}` : sciezka === 'market.features' ? `${wpis.ile} cech z wagami (oceny: przeciętne)` : (el ? perNazwaPola(el) : sciezka) || sciezka;
    (mapa[tab] = mapa[tab] || []).push({ sciezka, nazwa, zrodlo: wpis.zrodlo });
  }
  return mapa;
}
/** Znaczniki „AUTO" przy polach i banery w etapach. Bezpieczne do wolania wielokrotnie. */
function autoOznacz(){
  const wpisane = project.autoWpisane || {};
  document.querySelectorAll('label.auto-wpisane').forEach(l => { const p = l.querySelector('[data-path]')?.dataset.path; if (!p || !wpisane[p]) l.classList.remove('auto-wpisane'); });
  for (const sciezka of Object.keys(wpisane)){
    const l = document.querySelector(`[data-path="${sciezka}"]`)?.closest('label');
    if (l){ l.classList.add('auto-wpisane'); l.dataset.autoZrodlo = wpisane[sciezka].zrodlo || ''; }
  }
  const etapy = autoEtapy(), spr = project.autoSprawdzone || {};
  document.querySelectorAll('.auto-baner').forEach(b => { if (!etapy[b.dataset.tab]) b.remove(); });
  for (const [tab, pola] of Object.entries(etapy)){
    const sek = document.getElementById(`tab-${tab}`); if (!sek) continue;
    let b = sek.querySelector(':scope > .auto-baner');
    if (!b){ b = document.createElement('div'); b.className = 'auto-baner'; b.dataset.tab = tab; const tytul = sek.querySelector(':scope > .section-title'); (tytul || sek.firstElementChild)?.insertAdjacentElement('afterend', b); }
    const gotowe = !!spr[tab];
    const podpis = `${tab}|${pola.length}|${gotowe}`;
    if (b.dataset.podpis === podpis) continue;
    b.dataset.podpis = podpis; b.dataset.stan = gotowe ? 'sprawdzone' : 'czeka';
    b.innerHTML = `<div><b>${gotowe ? '✓ Etap sprawdzony' : 'Program wypełnił ten etap — sprawdź'}</b><span>${pola.length} ${pola.length === 1 ? 'pozycja' : pola.length < 5 ? 'pozycje' : 'pozycji'}: ${escapeHTML(pola.slice(0, 8).map(x => x.nazwa).join(', '))}${pola.length > 8 ? ` i ${pola.length - 8} dalszych` : ''}. Pola programu mają znacznik „AUTO".</span></div>`
      + `<div class="auto-baner-guziki">${gotowe ? `<button type="button" class="btn ghost small" data-auto-cofnij="${tab}">Cofnij</button>` : `<button type="button" class="btn primary small" data-auto-sprawdzone="${tab}">Sprawdziłem ten etap ✓</button>`}<button type="button" class="btn ghost small" data-auto-koniec="1">Do etapu końcowego →</button></div>`;
  }
  autoRysujPrzeglad();
}
function autoRysujPrzeglad(){
  const karta = $('#autoPrzegladKarta'), root = $('#autoPrzeglad'); if (!karta || !root) return;
  const etapy = autoEtapy(), spr = project.autoSprawdzone || {};
  const jest = Object.keys(etapy).length > 0;
  karta.classList.toggle('hidden', !jest);
  if (!jest) return;
  const kroki = WIZARD_STEPS.map((k, i) => ({ ...k, nr: i + 1, pola: etapy[k.tab] || [] }));
  root.innerHTML = kroki.map(k => {
    const stan = !k.pola.length ? 'bez' : spr[k.tab] ? 'ok' : 'czeka';
    return `<div class="auto-etap" data-stan="${stan}"><span class="auto-etap-nr">${String(k.nr).padStart(2, '0')}</span>
      <div class="auto-etap-opis"><b>${escapeHTML(k.name)}</b><small>${k.pola.length ? `program wpisał: ${escapeHTML(k.pola.slice(0, 6).map(x => x.nazwa).join(', '))}${k.pola.length > 6 ? ` i ${k.pola.length - 6} dalszych` : ''}` : 'program niczego tu nie wpisał — uzupełniasz sam'}</small></div>
      <span class="auto-etap-stan">${stan === 'ok' ? '✓ sprawdzony' : stan === 'czeka' ? 'do sprawdzenia' : 'bez zmian programu'}</span>
      <button type="button" class="btn ${stan === 'czeka' ? 'gold-outline' : 'ghost'} small" data-auto-idz="${k.tab}">${stan === 'czeka' ? 'Sprawdź etap' : 'Otwórz'}</button></div>`;
  }).join('');
  const czeka = kroki.filter(k => k.pola.length && !spr[k.tab]);
  const st = $('#autoPrzegladStan');
  if (st) st.textContent = project.meta?.zatwierdzono
    ? `Operat zatwierdzony ${new Date(project.meta.zatwierdzono).toLocaleString('pl-PL')}.`
    : czeka.length ? `Do sprawdzenia: ${czeka.length} ${czeka.length === 1 ? 'etap' : czeka.length < 5 ? 'etapy' : 'etapów'}.` : 'Wszystkie etapy sprawdzone — możesz zatwierdzić operat.';
}
function autoZatwierdzOperat(){
  const etapy = autoEtapy(), spr = project.autoSprawdzone || {};
  const czeka = WIZARD_STEPS.filter(k => (etapy[k.tab] || []).length && !spr[k.tab]);
  if (czeka.length){ showStatus(`Najpierw sprawdź etapy wypełnione przez program: ${czeka.map(k => k.name).join(', ')}.`, 'error', 9000); return false; }
  const braki = allCriticalIssues();
  if (braki.length && !confirm(`Kontrola zgłasza jeszcze ${braki.length} ${braki.length === 1 ? 'brak' : 'braków'} (np. ${braki[0]}).\n\nZatwierdzić operat mimo to? PDF pozostanie zablokowany, dopóki ich nie uzupełnisz.`)) return false;
  project.meta.status = 'Zatwierdzony'; project.meta.zatwierdzono = new Date().toISOString();
  changed(); renderAll();
  showStatus('Operat zatwierdzony. Wszystkie etapy wypełnione przez program zostały przez Ciebie sprawdzone.', 'success', 8000);
  // Zatwierdzony operat staje sie wzorcem stylu dla nastepnych (Ustawienia → Pamiec wzorcow).
  if (typeof studioUczSieZOperatu === 'function') studioUczSieZOperatu().then(w => { if (w) showStatusTlo('Zatwierdzony operat dodany do pamięci wzorców — następne będą pisane w tym stylu.', 'info', 6000); }).catch(() => {});
  return true;
}

/** CALY OPERAT JEDNYM PRZYCISKIEM: zbierz → transakcje → policz → napisz → do konca. */
let szybkiCalyTrwa = false;
async function szybkiCaly(){
  if (szybkiCalyTrwa) return null;
  const S = window.OperoSzukanie, p = project.property || {};
  const pokaz = (html, stan) => szybkiPokaz('#szybkiCalyWynik', html, stan);
  if (!String(p.city || '').trim() || !String(p.street || '').trim()){
    pokaz('<p>Najpierw <b>adres</b>: wklej księgę wieczystą w kroku 1 albo wpisz miejscowość i ulicę w polach poniżej. Od adresu zaczyna się całe zbieranie danych.</p>', 'pytanie');
    return null;
  }
  szybkiCalyTrwa = true;
  const btn = $('#szybkiCalyBtn'); const napis = btn?.textContent; if (btn) btn.disabled = true;
  const krok = (n, t) => { if (btn) btn.textContent = `Pracuję… ${n}/4`; pokaz(`<p class="automat-praca">Krok ${n} z 4: ${escapeHTML(t)}</p>`, 'praca'); };
  const raport = { dane: [], transakcje: 0, opisy: 0, uwagi: [] };
  try {
    krok(1, 'ewidencja, otoczenie, plan miejscowy i kod QR…');
    const a = await autoSledz(async () => { const r = await automatZbierz(); try { await ensureMapsQR(true); } catch {} return r; }, 'rejestry i mapa');
    raport.dane = a.wynik?.wpisane || []; raport.uwagi.push(...(a.wynik?.uwagi || []));

    krok(2, 'transakcje podobnych nieruchomości…');
    const t = await autoSledz(async () => {
      if (!S) return null;
      // To samo szukanie co w oknie, ale bez pokazywania okna: najlepiej
      // pasujace wchodza same, dalsze zostaja do decyzji w etapie rynku.
      szukOtworz(); szukZamknij();
      szukPrzebieg = S.nowy(szukKryteriaZPol());
      await szukPrzejdz();
      return true;
    }, 'Rejestr Cen Nieruchomości i własna baza');
    raport.transakcje = project.autoWpisane?.['market.transactions']?.ile || 0;
    const doDecyzji = (szukPrzebieg?.znalezione || []).filter(x => x.zZapasu).length;
    if (doDecyzji) raport.uwagi.push(`${doDecyzji} ${doDecyzji === 1 ? 'transakcja czeka' : 'transakcji czeka'} na Twoją decyzję — etap „Rynek i transakcje", przycisk szukania.`);
    if (!raport.transakcje) raport.uwagi.push('Nie wstawiłem żadnej transakcji — bez nich nie ma wyniku. Otwórz etap „Rynek i transakcje".');

    krok(3, 'cechy rynkowe, wagi i obliczenia…');
    // Bez wag nie ma wyniku. Gdy rzeczoznawca ich jeszcze nie ustawil, program
    // przyjmuje zestaw sugerowany dla tego rodzaju nieruchomosci - do sprawdzenia
    // w etapie „Cechy, skale i wagi". Oceny cech zostaja „przecietne".
    const sumaWag = (project.market?.features || []).reduce((x, f) => x + (Number(f.weight) || 0), 0);
    if (!(sumaWag > 0) && window.OperoCechy){
      const w = await autoSledz(async () => {
        const C = window.OperoCechy, rodzaj = C.rodzaj(moduleCode(), { zabudowana: !!project.property?.builtUp });
        const stary = window.confirm; window.confirm = () => true;
        try { cechyWstaw(C.sugeruj(rodzaj), rodzaj); } finally { window.confirm = stary; }
        // Zaokraglenia potrafia dac sume 99% albo 101% - roznice bierze najwazniejsza cecha.
        const cechy = project.market.features || [];
        const suma = Math.round(cechy.reduce((x, f) => x + (Number(f.weight) || 0), 0) * 100);
        if (cechy.length && suma !== 100){ const naj = cechy.slice().sort((x, y) => (Number(y.weight) || 0) - (Number(x.weight) || 0))[0]; naj.weight = Math.round(((Number(naj.weight) || 0) + (100 - suma) / 100) * 100) / 100; }
        return true;
      }, 'sugerowany zestaw cech');
      project.autoWpisane['market.features'] = { zrodlo: 'sugerowany zestaw cech i wag', kiedy: new Date().toISOString(), ile: (project.market.features || []).length };
      raport.uwagi.push(`Przyjąłem sugerowany zestaw ${(project.market.features || []).length} cech z wagami, a oceny wycenianej nieruchomości ustawiłem na „przeciętna". To od nich zależy wynik — ustaw je w etapie „Cechy, skale i wagi" po oględzinach.`);
    }
    calc = obliczProjekt();

    krok(4, 'opisy (PER)…');
    const o = await autoSledz(perNapiszWszystkie, 'PER z danych operatu');
    raport.opisy = (o.wynik?.napisane?.length || 0) + (o.wynik?.szkice?.length || 0);
    if (o.wynik?.brakDanych?.length) raport.uwagi.push(`${o.wynik.brakDanych.length} opisów czeka na dane: ${o.wynik.brakDanych.slice(0, 5).join(', ')}.`);
    if (o.wynik?.doDecyzji?.length) raport.uwagi.push(`Do Twojej decyzji (tekst z wartością spoza danych): ${o.wynik.doDecyzji.join(', ')}.`);
    if (o.wynik?.bledy?.length) raport.uwagi.push('Model PER nie odpowiedział — opisy napiszesz przyciskiem PER, gdy model będzie wczytany.');
  } catch (e) { console.error(e); raport.uwagi.push(`Automat przerwał pracę: ${cleanRemoteError(e)}.`); }
  szybkiCalyTrwa = false; szybkiCzekaNaTransakcje = false;
  if (btn){ btn.disabled = false; btn.textContent = napis; }
  calc = obliczProjekt(); changed(); renderAll();
  const etapy = autoEtapy(), ilePol = Object.values(etapy).reduce((s, x) => s + x.length, 0);
  pokaz(`<p class="szybki-tytul">Gotowe — program wypełnił ${ilePol} ${ilePol === 1 ? 'pozycję' : ilePol < 5 ? 'pozycje' : 'pozycji'} w ${Object.keys(etapy).length} etapach.</p>
    <div class="szybki-liczby"><div><span>Dane z rejestrów i mapy</span><b>${raport.dane.length}</b></div><div><span>Transakcje</span><b>${raport.transakcje}</b></div><div><span>Opisy</span><b>${raport.opisy}</b></div></div>
    ${raport.uwagi.length ? `<div class="automat-uwagi"><b>Do Twojej uwagi</b><ul>${szybkiLi(raport.uwagi)}</ul></div>` : ''}
    <p class="automat-mniej">Przechodzę do etapu końcowego. Tam jest lista etapów do sprawdzenia.</p>`, ilePol ? 'sukces' : 'uwaga');
  switchTab('result');
  setTimeout(() => $('#autoPrzegladKarta')?.scrollIntoView({ behavior: uiPrefs.motion === 'full' ? 'smooth' : 'auto', block: 'start' }), 120);
  showStatus(`Automat skończył: ${ilePol} pozycji w ${Object.keys(etapy).length} etapach. Sprawdź etapy i zatwierdź operat.`, ilePol ? 'success' : 'info', 10000);
  return raport;
}

function hookAuto(){
  document.addEventListener('click', ev => {
    const s = ev.target.closest('[data-auto-sprawdzone]');
    if (s){ project.autoSprawdzone = project.autoSprawdzone || {}; project.autoSprawdzone[s.dataset.autoSprawdzone] = new Date().toISOString(); changed(); autoOznacz(); showStatus('Etap oznaczony jako sprawdzony.', 'success', 4000); return; }
    const c = ev.target.closest('[data-auto-cofnij]');
    if (c){ if (project.autoSprawdzone) delete project.autoSprawdzone[c.dataset.autoCofnij]; if (project.meta) delete project.meta.zatwierdzono; changed(); autoOznacz(); return; }
    const i = ev.target.closest('[data-auto-idz]');
    if (i){ const n = WIZARD_STEPS.findIndex(k => k.tab === i.dataset.autoIdz); if (n >= 0) wizardIndex = n; switchTab(i.dataset.autoIdz); return; }
    if (ev.target.closest('[data-auto-koniec]')){ switchTab('result'); setTimeout(() => $('#autoPrzegladKarta')?.scrollIntoView({ block: 'start' }), 100); return; }
    if (ev.target.closest('#autoZatwierdz')){ autoZatwierdzOperat(); return; }
    if (ev.target.closest('#szybkiCalyBtn')){ szybkiCaly(); }
  });
  // Pole poprawione przez czlowieka przestaje byc „AUTO".
  document.addEventListener('input', ev => {
    const sciezka = ev.target?.dataset?.path;
    if (autoPisze || !sciezka || !project.autoWpisane?.[sciezka]) return;
    delete project.autoWpisane[sciezka];
    ev.target.closest('label')?.classList.remove('auto-wpisane');
    clearTimeout(hookAuto.t); hookAuto.t = setTimeout(autoOznacz, 400);
  });
}

/* ============================================================
   OPERAT Z DOKUMENTOW — jedna sciezka od ksiegi wieczystej do wyniku
   Kazdy krok to cos, co program juz umie; tu sa ulozone w kolejnosci,
   w jakiej rzeczoznawca dostaje materialy. Czytanie ksiegi: ekw-tresc.js.
   ============================================================ */
function szybkiStan(id, tekst, rodzaj = ''){
  const el = $(id); if (el){ el.textContent = tekst; el.dataset.rodzaj = rodzaj; }
}
function szybkiPokaz(id, html, stan = ''){
  const el = $(id); if (!el) return;
  el.innerHTML = html; el.dataset.stan = stan; el.classList.toggle('hidden', !html);
}
const szybkiLi = (a) => a.map(x => `<li>${escapeHTML(x)}</li>`).join('');

/** Ksiega: wklejony tekst → dzialy → pola operatu. Wkleja sie tez dzial po dziale. */
let szybkiZeZrzutu = false;
function szybkiCzytajKw(){
  const E = window.OperoEkw; if (!E) return null;
  const zeZrzutu = szybkiZeZrzutu === true; szybkiZeZrzutu = false;
  const pole = $('#szybkiKwTekst');
  const nowy = String(pole?.value || '').trim();
  const imp = project.legal.ekwImport = project.legal.ekwImport || { rawText: '', sections: { IO: '', ISP: '', II: '', III: '', IV: '' } };
  imp.sections = imp.sections || { IO: '', ISP: '', II: '', III: '', IV: '' };
  if (nowy.length < 20 && !Object.values(imp.sections).some(x => String(x || '').trim())){
    szybkiPokaz('#szybkiKwWynik', '<p>Wklej skopiowaną treść księgi — na stronie działu w EKW naciśnij Ctrl+A, Ctrl+C, a tutaj Ctrl+V.</p>', 'pytanie');
    pole?.focus(); return null;
  }
  const teraz = E.czytaj(nowy);
  if (nowy.length >= 20 && !teraz.ok){
    szybkiPokaz('#szybkiKwWynik', '<p>W tym tekście nie widzę księgi wieczystej. Skopiuj całą stronę działu z EKW — razem z nagłówkiem „DZIAŁ I-O - OZNACZENIE NIERUCHOMOŚCI".</p>', 'uwaga');
    return null;
  }
  // Inna ksiega niz juz wczytana to pomylka, ktorej nie wolno polknac po cichu.
  const kwByl = normalizeKwLocal(project.legal.kwLocal || ''), kwJest = teraz.naglowek.kw;
  if (kwByl && kwJest && kwByl !== kwJest && !confirm(`W operacie jest księga ${kwByl}, a wklejona treść dotyczy ${kwJest}.\n\nZastąpić dane księgi nową treścią?`)) return null;
  if (kwByl && kwJest && kwByl !== kwJest) imp.sections = { IO: '', ISP: '', II: '', III: '', IV: '' };
  for (const [klucz, tresc] of Object.entries(teraz.dzialy)) imp.sections[klucz] = tresc;
  if (teraz.naglowek.kw) imp.naglowek = teraz.naglowek;
  imp.importedAt = new Date().toISOString(); imp.sourceUrl = 'https://ekw.ms.gov.pl/';
  // Czytamy CALOSC: to, co wklejono teraz, razem z dzialami z poprzednich wklejen.
  const n = imp.naglowek || {};
  const calosc = `${n.kw ? `TREŚĆ KSIĘGI WIECZYSTEJ NR ${n.kw}, STAN Z DNIA ${n.stanZDnia || ''} ${n.stanGodzina || ''}\nprowadzonej przez ${String(n.sad || '').toUpperCase()}\n${n.rodzaj === 'lokal' ? 'LOKAL STANOWIĄCY ODRĘBNĄ NIERUCHOMOŚĆ' : ''}\n` : ''}`
    + ['IO', 'ISP', 'II', 'III', 'IV'].map(k => imp.sections[k] || '').filter(Boolean).join('\n');
  const w = E.czytaj(calosc);
  if (!w.naglowek.sad && n.sad) w.naglowek.sad = n.sad;
  rebuildEkwRawText();

  const wpisane = [], rozne = [];
  // Sito: wartosc musi wygladac na to, czym ma byc (numer na numer, data na
  // date), a numer ksiegi musi przejsc cyfre kontrolna. Dotyczy to zwlaszcza
  // odczytu ze zrzutow ekranu, ktory potrafi oddac smieci.
  const sito = E.przesiej(E.doOperatu(w));
  const kwDobre = (v) => { const c = String(v).split('/'); const spr = window.OperoPola?.sprawdzKw ? window.OperoPola.sprawdzKw({ kod: c[0], numer: c[1], kontrolna: c[2] }) : { ok: true }; return !!spr.ok; };
  const niepewne = [...sito.odrzucone];
  // Ze zrzutu: opis izb bywa zawiniety na dwa wiersze i silnik gubi jeden z nich,
  // a wtedy liczba pokoi wychodzi za mala i WYGLADA poprawnie. Takich danych
  // program nie wpisuje sam - pokazuje je do reki.
  // Ze zrzutu wpisujemy tylko wartosci, ktore przechodza kontrole postaci:
  // opis izb ma co najmniej trzy pozycje, udzial jest ulamkiem mniejszym od
  // jednosci, powierzchnia ma sens. Reszta idzie do reki.
  const zrzutDobry = (q) => {
    if (q.sciezka === 'legal.ioRooms') return String(q.wartosc).split(',').length >= 3;
    if (q.sciezka === 'property.rooms') return (w.io?.listaIzb || []).length >= 3 && Number(q.wartosc) >= 1 && Number(q.wartosc) <= 15;
    if (q.sciezka === 'legal.commonShare'){ const m = String(q.wartosc).match(/^(\d+)\/(\d+)$/); return !!m && Number(m[1]) > 0 && Number(m[1]) <= Number(m[2]); }
    if (q.sciezka === 'property.kwArea') return Number(q.wartosc) >= 5 && Number(q.wartosc) <= 5000;
    return true;
  };
  const tylkoDoReki = zeZrzutu ? new Set(['property.rooms', 'legal.ioRooms', 'legal.commonShare', 'property.kwArea'].filter(k => { const q = sito.pewne.find(x => x.sciezka === k); return q && !zrzutDobry(q); })) : new Set();
  const doWpisania = sito.pewne.filter(q => {
    if (/^legal\.kw(Local|Common)$/.test(q.sciezka) && !kwDobre(q.wartosc)){ niepewne.push(q); return false; }
    if (tylkoDoReki.has(q.sciezka)){ niepewne.push(q); return false; }
    return true;
  });
  project.autoWpisane = project.autoWpisane || {};
  for (const poleOp of doWpisania){
    const jest = getPath(project, poleOp.sciezka);
    const puste = jest === undefined || jest === null || String(jest).trim() === '' || jest === 0 || jest === '0';
    if (puste){ setPath(project, poleOp.sciezka, poleOp.wartosc); wpisane.push(poleOp.nazwa); project.autoWpisane[poleOp.sciezka] = { zrodlo: zeZrzutu ? 'księga wieczysta (zrzut ekranu)' : 'księga wieczysta', kiedy: new Date().toISOString() }; }
    else if (String(jest).trim().toLowerCase() !== String(poleOp.wartosc).trim().toLowerCase()) rozne.push(`${poleOp.nazwa}: w operacie „${String(jest).slice(0, 60)}", w księdze „${String(poleOp.wartosc).slice(0, 60)}"`);
  }
  // Powierzchnia z ksiegi jest punktem wyjscia, gdy nie ma jeszcze zadnej innej.
  if (w.io.powierzchnia && w.io.powierzchnia >= 5 && w.io.powierzchnia <= 5000 && !Number(project.property.usableArea) && (!zeZrzutu || /\d,\d{4}\s*M2/i.test(String(w.dzialy?.IO || '')))){ project.property.usableArea = w.io.powierzchnia; wpisane.push('powierzchnia użytkowa (z księgi — potwierdź pomiarem lub dokumentacją)'); }
  project.sources = project.sources || [];
  if (!project.sources.some(x => /Elektroniczne Księgi Wieczyste/i.test(x))) project.sources.unshift(`Elektroniczne Księgi Wieczyste – ekw.ms.gov.pl; badanie aktualnej treści: ${n.stanZDnia || new Date().toLocaleDateString('pl-PL')}${n.stanGodzina ? ` ${n.stanGodzina}` : ''}.`);
  if (pole) pole.value = '';
  renderAll(); changed();

  $('#szybkiDzialy').innerHTML = E.DZIALY.map(d => `<span class="ekw-section-chip ${w.rozpoznane.includes(d.nazwa) ? 'ok' : ''}">${d.nazwa}${w.rozpoznane.includes(d.nazwa) ? ' ✓' : ''}</span>`).join('');
  const p = project.property;
  const naglowek = [w.naglowek.kw || project.legal.kwLocal, [p.street && `ul. ${p.street}`, p.buildingNo, p.localNo && `lok. ${p.localNo}`].filter(Boolean).join(' '), p.city].filter(Boolean).join(' · ');
  szybkiPokaz('#szybkiKwWynik', `
    <p class="szybki-tytul">${escapeHTML(naglowek || 'Księga wczytana')}</p>
    <div class="automat-kolumny">
      <div><b>Odczytałem i wpisałem (${wpisane.length})</b>${wpisane.length ? `<ul>${szybkiLi(wpisane)}</ul>` : '<p>Nic nowego — te dane były już w operacie.</p>'}</div>
      <div>${w.brakuje.length ? `<b>Brakuje działów</b><p>Wklej jeszcze: <b style="display:inline">${escapeHTML(w.brakuje.join(', '))}</b>. Każdy dział to osobna strona w EKW.</p>` : '<b>Komplet</b><p>Mam wszystkie pięć działów księgi.</p>'}
        ${w.hipoteki.length ? `<p class="automat-mniej">Dział IV: ${w.hipoteki.length} ${w.hipoteki.length === 1 ? 'hipoteka' : 'hipoteki'} — treść jest w operacie, sprawdź kwoty.</p>` : ''}</div>
    </div>
    ${niepewne.length ? `<div class="automat-uwagi"><b>${zeZrzutu ? 'Liczby i dane odczytane ze zrzutu — NIE wpisałem sam, porównaj z księgą i wpisz' : 'Odczytane niepewnie — NIE wpisałem, sprawdź w księdze i wpisz ręcznie'}</b><ul>${szybkiLi(niepewne.map(q => `${q.nazwa}: odczytano „${String(q.wartosc).slice(0, 70)}"`))}</ul></div>` : ''}
    ${rozne.length ? `<div class="automat-uwagi"><b>Różni się od tego, co było w operacie — nie nadpisałem</b><ul>${szybkiLi(rozne)}</ul></div>` : ''}
    <p class="automat-mniej">Numerów PESEL i imion rodziców program nie przepisuje. Porównaj odczyt z księgą przed podpisem.</p>`,
    w.brakuje.length ? 'uwaga' : 'sukces');
  szybkiStan('#szybkiStanKw', w.brakuje.length ? `${w.rozpoznane.length} z 5 działów` : 'komplet', w.brakuje.length ? 'uwaga' : 'ok');
  showStatus(`Księga ${w.naglowek.kw || ''}: odczytane działy ${w.rozpoznane.join(', ') || '—'}, wpisanych pól: ${wpisane.length}.`, 'success', 7000);
  return { w, wpisane, rozne, niepewne };
}

/** Ksiega ze zrzutow ekranu: silnik Windows czyta slowa, program sklada z nich
 *  tekst i puszcza go ta sama droga co tekst wklejony. Numer ksiegi musi
 *  przejsc kontrole cyfry kontrolnej - inaczej nie wchodzi do operatu. */
async function szybkiKwZeZrzutow(){
  const O = window.OperoOcr, E = window.OperoEkw; if (!O || !E || !window.operatAPI?.ocrZrzuty) return null;
  const btn = $('#szybkiKwZrzuty'); const napis = btn?.textContent; if (btn){ btn.disabled = true; btn.textContent = 'Czytam zrzuty…'; }
  let r;
  try { r = await window.operatAPI.ocrZrzuty(); }
  catch (e) { r = { zrzuty: [], blad: cleanRemoteError(e) }; }
  if (btn){ btn.disabled = false; btn.textContent = napis; }
  if (r?.canceled) return null;
  const dobre = (r?.zrzuty || []).filter(z => z.ok && (z.slowa || []).length);
  const zle = (r?.zrzuty || []).filter(z => !z.ok || !(z.slowa || []).length);
  if (!dobre.length){
    const powod = r?.blad || zle[0]?.powod || 'Na zrzutach nie rozpoznano tekstu.';
    szybkiPokaz('#szybkiKwWynik', `<p><b>Nie odczytałem zrzutów.</b> ${escapeHTML(powod)}</p><p class="automat-mniej">Zawsze możesz skopiować tekst ze strony EKW (Ctrl+A, Ctrl+C) i wkleić go powyżej.</p>`, 'uwaga');
    return { ok: false, powod };
  }
  let tekst = O.zrzutyNaTekst(dobre);
  // Numer ksiegi: jedna zle rozpoznana cyfra to inna nieruchomosc.
  const n = E.naglowek(tekst);
  let kwUwaga = '';
  if (n.kw){
    const cz = n.kw.split('/');
    const spr = window.OperoPola?.sprawdzKw ? window.OperoPola.sprawdzKw({ kod: cz[0], numer: cz[1], kontrolna: cz[2] }) : { ok: true };
    if (!spr.ok){
      kwUwaga = `Numer księgi odczytany ze zrzutu („${n.kw}") nie przechodzi kontroli cyfry kontrolnej — silnik pomylił znak. Numeru NIE wpisałem: wpisz go ręcznie w operacie.`;
      tekst = tekst.replace(/(KSIĘGI WIECZYSTEJ NR)\s+\S+\s*\/\s*\S+\s*\/\s*\S+/i, '$1 [NIECZYTELNY]');
    }
  } else kwUwaga = 'Na zrzutach nie znalazłem nagłówka z numerem księgi — wpisz numer ręcznie albo dodaj zrzut górnej części strony.';
  // Zrzuty zostaja w operacie jako dokument zrodlowy.
  for (const z of dobre){
    if (z.zdjecie?.dataUrl) project.photos.push({ ...z.zdjecie, category: 'Dokumenty', rodzajDokumentu: 'kw', caption: `Zrzut księgi wieczystej — ${z.nazwa}` });
  }
  const pole = $('#szybkiKwTekst'); if (pole) pole.value = tekst;
  szybkiZeZrzutu = true;
  const wynik = szybkiCzytajKw();
  const box = $('#szybkiKwWynik');
  if (box && wynik){
    const uw = document.createElement('div'); uw.className = 'automat-uwagi';
    uw.innerHTML = `<b>Odczyt ze zrzutów ekranu (${dobre.length}) — porównaj każdą liczbę z księgą</b><ul>`
      + `<li>Rozpoznawanie pisma myli podobne znaki (0 i O, 1 i I, 8 i B). Sprawdź zwłaszcza numery, udział i powierzchnię.</li>`
      + (kwUwaga ? `<li>${escapeHTML(kwUwaga)}</li>` : `<li>Numer księgi ${escapeHTML(n.kw)} przeszedł kontrolę cyfry kontrolnej.</li>`)
      + zle.map(z => `<li>${escapeHTML(z.nazwa)}: ${escapeHTML(z.powod || 'nie rozpoznano tekstu')}</li>`).join('')
      + `</ul><details class="automat-plan"><summary>Pokaż tekst odczytany ze zrzutów</summary><pre>${escapeHTML(tekst.slice(0, 6000))}</pre></details>`;
    box.insertBefore(uw, box.firstChild);
    box.dataset.stan = 'uwaga';
  } else if (!wynik){
    szybkiPokaz('#szybkiKwWynik', `<p><b>Odczytałem tekst ze zrzutów, ale nie rozpoznałem w nim działów księgi.</b> ${escapeHTML(kwUwaga)}</p><details class="automat-plan" open><summary>Tekst odczytany ze zrzutów</summary><pre>${escapeHTML(tekst.slice(0, 6000))}</pre></details>`, 'uwaga');
    if (pole) pole.value = tekst;
  }
  changed();
  return { ok: !!wynik, tekst, kwUwaga, zrzutow: dobre.length };
}

function szybkiCenaZPola(){
  const el = $('#szybkiCena'); if (!el) return;
  const n = Number(String(el.value || '').replace(/[^\d,.]/g, '').replace(',', '.'));
  project.property.askingPrice = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  changed(); szybkiStanDokumentow();
}
function szybkiStanDokumentow(){
  const z = (project.photos || []).length, d = (project.files || []).length, c = Number(project.property?.askingPrice) || 0;
  const cz = [z && `${z} zdjęć`, d && `${d} dokumentów`, c && `cena ${new Intl.NumberFormat('pl-PL').format(c)} zł`].filter(Boolean);
  szybkiStan('#szybkiStanDok', cz.length ? cz.join(' · ') : 'nieobowiązkowe', cz.length ? 'ok' : '');
  const el = $('#szybkiCena'); if (el && document.activeElement !== el) el.value = c ? new Intl.NumberFormat('pl-PL').format(c) : '';
}

let szybkiCzekaNaTransakcje = false;
/** Krok 3: rejestry i mapy, kod QR, a potem okno szukania transakcji. */
async function szybkiAutomat(){
  const p = project.property || {};
  if (!String(p.city || '').trim() || !String(p.street || '').trim()){
    szybkiPokaz('#szybkiAutoWynik', '<p>Nie znam jeszcze adresu. Wklej księgę wieczystą w kroku 1 — adres jest w dziale I-O — albo wpisz go w operacie.</p>', 'pytanie');
    return null;
  }
  const btn = $('#szybkiAutoBtn'); const napis = btn?.textContent; if (btn){ btn.disabled = true; btn.textContent = 'Pracuję…'; }
  szybkiStan('#szybkiStanAuto', 'zbieram dane…', 'praca');
  szybkiPokaz('#szybkiAutoWynik', '<p class="automat-praca">Ewidencja, mapa otoczenia i plan miejscowy — do pół minuty…</p>', 'praca');
  let a = null;
  try { a = await automatZbierz(); } catch (e) { console.error(e); }
  // Kod QR do mapy: z adresu albo ze wspolrzednych, ktore automat wlasnie ustalil.
  let qr = false;
  try { await ensureMapsQR(true); qr = !!project.location.mapsQrDataUrl; } catch (e) { console.warn('QR:', e); }
  if (btn){ btn.disabled = false; btn.textContent = napis; }
  const wpisane = a?.wpisane || [], uwagi = a?.uwagi || [];
  szybkiPokaz('#szybkiAutoWynik', `
    <div class="automat-kolumny">
      <div><b>Zebrane i wpisane (${wpisane.length + (qr ? 1 : 0)})</b><ul>${szybkiLi([...wpisane, ...(qr ? ['kod QR do mapy'] : [])]) || '<li>nic nowego</li>'}</ul></div>
      <div>${uwagi.length ? `<b>Czego nie udało się ustalić</b><ul>${szybkiLi(uwagi)}</ul>` : '<b>Bez uwag</b><p>Wszystkie źródła odpowiedziały.</p>'}</div>
    </div>
    <p class="automat-mniej">Teraz otwieram szukanie transakcji. Najlepiej pasujące program wstawi sam, dalsze pokaże do decyzji. Po zamknięciu okna wróć do kroku 4.</p>`,
    wpisane.length ? 'sukces' : 'uwaga');
  szybkiStan('#szybkiStanAuto', 'dane zebrane — szukam transakcji', 'praca');
  // Transakcje: to samo okno i te same kryteria z odchylka co wszedzie w programie.
  szybkiCzekaNaTransakcje = true;
  try { szukOtworz(); if (!szukTrwa && $('#szukStart') && !$('#szukStart').disabled) $('#szukStart').click(); } catch (e) { console.warn('Szukanie:', e); }
  return a;
}
function szybkiPoTransakcjach(){
  if (!szybkiCzekaNaTransakcje) return;
  szybkiCzekaNaTransakcje = false;
  const n = (project.market?.transactions || []).length;
  szybkiStan('#szybkiStanAuto', n ? `${n} transakcji w operacie` : 'brak transakcji', n ? 'ok' : 'uwaga');
}

/** Krok 4: obliczenia, opisy, kontrola i podsumowanie z lista brakow. */
async function szybkiFinal(){
  const btn = $('#szybkiFinalBtn'); const napis = btn?.textContent; if (btn){ btn.disabled = true; btn.textContent = 'Liczę i piszę…'; }
  szybkiStan('#szybkiStanFinal', 'pracuję…', 'praca');
  szybkiPokaz('#szybkiFinalWynik', '<p class="automat-praca">Liczę wartość i piszę puste opisy…</p>', 'praca');
  let per = null;
  try { calc = obliczProjekt(); per = await perNapiszWszystkie(); } catch (e) { console.error(e); }
  calc = obliczProjekt(); renderAll();
  let audyt = null;
  try { audyt = window.OperoAudyt?.audytOperatu(project, calc) || null; } catch (e) { console.warn('Audyt:', e); }
  invalidateValidationCache?.();
  const braki = allCriticalIssues();
  if (btn){ btn.disabled = false; btn.textContent = napis; }
  const wartosc = Number(calc?.valueRounded) || 0, jedn = Number(calc?.unitAfterRound) || 0, oferta = Number(project.property?.askingPrice) || 0;
  const zl = (x) => `${new Intl.NumberFormat('pl-PL').format(Math.round(x))} zł`;
  const roznica = wartosc && oferta ? Math.round((wartosc / oferta - 1) * 1000) / 10 : null;
  const napisane = (per?.napisane?.length || 0) + (per?.szkice?.length || 0);
  const transakcje = (project.market?.transactions || []).length;
  szybkiPokaz('#szybkiFinalWynik', `
    <div class="szybki-liczby">
      <div><span>Wartość rynkowa</span><b>${wartosc ? zl(wartosc) : '—'}</b><small>${jedn ? `${zl(jedn)} za m²` : 'jeszcze nie policzona'}</small></div>
      <div><span>Transakcje w zbiorze</span><b>${transakcje}</b><small>${transakcje ? 'z rejestru i Twojej bazy' : 'wróć do kroku 3'}</small></div>
      <div><span>Opisy napisane teraz</span><b>${napisane}</b><small>${per?.brakDanych?.length ? `${per.brakDanych.length} czeka na dane` : 'z danych operatu'}</small></div>
      ${oferta ? `<div><span>Cena ofertowa</span><b>${zl(oferta)}</b><small>${roznica === null ? 'porównam po obliczeniu' : `wycena ${roznica >= 0 ? 'wyższa' : 'niższa'} o ${String(Math.abs(roznica)).replace('.', ',')}%`}</small></div>` : ''}
    </div>
    ${braki.length ? `<div class="automat-uwagi"><b>Do uzupełnienia przed podpisem (${braki.length})</b><ul>${szybkiLi(braki.slice(0, 14))}</ul>${braki.length > 14 ? `<p>…i ${braki.length - 14} kolejnych — pełna lista w „Wynik → Kontrola przed PDF".</p>` : ''}</div>`
      : '<p class="szybki-gotowe">Kontrola nie zgłasza braków blokujących. Przeczytaj operat i podpisz.</p>'}
    ${per?.doDecyzji?.length ? `<p class="automat-mniej">Do Twojej decyzji (tekst z wartością spoza danych): ${escapeHTML(per.doDecyzji.join(', '))}.</p>` : ''}
    <p class="automat-mniej">To jest projekt operatu. Każdą wartość, ocenę i zdanie możesz zmienić — „Otwórz operat do poprawek". Podpisujesz go Ty.</p>`,
    braki.length ? 'uwaga' : 'sukces');
  szybkiStan('#szybkiStanFinal', braki.length ? `${braki.length} do uzupełnienia` : 'gotowe do przeczytania', braki.length ? 'uwaga' : 'ok');
  return { wartosc, braki, per, audyt };
}

/* ============================================================
   EXPRESS — SZYBKA WYCENA
   Kilka danych → orientacyjna wartosc z przedzialem. Logika: szybka-wycena.js.
   Niczego nie zapisuje w biezacym operacie.
   ============================================================ */
let swOstatni = null, swTrwa = false;
const swLiczba = (id) => { const n = Number(String($(id)?.value || '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const swZl = (x) => `${new Intl.NumberFormat('pl-PL').format(Math.round(x))} zł`;

function swZOperatu(){
  const p = project.property || {};
  const ustaw = (id, v) => { const el = $(id); if (el && v !== undefined && v !== null && String(v).trim() !== '' && v !== 0) el.value = String(v).replace('.', ','); };
  ustaw('#swMiasto', p.city); ustaw('#swDzielnica', p.district);
  ustaw('#swUlica', [p.street, p.buildingNo].filter(Boolean).join(' '));
  ustaw('#swPow', p.usableArea); ustaw('#swPokoje', p.rooms); ustaw('#swPietro', p.floor);
  if (Number(p.askingPrice) > 0) ustaw('#swOferta', p.askingPrice);
}

async function swWycenTeraz(){
  const W = window.OperoSzybka, S = window.OperoSzukanie; if (!W || !S || swTrwa) return null;
  const stanEl = $('#swStanPracy'), box = $('#swWynik');
  const pokaz = (html, stan) => { if (box){ box.innerHTML = html; box.dataset.stan = stan || ''; box.classList.toggle('hidden', !html); } };
  const miasto = ($('#swMiasto')?.value || '').trim(), dzielnica = ($('#swDzielnica')?.value || '').trim();
  const A = window.OperoAdres, rozb = A ? A.rozbij($('#swUlica')?.value || '') : { ulica: ($('#swUlica')?.value || '').trim(), numer: '' };
  const ulica = (rozb.ulica || '').trim(), numer = (rozb.numer || '').trim();
  const pow = swLiczba('#swPow');
  if (!miasto || !(pow > 0)){
    pokaz('<p>Podaj przynajmniej <b>miejscowość</b> i <b>powierzchnię</b>. Ulica, pokoje i piętro zawężają dobór do naprawdę podobnych lokali.</p>', 'pytanie');
    (!miasto ? $('#swMiasto') : $('#swPow'))?.focus(); return null;
  }
  const pokojeT = ($('#swPokoje')?.value || '').trim(), pietroT = ($('#swPietro')?.value || '').trim();
  const promien = Math.min(10000, Math.max(300, swLiczba('#swPromien') || 1500));
  const dzis = todayISO();
  swTrwa = true; const btn = $('#swWycen'); if (btn) btn.disabled = true;
  if (stanEl) stanEl.textContent = 'Szukam transakcji podobnych lokali…';

  // 1. Polozenie adresu (zeby mierzyc odleglosc w metrach), 2. transakcje z rejestru i z bazy.
  let punkt = null, powiat = '', teryt = '';
  const uwagi = [];
  if (ulica){
    try {
      const r = await window.operatAPI.dzialkaPoAdresie({ miasto, ulica, numer });
      punkt = r?.punkt || (r?.punkty || [])[0] || null; powiat = (r?.dzialki || [])[0]?.powiat || '';
      teryt = String((r?.dzialki || [])[0]?.id || '').replace(/\D/g, '').slice(0, 4);
      if (!punkt) uwagi.push('Nie ustaliłem położenia adresu — dobór oparłem na nazwie ulicy i dzielnicy, bez odległości.');
    } catch (e) { uwagi.push(`Położenie adresu: ${cleanRemoteError(e)}.`); }
  } else uwagi.push('Bez ulicy program dobiera transakcje z całej miejscowości i dzielnicy — podaj ulicę, żeby zawęzić do najbliższych.');
  const przedmiot = { powierzchnia: pow, dataWyceny: dzis, miejscowosc: miasto, prawo: '', okresMiesiecy: 24 };
  const [rcn, baza] = await Promise.allSettled([
    punkt ? window.operatAPI.rcnGeoportal({ x: punkt.x, y: punkt.y, promien, typy: ['lokale'], powiat, teryt }) : Promise.resolve(null),
    window.operatAPI.bazaDopasuj ? window.operatAPI.bazaDopasuj(przedmiot) : Promise.resolve(null),
  ]);
  let pozycje = [];
  const zrodla = [];
  if (rcn.status === 'fulfilled' && rcn.value?.transakcje?.length){
    let dobre = rcn.value.transakcje;
    try { dobre = window.OperoRCN.ocen(rcn.value.transakcje, przedmiot).przyjete; } catch {}
    // Do szybkiej wyceny mieszkania wchodza tylko CALE lokale MIESZKALNE.
    const przedSitem = dobre.length;
    dobre = dobre.filter(t => !t.czescUdzialowa && !/gara|niemieszk|użytk|uzytk|handl|biur|usług|uslug|magaz/.test(String(t.funkcja || '')));
    if (dobre.length < przedSitem) uwagi.push(`Pominąłem ${przedSitem - dobre.length} transakcji lokali niemieszkalnych, garaży albo udziałów — zaniżałyby wynik.`);
    if (rcn.value.uwagaOsi) uwagi.push(rcn.value.uwagaOsi);
    if (dobre.length && dobre.every(t => t.bezAdresu)) uwagi.push(`Rejestr nie podał adresów tych transakcji${(rcn.value.pola || []).length ? ` (pola rejestru: ${rcn.value.pola.slice(0, 40).join(', ')})` : ''} — dobór oparłem na odległości i powierzchni.`);
    pozycje = pozycje.concat(dobre.map(t => ({ ...t, zrodloNazwa: 'Rejestr Cen Nieruchomości' })));
    zrodla.push(`Rejestr Cen Nieruchomości (${dobre.length})`);
  } else if (rcn.status === 'rejected') uwagi.push(`Rejestr Cen Nieruchomości: ${cleanRemoteError(rcn.reason)}.`);
  else if (rcn.status === 'fulfilled' && rcn.value?.uwagaOsi) uwagi.push(rcn.value.uwagaOsi);
  else if (punkt) uwagi.push(`Rejestr Cen Nieruchomości nie zwrócił transakcji w promieniu ${promien} m.`);
  if (baza.status === 'fulfilled' && baza.value?.kandydaci?.length){
    pozycje = pozycje.concat(baza.value.kandydaci.map(t => ({ ...t, zrodloNazwa: 'Twoja baza rynku' })));
    zrodla.push(`Twoja baza rynku (${baza.value.kandydaci.length})`);
  }
  const kryteria = S.kryteria({ miejscowosc: miasto, dzielnica, ulica, x: punkt?.x ?? null, y: punkt?.y ?? null,
    powierzchnia: pow, pokoje: pokojeT === '' ? null : Number(pokojeT.replace(',', '.')), pietro: pietroT === '' ? null : Number(pietroT.replace(',', '.')),
    odchylkaPowPct: 25, dataWyceny: dzis, okresMiesiecy: 24, promienM: promien, zapasPct: 25 });
  const w = W.wycen(pozycje, kryteria, { stan: $('#swStan')?.value || 'przecietny', dobierz: S.dopasuj });
  swTrwa = false; if (btn) btn.disabled = false; if (stanEl) stanEl.textContent = '';
  const li = (a) => a.map(x => `<li>${escapeHTML(x)}</li>`).join('');
  if (!w.ok){
    swOstatni = null;
    pokaz(`<p class="szybka-brak"><b>Nie podaję wartości.</b> ${escapeHTML(w.powod)}</p>
      <p class="automat-mniej">Sprawdzonych transakcji: ${w.sprawdzono ?? pozycje.length}${zrodla.length ? ` — ${escapeHTML(zrodla.join(', '))}` : ''}.</p>
      ${uwagi.length ? `<div class="automat-uwagi"><b>Co poszło nie tak</b><ul>${li(uwagi)}</ul></div>` : ''}`, 'uwaga');
    return w;
  }
  const oferta = W.oferta(w, swLiczba('#swOferta'));
  // Szacunek i oferta rozjezdzaja sie o ponad polowe: to prawie zawsze znak,
  // ze transakcje sa nie z tego rynku (inny typ lokali, zly obszar), a nie okazja.
  const alarm = oferta && Math.abs(oferta.pct) > 60
    ? 'Szacunek i cena ofertowa różnią się o ponad 60%. To zwykle znaczy, że użyte transakcje nie są z tego samego rynku co wyceniany lokal — sprawdź listę poniżej, zanim użyjesz tej liczby.' : '';
  swOstatni = { w, dane: { miasto, dzielnica, ulica, numer, pow, pokoje: pokojeT, pietro: pietroT, oferta: oferta?.cena || 0 } };
  pokaz(`
    <div class="szybka-glowna">
      <div class="szybka-wartosc"><span>Szacunkowa wartość</span><b>${swZl(w.wartosc)}</b><small>${swZl(w.jednostkowa)} za m² · stan: ${escapeHTML(w.stanOpis)}</small></div>
      <div class="szybka-przedzial"><span>Przedział rynku</span><b>${swZl(w.od)} – ${swZl(w.do)}</b><small>dolny i górny kwartyl cen podobnych lokali (${new Intl.NumberFormat('pl-PL').format(w.q1)}–${new Intl.NumberFormat('pl-PL').format(w.q3)} zł/m²)</small></div>
      <div class="szybka-pewnosc" data-pewnosc="${w.pewnosc}"><span>Pewność szacunku</span><b>${w.pewnosc}</b><small>${w.ile} podobnych transakcji, rozrzut cen ${String(w.rozrzutPct).replace('.', ',')}%${w.zZapasem ? ', część z dalszego dopasowania' : ''}</small></div>
    </div>
    ${alarm ? `<p class="szybka-brak"><b>Uwaga — wynik wymaga sprawdzenia.</b> ${escapeHTML(alarm)}</p>` : ''}
    ${oferta ? `<p class="szybka-oferta" data-w="${oferta.wPrzedziale ? 'tak' : 'nie'}"><b>Cena ofertowa ${swZl(oferta.cena)}:</b> ${escapeHTML(oferta.zdanie)}</p>` : ''}
    <div class="szybka-tabela"><table><thead><tr><th>Adres</th><th>Odległość</th><th>Data</th><th>Pow.</th><th>Pokoje</th><th>Piętro</th><th>Cena</th><th>zł/m²</th><th>Rynek</th><th>Dopas.</th><th>Źródło</th></tr></thead><tbody>
      ${w.transakcje.map(t => `<tr><td>${escapeHTML(t.adres || 'brak adresu w rejestrze')}</td><td>${t.odlegloscM != null ? `${new Intl.NumberFormat('pl-PL').format(t.odlegloscM)} m` : '—'}</td><td>${escapeHTML(t.data || '—')}</td><td>${t.powierzchnia ? String(t.powierzchnia).replace('.', ',') : '—'}</td><td>${t.pokoje ?? '—'}</td><td>${t.pietro ?? '—'}</td><td>${t.cena ? new Intl.NumberFormat('pl-PL').format(t.cena) : '—'}</td><td>${new Intl.NumberFormat('pl-PL').format(t.jednostkowa)}</td><td>${escapeHTML(t.rynek || '—')}</td><td>${t.punkty ?? '—'}</td><td>${escapeHTML(t.zrodlo)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="automat-mniej">Najbliższe ${w.transakcje.length} z ${w.ile} użytych transakcji. Źródła: ${escapeHTML(zrodla.join(', '))}. Okres: ostatnie 24 miesiące, bez aktualizacji cen w czasie.</p>
    ${uwagi.length ? `<div class="automat-uwagi"><b>Uwagi</b><ul>${li(uwagi)}</ul></div>` : ''}
    <div class="szybki-pasek"><button type="button" class="btn primary" id="swDoOperatu">Zrób z tego pełny operat</button><button type="button" class="btn ghost" id="swRozszerz">Otwórz operat skrócony</button></div>
    <p class="szybka-zastrzezenie">To szacunek orientacyjny: bez oględzin, bez badania księgi wieczystej, bez cech rynkowych i wag. Nie jest operatem szacunkowym i nie zastępuje go.</p>`, 'sukces');
  return w;
}

/** Szybka wycena → nowy pelny operat z tymi danymi (od dokumentow, jak kazdy). */
async function swDoPelnegoOperatu(){
  if (!swOstatni) return;
  const d = swOstatni.dane;
  await createProjectFromModule('local_kcm');
  const p = project.property;
  p.city = d.miasto; p.district = d.dzielnica; p.street = d.ulica; p.buildingNo = d.numer;
  p.usableArea = d.pow; if (d.pokoje !== '') p.rooms = Number(d.pokoje) || 0; if (d.pietro !== '') p.floor = d.pietro;
  if (d.oferta) p.askingPrice = d.oferta;
  renderAll(); changed(); switchTab('project');
  showStatus('Nowy pełny operat z danymi z szybkiej wyceny. Zacznij od dokumentów — karta na górze.', 'success', 8000);
}

function hookSzybkaWycena(){
  if (!$('#swKarta')) return;
  $('#swWycen')?.addEventListener('click', swWycenTeraz);
  // Ulica z panstwowego rejestru punktow adresowych - te same podpowiedzi co w operacie.
  try { const u = $('#swUlica'); if (u){ u.dataset.adresPrefiks = 'sw'; adresJednoPodepnij(u); } } catch (e) { console.warn('Adres w szybkiej wycenie:', e); }
  $('#swZOperatu')?.addEventListener('click', swZOperatu);
  $('#swKarta').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT'){ e.preventDefault(); swWycenTeraz(); } });
  $('#swStan')?.addEventListener('change', () => { if (swOstatni) swWycenTeraz(); });
  document.addEventListener('click', ev => {
    if (ev.target.closest('#swDoOperatu')){ swDoPelnegoOperatu(); return; }
    if (ev.target.closest('#swRozszerz')){ const r = $('#exRozszerzony'); if (r){ r.open = true; r.scrollIntoView({ behavior: uiPrefs.motion === 'full' ? 'smooth' : 'auto', block: 'start' }); } }
  });
}

/* ============================================================
   OKNO PORTALU i PER W INTERNECIE
   ============================================================ */
function portalKryteria(){
  const pow = Number(String($('#szukPow')?.value || project.property?.usableArea || '').replace(',', '.')) || 0;
  const odch = Number(String($('#szukOdchylka')?.value || '20').replace(',', '.')) || 20;
  return {
    miasto: ($('#szukMiasto')?.value || project.property?.city || '').trim(),
    dzielnica: ($('#szukDzielnica')?.value || project.property?.district || '').trim(),
    pokoje: ($('#szukPokoje')?.value || project.property?.rooms || '') || '',
    powOd: pow ? Math.round(pow * (1 - odch / 100)) : '', powDo: pow ? Math.round(pow * (1 + odch / 100)) : '',
  };
}
async function portalOtworzWOknie(id){
  const P = window.OperoPortal; if (!P) return;
  const url = P.adresPortalu(id, portalKryteria());
  if (!url){ showStatus('Nie znam tego portalu.', 'error', 5000); return; }
  try {
    await window.operatAPI.portalOtworz({ url });
    mowi('Portal jest otwarty w oknie programu. Przejdź do listy ogłoszeń, a potem kliknij „Wczytaj oferty z otwartej strony".', {
      rodzaj: 'info', grupa: SZUK_GRUPA,
      szczegoly: 'Program czyta tylko tę stronę, którą masz otwartą — nie przegląda portalu sam. Kolejną stronę wyników wczytujesz kolejnym kliknięciem.',
    });
  } catch (e) { showStatus(`Okno portalu: ${cleanRemoteError(e)}`, 'error', 8000); }
}
/** Czyta strone otwarta w oknie portalu. `cel`: 'portal' (oferty) albo 'serwis' (tabela transakcji). */
async function portalWczytajStrone(cel = 'portal'){
  const P = window.OperoPortal, S = window.OperoSzukanie; if (!P || !S) return null;
  const stan = $(cel === 'serwis' ? '#szukWklejenieStan' : '#szukPortalStan');
  const powiedz = (t, waga) => { if (stan){ stan.textContent = t; stan.dataset.waga = waga; } };
  let r;
  try { r = await window.operatAPI.portalCzytaj(); } catch (e) { r = { ok: false, powod: cleanRemoteError(e) }; }
  if (!r?.ok){ powiedz(r?.powod || 'Nie udało się odczytać strony.', 'blad'); return null; }
  if (cel === 'serwis'){
    // Serwis z tabela transakcji: tekst strony idzie ta sama droga co wklejony.
    const pole = $('#szukWklejenie'); if (pole) pole.value = r.tekst;
    szukWczytajWklejone();
    if (stan && !/Nierozpoznane|rozpozna/i.test(stan.textContent)) stan.textContent += ` (strona: ${r.host})`;
    return r;
  }
  const w = P.ofertyZTekstu(r.tekst, { miasto: portalKryteria().miasto, zrodlo: r.host });
  const opis = `${w.komunikat}${w.pominiete.length ? ` Pominięte: ${w.pominiete.length} (bez powierzchni albo to nie cena mieszkania).` : ''} Strona: ${r.host}.`;
  powiedz(opis, w.ok ? 'ostrzezenie' : 'blad');
  if (!w.ok) return w;
  if (!szukPrzebieg) szukPrzebieg = S.nowy(szukKryteriaZPol());
  szukPortaleWczytaj({ wiersze: w.oferty, komunikat: opis });
  return w;
}

/* ---- PER szuka w internecie ---- */
let siecJestKlucz = false;
async function siecOdswiezStan(){
  try { const st = await window.operatAPI.siecStan?.(); siecJestKlucz = !!st?.jestKlucz; } catch { siecJestKlucz = false; }
  const el = $('#siecStan'); if (el) el.textContent = siecJestKlucz ? 'klucz zapisany — szukanie włączone' : 'brak klucza — szukanie wyłączone';
}
async function siecZapiszKlucz(usun = false){
  const pole = $('#siecKlucz'), kom = $('#siecKomunikat');
  try {
    await window.operatAPI.siecKluczZapisz(usun ? '' : String(pole?.value || '').trim());
    if (pole) pole.value = '';
    if (kom){ kom.textContent = usun ? 'Klucz usunięty.' : 'Klucz zapisany na tym komputerze.'; kom.dataset.rodzaj = 'sukces'; }
  } catch (e) { if (kom){ kom.textContent = cleanRemoteError(e); kom.dataset.rodzaj = 'blad'; } }
  siecOdswiezStan();
}
function siecDaneDoZapytania(){
  const p = project.property || {};
  return { miasto: p.city, dzielnica: p.district, ulica: p.street, numer: p.buildingNo, obreb: project.egib?.district, dzialka: project.egib?.plotNo };
}
/** Panel pod polem: zapytanie, wyniki ze zrodlami, wybor, „Napisz z zaznaczonych". */
function siecPanel(guzik){
  const pf = guzik.closest('.per-field'); const per = pf?.querySelector('.per-inline'); if (!pf || !per) return;
  const cel = per.dataset.perTarget, S = window.OperoSiec;
  let panel = pf.querySelector('.siec-panel');
  if (panel){ panel.remove(); return; }
  panel = document.createElement('div'); panel.className = 'siec-panel';
  panel.innerHTML = `<div class="siec-pasek"><input type="text" class="siec-zapytanie" aria-label="Zapytanie do wyszukiwarki" value="${escapeHTML(S.zapytanie(cel, siecDaneDoZapytania()))}">
      <button type="button" class="btn primary siec-szukaj">Szukaj</button></div>
    <div class="siec-wyniki" aria-live="polite"><p class="automat-mniej">Popraw zapytanie, jeżeli trzeba, i kliknij „Szukaj". Wyniki pokażę ze źródłem — Ty wybierasz, którym ufasz.</p></div>`;
  pf.appendChild(panel);
  const wynikiEl = panel.querySelector('.siec-wyniki');
  let wyniki = [];
  const szukaj = async () => {
    const q = panel.querySelector('.siec-zapytanie').value;
    wynikiEl.innerHTML = '<p class="automat-praca">Szukam…</p>';
    let r; try { r = await window.operatAPI.siecSzukaj({ zapytanie: q }); } catch (e) { r = { ok: false, powod: cleanRemoteError(e), wyniki: [] }; }
    if (!r.ok){
      wynikiEl.innerHTML = `<p class="automat-uwaga">${escapeHTML(r.powod || 'Wyszukiwarka nie odpowiedziała.')}</p>`
        + (r.brakKlucza ? '<button type="button" class="btn gold-outline siec-do-ustawien">Przejdź do Ustawień</button>' : '');
      wynikiEl.querySelector('.siec-do-ustawien')?.addEventListener('click', () => { switchTab('settings'); setTimeout(() => $('#siecKarta')?.scrollIntoView({ block: 'center' }), 200); });
      return;
    }
    wyniki = r.wyniki || [];
    if (!wyniki.length){ wynikiEl.innerHTML = '<p class="automat-uwaga">Wyszukiwarka nic nie znalazła dla tego zapytania. Zmień słowa i spróbuj ponownie.</p>'; return; }
    wynikiEl.innerHTML = wyniki.map((w, i) => `<label class="siec-wynik"><input type="checkbox" data-siec-i="${i}"${w.urzedowe ? ' checked' : ''}>
        <span><b>${escapeHTML(w.tytul || w.domena)}</b>${w.urzedowe ? '<i class="siec-urzad">strona urzędowa</i>' : ''}<small>${escapeHTML(w.opis)}</small><em>${escapeHTML(w.domena)}</em></span></label>`).join('')
      + `<div class="siec-pasek"><button type="button" class="btn primary siec-napisz">Napisz z zaznaczonych (PER)</button><button type="button" class="btn ghost siec-zamknij">Zamknij</button></div>
         <p class="automat-mniej">Internet to nie rejestr. Zaznacz tylko źródła, którym ufasz — tekst zobaczysz przed wstawieniem, a źródła trafią do operatu.</p>`;
    wynikiEl.querySelector('.siec-zamknij').addEventListener('click', () => panel.remove());
    wynikiEl.querySelector('.siec-napisz').addEventListener('click', async (ev) => {
      const wybrane = [...wynikiEl.querySelectorAll('[data-siec-i]:checked')].map(c => wyniki[Number(c.dataset.siecI)]);
      if (!wybrane.length){ showStatus('Zaznacz przynajmniej jedno źródło, z którego PER ma skorzystać.', 'info', 6000); return; }
      const b = ev.currentTarget; b.disabled = true; b.textContent = 'PER pisze…';
      await siecNapiszPole(cel, per.dataset.perTask, wybrane, panel);
      b.disabled = false; b.textContent = 'Napisz z zaznaczonych (PER)';
    });
  };
  panel.querySelector('.siec-szukaj').addEventListener('click', szukaj);
  panel.querySelector('.siec-zapytanie').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); szukaj(); } });
}
async function siecNapiszPole(cel, zadanie, wybrane, panel){
  const S = window.OperoSiec, pole = document.querySelector(`[data-path="${cel}"]`);
  const nazwa = pole ? perNazwaPola(pole) : cel;
  const fakty = [...perFaktyPola(cel), ...S.fakty(wybrane)];
  const obecny = String(getPath(project, cel) ?? '').trim();
  const polecenie = perPolecenieDlaPola(`${zadanie || ''} Uwzględnij informacje oznaczone „z internetu" i zaznacz w tekście, że pochodzą ze wskazanych źródeł.${obecny ? ` Dotychczasowy tekst pola (zachowaj jego treść, uzupełnij): ${obecny.slice(0, 1500)}` : ''}`, nazwa, fakty);
  let tekst = '';
  try { const w = await window.operatAPI.perNapisz({ prompt: polecenie, rozdzial: cel }); tekst = String(w?.text || '').trim(); }
  catch (e) { showStatus(`PER nie napisał tekstu: ${cleanRemoteError(e)}. Sprawdź w Ustawieniach, czy model PER jest wczytany.`, 'error', 10000); return null; }
  if (!tekst){ showStatus('PER nie zwrócił tekstu.', 'error', 7000); return null; }
  const zrodla = S.zrodla(wybrane);
  const zDopiskiem = `${tekst}\n\nŹródła internetowe: ${wybrane.map(w => w.domena).join(', ')} [DO POTWIERDZENIA].`;
  // Tekst z internetu ZAWSZE idzie do podgladu - nigdy sam do operatu.
  perPolePodglad(obecny || '(pole było puste)', zDopiskiem, (nowy) => {
    setPath(project, cel, nowy); if (pole) pole.value = nowy;
    project.sources = project.sources || [];
    for (const z of zrodla) if (!project.sources.includes(z)) project.sources.push(z);
    changed(); renderAll(); panel?.remove();
    showStatus(`Tekst wstawiony, ${zrodla.length} źródeł internetowych dopisanych do źródeł operatu. Potwierdź je przed podpisem.`, 'success', 9000);
  });
  return { tekst: zDopiskiem, zrodla };
}
/** Dokleja „Szukaj w internecie" przy kazdym polu z przyciskiem PER. */
function siecPodepnijGuziki(){
  if (!window.OperoSiec || !window.operatAPI?.siecSzukaj) return;
  $$('.per-field').forEach(pf => {
    const per = pf.querySelector('.per-inline');
    if (!per || pf.querySelector('.siec-guzik') || ['legalBases', 'sources'].includes(per.dataset.perTarget)) return;
    let rzad = pf.querySelector('.per-guziki');
    if (!rzad){ rzad = document.createElement('div'); rzad.className = 'per-guziki'; per.replaceWith(rzad); rzad.appendChild(per); }
    const g = document.createElement('button'); g.type = 'button'; g.className = 'btn siec-guzik'; g.textContent = '⌕ Szukaj w internecie';
    g.addEventListener('click', () => siecPanel(g));
    rzad.appendChild(g);
  });
}

function hookSzybki(){
  $('#szukPortalOkno')?.addEventListener('click', () => portalOtworzWOknie($('#szukPortalWybor')?.value || 'otodom'));
  $('#szukPortalCzytaj')?.addEventListener('click', () => portalWczytajStrone('portal'));
  $('#szukSerwisOkno')?.addEventListener('click', () => portalOtworzWOknie('deweloperuch'));
  $('#szukSerwisCzytaj')?.addEventListener('click', () => portalWczytajStrone('serwis'));
  $('#siecZapisz')?.addEventListener('click', () => siecZapiszKlucz(false));
  $('#siecUsun')?.addEventListener('click', () => siecZapiszKlucz(true));
  $('#siecStrona')?.addEventListener('click', () => window.operatAPI.openExternal('https://brave.com/search/api/'));
  siecOdswiezStan(); siecPodepnijGuziki();
  if (!$('#szybkiKarta')) return;
  $('#szybkiKwBtn')?.addEventListener('click', szybkiCzytajKw);
  $('#szybkiKwZrzuty')?.addEventListener('click', szybkiKwZeZrzutow);
  $('#szybkiKwOtworz')?.addEventListener('click', () => $('#openKWBtn')?.click());
  $('#szybkiZdjecia')?.addEventListener('click', () => $('#addPhotos')?.click());
  $('#szybkiPliki')?.addEventListener('click', () => $('#addFiles')?.click());
  $('#szybkiCena')?.addEventListener('change', szybkiCenaZPola);
  $('#szybkiAutoBtn')?.addEventListener('click', szybkiAutomat);
  $('#szybkiFinalBtn')?.addEventListener('click', szybkiFinal);
  $('#szybkiDoOperatu')?.addEventListener('click', () => { wizardIndex = 0; switchTab('project'); setTimeout(() => document.querySelector('#tab-project [data-path="author.name"]')?.closest('.card')?.scrollIntoView({ block: 'start' }), 80); });
  // Zamkniecie okna szukania konczy krok 3.
  const okno = $('#szukOverlay');
  if (okno) new MutationObserver(() => { if (okno.classList.contains('hidden')) szybkiPoTransakcjach(); }).observe(okno, { attributes: true, attributeFilter: ['class'] });
  szybkiStanDokumentow();
}

/* ============================================================
   AUTOMAT — zbierz dane o nieruchomosci z adresu
   Logika i zrodla: otoczenie.js. Zasada: program wpisuje tylko do pustych
   rubryk i mowi, co znalazl, skad i czego nie znalazl.
   ============================================================ */
let automatTrwa = false;

function automatRysuj(html, stan = ''){
  const el = $('#automatWynik'); if (!el) return;
  el.innerHTML = html; el.dataset.stan = stan; el.classList.toggle('hidden', !html);
}

async function automatZbierz(){
  const O = window.OperoOtoczenie; if (!O || automatTrwa) return;
  const GRUPA = 'Automat — dane z adresu';
  const p = project.property || (project.property = {});
  const A = window.OperoAdres;
  const rozbite = A ? A.rozbij(p.street || '') : { ulica: p.street || '', numer: '' };
  const ulica = (rozbite.ulica || p.street || '').trim(), numer = (p.buildingNo || rozbite.numer || '').trim(), miasto = (p.city || '').trim();
  if (!miasto || !ulica){
    automatRysuj('<p class="automat-uwaga">Najpierw podaj <b>miejscowość i ulicę</b> w kroku „Dane i podstawy" — od adresu zaczyna się całe szukanie.</p>', 'pytanie');
    showStatus('Podaj miejscowość i ulicę nieruchomości — bez adresu automat nie ma od czego zacząć.', 'info', 8000);
    return;
  }
  automatTrwa = true;
  const btn = $('#automatBtn'); const napis = btn?.textContent; if (btn){ btn.disabled = true; btn.textContent = 'Zbieram dane…'; }
  automatRysuj('<p class="automat-praca">Ustalam położenie, działkę, otoczenie i plan miejscowy — to trwa do pół minuty…</p>', 'praca');
  mowiEtap(`Zbieram dane dla adresu: ul. ${ulica} ${numer}, ${miasto}.`, GRUPA);

  const l = project.location || (project.location = {});
  const [dz, oto] = await Promise.allSettled([
    window.operatAPI.dzialkaPoAdresie({ miasto, ulica, numer }),
    window.operatAPI.otoczenieZbierz({ ulica, numer, miasto, lat: l.latitude, lon: l.longitude }),
  ]);

  const wpisane = [], pominiete = [], uwagi = [], zrodla = new Set();
  /** Wpisuje tylko do pustej rubryki. Zwraca true, gdy wpisal. */
  const wpisz = (sciezka, wartosc, nazwa) => {
    const t = String(wartosc ?? '').trim(); if (!t) return false;
    const jest = String(getPath(project, sciezka) ?? '').trim();
    if (jest){ if (jest !== t) pominiete.push(nazwa); return false; }
    setPath(project, sciezka, t); wpisane.push(nazwa); return true;
  };

  /* --- 1. dzialka i obreb (ULDK, GUGiK) --- */
  const dzialki = dz.status === 'fulfilled' ? (dz.value?.dzialki || []) : [];
  if (dzialki.length === 1){
    const d = dzialki[0];
    project.egib = project.egib || {};
    wpisz('egib.plotNo', d.numer, 'numer działki');
    wpisz('egib.plotId', d.id, 'identyfikator działki');
    wpisz('egib.district', d.obreb, 'obręb');
    wpisz('egib.unit', d.gmina, 'jednostka ewidencyjna');
    if (d.gmina && !p.commune) p.commune = d.gmina;
    if (d.powiat && !p.county) p.county = d.powiat;
    if (d.wojewodztwo && !p.voivodeship) p.voivodeship = d.wojewodztwo;
    zrodla.add('ULDK — usługa lokalizacji działek (GUGiK)');
  } else if (dzialki.length > 1){
    uwagi.push(`Pod tym adresem ewidencja pokazuje ${dzialki.length} działki (${dzialki.slice(0, 4).map(d => d.numer).filter(Boolean).join(', ')}) — numeru nie wpisałem, wskaż właściwą na podstawie wypisu.`);
  } else {
    uwagi.push(`Działka: ${dz.status === 'fulfilled' ? (dz.value?.powod || 'usługa ewidencji nie znalazła działki pod tym adresem') : cleanRemoteError(dz.reason)}.`);
  }
  const pkt = dz.status === 'fulfilled' ? (dz.value?.punkt || (dz.value?.punkty || [])[0]) : null;
  if (pkt && Number.isFinite(pkt.x) && Number.isFinite(pkt.y) && !p.punkt) p.punkt = { x: pkt.x, y: pkt.y };

  /* --- 2. polozenie, otoczenie, plan --- */
  const w = oto.status === 'fulfilled' ? oto.value : null;
  let podsumowanie = { sa: [], brak: [] };
  if (!w) uwagi.push(`Otoczenie i plan: ${cleanRemoteError(oto.reason)}.`);
  else {
    for (const b of (w.bledy || [])) uwagi.push(b);
    if (w.punkt){
      if (!String(l.latitude || '').trim() && !String(l.longitude || '').trim()){
        l.latitude = String(Math.round(w.punkt.lat * 1e6) / 1e6); l.longitude = String(Math.round(w.punkt.lon * 1e6) / 1e6);
        wpisane.push('współrzędne geograficzne');
      }
      if (w.punkt.skad === 'OpenStreetMap' && !w.punkt.dokladny) uwagi.push('Mapa nie zna tego numeru budynku — położenie przyjęto dla ulicy, więc odległości są przybliżone.');
    }
    if (w.otoczenie?.ok){
      podsumowanie = O.podsumowanie(w.otoczenie);
      const dzis = new Date().toLocaleDateString('pl-PL');
      const opis = O.opis(w.otoczenie, { adres: `ul. ${ulica} ${numer}`.trim(), dzielnica: p.district, miasto, data: dzis });
      if (opis.jest){
        wpisz('location.transport', opis.pola.transport, 'komunikacja');
        wpisz('location.services', opis.pola.services, 'usługi w otoczeniu');
        wpisz('location.recreation', opis.pola.recreation, 'zieleń i rekreacja');
        wpisz('location.description', opis.opis, 'opis lokalizacji');
        zrodla.add(O.PODPIS);
      } else uwagi.push(`Mapa nie pokazuje w promieniu ${O.odlegloscTekst(O.PROMIEN).replace('ok. ', '')} żadnego z szukanych obiektów — opis otoczenia trzeba wpisać z oględzin.`);
    } else if (w.otoczenie) uwagi.push(`Otoczenie: ${w.otoczenie.powod}`);
    if (w.mpzp?.ok && w.mpzp.jest){
      project.planning = project.planning || {};
      wpisz('planning.planName', w.mpzp.nazwa, 'nazwa planu');
      wpisz('planning.resolution', w.mpzp.uchwala, 'uchwała planu');
      wpisz('planning.sourceUrl', w.mpzp.link, 'źródło planu');
      zrodla.add('Krajowa Integracja Miejscowych Planów (Geoportal, GUGiK)');
      uwagi.push('Plan miejscowy: symbol terenu i przeznaczenie odczytaj z rysunku i tekstu uchwały — tych danych usługa nie podaje w sposób, który program mógłby bezpiecznie przepisać.');
    } else if (w.mpzp) uwagi.push(`Plan miejscowy: ${w.mpzp.powod}`);
  }

  project.location.automat = { kiedy: new Date().toISOString(), zrodla: [...zrodla] };
  automatTrwa = false;
  if (btn){ btn.disabled = false; btn.textContent = napis; }
  window.OperoOkno?.zakonczEtapy(oknoStan, GRUPA);
  if (wpisane.length){ changed(); renderAll(); changed(); }

  const li = (a) => a.map(x => `<li>${escapeHTML(x)}</li>`).join('');
  const planTekst = w?.mpzp?.jest && w.mpzp.tekst ? `<details class="automat-plan"><summary>Co odpowiedziała usługa planów (do przejrzenia)</summary><pre>${escapeHTML(w.mpzp.tekst)}</pre></details>` : '';
  automatRysuj(`
    <div class="automat-kolumny">
      <div><b>Wpisałem do operatu (${wpisane.length})</b>${wpisane.length ? `<ul>${li(wpisane)}</ul>` : '<p>Nic — wszystkie te rubryki były już wypełnione albo źródła nic nie zwróciły.</p>'}</div>
      <div><b>Co jest w otoczeniu</b>${podsumowanie.sa.length ? `<ul>${li(podsumowanie.sa)}</ul>` : '<p>Brak danych z mapy.</p>'}</div>
    </div>
    ${podsumowanie.sa.length && podsumowanie.brak.length ? `<p class="automat-mniej">Mapa nie pokazuje w pobliżu: ${escapeHTML(podsumowanie.brak.join(', '))}. To nie znaczy, że ich nie ma — sprawdź na oględzinach.</p>` : ''}
    ${pominiete.length ? `<p class="automat-mniej">Nie nadpisałem tego, co wpisałeś sam: ${escapeHTML([...new Set(pominiete)].join(', '))}.</p>` : ''}
    ${uwagi.length ? `<div class="automat-uwagi"><b>Do Twojej uwagi</b><ul>${li(uwagi)}</ul></div>` : ''}
    ${planTekst}
    ${zrodla.size ? `<p class="automat-zrodla">Źródła: ${escapeHTML([...zrodla].join(' · '))}. Odległości w linii prostej.</p>` : ''}
    <p class="automat-mniej">Program nie ustala z internetu: dostępu do drogi publicznej, klasy energetycznej, treści księgi wieczystej ani stanu technicznego — to wynika z dokumentów i oględzin.</p>`,
    wpisane.length ? 'sukces' : 'uwaga');
  mowi(wpisane.length ? `Zebrałem dane z adresu i wpisałem ${wpisane.length} pozycji do operatu.` : 'Zebrałem dane z adresu, ale nie było czego wpisać.', {
    rodzaj: wpisane.length ? 'sukces' : 'ostrzezenie', grupa: GRUPA, pasek: true,
    szczegoly: [wpisane.length ? `Wpisane: ${wpisane.join(', ')}.` : '', uwagi.join(' ')].filter(Boolean).join(' '),
    zrodlo: [...zrodla].join('; '),
  });
  return { wpisane, uwagi, pominiete };
}

function bindPerButtons(){if(typeof siecPodepnijGuziki==='function')siecPodepnijGuziki();$$('.per-inline').forEach(btn=>{if(btn.dataset.perBound)return;btn.addEventListener('click',()=>perRedagujPole(btn));btn.dataset.perBound='1';});}

// Do 1.8.2 komunikat o zablokowanym PDF pokazywal sie tylko na samej gorze ekranu —
// uzytkownik stojacy przy edytorze na dole strony widzial "nic sie nie dzieje".
// Teraz panel z powodem pojawia sie tuz przy przycisku, ktory zostal nacisniety.
function panelBlokadyPDF(){
  let el=document.getElementById('pdfBlokada');
  if(el) return el;
  const siatka=document.querySelector('.report-editor-grid');
  if(!siatka) return null;
  el=document.createElement('div');
  el.id='pdfBlokada';
  el.className='pdf-blokada hidden';
  siatka.parentNode.insertBefore(el,siatka);
  return el;
}
function pokazBlokadePDF(braki){
  const el=panelBlokadyPDF(); if(!el) return;
  const lista=(braki||[]).slice(0,6).map(x=>`<li>${escapeHTML(x)}</li>`).join('');
  el.innerHTML=`<b>PDF jest zablokowany — brakuje ${braki.length} danych krytycznych.</b>`
    +`<p>Generator nie wypuszcza operatu z lukami. Uzupełnij poniższe pozycje, a przycisk „Eksport PDF” ruszy od razu.</p>`
    +`<ul>${lista}</ul>`
    +(braki.length>6?`<small>+ ${braki.length-6} kolejnych na liście „Kontrola przed PDF”</small>`:'')
    +`<button type="button" class="btn ghost" id="pdfBlokadaIdz">Pokaż pierwszy brak →</button>`;
  el.classList.remove('hidden');
  document.getElementById('pdfBlokadaIdz')?.addEventListener('click',()=>{ guideCurrentStep(true); });
  el.scrollIntoView({block:'center'});
}
function ukryjBlokadePDF(){ document.getElementById('pdfBlokada')?.classList.add('hidden'); }
async function exportPDF(){try{const issues=allCriticalIssues();if(issues.length){renderFinalIssues();if(!document.querySelector('#tab-result')?.classList.contains('active'))switchTab('result');pokazBlokadePDF(issues);showValidationBubble(issues);showStatus(`PDF zablokowany: brakuje ${issues.length} danych krytycznych. Uzupełnij listę kontroli końcowej.`,'error',8500);return;}ukryjBlokadePDF();calc=obliczProjekt();await ensureMapsQR(false);let html=zbudujRaportSurowy();if(!html||html.length<500)throw new Error('Generator raportu zwrócił pustą treść.');if(typeof studioZnakWodny==='function')html=studioZnakWodny(html);const p=project.property||{};const defaultName=`Operat_${p.city||'lokal'}_${(p.street||'').replace(/\s+/g,'_')}_${p.buildingNo||''}_${p.localNo||''}.pdf`.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_.-]/g,'_');showStatus('Generowanie PDF…','info',0);const r=await window.operatAPI.exportPDF({html,defaultName,meta:{accent:project.appearance.accent,headerText:project.appearance.headerText,footerText:project.appearance.footerText,showHeaderFooter:project.appearance.showHeaderFooter}});if(!r.canceled){await saveCurrentToHistory(r.filePath);showStatus(`PDF zapisany: ${r.filePath}`,'info',7000);}else $('#statusBar').classList.add('hidden');}catch(e){console.error(e);showStatus(`Nie udało się wygenerować PDF: ${cleanRemoteError(e)}`,'error',10000);}}

// Samouczek 1.8.0 zyje w module na koncu pliku (PRZEWODNIK/pokazPrzewodnik).

let appStateCache=null, licenseStateCache=null;
function setAuthMessage(message,type='error'){const el=$('#authMessage');if(!el)return;el.textContent=String(message||'');el.className=`status ${type}`;}
// Od 1.7.0 OPERO jest jednym, kompletnym programem — nie ma planów ani wersji PRO.
// Klucz decyduje wyłącznie o czasie, dlatego liczy się tylko to, ile go zostało.
function licenseMsLeft(lic){
  // Data wygasniecia jest stala, wiec liczymy od niej i od biezacego zegara.
  // msRemaining z procesu glownego zamraza sie w chwili odpowiedzi IPC i uzywamy
  // go tylko awaryjnie, gdy serwer nie podal daty.
  const exp=Number(lic?.expiresAtEpoch)||Date.parse(String(lic?.expiresAt||''));
  if(Number.isFinite(exp)&&exp>0) return Math.max(0,exp-Date.now());
  const ms=Number(lic?.msRemaining);
  return Number.isFinite(ms)&&ms>0?ms:0;
}
// Licznik pokazuje dni i godziny; poniżej doby schodzi na godziny i minuty,
// żeby ostatnie godziny dostępu nie wyglądały jak „0 dni".
function licenseCountdownText(lic){
  if(lic?.bezterminowo)return 'bezterminowo';
  const ms=licenseMsLeft(lic);
  if(ms<=0)return 'wygasł';
  const h=Math.floor(ms/3600000),d=Math.floor(h/24);
  if(d>=1)return `${d} ${d===1?'dzień':'dni'} ${h-d*24} godz.`;
  if(h>=1)return `${h} godz. ${Math.floor((ms-h*3600000)/60000)} min`;
  return `${Math.max(1,Math.ceil(ms/60000))} min`;
}
function licenseDisplayExpiry(lic){return lic?.bezterminowo?'bezterminowo':(lic?.expiresAt?new Date(lic.expiresAt).toLocaleDateString('pl-PL'):'—');}
function licenseExpiryFull(lic){return lic?.bezterminowo?'bezterminowo':(lic?.expiresAt?new Date(lic.expiresAt).toLocaleString('pl-PL'):'—');}
// ——— Licznik czasu licencji w pasku górnym ———
// Odświeża się co minutę. Ostatni tydzień na pomarańczowo, ostatnia doba na czerwono.
let licenseTimerHandle=null,licenseExpiryHandled=false;
function renderLicenseTimer(){
  const el=$('#licenseTimer'),val=$('#licenseTimerValue');
  if(!el||!val)return;
  const lic=licenseStateCache||{};
  const ms=licenseMsLeft(lic);
  // Klucz bezterminowy nie ma czego odliczac: pokazujemy sam fakt, ze program jest
  // odblokowany, i wychodzimy przed cala logika konca czasu.
  if(lic.active&&lic.bezterminowo){el.classList.remove('hidden','warn','critical');val.textContent='bezterminowo';el.title='Klucz bezterminowy. Kliknij, aby przejsc do Ustawien.';return;}
  // Gdy czas minal, stan z procesu glownego moze juz mowic active:false — mimo to
  // musimy dokonczyc zamkniecie pracy, wiec sprawdzamy to PRZED wyjsciem.
  if((!lic.active||ms<=0)&&isAuthenticated&&(lic.expiresAt||lic.expiresAtEpoch)&&ms<=0){ handleLicenseExpired(); return; }
  if(!lic.active){el.classList.add('hidden');return;}
  el.classList.remove('hidden');
  val.textContent=ms>0?licenseCountdownText(lic):'klucz wygasł';
  el.title=ms>0?`Dostęp do całego programu ważny do ${licenseExpiryFull(lic)}. Kliknij, aby przejść do Ustawień.`
                :'Klucz wygasł. Kliknij, aby wpisać nowy.';
  el.classList.toggle('warn',ms>0&&ms<=7*86400000);
  el.classList.toggle('critical',ms>0&&ms<=86400000);
}
function startLicenseTimer(){
  licenseExpiryHandled=false;
  stopLicenseTimer();
  renderLicenseTimer();
  licenseTimerHandle=setInterval(renderLicenseTimer,60000);
}
function stopLicenseTimer(){if(licenseTimerHandle){clearInterval(licenseTimerHandle);licenseTimerHandle=null;}}
// Czas się skończył w trakcie pracy: zapisujemy operat do Historii i wracamy
// na ekran klucza. Nic nie ginie — po wpisaniu nowego klucza praca czeka w Historii.
async function handleLicenseExpired(){
  if(licenseExpiryHandled||!isAuthenticated)return;
  licenseExpiryHandled=true;
  stopLicenseTimer();
  try{await forceAutosave({silent:true});}catch(e){console.error(e);}
  try{await saveCurrentToHistory();}catch(e){console.error(e);}
  isAuthenticated=false;
  $('#app').classList.add('hidden-until-auth');
  $('#authScreen').classList.remove('hidden');
  try{await authInit();}catch(e){console.error(e);}
  setAuthMessage('Czas dostępu się skończył. Bieżący operat został zapisany w Historii. Wpisz nowy klucz, aby wrócić do pracy.','info');
}
// Od 1.14.0 klucz jest podpisanym dokumentem: OPERO1.<dane>.<podpis>. Sprawdzamy
// tu tylko ksztalt, zeby powiedziec „to nie jest klucz" zanim ktokolwiek kliknie —
// o waznosci decyduje podpis sprawdzany w procesie glownym.
function licenseKeyLooksValid(v){
  const t=String(v||'').replace(/[\s"'`]+/g,'');
  return /^OPERO1\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,}$/.test(t);
}
/** Klucz z dowolnego tekstu: wiadomosci, pliku z generatora, zawinietego maila.
 *  Klucz bywa przelamany na kilka wierszy - dlatego szukamy po usunieciu odstepow. */
function licenseKeyExtract(v){
  const t=String(v||'').replace(/[\s"'`]+/g,'');
  const m=t.match(/OPERO1\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{86}/);
  if(m)return m[0];
  const k=String(v||'').toUpperCase().replace(/\s+/g,'').match(/OPERO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/);
  return k?k[0]:'';
}
// Od 1.17.0 krotki kod OPERO-XXXX-... znowu jest prawidlowym wejsciem: program
// wymienia go RAZ u sprzedawcy na pelna, podpisana licencje tego komputera.
function licenseKeyIsCode(v){return /^OPERO-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/i.test(String(v||'').replace(/\s+/g,''));}
// Ekran startowy 1.6.0 nie ma kreatora ani listy kontrolnej — jedyną informacją
// zwrotną jest stan pola klucza i baner pod przyciskiem.
function updateLicenseActivationProgress(){
  const key=String($('#licenseKey')?.value||'').trim();
  const kod=licenseKeyIsCode(key);
  const valid=licenseKeyLooksValid(key)||kod;
  const wrap=$('#licenseKeyWrap');
  wrap?.classList.toggle('valid',valid);
  wrap?.classList.toggle('invalid',!!key&&!valid);
  const st=$('#licenseKeyState');
  if(st){
    st.textContent=!key?'':kod?'✓ kod aktywacyjny — wymienię go przez internet':valid?'✓ wygląda na klucz OPERO':'sprawdź, czy skopiowałeś cały klucz';
    st.className='micro-status '+(valid?'ok':key?'bad':'');
  }
}
function renderLicenseActivationUI(lic={}){
  const active=!!lic.active;
  const banner=$('#licenseCurrentStatus');
  if(banner){
    banner.classList.toggle('ok',active);
    banner.innerHTML=active
      ? `<span>✓</span><div><b>Klucz aktywny${lic.bezterminowo?'':' · pozostało '+escapeHTML(licenseCountdownText(lic))}</b><p>${lic.bezterminowo?'Klucz bezterminowy — dostęp do całego programu.':'Dostęp do całego programu ważny do '+escapeHTML(licenseExpiryFull(lic))+'.'}${lic.plan?' Plan: '+escapeHTML(lic.plan)+'.':''}</p></div>`
      : `<span>i</span><div><b>Program czeka na klucz</b><p>${escapeHTML(lic?.message||'Po aktywacji przejdziesz prosto do pracy.')}</p></div>`;
  }
  updateLicenseActivationProgress();
}
// Nie ma serwera licencyjnego, wiec nie ma czego pingowac. Funkcja zostaje pusta,
// bo wola ja wspolna procedura obslugi zdarzen ekranu startowego.
function pingLicenseServerUI(){}

let licenseCoachFrame=0;
function clampNumber(v,min,max){return Math.max(min,Math.min(max,v));}
// Chmurki coachingowe zniknęły razem z kreatorem aktywacji — zostają puste
// funkcje, bo wołają je procedury obsługi zdarzeń wspólne z resztą programu.
function positionAllLicenseCoaches(){}
function showLicenseCoach(){}
function showLicenseCoaches(){}
function setAuthView(){
  // Od 1.5.0 jest tylko jeden ekran startowy — klucz licencyjny.
  $('#authLicense')?.classList.remove('hidden');
  $('#authMessage')?.classList.add('hidden');
  $('#authScreen')?.classList.add('license-view');
  renderLicenseActivationUI(licenseStateCache||{});
}
async function authInit(){
  try{
    const [state,lic]=await Promise.all([window.operatAPI.getAppState(),window.operatAPI.getLicenseState()]);
    appStateCache=state;licenseStateCache=lic;
    if($('#licenseDeviceCode'))$('#licenseDeviceCode').textContent=lic.deviceCode||'—';
    if(!lic.active){
      $('#authScreen').classList.remove('hidden');$('#app').classList.add('hidden-until-auth');
      renderLicenseActivationUI(lic);setAuthView();
      setTimeout(()=>$('#licenseKey')?.focus(),30);
      return state;
    }
    // Klucz jest zapamiętany i ważny — wchodzimy prosto do pracy, bez logowania.
    await enterApp(state);
    return state;
  }catch(e){setAuthMessage(cleanRemoteError(e));return null;}
}
async function enterApp(state=null){
  appStateCache=state||appStateCache;isAuthenticated=true;autosaveDirty=false;
  $('#authScreen').classList.add('hidden');$('#app').classList.remove('hidden-until-auth');
  startLicenseTimer();
  project=normalizeLoadedProject(freshProject());historyEntries=[];
  await loadHistory();
  renderAll();await renderSettingsPage();renderKlientKarta();odswiezPrzypomnienia();switchTab('dashboard');
  setSaveStateUI('Autozapis do Historii aktywny','saved');
  try{await ensureMapsQR(false);}catch{}
  showMigrationNoticeIfAny();
  if(!appStateCache?.tutorialDone)setTimeout(()=>pokazPrzewodnik(0),400);
}
// Po aktualizacji z wersji z kontami dane innych profili zostają na dysku — mówimy o tym raz.
function showMigrationNoticeIfAny(){
  const m=appStateCache?.migracja;if(!m||!(m.pozostaleKonta||[]).length)return;
  const lista=m.pozostaleKonta.map(x=>x.login||'(bez nazwy)').join(', ');
  showStatus(`Po aktualizacji OPERO pracuje bez kont. Operaty z profilu używanego ostatnio są już w Historii. Dane pozostałych profili (${lista}) nie zostały usunięte — znajdziesz je przez Ustawienia → „Otwórz folder z danymi", w podfolderze accounts_data.`,'info',0);
  window.operatAPI.ackMigration?.().catch(()=>{});
}

async function enforceRuntimeLicense({maxAgeMinutes=0}={}){
  if(!isAuthenticated)return;
  try{
    const lic=await window.operatAPI.getLicenseState({maxAgeMinutes});licenseStateCache=lic;
    renderLicenseTimer();
    if(lic.active)return;
    // Jedna sciezka zamykania pracy: zapis do Historii i powrot na ekran klucza.
    stopLicenseTimer();
    if(licenseMsLeft(lic)<=0&&(lic.expiresAt||lic.expiresAtEpoch)){ await handleLicenseExpired(); return; }
    await forceAutosave({silent:true});
    isAuthenticated=false;
    $('#app').classList.add('hidden-until-auth');$('#authScreen').classList.remove('hidden');
    if($('#licenseDeviceCode'))$('#licenseDeviceCode').textContent=lic.deviceCode||'—';
    renderLicenseActivationUI(lic);
    setAuthView();setAuthMessage(lic.message||'Nie udało się potwierdzić klucza OPERO. Sprawdź połączenie z internetem albo wpisz nowy klucz.','error');
  }catch(e){showStatus(`Licencja: ${cleanRemoteError(e)}`,'error',8000);}
}
async function activateLicenseCode(code, target='auth'){
  const surowy=String(code||'').trim();if(!surowy){const msg='Wpisz klucz licencyjny OPERO.';target==='auth'?setAuthMessage(msg):showStatus(msg,'error');return null;}
  // Klucz OPERO1.… jest dlugi i ma kropki - wczesniej odrzucal go tu filtr
  // napisany pod stary, krotki kod. Wyciagamy klucz z wklejonego tekstu.
  const clean=licenseKeyExtract(surowy);
  if(!clean){
    const msg='To nie wygląda na klucz licencyjny OPERO. Klucz zaczyna się od „OPERO1." i jest jednym długim ciągiem — wklej go w całości albo kliknij „Wczytaj z pliku".';
    target==='auth'?setAuthMessage(msg):showStatus(msg,'error',9000);
    $('#licenseKeyWrap')?.classList.add('invalid');
    return null;
  }
  const btn=target==='auth'?$('#licenseActivateBtn'):$('#settingsActivateLicense');const old=btn?.innerHTML||'';if(btn){btn.disabled=true;btn.classList.add('loading');if(target==='auth')btn.innerHTML='Sprawdzam klucz…';else btn.textContent='Weryfikacja…';}
  try{const lic=await window.operatAPI.activateLicense(clean);licenseStateCache=lic;renderLicenseActivationUI(lic);if(target==='auth'){if(btn){btn.classList.remove('loading');btn.classList.add('success');btn.innerHTML='✓ Klucz zapamiętany';}setAuthMessage(`Klucz zapamiętany na ${licenseCountdownText(lic)}. Uruchamiam OPERO…`,'info');await new Promise(r=>setTimeout(r,650));const st=await window.operatAPI.getAppState().catch(()=>null);await enterApp(st);}else{showStatus(`Dostęp przedłużony do ${licenseExpiryFull(lic)} — pozostało ${licenseCountdownText(lic)}.`,'info',7000);await renderSettingsPage();}return lic;}catch(e){const msg=cleanRemoteError(e);target==='auth'?setAuthMessage(msg):showStatus(msg,'error',8000);return null;}finally{if(btn&&!btn.classList.contains('success')){btn.disabled=false;btn.classList.remove('loading');btn.innerHTML=old;}}
}
async function importLicenseTo(fieldId,target='auth'){try{const r=await window.operatAPI.importLicenseFile();if(r.canceled)return;const el=$(fieldId);if(el)el.value=r.code||'';await activateLicenseCode(r.code,target);}catch(e){target==='auth'?setAuthMessage(cleanRemoteError(e)):showStatus(cleanRemoteError(e),'error');}}
// Od 1.14.0 nie ma sklepu w programie: klucze wystawia autor OPERO.
async function activateLicenseFromSettings(){await activateLicenseCode($('#settingsLicenseKey')?.value||'','settings');if($('#settingsLicenseKey'))$('#settingsLicenseKey').value='';}
async function refreshLicenseFromSettings(){try{const lic=await window.operatAPI.getLicenseState();licenseStateCache=lic;await renderSettingsPage();let msg;if(!lic.active)msg=lic.message||'Licencja nieaktywna.';else if(lic.verification==='online')msg=`Klucz potwierdzony przez serwer. Pozostało ${licenseCountdownText(lic)}.`;else if(lic.verification==='offline-grace')msg=lic.message||'Serwer chwilowo niedostępny — działa okres offline.';else msg=`Klucz aktywny — pozostało ${licenseCountdownText(lic)}.`;showStatus(msg,lic.active?'info':'error',8000);renderNotifications();}catch(e){showStatus(cleanRemoteError(e),'error',8000);}}
async function deactivateLicenseFromSettings(){if(!confirm('Odłączyć klucz OPERO od tego komputera? Operaty i Historia pozostaną na dysku, ale ponowne uruchomienie programu będzie wymagało wpisania klucza.'))return;try{if(isAuthenticated)await forceAutosave({silent:true});await window.operatAPI.deactivateLicense();stopLicenseTimer();isAuthenticated=false;$('#app').classList.add('hidden-until-auth');$('#authScreen').classList.remove('hidden');await authInit();setAuthMessage('Klucz został odłączony od tego komputera.','info');}catch(e){showStatus(cleanRemoteError(e),'error',9000);}}

function bytesHuman(n){const v=Number(n||0);return v>=1073741824?`${(v/1073741824).toFixed(2)} GB`:v>=1048576?`${(v/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(v/1024))} KB`;}
function setBackupStatus(html,kind=''){const el=$('#backupStatus');if(!el)return;el.className=`backup-status ${kind}`.trim();el.innerHTML=html;el.classList.remove('hidden');}
async function runBackup(){
  const btn=$('#settingsBackup');if(!btn||btn.disabled)return;
  const old=btn.textContent;btn.disabled=true;btn.textContent='Zapisuję kopię…';
  setBackupStatus('<b>Kopiuję dane…</b><span>Przy dużej liczbie zdjęć może to potrwać kilkadziesiąt sekund.</span>','busy');
  try{
    const r=await window.operatAPI.createBackup();
    if(r?.canceled){$('#backupStatus')?.classList.add('hidden');return;}
    setBackupStatus(`<b>✓ Kopia zapasowa zapisana</b><span>${r.files} ${r.files===1?'plik':'plików'} · ${escapeHTML(bytesHuman(r.bytes))}</span><br><code>${escapeHTML(r.path)}</code>`);
    showStatus('Kopia zapasowa danych OPERO została zapisana.','info',7000);
  }catch(e){
    const msg=cleanRemoteError(e);
    setBackupStatus(`<b>Nie udało się zapisać kopii</b><span>${escapeHTML(msg)}</span>`,'error');
    showStatus(`Kopia zapasowa: ${msg}`,'error',9000);
  }finally{btn.disabled=false;btn.textContent=old;}
}
async function openDataFolder(){try{const r=await window.operatAPI.openDataFolder();showStatus(`Otwarto folder z danymi: ${r.path}`,'info',7000);}catch(e){showStatus(cleanRemoteError(e),'error',8000);}}
async function openLogFile(){try{const r=await window.operatAPI.openLogFile();if(r?.empty){showStatus('Dziennik błędów jest pusty — program nie zgłosił dotąd żadnej awarii.','info',6000);return;}showStatus('Otwarto dziennik błędów.','info',5000);}catch(e){showStatus(cleanRemoteError(e),'error',8000);}}
/**
 * Dzialania panelu PER przez delegacje na dokumencie.
 *
 * Dlaczego nie samo `addEventListener` na przyciskach: panel lezal kiedys nizej
 * w dokumencie niz <script>, wiec w chwili podpinania jeszcze nie istnial i ani
 * „Zapytaj", ani zadne dzialanie nie reagowalo — program wygladal na zepsuty,
 * choc caly kod byl na miejscu. Delegacja slucha na dokumencie, wiec dziala bez
 * wzgledu na to, gdzie i kiedy panel sie pojawi.
 */
function hookPanelPeraDelegacja(){
  if(window.__perPanelPodpiety) return; window.__perPanelPodpiety=true;
  document.addEventListener('click', e => {
    const panel=e.target.closest('#piorekPanel'); if(!panel) return;
    const zamknij=e.target.closest('#piorekPanelClose');
    if(zamknij){ e.stopPropagation(); closePiorekPanel(); return; }
    const widok=e.target.closest('[data-piorek-view]');
    if(widok){ e.stopPropagation(); setPiorekView(widok.dataset.piorekView); return; }
    const akcja=e.target.closest('[data-piorek-action]');
    if(akcja){ e.stopPropagation(); runPiorekAction(akcja.dataset.piorekAction); return; }
    const pytanie=e.target.closest('[data-piorek-question]');
    if(pytanie){ e.stopPropagation(); const pole=$('#piorekQuestion'); if(pole) pole.value=pytanie.dataset.piorekQuestion||''; askPiorekKnowledge(pytanie.dataset.piorekQuestion||''); return; }
    if(e.target.closest('#piorekAskBtn')){ e.stopPropagation(); askPiorekKnowledge(); return; }
    if(e.target.closest('#piorekClearAnswer')){ e.stopPropagation(); clearPiorekAnswer(); return; }
    if(e.target.closest('#piorekKbRefresh')){ e.stopPropagation(); refreshPiorekKnowledgeStatus(true); return; }
    if(e.target.closest('#piorekExamBtn')){ e.stopPropagation(); runPiorekExamPartiami(); return; }
    if(e.target.closest('#perStanNapraw')){
      e.preventDefault(); e.stopPropagation();
      naprawAsystenta();
      return;
    }
    if(e.target.closest('#perStanPobierz')){
      e.stopPropagation();
      if($('#perStanPobierz')?.dataset.akcja==='zatrzymaj'){
        window.operatAPI.perZatrzymajPobieranie?.().then(()=>{
          showStatus('Pobieranie zatrzymane. To, co już pobrane, zostaje — wrócimy do tego później.','info',7000);
          perSprawdzStanModelu();
        }).catch(()=>{});
      } else perAktualizujModel();
      return;
    }
    // Klikniecie w puste miejsce panelu niczego nie robi — i przede wszystkim
    // NIE zamyka panelu, bo o to ludzie potykali sie najczesciej.
    e.stopPropagation();
  });
}

/* ===========================================================
   USTAWIENIA 3.4.0 — profil, wlasny model, zywe tlo
   =========================================================== */

/**
 * Profil rzeczoznawcy. Autor opracowania i numer uprawnien sa w KAZDYM operacie
 * i do tej pory trzeba bylo je wpisywac od nowa za kazdym razem. Numer uprawnien
 * wpisany z literowka trafia do dokumentu, pod ktorym ktos sie podpisuje - wiec
 * ma byc wpisany raz, porzadnie, i stad brany.
 */
let profilCache=null;
const PROFIL_POLA=[['profilName','name'],['profilLicenseNo','licenseNo'],['profilCompany','company'],
  ['profilPhone','phone'],['profilEmail','email'],['profilAddress','address']];

async function wczytajProfil(){
  try{ profilCache=await window.operatAPI.profilOdczytaj()||{}; }
  catch{ profilCache={}; }
  for(const [id,klucz] of PROFIL_POLA){ const el=$('#'+id); if(el) el.value=profilCache[klucz]||''; }
  return profilCache;
}

function zbierzProfil(){
  const d={};
  for(const [id,klucz] of PROFIL_POLA) d[klucz]=($('#'+id)?.value||'').trim();
  return d;
}

async function zapiszProfil(){
  const d=zbierzProfil();
  if(!d.name && !d.company){ showStatus('Podaj przynajmniej imię i nazwisko albo nazwę pracowni.','info',7000); return; }
  try{
    profilCache=await window.operatAPI.profilZapisz(d);
    showStatus('Profil zapisany. Nowe operaty dostaną te dane same.','success',6000);
  }catch(e){ showStatus(cleanRemoteError(e),'error'); }
}

/** Wstawia profil do operatu otwartego teraz - bez czekania na nastepny. */
function profilDoOperatu(){
  const d=zbierzProfil();
  if(!d.name && !d.company){ showStatus('Najpierw uzupełnij profil.','info',6000); return; }
  project.author={...project.author,name:d.name||project.author?.name||'',
    licenseNo:d.licenseNo||project.author?.licenseNo||'',company:d.company||project.author?.company||''};
  changed({fullDynamic:true});
  renderAll();
  showStatus('Dane autora wstawione do bieżącego operatu.','success',6000);
}

/**
 * Nowy operat dostaje profil sam. Nie nadpisujemy tego, co juz wpisane - ktos
 * mogl swiadomie podac innego autora (np. operat wspolny).
 */
function wstawProfilDoNowego(){
  if(!profilCache) return;
  const a=project.author||{};
  if(!a.name && profilCache.name) a.name=profilCache.name;
  if(!a.licenseNo && profilCache.licenseNo) a.licenseNo=profilCache.licenseNo;
  if(!a.company && profilCache.company) a.company=profilCache.company;
  project.author=a;
}

/** Otwiera folder asystenta w Eksploratorze - do recznego wlozenia plikow. */
async function otworzFolderAsystenta(co){
  try{
    const r=await window.operatAPI.perOtworzFolder(co);
    if(!r?.ok) showStatus(`Nie udało się otworzyć folderu: ${r?.folder||''}`,'error',9000);
  }catch(e){ showStatus(cleanRemoteError(e),'error'); }
}

/* --- wlasny model .gguf --- */
async function wskazWlasnyModel(){
  try{
    const r=await window.operatAPI.perWskazWlasnyModel();
    if(r?.anulowane) return;
    if(!r?.ok){ showStatus(r?.blad||'Nie udało się przyjąć tego pliku.','error',10000); return; }
    showStatus(`PER pracuje teraz na: ${r.nazwa} (${bajty(r.rozmiar)}). Wczytanie modelu trwa chwilę.`,'success',10000);
    await perOdswiezSilnik(); await perSprawdzStanModelu();
  }catch(e){ showStatus(cleanRemoteError(e),'error'); }
}

async function zapomnijWlasnyModel(){
  try{
    await window.operatAPI.perZapomnijWlasnyModel();
    showStatus('PER wrócił do modelu OPERO. Twój plik został na dysku nietknięty.','info',8000);
    await perOdswiezSilnik(); await perSprawdzStanModelu();
  }catch(e){ showStatus(cleanRemoteError(e),'error'); }
}

async function usunPobraneModele(){
  if(!confirm('Usunąć pobrane modele PER-a?\n\nZwolni to kilka gigabajtów. Model można pobrać ponownie przyciskiem w panelu PER. Twój własny plik .gguf, jeśli go wskazałeś, NIE zostanie ruszony.')) return;
  try{
    const r=await window.operatAPI.perUsunAktualizacje();
    showStatus(r?.usuniete?`Usunięto ${r.usuniete} plik(i). Miejsce zwolnione.`:'Nie było czego usuwać.','info',8000);
    await perOdswiezSilnik(); await perSprawdzStanModelu();
  }catch(e){ showStatus(cleanRemoteError(e),'error'); }
}

function hookEvents(){
  hookPanelPeraDelegacja();
  $('#licenseActivateBtn')?.addEventListener('click',()=>activateLicenseCode($('#licenseKey')?.value||'','auth'));$('#licenseKey')?.addEventListener('keydown',e=>{if(e.key==='Enter')$('#licenseActivateBtn')?.click();});$('#licenseImportBtn')?.addEventListener('click',()=>importLicenseTo('#licenseKey','auth'));$('#licensePurchaseBtn')?.addEventListener('click',async()=>{const r=await window.operatAPI.openLicensePurchase();setAuthMessage(r?.message||'Klucz wystawia autor programu — podaj kod tego urządzenia.','info');});
  $('#licenseKey')?.addEventListener('input',updateLicenseActivationProgress);$('#licensePasteBtn')?.addEventListener('click',async()=>{try{
    const r=await window.operatAPI.readClipboardText();
    // Ze schowka bierzemy tylko pierwszy niepusty wiersz — wklejony artykuł albo e-mail
    // nie ma trafić w całości do pola klucza.
    const raw=String(r?.text||'');
    const line=(raw.split(/\r?\n/).map(x=>x.trim()).find(Boolean)||'').toUpperCase();
    const value=licenseKeyExtract(raw)||line.slice(0,200);
    if($('#licenseKey'))$('#licenseKey').value=value;
    updateLicenseActivationProgress();$('#licenseKey')?.focus();
    if(!value)setAuthMessage('Schowek jest pusty. Skopiuj klucz z wiadomości o zakupie.','info');
    else if(!licenseKeyLooksValid(value))setAuthMessage('Wklejony tekst nie wygląda na klucz OPERO. Klucz zaczyna się od „OPERO1." — skopiuj go w całości albo wczytaj z pliku.','info');
  }catch(e){setAuthMessage('Nie udało się odczytać schowka. Użyj Ctrl+V.','info');}});$('#licenseCopyDeviceBtn')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#licenseDeviceCode')?.textContent||'');setAuthMessage('Identyfikator urządzenia skopiowany.','info');}catch{setAuthMessage('Zaznacz identyfikator i skopiuj go ręcznie.','info');}});$('#licensePingBtn')?.addEventListener('click',pingLicenseServerUI);
  $$('#nav .nav-btn').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));$('#commandPaletteBtn')?.addEventListener('click',openCommandPalette);$('#commandSearch')?.addEventListener('input',()=>{commandActiveIndex=0;renderCommandResults();});$('#commandPalette')?.addEventListener('click',e=>{if(e.target.id==='commandPalette')closeCommandPalette();});$('#notificationBtn')?.addEventListener('click',e=>{e.stopPropagation();renderNotifications();$('#notificationPanel')?.classList.toggle('hidden');});$('#notificationCloseBtn')?.addEventListener('click',()=>$('#notificationPanel')?.classList.add('hidden'));$('#notificationGuideBtn')?.addEventListener('click',()=>{runNotificationAction('guide');});$('#piorekDock')?.addEventListener('click',e=>{e.stopPropagation();const p=$('#piorekPanel');p?.classList.contains('hidden')?openPiorekPanel():closePiorekPanel();});$('#piorekPanelClose')?.addEventListener('click',e=>{e.stopPropagation();closePiorekPanel();});$$('[data-piorek-action]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();runPiorekAction(b.dataset.piorekAction);}));$$('[data-piorek-view]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();setPiorekView(b.dataset.piorekView);}));$('#piorekAskBtn')?.addEventListener('click',e=>{e.stopPropagation();askPiorekKnowledge();});$('#piorekQuestion')?.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();askPiorekKnowledge();}});$$('[data-piorek-question]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();if($('#piorekQuestion'))$('#piorekQuestion').value=b.dataset.piorekQuestion||'';askPiorekKnowledge(b.dataset.piorekQuestion||'');}));$('#piorekClearAnswer')?.addEventListener('click',e=>{e.stopPropagation();clearPiorekAnswer();});$('#piorekKbRefresh')?.addEventListener('click',e=>{e.stopPropagation();refreshPiorekKnowledgeStatus(true);});$('#piorekExamBtn')?.addEventListener('click',e=>{e.stopPropagation();runPiorekExamPartiami();});$('#contextCoachCloseBtn')?.addEventListener('click',hideContextCoach);$('#contextCoachDoneBtn')?.addEventListener('click',hideContextCoach);$('#fieldHelpClose')?.addEventListener('click',hideFieldHelp);$('#contextCoachNextBtn')?.addEventListener('click',()=>{const g=contextCoachGuide||guideTargetForStep(WIZARD_STEPS[wizardIndex]?.tab),target=contextCoachTarget||(g?.el?.closest('label')||g?.el);if(g?.el&&target){target.scrollIntoView({behavior:uiPrefs.motion==='full'?'smooth':'auto',block:'center',inline:'nearest'});setTimeout(()=>{g.el.focus?.({preventScroll:true});if(contextCoachTarget===target)placeContextCoach(target);},uiPrefs.motion==='full'?280:20);}});$('#scrollTopBtn')?.addEventListener('click',()=>window.scrollTo({top:0,behavior:uiPrefs.motion==='full'?'smooth':'auto'}));$('#creatorDiagnosticsBtn')?.addEventListener('click',async()=>{try{const [lic,info]=await Promise.all([window.operatAPI.getLicenseState(),window.operatAPI.getAppInfo?.()??Promise.resolve(null)]);showStatus(`OPERO ${info?.version||APP_VERSION} (Electron ${info?.electron||'—'}) · pozostało ${licenseCountdownText(lic)} · urządzenie ${lic.deviceCode||'—'} · ${lic.verification||'stan lokalny'}.`,'info',11000);}catch(e){showStatus(cleanRemoteError(e),'error');}});$('#creatorRoadmapBtn')?.addEventListener('click',openModuleSelector);$('#wizardBack').addEventListener('click',()=>wizardMove(-1));$('#wizardNext').addEventListener('click',()=>wizardMove(1));$('#showNextFieldBtn')?.addEventListener('click',()=>guideCurrentStep(true,true));$('#railGuideToggle')?.addEventListener('click',()=>setUXMode(uiPrefs.mode==='expert'?'guide':'expert'));$('#motionModeBtn')?.addEventListener('click',cycleMotionMode);$$('.ux-mode-btn').forEach(b=>b.addEventListener('click',()=>setUXMode(b.dataset.uxMode)));$('#moreActionsBtn')?.addEventListener('click',e=>{e.stopPropagation();$('#moreActionsMenu')?.classList.toggle('hidden');});document.addEventListener('click',e=>{if(!e.target.closest('.top-menu-wrap'))$('#moreActionsMenu')?.classList.add('hidden');if(!e.target.closest('.notification-wrap'))$('#notificationPanel')?.classList.add('hidden');if(!e.target.closest('.piorek-dock-wrap')&&!e.target.closest('#piorekPanel')&&!e.target.closest('#commandPalette'))closePiorekPanel();if(!e.target.closest('.field-help-popover')&&!e.target.closest('.help-dot'))hideFieldHelp();});$('#dashboardAllHistoryBtn')?.addEventListener('click',()=>switchTab('history'));$('#startWizardBtn').addEventListener('click',()=>{wizardIndex=0;switchTab('project');});$('#chooseModuleBtn')?.addEventListener('click',openModuleSelector);$('#changeModuleBtn')?.addEventListener('click',()=>openModuleSelector('zmiana'));$('#moduleSelectorClose')?.addEventListener('click',closeModuleSelector);$('#moduleSelectorOverlay')?.addEventListener('click',e=>{if(e.target.id==='moduleSelectorOverlay')closeModuleSelector();});$('#dashboardHistoryBtn')?.addEventListener('click',()=>switchTab('history'));$('#dashboardResultBtn')?.addEventListener('click',()=>switchTab('result'));$('#topResultBtn')?.addEventListener('click',()=>switchTab('result'));$('#resultBackBtn')?.addEventListener('click',()=>switchTab(WIZARD_STEPS[Math.max(0,Math.min(wizardIndex,WIZARD_STEPS.length-1))].tab));$('#goResultBtn')?.addEventListener('click',()=>switchTab('result'));
  $('#registerBackBtn')?.addEventListener('click',()=>setAuthView('authLogin'));
  $('#resetBackBtn')?.addEventListener('click',()=>setAuthView('authLogin'));
  $('#goStartBtn')?.addEventListener('click',async()=>{if(autosaveDirty)await forceAutosave({silent:true});switchTab('dashboard');});$('.brand')?.addEventListener('click',()=>switchTab('dashboard'));
  $('#tutorialBtn')?.addEventListener('click',()=>pokazPrzewodnik(0));hookKlawiszePrzewodnika();
  // Pomoc tekstowa dziala teraz lokalnie (PER) — przyciski podpina bindPerButtons().
  $('#refreshReportPreview')?.addEventListener('click',renderReportPreview);$('#openReportPreview')?.addEventListener('click',openFullReportPreview);$('#editorPdfBtn')?.addEventListener('click',exportPDF);$('#editorDocxBtn')?.addEventListener('click',eksportDocx);
  $('#licenseTimer')?.addEventListener('click',()=>switchTab('settings'));
  hookPerSilnik();
  wczytajProfil().catch(()=>{});


  $('#settingsBackup')?.addEventListener('click',runBackup);$('#settingsOpenDataFolder')?.addEventListener('click',openDataFolder);$('#settingsOpenLog')?.addEventListener('click',openLogFile);$('#settingsUxGuide')?.addEventListener('click',()=>setUXMode('guide'));$('#settingsUxExpert')?.addEventListener('click',()=>setUXMode('expert'));$('#settingsMotion')?.addEventListener('click',cycleMotionMode);$('#settingsTlo')?.addEventListener('click',przelaczTlo);
  $('#profilZapisz')?.addEventListener('click',zapiszProfil);$('#profilDoOperatu')?.addEventListener('click',profilDoOperatu);
  $('#settingsPerWlasny')?.addEventListener('click',wskazWlasnyModel);$('#settingsPerWlasnyOff')?.addEventListener('click',zapomnijWlasnyModel);$('#settingsPerUsun')?.addEventListener('click',usunPobraneModele);
  $('#settingsOtworzSilnik')?.addEventListener('click',()=>otworzFolderAsystenta('silnik'));
  $('#settingsOtworzModele')?.addEventListener('click',()=>otworzFolderAsystenta('modele'));$('#settingsCelebrate')?.addEventListener('click',przelaczGratulacje);$('#settingsTutorial')?.addEventListener('click',()=>pokazPrzewodnik(0));$('#settingsActivateLicense')?.addEventListener('click',activateLicenseFromSettings);$('#settingsRefreshLicense')?.addEventListener('click',refreshLicenseFromSettings);$('#settingsDeactivateLicense')?.addEventListener('click',deactivateLicenseFromSettings);
  $('#copyKWBtn').addEventListener('click',async()=>{try{const kw=String(project.legal.kwLocal||'').trim();if(!kw){showStatus('Najpierw wpisz numer księgi wieczystej.','error');return;}const r=await window.operatAPI.copyKWNumber(kw);showStatus(`Skopiowano numer KW: ${r.value}`,'info');}catch(e){showStatus(cleanRemoteError(e),'error');}});
  $('#openKWBtn').addEventListener('click',async()=>{try{const kw=String(project.legal.kwLocal||'').trim();if(!kw){showStatus('Najpierw wpisz numer KW.','error');return;}await window.operatAPI.openOfficialKW(kw);showStatus('EKW otwarto w domyślnej przeglądarce. Numer KW jest w schowku. Wklej go na stronie, przejdź CAPTCHA, otwórz aktualną treść i skopiuj ją do OPERO.','info',9500);}catch(e){showStatus(`EKW: ${cleanRemoteError(e)}`,'error',8500);}});$('#openKWGovInfo').addEventListener('click',()=>window.operatAPI.openExternal('https://www.gov.pl/web/sprawiedliwosc/elektroniczna-ksiega-wieczysta'));
  $$('.ekw-tab').forEach(b=>b.addEventListener('click',()=>selectEkwSection(b.dataset.ekwSection)));
  $('#pasteKWBtn').addEventListener('click',async()=>{try{const r=await window.operatAPI.readClipboardText();$('#ekwRawText').value=r.text||'';if(ingestEkwText(r.text))showStatus(`Zapisano dział ${EKW_SECTION_META[ekwActiveSection].label}. Możesz przejść do kolejnej zakładki.`,'info');}catch(e){showStatus(cleanRemoteError(e),'error');}});$('#ingestKWBtn').addEventListener('click',()=>{if(ingestEkwText($('#ekwRawText').value))showStatus(`Zapisano dział ${EKW_SECTION_META[ekwActiveSection].label}.`,'info');});$('#applyKWBtn').addEventListener('click',()=>{if($('#ekwRawText').value.trim()!==String(project.legal.ekwImport.sections?.[ekwActiveSection]||'').trim())ingestEkwText($('#ekwRawText').value);applyEkwData();});
  // Przyciski portali zastapila lista z widocznym adresem (renderPortale).
  $('#generateMapsQR').addEventListener('click',async()=>{try{await ensureMapsQR(true);changed();showStatus('Kod QR Google Maps wygenerowany.','info');}catch(e){showStatus(`QR: ${cleanRemoteError(e)}`,'error');}});$('#openMapsBtn').addEventListener('click',()=>window.operatAPI.openExternal(buildMapsUrl()));
  $('#addTransaction').addEventListener('click',()=>{project.market.transactions.push({id:nextTransactionId(),address:'',date:project.valuation.valuationDate||todayISO(),area:0,roomsFloor:'',priceUnit:0,monthsToValuation:0,autoMonthsToValuation:true,featureRatings:{},useForPair:isPairModule()});changed({fullDynamic:true});setTimeout(()=>$('#transactionsBody tr:last-child .tx-address')?.focus(),20);});$('#importMarketSheet').addEventListener('click',importMarketSpreadsheet);hookRCN();hookKontrola();
  $('#addTrendPair').addEventListener('click',()=>{if(project.market.transactions.length<2){showStatus('Najpierw dodaj co najmniej 2 transakcje.','error');return;}const sorted=[...project.market.transactions].filter(t=>t.date).sort((a,b)=>String(b.date).localeCompare(String(a.date)));const c1=sorted[0]||project.market.transactions[0],c2=sorted[1]||project.market.transactions[1];project.market.trendPairs.push({c1Id:c1.id,c2Id:c2.id});changed({fullDynamic:true});});
  $('#addFeature').addEventListener('click',()=>{project.market.features.push({id:newId(),name:'Nowa cecha rynkowa',scaleMode:project.market.ratingMode||'three',weight:0,rating:(project.market.ratingMode==='two'?'Niekorzystna':'Przeciętna'),scaleMin:'',scaleLow:'',scaleAvg:'',scaleHigh:'',scaleMax:'',ratingNote:'',pairs:[]});changed({fullDynamic:true});});$('#normalizeWeights').addEventListener('click',()=>{const sum=project.market.features.reduce((s,f)=>s+Number(f.weight||0),0);if(!sum){showStatus('Najpierw wpisz wagi większe od 0.','error');return;}project.market.features.forEach(f=>f.weight=Number(f.weight||0)/sum);changed({fullDynamic:true});});$('#applySuggestedWeights').addEventListener('click',()=>{const vals=(calc.features||[]).map(f=>Number(f.suggestedWeight||0));const sum=vals.reduce((a,b)=>a+b,0);if(sum<=0){showStatus('Brak możliwej do wyliczenia sugestii wag dla wybranego sposobu. Uzupełnij pary albo oceny cech transakcji.','error',7000);return;}project.market.features.forEach((f,i)=>f.weight=vals[i]/sum);changed({fullDynamic:true});showStatus('Przeniesiono sugestie do pól wag. Rzeczoznawca musi je zweryfikować i uzasadnić.','info',7000);});
  $('#addPhotos').addEventListener('click',async()=>{try{const picked=await window.operatAPI.pickPhotos();const photos=(picked||[]).filter(x=>x&&!x.error&&x.dataUrl);photos.forEach((ph,idx)=>project.photos.push({...ph,category:project.photos.length===0&&idx===0?'Okładka':(isPairModule()?'Budynek':'Lokal'),caption:ph.name,cover:project.photos.length===0&&idx===0}));renderPhotos();changed();const errors=(picked||[]).filter(x=>x&&x.error);if(errors.length)showStatus(errors.map(x=>x.error).join(' '),'error',9000);else if(photos.length){const saved=photos.reduce((a,p)=>a+Math.max(0,Number(p.originalSize||0)-Number(p.size||0)),0);showStatus(saved>262144?`Dodano ${photos.length} ${photos.length===1?'fotografię':'fotografii'}. Zdjęcia przeskalowano do 1920 px — projekt jest lżejszy o ${(saved/1048576).toFixed(1)} MB.`:`Dodano ${photos.length} ${photos.length===1?'fotografię':'fotografii'}.`,'info',6000);}}catch(e){showStatus(cleanRemoteError(e),'error');}});$('#addFiles').addEventListener('click',async()=>{try{const files=await window.operatAPI.pickFiles();files.filter(x=>!x.error).forEach(f=>project.files.push({...f,description:'',includeInPDF:true}));renderFiles();changed();const errors=files.filter(x=>x.error);if(errors.length)showStatus(errors.map(x=>x.error).join(' '),'error',7000);}catch(e){showStatus(cleanRemoteError(e),'error');}});
  $('#legalBasesList').addEventListener('input',e=>{project.legalBases=e.target.value.split('\n').map(x=>x.trim()).filter(Boolean);changed();});$('#sourcesList').addEventListener('input',e=>{project.sources=e.target.value.split('\n').map(x=>x.trim()).filter(Boolean);changed();});$('#attachmentsList').addEventListener('input',e=>{project.attachments=e.target.value.split('\n').map(x=>x.trim()).filter(Boolean);changed();});$('#insertLegalBases').addEventListener('click',()=>{project.legalBases=[...LEGAL_BASES_2026];renderLists();changed();showStatus('Wstawiono bazowy zestaw aktów prawnych. Zweryfikuj aktualność i adekwatność do konkretnego operatu.','info',7000);});
  $('#newBtn').addEventListener('click',openModuleSelector);$('#saveBtn').addEventListener('click',async()=>{try{await saveCurrentToHistory();showStatus('Operat zapisany w historii.','info');}catch(e){showStatus(cleanRemoteError(e),'error');}});$('#exportProjectBtn').addEventListener('click',async()=>{try{const r=await window.operatAPI.saveProject(project);if(!r.canceled)showStatus(`Wyeksportowano: ${r.filePath}`,'info');}catch(e){showStatus(cleanRemoteError(e),'error');}});$('#openBtn').addEventListener('click',async()=>{try{if(autosaveDirty)await forceAutosave({silent:true});const r=await window.operatAPI.openProject();if(!r.canceled){project=normalizeLoadedProject(r.project);renderAll();changed();showStatus(`Otwarto: ${r.filePath}`,'info');}}catch(e){showStatus(cleanRemoteError(e),'error');}});$('#refreshHistory').addEventListener('click',loadHistory);$('#historySearch').addEventListener('input',()=>renderHistory({count:historyEntries.length,totalCost:historyEntries.reduce((s,x)=>s+Number(x.totalCost||0),0),totalFees:historyEntries.reduce((s,x)=>s+Number(x.feeNet||0),0),totalProfit:historyEntries.reduce((s,x)=>s+Number(x.profit||0),0)}));
  $('#pdfBtn').addEventListener('click',()=>{switchTab('result');setTimeout(()=>document.querySelector('.report-editor')?.scrollIntoView({behavior:'smooth',block:'start'}),60);});$('#finalPdfBtn').addEventListener('click',exportPDF);$('#resultPdfBtn')?.addEventListener('click',exportPDF);bindPerButtons();
}


document.addEventListener('keydown',e=>{
  if(!isAuthenticated)return;const tag=document.activeElement?.tagName;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#commandPalette')?.classList.contains('hidden')?openCommandPalette():closeCommandPalette();return;}if(!$('#commandPalette')?.classList.contains('hidden')){if(e.key==='Escape'){e.preventDefault();closeCommandPalette();return;}if(e.key==='ArrowDown'){e.preventDefault();moveCommandSelection(1);return;}if(e.key==='ArrowUp'){e.preventDefault();moveCommandSelection(-1);return;}if(e.key==='Enter'){e.preventDefault();const list=COMMANDS.filter(c=>commandMatches(c,$('#commandSearch')?.value||''));if(list[commandActiveIndex])executeCommand(list[commandActiveIndex].id);return;}}if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();if($('#app')?.classList.contains('workflow-active'))wizardMove(1);return;}if(e.altKey&&e.key==='ArrowLeft'&&$('#app')?.classList.contains('workflow-active')){e.preventDefault();wizardMove(-1);return;}if(e.ctrlKey&&e.key.toLowerCase()==='n'){e.preventDefault();openModuleSelector();return;}if(e.ctrlKey&&e.key.toLowerCase()==='p'){e.preventDefault();switchTab('result');return;}if(e.ctrlKey&&e.key.toLowerCase()==='s'){e.preventDefault();forceAutosave({silent:false});return;}if(e.key==='Escape'){$('#moreActionsMenu')?.classList.add('hidden');$('#notificationPanel')?.classList.add('hidden');closePiorekPanel();hideContextCoach();}
});


window.addEventListener('resize',positionAllLicenseCoaches,{passive:true});
window.addEventListener('error',e=>{console.error(e.error||e.message);if(/OperatReport|buildHTML|OperatCalc/i.test(String(e.message||'')))showStatus(`Błąd modułu programu: ${e.message}. Zainstaluj ponownie wersję ${APP_VERSION}.`,'error',10000);});

window.addEventListener('scroll',()=>{updateScrollTopButton();scheduleCoachPlacement();if(fieldHelpTarget)placeFieldHelp(fieldHelpTarget);},{passive:true});document.addEventListener('scroll',()=>{scheduleCoachPlacement();if(fieldHelpTarget)placeFieldHelp(fieldHelpTarget);},true);window.addEventListener('resize',()=>{scheduleCoachPlacement();if(fieldHelpTarget)placeFieldHelp(fieldHelpTarget);});

window.addEventListener('beforeunload',()=>{if(isAuthenticated){try{window.operatAPI.autosaveImmediate(project);}catch{}}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&isAuthenticated&&autosaveDirty){try{window.operatAPI.autosaveImmediate(project);autosaveDirty=false;}catch{}}else if(document.visibilityState==='visible'&&isAuthenticated){enforceRuntimeLicense({maxAgeMinutes:30});}});

// init() uruchamiamy na samym koncu pliku — po deklaracjach let/const modulu 1.8.0,
// inaczej wpadlby w martwa strefe czasowa (TDZ).


/* ===========================================================================
   OPERO 1.8.0 — wysuwane panele, gratulacje, przypomnienia i samouczek
   Dopisane na końcu app.js: wszystkie funkcje widzą stan renderera (project,
   uiPrefs, changed, showStatus), a deklaracje funkcji są wynoszone na górę
   zakresu, więc kolejność nie ma znaczenia.
   =========================================================================== */

/* --- 1. Wysuwany panel (szuflada) ----------------------------------------- */
// Jeden mechanizm dla klienta, oferty i terminu. Panel wjeżdża z prawej,
// zabiera skupienie, oddaje je z powrotem po zamknięciu i reaguje na Esc.
let drawerZapis=null, drawerPoprzedniFokus=null;

function drawerOtwarty(){ return !$('#operoDrawer')?.classList.contains('hidden'); }

function otworzPanel({eyebrow='OPERO', title='', lead='', bodyHTML='', saveLabel='Zapisz', onSave=null, onOpen=null}){
  const overlay=$('#operoDrawer'); if(!overlay) return;
  drawerPoprzedniFokus=document.activeElement;
  $('#drawerEyebrow').textContent=eyebrow;
  $('#drawerTitle').textContent=title;
  const leadEl=$('#drawerLead');
  leadEl.textContent=lead; leadEl.classList.toggle('hidden',!lead);
  $('#drawerBody').innerHTML=bodyHTML;
  $('#drawerSave').textContent=saveLabel;
  drawerZapis=typeof onSave==='function'?onSave:null;
  ustawBladPanelu('');
  overlay.classList.remove('hidden');
  document.body.classList.add('drawer-open');
  requestAnimationFrame(()=>{
    overlay.classList.add('open');
    try{ onOpen?.(); }catch(e){ console.error(e); }
    const pierwsze=$('#drawerBody input:not([type=hidden]), #drawerBody textarea, #drawerBody select');
    pierwsze?.focus?.({preventScroll:true});
  });
}

function zamknijPanel(){
  const overlay=$('#operoDrawer'); if(!overlay||overlay.classList.contains('hidden')) return;
  overlay.classList.remove('open');
  document.body.classList.remove('drawer-open');
  setTimeout(()=>{
    overlay.classList.add('hidden');
    $('#drawerBody').innerHTML='';
    drawerZapis=null;
    try{ drawerPoprzedniFokus?.focus?.({preventScroll:true}); }catch{}
    drawerPoprzedniFokus=null;
  }, uiPrefs.motion==='full'?220:0);
}

function ustawBladPanelu(tekst){
  const el=$('#drawerError'); if(!el) return;
  el.textContent=tekst||'';
  el.classList.toggle('hidden',!tekst);
}

async function zapiszPanel(){
  if(!drawerZapis) return zamknijPanel();
  const btn=$('#drawerSave'); const stary=btn?.textContent;
  try{
    if(btn){ btn.disabled=true; btn.textContent='Zapisuję…'; }
    const wynik=await drawerZapis();
    if(wynik===false) return;              // walidacja nie przeszła — panel zostaje
    zamknijPanel();
  }catch(e){
    console.error(e);
    ustawBladPanelu(cleanRemoteError(e));
  }finally{
    if(btn){ btn.disabled=false; btn.textContent=stary; }
  }
}

// Pola formularzy panelu budujemy z opisu, zamiast sklejać HTML w każdym miejscu.
function polePanelu(f){
  const id=`pf_${f.key}`;
  const wymagane=f.required?'<i class="pf-req" title="pole wymagane">•</i>':'';
  const podpowiedz=f.hint?`<small class="pf-hint">${escapeHTML(f.hint)}</small>`:'';
  if(f.type==='textarea')
    return `<label class="pf ${f.wide?'pf-wide':''}"><span>${escapeHTML(f.label)}${wymagane}</span><textarea id="${id}" rows="${f.rows||3}" placeholder="${escapeHTML(f.placeholder||'')}">${escapeHTML(f.value??'')}</textarea>${podpowiedz}</label>`;
  if(f.type==='select'){
    const opcje=(f.options||[]).map(o=>`<option value="${escapeHTML(o.value)}"${String(o.value)===String(f.value??'')?' selected':''}>${escapeHTML(o.label)}</option>`).join('');
    return `<label class="pf ${f.wide?'pf-wide':''}"><span>${escapeHTML(f.label)}${wymagane}</span><select id="${id}">${opcje}</select>${podpowiedz}</label>`;
  }
  const atrybuty=[`type="${f.type||'text'}"`,`id="${id}"`,`value="${escapeHTML(f.value??'')}"`,
    f.placeholder?`placeholder="${escapeHTML(f.placeholder)}"`:'',
    f.step?`step="${f.step}"`:'', f.min!==undefined?`min="${f.min}"`:'', f.inputmode?`inputmode="${f.inputmode}"`:''].filter(Boolean).join(' ');
  return `<label class="pf ${f.wide?'pf-wide':''}"><span>${escapeHTML(f.label)}${wymagane}</span><input ${atrybuty}>${podpowiedz}</label>`;
}
function siatkaPanelu(pola){ return `<div class="pf-grid">${pola.map(polePanelu).join('')}</div>`; }
function wartoscPola(key){ return String($(`#pf_${key}`)?.value??'').trim(); }
function liczbaPola(key){ return Number(String(wartoscPola(key)).replace(/\s/g,'').replace(',','.'))||0; }

/* --- 2. Klient: książka i panel wprowadzania ------------------------------ */
let klienciCache=[];

// Suma kontrolna NIP — łapie literówkę od razu, zanim trafi do operatu.
function nipPoprawny(nip){
  const c=String(nip||'').replace(/[^0-9]/g,'');
  if(c.length!==10) return false;
  const w=[6,5,7,2,3,4,5,6,7];
  const suma=w.reduce((s,waga,i)=>s+waga*Number(c[i]),0)%11;
  return suma!==10 && suma===Number(c[9]);
}
function klientPodpis(k){
  if(!k) return '';
  return k.kind==='firma' ? [k.company,k.name].filter(Boolean).join(' · ') : [k.name,k.company].filter(Boolean).join(' · ');
}

async function odswiezKlientow(){
  try{ klienciCache=await window.operatAPI.listClients()||[]; }
  catch(e){ console.error(e); klienciCache=[]; }
  return klienciCache;
}

function formularzKlienta(k={}){
  const zapisani=klienciCache.length
    ? `<div class="pf-book"><span class="pf-book-label">Zapisani klienci</span><div class="pf-book-list">${
        klienciCache.slice(0,8).map(x=>`<span class="pf-chip-wrap"><button type="button" class="pf-chip" data-klient="${escapeHTML(x.id)}">${escapeHTML(klientPodpis(x)||'bez nazwy')}</button><button type="button" class="pf-chip-del" data-usun="${escapeHTML(x.id)}" title="Usuń z książki" aria-label="Usuń z książki">×</button></span>`).join('')
      }</div><small>Kliknij, aby wypełnić pola danymi z książki.</small></div>`
    : '';
  return zapisani + siatkaPanelu([
    {key:'kind',label:'Rodzaj',type:'select',value:k.kind||'osoba',options:[{value:'osoba',label:'Osoba fizyczna'},{value:'firma',label:'Firma / instytucja'}]},
    {key:'name',label:'Imię i nazwisko',value:k.name||'',required:true,placeholder:'np. Anna Kowalska'},
    {key:'company',label:'Nazwa firmy / instytucji',value:k.company||'',wide:true,placeholder:'np. Bank Spółdzielczy w Wolsztynie'},
    {key:'nip',label:'NIP',value:k.nip||'',inputmode:'numeric',placeholder:'10 cyfr',hint:'Sprawdzam sumę kontrolną.'},
    {key:'phone',label:'Telefon',value:k.phone||'',placeholder:'+48 ...'},
    {key:'email',label:'E-mail',type:'email',value:k.email||'',placeholder:'kontakt@...'},
    {key:'address',label:'Adres',value:k.address||'',wide:true,placeholder:'ulica, kod, miejscowość'},
    {key:'purpose',label:'Cel wyceny',value:k.purpose||'',wide:true,placeholder:'np. zabezpieczenie wierzytelności'},
    {key:'contractNo',label:'Numer umowy / zlecenia',value:k.contractNo||''},
    {key:'contractDate',label:'Data zlecenia',type:'date',value:k.contractDate||''},
    {key:'notes',label:'Uwagi',type:'textarea',value:k.notes||'',wide:true,rows:2,placeholder:'ustalenia, kontakt do osoby na miejscu…'},
  ]);
}

// Formularz jest przerysowywany po wyborze z ksiazki, wiec nasluchy trzeba
// podpiac na nowo — inaczej dzialalby tylko pierwszy klikniety chip.
function podepnijChipyKlientow(){
  $$('#drawerBody .pf-chip').forEach(b=>b.addEventListener('click',()=>{
    const k=klienciCache.find(x=>x.id===b.dataset.klient); if(!k) return;
    $('#drawerBody').innerHTML=formularzKlienta(k);
    $('#drawerBody').dataset.klientId=k.id;   // edytujemy istniejacy wpis
    ustawBladPanelu('');
    podepnijChipyKlientow();
  }));
  $$('#drawerBody .pf-chip-del').forEach(b=>b.addEventListener('click',async e=>{
    e.stopPropagation();
    const k=klienciCache.find(x=>x.id===b.dataset.usun); if(!k) return;
    if(!confirm(`Usunąć „${klientPodpis(k)}" z książki klientów? Operaty, w których ten klient już jest, zostają bez zmian.`)) return;
    try{
      await window.operatAPI.deleteClient(k.id);
      await odswiezKlientow();
      const biez=$('#drawerBody').dataset.klientId===k.id?{}:zbierzKlienta($('#drawerBody').dataset.klientId||'');
      if($('#drawerBody').dataset.klientId===k.id) $('#drawerBody').dataset.klientId='';
      $('#drawerBody').innerHTML=formularzKlienta(biez);
      podepnijChipyKlientow();
      showStatus('Klient usunięty z książki.','info');
    }catch(err){ ustawBladPanelu(cleanRemoteError(err)); }
  }));
}
function zbierzKlienta(id=''){
  return {
    id, kind:wartoscPola('kind'), name:wartoscPola('name'), company:wartoscPola('company'),
    nip:wartoscPola('nip'), address:wartoscPola('address'), email:wartoscPola('email'),
    phone:wartoscPola('phone'), purpose:wartoscPola('purpose'), contractNo:wartoscPola('contractNo'),
    contractDate:wartoscPola('contractDate'), notes:wartoscPola('notes'),
  };
}

async function otworzPanelKlienta(){
  await odswiezKlientow();
  const biezacy=project.client||{};
  otworzPanel({
    eyebrow:'ZLECENIODAWCA',
    title:biezacy.name||biezacy.company?'Zmień dane klienta':'Dodaj klienta',
    lead:'Dane trafią do podstawy formalnej operatu. Zostają na Twoim komputerze — nic nie jest wysyłane na serwer.',
    bodyHTML:formularzKlienta(biezacy),
    saveLabel:'Zapisz klienta',
    onOpen:()=>{ $('#drawerBody').dataset.klientId=biezacy.id||''; podepnijChipyKlientow(); },
    onSave:async()=>{
      const dane=zbierzKlienta($('#drawerBody').dataset.klientId||biezacy.id||'');
      if(!dane.name && !dane.company){ ustawBladPanelu('Podaj imię i nazwisko albo nazwę firmy.'); return false; }
      if(dane.nip && !nipPoprawny(dane.nip)){ ustawBladPanelu('NIP ma błędną sumę kontrolną — sprawdź cyfry.'); return false; }
      const zapisany=await window.operatAPI.saveClient(dane);
      project.client={...zapisany};
      uzupelnijPodstaweFormalna();
      changed({fullDynamic:true});
      renderKlientKarta();
      await odswiezKlientow();
      swietuj(`Klient zapisany: ${klientPodpis(zapisany)}`,'Dane zleceniodawcy są już w operacie.');
      return true;
    },
  });
}

// Podstawa formalna to pole tekstowe operatu — po wpisaniu klienta proponujemy
// gotowe zdanie, ale nie nadpisujemy tego, co rzeczoznawca napisał sam.
function uzupelnijPodstaweFormalna(){
  const k=project.client; if(!k) return;
  const biezaca=String(project.formalBasis||'').trim();
  if(biezaca && !biezaca.startsWith('Wycena wykonana na zlecenie')) return;
  const kto=klientPodpis(k);
  const umowa=k.contractNo?` (umowa nr ${k.contractNo}${k.contractDate?` z dnia ${k.contractDate}`:''})`:'';
  const cel=k.purpose?` Cel wyceny: ${k.purpose}.`:'';
  project.formalBasis=`Wycena wykonana na zlecenie: ${kto}${umowa}.${cel}`;
  const pole=$('[data-path="formalBasis"]'); if(pole) pole.value=project.formalBasis;
}

function renderKlientKarta(){
  const el=$('#clientSummary'); if(!el) return;
  const k=project.client;
  if(!k||(!k.name&&!k.company)){
    el.innerHTML='<div class="client-empty"><b>Nie wskazano zleceniodawcy</b><p>Dane klienta wchodzą do podstawy formalnej operatu.</p></div>';
    $('#clientEditBtn').textContent='+ Dodaj klienta';
    return;
  }
  el.innerHTML=`<div class="client-card-row"><span class="client-avatar">${k.kind==='firma'?'▣':'◉'}</span><div>
      <b>${escapeHTML(klientPodpis(k))}</b>
      <small>${escapeHTML([k.nip?`NIP ${k.nip}`:'',k.phone,k.email].filter(Boolean).join(' · ')||'brak danych kontaktowych')}</small>
      ${k.purpose?`<p>${escapeHTML(k.purpose)}</p>`:''}
    </div></div>`;
  $('#clientEditBtn').textContent='Zmień dane klienta';
}

/* --- 2b. Zakladka Klienci: ksiazka zleceniodawcow ------------------------- */
/*
 * Po co osobna zakladka, skoro klienta da sie wpisac w operacie: rzeczoznawca
 * pracuje dla tych samych ludzi po wiele razy. Tu widzi KOGO obsluguje i CO dla
 * niego zrobil, i moze zaczac kolejny operat dla tej samej osoby bez
 * przepisywania adresu, NIP-u i numeru umowy.
 *
 * Operaty przy kliencie bierzemy ze spisu Historii (pola clientId/clientName),
 * a nie z otwierania kazdego zapisanego pliku - przy stu operatach to byloby
 * sto odczytow na jedno wejscie w zakladke.
 */
let klienciFiltr='';

function klienciOperatyDla(id){
  if(!id) return [];
  return (historyEntries||[]).filter(x=>x.clientId===id);
}

/** „1 klient", dalej zawsze „klientów" — po liczebniku idzie dopełniacz. */
function odmianaKlient(n){ return Number(n)===1 ? 'klient' : 'klientów'; }

function klientPasuje(k,q){
  if(!q) return true;
  return [k.name,k.company,k.nip,k.phone,k.email,k.address,k.purpose,k.contractNo]
    .filter(Boolean).join(' ').toLowerCase().includes(q);
}

async function renderKlienci(){
  const root=$('#klienciLista'); if(!root) return;
  await odswiezKlientow();
  if(!historyEntries?.length){ try{ await loadHistory(); }catch{} }
  const q=klienciFiltr.toLowerCase().trim();
  const lista=klienciCache.filter(k=>klientPasuje(k,q));
  const licznik=$('#klienciLicznik');
  if(licznik){
    licznik.textContent = !klienciCache.length ? ''
      : q ? `Znaleziono ${lista.length} z ${klienciCache.length}`
      // Odmiana po polsku: 1 klient, 2-4 klientów, 5+ klientow - a dla 12-14
      // zawsze „klientow", bo „12 klienci" brzmi jak blad. Wczesniej obie
      // galezie dawaly to samo slowo, czyli odmiany nie bylo w ogole.
      : `W książce: ${klienciCache.length} ${odmianaKlient(klienciCache.length)}`;
  }
  if(!klienciCache.length){
    // Naglowek stanu pustego to naprawde naglowek, wiec jest nim takze
    // w dokumencie. Gdyby zostal pogrubionym akapitem, dostalby krój szeryfowy
    // wbrew zasadzie „tresc bezszeryfowa" - i slusznie wylapal to test spojnosci.
    root.innerHTML=`<div class="klienci-pusto"><h3>Książka klientów jest pusta</h3>
      <p>Zapisz zleceniodawcę raz, a przy następnym operacie wybierzesz go jednym kliknięciem — razem z NIP-em, adresem i celem wyceny.</p>
      <button class="btn primary" type="button" data-klient-nowy>+ Dodaj pierwszego klienta</button></div>`;
  } else if(!lista.length){
    root.innerHTML='<p class="hint">Nikt nie pasuje do tego wyszukiwania.</p>';
  } else {
    root.innerHTML=lista.map(k=>{
      const operaty=klienciOperatyDla(k.id);
      const biezacy=project?.client?.id===k.id;
      const kontakt=[k.nip?`NIP ${k.nip}`:'',k.phone,k.email].filter(Boolean).join(' · ');
      return `<article class="klient-karta${biezacy?' biezacy':''}" data-klient-id="${escapeHTML(k.id)}">
        <div class="klient-glowa">
          <span class="klient-znak">${k.kind==='firma'?'▣':'◉'}</span>
          <div class="klient-tytul">
            <b>${escapeHTML(klientPodpis(k)||'bez nazwy')}</b>
            <small>${escapeHTML(kontakt||'brak danych kontaktowych')}</small>
          </div>
          ${biezacy?'<span class="klient-plakietka">w bieżącym operacie</span>':''}
        </div>
        ${k.address?`<p class="klient-adres">${escapeHTML(k.address)}</p>`:''}
        <div class="klient-operaty">
          <span class="klient-operaty-naglowek">${operaty.length?`Operaty (${operaty.length})`:'Brak operatów dla tego klienta'}</span>
          ${operaty.slice(0,5).map(o=>`<button type="button" class="klient-operat" data-otworz="${escapeHTML(o.id)}">
              <span>${escapeHTML(o.title)}</span>
              <small>${escapeHTML(o.status||'Roboczy')} · ${new Date(o.updatedAt).toLocaleDateString('pl-PL')}${o.valueRounded?` · ${money(o.valueRounded,0)}`:''}</small>
            </button>`).join('')}
          ${operaty.length>5?`<small class="hint">…i ${operaty.length-5} starszych w Historii.</small>`:''}
        </div>
        <div class="klient-akcje">
          <button class="btn primary small" type="button" data-przypisz="${escapeHTML(k.id)}">Przypisz do bieżącego operatu</button>
          <button class="btn small" type="button" data-edytuj="${escapeHTML(k.id)}">Zmień dane</button>
          <button class="btn ghost small danger-link" type="button" data-usun-klienta="${escapeHTML(k.id)}">Usuń</button>
        </div>
      </article>`;
    }).join('');
  }
  const szukaj=$('#klienciSzukaj'); if(szukaj && szukaj.value!==klienciFiltr) szukaj.value=klienciFiltr;
}

/**
 * Panel klienta otwierany z ksiazki. Rozni sie od tego z operatu jedna rzecza:
 * `przypisz` mowi, czy zapisany klient ma od razu wejsc do biezacego operatu.
 */
async function otworzPanelKlientaZKsiazki(k={},przypisz=false){
  await odswiezKlientow();
  otworzPanel({
    eyebrow:'KSIĄŻKA KLIENTÓW',
    title:k.id?'Zmień dane klienta':'Nowy klient',
    lead:'Dane zostają na tym komputerze. Przy operacie wybierzesz tego klienta jednym kliknięciem.',
    bodyHTML:formularzKlienta(k),
    saveLabel:'Zapisz klienta',
    onOpen:()=>{ $('#drawerBody').dataset.klientId=k.id||''; podepnijChipyKlientow(); },
    onSave:async()=>{
      const dane=zbierzKlienta($('#drawerBody').dataset.klientId||k.id||'');
      if(!dane.name && !dane.company){ ustawBladPanelu('Podaj imię i nazwisko albo nazwę firmy.'); return false; }
      if(dane.nip && !nipPoprawny(dane.nip)){ ustawBladPanelu('NIP ma błędną sumę kontrolną — sprawdź cyfry.'); return false; }
      const zapisany=await window.operatAPI.saveClient(dane);
      if(przypisz){
        project.client={...zapisany};
        uzupelnijPodstaweFormalna();
        changed({fullDynamic:true});
        renderKlientKarta();
      }
      await renderKlienci();
      swietuj(`Klient zapisany: ${klientPodpis(zapisany)}`,
        przypisz?'Dane zleceniodawcy są już w operacie.':'Jest w książce — wybierzesz go przy operacie.');
      return true;
    },
  });
}

/* ============================================================================
   ASYSTENT NUMERU KSIĘGI WIECZYSTEJ
   ----------------------------------------------------------------------------
   Program nie ma bazy ksiąg i nie udaje, że ma. Robi trzy rzeczy, które przy
   operacie naprawdę oszczędzają czas: sprawdza numer, wyłapuje literówkę i
   oddaje komplet danych wyszukiwarce, która potrafi szukać po adresie.
   ============================================================================ */
let kwTyp = 'lokale';

/** Kody wydziałów, których rzeczoznawca już używał — lista rośnie z jego pracą. */
function kwZnaneKody(){
  const numery = [];
  const dodaj = v => { if (String(v || '').trim()) numery.push(v); };
  dodaj(project?.legal?.kwLocal); dodaj(project?.legal?.kwCommon);
  for (const t of project?.market?.transactions || []) dodaj(t?.zrodlo?.kw);
  for (const h of historyEntries || []) dodaj(h?.kw);
  return window.OperoKW.kodyZHistorii(numery);
}

function kwOdswiezKody(){
  const lista = $('#kwKodyZnane'); if (!lista) return;
  lista.innerHTML = kwZnaneKody().map(x =>
    `<option value="${escapeHTML(x.kod)}">${escapeHTML(x.kod)} — używany ${x.ile}×</option>`).join('');
}

/** Werdykt o numerze. Mówimy, co jest nie tak, a nie samo „błąd”. */
function kwRysujWerdykt(){
  const pole = $('#kwSprawdzPole'), box = $('#kwWerdykt');
  if (!pole || !box) return;
  const wpis = pole.value || '';
  const uzyj = $('#kwUzyjBtn'), kopiuj = $('#kwKopiujBtn');
  if (!wpis.trim()){
    box.dataset.stan = 'pusty';
    box.textContent = 'Wpisz numer, a powiem, czy jest poprawny.';
    uzyj?.classList.add('hidden'); kopiuj?.classList.add('hidden');
    return;
  }
  const w = window.OperoKW.sprawdz(wpis);
  box.dataset.stan = w.ok ? (w.uzupelniona ? 'uzupelniony' : 'ok') : 'zle';
  if (w.ok){
    box.innerHTML = `<b>${escapeHTML(w.pelny)}</b><span>${escapeHTML(w.opis)}</span>`;
    uzyj?.classList.remove('hidden'); kopiuj?.classList.remove('hidden');
    box.dataset.numer = w.pelny;
  } else {
    // Przy złej cyfrze kontrolnej podajemy propozycję, ale od razu mówimy, ile
    // innych poprawek też by pasowało. Numeru księgi się nie zgaduje.
    const dopisek = w.powod === 'ZLA_KONTROLNA'
      ? `<span>Jeśli dwanaście pierwszych znaków jest dobrych, numer brzmi <b>${escapeHTML(w.propozycja)}</b>. Ale pomyłka w którymkolwiek z nich też dałaby poprawny numer — pasuje ich ${w.innychMozliwosci}. Sprawdź w dokumencie.</span>`
      : '';
    box.innerHTML = `<b>${escapeHTML(w.opis)}</b>${dopisek}`;
    const mozna = w.powod === 'ZLA_KONTROLNA';
    uzyj?.classList.toggle('hidden', !mozna); kopiuj?.classList.toggle('hidden', !mozna);
    box.dataset.numer = mozna ? w.propozycja : '';
  }
}

function kwZbierzDane(){
  return window.OperoKW.zapytanie({
    typ: kwTyp,
    wojewodztwo: $('#kwWojewodztwo')?.value || '',
    kodWydzialu: $('#kwKodWydzialu')?.value || '',
    ulica: $('#kwUlica')?.value || '',
    numer: $('#kwNumer')?.value || '',
    lokal: $('#kwLokal')?.value || '',
    lokalizacja: $('#kwLokalizacja')?.value || '',
  });
}

/* ============================================================
   OD ADRESU DO NUMERU KSIEGI WIECZYSTEJ

   Czego program NIE robi i dlaczego: nie wyszukuje numeru KW po adresie w
   zadnej bazie ksiag. Takiej uslugi nie udostepnia ani Ministerstwo
   Sprawiedliwosci (eKW dziala wylacznie po numerze ksiegi), ani GUGiK -
   numer KW jest w ewidencji gruntow dana chroniona. Prywatne serwisy, ktore
   to sprzedaja, trzymaja wlasne kopie bazy eKW i licza kilkadziesiat zlotych
   za numer. Podbieranie od nich danych bylo by lamaniem cudzego regulaminu
   na odpowiedzialnosc rzeczoznawcy - i program tego nie robi.

   Co robi naprawde: prowadzi do numeru najtansza droga, ktora ma koniec.
   ============================================================ */
let kwaOstatni = null;   // ostatni wynik szukania (dzialka + adres)
let kwaKsiega = [];      // wlasna ksiega ustalonych numerow KW

async function kwaWczytajKsiege(){
  try { kwaKsiega = await window.operatAPI.ksiegaKWLista() || []; }
  catch { kwaKsiega = []; }
}

function kwaStan(tekst, rodzaj){
  const el = $('#kwaStan'); if (!el) return;
  if (!tekst){ el.classList.add('hidden'); el.textContent = ''; return; }
  el.classList.remove('hidden');
  el.dataset.rodzaj = rodzaj || 'info';
  el.textContent = tekst;
}

function kwaAdresZPol(){
  return {
    miasto: ($('#kwaMiasto')?.value || '').trim(),
    ulica: ($('#kwaUlica')?.value || '').trim(),
    numer: ($('#kwaNumer')?.value || '').trim(),
    wojewodztwo: ($('#kwaWojewodztwo')?.value || '').trim(),
  };
}

async function kwaSzukajPoAdresie(){
  const adres = kwaAdresZPol();
  if (!adres.miasto){ showStatus('Podaj przynajmniej miejscowość.', 'info', 6000); $('#kwaMiasto')?.focus(); return; }
  kwaStan('Pytam usługi GUGiK o działkę pod tym adresem…', 'praca');
  $('#kwaWynik')?.classList.add('hidden');
  try {
    const r = await window.operatAPI.dzialkaPoAdresie(adres);
    kwaStan('', '');
    if (!r.ok || !r.dzialki?.length){
      kwaRysuj({ adres, dzialki: [], punkty: r.punkty || [], powod: r.powod || 'Nie udało się ustalić działki.' });
      return;
    }
    kwaRysuj({ adres, dzialki: r.dzialki, punkty: r.punkty || [], punkt: r.punkt, powod: '' });
  } catch (e){
    kwaStan('', '');
    showStatus(`Szukanie działki: ${cleanRemoteError(e)}`, 'error', 9000);
  }
}

async function kwaSzukajPoNumerze(){
  const id = ($('#kwaIdDzialki')?.value || '').trim();
  const obreb = ($('#kwaObreb')?.value || '').trim();
  const numer = ($('#kwaNrDzialki')?.value || '').trim();
  if (!id && !(obreb && numer)){ showStatus('Podaj obręb i numer działki albo pełny identyfikator.', 'info', 7000); return; }
  kwaStan('Pytam usługę działek katastralnych…', 'praca');
  try {
    const r = await window.operatAPI.dzialkaPoNumerze({ id, obreb, numer });
    kwaStan('', '');
    kwaRysuj({ adres: kwaAdresZPol(), dzialki: r.dzialki || [], punkty: [], powod: r.ok ? '' : (r.powod || 'Nie znaleziono takiej działki.') });
  } catch (e){
    kwaStan('', '');
    showStatus(`Szukanie działki: ${cleanRemoteError(e)}`, 'error', 9000);
  }
}

/** Numery KW, ktore rzeczoznawca ma juz u siebie - za darmo i od reki. */
function kwaWlasneZrodla(adres, dzialka){
  const D = window.OperoDzialka; if (!D) return [];
  return D.kwZWlasnychZrodel({
    adres, dzialka,
    transakcje: (project.market?.transactions || []),
    historia: (historyEntries || []).map(h => ({ title: h.title, kw: h.kw })),
    ksiega: kwaKsiega,
  });
}

function kwaRysuj({ adres, dzialki, punkty, punkt, powod }){
  const root = $('#kwaWynik'); const D = window.OperoDzialka;
  if (!root || !D) return;
  root.classList.remove('hidden');

  if (!dzialki.length){
    const podpowiedz = punkty.length
      ? 'Adres znaleziony, ale GUGiK nie ma w tym punkcie działki. Spróbuj szukać po numerze działki.'
      : 'Sprawdź pisownię ulicy albo poszukaj po numerze działki.';
    root.innerHTML = `<div class="kwa-pusto"><b>${escapeHTML(powod || 'Nie znaleziono działki.')}</b><p>${podpowiedz}</p></div>`;
    return;
  }

  const d = dzialki[0];
  kwaOstatni = { adres, dzialka: d, wszystkie: dzialki };
  const kw = kwaWlasneZrodla(adres, d);
  const kroki = D.dalszeKroki({ dzialka: d, znalezioneKW: kw });

  const inne = dzialki.length > 1
    ? `<p class="hint">Pod tym adresem usługa zwróciła ${dzialki.length} działek. Pokazuję pierwszą; resztę zobaczysz w Geoportalu.</p>` : '';

  const znalezione = kw.length
    ? `<div class="kwa-kw"><b>Numery KW z Twoich własnych danych</b>
         ${kw.map((x, i) => `<div class="kwa-kw-wiersz">
            <code>${escapeHTML(x.kw)}</code>
            <span>${escapeHTML(x.opis)}</span>
            <button type="button" class="btn small" data-kwa-sprawdz="${i}">Sprawdź w eKW</button>
            <button type="button" class="btn small gold-outline" data-kwa-wstaw="${i}">Wstaw do operatu</button>
          </div>`).join('')}
         <p class="hint">To numery z wyciągu RCiWN, Twoich operatów i Twojej księgi ustalonych numerów — nie z żadnej zewnętrznej bazy. Zanim ich użyjesz, sprawdź w eKW, czy dotyczą tej nieruchomości.</p>
       </div>`
    : `<div class="kwa-kw kwa-kw-brak"><b>W Twoich danych nie ma numeru KW dla tej nieruchomości.</b>
         <p class="hint">Darmowej, oficjalnej wyszukiwarki „adres → numer KW” nie ma — numer księgi jest w ewidencji daną chronioną. Poniżej drogi, które naprawdę kończą się numerem.</p></div>`;

  root.innerHTML = `
    <div class="kwa-dzialka">
      <div class="kwa-dzialka-glowa"><b>Działka ${escapeHTML(d.numer || '—')}</b><span>${escapeHTML([d.obreb, d.gmina, d.powiat, d.wojewodztwo].filter(Boolean).join(' · '))}</span></div>
      <code class="kwa-id">${escapeHTML(d.id || '')}</code>
      <div class="button-row">
        <button id="kwaGeoportal" class="btn small" type="button">Otwórz w Geoportalu</button>
        <button id="kwaDoOperatu" class="btn small gold-outline" type="button">Wstaw działkę do operatu</button>
        <button id="kwaKopiujId" class="btn small ghost" type="button">Kopiuj identyfikator</button>
      </div>
      ${inne}
    </div>
    ${znalezione}
    <div class="kwa-kroki">${kroki.map(k => `
      <div class="kwa-krok" data-krok="${k.id}">
        <div><b>${escapeHTML(k.nazwa)}</b><small>${escapeHTML(k.koszt)}</small><p>${escapeHTML(k.opis)}</p></div>
        ${k.id === 'wniosek' ? '<button id="kwaWniosek" class="btn small primary" type="button">Wypełnij wniosek</button>' : ''}
        ${k.id === 'geoportal' ? '<button class="btn small" type="button" data-kwa-geoportal="1">Otwórz mapę</button>' : ''}
      </div>`).join('')}
    </div>
    <div class="kwa-zapisz">
      <label>Mam już numer KW tej nieruchomości — zapamiętaj go przy działce
        <input id="kwaNowyKW" autocomplete="off" placeholder="np. GD1G/00012345/0"></label>
      <button id="kwaZapiszKW" class="btn small" type="button">Zapisz w mojej księdze</button>
    </div>`;

  root.querySelectorAll('[data-kwa-sprawdz]').forEach(b => b.addEventListener('click', () => {
    const x = kw[Number(b.dataset.kwaSprawdz)]; if (x) window.operatAPI.openOfficialKW(x.kw);
  }));
  root.querySelectorAll('[data-kwa-wstaw]').forEach(b => b.addEventListener('click', () => {
    const x = kw[Number(b.dataset.kwaWstaw)]; if (!x) return;
    project.legal.kwLocal = x.kw; changed({ fullDynamic: true });
    showStatus(`Numer ${x.kw} wpisany do operatu. Sprawdź w eKW, czy to ta nieruchomość.`, 'info', 8000);
  }));
  const otworzMape = () => window.operatAPI.openExternal(D.urlGeoportalu(d.id));
  $('#kwaGeoportal')?.addEventListener('click', otworzMape);
  root.querySelectorAll('[data-kwa-geoportal]').forEach(b => b.addEventListener('click', otworzMape));
  $('#kwaKopiujId')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(d.id || ''); showStatus('Identyfikator działki skopiowany.', 'info', 4000); }
    catch { showStatus('Nie udało się skopiować — zaznacz i skopiuj ręcznie.', 'error', 6000); }
  });
  $('#kwaDoOperatu')?.addEventListener('click', () => {
    project.egib = project.egib || {};
    project.egib.plotNo = d.numer || project.egib.plotNo;
    project.egib.district = d.obreb || project.egib.district;
    if (adres.miasto && !project.property.city) project.property.city = adres.miasto;
    if (adres.ulica && !project.property.street) project.property.street = adres.ulica;
    if (adres.numer && !project.property.buildingNo) project.property.buildingNo = adres.numer;
    changed({ fullDynamic: true });
    showStatus(`Działka ${d.numer}, obręb ${d.obreb} wpisana do operatu.`, 'info', 6000);
  });
  $('#kwaWniosek')?.addEventListener('click', kwaWniosek);
  $('#kwaZapiszKW')?.addEventListener('click', kwaZapiszKW);
}

async function kwaZapiszKW(){
  const pole = $('#kwaNowyKW'); const D = window.OperoKW;
  const surowy = (pole?.value || '').trim();
  if (!surowy || !kwaOstatni){ showStatus('Najpierw znajdź działkę i wpisz numer KW.', 'info', 6000); return; }
  const sprawdzony = D ? D.sprawdz(surowy) : null;
  // Numeru NIE poprawiamy po cichu. Zmiana cyfry kontrolnej robi z jednego
  // istniejącego numeru księgi inny istniejący numer księgi — i rzeczoznawca
  // zapisałby przy swojej działce cudzą nieruchomość, nic o tym nie wiedząc.
  if (sprawdzony && !sprawdzony.ok){
    const podp = sprawdzony.propozycja
      ? ` Jeśli to literówka, poprawny byłby ${sprawdzony.propozycja} — sprawdź na dokumencie i wpisz go sam.`
      : '';
    showStatus(`To nie jest poprawny numer księgi wieczystej.${podp}`, 'error', 10000);
    return;
  }
  const numer = sprawdzony?.pelny || surowy;
  try {
    await window.operatAPI.ksiegaKWZapisz({ dzialka: kwaOstatni.dzialka.id, kw: numer,
      adres: [kwaOstatni.adres.miasto, kwaOstatni.adres.ulica, kwaOstatni.adres.numer].filter(Boolean).join(' ') });
    await kwaWczytajKsiege();
    showStatus(`Numer ${numer} zapamiętany przy działce ${kwaOstatni.dzialka.id}. Następnym razem znajdzie się sam.`, 'info', 8000);
    kwaRysuj({ adres: kwaOstatni.adres, dzialki: kwaOstatni.wszystkie, punkty: [], powod: '' });
  } catch (e){ showStatus(`Nie udało się zapisać: ${cleanRemoteError(e)}`, 'error', 8000); }
}

/** Wniosek do starosty - gotowy do podpisu, z podstawa prawna i danymi dzialki. */
async function kwaWniosek(){
  const D = window.OperoDzialka; if (!D || !kwaOstatni) return;
  let profil = {};
  try { profil = await window.operatAPI.profilOdczytaj() || {}; } catch {}
  const tresc = D.wniosekDoStarosty({
    dzialka: kwaOstatni.dzialka, adres: kwaOstatni.adres, profil,
    cel: project.valuation?.purpose || '',
  });
  const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Wniosek o udostępnienie danych z EGiB</title>
    <style>@page{size:A4;margin:20mm}body{font:11pt/1.55 Georgia,"Times New Roman",serif;color:#1d1c19;white-space:pre-wrap}</style>
    </head><body>${escapeHTML(tresc)}</body></html>`;
  try {
    const r = await window.operatAPI.exportPDF({ html,
      defaultName: `Wniosek_EGiB_${String(kwaOstatni.dzialka.numer || '').replace(/[^0-9a-zA-Z]/g, '_')}.pdf`,
      meta: { showHeaderFooter: false } });
    if (!r.canceled) showStatus(`Wniosek zapisany: ${r.filePath}. Podpisz i wyślij do starostwa.`, 'info', 9000);
  } catch (e){ showStatus(`Wniosek: ${cleanRemoteError(e)}`, 'error', 8000); }
}

function hookKWAdres(){
  $('#kwaSzukaj')?.addEventListener('click', kwaSzukajPoAdresie);
  $('#kwaSzukajNr')?.addEventListener('click', kwaSzukajPoNumerze);
  $('#kwaZOperatu')?.addEventListener('click', () => {
    const p = project.property || {};
    if ($('#kwaMiasto')) $('#kwaMiasto').value = p.city || '';
    if ($('#kwaUlica')) $('#kwaUlica').value = p.street || '';
    if ($('#kwaNumer')) $('#kwaNumer').value = p.buildingNo || '';
    showStatus('Przepisałem adres z operatu.', 'info', 4000);
  });
  ['#kwaMiasto', '#kwaUlica', '#kwaNumer'].forEach(sel => $(sel)?.addEventListener('keydown', ev => {
    if (ev.key === 'Enter'){ ev.preventDefault(); kwaSzukajPoAdresie(); }
  }));
  kwaWczytajKsiege();
}

/* ============================================================
   WLASNA BAZA TRANSAKCJI

   Program nie dobiera transakcji za rzeczoznawce. Podpowiada kandydatow -
   ten sam rynek, zblizona powierzchnia, sensowny okres - i przy kazdym pisze,
   dlaczego go podpowiada. Zaznacza czlowiek, bo to on odpowiada za dobor
   nieruchomosci podobnych i to jemu stawia sie z tego zarzuty.
   ============================================================ */
let bazaWpisy = [];            // to, co teraz widac w tabeli
let bazaZaznaczone = new Set();
let bazaTrybDopasowania = false;

function bazaFiltr(){
  return {
    miejscowosc: $('#bazaMiasto')?.value || '',
    tekst: $('#bazaTekst')?.value || '',
    odData: $('#bazaOdData')?.value || '',
    doData: $('#bazaDoData')?.value || '',
    powOd: $('#bazaPowOd')?.value || '',
    powDo: $('#bazaPowDo')?.value || '',
    prawo: $('#bazaPrawo')?.value || '',
  };
}

async function bazaOdswiez(){
  try {
    const r = await window.operatAPI.bazaLista(bazaFiltr());
    bazaTrybDopasowania = false;
    bazaWpisy = r.wpisy || [];
    bazaZaznaczone = new Set();
    bazaRysujPasek(r.statystyki, r.razem);
    bazaRysujWiersze(`Widać ${r.ile} z ${r.razem} transakcji w bazie.`);
    if (r.uszkodzony){
      showStatus(`Plik bazy był uszkodzony — odłożyłem go obok jako ${r.uszkodzony} i zacząłem nowy. Nic nie skasowałem.`, 'error', 14000);
    }
  } catch (e){ showStatus(`Baza rynku: ${cleanRemoteError(e)}`, 'error', 8000); }
}

function bazaRysujPasek(st, razem){
  const el = $('#bazaPasek'); if (!el || !st) return;
  if (!razem){
    el.innerHTML = `<div class="baza-pusta"><b>Baza jest jeszcze pusta.</b>
      <p>Wczytaj wyciąg RCiWN w kreatorze albo w Express — każda transakcja zostanie tu na stałe i wróci przy następnej wycenie na tym rynku.</p></div>`;
    return;
  }
  const top = (st.miejscowosci || []).slice(0, 4).map(m => `${escapeHTML(m.nazwa)} (${m.ile})`).join(' · ');
  el.innerHTML = `
    <div class="baza-kafel"><span>Transakcji w bazie</span><strong>${st.ile}</strong></div>
    <div class="baza-kafel"><span>Najstarsza / najnowsza</span><strong>${escapeHTML(st.odData || '—')}</strong><small>do ${escapeHTML(st.doData || '—')}</small></div>
    <div class="baza-kafel"><span>Mediana</span><strong>${st.mediana != null ? money(st.mediana, 2) : '—'}</strong><small>za m²</small></div>
    <div class="baza-kafel szeroki"><span>Najwięcej danych</span><strong>${top || '—'}</strong></div>`;
}

function bazaRysujWiersze(info){
  const body = $('#bazaWiersze'); if (!body) return;
  const el = $('#bazaWynikInfo'); if (el) el.textContent = info || '';
  if (!bazaWpisy.length){
    body.innerHTML = '<tr><td colspan="10">Nic nie pasuje do tych warunków.</td></tr>';
    return;
  }
  body.innerHTML = bazaWpisy.map(t => `<tr>
    <td><input type="checkbox" data-baza-id="${escapeHTML(String(t.id))}"${bazaZaznaczone.has(String(t.id)) ? ' checked' : ''}></td>
    <td>${escapeHTML(t.data || '—')}</td>
    <td>${escapeHTML(t.adres || '—')}</td>
    <td>${escapeHTML(t.miejscowosc || '—')}</td>
    <td class="calc-cell">${t.powierzchnia != null ? fmt(t.powierzchnia, 2) : '—'}</td>
    <td class="calc-cell">${t.cena != null ? money(t.cena, 0) : '—'}</td>
    <td class="calc-cell">${t.jednostkowa != null ? money(t.jednostkowa, 2) : '—'}</td>
    <td>${escapeHTML(t.prawo || '—')}</td>
    <td class="baza-zrodlo">${escapeHTML(t.zrodlo?.plik || '—')}</td>
    <td class="baza-powody">${(t.powody || []).map(x => `<span${/UWAGA/.test(x) ? ' class="baza-uwaga"' : ''}>${escapeHTML(x)}</span>`).join('')}</td>
  </tr>`).join('');
  body.querySelectorAll('[data-baza-id]').forEach(ch => ch.addEventListener('change', () => {
    const id = ch.dataset.bazaId;
    if (ch.checked) bazaZaznaczone.add(id); else bazaZaznaczone.delete(id);
  }));
}

/** Kandydaci do BIEZACEGO operatu: ten sam rynek, zblizona powierzchnia, okres. */
async function bazaPodpowiedz(){
  const p = project.property || {};
  const przedmiot = {
    miejscowosc: p.city || '',
    powierzchnia: Number(p.usableArea) || 0,
    dataWyceny: project.valuation?.valuationDate || todayISO(),
    prawo: p.rightType || '',
  };
  if (!przedmiot.miejscowosc){
    showStatus('Bieżący operat nie ma jeszcze miejscowości — bez niej nie wiem, z jakiego rynku szukać.', 'info', 8000);
    return;
  }
  try {
    const r = await window.operatAPI.bazaDopasuj(przedmiot);
    bazaTrybDopasowania = true;
    bazaWpisy = r.kandydaci || [];
    bazaZaznaczone = new Set();
    bazaRysujWiersze(`${r.ile} transakcji z bazy pasuje do tego operatu (${escapeHTML(przedmiot.miejscowosc)}, ${przedmiot.powierzchnia || '—'} m², do ${window.OperoBaza.OKRES_MIESIECY} miesięcy wstecz). Zaznacz te, które bierzesz — dobór jest Twój.`);
    if (!r.ile) showStatus(`W bazie nie ma transakcji z tego rynku i okresu. Jest ich tam łącznie ${r.razem}.`, 'info', 8000);
  } catch (e){ showStatus(`Podpowiedzi z bazy: ${cleanRemoteError(e)}`, 'error', 8000); }
}

function bazaWybrane(){ return bazaWpisy.filter(t => bazaZaznaczone.has(String(t.id))); }

function bazaDoOperatu(){
  const wybrane = bazaWybrane();
  if (wybrane.length < 2){ showStatus('Zaznacz co najmniej dwie transakcje — z jednej nie da się nic porównać.', 'info', 7000); return; }
  const nowe = window.OperoBaza.doOperatu(wybrane, 1);
  const ile = (project.market.transactions || []).length;
  if (ile && !confirm(`W operacie jest już ${ile} transakcji. Zastąpić je ${nowe.length} wybranymi z bazy?`)) return;
  project.market.transactions = nowe.map(t => ({ ...t, useForPair: isPairModule() }));
  changed({ fullDynamic: true });
  showStatus(`${nowe.length} transakcji z własnej bazy wstawionych do operatu. Oceny cech uzupełnij w tabeli — baza ich nie zgaduje.`, 'info', 9000);
  switchTab('project');
}

async function bazaUsunZaznaczone(){
  const wybrane = bazaWybrane();
  if (!wybrane.length){ showStatus('Nie zaznaczyłeś żadnej transakcji.', 'info', 5000); return; }
  if (!confirm(`Usunąć ${wybrane.length} ${wybrane.length === 1 ? 'transakcję' : 'transakcji'} z bazy? Tej operacji nie da się cofnąć — operaty, które już z nich korzystają, zostają nietknięte.`)) return;
  try {
    const r = await window.operatAPI.bazaUsun(wybrane.map(t => String(t.id)));
    showStatus(`Usunięto ${r.usuniete}. W bazie zostaje ${r.razem}.`, 'info', 7000);
    await bazaOdswiez();
  } catch (e){ showStatus(`Usuwanie z bazy: ${cleanRemoteError(e)}`, 'error', 8000); }
}

/**
 * Dolozenie wyciagu do bazy. Wolane po kazdym imporcie RCiWN - takze dla
 * wierszy, ktorych rzeczoznawca nie wzial do TEGO operatu, bo za pol roku
 * moga byc wlasnie tymi wlasciwymi.
 */
async function bazaZapiszZWyciagu(wiersze, plik){
  if (!Array.isArray(wiersze) || !wiersze.length) return null;
  try {
    const r = await window.operatAPI.bazaDodaj({ wiersze, plik });
    return r;
  } catch (e){
    showStatus(`Nie udało się dopisać transakcji do bazy: ${cleanRemoteError(e)}`, 'error', 9000);
    return null;
  }
}

function hookBaza(){
  $('#bazaSzukaj')?.addEventListener('click', bazaOdswiez);
  $('#bazaWyczysc')?.addEventListener('click', () => {
    ['#bazaMiasto', '#bazaTekst', '#bazaOdData', '#bazaDoData', '#bazaPowOd', '#bazaPowDo', '#bazaPrawo']
      .forEach(sel => { const el = $(sel); if (el) el.value = ''; });
    bazaOdswiez();
  });
  ['#bazaMiasto', '#bazaTekst', '#bazaPrawo'].forEach(sel => $(sel)?.addEventListener('keydown', ev => {
    if (ev.key === 'Enter'){ ev.preventDefault(); bazaOdswiez(); }
  }));
  $('#bazaDopasujBtn')?.addEventListener('click', bazaPodpowiedz);
  $('#bazaZGeoportalu')?.addEventListener('click', () => rcnZGeoportalu({}));
  $('#bazaDoOperatu')?.addEventListener('click', bazaDoOperatu);
  $('#bazaUsunBtn')?.addEventListener('click', bazaUsunZaznaczone);
  $('#bazaZaznaczWszystko')?.addEventListener('change', ev => {
    bazaZaznaczone = ev.target.checked ? new Set(bazaWpisy.map(t => String(t.id))) : new Set();
    bazaRysujWiersze($('#bazaWynikInfo')?.textContent || '');
  });
  $('#bazaEksportBtn')?.addEventListener('click', async () => {
    try {
      const r = await window.operatAPI.bazaEksport(bazaTrybDopasowania ? {} : bazaFiltr());
      if (!r.canceled) showStatus(`Zapisano ${r.ile} transakcji: ${r.filePath}`, 'info', 8000);
    } catch (e){ showStatus(`Eksport bazy: ${cleanRemoteError(e)}`, 'error', 8000); }
  });
  $('#bazaFolderBtn')?.addEventListener('click', () => window.operatAPI.bazaOtworzFolder());
}

function hookKW(){
  $$('.kw-typ').forEach(b => b.addEventListener('click', () => {
    kwTyp = b.dataset.kwTyp;
    $$('.kw-typ').forEach(x => { const a = x.dataset.kwTyp === kwTyp;
      x.classList.toggle('active', a);
      x.textContent = (a ? '✓ ' : '') + x.textContent.replace(/^✓\s*/, ''); });
  }));
  $('#kwSprawdzPole')?.addEventListener('input', kwRysujWerdykt);
  $('#kwKopiujBtn')?.addEventListener('click', async () => {
    const n = $('#kwWerdykt')?.dataset.numer || ''; if (!n) return;
    try { await navigator.clipboard.writeText(n); showStatus(`Skopiowano ${n}.`, 'info', 4000); }
    catch { showStatus('Nie udało się skopiować — zaznacz numer i skopiuj ręcznie.', 'error', 6000); }
  });
  $('#kwUzyjBtn')?.addEventListener('click', () => {
    const n = $('#kwWerdykt')?.dataset.numer || ''; if (!n) return;
    project.legal.kwLocal = n; changed({ fullDynamic: true });
    showStatus(`Numer ${n} wpisany do operatu.`, 'success', 6000);
  });
  $('#kwZOperatuBtn')?.addEventListener('click', () => {
    const p = project.property || {};
    if ($('#kwUlica')) $('#kwUlica').value = p.street || '';
    if ($('#kwNumer')) $('#kwNumer').value = p.buildingNo || '';
    if ($('#kwLokal')) $('#kwLokal').value = p.localNo || '';
    if ($('#kwLokalizacja')) $('#kwLokalizacja').value = [p.city, p.district].filter(Boolean).join(' ');
    showStatus('Przepisałem adres z operatu.', 'info', 4000);
  });
  $('#kwSzukajBtn')?.addEventListener('click', async () => {
    const d = kwZbierzDane();
    if (!d.gotowe){ showStatus('Podaj choć ulicę albo miejscowość — bez tego nie ma czego szukać.', 'info', 7000); return; }
    try { await navigator.clipboard.writeText(d.doSchowka); } catch {}
    // Otwieramy wyszukiwarkę treści KW. Program nie przeszukuje ksiąg sam -
    // tu jest granica między tym, co potrafi, a tym, czego nie potrafi nikt
    // poza serwisem z własną bazą.
    await window.operatAPI.openExternal('https://przegladarka-ekw.ms.gov.pl/');
    showStatus(`Dane do wklejenia są w schowku: ${d.doSchowka}. Pamiętaj, że OPERO nie przeszukuje ksiąg — robi to otwarty serwis.`, 'info', 12000);
  });
  kwOdswiezKody();
  kwRysujWerdykt();
}

/* ============================================================================
   OPERAT EXPRESS — ekran
   ----------------------------------------------------------------------------
   Cztery pola, wyciąg z RCiWN i jeden przycisk. Po policzeniu: wynik i lista
   tego, co program przyjął za rzeczoznawcę. PDF zostaje zablokowany, dopóki
   ta lista nie zostanie przejrzana i wzięta na siebie — bo to rzeczoznawca
   podpisuje się pod każdą z tych liczb, nie program.
   ============================================================================ */
let expressWynik = null;

let expressTyp = '';   // rodzaj operatu wybrany w Express

/** Kafelki rodzajów. To, czego Express nie robi, też pokazujemy — z powodem. */
function expressRysujTypy(){
  const E = window.OperoExpress; if (!E) return;
  const root = $('#exTypy');
  if (root){
    root.innerHTML = E.typyExpress().map(t => `
      <button type="button" class="express-typ${expressTyp === t.id ? ' wybrany' : ''}" data-ex-typ="${t.id}" aria-pressed="${expressTyp === t.id}">
        <span class="express-typ-ikona">${t.ikona}</span>
        <b>${escapeHTML(t.nazwa)}</b>
        <small>${escapeHTML(t.metoda)}</small>
        <i>${escapeHTML(t.opis)}</i>
        <em>${t.wymagaRcn ? 'potrzebny wyciąg RCiWN' : 'bez wyciągu RCiWN'}</em>
      </button>`).join('');
    root.querySelectorAll('[data-ex-typ]').forEach(b => b.addEventListener('click', () => expressWybierzTyp(b.dataset.exTyp)));
  }
  const nie = $('#exTypyNie');
  if (nie){
    const lista = E.TYPY.filter(t => !t.express);
    nie.innerHTML = `<b>Czego Express nie zrobi</b>
      <div class="express-nie-siatka">${lista.map(t => `
        <div class="express-nie"><span>${t.ikona}</span><div><b>${escapeHTML(t.nazwa)}</b><p>${escapeHTML(t.powod)}</p></div></div>`).join('')}</div>
      <p class="hint">Te wyceny robi się w kreatorze, krok po kroku. Express skróciłby tu nie pracę, tylko rozstrzygnięcia — a te są Twoje.</p>`;
  }
  const nazwa = $('#exTypNazwa');
  if (nazwa) nazwa.textContent = expressTyp ? (E.typ(expressTyp)?.nazwa || '—') : '—';
}

/** Formularz powstaje z listy pól wybranego rodzaju — jedno źródło prawdy. */
function expressRysujPola(){
  const E = window.OperoExpress; const t = E && E.typ(expressTyp);
  const root = $('#exPola'); if (!root || !t) return;
  root.innerHTML = (t.pola || []).map(pole => {
    const id = `ex_${pole.klucz}`;
    const etykieta = `${escapeHTML(pole.nazwa)}${pole.wymagane ? '<b class="wymagane"> *</b>' : ''}`;
    const klasa = pole.szeroko ? ' class="span-2"' : '';
    const pomoc = pole.pomoc ? ` data-help="${escapeHTML(pole.pomoc)}"` : '';
    if (pole.typ === 'wybor'){
      return `<label${klasa}${pomoc}><span>${etykieta}</span><select id="${id}" data-ex-pole="${pole.klucz}">${
        pole.opcje.map(([w, e]) => `<option value="${escapeHTML(w)}">${escapeHTML(e)}</option>`).join('')}</select></label>`;
    }
    // Jedna rubryka na adres: czlowiek wpisuje ULICE, program dopisuje
    // miejscowosc i dzielnice z panstwowego rejestru punktow adresowych.
    if (pole.typ === 'adres'){
      return `<label class="span-2 pole-adres"${pomoc}><span>${etykieta}</span>`
        + `<input id="${id}" data-ex-pole="${pole.klucz}" data-adres-jedno="1" type="text" autocomplete="off" placeholder="${escapeHTML(pole.ph || '')}">`
        + `<small class="pole-adres-stan" id="${id}_stan">Wpisz ulicę — od trzech znaków program zacznie szukać w rejestrze adresów.</small>`
        + `<div class="pole-adres-wybor hidden" id="${id}_wybor"></div></label>`;
    }
    // Pole, ktore program wypelnia sam z rejestru. Zostaje do poprawienia i
    // jest oznaczone - pod operatem podpisuje sie czlowiek, nie rejestr.
    if (pole.zRejestru){
      return `<label class="pole-z-rejestru${pole.szeroko ? ' span-2' : ''}"${pomoc}><span>${etykieta}<i class="pole-znacznik" data-znacznik="z rejestru" title="Program wypełnia to pole z państwowego rejestru adresów. Możesz poprawić."></i></span>`
        + `<input id="${id}" data-ex-pole="${pole.klucz}" data-z-rejestru="1" type="text" autocomplete="off" placeholder="${escapeHTML(pole.ph || '')}"></label>`;
    }
    // Pole liczbowe jest typu TEXT z klawiatura numeryczna, a nie type=number:
    // przegladarka odrzuca w type=number przecinek, a po polsku czesci
    // dziesietne pisze sie wlasnie przecinkiem. Tego, co wejdzie, pilnuje
    // modul pol - z komunikatem po ludzku zamiast cichego czyszczenia pola.
    const typHtml = pole.typ === 'liczba' ? 'text' : pole.typ === 'data' ? 'date' : 'text';
    const dodatki = pole.typ === 'liczba' ? ' inputmode="decimal"' : '';
    return `<label${klasa}${pomoc}><span>${etykieta}</span><input id="${id}" data-ex-pole="${pole.klucz}" type="${typHtml}"${dodatki} autocomplete="off" placeholder="${escapeHTML(pole.ph || '')}"></label>`;
  }).join('');

  const opis = $('#exDaneOpis');
  if (opis) opis.textContent = `${t.metoda}. Program pyta tylko o to, czego ta metoda wymaga — reszta policzy się sama.`;
  $('#exRcnWiersz')?.classList.toggle('hidden', !t.wymagaRcn);
  // Data wyceny to jedyne pole, przy ktorym dzisiejsza data jest trafna
  // wystarczajaco czesto, zeby ja podpowiedziec.
  if ($('#ex_dataWyceny') && !$('#ex_dataWyceny').value) $('#ex_dataWyceny').value = todayISO();
  applyHelpTooltips();
  hookPola($('#exPola')?.parentElement || document);
  expressRysujRcn();
  expressRysujZrodla();
}

function expressWybierzTyp(id){
  const E = window.OperoExpress; const t = E && E.typ(id);
  if (!t || !t.express) return;
  expressTyp = id;
  $('#exDaneKarta')?.classList.remove('hidden');
  expressRysujTypy();
  expressRysujPola();
  $('#exDokumentyKarta')?.classList.remove('hidden');
  dokRysuj();
  $('#exBraki')?.classList.add('hidden');
  showStatus(`${t.nazwa} — ${t.metoda.toLowerCase()}. Wypełnij dane niżej.`, 'info', 5000);
  setTimeout(() => $('#exDaneKarta')?.scrollIntoView({ behavior: uiPrefs.motion === 'full' ? 'smooth' : 'auto', block: 'start' }), 60);
}

function expressDane(){
  const out = {};
  $$('[data-ex-pole]').forEach(el => { out[el.dataset.exPole] = el.value || ''; });
  return out;
}

/** Ile transakcji jest w operacie — Express liczy z tego, co już wczytane. */
function expressTransakcje(){ return (project.market?.transactions || []).slice(); }

function expressRysujRcn(){
  const el = $('#exRcnStan'); if (!el) return;
  const ile = expressTransakcje().length;
  el.textContent = ile
    ? `W operacie jest ${ile} ${ile === 1 ? 'transakcja' : 'transakcji'} porównawczych.`
    : 'Nie wczytano jeszcze wyciągu RCiWN — możesz też wziąć transakcje z własnej bazy rynku.';
}

/**
 * Z Expressu do wlasnej bazy. Nie wstawiamy transakcji automatycznie: program
 * przenosi do Bazy rynku z gotowymi podpowiedziami, a zaznacza czlowiek.
 * Dobor nieruchomosci podobnych jest tym, co weryfikator sprawdza najpierw.
 */
function expressZBazy(){
  const miasto = ($('#ex_miasto')?.value || '').trim();
  const pow = Number($('#ex_powierzchnia')?.value) || 0;
  const data = $('#ex_dataWyceny')?.value || '';
  if (miasto) project.property.city = project.property.city || miasto;
  if (pow > 0) project.property.usableArea = project.property.usableArea || pow;
  if (data) project.valuation.valuationDate = project.valuation.valuationDate || data;
  switchTab('baza');
  setTimeout(() => { if (miasto){ const f = $('#bazaMiasto'); if (f) f.value = miasto; } bazaPodpowiedz(); }, 120);
}

function expressPolicz(){
  { const rozs=$('#exRozszerzony'); if(rozs) rozs.open=true; }
  if (!expressTyp){ showStatus('Najpierw wybierz rodzaj operatu.', 'info', 6000); return; }
  const dane = expressDane();
  const transakcje = expressTransakcje();
  const regresja = getCalc().regressionTrend(transakcje);
  // Projekt bazowy MUSI powstac dla wybranego rodzaju: to on decyduje, jakie
  // cechy rynkowe, jaka struktura modulu i jaki generator raportu wejda w grę.
  const wynik = window.OperoExpress.przygotuj({
    bazowy: freshProject(expressTyp), typ: expressTyp,
    dane, transakcje, regresja, profil: profilCache, klient: project.client,
  });

  const braki = $('#exBraki');
  if (!wynik.ok){
    // Mówimy wprost, czego brakuje. Policzenie „mimo wszystko” dałoby liczbę,
    // która wygląda jak wycena, a nią nie jest.
    if (braki){
      braki.classList.remove('hidden');
      braki.innerHTML = `<b>Nie policzę — brakuje danych:</b><ul>${
        wynik.braki.map(b => `<li>${escapeHTML(b)}</li>`).join('')}</ul>`;
    }
    $('#exWynikKarta')?.classList.add('hidden');
    expressWynik = null;
    return;
  }
  braki?.classList.add('hidden');

  // Projekt Express zastępuje bieżący operat — mówimy o tym wprost, zanim
  // skasujemy czyjąś pracę.
  const cos = (project.property?.city || '') || (project.market?.features || []).some(f => Number(f.weight) > 0);
  if (cos && !confirm('Express złoży nowy operat na podstawie podanych danych i wczytanych transakcji.\n\nBieżący operat zostanie zastąpiony — wgrane dokumenty, zdjęcia i odpowiedzi zostają. Historia zapisanych operatów pozostaje nietknięta. Kontynuować?')) return;

  // Zalaczniki i odpowiedzi WEDRUJA do nowego operatu. Express sklada projekt
  // od nowa, wiec bez tego zdjecia i skany wgrane w kroku 3 przepadalyby w
  // chwili nacisniecia „Policz" - czlowiek wgralby je drugi raz, nie wiedzac,
  // dlaczego pierwszy raz sie nie zapisaly.
  wynik.projekt.photos = (project.photos || []).slice();
  wynik.projekt.files = (project.files || []).slice();
  wynik.projekt.odpowiedzi = { ...(project.odpowiedzi || {}) };
  if ((project.clauses || []).length) wynik.projekt.clauses = project.clauses.slice();
  project = normalizeLoadedProject(wynik.projekt);
  expressWynik = wynik;
  calc = obliczProjekt();
  renderAll(); changed({ fullDynamic: true });
  switchTab('express');
  expressRysujWynik();
  swietuj('Operat policzony', `Wartość: ${money(calc.valueRounded, 0)}. Przejrzyj listę przyjęć niżej.`);
}

/* ===========================================================================
   EXPRESS PISZE CALY OPERAT — model lokalny PER
   ---------------------------------------------------------------------------
   Rzeczoznawca podaje najwazniejsze dane, program liczy wartosc i PISZE
   wszystkie rozdzialy opisowe. Pisze model, ktory chodzi na tym komputerze -
   nic nie wychodzi do sieci.

   Dwie rzeczy, bez ktorych to by bylo nieodpowiedzialne:

   1. Model dostaje WYLACZNIE fakty z operatu i nie ma zadnych narzedzi.
      Liczby pochodza z silnika obliczen, a nie od modelu.
   2. Kazdy napisany rozdzial jest sprawdzany: program wyciaga z tekstu
      wszystkie liczby i daty i porownuje je z faktami. Czego nie ma
      w faktach, trafia na liste do sprawdzenia - bo tak wlasnie model psuje
      dokument: dopisuje wiarygodnie wygladajaca wartosc, ktorej nikt nie podal.

   To jest PROJEKT operatu. Pod operatem podpisuje sie rzeczoznawca i on
   odpowiada za kazde zdanie - program ma mu oszczedzic pisania, nie
   odpowiedzialnosci.
   ======================================================================== */
let pisanieWyniki = [];
let pisanieTrwa = false;
const PISANIE_GRUPA = 'Express pisze operat';

function pisanieZrodlaOperatu(){
  const Z = window.OperoZrodla;
  const uzyte = [...zrodlaSprawdzone].filter(id => id !== 'recznie');
  const opis = Z ? Z.opisZrodel(uzyte) : '';
  return opis ? [opis] : [];
}

async function expressNapiszOperat(){
  { const rozs=$('#exRozszerzony'); if(rozs) rozs.open=true; }
  const P = window.OperoPisanie;
  if (!P || !window.operatAPI?.perNapisz){
    mowi('Ten egzemplarz programu nie ma modułu pisania operatów.', { rodzaj: 'blad', grupa: PISANIE_GRUPA });
    return;
  }
  if (pisanieTrwa) return;
  if (!expressWynik){
    mowi('Najpierw naciśnij „Policz" — bez wyniku obliczeń nie ma czego opisywać, a model nie policzy wartości za program.',
      { rodzaj: 'pytanie', grupa: PISANIE_GRUPA });
    return;
  }

  // Silnik modelu musi chodzic. Mowimy o tym wprost, zamiast dac cichy blad.
  try {
    const st = await window.operatAPI.perSilnikStatus();
    if (st && st.dziala === false){
      mowi('Model lokalny PER nie jest uruchomiony. Włącz go w zakładce Asystent — bez niego program nie napisze rozdziałów, '
        + 'ale wartość i tabele są już policzone.', { rodzaj: 'ostrzezenie', grupa: PISANIE_GRUPA });
      return;
    }
  } catch { /* brak statusu nie przeszkadza - sprobujemy napisac */ }

  pisanieTrwa = true;
  pisanieWyniki = [];
  $('#exNapiszBtn')?.setAttribute('disabled', 'disabled');
  const fakty = P.fakty(project, calc || obliczProjekt(), {
    zrodla: pisanieZrodlaOperatu(),
    metoda: expressWynik?.rodzaj?.metoda || '',
    oferty: project.market?.offerAnalysis
      ? `${project.market.offerAnalysis.ile} ofert, mediana ${project.market.offerAnalysis.mediana} zł/m²` : '',
  });
  mowi(`Piszę operat: ${P.ROZDZIALY.length} rozdziałów opisowych na podstawie ${fakty.length} faktów z Twojego operatu.`,
    { rodzaj: 'etap', grupa: PISANIE_GRUPA, pasek: false });
  pisanieRysuj();

  for (const rozdzial of P.ROZDZIALY){
    mowiEtap(`Piszę rozdział ${rozdzial.kolejnosc} z ${P.ROZDZIALY.length}: ${rozdzial.nazwa}.`, PISANIE_GRUPA);
    pisanieWyniki.push({ id: rozdzial.id, nazwa: rozdzial.nazwa, stan: 'pisze', tekst: '', kontrola: null });
    pisanieRysuj();
    const wpis = pisanieWyniki[pisanieWyniki.length - 1];
    try {
      const polecenie = P.polecenie(rozdzial, fakty, { podrecznikOdnosnik: rozdzial.podrecznik });
      const w = await window.operatAPI.perNapisz({ prompt: polecenie, rozdzial: rozdzial.id });
      const tekst = String(w?.text || '').trim();
      if (!tekst) throw new Error('model nie zwrócił tekstu');
      wpis.tekst = tekst;
      wpis.kontrola = P.sprawdzTekst(tekst, fakty);
      wpis.stan = wpis.kontrola.ok ? 'gotowe' : 'sprawdz';
      wpis.braki = P.braki(rozdzial, fakty);
    } catch (e){
      wpis.stan = 'blad';
      wpis.powod = cleanRemoteError ? cleanRemoteError(e) : String(e?.message || e);
    }
    pisanieRysuj();
  }

  pisanieTrwa = false;
  $('#exNapiszBtn')?.removeAttribute('disabled');
  window.OperoOkno?.zakonczEtapy(oknoStan, PISANIE_GRUPA);
  const pods = P.podsumowanie(pisanieWyniki);
  mowi(pods.komunikat, {
    rodzaj: pods.zeZgloszeniami ? 'ostrzezenie' : (pods.napisane ? 'sukces' : 'blad'),
    grupa: PISANIE_GRUPA,
    szczegoly: pods.zeZgloszeniami
      ? 'Rozdziały z wartościami spoza Twoich danych są zaznaczone na czerwono — przejrzyj je, zanim przyjmiesz tekst.'
      : '',
    dzialanie: { id: 'pokaz-express', napis: 'Pokaż rozdziały' },
  });
  pisanieRysuj();
}

function pisanieRysuj(){
  const root = $('#exNapisane'); if (!root) return;
  const P = window.OperoPisanie;
  if (!pisanieWyniki.length){ root.classList.add('hidden'); root.innerHTML = ''; return; }
  root.classList.remove('hidden');
  const pods = P.podsumowanie(pisanieWyniki);
  root.innerHTML = `
    <div class="pisanie-glowa">
      <div><b>Projekt operatu napisany przez model lokalny</b>
        <p>${escapeHTML(pods.komunikat)}</p></div>
      <div class="button-row">
        <button type="button" class="btn gold-outline" id="pisanieDoOperatu"${pisanieTrwa ? ' disabled' : ''}>Przyjmij do operatu</button>
        <button type="button" class="btn ghost" id="pisanieOdrzuc"${pisanieTrwa ? ' disabled' : ''}>Odrzuć wszystko</button>
      </div>
    </div>
    <p class="pisanie-znacznik">${escapeHTML(P.znacznik())}</p>
    <div class="pisanie-lista">${pisanieWyniki.map((w, i) => `
      <section class="pisanie-rozdzial pisanie-${w.stan}">
        <header>
          <b>${escapeHTML(w.nazwa)}</b>
          <span class="pisanie-stan">${w.stan === 'pisze' ? 'piszę…' : w.stan === 'gotowe' ? '✓ bez obcych wartości'
            : w.stan === 'sprawdz' ? '! sprawdź wartości' : '× nie napisałem'}</span>
        </header>
        ${w.stan === 'blad'
          ? `<p class="pisanie-powod">${escapeHTML(w.powod || 'Model nie odpowiedział.')}</p>`
          : `<textarea class="pisanie-tekst" data-pisanie-i="${i}" rows="7" spellcheck="true">${escapeHTML(w.tekst)}</textarea>`}
        ${w.kontrola && !w.kontrola.ok ? `<p class="pisanie-ostrzezenie">${escapeHTML(w.kontrola.ostrzezenie)}</p>` : ''}
        ${w.kontrola && w.kontrola.doUzupelnienia ? `<p class="pisanie-uzupelnij">Miejsc [DO UZUPEŁNIENIA]: ${w.kontrola.doUzupelnienia} — model nie dostał tych danych i nie zgadywał.</p>` : ''}
      </section>`).join('')}</div>`;

  // Poprawka w polu sprawdza sie od nowa: czlowiek moze usunac wymyslona
  // liczbe i musi od razu widziec, ze zgloszenie znikло.
  root.querySelectorAll('[data-pisanie-i]').forEach(ta => {
    ta.addEventListener('change', () => {
      const i = Number(ta.dataset.pisanieI);
      const fakty = P.fakty(project, calc || obliczProjekt(), { zrodla: pisanieZrodlaOperatu() });
      pisanieWyniki[i].tekst = ta.value;
      pisanieWyniki[i].kontrola = P.sprawdzTekst(ta.value, fakty);
      pisanieWyniki[i].stan = pisanieWyniki[i].kontrola.ok ? 'gotowe' : 'sprawdz';
      pisanieRysuj();
    });
  });
  $('#pisanieDoOperatu')?.addEventListener('click', pisaniePrzyjmij);
  $('#pisanieOdrzuc')?.addEventListener('click', () => {
    if (!confirm('Odrzucić wszystkie napisane rozdziały? Tekstu nie da się odzyskać.')) return;
    pisanieWyniki = [];
    pisanieRysuj();
    mowi('Odrzuciłem napisane rozdziały. Wartość i tabele operatu zostają — pisanie można powtórzyć.',
      { rodzaj: 'info', grupa: PISANIE_GRUPA });
  });
}

/**
 * Przyjecie napisanych rozdzialow do operatu.
 *
 * Rozdzialow ze zgloszeniami NIE przyjmujemy bez pytania. Program nie ma
 * prawa wstawic do dokumentu liczby, ktorej zrodla nie zna - a czlowiek,
 * ktory to podpisuje, ma prawo wiedziec, ze wlasnie to robi.
 */
function pisaniePrzyjmij(){
  const gotowe = pisanieWyniki.filter(w => w.tekst);
  if (!gotowe.length){ mowi('Nie ma czego przyjąć.', { rodzaj: 'info', grupa: PISANIE_GRUPA }); return; }
  const zeZgloszeniami = gotowe.filter(w => w.kontrola && !w.kontrola.ok);
  if (zeZgloszeniami.length){
    const lista = zeZgloszeniami.map(w => `• ${w.nazwa}: ${w.kontrola.obce.slice(0, 4).map(o => o.zapis).join(', ')}`).join('\n');
    if (!confirm(`W ${zeZgloszeniami.length} ${zeZgloszeniami.length === 1 ? 'rozdziale' : 'rozdziałach'} są wartości, których nie podałeś programowi:\n\n`
      + `${lista}\n\nProgram nie zna ich źródła i nie może ich obronić. Przyjąć mimo to?`)) return;
  }
  project.narratives = project.narratives || {};
  for (const w of gotowe) project.narratives[w.id] = w.tekst;
  project.narrativesMeta = {
    napisane: gotowe.map(w => w.id),
    przez: 'PER (model lokalny)',
    kiedy: new Date().toISOString(),
    doSprawdzenia: zeZgloszeniami.map(w => ({ rozdzial: w.id, wartosci: w.kontrola.obce.map(o => o.zapis) })),
  };
  changed({ fullDynamic: true });
  renderAll();
  mowi(`Przyjąłem ${gotowe.length} ${gotowe.length === 1 ? 'rozdział' : 'rozdziałów'} do operatu.`, {
    rodzaj: 'sukces', grupa: PISANIE_GRUPA,
    szczegoly: 'Tekst jest w operacie i wejdzie do PDF-a i do DOCX-a. Przeczytaj go w całości przed podpisem — '
      + 'odpowiada za niego rzeczoznawca, nie program.'
      + (zeZgloszeniami.length ? ` Rozdziały do sprawdzenia: ${zeZgloszeniami.map(w => w.nazwa).join(', ')}.` : ''),
  });
}

/* ===========================================================================
   EXPRESS — TRZY WARIANTY OCEN, TRZY WYNIKI
   ---------------------------------------------------------------------------
   Express nie byl na ogledzinach i nie wie, czy lokal jest wykonczony dobrze,
   czy do remontu. Zamiast przyjac jedna ocene i udawac, ze to wycena, liczy
   trzy razy: wszystkie cechy najnizej, przecietnie i najwyzej.

   Rzeczoznawca dostaje wtedy od razu PRZEDZIAL, w ktorym na pewno znajdzie
   sie wynik przy tych transakcjach i tych wagach - i widzi, jak czula jest
   wycena na oceny. Jezeli widelki sa waskie, ocena cech nie przesadza
   o wartosci; jezeli szerokie, ogledziny sa tu najwazniejsza czescia pracy.

   TO NIE SA TRZY WYCENY. Operat zawiera JEDNA wartosc, z ocenami
   odpowiadajacymi stanowi stwierdzonemu na ogledzinach. Program powtarza to
   przy kazdym wariancie i nie pozwala o tym zapomniec.
   ======================================================================== */
let expressWarianty = [];

/* ---------------------------------------- cechy rynkowe w Expresie */

// Express to operat SKROCONY, a nie operat bez cech. Metoda korygowania ceny
// sredniej POLEGA na cechach i ich wagach - bez nich nie ma czego korygowac
// i kazda liczba na wyjsciu jest pozorna.
//
// Roznica wobec pelnego operatu jest w SZCZEGOLOWOSCI, nie w istocie:
//   Express       - zestaw skrocony (do pieciu cech), wagi z praktyki,
//                   ocena z rozwijanej listy, jedno zdanie uzasadnienia;
//   pelny operat  - ten sam katalog rozwiniety, opis kazdego stopnia oceny,
//                   wagi z analizy par albo korelacji, uzasadnienie wag
//                   wymagane przez podrecznik.
const EX_CECHY_ILE = 5;

function expressRodzajCech(){
  const C = window.OperoCechy;
  if (!C) return 'lokal';
  return C.rodzaj(project.moduleCode || 'local_kcm', { zabudowana: !!project.property?.builtUp });
}

/** Zestaw skrocony wchodzi do operatu sam, gdy rzeczoznawca jeszcze nic nie wybral. */
function expressCechyDomyslne(){
  const C = window.OperoCechy;
  if (!C) return;
  const sa = project.market.features || [];
  // Express sklada projekt od zera, wiec dostaje zestaw ogolny z rownymi
  // wagami po 20% - a to jest wlasnie ta pozorna liczba, ktorej nie wolno
  // zostawic. Podmieniamy go na zestaw z katalogu, dopoki rzeczoznawca niczego
  // w nim nie ruszyl: nie ma ani jednej cechy z katalogu, ani jednego
  // uzasadnienia i wszystkie oceny stoja na domyslnej.
  const nietkniete = !sa.some(f => f.zKatalogu)
    && !sa.some(f => String(f.ratingNote || '').trim())
    && !sa.some(f => f.rating && f.rating !== 'Przeciętna');
  if (sa.length && !nietkniete) return;
  const sugestia = C.sugeruj(expressRodzajCech(), { ile: EX_CECHY_ILE });
  project.market.ratingMode = 'three';
  project.market.features = sugestia.map((c, i) => exCechaZSugestii(c, i, null));
}

/**
 * Jedna cecha z katalogu. Definicje trzech stopni wchodza RAZEM z nazwa,
 * nawet w Expresie: gdy rzeczoznawca przeniesie ten szacunek do pelnego
 * operatu, ma miec gotowe opisy skali, a nie trzy puste pola.
 */
function exCechaZSugestii(c, i, byla){
  const C = window.OperoCechy;
  const skala = C.skala(c.id);
  return {
    id: byla?.id ?? (Date.now() + i),
    name: c.nazwa,
    weight: c.waga / 100,
    scaleMode: 'three',
    rating: byla?.rating || 'Przeciętna',
    ratingNote: byla?.ratingNote || '',
    scaleMin: byla?.scaleMin || skala[0].opis,
    scaleAvg: byla?.scaleAvg || skala[1].opis,
    scaleMax: byla?.scaleMax || skala[2].opis,
    pairs: byla?.pairs || [],
    zKatalogu: c.id,
  };
}

function expressRysujCechy(){
  const C = window.OperoCechy;
  const karta = $('#exCechy');
  if (!karta) return;
  if (!C || !expressWynik){ karta.classList.add('hidden'); return; }
  karta.classList.remove('hidden');

  const rodzaj = expressRodzajCech();
  const katalog = (C.zestaw(rodzaj) || {}).cechy || [];
  const cechy = (project.market.features || []).map(f => ({
    id: f.zKatalogu || f.id, nazwa: f.name || f.id, waga: Math.round((Number(f.weight) || 0) * 1000) / 10,
    ocena: f.rating || 'Przeciętna',
  }));

  $('#exCechyWstep').textContent = cechy.length
    ? 'Zestaw skrócony — tyle, ile trzeba do wstępnego szacunku. W pełnym operacie ten sam katalog jest rozwinięty '
      + 'i wymaga uzasadnienia wag.'
    : 'Program nie ma jeszcze żadnej cechy. Bez cech metoda korygowania ceny średniej nie ma czego korygować.';

  const kontrola = C.sprawdzWagi(cechy);
  const suma = $('#exCechySuma');
  if (suma){
    suma.dataset.waga = kontrola.waga;
    suma.innerHTML = `<b>Suma wag: ${window.OperoSzukanie.liczbaPl(kontrola.suma)}%</b>`
      + `<span>${escapeHTML(kontrola.uwagi[0] || 'Wagi sumują się poprawnie.')}</span>`;
  }

  const lista = $('#exCechyLista');
  if (lista){
    lista.innerHTML = cechy.map((c, i) => {
      const wzor = katalog.find(x => x.id === c.id);
      // `skala` to lista trzech {ocena, opis} - szukamy po nazwie stopnia,
      // bo kolejnosc w katalogu nie musi odpowiadac kolejnosci STOPNI.
      const skala = wzor ? C.skala(wzor.id) : [];
      const opisStopniaPo = (st) => (skala.find(x => x.ocena === st) || {}).opis || '';
      const opcje = C.STOPNIE.map(st => {
        const opis = opisStopniaPo(st);
        return `<option value="${escapeHTML(st)}"${c.ocena === st ? ' selected' : ''} title="${escapeHTML(opis)}">${escapeHTML(st)}</option>`;
      }).join('');
      const widelki = wzor ? `${wzor.wagaOd}–${wzor.wagaDo}%` : '';
      const opisStopnia = opisStopniaPo(c.ocena);
      return `<div class="ex-cecha">
        <div class="ex-cecha-nazwa"><b>${escapeHTML(c.nazwa)}</b>${widelki ? `<i title="Przedział spotykany w praktyce — nie norma">${escapeHTML(widelki)}</i>` : ''}</div>
        <label class="ex-cecha-waga">Waga [%]<input type="text" inputmode="decimal" data-ex-cecha-waga="${i}" value="${window.OperoSzukanie.liczbaPl(c.waga)}"></label>
        <label class="ex-cecha-ocena">Ocena<select data-ex-cecha-ocena="${i}">${opcje}</select></label>
        <p class="ex-cecha-opis">${escapeHTML(opisStopnia)}</p>
        <button class="btn ghost ex-cecha-usun" type="button" data-ex-cecha-usun="${i}" title="Usuń tę cechę">×</button>
      </div>`;
    }).join('') || '<p class="ex-cecha-pusto">Naciśnij „Przyjmij sugerowane", a program wstawi zestaw stosowany na tym rynku.</p>';

    lista.querySelectorAll('[data-ex-cecha-waga]').forEach(pole => {
      pole.addEventListener('change', () => {
        const i = Number(pole.dataset.exCechaWaga);
        const w = Number(String(pole.value).replace(',', '.'));
        if (!project.market.features?.[i]) return;
        project.market.features[i].weight = (Number.isFinite(w) ? Math.max(0, w) : 0) / 100;
        changed({ fullDynamic: true });
        calc = obliczProjekt();
        renderAll();
        expressRysujWynik();
      });
    });
    lista.querySelectorAll('[data-ex-cecha-ocena]').forEach(pole => {
      pole.addEventListener('change', () => {
        const i = Number(pole.dataset.exCechaOcena);
        if (!project.market.features?.[i]) return;
        project.market.features[i].rating = pole.value;
        project.market.ratingMode = 'three';
        changed({ fullDynamic: true });
        calc = obliczProjekt();
        renderAll();
        expressRysujWynik();
      });
    });
    lista.querySelectorAll('[data-ex-cecha-usun]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.exCechaUsun);
        project.market.features = (project.market.features || []).filter((_, j) => j !== i);
        changed({ fullDynamic: true });
        calc = obliczProjekt();
        renderAll();
        expressRysujWynik();
      });
    });
  }

  const stopka = $('#exCechyStopka');
  if (stopka){
    stopka.textContent = cechy.length
      ? C.uzasadnienieWag('expert', { ile: cechy.length }).replace(/\s*\[DO UZUPEŁNIENIA[^\]]*\]/, '')
        + ' W Expresie to przyjęcie wstępne — w pełnym operacie wagi trzeba wyprowadzić z analizy par albo korelacji.'
      : '';
  }
}

function expressCechySugeruj(){
  const C = window.OperoCechy;
  if (!C) return;
  const sugestia = C.sugeruj(expressRodzajCech(), { ile: EX_CECHY_ILE });
  // Ocene i uzasadnienie, ktore czlowiek juz postawil, zostawiamy nietkniete -
  // podpowiedz dotyczy zestawu i wag, a nie jego ustalen.
  const stare = new Map((project.market.features || []).map(f => [f.zKatalogu || f.name, f]));
  project.market.ratingMode = 'three';
  project.market.features = sugestia.map((c, i) => exCechaZSugestii(c, i, stare.get(c.id) || stare.get(c.nazwa)));
  changed({ fullDynamic: true });
  calc = obliczProjekt();
  renderAll();
  expressRysujWynik();
  mowi(`Przyjąłem zestaw ${sugestia.length} cech stosowany przy tym rodzaju wyceny, z wagami z praktyki.`, {
    rodzaj: 'info', grupa: 'Express',
    szczegoly: 'To są przedziały spotykane w praktyce, a nie norma — żaden przepis nie ustala wag, ustala je rzeczoznawca.',
  });
}

function expressCechyWyrownaj(){
  const C = window.OperoCechy;
  if (!C || !(project.market.features || []).length) return;
  const cechy = project.market.features.map(f => ({ id: f.id, nazwa: f.name, waga: (Number(f.weight) || 0) * 100 }));
  const rowne = C.wyrownaj(cechy);
  project.market.features = project.market.features.map((f, i) => ({ ...f, weight: (rowne[i]?.waga || 0) / 100 }));
  changed({ fullDynamic: true });
  calc = obliczProjekt();
  renderAll();
  expressRysujWynik();
}

function expressPoliczWarianty(){
  const C = window.OperoCechy;
  expressWarianty = [];
  if (!C || !expressWynik) return expressWarianty;
  const cechy = project.market?.features || [];
  if (!cechy.length) return expressWarianty;

  for (const s of C.scenariusze(cechy.map(f => ({ id: f.id })))){
    // Liczymy na KOPII projektu - prawdziwe oceny w operacie zostaja nietkniete.
    const kopia = JSON.parse(JSON.stringify(project));
    kopia.market.features = (kopia.market.features || []).map(f => ({ ...f, rating: s.ocena }));
    let wynik = null;
    try { wynik = getCalc().calculate(kopia); } catch { wynik = null; }
    if (!wynik) continue;
    expressWarianty.push({
      id: s.id, nazwa: s.nazwa, znak: s.znak, opis: s.opis, kiedy: s.kiedy, ocena: s.ocena,
      wartosc: Number(wynik.valueRounded) || 0,
      jednostkowa: Number(wynik.unitAfterRound) || 0,
      sumUi: Number(wynik.sumUi) || 0,
    });
  }
  return expressWarianty;
}

function expressRysujWarianty(){
  const C = window.OperoCechy;
  const root = $('#exWarianty');
  if (!root) return;
  if (!C || !expressWarianty.length){ root.classList.add('hidden'); root.innerHTML = ''; return; }
  const biezaca = Number((calc || {}).valueRounded) || 0;
  root.classList.remove('hidden');
  root.innerHTML = `
    <h4 class="express-naglowek">Ile wyjdzie przy różnych ocenach cech</h4>
    <div class="warianty-siatka">${expressWarianty.map(w => `
      <div class="wariant" data-id="${w.id}">
        <span class="wariant-znak">${w.znak}</span>
        <b>${escapeHTML(w.nazwa)}</b>
        <strong>${w.wartosc ? money(w.wartosc, 0) : '—'}</strong>
        <span class="wariant-jedn">${w.jednostkowa ? `${money(w.jednostkowa, 0)}/m²` : ''}</span>
        <p>${escapeHTML(w.opis)}</p>
        <small>${escapeHTML(w.kiedy)}</small>
        <button type="button" class="btn small" data-wariant-przyjmij="${w.id}">Przyjmij te oceny</button>
      </div>`).join('')}</div>
    <p class="warianty-opis">${escapeHTML(C.opisWidelek(expressWarianty))}</p>
    ${biezaca ? `<p class="warianty-biezaca">W operacie stoi teraz <b>${money(biezaca, 0)}</b> —
      oceny przeciętne przyjęte przez program. Po oględzinach popraw oceny cech w rubryce
      „Cechy rynkowe”; wartość przeliczy się sama.</p>` : ''}`;

  root.querySelectorAll('[data-wariant-przyjmij]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.wariantPrzyjmij;
    const w = expressWarianty.find(x => x.id === id);
    if (!w) return;
    if (!confirm(`Przyjąć do operatu oceny „${w.ocena.toLowerCase()}" dla WSZYSTKICH cech?\n\n`
      + 'To jest wariant skrajny, a nie ocena z oględzin. W operacie oceny muszą odpowiadać '
      + 'stanowi nieruchomości, który stwierdziłeś na miejscu.')) return;
    (project.market.features || []).forEach(f => { f.rating = w.ocena; });
    changed({ fullDynamic: true });
    calc = obliczProjekt();
    renderAll();
    expressRysujWynik();
    mowi(`Przyjąłem oceny „${w.ocena.toLowerCase()}" dla wszystkich cech. Wartość: ${money(w.wartosc, 0)}.`, {
      rodzaj: 'ostrzezenie', grupa: 'Express',
      szczegoly: 'To wariant skrajny, nie ocena z oględzin. Przed podpisem popraw oceny cech '
        + 'tak, żeby odpowiadały stanowi nieruchomości — inaczej operat opisuje nieruchomość, której nie ma.',
    });
  }));
}

function expressRysujWynik(){
  const karta = $('#exWynikKarta'); if (!karta) return;
  if (!expressWynik){ karta.classList.add('hidden'); return; }
  karta.classList.remove('hidden');

  const c = calc || obliczProjekt();
  $('#exWartosc').textContent = Number(c.valueRounded) > 0 ? money(c.valueRounded, 0) : '—';
  $('#exJednostkowa').textContent = Number(c.unitAfterRound) > 0 ? `${money(c.unitAfterRound, 2)}/m²` : '';
  $('#exCavg').textContent = Number(c.cavg) > 0 ? `${money(c.cavg, 2)}/m²` : '—';
  $('#exIleTx').textContent = String((project.market.transactions || []).length);
  $('#exTrend').textContent = c.trendMode === 'none' ? 'bez trendu czasowego'
    : `trend ${fmt(c.trendApplied, 3)} %/mies.`;

  expressCechyDomyslne();
  expressRysujCechy();
  expressPoliczWarianty();
  expressRysujWarianty();

  $('#exZalozenia').innerHTML = expressWynik.zalozenia.map(z => `
    <div class="express-zal" data-waga="${escapeHTML(z.waga)}">
      <span class="express-zal-znak">${z.waga === 'sprawdz' ? '!' : 'i'}</span>
      <div><b>${escapeHTML(z.co)}</b><i>${escapeHTML(z.wartosc)}</i><p>${escapeHTML(z.dlaczego)}</p></div>
    </div>`).join('');

  const dn = $('#exDoNapisania');
  if (dn){
    dn.innerHTML = expressWynik.doNapisania.length
      ? `<b>Do napisania przez Ciebie:</b> ${expressWynik.doNapisania.map(x => escapeHTML(x.co)).join(' · ')}
         <p class="hint">Charakterystyki rynku i uzasadnienia wag program nie napisze. Wygenerowany tekst wyglądałby jak gotowy — i właśnie dlatego byłby groźny.</p>`
      : '';
  }
  expressRysujBlokade();
  dokRysuj();
  expressRysujWywiad();
  expressRysujZrodla();
  $('#exSzataKarta')?.classList.remove('hidden');
  szataRysujPola();
  szataRysuj();
}

function expressRysujBlokade(){
  const el = $('#exBlokada'); if (!el || !expressWynik) return;
  const p = window.OperoExpress.podsumowanie(expressWynik, !!$('#exPotwierdzam')?.checked);
  // Do blokady Expressu dokladamy to, czego wymaga sam operat: zalaczniki i
  // odpowiedzi na pytania. Dokument bez odpisu ksiegi i bez zdjec z ogledzin
  // nie jest operatem, choeby liczby w nim byly policzone bez zarzutu.
  const P = window.OperoPodrecznik;
  const typ = expressTyp || moduleCode();
  const braki = [];
  if (P){
    const st = P.stan(project, calc, typ, dokStan());
    if (st.brakDokumentow.length) braki.push(`brakuje dokumentów: ${st.brakDokumentow.map(d => d.nazwa.toLowerCase()).join(', ')}`);
    if (st.pytania.length) braki.push(`bez odpowiedzi zostało ${st.pytania.length} ${st.pytania.length === 1 ? 'pytanie' : 'pytań'} niżej`);
  }
  const wolno = p.wolnoPdf && !braki.length;
  el.dataset.stan = wolno ? 'ok' : 'blokada';
  el.textContent = wolno
    ? 'Operat jest kompletny. Możesz generować dokument — odpowiadasz za przyjęte wartości.'
    : `Dokument zablokowany. ${[p.powodBlokady, ...braki].filter(Boolean).join(' · ')}`;
}

/* ============================================================
   TRZY SZATY DOKUMENTU — wybor ukladu PDF

   Jeden kod obsluguje oba miejsca: Express (gdzie uklad wybiera sie na koncu,
   tuz przed zapisem) i edytor koncowy operatu recznego (gdzie kafelki ustawiaja
   wszystkie pola ponizej naraz). Styl to komplet wartosci w project.appearance,
   wiec PDF powstaje ta sama droga co zawsze - nie ma drugiego generatora,
   ktory moglby pokazywac co innego niz wychodzi z drukarki.
   ============================================================ */
const SZATA_GNIAZDA = [['#exSzataKafelki', '#exSzataNazwa'], ['#szataKafelki', '#szataNazwa']];
let szataPolaGotowe = false;

function szataRysuj(){
  const S = window.OperoSzata; if (!S) return;
  const wybrany = S.rozpoznaj(project);
  const bazowy = project.appearance?.stylPdf || '';
  const kafelki = S.STYLE.map(st => {
    const akt = wybrany === st.id;
    const dostrojony = !wybrany && bazowy === st.id;
    return `<div class="szata-kafelek${akt ? ' wybrany' : ''}${dostrojony ? ' dostrojony' : ''}">
      <button type="button" class="szata-kafelek-wybor" data-styl="${st.id}" aria-pressed="${akt ? 'true' : 'false'}">
        <span class="szata-mini">${S.miniatura(akt || dostrojony ? project.appearance : st)}</span>
        <span class="szata-kafelek-tekst"><b>${escapeHTML(st.nazwa)}</b><small>${escapeHTML(st.dla)}</small><i>${escapeHTML(st.opis)}</i></span>
      </button>
      <div class="szata-kafelek-stopka">
        <span class="szata-znacznik">${akt ? '✓ wybrany' : dostrojony ? '✓ wybrany (dostrojony)' : ''}</span>
        <button type="button" class="btn small" data-styl-pdf="${st.id}">PDF w tym układzie</button>
      </div>
    </div>`;
  }).join('');
  for (const [gniazdo, poleNazwy] of SZATA_GNIAZDA){
    const el = $(gniazdo); if (el) el.innerHTML = kafelki;
    const nz = $(poleNazwy); if (nz) nz.textContent = S.nazwaBiezacego(project);
  }
}

/** Pola dostrojenia w Express. Te same sciezki co w edytorze koncowym, wiec
 *  wiaze je zwykly bindStaticFields - jedna droga zapisu, zero kopii. */
function szataRysujPola(){
  const root = $('#exSzataPola'); const S = window.OperoSzata;
  if (!root || !S || szataPolaGotowe) return;
  root.innerHTML = S.POLA.map(p => {
    if (p.typ === 'haczyk') return `<label class="check"><input type="checkbox" data-path="${p.sciezka}"> ${escapeHTML(p.nazwa)}</label>`;
    if (p.typ === 'kolor') return `<label>${escapeHTML(p.nazwa)}<input type="color" data-path="${p.sciezka}"></label>`;
    if (p.typ === 'liczba') return `<label>${escapeHTML(p.nazwa)}<input type="number" min="${p.min}" max="${p.max}" step="${p.krok}" data-path="${p.sciezka}"></label>`;
    return `<label>${escapeHTML(p.nazwa)}<select data-path="${p.sciezka}">${p.opcje.map(o => `<option value="${escapeHTML(o.wartosc)}">${escapeHTML(o.etykieta)}</option>`).join('')}</select></label>`;
  }).join('');
  szataPolaGotowe = true;
  bindStaticFields();
  applyHelpTooltips();
}

function szataWybierz(id){
  const S = window.OperoSzata; if (!S) return;
  try { S.zastosuj(project, id); } catch (e) { showStatus(String(e.message || e), 'error', 6000); return; }
  bindStaticFields();
  changed();
  renderThemePreview();
  szataRysuj();
  ukladyRysuj();
  if ($('#tab-result')?.classList.contains('active')) scheduleReportPreview();
  showStatus(`Układ dokumentu: ${S.styl(id).nazwa}. Możesz go jeszcze dostroić przed zapisem.`, 'info', 5000);
}

/** Czy Express pozwala juz zapisac PDF. Blokada jest ta sama, ktora widac nad
 *  przyciskiem - nie omijamy jej dlatego, ze PDF idzie z innego miejsca. */
function szataExpressWolno(){
  if (!expressWynik || !window.OperoExpress) return true;
  expressRysujBlokade();
  const el = $('#exBlokada');
  if (el && el.dataset.stan === 'blokada'){
    showStatus(el.textContent, 'error', 10000);
    el.scrollIntoView({ behavior: uiPrefs.motion === 'full' ? 'smooth' : 'auto', block: 'center' });
    return false;
  }
  return true;
}

async function szataZapiszPdf(id, zExpressu){
  if (zExpressu && !szataExpressWolno()) return;
  if (id) szataWybierz(id);
  await exportPDF();
}

/* ============================================================
   WZORCE — wlasne uklady dokumentu i wlasne szablony operatu
   Logika i filtr danych: wzorce.js. Zapis: plik stanu programu na tym
   komputerze (ten sam co profil rzeczoznawcy).
   ============================================================ */
let wzorceStan = { uklady: [], szablony: [], domyslnyUklad: '' };

async function wzorceWczytaj(){
  try { const st = await window.operatAPI.wzorceOdczytaj?.(); if (st) wzorceStan = st; } catch (e) { console.warn('Wzorce:', e); }
  ukladyRysuj(); szablonyRysuj();
}
async function wzorceZapisz(nowy){
  try {
    const st = await window.operatAPI.wzorceZapisz(nowy);
    wzorceStan = st || window.OperoWzorce.stanCzysty(nowy);
    ukladyRysuj(); szablonyRysuj();
    return true;
  } catch (e) { showStatus(`Nie udało się zapisać: ${cleanRemoteError(e)}`, 'error', 8000); return false; }
}
function ukladPowiedz(tekst, rodzaj = 'info'){
  const el = $('#ukladyStan'); if (el){ el.textContent = tekst; el.dataset.rodzaj = rodzaj; }
}

/** Uklad, od ktorego zaczyna nowy operat: wzorzec albo wlasny. */
function ukladDomyslnyWstaw(p){
  const id = wzorceStan.domyslnyUklad; if (!id || !p) return;
  try {
    const wlasny = wzorceStan.uklady.find(u => u.id === id);
    if (wlasny) window.OperoWzorce.ukladZastosuj(p, wlasny);
    else if (window.OperoSzata?.styl(id)) window.OperoSzata.zastosuj(p, id);
  } catch (e) { console.warn('Układ domyślny:', e); }
}

function ukladyRysuj(){
  const lista = $('#ukladyLista'), S = window.OperoSzata, W = window.OperoWzorce;
  if (!lista || !S || !W) return;
  const wybrany = W.ukladRozpoznaj(project, wzorceStan.uklady);
  const wzorzec = S.rozpoznaj(project);
  lista.innerHTML = wzorceStan.uklady.length ? wzorceStan.uklady.map(u => {
    const akt = wybrany === u.id;
    return `<div class="uklad-kafelek${akt ? ' wybrany' : ''}" data-uklad="${escapeHTML(u.id)}">
      <button type="button" class="uklad-wybor" data-uklad-uzyj="${escapeHTML(u.id)}" aria-pressed="${akt ? 'true' : 'false'}" title="Ustaw ten układ w bieżącym operacie">
        <span class="szata-mini">${S.miniatura(u)}</span>
        <span class="uklad-nazwa"><b>${escapeHTML(u.nazwa)}</b><small>${akt ? '✓ wybrany' : 'kliknij, żeby użyć'}${wzorceStan.domyslnyUklad === u.id ? ' · domyślny' : ''}</small></span>
      </button>
      <button type="button" class="uklad-usun" data-uklad-usun="${escapeHTML(u.id)}" aria-label="Usuń układ ${escapeHTML(u.nazwa)}" title="Usuń ten układ">✕</button>
    </div>`;
  }).join('') : '<p class="uklady-pusto">Nie masz jeszcze własnych układów.</p>';

  const opis = $('#ukladyDomyslnyOpis');
  if (opis){
    const opcje = [['', 'układ programu (Urzędowy klasyczny)'], ...S.STYLE.map(st => [st.id, st.nazwa]), ...wzorceStan.uklady.map(u => [u.id, `${u.nazwa} (mój)`])]
      .filter((o, i) => !(i > 0 && o[0] === 'urzedowy'));
    opis.innerHTML = `<label class="uklad-domyslny">Nowe operaty zaczynają od: <select id="ukladDomyslny">${opcje.map(([id, n]) =>
      `<option value="${escapeHTML(id)}"${(wzorceStan.domyslnyUklad || '') === id ? ' selected' : ''}>${escapeHTML(n)}</option>`).join('')}</select></label>`;
  }
  // „Cofnij moje zmiany" ma sens tylko wtedy, gdy uklad zostal dostrojony.
  const cofnij = $('#ukladPrzywroc');
  if (cofnij){
    const baza = project.appearance?.stylPdf || '';
    const jestBaza = !!(S.styl(baza) || wzorceStan.uklady.find(u => u.id === baza));
    cofnij.disabled = !!(wybrany || wzorzec) || !jestBaza;
    cofnij.title = cofnij.disabled ? 'Układ nie był zmieniany' : 'Wraca do układu, od którego zacząłeś';
  }
}

async function ukladZapiszBiezacy(){
  const W = window.OperoWzorce, pole = $('#ukladNazwa'); if (!W) return;
  let wynik;
  try { wynik = W.ukladDodaj(wzorceStan.uklady, W.ukladZProjektu(project, pole?.value)); }
  catch (e) { ukladPowiedz(String(e.message || e), 'blad'); pole?.focus(); return; }
  if (!(await wzorceZapisz({ ...wzorceStan, uklady: wynik.lista }))) return;
  project.appearance.stylPdf = wynik.uklad.id; changed();
  if (pole) pole.value = '';
  ukladyRysuj(); szataRysuj();
  ukladPowiedz(wynik.nadpisano ? `Układ „${wynik.uklad.nazwa}" został zaktualizowany.` : `Układ „${wynik.uklad.nazwa}" zapisany. Znajdziesz go tu przy każdym operacie.`, 'sukces');
}

function ukladUzyj(id){
  const u = wzorceStan.uklady.find(x => x.id === id); if (!u) return;
  try { window.OperoWzorce.ukladZastosuj(project, u); } catch (e) { ukladPowiedz(String(e.message || e), 'blad'); return; }
  bindStaticFields(); changed(); renderThemePreview(); szataRysuj(); ukladyRysuj();
  if ($('#tab-result')?.classList.contains('active')) scheduleReportPreview();
  ukladPowiedz(`Ustawiono układ „${u.nazwa}".`, 'sukces');
}

async function ukladUsun(id){
  const u = wzorceStan.uklady.find(x => x.id === id); if (!u) return;
  if (!confirm(`Usunąć układ „${u.nazwa}"?\n\nOperaty, które już go używają, zachowają swój wygląd.`)) return;
  const nowy = { ...wzorceStan, uklady: window.OperoWzorce.ukladUsun(wzorceStan.uklady, id) };
  if (nowy.domyslnyUklad === id) nowy.domyslnyUklad = '';
  if (await wzorceZapisz(nowy)) ukladPowiedz(`Układ „${u.nazwa}" usunięty.`, 'info');
}

/** Wraca do ukladu bazowego (wzorca albo wlasnego), kasujac dostrojenie. */
function ukladCofnijZmiany(){
  const baza = project.appearance?.stylPdf || '';
  const wlasny = wzorceStan.uklady.find(u => u.id === baza);
  if (wlasny) { ukladUzyj(wlasny.id); return; }
  if (window.OperoSzata?.styl(baza)) { szataWybierz(baza); ukladyRysuj(); }
}

/* ---- szablony operatu ---- */
function szablonyRysuj(){
  const blok = $('#szablonyBlok'), lista = $('#szablonyLista'); if (!blok || !lista) return;
  if (moduleSelectorTryb === 'zmiana'){ blok.classList.add('hidden'); return; }
  blok.classList.remove('hidden');
  const obecny = OPERAT_MODULES[moduleCode()];
  const kafle = wzorceStan.szablony.map(sz => {
    const m = OPERAT_MODULES[sz.modul];
    return `<div class="szablon-kafelek">
      <button type="button" class="szablon-wybor" data-szablon-uzyj="${escapeHTML(sz.id)}" ${m && m.status === 'live' ? '' : 'disabled'}>
        <b>${escapeHTML(sz.nazwa)}</b><small>${escapeHTML(m ? m.title : sz.modul)} · ${sz.dane.market.features.length} cech · ${sz.dane.legalBases.length} podstaw prawnych</small>
      </button>
      <button type="button" class="uklad-usun" data-szablon-usun="${escapeHTML(sz.id)}" aria-label="Usuń szablon ${escapeHTML(sz.nazwa)}" title="Usuń ten szablon">✕</button>
    </div>`;
  }).join('');
  lista.innerHTML = (kafle || '<p class="uklady-pusto">Nie masz jeszcze szablonów. Ustaw w operacie swoje stałe elementy i zapisz go jako szablon.</p>')
    + `<div class="szablon-zapis">
        <input id="szablonNazwa" type="text" maxlength="60" placeholder="Nazwa szablonu, np. „Lokal dla banku”" aria-label="Nazwa szablonu" autocomplete="off">
        <button id="szablonZapisz" type="button" class="btn gold-outline">Zapisz bieżący operat jako szablon</button>
      </div>
      <p class="hint" id="szablonyStan">Bieżący operat: ${escapeHTML(obecny?.title || '')}. Szablon nie zapisuje adresu, klienta, księgi, transakcji, zdjęć ani dat.</p>`;
}
function szablonPowiedz(tekst, rodzaj = 'info'){
  const el = $('#szablonyStan'); if (el){ el.textContent = tekst; el.dataset.rodzaj = rodzaj; }
}
async function szablonZapiszBiezacy(){
  const W = window.OperoWzorce, pole = $('#szablonNazwa'); if (!W) return;
  let wynik;
  try { wynik = W.szablonDodaj(wzorceStan.szablony, W.szablonZProjektu(project, pole?.value)); }
  catch (e) { szablonPowiedz(String(e.message || e), 'blad'); pole?.focus(); return; }
  if (!(await wzorceZapisz({ ...wzorceStan, szablony: wynik.lista }))) return;
  szablonPowiedz(wynik.nadpisano ? `Szablon „${wynik.szablon.nazwa}" został zaktualizowany.` : `Szablon „${wynik.szablon.nazwa}" zapisany.`, 'sukces');
}
async function szablonUsun(id){
  const sz = wzorceStan.szablony.find(x => x.id === id); if (!sz) return;
  if (!confirm(`Usunąć szablon „${sz.nazwa}"?\n\nOperaty utworzone z tego szablonu zostają bez zmian.`)) return;
  if (await wzorceZapisz({ ...wzorceStan, szablony: window.OperoWzorce.szablonUsun(wzorceStan.szablony, id) })) szablonPowiedz(`Szablon „${sz.nazwa}" usunięty.`, 'info');
}

function hookWzorce(){
  document.addEventListener('click', ev => {
    const uzyj = ev.target.closest('[data-uklad-uzyj]'); if (uzyj){ ukladUzyj(uzyj.dataset.ukladUzyj); return; }
    const usun = ev.target.closest('[data-uklad-usun]'); if (usun){ ukladUsun(usun.dataset.ukladUsun); return; }
    const su = ev.target.closest('[data-szablon-uzyj]');
    if (su){ const sz = wzorceStan.szablony.find(x => x.id === su.dataset.szablonUzyj); if (sz) createProjectFromModule(sz.modul, sz); return; }
    const sx = ev.target.closest('[data-szablon-usun]'); if (sx){ szablonUsun(sx.dataset.szablonUsun); return; }
    if (ev.target.closest('#ukladZapisz')){ ukladZapiszBiezacy(); return; }
    if (ev.target.closest('#ukladPrzywroc')){ ukladCofnijZmiany(); return; }
    if (ev.target.closest('#szablonZapisz')){ szablonZapiszBiezacy(); return; }
  });
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter') return;
    if (ev.target?.id === 'ukladNazwa'){ ev.preventDefault(); ukladZapiszBiezacy(); }
    if (ev.target?.id === 'szablonNazwa'){ ev.preventDefault(); szablonZapiszBiezacy(); }
  });
  document.addEventListener('change', ev => {
    if (ev.target?.id === 'ukladDomyslny'){
      const id = ev.target.value;
      wzorceZapisz({ ...wzorceStan, domyslnyUklad: id }).then(ok => {
        if (ok) ukladPowiedz(id ? 'Nowe operaty będą zaczynać od wybranego układu.' : 'Nowe operaty zaczynają od układu programu.', 'sukces');
      });
      return;
    }
    if (ev.target?.dataset?.path?.startsWith('appearance.')) setTimeout(ukladyRysuj, 0);
  });
  wzorceWczytaj();
}

function hookSzata(){
  document.addEventListener('click', ev => {
    const wybor = ev.target.closest('[data-styl]');
    if (wybor){ szataWybierz(wybor.dataset.styl); return; }
    const pdf = ev.target.closest('[data-styl-pdf]');
    if (pdf){ szataZapiszPdf(pdf.dataset.stylPdf, !!pdf.closest('#tab-express')); }
  });
  // Kazda zmiana wygladu moze zmienic to, ktory kafelek jest "wybrany" -
  // i miniature ukladu wlasnego. Przerysowujemy po zmianie, nie przy kazdym
  // uderzeniu w klawisz.
  document.addEventListener('change', ev => {
    if (ev.target?.dataset?.path?.startsWith('appearance.')) setTimeout(szataRysuj, 0);
  });
  // Podgladu NIE blokujemy. Blokada ma powstrzymac wyslanie operatu, ktorego
  // nikt nie przejrzal - a nie powstrzymac rzeczoznawce przed obejrzeniem
  // wlasnego dokumentu. Zablokowany podglad zmuszalby go do klikania „biore
  // to na siebie” tylko po to, zeby zobaczyc, co bierze.
  $('#exSzataPodglad')?.addEventListener('click', () => openFullReportPreview());
  $('#exSzataPdf')?.addEventListener('click', () => szataZapiszPdf(null, true));
  $('#exSzataDocx')?.addEventListener('click', () => { if (szataExpressWolno()) eksportDocx(); });
  szataRysujPola();
  szataRysuj();
}

/* ============================================================
   DOKUMENTY, PYTANIA I CZERWONE FLAGI

   Program nie pisze operatu za rzeczoznawce - ale wie, czego operat wymaga,
   i dopytuje tak dlugo, az wszystko to jest w dokumencie albo swiadomie
   oznaczone jako „nie dotyczy". Nigdy nie odhacza pozycji za czlowieka:
   moze stwierdzic, ze czegos NIE MA, nie moze stwierdzic, ze cos jest dobrze.
   ============================================================ */

/** Ile materialow kazdego rodzaju jest juz w operacie. */
function dokStan(){
  const out = {};
  const policz = (id, ile) => { out[id] = (out[id] || 0) + ile; };
  // Zdjecie TEZ jest dokumentem: skan wypisu albo fotografia wydruku z EKW
  // zamyka pozycje tak samo jak plik PDF. Do dokumentacji fotograficznej
  // z ogledzin liczymy tylko te zdjecia, ktore nie sa skanem dokumentu.
  for (const ph of (project.photos || [])){
    const rodzaj = String(ph.rodzajDokumentu || '').trim();
    policz(rodzaj && rodzaj !== 'zdjecia' ? rodzaj : 'zdjecia', 1);
  }
  for (const f of (project.files || [])){
    const rodzaj = String(f.rodzajDokumentu || '').trim();
    if (rodzaj) policz(rodzaj, 1);
  }
  if (window.OperoPodrecznik?.wypelnione(project.legal?.kwLocal)) policz('kw', 1);
  if (window.OperoPodrecznik?.wypelnione(project.egib?.plotNo)) policz('egib', 1);
  if (window.OperoPodrecznik?.wypelnione(project.planning?.description)) policz('mpzp', 1);
  if (window.OperoPodrecznik?.wypelnione(project.formalBasis)) policz('podstawa', 1);
  if ((project.income?.leases || []).length) policz('umowy', 1);
  return out;
}

function dokRysuj(){
  const root = $('#exDokumenty'); const P = window.OperoPodrecznik;
  if (!root || !P || !expressTyp) return;
  const stan = dokStan();
  const lista = P.dokumentyDla(expressTyp);
  root.innerHTML = lista.map(d => {
    const ile = stan[d.id] || 0;
    const potrzeba = d.minimum || 1;
    const ok = ile >= potrzeba;
    return `<div class="dok${ok ? ' dok-ok' : ''}">
      <div class="dok-glowa"><b>${escapeHTML(d.nazwa)}</b><span class="dok-znacznik">${ok ? `✓ ${ile}` : 'brak'}</span></div>
      <p>${escapeHTML(d.opis)}</p>
      ${d.zastepuje && !ok ? `<p class="dok-zastepnik">Nie masz dokumentu? ${escapeHTML(d.zastepuje)} — to wystarczy, żeby w aktach było źródło.</p>` : ''}
      <div class="button-row">
        <button type="button" class="btn small" data-dok-zdjecie="${d.id}">Wgraj zdjęcie / skan</button>
        <button type="button" class="btn small ghost" data-dok-plik="${d.id}">Wgraj plik</button>
      </div>
    </div>`;
  }).join('');
  root.querySelectorAll('[data-dok-zdjecie]').forEach(b => b.addEventListener('click', () => dokWgrajZdjecie(b.dataset.dokZdjecie)));
  root.querySelectorAll('[data-dok-plik]').forEach(b => b.addEventListener('click', () => dokWgrajPlik(b.dataset.dokPlik)));
  const brak = lista.filter(d => (stan[d.id] || 0) < (d.minimum || 1)).length;
  const el = $('#exDokStan');
  if (el) el.innerHTML = brak ? `Brakuje: <b>${brak}</b>` : '<b>Komplet</b>';
}

async function dokWgrajZdjecie(rodzaj){
  const nazwa = window.OperoPodrecznik.DOKUMENTY.find(d => d.id === rodzaj)?.nazwa || rodzaj;
  try {
    const picked = await window.operatAPI.pickPhotos();
    const zdjecia = (picked || []).filter(x => x && !x.error && x.dataUrl);
    zdjecia.forEach((ph, i) => project.photos.push({ ...ph,
      category: rodzaj === 'zdjecia' ? (isPairModule() ? 'Budynek' : 'Lokal') : nazwa,
      caption: rodzaj === 'zdjecia' ? ph.name : `${nazwa} — ${ph.name}`,
      rodzajDokumentu: rodzaj,
      cover: project.photos.length === 0 && i === 0 && rodzaj === 'zdjecia' }));
    if (zdjecia.length){
      changed({ fullDynamic: true }); renderPhotos(); dokRysuj(); expressRysujWywiad();
      showStatus(`Dodano ${zdjecia.length} ${zdjecia.length === 1 ? 'obraz' : 'obrazy'} do pozycji „${nazwa}".`, 'info', 6000);
    }
    const bledy = (picked || []).filter(x => x && x.error);
    if (bledy.length) showStatus(bledy.map(x => x.error).join(' '), 'error', 9000);
  } catch (e){ showStatus(cleanRemoteError(e), 'error', 8000); }
}

async function dokWgrajPlik(rodzaj){
  const nazwa = window.OperoPodrecznik.DOKUMENTY.find(d => d.id === rodzaj)?.nazwa || rodzaj;
  try {
    const pliki = await window.operatAPI.pickFiles();
    const dobre = (pliki || []).filter(x => x && !x.error);
    dobre.forEach(f => project.files.push({ ...f, rodzajDokumentu: rodzaj, description: nazwa, includeInPDF: true }));
    if (dobre.length){
      changed({ fullDynamic: true }); renderFiles(); dokRysuj(); expressRysujWywiad();
      showStatus(`Dodano ${dobre.length} ${dobre.length === 1 ? 'plik' : 'pliki'} do pozycji „${nazwa}".`, 'info', 6000);
    }
    const bledy = (pliki || []).filter(x => x && x.error);
    if (bledy.length) showStatus(bledy.map(x => x.error).join(' '), 'error', 8000);
  } catch (e){ showStatus(cleanRemoteError(e), 'error', 8000); }
}

/** Pytania, ktore program zadaje zamiast komunikatu „uzupelnij dane". */
function expressRysujWywiad(){
  const P = window.OperoPodrecznik; if (!P) return;
  const typ = expressTyp || moduleCode();
  const root = $('#exWywiad');
  if (root){
    const pytania = P.pytaniaBezOdpowiedzi(project, typ);
    root.innerHTML = pytania.length
      ? `<h4 class="express-naglowek">Czego program jeszcze potrzebuje</h4>
         <p class="hint">Bez tych odpowiedzi operat nie jest kompletny. Odpowiedź wpisuje się wprost do operatu — możesz ją potem poprawić w kreatorze.</p>
         ${pytania.map(q => `<div class="wywiad-pytanie">
            <label><span>${escapeHTML(q.pytanie)}</span>
              <textarea rows="2" data-pytanie="${escapeHTML(q.id)}" data-sciezka="${escapeHTML(q.sciezka)}" placeholder="Odpowiedz własnymi słowami"></textarea></label>
            <p class="wywiad-dlaczego">${escapeHTML(q.dlaczego)}</p>
          </div>`).join('')}`
      : '<div class="wywiad-ok">Program nie ma już pytań — wszystkie wymagane informacje są w operacie.</div>';
    root.querySelectorAll('[data-pytanie]').forEach(t => t.addEventListener('change', () => {
      const tresc = t.value.trim(); if (!tresc) return;
      project.odpowiedzi = project.odpowiedzi || {};
      project.odpowiedzi[t.dataset.pytanie] = tresc;
      const sciezka = t.dataset.sciezka;
      if (sciezka && !P.wypelnione(P.wartoscZeSciezki(project, sciezka))) setPath(project, sciezka, tresc);
      changed({ fullDynamic: true });
      bindStaticFields();
      showStatus('Odpowiedź zapisana w operacie.', 'info', 4000);
      expressRysujWywiad();
      expressRysujBlokade();
    }));
  }

  const flagiEl = $('#exFlagi');
  if (flagiEl){
    const flagi = P.czerwoneFlagi(project, calc, typ);
    flagiEl.innerHTML = flagi.length
      ? `<h4 class="express-naglowek">Co zobaczy weryfikator</h4>
         ${flagi.map(f => `<div class="flaga"><b>${escapeHTML(f.co)}</b><p>${escapeHTML(f.dlaczego)}</p></div>`).join('')}
         <p class="hint">To nie są błędy rachunkowe — program ich nie poprawia. Wyjaśnij je w operacie albo zmień założenia i przelicz.</p>`
      : '';
  }
}

/** Eksport operatu do Worda - ta sama tresc, ktora idzie do PDF. */
async function eksportDocx(){
  try {
    const issues = allCriticalIssues();
    if (issues.length){
      renderFinalIssues();
      showStatus(`Word zablokowany tak samo jak PDF: brakuje ${issues.length} danych krytycznych.`, 'error', 8500);
      return;
    }
    calc = obliczProjekt();
    try { await ensureMapsQR(false); } catch {}
    const html = zbudujRaport();
    if (!html || html.length < 500) throw new Error('Generator raportu zwrócił pustą treść.');
    const p = project.property || {};
    const nazwa = `Operat_${p.city || 'lokal'}_${(p.street || '').replace(/\s+/g, '_')}_${p.buildingNo || ''}_${p.localNo || ''}.docx`
      .replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_.-]/g, '_');
    showStatus('Składanie dokumentu Word…', 'info', 0);
    const r = await window.operatAPI.exportDOCX({ html, defaultName: nazwa,
      tytul: `Operat szacunkowy — ${[p.city, p.street, p.buildingNo].filter(Boolean).join(' ')}`,
      autor: project.author?.name || '' });
    if (!r.canceled){
      showStatus(`Zapisano do Worda: ${r.filePath} (${r.akapitow} akapitów, ${r.obrazow} ${r.obrazow === 1 ? 'obraz' : 'obrazów'}). Treść jest ta sama co w PDF.`, 'info', 10000);
    } else $('#statusBar').classList.add('hidden');
  } catch (e){ showStatus(`Eksport do Worda: ${cleanRemoteError(e)}`, 'error', 10000); }
}

/* ============================================================
   SZUKANIE TRANSAKCJI: RCN Z GEOPORTALU I KOLEJNE ZRODLA

   Rzeczoznawca nie zawsze ma wyciag ze starostwa. Program szuka wtedy sam,
   ale PO KOLEI i mowiac, czym jest to, co znalazl:

     transakcje (do zbioru porownawczego):  RCN z Geoportalu, wlasna baza,
                                            wyciag ze starostwa,
     oferty (tylko do analizy rynku):       deweloperuch, dane.gov.pl, NBP.

   Ofert do zbioru porownawczego program nie wpusci - i powie dlaczego.
   ============================================================ */
let zrodlaSprawdzone = new Set();
let bazaMiejscowosci = [];   // z podsumowania wlasnej bazy, do podpowiedzi
let rcnOstatniePobranie = null;

/** Punkt, wokol ktorego szukamy. Bez niego nie ma czego pytac. */
async function rcnPunktWyceny(){
  const p = project.property || {};
  // Pole adresu jest JEDNO i czlowiek moze w nie wpisac cala linijke
  // („Kartuska 201, 80-125 Gdansk"), wiec rozbijamy je tak samo, jak przy
  // szukaniu w rejestrze adresow - inaczej do geokodera poszedlby adres
  // z numerem wklejonym w nazwe ulicy.
  const A = window.OperoAdres;
  const wpisane = ($('#ex_ulica')?.value || '').trim();
  const rozbite = A ? A.rozbij(wpisane) : { ulica: wpisane, numer: '', miasto: '' };
  const miasto = (p.city || $('#ex_miasto')?.value || rozbite.miasto || '').trim();
  const ulica = (p.street || rozbite.ulica || '').trim();
  const numer = (p.buildingNo || $('#ex_numer')?.value || rozbite.numer || '').trim();
  if (!miasto) return { ok: false, powod: 'Podaj przynajmniej miejscowość — bez niej nie wiem, gdzie szukać.' };
  try {
    const r = await window.operatAPI.dzialkaPoAdresie({ miasto, ulica, numer });
    const punkt = r?.punkt || (r?.punkty || [])[0];
    if (!punkt) return { ok: false, powod: r?.powod || 'Geokoder nie zna tego adresu — sprawdź pisownię ulicy.' };
    // Zapamietujemy punkt dla doboru nieruchomosci podobnych: od tej chwili
    // program mierzy odleglosc w metrach, zamiast zgadywac po nazwie ulicy.
    szukPunktWyceny = { x: punkt.x, y: punkt.y };
    return { ok: true, x: punkt.x, y: punkt.y, miasto, powiat: (r.dzialki || [])[0]?.powiat || '', teryt: String((r.dzialki || [])[0]?.id || '').replace(/\D/g, '').slice(0, 4) };
  } catch (e){ return { ok: false, powod: cleanRemoteError(e) }; }
}

/**
 * Pobranie transakcji z Rejestru Cen Nieruchomosci. Wynik przechodzi przez
 * DOKLADNIE te sama kontrole jakosci, co wyciag ze starostwa - odrzucanie
 * darowizn, duplikatow i cen razaco odstajacych. Jedna droga kontroli.
 */
async function rcnZGeoportalu({ promien = 1000, typy = null, cicho = false, maks = 0, okresMies = 0 } = {}){
  const GRUPA = 'Transakcje (Rejestr Cen Nieruchomości)';
  const punkt = await rcnPunktWyceny();
  if (!punkt.ok){
    mowi(punkt.powod, { rodzaj: 'pytanie', grupa: GRUPA, pasek: !cicho, czasPaska: 9000 });
    return null;
  }
  const rodzaje = typy || (isPairModule() ? ['budynki', 'dzialki'] : ['lokale']);
  mowiEtap(`Pytam Rejestr Cen Nieruchomości o transakcje w promieniu ${promien} m od ${punkt.miasto}.`, GRUPA);
  if (!cicho) showStatus(`Pytam Rejestr Cen Nieruchomości o transakcje w promieniu ${promien} m…`, 'info', 0);
  try {
    const r = await window.operatAPI.rcnGeoportal({ x: punkt.x, y: punkt.y, promien, typy: rodzaje, powiat: punkt.powiat, teryt: punkt.teryt, miasto: punkt.miasto, maks: maks || undefined, odDaty: okresMies > 0 ? (() => { const d = new Date(project.valuation?.valuationDate || todayISO()); d.setMonth(d.getMonth() - okresMies); return d.toISOString().slice(0, 10); })() : undefined });
    zrodlaSprawdzone.add('rcn-geoportal');
    // 3.3: twarde odsianie rzeczy, które nie są porównywalne (udziały, garaże, sprzedaż bezprzetargowa…).
    if (Array.isArray(r?.transakcje) && window.OperoRcnGeo?.przydatnosc){
      const cel = isPairModule() ? 'dom' : 'mieszkanie', odrz = {};
      r.wszystkichZRejestru = r.transakcje.length;
      r.transakcje = r.transakcje.filter(t => { const pw = window.OperoRcnGeo.przydatnosc(t, cel); if (pw){ const k = pw.replace(/\(.*\)|\d+\/\d+/g, '').trim(); odrz[k] = (odrz[k] || 0) + 1; } return !pw; });
      r.odsiane = odrz;
    }
    rcnOstatniePobranie = { ...r, promien, miasto: punkt.miasto };
    if (!r.transakcje?.length){
      window.OperoOkno?.zakonczEtapy(oknoStan, GRUPA);
      mowi(r.komunikat, { rodzaj: 'ostrzezenie', grupa: GRUPA, zrodlo: r.zrodlo || '', pasek: !cicho, czasPaska: 14000 });
      expressRysujZrodla();
      return r;
    }
    // Te same reguly, co przy wyciagu z pliku: ocena jakosci przed pokazaniem.
    const przedmiot = { powierzchnia: Number(project.property?.usableArea) || 0,
      dataWyceny: project.valuation?.valuationDate || todayISO(),
      miejscowosc: punkt.miasto, prawo: project.property?.rightType || '', okresMiesiecy: 24 };
    const ocena = window.OperoRCN.ocen(r.transakcje, przedmiot);
    rcnStan = { plik: `Rejestr Cen Nieruchomości (Geoportal), promień ${promien} m`, arkusz: 'RCN',
      wiersze: [], naglowek: 0, mapowanie: {}, ocena, zaznaczone: new Set(ocena.przyjete.slice(0, 15).map(x => x.zrodloWiersz)),
      zGeoportalu: true };
    window.OperoOkno?.zakonczEtapy(oknoStan, GRUPA);
    const st = ocena.statystyka;
    mowi(r.komunikat, {
      rodzaj: 'odpowiedz', grupa: GRUPA, pasek: !cicho, czasPaska: 12000,
      szczegoly: `Do porównania nadaje się ${st.przyjete} z ${st.wczytane}; odrzuconych z powodem: ${st.odrzucone}. `
        + `Mediana przyjętych: ${st.mediana != null ? Math.round(st.mediana).toLocaleString('pl-PL') : '—'} zł/m². `
        + 'Odrzucone widzisz w oknie importu i możesz je przypisać sam, jeżeli uznasz, że pasują.',
      zrodlo: r.zrodlo || '',
      dzialanie: { id: 'pokaz-transakcje', napis: 'Pokaż transakcje' },
    });
    if (!cicho){
      rcnOtworz();
      rcnKrok('dobor');
      rcnRysujDobor();
    }
    expressRysujZrodla();
    return r;
  } catch (e){
    window.OperoOkno?.zakonczEtapy(oknoStan, GRUPA);
    const powod = cleanRemoteError(e);
    mowi(`Rejestr Cen Nieruchomości: ${powod}`, { rodzaj: 'blad', grupa: GRUPA, pasek: !cicho, czasPaska: 12000 });
    // Zwracamy POWOD, a nie `null`. `null` znaczy „nie wiedzialem, gdzie
    // pytac"; tutaj wiedzielismy i usluga odmowila - to dwie rozne rzeczy
    // i rzeczoznawca musi zobaczyc te wlasciwa.
    return { ok: false, powod, transakcje: [] };
  }
}

/** Panel „skad wziac ceny" - cala droga, nie tylko nastepny krok. */
/* ===========================================================================
   SZUKANIE TRANSAKCJI — JEDNO OKNO, KTORE PRZELACZA ETAPY
   ---------------------------------------------------------------------------
   Rzeczoznawca naciska jeden przycisk. Program przechodzi zrodla po kolei
   i w KAZDEJ chwili widac, w ktorym jest, co w nim znalazl i dlaczego z niego
   zeszedl.

   Dwie rzeczy, ktore w uzyciu znacza najwiecej:

   1. JEDNA ZNALEZIONA TRANSAKCJA WYSTARCZY, zeby mozna bylo ja dodac.
      Blokada „potrzebne sa co najmniej dwie" odbierala rzeczoznawcy to, co
      wlasnie znalazl. Program ostrzega, ale nie odmawia.

   2. Z CUDZYCH SERWISOW program nie pobiera sam - otwiera je z wpisanymi
      kryteriami i przyjmuje wklejone wiersze. Powod stoi przy tym kroku
      w oknie, zeby nie wygladalo to na niedorobke.
   ======================================================================== */
let szukPrzebieg = null;
let szukTrwa = false;
let szukZaznaczone = new Set();
// Wiersze, przy ktorych czlowiek sam kliknal okienko. Program nie ma prawa
// nadpisac takiej decyzji przy nastepnym przerysowaniu listy.
let szukTkniete = new Set();
const SZUK_GRUPA = 'Szukanie transakcji';

// Punkt wycenianej nieruchomosci. Program zdobywa go raz, przy geokodowaniu
// adresu, i trzyma na czas sesji — bez niego dobor nie ma czym mierzyc
// odleglosci i musi zgadywac po nazwach ulic.
let szukPunktWyceny = null;

function szukKryteriaZPol(){
  const S = window.OperoSzukanie;
  const l = (id) => ($(id)?.value || '').replace(',', '.');
  const lub = (id, zProjektu) => ($(id)?.value || '').trim() || zProjektu || '';
  const liczbaLubNull = (id, zProjektu) => {
    const t = ($(id)?.value || '').trim();
    if (t) { const n = Number(t.replace(',', '.')); return Number.isFinite(n) ? n : null; }
    const n = Number(zProjektu);
    return Number.isFinite(n) && String(zProjektu).trim() !== '' ? n : null;
  };
  const p = project.property || {};
  return S.kryteria({
    miejscowosc: lub('#szukMiasto', p.city),
    dzielnica: lub('#szukDzielnica', p.district),
    ulica: lub('#szukUlica', p.street),
    x: szukPunktWyceny ? szukPunktWyceny.x : null,
    y: szukPunktWyceny ? szukPunktWyceny.y : null,
    powierzchnia: l('#szukPow'),
    pokoje: liczbaLubNull('#szukPokoje', p.rooms),
    pietro: liczbaLubNull('#szukPietro', p.floor),
    odchylkaPowPct: l('#szukOdchylka'),
    okresMiesiecy: l('#szukOkres'),
    promienM: l('#szukPromien'),
    zapasPct: l('#szukZapas'),
    dataWyceny: project.valuation?.valuationDate || todayISO(),
    prawo: p.rightType || '',
  });
}

function szukOtworz(){
  const S = window.OperoSzukanie; if (!S) return;
  // Kryteria wypelniamy z operatu - rzeczoznawca ma je poprawic, a nie wpisywac
  // od zera to, co program i tak juz wie.
  const p = project.property || {};
  const wstaw = (id, v) => { const el = $(id); if (el && !el.value && v != null && String(v).trim() !== '') el.value = String(v).replace('.', ','); };
  if ($('#szukMiasto') && !$('#szukMiasto').value) $('#szukMiasto').value = ofertyMiasto();
  // Dzielnica, ulica, pokoje i pietro sa w operacie — przepisywanie ich z reki
  // do okna szukania bylo praca, ktora program potrafi wykonac sam.
  wstaw('#szukDzielnica', p.district);
  wstaw('#szukUlica', p.street);
  wstaw('#szukPokoje', p.rooms);
  wstaw('#szukPietro', p.floor);
  if ($('#szukPow') && !$('#szukPow').value){
    const pow = Number(project.property?.usableArea) || Number(String($('#ex_powierzchnia')?.value || '').replace(',', '.')) || 0;
    if (pow > 0) $('#szukPow').value = String(pow).replace('.', ',');
  }
  if (!szukPrzebieg) szukPrzebieg = S.nowy(szukKryteriaZPol());
  $('#szukOverlay')?.classList.remove('hidden');
  szukUchwytPodepnij();
  szukRysuj();
  zrodlaRysujZdrowie();
  // Pierwsze otwarcie okna w tej sesji sprawdza uslugi po cichu. Kosztuje to
  // dwie sekundy w tle, a oszczedza czekania na zrodlo, ktore i tak milczy.
  if (!zrodlaStanZdrowia) zrodlaSprawdzTeraz({ cicho: true });
}
function szukZamknij(){ $('#szukOverlay')?.classList.add('hidden'); }

/**
 * TRZY ZRODLA NARAZ, A NIE JEDNO PO DRUGIM.
 *
 * Dotad program pytal zrodla po kolei i czekal na kazde do konca: Geoportal
 * (do 30 s), wlasna baza, dane.gov.pl (do 45 s na jeden cennik razy szesc).
 * W najgorszym razie bylo to kilka minut patrzenia w kolko, chociaz te
 * zrodla nic o sobie nie wiedza i nic ich nie wiaze — kolejnosc byla tylko
 * sposobem na pokazanie, co sie dzieje.
 *
 * Teraz pytamy wszystkie trzy w tej samej chwili, a kazde WPISUJE SIE DO
 * OKNA, gdy tylko odpowie. Calosc trwa tyle, co najwolniejsze zrodlo, a nie
 * tyle, co ich suma. Lista do zaznaczania rosnie w oczach, zamiast pojawic
 * sie na koncu.
 *
 * Kolejnosc etapow w oknie zostaje ta sama, bo ona nie opisuje czasu, tylko
 * wage zrodla: rejestr, wlasna baza, oferty, serwisy.
 */
async function szukPrzejdz(){
  const S = window.OperoSzukanie;
  if (!S || szukTrwa) return;
  szukTrwa = true;

  // NAJPIERW PUNKT, POTEM KRYTERIA.
  //
  // Bez wspolrzednych wycenianego lokalu dobor nie ma czym mierzyc odleglosci
  // i kazda transakcja z tego samego miasta wyglada tak samo blisko — lokal
  // ze Stogow wchodzil wtedy do zbioru na rowni z sasiadem z tej samej klatki.
  // Jedno zapytanie do geokodera przed startem rozstrzyga to raz na caly
  // przebieg; gdy adres jest nieznany, program mowi o tym wprost i dobiera
  // po nazwach, zamiast udawac, ze zna polozenie.
  if (!szukPunktWyceny){
    try { await rcnPunktWyceny(); } catch { /* bez punktu idziemy dalej */ }
  }
  if (!szukPunktWyceny){
    mowi('Nie znam położenia wycenianego lokalu, więc dobieram po nazwie ulicy i dzielnicy.', {
      rodzaj: 'ostrzezenie', grupa: SZUK_GRUPA, pasek: false,
      szczegoly: 'Uzupełnij miejscowość i ulicę w danych lokalu — wtedy program zmierzy odległość '
        + 'w metrach i odrzuci transakcje z drugiego końca miasta.',
    });
  }

  szukPrzebieg = S.nowy(szukKryteriaZPol());
  szukZaznaczone = new Set();
  szukTkniete = new Set();
  szukWstawione = [];
  szukKolejka = []; szukKolejkaNr = 0;
  $('#szukPrzyjete')?.classList.add('hidden');
  $('#szukKolejka')?.classList.add('hidden');
  const K = szukPrzebieg.kryteria;
  const Z = S.kryteriaZapytania(K);
  // KROK 1 to serwis, ktory wymaga czlowieka. Stoi pierwszy i jest otwarty
  // od razu, bo rzeczoznawca moze go zalatwic w tym samym czasie, w ktorym
  // program pyta pozostale zrodla. Wczesniej wisial na koncu z napisem
  // "sprawdzam..." i wygladal jak zawieszony program.
  S.zacznij(szukPrzebieg, 'deweloperuch');
  szukRysuj();
  mowi(`Szukam transakcji: ${S.opisKryteriow(K)}.`, { rodzaj: 'etap', grupa: SZUK_GRUPA, pasek: false });
  mowiEtap('Krok 1: deweloperuch.pl i podobne serwisy — otwórz, wklej wiersze albo odhacz, że nic stamtąd nie bierzesz. '
    + 'W tym czasie pytam pozostałe źródła.', SZUK_GRUPA);

  // Zapas trzeba powiedziec na glos. Rzeczoznawca, ktory zobaczy w wynikach
  // 46 m2 przy wpisanym zakresie 48-72, musi wiedziec, ze to nie usterka
  // filtra, tylko celowo szerzej zadane pytanie.
  if (K.zapasPct){
    mowiEtap(`Pytam źródła z zapasem ±${K.zapasPct}%: powierzchnia ${S.liczbaPl(K.powOdZapas)}–${S.liczbaPl(K.powDoZapas)} m², `
      + `${K.okresMiesiecyZapas} mies., promień ${K.promienMZapas} m. Co wpadnie dopiero dzięki zapasowi, `
      + 'pokażę osobno — do zaznaczenia ręcznie.', SZUK_GRUPA);
  }

  /** Jeden etap: zamyka sie sam i od razu przerysowuje okno. */
  const zamknij = (id, d, { zrodlo = '' } = {}) => {
    S.zakoncz(szukPrzebieg, id, {
      // `ile` liczy to, co naprawde poszlo na liste — razem z zapasem,
      // bo to on jest dla czlowieka widoczny jako wynik.
      ile: d.doPokazania.length, pozycje: d.doPokazania, zrodlo,
      powod: d.doPokazania.length ? '' : (d.razem ? `${d.razem} ${S.odmien(d.razem, 'pozycja nie przeszła', 'pozycje nie przeszły', 'pozycji nie przeszło')} kryteriów nawet z zapasem` : ''),
    });
    // Najlepiej pasujace wchodza do operatu OD RAZU, jeszcze zanim odpowie
    // reszta zrodel. Rzeczoznawca nie czeka na koniec calego przebiegu,
    // zeby miec w operacie to, co juz jest pewne.
    const wstawione = szukWstawNajlepsze(d.pasujace.map(x => ({ ...x, zEtapu: id, rodzajZrodla: (S.etap(szukPrzebieg, id) || {}).rodzaj })));
    if (wstawione){
      renderAll();
      szukRysujPrzyjete();
    }
    szukZaznaczDomyslnie();
    szukRysuj();
    return d;
  };
  const bladEtapu = (id, e) => {
    S.zakoncz(szukPrzebieg, id, { blad: true, powod: cleanRemoteError(e) });
    szukRysuj();
  };

  const zadania = [
    /* --- 1. Rejestr Cen Nieruchomosci --- */
    (async () => {
      S.zacznij(szukPrzebieg, 'rcn-geoportal'); szukRysuj();
      mowiEtap('Rejestr Cen Nieruchomości (GUGiK) — ceny z aktów notarialnych.', SZUK_GRUPA);
      try {
        const r = await rcnZGeoportalu({ cicho: true, promien: Math.max(Z.promienM, Z.promienMZapas || 0), maks: 6000, okresMies: Math.max(Number(Z.okresMiesiecy) || 0, Number(Z.okresMiesiecyZapas) || 0) });
        // `null` znaczy, ze program nie wiedzial, GDZIE pytac - nie zna punktu
        // wycenianej nieruchomosci. Pokazanie wtedy "rejestr obejmuje tylko
        // powiaty, ktore przeslaly dane" bylo klamstwem: rejestr nie zostal
        // nawet zapytany. Czlowiek ma dostac powod, ktory da sie naprawic.
        if (!r){
          S.zakoncz(szukPrzebieg, 'rcn-geoportal', { blad: true,
            powod: 'Nie wiem, gdzie szukać: podaj miejscowość i ulicę wycenianej nieruchomości, '
              + 'wtedy rejestr dostanie punkt, wokół którego ma szukać.' });
          szukRysuj();
          return;
        }
        if (r.ok === false && r.powod){
          S.zakoncz(szukPrzebieg, 'rcn-geoportal', { blad: true, powod: r.powod });
          szukRysuj();
          return;
        }
        zamknij('rcn-geoportal', S.dopasuj(r?.transakcje || [], K), { zrodlo: r?.zrodlo || '' });
      } catch (e){ bladEtapu('rcn-geoportal', e); }
    })(),

    /* --- 2. Wlasna baza rynku --- */
    (async () => {
      S.zacznij(szukPrzebieg, 'wlasna-baza'); szukRysuj();
      mowiEtap('Twoja własna baza rynku.', SZUK_GRUPA);
      try {
        const r = await window.operatAPI.bazaDopasuj({
          miejscowosc: Z.miejscowosc, powierzchnia: Z.powierzchnia,
          powOd: Z.powOd, powDo: Z.powDo,
          prawo: Z.prawo, data: Z.dataWyceny,
        });
        const lista = r?.kandydaci || r?.dopasowane || r?.wyniki || [];
        zamknij('wlasna-baza', S.dopasuj(lista, K), { zrodlo: 'Twoja baza rynku (ten komputer)' });
      } catch (e){ bladEtapu('wlasna-baza', e); }
    })(),

    /* --- 3. Cenniki deweloperow (OFERTY) --- */
    (async () => {
      S.zacznij(szukPrzebieg, 'dane-gov'); szukRysuj();
      mowiEtap('Cenniki deweloperów z dane.gov.pl — ceny ofertowe.', SZUK_GRUPA);
      try {
        const r = await window.operatAPI.ofertySzukaj({ miasto: Z.miejscowosc });
        ofertyWynik = r;
        // Przy ofertach data wyceny nie ma zastosowania: cennik jest z dzisiaj,
        // a nie z dnia transakcji - filtrowanie po okresie wycielo by wszystko.
        zamknij('dane-gov', S.dopasuj(r?.oferty || [], { ...K, dataWyceny: '' }),
          { zrodlo: (r?.zrodla || []).map(z => z.zbior).join('; ') });
        zrodlaSprawdzone.add('dane-gov');
      } catch (e){ bladEtapu('dane-gov', e); }
    })(),
  ];

  try {
    // allSettled, a nie all: jedno milczace zrodlo nie moze przerwac dwoch
    // pozostalych. Kazde zadanie i tak zamyka swoj etap samo.
    await Promise.allSettled(zadania);
  } finally {
    szukTrwa = false;
    window.OperoOkno?.zakonczEtapy(oknoStan, SZUK_GRUPA);
    szukZaznaczDomyslnie();
    szukRysuj();
    szukRysujPrzyjete();
    // Dopiero teraz kolejka: pozycje z zapasu, jedna po drugiej, od
    // najblizszej kryteriom. To jest jedyne miejsce, w ktorym program
    // naprawde czegos od czlowieka chce.
    szukKolejkaUstaw();
    const pod = S.podsumowanie(szukPrzebieg);
    mowi(pod.tekst, {
      rodzaj: pod.waga === 'sukces' ? 'sukces' : pod.waga === 'ostrzezenie' ? 'ostrzezenie' : 'info',
      grupa: SZUK_GRUPA,
      szczegoly: S.opisKryteriow(szukPrzebieg.kryteria),
      dzialanie: pod.mozeDodac ? { id: 'pokaz-szukanie', napis: 'Pokaż wyniki' } : null,
    });
    expressRysujZrodla();
  }
}

/**
 * Lista ma byc DO ZAAKCEPTOWANIA, a nie do odhaczania po jednym.
 *
 * To, co trafilo w kryteria, program zaznacza sam — rzeczoznawca naciska
 * „Dodaj do operatu" i ma je u siebie. To, co weszlo dzieki zapasowi, zostaje
 * NIEZAZNACZONE: zgoda na odejscie od wlasnych kryteriow musi byc swiadoma,
 * bo to ona pojdzie potem do uzasadnienia doboru w operacie.
 *
 * Zaznaczen juz zrobionych recznie nie ruszamy - czlowiek mogl odznaczyc
 * wiersz, ktory mu nie pasuje, i kolejny etap nie ma prawa mu go wrocic.
 */
function szukZaznaczDomyslnie(){
  const lista = szukPrzebieg?.znalezione || [];
  lista.forEach((p, i) => {
    if (p.rodzajZrodla === 'oferty') return;      // oferty do zbioru nie wchodza
    if (p.zZapasu) return;                         // zapas tylko recznie
    if (szukTkniete.has(i)) return;                // czlowiek juz o tym zdecydowal
    szukZaznaczone.add(i);
  });
}

/* ------------------------------------------ od razu do operatu + kolejka */

// Pozycje, ktore program sam wstawil do operatu w tym przebiegu. Trzymamy je,
// zeby dalo sie cofnac jednym przyciskiem - samoczynne dopisanie czegos do
// operatu bez drogi powrotnej byloby nadużyciem zaufania.
let szukWstawione = [];
// Kolejka decyzji: pozycje z zapasu, kazda osobno, od najblizszej kryteriom.
let szukKolejka = [];
let szukKolejkaNr = 0;

/**
 * Czy taka transakcja juz stoi w operacie.
 *
 * Porownujemy po dacie, powierzchni i CENIE JEDNOSTKOWEJ, bo tylko ona
 * przezywa droge do operatu: `doOperatu` zapisuje `priceUnit`, a cena calej
 * transakcji nie jest tam w ogole przenoszona. Porownanie po cenie calkowitej
 * nie trafialoby nigdy i program dodawalby te same wiersze po raz drugi.
 */
function szukKluczOperatu(x){
  const S = window.OperoSzukanie;
  const jedn = x.priceUnit != null ? x.priceUnit
    : (x.jednostkowa != null ? x.jednostkowa
      : (Number(x.cena) && Number(x.powierzchnia) ? Number(x.cena) / Number(x.powierzchnia) : null));
  return S.klucz({ data: x.date || x.data, cena: jedn, powierzchnia: x.area != null ? x.area : x.powierzchnia });
}
function szukJuzWOperacie(poz){
  const k = szukKluczOperatu(poz);
  return (project.market.transactions || []).some(t => szukKluczOperatu(t) === k);
}

/**
 * NAJLEPIEJ PASUJACE WCHODZA OD RAZU.
 *
 * Rzeczoznawca prosil wprost: to, co trafia w kryteria, ma byc w operacie bez
 * klikania. Zaznaczanie kilkunastu okienek po kolei bylo praca, ktora program
 * potrafi wykonac sam — bo tu nie ma nic do rozstrzygniecia: pozycja albo
 * miesci sie w kryteriach, ktore czlowiek wpisal, albo nie.
 *
 * Rozstrzygniecie zostaje tam, gdzie naprawde jest: przy pozycjach z zapasu.
 * Te iada do kolejki i kazda czeka na osobne „przyjmij".
 */
function szukWstawNajlepsze(pozycje){
  const nowe = (pozycje || []).filter(p => p.rodzajZrodla !== 'oferty' && !p.zZapasu && !szukJuzWOperacie(p));
  if (!nowe.length) return 0;
  const doOperatu = window.OperoRCN.doOperatu(nowe, (project.market.transactions || []).length + 1);
  project.market.transactions = [...(project.market.transactions || []), ...doOperatu.map(t => ({ ...t, useForPair: isPairModule() }))];
  szukWstawione = szukWstawione.concat(doOperatu);
  changed({ fullDynamic: true });
  return nowe.length;
}

function szukCofnijWstawione(){
  if (!szukWstawione.length) return;
  const S = window.OperoSzukanie;
  const klucze = new Set(szukWstawione.map(szukKluczOperatu));
  const przed = (project.market.transactions || []).length;
  project.market.transactions = (project.market.transactions || []).filter(t => !klucze.has(szukKluczOperatu(t)));
  const ile = przed - project.market.transactions.length;
  szukWstawione = [];
  changed({ fullDynamic: true });
  renderAll();
  szukRysujPrzyjete();
  mowi(`Cofnąłem ${ile} ${S.odmien(ile, 'transakcję', 'transakcje', 'transakcji')} — operat jest taki, jak przed szukaniem.`,
    { rodzaj: 'info', grupa: SZUK_GRUPA });
}

function szukRysujPrzyjete(){
  const S = window.OperoSzukanie;
  const karta = $('#szukPrzyjete');
  if (!karta) return;
  const ile = szukWstawione.length;
  karta.classList.toggle('hidden', ile === 0);
  if (!ile) return;
  const razem = (project.market.transactions || []).length;
  $('#szukPrzyjeteTytul').textContent = `${ile} ${S.odmien(ile, 'transakcja weszła', 'transakcje weszły', 'transakcji weszło')} do operatu`;
  $('#szukPrzyjeteOpis').textContent =
    `Te pozycje mieszczą się w Twoich kryteriach, więc program nie pytał o nie osobno. `
    + `W operacie jest teraz ${razem} ${S.odmien(razem, 'transakcja', 'transakcje', 'transakcji')}. `
    + 'Oceny cech rynkowych uzupełnij w tabeli — import ich nie zgaduje.';
}

/**
 * KOLEJKA DECYZJI. Jedna pozycja na ekranie, od najblizszej kryteriom.
 *
 * Lista dwudziestu wierszy z plakietkami to nie jest decyzja, tylko sciana
 * tekstu. Jedna pozycja z jednym zdaniem „czym wychodzi poza kryteria" i
 * dwoma przyciskami — to jest decyzja, ktora da sie podjac w sekunde.
 */
function szukKolejkaUstaw(){
  const S = window.OperoSzukanie;
  szukKolejka = (szukPrzebieg?.znalezione || [])
    .filter(p => p.zZapasu && p.rodzajZrodla !== 'oferty' && !szukJuzWOperacie(p));
  szukKolejka = S.poDopasowaniu(szukKolejka, szukPrzebieg?.kryteria);
  szukKolejkaNr = 0;
  szukKolejkaRysuj();
}

function szukKolejkaRysuj(){
  const karta = $('#szukKolejka');
  if (!karta) return;
  const poz = szukKolejka[szukKolejkaNr];
  karta.classList.toggle('hidden', !poz);
  if (!poz) return;
  const S = window.OperoSzukanie;
  $('#szukKolejkaLicznik').textContent = `${szukKolejkaNr + 1} z ${szukKolejka.length} do decyzji`;
  $('#szukKolejkaTytul').textContent = poz.adres || 'Transakcja bez adresu w rejestrze';
  const d = poz.dobor;
  $('#szukKolejkaPowod').textContent = d
    ? `Dopasowanie ${d.punkty}/100. ${d.zdanie}.`
    : (poz.opisZapasu ? `Poza Twoimi kryteriami: ${poz.opisZapasu}.` : 'Poza Twoimi kryteriami.');
  const pole = (etykieta, wartosc) => `<span><i>${escapeHTML(etykieta)}</i><b>${escapeHTML(String(wartosc))}</b></span>`;
  // Rozbicie oceny: rzeczoznawca ma widziec, KTORA skladowa zawiodla, a nie
  // samą liczbę. „Położenie 12/40" mowi, ze to inny rynek lokalny; „Czas 4/15",
  // ze transakcja jest stara. To sa dwie rozne decyzje.
  const skladniki = d ? d.skladniki.map(c =>
    `<span data-slabe="${c.punkty < c.maks * 0.5 ? '1' : '0'}"><i>${escapeHTML(c.nazwa)} ${c.punkty}/${c.maks}</i><b>${escapeHTML(c.opis)}</b></span>`).join('') : '';
  $('#szukKolejkaDane').innerHTML = [
    pole('Data', poz.data || '—'),
    pole('Powierzchnia', poz.powierzchnia != null ? `${S.liczbaPl(poz.powierzchnia)} m²` : '—'),
    pole('Cena', poz.cena != null ? `${Math.round(poz.cena).toLocaleString('pl-PL')} zł` : '—'),
    pole('Cena 1 m²', poz.jednostkowa != null ? `${Math.round(poz.jednostkowa).toLocaleString('pl-PL')} zł` : '—'),
    pole('Źródło', (S.etap(szukPrzebieg, poz.zEtapu) || {}).skrot || '—'),
  ].join('') + (skladniki ? `<div class="szuk-kolejka-skladniki">${skladniki}</div>` : '')
    + (d && d.brakiOpis ? `<p class="szuk-kolejka-braki">${escapeHTML(d.brakiOpis)}</p>` : '');
  $('#szukKolejkaWszystkie').classList.toggle('hidden', szukKolejka.length - szukKolejkaNr < 2);
}

function szukKolejkaDecyzja(przyjmij){
  const S = window.OperoSzukanie;
  const poz = szukKolejka[szukKolejkaNr];
  if (!poz) return;
  if (przyjmij){
    const doOperatu = window.OperoRCN.doOperatu([poz], (project.market.transactions || []).length + 1);
    project.market.transactions = [...(project.market.transactions || []), ...doOperatu.map(t => ({ ...t, useForPair: isPairModule() }))];
    szukWstawione = szukWstawione.concat(doOperatu);
    changed({ fullDynamic: true });
    renderAll();
    szukRysujPrzyjete();
    // Odejscie od wlasnych kryteriow MUSI zostac zapisane, bo pojdzie potem
    // do uzasadnienia doboru nieruchomosci podobnych.
    mowi(`Przyjąłeś pozycję spoza kryteriów: ${poz.adres || 'bez adresu'}.`, {
      rodzaj: 'ostrzezenie', grupa: SZUK_GRUPA, pasek: false,
      szczegoly: `${poz.opisZapasu || 'poza kryteriami'}. Opisz to w uzasadnieniu doboru nieruchomości podobnych.`,
    });
  }
  szukKolejkaNr++;
  if (szukKolejkaNr >= szukKolejka.length) szukKolejkaKoniec();
  else szukKolejkaRysuj();
}

function szukKolejkaPrzyjmijReszte(){
  const ile = szukKolejka.length - szukKolejkaNr;
  for (let i = szukKolejkaNr; i < szukKolejka.length; i++){
    const poz = szukKolejka[i];
    const doOperatu = window.OperoRCN.doOperatu([poz], (project.market.transactions || []).length + 1);
    project.market.transactions = [...(project.market.transactions || []), ...doOperatu.map(t => ({ ...t, useForPair: isPairModule() }))];
    szukWstawione = szukWstawione.concat(doOperatu);
  }
  szukKolejkaNr = szukKolejka.length;
  changed({ fullDynamic: true });
  renderAll();
  szukRysujPrzyjete();
  mowi(`Przyjąłeś ${ile} ${window.OperoSzukanie.odmien(ile, 'pozycję', 'pozycje', 'pozycji')} spoza kryteriów.`, {
    rodzaj: 'ostrzezenie', grupa: SZUK_GRUPA,
    szczegoly: 'Każda z nich wykracza poza zakres, który sam wpisałeś. Uzasadnij to przy doborze nieruchomości podobnych.',
  });
  szukKolejkaKoniec();
}

function szukKolejkaKoniec(){
  $('#szukKolejka')?.classList.add('hidden');
  szukRysuj();
}

/**
 * „Nic stad nie biore" — odhaczenie serwisu bez wklejania.
 *
 * Bez tego przycisku etap 1 nie mial jak sie skonczyc: rzeczoznawca, ktory
 * zajrzal do serwisu i uznal, ze nic tam dla niego nie ma, zostawal z napisem
 * „sprawdzam..." do konca pracy. Sprawdzony i pusty to tez wynik.
 */
function szukSerwisOdhacz(){
  const S = window.OperoSzukanie;
  if (!szukPrzebieg) return;
  const e = S.etap(szukPrzebieg, 'deweloperuch');
  if (!e) return;
  e.stan = S.STAN.SPRAWDZONY;
  e.powod = 'sprawdzony — nic stamtąd nie brałeś';
  e.ile = 0;
  if (szukPrzebieg.biezacy === 'deweloperuch') szukPrzebieg.biezacy = null;
  szukRysuj();
  mowi('Serwisy odhaczone — nic stamtąd nie bierzesz.', {
    rodzaj: 'info', grupa: SZUK_GRUPA, pasek: false,
    szczegoly: 'Ten krok nie wymaga już Twojej uwagi. Pozostałe źródła program sprawdza sam.',
  });
}

/**
 * INNE PORTALE — OSTATECZNOSC, A NIE KOLEJNE ZRODLO.
 *
 * To sa CENY OFERTOWE z ogloszen. Roznica miedzy cena wywolawcza a cena
 * z aktu bywa kilkunastoprocentowa i zmienia sie w czasie, wiec do zbioru
 * porownawczego wchodza tylko po korekcie, ktora trzeba uzasadnic w operacie.
 * Dlatego ten panel jest zwiniety i stoi osobno, a kazdy wiersz stad idzie
 * do decyzji czlowieka — nigdy do operatu samoczynnie.
 */
function szukPortaleWczytaj(gotowe){
  const S = window.OperoSzukanie;
  if (!szukPrzebieg) return;
  const tekst = $('#szukWklejeniePortal')?.value || '';
  // `gotowe` = oferty odczytane przez program ze strony w oknie portalu.
  const w = (gotowe && Array.isArray(gotowe.wiersze))
    ? { ok: gotowe.wiersze.length > 0, wiersze: gotowe.wiersze, odrzucone: [], komunikat: gotowe.komunikat || '' }
    : S.zWklejenia(tekst, { zrodlo: 'portal ogłoszeniowy' });
  const stan = $('#szukPortalStan');
  if (stan){
    stan.textContent = w.komunikat;
    stan.dataset.waga = w.ok ? 'ostrzezenie' : 'blad';
  }
  if (!w.ok){
    mowi(w.komunikat, { rodzaj: 'ostrzezenie', grupa: SZUK_GRUPA, pasek: false });
    return;
  }
  const d = S.dopasuj(w.wiersze, szukPrzebieg.kryteria);
  // Wszystko z ogloszen idzie do DECYZJI, nawet gdy trafia w kryteria co do
  // metra: to nie sa ceny transakcyjne i program nie ma prawa wstawic ich
  // do operatu bez wiedzy rzeczoznawcy.
  const doDecyzji = d.doPokazania.map(x => ({ ...x, zZapasu: true,
    opisZapasu: 'cena ofertowa z ogłoszenia — przed użyciem skoryguj i uzasadnij korektę' }));
  S.zakoncz(szukPrzebieg, 'inne-portale', {
    ile: doDecyzji.length, pozycje: doDecyzji,
    zrodlo: S.opisPrzepisanych('portal ogłoszeniowy'),
    powod: doDecyzji.length
      ? `sprawdzony — przepisałeś stąd ${doDecyzji.length} ${S.odmien(doDecyzji.length, 'ogłoszenie', 'ogłoszenia', 'ogłoszeń')}`
      : 'sprawdzony — nic nie przeszło kryteriów',
  });
  const e = S.etap(szukPrzebieg, 'inne-portale');
  if (e) e.stan = S.STAN.SPRAWDZONY;
  szukKolejkaUstaw();
  szukRysuj();
  mowi(`${w.komunikat} To są ceny OFERTOWE — każda idzie do Twojej decyzji.`, {
    rodzaj: 'ostrzezenie', grupa: SZUK_GRUPA,
    szczegoly: 'Różnica między ceną z ogłoszenia a ceną z aktu bywa kilkunastoprocentowa. '
      + 'Przed użyciem w operacie skoryguj ją i uzasadnij korektę.',
    zrodlo: S.opisPrzepisanych('portal ogłoszeniowy'),
  });
}

function szukPortaleOdhacz(){
  const S = window.OperoSzukanie;
  if (!szukPrzebieg) return;
  const e = S.etap(szukPrzebieg, 'inne-portale');
  if (!e) return;
  e.stan = S.STAN.SPRAWDZONY;
  e.powod = 'sprawdzony — nie korzystałeś z portali ogłoszeniowych';
  e.ile = 0;
  szukRysuj();
}

/* ------------------------------------------------------ audyt przed podpisem */

let audytWynik = null;

/**
 * Audyt calosci operatu. Osobny od kontroli przed PDF, bo pilnuje czego
 * innego: kontrola pyta „czy sa wszystkie dane", audyt — „czy to sie
 * broni". Weryfikator nie pyta o puste pola, tylko o spojnosc.
 */
function audytUruchom(){
  const A = window.OperoAudyt;
  if (!A) return null;
  audytWynik = A.audyt(project, calc || obliczProjekt());
  audytRysuj();
  const pod = audytWynik.podsumowanie;
  mowi(pod.tekst, {
    rodzaj: pod.waga === 'sukces' ? 'sukces' : pod.waga === 'blad' ? 'blad' : 'ostrzezenie',
    grupa: 'Audyt operatu',
    szczegoly: audytWynik.dzialy.filter(d => d.bledy || d.uwagi)
      .map(d => `${d.nazwa}: ${d.bledy} ${A.odmien(d.bledy, 'błąd', 'błędy', 'błędów')}, ${d.uwagi} ${A.odmien(d.uwagi, 'uwaga', 'uwagi', 'uwag')}`)
      .join(' · ') || 'Wszystkie działy bez zastrzeżeń.',
  });
  return audytWynik;
}

function audytRysuj(){
  const A = window.OperoAudyt;
  const root = $('#audytDzialy'), stan = $('#audytStan');
  if (!root || !A) return;
  if (!audytWynik){
    root.innerHTML = '';
    stan?.classList.add('hidden');
    return;
  }
  const pod = audytWynik.podsumowanie;
  if (stan){
    stan.classList.remove('hidden');
    stan.dataset.waga = pod.waga;
    stan.innerHTML = `<b>${escapeHTML(pod.tekst)}</b>`
      + `<span>${pod.ok} w porządku · ${pod.uwagi} do decyzji · ${pod.bledy} do poprawy</span>`;
  }
  root.innerHTML = audytWynik.dzialy.map(d => {
    const waga = d.bledy ? 'blad' : d.uwagi ? 'uwaga' : 'ok';
    const pozycje = d.pozycje.map(x => `
      <li data-stan="${x.stan}">
        <b>${escapeHTML(x.tytul)}</b>
        ${x.szczegol ? `<p>${escapeHTML(x.szczegol)}</p>` : ''}
      </li>`).join('');
    return `<details class="audyt-dzial" data-waga="${waga}"${d.bledy ? ' open' : ''}>
      <summary>
        <b>${escapeHTML(d.nazwa)}</b>
        <i>${d.bledy ? `${d.bledy} do poprawy` : d.uwagi ? `${d.uwagi} do decyzji` : 'bez zastrzeżeń'}</i>
      </summary>
      <ul class="audyt-lista">${pozycje || '<li data-stan="ok"><b>Nic do sprawdzenia w tym dziale</b></li>'}</ul>
    </details>`;
  }).join('');
}

/**
 * Audyt opisowy modelem lokalnym — nad tym, czego reguly nie zlapia.
 * PER czyta operat jak weryfikator, ktory nie zna oczekiwanego wyniku.
 */
async function audytPrzezPER(){
  const A = window.OperoAudyt;
  if (!A) return;
  if (!audytWynik) audytUruchom();
  const box = $('#audytPerWynik');
  const btn = $('#audytPer');
  if (btn){ btn.disabled = true; btn.textContent = 'PER czyta operat…'; }
  if (box){
    box.classList.remove('hidden');
    box.innerHTML = '<p class="audyt-per-czeka">PER czyta operat jak weryfikator. To potrwa chwilę.</p>';
  }
  try {
    const polecenie = A.polecenieDlaPER(audytWynik, project);
    // Polecenie sklejamy w jeden tekst, bo kanal do modelu przyjmuje
    // `prompt` i `rozdzial` — tak samo jak przy pisaniu rozdzialow.
    const r = await window.operatAPI.perNapisz({
      rozdzial: polecenie.rozdzial,
      prompt: `${polecenie.zadanie}\n\n${polecenie.kontekst}`,
    });
    const tekst = String(r?.text || '').trim();
    if (box){
      box.innerHTML = tekst
        ? `<h4>Co zauważył PER</h4><div class="audyt-per-tresc">${escapeHTML(tekst).replace(/\n/g, '<br>')}</div>`
          + '<p class="audyt-per-stopka">To jest opinia modelu, a nie kontrola formalna. '
          + 'Operat podpisujesz Ty i Ty odpowiadasz za jego treść.</p>'
        : '<p class="audyt-per-czeka">PER nie zgłosił uwag.</p>';
    }
    mowi('PER przeczytał operat i zgłosił uwagi.', { rodzaj: 'odpowiedz', grupa: 'Audyt operatu' });
  } catch (e){
    if (box) box.innerHTML = `<p class="audyt-per-czeka">Nie udało się: ${escapeHTML(cleanRemoteError(e))}</p>`;
    mowi('Nie udało się uruchomić PER: ' + cleanRemoteError(e), { rodzaj: 'blad', grupa: 'Audyt operatu' });
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = '✦ Sprawdź tekst (PER)'; }
  }
}

function szukRysuj(){
  const S = window.OperoSzukanie;
  if (!S || !szukPrzebieg) return;
  const K = szukPrzebieg.kryteria;
  if ($('#szukOpisKryteriow')) $('#szukOpisKryteriow').textContent = `Szukam według kryteriów: ${S.opisKryteriow(K)}.`;

  const root = $('#szukEtapy');
  if (root){
    root.innerHTML = szukPrzebieg.etapy.map(e => `
      <div class="szuk-etap" data-stan="${e.stan}">
        <span class="szuk-etap-nr">${e.stan === 'znalazl' ? '✓' : e.stan === 'pusto' ? '—' : e.stan === 'blad' ? '!' : e.nr}</span>
        <div class="szuk-etap-tresc">
          <b>${escapeHTML(e.nazwa)}<i class="szuk-etap-rodzaj">${e.rodzaj === 'transakcje' ? 'transakcje' : e.rodzaj === 'oferty' ? 'oferty — nie do zbioru' : 'przepisane przez Ciebie'}</i></b>
          <p>${escapeHTML(S.opisEtapu(e))}</p>
        </div>
        <span class="szuk-etap-ile">${e.ile ? `${e.ile}` : ''}</span>
      </div>`).join('');
  }

  // Krok 4 pokazujemy dopiero, gdy program do niego dojdzie - wczesniej
  // rozpraszalby, bo to jedyny krok, ktory wymaga czlowieka.
  const serwisy = $('#szukSerwisy');
  const etapSerwisy = S.etap(szukPrzebieg, 'deweloperuch');
  if (serwisy){
    const widoczny = etapSerwisy && etapSerwisy.stan !== 'czeka';
    serwisy.classList.toggle('hidden', !widoczny);
    if ($('#szukSerwisyDlaczego')) $('#szukSerwisyDlaczego').textContent = etapSerwisy?.dlaczegoRecznie || '';
  }
  const etapPortale = S.etap(szukPrzebieg, 'inne-portale');
  if ($('#szukPortaleDlaczego')) $('#szukPortaleDlaczego').textContent = etapPortale?.dlaczegoRecznie || '';

  const tab = $('#szukTabela');
  if (tab){
    // Przy dwustu ofertach i jednej transakcji lista transakcji ginie.
    // Filtr zostawia na wierzchu to, co naprawde wchodzi do zbioru.
    const tylkoT = $('#szukTylkoTransakcje')?.checked;
    const wszystko = szukPrzebieg.znalezione;
    const lista = tylkoT ? wszystko.filter(t => t.rodzajZrodla !== 'oferty') : wszystko;
    const ileT = wszystko.filter(t => t.rodzajZrodla !== 'oferty').length;
    const ileO = wszystko.length - ileT;
    const naglowek = $('#szukWynikiNaglowek');
    if (naglowek){
      const O = window.OperoSzukanie;
      naglowek.textContent = wszystko.length
        ? `${ileT} ${O.odmien(ileT, 'transakcja', 'transakcje', 'transakcji')}`
          + (ileO ? ` i ${ileO} ${O.odmien(ileO, 'oferta', 'oferty', 'ofert')} (nie do zbioru)` : '')
          + (tylkoT && ileO ? ' — oferty ukryte' : '')
        : 'Znalezione pozycje';
    }
    tab.innerHTML = lista.map((t, poz) => {
      // Numer pozycji bierzemy z PELNEJ listy, nie z przefiltrowanej -
      // inaczej po wlaczeniu filtra zaznaczenia przeskoczylyby na inne wiersze.
      const i = wszystko.indexOf(t);
      const doZbioru = t.rodzajZrodla !== 'oferty';
      const zapas = !!t.zZapasu;
      return `<tr class="${doZbioru ? '' : 'szuk-oferta'}${zapas ? ' szuk-zapas' : ''}"${zapas ? ` title="${escapeHTML('Poza wpisanymi kryteriami: ' + (t.opisZapasu || ''))}"` : ''}>
        <td>${doZbioru ? `<input type="checkbox" data-szuk-i="${i}" ${szukZaznaczone.has(i) ? 'checked' : ''}>` : '<span title="Oferta — do zbioru porównawczego nie wchodzi">—</span>'}</td>
        <td>${poz + 1}</td>
        <td>${escapeHTML(t.data || '—')}</td>
        <td>${escapeHTML(t.adres || '—')}</td>
        <td>${t.powierzchnia != null ? t.powierzchnia : '—'}</td>
        <td>${t.cena != null ? Math.round(t.cena).toLocaleString('pl-PL') : '—'}</td>
        <td>${t.jednostkowa != null ? Math.round(t.jednostkowa).toLocaleString('pl-PL') : '—'}</td>
        <td>${escapeHTML((S.etap(szukPrzebieg, t.zEtapu) || {}).skrot || '—')}</td>
        <td>${t.dobor ? `<b class="szuk-dopasowanie" data-poziom="${t.dobor.poziom}" title="${escapeHTML(t.dobor.zdanie)}">${t.dobor.punkty}</b>` : '—'}</td>
        <td>${[
          zapas ? '<b class="szuk-znacznik-zapas">do decyzji</b>' : '',
          // Podpis zrodla zostaje ZAWSZE - przy danych przepisanych z cudzego
          // serwisu to on mowi, skad wiersz pochodzi i co z nim trzeba zrobic.
          escapeHTML(t.uwagiZrodla || (doZbioru ? '' : 'cena ofertowa')),
          escapeHTML(t.dobor ? t.dobor.zdanie : (t.opisZapasu || '')),
        ].filter(Boolean).join(' ')}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="10">Nic jeszcze nie znaleziono.</td></tr>';
    tab.querySelectorAll('[data-szuk-i]').forEach(ch => ch.addEventListener('change', () => {
      const i = Number(ch.dataset.szukI);
      szukTkniete.add(i);
      if (ch.checked) szukZaznaczone.add(i); else szukZaznaczone.delete(i);
      szukRysujStope();
    }));
  }
  szukRysujStope();
}

function szukRysujStope(){
  const S = window.OperoSzukanie;
  const pod = S.podsumowanie(szukPrzebieg);
  const el = $('#szukPodsumowanie');
  if (el){
    el.textContent = pod.tekst;
    el.dataset.waga = pod.waga;
  }
  // Liczymy tylko te zaznaczone, ktorych w operacie JESZCZE nie ma. Czesc
  // program wstawil sam, gdy odpowiedzialo zrodlo - przycisk "Dodaj (2)"
  // przy dwoch juz dodanych obiecywalby prace, ktorej nie ma do zrobienia.
  const doDodania = [...szukZaznaczone]
    .map(i => szukPrzebieg?.znalezione?.[i])
    .filter(x => x && !szukJuzWOperacie(x));
  const ile = doDodania.length;
  const dodaj = $('#szukDodaj');
  const stan = $('#szukStopkaStan');
  // MARTWY PRZYCISK TO NAJGORSZA ODPOWIEDZ, JAKA PROGRAM MOZE DAC.
  //
  // Przycisk „Wszystko zaznaczone jest juz w operacie" byl wylaczony, ale
  // wygladal jak zloty przycisk gotowy do nacisniecia. Czlowiek klikal, nic
  // sie nie dzialo i program wygladal na zawieszony. Zamiast tego pokazujemy
  // ZIELONE POTWIERDZENIE, a przycisk chowamy — nie ma po co stac tam cos,
  // czego nie da sie nacisnac.
  const wOperacie = (project.market.transactions || []).length;
  if (dodaj && stan){
    if (ile > 0){
      dodaj.classList.remove('hidden');
      dodaj.disabled = false;
      // Jedna wystarczy. Program ostrzega, ale nie odmawia.
      dodaj.textContent = `Dodaj do operatu (${ile})`;
      stan.classList.add('hidden');
    } else {
      dodaj.classList.add('hidden');
      stan.classList.remove('hidden');
      const zaznaczonych = szukZaznaczone.size;
      if (zaznaczonych && wOperacie){
        stan.dataset.waga = 'ok';
        stan.textContent = `${zaznaczonych} ${S.odmien(zaznaczonych, 'zaznaczona pozycja jest', 'zaznaczone pozycje są', 'zaznaczonych pozycji jest')} już w operacie`;
      } else {
        stan.dataset.waga = 'pusto';
        stan.textContent = 'Zaznacz pozycje, które chcesz dodać';
      }
    }
  }
  const doBazy = $('#szukDoBazy');
  if (doBazy) doBazy.disabled = S.transakcje(szukPrzebieg).length === 0;
}

function szukDodajDoOperatu(){
  const S = window.OperoSzukanie;
  const zaznaczone = [...szukZaznaczone].map(i => szukPrzebieg.znalezione[i]).filter(Boolean);
  // Czesc z nich program wstawil juz sam, gdy odpowiedzialo zrodlo. Dodanie
  // ich drugi raz zdublowaloby transakcje w zbiorze porownawczym, a to
  // zawyza ich wage w sredniej i nikt tego potem nie wylapie.
  const wybrane = zaznaczone.filter(p => !szukJuzWOperacie(p));
  const juz = zaznaczone.length - wybrane.length;
  if (!wybrane.length){
    if (juz) mowi(`Te ${juz === 1 ? 'pozycja jest' : 'pozycje są'} już w operacie — nie dodaję drugi raz.`,
      { rodzaj: 'info', grupa: SZUK_GRUPA, pasek: false });
    return;
  }
  const nowe = window.OperoRCN.doOperatu(wybrane, (project.market.transactions || []).length + 1);
  project.market.transactions = [...(project.market.transactions || []), ...nowe.map(t => ({ ...t, useForPair: isPairModule() }))];
  changed({ fullDynamic: true });
  renderAll();
  const razem = project.market.transactions.length;
  mowi(`Dodałem ${wybrane.length} ${window.OperoSzukanie.odmien(wybrane.length, 'transakcję', 'transakcje', 'transakcji')} do operatu.`, {
    rodzaj: razem >= 3 ? 'sukces' : 'ostrzezenie', grupa: SZUK_GRUPA,
    szczegoly: razem < 3
      ? `W operacie jest teraz ${razem} ${window.OperoSzukanie.odmien(razem, 'transakcja', 'transakcje', 'transakcji')}. `
        + 'Do wyceny porównawczej to mało — dobierz więcej albo uzasadnij w operacie, dlaczego tyle wystarczy.'
      : `W operacie jest teraz ${razem} transakcji. Oceny cech rynkowych uzupełnij w tabeli — import ich nie zgaduje.`,
  });
  szukZaznaczone = new Set();
  szukRysuj();
}

async function szukDopiszDoBazy(){
  const S = window.OperoSzukanie;
  const t = S.transakcje(szukPrzebieg);
  if (!t.length) return;
  const r = await bazaZapiszZWyciagu(t, `Szukanie transakcji — ${S.opisKryteriow(szukPrzebieg.kryteria)}`);
  if (!r) return;
  mowi(r.dodane
    ? `Do Twojej bazy rynku trafiło ${r.dodane} ${S.odmien(r.dodane, 'transakcja', 'transakcje', 'transakcji')}`
      + `${r.pominiete ? ` (${r.pominiete} już tam było)` : ''}. Łącznie masz w niej ${r.razem}.`
    : `Wszystkie ${r.pominiete} transakcji były już w Twojej bazie. Łącznie masz w niej ${r.razem}.`,
    { rodzaj: 'sukces', grupa: SZUK_GRUPA });
}

function szukWczytajWklejone(){
  const S = window.OperoSzukanie;
  const tekst = $('#szukWklejenie')?.value || '';
  const w = S.zWklejenia(tekst, { zrodlo: 'deweloperuch.pl' });
  const stan = $('#szukWklejenieStan');
  if (stan){
    stan.textContent = w.komunikat + (w.odrzucone.length
      ? ` Nierozpoznane: ${w.odrzucone.slice(0, 2).map(x => x.powod).join('; ')}.` : '');
    stan.dataset.waga = w.ok ? (w.odrzucone.length ? 'ostrzezenie' : 'sukces') : 'blad';
  }
  if (!w.ok){
    mowi(w.komunikat, { rodzaj: 'ostrzezenie', grupa: SZUK_GRUPA, pasek: false });
    return;
  }
  const d = S.dopasuj(w.wiersze, szukPrzebieg.kryteria);
  S.zakoncz(szukPrzebieg, 'deweloperuch', {
    ile: d.doPokazania.length, pozycje: d.doPokazania,
    zrodlo: S.opisPrzepisanych('deweloperuch.pl'),
    powod: d.doPokazania.length
      ? `sprawdzony — przepisałeś stąd ${d.doPokazania.length} ${S.odmien(d.doPokazania.length, 'wiersz', 'wiersze', 'wierszy')}`
      : 'sprawdzony — wklejone wiersze nie przeszły kryteriów nawet z zapasem',
  });
  // Serwis jest ZAMKNIETY, nawet gdy nic z niego nie weszlo. Etap, ktory
  // zostaje w "sprawdzam...", wyglada jak zawieszony program.
  const etapSerw = S.etap(szukPrzebieg, 'deweloperuch');
  if (etapSerw) etapSerw.stan = S.STAN.SPRAWDZONY;
  szukKolejkaUstaw();
  // Wklejone wiersze sa cudze i nieweryfikowane, wiec NIE zaznaczamy ich
  // z gory - nawet tych, ktore trafily w kryteria. Kazdy z nich rzeczoznawca
  // bierze na siebie osobno.
  szukRysuj();
  mowi(`${w.komunikat} Do wyników weszło ${d.doPokazania.length}`
    + (d.zZapasu.length ? `, w tym ${d.zZapasu.length} z zapasu ±${szukPrzebieg.kryteria.zapasPct}%` : '') + '.', {
    rodzaj: 'odpowiedz', grupa: SZUK_GRUPA,
    szczegoly: 'To dane przepisane z cudzego serwisu — przed oparciem na nich wyceny sprawdź je w akcie albo w wyciągu.',
    zrodlo: S.opisPrzepisanych('deweloperuch.pl'),
  });
}

/**
 * Wczytanie prosto ze schowka.
 *
 * Rzeczoznawca zaznacza tabele w serwisie, wciska Ctrl+C, wraca do programu
 * i naciska JEDEN przycisk - lista pojawia sie w programie z okienkami do
 * zaznaczania, tak samo jak transakcje z rejestru. Bez klikania w pole,
 * bez Ctrl+V, bez zastanawiania sie, gdzie to wkleic.
 *
 * Program nadal nie pobiera z cudzego serwisu sam - kopiuje czlowiek, i to
 * jego decyzja trafia potem do operatu jako „dane przepisane przez
 * rzeczoznawce". Ale wszystko po tej decyzji robi juz program.
 */
async function szukZeSchowka(){
  let tekst = '';
  try {
    const r = await window.operatAPI.readClipboardText();
    tekst = String(r?.text || '');
  } catch { tekst = ''; }
  if (!tekst.trim()){
    const stan = $('#szukWklejenieStan');
    if (stan){
      stan.textContent = 'W schowku nic nie ma. Zaznacz tabelę w serwisie, wciśnij Ctrl+C i spróbuj jeszcze raz.';
      stan.dataset.waga = 'ostrzezenie';
    }
    return;
  }
  const pole = $('#szukWklejenie');
  if (pole) pole.value = tekst;
  szukWczytajWklejone();
}

function szukPelnyEkran(wlacz){
  const okno = $('#szukOverlay .szuk-okno');
  const guzik = $('#szukPelny');
  if (!okno) return;
  const stan = wlacz === undefined ? !okno.classList.contains('szuk-pelny-ekran') : Boolean(wlacz);
  okno.classList.toggle('szuk-pelny-ekran', stan);
  if (guzik){
    guzik.setAttribute('aria-pressed', String(stan));
    guzik.textContent = stan ? '⤡ Zwykły rozmiar' : '⤢ Cały ekran';
  }
}

function szukZwinGore(wlacz){
  const okno = $('#szukOverlay .szuk-okno');
  const guzik = $('#szukZwin');
  if (!okno) return;
  const stan = wlacz === undefined ? !okno.classList.contains('szuk-zwinieta') : Boolean(wlacz);
  okno.classList.toggle('szuk-zwinieta', stan);
  if (guzik){
    guzik.setAttribute('aria-expanded', String(!stan));
    guzik.textContent = stan ? '⌄ Rozwiń górę' : '⌃ Zwiń górę';
  }
}

/** Przeciaganie uchwytu: okno rosnie, a razem z nim tabela wynikow. */
function szukUchwytPodepnij(){
  const uchwyt = $('#szukUchwyt');
  const okno = $('#szukOverlay .szuk-okno');
  if (!uchwyt || !okno || uchwyt.dataset.podpiety) return;
  uchwyt.dataset.podpiety = '1';
  let startY = 0, startH = 0, ciagnie = false;
  const rusz = (e) => {
    if (!ciagnie) return;
    const y = (e.touches ? e.touches[0].clientY : e.clientY);
    const nowa = Math.max(420, Math.min(window.innerHeight * 0.96, startH + (y - startY)));
    okno.style.height = `${Math.round(nowa)}px`;
    okno.style.maxHeight = `${Math.round(nowa)}px`;
  };
  const koniec = () => {
    ciagnie = false;
    document.removeEventListener('mousemove', rusz);
    document.removeEventListener('mouseup', koniec);
  };
  uchwyt.addEventListener('mousedown', (e) => {
    ciagnie = true;
    startY = e.clientY;
    startH = okno.getBoundingClientRect().height;
    document.addEventListener('mousemove', rusz);
    document.addEventListener('mouseup', koniec);
    e.preventDefault();
  });
}

/* ------------------------------------------------- kontrola zrodel */

// Ostatni znany stan uslug. Trzymany w pamieci sesji, zeby okno szukania
// pokazywalo go od razu po otwarciu, a nie dopiero po kolejnym sprawdzeniu.
let zrodlaStanZdrowia = null;
let zrodlaSprawdzanie = false;

function zrodlaRysujZdrowie(){
  const Z = window.OperoZrodlaKontrola;
  const lista = $('#szukZdrowieLista'), opis = $('#szukZdrowieOpis');
  if (!Z || !lista || !opis) return;
  if (!zrodlaStanZdrowia){
    lista.innerHTML = '';
    opis.textContent = zrodlaSprawdzanie ? 'Sprawdzam źródła…' : 'Źródła nie były jeszcze sprawdzane w tej sesji.';
    opis.dataset.waga = 'info';
    return;
  }
  lista.innerHTML = Z.ZRODLA.map(z => {
    const w = zrodlaStanZdrowia[z.id] || { stan: 'nieznany' };
    return `<span class="szuk-zdrowie-pozycja" data-stan="${w.stan}" title="${escapeHTML(z.nazwa + ' — ' + Z.opisWpisu(w))}">`
      + `${escapeHTML(z.skrot)}<i>${escapeHTML(Z.opisWpisu(w))}</i></span>`;
  }).join('');
  const pod = Z.podsumowanie(zrodlaStanZdrowia);
  opis.textContent = pod.tekst;
  opis.dataset.waga = pod.waga;
}

/**
 * Sprawdzenie uslug. Rzeczoznawca ma wiedziec PRZED szukaniem, czy ma sens
 * czekac — a nie dowiadywac sie po trzydziestu sekundach ciszy.
 *
 * Wynik laduje tez w pasku u gory, bo to jest informacja zwrotna o procesie,
 * a wszystkie takie maja byc widoczne nad trescia.
 */
async function zrodlaSprawdzTeraz({ cicho = false } = {}){
  if (zrodlaSprawdzanie) return null;
  zrodlaSprawdzanie = true;
  const btn = $('#szukSprawdzZrodla');
  if (btn){ btn.disabled = true; btn.textContent = 'Sprawdzam…'; }
  zrodlaRysujZdrowie();
  if (!cicho) mowiEtap('Sprawdzam, czy publiczne źródła odpowiadają.', SZUK_GRUPA);
  try {
    const r = await window.operatAPI.zrodlaSprawdz({});
    zrodlaStanZdrowia = r?.stan || null;
    const pod = r?.podsumowanie || window.OperoZrodlaKontrola?.podsumowanie(zrodlaStanZdrowia);
    if (!cicho || (pod && pod.milczy)){
      mowi(pod?.tekst || 'Sprawdziłem źródła.', {
        rodzaj: pod?.waga === 'sukces' ? 'sukces' : pod?.waga === 'blad' ? 'blad' : pod?.waga === 'ostrzezenie' ? 'ostrzezenie' : 'info',
        grupa: SZUK_GRUPA,
        szczegoly: window.OperoZrodlaKontrola
          ? window.OperoZrodlaKontrola.ZRODLA.map(z => `${z.skrot}: ${window.OperoZrodlaKontrola.opisWpisu((zrodlaStanZdrowia || {})[z.id])}`).join(' · ')
          : '',
      });
    }
    return r;
  } catch (e){
    mowi('Nie udało się sprawdzić źródeł: ' + cleanRemoteError(e), { rodzaj: 'blad', grupa: SZUK_GRUPA });
    return null;
  } finally {
    zrodlaSprawdzanie = false;
    if (btn){ btn.disabled = false; btn.textContent = 'Sprawdź źródła'; }
    zrodlaRysujZdrowie();
  }
}

function hookSzukanie(){
  $('#szukZamknij')?.addEventListener('click', szukZamknij);
  $('#szukPelny')?.addEventListener('click', () => szukPelnyEkran());
  $('#szukZwin')?.addEventListener('click', () => szukZwinGore());
  $('#szukZeSchowka')?.addEventListener('click', szukZeSchowka);
  $('#szukTylkoTransakcje')?.addEventListener('change', () => szukRysuj());
  $('#szukOverlay')?.addEventListener('click', e => { if (e.target.id === 'szukOverlay') szukZamknij(); });
  $('#szukStart')?.addEventListener('click', szukPrzejdz);
  $('#szukSprawdzZrodla')?.addEventListener('click', () => zrodlaSprawdzTeraz());
  $('#szukCofnij')?.addEventListener('click', szukCofnijWstawione);
  $('#szukSerwisNic')?.addEventListener('click', szukSerwisOdhacz);
  $('#audytUruchom')?.addEventListener('click', audytUruchom);
  $('#audytPer')?.addEventListener('click', audytPrzezPER);
  $('#szukWczytajPortal')?.addEventListener('click', szukPortaleWczytaj);
  $('#szukPortaleNic')?.addEventListener('click', szukPortaleOdhacz);
  $('#szukOtworzPortal')?.addEventListener('click', () => {
    const miasto = $('#szukMiasto')?.value || ofertyMiasto();
    const fraza = encodeURIComponent(`mieszkanie ${miasto} ${$('#szukDzielnica')?.value || ''}`.trim());
    window.operatAPI.openExternal(`https://www.google.com/search?q=${fraza}+ogłoszenia+sprzedaż`);
    mowi('Otwieram wyszukiwanie ogłoszeń z Twoimi kryteriami.', {
      rodzaj: 'ostrzezenie', grupa: SZUK_GRUPA, pasek: false,
      szczegoly: 'To ostateczność: ogłoszenia podają ceny ofertowe, a nie transakcyjne. '
        + 'Każdy wklejony wiersz trafi do Twojej decyzji, nie do operatu.',
    });
  });
  $('#szukKolejkaPrzyjmij')?.addEventListener('click', () => szukKolejkaDecyzja(true));
  $('#szukKolejkaOdrzuc')?.addEventListener('click', () => szukKolejkaDecyzja(false));
  $('#szukKolejkaWszystkie')?.addEventListener('click', szukKolejkaPrzyjmijReszte);
  $('#szukKolejkaKoniec')?.addEventListener('click', szukKolejkaKoniec);
  $('#szukDodaj')?.addEventListener('click', szukDodajDoOperatu);
  $('#szukDoBazy')?.addEventListener('click', szukDopiszDoBazy);
  $('#szukWczytajWklejone')?.addEventListener('click', szukWczytajWklejone);
  $('#szukWszystkie')?.addEventListener('change', (e) => {
    szukZaznaczone = new Set();
    // "Zaznacz wszystkie" obejmuje TEZ wiersze z zapasu - to jest swiadome
    // klikniecie czlowieka, a nie domysl programu.
    szukTkniete = new Set();
    if (e.target.checked){
      (szukPrzebieg?.znalezione || []).forEach((t, i) => { if (t.rodzajZrodla !== 'oferty'){ szukZaznaczone.add(i); szukTkniete.add(i); } });
    } else {
      (szukPrzebieg?.znalezione || []).forEach((t, i) => szukTkniete.add(i));
    }
    szukRysuj();
  });
  $('#szukOtworzSerwis')?.addEventListener('click', () => {
    const Z = window.OperoZrodla;
    const miasto = $('#szukMiasto')?.value || ofertyMiasto();
    const url = Z ? (Z.zrodlo('deweloperuch')?.url || (() => ''))({ miasto }) : '';
    if (url) window.operatAPI.openExternal(url);
    mowi('Otwieram serwis z Twoimi kryteriami. Zaznacz tabelę, skopiuj i wklej ją niżej — program ją rozłoży.', {
      rodzaj: 'info', grupa: SZUK_GRUPA,
      szczegoly: 'Program stamtąd nic nie pobiera sam: to, co wkleisz, wejdzie do operatu jako dane przepisane przez Ciebie, z datą i nazwą serwisu.',
    });
  });
}

/* ===========================================================================
   SKAD WZIAC CENY — JEDNO ZRODLO NARAZ
   ---------------------------------------------------------------------------
   Osiem kart jedna pod druga wygladalo jak spis tresci, a nie jak droga do
   przejscia. Czlowiek, ktory pierwszy raz otwiera te rubryke, nie wie, od
   czego zaczac, i czyta wszystko po kolei.

   Teraz widac JEDNO zrodlo - to, w ktorym program jest teraz. Sprawdzone
   zwijaja sie do jednej linijki z wynikiem, a te dalsze czekaja schowane
   i pokazuja sie dopiero wtedy, gdy poprzednie nic nie dalo. Kazdy, kto
   chce zobaczyc cala droge, rozwija ja jednym klikniecieem.
   ======================================================================== */
let zrodlaRozwiniete = false;

function zrodlaStanKroku(k){
  // Stan bierzemy z przebiegu szukania, gdy trwa - wtedy panel pokazuje
  // dokladnie to samo, co okno szukania, i nie rozjezdza sie z nim.
  const S = window.OperoSzukanie;
  const e = (S && szukPrzebieg) ? S.etap(szukPrzebieg, k.id) : null;
  if (e && e.stan !== S.STAN.CZEKA) return { stan: e.stan, ile: e.ile, opis: S.opisEtapu(e) };
  if (k.sprawdzone) return { stan: 'sprawdzone', ile: 0, opis: 'sprawdzone' };
  return { stan: 'czeka', ile: 0, opis: '' };
}

function expressRysujZrodla(){
  const Z = window.OperoZrodla; const root = $('#exZrodla');
  if (!Z || !root) return;
  const ile = (project.market?.transactions || []).length;
  const plan = Z.planSzukania({ maTransakcji: ile, potrzeba: 3,
    sprawdzone: [...zrodlaSprawdzone], miasto: project.property?.city || $('#ex_miasto')?.value || '' });

  const kroki = plan.kroki.map(k => ({ ...k, ...zrodlaStanKroku(k) }));
  const zrobione = kroki.filter(k => k.stan !== 'czeka');
  const czekaja = kroki.filter(k => k.stan === 'czeka');
  // „Teraz" to pierwsze niesprawdzone zrodlo transakcyjne, a gdy takich juz
  // nie ma - pierwsze niesprawdzone w ogole.
  const teraz = czekaja.find(k => k.rodzaj === 'transakcje') || czekaja[0] || null;
  const pozostale = czekaja.filter(k => k !== teraz);

  const przyciski = (k) => k.id === 'rcn-geoportal' ? '<button type="button" class="btn small primary" data-zrodlo-rcn="1">Szukaj</button>'
    : k.id === 'wlasna-baza' ? '<button type="button" class="btn small primary" data-zrodlo-baza="1">Pokaż</button>'
    : k.id === 'wyciag-starostwo' ? '<button type="button" class="btn small primary" data-zrodlo-plik="1">Wczytaj plik</button>'
    : k.id === 'dane-gov' ? '<button type="button" class="btn small primary" data-zrodlo-oferty="1">Szukaj</button>'
      + `<button type="button" class="btn small ghost" data-zrodlo-url="${escapeHTML(k.url)}" data-zrodlo-id="${escapeHTML(k.id)}">Otwórz katalog</button>`
    : k.url ? `<button type="button" class="btn small" data-zrodlo-url="${escapeHTML(k.url)}" data-zrodlo-id="${escapeHTML(k.id)}">Otwórz</button>`
    : '';

  const etykieta = (k) => k.rodzaj === 'transakcje' ? 'transakcje'
    : k.rodzaj === 'oferty' ? 'oferty — nie do zbioru' : 'ręcznie';

  const linijka = (k) => `
    <div class="zrodlo-linijka" data-stan="${escapeHTML(k.stan)}">
      <span class="zrodlo-znaczek">${k.stan === 'znalazl' ? '✓' : k.stan === 'blad' ? '!' : k.stan === 'pusto' ? '—' : '✓'}</span>
      <b>${escapeHTML(k.nazwa)}</b>
      <span>${escapeHTML(k.opis || 'sprawdzone')}</span>
      ${k.ile ? `<i>${k.ile}</i>` : ''}
    </div>`;

  const karta = (k, klasa) => `
    <div class="zrodlo zrodlo-${k.rodzaj}${klasa}">
      <div class="zrodlo-tekst">
        <b>${escapeHTML(k.nazwa)}</b>
        <span class="zrodlo-etykieta">${etykieta(k)}</span>
        <p>${escapeHTML(k.opis)}</p>
        <i>${escapeHTML(k.zastrzezenie)}</i>
      </div>
      <div class="zrodlo-akcja">${przyciski(k)}</div>
    </div>`;

  root.classList.remove('hidden');
  root.innerHTML = `
    <div class="zrodla-glowa" data-stan="${plan.wystarczy ? 'ok' : 'szukamy'}">
      <p>${escapeHTML(Z.komunikat(plan))}</p>
      <button type="button" class="btn small primary" data-zrodla-wszedzie="1"${szukTrwa ? ' disabled' : ''}>
        ${szukTrwa ? 'Szukam…' : 'Szukaj we wszystkich źródłach'}</button>
    </div>
    ${zrobione.length ? `<div class="zrodla-zrobione">${zrobione.map(linijka).join('')}</div>` : ''}
    ${teraz ? `<div class="zrodla-teraz">
        <span class="zrodla-teraz-etykieta">Krok ${zrobione.length + 1} z ${kroki.length} — teraz</span>
        ${karta(teraz, ' zrodlo-teraz')}
      </div>` : '<p class="zrodla-koniec">Przeszedłeś wszystkie źródła, które program zna.</p>'}
    ${pozostale.length ? `
      <button type="button" class="zrodla-wiecej" data-zrodla-wiecej="1" aria-expanded="${zrodlaRozwiniete}">
        ${zrodlaRozwiniete ? 'Ukryj listę źródeł' : `Pokaż źródła pojedynczo (${pozostale.length + (teraz ? 1 : 0)})`}
      </button>
      <div class="zrodla-lista${zrodlaRozwiniete ? '' : ' hidden'}">${pozostale.map(k => karta(k, '')).join('')}</div>` : ''}`;

  root.querySelectorAll('[data-zrodlo-url]').forEach(b => b.addEventListener('click', () => {
    zrodlaSprawdzone.add(b.dataset.zrodloId);
    window.operatAPI.openExternal(b.dataset.zrodloUrl);
    showStatus('Otwieram stronę w przeglądarce. Program stamtąd nic nie pobiera — dane przepisujesz albo wczytujesz sam.', 'info', 9000);
    expressRysujZrodla();
  }));
  root.querySelector('[data-zrodlo-rcn]')?.addEventListener('click', () => rcnZGeoportalu({}));
  root.querySelector('[data-zrodlo-oferty]')?.addEventListener('click', () => ofertySzukaj());
  root.querySelector('[data-zrodla-wszedzie]')?.addEventListener('click', () => szukOtworz());
  root.querySelector('[data-zrodlo-baza]')?.addEventListener('click', () => { zrodlaSprawdzone.add('wlasna-baza'); expressZBazy(); });
  root.querySelector('[data-zrodlo-plik]')?.addEventListener('click', () => { zrodlaSprawdzone.add('wyciag-starostwo'); rcnOtworz(); });
  root.querySelector('[data-zrodla-wiecej]')?.addEventListener('click', () => {
    zrodlaRozwiniete = !zrodlaRozwiniete;
    expressRysujZrodla();
  });
}

/* ============================================================
   POLA PILNOWANE I PODPOWIEDZI

   Najtanszy blad to ten, ktorego nie da sie popelnic. W powierzchnie nie
   wejdzie litera, w imie cyfra, a numer ksiegi wpisuje sie w trzech polach,
   dokladnie jak w EKW. Adresy podpowiadaja sie z wlasnych danych, a dopiero
   potem z panstwowej uslugi geokodowania.

   Czego ten kod NIE robi: nie podmienia tego, co wpisal czlowiek. Zle cyfry
   kontrolnej nie „poprawia", bo poprawiona trafia w inna, tez istniejaca
   ksiege - i rzeczoznawca opisalby cudza nieruchomosc.
   ============================================================ */

/** Jakiego rodzaju pilnowania wymaga pole Express o danym kluczu. */
const POLA_EXPRESS = {
  powierzchnia: 'powierzchniaLokalu', powierzchniaDzialki: 'powierzchniaDzialki',
  ilosc: 'powierzchnia', cenaJednostkowa: 'cena', czynszM2: 'cenaM2',
  stopaKap: 'stopa', pustostan: 'procent', kosztyPct: 'procent',
  zuzycieFunkcjonalne: 'procent', wiek: 'lata', trwalosc: 'lata', wartoscGruntu: 'cena',
};

/** Zrodlo wlasnych podpowiedzi: to, co rzeczoznawca ma juz u siebie. */
async function podpowiedziWczytajMiejscowosci(){
  try {
    const r = await window.operatAPI.bazaLista({});
    bazaMiejscowosci = (r?.statystyki?.miejscowosci || []).filter(m => m.nazwa && m.nazwa !== '—');
  } catch { bazaMiejscowosci = []; }
}

function podpowiedziWlasne(rodzaj){
  const P = window.OperoPodpowiedzi; if (!P) return [];
  if (rodzaj === 'miejscowosc' && bazaMiejscowosci.length){
    const zBazy = bazaMiejscowosci.map(m => ({ etykieta: m.nazwa, opis: `${m.ile}× w Twojej bazie rynku`, zrodlo: 'baza', wlasne: true }));
    return P.scal(zBazy, P.zWlasnych({
      transakcje: (project.market?.transactions || []).map(t => ({ miejscowosc: project.property?.city, adres: t.address })),
      historia: historyEntries || [], klienci: klienciCache || [], rodzaj,
    }));
  }
  return P.zWlasnych({
    transakcje: [...(project.market?.transactions || []).map(t => ({ miejscowosc: project.property?.city, adres: t.address })),
                 ...(bazaWpisy || [])],
    historia: historyEntries || [],
    klienci: klienciCache || [],
    rodzaj,
  });
}

async function podpowiedziZdalne(fraza, rodzaj, miasto){
  try { return await window.operatAPI.adresPodpowiedzi({ fraza, rodzaj, miasto }); }
  catch { return []; }
}

/** Numer ksiegi w trzech polach - tak jak na stronie EKW. */
function kwTrzyPola(pole, { naZmiane } = {}){
  const P = window.OperoPola;
  if (!pole || !P || pole.dataset.kwTrzyPola) return;
  pole.dataset.kwTrzyPola = '1';
  pole.type = 'hidden';

  const obudowa = document.createElement('div');
  obudowa.className = 'kw-trzy';
  obudowa.innerHTML = `
    <input class="kw-czesc kw-kod" maxlength="4" placeholder="GD1G" aria-label="Kod wydziału" autocomplete="off">
    <span class="kw-ukos">/</span>
    <input class="kw-czesc kw-numer" maxlength="8" inputmode="numeric" placeholder="00012345" aria-label="Numer księgi" autocomplete="off">
    <span class="kw-ukos">/</span>
    <input class="kw-czesc kw-kontrolna" maxlength="1" inputmode="numeric" placeholder="0" aria-label="Cyfra kontrolna" autocomplete="off">`;
  pole.parentElement?.insertBefore(obudowa, pole.nextSibling);
  const werdykt = document.createElement('div');
  werdykt.className = 'kw-trzy-werdykt';
  obudowa.insertAdjacentElement('afterend', werdykt);

  const kod = obudowa.querySelector('.kw-kod');
  const numer = obudowa.querySelector('.kw-numer');
  const kontrolna = obudowa.querySelector('.kw-kontrolna');

  const rozloz = (tekst) => {
    const r = P.rozbijKw(tekst);
    kod.value = r.kod; numer.value = r.numer; kontrolna.value = r.kontrolna;
  };
  if (pole.value) rozloz(pole.value);

  const oceny = () => {
    const w = P.sprawdzKw({ kod: kod.value, numer: numer.value, kontrolna: kontrolna.value });
    werdykt.textContent = w.pusty ? '' : w.powod;
    werdykt.dataset.stan = w.pusty ? 'pusty' : w.ok ? 'ok' : w.ostrzezenie ? 'uwaga' : 'zle';
    obudowa.dataset.stan = werdykt.dataset.stan;
    const pelny = w.ok ? w.pelny : '';
    if (pole.value !== pelny){
      pole.value = pelny;
      pole.dispatchEvent(new Event('input', { bubbles: true }));
      pole.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof naZmiane === 'function') naZmiane(pelny, w);
    }
    return w;
  };

  kod.addEventListener('input', () => {
    kod.value = P.filtrujKodWydzialu(kod.value);
    if (kod.value.length === 4) numer.focus();
    oceny();
  });
  numer.addEventListener('input', () => {
    numer.value = P.filtrujNumerKw(numer.value);
    if (numer.value.length === 8) kontrolna.focus();
    oceny();
  });
  kontrolna.addEventListener('input', () => { kontrolna.value = P.filtrujCyfreKontrolna(kontrolna.value); oceny(); });
  // Wklejenie calego numeru w dowolne pole rozklada go na trzy.
  obudowa.querySelectorAll('.kw-czesc').forEach(el => el.addEventListener('paste', ev => {
    const tekst = (ev.clipboardData || window.clipboardData)?.getData('text') || '';
    if (!/[0-9A-Za-z]{4}/.test(tekst)) return;
    ev.preventDefault();
    rozloz(tekst);
    oceny();
    kontrolna.focus();
  }));
  [kod, numer, kontrolna].forEach(el => el.addEventListener('blur', oceny));
  return { rozloz, oceny };
}

/** Jedno przejscie po interfejsie: pilnowanie pol i podpowiedzi adresow. */
/* ===========================================================================
   CENY OFERTOWE Z dane.gov.pl — program szuka sam i mowi, gdzie jest
   ---------------------------------------------------------------------------
   Deweloperzy maja obowiazek publikowac cenniki jako dane otwarte, wiec
   program bierze je u zrodla: nazwa dewelopera, adres pliku i data daja sie
   wtedy wskazac w operacie.

   Cala droga jest widoczna. Przy kazdym kroku program mowi, w ktorym zrodle
   jest i co znalazl - bo szukanie kilku cennikow potrafi potrwac, a cisza
   w programie zawsze wyglada jak awaria.

   Te liczby NIE WCHODZA do zbioru porownawczego i tego pilnuje modul zrodel.
   ======================================================================== */
let ofertyWynik = null;
let ofertyTrwa = false;
let ofertyOdpiecie = null;

function ofertyMiasto(){
  return (project.property?.city || $('#ex_miasto')?.value || $('#bazaMiasto')?.value || '').trim();
}

function ofertySluchajEtapow(){
  if (ofertyOdpiecie || !window.operatAPI?.onOfertyEtap) return;
  ofertyOdpiecie = window.operatAPI.onOfertyEtap((e) => {
    if (!e) return;
    ofertyRysujEtap(e);
    if (e.id === 'koniec') return;
    mowiEtap(e.opis || e.nazwa || '', 'Ceny ofertowe (dane.gov.pl)');
  });
}

function ofertyRysujEtap(e){
  const el = $('#ofertyEtapy'); if (!el) return;
  el.classList.remove('hidden');
  const znak = e.id === 'koniec' ? '✓' : '◌';
  const wiersz = document.createElement('div');
  wiersz.className = `oferty-etap${e.id === 'koniec' ? ' koniec' : ''}`;
  wiersz.innerHTML = `<span>${znak}</span><div><b>${escapeHTML(e.nazwa || '')}</b><p>${escapeHTML(e.opis || '')}</p></div>`;
  el.appendChild(wiersz);
  el.scrollTop = el.scrollHeight;
}

function ofertyPokazPanel(){
  $('#ofertyKarta')?.classList.remove('hidden');
  $('#ofertyKarta')?.scrollIntoView({ behavior: uiPrefs.motion === 'full' ? 'smooth' : 'auto', block: 'start' });
}

async function ofertySzukaj(){
  if (ofertyTrwa) return;
  const O = window.OperoOferty;
  if (!O || !window.operatAPI?.ofertySzukaj){
    mowi('Ten egzemplarz programu nie ma jeszcze modułu cen ofertowych.', { rodzaj: 'blad', grupa: 'Ceny ofertowe (dane.gov.pl)' });
    return;
  }
  const miasto = ofertyMiasto();
  ofertyTrwa = true;
  ofertySluchajEtapow();
  ofertyPokazPanel();
  const etapy = $('#ofertyEtapy'); if (etapy) etapy.innerHTML = '';
  $('#ofertySzukajBtn')?.setAttribute('disabled', 'disabled');
  $('#ofertyPodsumowanie')?.classList.add('hidden');
  mowi(`Szukam cenników deweloperów na dane.gov.pl${miasto ? ` dla ${miasto}` : ''}.`,
    { rodzaj: 'etap', grupa: 'Ceny ofertowe (dane.gov.pl)', pasek: false });

  try {
    ofertyWynik = await window.operatAPI.ofertySzukaj({ miasto });
    zrodlaSprawdzone.add('dane-gov');
    expressRysujZrodla();
    ofertyRysujWynik();
    mowi(ofertyWynik.komunikat || '', {
      rodzaj: (ofertyWynik.oferty || []).length ? 'odpowiedz' : 'ostrzezenie',
      grupa: 'Ceny ofertowe (dane.gov.pl)',
      szczegoly: ofertyWynik.statystyka?.mediana
        ? `Mediana ceny ofertowej: ${ofertyWynik.statystyka.mediana.toLocaleString('pl-PL')} zł/m², widełki `
          + `${ofertyWynik.statystyka.min.toLocaleString('pl-PL')}–${ofertyWynik.statystyka.max.toLocaleString('pl-PL')} zł/m².`
        : '',
      zrodlo: (ofertyWynik.zrodla || []).map(z => z.zbior).join('; '),
      dzialanie: (ofertyWynik.oferty || []).length ? { id: 'pokaz-oferty', napis: 'Pokaż oferty' } : null,
      pasek: false,
    });
  } catch (e){
    mowi(`Nie udało się pobrać cenników z dane.gov.pl: ${e?.message || e}`,
      { rodzaj: 'blad', grupa: 'Ceny ofertowe (dane.gov.pl)' });
  } finally {
    ofertyTrwa = false;
    $('#ofertySzukajBtn')?.removeAttribute('disabled');
    window.OperoOkno?.zakonczEtapy(oknoStan, 'Ceny ofertowe (dane.gov.pl)');
    oknoRysuj();
  }
}

function ofertyRysujWynik(){
  const O = window.OperoOferty;
  const w = ofertyWynik; if (!O || !w) return;
  const lista = w.oferty || [];
  const st = w.statystyka || O.statystyka(lista);
  const pod = $('#ofertyPodsumowanie');
  if (pod){
    pod.classList.remove('hidden');
    pod.innerHTML = `<div class="oferty-liczby">`
      + `<div><b>${lista.length}</b><span>ofert z cenników</span></div>`
      + `<div><b>${(w.zrodla || []).length}</b><span>cenników deweloperów</span></div>`
      + `<div><b>${st.mediana != null ? st.mediana.toLocaleString('pl-PL') : '—'}</b><span>mediana zł/m²</span></div>`
      + `<div><b>${st.min != null ? `${st.min.toLocaleString('pl-PL')}–${st.max.toLocaleString('pl-PL')}` : '—'}</b><span>widełki zł/m²</span></div>`
      + `</div>`
      + `<p class="oferty-ostrzezenie"><b>To ceny ofertowe, nie transakcyjne.</b> Do zbioru porównawczego nie wchodzą. `
      + `Program użyje ich w analizie rynku pierwotnego i w ocenie, czy ceny drgnęły od ostatnich transakcji.</p>`;
  }
  const tab = $('#ofertyTabela');
  if (tab){
    tab.innerHTML = lista.slice(0, 200).map(o => `<tr>`
      + `<td>${escapeHTML(o.lokal || '—')}</td>`
      + `<td>${escapeHTML(o.adres || '—')}</td>`
      + `<td>${o.powierzchnia != null ? o.powierzchnia.toLocaleString('pl-PL') : '—'}${o.powierzchniaWyliczona ? '<i class="oferty-wyliczone" title="Powierzchnia wyliczona z ceny i ceny za m² — cennik jej nie podaje.">wyl.</i>' : ''}</td>`
      + `<td>${o.cena != null ? Math.round(o.cena).toLocaleString('pl-PL') : '—'}</td>`
      + `<td>${o.jednostkowa != null ? Math.round(o.jednostkowa).toLocaleString('pl-PL') : '—'}</td>`
      + `<td>${escapeHTML(o.data || '—')}</td>`
      + `<td>${escapeHTML(o.deweloper || o.zrodloNazwa || '—')}</td></tr>`).join('')
      || '<tr><td colspan="7">Nie znaleziono żadnej oferty.</td></tr>';
  }
  const zr = $('#ofertyZrodla');
  if (zr){
    zr.innerHTML = (w.zrodla || []).map(z => `<li>${escapeHTML(z.opis)}</li>`).join('')
      || '<li>Brak źródeł do wskazania — nic nie pobrano.</li>';
  }
  const doOperatu = $('#ofertyDoOperatu');
  if (doOperatu) doOperatu.classList.toggle('hidden', !lista.length);
}

/**
 * Oferty do operatu wchodza TYLKO jako analiza rynku - nigdy do zbioru
 * porownawczego. Modul zrodel sprawdza to jeszcze raz, zeby zmiana w tym
 * miejscu nie mogla tego obejsc po cichu.
 */
function ofertyDoAnalizyRynku(){
  const Z = window.OperoZrodla, O = window.OperoOferty;
  const w = ofertyWynik; if (!w || !(w.oferty || []).length) return;
  const wolno = Z ? Z.woloDoZbioru('dane-gov') : { wolno: false, powod: '' };
  if (wolno.wolno){
    mowi('Coś jest nie tak: program uznał ceny ofertowe za materiał do zbioru porównawczego. Nic nie wstawiam.',
      { rodzaj: 'blad', grupa: 'Ceny ofertowe (dane.gov.pl)' });
    return;
  }
  const st = w.statystyka || O.statystyka(w.oferty);
  project.market = project.market || {};
  project.market.offerAnalysis = {
    ile: w.oferty.length,
    mediana: st.mediana, min: st.min, max: st.max,
    zrodla: (w.zrodla || []).map(z => z.opis),
    pobrano: new Date().toISOString().slice(0, 10),
    rodzaj: 'oferty',
  };
  changed();
  mowi(`Dopisałem do operatu analizę rynku pierwotnego: ${w.oferty.length} ofert, mediana ${st.mediana?.toLocaleString('pl-PL')} zł/m².`,
    { rodzaj: 'sukces', grupa: 'Ceny ofertowe (dane.gov.pl)',
      szczegoly: 'Wpisane jako ceny OFERTOWE w charakterystyce rynku. Do zbioru porównawczego nic nie weszło.',
      zrodlo: (w.zrodla || []).map(z => z.zbior).join('; ') });
}

function hookOferty(){
  $('#ofertySzukajBtn')?.addEventListener('click', ofertySzukaj);
  $('#bazaOferty')?.addEventListener('click', () => { ofertyPokazPanel(); ofertySzukaj(); });
  $('#ofertyDoOperatu')?.addEventListener('click', ofertyDoAnalizyRynku);
  $('#ofertyZamknij')?.addEventListener('click', () => $('#ofertyKarta')?.classList.add('hidden'));
}

/* ===========================================================================
   OKNO ODPOWIEDZI — jedno miejsce na wszystko, co program mówi
   ---------------------------------------------------------------------------
   Dotad odpowiedzi programu pojawialy sie tam, gdzie bylo miejsce, i trzeba
   bylo przewijac strone do gory, zeby sprawdzic, co program wlasciwie
   powiedzial. Teraz kazda odpowiedz idzie TUTAJ i tu zostaje.
   ======================================================================== */
// (stan okna odpowiedzi jest zadeklarowany wyzej, przy showStatus - bo to
// wlasnie showStatus do niego dopisuje)

/**
 * Jedna droga dla wszystkich komunikatow programu. Wszystko, co dotad
 * szlo tylko do paska statusu, idzie takze tu - pasek gasnie po kilku
 * sekundach, a okno zostaje.
 */
function mowi(tekst, { rodzaj = 'info', grupa = 'Program', szczegoly = '', zrodlo = '', dzialanie = null, pasek = true, czasPaska = 6000 } = {}){
  const O = window.OperoOkno;
  if (O && oknoStan){
    O.dodaj(oknoStan, { rodzaj, grupa, tekst, szczegoly, zrodlo, dzialanie });
    oknoRysuj();
  }
  if (pasek){
    const stanPaska = rodzaj === 'blad' ? 'error' : rodzaj === 'sukces' ? 'success' : rodzaj === 'ostrzezenie' ? 'warn' : 'info';
    // Pasek na dole pokazujemy, ale do okna juz nie dopisujemy drugi raz -
    // wlasnie to zrobilismy wyzej, z pelnym rodzajem i zadaniem.
    try { showStatusPasek(tekst, stanPaska, czasPaska); } catch {}
  }
}

/** Etap trwajacej pracy. Zastepuje poprzedni etap tego samego zadania. */
function mowiEtap(tekst, grupa, szczegoly = ''){
  mowi(tekst, { rodzaj: 'etap', grupa, szczegoly, pasek: false });
}

function oknoOtworz(otwarte = true){
  if (!oknoStan) return;
  oknoStan.otwarte = otwarte;
  if (otwarte) window.OperoOkno.oznaczPrzeczytane(oknoStan);
  oknoRysuj();
}

/**
 * Pasek odpowiedzi w gornym pasku.
 *
 * Rzeczoznawca ma widziec, co program wlasnie robi i co ostatnio powiedzial,
 * BEZ otwierania czegokolwiek. Komunikat schowany pod ikona to komunikat
 * przegapiony - a gorny pasek jest przyklejony do gory strony, wiec jedzie
 * razem z przewijaniem i jest widoczny przy kazdym polu formularza.
 *
 * Co ma pierwszenstwo, w tej kolejnosci:
 *   1. to, co TRWA (etap szukania, pisania, pobierania) - z licznikiem krokow,
 *   2. pytanie albo blad, na ktore program czeka,
 *   3. ostatnia odpowiedz.
 * Bo czlowiek, ktory czeka, chce wiedziec na co; a ten, ktoremu program
 * zadal pytanie, nie moze go przegapic.
 */
function oknoRysujPasek(){
  const O = window.OperoOkno; if (!O || !oknoStan) return;
  const pasek = $('#pasekOdp'); if (!pasek) return;

  const wToku = O.wToku(oknoStan);
  const n = O.nieprzeczytane(oknoStan);
  const pilne = n.wpisy.filter(w => w.rodzaj === O.RODZAJE.PYTANIE || w.rodzaj === O.RODZAJE.BLAD);
  const bierzacy = wToku[wToku.length - 1] || null;
  const doPokazania = O.naPasek(oknoStan);

  if (!doPokazania){ pasek.classList.add('hidden'); return; }
  pasek.classList.remove('hidden');

  const opis = O.OPISY[doPokazania.rodzaj] || O.OPISY.info;
  pasek.dataset.rodzaj = doPokazania.rodzaj;
  pasek.classList.toggle('trwa', Boolean(bierzacy));
  $('#pasekOdpZnak').textContent = opis.znak;
  $('#pasekOdpGrupa').textContent = doPokazania.grupa;
  $('#pasekOdpTekst').textContent = doPokazania.tekst
    + (doPokazania.powtorzenia > 1 ? ` (×${doPokazania.powtorzenia})` : '');
  pasek.title = [doPokazania.tekst, doPokazania.szczegoly, doPokazania.zrodlo && `Źródło: ${doPokazania.zrodlo}`]
    .filter(Boolean).join('\n');

  // Licznik krokow: ile etapow tego zadania juz bylo. Czlowiek widzi, ze
  // cos sie posuwa, a nie tylko ze „trwa".
  const krok = $('#pasekOdpKrok');
  if (krok){
    const etapyZadania = (oknoStan.wpisy || []).filter(w => w.rodzaj === O.RODZAJE.ETAP && w.grupa === doPokazania.grupa);
    const pokazKrok = Boolean(bierzacy) && etapyZadania.length > 1;
    krok.classList.toggle('hidden', !pokazKrok);
    if (pokazKrok) krok.textContent = `krok ${etapyZadania.length}`;
  }

  // Pytania i bledy maja wlasny licznik - to one blokuja prace.
  const guzikPilne = $('#pasekOdpPilne');
  if (guzikPilne){
    guzikPilne.classList.toggle('hidden', pilne.length === 0);
    guzikPilne.textContent = pilne.length === 1
      ? '1 sprawa do Ciebie'
      : `${pilne.length} ${window.OperoOferty ? window.OperoOferty.odmien(pilne.length, 'sprawa', 'sprawy', 'spraw') : 'spraw'} do Ciebie`;
  }
}

function oknoRysuj(){
  const O = window.OperoOkno; if (!O || !oknoStan) return;
  oknoRysujPasek();
  const panel = $('#oknoOdp');
  const licznik = $('#oknoOdpLicznik');
  const skrotEl = $('#oknoOdpSkrot');
  const n = O.nieprzeczytane(oknoStan);

  if (licznik){
    licznik.textContent = n.razem > 99 ? '99+' : String(n.razem);
    licznik.classList.toggle('hidden', n.razem === 0);
    licznik.classList.toggle('pilne', n.pilne > 0);
  }
  if (skrotEl) skrotEl.textContent = O.skrot(oknoStan);
  const wToku = O.wToku(oknoStan);
  $('#oknoOdpPrzycisk')?.classList.toggle('pracuje', wToku.length > 0);

  if (!panel) return;
  panel.classList.toggle('hidden', !oknoStan.otwarte);
  if (!oknoStan.otwarte) return;

  const widoczne = O.filtruj(oknoStan, { rodzaj: oknoStan.filtrRodzaj, fraza: oknoStan.filtr });
  const lista = $('#oknoOdpLista');
  if (lista){
    const grupy = new Map();
    for (const w of widoczne){
      if (!grupy.has(w.grupa)) grupy.set(w.grupa, []);
      grupy.get(w.grupa).push(w);
    }
    const bloki = [...grupy.entries()].reverse().map(([grupa, wpisy]) => {
      const wiersze = wpisy.slice().reverse().map(w => {
        const o = O.OPISY[w.rodzaj] || O.OPISY.info;
        const ile = w.powtorzenia > 1 ? `<i class="okno-ile">×${w.powtorzenia}</i>` : '';
        const trwa = w.rodzaj === 'etap' && !w.zakonczony ? ' trwa' : '';
        return `<div class="okno-wpis okno-${w.rodzaj}${trwa}">`
          + `<span class="okno-znak" title="${escapeHTML(o.nazwa)}">${o.znak}</span>`
          + `<div class="okno-tresc"><p>${escapeHTML(w.tekst)}${ile}</p>`
          + (w.szczegoly ? `<small>${escapeHTML(w.szczegoly)}</small>` : '')
          + (w.zrodlo ? `<small class="okno-zrodlo">Źródło: ${escapeHTML(w.zrodlo)}</small>` : '')
          + (w.dzialanie ? `<button type="button" class="btn ghost mini" data-okno-dzialanie="${escapeHTML(w.dzialanie.id)}">${escapeHTML(w.dzialanie.napis)}</button>` : '')
          + `</div><time>${O.godzina(w.kiedy)}</time></div>`;
      }).join('');
      return `<section class="okno-grupa"><h5>${escapeHTML(grupa)}</h5>${wiersze}</section>`;
    }).join('');
    lista.innerHTML = bloki || '<p class="okno-puste">Program nie powiedział jeszcze nic.</p>';
    lista.querySelectorAll('[data-okno-dzialanie]').forEach(b =>
      b.addEventListener('click', () => oknoDzialanie(b.dataset.oknoDzialanie)));
  }
  const ubytek = $('#oknoOdpUbytek');
  if (ubytek){
    ubytek.textContent = oknoStan.usunietych
      ? `Najstarszych ${oknoStan.usunietych} komunikatów już nie ma — okno trzyma ostatnie ${O.MAKS}.` : '';
    ubytek.classList.toggle('hidden', !oknoStan.usunietych);
  }
  window.OperoOkno.oznaczPrzeczytane(oknoStan);
  if (licznik) licznik.classList.add('hidden');
}

/** Przyciski przy komunikatach - zeby z okna dalo sie wrocic do pracy. */
function oknoDzialanie(id){
  if (!id) return;
  if (id === 'pokaz-oferty'){ switchTab('baza'); ofertyPokazPanel(); return; }
  if (id === 'pokaz-transakcje'){ rcnOtworz(); return; }
  if (id === 'pokaz-szukanie'){ szukOtworz(); return; }
  if (id === 'pokaz-express'){ switchTab('express'); return; }
  if (id.startsWith('zakladka:')){ switchTab(id.slice(9)); return; }
}

function hookOknoOdpowiedzi(){
  if (!window.OperoOkno) return;
  $('#oknoOdpPrzycisk')?.addEventListener('click', () => oknoOtworz(!oknoStan.otwarte));
  $('#pasekOdpWiecej')?.addEventListener('click', () => oknoOtworz(true));
  $('#pasekOdpPilne')?.addEventListener('click', () => {
    oknoStan.filtrRodzaj = 'pytanie';
    const r = $('#oknoOdpRodzaj'); if (r) r.value = 'pytanie';
    oknoOtworz(true);
  });
  // Klikniecie w sam pasek tez otwiera okno - calosc jest jednym przyciskiem.
  $('#pasekOdp')?.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    oknoOtworz(true);
  });
  $('#oknoOdpZamknij')?.addEventListener('click', () => oknoOtworz(false));
  $('#oknoOdpWyczysc')?.addEventListener('click', () => {
    window.OperoOkno.wyczysc(oknoStan);
    oknoRysuj();
  });
  $('#oknoOdpKopiuj')?.addEventListener('click', async () => {
    const tekst = window.OperoOkno.doTekstu(oknoStan);
    try { await navigator.clipboard.writeText(tekst); showStatus('Cała rozmowa z programem skopiowana do schowka.', 'success', 4000); }
    catch { showStatus('Nie udało się skopiować — zaznacz tekst w oknie i skopiuj ręcznie.', 'warn', 6000); }
  });
  $('#oknoOdpFiltr')?.addEventListener('input', (e) => { oknoStan.filtr = e.target.value || ''; oknoRysuj(); });
  $('#oknoOdpRodzaj')?.addEventListener('change', (e) => { oknoStan.filtrRodzaj = e.target.value || ''; oknoRysuj(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && oknoStan?.otwarte) oknoOtworz(false);
  });
  oknoRysuj();
}

/* ===========================================================================
   JEDNA RUBRYKA NA ADRES
   ---------------------------------------------------------------------------
   Czlowiek wpisuje ulice. Program pyta panstwowy rejestr punktow adresowych,
   dopisuje miejscowosc i dzielnice, a gdy ta ulica jest w kilku miastach -
   PYTA, zamiast wybrac pierwsza z listy.
   ======================================================================== */
const ADRES_ZWLOKA_MS = 450;

/**
 * Pole obok rubryki adresu: w Express szukamy po nazwie pola (`ex_miasto`),
 * w pelnym operacie po sciezce danych (`property.city`). Jedna rubryka adresu
 * obsluguje oba miejsca, wiec musi umiec znalezc sasiadow w obu.
 */
const ADRES_SCIEZKI = {
  miasto: 'property.city', dzielnica: 'property.district',
  numer: 'property.buildingNo', ulica: 'property.street',
};
function adresPoleObok(pole, klucz){
  // Formularz szybkiej wyceny: pola maja wlasne identyfikatory z prefiksem.
  if (pole.dataset.adresPrefiks) return document.getElementById(pole.dataset.adresPrefiks + klucz.charAt(0).toUpperCase() + klucz.slice(1));
  if (pole.dataset.path){
    const sciezka = ADRES_SCIEZKI[klucz];
    return sciezka ? document.querySelector(`[data-path="${sciezka}"]`) : null;
  }
  const id = String(pole.id || '').replace(/_[^_]+$/, `_${klucz}`);
  return document.getElementById(id) || document.getElementById(`ex_${klucz}`);
}

/**
 * Miasta, w ktorych rzeczoznawca pracuje. Najpierw to, co jest w operacie,
 * potem jego wlasna baza rynku, potem historia. Bez miejscowosci geokoder
 * nie znajduje ulicy po samym nazwisku - a nazwisko to wlasnie to, co
 * czlowiek pamieta i wpisuje.
 */
function adresMojeMiasta(){
  const out = [];
  const dodaj = (m) => {
    const t = String(m || '').trim();
    if (!t) return;
    if (out.some(x => x.toLowerCase() === t.toLowerCase())) return;
    out.push(t);
  };
  dodaj(project.property?.city);
  dodaj($('#ex_miasto')?.value);
  dodaj($('#bazaMiasto')?.value);
  for (const m of (bazaMiejscowosci || [])) dodaj(m.nazwa);
  for (const h of (historyEntries || []).slice(0, 12)) dodaj(h.city || h.miasto);
  return out.filter(Boolean).slice(0, 6);
}

function adresJednoPodepnij(pole){
  const A = window.OperoAdres;
  if (!pole || !A || pole.dataset.adresPodpiete) return;
  pole.dataset.adresPodpiete = '1';
  // W Express te dwa elementy stoja juz w HTML-u. W pelnym operacie pole
  // adresu jest zwyklym polem formularza, wiec dokladamy je tutaj - zeby
  // jedna rubryka adresu dzialala tak samo w obu miejscach.
  if (!pole.id) pole.id = `adres_${Math.random().toString(36).slice(2, 9)}`;
  let stan = document.getElementById(`${pole.id}_stan`);
  let wybor = document.getElementById(`${pole.id}_wybor`);
  if (!stan || !wybor){
    const gniazdo = pole.closest('label') || pole.parentNode;
    gniazdo.classList?.add('pole-adres');
    if (!stan){
      stan = document.createElement('small');
      stan.className = 'pole-adres-stan';
      stan.id = `${pole.id}_stan`;
      stan.textContent = 'Wpisz ulicę — od trzech znaków program zacznie szukać w rejestrze adresów.';
      gniazdo.appendChild(stan);
    }
    if (!wybor){
      wybor = document.createElement('div');
      wybor.className = 'pole-adres-wybor hidden';
      wybor.id = `${pole.id}_wybor`;
      gniazdo.appendChild(wybor);
    }
  }
  let timer = null, ostatnie = '';

  const powiedz = (tekst, rodzaj = 'info') => {
    if (stan){ stan.textContent = tekst; stan.dataset.rodzaj = rodzaj; }
  };

  const wypelnij = (k) => {
    const przed = {};
    for (const klucz of ['miasto', 'dzielnica']){
      const el = adresPoleObok(pole, klucz);
      if (el) przed[klucz] = el.value || '';
    }
    for (const [klucz, wartosc] of Object.entries({ miasto: k.miasto, dzielnica: k.dzielnica })){
      const el = adresPoleObok(pole, klucz);
      if (!el || !wartosc) continue;
      // Tego, co czlowiek wpisal sam, program nie nadpisuje.
      if (el.value && el.dataset.zRejestruWpisane !== '1') continue;
      el.value = wartosc;
      el.dataset.zRejestruWpisane = '1';
      el.closest('label')?.classList.remove('poprawione-recznie');
    }
    // Formularz szybkiej wyceny NIE dotyka biezacego operatu.
    if (pole.dataset.adresPrefiks) return A.uzupelnione(przed, { miasto: k.miasto, dzielnica: k.dzielnica });
    // Reszte adresu zapisujemy w projekcie - do operatu i do szukania transakcji.
    project.property = project.property || {};
    if (k.miasto) project.property.city = project.property.city || k.miasto;
    if (k.dzielnica) project.property.district = project.property.district || k.dzielnica;
    if (k.gmina) project.property.commune = k.gmina;
    if (k.powiat) project.property.county = k.powiat;
    if (k.wojewodztwo) project.property.voivodeship = k.wojewodztwo;
    if (k.kod) project.property.postcode = k.kod;
    if (Number.isFinite(k.x) && Number.isFinite(k.y)) project.property.punkt = { x: k.x, y: k.y };
    const dopisane = A.uzupelnione(przed, { miasto: k.miasto, dzielnica: k.dzielnica });
    return dopisane;
  };

  /**
   * Lista prawdziwych ulic z rejestru. Pokazujemy ja ZAWSZE, gdy cos
   * znaleziono - takze wtedy, gdy pozycja jest jedna.
   *
   * Czlowiek ma widziec, co program znalazl, i miec mozliwosc wskazania
   * czegos innego. Lista, ktora pojawia sie tylko przy niejednoznacznosci,
   * znaczy, ze w pozostalych przypadkach program wybral po cichu - a to
   * wlasnie te przypadki wchodza do operatu niesprawdzone.
   */
  const pokazWybor = (miejsca, wybranyKlucz = '') => {
    if (!wybor) return;
    if (!miejsca.length){ wybor.classList.add('hidden'); return; }
    const A2 = window.OperoAdres;
    // Naglowka listy nie powtarzamy przy kilku pozycjach: dokladnie to samo
    // zdanie stoi juz w linijce stanu nad polem, a to samo zdanie dwa razy
    // pod rzad czyta sie jak usterka.
    wybor.innerHTML = (miejsca.length === 1
      ? '<p class="pole-adres-pytanie">Rejestr zna jedną taką ulicę:</p>' : '')
      + miejsca.slice(0, 8).map((m, i) => {
        const klucz = A2.uprosc(`${m.ulica}|${m.miasto}|${m.dzielnica}`);
        const gdzie = A2.opisMiejsca(m).replace(new RegExp(`^${m.miasto}(, )?`), '') || '—';
        return `<button type="button" class="pole-adres-opcja${klucz === wybranyKlucz ? ' wybrana' : ''}" data-adres-i="${i}">`
          + `<b>${escapeHTML(m.ulica ? `ul. ${m.ulica}` : m.miasto)}</b>`
          + `<span>${escapeHTML(m.ulica ? [m.miasto, gdzie].filter(x => x && x !== '—').join(', ') : gdzie)}</span>`
          // Odmieniamy CALE wyrazenie, nie sam rzeczownik: „1 punkt adresowych"
        // to blad, ktory widac od razu i psuje zaufanie do reszty.
        + `<i>${m.ile} ${window.OperoOferty
            ? window.OperoOferty.odmien(m.ile, 'punkt adresowy', 'punkty adresowe', 'punktów adresowych')
            : 'punktów adresowych'}</i></button>`;
      }).join('');
    wybor.classList.remove('hidden');
    wybor.querySelectorAll('[data-adres-i]').forEach(b => b.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      const m = miejsca[Number(b.dataset.adresI)];
      const dopisane = wypelnij({ ...m.przyklad, ...m });
      // Nazwa ulicy w operacie pochodzi z rejestru, nie z tego, co czlowiek
      // zdazyl wpisac: wpisal „Kartu", a ulica nazywa sie „Kartuska".
      if (m.ulica && window.OperoAdres.uprosc(pole.value) !== window.OperoAdres.uprosc(m.ulica)){
        const rozbite = window.OperoAdres.rozbij(pole.value);
        pole.value = rozbite.numer ? `${m.ulica} ${rozbite.numer}` : m.ulica;
      }
      ostatnie = `${m.ulica}|${(adresPoleObok(pole, 'numer')?.value || '').trim()}|`;
      pokazWybor(miejsca, window.OperoAdres.uprosc(`${m.ulica}|${m.miasto}|${m.dzielnica}`));
      powiedz(`Wybrano: ${window.OperoAdres.opisMiejsca(m, { zUlica: true })}.`, 'sukces');
      mowi(`Adres ustalony: ${window.OperoAdres.opisMiejsca(m, { zUlica: true })}.`, {
        rodzaj: 'sukces', grupa: 'Adres nieruchomości',
        szczegoly: dopisane.length ? `Program wypełnił ${m.przyklad?.zrodlo === 'osm' ? 'z OpenStreetMap' : 'z rejestru'}: ${dopisane.join(', ')}. Sprawdź i popraw, jeżeli trzeba.` : '',
        zrodlo: m.przyklad?.zrodlo === 'osm' ? 'OpenStreetMap (© autorzy OpenStreetMap)' : 'państwowy rejestr punktów adresowych (GUGiK)', pasek: false,
      });
      changed();
    }));
  };

  /**
   * Gdy bez miejscowosci nic nie wyszlo: lista miast do jednego klikniecia.
   * Nie kazemy czlowiekowi domyslac sie, ze program potrzebuje miasta -
   * dajemy mu je wskazac tam, gdzie wlasnie patrzy.
   */
  const pokazMiastaDoSprawdzenia = (miasta, ulicaFraza) => {
    if (!wybor) return;
    wybor.innerHTML = `<p class="pole-adres-pytanie">W którym mieście szukać „${escapeHTML(ulicaFraza)}"?</p>`
      + miasta.slice(0, 6).map((m, i) =>
        `<button type="button" class="pole-adres-opcja pole-adres-miasto" data-adres-miasto="${i}">`
        + `<b>${escapeHTML(m)}</b><span>sprawdź tę ulicę w tym mieście</span></button>`).join('');
    wybor.classList.remove('hidden');
    wybor.querySelectorAll('[data-adres-miasto]').forEach(b => b.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      const m = miasta[Number(b.dataset.adresMiasto)];
      const rozbite2 = window.OperoAdres.rozbij(pole.value);
      pole.value = `${rozbite2.ulica}${rozbite2.numer ? ` ${rozbite2.numer}` : ''}, ${m}`;
      ostatnie = '';
      szukaj();
    }));
  };

  /** Przycisk drugiego zrodla. Pokazujemy go dopiero, gdy rejestr zawiodl -
   *  i tylko po kliknieciu program pyta OpenStreetMap (takie sa warunki tej
   *  uslugi: nie wolno jej odpytywac przy kazdym nacisnieciu klawisza). */
  const pokazZapas = () => {
    if (!wybor || wybor.querySelector('[data-adres-osm]')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pole-adres-opcja pole-adres-zapas'; b.dataset.adresOsm = '1';
    b.innerHTML = '<b>Szukaj w OpenStreetMap</b><span>drugie, bezpłatne źródło adresów — gdy rejestr państwowy milczy albo nie zna ulicy</span>';
    b.addEventListener('mousedown', (ev) => { ev.preventDefault(); ostatnie = ''; szukaj({ zapas: 'osm' }); });
    wybor.appendChild(b);
    wybor.classList.remove('hidden');
  };

  const szukaj = async ({ zapas = '' } = {}) => {
    const zOsm = zapas === 'osm';
    const skad = zOsm ? 'OpenStreetMap' : 'państwowy rejestr punktów adresowych (GUGiK)';
    const rozbite = A.rozbij(pole.value);
    const numerPole = adresPoleObok(pole, 'numer');
    // Numer wpisany w jedna rubryke przenosimy do pola numeru - ale nigdy nie
    // nadpisujemy tego, co czlowiek wpisal tam sam.
    if (rozbite.numer && numerPole && !numerPole.value) numerPole.value = rozbite.numer;
    const numer = (numerPole?.value || rozbite.numer || '').trim();
    const ulica = rozbite.ulica || pole.value;
    if (A.uprosc(ulica).length < A.OD_ZNAKOW){
      powiedz('Wpisz ulicę — od trzech znaków program zacznie szukać w rejestrze adresów.');
      wybor?.classList.add('hidden');
      return;
    }
    const klucz = `${ulica}|${numer}|${rozbite.miasto}|${zapas}`;
    if (klucz === ostatnie) return;
    ostatnie = klucz;
    powiedz(zOsm ? 'Szukam w OpenStreetMap…' : 'Szukam w państwowym rejestrze punktów adresowych…', 'etap');
    mowiEtap(`Szukam adresu „${ulica}${numer ? ` ${numer}` : ''}" — ${zOsm ? 'OpenStreetMap' : 'państwowy rejestr punktów adresowych'}.`, 'Adres nieruchomości');
    let w = null;
    // Miasta, w ktorych rzeczoznawca juz pracowal. Z nimi geokoder trafia
    // w samo nazwisko („chrzanowskiego"), bez nich - nie.
    const znaneMiasta = adresMojeMiasta();
    // Miejscowosc dla drugiego zrodla: z pola adresu albo z pola „Miasto" obok.
    const miastoZapasu = rozbite.miasto || (adresPoleObok(pole, 'miasto')?.value || '').trim() || project.property?.city || '';
    try { w = await window.operatAPI.adresJedno(zOsm
      ? { ulica, numer, miasto: miastoZapasu, zapas: 'osm' }
      : { ulica, numer, miasto: rozbite.miasto, znaneMiasta }); }
    catch (e){
      powiedz('Nie mogłem zapytać rejestru adresów — wpisz miejscowość i dzielnicę samodzielnie.', 'blad');
      if (!zOsm){ if (wybor) wybor.innerHTML = ''; pokazZapas(); }
      mowi(`Nie mogłem zapytać państwowego rejestru adresów: ${e?.message || e}. Miejscowość i dzielnicę wpisz samodzielnie.`,
        { rodzaj: 'blad', grupa: 'Adres nieruchomości', pasek: false });
      return;
    }
    window.OperoOkno?.zakonczEtapy(oknoStan, 'Adres nieruchomości');
    if (w.stan === 'wybor'){
      pokazWybor(w.miejsca || []);
      powiedz(zOsm ? `OpenStreetMap zna ${w.miejsca.length} takie pozycje — wskaż swoją niżej. ${w.podpis || ''}`
        : `Rejestr zna ${w.miejsca.length} takie pozycje — wskaż swoją niżej.`, 'pytanie');
      mowi(w.pytanie, { rodzaj: 'pytanie', grupa: 'Adres nieruchomości', pasek: false });
      return;
    }
    if (w.stan === 'jedno'){
      const dopisane = wypelnij(w.wybrane || {});
      // Lista zostaje widoczna takze przy jednym trafieniu - czlowiek ma
      // zobaczyc, CO program znalazl, zamiast dowiadywac sie tego z pol,
      // ktore same sie wypelnily.
      pokazWybor(w.miejsca || [], window.OperoAdres.uprosc(
        `${w.wybrane?.ulica || ''}|${w.wybrane?.miasto || ''}|${w.wybrane?.dzielnica || ''}`));
      powiedz(`${w.komunikat || 'Adres ustalony.'}${zOsm && w.podpis ? ` ${w.podpis}` : ''}`, w.numerNieZnaleziony ? 'ostrzezenie' : 'sukces');
      mowi(w.komunikat || 'Adres ustalony.', {
        rodzaj: w.numerNieZnaleziony ? 'ostrzezenie' : 'sukces', grupa: 'Adres nieruchomości',
        szczegoly: dopisane.length ? `Program wypełnił ${zOsm ? 'z OpenStreetMap' : 'z rejestru'}: ${dopisane.join(', ')}.` : '',
        zrodlo: skad, pasek: false,
      });
      changed();
      return;
    }
    wybor?.classList.add('hidden');
    if (wybor) wybor.innerHTML = '';
    if (zOsm){
      powiedz(w.pytanie || 'OpenStreetMap też nie zna tej ulicy.', 'ostrzezenie');
      mowi(w.pytanie || 'OpenStreetMap też nie zna tej ulicy.', { rodzaj: 'ostrzezenie', grupa: 'Adres nieruchomości', pasek: false });
      return;
    }
    // „Nie ma takiej ulicy" to zwykle nie prawda o ulicy, tylko o zapytaniu:
    // bez miejscowosci geokoder nie znajduje nazwiska. Mowimy wiec, czego
    // brakuje, i dajemy to doklikac zamiast kazac zgadywac.
    if (!rozbite.miasto && znaneMiasta.length){
      pokazMiastaDoSprawdzenia(znaneMiasta, ulica);
      pokazZapas();
      powiedz(`Bez miejscowości rejestr nie znajduje ulicy po samej nazwie. Wskaż miasto niżej albo dopisz je w polu.`, 'pytanie');
      mowi(`Nie znalazłem ulicy „${ulica}" bez podanej miejscowości. Państwowy rejestr szuka punktów adresowych, `
        + 'a nie nazw ulic w całej Polsce — dopisz miasto, a znajdzie.',
        { rodzaj: 'pytanie', grupa: 'Adres nieruchomości', pasek: false,
          szczegoly: `Sprawdzone warianty: ${(w.proby || []).map(x => x.opis).join(', ') || 'brak'}.` });
      return;
    }
    powiedz(`${w.pytanie || 'Nie znalazłem tej ulicy w rejestrze.'} Możesz sprawdzić drugie źródło — przycisk niżej.`, 'ostrzezenie');
    pokazZapas();
    mowi(w.pytanie || 'Nie znalazłem tej ulicy w rejestrze punktów adresowych.',
      { rodzaj: 'ostrzezenie', grupa: 'Adres nieruchomości', pasek: false });
  };

  pole.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(szukaj, ADRES_ZWLOKA_MS);
  });
  pole.addEventListener('blur', () => { clearTimeout(timer); szukaj(); });
  const numerPole = adresPoleObok(pole, 'numer');
  numerPole?.addEventListener('change', () => { ostatnie = ''; szukaj(); });
}

/* ===========================================================================
   ROZWIJANE LISTY PRZY POLACH
   ---------------------------------------------------------------------------
   Rzeczoznawca wpisuje te same wartosci w kazdym operacie. Lista oszczedza
   pisania i - wazniejsze - pilnuje, zeby to samo nazywalo sie tak samo
   w calym dokumencie. Operat, w ktorym w rozdziale 5 stoi „spoldzielcze
   wlasnosciowe prawo do lokalu", a w rozdziale 10 „SWPL", sam sobie przeczy.

   Lista jest OTWARTA: mozna wybrac klikniecieem i mozna wpisac cokolwiek
   wlasnego. Program, ktory nie pozwala wpisac prawdy, jest gorszy od programu
   bez listy - a zadna lista nie obejmie wszystkich przypadkow.
   ======================================================================== */

function listaKluczPola(el){
  // Pole Expressu nazywa sie kluczem pola, pole pelnego operatu - sciezka
  // danych. Listy maja oba rodzaje kluczy, wiec jedna lista obsluguje oba
  // miejsca i nie da sie ich rozjechac.
  return el.dataset.exPole || el.dataset.path || '';
}

function listaPodepnij(pole){
  const LS = window.OperoListy;
  if (!pole || !LS || pole.dataset.listaPodpieta) return;
  const klucz = listaKluczPola(pole);
  if (!LS.maListe(klucz)) return;
  pole.dataset.listaPodpieta = '1';
  pole.autocomplete = 'off';
  // Pole mialo jeszcze natywna liste przegladarki (atrybut `list`), ktora
  // rysuje WLASNA strzalke. Razem z nasza dawalo to dwa symbole obok siebie
  // i dwie rozne listy pod jednym polem. Zostaje jedna - nasza, bo tylko ona
  // ma opisy pozycji i pozwala dopisac wlasna wartosc.
  pole.removeAttribute('list');

  const obudowa = document.createElement('div');
  obudowa.className = 'lista-obudowa';
  pole.parentNode.insertBefore(obudowa, pole);
  obudowa.appendChild(pole);

  const guzik = document.createElement('button');
  guzik.type = 'button';
  guzik.className = 'lista-strzalka';
  guzik.setAttribute('aria-label', 'Pokaż listę');
  guzik.textContent = '▾';
  obudowa.appendChild(guzik);

  const lista = document.createElement('div');
  lista.className = 'lista-rozwijana hidden';
  obudowa.appendChild(lista);

  // Opis wybranej pozycji. Nie ozdoba: „spoldzielcze wlasnosciowe prawo do
  // lokalu" i „prawo wlasnosci lokalu" to dwie rozne rzeczy i czlowiek musi
  // widziec, ktora wlasnie wybral.
  const opis = document.createElement('small');
  opis.className = 'lista-opis hidden';
  obudowa.parentNode.insertBefore(opis, obudowa.nextSibling);

  let wybrany = -1, otwarta = false;

  const pokazOpis = () => {
    const p = LS.pozycja(klucz, pole.value);
    opis.textContent = p && p.opis ? p.opis : '';
    opis.classList.toggle('hidden', !(p && p.opis));
  };

  const rysuj = (fraza) => {
    const pozycje = LS.filtruj(klucz, fraza, 14);
    if (!pozycje.length){
      lista.innerHTML = `<div class="lista-pusto">Nic takiego nie ma na liście — wpisz własną wartość, program ją przyjmie.</div>`;
      return pozycje;
    }
    lista.innerHTML = pozycje.map((p, i) =>
      `<button type="button" class="lista-pozycja${i === wybrany ? ' wybrana' : ''}" data-lista-i="${i}">`
      + `<b>${escapeHTML(p.wartosc)}</b>${p.opis ? `<small>${escapeHTML(p.opis)}</small>` : ''}</button>`).join('');
    lista.querySelectorAll('[data-lista-i]').forEach(b => {
      b.addEventListener('mousedown', ev => { ev.preventDefault(); wez(pozycje[Number(b.dataset.listaI)]); });
    });
    return pozycje;
  };

  const otworz = (fraza = '') => {
    wybrany = -1;
    rysuj(fraza);
    lista.classList.remove('hidden');
    obudowa.classList.add('otwarta');
    otwarta = true;
  };
  const zamknij = () => { lista.classList.add('hidden'); obudowa.classList.remove('otwarta'); otwarta = false; };

  const wez = (pozycja) => {
    if (!pozycja) return;
    pole.value = pozycja.wartosc;
    zamknij();
    pokazOpis();
    pole.dispatchEvent(new Event('input', { bubbles: true }));
    pole.dispatchEvent(new Event('change', { bubbles: true }));
  };

  // Strzalka pokazuje CALA liste. Tak sie rozumie strzalke przy polu, a poza
  // tym pola bywaja wypelnione wartoscia spoza listy - filtrowanie nia dawaloby
  // puste okienko i wygladalo na usterke.
  guzik.addEventListener('click', () => {
    if (otwarta){ zamknij(); return; }
    pole.focus();
    otworz('');
  });
  // Pisanie filtruje i otwiera liste samo. Czlowiek, ktory zaczyna pisac
  // „kredyt", szuka pozycji - nie ma powodu kazac mu jeszcze klikac strzalke.
  pole.addEventListener('input', () => {
    wybrany = -1;
    if (pole.value.trim()) otworz(pole.value); else if (otwarta) rysuj('');
    pokazOpis();
  });
  pole.addEventListener('focus', () => { if (pole.value.trim()) return; otworz(''); });
  pole.addEventListener('blur', () => setTimeout(() => { zamknij(); pokazOpis(); }, 140));
  pole.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && !otwarta){ otworz(pole.value); e.preventDefault(); return; }
    if (!otwarta) return;
    const pozycje = LS.filtruj(klucz, pole.value, 14);
    if (e.key === 'ArrowDown'){ wybrany = Math.min(wybrany + 1, pozycje.length - 1); rysuj(pole.value); e.preventDefault(); }
    else if (e.key === 'ArrowUp'){ wybrany = Math.max(wybrany - 1, 0); rysuj(pole.value); e.preventDefault(); }
    else if (e.key === 'Enter' && wybrany >= 0){ wez(pozycje[wybrany]); e.preventDefault(); }
    else if (e.key === 'Escape'){ zamknij(); }
  });
  pokazOpis();
}

/** Podpina listy do wszystkiego, co w danym zasiegu ma liste wartosci. */
/* ------------------------------------------------- wspomaganie przy liczbach */

/**
 * Suwak, krokowanie i szybkie wartosci pod polem liczbowym.
 *
 * Pokazuje sie dopiero po wejsciu w pole, zeby formularz nie zamienil sie
 * w sciane suwakow. Znika, gdy czlowiek stamtad wyjdzie i niczego nie dotyka.
 */
function liczbyPodepnij(pole){
  const L = window.OperoLiczby;
  if (!pole || !L) return null;
  if (pole.dataset.liczbyPodpiete){
    return (pole.closest('label') || pole.parentNode)?.querySelector(':scope > .liczby-panel') || null;
  }
  if (pole.tagName !== 'INPUT') return null;
  if (['checkbox', 'date', 'radio', 'file', 'color'].includes(pole.type)) return null;

  // Pole z rozwijana lista to pole SLOWNE, nawet gdy w nazwie albo wsrod
  // pozycji listy pada slowo „wartosc" czy „cena". Panel liczbowy przy
  // „Rodzaju prawa" wstawial tam 400 000 zl — do pola, w ktorym ma stac
  // „prawo wlasnosci".
  if (pole.dataset.listaPodpieta || pole.hasAttribute('list')) return null;
  if (window.OperoListy && window.OperoListy.maListe(listaKluczPola(pole))) return null;
  if (pole.closest('.lista-obudowa')) return null;
  // Rodzaj rozpoznajemy po SAMEJ NAZWIE pola, a nie po calym tekscie
  // etykiety: w etykiecie siedza tez podpowiedzi i pozycje list, a w nich
  // moze pasc dowolne slowo.
  const naglowek = pole.closest('label')?.querySelector(':scope > .pole-naglowek');
  let etykieta = '';
  if (naglowek){
    const kopia = naglowek.cloneNode(true);
    kopia.querySelectorAll('button, .pole-znacznik, .help-dot').forEach(x => x.remove());
    etykieta = kopia.textContent || '';
  }
  else {
    const lab = pole.closest('label');
    etykieta = lab ? [...lab.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join(' ') : '';
  }
  const rodzaj = L.rodzaj(listaKluczPola(pole), etykieta.trim());
  if (!rodzaj) return null;
  pole.dataset.liczbyPodpiete = '1';

  const gniazdo = pole.closest('label') || pole.parentNode;
  // Przerysowanie formularza podmienia samo POLE, a etykieta zostaje. Bez tego
  // sprzatania kazde przerysowanie zostawialoby w niej kolejny panel: po
  // godzinie pracy pod jedna rubryka wisialoby kilkanascie suwakow, a klikniecie
  // trafialo w ten najstarszy, ktory juz niczego nie obsluguje.
  gniazdo.querySelectorAll(':scope > .liczby-panel').forEach(x => x.remove());
  const panel = document.createElement('div');
  panel.className = 'liczby-panel hidden';
  gniazdo.appendChild(panel);

  const suwak = document.createElement('input');
  suwak.type = 'range';
  suwak.className = 'liczby-suwak';
  suwak.setAttribute('aria-label', `Ustaw: ${etykieta.trim()}`);

  const rzad = document.createElement('div');
  rzad.className = 'liczby-rzad';
  const minus = document.createElement('button');
  minus.type = 'button'; minus.className = 'liczby-krok'; minus.textContent = '−';
  minus.title = `Mniej o ${rodzaj.krok}`;
  const plus = document.createElement('button');
  plus.type = 'button'; plus.className = 'liczby-krok'; plus.textContent = '+';
  plus.title = `Więcej o ${rodzaj.krok}`;
  const teraz = document.createElement('b');
  teraz.className = 'liczby-teraz';
  const szybkie = document.createElement('div');
  szybkie.className = 'liczby-szybkie';

  rzad.append(minus, teraz, plus, szybkie);
  panel.append(suwak, rzad);
  if (rodzaj.opis){
    const opis = document.createElement('small');
    opis.className = 'liczby-opis';
    opis.textContent = rodzaj.opis;
    panel.appendChild(opis);
  }

  // Zmiana pola przerysowuje formularz, a przerysowanie potrafi PODMIENIC
  // element. Trzymanie sie starej referencji konczylo sie tym, ze pierwsze
  // klikniecie dzialalo, a kazde nastepne ustawialo wartosc na wyrzuconym
  // ze strony polu — czyli nigdzie. Dlatego za kazdym razem siegamy po pole
  // ZYWE, po jego kluczu.
  const sel = pole.dataset.path ? `[data-path="${pole.dataset.path}"]`
    : pole.dataset.exPole ? `[data-ex-pole="${pole.dataset.exPole}"]` : '';
  const zywe = () => (sel ? document.querySelector(sel) : null) || pole;

  const ustaw = (n, odSuwaka) => {
    const x = Math.round(n / (rodzaj.krok || 1)) * (rodzaj.krok || 1);
    const el = zywe();
    // Pole `type="number"` NIE PRZYJMUJE polskiego przecinka — wpisanie
    // „55,1" czysci je do pustego. Tam zapisujemy z kropka, a w zwyklym polu
    // tekstowym po polsku, z przecinkiem.
    el.value = el.type === 'number'
      ? String(Math.round(x * 1000) / 1000)
      : L.doPola(x, rodzaj.dokladnosc);
    // `input` niesie zmiane do modelu operatu dokladnie tak samo, jak
    // pisanie z klawiatury — inaczej suwak ruszalby tylko obrazek.
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    // Po przerysowaniu ognisko wraca do pola, zeby panel nie znikal
    // czlowiekowi w polowie ustawiania.
    const wrocDoPola = () => {
      const teraz = zywe();
      if (teraz && document.activeElement !== teraz) teraz.focus({ preventScroll: true });
    };
    wrocDoPola();
    setTimeout(wrocDoPola, 0);
    odswiez(odSuwaka);
  };

  function odswiez(bezSuwaka){
    const el = zywe();
    const w = L.zPola(el.value);
    const z = L.zakres(el.value, rodzaj);
    suwak.min = String(z.min); suwak.max = String(z.max);
    suwak.step = String(L.krokSuwaka(rodzaj, z));
    if (!bezSuwaka) suwak.value = String(w == null ? z.min : w);
    teraz.textContent = L.opisWartosci(w, rodzaj);
    szybkie.querySelectorAll('button').forEach(b => {
      b.classList.toggle('wybrana', w != null && Number(b.dataset.wartosc) === w);
    });
  }

  (rodzaj.szybkie || []).forEach(v => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'liczby-chip'; b.dataset.wartosc = String(v);
    b.textContent = L.opisWartosci(v, rodzaj);
    b.addEventListener('mousedown', e => e.preventDefault());   // zeby pole nie stracilo ogniska
    b.addEventListener('click', () => ustaw(v));
    szybkie.appendChild(b);
  });

  suwak.addEventListener('input', () => ustaw(Number(suwak.value), true));
  minus.addEventListener('mousedown', e => e.preventDefault());
  plus.addEventListener('mousedown', e => e.preventDefault());
  minus.addEventListener('click', () => ustaw((L.zPola(zywe().value) ?? 0) - rodzaj.krok));
  plus.addEventListener('click', () => ustaw((L.zPola(zywe().value) ?? 0) + rodzaj.krok));
  pole.addEventListener('input', () => odswiez());

  panel.addEventListener('mouseleave', () => {
    if (document.activeElement !== zywe()) panel.classList.add('hidden');
  });
  panel._odswiez = odswiez;
  return panel;
}

/**
 * Pokazywanie panelu NA DELEGACJI, a nie na nasluchu przy kazdym polu.
 *
 * Program przerysowuje formularz po kazdej zmianie i potrafi podmienic sam
 * element. Nasluch przypiety do konkretnego pola ginie wtedy razem z nim:
 * panel zostawal w etykiecie, ale juz nigdy sie nie pokazywal, bo sluchal
 * nieistniejacego pola. Jeden nasluch na dokumencie przezywa kazde
 * przerysowanie.
 */
let liczbyDelegacja = false;
function liczbyWlaczDelegacje(){
  if (liczbyDelegacja) return;
  liczbyDelegacja = true;
  const pokazDlaPola = (el) => {
    if (!(el instanceof HTMLInputElement)) return;
    if (!el.dataset.path && !el.dataset.exPole) return;
    const panel = liczbyPodepnij(el) || (el.closest('label') || el.parentNode)?.querySelector(':scope > .liczby-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    if (typeof panel._odswiez === 'function') panel._odswiez();
  };
  // Trzy zdarzenia, bo zadne z nich samo nie wystarcza: `focusin` nie leci,
  // gdy okno programu nie ma ogniska systemowego, a dotkniecie pola na
  // ekranie dotykowym daje `click` bez `focusin`.
  document.addEventListener('focusin', (e) => pokazDlaPola(e.target));
  document.addEventListener('click', (e) => pokazDlaPola(e.target));
  document.addEventListener('input', (e) => pokazDlaPola(e.target));
  document.addEventListener('focusout', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement)) return;
    const panel = (el.closest('label') || el.parentNode)?.querySelector(':scope > .liczby-panel');
    if (!panel) return;
    // Zwloka, zeby klikniecie W PANEL nie zamykalo panelu, zanim zadziala.
    setTimeout(() => {
      if (panel.matches(':hover')) return;
      const aktywne = document.activeElement;
      if (aktywne && panel.contains(aktywne)) return;
      panel.classList.add('hidden');
    }, 160);
  });
}

function liczbyPodepnijWszystkie(zasieg = document){
  if (!window.OperoLiczby) return;
  liczbyWlaczDelegacje();
  zasieg.querySelectorAll('input[data-path], input[data-ex-pole]').forEach(liczbyPodepnij);
}

function listyPodepnij(zasieg = document){
  if (!window.OperoListy) return;
  zasieg.querySelectorAll('input[data-path], input[data-ex-pole], textarea[data-path]').forEach(el => {
    if (el.type === 'checkbox' || el.type === 'number' || el.type === 'date') return;
    listaPodepnij(el);
  });
}

function hookPola(zasieg = document){
  const P = window.OperoPola, S = window.OperoPodpowiedzi;
  // Listy podpinamy PRZED reszta: sa niezalezne od modulu pol i maja dzialac
  // takze wtedy, gdyby tamten nie wstal.
  listyPodepnij(zasieg);
  liczbyPodepnijWszystkie(zasieg);
  if (!P) return;

  // 1. Pola Express - rodzaj bierzemy z klucza pola.
  zasieg.querySelectorAll('[data-ex-pole]').forEach(el => {
    const klucz = el.dataset.exPole;
    if (klucz === 'kw'){ kwTrzyPola(el); return; }
    const rodzaj = POLA_EXPRESS[klucz];
    if (rodzaj) P.podepnij(el, { rodzaj, nazwa: el.closest('label')?.querySelector('span')?.textContent || '' });
  });

  // 2. Reszta pol liczbowych w programie. Nie zgadujemy zakresow - pilnujemy
  //    tylko tego, zeby wszedl TYLKO zapis liczby.
  zasieg.querySelectorAll('input[type="number"]').forEach(el => {
    if (el.dataset.operoLiczba) return;
    el.dataset.operoLiczba = '1';
    el.addEventListener('keydown', ev => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.key.length > 1) return;
      if (!/[0-9.,\-]/.test(ev.key)) ev.preventDefault();
    });
  });

  // 3. Imiona i nazwiska - bez cyfr.
  ['[data-path="author.name"]', '[data-path="client.name"]', '#profilName', '#klientImie']
    .forEach(sel => zasieg.querySelectorAll(sel).forEach(el => P.podepnij(el, { rodzaj: 'imie', nazwa: 'Imię i nazwisko' })));

  // 4. Numer ksiegi w operacie - te same trzy pola co w Express.
  zasieg.querySelectorAll('[data-path="legal.kwLocal"]').forEach(el => kwTrzyPola(el, {
    naZmiane: (pelny) => { project.legal.kwLocal = pelny; changed(); },
  }));

  // 5. Jedna rubryka na adres - ulica wpisana, reszta z rejestru.
  //    W Express pole jest oznaczone w HTML-u; w pelnym operacie rubryka
  //    ulicy (`property.street`) dostaje to samo zachowanie, zeby adresu nie
  //    wpisywalo sie dwa razy inaczej w dwoch miejscach programu.
  zasieg.querySelectorAll('[data-adres-jedno], [data-path="property.street"]').forEach(el => adresJednoPodepnij(el));
  zasieg.querySelectorAll('[data-path="property.city"], [data-path="property.district"]').forEach(el => {
    if (el.dataset.zRejestru) return;
    el.dataset.zRejestru = '1';
    const etykieta = el.closest('label');
    if (etykieta && !etykieta.querySelector('.pole-znacznik')){
      etykieta.classList.add('pole-z-rejestru');
      const znak = document.createElement('i');
      znak.className = 'pole-znacznik';
      znak.title = 'Program wypełnia to pole z państwowego rejestru adresów. Możesz poprawić.';
      // Tresc znacznika daje CSS, a nie wezel tekstowy: inaczej nazwa pola
      // czytana z etykiety brzmi „Miastoz rejestru" i tak trafia do podpowiedzi.
      znak.dataset.znacznik = 'z rejestru';
      (etykieta.querySelector('.pole-naglowek-tresc')
        || (etykieta.firstElementChild && etykieta.firstElementChild.tagName === 'SPAN'
          ? etykieta.firstElementChild : etykieta)).appendChild(znak);
    }
  });
  // 6. Pola wypelniane z rejestru: recznej poprawki nie blokujemy, ale gdy
  //    czlowiek je poprawi, znikaja znacznik i zapis „program dopisal".
  zasieg.querySelectorAll('[data-z-rejestru]').forEach(el => {
    if (el.dataset.operoRejestr) return;
    el.dataset.operoRejestr = '1';
    el.addEventListener('input', () => {
      if (el.dataset.zRejestruWpisane === '1'){
        delete el.dataset.zRejestruWpisane;
        el.closest('label')?.classList.add('poprawione-recznie');
      }
    });
  });

  if (!S) return;
  // 7. Podpowiedzi adresow: najpierw wlasne dane, potem panstwowa usluga.
  const miasta = ['#ex_miasto', '[data-path="property.city"]', '#bazaMiasto', '#kwaMiasto', '#kwLokalizacja'];
  // #ex_ulica jest teraz JEDNA rubryka na adres i ma wlasne rozstrzyganie
  // z rejestru punktow adresowych - dwie listy podpowiedzi na jednym polu
  // zaslanialyby sie wzajemnie.
  const ulice = ['[data-path="property.street"]', '#kwaUlica', '#kwUlica'];
  miasta.forEach(sel => zasieg.querySelectorAll(sel).forEach(el => S.podepnij(el, {
    rodzaj: 'miejscowosc',
    wlasne: () => podpowiedziWlasne('miejscowosc'),
    zdalne: (fraza) => podpowiedziZdalne(fraza, 'miejscowosc', ''),
  })));
  ulice.forEach(sel => zasieg.querySelectorAll(sel).forEach(el => S.podepnij(el, {
    rodzaj: 'ulica',
    wlasne: () => podpowiedziWlasne('ulica'),
    zdalne: (fraza) => podpowiedziZdalne(fraza, 'adres',
      ($('#ex_miasto')?.value || project.property?.city || '').trim()),
  })));
}

function hookExpress(){
  expressRysujTypy();
  $('#exWczytajRcn')?.addEventListener('click', () => { rcnOtworz(); });
  $('#exZBazy')?.addEventListener('click', () => { zrodlaSprawdzone.add('wlasna-baza'); expressZBazy(); });
  $('#exZGeoportalu')?.addEventListener('click', () => rcnZGeoportalu({}));
  $('#exPolicz')?.addEventListener('click', expressPolicz);
  $('#exCechyPodpowiedz')?.addEventListener('click', expressCechySugeruj);
  $('#exCechyWyrownaj')?.addEventListener('click', expressCechyWyrownaj);
  $('#exPrzelicz')?.addEventListener('click', () => {
    calc = obliczProjekt(); renderAll(); expressRysujWynik();
    showStatus('Przeliczone na nowo z bieżących danych operatu.', 'info', 5000);
  });
  $('#exDoKreatora')?.addEventListener('click', () => switchTab('project'));
  $('#exPotwierdzam')?.addEventListener('change', expressRysujBlokade);
  $('#exNapiszBtn')?.addEventListener('click', expressNapiszOperat);
  expressRysujRcn();
}

function hookKlienci(){
  const szukaj=$('#klienciSzukaj');
  szukaj?.addEventListener('input',()=>{ klienciFiltr=szukaj.value||''; renderKlienci(); });
  $('#klienciOdswiez')?.addEventListener('click',async()=>{ await loadHistory().catch(()=>{}); await renderKlienci(); showStatus('Książka klientów odświeżona.','info',4000); });
  $('#klienciNowy')?.addEventListener('click',()=>otworzPanelKlientaZKsiazki({},false));
  // Jedno nasluchiwanie na calej liscie zamiast podpinania kazdego przycisku
  // osobno: lista przerysowuje sie przy kazdym wpisanym znaku w wyszukiwarce.
  document.addEventListener('click',async(e)=>{
    if(e.target.closest('[data-klient-nowy]')){ otworzPanelKlientaZKsiazki({},false); return; }
    const otworz=e.target.closest('#klienciLista [data-otworz]');
    if(otworz){ openHistoryEntry(otworz.dataset.otworz); return; }
    const edytuj=e.target.closest('#klienciLista [data-edytuj]');
    if(edytuj){
      const k=klienciCache.find(x=>x.id===edytuj.dataset.edytuj);
      if(k) otworzPanelKlientaZKsiazki(k, project?.client?.id===k.id);
      return;
    }
    const przypisz=e.target.closest('#klienciLista [data-przypisz]');
    if(przypisz){
      const k=klienciCache.find(x=>x.id===przypisz.dataset.przypisz); if(!k) return;
      project.client={...k};
      uzupelnijPodstaweFormalna();
      changed({fullDynamic:true});
      renderKlientKarta();
      await renderKlienci();
      swietuj(`Operat przypisany: ${klientPodpis(k)}`,'Dane weszły do podstawy formalnej.');
      return;
    }
    const usun=e.target.closest('#klienciLista [data-usun-klienta]');
    if(usun){
      const k=klienciCache.find(x=>x.id===usun.dataset.usunKlienta); if(!k) return;
      const ile=klienciOperatyDla(k.id).length;
      // Mowimy wprost, co znika, a co zostaje. Usuniecie klienta z ksiazki NIE
      // rusza operatow - dane zleceniodawcy sa zapisane w kazdym z nich osobno.
      if(!confirm(`Usunąć z książki: ${klientPodpis(k)}?\n\n${ile?`${ile} operat(y) zostaną nietknięte — mają własną kopię danych klienta.`:'Nie ma operatów przypisanych do tego klienta.'}`)) return;
      try{
        await window.operatAPI.deleteClient(k.id);
        await renderKlienci();
        showStatus('Klient usunięty z książki. Operaty zostały nietknięte.','info',6000);
      }catch(err){ showStatus(cleanRemoteError(err),'error'); }
    }
  });
}

/* --- 3. Oferta / transakcja porównawcza ---------------------------------- */
function formularzOferty(t={}){
  return siatkaPanelu([
    {key:'address',label:'Adres albo oznaczenie',value:t.address||'',wide:true,required:true,placeholder:'np. ul. Długa 12/3, Gdańsk'},
    {key:'date',label:'Data transakcji',type:'date',value:t.date||project.valuation?.valuationDate||todayISO(),required:true},
    {key:'area',label:'Powierzchnia [m²]',type:'number',step:'0.01',min:'0',value:t.area||'',required:true},
    {key:'price',label:'Cena transakcyjna [zł]',type:'number',step:'1',min:'0',value:t.price||(t.area&&t.priceUnit?Math.round(t.area*t.priceUnit):''),hint:'Albo wpisz cenę jednostkową obok.'},
    {key:'priceUnit',label:'Cena jednostkowa [zł/m²]',type:'number',step:'0.01',min:'0',value:t.priceUnit||'',hint:'Przeliczam automatycznie z ceny i powierzchni.'},
    {key:'roomsFloor',label:'Pokoje / piętro',value:t.roomsFloor||'',placeholder:'np. 3 / 2'},
    {key:'note',label:'Źródło i uwagi',type:'textarea',value:t.note||'',wide:true,rows:2,placeholder:'akt notarialny, ogłoszenie, baza…'},
  ]);
}

function przeliczCeneOferty(){
  const pow=liczbaPola('area'), cena=liczbaPola('price'), jedn=liczbaPola('priceUnit');
  const polePow=$('#pf_area'), poleCena=$('#pf_price'), poleJedn=$('#pf_priceUnit');
  if(!polePow||!poleCena||!poleJedn) return;
  if(document.activeElement===poleJedn && pow>0) poleCena.value=Math.round(jedn*pow)||'';
  else if(pow>0 && cena>0) poleJedn.value=(cena/pow).toFixed(2);
}

function otworzPanelOferty(transakcja=null){
  const nowa=!transakcja;
  otworzPanel({
    eyebrow: nowa?'NOWA OFERTA / TRANSAKCJA':'EDYCJA POZYCJI',
    title: nowa?'Dodaj pozycję porównawczą':'Zmień pozycję porównawczą',
    lead:'Δt do daty wyceny policzy się samo. Oceny cech uzupełnisz w tabeli po zapisaniu.',
    bodyHTML:formularzOferty(transakcja||{}),
    saveLabel: nowa?'Dodaj do zbioru':'Zapisz zmiany',
    onOpen:()=>{
      ['area','price','priceUnit'].forEach(k=>$(`#pf_${k}`)?.addEventListener('input',przeliczCeneOferty));
    },
    onSave:async()=>{
      const adres=wartoscPola('address'), pow=liczbaPola('area');
      let jedn=liczbaPola('priceUnit'); const cena=liczbaPola('price');
      if(!adres){ ustawBladPanelu('Podaj adres albo oznaczenie pozycji.'); return false; }
      if(pow<=0){ ustawBladPanelu('Powierzchnia musi być większa od zera.'); return false; }
      if(!jedn && cena>0) jedn=cena/pow;
      if(jedn<=0){ ustawBladPanelu('Podaj cenę transakcyjną albo cenę jednostkową.'); return false; }
      const dane={address:adres,date:wartoscPola('date')||todayISO(),area:pow,priceUnit:Number(jedn.toFixed(2)),
                  price:cena||Math.round(jedn*pow),roomsFloor:wartoscPola('roomsFloor'),note:wartoscPola('note')};
      if(nowa){
        project.market.transactions.push({id:nextTransactionId(),monthsToValuation:0,autoMonthsToValuation:true,
          featureRatings:{},useForPair:isPairModule(),...dane});
      }else{
        Object.assign(transakcja,dane);
      }
      changed({fullDynamic:true});
      if(nowa) swietuj('Pozycja dodana do zbioru',`${adres} · ${Math.round(jedn)} zł/m². Zbiór ma teraz ${project.market.transactions.length} pozycji.`);
      else showStatus('Pozycja zaktualizowana.','info');
      return true;
    },
  });
}

/* --- 4. Gratulacje: konfetti i PER ------------------------------------ */
// Krótko i raz: 1,2 s, bez dźwięku, wyciszone w trybie Ekspert i przy
// ograniczonych animacjach. Operat to dokument urzędowy — show ma nie przeszkadzać.
function gratulacjeWlaczone(){
  if(uiPrefs.celebrate===false) return false;
  if(uiPrefs.mode==='expert') return false;
  if(uiPrefs.motion!=='full') return false;
  return true;
}

function swietuj(tytul,tresc=''){
  showStatus(tytul+(tresc?` — ${tresc}`:''),'info',6000);
  if(!gratulacjeWlaczone()) return;
  pokazGratulacje(tytul,tresc);
  wystrzelKonfetti();
}

let gratulacjeTimer=null;
function pokazGratulacje(tytul,tresc){
  const el=$('#celebrateToast'); if(!el) return;
  $('#celebrateTitle').textContent=tytul;
  $('#celebrateText').textContent=tresc||'';
  el.classList.remove('hidden');
  requestAnimationFrame(()=>el.classList.add('show'));
  clearTimeout(gratulacjeTimer);
  gratulacjeTimer=setTimeout(()=>{
    el.classList.remove('show');
    setTimeout(()=>el.classList.add('hidden'),260);
  },3200);
}

function wystrzelKonfetti(){
  const canvas=$('#confettiLayer'); if(!canvas) return;
  const ctx=canvas.getContext('2d'); if(!ctx) return;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=window.innerWidth*dpr; canvas.height=window.innerHeight*dpr;
  canvas.style.width=window.innerWidth+'px'; canvas.style.height=window.innerHeight+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  canvas.classList.remove('hidden');

  const barwy=['#c9a34a','#e4c97a','#8a6b1f','#f3e3b5','#5e8f6a'];
  // Dwa strumienie z dolnych rogow — wyglada jak wystrzal serpentyn nad toastem,
  // a nie jak kupka konfetti na srodku ekranu.
  const zrodla=[{x:window.innerWidth*0.30,y:window.innerHeight*0.86,kat:-62},
                {x:window.innerWidth*0.70,y:window.innerHeight*0.86,kat:-118}];
  const czastki=[];
  for(const z of zrodla){
    for(let i=0;i<60;i++){
      const kat=(z.kat+(Math.random()*40-20))*Math.PI/180, moc=13+Math.random()*10;
      czastki.push({x:z.x,y:z.y,vx:Math.cos(kat)*moc,vy:Math.sin(kat)*moc,
        w:5+Math.random()*6,h:3+Math.random()*5,obrot:Math.random()*Math.PI,
        obrotV:(Math.random()-0.5)*0.4,barwa:barwy[(Math.random()*barwy.length)|0],zycie:1});
    }
  }

  const start=performance.now(), czas=1400;
  (function klatka(teraz){
    const minelo=teraz-start;
    ctx.clearRect(0,0,window.innerWidth,window.innerHeight);
    for(const c of czastki){
      c.vy+=0.22; c.vx*=0.99; c.vy*=0.995; c.x+=c.vx; c.y+=c.vy; c.obrot+=c.obrotV;
      c.zycie=Math.max(0,1-minelo/czas);
      ctx.save(); ctx.globalAlpha=c.zycie; ctx.translate(c.x,c.y); ctx.rotate(c.obrot);
      ctx.fillStyle=c.barwa; ctx.fillRect(-c.w/2,-c.h/2,c.w,c.h); ctx.restore();
    }
    if(minelo<czas) requestAnimationFrame(klatka);
    else { ctx.clearRect(0,0,window.innerWidth,window.innerHeight); canvas.classList.add('hidden'); }
  })(start);
}

/* --- 5. Przypomnienia i terminy ------------------------------------------ */
let przypomnieniaCache=[];

// „Dziś" i „jutro" to doby kalendarzowe, nie 24-godzinne odcinki: o 20:00 termin
// jutro rano jest za 13 godzin, ale to nadal JUTRO.
function dniKalendarzowo(t){
  const a=new Date(t), b=new Date();
  a.setHours(0,0,0,0); b.setHours(0,0,0,0);
  return Math.round((a-b)/86400000);
}
function terminOpis(r){
  const t=Date.parse(String(r.dueAt||'')); if(!Number.isFinite(t)) return 'brak daty';
  const data=new Date(t).toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  if(t<Date.now()) return `${data} · po terminie`;
  const dni=dniKalendarzowo(t);
  if(dni<=0) return `${data} · dziś`;
  if(dni===1) return `${data} · jutro`;
  return `${data} · za ${dni} dni`;
}
function terminStan(r){
  const t=Date.parse(String(r.dueAt||''));
  if(r.done) return 'done';
  if(!Number.isFinite(t)) return '';
  if(t<Date.now()) return 'late';
  return dniKalendarzowo(t)<=1?'soon':'';
}

async function odswiezPrzypomnienia(){
  try{ przypomnieniaCache=await window.operatAPI.listReminders()||[]; }
  catch(e){ console.error(e); przypomnieniaCache=[]; }
  renderPrzypomnienia();
  return przypomnieniaCache;
}

function pilnePrzypomnienia(){
  return przypomnieniaCache.filter(r=>!r.done&&Date.parse(String(r.dueAt||''))<Date.now()+2*86400000);
}

function renderPrzypomnienia(){
  const lista=$('#remindersList'); if(!lista) return;
  const aktywne=przypomnieniaCache.filter(r=>!r.done).slice(0,6);
  lista.innerHTML=aktywne.length
    ? aktywne.map(r=>`<div class="reminder-row ${terminStan(r)}" data-termin="${escapeHTML(r.id)}">
        <span class="reminder-dot"></span>
        <div><b>${escapeHTML(r.title||'Termin')}</b><small>${escapeHTML(terminOpis(r))}${r.place?` · ${escapeHTML(r.place)}`:''}</small></div>
        <button type="button" class="reminder-done" data-zrobione="${escapeHTML(r.id)}" title="Oznacz jako załatwione">✓</button>
      </div>`).join('')
    : '<div class="reminder-empty"><b>Brak zaplanowanych terminów</b><p>Oględziny, termin oddania operatu, płatność — OPERO przypomni na tym ekranie.</p></div>';

  const licznik=$('#remindersBadge');
  if(licznik){
    const pilne=pilnePrzypomnienia().length;
    licznik.textContent=String(pilne);
    licznik.classList.toggle('hidden',!pilne);
  }
  $$('#remindersList [data-zrobione]').forEach(b=>b.addEventListener('click',async e=>{
    e.stopPropagation();
    const r=przypomnieniaCache.find(x=>x.id===b.dataset.zrobione); if(!r) return;
    try{
      await window.operatAPI.saveReminder({...r,done:true});
      await odswiezPrzypomnienia();
      showStatus('Termin oznaczony jako załatwiony.','info');
    }catch(e2){ showStatus(`Nie udało się zapisać terminu: ${cleanRemoteError(e2)}`,'error',8000); }
  }));
  $$('#remindersList [data-termin]').forEach(el=>el.addEventListener('click',()=>{
    const r=przypomnieniaCache.find(x=>x.id===el.dataset.termin);
    if(r) otworzPanelTerminu(r);
  }));
}

// Pole datetime-local mowi czasem LOKALNYM, a w pliku trzymamy UTC. Bez tej pary
// konwersji kazda edycja terminu cofala godzine o offset strefy czasowej.
function naPoleLokalne(iso){
  const t=Date.parse(String(iso||'')); if(!Number.isFinite(t)) return '';
  const d=new Date(t), pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function zPolaLokalnego(v){
  const t=Date.parse(String(v||''));
  return Number.isFinite(t)?new Date(t).toISOString():'';
}
function domyslnyTermin(){
  const d=new Date(Date.now()+86400000);
  d.setMinutes(0,0,0);
  return naPoleLokalne(d.toISOString());
}

function otworzPanelTerminu(termin=null){
  const nowy=!termin;
  otworzPanel({
    eyebrow:nowy?'NOWY TERMIN':'TERMIN',
    title:nowy?'Zaplanuj przypomnienie':'Zmień przypomnienie',
    lead:'Przypomnienie pokaże się na ekranie startowym. Przyciskiem „Do kalendarza” zapiszesz je jako plik .ics — wystarczy otworzyć, żeby wpadło do Kalendarza Google albo Outlooka.',
    bodyHTML:siatkaPanelu([
      {key:'title',label:'Czego dotyczy',value:termin?.title||'',wide:true,required:true,placeholder:'np. Oględziny lokalu przy ul. Długiej 5'},
      {key:'dueAt',label:'Data i godzina',type:'datetime-local',value:naPoleLokalne(termin?.dueAt)||domyslnyTermin(),required:true},
      {key:'kind',label:'Rodzaj',type:'select',value:termin?.kind||'oglednie',options:[
        {value:'oglednie',label:'Oględziny'},{value:'termin',label:'Termin oddania operatu'},
        {value:'platnosc',label:'Płatność'},{value:'inne',label:'Inne'}]},
      {key:'place',label:'Miejsce',value:termin?.place||'',wide:true,placeholder:'adres albo nazwa urzędu'},
      {key:'note',label:'Notatka',type:'textarea',value:termin?.note||'',wide:true,rows:2,placeholder:'co zabrać, z kim się umówiono…'},
    ])+(nowy?'':'<button type="button" id="drawerDeleteReminder" class="pf-delete">Usuń ten termin</button>'),
    saveLabel:nowy?'Zaplanuj':'Zapisz zmiany',
    onOpen:()=>{
      $('#drawerDeleteReminder')?.addEventListener('click',async()=>{
        if(!confirm('Usunąć ten termin?')) return;
        try{
          await window.operatAPI.deleteReminder(termin.id);
          await odswiezPrzypomnienia();
          zamknijPanel();
          showStatus('Termin usunięty.','info');
        }catch(e2){ ustawBladPanelu(cleanRemoteError(e2)); }
      });
    },
    onSave:async()=>{
      const tytul=wartoscPola('title'), kiedy=wartoscPola('dueAt');
      if(!tytul){ ustawBladPanelu('Napisz, czego dotyczy termin.'); return false; }
      if(!kiedy){ ustawBladPanelu('Podaj datę i godzinę.'); return false; }
      await window.operatAPI.saveReminder({
        id:termin?.id||'', title:tytul, dueAt:zPolaLokalnego(kiedy),
        kind:wartoscPola('kind'), place:wartoscPola('place'), note:wartoscPola('note'),
        projectId:project?.meta?.id||'', projectTitle:project?.meta?.title||dashboardAddress()||'',
        done:termin?.done||false,
      });
      await odswiezPrzypomnienia();
      if(nowy) swietuj('Termin zaplanowany',`${tytul} — ${terminOpis({dueAt:zPolaLokalnego(kiedy)})}.`);
      else showStatus('Termin zaktualizowany.','info');
      return true;
    },
  });
}

// Karta na ekranie startowym pokazuje szesc najblizszych — reszta (i zalatwione)
// jest tutaj, inaczej terminow nie dalo sie ani zobaczyc, ani poprawic.
function otworzPanelWszystkichTerminow(){
  const wiersz=r=>`<div class="reminder-row ${terminStan(r)} ${r.done?'zrobiony':''}" data-pelny="${escapeHTML(r.id)}">
      <span class="reminder-dot"></span>
      <div><b>${escapeHTML(r.title||'Termin')}</b><small>${escapeHTML(terminOpis(r))}${r.place?` · ${escapeHTML(r.place)}`:''}</small></div>
    </div>`;
  const aktywne=przypomnieniaCache.filter(r=>!r.done);
  const zrobione=przypomnieniaCache.filter(r=>r.done);
  otworzPanel({
    eyebrow:'TERMINY',
    title:`Wszystkie przypomnienia (${przypomnieniaCache.length})`,
    lead:'Kliknij termin, aby go poprawić albo usunąć.',
    bodyHTML:(aktywne.length?`<div class="pf-listgroup"><span class="pf-book-label">Zaplanowane</span>${aktywne.map(wiersz).join('')}</div>`:'<div class="reminder-empty"><b>Brak zaplanowanych terminów</b></div>')
      +(zrobione.length?`<div class="pf-listgroup"><span class="pf-book-label">Załatwione</span>${zrobione.map(wiersz).join('')}</div>`:''),
    saveLabel:'Zamknij',
    onOpen:()=>{
      $$('#drawerBody [data-pelny]').forEach(el=>el.addEventListener('click',()=>{
        const r=przypomnieniaCache.find(x=>x.id===el.dataset.pelny);
        if(r) otworzPanelTerminu(r);
      }));
    },
    onSave:async()=>true,
  });
}

async function eksportujTerminy(){
  try{
    const r=await window.operatAPI.exportRemindersICS({});
    if(r?.ok) showStatus(`Zapisano ${r.count} ${r.count===1?'termin':'terminy'} do pliku ${r.filePath}. Otwórz plik, aby dodać je do kalendarza.`,'info',9000);
    else if(!r?.canceled) showStatus(r?.message||'Nie udało się zapisać pliku kalendarza.','error',7000);
  }catch(e){ showStatus(cleanRemoteError(e),'error',8000); }
}

/* --- 6. Samouczek: osobny ekran, prowadzi PER ----------------------------- */
// 1.19.0: koniec z reflektorem po zywym programie. Samouczek ma teraz wlasny
// ekran i wlasny spis tresci; program czeka spokojnie w tle. Przeskakiwanie
// miedzy omawianymi miejscami odbywa sie WYLACZNIE tutaj — klikniesz temat z
// lewej albo przewiniesz strzalkami. Dopiero przycisk „Pokaz mi to w programie"
// zamyka samouczek i otwiera wlasciwe miejsce.
//
// Kazdy temat ma: dzial (do spisu), tytul, akapity (tresc), jedno zdanie od
// PER-a wlasnymi slowami, obszar na mapie okna i — opcjonalnie — zakladke oraz
// element, do ktorego umie przeskoczyc program po zamknieciu samouczka.
const PRZEWODNIK=[
  {dzial:'Zanim zaczniesz', tytul:'Czym jest OPERO', obszar:'tresc',
   akapity:[
     'OPERO to warsztat do sporządzania operatów szacunkowych. Prowadzi przez cały operat — od rodzaju wyceny, przez dane i analizę rynku, po obliczenia, kontrolę i gotowy dokument — ale nie podejmuje za Ciebie żadnej decyzji zawodowej. Metodę, wagi cech i ostateczną wartość przyjmujesz Ty.',
     'Wszystko dzieje się na Twoim komputerze. Operaty, dane klientów i pytania do asystenta nie wychodzą do sieci. Program działa także w terenie, bez zasięgu.'],
   per:'Jestem PER. Pokażę Ci program po kolei — bez pośpiechu i bez migania po ekranie.'},

  {dzial:'Zanim zaczniesz', tytul:'Jak zbudowane jest okno', obszar:'nawigacja',
   akapity:[
     'Po lewej stoi stałe menu: Start, Operaty, Historia, Wynik i Ustawienia. To pięć miejsc, między którymi krążysz przez cały czas pracy.',
     'U góry jest pasek z nazwą bieżącego operatu, wskaźnikiem kompletności, czasem licencji i szybkimi działaniami. Po prawej stronie paska siedzę ja.',
     'Środek to miejsce pracy — zmienia się zależnie od tego, gdzie jesteś.'],
   per:'Menu po lewej zostaje zawsze w tym samym miejscu. Nic Ci nie ucieknie.'},

  {dzial:'Zaczynasz operat', tytul:'Ekran Start', obszar:'tresc', tab:'dashboard', cel:'#chooseModuleBtn',
   akapity:[
     'Start pokazuje bieżący operat, procent kompletności danych i ostatnią pracę. Przycisk „Nowy operat" zakłada wycenę i od razu przenosi do pierwszego etapu.',
     'Rodzaj wyceny wybierasz raz, na początku: lokal, nieruchomość zabudowana, dochodowa, kosztowa, wywłaszczenie, opłata adiacencka i planistyczna, służebność albo nieruchomość rolna i leśna. Od tego wyboru zależy, jakich danych program będzie wymagał i jakie wzory zastosuje.'],
   per:'Jeśli masz wątpliwość, który rodzaj wybrać — opis każdego kafelka mówi, do czego służy.'},

  {dzial:'Zaczynasz operat', tytul:'Zleceniodawca', obszar:'tresc', tab:'dashboard', cel:'#clientCard',
   akapity:[
     'Klienta wprowadzasz w wysuwanym panelu, z NIP-em sprawdzanym na bieżąco. Dane wchodzą do podstawy formalnej operatu.',
     'Klient zostaje w książce, więc przy następnym zleceniu wybierzesz go jednym kliknięciem zamiast przepisywać adres i numery.'],
   per:'Podstawa formalna to pierwsza rzecz, którą czyta weryfikator. Warto ją mieć kompletną od razu.'},

  {dzial:'Zaczynasz operat', tytul:'Terminy i przypomnienia', obszar:'tresc', tab:'dashboard', cel:'#remindersCard',
   akapity:[
     'Oględziny, termin oddania operatu, płatność — zaplanowane terminy stoją na ekranie Start i po terminie zmieniają kolor.',
     'Przycisk „Do kalendarza" zapisuje je jako plik .ics, który otworzy Kalendarz Google albo Outlook.'],
   per:'Termin oględzin wpisz od razu po przyjęciu zlecenia — później łatwo o nim zapomnieć.'},

  {dzial:'Dane operatu', tytul:'Kreator prowadzi krok po kroku', obszar:'tresc', tab:'project', cel:'#wizardNext',
   akapity:[
     'Operat powstaje w stałej kolejności etapów: przedmiot i zakres, daty, stan prawny, opis nieruchomości, rynek, zbiór porównawczy, cechy i wagi, obliczenia, wynik i źródła.',
     '„Dalej" sprawdza dane krytyczne. Jeśli czegoś brakuje, program wskaże konkretne pole, zamiast pozwolić na niekompletny raport. Możesz wracać „Wstecz" ile razy chcesz — nic nie przepada.'],
   per:'Kolejność etapów nie jest przypadkowa: każdy następny korzysta z tego, co ustalono w poprzednim.'},

  {dzial:'Dane operatu', tytul:'Cztery daty, które muszą się zgadzać', obszar:'tresc', tab:'project',
   akapity:[
     'Operat ma cztery daty i każda znaczy co innego: data sporządzenia, data wyceny (na którą określamy wartość), data określenia stanu nieruchomości i data oględzin.',
     'Program pilnuje relacji między nimi i mówi wprost, gdy któraś wypada nielogicznie — bo to jedna z najczęstszych uwag weryfikatorów.'],
   per:'Datę określenia stanu i datę oględzin łatwo pomylić. Pierwsza dotyczy stanu, druga Twojej wizyty.'},

  {dzial:'Dane operatu', tytul:'Gdy nie wiesz, co dalej', obszar:'tresc', tab:'project', cel:'#showNextFieldBtn',
   akapity:[
     'Przycisk „Pokaz nastepne pole" przewija ekran do najblizszej brakujacej informacji i zostawia przy niej zloty znacznik.',
     'Ten sam ruch wykonam ja, gdy poprosisz mnie w panelu o „Co mam zrobic dalej".'],
   per:'Nie szukaj braku wzrokiem po calym formularzu — od tego jest ten przycisk.'},

  {dzial:'Rynek', tytul:'Transakcje porownawcze', obszar:'tresc', tab:'market', cel:'#addTransactionDrawer',
   akapity:[
     'Pozycje dodajesz w osobnym oknie: adres, data, powierzchnia i cena. Cene jednostkowa oraz czas do daty wyceny program liczy sam.',
     'Zbior porownawczy to serce operatu — to z niego bierze sie wartosc. Program sprawdza kompletnosc kazdej pozycji i mowi, ktorej brakuje daty, ceny albo powierzchni.'],
   per:'Niepelna transakcja to nie drobiazg — przy wyliczeniu wagi cechy potrafi przesunac wynik.'},

  {dzial:'Rynek', tytul:'Import z Excela albo CSV', obszar:'tresc', tab:'market', cel:'#importMarketSheet',
   akapity:[
     'Transakcje zebrane w arkuszu wczytasz jednym klikiem. Program czyta polskie znaki i rozpoznaje kolumny.',
     'Po imporcie wszystko sprawdzisz w tabeli — nic nie wchodzi do operatu bez Twojego spojrzenia.'],
   per:'Jesli kolumny zostana rozpoznane inaczej, niz chcesz, poprawisz je przed zatwierdzeniem.'},

  {dzial:'Rynek', tytul:'Wyciag z RCiWN', obszar:'tresc', tab:'market', cel:'#rcnOtworzBtn',
   akapity:[
     'Plik z rejestru cen wczytujesz w czterech krokach: plik, kolumny, dobor, operat.',
     'Program odrzuca darowizny, prawo uzytkowania wieczystego i duplikaty aktow, a przy kazdym odrzuconym wierszu pisze powod. Ostateczny zbior porownawczy zatwierdzasz Ty.'],
   per:'Powod odrzucenia warto przeczytac — czasem to Twoja decyzja, a nie blad danych.'},

  {dzial:'Rynek', tytul:'Cechy i wagi', obszar:'tresc', tab:'market',
   akapity:[
     'Cechy rynkowe to czynniki, ktore naprawde roznicuja ceny na badanym rynku. Kazda ma wlasna skale — dwu-, trzy- albo pieciostopniowa — i wlasna wage.',
     'Waga nie jest wartoscia domyslna. Musi zostac swiadomie przyjeta na podstawie analizy, a wszystkie wagi razem daja 1,00. Program podpowiada sugestie z par transakcji i liczy korelacje, ale decyzja nalezy do Ciebie.'],
   per:'Przy kazdej ocenie jest pole na uzasadnienie. Moge pomoc je zredagowac — nie wymyslic.'},

  {dzial:'Wynik', tytul:'Podglad i eksport', obszar:'tresc', tab:'result', cel:'#resultPdfBtn',
   akapity:[
     'Wynik to osobna sekcja: podglad A4 na zywo, kontrola koncowa i eksport do PDF albo edytora raportu.',
     'Dopoki brakuje danych krytycznych, eksport jest zablokowany. To celowe — operat z dziura w podstawie formalnej nie powinien wyjsc z programu.'],
   per:'Podglad odswieza sie na biezaco, wiec zmiane w danych widac od razu w dokumencie.'},

  {dzial:'Wynik', tytul:'Kontrola operatu', obszar:'dol', tab:'result', cel:'#kontrolaOtworzBtn',
   akapity:[
     'Osiem obszarow sprawdzanych przez caly czas pracy: przedmiot, daty, stan prawny, rynek, zbior, cechy, wynik i zrodla. Wskaznik w gornym pasku pokazuje gotowosc w procentach.',
     'Blad blokuje PDF, uwaga tylko ostrzega. Przy kazdej pozycji stoi krok, w ktorym sie ja naprawia — jedno klikniecie przenosi dokladnie tam.',
     'Osobno sprawdzane sa wymagania weryfikatora: dostep do drogi publicznej i jego dowod, zrodlo powierzchni uzytkowej, wiek wypisu z EGiB, a przy wycenie dla banku takze oswiadczenie o bezstronnosci i swiadectwo energetyczne.'],
   per:'Traktuj kontrole jak kolege, ktory czyta operat przed wyslaniem. Lepiej, zeby to on znalazl blad.'},

  {dzial:'Asystent PER', tytul:'Kim jestem i czego nie robie', obszar:'per',
   akapity:[
     'Siedze w gornym pasku. Klikniesz — otworze sie przy krawedzi okna i zostane, dopoki jestem potrzebny.',
     'Odpowiadam z Biblii OPERO: zbioru regul, wzorow, rodzajow wyceny i mapy zrodel danych, ktory lezy w folderze programu. Dziala bez internetu.',
     'Czego nie robie: nie podejmuje decyzji zawodowych, nie wpisuje wartosci i nie podmienia Twojego tekstu samo z siebie. Propozycje zawsze pokazuje OBOK oryginalu, a Ty wybierasz.'],
   per:'Jesli czegos nie wiem, powiem to wprost, zamiast zmyslac. To wazniejsze niz gladka odpowiedz.'},

  {dzial:'Asystent PER', tytul:'Model jezykowy i jego stan', obszar:'per',
   akapity:[
     'Model jezykowy jedzie w instalatorze i pracuje na Twoim komputerze. Niczego nie instalujesz i nie wklejasz zadnych kluczy.',
     'Kropka przy moim imieniu mowi, co sie dzieje: zielona — model aktualny i gotowy, zolta — jest nowsza wersja do pobrania, czerwona — modelu brak albo nie wstaje, szara — jeszcze nie sprawdzilem.',
     'Aktualizacje pobierzesz z panelu jednym przyciskiem. Nowy model trafia do folderu danych i ma pierwszenstwo przed tym z instalatora; stary zostaje jako zapas.'],
   per:'Zolta kropka nie jest pilna. Program dziala tak samo — nowszy model po prostu lepiej pisze.'},

  {dzial:'Na koniec', tytul:'Licencja sprawdzana na miejscu', obszar:'tresc', tab:'settings', cel:'#settingsLicenseKey',
   akapity:[
     'Program nie laczy sie z zadnym serwerem licencyjnym. Klucz jest podpisanym dokumentem, a podpis sprawdzany jest na tym komputerze.',
     'Dzieki temu OPERO otwiera sie takze w terenie i wtedy, gdy nie ma zasiegu.'],
   per:'Czas do konca licencji widzisz w gornym pasku przez caly czas pracy.'},

  {dzial:'Na koniec', tytul:'Ustawienia i kopia zapasowa', obszar:'tresc', tab:'settings', cel:'#settingsBackup',
   akapity:[
     'Tu wpiszesz nowy klucz, zrobisz kopie wszystkich operatow, otworzysz folder z danymi i wrocisz do tego samouczka.',
     'Jest tez tryb ograniczonych animacji — program wtedy staje w miejscu, a ja przestaje sie ruszac.'],
   per:'Kopie zrob po kazdym wiekszym operacie. Zajmuje chwile, a ratuje tydzien pracy.'},
];

const TUTOR_OBSZARY={
  nawigacja:'Menu po lewej stronie okna.',
  pasek:'Gorny pasek nad trescia.',
  tresc:'Srodek okna — miejsce pracy.',
  dol:'Dolny pas okna i wskaznik kontroli.',
  per:'Prawy koniec gornego paska — tam siedzi PER.',
};

let krokPrzewodnika=0, przewodnikAktywny=false;

function pokazPrzewodnik(od=0){
  krokPrzewodnika=Math.max(0,Math.min(PRZEWODNIK.length-1,od));
  przewodnikAktywny=true;
  // 1.20.0: samouczek staje PRZY programie, a nie na nim. Program odsuwa sie
  // w prawo i zostaje w pelni widoczny — zadnego przyciemnienia, zadnej dziury
  // w czarnej plachcie. Dzieki temu „tu jest pole daty" mozna po prostu
  // zobaczyc, zamiast wyobrazac sobie z opisu.
  $('#tutorScreen')?.classList.add('przy-boku');
  document.body.classList.add('samouczek-obok');
  $('#tutorScreen')?.classList.remove('hidden');
  const ptak=$('#tutorialPrzyStarcie');
  if(ptak) ptak.checked=!appStateCache?.tutorialDone;
  rysujSpisPrzewodnika();
  rysujKrokPrzewodnika();
  $('#tutorialNext')?.focus({preventScroll:true});
}

function hookKlawiszePrzewodnika(){
  $('#tutorialPrzyStarcie')?.addEventListener('change', async e => {
    // „Pokazuj przy uruchomieniu" to odwrotnosc „samouczek zaliczony".
    try{ await window.operatAPI.setTutorialDone(!e.target.checked); if(appStateCache) appStateCache.tutorialDone=!e.target.checked; }catch{}
  });
  $('#tutorSpis')?.addEventListener('click', e => {
    const b=e.target.closest('[data-tutor-krok]'); if(!b) return;
    krokPrzewodnika=Number(b.dataset.tutorKrok)||0;
    rysujKrokPrzewodnika();
  });
  // „Pokaz mi to w programie": JEDYNE miejsce, w ktorym samouczek rusza zywy
  // interfejs. Zamyka siebie, zeby uzytkownik zobaczyl program, a nie opis.
  // Samouczek sam przelacza program na omawiane miejsce, wiec ten przycisk nie
  // musi juz niczego pokazywac — zostaje po to, zeby ZOSTAC tam, gdzie wlasnie
  // jestesmy, i zamknac samouczek bez wracania na poczatek.
  $('#tutorialPokaz')?.addEventListener('click', async () => {
    const krok=PRZEWODNIK[krokPrzewodnika];
    await zamknijPrzewodnik(true);
    if(krok?.cel){
      setTimeout(()=>{
        const el=$(krok.cel); if(!el) return;
        el.scrollIntoView({behavior:uiPrefs.motion==='full'?'smooth':'auto',block:'center',inline:'nearest'});
        perPrzyElemencie(el, krok.per||krok.tytul);
      }, uiPrefs.motion==='full'?260:20);
    }
  });
}

async function zamknijPrzewodnik(zapamietaj=true){
  przewodnikAktywny=false;
  $('#tutorScreen')?.classList.add('hidden');
  document.body.classList.remove('samouczek-obok');
  odznaczMiejsceSamouczka();
  schowajDymekPera();
  if(zapamietaj){ try{ await window.operatAPI.setTutorialDone(true); }catch{} }
}

function rysujSpisPrzewodnika(){
  const spis=$('#tutorSpis'); if(!spis) return;
  let html='', dzial=null;
  PRZEWODNIK.forEach((k,i)=>{
    if(k.dzial!==dzial){ dzial=k.dzial; html+=`<span class="tutor-spis-dzial">${escapeHTML(dzial)}</span>`; }
    html+=`<button type="button" class="tutor-spis-poz" data-tutor-krok="${i}"><i>${i+1}</i>${escapeHTML(k.tytul)}</button>`;
  });
  spis.innerHTML=html;
}

function rysujKrokPrzewodnika(){
  const krok=PRZEWODNIK[krokPrzewodnika]; if(!krok) return;
  $('#tutorialTitle').textContent=krok.tytul;
  const top=$('#tutorialTitleTop'); if(top) top.textContent=krok.dzial||'Samouczek';
  const tresc=$('#tutorialText');
  if(tresc) tresc.innerHTML=(krok.akapity||[]).map(a=>`<p>${escapeHTML(a)}</p>`).join('');
  const dymek=$('#tutorialPer'); if(dymek) dymek.textContent=krok.per||'';
  $('#tutorialCount').textContent=`KROK ${krokPrzewodnika+1} Z ${PRZEWODNIK.length}`;
  $('#tutorialPrev').disabled=krokPrzewodnika===0;
  $('#tutorialNext').textContent=krokPrzewodnika===PRZEWODNIK.length-1?'Zacznij pracę':'Dalej →';
  const pasek=$('#tutorialProgressFill');
  if(pasek) pasek.style.width=`${Math.round((krokPrzewodnika+1)/PRZEWODNIK.length*100)}%`;

  // mapa okna: zapala sie tylko omawiany obszar
  $$('#tutorScreen .tm-obszar').forEach(o=>o.classList.toggle('aktywny', o.dataset.obszar===krok.obszar));
  const opisMapy=$('#tutorMapaOpis');
  if(opisMapy) opisMapy.textContent=TUTOR_OBSZARY[krok.obszar]||'';

  const nazwy={dashboard:'Start',project:'Operat',market:'Rynek',result:'Wynik',history:'Historia',settings:'Ustawienia'};
  const gdzie=$('#tutorialGdzie');
  if(gdzie){
    // Program obok juz przeskoczyl we wlasciwe miejsce, wiec piszemy, GDZIE
    // patrzec, a nie gdzie tego szukac.
    gdzie.textContent=krok.tab?`Patrz obok: zakładka „${nazwy[krok.tab]||krok.tab}" — to miejsce jest obwiedzione.`:'';
    gdzie.classList.toggle('hidden',!krok.tab);
  }
  const pokaz=$('#tutorialPokaz');
  if(pokaz) pokaz.classList.toggle('hidden',!krok.tab);

  $$('#tutorSpis [data-tutor-krok]').forEach(b=>b.classList.toggle('active',Number(b.dataset.tutorKrok)===krokPrzewodnika));
  $(`#tutorSpis [data-tutor-krok="${krokPrzewodnika}"]`)?.scrollIntoView({block:'nearest'});
  $('#tutorScreen .tutor-tresc')?.scrollTo({top:0,behavior:uiPrefs.motion==='full'?'smooth':'auto'});
  // PER reaguje mina na to, o czym wlasnie mowi.
  setPiorekState($('#tutorPiorek'), krokPrzewodnika===PRZEWODNIK.length-1?'success':'explain', {restart:true});
  // ...a program pod spodem pokazuje DOKLADNIE to miejsce.
  pokazMiejsceSamouczka(krok).catch(()=>{});
}

/* --- gdzie dokladnie jestesmy: samouczek prowadzi program za reke --------- */
// Zaznaczenie to spokojna obwodka wokol omawianej karty. Celowo NIE jest to
// reflektor: nic nie gasnie, reszta ekranu zostaje tak samo czytelna, wiec
// widac rzecz omawiana RAZEM z jej otoczeniem — a o to w operacie chodzi.
// Sprzatamy po WSZYSTKICH zaznaczeniach, a nie po ostatnio zapamietanym: przy
// szybkim przeskakiwaniu tematow dwa wywolania potrafily sie wyprzedzic i na
// ekranie zostawaly dwie obwodki naraz.
function odznaczMiejsceSamouczka(){
  for(const el of $$('.samouczek-tu')) el.classList.remove('samouczek-tu');
}
// Znacznik biezacego pokazu: gdy uzytkownik przeskoczy dalej w trakcie
// przewijania, starsze wywolanie ma po cichu odpasc zamiast dorysowac swoje.
let samouczekPokaz=0;

/** Rozwija wszystko, co zaslania element: zwiniete <details> i ukryte sekcje. */
function odslonDrogeDo(el){
  let w=el;
  while(w&&w!==document.body){
    if(w.tagName==='DETAILS'&&!w.open) w.open=true;
    // Karta schowana przez wlasna zakladke wewnetrzna (np. dzialy EKW).
    if(w.classList?.contains('hidden')&&w.id) w.classList.remove('hidden');
    w=w.parentElement;
  }
}

async function pokazMiejsceSamouczka(krok){
  if(!przewodnikAktywny||!krok) return;
  const moj=++samouczekPokaz;
  odznaczMiejsceSamouczka();
  if(!krok.tab){ schowajDymekPera(); return; }
  // Przelaczenie zakladki jest TUTAJ zamierzone: samouczek ma pokazac, gdzie
  // jestesmy. Poza samouczkiem program nigdy nie przelacza sie sam.
  switchTab(krok.tab);
  if(!krok.cel){ schowajDymekPera(); return; }
  await new Promise(r=>setTimeout(r, uiPrefs.motion==='full'?240:20));
  if(moj!==samouczekPokaz||!przewodnikAktywny) return;
  const el=$(krok.cel); if(!el) return;
  odslonDrogeDo(el);
  const karta=el.closest('.card,.feature-card,.hero-card,.settings-card')||el;
  odznaczMiejsceSamouczka();
  karta.classList.add('samouczek-tu');
  el.scrollIntoView({behavior:uiPrefs.motion==='full'?'smooth':'auto',block:'center',inline:'nearest'});
  await new Promise(r=>setTimeout(r, uiPrefs.motion==='full'?420:20));
  if(moj!==samouczekPokaz||!przewodnikAktywny) return;
  perPrzyElemencie(el, krok.per||krok.tytul, {mina:'znalazl', czas:0});
}

async function ruchPrzewodnika(d){
  if(d>0&&krokPrzewodnika===PRZEWODNIK.length-1) return zamknijPrzewodnik(true);
  krokPrzewodnika=Math.max(0,Math.min(PRZEWODNIK.length-1,krokPrzewodnika+d));
  rysujKrokPrzewodnika();
}

/* --- 7. Podpięcie zdarzeń ------------------------------------------------ */
/* --- 8. Portale źródłowe: widoczny adres, kopiowanie, otwarcie ------------ */
// Do 1.8.0 przycisk otwierał przeglądarkę, ale nigdzie nie było widać, DOKĄD
// prowadzi — a w operacie trzeba podać źródło. Adres jest teraz na wierzchu.
const PORTALE={
  geoportal:{nazwa:'Geoportal krajowy', url:'https://mapy.geoportal.gov.pl/imapnext/imap/index.html',
    opis:'Mapa ewidencyjna: działki, budynki, uzbrojenie, ortofotomapa.'},
  mpzp:{nazwa:'Planowanie przestrzenne (KIMPZP)', url:'https://mapy.geoportal.gov.pl/imapnext/imap/index.html?moduleId=modulPP',
    opis:'Zasięgi planów miejscowych i ogólnych. Sam dokument i uchwałę zweryfikuj w BIP gminy.'},
  rcn:{nazwa:'Rejestr Cen Nieruchomości', url:'https://mapy.geoportal.gov.pl/imapnext/imap/index.html?moduleId=modulRCN',
    opis:'Ceny z aktów notarialnych — podgląd mapowy. Pełny wypis wydaje starostwo na wniosek rzeczoznawcy.'},
  podgik:{nazwa:'Powiatowe ośrodki dokumentacji (PODGiK)', url:'https://www.gov.pl/web/gugik',
    opis:'Wniosek o wypis z RCN i dane EGiB składasz w starostwie właściwym dla nieruchomości.'},
  ekw:{nazwa:'Elektroniczne Księgi Wieczyste', url:'https://ekw.ms.gov.pl/',
    opis:'Treść księgi wieczystej. Portal ma CAPTCHA i limity — OPERO ich nie omija.'},
};

function renderPortale(){
  for(const box of $$('[data-portale]')){
    const klucze=String(box.dataset.portale||'').split(',').map(x=>x.trim()).filter(Boolean);
    box.innerHTML=klucze.map(k=>{
      const p=PORTALE[k]; if(!p) return '';
      return `<div class="portal-item">
        <div class="portal-main">
          <b>${escapeHTML(p.nazwa)}</b>
          <p>${escapeHTML(p.opis)}</p>
          <code class="portal-url">${escapeHTML(p.url)}</code>
        </div>
        <div class="portal-actions">
          <button type="button" class="btn small" data-portal-otworz="${escapeHTML(k)}">Otwórz ↗</button>
          <button type="button" class="btn ghost small" data-portal-kopiuj="${escapeHTML(k)}">Kopiuj adres</button>
        </div>
      </div>`;
    }).join('');
  }
}

async function otworzPortal(k){
  const p=PORTALE[k]; if(!p) return;
  try{
    await window.operatAPI.openExternal(p.url);
    showStatus(`Otwieram w przeglądarce: ${p.url}`,'info',9000);
  }catch(e){ showStatus(`Nie udało się otworzyć przeglądarki. Adres do skopiowania: ${p.url}`,'error',12000); }
}
async function kopiujAdresPortalu(k){
  const p=PORTALE[k]; if(!p) return;
  try{ await navigator.clipboard.writeText(p.url); showStatus(`Skopiowano adres: ${p.url}`,'info',7000); }
  catch{ showStatus(`Adres do przepisania: ${p.url}`,'info',12000); }
}

function hookNowosci180(){
  $('#drawerClose')?.addEventListener('click',zamknijPanel);
  $('#drawerCancel')?.addEventListener('click',zamknijPanel);
  $('#drawerSave')?.addEventListener('click',zapiszPanel);
  $('#operoDrawer')?.addEventListener('click',e=>{ if(e.target.id==='operoDrawer') zamknijPanel(); });

  renderPortale();
  document.addEventListener('click',e=>{
    const o=e.target.closest?.('[data-portal-otworz]'); if(o){ otworzPortal(o.dataset.portalOtworz); return; }
    const k=e.target.closest?.('[data-portal-kopiuj]'); if(k){ kopiujAdresPortalu(k.dataset.portalKopiuj); }
  });
  $('#clientEditBtn')?.addEventListener('click',otworzPanelKlienta);
  hookKlienci();
  hookKW();
  hookBaza();
  hookKWAdres();
  hookExpress();
  hookSzata();
  hookWzorce();
  $('#automatBtn')?.addEventListener('click', automatZbierz);
  $('#perWszystkieBtn')?.addEventListener('click', perNapiszWszystkie);
  hookSzybki();
  hookAuto();
  hookSzybkaWycena();
  hookOknoOdpowiedzi();
  hookOferty();
  hookSzukanie();
  hookCechy();
  // Listy wyboru i rubryke adresu podpinamy takze przy starcie: pola pelnego
  // operatu stoja w HTML-u od poczatku, a renderAll() rusza dopiero przy
  // otwarciu operatu. Bez tego pierwszy operat w sesji nie mialby ani list,
  // ani szukania adresu - a wlasnie wtedy sa najbardziej potrzebne.
  hookPola(document);
  $('#addTransactionDrawer')?.addEventListener('click',()=>otworzPanelOferty(null));
  $('#addReminderBtn')?.addEventListener('click',()=>otworzPanelTerminu(null));
  // Edycja pozycji: klik w przycisk „edytuj" w wierszu tabeli transakcji.
  $('#transactionsBody')?.addEventListener('click',e=>{
    const btn=e.target.closest?.('[data-edytuj-tx]'); if(!btn) return;
    const t=(project.market?.transactions||[]).find(x=>String(x.id)===String(btn.dataset.edytujTx));
    if(t) otworzPanelOferty(t);
  });
  $('#remindersExportBtn')?.addEventListener('click',eksportujTerminy);
  $('#remindersAllBtn')?.addEventListener('click',otworzPanelWszystkichTerminow);

  $('#tutorialPrev')?.addEventListener('click',()=>ruchPrzewodnika(-1));
  $('#tutorialNext')?.addEventListener('click',()=>ruchPrzewodnika(1));
  $('#tutorialClose')?.addEventListener('click',()=>zamknijPrzewodnik(true));
  $('#tutorialSkip')?.addEventListener('click',()=>zamknijPrzewodnik(true));

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&drawerOtwarty()){ e.preventDefault(); zamknijPanel(); return; }
    if(drawerOtwarty()&&(e.ctrlKey||e.metaKey)&&e.key==='Enter'){ e.preventDefault(); zapiszPanel(); return; }
    if(!przewodnikAktywny) return;
    if(e.key==='Escape'){ e.preventDefault(); zamknijPrzewodnik(true); }
    if(e.key==='ArrowRight'){ e.preventDefault(); ruchPrzewodnika(1); }
    if(e.key==='ArrowLeft'){ e.preventDefault(); ruchPrzewodnika(-1); }
  });

  // Samouczek jest zwyklym ekranem, wiec przy zmianie rozmiaru okna nie ma juz
  // czego przeliczac — uklad robi CSS. Zostaje tylko dymek PER-a przy elemencie.
  window.addEventListener('resize',()=>{ przesunDymekPera(); },{passive:true});
}

(async function init(){
  hookEvents();
  hookNowosci180();
  periodicAutosaveTimer=setInterval(()=>{if(isAuthenticated&&autosaveDirty)forceAutosave({silent:true});},15000);
  licenseRuntimeTimer=setInterval(()=>enforceRuntimeLicense(),15*60*1000);
  await authInit();
  // Asystent przygotowuje sie sam w tle: Biblia i model maja byc gotowe,
  // zanim ktokolwiek o nie zapyta.
  setTimeout(()=>{ try{ asystentStart(); }catch{} }, 2500);
})();

/* ============================================================
   PER ROZMAWIAJĄCY 1.18.0
   Odpowiedź pisze model językowy z instalatora, działający na tym komputerze.
   Model nie dostaje operatu; dostaje wynik narzędzi, które czytają dane
   lokalnie. Tryb „tylko Biblia" zostaje jako zapas do audytu odpowiedzi.
   ============================================================ */
let agrafekStatus=null, agrafekRozmowa=[], agrafekZajety=false;

function agrafekKontekst(){
  // Wysyłamy migawkę, a nie referencje — narzędzia w procesie głównym mają
  // czytać dokładnie ten stan, który użytkownik widzi na ekranie.
  const p=project||{};
  let wynik=null;
  try{
    const c=calc||getCalc().calculate(p);
    wynik={wartoscRynkowa:c?.marketValue??null,cenaZaM2:c?.pricePerM2??null,
      cMin:c?.cMin??null,cMax:c?.cMax??null,deltaC:c?.deltaC??null,
      wspolczynnik:c?.wk??c?.Wk??null,powierzchnia:p.local?.area??p.property?.area??null,
      kompletnosc:typeof overallCompleteness==='function'?overallCompleteness():null};
  }catch(e){ wynik=null; }
  let braki=[];
  try{ braki=(allCriticalIssues()||[]).slice(0,60); }catch(e){ braki=[]; }
  const transakcje=(p.market?.transactions||[]).slice(0,40).map(t=>({
    id:t.id,adres:t.address||'',data:t.date||'',powierzchnia:t.area??null,cena:t.price??null,
    cenaZaM2:t.price&&t.area?Number(t.price)/Number(t.area):null,
    cechy:(t.features||[]).map(f=>({cecha:f.name||f.code,ocena:f.rating}))}));
  // Przez most IPC przechodzi wylacznie czysty JSON. Bez tego jedno pole z funkcja
  // albo proxy w projekcie konczy sie bledem „An object could not be cloned”.
  return czystyJSON({
    screen:knowledgeScreenCode(), moduleCode:p.moduleCode||moduleCode||'',
    valuationTypeCode:p.valuationTypeCode||'',
    operat:{
      property:p.property||{}, legal:p.legal||{}, egib:p.egib||{},
      building:p.building||{}, local:p.local||{},
      market:{ratingMode:p.market?.ratingMode,features:(p.market?.features||[]).map(f=>({cecha:f.name,waga:f.weight,ocena:f.rating})),liczbaTransakcji:(p.market?.transactions||[]).length},
      valuation:p.valuation||{},
    },
    wynik, braki, transakcje,
    // Kontrola operatu idzie do modelu w tej samej postaci, w jakiej widzi ja
    // rzeczoznawca — inaczej PER odpowiadalby o czyms innym niz panel obok.
    kontrola: (()=>{ try{ return kontrolaDlaPER(); }catch{ return null; } })(),
  });
}
function czystyJSON(v){ try{ return JSON.parse(JSON.stringify(v)); }catch(e){ return {}; } }

function agrafekRysujRozmowe(){
  const root=$('#agrafekChat'); if(!root) return;
  if(!agrafekRozmowa.length){ root.classList.add('hidden'); root.innerHTML=''; return; }
  root.classList.remove('hidden');
  root.innerHTML=agrafekRozmowa.map(m=>{
    if(m.role==='user') return `<div class="agrafek-bubble user">${escapeHTML(m.content)}</div>`;
    if(m.role==='loading') return `<div class="agrafek-bubble bot loading"><i></i><span>${escapeHTML(m.content)}</span></div>`;
    if(m.role==='error') return `<div class="agrafek-bubble bot error"><b>Nie udało się odpowiedzieć</b><p>${escapeHTML(m.content)}</p></div>`;
    const slad=(m.toolTrace||[]).length?`<small class="agrafek-slad">Sprawdziłem: ${escapeHTML([...new Set(m.toolTrace)].join(', '))}</small>`:'';
    return `<div class="agrafek-bubble bot">${agrafekFormat(m.content)}${slad}</div>`;
  }).join('');
  root.scrollTop=root.scrollHeight;
}

// Minimalne formatowanie odpowiedzi modelu: akapity, listy i pogrubienia.
// Świadomie nie dopuszczamy HTML-a z modelu — wszystko przechodzi przez escape.
function agrafekFormat(tekst){
  const linie=String(tekst||'').split('\n');
  const out=[]; let lista=false;
  const inline=v=>escapeHTML(v).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/`(.+?)`/g,'<code>$1</code>');
  for(const l of linie){
    const t=l.trim();
    if(/^[-*•]\s+/.test(t)){ if(!lista){out.push('<ul>');lista=true;} out.push(`<li>${inline(t.replace(/^[-*•]\s+/,''))}</li>`); continue; }
    if(lista){out.push('</ul>');lista=false;}
    if(t) out.push(`<p>${inline(t)}</p>`);
  }
  if(lista) out.push('</ul>');
  return out.join('');
}

async function agrafekOdswiezStatus(pokazBledy=false){
  try{
    agrafekStatus=await window.operatAPI.perStatus();
  }catch(e){
    agrafekStatus={configured:false,active:false,message:cleanRemoteError(e),settings:null,key:{present:false,hint:''}};
    if(pokazBledy) showStatus(`PER: ${agrafekStatus.message}`,'error',7000);
  }
  agrafekRysujStatus();
  agrafekWskazniki();
  try{ agrafekOdswiezPasekModelu(); agrafekOdswiezKontekst(); }catch{}
  try{ asystentRysuj(); }catch{}
  return agrafekStatus;
}

function agrafekRysujStatus(){
  const st=agrafekStatus,dot=$('#agrafekModelDot'),tytul=$('#agrafekModelTitle'),meta=$('#agrafekModelMeta');
  if(!dot||!tytul||!meta) return;
  if(!st){ dot.dataset.state='wait'; meta.textContent='Sprawdzam model PER…'; return; }
  dot.dataset.state=st.active?'ok':(st.configured?'warn':'off');
  tytul.textContent='Model PER na tym komputerze';
  meta.textContent=st.message||'';
}

async function agrafekZapytaj(pytanie=null){
  if(agrafekZajety) return;
  const input=$('#piorekQuestion'), q=String(pytanie??input?.value??'').trim();
  if(q.length<2){ showStatus('Wpisz pytanie do PER.','info',4500); input?.focus(); return; }
  // Tryb decyduje, skad bierze sie odpowiedz: sama Biblia, Biblia z modelem,
  // albo Biblia z modelem i wgladem w dane tego operatu.
  // Bez dzialajacego modelu nie straszymy bledem polaczenia — odpowiadamy
  // tym, co OPERO ma na dysku, i wygladamy tak samo jak zawsze.
  if(agrafekTryb==='szybki' || !agrafekStatus?.active) return askPiorekKnowledge(q);

  agrafekZajety=true;
  const btn=$('#piorekAskBtn'); const stary=btn?.textContent;
  if(btn){ btn.disabled=true; btn.textContent='PER myśli…'; }
  setPiorekState($('#dockPiorek'),'explain',{restart:true});
  agrafekRozmowa.push({role:'user',content:q});
  agrafekRozmowa.push({role:'loading',content:'Czytam Biblię OPERO i dane operatu…'});
  agrafekRysujRozmowe();
  agrafekMysli(true);
  agrafekStan('czyta');
  if(input) input.value='';
  try{
    const historia=agrafekRozmowa.filter(m=>m.role==='user'||m.role==='assistant').slice(0,-1).slice(-10)
      .map(m=>({role:m.role,content:m.content}));
    const r=await window.operatAPI.perAsk({question:q,history:historia,context:agrafekKontekst(),tryb:agrafekTryb,glebokie:agrafekTryb==='gleboki'});
    agrafekRozmowa=agrafekRozmowa.filter(m=>m.role!=='loading');
    agrafekRozmowa.push({role:'assistant',content:r?.text||'',toolTrace:r?.toolTrace||[],model:r?.model});
    // Mina dobrana do tego, czym PER sie zajmowal: liczyl czy czytal.
    const slad=r?.toolTrace||[];
    agrafekStan(slad.some(x=>/wynik|transakcje|braki/.test(x))?'liczy':'znalazl');
    setTimeout(()=>agrafekStan(null),2400);
  }catch(e){
    agrafekRozmowa=agrafekRozmowa.filter(m=>m.role!=='loading');
    agrafekRozmowa.push({role:'error',content:cleanRemoteError(e)});
    agrafekStan('ostrzega'); setTimeout(()=>agrafekStan(null),2400);
  }finally{
    agrafekZajety=false;
    if(btn){ btn.disabled=false; btn.textContent=stary||'Zapytaj PER →'; }
    agrafekMysli(false);
    agrafekRysujRozmowe();
    setPiorekState($('#dockPiorek'),'idle',{restart:true});
  }
}

function hookAgrafek191(){
  const btn=$('#piorekAskBtn');
  if(btn){
    // Podmieniamy obsługę przycisku: klon usuwa wszystkie wcześniejsze nasłuchy,
    // żeby jedno kliknięcie nie odpalało i rozmowy, i starej ścieżki Biblii.
    const nowy=btn.cloneNode(true); btn.parentNode.replaceChild(nowy,btn);
    nowy.addEventListener('click',()=>agrafekZapytaj());
  }
  const pytanie=$('#piorekQuestion');
  pytanie?.addEventListener('keydown',e=>{ if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); agrafekZapytaj(); } });
  $('#agrafekModelSetup')?.addEventListener('click',()=>{ $('#agrafekSetup')?.classList.toggle('hidden'); agrafekRysujStatus(); });
  $('#agrafekCloseSetup')?.addEventListener('click',()=>$('#agrafekSetup')?.classList.add('hidden'));
  $('#piorekClearAnswer')?.addEventListener('click',()=>{ agrafekRozmowa=[]; agrafekRysujRozmowe(); });
  $$('[data-piorek-question]').forEach(b=>{const n=b.cloneNode(true);b.parentNode.replaceChild(n,b);n.addEventListener('click',()=>agrafekZapytaj(n.dataset.piorekQuestion));});
}

/* ============================================================
   MODUŁ DOCHODOWY 1.9.2 — interfejs
   Tabele odpowiadają szablonom z Biblii OPERO: rejestr najmu, dowody czynszu,
   dowody stopy, koszty właściciela, prognoza DCF i most PGI → EGI → NOI.
   Wiersze edytujemy w miejscu, bez przebudowy tabeli przy każdym znaku —
   to ten sam błąd, który w 1.8.0 zjadał listy rozwijane w tabeli transakcji.
   ============================================================ */
function incData(){ if(!project.income) project.income={}; const i=project.income;
  for(const k of ['leases','rentEvidence','rateEvidence','opex','dcf']) if(!Array.isArray(i[k])) i[k]=[];
  return i; }
function incNum(v){ const n=Number(v); return Number.isFinite(n)?n:0; }
function incZl(v,d){ return v==null?'—':`${fmt(v,d==null?0:d)} zł`; }

function incPole(row,klucz,typ,opcje){
  const o=opcje||{};
  const wartosc=row[klucz]==null?'':row[klucz];
  if(typ==='checkbox') return `<input type="checkbox" data-inc-field="${klucz}" ${row[klucz]?'checked':''}>`;
  if(typ==='select') return `<select data-inc-field="${klucz}">${(o.opcje||[]).map(x=>`<option value="${escapeHTML(x)}" ${String(wartosc)===x?'selected':''}>${escapeHTML(x)}</option>`).join('')}</select>`;
  return `<input type="${typ||'text'}" ${o.step?`step="${o.step}"`:''} ${o.min!=null?`min="${o.min}"`:''} data-inc-field="${klucz}" value="${escapeHTML(String(wartosc))}" ${o.ph?`placeholder="${escapeHTML(o.ph)}"`:''}>`;
}

// Jedno wspolne podpiecie zdarzen dla wszystkich tabel modulu dochodowego.
function incPodepnij(tbody,dajListe,poZmianie){
  tbody.addEventListener('input',e=>{
    const pole=e.target.closest('[data-inc-field]'); if(!pole) return;
    const tr=pole.closest('tr'); const row=dajListe().find(x=>x.id===tr?.dataset.incId); if(!row) return;
    row[pole.dataset.incField]=pole.type==='checkbox'?pole.checked:(pole.type==='number'?incNum(pole.value):pole.value);
    changed(); if(poZmianie) poZmianie();
  });
  tbody.addEventListener('change',e=>{
    const pole=e.target.closest('[data-inc-field]'); if(!pole) return;
    const tr=pole.closest('tr'); const row=dajListe().find(x=>x.id===tr?.dataset.incId); if(!row) return;
    row[pole.dataset.incField]=pole.type==='checkbox'?pole.checked:(pole.type==='number'?incNum(pole.value):pole.value);
    changed(); if(poZmianie) poZmianie();
  });
  tbody.addEventListener('click',e=>{
    const btn=e.target.closest('[data-inc-del]'); if(!btn) return;
    const tr=btn.closest('tr'); const lista=dajListe(); const i=lista.findIndex(x=>x.id===tr?.dataset.incId);
    if(i>=0){ lista.splice(i,1); changed(); renderIncome(); }
  });
}

function renderIncome(){
  if(!$('#tab-income')) return;
  const inc=incData();
  const w=window.OperoIncome?window.OperoIncome.oblicz(project):null;

  const najem=$('#leasesBody');
  if(najem) najem.innerHTML=inc.leases.map(l=>`<tr data-inc-id="${l.id}">`
    +`<td>${incPole(l,'tenant','text')}</td><td>${incPole(l,'area','number',{step:'0.01',min:0})}</td>`
    +`<td>${incPole(l,'start','date')}</td><td>${incPole(l,'end','date')}</td>`
    +`<td>${incPole(l,'baseRent','number',{step:'0.01',min:0})}</td><td>${incPole(l,'effectiveRent','number',{step:'0.01',min:0})}</td>`
    +`<td>${incPole(l,'terms','text')}</td><td>${incPole(l,'source','text',{ph:'np. umowa najmu z 12.03.2025'})}</td>`
    +`<td><button class="icon-btn" type="button" data-inc-del aria-label="Usuń umowę">✕</button></td></tr>`).join('');

  const czynsz=$('#rentEvidenceBody');
  if(czynsz) czynsz.innerHTML=inc.rentEvidence.map(x=>`<tr data-inc-id="${x.id}">`
    +`<td>${incPole(x,'source','text')}</td><td>${incPole(x,'location','text')}</td><td>${incPole(x,'cls','text')}</td>`
    +`<td>${incPole(x,'date','date')}</td><td>${incPole(x,'rent','number',{step:'0.01',min:0})}</td>`
    +`<td>${incPole(x,'conditions','text')}</td>`
    +`<td>${incPole(x,'evidenceType','select',{opcje:['transakcja','oferta','raport rynkowy']})}</td>`
    +`<td>${incPole(x,'accepted','checkbox')}</td><td>${incPole(x,'reason','text')}</td>`
    +`<td><button class="icon-btn" type="button" data-inc-del aria-label="Usuń dowód">✕</button></td></tr>`).join('');

  const stopa=$('#rateEvidenceBody');
  if(stopa) stopa.innerHTML=inc.rateEvidence.map(x=>`<tr data-inc-id="${x.id}">`
    +`<td>${incPole(x,'source','text')}</td><td>${incPole(x,'market','text')}</td><td>${incPole(x,'date','date')}</td>`
    +`<td>${incPole(x,'rate','number',{step:'0.01',min:0})}</td><td>${incPole(x,'incomeDef','text',{ph:'NOI wg definicji operatu'})}</td>`
    +`<td>${incPole(x,'risk','text')}</td><td>${incPole(x,'adjustment','number',{step:'0.01'})}</td>`
    +`<td>${incPole(x,'adopted','checkbox')}</td>`
    +`<td><button class="icon-btn" type="button" data-inc-del aria-label="Usuń dowód">✕</button></td></tr>`).join('');

  const koszty=$('#opexBody');
  if(koszty) koszty.innerHTML=inc.opex.map(x=>`<tr data-inc-id="${x.id}">`
    +`<td>${incPole(x,'name','text')}</td><td>${incPole(x,'amount','number',{step:'0.01',min:0})}</td>`
    +`<td>${incPole(x,'bearer','select',{opcje:['właściciel','najemca']})}</td><td>${incPole(x,'source','text')}</td>`
    +`<td><button class="icon-btn" type="button" data-inc-del aria-label="Usuń pozycję">✕</button></td></tr>`).join('');

  const dcf=$('#dcfBody');
  if(dcf) dcf.innerHTML=inc.dcf.map((x,i)=>{
    const wy=w&&w.dcf.wiersze[i];
    return `<tr data-inc-id="${x.id}">`
    +`<td>${incPole(x,'year','number',{min:1})}</td><td>${incPole(x,'rentIncome','number',{step:'0.01',min:0})}</td>`
    +`<td>${incPole(x,'vacancy','number',{step:'0.01',min:0})}</td><td>${incPole(x,'otherIncome','number',{step:'0.01',min:0})}</td>`
    +`<td>${incPole(x,'opex','number',{step:'0.01',min:0})}</td><td>${incPole(x,'capex','number',{step:'0.01',min:0})}</td>`
    +`<td class="calc-cell">${wy?incZl(wy.cf):'—'}</td><td class="calc-cell">${wy&&wy.dyskonto!=null?fmt(wy.dyskonto,4):'—'}</td>`
    +`<td class="calc-cell">${wy?incZl(wy.pv):'—'}</td><td>${incPole(x,'note','text',{ph:'skąd to założenie'})}</td>`
    +`<td><button class="icon-btn" type="button" data-inc-del aria-label="Usuń rok">✕</button></td></tr>`;
  }).join('');
  $('#dcfCard')?.classList.toggle('hidden', inc.technique!=='dcf');

  if(w){
    const P=w.pgi;
    const wiersz=(a,b,c)=>`<tr><td>${a}</td><td class="calc-cell">${b}</td><td class="hint">${c||''}</td></tr>`;
    const most=$('#incomeBridgeBody');
    if(most) most.innerHTML=
       wiersz('Czynsz z umów najmu',incZl(P.zUmow),`${fmt(P.powWynajeta,2)} m² wynajęte`)
      +wiersz('Powierzchnia niewynajęta po stawce rynkowej',P.brakStawkiDlaWolnych?'<span style="color:var(--danger)">brak stawki</span>':incZl(P.zWolnych),`${fmt(P.powWolna,2)} m² × ${P.czynszRynkowy==null?'—':fmt(P.czynszRynkowy,2)} zł/m²/mc × 12`)
      +wiersz('Inne wpływy właściciela',incZl(P.inne),'')
      +wiersz('<b>PGI</b>',`<b>${incZl(P.wartosc)}</b>`,'potencjalny dochód brutto')
      +wiersz('Straty z pustostanów',`− ${incZl(w.stratyPustostan)}`,`${fmt(inc.vacancyPct,2)}% PGI`)
      +wiersz('Straty z nieściągalności',`− ${incZl(w.stratyNiesciagalnosc)}`,`${fmt(inc.collectionPct,2)}% PGI`)
      +wiersz('<b>EGI</b>',`<b>${incZl(w.egi)}</b>`,'efektywny dochód brutto')
      +wiersz('Koszty operacyjne właściciela',`− ${incZl(w.opex.suma)}`,`${w.opex.pozycje.length} poz.`)
      +wiersz('<b>NOI</b>',`<b>${incZl(w.noi)}</b>`,'dochód operacyjny netto')
      +wiersz(w.technika==='dcf'?'<b>Wartość (DCF)</b>':'<b>Wartość (kapitalizacja prosta)</b>',
              `<b>${incZl(w.marketValue)}</b>`,
              w.technika==='dcf'?`r = ${w.dcf.stopaDyskontowa==null?'—':fmt(w.dcf.stopaDyskontowa,2)+'%'}, Rk = ${w.dcf.stopaRezydualna==null?'—':fmt(w.dcf.stopaRezydualna,2)+'%'}`
                                 :`R = ${w.stopaKapitalizacji==null?'—':fmt(w.stopaKapitalizacji,2)+'%'}`);

    const info=$('#incomeAreaInfo');
    if(info) info.innerHTML=`<b>Kontrola powierzchni:</b> w rejestrze najmu jest ${fmt(P.powWynajeta,2)} m² z ${fmt(P.powCalkowita,2)} m² podanych jako powierzchnia najmu`
      +(P.powWolna>0?` — ${fmt(P.powWolna,2)} m² traktujemy jako niewynajęte i wyceniamy po stawce rynkowej.`:'.')
      +(P.powWynajeta>P.powCalkowita?' <span style="color:var(--danger)">Suma umów przekracza podaną powierzchnię — sprawdź, czy to ta sama definicja powierzchni.</span>':'');

    const wi=$('#waultInfo');
    if(wi) wi.innerHTML=`<b>WAULT:</b> ${w.wault.value==null?'—':`${fmt(w.wault.value,2)} lat`} &nbsp;|&nbsp; ${escapeHTML(w.wault.basis)}`;
    const ri=$('#rentInfo');
    if(ri) ri.innerHTML=`<b>Stawka przyjęta do modelu:</b> ${P.czynszRynkowy==null?'brak przyjętego dowodu':`${fmt(P.czynszRynkowy,2)} zł/m²/mc (średnia z ${P.dowodowCzynszu})`}`;
    const si=$('#rateInfo');
    if(si) si.innerHTML=`<b>Stopa przyjęta:</b> ${w.stopaKapitalizacji==null?'brak':`${fmt(w.stopaKapitalizacji,2)}%`}`
      +(w.stopaZDowodow!=null?` &nbsp;|&nbsp; średnia z dowodów po korekcie: ${fmt(w.stopaZDowodow,2)}% (${w.dowodowStopy} poz.)`:'');
  }
}

function hookIncome192(){
  const dodaj=(id,klucz,szablon)=>$(id)?.addEventListener('click',()=>{ incData()[klucz].push({id:newId(),...szablon()}); changed(); renderIncome(); });
  dodaj('#addLease','leases',()=>({tenant:'',area:0,start:'',end:'',baseRent:0,effectiveRent:0,terms:'',source:''}));
  dodaj('#addRentEvidence','rentEvidence',()=>({source:'',location:'',cls:'',date:'',rent:0,conditions:'',evidenceType:'transakcja',accepted:false,reason:''}));
  dodaj('#addRateEvidence','rateEvidence',()=>({source:'',market:'',date:'',rate:0,incomeDef:'',risk:'',adjustment:0,adopted:false}));
  dodaj('#addOpex','opex',()=>({name:'',amount:0,bearer:'właściciel',source:''}));
  dodaj('#addDcfYear','dcf',()=>({year:(incData().dcf.length||0)+1,rentIncome:0,vacancy:0,otherIncome:0,opex:0,capex:0,note:''}));
  const pary=[['#leasesBody','leases'],['#rentEvidenceBody','rentEvidence'],['#rateEvidenceBody','rateEvidence'],['#opexBody','opex'],['#dcfBody','dcf']];
  for(const [sel,klucz] of pary){ const el=$(sel); if(el) incPodepnij(el,()=>incData()[klucz],renderIncome); }
}

/* ============================================================
   AGRAFEK 1.9.2 — drobne gesty i stan „myślę"
   Zapętlona animacja po chwili przestaje być zauważalna. Losowy gest co
   kilkanaście sekund sprawia, że postać wygląda na obecną, a nie odtwarzaną.
   Gesty milkną w trybie cichym i przy ograniczonych animacjach.
   ============================================================ */
const AGRAFEK_GESTY=['gest-mrugniecie','gest-podskok','gest-przechyl','gest-rozglada','gest-iskra',
  'gest-ziewniecie','gest-kiwniecie','gest-obrot','gest-zerkniecie','gest-drgniecie'];
let agrafekTimerGestow=0;

function agrafekGest(nazwa){
  if(uiPrefs.motion!=='full'||document.hidden) return;
  const g=nazwa||AGRAFEK_GESTY[Math.floor(Math.random()*AGRAFEK_GESTY.length)];
  // Gest wykonuje kazda widoczna kopia postaci -- w doku i w naglowku panelu.
  // Inaczej ta w panelu stalaby nieruchomo tuz obok ruszajacej sie.
  for(const el of agrafekPostacie()){
    if(!el) continue;
    el.classList.remove(...AGRAFEK_GESTY);
    void el.offsetWidth;
    el.classList.add(g);
    setTimeout(()=>el.classList.remove(g),1200);
  }
}

function agrafekStartGestow(){
  clearTimeout(agrafekTimerGestow);
  const nastepny=()=>{
    // 14–26 s: rzadziej niż mruganie, więc gest jest zauważalny, a nie męczący.
    agrafekTimerGestow=setTimeout(()=>{ agrafekGest(); nastepny(); }, 14000+Math.random()*12000);
  };
  nastepny();
}

/** Postać przechodzi w stan „myślę" na czas oczekiwania na odpowiedź modelu. */
function agrafekMysli(wlacz){
  for(const el of [$('#dockPiorek'),$('#panelPiorek')]){
    if(!el) continue;
    el.classList.toggle('state-thinking', !!wlacz);
    if(wlacz) el.classList.remove('state-idle'); else el.classList.add('state-idle');
  }
  const podpis=$('#agrafekNastroj');
  if(podpis) podpis.textContent=wlacz?'Myślę…':'Pod ręką';
}

/* ============================================================
   OPERO 1.18.0 — MODEL PER W FOLDERZE PROGRAMU

   Nie ma juz instalowania srodowiska ani pobierania modelu krok po kroku:
   silnik i model jada w instalatorze. Zostaje jedno — pokazac, czy model
   dziala, i pozwolic go zaktualizowac, gdy wyjdzie nowszy.
   ============================================================ */
var perStanSilnika=null, perOdpiecie=null;   // var, bo hookEvents() wola to zanim ta linia sie wykona

function bajty(n){
  const v=Number(n)||0;
  if(v>=1073741824) return `${(v/1073741824).toFixed(1).replace('.',',')} GB`;
  if(v>=1048576) return `${Math.round(v/1048576)} MB`;
  if(v>=1024) return `${Math.round(v/1024)} kB`;
  return `${v} B`;
}

async function perOdswiezSilnik(){
  try{ perStanSilnika=await window.operatAPI.perSilnikStatus(); }
  catch{ perStanSilnika=null; }
  perRysujSilnik();
  return perStanSilnika;
}

function perRysujSilnik(){
  const s=perStanSilnika;
  const opis=$('#settingsPerModel');
  if(opis){
    // Tu takze stan, nie nazwa pliku. Nazwa mowi tylko tyle, ze ktos sie zna
    // na modelach - a pytanie brzmi „czy asystent dziala".
    if(!s) opis.textContent='nie udało się odczytać';
    else if(!s.silnik) opis.textContent='brak silnika asystenta';
    else if(!s.model) opis.textContent='nie ma modelu';
    else opis.textContent=`${bajty(s.model.rozmiar)}${s.serwerDziala?' · działa':' · wczytuje się'}`;
  }
  // Skad model pochodzi to osobna informacja od tego, czy dziala. Przy wlasnym
  // pliku pokazujemy sciezke - inaczej nie wiadomo, KTORY to plik na dysku.
  const zrodlo=$('#settingsPerZrodlo');
  if(zrodlo){
    const m=s?.model;
    zrodlo.textContent = !m ? '—'
      : m.zrodlo==='wlasny' ? `Twój plik: ${m.plik||m.nazwa}`
      : m.zrodlo==='aktualizacja' ? 'Pobrany przez program'
      : 'Z instalatora';
  }
}

function perPostepModelu(d){
  // Pobieranie zaczyna sie TYLKO z przycisku w panelu, wiec postep zawsze dotyczy
  // czegos, co czlowiek sam kliknal - i panel pokazuje to w tym samym miejscu.
  if(perStanModelu){ perStanModelu.pobieranieTrwa = d?.etap!=='gotowe' && d?.etap!=='blad'; perStanModelu.postep=d; perRysujStanModelu(); }
  if(d?.etap==='gotowe'){ showStatus('Model PER jest gotowy — asystent właśnie go uruchamia.','success',9000); perSprawdzStanModelu(); return; }
  if(d?.etap==='blad'){ showStatus(`Pobieranie modelu przerwane: ${d.blad}. To, co pobrane, zostaje na dysku — kolejne kliknięcie ruszy od tego miejsca.`,'error',12000); perSprawdzStanModelu(); return; }
  if(d?.etap==='start'){ showStatus(`Pobieram asystenta PER (${bajty(d.razem||0)}). Możesz pracować — zgłoszę się, gdy będzie gotowy.`,'info',9000); return; }
  const proc=d?.razem>0?Math.min(100,Math.round(d.pobrane/d.razem*100)):0;
  const zIlu=d?.czesci>1?` (część ${d.czesc} z ${d.czesci})`:'';
  if(d?.etap==='sprawdzanie'){ asystentPracuje(`Sprawdzam sumę kontrolną${zIlu}…`, proc||100); return; }
  if(d?.etap==='skladanie'){ asystentPracuje('Składam model z części…',100); return; }
  asystentPracuje(`Pobieram model${zIlu}… ${proc?proc+'%':''}`.trim(), proc);
}

/**
 * Aktualizacja modelu. Adres bierzemy z tego, co powiedzial manifest wydania
 * (razem z suma kontrolna) — a dopiero gdy go nie ma, z adresu wpisanego na
 * sztywno w ustawieniach. Dzieki temu „Pobierz nowszy" pobiera DOKLADNIE ten
 * plik, o ktorym program przed chwila powiedzial, ze jest nowszy.
 */
let perAdresAktualizacji=null;
async function perAktualizujModel(){
  let adres=String(perStanModelu?.nowszy?.url||'').trim();
  let suma=String(perStanModelu?.nowszy?.suma||'').trim();
  if(!adres){
    // Adresu nie znamy z poprzedniego sprawdzenia? Pytamy jeszcze raz TERAZ -
    // program potrafi znalezc model wprost u zrodla, a przy poprzednim
    // sprawdzeniu mogla po prostu nie dzialac siec.
    asystentPracuje('Szukam modelu u źródła…');
    try{
      const swieze=await window.operatAPI.perStanModelu();
      if(swieze){ perStanModelu=swieze; perRysujStanModelu(); }
      adres=String(swieze?.nowszy?.url||'').trim();
      suma=String(swieze?.nowszy?.suma||'').trim();
    }catch{}
  }
  if(!adres){
    if(perAdresAktualizacji===null){
      try{ const i=await window.operatAPI.getAppInfo(); perAdresAktualizacji=String(i?.modelAktualizacjaUrl||''); }
      catch{ perAdresAktualizacji=''; }
    }
    adres=perAdresAktualizacji.trim(); suma='';
  }
  if(!adres){
    showStatus(perStanModelu?.powod==='BRAK_SILNIKA'
      ? 'W folderze programu nie ma silnika modelu. Zainstaluj OPERO jeszcze raz z aktualnego instalatora.'
      : 'Nie udało mi się połączyć ze źródłem modelu (huggingface.co). Sprawdź internet i kliknij jeszcze raz.','info',9000);
    asystentKoniecPracy();
    return;
  }
  const btn=$('#settingsPerAktualizuj'); const stary=btn?.textContent;
  if(btn){ btn.disabled=true; btn.textContent='Pobieram…'; }
  asystentPracuje('Pobieram nowszy model…');
  try{
    const r=await window.operatAPI.perAktualizujModel(adres, suma);
    if(r?.ok){
      showStatus(`Model gotowy (${bajty(r.rozmiar)}), suma kontrolna zgodna. PER wstaje na nim od razu.`,'success',9000);
      // Nowy model jest juz na dysku i stary serwer zostal zatrzymany —
      // podnosimy go od razu, zeby „zaktualizowany" znaczylo „dziala".
      try{ await window.operatAPI.perUruchom(); }catch{}
      await perOdswiezSilnik();
      await perSprawdzStanModelu();
      await agrafekOdswiezStatus(false);
    } else {
      showStatus(`Nie udalo sie pobrac modelu: ${r?.blad||r?.powod||'nieznany blad'}`,'error',10000);
    }
  }catch(e){ showStatus(cleanRemoteError(e),'error',9000); }
  finally{ asystentKoniecPracy(); if(btn){ btn.disabled=false; btn.textContent=stary; } }
}

/**
 * Naprawa asystenta jednym przyciskiem.
 *
 * Program sam sprawdza po kolei silnik, model i uruchomienie, i uzupelnia to,
 * czego brakuje. Czlowiek nie musi wiedziec, ktora z tych rzeczy zawiodla -
 * ma kliknac raz i miec dzialajacego asystenta. Na koniec mowimy, co bylo
 * popsute i co zostalo zrobione, bo „gotowe" bez tresci niczego nie uczy.
 */
let naprawaTrwa=false;
async function naprawAsystenta(){
  if(naprawaTrwa) return;
  naprawaTrwa=true;
  const btn=$('#perStanNapraw'); const stary=btn?.textContent;
  if(btn){ btn.disabled=true; btn.textContent='Naprawiam…'; }
  asystentPracuje('Sprawdzam asystenta…');
  try{
    const r=await window.operatAPI.perNapraw();
    const kroki=Array.isArray(r?.kroki)?r.kroki:[];
    const naprawione=kroki.filter(k=>k.stan==='naprawione');
    const bledy=kroki.filter(k=>k.stan==='blad');
    if(r?.ok){
      showStatus(naprawione.length
        ? `Naprawione: ${naprawione.map(k=>k.co.toLowerCase()).join(', ')}. Asystent PER działa.`
        : 'Sprawdziłem wszystko — asystent PER działa, nie było czego naprawiać.','success',11000);
    } else {
      showStatus(`Nie wszystko udało się naprawić. ${bledy.map(k=>`${k.co}: ${k.szczegol}`).join(' · ')}`,'error',15000);
    }
  }catch(e){ showStatus(cleanRemoteError(e),'error',11000); }
  finally{
    asystentKoniecPracy();
    if(btn){ btn.disabled=false; btn.textContent=stary||'Napraw'; }
    naprawaTrwa=false;
    await perOdswiezSilnik().catch(()=>{});
    await perSprawdzStanModelu().catch(()=>{});
  }
}

/* --- kolorowy stan modelu przy imieniu PER-a --- */
// Kropka przy PER mowi jednym spojrzeniem, co sie dzieje z modelem:
//   zielona  — model jest i jest aktualny,
//   zolta    — jest nowsza wersja do pobrania,
//   czerwona — modelu brak albo serwer nie wstaje,
//   szara    — jeszcze nie sprawdzilismy (brak sieci albo adresu).
// Swiadomie nie robimy z zoltej kropki alarmu: program dziala tak samo,
// nowszy model tylko lepiej pisze.
const PER_STANY_OPIS={
  aktualny:'Zielony: asystent PER aktualny.',
  nowszy:'Pomarańczowy: asystent PER do zaktualizowania — kliknij, żeby pobrać nowszy model.',
  brak:'Czerwony: asystent PER nieaktualny — nie ma modelu. Kliknij, żeby go pobrać.',
  pobieranie:'Niebieski: model właśnie się pobiera.',
  nieznany:'Szary: jeszcze nie sprawdziłem stanu asystenta.',
};
let perStanModelu=null;

/**
 * Pierwszy, natychmiastowy rzut oka: czy plik modelu w ogole jest na dysku.
 * Nie pyta sieci, wiec konczy sie od razu - kolor pojawia sie zaraz po
 * wlaczeniu programu, a nie po kilku sekundach czekania na Hugging Face.
 */
async function perStanZDysku(){
  const s=await window.operatAPI.perSilnikStatus();
  perStanSilnika=s;
  // Pelne sprawdzenie (czy nie ma nowszego) przyjdzie chwile pozniej i nadpisze
  // to, co tu ustawimy. Tu mowimy tylko to, co wiemy na pewno.
  // Model na dysku JEST albo go NIE MA - to wiemy od razu i tak tez kolorujemy.
  // Zielony znaczy „wgrany"; jesli chwile pozniej okaze sie, ze u zrodla lezy
  // nowszy, zrobi sie pomaranczowy. Szarej kropki „jeszcze nie wiem" nie
  // pokazujemy, gdy odpowiedz juz mamy pod reka.
  perStanModelu = !s?.silnik ? { stan:'brak', powod:'BRAK_SILNIKA', model:null }
    : !s?.model ? { stan:'brak', powod:'BRAK_MODELU', model:null }
    : { stan:'aktualny', model:s.model, sprawdzamNowszy:true };
  perRysujStanModelu();
  return perStanModelu;
}

async function perSprawdzStanModelu(){
  try{ perStanModelu=await window.operatAPI.perStanModelu(); }
  catch{ perStanModelu=null; }
  perRysujStanModelu();
  return perStanModelu;
}

function perRysujStanModelu(){
  // Pobieranie w toku ma pierwszenstwo nad kazdym innym stanem: czlowiek ma
  // widziec, ze cos sie dzieje, a nie suchy komunikat „modelu nie ma".
  if(perStanModelu?.pobieranieTrwa){
    const p=perStanModelu.postep||{};
    const proc=p.razem>0?Math.min(100,Math.round(p.pobrane/p.razem*100)):0;
    const kropka=$('#perStanKropka'); if(kropka){ kropka.dataset.stan='pobieranie'; kropka.title='PER pobiera model.'; }
    const pasek=$('#perStanPanel');
    if(pasek){
      pasek.dataset.stan='pobieranie';
      const tekst=$('#perStanPanelTekst');
      if(tekst) tekst.textContent = p.etap==='sprawdzanie' ? 'Sprawdzam sumę kontrolną pobranego modelu…'
        : p.etap==='skladanie' ? 'Składam model…'
        : `Pobieram model… ${proc}%${p.razem?` (${bajty(p.pobrane)} z ${bajty(p.razem)})`:''}`;
      const btn=$('#perStanPobierz');
      if(btn){ btn.classList.remove('hidden'); btn.textContent='Zatrzymaj'; btn.dataset.akcja='zatrzymaj'; }
      $('#perStanLegenda')?.classList.add('hidden');
      $('#perStanNapraw')?.classList.add('hidden');
    }
    return;
  }
  const stan=perStanModelu?.stan||'nieznany';
  const kropka=$('#perStanKropka');
  if(kropka){
    kropka.dataset.stan=stan;
    kropka.title=PER_STANY_OPIS[stan]||PER_STANY_OPIS.nieznany;
  }
  const pasek=$('#perStanPanel');
  if(pasek){
    pasek.dataset.stan=stan;
    const tekst=$('#perStanPanelTekst');
    const doPobrania=perStanModelu?.nowszy?.url?perStanModelu.nowszy:null;
    if(tekst){
      const m=perStanModelu?.model;
      const powod=perStanModelu?.powod;
      // „Modelu nie ma" to za malo: czlowiek musi wiedziec, CZY da sie to
      // naprawic z tego miejsca, czy potrzebna jest pelna paczka instalatora.
      // Nazw plikow TU NIE MA i byc nie powinno. Rzeczoznawca nie wybiera
      // modelu - ma wiedziec jedno: czy asystent jest gotowy do pracy. Nazwa
      // „Bielik-11B-v2.5-Instruct.Q4_K_M.gguf" nie odpowiada na to pytanie,
      // tylko zasłania odpowiedz. Kto chce ja zobaczyc, znajdzie ja w
      // Ustawieniach, przy opisie skad model pochodzi.
      // Trzy stany i tyle. Nazwa pliku modelu nikomu nic nie mowi - liczy sie
      // JEDNO: czy asystent jest gotowy do pracy, czy nie, i co z tym zrobic.
      // Nazwy, gigabajty i repozytoria zostaja w Ustawieniach, dla kogos, kto
      // ich naprawde szuka.
      const brakTekst = powod==='BRAK_SILNIKA'
        ? 'Brakuje silnika asystenta. Zainstaluj OPERO jeszcze raz z aktualnego instalatora.'
        : 'Asystent PER nieaktualny — nie ma jeszcze modelu.';
      tekst.textContent = stan==='nowszy'
        ? 'Asystent PER do zaktualizowania. Obecny działa dalej.'
        : stan==='brak' ? brakTekst
        : stan==='aktualny' ? (perStanModelu?.sprawdzamNowszy
            ? 'Asystent PER gotowy — sprawdzam aktualność…'
            : 'Asystent PER aktualny.')
        : 'Nie sprawdzono stanu asystenta.';
    }
    // Przycisk ma sens takze wtedy, gdy modelu NIE MA — byle bylo skad go wziac.
    const btn=$('#perStanPobierz');
    if(btn){
      // Przycisk jest ZAWSZE, gdy modelu nie ma - nawet jesli w tej chwili nie
      // znamy adresu. Wczesniej znikal i rzeczoznawca zostawal z komunikatem
      // „nie wskazano, skad go pobrac" i niczym do klikniecia. Teraz klikniecie
      // samo szuka zrodla; dopiero gdy i to nie wyjdzie, mowimy, co jest nie tak.
      const mozna = stan==='nowszy' || (stan==='brak' && perStanModelu?.powod!=='BRAK_SILNIKA');
      btn.classList.toggle('hidden', !mozna);
      // Na przycisku stoi rozmiar, bo to jedna informacja, ktorej czlowiek
      // potrzebuje PRZED klikniecem: 6 GB na lotniskowym wi-fi to zly pomysl.
      const ile = doPobrania?.rozmiar ? ` (${bajty(doPobrania.rozmiar)})` : '';
      btn.textContent = (stan==='brak' ? 'Pobierz asystenta' : 'Zaktualizuj asystenta') + ile;
      btn.dataset.akcja='pobierz';
    }
    // Narzedzie naprawcze. Przy czerwonej i pomaranczowej lampce zawsze jest
    // pod reka - bo wlasnie wtedy czlowiek nie wie, co zrobic, a nie ma
    // obowiazku wiedziec, czym rozni sie brak silnika od braku modelu.
    const napraw=$('#perStanNapraw');
    if(napraw) napraw.classList.toggle('hidden', !(stan==='brak' || stan==='nowszy'));
    // Legenda kolorow ma sens tylko wtedy, gdy kolor nie jest zielony - przy
    // dzialajacym modelu nie ma czego tlumaczyc.
    const legenda=$('#perStanLegenda');
    if(legenda) legenda.classList.toggle('hidden', stan==='aktualny' || stan==='pobieranie');
  }
}

function hookPerSilnik(){
  $('#settingsPerAktualizuj')?.addEventListener('click',perAktualizujModel);
  $('#perStanPobierz')?.addEventListener('click',perAktualizujModel);
  if(!perOdpiecie && window.operatAPI?.onPerProgress) perOdpiecie=window.operatAPI.onPerProgress(perPostepModelu);
  perOdswiezSilnik();
  // Stan modelu ma byc widoczny OD RAZU po wlaczeniu programu - to pierwsza
  // rzecz, o ktora czlowiek pyta wzrokiem. Dlatego najpierw, bez sieci,
  // sprawdzamy sam dysk (jest plik czy nie ma), a dopiero potem pytamy zrodla,
  // czy nie wyszlo cos nowszego. Gdy sieci nie ma, kropka zostaje na tym, co
  // powiedzial dysk, zamiast wisiec na szaro.
  perStanZDysku().catch(()=>{});
  setTimeout(()=>{ perSprawdzStanModelu().catch(()=>{}); }, 1200);
}

/* ============================================================
   POZOSTAŁE MODUŁY 1.9.3 — wspólny ekran budowany ze specyfikacji
   Pola i tabele rysują się z tej samej definicji, z której liczy silnik
   (`calc-modules.js`). Nie da się dodać pola na ekranie i zapomnieć o nim
   w obliczeniach ani w operacie.
   ============================================================ */
// UWAGA: lista jest w środku funkcji, a nie w `const` na końcu pliku. Ten plik jest
// wykonywany od góry i `obliczProjekt()` woła tę funkcję jeszcze podczas ładowania —
// `const` zadeklarowany niżej byłby wtedy w martwej strefie i wywracał cały renderer.
function jestModulOgolny(kod){
  return ['cost','expropriation','fees','easement','agri_forest'].includes(kod||moduleCode());
}
function modData(){ if(!project.modul||typeof project.modul!=='object') project.modul={}; return project.modul; }

function modPoleHTML(pole,d){
  const v=d[pole.kod]==null?'':d[pole.kod];
  const at=`data-mod-field="${pole.kod}"`;
  if(pole.typ==='obszar') return `<textarea ${at} rows="${pole.wiersze||3}" ${pole.ph?`placeholder="${escapeHTML(pole.ph)}"`:''}>${escapeHTML(String(v))}</textarea>`;
  if(pole.typ==='wybor') return `<select ${at}>${(pole.opcje||[]).map(([k,e])=>`<option value="${escapeHTML(k)}" ${String(v)===k?'selected':''}>${escapeHTML(e)}</option>`).join('')}</select>`;
  if(pole.typ==='data') return `<input type="date" ${at} value="${escapeHTML(String(v))}">`;
  if(pole.typ==='liczba'||pole.typ==='procent')
    return `<input type="number" ${pole.krok?`step="${pole.krok}"`:'step="0.01"'} ${at} value="${escapeHTML(String(v))}" ${pole.ph?`placeholder="${escapeHTML(pole.ph)}"`:''}>`;
  return `<input type="text" ${at} value="${escapeHTML(String(v))}" ${pole.ph?`placeholder="${escapeHTML(pole.ph)}"`:''}>`;
}

function renderModulOgolny(){
  const kod=moduleCode();
  const root=$('#modulTresc'); if(!root||!window.OperoModuly) return;
  const m=window.OperoModuly.spec(kod);
  if(!m){ root.innerHTML=''; return; }
  const d=modData();
  $('#modulTytul').textContent=m.tytul;
  $('#modulWstep').textContent=m.wstep;

  const sekcje=m.sekcje.map(s=>`<div class="card"><h3>${escapeHTML(s.tytul)}</h3><div class="form-grid cols-2">`
    +s.pola.map(p=>`<label class="${p.typ==='obszar'?'span-2':''}">${escapeHTML(p.etykieta)}${modPoleHTML(p,d)}</label>`).join('')
    +`</div></div>`).join('');

  const tabele=m.tabele.map(t=>{
    const rows=(d[t.kod]||[]);
    return `<div class="card"><div class="card-head"><div><h3>${escapeHTML(t.tytul)}</h3><p>${escapeHTML(t.opis||'')}</p></div>`
      +`<button class="btn primary small" type="button" data-mod-add="${t.kod}">+ Wiersz</button></div>`
      +`<div class="table-wrap"><table class="edit-table"><thead><tr>`
      +t.kolumny.map(k=>`<th>${escapeHTML(k.etykieta)}</th>`).join('')+`<th></th></tr></thead>`
      +`<tbody data-mod-table="${t.kod}">`
      +rows.map(r=>`<tr data-mod-id="${r.id}">`
        +t.kolumny.map(k=>`<td>${modPoleHTML({...k,typ:k.typ||'tekst'},r)}</td>`).join('')
        +`<td><button class="icon-btn" type="button" data-mod-del aria-label="Usuń wiersz">✕</button></td></tr>`).join('')
      +`</tbody></table></div></div>`;
  }).join('');

  root.innerHTML=sekcje+tabele;
  renderModulWynik();
}

function renderModulWynik(){
  const kod=moduleCode(), body=$('#modulWynikBody');
  if(!body||!window.OperoModuly||!jestModulOgolny(kod)) return;
  const w=window.OperoModuly.oblicz(kod,project); if(!w) return;
  const wiersz=(a,b,c)=>`<tr><td>${a}</td><td class="calc-cell">${b}</td><td class="hint">${c||''}</td></tr>`;
  const zl=v=>v==null?'—':`${fmt(v,0)} zł`;
  const pr=v=>v==null?'—':`${fmt(v,2)}%`;
  let html='';
  if(kod==='cost'){
    html=wiersz('Koszt w stanie nowym',zl(w.kosztNowy),'ilość × koszt jednostkowy')
      +(w.zuzycieElementy!=null?wiersz('Zużycie z elementów scalonych',pr(w.zuzycieElementy),`suma udziałów: ${fmt(w.sumaUdzialow,2)}%`):'')
      +(w.zuzycieCzasowe!=null?wiersz('Zużycie metodą czasową',pr(w.zuzycieCzasowe),'wiek / trwałość'):'')
      +wiersz('Zużycie łączne',pr(w.zuzycieLaczne),'techniczne + funkcjonalne + środowiskowe')
      +wiersz('Wartość po zużyciu',zl(w.poZuzyciu),'')
      +(w.wartoscGruntu?wiersz('Wartość gruntu',zl(w.wartoscGruntu),''):'')
      +wiersz('<b>Wartość</b>',`<b>${zl(w.marketValue)}</b>`,'');
  } else if(kod==='expropriation'){
    html=wiersz('Wartość bazowa',zl(w.wartoscBazowa),'powierzchnia × wartość jednostkowa')
      +wiersz('Powiększenie k',pr(w.powiekszenie),w.przekroczonyLimit?'<span style="color:var(--danger)">ponad dopuszczalne 50%</span>':'maks. 50%')
      +wiersz('Po powiększeniu',zl(w.poPowiekszeniu),'')
      +wiersz('Składniki',zl(w.skladniki),'nakłady, drzewostan')
      +wiersz('Zmniejszenie wartości reszty',zl(w.zmniejszenieReszty),'')
      +wiersz('<b>Odszkodowanie</b>',`<b>${zl(w.marketValue)}</b>`,'');
  } else if(kod==='fees'){
    html=wiersz('Wartość w stanie przed',zl(w.wartoscPrzed),'')
      +wiersz('Wartość w stanie po',zl(w.wartoscPo),'')
      +wiersz('ΔW',zl(w.delta),w.brakWzrostu?'brak wzrostu — opłata nie powstaje':'')
      +wiersz('Stawka',pr(w.stawka),'')
      +wiersz('<b>Opłata</b>',`<b>${zl(w.marketValue)}</b>`,'stawka × max(ΔW, 0)');
  } else if(kod==='easement'){
    html=wiersz('Metoda bezpośrednia',zl(w.rynkowa),'stawka × powierzchnia pasa')
      +wiersz('Metoda różnicowa',zl(w.roznicowa),'wartość bez − wartość z obciążeniem')
      +wiersz('Metoda wskaźnikowa',zl(w.wskaznikowa),'W × (1−S) × P × k')
      +wiersz('Zdyskontowane wynagrodzenie',zl(w.dcf.wartosc),`r = ${pr(w.dcf.stopa)}`)
      +wiersz('<b>Wynagrodzenie (metoda przyjęta)</b>',`<b>${zl(w.marketValue)}</b>`,'');
  } else if(kod==='agri_forest'){
    html=wiersz('Grunty rolne',zl(w.wartoscRolna),`${fmt(w.powRolna,4)} ha`)
      +wiersz('Grunt leśny',zl(w.wartoscGruntuLesnego),'N × ha × cena drewna × korekty')
      +wiersz('Drzewostan',zl(w.wartoscDrzewostanu),'')
      +wiersz('Razem leśna',zl(w.wartoscLesna),'grunt + drzewostan')
      +wiersz('<b>Wartość</b>',`<b>${zl(w.marketValue)}</b>`,'');
  }
  body.innerHTML=html;
}

function hookModuly193(){
  const root=$('#modulTresc'); if(!root) return;
  const zapisz=(el)=>{
    const kod=el.dataset.modField; if(!kod) return;
    const tr=el.closest('[data-mod-id]');
    const cel=tr ? (modData()[tr.closest('[data-mod-table]').dataset.modTable]||[]).find(x=>x.id===tr.dataset.modId)
                 : modData();
    if(!cel) return;
    cel[kod]=el.type==='checkbox'?el.checked:(el.type==='number'?(Number(el.value)||0):el.value);
    changed(); renderModulWynik();
  };
  root.addEventListener('input',e=>{ const el=e.target.closest('[data-mod-field]'); if(el) zapisz(el); });
  root.addEventListener('change',e=>{
    const el=e.target.closest('[data-mod-field]');
    if(el){ zapisz(el); if(el.tagName==='SELECT') renderModulOgolny(); }
  });
  root.addEventListener('click',e=>{
    const dodaj=e.target.closest('[data-mod-add]');
    if(dodaj){
      const t=window.OperoModuly.spec(moduleCode())?.tabele.find(x=>x.kod===dodaj.dataset.modAdd);
      if(t){ const d=modData(); if(!Array.isArray(d[t.kod])) d[t.kod]=[];
             d[t.kod].push({id:newId(),...t.szablon(d[t.kod].length)}); changed(); renderModulOgolny(); }
      return;
    }
    const usun=e.target.closest('[data-mod-del]');
    if(usun){
      const tr=usun.closest('[data-mod-id]'), klucz=tr?.closest('[data-mod-table]')?.dataset.modTable;
      const lista=klucz?modData()[klucz]:null;
      if(Array.isArray(lista)){ const i=lista.findIndex(x=>x.id===tr.dataset.modId); if(i>=0){ lista.splice(i,1); changed(); renderModulOgolny(); } }
    }
  });
}

/* ============================================================
   AGRAFEK 1.9.4 — postać, która patrzy, i Biblia na dysku

   Do 1.9.3 PER był animowany, ale nie reagował: te same trzy gesty w pętli,
   ta sama mina przy każdej odpowiedzi. Teraz wodzi oczami za kursorem, ma minę
   dobraną do tego, co robi, i mówi jednym słowem, czym się właśnie zajmuje.
   Wszystko gaśnie w trybie ograniczonych animacji — nie zmuszamy nikogo do
   patrzenia na ruchomy obrazek.
   ============================================================ */
// 1.19.0: wiecej min. Mina nie jest ozdoba — mowi, co program wlasnie robi,
// wiec rzeczoznawca widzi stan pracy katem oka, bez czytania komunikatu.
const AGRAFEK_STANY=['czyta','liczy','znalazl','ostrzega','pisze','sprawdza','zadowolony','zaklopotany','spiacy','czeka'];
const AGRAFEK_NASTROJE={
  idle:'Pod ręką', czyta:'Czytam Biblię', liczy:'Liczę', znalazl:'Mam to', ostrzega:'Uwaga',
  mysli:'Myślę…', pobiera:'Pobieram', pisze:'Piszę', sprawdza:'Sprawdzam operat',
  zadowolony:'Ładnie to wygląda', zaklopotany:'Hm, nie jestem pewien', spiacy:'Odpoczywam',
  czeka:'Czekam na Ciebie',
};

// Kopie postaci: w pasku, w panelu, w samouczku i ta wedrujaca po programie.
// Jedna lista, zeby zaden ruch nie ominal zadnej z nich — inaczej jedna stoi
// nieruchomo tuz obok ruszajacej sie i cala iluzja znika.
/* ============================================================
   PER 1.19.0 — wędrówka po programie i dymek przy elemencie

   PER przechodzi do elementu i mówi nad nim jedno zdanie. Zasada jest jedna
   i wynika z tego, do czego ten program służy: PER rusza się TYLKO wtedy, gdy
   ma coś konkretnego do powiedzenia — kontrola znalazła błąd, etap się
   skończył, poprosiłeś o następne pole, samouczek pokazuje miejsce. Poza tym
   siedzi w górnym pasku. Operat pisze się w ciszy.

   Przy ograniczonych animacjach postać nie wędruje: dymek po prostu pojawia
   się przy elemencie, bez przelotu.
   ============================================================ */
let perDymekTimer=0, perDymekCel=null;

function perWarstwa(){
  let w=$('#perWedrowny');
  if(w) return w;
  w=document.createElement('div');
  w.id='perWedrowny';
  w.className='per-wedrowny hidden';
  w.setAttribute('aria-hidden','true');
  const zrodlo=$('#dockPiorek');
  w.innerHTML=`<span class="piorek-character state-idle mini">${zrodlo?zrodlo.innerHTML:''}</span>`
    +`<span class="per-dymek"><b class="per-dymek-tekst"></b></span>`;
  document.body.appendChild(w);
  return w;
}

/**
 * Przeprowadza PER-a do elementu i wyświetla nad nim zdanie.
 * @param {string|Element} gdzie selektor albo element docelowy
 * @param {string} tekst jedno zdanie — nie akapit
 * @param {object} opcje mina postaci i czas, po którym dymek znika
 */
function perPrzyElemencie(gdzie, tekst, {mina='znalazl', czas=6000}={}){
  const cel=typeof gdzie==='string'?$(gdzie):gdzie;
  if(!cel||!tekst) return;
  const r=cel.getBoundingClientRect();
  if(!r.width&&!r.height) return;
  const w=perWarstwa();
  const pokazujeSie=w.classList.contains('hidden')||!w.classList.contains('widoczny');
  perDymekCel=cel;
  w.querySelector('.per-dymek-tekst').textContent=tekst;
  w.classList.remove('hidden');
  // Przy pierwszym pokazaniu PER ma po prostu STANAC przy elemencie, a nie
  // przylatywac z lewego gornego rogu okna — stad wylaczone przejscie na czas
  // ustawienia pozycji. Przelot zostaje tylko wtedy, gdy postac juz jest na
  // ekranie i przechodzi od jednego elementu do drugiego.
  if(pokazujeSie){
    w.classList.add('bez-przelotu');
    przesunDymekPera();
    void w.offsetWidth;
    w.classList.remove('bez-przelotu');
  } else {
    przesunDymekPera();
  }
  // Pokazujemy od razu — pozycja jest juz ustawiona. Druga klatka sluzy tylko
  // do poprawki, gdy przegladarka zmierzy dymek dopiero po jego narysowaniu.
  w.classList.add('widoczny');
  requestAnimationFrame(()=>przesunDymekPera());
  const post=w.querySelector('.piorek-character');
  if(post){
    AGRAFEK_STANY.forEach(s=>post.classList.remove(`mina-${s}`));
    if(AGRAFEK_STANY.includes(mina)) post.classList.add(`mina-${mina}`);
  }
  clearTimeout(perDymekTimer);
  perDymekTimer=setTimeout(schowajDymekPera, Math.max(2500,czas));
}

function przesunDymekPera(){
  const w=$('#perWedrowny'); if(!w||w.classList.contains('hidden')||!perDymekCel?.isConnected) return;
  const r=perDymekCel.getBoundingClientRect();
  if(!r.width&&!r.height){ schowajDymekPera(); return; }
  const szer=w.offsetWidth||260, wys=w.offsetHeight||90;
  // Nad elementem, a gdy u gory nie ma miejsca — pod nim.
  const nadNim=r.top>wys+16;
  let x=r.left+r.width/2-szer/2;
  x=Math.max(12,Math.min(x,window.innerWidth-szer-12));
  const y=nadNim ? r.top-wys-10 : Math.min(window.innerHeight-wys-12, r.bottom+10);
  w.style.transform=`translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  w.classList.toggle('pod-spodem',!nadNim);
}

function schowajDymekPera(){
  const w=$('#perWedrowny'); if(!w) return;
  w.classList.remove('widoczny');
  perDymekCel=null;
  clearTimeout(perDymekTimer);
  // Postac wraca do paska dopiero po przelocie, zeby nie znikala w powietrzu.
  perDymekTimer=setTimeout(()=>w.classList.add('hidden'), uiPrefs.motion==='full'?420:0);
}


function agrafekPostacie(){ return [$('#dockPiorek'),$('#panelPiorek'),$('#tutorPiorek'),$('#perWedrowny .piorek-character')].filter(Boolean); }

/** Mina i podpis pod imieniem. Jedno źródło prawdy dla wszystkich kopii postaci. */
function agrafekStan(nazwa){
  const n=AGRAFEK_STANY.includes(nazwa)?nazwa:null;
  for(const el of agrafekPostacie()){
    AGRAFEK_STANY.forEach(s=>el.classList.remove(`mina-${s}`));
    if(n) el.classList.add(`mina-${n}`);
  }
  const podpis=$('#agrafekNastroj');
  if(podpis) podpis.textContent=AGRAFEK_NASTROJE[n||'idle']||AGRAFEK_NASTROJE.idle;
}

/* --- wzrok --- */
// Źrenice przesuwamy zmienną CSS, a nie przerysowaniem SVG: przeglądarka ma
// wtedy do policzenia jedną transformację zamiast całej sceny przy każdym ruchu myszy.
let agrafekRamka=0, agrafekWzrokPodpiety=false;
function agrafekUstawWzrok(x,y){
  for(const el of agrafekPostacie()){
    // `continue`, a nie `return`: gdy jedna kopia postaci jeszcze nie ma rysunku,
    // druga musi i tak dostać ruch.
    const svg=el.querySelector('.piorek-svg'); if(!svg) continue;
    const r=svg.getBoundingClientRect(); if(!r.width) continue;
    // Środek twarzy leży mniej więcej w 45% wysokości kadru postaci.
    const cx=r.left+r.width/2, cy=r.top+r.height*0.45;
    const dx=Math.max(-1,Math.min(1,(x-cx)/Math.max(180,r.width*3)));
    const dy=Math.max(-1,Math.min(1,(y-cy)/Math.max(180,r.height*2)));
    el.style.setProperty('--wzrok-x',(dx*3.2).toFixed(2));
    el.style.setProperty('--wzrok-y',(dy*2.4).toFixed(2));
    // Cała bryła obraca się za kursorem mocniej niż same źrenice — to z tego
    // ruchu bierze się wrażenie, że PER jest przedmiotem, a nie naklejką.
    el.style.setProperty('--obrot-y',(dx*17).toFixed(1));
    el.style.setProperty('--obrot-x',(-dy*9).toFixed(1));
  }
}

/* --- paralaksa tła --- */
// Tło dostaje te same wspolrzedne kursora co wzrok PER, tylko znormalizowane
// do zakresu -1..1. Dalej wszystko robi CSS: kazda warstwa mnozy te dwie liczby
// przez swoj wlasny dystans, wiec dalekie plamy ledwo drgaja, a pyl przed nosem
// jedzie wyraznie. Jedna zmienna, zadnego przeliczania warstw w skrypcie.
var tloEl=null;
function tloParalaksa(x,y){
  if(!tloEl) tloEl=document.getElementById('tlo');
  if(!tloEl) return;
  var w=window.innerWidth||1, h=window.innerHeight||1;
  tloEl.style.setProperty('--tlo-x',((x/w)*2-1).toFixed(3));
  tloEl.style.setProperty('--tlo-y',((y/h)*2-1).toFixed(3));
  // Swiatlo idzie za kursorem. To ta sama zasada co z paralaksa: dajemy CSS-owi
  // dwie liczby w procentach, a reszte robi gradient. Dzieki temu reka czuje,
  // ze program odpowiada na ruch, zanim jeszcze cokolwiek kliknie.
  tloEl.style.setProperty('--tlo-mx',((x/w)*100).toFixed(1)+'%');
  tloEl.style.setProperty('--tlo-my',((y/h)*100).toFixed(1)+'%');
  tloEl.style.setProperty('--tlo-swiatlo','1');
}
/** Kursor poza oknem: warstwy wracaja na swoje miejsca. */
function tloParalaksaSpoczynek(){
  if(!tloEl) tloEl=document.getElementById('tlo');
  if(!tloEl) return;
  tloEl.style.removeProperty('--tlo-x');
  tloEl.style.removeProperty('--tlo-y');
  tloEl.style.setProperty('--tlo-swiatlo','0');
}

/** Kursor opuścił okno: oddajemy postać z powrotem jej własnemu ruchowi. */
function agrafekWzrokSpoczynek(){
  for(const el of agrafekPostacie()){
    for(const v of ['--wzrok-x','--wzrok-y','--obrot-y','--obrot-x']) el.style.removeProperty(v);
  }
}
function agrafekStartWzroku(){
  if(agrafekWzrokPodpiety) return; agrafekWzrokPodpiety=true;
  document.addEventListener('pointermove',e=>{
    if(uiPrefs.motion!=='full') return;
    if(agrafekRamka) return;
    agrafekRamka=requestAnimationFrame(()=>{ agrafekRamka=0; agrafekUstawWzrok(e.clientX,e.clientY); tloParalaksa(e.clientX,e.clientY); });
  },{passive:true});
  // Po wyjściu kursora z okna wzrok wraca na wprost — inaczej postać zostaje z zezem.
  window.addEventListener('blur',agrafekWzrokSpoczynek);
  document.addEventListener('mouseleave',agrafekWzrokSpoczynek);
  window.addEventListener('blur',tloParalaksaSpoczynek);
  document.addEventListener('mouseleave',tloParalaksaSpoczynek);
}

/* --- Biblia w folderze programu --- */
let bibliaStanCache=null;

async function bibliaOdswiez(){
  try{ bibliaStanCache=await window.operatAPI.bibliaStan(); }
  catch{ bibliaStanCache=null; }
  bibliaRysuj();
  agrafekWskazniki();
  return bibliaStanCache;
}

function bibliaRysuj(){
  const dot=$('#bibliaDot'),tyt=$('#bibliaTytul'),meta=$('#bibliaMeta'),btn=$('#bibliaPobierz');
  if(!dot||!meta) return;
  const s=bibliaStanCache;
  if(!s){ dot.dataset.state='wait'; meta.textContent='Sprawdzam folder programu…'; return; }
  if(!s.jest){
    dot.dataset.state='off';
    if(tyt) tyt.textContent='Biblia nie jest jeszcze na dysku';
    meta.textContent='PER pyta serwer, więc bez internetu milczy. Pobierz Biblię raz — potem działa offline.';
    if(btn){ btn.textContent='Pobierz na dysk'; btn.disabled=false; }
    return;
  }
  dot.dataset.state=s.robocza?'warn':'ok';
  if(tyt) tyt.textContent=s.robocza?'Biblia na dysku · wersja robocza':'Biblia na dysku';
  const kiedy=s.pobrano?new Date(s.pobrano).toLocaleDateString('pl-PL'):'—';
  meta.textContent=`${s.kod||'—'} · ${s.regul} reguł z ${s.ksiazek} książek · ${s.rodzajow} rodzajów wyceny · pobrano ${kiedy}`;
  if(btn){ btn.textContent='Odśwież'; btn.disabled=false; }
}

async function bibliaPobierzUI(){
  const btn=$('#bibliaPobierz'); if(!btn) return;
  btn.disabled=true; const old=btn.textContent; btn.textContent='Pobieram…';
  agrafekStan('czyta');
  try{
    bibliaStanCache=await window.operatAPI.bibliaPobierz();
    bibliaRysuj();
    showStatus(`Biblia OPERO jest w folderze programu — ${bibliaStanCache.regul} reguł. PER odpowiada teraz także bez internetu.`,'success',7000);
    agrafekStan('znalazl'); setTimeout(()=>agrafekStan(null),2200);
  }catch(e){
    showStatus(`Nie udało się pobrać Biblii: ${cleanRemoteError(e)}`,'error',8000);
    agrafekStan('ostrzega'); setTimeout(()=>agrafekStan(null),2200);
  }finally{ btn.disabled=false; btn.textContent=old; }
}

/* --- egzamin partiami --- */
// 149 testów w jednym żądaniu przekraczało limit mocy funkcji serwerowej.
// Liczymy je partiami i sami składamy wynik — te same progi zaliczenia.
async function runPiorekExamPartiami(){
  const btn=$('#piorekExamBtn'),root=$('#piorekExamResult');
  const post=$('#piorekExamProgress'),pasek=$('#piorekExamPasek'),opis=$('#piorekExamOpis'),liczby=$('#piorekExamLiczby');
  if(!btn||!root) return;
  const old=btn.textContent; btn.disabled=true; btn.textContent='Egzamin trwa…';
  root.classList.add('hidden'); root.innerHTML='';
  post?.classList.remove('hidden');
  agrafekStan('czyta');
  const wyniki=[]; let offset=0, total=0, partia=0;
  try{
    for(let i=0;i<40;i++){
      const r=await window.operatAPI.runPiorekExam({offset,limit:25});
      if(!r?.ok) throw new Error(r?.error||'Serwer nie zwrócił wyniku partii.');
      wyniki.push(...(r.results||[])); total=Number(r.total||wyniki.length); partia++;
      const proc=total?Math.round(wyniki.length/total*100):0;
      if(pasek) pasek.style.width=`${proc}%`;
      if(opis) opis.textContent=`Partia ${partia} — sprawdzam routing, reguły i źródła`;
      if(liczby) liczby.textContent=`${wyniki.length} z ${total} testów (${proc}%)`;
      if(r.done||r.nextOffset==null) break;
      offset=r.nextOffset;
    }
    const zaliczone=wyniki.filter(x=>x.pass).length;
    const eksperckie=wyniki.filter(x=>String(x.difficulty).toLowerCase()==='expert');
    const ekspZal=eksperckie.filter(x=>x.pass).length;
    const krytyczne=wyniki.filter(x=>!x.pass&&['legal_dates','method_selection','calculation_trace'].includes(String(x.category||''))).length;
    const wynik=wyniki.length?zaliczone/wyniki.length*100:0;
    const wynikEksp=eksperckie.length?ekspZal/eksperckie.length*100:100;
    const pass=wynik>=95&&wynikEksp>=90&&krytyczne===0;
    agrafekOstatniEgzamin={pass,wynik,zaliczone,razem:wyniki.length}; agrafekWskazniki();
    const nieudane=wyniki.filter(x=>!x.pass);
    root.classList.remove('hidden');
    root.innerHTML=`<div class="piorek-exam-summary ${pass?'pass':'fail'}"><b>${pass?'✓ EGZAMIN ZALICZONY':'! EGZAMIN WYMAGA POPRAWEK'}</b><strong>${wynik.toFixed(1)}%</strong><span>${zaliczone}/${wyniki.length} testów · eksperckie ${wynikEksp.toFixed(1)}% · błędy krytyczne ${krytyczne}</span></div>`
      +(nieudane.length?`<details><summary>Pokaż niezaliczone testy (${nieudane.length})</summary><div class="piorek-exam-fails">${nieudane.slice(0,40).map(x=>`<div><b>${escapeHTML(x.testCode||'test')}</b><small>ścieżka ${escapeHTML(x.route||'—')} / oczekiwano ${escapeHTML(x.expectedRoute||'—')}${x.rulesOk===false?' · brak wymaganej reguły':''}${x.topicsOk===false?' · brak wymaganego źródła':''}</small></div>`).join('')}</div></details>`:'');
    agrafekStan(pass?'znalazl':'ostrzega'); setTimeout(()=>agrafekStan(null),2600);
  }catch(e){
    root.classList.remove('hidden');
    root.innerHTML=`<div class="piorek-answer-error"><b>Egzamin nie został ukończony</b><p>${escapeHTML(cleanRemoteError(e))}</p>${wyniki.length?`<p>Zdążyłem sprawdzić ${wyniki.length} z ${total||'?'} testów.</p>`:''}</div>`;
    agrafekStan('ostrzega'); setTimeout(()=>agrafekStan(null),2600);
  }finally{
    post?.classList.add('hidden'); if(pasek) pasek.style.width='0%';
    btn.disabled=false; btn.textContent=old;
  }
}

function hookAgrafek194(){
  agrafekStartWzroku();
  $('#bibliaPobierz')?.addEventListener('click',e=>{e.stopPropagation();bibliaPobierzUI();});
  bibliaOdswiez();
}

/* ============================================================
   AGRAFEK 1.9.5 — trzy male wskazniki zamiast trzech kafli

   Panel otwieral sie trzema ramkami stanu: Biblia serwerowa, Biblia na dysku,
   model. Zajmowaly polowe wysokosci, a sa to rzeczy, ktore sprawdza sie raz na
   jakis czas. Teraz na gorze stoja trzy kropki z jednym slowem; szczegoly
   rozwijaja sie po kliknieciu i nic z tresci nie ginie.
   ============================================================ */
let agrafekOstatniEgzamin=null;   // {pass, wynik, zaliczone, razem} albo null

function agrafekChip(kod, stan, info){
  const dot=$(`#chip${kod}Dot`), txt=$(`#chip${kod}Info`);
  if(dot) dot.dataset.state=stan;
  if(txt) txt.textContent=info;
}

/** Jedno miejsce, z ktorego biora sie wszystkie trzy wskazniki. */
function agrafekWskazniki(){
  // Biblia: liczy sie ta na dysku, bo to ona odpowiada na pytania. Gdy jej nie ma,
  // pokazujemy stan Biblii serwerowej, zeby nie sugerowac awarii tam, gdzie jej nie ma.
  const b=bibliaStanCache;
  if(b?.jest) agrafekChip('Biblia','ok',`${b.regul} reguł`);
  else if(piorekKnowledgeStatus?.ok) agrafekChip('Biblia','warn','tylko online');
  else if(b===null&&!piorekKnowledgeStatus) agrafekChip('Biblia','wait','sprawdzam');
  else agrafekChip('Biblia','off','brak');

  const e=agrafekOstatniEgzamin;
  if(!e) agrafekChip('Egzamin','wait','nieuruchomiony');
  else agrafekChip('Egzamin', e.pass?'ok':'off', `${e.wynik.toFixed(0)}%`);

  const m=agrafekStatus;
  if(!m) agrafekChip('Model','wait','sprawdzam');
  else if(m.active) agrafekChip('Model','ok', m.engine==='OPENAI'?'OpenAI':'lokalny');
  else if(m.configured) agrafekChip('Model','warn','brak modelu');
  else agrafekChip('Model','off','nieustawiony');
}

/** Rozwija szczegoly i podswietla ten kafel, o ktory pytano. */
function agrafekPokazSzczegoly(ktory){
  const box=$('#agrafekSzczegoly'); if(!box) return;
  const bylo=!box.classList.contains('hidden');
  const ten=box.dataset.ktory===ktory;
  if(bylo&&ten){ box.classList.add('hidden'); box.dataset.ktory=''; }
  else { box.classList.remove('hidden'); box.dataset.ktory=ktory; }
  $$('[data-agrafek-chip]').forEach(b=>b.setAttribute('aria-expanded', String(!box.classList.contains('hidden') && b.dataset.agrafekChip===ktory)));
  // Egzamin to jedyna rzecz w panelu, ktora cos uruchamia, wiec jego przycisk
  // pokazuje sie dopiero po rozwinieciu wskaznika „Egzamin". Reszta czasu panel
  // ma zostac spokojny: trzy male wskazniki i pole na pytanie.
  const egzamin=$('#piorekExamBtn');
  if(egzamin) egzamin.classList.toggle('hidden', box.classList.contains('hidden')||ktory!=='egzamin');
  if(box.classList.contains('hidden')) return;
  const cel={biblia:'.agrafek-kb-local', model:'.agrafek-model-status', egzamin:'#piorekExamBtn'}[ktory];
  const el=cel?document.querySelector(cel):null;
  if(el) setTimeout(()=>el.scrollIntoView({block:'center',behavior:uiPrefs.motion==='full'?'smooth':'auto'}),30);
}

function hookAgrafek195(){
  $$('[data-agrafek-chip]').forEach(b=>b.addEventListener('click',e=>{
    e.stopPropagation(); agrafekPokazSzczegoly(b.dataset.agrafekChip);
  }));
  agrafekWskazniki();
}

/* ============================================================
   OPERO 1.10.0 — od wyciągu RCiWN do operatu, jednym przejściem

   Cztery kroki w jednym oknie: plik → kolumny → dobór → operat. Po przeniesieniu
   transakcje lądują w tabeli operatu i od razu liczy je ten sam, niezmieniony
   silnik. Nic nie dzieje się po cichu: każdy odrzucony wiersz zostaje na liście
   razem z powodem, a zbiór porównawczy zatwierdza rzeczoznawca.
   ============================================================ */
let rcnStan=null;   // {plik, arkusz, wiersze, naglowek, mapowanie, ocena, zaznaczone:Set}

const RCN_POLA=[
  ['data','Data transakcji'],['cena','Cena transakcyjna'],['powierzchnia','Powierzchnia'],
  ['cenaJednostkowa','Cena za m² (jeśli jest)'],['adres','Adres / położenie'],['miejscowosc','Miejscowość'],
  ['obreb','Obręb'],['dzialka','Nr działki'],['prawo','Rodzaj prawa'],['rodzaj','Rodzaj transakcji'],
  ['akt','Nr aktu'],['kw','Księga wieczysta'],['uwagi','Uwagi'],
];

function rcnKrok(ktory){
  for(const s of ['plik','kolumny','dobor','koniec']){
    $(`#rcnKrok${s[0].toUpperCase()}${s.slice(1)}`)?.classList.toggle('hidden', s!==ktory);
    $(`[data-rcn-krok="${s}"]`)?.classList.toggle('aktywny', s===ktory);
  }
  const tytuly={plik:'Wczytaj wyciąg z rejestru cen',kolumny:'Sprawdź dopasowanie kolumn',
    dobor:'Dobór transakcji porównawczych',koniec:'Gotowe — transakcje w operacie'};
  if($('#rcnTytul')) $('#rcnTytul').textContent=tytuly[ktory]||'';
}

function rcnOtworz(){ $('#rcnOverlay')?.classList.remove('hidden'); rcnKrok('plik'); }
function rcnZamknij(){ $('#rcnOverlay')?.classList.add('hidden'); }

async function rcnWybierzPlik(){
  try{
    const r=await window.operatAPI.rcnWczytaj();
    if(r?.canceled) return;
    // Bierzemy arkusz, w ktorym w ogole da sie znalezc naglowek tabeli — wyciagi
    // potrafia miec arkusz tytulowy albo zakladke ze slownikiem kodow.
    let wybrany=null;
    for(const a of (r.arkusze||[])){
      const h=window.OperoRCN.znajdzNaglowek(a.wiersze||[]);
      if(h>=0){ wybrany={...a, naglowek:h}; break; }
    }
    if(!wybrany){
      showStatus('W tym pliku nie rozpoznałem tabeli transakcji. Potrzebny jest wiersz nagłówka z datą i ceną — sprawdź, czy wyciąg nie zaczyna się od kilku stron opisu.','error',9000);
      return;
    }
    rcnStan={plik:r.plik, arkusz:wybrany.nazwa, wiersze:wybrany.wiersze, naglowek:wybrany.naglowek,
      mapowanie:window.OperoRCN.rozpoznajKolumny(wybrany.wiersze[wybrany.naglowek]||[]), ocena:null, zaznaczone:new Set()};
    if($('#rcnPlikInfo')) $('#rcnPlikInfo').textContent=`${r.plik} · arkusz „${wybrany.nazwa}" · nagłówek w wierszu ${wybrany.naglowek+1}`;
    rcnRysujMapowanie();
    rcnKrok('kolumny');
  }catch(e){ showStatus(`Wczytanie wyciągu: ${cleanRemoteError(e)}`,'error',9000); }
}

function rcnRysujMapowanie(){
  const root=$('#rcnMapowanie'); if(!root||!rcnStan) return;
  const h=rcnStan.wiersze[rcnStan.naglowek]||[];
  const opcje=['<option value="">— brak —</option>',...h.map((x,i)=>`<option value="${i}">${escapeHTML(String(x||`kolumna ${i+1}`))}</option>`)].join('');
  root.innerHTML=RCN_POLA.map(([pole,etykieta])=>{
    const wybrane=rcnStan.mapowanie[pole];
    return `<label><span>${escapeHTML(etykieta)}</span><select data-rcn-pole="${pole}">${opcje}</select></label>`;
  }).join('');
  RCN_POLA.forEach(([pole])=>{
    const sel=root.querySelector(`[data-rcn-pole="${pole}"]`);
    if(sel) sel.value=rcnStan.mapowanie[pole]===undefined?'':String(rcnStan.mapowanie[pole]);
  });
  root.querySelectorAll('[data-rcn-pole]').forEach(sel=>sel.addEventListener('change',()=>{
    const v=sel.value;
    if(v==='') delete rcnStan.mapowanie[sel.dataset.rcnPole];
    else rcnStan.mapowanie[sel.dataset.rcnPole]=Number(v);
    rcnRysujPodglad();
  }));
  rcnRysujPodglad();
}

function rcnRysujPodglad(){
  const head=$('#rcnPodgladHead'), body=$('#rcnPodgladBody'); if(!head||!body||!rcnStan) return;
  const pola=RCN_POLA.filter(([p])=>rcnStan.mapowanie[p]!==undefined);
  head.innerHTML=`<tr>${pola.map(([,e])=>`<th>${escapeHTML(e)}</th>`).join('')}</tr>`;
  const probka=window.OperoRCN.wczytaj(rcnStan.wiersze, rcnStan.mapowanie, rcnStan.naglowek+1).slice(0,5);
  body.innerHTML=probka.map(t=>`<tr>${pola.map(([p])=>{
    const v=p==='data'?t.data:p==='cena'?t.cena:p==='powierzchnia'?t.powierzchnia:
      p==='cenaJednostkowa'?t.cenaJednostkowa:t[p==='uwagi'?'uwagiZrodla':p];
    return `<td>${escapeHTML(v==null||v===''?'—':String(v))}</td>`;
  }).join('')}</tr>`).join('')||'<tr><td>Brak wierszy do pokazania.</td></tr>';
}

function rcnPrzedmiot(){
  // Parametry przedmiotu wyceny bierzemy z operatu, nie pytamy o nie drugi raz.
  return {
    powierzchnia:Number(project.property?.area||project.local?.area||project.building?.area||0)||null,
    dataWyceny:project.valuation?.valuationDate||project.valuation?.priceLevelDate||todayISO(),
    miejscowosc:project.property?.city||'',
    obreb:project.property?.precinct||project.egib?.precinct||'',
    prawo:project.legal?.rightType||'własność',
    okresMiesiecy:Number(project.market?.analysisMonths||24),
  };
}

function rcnDoDoboru(){
  if(!rcnStan) return;
  const t=window.OperoRCN.wczytaj(rcnStan.wiersze, rcnStan.mapowanie, rcnStan.naglowek+1);
  rcnStan.ocena=window.OperoRCN.ocen(t, rcnPrzedmiot());
  // Domyslnie proponujemy dziesiec najlepiej dopasowanych — propozycja, nie decyzja.
  rcnStan.zaznaczone=new Set(rcnStan.ocena.przyjete.slice(0,10).map(x=>x.zrodloWiersz));
  // Odrzucone sa widoczne OD RAZU. Rzeczoznawca ma je zobaczyc i ocenic sam -
  // kontrola jakosci jest sitem, nie wyrokiem, a pozycja odrzucona „bo poza
  // przyjetym okresem" albo „bo inne prawo" czasem jest wlasnie ta wlasciwa.
  rcnStan.przypisaneMimo = rcnStan.przypisaneMimo || new Map();
  if($('#rcnPokazOdrzucone')) $('#rcnPokazOdrzucone').checked = true;
  rcnRysujDobor();
  rcnKrok('dobor');
}

function rcnRysujDobor(){
  const o=rcnStan?.ocena; if(!o) return;
  const s=o.statystyka;
  if($('#rcnStatystyka')) $('#rcnStatystyka').innerHTML=
    `<div><b>${s.wczytane}</b><span>wczytanych wierszy</span></div>`+
    `<div><b>${s.przyjete}</b><span>nadaje się do porównania</span></div>`+
    `<div><b>${s.odrzucone}</b><span>odrzuconych z powodem</span></div>`+
    `<div><b>${s.mediana!=null?s.mediana.toLocaleString('pl-PL'):'—'}</b><span>mediana zł/m²</span></div>`;
  const pokazOdrzucone=$('#rcnPokazOdrzucone')?.checked;
  const lista=pokazOdrzucone?o.wszystkie:o.przyjete;
  const body=$('#rcnTabela'); if(!body) return;
  rcnStan.przypisaneMimo = rcnStan.przypisaneMimo || new Map();
  body.innerHTML=lista.map(t=>{
    const mimo=rcnStan.przypisaneMimo.get(t.zrodloWiersz);
    const zazn=rcnStan.zaznaczone.has(t.zrodloWiersz);
    const powod=t.powod?`<i class="rcn-powod">${escapeHTML(t.powod)}</i>`
      :(t.uwagi.length?escapeHTML(t.uwagi.join('; ')):'—');
    // Odrzucona pozycja ma wlasny przycisk. Zaznaczenia jej nie wystarczy:
    // program prosi o jedno zdanie uzasadnienia, bo to ono pojdzie do operatu
    // i to ono bedzie czytal weryfikator. Ciche przyjecie odrzuconej
    // transakcji byloby najgorszym wyjsciem: nikt nie wiedzialby, dlaczego.
    const komorkaWyboru = t.powod
      ? (mimo
        ? `<button type="button" class="btn mini rcn-mimo-wlaczone" data-rcn-cofnij="${t.zrodloWiersz}" title="${escapeHTML(mimo)}">✓ przypisana</button>`
        : `<button type="button" class="btn mini ghost" data-rcn-mimo="${t.zrodloWiersz}">Przypisz mimo to</button>`)
      : `<input type="checkbox" data-rcn-wiersz="${t.zrodloWiersz}" ${zazn?'checked':''}>`;
    return `<tr class="${t.powod?(mimo?'rcn-odrzucona rcn-przypisana-mimo':'rcn-odrzucona'):''}">
      <td>${komorkaWyboru}</td>
      <td>${t.zrodloWiersz}</td><td>${escapeHTML(t.data||'—')}</td><td>${escapeHTML(t.adres||'—')}</td>
      <td>${t.powierzchnia??'—'}</td><td>${t.cena!=null?t.cena.toLocaleString('pl-PL'):'—'}</td>
      <td>${t.jednostkowa!=null?Math.round(t.jednostkowa).toLocaleString('pl-PL'):'—'}</td>
      <td>${t.powod?'—':`<span class="rcn-punkty" style="--p:${t.punkty}%">${t.punkty}</span>`}</td>
      <td>${powod}${mimo?`<b class="rcn-uzasadnienie">Twoje uzasadnienie: ${escapeHTML(mimo)}</b>`:''}</td></tr>`;
  }).join('')||'<tr><td colspan="9">Brak wierszy.</td></tr>';
  body.querySelectorAll('[data-rcn-wiersz]').forEach(ch=>ch.addEventListener('change',()=>{
    const n=Number(ch.dataset.rcnWiersz);
    if(ch.checked) rcnStan.zaznaczone.add(n); else rcnStan.zaznaczone.delete(n);
  }));
  body.querySelectorAll('[data-rcn-mimo]').forEach(b=>b.addEventListener('click',()=>rcnPrzypiszMimo(Number(b.dataset.rcnMimo))));
  body.querySelectorAll('[data-rcn-cofnij]').forEach(b=>b.addEventListener('click',()=>{
    const n=Number(b.dataset.rcnCofnij);
    rcnStan.przypisaneMimo.delete(n);
    rcnStan.zaznaczone.delete(n);
    rcnRysujDobor();
  }));
  const ileMimo=rcnStan.przypisaneMimo.size;
  const info=$('#rcnMimoInfo');
  if(info){
    info.classList.toggle('hidden', ileMimo===0);
    info.textContent = ileMimo
      ? `Przypisałeś ${ileMimo} ${ileMimo===1?'transakcję odrzuconą':'transakcje odrzucone'} przez kontrolę. `
        + 'Twoje uzasadnienie pójdzie do operatu przy każdej z nich — weryfikator zobaczy i powód odrzucenia, i Twój powód przyjęcia.'
      : '';
  }
}

/**
 * Przypisanie transakcji, ktora kontrola odrzucila.
 *
 * Program nie udaje, ze zmienil zdanie: powod odrzucenia ZOSTAJE przy
 * transakcji, a obok niego staje zdanie rzeczoznawcy. Oba ida do operatu.
 * Tak to wyglada w obronie operatu: nie „program to przyjal", a „przyjalem to
 * ja, z takiego powodu".
 */
function rcnPrzypiszMimo(numer){
  const o=rcnStan?.ocena; if(!o) return;
  const t=(o.wszystkie||[]).find(x=>x.zrodloWiersz===numer);
  if(!t) return;
  const uzasadnienie=(prompt(
    `Ta transakcja została odrzucona: ${t.powod}.\n\n`
    + 'Jeżeli uważasz, że mimo to pasuje — napisz jednym zdaniem dlaczego. '
    + 'To zdanie pójdzie do operatu obok powodu odrzucenia.',
    '')||'').trim();
  if(!uzasadnienie){
    mowi('Transakcji odrzuconej nie przypisałem — bez uzasadnienia nie da się jej obronić w operacie.',
      { rodzaj: 'ostrzezenie', grupa: 'Dobór transakcji', pasek: false });
    return;
  }
  rcnStan.przypisaneMimo.set(numer, uzasadnienie);
  rcnStan.zaznaczone.add(numer);
  rcnRysujDobor();
  mowi(`Przypisałeś transakcję odrzuconą przez kontrolę (wiersz ${numer}).`, {
    rodzaj: 'ostrzezenie', grupa: 'Dobór transakcji', pasek: false,
    szczegoly: `Powód odrzucenia: ${t.powod}. Twoje uzasadnienie: ${uzasadnienie}. Oba zdania idą do operatu.`,
  });
}

/**
 * Wyciag dopisujemy do wlasnej bazy w calosci - takze te wiersze, ktorych
 * rzeczoznawca nie wzial do TEGO operatu. Za pol roku, przy wycenie sasiedniej
 * nieruchomosci, moga byc wlasnie tymi wlasciwymi. Odrzuconych przez kontrole
 * (darowizny, duplikaty, ceny razaco odstajace) nie dopisujemy: to nie sa
 * transakcje rynkowe i w bazie tylko zasmiecalyby podpowiedzi.
 */
async function rcnDoBazy(){
  const o=rcnStan?.ocena; if(!o) return;
  // Do bazy ida takze te odrzucone, ktore rzeczoznawca przypisal sam: raz je
  // przemyslal i obronil, wiec za pol roku nie ma powodu kazac mu tego robic
  // drugi raz. Odrzuconych, ktorych NIE przyjal, nie dopisujemy - to nie sa
  // transakcje rynkowe i w bazie tylko zasmiecalyby podpowiedzi.
  const mimo=rcnStan.przypisaneMimo||new Map();
  const doBazy=[...(o.przyjete||[]),
    ...(o.odrzucone||[]).filter(t=>mimo.has(t.zrodloWiersz))
      .map(t=>({...t, uwagiZrodla:`${t.uwagiZrodla||''} Przyjęta mimo odrzucenia przez kontrolę (${t.powod}): ${mimo.get(t.zrodloWiersz)}`.trim()}))];
  const r=await bazaZapiszZWyciagu(doBazy, rcnStan.plik||'');
  if(!r) return;
  const el=$('#rcnPodsumowanie');
  if(el){
    el.insertAdjacentHTML('beforeend', r.dodane
      ? `<p class="baza-dopisane"><b>${r.dodane}</b> ${r.dodane===1?'transakcja trafiła':'transakcji trafiło'} do Twojej bazy rynku${r.pominiete?` (${r.pominiete} już tam było)`:''}. Łącznie masz w niej ${r.razem}.</p>`
      : `<p class="baza-dopisane">Wszystkie ${r.pominiete} transakcji z tego wyciągu były już w Twojej bazie rynku. Łącznie masz w niej ${r.razem}.</p>`);
  }
}

function rcnPrzenies(){
  const o=rcnStan?.ocena; if(!o) return;
  // Do operatu ida pozycje przyjete przez kontrole ORAZ te odrzucone, ktore
  // rzeczoznawca przypisal sam - kazda z jego uzasadnieniem i z zachowanym
  // powodem odrzucenia.
  const mimo=rcnStan.przypisaneMimo||new Map();
  const wybrane=[
    ...o.przyjete.filter(t=>rcnStan.zaznaczone.has(t.zrodloWiersz)),
    ...(o.odrzucone||[]).filter(t=>mimo.has(t.zrodloWiersz)).map(t=>({
      ...t,
      przypisanaMimoOdrzucenia: true,
      powodOdrzucenia: t.powod,
      uzasadnienieRzeczoznawcy: mimo.get(t.zrodloWiersz),
      uwagi: [...(t.uwagi||[]),
        `Kontrola odrzuciła tę transakcję: ${t.powod}.`,
        `Rzeczoznawca przyjął ją mimo to: ${mimo.get(t.zrodloWiersz)}`],
      powod: null,
    })),
  ].sort((a,b)=>a.zrodloWiersz-b.zrodloWiersz);
  // Zadnej blokady na liczbie transakcji. Program, ktory odmawia dodania
  // tego, co wlasnie znalazl, odbiera rzeczoznawcy material i kaze mu
  // przepisywac go recznie. Ostrzegamy - decyduje czlowiek, bo to on wie,
  // czy jedna transakcja z sasiedniej klatki jest warta wiecej niz piec
  // z drugiego konca miasta.
  if(!wybrane.length){ mowi('Nie zaznaczyłeś żadnej transakcji.',{rodzaj:'pytanie',grupa:'Dobór transakcji'}); return; }
  const nowe=window.OperoRCN.doOperatu(wybrane, 1);
  if((project.market.transactions||[]).length &&
     !confirm(`W operacie jest już ${project.market.transactions.length} transakcji. Zastąpić je ${nowe.length} wczytanymi z wyciągu?`)) return;
  project.market.transactions=nowe.map((t,i)=>{
    const zrodlowa=wybrane[i]||{};
    return {...t, useForPair:isPairModule(),
      ...(zrodlowa.przypisanaMimoOdrzucenia ? {
        przypisanaMimoOdrzucenia: true,
        powodOdrzucenia: zrodlowa.powodOdrzucenia,
        uzasadnienieRzeczoznawcy: zrodlowa.uzasadnienieRzeczoznawcy,
      } : {})};
  });
  changed({fullDynamic:true});
  const ileMimo=(rcnStan.przypisaneMimo||new Map()).size;
  if(ileMimo){
    mowi(`Do operatu weszło ${ileMimo} ${ileMimo===1?'transakcja':'transakcje'} odrzucone przez kontrolę, z Twoim uzasadnieniem.`,
      { rodzaj: 'ostrzezenie', grupa: 'Dobór transakcji',
        szczegoly: 'Przy każdej z nich w operacie stanie powód odrzucenia i Twoje zdanie o tym, dlaczego mimo to pasuje.' });
  }
  const s=o.statystyka;
  if($('#rcnPodsumowanie')) $('#rcnPodsumowanie').innerHTML=
    `<p><b>${nowe.length}</b> transakcji trafiło do operatu z pliku <code>${escapeHTML(String(rcnStan.plik||''))}</code>.</p>`+
    `<p>Z ${s.wczytane} wierszy wyciągu odrzucono ${s.odrzucone} — każdy z podaniem powodu. Mediana przyjętych: ${s.mediana!=null?s.mediana.toLocaleString('pl-PL'):'—'} zł/m².</p>`+
    `<p class="hint">Δt do daty wyceny policzy silnik z dat transakcji. Oceny cech rynkowych uzupełnij w tabeli — import ich nie zgaduje.</p>`;
  if($('#importSummary')) $('#importSummary').textContent=
    `Wyciąg RCiWN: ${nowe.length} z ${s.wczytane} wierszy. Odrzucono ${s.odrzucone} (powody przy każdym wierszu w oknie importu).`;
  if(nowe.length<3){
    mowi(`W operacie jest ${nowe.length} ${window.OperoSzukanie ? window.OperoSzukanie.odmien(nowe.length,'transakcja','transakcje','transakcji') : 'transakcji'} — do wyceny porównawczej to mało.`,
      { rodzaj:'ostrzezenie', grupa:'Dobór transakcji',
        szczegoly:'Dobierz więcej albo uzasadnij w operacie, dlaczego tyle wystarczy. Program Ci tego nie zabrania — '
          + 'to Ty odpowiadasz za dobór nieruchomości podobnych.' });
  }
  rcnKrok('koniec');
  rcnDoBazy();
}

function hookRCN(){
  $('#rcnStart')?.addEventListener('click',e=>{e.stopPropagation();rcnOtworz();});
  $('#rcnZamknij')?.addEventListener('click',rcnZamknij);
  $('#rcnOverlay')?.addEventListener('click',e=>{ if(e.target.id==='rcnOverlay') rcnZamknij(); });
  $('#rcnWybierz')?.addEventListener('click',rcnWybierzPlik);
  $('#rcnDoDoboru')?.addEventListener('click',rcnDoDoboru);
  $('#rcnPokazOdrzucone')?.addEventListener('change',rcnRysujDobor);
  $('#rcnZaznaczNaj')?.addEventListener('click',()=>{
    if(!rcnStan?.ocena) return;
    rcnStan.zaznaczone=new Set(rcnStan.ocena.przyjete.slice(0,10).map(x=>x.zrodloWiersz)); rcnRysujDobor();
  });
  $('#rcnOdznacz')?.addEventListener('click',()=>{ if(rcnStan){ rcnStan.zaznaczone=new Set(); rcnRysujDobor(); } });
  $('#rcnPrzenies')?.addEventListener('click',rcnPrzenies);
  $('#rcnDoObliczen')?.addEventListener('click',()=>{ rcnZamknij(); switchTab('result'); });
  $('#rcnDoPER')?.addEventListener('click',()=>{
    rcnZamknij(); openPiorekPanel(); setPiorekView('ask');
    const q=$('#piorekQuestion');
    if(q) q.value='Jak uzasadnić dobór transakcji porównawczych wczytanych z wyciągu RCiWN w tym operacie?';
  });
}

/* ============================================================
   OPERO 1.11.0 — kontrola operatu w trakcie pracy

   Pasek górny pokazuje przez cały czas, na ile operat jest gotowy i ile w nim
   błędów. Kliknięcie otwiera listę: co zrobione dobrze, co budzi wątpliwość,
   co trzeba poprawić — każda pozycja prowadzi do kroku, w którym się ją naprawia.

   Kontrola przelicza się przy każdej zmianie danych, ale nie częściej niż raz na
   300 ms: przy wpisywaniu adresu litera po literze przeliczanie całego operatu
   po każdym znaku zablokowałoby pisanie.
   ============================================================ */
// Swiadomie `var`, a nie `let`: ten blok stoi na koncu pliku, a init() wola
// hookKontrola() wczesniej. Przy `let` kazde dotkniecie tych zmiennych przed ich
// linia konczy sie bledem strefy martwej i reszta skryptu w ogole sie nie wykonuje
// — pulapka opisana w README-BUDOWANIE.txt.
var kontrolaWynik=null, kontrolaFiltr='wszystko', kontrolaTimer=0;
var kontrolaPoprzednieBledy=null, kontrolaPoprzednieTytuly=null;

function kontrolaBrakiWgKroku(){
  const out={};
  for(const s of WIZARD_STEPS){
    if(['photos','costing','appearance'].includes(s.tab)) continue;
    const b=validateStep(s.tab);
    if(b.length) out[s.tab]=b;
  }
  return out;
}

function kontrolaPrzelicz(){
  if(!window.OperoKontrola) return null;
  let wynik=null;
  try{ wynik=obliczProjekt(); }catch{ wynik=null; }
  try{
    kontrolaWynik=window.OperoKontrola.ocen(project, wynik, kontrolaBrakiWgKroku(),
      {parowy:isPairModule(), modul:moduleCode()});
  }catch(e){ console.error('kontrola',e); return null; }
  kontrolaRysujChip();
  if($('#kontrolaPanel') && !$('#kontrolaPanel').classList.contains('hidden')) kontrolaRysujListe();
  kontrolaPowiadom();
  return kontrolaWynik;
}

function kontrolaOdswiezPozniej(){
  clearTimeout(kontrolaTimer);
  kontrolaTimer=setTimeout(kontrolaPrzelicz,300);
}

/** Informowanie w trakcie pracy: mówimy tylko wtedy, gdy coś się faktycznie zmieniło. */
function kontrolaPowiadom(){
  const teraz=kontrolaWynik?.podsumowanie?.bledy;
  if(teraz==null) return;
  const tytuly=new Set(kontrolaWynik.pozycje.filter(x=>x.stan==='blad').map(x=>`${x.tytul} · ${x.szczegol}`));
  const bylo=kontrolaPoprzednieBledy, byly=kontrolaPoprzednieTytuly;
  kontrolaPoprzednieBledy=teraz; kontrolaPoprzednieTytuly=tytuly;
  if(bylo==null) return;

  // Nazywamy TEN blad, ktory wlasnie powstal, a nie pierwszy lepszy z listy.
  // Komunikat „pojawil sie blad: suma wag", gdy uzytkownik zmienil date ogledzin,
  // jest gorszy od milczenia — kazalby szukac usterki w zupelnie innym miejscu.
  const nowe=[...tytuly].filter(x=>!byly?.has(x));
  const naprawione=byly?[...byly].filter(x=>!tytuly.has(x)):[];

  if(teraz===0 && bylo>0){
    showStatus('Kontrola operatu: nie ma już błędów blokujących. Zostały tylko uwagi do rozważenia.','success',6000);
    agrafekStan('zadowolony'); setTimeout(()=>agrafekStan(null),2400);
    return;
  }
  if(nowe.length){
    const co=nowe[0].split(' · ')[0];
    // JEDEN komunikat w JEDNYM miejscu. Wczesniej ten sam blad oglaszal
    // pasek, licznik i jeszcze dymek PER-a, ktory stawal NA gornym pasku
    // i zaslanial go. Zdanie tez bylo urwane: „Kontrola operatu: Miasto."
    showStatusTlo(`Do poprawy doszło: ${co}. ${teraz===1?'To jedyna pozycja do poprawy':`Razem do poprawy: ${teraz}`}.`,'error',7000);
    agrafekStan('ostrzega'); setTimeout(()=>agrafekStan(null),2400);
    return;
  }
  if(naprawione.length && teraz<bylo){
    // Bez nazywania pozycji: jedna zmiana potrafi zdjac z listy wymog, ktory
    // z wpisywanym polem nie ma nic wspolnego (np. zmiana rodzaju prawa
    // znosi obowiazek podania udzialu), i komunikat brzmial wtedy jak pomylka.
    showStatusTlo(`Ubyła pozycja do poprawy. Zostaje: ${teraz}.`,'success',4000);
  }
}

function kontrolaRysujChip(){
  const chip=$('#kontrolaChip'); if(!chip||!kontrolaWynik) return;
  const p=kontrolaWynik.podsumowanie;
  chip.dataset.state=p.bledy?'blad':(p.uwagi?'uwaga':'ok');
  if($('#kontrolaProcent')) $('#kontrolaProcent').textContent=`${p.gotowosc}%`;
  const pasek=$('#kontrolaPasek i'); if(pasek) pasek.style.width=`${p.gotowosc}%`;
  if($('#kontrolaLiczniki')) $('#kontrolaLiczniki').textContent=
    p.bledy?`${p.bledy} do poprawy`:(p.uwagi?`${p.uwagi} ${p.uwagi===1?'uwaga':'uwag'}`:'bez zastrzeżeń');
  chip.title=`Gotowość ${p.gotowosc}% · zrobione dobrze: ${p.ok} · uwagi: ${p.uwagi} · do poprawy: ${p.bledy}`;
}

const KONTROLA_IKONY={ok:'✓',uwaga:'!',blad:'✕'};

function kontrolaRysujListe(){
  const root=$('#kontrolaLista'); if(!root||!kontrolaWynik) return;
  const p=kontrolaWynik.podsumowanie;
  if($('#kontrolaTytul')) $('#kontrolaTytul').textContent=
    p.bledy?`${p.bledy} ${p.bledy===1?'rzecz do poprawy':'rzeczy do poprawy'}`
      :(p.uwagi?`Bez błędów, ${p.uwagi} ${p.uwagi===1?'uwaga':'uwag'} do rozważenia`:'Operat bez zastrzeżeń');
  const widoczne=(x)=>kontrolaFiltr==='wszystko'||x.stan===kontrolaFiltr;
  root.innerHTML=kontrolaWynik.aspekty.map(a=>{
    const lista=a.pozycje.filter(widoczne);
    if(!lista.length) return '';
    return `<section class="kontrola-aspekt">
      <h4>${escapeHTML(a.nazwa)}<span>${a.bledy?`<i class="zly">${a.bledy}</i>`:''}${a.uwagi?`<i class="uwaga">${a.uwagi}</i>`:''}${a.ok?`<i class="dobry">${a.ok}</i>`:''}</span></h4>
      ${lista.map(x=>`<button type="button" class="kontrola-poz" data-kontrola-krok="${escapeHTML(x.krok)}" data-stan="${x.stan}">
        <span class="znak">${KONTROLA_IKONY[x.stan]}</span>
        <span class="tresc"><b>${escapeHTML(x.tytul)}</b>${x.szczegol?`<small>${escapeHTML(x.szczegol)}</small>`:''}</span>
      </button>`).join('')}
    </section>`;
  }).join('')||'<p class="hint">Nic do pokazania w tym widoku.</p>';
  root.querySelectorAll('[data-kontrola-krok]').forEach(b=>b.addEventListener('click',()=>{
    const tab=b.dataset.kontrolaKrok;
    const i=WIZARD_STEPS.findIndex(s=>s.tab===tab);
    if(i>=0) wizardIndex=i;
    switchTab(tab);
    kontrolaZamknij();
  }));
}

function kontrolaOtworz(){ kontrolaPrzelicz(); $('#kontrolaPanel')?.classList.remove('hidden'); kontrolaRysujListe(); }
function kontrolaZamknij(){ $('#kontrolaPanel')?.classList.add('hidden'); }

/** Zwięzły opis kontroli dla modelu — PER ma widzieć to samo, co użytkownik. */
function kontrolaDlaPER(){
  if(!kontrolaWynik) kontrolaPrzelicz();
  if(!kontrolaWynik) return null;
  const p=kontrolaWynik.podsumowanie;
  const wybor=(stan,ile)=>kontrolaWynik.pozycje.filter(x=>x.stan===stan).slice(0,ile)
    .map(x=>({aspekt:x.aspekt,tytul:x.tytul,szczegol:x.szczegol,krok:x.krok}));
  return {gotowosc:p.gotowosc, gotowyDoPDF:p.gotowyDoPDF,
    doPoprawy:wybor('blad',25), uwagi:wybor('uwaga',25), zrobioneDobrze:wybor('ok',20)};
}

function hookKontrola(){
  $('#kontrolaChip')?.addEventListener('click',e=>{e.stopPropagation();
    $('#kontrolaPanel')?.classList.contains('hidden')?kontrolaOtworz():kontrolaZamknij();});
  $('#kontrolaZamknij')?.addEventListener('click',kontrolaZamknij);
  $$('[data-kontrola-filtr]').forEach(b=>b.addEventListener('click',()=>{
    kontrolaFiltr=b.dataset.kontrolaFiltr;
    $$('[data-kontrola-filtr]').forEach(x=>x.classList.toggle('aktywny',x===b));
    kontrolaRysujListe();
  }));
  $('#kontrolaDoPER')?.addEventListener('click',()=>{
    kontrolaZamknij(); openPiorekPanel(); setPiorekView('ask');
    const q=$('#piorekQuestion');
    if(q) q.value='Sprawdź kontrolę tego operatu i powiedz, co poprawić w pierwszej kolejności i dlaczego.';
    setTimeout(()=>agrafekZapytaj(),120);
  });
  // Pierwsze liczenie odkladamy na po zakonczeniu inicjalizacji — w jej trakcie
  // czesc danych projektu jeszcze nie istnieje, a kontrola mialaby co zglaszac
  // tylko dlatego, ze program sie jeszcze nie zbudowal.
  setTimeout(kontrolaPrzelicz,0);
}

/* ============================================================
   OPERO 1.14.0 — panel PER prowadzony jak rozmowa, nie jak formularz

   Trzy rzeczy, których tu brakowało: widać, o czym PER wie w tej chwili
   (kontekst), widać, jak głęboko ma szukać (tryb), i widać, czy w ogóle ma czym
   myśleć (pasek modelu). Dotąd wszystko to trzeba było wiedzieć z pamięci.
   ============================================================ */

// Świadomie `var`: ten blok stoi na końcu pliku, a init() woła hookAgrafekPilot()
// wcześniej. Przy `let` cały dalszy skrypt padłby na martwej strefie — pułapka
// opisana w README-BUDOWANIE.txt.
var agrafekTryb = 'standard';

const AGRAFEK_TRYBY = {
  szybki:   { nazwa: 'Szybki',   opis: 'Same cytaty z Biblii OPERO — bez modelu, natychmiast.' },
  standard: { nazwa: 'Standard', opis: 'Biblia plus model językowy, który układa z niej odpowiedź.' },
  gleboki:  { nazwa: 'Głęboki',  opis: 'Jak Standard, ale PER zagląda też w dane operatu, wynik i kontrolę.' },
};

/** Gdzie jesteśmy — to samo, co PER dostaje w kontekście pytania. */
function agrafekKontekstOpis() {
  const zakladki = { dashboard: 'Start', project: 'Operat', history: 'Historia', result: 'Wynik', settings: 'Ustawienia' };
  const tab = document.querySelector('.tab.active')?.id?.replace(/^tab-/, '') || 'dashboard';
  const st = WIZARD_STEPS?.[wizardIndex];
  const krok = st && typeof dynamicStepName === 'function' ? dynamicStepName(st) : '';
  const modul = (typeof moduleInfo === 'function' ? (moduleInfo()?.title || '') : '');
  return [zakladki[tab] || tab, tab === 'project' ? krok : modul].filter(Boolean).join(' / ') || 'OPERO';
}

function agrafekOdswiezKontekst() {
  const el = $('#agrafekKontekst');
  if (el) el.textContent = agrafekKontekstOpis();
  const znacznik = $('#agrafekZnacznikLokalny');
  if (znacznik) {
    const chmura = agrafekStatus?.settings?.engine === 'OPENAI' && agrafekStatus?.active;
    znacznik.textContent = chmura ? 'model w chmurze' : 'tryb lokalny';
    znacznik.classList.toggle('chmura', !!chmura);
    znacznik.title = chmura
      ? 'Pytania idą do OpenAI na Twoim kluczu. Dane operatu czytają narzędzia na tym komputerze — model dostaje tylko ich wynik.'
      : 'Nic nie wychodzi z tego komputera: Biblia leży na dysku, a model (jeśli jest) działa lokalnie.';
  }
}

/** Ustawia tryb odpowiedzi i zapamiętuje go między uruchomieniami. */
function agrafekUstawTryb(tryb) {
  agrafekTryb = AGRAFEK_TRYBY[tryb] ? tryb : 'standard';
  try { localStorage.setItem('opero.agrafek.tryb', agrafekTryb); } catch {}
  $$('[data-agrafek-tryb]').forEach(b => b.classList.toggle('active', b.dataset.agrafekTryb === agrafekTryb));
  agrafekOdswiezPasekModelu();
}

/** Pasek na dole panelu: czym PER myśli i co zrobić, gdy niczym. */
function agrafekOdswiezPasekModelu() {
  const pasek = $('#agrafekPasekModelu'), tekst = $('#agrafekPasekModeluTekst'), akcja = $('#agrafekPasekModeluAkcja');
  const info = $('#agrafekTrybInfo'), infoTytul = $('#agrafekTrybInfoTytul'), infoTresc = $('#agrafekTrybInfoTresc');
  if (!pasek || !tekst) return;
  const st = agrafekStatus;
  const modelDziala = !!st?.active;
  const silnik = st?.settings?.engine === 'OPENAI' ? 'OpenAI' : 'model lokalny';

  // W trybie szybkim model jest nieistotny — nie straszymy jego brakiem.
  if (agrafekTryb === 'szybki') {
    pasek.classList.remove('hidden', 'brak');
    pasek.classList.add('ok');
    tekst.textContent = 'Tryb szybki: odpowiedź powstaje wyłącznie z Biblii OPERO na tym dysku.';
    akcja?.classList.add('hidden');
    info?.classList.add('hidden');
    return;
  }

  pasek.classList.remove('hidden');
  pasek.classList.toggle('ok', modelDziala);
  pasek.classList.toggle('brak', !modelDziala);
  if (modelDziala) {
    tekst.textContent = `PER myśli przez ${silnik}${st?.settings?.localModel && st?.settings?.engine !== 'OPENAI' ? ` (${st.settings.localModel})` : ''}.`;
    akcja?.classList.add('hidden');
    info?.classList.add('hidden');
  } else {
    tekst.textContent = st?.message || 'Nie znaleziono modelu — PER odpowiada samą Biblią.';
    if (akcja) {
      akcja.classList.remove('hidden');
      akcja.textContent = st?.configured ? 'Pobierz model' : 'Ustaw model';
    }
    if (info && infoTytul && infoTresc) {
      info.classList.remove('hidden');
      infoTytul.textContent = 'Tryb wbudowany — bez modelu';
      infoTresc.textContent = 'Odpowiedzi powstają z Biblii OPERO leżącej w folderze programu — reguły, wzory i źródła. Do sieci nic nie wychodzi. Model językowy dołoży własne zdanie dopiero wtedy, gdy go podłączysz.';
    }
  }
}

function hookAgrafekPilot() {
  try { agrafekTryb = localStorage.getItem('opero.agrafek.tryb') || 'standard'; } catch { agrafekTryb = 'standard'; }
  if (!AGRAFEK_TRYBY[agrafekTryb]) agrafekTryb = 'standard';
  $$('[data-agrafek-tryb]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation(); agrafekUstawTryb(b.dataset.agrafekTryb);
  }));
  $('#agrafekPasekModeluAkcja')?.addEventListener('click', e => {
    e.stopPropagation();
    // Prowadzimy tam, gdzie się to naprawia, zamiast tłumaczyć w dymku.
    $('#agrafekSzczegoly')?.classList.remove('hidden');
    $('#asystentPasek')?.scrollIntoView({ block: 'center', behavior: uiPrefs.motion === 'full' ? 'smooth' : 'auto' });
  });
  agrafekUstawTryb(agrafekTryb);
  agrafekOdswiezKontekst();
  agrafekOdswiezPasekModelu();
}

/* ============================================================
   OPERO 1.17.1 — ASYSTENT BEZ INSTRUKCJI OBSŁUGI

   Założenie: rzeczoznawca ma otworzyć program i mieć pomocnika, a nie listę
   rzeczy do skonfigurowania. Dlatego:
     • Biblia OPERO dociąga się sama przy pierwszym uruchomieniu,
     • model językowy dociąga się sam, jeśli tylko jest czym go uruchomić,
     • w panelu zostaje jedno zdanie: asystent jest aktywny albo go włączamy.
   Co leży na dysku, ile ma reguł i w której wersji — chowamy w „Ustawieniach
   zaawansowanych”. Model nadal nie jest w instalatorze (waży kilka GB), ale
   użytkownik nie musi o tym wiedzieć ani niczego klikać krok po kroku.
   ============================================================ */
var asystentStan = { faza: 'wait', procent: 0, opis: '', pracuje: false, probaModelu: false, probaBiblii: false };
var asystentCzuwanie = null;

function asystentModelDomyslny() {
  return (($('#agrafekLocalModel')?.value || '').trim()) || 'llama3.1:8b';
}

/** Jedno zdanie w panelu. Nic poza nim nie mówi o stanie wgranych rzeczy. */
function asystentRysuj() {
  const pasek = $('#asystentPasek'), tekst = $('#asystentPasekTekst');
  const post = $('#asystentPasekPostep'), akcja = $('#asystentWlacz');
  if (!pasek || !tekst) return;
  const aktywny = !!agrafekStatus?.active;

  if (asystentStan.pracuje) {
    pasek.dataset.stan = 'praca';
    tekst.textContent = asystentStan.opis || 'Przygotowuję asystenta…';
    if (post) {
      post.classList.toggle('hidden', !(asystentStan.procent > 0));
      const i = post.querySelector('i'); if (i) i.style.width = `${Math.min(100, asystentStan.procent)}%`;
    }
    akcja?.classList.add('hidden');
    return;
  }
  post?.classList.add('hidden');
  if (aktywny) {
    pasek.dataset.stan = 'ok';
    tekst.textContent = 'Asystent aktywny — pytaj o co chcesz.';
    akcja?.classList.add('hidden');
    return;
  }
  if (!agrafekStatus) {
    pasek.dataset.stan = 'wait';
    tekst.textContent = 'Sprawdzam asystenta…';
    akcja?.classList.add('hidden');
    return;
  }
  pasek.dataset.stan = 'off';
  tekst.textContent = 'Asystent nieaktywny — odpowiadam z wiedzy OPERO.';
  if (akcja) { akcja.classList.remove('hidden'); akcja.textContent = 'Włącz asystenta'; akcja.disabled = false; }
}

function asystentPracuje(opis, procent = 0) {
  asystentStan.pracuje = true; asystentStan.opis = opis; asystentStan.procent = procent;
  asystentRysuj();
}
function asystentKoniecPracy() {
  asystentStan.pracuje = false; asystentStan.procent = 0; asystentStan.opis = '';
  asystentRysuj();
}

/** Postęp pobierania zamieniony na jeden pasek — bez nazw plików i warstw. */
function asystentPostep(d) {
  if (!asystentStan.pracuje) return;
  const proc = d?.razem > 0 ? Math.min(100, Math.round(d.pobrane / d.razem * 100)) : 0;
  asystentStan.procent = proc;
  asystentStan.opis = d?.etap === 'instalator'
    ? 'Przygotowuję asystenta…'
    : `Przygotowuję asystenta… ${proc ? proc + '%' : ''}`.trim();
  asystentRysuj();
}

/** Biblia: dociągana cicho, raz. Użytkownik nie klika „Pobierz na dysk”. */
async function asystentZadbajOBiblie() {
  if (asystentStan.probaBiblii) return;
  asystentStan.probaBiblii = true;
  try {
    const s = bibliaStanCache || await window.operatAPI.bibliaStan();
    bibliaStanCache = s;
    if (s?.jest) return;
    bibliaStanCache = await window.operatAPI.bibliaPobierz();
    try { bibliaRysuj(); agrafekWskazniki(); } catch {}
  } catch { /* brak sieci przy pierwszym starcie to nie powód do okienka */ }
}

/** Model jedzie w instalatorze — zostaje go tylko obudzić. */
async function asystentZadbajOModel() {
  if (asystentStan.probaModelu) return;
  asystentStan.probaModelu = true;
  try {
    const s = await window.operatAPI.perSilnikStatus();
    perStanSilnika = s;
    if (s?.serwerDziala) return;
    // Tu byla slepa uliczka: gdy brakowalo silnika albo modelu, przycisk
    // „Wlacz asystenta" nie robil NIC, a pasek dalej pisal „nieaktywny".
    // Czlowiek klikal i klikal, i nie dzialo sie nic - najgorszy rodzaj bledu,
    // bo nie widac nawet, ze cos poszlo nie tak. Teraz brak czegokolwiek
    // uruchamia te sama naprawe, co przycisk „Napraw" w panelu PER.
    if (!s?.jest) { await naprawAsystenta(); return; }
    asystentPracuje('Przygotowuję asystenta…');
    await window.operatAPI.perUruchom();
  } catch { /* cisza: panel i tak pokaże „nieaktywny” */ }
  finally { asystentKoniecPracy(); }
  try { await perOdswiezSilnik(); } catch {}
  await agrafekOdswiezStatus(false);
}

/** Start programu: wszystko, co da się przygotować bez pytania, robimy sami. */
async function asystentStart() {
  try {
    if (!asystentOdpiecie && window.operatAPI?.onPerProgress)
      asystentOdpiecie = window.operatAPI.onPerProgress(asystentPostep);
  } catch {}
  asystentRysuj();
  await agrafekOdswiezStatus(false);
  asystentZadbajOBiblie();
  if (!agrafekStatus?.active) await asystentZadbajOModel();
  await agrafekOdswiezStatus(false);
  asystentRysuj();
}
var asystentOdpiecie = null;

function hookAsystent1171() {
  $('#asystentWlacz')?.addEventListener('click', async e => {
    e.stopPropagation();
    const b = e.currentTarget; b.disabled = true;
    asystentStan.probaModelu = false;
    await asystentZadbajOBiblie();
    await asystentZadbajOModel();
    await agrafekOdswiezStatus(false);
    asystentRysuj();
  });
  $('#agrafekZaawansowaneBtn')?.addEventListener('click', e => {
    e.stopPropagation();
    const b = e.currentTarget;
    const pokaz = $$('.agrafek-zaawansowane').some(x => x.classList.contains('hidden'));
    $$('.agrafek-zaawansowane').forEach(x => x.classList.toggle('hidden', !pokaz));
    b.setAttribute('aria-expanded', String(pokaz));
    b.textContent = pokaz ? 'Ukryj ustawienia zaawansowane' : 'Ustawienia zaawansowane';
  });
  asystentRysuj();
}
