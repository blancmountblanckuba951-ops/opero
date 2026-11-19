#!/bin/bash
# Kopia interfejsu do testow w przegladarce. Mostek do programu podstawiamy jako
# osobny plik, bo polityka bezpieczenstwa strony nie wykonuje skryptow wpisanych
# w HTML. Po kazdej zmianie w rendererze trzeba odswiezyc te kopie -- inaczej test
# ocenia poprzednia wersje i wyniki klamia.
set -e
ZR=/root/work/build/app/renderer
CEL=${1:-/tmp/widok}
rm -rf "$CEL"; mkdir -p "$CEL"; cp -r "$ZR"/* "$CEL"/
node -e "
const X=require('/root/work/build/app/xlsx-czytnik.js');
const a=X.czytaj('/root/work/test/dane/wyciag-rcn.xlsx').map(s=>({nazwa:s.nazwa,wiersze:s.wiersze}));
const stub=\`window.__mostek='start'; window.__edycjaReczna=true;
window.operatAPI={
  bibliaStan:async()=>({jest:true,kod:'KB-2026.09.01-v1',regul:375,ksiazek:7,rodzajow:51,zrodel:12,pobrano:new Date().toISOString(),robocza:false}),
  bibliaPobierz:async()=>({jest:true,kod:'KB-2026.09.01-v1',regul:375,ksiazek:7,rodzajow:51,pobrano:new Date().toISOString()}),
  getKnowledgeStatus:async()=>({ok:true,snapshot:{code:'KB-2026.09.01-v1',legalStateDate:'2026-09-01'},counts:{rules:375}}),
  perStatus:async()=>({configured:true,active:false,engine:'LOKALNY',model:'per-8b-q4.gguf',message:'Przygotowuje model.',settings:{engine:'LOKALNY'},key:{present:false,hint:''},biblia:{jest:true,kod:'KB-2026.09.01-v1',regul:375}}),
  perSilnikStatus:async()=>({jest:true,silnik:true,model:{nazwa:'per-8b-q4.gguf',rozmiar:4700000000,zrodlo:'instalator'},serwerDziala:false,port:11436,pobieranieTrwa:false}),
  perStanModelu:async()=>({stan:'aktualny',silnik:true,serwerDziala:true,model:{nazwa:'per-11b-q4.gguf',rozmiar:6720000000,zrodlo:'instalator'}}),
  perUruchom:async()=>({ok:true,port:11436}),
  perAsk:async()=>({text:'Odpowiedz testowa.',model:'PER',toolTrace:[],engine:'LOKALNY'}),
  perRedaguj:async(p)=>({text:String(p&&p.text||'').toUpperCase(),model:'PER'}),
  perAktualizujModel:async()=>({ok:true,rozmiar:4700000000,nazwa:'per-8b-q4.gguf'}),
  onPerProgress:()=>()=>{},
  runPiorekExam:async()=>({ok:true,batch:true,total:0,done:true,nextOffset:null,results:[]}),
  getLicenseState:async()=>({status:'active',deviceCode:'TEST',verification:'test'}),
  listProjects:async()=>[],listClients:async()=>[],listReminders:async()=>[],
  generateMapsQR:async()=>({dataUrl:'data:image/svg+xml;base64,PHN2Zy8+'}),
  exportPDF:async()=>({canceled:true}),
  exportDOCX:async(l)=>{window.__docx=l;return {canceled:false,filePath:'C:/operat.docx',akapitow:138,obrazow:2};},
  previewPDF:async()=>({ok:true}),
  portalOtworz:async(z)=>{window.__portalUrl=z&&z.url;return {ok:true};},
  portalCzytaj:async()=>(window.__portalOdp||{ok:false,powod:'Okno portalu jest zamknięte. Otwórz portal i przejdź do listy ogłoszeń.'}),
  siecStan:async()=>({jestKlucz:!!window.__siecKlucz,dostawca:'Brave Search'}),
  siecKluczZapisz:async(k)=>{if(k&&!/^[A-Za-z0-9_\\-]{16,128}$/.test(k))throw new Error('To nie wygląda na klucz Brave Search — skopiuj go jeszcze raz, bez spacji.');window.__siecKlucz=k||'';return {jestKlucz:!!k};},
  siecSzukaj:async(z)=>{window.__siecZapytania=[...(window.__siecZapytania||[]),z];if(!window.__siecKlucz)return {ok:false,brakKlucza:true,powod:'Nie ma klucza wyszukiwarki. Wpisz klucz Brave Search w Ustawieniach.',wyniki:[]};return window.__siecOdp||{ok:true,wyniki:[]};},
  ocrZrzuty:async()=>(window.__ocrOdp||{canceled:true,zrzuty:[]}),
  pickPhotos:async()=>(window.__zdjecia||[{name:'foto.jpg',dataUrl:'data:image/jpeg;base64,/9j/4AAQ',size:1000,originalSize:1000}]),
  pickFiles:async()=>(window.__pliki||[{name:'dokument.pdf',path:'C:/dokument.pdf',size:2000}]),
  saveHistory:async()=>({ok:true,id:'test'}),
  listHistory:async()=>({entries:[],stats:{}}),
  bazaLista:async(f)=>{const B=window.OperoBaza;const w=B.filtruj(window.__baza||[],f||{});
    return {wpisy:w,ile:w.length,razem:(window.__baza||[]).length,statystyki:B.statystyki(window.__baza||[]),statystykiWyboru:B.statystyki(w),uszkodzony:null};},
  bazaDodaj:async(l)=>{const B=window.OperoBaza;const r=B.scal(window.__baza||[],B.zWyciagu(l.wiersze||[],{plik:l.plik}));
    window.__baza=r.wpisy;return {dodane:r.dodane,pominiete:r.pominiete,razem:r.wpisy.length};},
  bazaUsun:async(ids)=>{const z=new Set((ids||[]).map(String));const przed=(window.__baza||[]).length;
    window.__baza=(window.__baza||[]).filter(t=>!z.has(String(t.id)));return {usuniete:przed-window.__baza.length,razem:window.__baza.length};},
  bazaDopasuj:async(p)=>{window.__bazaZapytanie=p;const k=(window.__bazaKandydaci!==undefined)?window.__bazaKandydaci:window.OperoBaza.dopasuj(window.__baza||[],p||{});return {kandydaci:k,ile:k.length,razem:(window.__baza||[]).length};},
  bazaEksport:async()=>({canceled:false,filePath:'C:/baza.csv',ile:(window.__baza||[]).length}),
  bazaOtworzFolder:async()=>({ok:true}),
  chmuraStan:async()=>{const C=window.OperoChmura;const u=C.ustawienia(window.__chmura||{});return {ustawienia:u,jestKlucz:!!window.__chmuraKlucz,gotowosc:C.gotowosc(u,!!window.__chmuraKlucz),dostawcy:C.DOSTAWCY};},
  chmuraZapisz:async(d)=>{const C=window.OperoChmura;d=d||{};if(d.ustawienia){const u=C.ustawienia(d.ustawienia);if(u.wlaczony&&!u.zgoda)u.wlaczony=false;window.__chmura=u;}if(d.usunKlucz)window.__chmuraKlucz='';else if(d.klucz){if(d.klucz.length<16)throw new Error('To nie wygląda na klucz do modelu — skopiuj go jeszcze raz, bez spacji.');window.__chmuraKlucz=d.klucz;}return window.operatAPI.chmuraStan();},
  chmuraModele:async()=>(window.__chmuraModele||{ok:true,modele:[{id:'model-a',nazwa:'Model A'},{id:'model-b',nazwa:'Model B'}]}),
  chmuraProbuj:async()=>(window.__chmuraProba||{ok:true,tekst:'działa'}),
  chmuraZdjecia:async(z)=>{window.__zdjeciaZapytanie=z;return window.__zdjeciaOdp||{ok:false,brakChmury:true,powod:'Model lokalny nie widzi zdjęć.'};},
  whatsappStan:async()=>{const W=window.OperoWhatsApp;const u=W.ustawienia(window.__wa||{});return {ustawienia:u,jestToken:!!window.__waToken,gotowosc:W.gotowosc(u,!!window.__waToken)};},
  whatsappZapisz:async(d)=>{d=d||{};if(d.ustawienia)window.__wa=window.OperoWhatsApp.ustawienia(d.ustawienia);if(d.usunToken)window.__waToken='';else if(d.token){if(d.token.length<40)throw new Error('To nie wygląda na token dostępu Meta — skopiuj go jeszcze raz, w całości.');window.__waToken=d.token;}return window.operatAPI.whatsappStan();},
  whatsappWyslij:async(t)=>{window.__waWyslane=[...(window.__waWyslane||[]),t];return window.__waOdp||{ok:true,id:'wamid.TEST'};},
  whatsappOtworz:async(t)=>{window.__waOtwarte=t;return {ok:true,zNumerem:true};},
  wsadWybierz:async()=>(window.__wsadOdp||{canceled:true,pliki:[]}),
  wsadSciezki:async(s)=>{window.__wsadSciezki=s;return window.__wsadOdp||{canceled:false,pliki:[]};},
  sciezkaPliku:(f)=>String(f&&f.name||''),
  onWsadPostep:(fn)=>{window.__wsadPostep=fn;return ()=>{};},
  ocrObraz:async()=>(window.__ocrObrazOdp||{ok:false,powod:'brak stubu'}),
  pdfCzytaj:async(z)=>{window.__pdfZapytanie=z;return (window.__pdfOdp||{})[z&&z.sciezka]||{ok:false,powod:'brak stubu'};},
  podrecznikStan:async()=>window.OperoWiedza.podsumowanie(window.__wiedza||{}),
  podrecznikDodaj:async(d)=>{window.__wiedza=window.OperoWiedza.dodaj(window.__wiedza||{},d);return window.OperoWiedza.podsumowanie(window.__wiedza);},
  podrecznikUsun:async(id)=>{window.__wiedza=window.OperoWiedza.usun(window.__wiedza||{},id);return window.OperoWiedza.podsumowanie(window.__wiedza);},
  podrecznikSzukaj:async(z)=>window.OperoWiedza.szukaj(window.__wiedza||{},z||{}),
  pamiecOdczytaj:async()=>window.OperoPamiec.stanCzysty(window.__pamiec||{}),
  pamiecZapisz:async(st)=>{window.__pamiec=window.OperoPamiec.stanCzysty(JSON.parse(JSON.stringify(st)));return window.__pamiec;},
  pamiecWczytajPliki:async()=>(window.__pamiecPliki||{canceled:true,pliki:[]}),
  wzorceOdczytaj:async()=>window.OperoWzorce.stanCzysty(window.__wzorce||{}),
  wzorceZapisz:async(st)=>{window.__wzorce=window.OperoWzorce.stanCzysty(JSON.parse(JSON.stringify(st)));return window.__wzorce;},
  profilOdczytaj:async()=>({name:'Jan Kowalski',licenseNo:'1234',company:'',address:'',phone:'',email:'jan@example.com'}),
  openOfficialKW:async()=>({ok:true}),
  copyKWNumber:async()=>({ok:true}),
  readClipboardText:async()=>({text:window.__schowek||''}),
  openExternal:async(u)=>{window.__url=u;return {ok:true};},
  ksiegaKWLista:async()=>(window.__ksiegaKW||[]),
  ksiegaKWZapisz:async(w)=>{window.__ksiegaKW=[{...w,kiedy:new Date().toISOString()},...(window.__ksiegaKW||[])];return {ok:true};},
  dzialkaPoAdresie:async(q)=>(window.__dzialkaOdp||{ok:false,dzialki:[],punkty:[],powod:'brak stubu'}),
  dzialkaPoNumerze:async(q)=>(window.__dzialkaOdp||{ok:false,dzialki:[],powod:'brak stubu'}),
  rcnGeoportal:async(q)=>{window.__rcnZapytanie=q;if(window.__rcnBlad)throw new Error(window.__rcnBlad);return window.__rcnOdp||{ok:true,transakcje:[],pominieto:0,komunikat:'brak',zrodlo:'test'};},
  zbieraczStan:async()=>({wlaczony:true,obszary:[],ostatnio:null,dziennik:[],trwa:false,razem:0,coGodzin:6,promien:5000}),
  zbieraczTeraz:async()=>({ok:true,dodane:0}),
  zbieraczUstaw:async(u)=>({wlaczony:u?.wlaczony!==false,obszary:[]}),
  onZbieraczKoniec:()=>()=>{},
  ekwOkno:async(q)=>{window.__ekwOkno=q;return {ok:true,kw:q.kw||''};},
  onEkwTekst:(cb)=>{window.__ekwCb=cb;return ()=>{};},
  onEkwKoniec:(cb)=>{window.__ekwKoniecCb=cb;return ()=>{};},
  chmuraWizja:async(z)=>{(window.__wizjaZapytania=window.__wizjaZapytania||[]).push(z);if(typeof window.__wizjaOdp==='function')return window.__wizjaOdp(z);return window.__wizjaOdp||{ok:false,powod:'brak stubu wizji'};},
  geoportalDzialka:async(q)=>{(window.__geoZapytania=window.__geoZapytania||[]).push(q);if(window.__geoOdpMapa)return window.__geoOdpMapa[q.id]||{ok:false,powod:'ULDK nie zna tej działki.'};return window.__geoOdp||{ok:false,powod:'brak stubu (test)'};},
  geoportalOkno:async(q)=>{window.__geoOkno=q;return window.__geoOknoOdp||{ok:false,powod:'brak stubu (test)'};},
  adresPodpowiedzi:async(f)=>(window.__adresy||[]),
  otoczenieZbierz:async(q)=>{window.__otoZapytanie=q;if(window.__otoBlad)throw new Error(window.__otoBlad);return window.__otoOdp||{ok:false,punkt:null,otoczenie:null,mpzp:null,bledy:['brak stubu']};},
  adresJedno:async(q)=>{window.__adresZapytanie=q;(window.__adresZapytania=window.__adresZapytania||[]).push(q);
    if(q.zapas==='osm'){const k=(window.__adresOsm||[]);const A0=window.OperoAdres;const t=A0.odsiejDoFrazy(k,q.ulica).filter(x=>x.ulica);const w0=A0.rozstrzygnij(t,{ulica:q.ulica,numer:q.numer});return {...w0,zrodlo:'osm',podpis:'© autorzy OpenStreetMap',proby:[{opis:'OpenStreetMap',ile:t.length}],pytanie:t.length?w0.pytanie:'OpenStreetMap tez nie zna tej ulicy.',komunikat:t.length?A0.komunikat(w0,{numer:q.numer}):''};}
    const A=window.OperoAdres;
    // Stub nasladuje prawdziwa usluge: bez miejscowosci oddaje pustke, tak
    // jak geokoder zapytany o samo nazwisko. Dzieki temu test sprawdza to,
    // co naprawde sie dzieje u czlowieka, a nie wersje idealna.
    const wszystkie=window.__adresKandydaci||[];
    const tylkoZMiastem=window.__adresWymagaMiasta===true;
    const miasta=[q.miasto||'',...(q.znaneMiasta||[])].filter(Boolean).map(x=>A.uprosc(x));
    const k=(tylkoZMiastem && !miasta.length)?[]
      :(tylkoZMiastem?wszystkie.filter(x=>miasta.includes(A.uprosc(x.miasto))):wszystkie);
    const odsiane=A.odsiejDoFrazy(k,q.ulica).filter(x=>x.ulica);
    const w=A.rozstrzygnij(odsiane,{ulica:q.ulica,numer:q.numer});
    return {...w,proby:(q.znaneMiasta||[]).map(m=>({opis:m,ile:0})),komunikat:A.komunikat(w,{numer:q.numer})};},
  ofertySzukaj:async(q)=>{window.__ofertyZapytanie=q;
    const etapy=window.__ofertyEtapy||[];
    for(const e of etapy)(window.__ofertySluchacze||[]).forEach(f=>f(e));
    return window.__ofertyOdp||{ok:true,oferty:[],etapy,zrodla:[],komunikat:'brak cennikow',statystyka:{ile:0,mediana:null,min:null,max:null}};},
  zrodlaSprawdz:async(q)=>{window.__zrodlaZapytania=[...(window.__zrodlaZapytania||[]),q];
    if(window.__zrodlaBlad) throw new Error(window.__zrodlaBlad);
    const Z=window.OperoZrodlaKontrola; const stan=Z.pusty();
    const wynik=window.__zrodlaWynik||{rcn:{ok:true,ms:700},uldk:{ok:true,ms:900},uug:{ok:true,ms:400},'dane-gov':{ok:true,ms:1200}};
    for(const id of Object.keys(wynik)) Z.zapisz(stan,id,wynik[id]);
    return {ok:true,stan,podsumowanie:Z.podsumowanie(stan),kiedy:new Date().toISOString()};},
  onOfertyEtap:(fn)=>{window.__ofertySluchacze=[...(window.__ofertySluchacze||[]),fn];return ()=>{};},
  perNapisz:async(p)=>{window.__perPolecenia=[...(window.__perPolecenia||[]),p];
    if(window.__perBlad)throw new Error(window.__perBlad);
    return {text:(window.__perTeksty||{})[p.rozdzial]||'Tekst testowy rozdzialu.',model:'PER',rozdzial:p.rozdzial};},
  rcnWczytaj:async()=>({canceled:false,plik:'C:/wyciagi/wyciag-rcn.xlsx',arkusze:\${JSON.stringify(a)}}),
  getAppInfo:async()=>({version:'1.27.0',electron:'43.5.0'}),
  getAppState:async()=>({tutorialDone:true}),
  setTutorialDone:async()=>({ok:true}),
  autosave:async()=>({ok:true}),
  autosaveImmediate:()=>{},
};
window.__mostek='koniec';\`;
require('fs').writeFileSync('$CEL/mostek-testowy.js', stub);
const p='$CEL/index.html'; const fs=require('fs');
let s=fs.readFileSync(p,'utf8');
s=s.replace('<script src=\"kontrola.js\"></script>','<script src=\"mostek-testowy.js\"></script><script src=\"kontrola.js\"></script>');
fs.writeFileSync(p,s);
"
echo "widok gotowy w $CEL"
