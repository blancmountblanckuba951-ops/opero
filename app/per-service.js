'use strict';
/**
 * OPERO 1.18.0 — PER: asystent rzeczoznawcy działający w całości na tym komputerze.
 *
 * Model językowy niesie instalator (patrz silnik-per.js), więc nie ma tu żadnej
 * usługi zewnętrznej, żadnego klucza API i żadnego wyjścia do sieci. To jedyna
 * pomoc tekstowa w programie — przejście do ChatGPT zostało usunięte w 1.18.0.
 *
 * PER nie pisze operatu za rzeczoznawcę. Umie trzy rzeczy: odpowiedzieć z Biblii
 * OPERO, zajrzeć narzędziami w dane tego operatu i zredagować tekst, który
 * rzeczoznawca sam napisał. Decyzja zawodowa zostaje po stronie człowieka.
 */
const path = require('node:path');
const { app } = require('electron');
const silnik = require('./silnik-per');

const NAZWA = 'PER';
const LIMIT_RUND = 6;
const CZAS_ODPOWIEDZI_MS = 240000;

const PROMPT = [
  `Jesteś ${NAZWA} — asystentem w programie OPERO dla rzeczoznawców majątkowych w Polsce.`,
  'Odpowiadasz po polsku, zwięźle i konkretnie, jak doświadczony kolega po fachu, a nie jak instrukcja obsługi.',
  'Masz narzędzia: Biblię OPERO (metodyka i podstawy prawne), dane bieżącego operatu, wynik obliczeń, listę braków, historię, terminy i klientów.',
  'Zanim odpowiesz na pytanie o metodę, przepis albo źródło danych, użyj narzędzia biblia_szukaj. Nie odpowiadaj z pamięci.',
  'Zanim odpowiesz o tym operacie, użyj operat_dane, operat_wynik albo operat_braki. Nie zgaduj, co użytkownik wpisał.',
  'Gdy pytanie dotyczy jakości, poprawności albo gotowości operatu, zacznij od narzędzia operat_kontrola i odpowiadaj z jego wyniku — program widzi dokładnie to samo na ekranie.',
  'Wymieniając co poprawić, podawaj najpierw błędy, potem uwagi, i przy każdej pozycji krok OPERO, w którym się ją naprawia. Nie powtarzaj całej listy, gdy pozycji jest dużo — wskaż trzy najważniejsze i powiedz, ile zostaje.',
  'Nigdy nie podawaj wartości, ceny za metr, stawki ani stopy, jeśli nie pochodzi z wyniku narzędzia. Gdy danych brakuje, powiedz wprost, czego brakuje i w którym kroku OPERO to się uzupełnia.',
  'Podstawę prawną podawaj tylko wtedy, gdy zwróciło ją narzędzie, i zawsze z oznaczeniem reguły albo źródła. Nie cytuj przepisów z pamięci — stan prawny mógł się zmienić.',
  'Pilnuj czterech dat operatu: daty określenia wartości, daty stanu nieruchomości, daty oględzin i daty sporządzenia. Gdy rozmowa dotyczy terminu, zapytaj, o którą datę chodzi.',
  'Nie podejmuj za rzeczoznawcę decyzji zawodowej. Możesz uporządkować przesłanki i pokazać, co za czym przemawia.',
  'Jeżeli czegoś nie wiesz, napisz, że nie wiesz.',
  'Biblia OPERO leży na tym komputerze, w folderze programu — pytaj ją zawsze, także bez internetu.',
  'Odpowiadaj krótko: najpierw jedno zdanie odpowiedzi, potem — jeśli trzeba — wzór albo kroki, na końcu oznaczenia reguł i źródła.',
  'Gdy pytanie dotyczy liczby, której w operacie jeszcze nie ma, powiedz, w którym kroku OPERO się ją wpisuje, i zaproponuj następny ruch.',
  'Nie zaczynaj od powitań ani od powtarzania pytania.',
].join(' ');

/** Redakcja tekstu operatu: osobny, znacznie ostrzejszy zestaw zasad. */
const PROMPT_REDAKCJA = [
  'Jesteś redaktorem tekstu operatu szacunkowego sporządzanego przez polskiego rzeczoznawcę majątkowego.',
  'Pracujesz WYŁĄCZNIE na tekście roboczym, który dostajesz od rzeczoznawcy.',
  'Nie wolno Ci dopisać ani jednego faktu, liczby, daty, nazwy, numeru, przepisu, powierzchni ani parametru, którego nie ma w tekście roboczym.',
  'Jeżeli zdanie wymaga danych, których w tekście nie ma, wstaw dokładnie [DO UZUPEŁNIENIA] i nic nie zmyślaj.',
  'Styl: język urzędowo-zawodowy, bezosobowy lub w formie dokonanej („ustalono”, „przyjęto”, „stwierdzono”), bez marketingu, bez ozdobników, bez emocji.',
  'Rozróżniaj poziom pewności: „ustalono” i „stwierdzono” dla faktów ze źródeł, „przyjęto” i „założono” dla decyzji rzeczoznawcy, „oszacowano” dla wyników obliczeń.',
  'Zachowaj wszystkie liczby, jednostki, oznaczenia i nazwy własne dokładnie w takiej postaci, w jakiej je dostałeś.',
  'Nie wykonuj obliczeń, nie zmieniaj metody, nie podejmuj decyzji zawodowej za rzeczoznawcę.',
  'Zwróć wyłącznie gotowy tekst do wklejenia do operatu — bez komentarza, bez nagłówka, bez cudzysłowów wokół całości.',
].join(' ');

/**
 * Pisanie rozdzialu operatu od zera - Express.
 *
 * Rozni sie od redakcji jedna rzecza: model nie ma tekstu roboczego
 * rzeczoznawcy, tylko liste faktow. To znaczy, ze pokusa dopisania „z glowy"
 * jest tu najwieksza, a skutek najgorszy: wymyslona liczba w operacie
 * szacunkowym to podstawa odpowiedzialnosci zawodowej czlowieka, ktory go
 * podpisze. Dlatego zakaz jest powtorzony kilka razy i w rozny sposob -
 * modele jezykowe reaguja na powtorzenie, a jedno zdanie bywa przeoczone.
 *
 * Program i tak sprawdza potem kazda liczbe w napisanym tekscie (modul
 * operat-pisanie), bo polecenia nie da sie wymusic - mozna je tylko napisac
 * dobrze i skontrolowac wynik.
 */
const PROMPT_PISANIE = [
  'Jesteś asystentem polskiego rzeczoznawcy majątkowego i piszesz JEDEN rozdział opisowy operatu szacunkowego.',
  'Dostajesz listę FAKTÓW. To jest cały materiał, jaki masz. Nie masz dostępu do internetu, do innych operatów ani do wiedzy o rynku nieruchomości.',
  'ZAKAZ BEZWZGLĘDNY: nie wolno Ci napisać żadnej liczby, kwoty, powierzchni, daty, procentu ani nazwy własnej, której nie ma na liście faktów.',
  'Nie wykonuj obliczeń. Nie przeliczaj, nie sumuj, nie zaokrąglaj, nie wyprowadzaj wartości z innych wartości. Wszystkie liczby policzył już program.',
  'Nie powołuj się na statystyki, raporty, średnie krajowe, „obserwowane tendencje" ani na własną wiedzę o rynku. Jeżeli czegoś nie ma w faktach, to w tym operacie nie istnieje.',
  'Gdy brakuje danej potrzebnej w zdaniu, napisz wprost, że jej nie ustalono, i wstaw dokładnie [DO UZUPEŁNIENIA]. To jest poprawna odpowiedź.',
  'Styl: polski język urzędowo-zawodowy, bezosobowy i w formie dokonanej („ustalono", „przyjęto", „stwierdzono", „oszacowano"). Bez ozdobników i bez ocen.',
  'Rozróżniaj poziom pewności: „ustalono" i „stwierdzono" dla faktów ze źródeł, „przyjęto" i „założono" dla decyzji rzeczoznawcy, „oszacowano" dla wyników obliczeń.',
  'Nie doradzaj, nie podejmuj decyzji zawodowej i nie oceniaj nieruchomości ani rynku.',
  'Zwróć wyłącznie akapity tekstu do wklejenia do operatu: bez nagłówka, bez numeracji, bez listy punktowanej, bez komentarza o sobie i bez cudzysłowów wokół całości.',
  'Piszesz zwięźle: od dwóch do pięciu akapitów. Rozdział rozdęty powtórzeniami jest trudniejszy do sprawdzenia, a sprawdzić go musi człowiek.',
].join(' ');

const NARZEDZIA = [
  { name:'biblia_szukaj', description:'Pyta Biblię OPERO o metodykę, podstawę prawną, sposób obliczenia albo źródło danych. Zwraca reguły z oznaczeniami i listę źródeł.',
    parameters:{type:'object',properties:{pytanie:{type:'string',description:'Pytanie w języku polskim.'},rodzajWyceny:{type:'string',description:'Kod rodzaju wyceny, np. local_ownership_kcm.'}},required:['pytanie'],additionalProperties:false} },
  { name:'zrodla_danych', description:'Wskazuje rejestry i portale, z których pobiera się konkretny rodzaj danych (RCN, EGiB, MPZP, KW, hydroportal i inne), z adresami i sposobem weryfikacji.',
    parameters:{type:'object',properties:{temat:{type:'string'},kodTematu:{type:'string'}},required:[],additionalProperties:false} },
  { name:'operat_dane', description:'Zwraca dane bieżącego operatu wpisane przez użytkownika: nieruchomość, stan prawny, EGiB, budynek, lokal, parametry rynku. Bez danych osobowych.',
    parameters:{type:'object',properties:{sekcja:{type:'string',description:'Opcjonalnie jedna sekcja: property, legal, egib, building, local, market, valuation.'}},required:[],additionalProperties:false} },
  { name:'operat_wynik', description:'Zwraca wynik obliczeń bieżącego operatu: wartość rynkową, cenę za metr, Cmin/Cmax/ΔC, sumę wag i kompletność.',
    parameters:{type:'object',properties:{},required:[],additionalProperties:false} },
  { name:'operat_kontrola', description:'Zwraca kontrolę jakości bieżącego operatu: co jest zrobione dobrze, co budzi wątpliwość i co trzeba poprawić, z nazwą kroku, w którym się to naprawia. Użyj tego, gdy pytanie dotyczy jakości, poprawności albo gotowości operatu.',
    parameters:{type:'object',properties:{zakres:{type:'string',description:'Opcjonalnie: „doPoprawy”, „uwagi” albo „zrobioneDobrze”.'}},required:[],additionalProperties:false} },
  { name:'operat_braki', description:'Zwraca listę danych krytycznych brakujących do wygenerowania PDF.',
    parameters:{type:'object',properties:{limit:{type:'integer',minimum:1,maximum:60}},required:[],additionalProperties:false} },
  { name:'transakcje', description:'Zwraca transakcje porównawcze zebrane w tym operacie wraz z cechami i cenami skorygowanymi.',
    parameters:{type:'object',properties:{limit:{type:'integer',minimum:1,maximum:40}},required:[],additionalProperties:false} },
  { name:'historia_operatow', description:'Zwraca listę zapisanych operatów z Historii OPERO: adres, rodzaj, data, status, wynik.',
    parameters:{type:'object',properties:{szukaj:{type:'string'},limit:{type:'integer',minimum:1,maximum:30}},required:[],additionalProperties:false} },
  { name:'terminy', description:'Zwraca zaplanowane przypomnienia i terminy.',
    parameters:{type:'object',properties:{limit:{type:'integer',minimum:1,maximum:30}},required:[],additionalProperties:false} },
  { name:'klienci', description:'Zwraca zleceniodawców zapisanych w OPERO. Bez numerów telefonu, e-maili i PESEL.',
    parameters:{type:'object',properties:{szukaj:{type:'string'},limit:{type:'integer',minimum:1,maximum:30}},required:[],additionalProperties:false} },
];

// ---------- magazyn klucza ----------
// Klucz API nie może trafić do settings.json ani do kopii zapasowej, bo te pliki
// użytkownik wysyła mailem. Szyfrujemy mechanizmem systemowym; gdy system go nie
// udostępnia, nie zapisujemy nic — lepiej odmówić niż zostawić klucz jawnym tekstem.

function tnij(v, max = 1500) { return String(v ?? '').trim().slice(0, max); }
function bezDanychOsobowych(v, max = 1500) {
  let t = tnij(v, max);
  t = t.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[e-mail ukryty]');
  t = t.replace(/(?<!\d)(?:\+?48[ .-]?)?(?:\d[ .-]?){9}(?!\d)/g, '[telefon ukryty]');
  t = t.replace(/(?<!\d)\d{11}(?!\d)/g, '[PESEL ukryty]');
  return t.slice(0, max);
}
function bezOgonkow(v) { return String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

function utworz(pomoc) {
  const { requireActiveLicense, rootUserData, readCollection, safeJsonRead, logToFile } = pomoc;
  /* Model w chmurze, jesli rzeczoznawca wlaczyl go w Ustawieniach. Dotyczy
     tylko pisania i redakcji – tam model nie dostaje narzedzi, a polecenie
     jest w calosci zlozone przez program. Rozmowa z PER zostaje lokalna. */
  const chmura = pomoc.chmura || null;
  const wChmurze = () => { try { return !!chmura?.aktywna(); } catch { return false; } };
  async function modelDoPisania(wiadomosci) {
    if (wChmurze()) { const w = await chmura.wywolaj(wiadomosci, { maks: 3000 }); return { content: w.text, zrodlo: 'chmura' }; }
    await dopilnujSilnika();
    const w = await wywolajModel(wiadomosci, false);
    return { content: w.content, zrodlo: 'PER' };
  }
  const biblia = pomoc.biblia || null;

  /* ---------------------------------------------------------------- status */

  async function status() {
    const s = await silnik.status();
    let kb = null;
    try { kb = biblia ? biblia.stan(rootUserData()) : null; } catch {}
    const nazwaModelu = s.model?.nazwa || null;
    let message;
    if (!s.silnik) message = 'W folderze programu nie ma silnika modelu. Zainstaluj OPERO ponownie z pełnego instalatora.';
    else if (!s.model) message = 'W folderze programu nie ma pliku modelu. Zainstaluj OPERO ponownie z pełnego instalatora.';
    else if (!s.serwerDziala) message = `Przygotowuję model ${nazwaModelu} — pierwsze uruchomienie po starcie programu trwa chwilę.`;
    else message = `${NAZWA} myśli na tym komputerze (model ${nazwaModelu}). Treść operatu nie opuszcza tego urządzenia.`;
    return {
      configured: !!s.jest,
      active: !!(s.jest && s.serwerDziala),
      engine: 'LOKALNY',
      model: nazwaModelu,
      message,
      silnik: s,
      biblia: kb,
      // Pola zgodności dla starszych ekranów — PER nie ma już kluczy ani ustawień.
      settings: { engine: 'LOKALNY', model: nazwaModelu },
      key: { present: false, hint: '' },
    };
  }

  /* ------------------------------------------------------------- narzędzia */
  async function wykonajNarzedzie(nazwa, arg, kontekst) {
    const k = kontekst || {};
    if (nazwa === 'biblia_szukaj') {
      const pytanie = tnij(arg?.pytanie, 2000);
      if (pytanie.length < 2) return { error: 'Puste pytanie do Biblii OPERO.' };
      // Najpierw Biblia z dysku — bez internetu, bez czekania na serwer.
      if (biblia) {
        try {
          const l = biblia.szukaj(rootUserData(), {
            pytanie,
            valuationTypeCode: tnij(arg?.rodzajWyceny || k.valuationTypeCode, 80),
            moduleCode: tnij(k.moduleCode, 80),
          });
          if (l && !l.error && (l.reguly?.length || l.zrodla?.length)) return l;
        } catch (e) { logToFile('ERROR', 'biblia lokalna', String(e?.message || e)); }
      }
      // Serwera Biblii nie ma od 1.14.0 — wiedza jedzie w instalatorze. Gdy Biblia
      // nie jest rozpakowana, mowimy to wprost, zamiast udawac brak odpowiedzi.
      return { error: 'Biblia OPERO nie jest rozpakowana w folderze programu. Otworz Ustawienia -> Agrafek i kliknij \u201eWgraj Bibli\u0119 z programu\u201d.' };
    }
    if (nazwa === 'zrodla_danych') {
      if (biblia) {
        try {
          const l = biblia.zrodla(rootUserData(), {
            temat: tnij(arg?.temat, 1000), kodTematu: tnij(arg?.kodTematu, 100),
            valuationTypeCode: tnij(k.valuationTypeCode, 80), moduleCode: tnij(k.moduleCode, 80),
          });
          if (l && !l.error && l.zrodla?.length) return l;
        } catch (e) { logToFile('ERROR', 'biblia lokalna (zrodla)', String(e?.message || e)); }
      }
      return { error: 'Biblia OPERO nie jest rozpakowana w folderze programu.' };
    }
    if (nazwa === 'operat_dane') {
      const o = k.operat || {};
      const sekcja = tnij(arg?.sekcja, 30);
      if (sekcja && o[sekcja] !== undefined) return { [sekcja]: o[sekcja] };
      return o;
    }
    if (nazwa === 'operat_wynik') return k.wynik || { error: 'Brak policzonego wyniku — uzupełnij dane wyceny.' };
    if (nazwa === 'operat_kontrola') {
      const kon = k.kontrola;
      if (!kon) return { error: 'Kontrola operatu nie została jeszcze policzona. Otwórz operat i spróbuj ponownie.' };
      const zakres = tnij(arg?.zakres, 30);
      if (zakres && kon[zakres] !== undefined) return { gotowosc: kon.gotowosc, [zakres]: kon[zakres] };
      return kon;
    }
    if (nazwa === 'operat_braki') {
      const lim = Math.min(60, Math.max(1, Number(arg?.limit) || 30));
      const b = Array.isArray(k.braki) ? k.braki : [];
      return { liczba: b.length, braki: b.slice(0, lim) };
    }
    if (nazwa === 'transakcje') {
      const lim = Math.min(40, Math.max(1, Number(arg?.limit) || 20));
      const t = Array.isArray(k.transakcje) ? k.transakcje : [];
      return { liczba: t.length, transakcje: t.slice(0, lim) };
    }
    if (nazwa === 'historia_operatow') {
      const lim = Math.min(30, Math.max(1, Number(arg?.limit) || 10));
      const szukaj = bezOgonkow(arg?.szukaj);
      const h = safeJsonRead(path.join(rootUserData(), 'history.json'), []) || [];
      const lista = (Array.isArray(h) ? h : []).map(x => ({
        id: x.id, nazwa: tnij(x.name || x.title, 200), rodzaj: x.moduleCode || x.module,
        data: x.savedAt || x.date, status: x.status, wynik: x.value ?? x.result ?? null,
      }));
      return { liczba: lista.length, operaty: lista.filter(x => !szukaj || bezOgonkow(`${x.nazwa} ${x.rodzaj}`).includes(szukaj)).slice(0, lim) };
    }
    if (nazwa === 'terminy') {
      const lim = Math.min(30, Math.max(1, Number(arg?.limit) || 15));
      const r = readCollection(path.join(rootUserData(), 'reminders.json'));
      return { liczba: r.length, terminy: r.slice(0, lim).map(x => ({
        id: x.id, tytul: tnij(x.title, 200), termin: x.dueAt || x.date,
        opis: bezDanychOsobowych(x.note, 500), status: x.status,
      })) };
    }
    if (nazwa === 'klienci') {
      const lim = Math.min(30, Math.max(1, Number(arg?.limit) || 15));
      const szukaj = bezOgonkow(arg?.szukaj);
      const c = readCollection(path.join(rootUserData(), 'clients.json'));
      const lista = c.map(x => ({
        id: x.id, nazwa: tnij(x.name, 200), typ: x.type, nip: x.nip ? '[NIP ukryty]' : null,
        miasto: tnij(x.city, 100), notatka: bezDanychOsobowych(x.note, 600),
      }));
      return { liczba: lista.length, klienci: lista.filter(x => !szukaj || bezOgonkow(`${x.nazwa} ${x.miasto}`).includes(szukaj)).slice(0, lim) };
    }
    return { error: `Niedozwolone narzędzie: ${nazwa}` };
  }

  function narzedziaCzat() {
    return NARZEDZIA.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
  }

  function wiadomoscStartowa(kontekst) {
    const k = kontekst || {};
    const linia = `Ekran: ${tnij(k.screen, 60) || 'nieznany'}. Rodzaj wyceny: ${tnij(k.moduleCode, 60) || 'nieustalony'}.`;
    return `${PROMPT} ${linia}`;
  }

  /* ----------------------------------------------------------- rozmowa */

  /**
   * Jedno wywołanie modelu. Serwer mówi dialektem OpenAI (/v1/chat/completions),
   * więc odpowiedź normalizujemy do postaci { content, tool_calls } niezależnie
   * od tego, jak dany build serwera ją opakuje.
   */
  async function wywolajModel(wiadomosci, zNarzedziami) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), CZAS_ODPOWIEDZI_MS);
    try {
      const r = await fetch(`${silnik.BAZA}/v1/chat/completions`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: c.signal,
        body: JSON.stringify({
          model: 'opero-per',
          messages: wiadomosci,
          temperature: 0.2,
          stream: false,
          ...(zNarzedziami ? { tools: narzedziaCzat(), tool_choice: 'auto' } : {}),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String(d?.error?.message || d?.error || `HTTP ${r.status}`));
      const w = d?.choices?.[0]?.message || {};
      return {
        content: typeof w.content === 'string' ? w.content.trim() : '',
        tool_calls: Array.isArray(w.tool_calls) ? w.tool_calls : [],
      };
    } catch (e) {
      if (e?.name === 'AbortError') throw new Error(`${NAZWA} nie odpowiedział w ciągu ${Math.round(CZAS_ODPOWIEDZI_MS / 1000)} sekund. Zamknij cięższe programy albo zadaj krótsze pytanie.`);
      throw e;
    } finally { clearTimeout(t); }
  }

  async function dopilnujSilnika() {
    const s = await silnik.uruchom(logToFile);
    if (s.ok) return;
    if (s.powod === 'BRAK_SILNIKA' || s.powod === 'BRAK_MODELU') {
      throw new Error('W folderze programu nie ma modelu PER. Zainstaluj OPERO z pełnego instalatora — model jedzie w środku.');
    }
    if (s.powod === 'TIMEOUT') throw new Error('Model jeszcze się wczytuje. Spróbuj ponownie za chwilę.');
    throw new Error(`Nie udało się uruchomić modelu PER${s.blad ? `: ${s.blad}` : '.'}`);
  }

  async function pytajModel(pytanie, historia, kontekst) {
    await dopilnujSilnika();
    const wiadomosci = [{ role: 'system', content: wiadomoscStartowa(kontekst) }, ...historia, { role: 'user', content: pytanie }];
    const slad = [];
    let zNarzedziami = true, ograniczony = false;

    for (let runda = 1; runda <= LIMIT_RUND; runda++) {
      let w;
      try { w = await wywolajModel(wiadomosci, zNarzedziami); }
      catch (e) {
        const tekst = String(e?.message || e);
        if (zNarzedziami && /tool|function|unsupported/i.test(tekst)) { zNarzedziami = false; ograniczony = true; continue; }
        if (/fetch failed|ECONNREFUSED|connect/i.test(tekst)) throw new Error('Model PER przestał odpowiadać. Zamknij i otwórz program — uruchomi go od nowa.');
        throw new Error(`${NAZWA}: ${tekst}`);
      }
      if (!w.tool_calls.length) {
        if (!w.content) throw new Error(`${NAZWA} nie zwrócił odpowiedzi. Spróbuj zadać pytanie inaczej.`);
        const uwaga = ograniczony
          ? '\n\n_Odpowiedź powstała bez zaglądania do Biblii OPERO i do danych operatu — ten model nie obsługuje narzędzi._'
          : '';
        return { text: w.content + uwaga, model: 'PER', toolTrace: slad, rounds: runda, engine: 'LOKALNY' };
      }
      wiadomosci.push({ role: 'assistant', content: w.content || null, tool_calls: w.tool_calls });
      for (const c of w.tool_calls) {
        const nazwa = String(c?.function?.name || '');
        let arg = {};
        try { const s = c?.function?.arguments; arg = typeof s === 'string' ? JSON.parse(s) : (s || {}); } catch { arg = {}; }
        const wynik = await wykonajNarzedzie(nazwa, arg, kontekst);
        slad.push(nazwa);
        wiadomosci.push({ role: 'tool', tool_call_id: String(c?.id || ''), name: nazwa, content: JSON.stringify(wynik).slice(0, 20000) });
      }
    }
    throw new Error(`${NAZWA} przekroczył bezpieczny limit kroków narzędziowych.`);
  }

  async function pytaj(zadanie) {
    requireActiveLicense();
    const pytanie = tnij(zadanie?.question, 6000);
    if (pytanie.length < 2) throw new Error(`Wpisz pytanie do asystenta PER.`);
    const historia = (Array.isArray(zadanie?.history) ? zadanie.history : []).slice(-10)
      .map(m => ({ role: m?.role === 'assistant' ? 'assistant' : 'user', content: tnij(m?.content, 6000) }))
      .filter(m => m.content);
    try { return await pytajModel(pytanie, historia, zadanie?.context || {}); }
    catch (e) { logToFile('ERROR', 'per', String(e?.message || e)); throw e; }
  }

  /* --------------------------------------------------------- redakcja pola */

  /**
   * Redaguje tekst, który rzeczoznawca sam napisał w polu operatu. Model nie
   * dostaje tu żadnych narzędzi ani danych projektu — tylko ten jeden akapit.
   * Dzięki temu nie ma skąd wziąć faktu, którego rzeczoznawca nie podał.
   */
  async function redaguj(zadanie) {
    requireActiveLicense();
    const tekst = tnij(zadanie?.text, 6000);
    const zadanieOpis = tnij(zadanie?.task, 600);
    if (tekst.length < 10) {
      throw new Error('Najpierw napisz w tym polu własny tekst roboczy — choćby w punktach. PER porządkuje Twoje zdania, nie wymyśla treści operatu.');
    }
    const wiadomosci = [
      { role: 'system', content: PROMPT_REDAKCJA },
      { role: 'user', content: `ZADANIE REDAKCYJNE:\n${zadanieOpis || 'Zredaguj poniższy fragment operatu.'}\n\nTEKST ROBOCZY RZECZOZNAWCY:\n${tekst}` },
    ];
    const w = await modelDoPisania(wiadomosci);
    const wynik = String(w.content || '').trim().replace(/^```[a-z]*\n?|\n?```$/g, '').trim();
    if (!wynik) throw new Error('PER nie zwrócił propozycji. Spróbuj jeszcze raz albo skróć tekst roboczy.');
    return { text: wynik, zrodlo: tekst, model: w.zrodlo };
  }

  /**
   * Napisanie jednego rozdzialu operatu z gotowego polecenia.
   *
   * Polecenie sklada renderer (modul operat-pisanie): to on wie, jakie fakty
   * sa dopuszczalne i jak brzmi ten rozdzial. Tutaj pilnujemy tylko tego, zeby
   * model NIE DOSTAL narzedzi - zadnego szukania w Biblii, zadnego czytania
   * danych operatu poza tym, co jest w poleceniu. Narzedzie bylo by furtka,
   * ktora model wykorzysta do dopisania faktu, o ktorym nikt go nie pytal.
   */
  async function napisz(zadanie) {
    requireActiveLicense();
    const polecenie = tnij(zadanie?.prompt, 12000);
    if (polecenie.length < 40) throw new Error('Brak polecenia do napisania rozdziału.');
    const wiadomosci = [
      { role: 'system', content: PROMPT_PISANIE },
      { role: 'user', content: polecenie },
    ];
    const w = await modelDoPisania(wiadomosci);
    const wynik = String(w.content || '').trim().replace(/^```[a-z]*\n?|\n?```$/g, '').trim();
    if (!wynik) throw new Error('PER nie zwrócił tekstu rozdziału. Spróbuj jeszcze raz.');
    return { text: wynik, model: w.zrodlo, rozdzial: tnij(zadanie?.rozdzial, 80) };
  }

  return {
    NAZWA, status, pytaj, redaguj, napisz,
    narzedzia: () => NARZEDZIA.map(t => ({ nazwa: t.name, opis: t.description })),
  };
}

module.exports = { utworz, NAZWA };
