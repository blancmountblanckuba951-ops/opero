/* OPERO — zespol agentow
 *
 * Kazdy etap operatu ma swojego agenta: jeden czyta ksiege, drugi zbiera dane
 * o miejscu, trzeci szuka transakcji… Ten modul NIE wykonuje ich pracy – trzyma
 * opis zespolu, przebieg (kto, kiedy, co zrobil, czego mu zabraklo) i sklada
 * z niego raport koncowy. Sama praca agentow to funkcje programu wolane przez
 * app.js; dzieki temu przebieg da sie sprawdzic testem bez okna.
 */
'use strict';

const AGENCI_ZESPOL = [
  { id: 'zlecenie', nazwa: 'Agent Zlecenia', krotko: 'Zlecenie', znak: '✎', etap: 'project',
    rola: 'Czyta Twój opis, ustala rodzaj operatu i wpisuje dane podstawowe.',
    kroki: ['czytam opis', 'ustalam rodzaj operatu', 'wpisuję dane podstawowe'] },
  { id: 'oglednik', nazwa: 'Agent Oględzin', krotko: 'Oględziny', znak: '◐', etap: 'local',
    rola: 'Ogląda zdjęcia i rzut: standard wykończenia, stan techniczny, elewacja, instalacje, wyposażenie.',
    kroki: ['porządkuję zdjęcia i rzut', 'oglądam wnętrza i budynek', 'oceniam standard i stan'] },
  { id: 'kw', nazwa: 'Agent Ksiąg Wieczystych', krotko: 'Księga', znak: '⚖', etap: 'legal',
    rola: 'Czyta księgę, sprawdza numer, wpisuje działy i ocenia stan prawny.',
    kroki: ['czytam treść księgi', 'sprawdzam cyfrę kontrolną', 'wpisuję działy', 'oceniam stan prawny'] },
  { id: 'prawnik', nazwa: 'Agent Prawny', krotko: 'Prawo', znak: '⚜', etap: 'legal',
    rola: 'Prawnik nieruchomości na Claude z wyszukiwarką: analizuje działy III i IV, ocenia ryzyka i ich wpływ na wartość, sprawdza aktualne przepisy (ISAP, Dz.U.) i pisze stan prawny z podstawą prawną.',
    kroki: ['czytam księgę jak prawnik', 'sprawdzam aktualne przepisy w internecie', 'oceniam ryzyka', 'piszę stan prawny'] },
  { id: 'lokalizacja', nazwa: 'Agent Lokalizacji i Planowania', krotko: 'Miejsce', znak: '⌖', etap: 'egib',
    rola: 'Ewidencja gruntów, mapa, otoczenie z odległościami, plan miejscowy albo warunki zabudowy.',
    kroki: ['ustalam działkę w ewidencji', 'mierzę otoczenie', 'sprawdzam plan miejscowy', 'przygotowuję kod mapy'] },
  { id: 'geoportal', nazwa: 'Agent Geoportalu', krotko: 'Geoportal', znak: '◎', etap: 'egib',
    rola: 'Otwiera działkę na geoportalu: ortofotomapa, ewidencja, plan miejscowy, uzbrojenie, legendy i opis szczegółowy — dołącza je jako załączniki i wpisuje dane.',
    kroki: ['znajduję działkę', 'pobieram mapy i legendy', 'czytam opis szczegółowy', 'dołączam załączniki'] },
  { id: 'planista', nazwa: 'Agent Planistyczny', krotko: 'Plan', znak: '▦', etap: 'egib',
    rola: 'Planista na Claude z wyszukiwarką: szuka w BIP gminy i dziennikach urzędowych planu miejscowego, studium albo decyzji WZ dla działki i ustala przeznaczenie terenu z uchwałą i źródłem.',
    kroki: ['szukam planu miejscowego w internecie', 'czytam uchwałę i przeznaczenie', 'oceniam pewność', 'wpisuję plan do operatu'] },
  { id: 'rynek', nazwa: 'Agent Rynku', krotko: 'Rynek', znak: '◈', etap: 'market',
    rola: 'Szuka transakcji za wszelką cenę: rejestr cen (wszystkie strony wyników), Twoja baza; rundami poszerza obszar, okres i metraż, aż zbierze tyle, ile wymaga metoda.',
    kroki: ['szukam w rejestrze cen', 'poszerzam obszar i okres', 'odrzucam niepodobne', 'wstawiam najlepsze'] },
  { id: 'analityk', nazwa: 'Agent Analityk Rynku', krotko: 'Analiza', znak: '◔', etap: 'market',
    rola: 'Liczy statystykę zbioru: zakres, średnią, medianę, zmienność; wskazuje ceny odstające.',
    kroki: ['liczę statystykę cen', 'szukam cen odstających', 'oceniam jednorodność zbioru'] },
  { id: 'obliczenia', nazwa: 'Agent Obliczeń', krotko: 'Rachunek', znak: '∑', etap: 'features',
    rola: 'Ustala cechy i wagi, liczy wartość i sprawdza rachunek.',
    kroki: ['dobieram cechy rynkowe', 'ustalam wagi', 'liczę wartość', 'sprawdzam rachunek'] },
  { id: 'metodyk', nazwa: 'Agent Metodyk', krotko: 'Metoda', znak: '⚙', etap: 'project',
    rola: 'Prowadzi tok rozumowania: cel → rodzaj wartości → podejście i metoda → wynik. Rozważa alternatywy.',
    kroki: ['ustalam rodzaj wartości', 'rozważam podejścia i metody', 'sprawdzam wynik na tle rynku', 'piszę uzasadnienia'] },
  { id: 'redaktor', nazwa: 'Agent Redaktor', krotko: 'Tekst', znak: '✦', etap: 'result',
    rola: 'Pisze opisy z zebranych danych, wzorując się na Twoich operatach.',
    kroki: ['dobieram wzorce', 'piszę opisy', 'pilnuję, żeby każda liczba miała źródło'] },
  { id: 'formalny', nazwa: 'Agent Formalny', krotko: 'Formalia', znak: '§', etap: 'clauses',
    rola: 'Daty, podstawy prawne, źródła, załączniki i klauzule — to, o co pyta weryfikator na początku.',
    kroki: ['sprawdzam daty', 'sprawdzam podstawy i źródła', 'sprawdzam załączniki i klauzule'] },
  { id: 'kontroler', nazwa: 'Agent Kontroler', krotko: 'Kontrola', znak: '↻', etap: 'result',
    rola: 'Przechodzi wszystko jeszcze raz i powtarza to, co się nie udało.',
    kroki: ['sprawdzam luki', 'powtarzam nieudane kroki', 'porównuję wynik między przebiegami'] },
  { id: 'krytyk', nazwa: 'Agent Krytyk', krotko: 'Krytyka', znak: '⚑', etap: 'result',
    rola: 'Szuka sprzeczności między decyzjami — tego, do czego przyczepiłby się przeciwnik w sporze.',
    kroki: ['przechodzę łańcuch decyzji', 'szukam sprzeczności', 'oceniam, czy operat się obroni'] },
  { id: 'rzeczoznawca', nazwa: 'Rzeczoznawca-weryfikator', krotko: 'Weryfikacja', znak: '◆', etap: 'result',
    rola: 'Czyta gotowy operat punkt po punkcie i zgłasza poprawki do Twojej akceptacji.',
    kroki: ['audyt formalny', 'zapis liczb i tabele', 'wagi i oceny', 'wygląd operatu', 'lista poprawek'] },
  { id: 'korektor', nazwa: 'Agent Korektor', krotko: 'Korekta', znak: '✓', etap: 'result',
    rola: 'Sam wprowadza poprawki wskazane przez weryfikatora — bez nowych liczb i faktów; każdą da się cofnąć.',
    kroki: ['czytam uwagi weryfikatora', 'wprowadzam poprawki', 'sprawdzam, czy nic nie zepsułem'] },
  { id: 'kierownik', nazwa: 'Kierownik zespołu', krotko: 'Nadzór', znak: '♛', etap: 'result',
    rola: 'Prowadzi narady nadzoru: wskazuje agentów, którzy źle wykonali zadanie, każe im poprawić, weryfikuje ponownie i wydaje werdykt.',
    kroki: ['przeglądam pracę zespołu', 'zlecam poprawki', 'ponowna weryfikacja', 'werdykt'] },
];

const AGENCI_STANY = ['czeka', 'pracuje', 'gotowe', 'uwaga', 'blad', 'pominiety'];

function agTeraz(){ return new Date().toISOString(); }

/** Nowy, pusty przebieg. `dokladnosc`: ile razy kontroler ma wracac (1–3). */
function agNowy(opcje){
  const o = opcje || {};
  const agenci = {};
  for (const a of AGENCI_ZESPOL) agenci[a.id] = { stan: 'czeka', krok: '', start: '', koniec: '', proby: 0, zrobione: [], braki: [] };
  return {
    id: String(o.id || Date.now().toString(36)), start: String(o.teraz || agTeraz()), koniec: '', stan: 'pracuje',
    dokladnosc: Math.min(3, Math.max(1, Number(o.dokladnosc) || 2)), przebieg: 1,
    mozg: o.mozg === 'chmura' ? 'chmura' : 'lokalny', agenci, dziennik: [], poprawki: [],
  };
}

function agAgent(id){ return AGENCI_ZESPOL.find(a => a.id === id) || null; }

function agZapisz(p, id, tekst, rodzaj, teraz){
  if (!p || !tekst) return p;
  p.dziennik.push({ kiedy: String(teraz || agTeraz()), agent: id, tekst: String(tekst), rodzaj: rodzaj || 'info' });
  if (p.dziennik.length > 400) p.dziennik.splice(0, p.dziennik.length - 400);
  return p;
}

function agZacznij(p, id, teraz){
  const a = p?.agenci?.[id]; if (!a) return p;
  a.stan = 'pracuje'; a.start = a.start || String(teraz || agTeraz()); a.koniec = ''; a.proby += 1;
  agZapisz(p, id, a.proby > 1 ? `Wracam do pracy (podejście ${a.proby}).` : 'Zaczynam.', 'start', teraz);
  return p;
}

function agKrok(p, id, tekst, teraz){
  const a = p?.agenci?.[id]; if (!a) return p;
  a.krok = String(tekst || '');
  agZapisz(p, id, a.krok, 'krok', teraz);
  return p;
}

/**
 * Zakonczenie pracy agenta. `zrobione` i `braki` to listy zdan po polsku.
 * Stan wynika z tresci, nie z deklaracji: sa braki → „uwaga”, byl blad → „blad”.
 */
function agZakoncz(p, id, wynik, teraz){
  const a = p?.agenci?.[id]; if (!a) return p;
  const w = wynik || {};
  const dodaj = (lista, nowe) => { for (const x of (nowe || [])){ const t = String(x || '').trim(); if (t && !lista.includes(t)) lista.push(t); } };
  // Przy powtorce braki z poprzedniego podejscia przestaja obowiazywac –
  // licza sie te, ktore zostaly po ostatnim.
  a.braki = []; dodaj(a.zrobione, w.zrobione); dodaj(a.braki, w.braki);
  a.koniec = String(teraz || agTeraz()); a.krok = '';
  a.powtorz = !!w.powtorz; a.blad = String(w.blad || '');
  a.stan = w.pominiety ? 'pominiety' : a.blad ? 'blad' : a.braki.length ? 'uwaga' : 'gotowe';
  agZapisz(p, id, a.stan === 'gotowe' ? 'Skończyłem bez uwag.' : a.stan === 'pominiety' ? 'Nie miałem nic do zrobienia.' : a.stan === 'blad' ? `Przerwałem: ${a.blad}` : `Skończyłem, ${a.braki.length} ${agOdmien(a.braki.length, 'rzecz', 'rzeczy', 'rzeczy')} do uzupełnienia.`, a.stan, teraz);
  return p;
}

function agOdmien(n, jeden, dwa, piec){
  const k = Math.abs(n) % 100, j = k % 10;
  if (n === 1) return jeden;
  if (j >= 2 && j <= 4 && !(k >= 12 && k <= 14)) return dwa;
  return piec;
}

/** Postep 0–100: agent skonczony liczy sie caly, pracujacy – w polowie. */
function agPostep(p){
  const lista = Object.values(p?.agenci || {});
  if (!lista.length) return 0;
  const suma = lista.reduce((s, a) => s + (['gotowe', 'uwaga', 'blad', 'pominiety'].includes(a.stan) ? 1 : a.stan === 'pracuje' ? 0.5 : 0), 0);
  return Math.round(suma / lista.length * 100);
}

/** Ktorych agentow kontroler powinien uruchomic jeszcze raz. */
function agDoPowtorki(p){
  return AGENCI_ZESPOL.filter(a => !['kontroler', 'rzeczoznawca', 'zlecenie', 'oglednik', 'analityk', 'metodyk', 'formalny', 'krytyk', 'korektor', 'kierownik'].includes(a.id))
    .filter(a => { const s = p?.agenci?.[a.id]; return s && (s.stan === 'blad' || s.powtorz) && s.proby < 1 + (p.dokladnosc || 1); })
    .map(a => a.id);
}

function agCzasTekst(ms){
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const g = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sek = s % 60;
  if (g) return `${g} godz. ${m} min`;
  if (m) return `${m} min ${sek} s`;
  return `${sek} s`;
}

function agCzas(p, teraz){
  const od = Date.parse(p?.start || ''), doo = Date.parse(p?.koniec || teraz || agTeraz());
  return Number.isFinite(od) && Number.isFinite(doo) ? Math.max(0, doo - od) : 0;
}

/** Raport koncowy: co zrobilem / czego zabraklo – po agentach. */
function agRaport(p, teraz){
  const zrobione = [], braki = [];
  for (const a of AGENCI_ZESPOL){
    const s = p?.agenci?.[a.id]; if (!s) continue;
    if (s.zrobione.length) zrobione.push({ agent: a.id, nazwa: a.nazwa, etap: a.etap, pozycje: s.zrobione.slice() });
    const b = s.braki.slice(); if (s.blad) b.unshift(`Praca przerwana: ${s.blad}`);
    if (b.length) braki.push({ agent: a.id, nazwa: a.nazwa, etap: a.etap, pozycje: b });
  }
  const ile = l => l.reduce((x, g) => x + g.pozycje.length, 0);
  return {
    zrobione, braki, ileZrobione: ile(zrobione), ileBrakow: ile(braki),
    czas: agCzas(p, teraz), czasTekst: agCzasTekst(agCzas(p, teraz)), przebiegi: p?.przebieg || 1,
    poprawki: (p?.poprawki || []).length, mozg: p?.mozg || 'lokalny',
    gotowy: p?.stan === 'gotowe',
  };
}

/**
 * Ocena stanu prawnego z tresci ksiegi. Agent nie wydaje opinii prawnej –
 * wskazuje wpisy, ktore rzeczoznawca MUSI opisac w operacie, i mowi, skad
 * to wie. Kazda pozycja niesie cytat ze slowem, ktore ja wywolalo.
 */
function agOcenStanPrawny(legal){
  const l = legal || {};
  const s3 = String(l.sectionIII || ''), s4 = String(l.sectionIV || '');
  const uwagi = [], dobrze = [];
  const pusty = t => !t.trim() || /^\s*(brak\s+wpis[óo]w|wolny\s+od\s+wpis[óo]w|bez\s+wpis[óo]w|-+)\s*\.?\s*$/i.test(t);
  const cytat = (t, re) => { const m = re.exec(t); if (!m) return ''; const od = Math.max(0, m.index - 40); return t.slice(od, m.index + m[0].length + 60).replace(/\s+/g, ' ').trim(); };
  const WZORCE_III = [
    ['służebność', /s[łl]u[żz]ebno[śs][ćc]\p{L}*/iu, 'Dział III: służebność — opisz jej treść i wpływ na wartość.'],
    ['roszczenie', /roszczeni\p{L}*/iu, 'Dział III: roszczenie — sprawdź, czy nie dotyczy przeniesienia własności.'],
    ['ostrzeżenie', /ostrze[żz]eni\p{L}*/iu, 'Dział III: ostrzeżenie — stan prawny może być niezgodny z rzeczywistym.'],
    ['egzekucja', /egzekucj\p{L}*|komornik\p{L}*|zaj[ęe]ci\p{L}*/iu, 'Dział III: wpis o egzekucji — to okoliczność istotna dla celu wyceny.'],
    ['dożywocie / użytkowanie', /do[żz]ywoci\p{L}*|u[żz]ytkowani\p{L}*(?!\s+wieczyst)/iu, 'Dział III: prawo osobiste (dożywocie / użytkowanie) — obciąża nieruchomość.'],
    ['najem / dzierżawa', /najm\p{L}*|najem|dzier[żz]aw\p{L}*/iu, 'Dział III: ujawniony najem albo dzierżawa.'],
    ['prawo pierwokupu', /pierwokup\p{L}*|odkup\p{L}*/iu, 'Dział III: prawo pierwokupu albo odkupu.'],
  ];
  if (pusty(s3)){ if (s3.trim()) dobrze.push('Dział III bez wpisów — brak ujawnionych praw, roszczeń i ograniczeń.'); }
  else for (const [nazwa, re, tekst] of WZORCE_III){ if (re.test(s3)) uwagi.push({ dzial: 'III', co: nazwa, tekst, cytat: cytat(s3, re) }); }
  if (pusty(s4)){ if (s4.trim()) dobrze.push('Dział IV bez wpisów — brak hipotek.'); }
  else if (/hipotek\p{L}*/iu.test(s4)){
    const ile = (s4.match(/hipotek\p{L}*\s+(umown|przymusow|kaucyjn|łączn|laczn)\p{L}*/giu) || []).length || 1;
    const przym = /przymusow\p{L}*/iu.test(s4);
    uwagi.push({ dzial: 'IV', co: przym ? 'hipoteka przymusowa' : 'hipoteka', cytat: cytat(s4, /hipotek\p{L}*/iu),
      tekst: przym ? 'Dział IV: hipoteka przymusowa — wskaż wierzyciela i kwotę; to sygnał zadłużenia.' : `Dział IV: ${ile} ${agOdmien(ile, 'hipoteka', 'hipoteki', 'hipotek')} — podaj kwotę i wierzyciela; hipoteka nie obniża wartości rynkowej, ale musi być opisana.` });
  }
  // Sam numer ksiegi to nie tresc: bez dzialow III i IV niczego nie oceniamy.
  if (!s3.trim() && !s4.trim()) return { stan: 'brak', uwagi: [], dobrze: [], tekst: 'Nie mam treści księgi — stanu prawnego nie oceniam.' };
  if (/udzia[łl]\p{L}*/iu.test(String(l.ownershipType || '')) || /\d+\s*\/\s*\d+/.test(String(l.ownershipType || ''))) uwagi.push({ dzial: 'II', co: 'współwłasność', tekst: 'Dział II: współwłasność w udziałach — ustal, czy wyceniasz całość, czy udział.', cytat: String(l.ownershipType || '') });
  // „Czysty” tylko wtedy, gdy OBA dzialy wprost mowia o braku wpisow. Tekst,
  // w ktorym niczego nie rozpoznano, to nie dowod czystej ksiegi.
  const jawnieCzysty = s3.trim() && s4.trim() && pusty(s3) && pusty(s4);
  const stan = uwagi.some(u => ['egzekucja', 'ostrzeżenie', 'hipoteka przymusowa', 'roszczenie'].includes(u.co)) ? 'ryzyko' : uwagi.length ? 'obciazenia' : jawnieCzysty ? 'czysty' : 'nieokreslony';
  const tekst = stan === 'nieokreslony' ? 'W treści działów III i IV nie rozpoznałem ani wpisów, ani jednoznacznego stwierdzenia ich braku — oceń stan prawny samodzielnie.' : stan === 'czysty' ? 'Księga bez obciążeń wymagających opisu.' : stan === 'ryzyko' ? 'Są wpisy istotne dla wyceny — przeczytaj je przed podpisem.' : 'Są obciążenia do opisania w operacie.';
  return { stan, uwagi, dobrze, tekst };
}


/* ---- 3.1: zlecenie, autor, rundy szukania transakcji ------------------- */

/** Ile transakcji potrzeba do metody (KCM wg podrecznika: ok. 12 i wiecej; porownywanie parami: min. 3). */
function agCelTransakcji(modul){
  return /pair|par/i.test(String(modul || '')) ? 6 : 12;
}

/**
 * Rundy poszerzania rynku: od najwezszego (najlepsze porownanie) do najszerszego.
 * Kazda kolejna runda poszerza obszar, okres i tolerancje powierzchni.
 */
const AGENCI_RUNDY_RYNKU = [
  { promien: 1000, okres: 24, odchylka: 20, opis: 'najbliższe otoczenie' },
  { promien: 2000, okres: 36, odchylka: 30, opis: 'dzielnica' },
  { promien: 4000, okres: 60, odchylka: 40, opis: 'część miasta' },
  { promien: 8000, okres: 120, odchylka: 50, opis: 'rynek lokalny (miasto / gmina)' },
];
function agRundyRynku(start){
  const s = start || {};
  // Runda nie moze byc wezsza niz kryteria, ktore rzeczoznawca ustawil sam.
  return AGENCI_RUNDY_RYNKU.map(r => ({ ...r,
    promien: Math.max(r.promien, Number(s.promien) || 0),
    okres: Math.max(r.okres, Number(s.okres) || 0),
    odchylka: Math.max(r.odchylka, Number(s.odchylka) || 0) }))
    .filter((r, i, a) => i === 0 || r.promien !== a[i - 1].promien || r.okres !== a[i - 1].okres || r.odchylka !== a[i - 1].odchylka);
}

/** Opis definicji rynku do operatu na podstawie rundy, na ktorej zakonczono szukanie. */
function agOpisRynku(runda, n, miasto){
  if (!runda) return '';
  const l = runda.okres / 12, lata = Number.isInteger(l) ? `${l} ${agOdmien(l, 'rok', 'lata', 'lat')}` : `${runda.okres} mies.`;
  return `Rynek lokalny zdefiniowano jako ${runda.opis}${miasto ? ` (${miasto})` : ''}: transakcje nieruchomości podobnych w promieniu do ${runda.promien} m od przedmiotu wyceny, `
    + `zawarte w okresie ${runda.okres} miesięcy przed datą wyceny (${lata}), o powierzchni różniącej się nie więcej niż o ${runda.odchylka}%. `
    + `Do analizy przyjęto ${n} transakcji z Rejestru Cen Nieruchomości i własnej bazy rzeczoznawcy.`;
}

/** Dane zlecenia (jedyne, co rzeczoznawca podaje sam) -> klient, cel, podstawa formalna. */
function agZlecenieCzyste(z){
  const x = z && typeof z === 'object' ? z : {};
  const t = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n || 200);
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(x.data || '')) ? x.data : '';
  return { kto: t(x.kto), nr: t(x.nr, 80), data, cel: t(x.cel, 200) };
}
function agDataPl(iso){ const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? `${m[3]}.${m[2]}.${m[1]}` : ''; }
function agPodstawaFormalna(z){
  const x = agZlecenieCzyste(z);
  if (!x.kto) return '';
  const dok = x.nr ? ` (zlecenie / umowa nr ${x.nr}${x.data ? ` z dnia ${agDataPl(x.data)}` : ''})` : (x.data ? ` z dnia ${agDataPl(x.data)}` : '');
  return `Operat szacunkowy sporządzono na zlecenie: ${x.kto}${dok}.${x.cel ? ` Cel wyceny: ${x.cel}.` : ''}`;
}
function agZlecenieDoProjektu(project, z){
  const x = agZlecenieCzyste(z), wpisane = [];
  if (!project || !x.kto && !x.cel && !x.nr) return { wpisane };
  project.client = project.client || {};
  if (x.kto && project.client.name !== x.kto){ project.client.name = x.kto; wpisane.push(`Zleceniodawca: ${x.kto}`); }
  if (x.nr){ project.client.contractNo = x.nr; wpisane.push(`Nr zlecenia: ${x.nr}`); }
  if (x.data){ project.client.contractDate = x.data; wpisane.push(`Data zlecenia: ${agDataPl(x.data)}`); }
  if (x.cel){ project.client.purpose = x.cel; project.valuation = project.valuation || {}; project.valuation.purpose = x.cel; wpisane.push(`Cel wyceny: ${x.cel}`); }
  const pf = agPodstawaFormalna(x), jest = String(project.formalBasis || '').trim();
  if (pf && (!jest || /^(Operat szacunkowy sporządzono na zlecenie|Wycena wykonana na zlecenie)/.test(jest))){ project.formalBasis = pf; wpisane.push('Podstawa formalna'); }
  return { wpisane };
}

/** Autor z profilu w Ustawieniach: wpisuje tylko puste pola. */
function agAutorZProfilu(project, profil){
  const p = profil || {}, a = (project.author = project.author || {}), wpisane = [];
  for (const [kl, et] of [['name', 'Autor'], ['licenseNo', 'Nr uprawnień'], ['company', 'Firma'], ['phone', 'Telefon'], ['email', 'E-mail'], ['address', 'Adres']]){
    if (!String(a[kl] || '').trim() && String(p[kl] || '').trim()){ a[kl] = String(p[kl]).trim(); wpisane.push(et); }
  }
  return { wpisane, brak: !String(a.name || '').trim() };
}

const API_AGENCI = {
  ZESPOL: AGENCI_ZESPOL, STANY: AGENCI_STANY, agent: agAgent, nowy: agNowy, zapisz: agZapisz, zacznij: agZacznij, krok: agKrok,
  zakoncz: agZakoncz, postep: agPostep, doPowtorki: agDoPowtorki, raport: agRaport, czas: agCzas, czasTekst: agCzasTekst,
  odmien: agOdmien, ocenStanPrawny: agOcenStanPrawny,
  celTransakcji: agCelTransakcji, RUNDY_RYNKU: AGENCI_RUNDY_RYNKU, rundyRynku: agRundyRynku, opisRynku: agOpisRynku,
  zlecenieCzyste: agZlecenieCzyste, podstawaFormalna: agPodstawaFormalna, zlecenieDoProjektu: agZlecenieDoProjektu, autorZProfilu: agAutorZProfilu,
};
if (typeof window !== 'undefined') window.OperoAgenci = API_AGENCI;
if (typeof module !== 'undefined' && module.exports) module.exports = API_AGENCI;
