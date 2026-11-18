'use strict';
/**
 * OPERO — cechy rynkowe, wagi i trzystopniowa skala.
 *
 * To jest miejsce, w którym operat porównawczy najczęściej się sypie.
 * Najgroźniejszy błąd nie wygląda na błąd: gdy wagi sumują się do 90%
 * zamiast 100%, silnik policzy wartość, operat wyjdzie, PDF się wygeneruje —
 * a wynik będzie zaniżony o dziesięć procent i nikt tego nie zobaczy.
 * Dlatego test pilnuje sumy wag mocniej niż czegokolwiek innego.
 */
const fs = require('node:fs');
const path = require('node:path');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

const APP = [path.join(__dirname, '..', 'build', 'app'), path.join(__dirname, '..', 'app')].find(p => fs.existsSync(p));
const C = require(path.join(APP, 'renderer', 'cechy.js'));

console.log('OPERO — cechy rynkowe\n');

/* --- 1. Katalog --- */
T('program zna zestawy dla różnych rodzajów nieruchomości', Object.keys(C.ZESTAWY).length >= 4);
T('jest zestaw dla lokalu, domu, działki i lokalu użytkowego',
  ['lokal', 'dom', 'dzialka', 'uzytkowy'].every(k => C.ZESTAWY[k]));
T('każdy zestaw ma nazwę i cechy',
  Object.values(C.ZESTAWY).every(z => z.nazwa && z.cechy.length >= 5));
T('każda cecha ma nazwę i opis, co znaczy',
  Object.values(C.ZESTAWY).every(z => z.cechy.every(c => c.nazwa && String(c.opis).length > 25)));
T('każda cecha ma typowy przedział wagi z praktyki',
  Object.values(C.ZESTAWY).every(z => z.cechy.every(c => c.wagaOd > 0 && c.wagaDo > c.wagaOd)));
/* Trzy stopnie, bo przy pięciu rzeczoznawca zwykle nie umie wskazać, czym
   „korzystna" różni się od „bardzo korzystnej" — a weryfikator o to pyta. */
T('każda cecha ma trzy stopnie oceny',
  Object.values(C.ZESTAWY).every(z => z.cechy.every(c => c.skala.length === 3)));
T('każdy stopień jest opisany DLA TEJ cechy, nie ogólnie',
  Object.values(C.ZESTAWY).every(z => z.cechy.every(c => c.skala.every(s => String(s).length > 20))));
T('nazwy stopni są takie, jak rozumie silnik obliczeń',
  JSON.stringify(C.STOPNIE) === JSON.stringify(['Niekorzystna', 'Przeciętna', 'Korzystna']));

/* --- 2. Dobór zestawu do rodzaju operatu --- */
T('lokal mieszkalny to zestaw dla lokalu', C.rodzaj('local_kcm') === 'lokal');
T('nieruchomość zabudowana to zestaw dla domu', C.rodzaj('pair_developed') === 'dom');
T('działka to zestaw dla działki', C.rodzaj('land_plot') === 'dzialka');
T('podejście dochodowe to zestaw dla lokalu użytkowego', C.rodzaj('income') === 'uzytkowy');
T('nieznany kod nie wywraca programu', C.zestaw(C.rodzaj('cokolwiek')).cechy.length > 0);

/* --- 3. Podpowiedź wag — SUMA MUSI BYĆ 100% --- */
for (const rodzaj of Object.keys(C.ZESTAWY)) {
  const s = C.sugeruj(rodzaj);
  const suma = Math.round(s.reduce((a, c) => a + c.waga, 0) * 10) / 10;
  T(`wagi dla „${C.ZESTAWY[rodzaj].nazwa}" sumują się dokładnie do 100%`, suma === 100, String(suma));
}
const lokal = C.sugeruj('lokal');
T('podpowiedź niesie opis każdej cechy', lokal.every(c => c.opis));
T('i typowy przedział, z którego waga pochodzi', lokal.every(c => c.wagaOd && c.wagaDo));
T('i trzy stopnie z opisami', lokal.every(c => c.skala.length === 3 && c.skala.every(s => s.ocena && s.opis)));
T('lokalizacja ma największą wagę na rynku mieszkaniowym',
  lokal[0].id === 'lokalizacja' && lokal[0].waga === Math.max(...lokal.map(c => c.waga)),
  `${lokal[0].id} ${lokal[0].waga}`);
const krotki = C.sugeruj('lokal', { ile: 4 });
T('da się poprosić o mniej cech', krotki.length === 4);
T('przy mniejszej liczbie zostają te najważniejsze', krotki.some(c => c.id === 'lokalizacja'));
T('i wagi nadal sumują się do 100%',
  Math.round(krotki.reduce((a, c) => a + c.waga, 0) * 10) / 10 === 100,
  String(krotki.reduce((a, c) => a + c.waga, 0)));

/* --- 4. Sprawdzanie wag — najgroźniejszy błąd nie wygląda na błąd --- */
T('poprawny zestaw przechodzi bez uwag', C.sprawdzWagi(lokal).ok === true);
const zaMalo = C.sprawdzWagi([{ nazwa: 'A', waga: 40 }, { nazwa: 'B', waga: 50 }]);
T('suma 90% jest zgłoszona jako błąd', zaMalo.waga === 'blad' && !zaMalo.ok);
T('program podaje, ile brakuje', /Brakuje 10/.test(zaMalo.uwagi[0]), zaMalo.uwagi[0]);
T('i mówi, czym to grozi', /zaniżona albo zawyżona/.test(zaMalo.uwagi[0]));
const zaDuzo = C.sprawdzWagi([{ nazwa: 'A', waga: 60 }, { nazwa: 'B', waga: 55 }]);
T('suma 115% też jest błędem', zaDuzo.waga === 'blad');
T('program mówi o nadmiarze, a nie o braku', /Nadmiar wynosi 15/.test(zaDuzo.uwagi[0]), zaDuzo.uwagi[0]);
const zZerem = C.sprawdzWagi([{ nazwa: 'A', waga: 100 }, { nazwa: 'Pusta', waga: 0 }]);
T('cecha z wagą zero jest zgłoszona', /wagę zero/.test(zZerem.uwagi.join(' ')), zZerem.uwagi.join(' '));
T('bo sugeruje, że była brana pod uwagę, a nie była',
  /sugerowała, że była brana pod uwagę/.test(zZerem.uwagi.join(' ')));
const dominujaca = C.sprawdzWagi([{ nazwa: 'A', waga: 70 }, { nazwa: 'B', waga: 30 }]);
T('waga powyżej 50% to uwaga, nie błąd', dominujaca.waga === 'uwaga', dominujaca.waga);
T('program mówi, że to wymaga uzasadnienia', /wymaga wyraźnego uzasadnienia/.test(dominujaca.uwagi.join(' ')));
T('dwie cechy to za mało', /za mało/.test(C.sprawdzWagi([{ nazwa: 'A', waga: 60 }, { nazwa: 'B', waga: 40 }]).uwagi.join(' ')));
T('dziewięć cech to dużo',
  /to dużo/.test(C.sprawdzWagi(Array.from({ length: 9 }, (_, i) => ({ nazwa: `C${i}`, waga: 100 / 9 }))).uwagi.join(' ')));
T('brak cech to błąd, a nie cisza', C.sprawdzWagi([]).waga === 'blad');
T('i program mówi, dlaczego', /nie ma czego korygować/.test(C.sprawdzWagi([]).uwagi[0]));

/* --- 5. Wyrównanie wag --- */
const wyrownane = C.wyrownaj([{ nazwa: 'A', waga: 30 }, { nazwa: 'B', waga: 20 }, { nazwa: 'C', waga: 40 }]);
T('wyrównanie daje dokładnie 100%',
  Math.round(wyrownane.reduce((a, c) => a + c.waga, 0) * 10) / 10 === 100,
  String(wyrownane.reduce((a, c) => a + c.waga, 0)));
T('i zachowuje proporcje', wyrownane[2].waga > wyrownane[0].waga && wyrownane[0].waga > wyrownane[1].waga);
const zZer = C.wyrownaj([{ nazwa: 'A', waga: 0 }, { nazwa: 'B', waga: 0 }, { nazwa: 'C', waga: 0 }]);
T('same zera dają wagi równe', Math.round(zZer.reduce((a, c) => a + c.waga, 0) * 10) / 10 === 100);

/* --- 6. Trzy scenariusze dla Expressu --- */
T('scenariusze są trzy', C.SCENARIUSZE.length === 3);
T('najniższy, przeciętny i najwyższy',
  C.SCENARIUSZE.map(s => s.id).join(',') === 'najgorszy,sredni,najlepszy');
T('każdy ma nazwę, opis i wyjaśnienie, po co jest',
  C.SCENARIUSZE.every(s => s.nazwa && s.opis && String(s.kiedy).length > 25));
const sc = C.scenariusze(lokal);
T('każdy scenariusz ocenia WSZYSTKIE cechy',
  sc.every(s => Object.keys(s.oceny).length === lokal.length));
T('najniższy ocenia wszystko niekorzystnie',
  Object.values(sc[0].oceny).every(o => o === 'Niekorzystna'));
T('przeciętny — przeciętnie', Object.values(sc[1].oceny).every(o => o === 'Przeciętna'));
T('najwyższy — korzystnie', Object.values(sc[2].oceny).every(o => o === 'Korzystna'));
T('scenariusz niesie gotowe cechy z oceną, do policzenia',
  sc[0].cechy.length === lokal.length && sc[0].cechy.every(c => c.rating === 'Niekorzystna'));
T('wagi w scenariuszach zostają nietknięte',
  sc[2].cechy.every((c, i) => c.waga === lokal[i].waga));

/* --- 7. To NIE są trzy wyceny --- */
const opis = C.opisWidelek([{ wartosc: 500000 }, { wartosc: 580000 }, { wartosc: 660000 }]);
T('program podaje widełki', /500.000/.test(opis) && /660.000/.test(opis), opis);
T('i rozpiętość w procentach', /32%/.test(opis), opis);
T('mówi wprost, że to widełki METODY, a nie trzy wyceny',
  /widełki METODY, a nie trzy wyceny/.test(opis), opis);
T('i że operat zawiera jedną wartość z oględzin',
  /operat zawiera jedną wartość/.test(opis) && /oględzin/.test(opis));
T('przy jednej kwocie nie ma o czym mówić', C.opisWidelek([{ wartosc: 500000 }]) === '');

/* --- 8. Zdanie do operatu o sposobie ustalenia wag --- */
T('metoda par ma swoje zdanie', /analizy porównawczej par/.test(C.uzasadnienieWag('pairs', { ile: 5 })));
T('analiza statystyczna ma swoje', /analizy statystycznej/.test(C.uzasadnienieWag('correlation', { ile: 5 })));
T('ocena ekspercka wymaga uzupełnienia przesłanek',
  /DO UZUPEŁNIENIA/.test(C.uzasadnienieWag('expert', { ile: 5 })));
T('przy nieokreślonej metodzie program nie udaje, że wie',
  /DO UZUPEŁNIENIA/.test(C.uzasadnienieWag('', { ile: 5 })));
T('zdanie podaje liczbę cech', /5 cech/.test(C.uzasadnienieWag('pairs', { ile: 5 })));

/* --- 9. Polska odmiana liczebnikow: program ma brzmiec jak pismo, nie jak maszyna --- */
const od = (n) => C.odmien(n, 'jeden', 'dwa', 'piec');
T('1 bierze forme pojedyncza', od(1) === 'jeden');
T('2-4 bierze forme mnoga', od(2) === 'dwa' && od(3) === 'dwa' && od(4) === 'dwa');
T('5 i wiecej bierze dopelniacz', od(5) === 'piec' && od(9) === 'piec');
T('12-14 to wyjatek i nie idzie za koncowka', od(12) === 'piec' && od(13) === 'piec' && od(14) === 'piec');
T('22-24 wraca do formy mnogiej', od(22) === 'dwa' && od(24) === 'dwa');
T('ulamek bierze forme pojedyncza', od(0.5) === 'jeden' && od(1.5) === 'jeden');

const braki = (waga) => C.sprawdzWagi([{ id: 'a', nazwa: 'A', waga }]).uwagi[0];
T('brakuje jednego punktu procentowego', /Brakuje 1 punktu procentowego\./.test(braki(99)), braki(99));
T('brakuje dwoch punktow procentowych', /Brakuje 2 punktów procentowych\./.test(braki(98)), braki(98));
T('brakuje stu punktow procentowych', /Brakuje 100 punktów procentowych\./.test(braki(0)), braki(0));
T('nadmiar trzech to punkty procentowe', /Nadmiar wynosi 3 punkty procentowe\./.test(braki(103)), braki(103));
T('nadmiar pieciu to punktow procentowych', /Nadmiar wynosi 5 punktów procentowych\./.test(braki(105)), braki(105));
T('nadmiar jednego to punkt procentowy', /Nadmiar wynosi 1 punkt procentowy\./.test(braki(101)), braki(101));

const zero = (ile) => C.sprawdzWagi(Array.from({ length: ile }, (_, i) =>
  ({ id: 'z' + i, nazwa: 'Z' + i, waga: 0 }))).uwagi.join(' ');
T('jedna cecha ma wage zero', /1 cecha ma wagę zero/.test(zero(1)), zero(1));
T('dwie cechy maja wage zero', /2 cechy mają wagę zero/.test(zero(2)), zero(2));
T('piec cech ma wage zero', /5 cech ma wagę zero/.test(zero(5)), zero(5));

T('zdanie o jednej cesze jest w liczbie pojedynczej',
  /przyjęto 1 cechę rynkową różnicującą ceny/.test(C.uzasadnienieWag('pairs', { ile: 1 })),
  C.uzasadnienieWag('pairs', { ile: 1 }));
T('zdanie o trzech cechach uzgadnia imieslow',
  /przyjęto 3 cechy rynkowe różnicujące ceny/.test(C.uzasadnienieWag('pairs', { ile: 3 })),
  C.uzasadnienieWag('pairs', { ile: 3 }));
T('zdanie o pieciu cechach idzie w dopelniacz',
  /przyjęto 5 cech rynkowych różnicujących ceny/.test(C.uzasadnienieWag('pairs', { ile: 5 })),
  C.uzasadnienieWag('pairs', { ile: 5 }));
T('bez liczby cech program nie wstawia pustego miejsca',
  /przyjęto cechy rynkowe różnicujące ceny/.test(C.uzasadnienieWag('pairs', {})),
  C.uzasadnienieWag('pairs', {}));

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);
