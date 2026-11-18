/* OPERO — tok rozumowania
 *
 * Operat to nie zbior rubryk, tylko lancuch decyzji: po co wyceniamy → jaka
 * wartosc → jakie podejscie i metoda → jaki rynek → ktore transakcje → jakie
 * cechy i wagi → jaki wynik i czy mu wierzyc. Ten modul przechodzi ten lancuch
 * krok po kroku i przy KAZDEJ decyzji zapisuje:
 *   - pytanie, na ktore odpowiada,
 *   - dane, na ktorych sie opiera (liczby z operatu),
 *   - rozwazone mozliwosci i powod odrzucenia pozostalych,
 *   - rozstrzygniecie i jego pewnosc,
 *   - co by te decyzje zmienilo,
 *   - zastrzezenia (to, co rzeczoznawca musi rozstrzygnac sam).
 *
 * Modul niczego nie zmienia w operacie i niczego nie wymysla: liczy na danych,
 * ktore w nim sa. Tam, gdzie danych brakuje, pisze to wprost i obniza pewnosc.
 * Na koncu „krytyk” sprawdza, czy decyzje nie przecza sobie nawzajem.
 */
'use strict';

function rzL(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
function rzPl(n, d){ return rzL(n).toLocaleString('pl-PL', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
function rzOdmien(n, a, b, c){ const k = Math.abs(n) % 100, j = k % 10; return n === 1 ? a : (j >= 2 && j <= 4 && !(k >= 12 && k <= 14)) ? b : c; }
function rzKwantyl(posortowane, q){
  if (!posortowane.length) return 0;
  const p = (posortowane.length - 1) * q, d = Math.floor(p), g = Math.ceil(p);
  return posortowane[d] + (posortowane[g] - posortowane[d]) * (p - d);
}

/** Statystyka zbioru cen jednostkowych – podstawa oceny rynku. */
function rzStatystyka(transakcje, dataWyceny){
  const wiersze = (Array.isArray(transakcje) ? transakcje : []).map((t, i) => {
    const pow = rzL(t.area), jedn = rzL(t.priceUnit) || (pow > 0 ? rzL(t.price) / pow : 0);
    return { nr: i + 1, jedn, pow, data: String(t.date || ''), adres: String(t.address || '') };
  });
  const dobre = wiersze.filter(w => w.jedn > 0);
  const ceny = dobre.map(w => w.jedn).sort((a, b) => a - b);
  const n = ceny.length;
  if (!n) return { n: 0, wszystkich: wiersze.length, odstajace: [], wiersze };
  const srednia = ceny.reduce((s, x) => s + x, 0) / n;
  const mediana = rzKwantyl(ceny, 0.5), q1 = rzKwantyl(ceny, 0.25), q3 = rzKwantyl(ceny, 0.75), iqr = q3 - q1;
  const odch = n > 1 ? Math.sqrt(ceny.reduce((s, x) => s + (x - srednia) ** 2, 0) / (n - 1)) : 0;
  // Odstajace wg reguly 1,5 rozstepu cwiartkowego – ma sens dopiero od 6 obserwacji.
  const odstajace = n >= 6 && iqr > 0 ? dobre.filter(w => w.jedn < q1 - 1.5 * iqr || w.jedn > q3 + 1.5 * iqr) : [];
  const daty = dobre.map(w => Date.parse(w.data)).filter(Number.isFinite).sort((a, b) => a - b);
  const wycena = Date.parse(String(dataWyceny || ''));
  const mies = (a, b) => Math.round((b - a) / (30.44 * 86400000));
  const pows = dobre.map(w => w.pow).filter(x => x > 0).sort((a, b) => a - b);
  return {
    n, wszystkich: wiersze.length, min: ceny[0], max: ceny[n - 1], srednia, mediana, q1, q3, odch,
    zmiennosc: srednia > 0 ? odch / srednia : 0, rozpietosc: ceny[0] > 0 ? ceny[n - 1] / ceny[0] : 0,
    odstajace, wiersze,
    okresMies: daty.length > 1 ? mies(daty[0], daty[daty.length - 1]) : 0,
    najstarszaMies: daty.length && Number.isFinite(wycena) ? mies(daty[0], wycena) : null,
    najnowszaMies: daty.length && Number.isFinite(wycena) ? mies(daty[daty.length - 1], wycena) : null,
    powMin: pows[0] || 0, powMax: pows[pows.length - 1] || 0,
  };
}

const RZ_CELE = [
  [/kredyt|hipotek|zabezpiecz|bank/i, 'wartość rynkowa', 'zabezpieczenie wierzytelności', 'Bank może wymagać także wartości dla wymuszonej sprzedaży albo wartości bankowo-hipotecznej — sprawdź zlecenie.'],
  [/spad|darowizn|podat|skarb/i, 'wartość rynkowa', 'cele podatkowe albo spadkowe', 'Ustal datę, na którą określa się stan nieruchomości (często dzień otwarcia spadku albo darowizny), i datę poziomu cen.'],
  [/podzia[łl]|rozw[oó]d|maj[ąa]tk/i, 'wartość rynkowa', 'podział majątku', 'Przy współwłasności ustal, czy wyceniasz całość, czy udział.'],
  [/komorni|egzekuc|licytac|s[ąa]d/i, 'wartość rynkowa', 'postępowanie sądowe albo egzekucyjne', 'Operat dla sądu lub komornika: stan nieruchomości i dostęp do niej opisz szczególnie dokładnie.'],
  [/wyw[łl]aszcz|odszkodowan/i, 'wartość rynkowa albo odtworzeniowa', 'odszkodowanie', 'Rodzaj wartości i daty wynikają z przepisów o odszkodowaniach — sprawdź podstawę prawną.'],
  [/sprzeda|kupn|cen/i, 'wartość rynkowa', 'ustalenie ceny w obrocie', ''],
];

const RZ_METODY = {
  local_kcm: { nazwa: 'podejście porównawcze, metoda korygowania ceny średniej', min: 12, jedn: 'zł/m² powierzchni użytkowej' },
  developed_pairs: { nazwa: 'podejście porównawcze, metoda porównywania parami', min: 3, jedn: 'zł/m²' },
  income: { nazwa: 'podejście dochodowe', min: 0, jedn: '' }, cost: { nazwa: 'podejście kosztowe', min: 0, jedn: '' },
};

function rzDecyzja(id, tytul, pytanie){ return { id, tytul, pytanie, dane: [], mozliwosci: [], rozstrzygniecie: '', pewnosc: 'srednia', zmieni: [], zastrzezenia: [], brakDanych: false }; }

/** Glowna funkcja: operat + wynik obliczen → lancuch decyzji. */
function rzMysl(project, calc, opcje){
  const p = project || {}, c = calc || {}, o = opcje || {};
  const w = p.property || {}, modul = p.module?.code || 'local_kcm';
  const decyzje = [];

  // 1. cel → rodzaj wartosci
  {
    const d = rzDecyzja('cel', 'Cel wyceny i rodzaj wartości', 'Po co powstaje operat i jaką wartość trzeba określić?');
    const cel = String(p.valuation?.purpose || '').trim();
    if (!cel){ d.brakDanych = true; d.pewnosc = 'niska'; d.rozstrzygniecie = 'Nie wskazano celu wyceny — bez niego nie da się uzasadnić rodzaju wartości.'; d.zastrzezenia.push('Wpisz cel wyceny.'); }
    else {
      d.dane.push(`Cel wpisany w operacie: „${cel}".`);
      const trafienie = RZ_CELE.find(x => x[0].test(cel));
      if (trafienie){
        d.rozstrzygniecie = `Dla celu „${trafienie[2]}" właściwa jest ${trafienie[1]}.`;
        d.mozliwosci.push({ co: trafienie[1], wybrana: true, dlaczego: 'wynika z celu wyceny' });
        if (!/odtworzeniow/.test(trafienie[1])) d.mozliwosci.push({ co: 'wartość odtworzeniowa', wybrana: false, dlaczego: 'stosowana dla nieruchomości, które nie są przedmiotem obrotu rynkowego' });
        if (trafienie[3]) d.zastrzezenia.push(trafienie[3]);
        d.pewnosc = 'wysoka';
      } else { d.rozstrzygniecie = 'Przyjęto wartość rynkową jako podstawowy rodzaj wartości.'; d.zastrzezenia.push('Celu nie rozpoznałem jednoznacznie — potwierdź rodzaj wartości.'); }
      d.zmieni.push('Inny cel wyceny albo wyraźne wymaganie zleceniodawcy co do rodzaju wartości.');
    }
    decyzje.push(d);
  }

  // 2. przedmiot i stan prawny
  {
    const d = rzDecyzja('przedmiot', 'Przedmiot wyceny i stan prawny', 'Co dokładnie jest wyceniane i czy stan prawny pozwala to wycenić bez zastrzeżeń?');
    const adres = [w.city, [w.street, w.buildingNo].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    if (adres) d.dane.push(`Położenie: ${adres}${w.localNo ? `, lokal ${w.localNo}` : ''}.`);
    if (rzL(w.usableArea) > 0) d.dane.push(`Powierzchnia użytkowa: ${rzPl(w.usableArea, 2)} m².`);
    if (rzL(w.landArea) > 0) d.dane.push(`Powierzchnia działki: ${rzPl(w.landArea, 0)} m².`);
    if (String(w.rightType || '').trim()) d.dane.push(`Prawo: ${w.rightType}.`);
    const kw = String(p.legal?.kwLocal || '').trim();
    if (kw) d.dane.push(`Księga wieczysta: ${kw}.`);
    const stan = o.stanPrawny;
    if (!adres || !(rzL(w.usableArea) > 0 || rzL(w.landArea) > 0)){ d.brakDanych = true; d.pewnosc = 'niska'; d.zastrzezenia.push('Brak adresu albo powierzchni — przedmiot wyceny nie jest określony.'); }
    if (!kw) d.zastrzezenia.push('Brak numeru księgi wieczystej — podaj, na czym oparto stan prawny.');
    if (stan && stan.stan !== 'brak'){
      d.dane.push(`Ocena wpisów księgi: ${stan.tekst}`);
      for (const u of (stan.uwagi || [])) d.zastrzezenia.push(u.tekst);
      d.rozstrzygniecie = stan.stan === 'nieokreslony' ? 'Stan prawny jest opisany, ale program nie potrafi go ocenić — rozstrzygnij, czy są obciążenia.' : stan.stan === 'czysty' ? 'Stan prawny nie wymaga zastrzeżeń w wycenie.' : stan.stan === 'ryzyko' ? 'Stan prawny zawiera wpisy istotne dla wyceny — trzeba je opisać i ocenić ich wpływ na wartość.' : 'Są obciążenia do opisania; wartość rynkową określa się co do zasady bez pomniejszania o hipoteki.';
      d.pewnosc = stan.stan === 'czysty' ? 'wysoka' : stan.stan === 'nieokreslony' ? 'niska' : 'srednia';
      if (stan.stan === 'nieokreslony') d.zastrzezenia.push('Napisz wprost, czy działy III i IV zawierają wpisy.');
    } else { d.rozstrzygniecie = d.rozstrzygniecie || 'Stanu prawnego nie oceniono na podstawie treści księgi.'; d.zastrzezenia.push('Nie mam treści działów III i IV — oceny obciążeń nie ma.'); d.pewnosc = 'niska'; }
    const pk = rzL(w.kwArea);
    if (pk > 0 && rzL(w.usableArea) > 0 && Math.abs(pk - rzL(w.usableArea)) > 0.5) d.zastrzezenia.push(`Powierzchnia przyjęta (${rzPl(w.usableArea, 2)} m²) różni się od księgowej (${rzPl(pk, 2)} m²) — wskaż, którą przyjmujesz i dlaczego.`);
    d.zmieni.push('Ujawnienie się obciążeń, roszczeń albo rozbieżności powierzchni.');
    decyzje.push(d);
  }

  // 3. rynek
  const st = rzStatystyka(p.market?.transactions, p.valuation?.valuationDate);
  {
    const d = rzDecyzja('rynek', 'Rynek i zbiór transakcji', 'Czy zbiór transakcji opisuje rynek, na którym leży nieruchomość, i czy jest wystarczający?');
    if (!st.n){ d.brakDanych = true; d.pewnosc = 'niska'; d.rozstrzygniecie = 'Nie ma transakcji z ceną — rynku nie da się scharakteryzować.'; d.zastrzezenia.push('Dodaj transakcje nieruchomości podobnych.'); }
    else {
      d.dane.push(`Transakcji z ceną: ${st.n}${st.wszystkich > st.n ? ` (z ${st.wszystkich} wierszy)` : ''}.`);
      d.dane.push(`Ceny jednostkowe: od ${rzPl(st.min)} do ${rzPl(st.max)} zł/m², średnia ${rzPl(st.srednia)}, mediana ${rzPl(st.mediana)} zł/m².`);
      d.dane.push(`Zmienność (odchylenie / średnia): ${rzPl(st.zmiennosc * 100, 1)}%. Stosunek ceny najwyższej do najniższej: ${rzPl(st.rozpietosc, 2)}.`);
      if (st.okresMies) d.dane.push(`Okres badania: ${st.okresMies} ${rzOdmien(st.okresMies, 'miesiąc', 'miesiące', 'miesięcy')}${st.najstarszaMies != null ? `; najstarsza transakcja ${st.najstarszaMies} mies. przed datą wyceny` : ''}.`);
      if (st.powMin && st.powMax) d.dane.push(`Powierzchnie w zbiorze: ${rzPl(st.powMin, 1)}–${rzPl(st.powMax, 1)} m².`);
      const pow = rzL(w.usableArea);
      if (pow > 0 && st.powMin && (pow < st.powMin * 0.8 || pow > st.powMax * 1.2)) d.zastrzezenia.push(`Powierzchnia wycenianej nieruchomości (${rzPl(pow, 1)} m²) leży poza zakresem zbioru — podobieństwo pod względem powierzchni jest słabe.`);
      if (st.odstajace.length) d.zastrzezenia.push(`${st.odstajace.length} ${rzOdmien(st.odstajace.length, 'cena odstaje', 'ceny odstają', 'cen odstaje')} od reszty zbioru (wiersz ${st.odstajace.map(x => x.nr).join(', ')}) — sprawdź, czy to transakcje rynkowe i nieruchomości podobne. Program ich nie usuwa.`);
      if (st.zmiennosc > 0.25) d.zastrzezenia.push('Zmienność cen przekracza 25% — zbiór jest niejednorodny; rozważ zawężenie rynku (lokalizacja, standard, wielkość).');
      if (st.rozpietosc > 2) d.zastrzezenia.push('Cena najwyższa jest ponad dwukrotnie wyższa od najniższej — to zwykle znak, że w zbiorze są nieruchomości niepodobne.');
      if (st.najstarszaMies != null && st.najstarszaMies > 24) d.zastrzezenia.push(`Najstarsza transakcja ma ${st.najstarszaMies} miesięcy — przy tak długim okresie trend czasowy trzeba wyznaczyć i uzasadnić.`);
      if (st.najnowszaMies != null && st.najnowszaMies < 0) d.zastrzezenia.push('W zbiorze jest transakcja późniejsza niż data wyceny.');
      const jednorodny = st.zmiennosc <= 0.25 && st.rozpietosc <= 2 && !st.odstajace.length;
      d.rozstrzygniecie = jednorodny ? `Zbiór ${st.n} transakcji jest jednorodny i nadaje się do analizy.` : `Zbiór ${st.n} transakcji wymaga przeglądu przed przyjęciem do obliczeń.`;
      d.pewnosc = jednorodny && st.n >= 10 ? 'wysoka' : jednorodny ? 'srednia' : 'niska';
      d.zmieni.push('Dodanie albo odrzucenie transakcji; zmiana obszaru lub okresu badania rynku.');
    }
    decyzje.push(d);
  }

  // 4. podejscie i metoda
  {
    const d = rzDecyzja('metoda', 'Podejście i metoda', 'Którą metodą da się określić wartość przy tych danych?');
    const m = RZ_METODY[modul] || { nazwa: 'metoda właściwa dla tego rodzaju wyceny', min: 0 };
    d.dane.push(`Rodzaj operatu: ${m.nazwa}.`);
    d.dane.push(`Dostępnych transakcji: ${st.n}.`);
    if (modul === 'local_kcm' || modul === 'developed_pairs'){
      const kcm = RZ_METODY.local_kcm, pary = RZ_METODY.developed_pairs;
      d.mozliwosci.push({ co: kcm.nazwa, wybrana: modul === 'local_kcm', dlaczego: st.n >= kcm.min ? `zbiór ${st.n} transakcji pozwala wyznaczyć cenę średnią i zakres cen` : `metoda wymaga liczniejszego zbioru (przyjmuje się kilkanaście transakcji), a jest ${st.n}` });
      d.mozliwosci.push({ co: pary.nazwa, wybrana: modul === 'developed_pairs', dlaczego: st.n >= pary.min ? 'wystarczą co najmniej trzy nieruchomości podobne o znanych cechach' : `potrzeba co najmniej trzech transakcji, a jest ${st.n}` });
      d.mozliwosci.push({ co: 'podejście dochodowe', wybrana: false, dlaczego: 'właściwe, gdy nieruchomość przynosi dochód i są dane o czynszach; tu podstawą są ceny transakcyjne' });
      if (st.n >= m.min){ d.rozstrzygniecie = `Przyjęto: ${m.nazwa}. Dane o cenach nieruchomości podobnych są dostępne w liczbie wystarczającej dla tej metody.`; d.pewnosc = st.n >= m.min * 1.3 ? 'wysoka' : 'srednia'; }
      else if (modul === 'local_kcm' && st.n >= pary.min){ d.rozstrzygniecie = `Dla metody korygowania ceny średniej zbiór ${st.n} transakcji jest za mały. Rozważ metodę porównywania parami albo poszerz rynek.`; d.pewnosc = 'niska'; d.zastrzezenia.push(`Za mało transakcji dla przyjętej metody (${st.n}, a przyjmuje się co najmniej ${m.min}).`); }
      else { d.rozstrzygniecie = `Przy ${st.n} ${rzOdmien(st.n, 'transakcji', 'transakcjach', 'transakcjach')} żadna metoda porównawcza nie da wiarygodnego wyniku.`; d.pewnosc = 'niska'; d.brakDanych = true; d.zastrzezenia.push('Uzupełnij zbiór transakcji albo zmień podejście.'); }
    } else { d.rozstrzygniecie = `Przyjęto: ${m.nazwa}.`; d.zastrzezenia.push('Dla tego rodzaju operatu wybór metody uzasadnij ręcznie — program nie ocenia tu alternatyw.'); }
    d.zmieni.push('Zmiana liczby transakcji, charakteru nieruchomości (dochodowa) albo wymagań zleceniodawcy.');
    decyzje.push(d);
  }

  // 5. cechy i wagi
  const cechy = Array.isArray(p.market?.features) ? p.market.features : [];
  {
    const d = rzDecyzja('cechy', 'Cechy rynkowe, wagi i oceny', 'Które cechy różnicują ceny na tym rynku i jak oceniono wycenianą nieruchomość?');
    const suma = cechy.reduce((s, f) => s + rzL(f.weight), 0);
    if (!cechy.length || !(suma > 0)){ d.brakDanych = true; d.pewnosc = 'niska'; d.rozstrzygniecie = 'Nie ustalono cech z wagami — bez nich nie ma wyniku.'; }
    else {
      const posort = cechy.slice().sort((a, b) => rzL(b.weight) - rzL(a.weight));
      d.dane.push(`Cech: ${cechy.length}; suma wag ${rzPl(suma * 100, 0)}%.`);
      d.dane.push(`Najważniejsze: ${posort.slice(0, 3).map(f => `${f.name} (${rzPl(rzL(f.weight) * 100, 0)}%)`).join(', ')}.`);
      const oceny = cechy.map(f => String(f.rating || '').toLowerCase());
      const przec = oceny.filter(x => /przeci[ęe]tn/.test(x)).length;
      d.dane.push(`Oceny wycenianej nieruchomości: ${cechy.map(f => `${f.name} — ${String(f.rating || 'brak').toLowerCase()}`).join('; ')}.`);
      if (Math.abs(suma - 1) > 0.005) d.zastrzezenia.push(`Suma wag wynosi ${rzPl(suma * 100, 1)}%, a musi 100%.`);
      if (o.auto && o.auto['market.features']) d.zastrzezenia.push('Zestaw cech i wag przyjął program jako sugerowany dla tego rodzaju nieruchomości — potwierdź go analizą swojego rynku.');
      if (przec === cechy.length) d.zastrzezenia.push('Wszystkie oceny są „przeciętne" — to stan wyjściowy, nie wynik oględzin. Dopóki go nie zmienisz, wynik równa się cenie środkowej rynku.');
      if (!String(p.market?.weightJustification || '').trim()) d.zastrzezenia.push('Brak uzasadnienia wag.');
      const bezNoty = cechy.filter(f => !/przeci[ęe]tn/i.test(String(f.rating || '')) && !String(f.ratingNote || '').trim());
      if (bezNoty.length) d.zastrzezenia.push(`Oceny bez uzasadnienia: ${bezNoty.map(f => f.name).join(', ')}.`);
      d.rozstrzygniecie = przec === cechy.length ? 'Cechy i wagi są ustalone, ale oceny nie odzwierciedlają jeszcze tej nieruchomości.' : `Cechy, wagi i oceny są ustalone; ${cechy.length - przec} z ${cechy.length} ocen odbiega od przeciętnej.`;
      d.pewnosc = d.zastrzezenia.length ? (przec === cechy.length ? 'niska' : 'srednia') : 'wysoka';
      d.zmieni.push('Oględziny nieruchomości; analiza, które cechy faktycznie różnicują ceny w zbiorze.');
    }
    decyzje.push(d);
  }

  // 6. wynik
  {
    const d = rzDecyzja('wynik', 'Wynik i jego wiarygodność', 'Czy otrzymana wartość mieści się w tym, co pokazuje rynek?');
    const wartosc = rzL(c.valueRounded), jedn = rzL(c.unitAfterRound), pow = rzL(w.usableArea) || rzL(w.landArea);
    if (!(wartosc > 0)){ d.brakDanych = true; d.pewnosc = 'niska'; d.rozstrzygniecie = 'Nie ma wyniku — brakuje transakcji, powierzchni albo wag.'; }
    else {
      const j = jedn > 0 ? jedn : (pow > 0 ? wartosc / pow : 0);
      d.dane.push(`Wartość: ${rzPl(wartosc)} zł${j > 0 ? `, czyli ${rzPl(j)} zł/m²` : ''}.`);
      let wZakresie = true;
      if (st.n && j > 0){
        d.dane.push(`Zakres cen w zbiorze: ${rzPl(st.min)}–${rzPl(st.max)} zł/m², mediana ${rzPl(st.mediana)} zł/m².`);
        const odMed = (j - st.mediana) / st.mediana;
        d.dane.push(`Cena jednostkowa wyniku jest ${Math.abs(odMed) < 0.005 ? 'równa medianie' : `${odMed > 0 ? 'wyższa' : 'niższa'} od mediany o ${rzPl(Math.abs(odMed) * 100, 1)}%`}.`);
        if (j < st.min * 0.999 || j > st.max * 1.001){ wZakresie = false; d.zastrzezenia.push('Cena jednostkowa wyniku leży POZA zakresem cen ze zbioru — w podejściu porównawczym to błąd albo sygnał złych wag lub ocen.'); }
        const polozenie = st.max > st.min ? (j - st.min) / (st.max - st.min) : 0.5;
        const lepsze = cechy.filter(f => /dobr|korzystn|wysok/i.test(String(f.rating || '')) && !/przeci[ęe]tn|s[łl]ab|niekorzystn|nisk/i.test(String(f.rating || ''))).length;
        const gorsze = cechy.filter(f => /s[łl]ab|niekorzystn|nisk|z[łl]/i.test(String(f.rating || ''))).length;
        if (cechy.length && polozenie > 0.7 && gorsze > lepsze) d.zastrzezenia.push('Wynik leży w górnej części zakresu cen, a przeważają oceny niekorzystne — sprawdź spójność ocen z wynikiem.');
        if (cechy.length && polozenie < 0.3 && lepsze > gorsze) d.zastrzezenia.push('Wynik leży w dolnej części zakresu cen, a przeważają oceny korzystne — sprawdź spójność ocen z wynikiem.');
      }
      const oferta = rzL(w.askingPrice);
      if (oferta > 0){
        const r = (wartosc - oferta) / oferta;
        d.dane.push(`Cena ofertowa: ${rzPl(oferta)} zł; wartość jest ${r >= 0 ? 'wyższa' : 'niższa'} o ${rzPl(Math.abs(r) * 100, 1)}%.`);
        if (r > 0.05) d.zastrzezenia.push('Wartość przewyższa cenę ofertową — to rzadkie; ceny ofertowe są zwykle wyższe od transakcyjnych. Sprawdź oceny i zbiór.');
        else if (r < -0.25) d.zastrzezenia.push('Wartość jest o ponad 25% niższa od ceny ofertowej — skomentuj to w operacie.');
      }
      const zaokr = rzL(p.valuation?.roundTo);
      if (zaokr > 0 && wartosc % zaokr !== 0) d.zastrzezenia.push('Wartość nie jest zaokrąglona zgodnie z ustawieniem.');
      d.rozstrzygniecie = !wZakresie ? 'Wynik nie mieści się w zakresie cen rynkowych — nie nadaje się do podpisu.' : d.zastrzezenia.length ? 'Wynik mieści się w zakresie cen, ale wymaga komentarza.' : 'Wynik mieści się w zakresie cen i jest spójny z danymi.';
      d.pewnosc = !wZakresie ? 'niska' : d.zastrzezenia.length ? 'srednia' : 'wysoka';
      d.zmieni.push('Zmiana ocen cech, wag albo składu zbioru transakcji.');
    }
    decyzje.push(d);
  }

  // Krytyk: sprzecznosci miedzy decyzjami.
  const krytyka = [];
  const D = id => decyzje.find(x => x.id === id);
  if (D('rynek').pewnosc === 'niska' && D('wynik').pewnosc !== 'niska' && !D('wynik').brakDanych) krytyka.push('Wynik wygląda dobrze, ale opiera się na zbiorze, który sam budzi wątpliwości — wiarygodność wyniku nie może być wyższa niż wiarygodność rynku.');
  if (D('metoda').pewnosc === 'niska' && !D('wynik').brakDanych) krytyka.push('Jest wynik, choć metoda nie ma wystarczającej podstawy w danych — w obecnym kształcie operat nie obroni się przed weryfikacją.');
  if (D('cechy').zastrzezenia.some(z => /stan wyjściowy/.test(z)) && !D('wynik').brakDanych) krytyka.push('Wartość została policzona przy ocenach wyjściowych. To jest cena typowej nieruchomości z tego rynku, a nie wycena tej konkretnej.');
  if (D('przedmiot').pewnosc === 'niska' && !D('wynik').brakDanych) krytyka.push('Wartość jest policzona, a stan prawny nie został oceniony — operat nie może pominąć tej części.');
  const braki = decyzje.filter(x => x.brakDanych).length, niskie = decyzje.filter(x => x.pewnosc === 'niska').length;
  const ocena = braki ? 'niepelny' : niskie ? 'slaby' : decyzje.some(x => x.pewnosc === 'srednia') ? 'do-uzasadnienia' : 'mocny';
  return {
    decyzje, krytyka, statystyka: st,
    podsumowanie: {
      ocena, braki, niskie, zastrzezen: decyzje.reduce((s, x) => s + x.zastrzezenia.length, 0) + krytyka.length,
      tekst: ocena === 'mocny' ? 'Tok rozumowania jest spójny: każda decyzja ma oparcie w danych.' : ocena === 'do-uzasadnienia' ? 'Tok rozumowania trzyma się danych, ale część decyzji wymaga Twojego uzasadnienia.' : ocena === 'slaby' ? 'Część decyzji ma słabe oparcie w danych — operat w tym kształcie jest podatny na zarzuty.' : 'Łańcuch decyzji jest przerwany: brakuje danych do co najmniej jednego kroku.',
    },
  };
}

/**
 * Teksty uzasadnien zlozone z decyzji. Kazde zdanie opiera sie na liczbie
 * z operatu. Trafiaja WYLACZNIE do pustych rubryk i sa oznaczane jako wpisane
 * przez program – rzeczoznawca je czyta i poprawia.
 */
function rzUzasadnienia(wynik, project){
  const D = id => (wynik?.decyzje || []).find(x => x.id === id) || rzDecyzja(id, '', '');
  const st = wynik?.statystyka || { n: 0 };
  const teksty = {};
  const metoda = D('metoda');
  if (st.n && !metoda.brakDanych && metoda.pewnosc !== 'niska'){
    const wybrana = metoda.mozliwosci.find(m => m.wybrana), odrzucone = metoda.mozliwosci.filter(m => !m.wybrana);
    if (wybrana) teksty['valuation.approachDescription'] = `Wartość określono w podejściu porównawczym. Przyjęto: ${wybrana.co}, ponieważ ${wybrana.dlaczego}. Rozważono także: ${odrzucone.map(m => `${m.co} — ${m.dlaczego}`).join('; ')}.`;
  }
  if (st.n >= 3){
    teksty['market.marketDescription'] = `Analizą objęto ${st.n} ${rzOdmien(st.n, 'transakcję', 'transakcje', 'transakcji')} nieruchomości podobnych${st.okresMies ? ` z okresu ${st.okresMies} ${rzOdmien(st.okresMies, 'miesiąca', 'miesięcy', 'miesięcy')}` : ''}. `
      + `Ceny jednostkowe mieszczą się w przedziale od ${rzPl(st.min)} do ${rzPl(st.max)} zł/m², przy średniej ${rzPl(st.srednia)} zł/m² i medianie ${rzPl(st.mediana)} zł/m². `
      + `Współczynnik zmienności wynosi ${rzPl(st.zmiennosc * 100, 1)}%, co oznacza zbiór ${st.zmiennosc <= 0.15 ? 'jednorodny' : st.zmiennosc <= 0.25 ? 'umiarkowanie zróżnicowany' : 'silnie zróżnicowany'}.`
      + (st.powMin && st.powMax ? ` Powierzchnie nieruchomości w zbiorze wynoszą od ${rzPl(st.powMin, 1)} do ${rzPl(st.powMax, 1)} m².` : '');
  }
  const wyn = D('wynik');
  if (!wyn.brakDanych && wyn.dane.length >= 2 && wyn.pewnosc !== 'niska') teksty['narratives.result'] = `${wyn.dane.join(' ')} ${wyn.rozstrzygniecie}`;
  void project;
  return teksty;
}

/** Krotki tekst dla modelu albo do raportu. */
function rzStreszczenie(wynik){
  return (wynik?.decyzje || []).map((d, i) => `${i + 1}. ${d.tytul}: ${d.rozstrzygniecie}${d.zastrzezenia.length ? ` Zastrzeżenia: ${d.zastrzezenia.join(' ')}` : ''}`).join('\n')
    + ((wynik?.krytyka || []).length ? `\nKrytyka: ${wynik.krytyka.join(' ')}` : '');
}

const API_ROZUM = { mysl: rzMysl, statystyka: rzStatystyka, uzasadnienia: rzUzasadnienia, streszczenie: rzStreszczenie, METODY: RZ_METODY, kwantyl: rzKwantyl };
if (typeof window !== 'undefined') window.OperoRozumowanie = API_ROZUM;
if (typeof module !== 'undefined' && module.exports) module.exports = API_ROZUM;
