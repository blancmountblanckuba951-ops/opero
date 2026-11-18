'use strict';
/**
 * OPERO — szukanie transakcji: jedno okno, które przełącza etapy.
 *
 * Trzy rzeczy, których ten test pilnuje najmocniej:
 *
 *   1. JEŻELI PROGRAM ZNAJDZIE CHOĆBY JEDNĄ TRANSAKCJĘ, MUSI DAĆ JĄ DODAĆ.
 *      Blokada „potrzebne są co najmniej dwie" odbierała rzeczoznawcy to, co
 *      właśnie znalazł. Program ma ostrzegać, a nie odmawiać.
 *   2. OFERTA NIE JEST TRANSAKCJĄ i żadną drogą nie wchodzi do zbioru.
 *   3. DANE PRZEPISANE Z CUDZEGO SERWISU SĄ OZNACZONE JAKO PRZEPISANE —
 *      z nazwą serwisu i datą, bo to dane wtórne i trzeba je zweryfikować.
 */
const fs = require('node:fs');
const path = require('node:path');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

const APP = [path.join(__dirname, '..', 'build', 'app'), path.join(__dirname, '..', 'app')].find(p => fs.existsSync(p));
const S = require(path.join(APP, 'renderer', 'szukanie.js'));

console.log('OPERO — szukanie transakcji\n');

/* --- 1. Etapy --- */
T('etapów jest pięć', S.ETAPY.length === 5, S.ETAPY.length);
T('idą po kolei, numerowane', S.ETAPY.every((e, i) => e.nr === i + 1));
// Kolejnosc jest podyktowana tym, CO ROBI CZLOWIEK, a nie waga zrodla:
// krok 1 to jedyny, ktory wymaga jego reki, wiec stoi pierwszy i da sie go
// zalatwic w czasie, gdy program pyta pozostale trzy.
T('pierwszy jest Deweloperuch — krok, który wymaga człowieka', S.ETAPY[0].id === 'deweloperuch');
T('potem Rejestr Cen Nieruchomości', S.ETAPY[1].id === 'rcn-geoportal');
T('potem własna baza', S.ETAPY[2].id === 'wlasna-baza');
T('potem cenniki z dane.gov.pl', S.ETAPY[3].id === 'dane-gov');
// Inne portale podaja CENY OFERTOWE z ogloszen, a nie ceny transakcyjne —
// dlatego stoja na samym koncu i sa opisane jako ostatecznosc.
T('na samym końcu inne portale ogłoszeniowe', S.ETAPY[4].id === 'inne-portale');
T('i są oznaczone jako ostateczność', S.ETAPY[4].ostatecznosc === true);
T('program tłumaczy, czym różni się oferta od transakcji',
  /ceny ofertowe/i.test(S.ETAPY[4].dlaczegoRecznie), S.ETAPY[4].dlaczegoRecznie);
T('każdy etap ma nazwę, skrót i opis',
  S.ETAPY.every(e => e.nazwa && e.skrot && String(e.opis).length > 30));
T('każdy etap mówi, co znaczy jego pusty wynik',
  S.ETAPY.every(e => String(e.gdyPusto).length > 20));
/* To rozstrzyga, co wolno wstawić do zbioru porównawczego — i tego nie
   zmienia żadne ustawienie programu. */
T('RCN i własna baza dają TRANSAKCJE',
  S.ETAPY[1].rodzaj === 'transakcje' && S.ETAPY[2].rodzaj === 'transakcje');
T('dane.gov.pl daje OFERTY', S.ETAPY[3].rodzaj === 'oferty');
T('inne portale dają dane PRZEPISANE', S.ETAPY[4].rodzaj === 'przepisane');
T('cudze serwisy dają dane PRZEPISANE', S.ETAPY[0].rodzaj === 'przepisane');
T('trzy środkowe etapy program robi sam', S.ETAPY.slice(1, 4).every(e => e.automat === true));
T('obu ręcznych nie robi sam', S.ETAPY[0].automat === false && S.ETAPY[4].automat === false);
T('kroku z serwisami nie robi sam', S.ETAPY[0].automat === false);
T('i tłumaczy, dlaczego nie pobiera stamtąd sam',
  /z tych samych źródeł/.test(S.ETAPY[0].dlaczegoRecznie), S.ETAPY[0].dlaczegoRecznie);

/* --- 2. Kryteria --- */
const K = S.kryteria({ miejscowosc: 'Gdańsk', powierzchnia: 54.3, dataWyceny: '2026-11-03' });
T('zakres powierzchni liczony z odchyłki', K.powOd === 38.01 && K.powDo === 70.59, `${K.powOd}–${K.powDo}`);
T('domyślna odchyłka to 30%', K.odchylkaPowPct === 30);
T('domyślny okres to 24 miesiące', K.okresMiesiecy === 24);
/* Zero to nie brak. „Odchyłka 0%" znaczy „dokładnie ta sama powierzchnia",
   a nie „weź domyślne 30%" — program, który tu podstawia domyślną, rozszerza
   zbiór porównawczy bez wiedzy rzeczoznawcy. */
T('odchyłka nie schodzi poniżej 5%', S.kryteria({ powierzchnia: 50, odchylkaPowPct: 0 }).odchylkaPowPct === 5,
  String(S.kryteria({ powierzchnia: 50, odchylkaPowPct: 0 }).odchylkaPowPct));
T('zero w okresie nie zamienia się w 24 miesiące', S.kryteria({ okresMiesiecy: 0 }).okresMiesiecy === 1);
T('zero w promieniu nie zamienia się w 1000 m', S.kryteria({ promienM: 0 }).promienM === 100);
T('brak wartości nadal daje domyślną', S.kryteria({}).okresMiesiecy === 24 && S.kryteria({}).promienM === 1000);
T('ani powyżej 100%', S.kryteria({ powierzchnia: 50, odchylkaPowPct: 500 }).odchylkaPowPct === 100);
T('bez powierzchni nie ma zakresu, a nie zakres 0–0', S.kryteria({}).powOd === null);
T('opis kryteriów da się przeczytać',
  /Gdańsk/.test(S.opisKryteriow(K)) && /±30%/.test(S.opisKryteriow(K)) && /24 mies/.test(S.opisKryteriow(K)),
  S.opisKryteriow(K));

/* --- 3. Dopasowanie — i POWÓD, gdy nie pasuje --- */
T('pozycja w zakresie pasuje',
  S.pasuje({ powierzchnia: 55, miejscowosc: 'Gdańsk', data: '2026-05-01' }, K).pasuje);
const zaDuza = S.pasuje({ powierzchnia: 120, miejscowosc: 'Gdańsk', data: '2026-05-01' }, K);
T('za duża powierzchnia nie pasuje', !zaDuza.pasuje);
T('i program mówi, w jakim zakresie miała być',
  /poza zakresem 38.01–70.59/.test(zaDuza.powod), zaDuza.powod);
const obce = S.pasuje({ powierzchnia: 55, miejscowosc: 'Kraków', data: '2026-05-01' }, K);
T('inna miejscowość nie pasuje', !obce.pasuje && /inna miejscowość \(Kraków\)/.test(obce.powod), obce.powod);
T('ale adres zawierający miasto wystarczy',
  S.pasuje({ powierzchnia: 55, miejscowosc: '', adres: 'ul. Długa 1, Gdańsk', data: '2026-05-01' }, K).pasuje);
const stara = S.pasuje({ powierzchnia: 55, miejscowosc: 'Gdańsk', data: '2020-01-01' }, K);
T('transakcja sprzed lat nie pasuje', !stara.pasuje && /starsza niż 24 mies/.test(stara.powod), stara.powod);
T('transakcja po dacie wyceny nie pasuje',
  /po dacie wyceny/.test(S.pasuje({ powierzchnia: 55, miejscowosc: 'Gdańsk', data: '2027-01-01' }, K).powod));
const wynik = S.dopasuj([
  { powierzchnia: 55, miejscowosc: 'Gdańsk', data: '2026-05-01' },
  { powierzchnia: 120, miejscowosc: 'Gdańsk', data: '2026-05-01' },
], K);
T('dopasowanie rozdziela pasujące i niepasujące', wynik.pasujace.length === 1 && wynik.niepasujace.length === 1);
T('niepasujące niosą powód przy sobie', Boolean(wynik.niepasujace[0].powodNiedopasowania));
T('nic nie ginie po drodze', wynik.razem === 2);

/* --- 4. Przebieg: etapy zapalają się i gasną --- */
let p = S.nowy(K);
T('na początku wszystkie etapy czekają', p.etapy.every(e => e.stan === S.STAN.CZEKA));
T('i nic nie jest w toku', p.biezacy === null);
S.zacznij(p, 'rcn-geoportal');
T('etap w toku jest oznaczony', S.etap(p, 'rcn-geoportal').stan === S.STAN.TRWA);
T('program wie, w którym jest', p.biezacy === 'rcn-geoportal');
T('i tylko w jednym naraz', p.etapy.filter(e => e.stan === S.STAN.TRWA).length === 1);
S.zakoncz(p, 'rcn-geoportal', { ile: 0 });
T('pusty etap kończy się jako „pusto", a nie jako błąd', S.etap(p, 'rcn-geoportal').stan === S.STAN.PUSTO);
T('po zakończeniu nic nie jest w toku', p.biezacy === null);
T('opis pustego etapu tłumaczy, co to znaczy',
  /około 320 z 380/.test(S.opisEtapu(S.etap(p, 'rcn-geoportal'))), S.opisEtapu(S.etap(p, 'rcn-geoportal')));

S.zacznij(p, 'wlasna-baza');
S.zakoncz(p, 'wlasna-baza', { ile: 1, pozycje: [{ adres: 'ul. Długa 1', powierzchnia: 55, data: '2026-05-01', cena: 600000 }] });
T('etap z wynikiem jest oznaczony', S.etap(p, 'wlasna-baza').stan === S.STAN.ZNALAZL);
T('opis mówi, ile znalazł', /znalazłem 1 pozycję/.test(S.opisEtapu(S.etap(p, 'wlasna-baza'))));
T('znaleziona pozycja pamięta, z którego etapu jest', p.znalezione[0].zEtapu === 'wlasna-baza');
T('i jakiego rodzaju jest to źródło', p.znalezione[0].rodzajZrodla === 'transakcje');

S.zacznij(p, 'dane-gov');
S.zakoncz(p, 'dane-gov', { ile: 2, pozycje: [{ cena: 1 }, { cena: 2 }] });
T('oferty nie liczą się jako transakcje', S.transakcje(p).length === 1, String(S.transakcje(p).length));
T('ale są policzone jako oferty', S.oferty(p).length === 2);

const bledny = S.nowy(K);
S.zakoncz(bledny, 'rcn-geoportal', { blad: true, powod: 'usługa nie odpowiedziała' });
T('źródło, które nie odpowiedziało, to BŁĄD, a nie pusty wynik',
  S.etap(bledny, 'rcn-geoportal').stan === S.STAN.BLAD);
T('bo pusty wynik i awaria to dwie różne rzeczy',
  /nie odpowiedziała/.test(S.opisEtapu(S.etap(bledny, 'rcn-geoportal'))));
S.pomin(bledny, 'deweloperuch', 'masz już dość transakcji');
T('pominięty etap jest oznaczony osobno', S.etap(bledny, 'deweloperuch').stan === S.STAN.POMINIETY);


/* --- 4b. Etap zamknięty drugi raz ZASTĘPUJE swój wynik ---
   Rzeczoznawca wkleja wiersze, widzi, że pomylił tabelę, i wkleja jeszcze raz.
   Gdyby program dokładał, dostałby każdą transakcję dwa razy — i nie
   wiedziałby, która jest ta prawdziwa. */
{
  const dwa = S.nowy(K);
  S.zakoncz(dwa, 'deweloperuch', { ile: 2, pozycje: [{ adres: 'a' }, { adres: 'b' }] });
  T('pierwsze wklejenie daje dwa wiersze', dwa.znalezione.length === 2);
  S.zakoncz(dwa, 'deweloperuch', { ile: 1, pozycje: [{ adres: 'c' }] });
  T('poprawione wklejenie zastępuje poprzednie', dwa.znalezione.length === 1, String(dwa.znalezione.length));
  T('i zostaje to, co wklejono ostatnio', dwa.znalezione[0].adres === 'c');
  S.zakoncz(dwa, 'rcn-geoportal', { ile: 1, pozycje: [{ adres: 'z rejestru' }] });
  T('wyniki innych etapów zostają nietknięte', dwa.znalezione.length === 2);
  S.zakoncz(dwa, 'deweloperuch', { ile: 0, pozycje: [] });
  T('pusty wynik też czyści poprzedni', dwa.znalezione.length === 1 && dwa.znalezione[0].adres === 'z rejestru');
}

/* --- 5. JEDNA TRANSAKCJA WYSTARCZY, ŻEBY JĄ DODAĆ --- */
const jedna = S.podsumowanie(p);
T('przy jednej transakcji program POZWALA ją dodać', jedna.mozeDodac === true);
T('ale ostrzega, że to mało', /Jedna transakcja to mało/.test(jedna.tekst), jedna.tekst);
T('i mówi, że decyzja należy do rzeczoznawcy', /to Ty rozstrzygasz/.test(jedna.tekst));
T('podsumowanie liczy transakcje i oferty osobno', jedna.transakcji === 1 && jedna.ofert === 2);
T('oferty są podpisane jako nie do zbioru', /nie do zbioru/.test(jedna.tekst));
T('podsumowanie mówi o pustych źródłach', /Pustych źródeł: 1/.test(jedna.tekst), jedna.tekst);

const pusty = S.podsumowanie(S.nowy(K));
T('bez niczego program nie pozwala dodać', pusty.mozeDodac === false);
T('i nie twierdzi, że transakcji nie było', /nie znaczy, że transakcji nie było/.test(pusty.tekst), pusty.tekst);
T('odsyła do wyciągu albo wpisania ręcznie', /wyciąg ze starostwa albo wpisanie/.test(pusty.tekst));

const duzo = S.nowy(K);
S.zakoncz(duzo, 'rcn-geoportal', { ile: 5, pozycje: Array.from({ length: 5 }, () => ({ cena: 1 })) });
T('przy pięciu transakcjach nie ma już ostrzeżenia', !/to mało/.test(S.podsumowanie(duzo).tekst));
T('i waga podsumowania jest zielona', S.podsumowanie(duzo).waga === 'sukces');
T('a przy jednej — pomarańczowa', jedna.waga === 'ostrzezenie');

/* --- 6. Wklejenie z cudzego serwisu --- */
const WKLEJONE = 'ul. Kartuska 201, Gdańsk\t2026-03-15\t54,30 m²\t650 000 zł\t11 971 zł/m²\n'
  + 'ul. Długa 5, Gdańsk\t12.05.2026\t62\t720000\n'
  + 'ul. Krótka 1\t2026-02-02\t45 m2\t9500 zł/m2';
const w = S.zWklejenia(WKLEJONE, { zrodlo: 'deweloperuch.pl', dataPrzepisania: '2026-11-04' });
T('wklejone wiersze rozkładają się', w.ok && w.wiersze.length === 3, String(w.wiersze.length));
T('data w formacie RRRR-MM-DD przeczytana', w.wiersze[0].data === '2026-03-15');
T('data w formacie polskim też', w.wiersze[1].data === '2026-05-12', w.wiersze[1].data);
T('powierzchnia z jednostką przeczytana', w.wiersze[0].powierzchnia === 54.3);
T('cena z „zł" przeczytana', w.wiersze[0].cena === 650000);
/* Najgroźniejszy błąd w tym parserze: wzięcie ceny za metr za cenę lokalu.
   Lokal za 9,5 tysiąca w zbiorze porównawczym przesuwa całą wycenę. */
T('„9500 zł/m2" to cena ZA METR, a nie cena lokalu',
  w.wiersze[2].jednostkowa === 9500 && w.wiersze[2].cena === 427500,
  `${w.wiersze[2].cena} / ${w.wiersze[2].jednostkowa}`);
T('cena lokalu wyliczona z ceny metra i powierzchni', w.wiersze[2].powierzchnia === 45);
T('adres nie wchłonął liczb', w.wiersze[0].adres === 'ul. Kartuska 201, Gdańsk', w.wiersze[0].adres);
T('każdy wiersz jest oznaczony jako przepisany', w.wiersze.every(r => r.przepisane === true));
T('każdy niesie nazwę serwisu i datę przepisania',
  w.wiersze.every(r => /deweloperuch\.pl/.test(r.uwagiZrodla) && /2026-11-04/.test(r.uwagiZrodla)));
T('i ostrzeżenie, że to dane wtórne',
  w.wiersze.every(r => /sprawdź je w akcie albo w wyciągu/.test(r.uwagiZrodla)));
T('wiersz nie udaje aktu notarialnego', w.wiersze.every(r => r.akt === '' && r.kw === ''));

const braki = S.zWklejenia('ul. Jakaś 1\tbrak daty\tnie wiadomo', { zrodlo: 'x' });
T('wiersz bez kompletu danych jest odrzucony, a nie uzupełniony zgadywaniem',
  braki.wiersze.length === 0 && braki.odrzucone.length === 1);
T('z podaniem, czego nie rozpoznał', /nie rozpoznałem:/.test(braki.odrzucone[0].powod), braki.odrzucone[0].powod);
T('puste wklejenie nie udaje wczytanego', S.zWklejenia('').ok === false);
T('program mówi, co zrobić, gdy nic nie rozpoznał',
  /Zaznacz w serwisie tabelę/.test(S.zWklejenia('').komunikat));
T('odmiana po polsku: 1 wiersz, 3 wiersze',
  /1 wiersz\b/.test(S.zWklejenia('a\t2026-01-01\t50 m2\t500000').komunikat) && /3 wiersze/.test(w.komunikat),
  w.komunikat);

/* --- 7. Zdanie do operatu o danych przepisanych --- */
const opis = S.opisPrzepisanych('deweloperuch.pl', '2026-11-04');
T('opis podaje nazwę serwisu i datę', /deweloperuch\.pl/.test(opis) && /2026-11-04/.test(opis));
T('opis mówi, skąd serwis bierze dane', /Rejestru Cen Nieruchomości/.test(opis) && /dane\.gov\.pl/.test(opis));
T('i że to dane wtórne do weryfikacji', /Dane wtórne/.test(opis) && /zweryfikować/.test(opis));

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);
