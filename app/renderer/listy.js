'use strict';
/* ============================================================================
   OPERO — LISTY WYBORU
   ----------------------------------------------------------------------------
   Rzeczoznawca wpisuje te same rzeczy w kazdym operacie: „Okreslenie wartosci
   rynkowej dla potrzeb sprzedazy", „prawo wlasnosci", „tradycyjna murowana",
   „dobry". Pisanie tego z reki kosztuje czas i daje za kazdym razem inna
   pisownie - a potem operat sam sobie przeczy, bo w rozdziale 5 jest
   „spoldzielcze wlasnosciowe prawo do lokalu", a w rozdziale 10 „SWPL".

   Dlatego te pola maja listy. Ale listy OTWARTE:

     * mozesz wybrac z listy jednym klikniecieem,
     * mozesz wpisac cokolwiek wlasnego, bo zadna lista nie obejmie wszystkich
       przypadkow, a program, ktory nie pozwala wpisac prawdy, jest gorszy od
       programu bez listy.

   To nie jest slownik narzucony przez program. To sa wartosci, ktore
   najczesciej wchodza do operatu - zgodne z ustawa o gospodarce
   nieruchomosciami, rozporzadzeniem w sprawie wycen i z tym, jak nazywa sie
   rzeczy w wypisie z ewidencji i w ksiedze wieczystej.

   Klucze sa takie same, jak sciezki danych w operacie (`data-path`) i jak
   klucze pol Expressu - dzieki temu jedna lista obsluguje oba miejsca
   i nie da sie ich rozjechac.
   ========================================================================= */

/** Pozycja listy: wartosc idzie do operatu, opis tlumaczy, kiedy jej uzyc. */
const L = (wartosc, opis = '') => ({ wartosc, opis });

const LISTY_WARTOSCI = {

  /* ----------------------------------------------------- cel i rodzaj wyceny */
  'valuation.purpose': [
    L('Określenie wartości rynkowej dla potrzeb sprzedaży', 'Najczęstszy cel — sprzedaż na wolnym rynku.'),
    L('Określenie wartości rynkowej dla potrzeb zabezpieczenia wierzytelności kredytodawcy', 'Zabezpieczenie hipoteczne — bank wymaga wskazania celu wprost.'),
    L('Określenie wartości rynkowej dla potrzeb postępowania spadkowego', 'Dział spadku, zachowek, podatek od spadków.'),
    L('Określenie wartości rynkowej dla potrzeb podziału majątku wspólnego', 'Rozwód, zniesienie współwłasności.'),
    L('Określenie wartości rynkowej dla potrzeb postępowania sądowego', 'Na zlecenie sądu albo strony w postępowaniu.'),
    L('Określenie wartości rynkowej dla potrzeb postępowania egzekucyjnego', 'Opis i oszacowanie na wniosek komornika.'),
    L('Określenie wartości rynkowej dla potrzeb ustalenia opłaty adiacenckiej', 'Art. 98a i 145 ugn — wzrost wartości z podziału lub infrastruktury.'),
    L('Określenie wartości rynkowej dla potrzeb ustalenia opłaty planistycznej', 'Art. 36 ust. 4 ustawy o planowaniu — renta planistyczna.'),
    L('Określenie wartości rynkowej dla potrzeb aktualizacji opłaty rocznej z tytułu użytkowania wieczystego', 'Art. 77 ugn.'),
    L('Określenie wartości rynkowej dla potrzeb ustalenia odszkodowania za wywłaszczenie', 'Art. 128 i nast. ugn.'),
    L('Określenie wartości rynkowej dla potrzeb wniesienia aportu do spółki', 'Wkład niepieniężny.'),
    L('Określenie wartości rynkowej dla potrzeb sprawozdania finansowego', 'Wycena bilansowa, MSR 40 / ustawa o rachunkowości.'),
    L('Określenie wartości odtworzeniowej dla potrzeb ubezpieczenia', 'Suma ubezpieczenia — wartość odtworzeniowa, nie rynkowa.'),
    L('Określenie wartości rynkowej dla potrzeb ustalenia wynagrodzenia za ustanowienie służebności', 'Służebność przesyłu albo gruntowa.'),
    L('Określenie wartości rynkowej dla potrzeb przekształcenia prawa użytkowania wieczystego', 'Opłata przekształceniowa.'),
    L('Określenie wartości rynkowej dla potrzeb negocjacji ceny', 'Zlecenie prywatne, bez postępowania.'),
  ],

  'valuation.valueType': [
    L('wartość rynkowa', 'Art. 151 ust. 1 ugn — kwota możliwa do uzyskania na rynku.'),
    L('wartość odtworzeniowa', 'Art. 151 ust. 2 ugn — koszt odtworzenia minus zużycie.'),
    L('wartość katastralna', 'Art. 151 ust. 3 ugn — ustalana w powszechnej taksacji.'),
    L('wartość indywidualna', 'Dla konkretnego inwestora, poza definicją rynkową.'),
  ],

  /* ---------------------------------------------------------- stan prawny */
  'property.rightType': [
    L('prawo własności lokalu mieszkalnego stanowiącego odrębną nieruchomość', 'Lokal z własną księgą wieczystą i udziałem w nieruchomości wspólnej.'),
    L('prawo własności lokalu użytkowego stanowiącego odrębną nieruchomość', ''),
    L('spółdzielcze własnościowe prawo do lokalu mieszkalnego', 'Prawo zbywalne i dziedziczne, ale nie własność — księga wieczysta nie jest obowiązkowa.'),
    L('spółdzielcze własnościowe prawo do lokalu użytkowego', ''),
    L('prawo własności nieruchomości gruntowej zabudowanej', ''),
    L('prawo własności nieruchomości gruntowej niezabudowanej', ''),
    L('prawo użytkowania wieczystego gruntu wraz z prawem własności budynku', 'Dwa prawa naraz — wycena musi je rozdzielić.'),
    L('udział w prawie własności nieruchomości', 'Pamiętaj o wskazaniu wielkości udziału.'),
    L('prawo własności nieruchomości rolnej', ''),
    L('prawo własności nieruchomości leśnej', ''),
  ],

  'property.usableAreaSource': [
    L('wypis z rejestru lokali (EGiB)', 'Dane urzędowe — najmocniejsze źródło.'),
    L('treść księgi wieczystej', ''),
    L('zaświadczenie o samodzielności lokalu', ''),
    L('akt notarialny ustanowienia odrębnej własności', ''),
    L('zaświadczenie ze spółdzielni mieszkaniowej', 'Przy spółdzielczym własnościowym prawie do lokalu.'),
    L('rzut lokalu z dokumentacji budowlanej', ''),
    L('pomiar własny rzeczoznawcy z oględzin', 'Zapisz w operacie normę, według której mierzyłeś.'),
    L('inwentaryzacja architektoniczna', ''),
  ],

  'property.roadAccess': [
    L('bezpośredni z drogi publicznej', 'Najmocniejsza sytuacja — nie wymaga dowodu dodatkowego.'),
    L('przez drogę wewnętrzną, na podstawie służebności drogowej', 'Wskaż numer księgi, w której wpisano służebność.'),
    L('przez drogę wewnętrzną, na podstawie udziału w działce drogowej', ''),
    L('przez drogę wewnętrzną, bez ustanowionego prawa', 'To wada prawna — musi być opisana i uwzględniona w wartości.'),
    L('brak dostępu do drogi publicznej', 'Poważna wada — nieruchomość może być nieużyteczna.'),
  ],

  /* ------------------------------------------------------------- budynek */
  'building.type': [
    L('budynek mieszkalny wielorodzinny', ''),
    L('budynek mieszkalny jednorodzinny wolnostojący', ''),
    L('budynek mieszkalny jednorodzinny w zabudowie bliźniaczej', ''),
    L('budynek mieszkalny jednorodzinny w zabudowie szeregowej', ''),
    L('kamienica', 'Przedwojenna zabudowa śródmiejska.'),
    L('budynek usługowy', ''),
    L('budynek biurowy', ''),
    L('budynek handlowo-usługowy', ''),
    L('budynek magazynowy', ''),
    L('budynek produkcyjny', ''),
    L('budynek gospodarczy', ''),
    L('garaż', ''),
  ],

  'building.construction': [
    L('tradycyjna murowana (cegła ceramiczna)', ''),
    L('tradycyjna murowana (pustak, bloczek betonowy)', ''),
    L('murowana z bloczków silikatowych', ''),
    L('murowana z betonu komórkowego', ''),
    L('wielka płyta (prefabrykowana)', 'Technologia lat 60.–80.; wpływa na zbywalność i koszty remontu.'),
    L('żelbetowa monolityczna', 'Typowa dla budownictwa po 2000 r.'),
    L('szkieletowa żelbetowa z wypełnieniem', ''),
    L('szkieletowa drewniana', ''),
    L('mieszana', ''),
  ],

  'building.condition': [
    L('bardzo dobry', 'Po kompleksowym remoncie albo budynek nowy.'),
    L('dobry', 'Bieżące utrzymanie, bez widocznych uszkodzeń.'),
    L('zadowalający', 'Widoczne zużycie, ale bez wpływu na użytkowanie.'),
    L('przeciętny', ''),
    L('zły', 'Konieczny remont elementów konstrukcyjnych albo instalacji.'),
    L('do kapitalnego remontu', ''),
  ],

  'building.roof': [
    L('stropodach kryty papą', ''),
    L('dach dwuspadowy kryty dachówką', ''),
    L('dach dwuspadowy kryty blachodachówką', ''),
    L('dach wielospadowy kryty dachówką', ''),
    L('dach płaski kryty membraną', ''),
    L('dach kopertowy', ''),
  ],

  'building.facade': [
    L('tynk cementowo-wapienny', ''),
    L('ocieplona styropianem, tynk cienkowarstwowy', 'Termomodernizacja — podnosi wartość i obniża koszty.'),
    L('ocieplona wełną mineralną, tynk cienkowarstwowy', ''),
    L('cegła klinkierowa', ''),
    L('elewacja wentylowana', ''),
    L('płyta prefabrykowana bez docieplenia', ''),
  ],

  'building.lift': [
    L('tak — winda osobowa', ''),
    L('tak — winda osobowa przystosowana dla osób z niepełnosprawnościami', ''),
    L('nie', 'Przy lokalu powyżej 3. piętra to istotna cecha rynkowa.'),
  ],

  'building.installations': [
    L('wodociągowa, kanalizacyjna, elektryczna, gazowa, centralnego ogrzewania miejskiego', ''),
    L('wodociągowa, kanalizacyjna, elektryczna, centralnego ogrzewania z kotłowni lokalnej', ''),
    L('wodociągowa, kanalizacyjna, elektryczna, gazowa, ogrzewanie etażowe gazowe', ''),
    L('wodociągowa, kanalizacyjna, elektryczna, ogrzewanie elektryczne', ''),
    L('wodociągowa, szambo, elektryczna, ogrzewanie na paliwo stałe', ''),
  ],

  'building.parking': [
    L('miejsca postojowe w garażu podziemnym', ''),
    L('naziemne miejsca postojowe na terenie nieruchomości', ''),
    L('garaż wolnostojący', ''),
    L('parkowanie w pasie drogowym, bez miejsc wydzielonych', 'Przy śródmieściu to realna wada.'),
    L('brak miejsc postojowych', ''),
  ],

  'building.energyClass': [
    L('A+', ''), L('A', ''), L('B', ''), L('C', ''), L('D', ''), L('E', ''), L('F', ''), L('G', ''),
    L('brak świadectwa charakterystyki energetycznej', 'Od 2023 r. świadectwo jest wymagane przy sprzedaży.'),
  ],

  /* --------------------------------------------------------------- lokal */
  'local.standardLevel': [
    L('wysoki — wykończenie z materiałów podwyższonego standardu', ''),
    L('dobry — wykończenie typowe, w dobrym stanie', ''),
    L('przeciętny — wykończenie typowe, zużyte', ''),
    L('niski — wykończenie wymagające wymiany', ''),
    L('stan deweloperski', 'Bez wykończenia — ściany, wylewki, instalacje bez białego montażu.'),
    L('stan surowy zamknięty', ''),
    L('do remontu generalnego', ''),
  ],

  'local.technicalCondition': [
    L('bardzo dobry', ''), L('dobry', ''), L('zadowalający', ''), L('przeciętny', ''),
    L('zły', ''), L('do remontu', ''),
  ],

  'local.layout': [
    L('funkcjonalny, pokoje niezależne', 'Układ najlepiej oceniany na rynku.'),
    L('funkcjonalny, kuchnia otwarta na salon', ''),
    L('przechodni — jeden z pokoi bez samodzielnego wejścia', 'Wada funkcjonalna, obniża cenę.'),
    L('amfiladowy', ''),
    L('jednoprzestrzenny (studio)', ''),
    L('dwupoziomowy', ''),
  ],

  'local.heating': [
    L('centralne ogrzewanie miejskie', ''),
    L('centralne ogrzewanie z kotłowni lokalnej', ''),
    L('etażowe gazowe', ''),
    L('etażowe elektryczne', ''),
    L('piece kaflowe', 'Przy zabudowie przedwojennej — istotna wada.'),
    L('pompa ciepła', ''),
  ],

  'local.windows': [
    L('PCV, szyba zespolona', ''),
    L('drewniane, szyba zespolona', ''),
    L('aluminiowe', ''),
    L('drewniane skrzynkowe', 'Stolarka pierwotna — zwykle do wymiany.'),
  ],

  'local.kitchen': [
    L('kuchnia oddzielna, z oknem', ''),
    L('aneks kuchenny otwarty na salon', ''),
    L('kuchnia oddzielna, bez okna (ciemna)', 'Wada funkcjonalna.'),
  ],

  'local.bathroom': [
    L('łazienka z WC — jedno pomieszczenie', ''),
    L('łazienka i WC oddzielnie', ''),
    L('dwie łazienki', ''),
  ],

  'local.installations': [
    L('wodno-kanalizacyjna, elektryczna, gazowa, centralnego ogrzewania', ''),
    L('wodno-kanalizacyjna, elektryczna, centralnego ogrzewania', ''),
    L('wodno-kanalizacyjna, elektryczna, gazowa, centralnego ogrzewania, klimatyzacja', ''),
  ],

  /* ---------------------------------------------- przeznaczenie w planie */
  'planning.designation': [
    L('MN — tereny zabudowy mieszkaniowej jednorodzinnej', ''),
    L('MW — tereny zabudowy mieszkaniowej wielorodzinnej', ''),
    L('MNU — tereny zabudowy mieszkaniowo-usługowej', ''),
    L('U — tereny zabudowy usługowej', ''),
    L('UC — tereny rozmieszczenia obiektów handlowych wielkopowierzchniowych', ''),
    L('P — tereny obiektów produkcyjnych, składów i magazynów', ''),
    L('ZP — tereny zieleni urządzonej', ''),
    L('ZL — lasy', ''),
    L('R — tereny rolnicze', ''),
    L('KD — tereny dróg publicznych', ''),
    L('brak miejscowego planu zagospodarowania przestrzennego', 'Wtedy podstawą jest studium albo decyzja o warunkach zabudowy — wskaż którą.'),
  ],

  'planning.protections': [
    L('brak form ochrony', ''),
    L('wpis do rejestru zabytków', 'Istotne ograniczenie — każda zmiana wymaga zgody konserwatora.'),
    L('wpis do gminnej ewidencji zabytków', ''),
    L('strefa ochrony konserwatorskiej', ''),
    L('obszar Natura 2000', ''),
    L('strefa ochronna ujęcia wody', ''),
    L('obszar szczególnego zagrożenia powodzią', 'Wpływa na ubezpieczenie i zbywalność.'),
    L('teren górniczy', ''),
  ],

  /* -------------------------------------------------------- lokalizacja */
  'location.transport': [
    L('bardzo dobra — przystanek w zasięgu 300 m, kilka linii', ''),
    L('dobra — przystanek w zasięgu 500 m', ''),
    L('przeciętna — przystanek w zasięgu 1 km', ''),
    L('słaba — komunikacja publiczna poza zasięgiem dojścia pieszego', ''),
  ],

  /* ------------------------------------------------------------- rynek */
  'market.weightMethod': [
    L('analiza porównawcza par nieruchomości', 'Najmocniejsza metoda ustalenia wag — wymaga par różniących się jedną cechą.'),
    L('analiza statystyczna rynku', ''),
    L('metoda badania preferencji nabywców', ''),
    L('ocena ekspercka rzeczoznawcy', 'Dopuszczalna, ale wymaga uzasadnienia w operacie.'),
  ],

  /* ----------------------------------------------------- pola Expressu */
  'cel': null,            // ten sam co valuation.purpose - ustawiane nizej
  'rodzajObiektu': [
    L('budynek gospodarczy murowany', ''),
    L('budynek gospodarczy drewniany', ''),
    L('garaż murowany wolnostojący', ''),
    L('wiata', ''),
    L('budynek inwentarski', ''),
    L('budowla — ogrodzenie', ''),
    L('budowla — utwardzenie terenu', ''),
  ],
  'zrodloCeny': [
    L('Sekocenbud — Biuletyn cen obiektów budowlanych (BCO), wydanie i tabela', 'Najczęściej przyjmowane źródło kosztu odtworzenia.'),
    L('Sekocenbud — Biuletyn cen robót (BCR)', ''),
    L('Bistyp — katalog cen jednostkowych', ''),
    L('Orgbud — informacja o cenach', ''),
    L('kosztorys inwestorski sporządzony dla tego obiektu', ''),
    L('oferty wykonawców zebrane przez rzeczoznawcę', 'Zapisz, ile ofert i z jakiej daty.'),
  ],
  'zrodloStopy': [
    L('transakcje nieruchomościami o podobnej funkcji na rynku lokalnym', 'Najmocniejsze źródło — podaj liczbę transakcji i okres.'),
    L('raporty rynkowe firm doradczych', ''),
    L('Baza cen nieruchomości NBP', ''),
    L('analiza relacji czynszu do ceny na rynku lokalnym', ''),
  ],
};

// Cel wyceny w Express to ten sam slownik, co w pelnym operacie - jedna lista
// zamiast dwoch, ktore rozjechalyby sie przy pierwszej poprawce.
LISTY_WARTOSCI.cel = LISTY_WARTOSCI['valuation.purpose'];
LISTY_WARTOSCI.prawo = LISTY_WARTOSCI['property.rightType'];
LISTY_WARTOSCI.standard = LISTY_WARTOSCI['local.standardLevel'];
LISTY_WARTOSCI.stanTechniczny = LISTY_WARTOSCI['local.technicalCondition'];

function listyUprosc(tekst) {
  return String(tekst || '')
    .toLowerCase().replace(/ł/g, 'l')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Lista dla pola. `null`, gdy to pole nie ma listy — wtedy zostaje zwykłe. */
function listyDla(klucz) {
  const lista = LISTY_WARTOSCI[String(klucz || '').trim()];
  return Array.isArray(lista) && lista.length ? lista : null;
}

function listyMaListe(klucz) { return Boolean(listyDla(klucz)); }

/** Wszystkie pola, które mają listę — do sprawdzenia, czy nic nie wypadło. */
function listyKlucze() {
  return Object.keys(LISTY_WARTOSCI).filter(k => listyDla(k));
}

/**
 * Po polsku szuka sie slowem w mianowniku, a w tekscie stoi odmienione:
 * czlowiek pisze „spadek", a w opisie jest „postepowania SPADKOWEGO".
 * Porownywanie calych slow nie znalazloby tu nic, a filtr, ktory nie znajduje
 * oczywistej rzeczy, jest gorszy od braku filtra - czlowiek przestaje mu ufac
 * i wpisuje wszystko z reki.
 *
 * Dlatego porownujemy RDZENIE: cztery pierwsze znaki wystarcza, zeby „spadek"
 * trafilo na „spadkowego", a „kredyt" na „kredytodawcy". Luzniejsze
 * dopasowanie oznacza czasem jedna pozycje za duzo na liscie - to tansze niz
 * brak tej jednej, ktorej czlowiek szuka.
 */
function listyRdzen(slowo, wyrazy) {
  if (slowo.length < 4) return false;
  // Cztery znaki, nie wiecej: „spadek" ma rdzen „spad" i trafia na
  // „spadkowego"; przy pieciu znakach („spade") nie trafiloby juz nic.
  const rdzen = slowo.slice(0, 4);
  return wyrazy.some(w => w.startsWith(rdzen));
}

/**
 * Filtrowanie w trakcie pisania. Szukamy po KAŻDYM słowie, nie po początku:
 * „kredyt" ma znaleźć „…dla potrzeb zabezpieczenia wierzytelności
 * kredytodawcy", bo nikt nie zaczyna pisać od słowa „Określenie".
 */
function listyFiltruj(klucz, fraza, limit = 12) {
  const lista = listyDla(klucz);
  if (!lista) return [];
  const q = listyUprosc(fraza);
  if (!q) return lista.slice(0, limit);
  const slowa = q.split(' ').filter(Boolean);
  const trafione = lista.filter(p => {
    const pelny = listyUprosc(`${p.wartosc} ${p.opis}`);
    const wyrazy = pelny.split(' ').filter(Boolean);
    return slowa.every(s => pelny.includes(s) || listyRdzen(s, wyrazy));
  });
  // Pozycje zaczynajace sie od wpisanego tekstu ida na gore - czlowiek, ktory
  // zaczal pisac wartosc, zwykle chce wlasnie ja.
  return trafione
    .sort((a, b) => Number(listyUprosc(b.wartosc).startsWith(q)) - Number(listyUprosc(a.wartosc).startsWith(q)))
    .slice(0, limit);
}

/**
 * Czy wpisana wartość jest jedną z listy. NIE sluzy do blokowania — sluzy do
 * tego, zeby program mogl powiedziec „to wartosc spoza listy, sprawdz pisownie",
 * a nie zeby nie dac jej wpisac. Rzeczywistosc bywa szersza niz lista.
 */
function listyZListy(klucz, wartosc) {
  const lista = listyDla(klucz);
  if (!lista) return true;
  const w = listyUprosc(wartosc);
  return lista.some(p => listyUprosc(p.wartosc) === w);
}

/** Pozycja listy po wartości — żeby pokazać jej opis przy wybranym polu. */
function listyPozycja(klucz, wartosc) {
  const lista = listyDla(klucz);
  if (!lista) return null;
  const w = listyUprosc(wartosc);
  return lista.find(p => listyUprosc(p.wartosc) === w) || null;
}

const API_LISTY = {
  WARTOSCI: LISTY_WARTOSCI,
  dla: listyDla, maListe: listyMaListe, klucze: listyKlucze,
  filtruj: listyFiltruj, zListy: listyZListy, pozycja: listyPozycja, uprosc: listyUprosc,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_LISTY;
if (typeof window !== 'undefined') window.OperoListy = API_LISTY;
