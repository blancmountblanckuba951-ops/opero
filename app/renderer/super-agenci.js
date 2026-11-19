/* OPERO 3.5 — super-agenci (Claude + wyszukiwarka internetowa).
 *
 * Agent Prawny, Agent Planistyczny i „Zapytaj zespół” pracują na Claude przez
 * Mózg OPERO z włączoną wyszukiwarką: sprawdzają aktualne przepisy (ISAP, Dz.U.),
 * uchwały planistyczne (BIP gmin, dzienniki urzędowe), orzecznictwo i dane
 * publiczne. Każda odpowiedź niesie źródła (adresy stron).
 *
 * Moduł jest czysty: buduje polecenia, czyta odpowiedzi i wpisuje wyniki do
 * projektu wyłącznie w puste pola. Wywołanie modelu robi studio.js.
 */
'use strict';

const SA_SYSTEM_ZESPOL = 'Jesteś zespołem ekspertów programu OPERO, który wspiera rzeczoznawcę majątkowego w Polsce. '
  + 'W zespole są: prawnik nieruchomości (księgi wieczyste, hipoteki, służebności, współwłasność, użytkowanie wieczyste, spółdzielcze prawa, egzekucja, spadki, podział majątku), '
  + 'planista (MPZP, studium, plan ogólny, decyzje WZ, ustawa o planowaniu i zagospodarowaniu przestrzennym), '
  + 'metodyk wyceny (ustawa o gospodarce nieruchomościami, rozporządzenie w sprawie wyceny nieruchomości i sporządzania operatu szacunkowego, standardy zawodowe i noty interpretacyjne PFSRM), '
  + 'analityk rynku, technik budowlany (Prawo budowlane, stan techniczny, zużycie) oraz doradca podatkowy (PCC, opłaty, podatek od nieruchomości). '
  + 'Odpowiadasz po polsku, konkretnie i rzeczowo. Przy przepisach, uchwałach, stawkach i orzeczeniach korzystasz z wyszukiwarki i podajesz aktualne źródło '
  + '(publikator Dz.U. z rokiem i pozycją, artykuł, adres strony ISAP/BIP/orzeczenia). Nie wymyślasz faktów: gdy czegoś nie da się ustalić, piszesz, co i gdzie trzeba sprawdzić.';

function saTekst(v, n){ return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 4000); }

/** Krótki opis operatu dla agentów — bez danych osobowych (nazwisk właścicieli nie wysyłamy). */
function saKontekst(project){
  const p = project || {}, pr = p.property || {}, eg = p.egib || {}, lg = p.legal || {}, pl = p.planning || {}, v = p.valuation || {};
  const adres = [pr.street && `ul. ${pr.street} ${pr.buildingNo || ''}${pr.localNo ? '/' + pr.localNo : ''}`.trim(), pr.postalCode, pr.city].filter(Boolean).join(', ');
  const linie = [
    adres && `Adres: ${adres}`,
    (eg.plotId || eg.plotNo) && `Działka: ${eg.plotId || eg.plotNo}${eg.district ? `, obręb ${eg.district}` : ''}${eg.unit ? `, ${eg.unit}` : ''}`,
    lg.kwLocal && `Księga wieczysta: ${lg.kwLocal}`,
    (pr.usableArea || pr.landArea) && `Powierzchnia: ${pr.usableArea ? `${pr.usableArea} m² użytkowej` : ''}${pr.landArea ? ` działka ${pr.landArea} m²` : ''}`,
    lg.ownershipType && `Prawo: ${lg.ownershipType}`,
    v.purpose && `Cel wyceny: ${saTekst(v.purpose, 300)}`,
    (pl.zoneSymbol || pl.designation) && `Plan: ${[pl.zoneSymbol, pl.designation, pl.planName].filter(Boolean).join(' — ')}`,
  ].filter(Boolean);
  return linie.join('\n');
}

/** Usuwa z treści księgi imiona i nazwiska osób fizycznych (dział II) i numery PESEL. */
function saBezOsob(tekst){
  return String(tekst || '')
    .replace(/\b\d{11}\b/g, '[PESEL]')
    .replace(/(Imię\s*(pierwsze|drugie)?|Nazwisko|Imię ojca|Imię matki)\s*[:\-–]?\s*[^\n]+/gi, '$1: [ukryte]');
}

function saJson(tekst){
  const t = String(tekst || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a){ try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}

/* ------------------------------------------------------------ Agent Prawny */

function saPolecenieprawnik(project, trescKsiegi){
  return 'Jako prawnik nieruchomości oceń stan prawny nieruchomości do operatu szacunkowego.\n'
    + 'Dane operatu:\n' + (saKontekst(project) || '(brak)') + '\n\n'
    + 'Treść księgi wieczystej (nazwiska osób ukryte):\n"""\n' + saBezOsob(trescKsiegi).slice(0, 60000) + '\n"""\n\n'
    + 'Zadania: (1) ustal rodzaj prawa i udziały; (2) przeanalizuj działy III i IV — ograniczone prawa rzeczowe, roszczenia, ostrzeżenia, '
    + 'hipoteki, wzmianki — i ich wpływ na wartość rynkową oraz sposób ujęcia w wycenie (wycena przy założeniu stanu wolnego od obciążeń albo z uwzględnieniem); '
    + '(3) wskaż ryzyka i rzeczy do wyjaśnienia; (4) podaj podstawy prawne w AKTUALNYCH tekstach jednolitych — sprawdź je wyszukiwarką.\n'
    + 'Odpowiedz WYŁĄCZNIE JSON:\n'
    + '{"stanPrawny":"4–8 zdań do rozdziału Stan prawny operatu, bez nazwisk","rodzajPrawa":"","ryzyka":[{"opis":"","waga":"wysoka|srednia|niska","wplywNaWartosc":""}],'
    + '"podstawy":[{"akt":"pełna nazwa aktu","publikator":"Dz.U. RRRR poz. N","przepis":"art. …"}],"doWyjasnienia":["…"]}';
}

function saPrawnik(tekst){
  const j = saJson(tekst);
  if (!j || typeof j !== 'object') return { ok: false };
  const ryzyka = (Array.isArray(j.ryzyka) ? j.ryzyka : []).map(r => ({ opis: saTekst(r?.opis, 500), waga: ['wysoka', 'srednia', 'niska'].includes(r?.waga) ? r.waga : 'srednia', wplyw: saTekst(r?.wplywNaWartosc, 300) })).filter(r => r.opis);
  const podstawy = (Array.isArray(j.podstawy) ? j.podstawy : []).map(p => ({ akt: saTekst(p?.akt, 300), publikator: saTekst(p?.publikator, 80), przepis: saTekst(p?.przepis, 80) })).filter(p => p.akt);
  return { ok: !!saTekst(j.stanPrawny), stanPrawny: saTekst(j.stanPrawny, 3000), rodzajPrawa: saTekst(j.rodzajPrawa, 120), ryzyka, podstawy,
    doWyjasnienia: (Array.isArray(j.doWyjasnienia) ? j.doWyjasnienia : []).map(x => saTekst(x, 300)).filter(Boolean).slice(0, 10) };
}

/** Wynik prawnika -> projekt. Notatka do operatu tylko do pustej rubryki; pełna analiza zawsze w legal.analizaPrawna. */
function saPrawnikDoProjektu(project, w, zrodla, kiedy){
  const p = project || {}; p.legal = p.legal || {};
  p.legal.analizaPrawna = { ...w, zrodla: (zrodla || []).slice(0, 15), kiedy: kiedy || new Date().toISOString(), autor: 'Agent Prawny (Claude + wyszukiwarka)' };
  const wpisane = [];
  if (w.stanPrawny && !String(p.legal.kwNotes || '').trim()){ p.legal.kwNotes = w.stanPrawny; wpisane.push('uwagi o stanie prawnym'); }
  if (w.rodzajPrawa && !String(p.legal.ownershipType || '').trim()){ p.legal.ownershipType = w.rodzajPrawa; wpisane.push(`rodzaj prawa: ${w.rodzajPrawa}`); }
  return wpisane;
}

/* ------------------------------------------------------- Agent Planistyczny */

function saPolecenieplanista(project){
  return 'Jako planista ustal przeznaczenie terenu dla nieruchomości. Użyj wyszukiwarki: BIP gminy/miasta, miejskie serwisy planistyczne (np. „mpzp”, „plany miejscowe”), '
    + 'Dziennik Urzędowy Województwa, rejestry urbanistyczne, Geoportal krajowy.\n'
    + 'Dane:\n' + (saKontekst(project) || '(brak)') + '\n\n'
    + 'Ustal: czy obszar działki jest objęty miejscowym planem zagospodarowania przestrzennego; jeśli tak — nazwa planu, numer i data uchwały, publikator, '
    + 'symbol terenu dla TEJ działki (tylko gdy da się go jednoznacznie ustalić z rysunku/opisu — inaczej zostaw puste) i przeznaczenie; jeśli planu nie ma — '
    + 'co mówi studium / plan ogólny i czy potrzebna jest decyzja o warunkach zabudowy. Oceń pewność ustaleń.\n'
    + 'Odpowiedz WYŁĄCZNIE JSON: {"jestPlan":true|false,"planName":"","resolution":"Uchwała nr … z dnia …","planNumber":"","publikator":"Dz. Urz. Woj. … RRRR poz. N",'
    + '"zoneSymbol":"","designation":"przeznaczenie terenu","parameters":"najważniejsze wskaźniki zabudowy","bezPlanu":"studium/plan ogólny/WZ — jeśli brak planu",'
    + '"sourceUrl":"adres strony z uchwałą lub mapą","pewnosc":"wysoka|srednia|niska","doSprawdzenia":"co potwierdzić wypisem i wyrysem"}';
}

function saPlanista(tekst){
  const j = saJson(tekst);
  if (!j || typeof j !== 'object') return { ok: false };
  const w = { ok: true, jestPlan: j.jestPlan === true, pewnosc: ['wysoka', 'srednia', 'niska'].includes(j.pewnosc) ? j.pewnosc : 'niska' };
  for (const k of ['planName', 'resolution', 'planNumber', 'publikator', 'zoneSymbol', 'designation', 'parameters', 'bezPlanu', 'doSprawdzenia']) w[k] = saTekst(j[k], 1500);
  w.sourceUrl = /^https?:\/\//.test(String(j.sourceUrl || '')) ? String(j.sourceUrl).slice(0, 500) : '';
  w.ok = !!(w.planName || w.designation || w.bezPlanu || w.resolution);
  return w;
}

function saPlanistaDoProjektu(project, w, zrodla, kiedy){
  const p = project || {}; p.planning = p.planning || {};
  const wpisane = [];
  const wstaw = (k, v, et) => { if (!v || String(p.planning[k] || '').trim()) return; p.planning[k] = v; wpisane.push(`${et}: ${v}`); };
  p.planning.analizaInternet = { ...w, zrodla: (zrodla || []).slice(0, 15), kiedy: kiedy || new Date().toISOString(), autor: 'Agent Planistyczny (Claude + wyszukiwarka)' };
  if (w.pewnosc === 'niska') return wpisane;  // niepewne ustalenia zostają tylko w analizie
  if (w.jestPlan){
    wstaw('planName', w.planName, 'Plan'); wstaw('resolution', [w.resolution, w.publikator].filter(Boolean).join(', '), 'Uchwała');
    wstaw('planNumber', w.planNumber, 'Numer planu'); wstaw('designation', w.designation, 'Przeznaczenie');
    wstaw('parameters', w.parameters, 'Parametry zabudowy');
    if (w.pewnosc === 'wysoka') wstaw('zoneSymbol', w.zoneSymbol, 'Symbol terenu');
  } else wstaw('description', w.bezPlanu, 'Brak planu');
  wstaw('sourceUrl', w.sourceUrl, 'Źródło');
  return wpisane;
}

/* -------------------------------------------------------- Zapytaj zespół */

function saPolecenieZespol(pytanie, project){
  const k = saKontekst(project);
  return (k ? `Kontekst — operat, nad którym pracuję:\n${k}\n\n` : '') + `Pytanie rzeczoznawcy:\n${saTekst(pytanie, 8000)}\n\n`
    + 'Odpowiedz jako właściwy ekspert z zespołu (napisz na początku, kto odpowiada). Krótko, konkretnie, z podstawą prawną i źródłami tam, gdzie to ma znaczenie.';
}

/** Prosty, bezpieczny Markdown -> HTML do okienka odpowiedzi (pogrubienia, listy, akapity, nagłówki). */
function saMarkdown(md){
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inline = t => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const out = []; let lista = null;
  for (const l of String(md || '').replace(/\r/g, '').split('\n')){
    const m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(l);
    if (m){ if (!lista){ lista = []; } lista.push(`<li>${inline(m[1])}</li>`); continue; }
    if (lista){ out.push(`<ul>${lista.join('')}</ul>`); lista = null; }
    const h = /^#{1,4}\s+(.*)$/.exec(l);
    if (h) out.push(`<h4>${inline(h[1])}</h4>`);
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  if (lista) out.push(`<ul>${lista.join('')}</ul>`);
  return out.join('');
}

const API_SUPER = {
  SYSTEM: SA_SYSTEM_ZESPOL, kontekst: saKontekst, bezOsob: saBezOsob, json: saJson,
  polecenieprawnik: saPolecenieprawnik, prawnik: saPrawnik, prawnikDoProjektu: saPrawnikDoProjektu,
  polecenieplanista: saPolecenieplanista, planista: saPlanista, planistaDoProjektu: saPlanistaDoProjektu,
  polecenieZespol: saPolecenieZespol, markdown: saMarkdown,
};
if (typeof window !== 'undefined') window.OperoSuper = API_SUPER;
if (typeof module !== 'undefined' && module.exports) module.exports = API_SUPER;
