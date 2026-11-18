'use strict';
/**
 * OPERO 1.9.4 — Biblia OPERO w folderze programu.
 *
 * Do 1.9.3 każde pytanie do Biblii szło na serwer: bez internetu Agrafek milkł,
 * a rzeczoznawca ogląda nieruchomość częściej w terenie niż przy biurku. Teraz
 * cała Biblia — reguły z wgranych książek, źródła danych i ścieżki odpowiedzi —
 * schodzi RAZ i leży w folderze danych OPERO. Wyszukiwanie odbywa się na tym
 * komputerze, tak samo jak myślenie modelu.
 *
 * Snapshot waży około 300 kB, czyli mniej niż jedno zdjęcie z oględzin. Nie ma
 * powodu, żeby trzymać go na serwerze i dopytywać o niego przy każdym pytaniu.
 *
 * Ranking jest tu celowo inny niż serwerowy w dwóch miejscach: pytanie „jak to
 * policzyć" premiuje reguły ze WZOREM i odrzuca reguły przypisane do innego
 * rodzaju wyceny. Na serwerze zdarzało się, że na pytanie o lokal mieszkalny
 * wracała reguła z wyceny leśnej — brzmiała mądrze i była nie na temat.
 */
const fs = require('node:fs');
const path = require('node:path');

const PLIK = 'biblia-lokalna.json';
const STOP = new Set('a aby ale albo bo by byl byla bylo byly co czy dla do gdy i ich jak jako jest jesli jezeli juz lub ma mam masz miec mi miedzy na nad nie o od oraz po pod przy sa sie ten ta te tego to w we z za ze ze'.split(/\s+/));
const MAPA_MODULOW = {
  local_kcm: 'local_ownership_kcm', developed_pairs: 'developed_property_pairs',
  income: 'commercial_income_cap', cost: 'building_reproduction_cost',
  expropriation: 'expropriation_general', agri_forest: 'agricultural_pairs',
  fees: 'planning_fee', easement: 'transmission_easement',
};
const TEMATY = [
  ['legal_status', ['kw', 'księga', 'ksiega', 'hipoteka', 'właściciel', 'wlasciciel', 'stan prawny']],
  ['cadastral_geometry', ['egib', 'działka', 'dzialka', 'geometria', 'powierzchnia działki', 'granice']],
  ['transaction_prices', ['rcn', 'transakcj', 'cena transakcyj', 'akt notarial']],
  ['planning_documents', ['mpzp', 'plan miejscowy', 'plan ogólny', 'plan ogolny', 'wz', 'przeznaczen']],
  ['forest_data', ['las', 'leśn', 'lesn', 'drzewostan', 'bonitacj']],
  ['mineral_deposits', ['złoże', 'zloze', 'kopalin', 'midas']],
  ['heritage_registry', ['zabyt', 'konserwator', 'nid']],
  ['flood_risk', ['powód', 'powod', 'zalew', 'hydroportal']],
  ['environmental_protection', ['natura 2000', 'gdoś', 'gdos', 'ochron środow']],
  ['waste_environment', ['odpad', 'składowisk', 'skladowisk', 'bdo', 'rekultywacj']],
  ['building_permits', ['pozwolenie na budowę', 'pozwolenie na budowe', 'rwdz', 'gunb']],
  ['market_context_commercial', ['biur', 'retail', 'handlow', 'magazyn', 'logist', 'czynsz', 'pustostan', 'yield', 'stopa kapitalizacji']],
  ['office_market', ['wault', 'biur', 'office']],
  ['retail_market', ['footfall', 'retail', 'witryn', 'czynsz obrot']],
  ['industrial_market', ['magazyn', 'logist', 'industrial', 'hub']],
  ['legal_valuation_reg', ['rozporządzenie', 'rozporzadzenie', '§', 'paragraf', 'metoda']],
  ['legal_ugn', ['ugn', 'gospodarce nieruchomościami', 'gospodarce nieruchomosciami', 'wywłaszcz', 'wywlaszcz']],
  ['legal_road_spec', ['zrid', 'droga', 'drogow']],
  ['legal_tax_local', ['podatek', 'podatkow']],
];

function norm(v) {
  return String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9§%]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function slowa(v) { return [...new Set(norm(v).split(' ').filter(x => x.length > 1 && !STOP.has(x)))]; }
function zawiera(q, lista) { const n = norm(q); return lista.some(x => n.includes(norm(x))); }
function tnij(v, max = 1200) { return String(v || '').replace(/\s+/g, ' ').trim().slice(0, max); }
function tablica(v) { return Array.isArray(v) ? v : (v == null ? [] : [v]); }

// ---------- plik ----------
function plik(root) { return path.join(root, PLIK); }

let pamiec = null;        // { sciezka, mtime, dane }
function wczytaj(root) {
  const f = plik(root);
  let st = null;
  try { st = fs.statSync(f); } catch { return null; }
  // Plik czytamy raz i trzymamy w pamięci; przeładowujemy dopiero po podmianie,
  // żeby pytanie zadane w terenie nie czekało na 300 kB z dysku za każdym razem.
  if (pamiec && pamiec.sciezka === f && pamiec.mtime === st.mtimeMs) return pamiec.dane;
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!d || !Array.isArray(d.rules)) return null;
    d._typById = new Map((d.types || []).map(x => [x.id, x]));
    d._zrodloById = new Map((d.sources || []).map(x => [x.id, x]));
    d._linkById = new Map((d.links || []).map(x => [x.id, x]));
    pamiec = { sciezka: f, mtime: st.mtimeMs, dane: d };
    return d;
  } catch { return null; }
}

function stan(root) {
  const d = wczytaj(root);
  if (!d) return { jest: false, kod: null, regul: 0, zrodel: 0, pobrano: null, stanPrawny: null,
    opis: 'Biblia OPERO nie została jeszcze pobrana do folderu programu.' };
  return {
    jest: true, kod: d.version?.code || null, nazwa: d.version?.name || null,
    regul: (d.rules || []).length, zrodel: (d.links || []).length,
    ksiazek: (d.sources || []).length, rodzajow: (d.types || []).length,
    pobrano: d.generatedAt || null, stanPrawny: d.version?.legalStateDate || null,
    robocza: !!d.version?.preview,
    opis: `Biblia OPERO ${d.version?.code || ''} — ${(d.rules || []).length} reguł z ${(d.sources || []).length} książek, w folderze programu.`,
  };
}

/** Wgrywa Biblię z pliku dołączonego do programu. Zapis jest atomowy: przerwane
 *  kopiowanie nie może zostawić połowy pliku, bo przy następnym pytaniu wyglądałby
 *  na uszkodzony. Od 1.14.0 nie ma skąd „pobierać" — Biblia jedzie w instalatorze. */
function wgrajZProgramu(root, zrodlo, log) {
  const d = JSON.parse(fs.readFileSync(zrodlo, 'utf8'));
  if (!d || !Array.isArray(d.rules) || !d.rules.length) throw new Error('Plik Biblii dołączony do programu jest pusty lub uszkodzony.');
  fs.mkdirSync(root, { recursive: true });
  const f = plik(root), tmp = `${f}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(d), 'utf8');
  fs.renameSync(tmp, f);
  pamiec = null;
  try { log && log(`Biblia OPERO wgrana z programu: ${d.version?.code} (${d.rules.length} regul)`); } catch {}
  return stan(root);
}

/** Czy warto odświeżyć — inna wersja Biblii albo snapshot starszy niż 30 dni. */
function wymagaOdswiezenia(root, kodOczekiwany) {
  const s = stan(root);
  if (!s.jest) return true;
  if (kodOczekiwany && s.kod && s.kod !== kodOczekiwany) return true;
  const t = Date.parse(s.pobrano || '');
  return Number.isFinite(t) ? (Date.now() - t) > 30 * 24 * 3600 * 1000 : true;
}

// ---------- wyszukiwanie ----------
function trasa(q) {
  const n = norm(q);
  if (/gdzie|skad|zrod|link|portal|rejestr|pobrac/.test(n)) return 'where_find_data';
  if (/aktualn.*(przepis|ustaw|prawo)|jaki.*(przepis|paragraf)|podstawa prawna/.test(n)) return 'current_law';
  if (/prime yield|aktualn.*(czynsz|stopa|yield|pustostan|footfall)|ile wynosi.*(czynsz|stopa|yield)/.test(n)) return 'market_parameter';
  if (/wault/.test(n)) return 'office_wault_hard';
  if (/footfall/.test(n)) return 'retail_footfall_hard';
  if (/czynsz obrot/.test(n) && /nie znam|brak|bez/.test(n)) return 'retail_turnover_rent_hard';
  if (/dlaczego.*(metod|podej)|czemu.*(metod|podej)|ktora metod/.test(n)) return 'method_why';
  if (/skad.*(wynik|liczb)|jak.*policz|jak.*oblic|wzor|jak.*wylicz/.test(n)) return 'calculation_trace';
  if (/brak danych|nie mam danych|nie znam|czy moge zalozyc/.test(n)) return 'insufficient_evidence';
  if (/wybierz za mnie|zdecyduj.*metod|co mam przyjac/.test(n)) return 'professional_judgement';
  return 'definition_explain';
}
function tematy(q) { const out = []; for (const [kod, klucze] of TEMATY) if (zawiera(q, klucze)) out.push(kod); return [...new Set(out)]; }

function rodzaj(q, ctx, d) {
  const chciany = String(ctx.valuationTypeCode || MAPA_MODULOW[String(ctx.moduleCode || '')] || '').trim();
  if (chciany) { const x = (d.types || []).find(t => t.code === chciany); if (x) return { typ: x, pewny: true }; }
  const nq = norm(q);
  let best = null, bestScore = 0;
  for (const t of (d.types || [])) {
    let s = 0;
    for (const tok of slowa(`${t.code} ${t.name}`)) if (nq.includes(tok)) s += tok.length > 5 ? 3 : 1;
    if (s > bestScore) { best = t; bestScore = s; }
  }
  return bestScore >= 2 ? { typ: best, pewny: false } : { typ: null, pewny: false };
}

function punkty(q, r, typId, tr, pewnyTyp) {
  const ts = slowa(q);
  if (!ts.length) return Number(r.priority || 0) / 20;
  const tytul = norm(`${r.rule_code || ''} ${r.title || ''}`);
  const tresc = norm(`${r.content || ''} ${r.formula || ''}`);
  let s = 0;
  for (const t of ts) { if (tytul.includes(t)) s += 6; if (tresc.includes(t)) s += 2; }
  if (typId && r.valuation_type_id === typId) s += 18;
  if (!r.valuation_type_id) s += 1.5;
  // Reguła z INNEGO rodzaju wyceny przy pewnie ustalonym module to najczęstsza
  // przyczyna odpowiedzi „brzmi mądrze, jest nie na temat". Odrzucamy ją, zamiast
  // tylko nie premiować.
  if (pewnyTyp && typId && r.valuation_type_id && r.valuation_type_id !== typId) return -1;
  const kat = String(r.category || '');
  if (tr === 'current_law' && kat === 'legal') s += 10;
  if (tr === 'method_why' && kat === 'method_selection') s += 10;
  if (tr === 'calculation_trace' && kat === 'calculation') s += 10;
  if (tr === 'where_find_data' && kat === 'source_usage') s += 8;
  if (tr === 'insufficient_evidence' && (kat === 'qa' || kat === 'warning')) s += 5;
  // Na pytanie „jak policzyć" reguła ze wzorem jest odpowiedzią, a reguła bez
  // wzoru najwyżej tłem. Bez tego Agrafek recytował definicje zamiast wzoru.
  if (tr === 'calculation_trace' && String(r.formula || '').trim()) s += 12;
  s += Math.min(4, Number(r.priority || 0) / 10);
  return s;
}

function zrodlaDo(q, typId, d, wymuszone = []) {
  const chciane = [...new Set([...wymuszone, ...tematy(q)])];
  let rows = (d.topics || []).map(t => ({ ...t, link: d._linkById.get(t.source_link_id) })).filter(x => x.link);
  if (typId) rows = rows.filter(x => !x.valuation_type_id || x.valuation_type_id === typId);
  if (chciane.length) rows = rows.filter(x => chciane.includes(x.topic_code));
  if (!rows.length && zawiera(q, ['czynsz', 'stopa', 'yield', 'rynek', 'transakc'])) {
    rows = (d.topics || []).map(t => ({ ...t, link: d._linkById.get(t.source_link_id) }))
      .filter(x => x.link && ['market_context_commercial', 'transaction_prices'].includes(x.topic_code));
  }
  const poziom = { primary_official: 0, official_statistical: 1, professional_market: 2, secondary_reference: 3 };
  rows.sort((a, b) => (poziom[a.trust_tier] ?? 9) - (poziom[b.trust_tier] ?? 9) || Number(a.preferred_order || 99) - Number(b.preferred_order || 99));
  const widziane = new Set();
  return rows.filter(x => { if (widziane.has(x.link.id)) return false; widziane.add(x.link.id); return true; })
    .slice(0, 6).map(x => ({
      topicCode: x.topic_code, trustTier: x.trust_tier, title: x.link.title, authority: x.link.authority,
      url: x.link.url, whatToFind: x.what_to_find, verification: x.verification_steps,
      cautions: x.link.cautions, requiresHumanVerification: x.requires_human_verification !== false,
    }));
}

const WSTEPY = {
  where_find_data: 'Tego parametru nie należy zgadywać. Oto źródła, w których trzeba go ustalić i zweryfikować.',
  market_parameter: 'Biblia opisuje sposób użycia parametru, ale aktualnej liczby nie wolno przyjąć z benchmarku. Trzeba ją zweryfikować dla właściwego rynku, daty i definicji.',
  insufficient_evidence: 'Na podstawie podanych informacji nie da się jeszcze wiarygodnie ustalić wyniku. Najpierw trzeba uzupełnić brakujące dane lub źródło.',
  retail_turnover_rent_hard: 'Na podstawie podanych informacji nie da się jeszcze wiarygodnie ustalić wyniku. Najpierw trzeba uzupełnić brakujące dane lub źródło.',
  professional_judgement: 'OPERO może uporządkować przesłanki i dowody, ale decyzji zawodowej nie podejmuje za rzeczoznawcę.',
  current_law: 'Wiedza metodyczna to co innego niż aktualna podstawa prawna. Przepis trzeba odczytać w aktualnym źródle pierwotnym.',
};

function szukaj(root, zapytanie) {
  const d = wczytaj(root);
  if (!d) return { error: 'BRAK_BIBLII', message: 'Biblia OPERO nie jest jeszcze pobrana do folderu programu.' };
  const q = String(zapytanie?.pytanie || '').trim();
  if (q.length < 2) return { error: 'PUSTE_PYTANIE' };
  const tr = trasa(q);
  const { typ, pewny } = rodzaj(q, zapytanie || {}, d);
  const trasaDef = (d.routes || []).find(r => r.route_code === tr) || (d.routes || []).find(r => r.route_code === 'unknown_question');
  const wymuszone = tablica(zapytanie?.regulyKody).filter(Boolean);
  const ranking = (d.rules || [])
    .map(r => ({ r, s: wymuszone.includes(r.rule_code) ? 1000 : punkty(q, r, typ?.id, tr, pewny) }))
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 8);
  const reguly = ranking.map(({ r }) => {
    const zr = d._zrodloById.get(r.source_id);
    return {
      oznaczenie: r.rule_code, tytul: r.title, tresc: tnij(r.content, 700), wzor: tnij(r.formula, 300),
      kategoria: r.category, strony: [r.source_page_from, r.source_page_to].filter(Boolean).join('–'),
      zrodlo: zr ? (zr.title || zr.source_key) : null, ksiazka: zr?.original_filename || null,
    };
  });
  return {
    trasa: tr, tytulTrasy: trasaDef?.title || tr, polityka: tnij(trasaDef?.answer_policy, 400),
    wstep: WSTEPY[tr] || 'Z Biblii OPERO wynika:',
    rodzajWyceny: typ ? { kod: typ.code, nazwa: typ.name } : null,
    reguly, zrodla: zrodlaDo(q, typ?.id, d, tablica(zapytanie?.tematy).filter(Boolean)),
    ograniczenia: tnij(trasaDef?.fallback_instruction, 500),
    snapshot: { kod: d.version?.code, stanPrawny: d.version?.legalStateDate, robocza: !!d.version?.preview, lokalna: true },
  };
}

function zrodla(root, zapytanie) {
  const d = wczytaj(root);
  if (!d) return { error: 'BRAK_BIBLII' };
  const q = String(zapytanie?.temat || '').trim();
  const { typ } = rodzaj(q, zapytanie || {}, d);
  return {
    rodzajWyceny: typ ? { kod: typ.code, nazwa: typ.name } : null,
    zrodla: zrodlaDo(q, typ?.id, d, zapytanie?.kodTematu ? [String(zapytanie.kodTematu)] : []),
    snapshot: { kod: d.version?.code, lokalna: true },
  };
}

module.exports = { plik, stan, wgrajZProgramu, wymagaOdswiezenia, szukaj, zrodla, wczytaj };
