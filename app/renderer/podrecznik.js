'use strict';
/* ============================================================================
   OPERO — WYMOGI OPERATU: DOKUMENTY, PYTANIA, CZERWONE FLAGI
   ----------------------------------------------------------------------------
   Ten moduł pilnuje tego, co odróżnia policzoną liczbę od operatu, który można
   podpisać. Nie pisze operatu za rzeczoznawcę — wie, czego operat wymaga, i
   dopytuje tak długo, aż wszystko to jest w dokumencie albo świadomie
   oznaczone jako „nie dotyczy".

   Trzy listy, z których to się składa:

   1. DOKUMENTY — czego nie da się zastąpić opisem. Odpis z księgi wieczystej,
      wypis z ewidencji, zaświadczenie o przeznaczeniu, rzut lokalu, zdjęcia
      z oględzin. Gdy rzeczoznawca nie ma dokumentu w postaci danych, musi mieć
      choćby SKAN albo ZDJĘCIE — bo załączniki mają pozwolić komuś innemu
      prześledzić tok wyceny.

   2. PYTANIA — konkretne, nie „uzupełnij dane". Pytania do zamawiającego, do
      zarządcy przy obiekcie dochodowym, pytania o stan i o dokumenty. Każde
      wskazuje miejsce w operacie, w którym odpowiedź ma wylądować.

   3. CZERWONE FLAGI — układy, które przy ocenie operatu wychodzą najpierw:
      jedna transakcja decydująca o wyniku, trend przyjęty bez analizy, stopa
      bez rynku, koszt bez bazy cenowej, data stanu niezgodna z celem.

   Zasada nadrzędna: program nigdy nie odhacza pozycji za człowieka. Może
   stwierdzić, że czegoś NIE MA — nie może stwierdzić, że coś jest w porządku.
   ========================================================================= */

/* ---------------------------------------------------------- dokumenty */

const D = (id, nazwa, opis, opcje = {}) => ({ id, nazwa, opis, wymagany: true, ...opcje });

/** Dokumenty i materiały, bez których operat jest niekompletny. */
const DOKUMENTY = [
  D('kw', 'Odpis / wydruk księgi wieczystej',
    'Stan prawny ustala się z księgi, a nie z oświadczenia. Jeśli nie masz pliku, wgraj zdjęcie albo skan aktualnego wydruku.',
    { grupy: ['wszystkie'], zastepuje: 'Zdjęcie lub skan wydruku z EKW z widoczną datą' }),
  D('egib', 'Wypis z ewidencji gruntów i budynków',
    'Oznaczenie nieruchomości, powierzchnia, użytek i budynki. Zdjęcie wypisu wystarczy, dopóki dane się zgadzają.',
    { grupy: ['wszystkie'] }),
  D('mpzp', 'Wypis z planu albo zaświadczenie o przeznaczeniu',
    'Przeznaczenie decyduje o rynku i o metodzie. Gdy planu nie ma — zaświadczenie o jego braku i o studium.',
    { grupy: ['wszystkie'] }),
  D('rzut', 'Rzut lokalu / kondygnacji',
    'Pozwala sprawdzić powierzchnię i układ. Przy lokalu rzut jest podstawą opisu funkcjonalności.',
    { grupy: ['local_kcm', 'income'], zastepuje: 'Szkic odręczny z oględzin z wymiarami' }),
  D('zdjecia', 'Fotografie z oględzin',
    'Dokumentacja stanu na dzień oględzin. Bez niej nie da się później wykazać, co widziałeś.',
    { grupy: ['wszystkie'], minimum: 3 }),
  D('mapa', 'Mapa ewidencyjna / zasadnicza',
    'Położenie, granice i sąsiedztwo. Przy nieruchomości gruntowej obowiązkowa.',
    { grupy: ['developed_pairs', 'cost'] }),
  D('umowy', 'Umowy najmu albo zestawienie czynszów',
    'Przy wycenie dochodowej to jest źródło przychodu. Rent roll albo skany umów.',
    { grupy: ['income'] }),
  D('podstawa', 'Podstawa formalna — umowa, zlecenie albo postanowienie',
    'Operat musi wskazywać, kto i na jakiej podstawie go zamówił.',
    { grupy: ['wszystkie'] }),
];

function dokumentyDla(typ) {
  return DOKUMENTY.filter(d => d.grupy.includes('wszystkie') || d.grupy.includes(typ));
}

/* ------------------------------------------------------------ pytania */

const P = (id, pytanie, dlaczego, opcje = {}) => ({ id, pytanie, dlaczego, grupy: ['wszystkie'], ...opcje });

/**
 * Pytania, które program zadaje zamiast komunikatu „uzupełnij dane".
 * `sciezka` mówi, gdzie w operacie ląduje odpowiedź; `sprawdz` — czy pytanie
 * jest jeszcze aktualne.
 */
const PYTANIA = [
  P('cel', 'Do czego potrzebny jest ten operat (sprzedaż, kredyt, sąd, podatek, wywłaszczenie)?',
    'Cel wyznacza rodzaj wartości, datę stanu i zakres analizy. Operat z celem „ogólnym" jest nie do obrony.',
    { sciezka: 'valuation.purpose' }),
  P('zamawiajacy', 'Kto zamawia operat i na jakiej podstawie?',
    'Operat wskazuje zamawiającego i podstawę formalną. Bez tego brakuje elementu wymaganego w każdym operacie.',
    { sciezka: 'client.name' }),
  P('prawo', 'Jakie prawo do nieruchomości jest przedmiotem wyceny — własność, użytkowanie wieczyste, spółdzielcze własnościowe?',
    'To inne produkty rynkowe o innych cenach. Pomylenie ich jest najczęstszym zarzutem do operatu.',
    { sciezka: 'property.rightType' }),
  P('ogledziny', 'Kiedy odbyły się oględziny i kto był obecny?',
    'Data oględzin jest odrębna od daty wyceny i musi widnieć w operacie.',
    { sciezka: 'valuation.inspectionDate' }),
  P('stanData', 'Na jaki dzień przyjmujesz stan nieruchomości?',
    'Przy odszkodowaniach i opłatach stan i ceny odnoszą się do różnych dat. Zła data stanu unieważnia wynik.',
    { sciezka: 'valuation.priceLevelDate' }),
  P('obciazenia', 'Czy w dziale III i IV księgi są obciążenia, roszczenia albo służebności?',
    'Hipoteka nie jest mechaniczną korektą wartości, ale służebność albo roszczenie już tak.',
    { sciezka: 'legal.sectionIII' }),
  P('wady', 'Czy są znane wady, postępowania, spory albo ograniczenia użytkowania?',
    'Nieujawniona wada, o której wiedziałeś, obciąża Ciebie, nie zamawiającego.',
    { sciezka: 'narratives.legal' }),
  P('rynek', 'Jaki rynek przyjmujesz — obszar, rodzaj i okres?',
    'Rynek właściwy trzeba określić wprost, a każde jego rozszerzenie uzasadnić.',
    { sciezka: 'narratives.market' }),
  P('czynsze', 'Jakie są rzeczywiste czynsze, pustostany i zaległości w ostatnim roku?',
    'Pytanie do zarządcy. Przychód z umowy bywa inny niż z rent rollu sprzed roku.',
    { grupy: ['income'], sciezka: 'income.waultBasis' }),
  P('koszty', 'Jakie koszty operacyjne obciążają właściciela i co płaci najemca?',
    'Pytanie do zarządcy. Bez podziału kosztów dochód operacyjny netto jest zmyślony.',
    { grupy: ['income'], sciezka: 'income.techniqueJustification' }),
  P('bazaCen', 'Z jakiej bazy cenowej bierzesz koszt jednostkowy i z którego okresu?',
    'Koszt bez wskazanej bazy i poziomu cen jest nie do sprawdzenia.',
    { grupy: ['cost'], sciezka: 'modul.zrodloCeny' }),
  P('zuzycie', 'Na czym opierasz przyjęty stopień zużycia?',
    'Zużycie przyjęte „na oko" to pierwsza rzecz, którą podważa weryfikator.',
    { grupy: ['cost'], sciezka: 'modul.uzasadnienieZuzycia' }),
];

function pytaniaDla(typ) {
  return PYTANIA.filter(p => p.grupy.includes('wszystkie') || p.grupy.includes(typ));
}

function wartoscZeSciezki(obiekt, sciezka) {
  return String(sciezka || '').split('.').reduce((o, k) => (o == null ? undefined : o[k]), obiekt);
}

function wypelnione(v) {
  if (v === null || v === undefined) return false;
  const t = String(v).trim();
  return t !== '' && t !== '0' && !t.includes('[DO UZUPEŁNIENIA');
}

/** Pytania, na które operat jeszcze nie odpowiada. */
function pytaniaBezOdpowiedzi(project, typ) {
  const odpowiedziane = (project && project.odpowiedzi) || {};
  return pytaniaDla(typ).filter(p => {
    if (odpowiedziane[p.id] && String(odpowiedziane[p.id]).trim()) return false;
    return !wypelnione(wartoscZeSciezki(project, p.sciezka));
  });
}

/* ------------------------------------------------------ czerwone flagi */

function liczba(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/**
 * Układy, które przy ocenie operatu wychodzą pierwsze. To NIE są błędy
 * arytmetyczne — program ich nie poprawia. Mówi, co zobaczy weryfikator,
 * żeby rzeczoznawca zdążył to wyjaśnić albo zmienić, zanim podpisze.
 */
function czerwoneFlagi(project, calc, typ) {
  const flagi = [];
  const dodaj = (id, co, dlaczego) => flagi.push({ id, co, dlaczego });
  const p = project || {};
  const c = calc || {};
  const tx = (p.market && p.market.transactions) || [];

  if (typ === 'local_kcm' || typ === 'developed_pairs') {
    if (tx.length && tx.length < 5) {
      dodaj('malo-transakcji', `Zbiór porównawczy liczy ${tx.length} transakcji`,
        'Przy tak małym zbiorze każda pozycja mocno waży na wyniku. Rozszerz zbiór albo uzasadnij, dlaczego rynek nie daje więcej.');
    }
    // Jedna transakcja decydujaca o wyniku to klasyczny zarzut: wystarczy ja
    // podwazyc, zeby upadl caly operat.
    const ceny = tx.map(t => liczba(t.priceUnit)).filter(x => x > 0);
    if (ceny.length >= 3) {
      const suma = ceny.reduce((a, b) => a + b, 0);
      const maks = Math.max(...ceny);
      if (maks / suma > 0.5) {
        dodaj('jedna-dominuje', 'Jedna transakcja odpowiada za ponad połowę zbioru',
          'Wynik stoi wtedy na jednej pozycji. Sprawdź, czy ta transakcja jest rynkowa i porównywalna.');
      }
      const min = Math.min(...ceny);
      if (min > 0 && maks / min > 3) {
        dodaj('rozrzut', `Ceny w zbiorze różnią się ponad trzykrotnie (${Math.round(min)}–${Math.round(maks)} zł/m²)`,
          'Taki rozrzut zwykle znaczy, że w zbiorze są nieruchomości z różnych rynków. Zawęź rynek albo wyjaśnij różnice.');
      }
    }
    if (p.market && p.market.trendSourceMode === 'manual' && liczba(p.market.manualTrendRate) !== 0
        && !wypelnione(p.market.trendJustification)) {
      dodaj('trend-bez-analizy', 'Trend czasowy wpisany ręcznie, bez uzasadnienia',
        'Trend przyjęty bez analizy jest na liście czerwonych flag każdej kontroli. Pokaż, z czego wynika.');
    }
    const wagi = (p.market && p.market.features) || [];
    const sumaWag = wagi.reduce((s, f) => s + liczba(f.weight), 0);
    if (wagi.length && Math.abs(sumaWag - 1) > 0.001 && Math.abs(sumaWag - 100) > 0.1) {
      dodaj('wagi', `Wagi cech sumują się do ${(sumaWag * 100).toFixed(1)}% zamiast 100%`,
        'To błąd arytmetyczny widoczny od razu — poprawcie wagi przed podpisem.');
    }
    if (wagi.length && !wypelnione(p.market && p.market.weightJustification)) {
      dodaj('wagi-bez-uzasadnienia', 'Wagi cech bez uzasadnienia',
        'Uzasadnienie wag jest wymaganym elementem analizy, nie ozdobnikiem.');
    }
  }

  if (typ === 'income') {
    const inc = p.income || {};
    if (liczba(inc.capRate) > 0 && !(inc.rateEvidence || []).some(x => x && x.adopted)) {
      dodaj('stopa-bez-rynku', 'Stopa kapitalizacji bez dowodu z rynku',
        'Stopa „z internetu" albo z pamięci jest najczęstszym powodem podważenia operatu dochodowego.');
    }
    if (!(inc.opex || []).length) {
      dodaj('brak-opex', 'Brak kosztów operacyjnych',
        'Zerowe koszty zawyżają dochód operacyjny netto, a przez niego całą wartość.');
    }
    if (liczba(inc.vacancyPct) === 0) {
      dodaj('brak-pustostanu', 'Pustostan przyjęty jako zero',
        'Pełne wynajęcie przez cały okres to założenie skrajne. Pokaż, że rynek je uzasadnia.');
    }
  }

  if (typ === 'cost') {
    const m = p.modul || {};
    if (!wypelnione(m.zrodloCeny)) {
      dodaj('koszt-bez-bazy', 'Koszt jednostkowy bez wskazania bazy cenowej',
        'Bez nazwy katalogu, wydania i poziomu cen nikt nie sprawdzi tej liczby.');
    }
    if (!wypelnione(m.uzasadnienieZuzycia)) {
      dodaj('zuzycie-bez-podstawy', 'Zużycie bez uzasadnienia',
        'Stopień zużycia zmienia wynik o dziesiątki procent i musi mieć podstawę.');
    }
  }

  /* --- wspólne --- */
  const v = p.valuation || {};
  if (wypelnione(v.valuationDate) && wypelnione(v.inspectionDate)
      && Date.parse(v.inspectionDate) > Date.parse(v.valuationDate)) {
    dodaj('ogledziny-po-wycenie', 'Oględziny po dacie wyceny',
      'Stan przyjęty do wyceny byłby wtedy stwierdzony po dniu, na który określasz wartość. Sprawdź daty.');
  }
  if (wypelnione(v.valuationDate) && Date.parse(v.valuationDate) > Date.now() + 86400000) {
    dodaj('data-z-przyszlosci', 'Data wyceny jest w przyszłości',
      'Wartość określa się na dzień, który nastąpił — chyba że cel wprost przewiduje inaczej i jest to opisane.');
  }
  if (!(p.clauses || []).length && !wypelnione(p.narratives && p.narratives.clauses)) {
    dodaj('brak-klauzul', 'Brak klauzul i zastrzeżeń',
      'Klauzule określają zakres oględzin, odpowiedzialność za dane zamawiającego i założenia szczególne.');
  }
  if (liczba(c.valueRounded) <= 0) {
    dodaj('brak-wyniku', 'Operat nie ma jeszcze wyniku',
      'Bez wartości końcowej nie ma czego podpisywać.');
  }

  return flagi;
}

/* -------------------------------------------------------------- stan */

/** Jedna odpowiedź na pytanie „czy to już można podpisać". */
function stan(project, calc, typ, zalaczniki = {}) {
  const dokumenty = dokumentyDla(typ).map(d => {
    const ile = Number((zalaczniki && zalaczniki[d.id]) || 0);
    const potrzeba = d.minimum || 1;
    return { ...d, ile, brakuje: ile < potrzeba, potrzeba };
  });
  const pytania = pytaniaBezOdpowiedzi(project, typ);
  const flagi = czerwoneFlagi(project, calc, typ);
  const brakDokumentow = dokumenty.filter(d => d.brakuje);
  return {
    dokumenty, brakDokumentow, pytania, flagi,
    gotowy: !brakDokumentow.length && !pytania.length && !flagi.length,
    podsumowanie: `${brakDokumentow.length} ${brakDokumentow.length === 1 ? 'brakujący dokument' : 'brakujących dokumentów'}, `
      + `${pytania.length} ${pytania.length === 1 ? 'pytanie bez odpowiedzi' : 'pytań bez odpowiedzi'}, `
      + `${flagi.length} ${flagi.length === 1 ? 'ostrzeżenie' : 'ostrzeżeń'}.`,
  };
}

const API_PODRECZNIK = {
  DOKUMENTY, PYTANIA,
  dokumentyDla, pytaniaDla, pytaniaBezOdpowiedzi, czerwoneFlagi, stan, wypelnione, wartoscZeSciezki,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_PODRECZNIK;
if (typeof window !== 'undefined') window.OperoPodrecznik = API_PODRECZNIK;
