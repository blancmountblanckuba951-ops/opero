(function(){
'use strict';
/**
 * OPERO 1.9.3 — pozostałe rodzaje wyceny.
 *
 * Jeden plik, pięć modułów: kosztowy, wywłaszczeniowy, opłat, służebności oraz
 * rolno-leśny. Każdy opisany deklaratywnie: pola, tabele, wzory, braki. Dzięki
 * temu interfejs buduje się sam z tej samej definicji, z której liczy silnik —
 * nie da się dodać pola na ekranie i zapomnieć o nim w obliczeniach.
 *
 * Wzory pochodzą z `opero_formula_definitions` w Biblii OPERO. Przy każdym module
 * zostawiam kod wzoru, żeby dało się sprawdzić, skąd się wziął.
 *
 * `calc.bundle.js` pozostaje zamrożony — nic tu go nie dotyka.
 */
const num=(v)=>{const n=Number(v);return Number.isFinite(n)?n:0;};
const R2=(v)=>Math.round(num(v)*100)/100;
const pct=(v)=>num(v)/100;
const pusty=(v)=>!String(v==null?'':v).trim();

/* ---------- definicje pól i tabel ---------- */
// typ: 'liczba' | 'tekst' | 'obszar' | 'wybor' | 'data' | 'procent'
const P=(kod,etykieta,typ,opcje)=>({kod,etykieta,typ:typ||'tekst',...(opcje||{})});
const TAB=(kod,tytul,opis,kolumny,szablon)=>({kod,tytul,opis,kolumny,szablon});
const K=(kod,etykieta,typ,opcje)=>({kod,etykieta,typ:typ||'tekst',...(opcje||{})});

const MODULY={

/* =========================================================================
   KOSZTOWY — koszt odtworzenia albo zastąpienia, pomniejszony o zużycie.
   Wzory: weighted_depreciation, reproduction_after_wear (building_reproduction_cost)
   ========================================================================= */
cost:{
  tytul:'Koszt odtworzenia lub zastąpienia',
  wstep:'Podejście kosztowe. Wartość obiektu to koszt jego odtworzenia albo zastąpienia w stanie nowym, pomniejszony o zużycie. Koszt jednostkowy i stopień zużycia muszą mieć źródło — bez nich wynik jest nie do sprawdzenia.',
  sekcje:[
    {tytul:'Obiekt i technika', pola:[
      P('technika','Technika','wybor',{opcje:[['odtworzenie','Koszt odtworzenia'],['zastapienie','Koszt zastąpienia']]}),
      P('rodzajObiektu','Rodzaj obiektu','tekst',{ph:'np. budynek gospodarczy murowany'}),
      P('jednostka','Jednostka odniesienia','wybor',{opcje:[['m2','Powierzchnia [m²]'],['m3','Kubatura [m³]']]}),
      P('ilosc','Ilość jednostek','liczba',{krok:'0.01'}),
      P('cenaJednostkowa','Koszt jednostkowy w stanie nowym [zł]','liczba',{krok:'0.01'}),
      P('zrodloCeny','Źródło kosztu jednostkowego','tekst',{ph:'np. Sekocenbud, wydanie i tabela'}),
      P('uzasadnienieTechniki','Uzasadnienie wyboru techniki','obszar',{wiersze:3}),
    ]},
    {tytul:'Zużycie', pola:[
      P('sposobZuzycia','Sposób ustalenia zużycia technicznego','wybor',{opcje:[['elementy','Metoda elementów scalonych'],['wiek','Metoda czasowa (wiek / trwałość)'],['reczne','Wpisane wprost']]}),
      P('wiek','Wiek obiektu [lata]','liczba',{krok:'1'}),
      P('trwalosc','Przewidywana trwałość [lata]','liczba',{krok:'1'}),
      P('zuzycieReczne','Zużycie techniczne wpisane [%]','procent'),
      P('zuzycieFunkcjonalne','Zużycie funkcjonalne [%]','procent'),
      P('zuzycieSrodowiskowe','Zużycie środowiskowe [%]','procent'),
      P('uzasadnienieZuzycia','Uzasadnienie przyjętego zużycia','obszar',{wiersze:3}),
    ]},
    {tytul:'Grunt', pola:[
      P('wliczGrunt','Wartość gruntu doliczana do wyniku','wybor',{opcje:[['tak','Tak — wycena obejmuje grunt'],['nie','Nie — sam obiekt budowlany']]}),
      P('wartoscGruntu','Wartość gruntu [zł]','liczba',{krok:'0.01'}),
      P('zrodloGruntu','Podstawa wartości gruntu','tekst'),
    ]},
  ],
  tabele:[
    TAB('elementy','Elementy scalone','Udziały elementów w koszcie odtworzenia muszą sumować się do 100%. Zużycie oceniane jest osobno dla każdego elementu.',
      [K('nazwa','Element'),K('udzial','Udział w koszcie [%]','liczba',{krok:'0.01'}),K('zuzycie','Zużycie [%]','liczba',{krok:'0.01'}),K('uwaga','Podstawa oceny')],
      ()=>({nazwa:'',udzial:0,zuzycie:0,uwaga:''})),
  ],
  oblicz(p){
    const d=p.modul||{};
    const kosztNowy=R2(num(d.ilosc)*num(d.cenaJednostkowa));
    const el=(d.elementy||[]).filter(x=>num(x.udzial)>0);
    const sumaUdzialow=R2(el.reduce((s,x)=>s+num(x.udzial),0));
    // S_weighted = SUM(cost_share_i * wear_i)  [weighted_depreciation]
    const zuzycieElementy=el.length?R2(el.reduce((s,x)=>s+pct(x.udzial)*num(x.zuzycie),0)):null;
    const zuzycieCzasowe=(num(d.trwalosc)>0)?R2(Math.min(100,num(d.wiek)/num(d.trwalosc)*100)):null;
    const zuzycieTechniczne=d.sposobZuzycia==='elementy'?zuzycieElementy
      :d.sposobZuzycia==='wiek'?zuzycieCzasowe
      :(num(d.zuzycieReczne)>0?num(d.zuzycieReczne):null);
    const laczne=zuzycieTechniczne==null?null
      :R2(Math.min(100,zuzycieTechniczne+num(d.zuzycieFunkcjonalne)+num(d.zuzycieSrodowiskowe)));
    // V_reproduction = Cost_new * (1 - wear_total)  [reproduction_after_wear]
    const poZuzyciu=(laczne==null||kosztNowy<=0)?null:R2(kosztNowy*(1-pct(laczne)));
    const grunt=d.wliczGrunt==='tak'?num(d.wartoscGruntu):0;
    const wartosc=poZuzyciu==null?null:R2(poZuzyciu+grunt);
    return {kosztNowy,sumaUdzialow,zuzycieElementy,zuzycieCzasowe,zuzycieTechniczne,zuzycieLaczne:laczne,
            poZuzyciu,wartoscGruntu:grunt,marketValue:wartosc,
            pricePerM2:(wartosc!=null&&num(d.ilosc)>0&&d.jednostka==='m2')?R2(wartosc/num(d.ilosc)):null,
            powierzchnia:num(d.ilosc)};
  },
  braki(p){
    const d=p.modul||{}, out=[], add=(w,t)=>{ if(w) out.push(t); };
    const w=MODULY.cost.oblicz(p);
    add(!(num(d.ilosc)>0),'Kosztowy: ilość jednostek większa od 0');
    add(!(num(d.cenaJednostkowa)>0),'Kosztowy: koszt jednostkowy w stanie nowym');
    add(pusty(d.zrodloCeny),'Kosztowy: źródło kosztu jednostkowego');
    add(pusty(d.rodzajObiektu),'Kosztowy: rodzaj wycenianego obiektu');
    add(pusty(d.uzasadnienieTechniki),'Kosztowy: uzasadnienie wyboru techniki');
    add(pusty(d.uzasadnienieZuzycia),'Kosztowy: uzasadnienie przyjętego zużycia');
    add(w.zuzycieTechniczne==null,'Kosztowy: stopień zużycia technicznego');
    if(d.sposobZuzycia==='elementy'){
      add(!(d.elementy||[]).length,'Kosztowy: tabela elementów scalonych');
      add((d.elementy||[]).length>0&&Math.abs(w.sumaUdzialow-100)>0.5,`Kosztowy: udziały elementów sumują się do ${w.sumaUdzialow}% zamiast 100%`);
      add((d.elementy||[]).some(x=>pusty(x.uwaga)),'Kosztowy: każdy element musi mieć podstawę oceny zużycia');
    }
    if(d.sposobZuzycia==='wiek') add(!(num(d.trwalosc)>0),'Kosztowy: przewidywana trwałość obiektu');
    if(d.wliczGrunt==='tak'){
      add(!(num(d.wartoscGruntu)>0),'Kosztowy: wartość gruntu');
      add(pusty(d.zrodloGruntu),'Kosztowy: podstawa wartości gruntu');
    }
    return out;
  },
},

/* =========================================================================
   WYWŁASZCZENIE — odszkodowanie. Wzór: road_compensation_uplift (k ≤ 50%).
   ========================================================================= */
expropriation:{
  tytul:'Odszkodowanie za wywłaszczenie lub przejęcie z mocy prawa',
  wstep:'Trzy daty rządzą tą wyceną i nie wolno ich mylić: stan nieruchomości, przeznaczenie i poziom cen mogą pochodzić z różnych momentów. Program pilnuje, żeby każda z nich była podana osobno.',
  sekcje:[
    {tytul:'Podstawa i daty', pola:[
      P('tryb','Tryb','wybor',{opcje:[['ogolny','Tryb ogólny (UGN)'],['drogowy','Tryb drogowy (ZRID)'],['kolejowy','Tryb kolejowy']]}),
      P('celPubliczny','Cel publiczny','tekst',{ph:'np. budowa drogi gminnej nr …'}),
      P('dataStanu','Data stanu nieruchomości','data'),
      P('dataPrzeznaczenia','Data przeznaczenia','data'),
      P('dataCen','Data poziomu cen','data'),
      P('podstawaPrawnaDat','Podstawa prawna doboru dat','obszar',{wiersze:2}),
    ]},
    {tytul:'Przedmiot przejęcia', pola:[
      P('powierzchniaPrzejeta','Powierzchnia przejmowana [m²]','liczba',{krok:'0.01'}),
      P('wartoscJednostkowa','Wartość jednostkowa [zł/m²]','liczba',{krok:'0.01'}),
      P('zrodloWartosci','Podstawa wartości jednostkowej','tekst'),
    ]},
    {tytul:'Powiększenie i składniki', pola:[
      P('powiekszenie','Powiększenie k [%]','procent',{ph:'maks. 50'}),
      P('uzasadnieniePowiekszenia','Uzasadnienie powiększenia z badania rynku','obszar',{wiersze:2}),
      P('skladniki','Wartość składników (nakłady, drzewostan) [zł]','liczba',{krok:'0.01'}),
      P('zmniejszenieReszty','Zmniejszenie wartości części pozostałej [zł]','liczba',{krok:'0.01'}),
      P('uzasadnienieReszty','Uzasadnienie zmniejszenia wartości reszty','obszar',{wiersze:2}),
    ]},
  ],
  tabele:[],
  oblicz(p){
    const d=p.modul||{};
    const bazowa=R2(num(d.powierzchniaPrzejeta)*num(d.wartoscJednostkowa));
    const k=num(d.powiekszenie);
    const przekroczone=k>50;
    // V_road = V_base * (1 + k), k <= 0.50  [road_compensation_uplift]
    const poPowiekszeniu=R2(bazowa*(1+pct(Math.min(k,50))));
    const wartosc=R2(poPowiekszeniu+num(d.skladniki)+num(d.zmniejszenieReszty));
    return {wartoscBazowa:bazowa,powiekszenie:k,przekroczonyLimit:przekroczone,poPowiekszeniu,
            skladniki:R2(num(d.skladniki)),zmniejszenieReszty:R2(num(d.zmniejszenieReszty)),
            marketValue:bazowa>0?wartosc:null,
            pricePerM2:num(d.powierzchniaPrzejeta)>0?R2(wartosc/num(d.powierzchniaPrzejeta)):null,
            powierzchnia:num(d.powierzchniaPrzejeta)};
  },
  braki(p){
    const d=p.modul||{}, out=[], add=(w,t)=>{ if(w) out.push(t); };
    add(!(num(d.powierzchniaPrzejeta)>0),'Wywłaszczenie: powierzchnia przejmowana większa od 0');
    add(!(num(d.wartoscJednostkowa)>0),'Wywłaszczenie: wartość jednostkowa');
    add(pusty(d.zrodloWartosci),'Wywłaszczenie: podstawa wartości jednostkowej');
    add(pusty(d.celPubliczny),'Wywłaszczenie: cel publiczny');
    add(pusty(d.dataStanu),'Wywłaszczenie: data stanu nieruchomości');
    add(pusty(d.dataPrzeznaczenia),'Wywłaszczenie: data przeznaczenia');
    add(pusty(d.dataCen),'Wywłaszczenie: data poziomu cen');
    add(pusty(d.podstawaPrawnaDat),'Wywłaszczenie: podstawa prawna doboru dat');
    add(num(d.powiekszenie)>50,'Wywłaszczenie: powiększenie przekracza dopuszczalne 50% — popraw wartość');
    add(num(d.powiekszenie)>0&&pusty(d.uzasadnieniePowiekszenia),'Wywłaszczenie: uzasadnienie powiększenia z badania rynku');
    add(num(d.zmniejszenieReszty)!==0&&pusty(d.uzasadnienieReszty),'Wywłaszczenie: uzasadnienie zmniejszenia wartości części pozostałej');
    return out;
  },
},

/* =========================================================================
   OPŁATY — planistyczna i adiacencka. Wzory: planning_value_change,
   planning_fee_amount, adiacencka_infrastructure_delta.
   ========================================================================= */
fees:{
  tytul:'Opłata adiacencka lub planistyczna',
  wstep:'Wycena równoległa: ta sama nieruchomość w dwóch stanach. Różnica wartości jest podstawą opłaty, więc oba stany muszą być opisane osobno i z własnym uzasadnieniem — nie wolno wyprowadzać jednego z drugiego.',
  sekcje:[
    {tytul:'Rodzaj opłaty', pola:[
      P('rodzaj','Rodzaj','wybor',{opcje:[['planistyczna','Opłata planistyczna'],['infrastruktura','Adiacencka — infrastruktura techniczna'],['podzial','Adiacencka — podział'],['scalenie','Adiacencka — scalenie i podział']]}),
      P('stawka','Stawka [%]','procent',{ph:'z planu albo z uchwały'}),
      P('podstawaStawki','Podstawa stawki','tekst',{ph:'np. §… uchwały nr …'}),
    ]},
    {tytul:'Stan przed', pola:[
      P('wartoscPrzed','Wartość w stanie przed [zł]','liczba',{krok:'0.01'}),
      P('opisPrzed','Opis stanu przed','obszar',{wiersze:3}),
      P('dataPrzed','Data stanu przed','data'),
    ]},
    {tytul:'Stan po', pola:[
      P('wartoscPo','Wartość w stanie po [zł]','liczba',{krok:'0.01'}),
      P('opisPo','Opis stanu po','obszar',{wiersze:3}),
      P('dataPo','Data stanu po','data'),
    ]},
  ],
  tabele:[],
  oblicz(p){
    const d=p.modul||{};
    // DeltaW = W_after - W_before  [planning_value_change / adiacencka_infrastructure_delta]
    const delta=R2(num(d.wartoscPo)-num(d.wartoscPrzed));
    // Fee = plan_rate * max(DeltaW, 0)  [planning_fee_amount]
    const oplata=R2(pct(d.stawka)*Math.max(delta,0));
    const maObie=num(d.wartoscPrzed)>0&&num(d.wartoscPo)>0;
    return {wartoscPrzed:R2(num(d.wartoscPrzed)),wartoscPo:R2(num(d.wartoscPo)),
            delta,stawka:num(d.stawka),oplata,brakWzrostu:delta<=0,
            marketValue:maObie?oplata:null,pricePerM2:null,powierzchnia:0};
  },
  braki(p){
    const d=p.modul||{}, out=[], add=(w,t)=>{ if(w) out.push(t); };
    add(!(num(d.wartoscPrzed)>0),'Opłaty: wartość w stanie przed');
    add(!(num(d.wartoscPo)>0),'Opłaty: wartość w stanie po');
    add(pusty(d.opisPrzed),'Opłaty: opis stanu przed');
    add(pusty(d.opisPo),'Opłaty: opis stanu po');
    add(pusty(d.dataPrzed),'Opłaty: data stanu przed');
    add(pusty(d.dataPo),'Opłaty: data stanu po');
    add(!(num(d.stawka)>0),'Opłaty: stawka opłaty');
    add(pusty(d.podstawaStawki),'Opłaty: podstawa prawna stawki');
    return out;
  },
},

/* =========================================================================
   SŁUŻEBNOŚĆ — cztery metody z Biblii: easement_direct_market,
   easement_difference, easement_indicator, transmission_dcf_no_terminal.
   ========================================================================= */
easement:{
  tytul:'Wynagrodzenie za służebność',
  wstep:'Cztery metody, jedna wybrana i uzasadniona. Metoda bezpośrednia wymaga rynkowych stawek wynagrodzenia; przy ich braku sięga się po różnicę wartości albo wzór wskaźnikowy — ale wtedy trzeba to napisać, a nie przemilczeć.',
  sekcje:[
    {tytul:'Przedmiot i metoda', pola:[
      P('metoda','Metoda','wybor',{opcje:[['rynkowa','Bezpośrednia — rynkowe stawki wynagrodzenia'],['roznicowa','Pośrednia — różnica wartości'],['wskaznikowa','Wskaźnikowa — W × (1−S) × P × k'],['dcf','Zdyskontowane wynagrodzenie okresowe']]}),
      P('rodzaj','Rodzaj służebności','wybor',{opcje:[['przesylu','Służebność przesyłu'],['gruntowa','Służebność gruntowa'],['osobista','Służebność osobista / użytkowanie / dożywocie']]}),
      P('powierzchniaPasa','Powierzchnia pasa służebności [m²]','liczba',{krok:'0.01'}),
      P('opisUrzadzen','Opis urządzeń i zakresu korzystania','obszar',{wiersze:3}),
      P('uzasadnienieMetody','Uzasadnienie wyboru metody','obszar',{wiersze:3}),
    ]},
    {tytul:'Parametry', pola:[
      P('stawkaRynkowa','Rynkowa stawka wynagrodzenia [zł/m²]','liczba',{krok:'0.01'}),
      P('zrodloStawki','Źródło stawki rynkowej','tekst'),
      P('wartoscBezObciazenia','Wartość bez służebności [zł]','liczba',{krok:'0.01'}),
      P('wartoscZObciazeniem','Wartość z uwzględnieniem służebności [zł]','liczba',{krok:'0.01'}),
      P('wartoscJednostkowaGruntu','Jednostkowa wartość gruntu W [zł/m²]','liczba',{krok:'0.01'}),
      P('wspolczynnikS','Współczynnik obniżenia wartości S [%]','procent'),
      P('wspolczynnikK','Współczynnik współkorzystania k','liczba',{krok:'0.01'}),
      P('uzasadnienieWspolczynnikow','Uzasadnienie współczynników S i k','obszar',{wiersze:2}),
      P('stopaDyskontowa','Stopa dyskontowa [%]','procent'),
    ]},
  ],
  tabele:[
    TAB('okresy','Wynagrodzenie okresowe (DCF)','Każdy okres osobno wraz z podstawą przyjętej kwoty. Model bez wartości rezydualnej — służebność nie generuje wartości końcowej.',
      [K('okres','Okres [t]','liczba',{krok:'1'}),K('kwota','Wynagrodzenie netto [zł]','liczba',{krok:'0.01'}),K('podstawa','Podstawa kwoty')],
      (ile)=>({okres:(ile||0)+1,kwota:0,podstawa:''})),
  ],
  oblicz(p){
    const d=p.modul||{};
    const pow=num(d.powierzchniaPasa);
    // W = market_rate_per_area * easement_area  [easement_direct_market]
    const rynkowa=(num(d.stawkaRynkowa)>0&&pow>0)?R2(num(d.stawkaRynkowa)*pow):null;
    // W = V_unencumbered - V_encumbered  [easement_difference]
    const roznicowa=(num(d.wartoscBezObciazenia)>0)?R2(num(d.wartoscBezObciazenia)-num(d.wartoscZObciazeniem)):null;
    // W = W_unit * (1 - S) * easement_area * k  [easement_indicator]
    const wskaznikowa=(num(d.wartoscJednostkowaGruntu)>0&&pow>0&&num(d.wspolczynnikK)>0)
      ? R2(num(d.wartoscJednostkowaGruntu)*(1-pct(d.wspolczynnikS))*pow*num(d.wspolczynnikK)) : null;
    // W = SUM(D_t / (1+r)^t)  [transmission_dcf_no_terminal]
    const r=num(d.stopaDyskontowa);
    const okresy=(d.okresy||[]).filter(x=>num(x.okres)>0).sort((a,b)=>num(a.okres)-num(b.okres));
    let sumaPV=0; const wiersze=[];
    for(const x of okresy){
      const t=num(x.okres);
      const dyskonto=r>0?Math.round(1/Math.pow(1+pct(r),t)*10000)/10000:null;
      const pv=dyskonto!=null?R2(num(x.kwota)*dyskonto):null;
      if(pv!=null) sumaPV+=pv;
      wiersze.push({okres:t,kwota:R2(x.kwota),dyskonto,pv,podstawa:String(x.podstawa||'')});
    }
    const dcf=wiersze.length&&r>0?R2(sumaPV):null;
    const wartosc={rynkowa,roznicowa,wskaznikowa,dcf}[d.metoda]??null;
    return {rynkowa,roznicowa,wskaznikowa,dcf:{stopa:r||null,wiersze,suma:R2(sumaPV),wartosc:dcf},
            marketValue:wartosc,pricePerM2:(wartosc!=null&&pow>0)?R2(wartosc/pow):null,powierzchnia:pow};
  },
  braki(p){
    const d=p.modul||{}, out=[], add=(w,t)=>{ if(w) out.push(t); };
    add(!(num(d.powierzchniaPasa)>0),'Służebność: powierzchnia pasa większa od 0');
    add(pusty(d.opisUrzadzen),'Służebność: opis urządzeń i zakresu korzystania');
    add(pusty(d.uzasadnienieMetody),'Służebność: uzasadnienie wyboru metody');
    if(d.metoda==='rynkowa'){
      add(!(num(d.stawkaRynkowa)>0),'Służebność: rynkowa stawka wynagrodzenia');
      add(pusty(d.zrodloStawki),'Służebność: źródło stawki rynkowej');
    }
    if(d.metoda==='roznicowa'){
      add(!(num(d.wartoscBezObciazenia)>0),'Służebność: wartość bez służebności');
      add(!(num(d.wartoscZObciazeniem)>0),'Służebność: wartość z uwzględnieniem służebności');
    }
    if(d.metoda==='wskaznikowa'){
      add(!(num(d.wartoscJednostkowaGruntu)>0),'Służebność: jednostkowa wartość gruntu');
      add(!(num(d.wspolczynnikK)>0),'Służebność: współczynnik współkorzystania k');
      add(pusty(d.uzasadnienieWspolczynnikow),'Służebność: uzasadnienie współczynników S i k');
    }
    if(d.metoda==='dcf'){
      add(!(d.okresy||[]).length,'Służebność (DCF): wynagrodzenie okresowe');
      add(!(num(d.stopaDyskontowa)>0),'Służebność (DCF): stopa dyskontowa');
      add((d.okresy||[]).some(x=>pusty(x.podstawa)),'Służebność (DCF): każdy okres musi mieć podstawę kwoty');
    }
    return out;
  },
},

/* =========================================================================
   ROLNA / LEŚNA — wzory: forest_land_indicator, forest_stand_density_ratio,
   forest_total (forest_indicators).
   ========================================================================= */
agri_forest:{
  tytul:'Nieruchomość rolna lub leśna',
  wstep:'Grunt i drzewostan wycenia się osobno, a potem sumuje. Cena drewna i tablice miąższości muszą pochodzić ze źródeł wymaganych metodyką — wpisana z pamięci liczba przechodzi przez cały operat aż do wyniku.',
  sekcje:[
    {tytul:'Rodzaj', pola:[
      P('rodzaj','Rodzaj nieruchomości','wybor',{opcje:[['rolna','Rolna'],['lesna','Leśna'],['mieszana','Rolna i leśna']]}),
      P('podstawaDanych','Podstawa danych ewidencyjnych','tekst',{ph:'np. wypis z EGiB z dnia …'}),
    ]},
    {tytul:'Grunt leśny — wskaźniki', pola:[
      P('wskaznikN','Wskaźnik N dla grupy siedliskowej','liczba',{krok:'0.0001'}),
      P('zrodloWskaznika','Źródło wskaźnika','tekst'),
      P('powierzchniaLesnaHa','Powierzchnia leśna [ha]','liczba',{krok:'0.0001'}),
      P('cenaDrewna','Cena drewna [zł/m³]','liczba',{krok:'0.01'}),
      P('zrodloCenyDrewna','Źródło ceny drewna','tekst',{ph:'komunikat GUS / właściwe źródło'}),
      P('korekty','Korekty wynikające z cech','liczba',{krok:'0.0001',ph:'1,00 = brak korekty'}),
    ]},
    {tytul:'Drzewostan', pola:[
      P('wartoscDrzewostanu','Wartość drzewostanu [zł]','liczba',{krok:'0.01'}),
      P('podstawaDrzewostanu','Podstawa wartości drzewostanu','obszar',{wiersze:2}),
    ]},
  ],
  tabele:[
    TAB('uzytki','Użytki rolne','Klasy bonitacyjne z ewidencji. Cena za hektar musi mieć źródło rynkowe właściwe dla klasy i rejonu.',
      [K('oznaczenie','Użytek / klasa'),K('powierzchnia','Powierzchnia [ha]','liczba',{krok:'0.0001'}),K('cenaHa','Cena [zł/ha]','liczba',{krok:'0.01'}),K('zrodlo','Źródło ceny')],
      ()=>({oznaczenie:'',powierzchnia:0,cenaHa:0,zrodlo:''})),
    TAB('drzewostan','Drzewostan — stopień zadrzewienia','Z = miąższość rzeczywista / miąższość modelowa, osobno dla gatunku, wieku i bonitacji.',
      [K('gatunek','Gatunek'),K('wiek','Wiek','liczba',{krok:'1'}),K('bonitacja','Bonitacja'),
       K('miazszoscRzeczywista','V rzeczywista [m³]','liczba',{krok:'0.01'}),K('miazszoscModelowa','V modelowa [m³]','liczba',{krok:'0.01'}),
       K('zrodloTablic','Źródło tablic')],
      ()=>({gatunek:'',wiek:0,bonitacja:'',miazszoscRzeczywista:0,miazszoscModelowa:0,zrodloTablic:''})),
  ],
  oblicz(p){
    const d=p.modul||{};
    const uz=(d.uzytki||[]).filter(x=>num(x.powierzchnia)>0);
    const wartoscRolna=R2(uz.reduce((s,x)=>s+num(x.powierzchnia)*num(x.cenaHa),0));
    const powRolna=R2(uz.reduce((s,x)=>s+num(x.powierzchnia),0));
    // V_land = N * area_ha * timber_price * corrections  [forest_land_indicator]
    const korekty=num(d.korekty)>0?num(d.korekty):1;
    const maLesny=num(d.wskaznikN)>0&&num(d.powierzchniaLesnaHa)>0&&num(d.cenaDrewna)>0;
    const wartoscGruntuLesnego=maLesny
      ? R2(num(d.wskaznikN)*num(d.powierzchniaLesnaHa)*num(d.cenaDrewna)*korekty) : null;
    // Z = V_real / V_model  [forest_stand_density_ratio]
    const drzewa=(d.drzewostan||[]).filter(x=>num(x.miazszoscModelowa)>0).map(x=>({
      gatunek:x.gatunek||'', wiek:num(x.wiek), bonitacja:x.bonitacja||'',
      zadrzewienie:R2(num(x.miazszoscRzeczywista)/num(x.miazszoscModelowa)*100)/100,
      zrodloTablic:x.zrodloTablic||''}));
    const wartoscDrzewostanu=num(d.wartoscDrzewostanu);
    // V_total = V_forest_land + V_stand  [forest_total]
    const lesna=(wartoscGruntuLesnego!=null||wartoscDrzewostanu>0)
      ? R2((wartoscGruntuLesnego||0)+wartoscDrzewostanu) : null;
    const skladniki=[];
    if(d.rodzaj!=='lesna'&&wartoscRolna>0) skladniki.push(wartoscRolna);
    if(d.rodzaj!=='rolna'&&lesna!=null) skladniki.push(lesna);
    const wartosc=skladniki.length?R2(skladniki.reduce((a,b)=>a+b,0)):null;
    const powLacznie=R2(powRolna+num(d.powierzchniaLesnaHa));
    return {wartoscRolna,powRolna,wartoscGruntuLesnego,wartoscDrzewostanu:R2(wartoscDrzewostanu),
            wartoscLesna:lesna,drzewa,korekty,
            marketValue:wartosc,pricePerM2:(wartosc!=null&&powLacznie>0)?R2(wartosc/powLacznie):null,
            powierzchnia:powLacznie};
  },
  braki(p){
    const d=p.modul||{}, out=[], add=(w,t)=>{ if(w) out.push(t); };
    add(pusty(d.podstawaDanych),'Rolna/leśna: podstawa danych ewidencyjnych');
    if(d.rodzaj!=='lesna'){
      add(!(d.uzytki||[]).length,'Rolna/leśna: tabela użytków rolnych');
      add((d.uzytki||[]).some(x=>pusty(x.zrodlo)),'Rolna/leśna: każda cena za hektar musi mieć źródło');
    }
    if(d.rodzaj!=='rolna'){
      add(!(num(d.wskaznikN)>0),'Rolna/leśna: wskaźnik N dla grupy siedliskowej');
      add(pusty(d.zrodloWskaznika),'Rolna/leśna: źródło wskaźnika');
      add(!(num(d.powierzchniaLesnaHa)>0),'Rolna/leśna: powierzchnia leśna');
      add(!(num(d.cenaDrewna)>0),'Rolna/leśna: cena drewna');
      add(pusty(d.zrodloCenyDrewna),'Rolna/leśna: źródło ceny drewna');
      add(num(d.wartoscDrzewostanu)>0&&pusty(d.podstawaDrzewostanu),'Rolna/leśna: podstawa wartości drzewostanu');
      add((d.drzewostan||[]).some(x=>pusty(x.zrodloTablic)),'Rolna/leśna: każdy gatunek musi mieć źródło tablic miąższości');
    }
    return out;
  },
},

};

function spec(kod){ return MODULY[kod]||null; }
function oblicz(kod,project){ const m=spec(kod); return m?m.oblicz(project):null; }
function braki(kod,project){ const m=spec(kod); return m?m.braki(project):[]; }
function pustaStruktura(kod){
  const m=spec(kod); if(!m) return {};
  const d={};
  for(const s of m.sekcje) for(const p of s.pola){
    d[p.kod]=p.typ==='liczba'||p.typ==='procent'?0:(p.typ==='wybor'?(p.opcje[0][0]):'');
  }
  for(const t of m.tabele) d[t.kod]=[];
  return d;
}

const API={ MODULY, spec, oblicz, braki, pustaStruktura };
if(typeof module!=='undefined'&&module.exports) module.exports=API;
if(typeof window!=='undefined') window.OperoModuly=API;
})();
