/* OPERO 2.0 — Studio operatu
 *
 * Ekran startowy: „Opisz operat”, dokumenty, zespol agentow, raport koncowy
 * i weryfikator. Ten plik spina gotowe czesci programu:
 *   opis-operatu.js  – co wynika z opisu,
 *   agenci.js        – przebieg i raport,
 *   weryfikator.js   – kontrola koncowa i poprawki,
 *   whatsapp.js, model-chmura.js, pamiec-wzorcow.js – ustawienia agentow.
 * Sama praca agentow to funkcje z app.js (ksiega, automat, szukanie
 * transakcji, obliczenia, PER) – tutaj sa tylko wolane po kolei.
 *
 * Zasady, ktorych agenci nie lamia:
 *  - wpisuja wylacznie do pustych rubryk i kazdy wpis jest oznaczony,
 *  - weryfikator niczego nie zmienia bez akceptacji, a zmiany da sie cofnac,
 *  - ceny ofertowe i liczby ze zrzutow nie wchodza do operatu same.
 */
'use strict';

let agenciTrwa = false, agenciPrzerwij = false, agenciZegar = null;
let studioPodpis = '', studioOpisDlaId = '', studioOpisCzas = null;
let studioMozg = null, studioWa = null, studioPamiec = { wzorce: [], uzywaj: true };

const STUDIO_ZNAK = 'PROJEKT — DO WERYFIKACJI';

function studioAPI(nazwa){ const f = window.operatAPI && window.operatAPI[nazwa]; return typeof f === 'function' ? f : null; }
function studioZl(n){ const v = Math.round(Number(n) || 0); return v > 0 ? `${String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} zł` : '—'; }
function studioAdres(){ const p = project.property || {}; return [p.city, [p.street, p.buildingNo].filter(Boolean).join(' ') + (p.localNo ? `/${p.localNo}` : '')].map(x => String(x || '').trim()).filter(Boolean).join(', '); }
function studioStan(){ project.agenci = project.agenci && typeof project.agenci === 'object' ? project.agenci : {}; return project.agenci; }
function studioMowi(tekst, rodzaj){ const el = $('#agenciKomunikat'); if (el){ el.textContent = tekst || ''; el.dataset.rodzaj = rodzaj || ''; } }

/** Znak wodny na wydruku: operat zrobiony przez agentow, jeszcze niezatwierdzony. */
function studioZnakTekst(){
  return project.agenci?.przebieg && !project.agenci?.reczny && !project.meta?.zatwierdzono && project.appearance?.znakProjektu !== false ? STUDIO_ZNAK : '';
}
function studioZnakWodny(html){
  const t = studioZnakTekst();
  return t && window.OperoWeryfikator ? window.OperoWeryfikator.znakWodny(html, t) : html;
}

/* Fragmenty podrecznika dla rozdzialow operatu. Pobierane raz przed pisaniem
   (wyszukiwanie idzie przez proces glowny), potem dostepne od reki. */
const STUDIO_ZAPYTANIA = {
  przedmiot: 'przedmiot i zakres wyceny cel wyceny podstawy formalne prawne merytoryczne',
  prawny: 'stan prawny księga wieczysta udział w nieruchomości wspólnej',
  ewidencja: 'ewidencja gruntów i budynków oznaczenie działki',
  planowanie: 'plan miejscowy przeznaczenie uwarunkowania planistyczne',
  lokalizacja: 'opis lokalizacji położenie otoczenie komunikacja dostępność',
  budynek: 'opis budynku stan techniczny konstrukcja wyposażenie',
  lokal: 'opis lokalu standard wykończenia układ pomieszczeń',
  dzialka: 'opis działki zagospodarowanie',
  rynek: 'analiza rynku charakterystyka rynku lokalnego transakcje',
  cechy: 'cechy rynkowe wagi skala ocen gradacja',
  metoda: 'wybór podejścia metody korygowania ceny średniej procedura szacowania',
  wynik: 'określenie wartości nieruchomości komentarz wnioski',
  klauzule: 'klauzule i zastrzeżenia',
};
let studioWiedza = {}, studioWiedzaStan = { ile: 0, stron: 0 };

async function podrecznikOdswiez(){
  if (!studioAPI('podrecznikStan')) return;
  try { studioWiedzaStan = await window.operatAPI.podrecznikStan(); } catch { return; }
  const e = $('#agenciPodrecznik');
  if (e){ e.textContent = studioWiedzaStan.ile ? `Podręcznik: ${studioWiedzaStan.stron} stron` : 'Podręcznik: brak'; e.dataset.stan = studioWiedzaStan.ile ? 'jest' : ''; }
  const lista = $('#wiedzaLista');
  if (lista) lista.innerHTML = (studioWiedzaStan.dokumenty || []).map(d => `<div class="pamiec-wzor"><div><b>${escapeHTML(d.nazwa)}</b><small>${d.stron} stron${d.zrodlo === 'ocr' ? ' · odczyt ze skanu' : ''}</small></div><button class="text-action" type="button" data-wiedza-usun="${escapeHTML(d.id)}">Usuń</button></div>`).join('') || '<p class="hint">Wrzuć PDF podręcznika na ekranie „Nowy operat" albo tutaj.</p>';
}

async function studioWiedzaPobierz(){
  studioWiedza = {};
  if (!studioWiedzaStan.ile || !studioAPI('podrecznikSzukaj')) return 0;
  let ile = 0;
  for (const [klucz, pytanie] of Object.entries(STUDIO_ZAPYTANIA)){
    try { const r = await window.operatAPI.podrecznikSzukaj({ pytanie, ile: 2, dlugosc: 650 }); studioWiedza[klucz] = r?.wyniki || []; ile += studioWiedza[klucz].length; } catch {}
  }
  return ile;
}

function studioOdwolania(klucz){
  return (studioWiedza[klucz] || []).map(w => `${w.dokument}, s. ${w.strona}`);
}

/** Wzor stylu z pamieci i zasady z podrecznika – dopisek do polecenia dla modelu (wolany z perNapiszPole). */
function studioWzorDlaPola(sciezka){
  const P = window.OperoPamiec, W = window.OperoWiedza;
  let wynik = '';
  try { if (P) wynik += P.doPolecenia(P.dobierz(studioPamiec, sciezka, moduleCode(), 2)); } catch {}
  try { const k = P ? P.rozdzialPola(sciezka) : ''; if (W && k && studioWiedza[k]) wynik += W.doPolecenia(studioWiedza[k]); } catch {}
  return wynik;
}

/* ------------------------------------------------------------------ opis */

function studioFaktyRysuj(){
  const O = window.OperoOpis, el = $('#opisFakty'); if (!O || !el) return null;
  const tekst = $('#opisTekst')?.value || '';
  const w = O.czytaj(tekst);
  if (w.dlugosc < 8){ el.innerHTML = ''; return w; }
  const zeton = f => `<span class="opis-zeton${f.doPotwierdzenia ? ' niepewny' : ''}" title="${escapeHTML(f.skad)}"><small>${escapeHTML(f.etykieta)}</small><b>${escapeHTML(f.pokaz)}</b></span>`;
  const brak = b => `<span class="opis-zeton brak" title="${escapeHTML(b.po)}"><small>brakuje</small><b>${escapeHTML(b.co)}</b></span>`;
  // Braki liczymy z całości: to, czego nie ma w opisie, mogą już dać dokumenty.
  const pr = project.property || {};
  const jestKw = !!String(project.legal?.kwLocal || '').trim() || String($('#opisKwTekst')?.value || '').trim().length >= 20;
  const braki = w.braki.filter(b => !(b.klucz === 'kw' && jestKw) && !(b.klucz === 'powierzchnia' && (Number(pr.usableArea) > 0 || Number(pr.landArea) > 0 || jestKw)) && !(b.klucz === 'adres' && String(pr.city || '').trim() && String(pr.street || '').trim()));
  el.innerHTML = (w.fakty.length ? `<div class="opis-zetony">${w.fakty.map(zeton).join('')}</div>` : '')
    + (braki.length ? `<div class="opis-zetony">${braki.map(brak).join('')}</div>` : '');
  return w;
}

function studioDokumentyStan(){
  const ustaw = (id, t) => { const e = $(id); if (e) e.textContent = t; };
  const z = (project.photos || []).length, d = (project.files || []).length;
  const sekcje = project.legal?.ekwImport?.sections || {};
  const dzialy = Object.keys(sekcje).filter(k => String(sekcje[k] || '').trim()).length;
  const wklejone = ($('#opisKwTekst')?.value || '').trim().length;
  ustaw('#opisDokKw', dzialy ? `w operacie: ${dzialy} ${dzialy === 1 ? 'dział' : dzialy < 5 ? 'działy' : 'działów'}` : wklejone >= 20 ? 'wklejona — agent ją odczyta' : 'wklej tekst z EKW');
  ustaw('#opisDokZdjecia', z ? `dodano: ${z}` : 'lokal i budynek');
  ustaw('#opisDokPliki', d ? `dodano: ${d}` : 'rzut, wypisy, umowy');
  $('#opisKwWklej')?.classList.toggle('jest', !!dzialy || wklejone >= 20);
  $('#opisZdjecia')?.classList.toggle('jest', z > 0);
  $('#opisPliki')?.classList.toggle('jest', d > 0);
  const st = $('#opisKwStan'), E = window.OperoEkw;
  if (st){
    if (wklejone < 20) st.textContent = '';
    else { let ok = false; try { ok = !!E?.czytaj($('#opisKwTekst').value)?.ok; } catch {} st.textContent = ok ? 'Widzę księgę wieczystą — Agent Ksiąg Wieczystych ją rozczyta.' : 'W tym tekście nie widzę jeszcze księgi — skopiuj całą stronę działu razem z nagłówkiem.'; st.dataset.ok = ok ? '1' : '0'; }
  }
}

/* --------------------------------------------------------------- widok */

function studioRysuj(){
  const A = window.OperoAgenci; if (!A || !$('#studio')) return;
  const s = studioStan(), p = s.przebieg || null;
  try { studioZlecenieRysuj(); } catch {}
  // Opis wraca do okna, gdy otwarto inny operat – nigdy w trakcie pisania.
  const id = project.meta?.id || '';
  const pole = $('#opisTekst');
  if (pole && id !== studioOpisDlaId && document.activeElement !== pole){ studioOpisDlaId = id; pole.value = s.opis || ''; studioFaktyRysuj(); }
  studioDokumentyStan();
  wynikSciezkaRysuj();
  const podpis = JSON.stringify([id, p ? [p.stan, p.przebieg, p.dziennik.length, Object.values(p.agenci).map(a => a.stan + a.krok)] : 0, s.weryfikacja?.kiedy || '', s.rozumowanie?.kiedy || '', (s.zastosowane || []).length, agenciTrwa, !!project.meta?.zatwierdzono]);
  if (podpis === studioPodpis) return;
  studioPodpis = podpis;
  const postep = p ? (p.stan === 'gotowe' ? 100 : A.postep(p)) : 0;
  $('#studio').dataset.stan = agenciTrwa ? 'praca' : p?.stan === 'gotowe' ? 'raport' : 'opis';
  const pier = $('#agenciPierscien'); if (pier) pier.style.setProperty('--postep', String(postep));
  const proc = $('#agenciProcent'); if (proc) proc.textContent = `${postep}%`;
  const stan = $('#agenciStan');
  if (stan) stan.textContent = agenciTrwa ? (Object.entries(p?.agenci || {}).filter(([, a]) => a.stan === 'pracuje').map(([k]) => A.agent(k)?.nazwa)[0] || 'Zespół pracuje') + '…'
    : p?.stan === 'gotowe' ? (project.meta?.zatwierdzono ? 'Operat zatwierdzony' : 'Operat gotowy do weryfikacji') : p?.stan === 'przerwane' ? 'Praca zatrzymana' : 'Czeka na zlecenie';
  studioCzasRysuj();
  const lista = $('#agenciLista');
  if (lista){
    // Wiersze powstaja raz; potem zmienia sie tylko stan i podpis – inaczej
    // kazde odswiezenie zaczynaloby animacje wejscia od nowa.
    if (lista.children.length !== A.ZESPOL.length) lista.innerHTML = A.ZESPOL.map((a, i) => `<li class="agent" data-agent="${a.id}" data-stan="czeka" style="--i:${i}"><span class="agent-znak">${a.znak}</span><div class="agent-tresc"><b>${escapeHTML(a.nazwa)}</b><small></small></div><span class="agent-lampka" aria-hidden="true"></span></li>`).join('');
    A.ZESPOL.forEach((a, i) => {
      const x = p?.agenci?.[a.id] || { stan: 'czeka', krok: '', zrobione: [], braki: [] };
      const opis = x.stan === 'pracuje' ? (x.krok || 'pracuję…') : x.stan === 'gotowe' ? `gotowe · ${x.zrobione.length} ${A.odmien(x.zrobione.length, 'pozycja', 'pozycje', 'pozycji')}`
        : x.stan === 'uwaga' ? `${x.zrobione.length} zrobione · ${x.braki.length} do uzupełnienia` : x.stan === 'blad' ? `przerwane: ${x.blad || 'błąd'}` : x.stan === 'pominiety' ? 'nic do zrobienia' : a.rola;
      const li = lista.children[i]; if (!li) return;
      if (li.dataset.stan !== x.stan) li.dataset.stan = x.stan;
      const m = li.querySelector('small'); if (m && m.textContent !== opis) m.textContent = opis;
    });
  }
  const dz = $('#agenciDziennik');
  if (dz){
    const wpisy = (p?.dziennik || []).slice(-7).reverse();
    dz.innerHTML = wpisy.map(w => `<p data-rodzaj="${w.rodzaj}"><time>${escapeHTML(String(w.kiedy).slice(11, 19))}</time><b>${escapeHTML(A.agent(w.agent)?.krotko || '')}</b><span>${escapeHTML(w.tekst)}</span></p>`).join('');
    dz.classList.toggle('hidden', !wpisy.length);
  }
  const start = $('#agenciStart'), stop = $('#agenciStop');
  if (start){ start.disabled = agenciTrwa; start.classList.toggle('pracuje', agenciTrwa); const n = start.querySelector('span'); if (n) n.textContent = agenciTrwa ? 'Zespół pracuje…' : p ? 'Uruchom zespół ponownie' : 'Uruchom zespół agentów'; }
  if (stop) stop.classList.toggle('hidden', !agenciTrwa);
  studioRaportRysuj();
}

function studioCzasRysuj(){
  const A = window.OperoAgenci, el = $('#agenciCzas'), p = project.agenci?.przebieg; if (!A || !el) return;
  if (!p){ el.textContent = `${A.ZESPOL.length} agentów · każdy ma swój etap`; return; }
  const czas = A.czasTekst(A.czas(p));
  el.textContent = agenciTrwa ? `pracuje od ${czas} · przebieg ${p.przebieg} z ${p.dokladnosc}` : `czas pracy ${czas} · ${p.przebieg} ${A.odmien(p.przebieg, 'przebieg', 'przebiegi', 'przebiegów')}`;
}

function studioZnaczki(){
  const ustaw = (id, t, stan) => { const e = $(id); if (e){ e.textContent = t; e.dataset.stan = stan || ''; } };
  const g = studioMozg?.gotowosc;
  ustaw('#agenciMozg', g?.aktywny ? (g.dostawca === 'opero' ? 'Mózg: Claude (Mózg OPERO)' : `Mózg: Claude · ${g.model}`) : 'Mózg AI: wyłączony — kliknij, by włączyć', g?.aktywny ? 'chmura' : '');
  const ile = (studioPamiec?.wzorce || []).length;
  ustaw('#agenciWzorce', ile && studioPamiec.uzywaj ? `Wzorce: ${ile} ${ile === 1 ? 'operat' : ile < 5 ? 'operaty' : 'operatów'}` : ile ? 'Wzorce: wyłączone' : 'Wzorce: brak', ile && studioPamiec.uzywaj ? 'jest' : '');
  const w = studioWa?.gotowosc;
  ustaw('#agenciWa', w?.automat ? 'WhatsApp: automatycznie' : 'WhatsApp: jednym kliknięciem', w?.automat ? 'jest' : '');
}

/* ------------------------------------------------- droga operatu (Wynik) */

let wynikSciezkaPodpis = '', wynikSciezkaTrwa = false;
/** Siedem krokow od danych do PDF – jeden rzut oka zamiast szukania po etapach. */
function wynikSciezkaRysuj(){
  const el = $('#wynikSciezka'); if (!el || wynikSciezkaTrwa) return;
  // Liczymy tylko wtedy, gdy ekran Wynik jest otwarty – kontrola brakow jest kosztowna.
  if (!$('#tab-result')?.classList.contains('active')) return;
  wynikSciezkaTrwa = true;
  try { wynikSciezkaLicz(el); } finally { wynikSciezkaTrwa = false; }
}
function wynikSciezkaLicz(el){
  const p = project.property || {}, s = project.agenci || {}, w = s.weryfikacja;
  const tr = (project.market?.transactions || []).length, wartosc = Number(calc?.valueRounded) || 0;
  const opisy = ['location.description', 'building.description', 'market.marketDescription'].map(x => String(getPath(project, x) || '').trim().length > 20);
  const ileOpisow = opisy.filter(Boolean).length;
  let braki = 0; try { braki = allCriticalIssues().length; } catch {}
  const zatw = !!project.meta?.zatwierdzono;
  const kroki = [
    { n: 'Dane', ok: !!(String(p.city || '').trim() && String(p.street || '').trim() && (Number(p.usableArea) > 0 || Number(p.landArea) > 0)), t: studioAdres() || 'brak adresu', tab: 'project' },
    { n: 'Transakcje', ok: tr >= 3, czesc: tr > 0, t: tr ? `${tr} w zbiorze` : 'brak', tab: 'market' },
    { n: 'Rachunek', ok: wartosc > 0, t: wartosc > 0 ? studioZl(wartosc) : 'brak wyniku', tab: 'features' },
    { n: 'Opisy', ok: ileOpisow === opisy.length, czesc: ileOpisow > 0, t: `${ileOpisow} z ${opisy.length} głównych`, tab: 'egib' },
    { n: 'Weryfikacja', ok: !!w && !w.podsumowanie.bledy, czesc: !!w, t: w ? (w.podsumowanie.bledy ? `${w.podsumowanie.bledy} do poprawy` : w.podsumowanie.uwagi ? `${w.podsumowanie.uwagi} uwag` : 'bez uwag') : 'nie uruchomiono', akcja: w ? 'raport' : 'sprawdz' },
    { n: 'Zatwierdzenie', ok: zatw, t: zatw ? 'zatwierdzony' : 'czeka na Ciebie', akcja: 'etapy' },
    { n: 'PDF', ok: braki === 0, t: braki ? `${braki} ${braki === 1 ? 'brak' : 'braków'}` : 'gotowy', akcja: 'pdf' },
  ];
  const podpis = JSON.stringify(kroki.map(k => [k.ok, k.czesc, k.t]));
  if (podpis === wynikSciezkaPodpis && el.children.length) return;
  wynikSciezkaPodpis = podpis;
  const pierwszy = kroki.findIndex(k => !k.ok);
  el.innerHTML = kroki.map((k, i) => `<button type="button" class="sciezka-krok" data-stan="${k.ok ? 'ok' : i === pierwszy ? 'teraz' : k.czesc ? 'czesc' : 'czeka'}" ${k.tab ? `data-sciezka-tab="${k.tab}"` : `data-sciezka-akcja="${k.akcja}"`} style="--i:${i}"><i>${k.ok ? '✓' : i + 1}</i><b>${k.n}</b><small>${escapeHTML(k.t)}</small></button>`).join('');
}

/* -------------------------------------------------------------- raport */

function studioRaportRysuj(){
  const A = window.OperoAgenci, el = $('#agenciRaport'); if (!A || !el) return;
  const s = studioStan(), p = s.przebieg;
  if (!p || agenciTrwa || !['gotowe', 'przerwane'].includes(p.stan)){ el.classList.add('hidden'); el.innerHTML = ''; return; }
  const r = A.raport(p), w = s.weryfikacja;
  const wartosc = Number(calc?.valueRounded) || 0, jedn = Number(calc?.unitAfterRound) || 0;
  const grupa = (g, klasa) => `<details class="raport-grupa ${klasa}"${klasa === 'braki' ? ' open' : ''}><summary><b>${escapeHTML(g.nazwa)}</b><i>${g.pozycje.length}</i></summary><ul>${g.pozycje.map(x => `<li>${escapeHTML(x)}</li>`).join('')}</ul></details>`;
  const zatw = !!project.meta?.zatwierdzono;
  el.innerHTML = `
    <div class="raport-glowa">
      <div><span class="eyebrow">${p.stan === 'gotowe' ? 'RAPORT ZESPOŁU' : 'PRACA ZATRZYMANA'}</span><h3>${p.stan === 'gotowe' ? (zatw ? 'Operat zatwierdzony' : 'Operat gotowy do Twojej weryfikacji') : 'Zespół nie dokończył pracy'}</h3>
        <p>${escapeHTML(studioAdres() || 'Operat bez adresu')} · czas pracy ${escapeHTML(r.czasTekst)} · ${r.przebiegi} ${A.odmien(r.przebiegi, 'przebieg', 'przebiegi', 'przebiegów')} · ${r.mozg === 'chmura' ? 'Claude (AI w chmurze)' : 'bez AI'}</p></div>
      <div class="raport-wartosc"><span>Wartość</span><b>${studioZl(wartosc)}</b><small>${jedn > 0 ? `${studioZl(jedn)}/m²` : 'brak wyniku — zobacz, czego zabrakło'}</small></div>
    </div>
    ${s.werdykt ? `<div class="raport-werdykt ${s.werdykt.zatwierdzony ? 'ok' : 'uwaga'}"><b>${s.werdykt.zatwierdzony ? '✓' : '!'}</b><div><span class="eyebrow">WERDYKT ZESPOŁU NADZORU · ${s.werdykt.rund} ${A.odmien(s.werdykt.rund, 'narada', 'narady', 'narad')}</span><p>${escapeHTML(s.werdykt.tekst)}</p></div></div>` : ''}
    <div class="raport-liczby"><div><b>${r.ileZrobione}</b><span>zrobione</span></div><div data-ile="${r.ileBrakow}"><b>${r.ileBrakow}</b><span>do uzupełnienia</span></div><div data-ile="${w?.podsumowanie?.bledy || 0}"><b>${w ? w.uwagi.length : '—'}</b><span>uwagi weryfikatora</span></div><div><b>${(s.zastosowane || []).length}</b><span>wprowadzone poprawki</span></div></div>
    <div class="raport-kolumny">
      <section><h4>Co zrobiłem</h4>${r.zrobione.length ? r.zrobione.map(g => grupa(g, 'zrobione')).join('') : '<p class="raport-pusto">Nic nie zostało wpisane.</p>'}</section>
      <section><h4>Czego zabrakło</h4>${r.braki.length ? r.braki.map(g => grupa(g, 'braki')).join('') : '<p class="raport-pusto">Niczego nie zabrakło.</p>'}</section>
    </div>
    <div class="operat-podglad"><div class="operat-podglad-glowa"><div><span class="eyebrow">CAŁY OPERAT</span><h4>Tak wygląda operat po pracy zespołu</h4><p>Pobierz go w Wordzie albo PDF i sprawdź. Ten sam dokument jest w zakładce „Wynik".</p></div><div class="operat-podglad-akcje"><button class="btn primary" type="button" data-studio="word">Pobierz Word</button><button class="btn primary" type="button" data-studio="pdf">Pobierz PDF</button><button class="btn ghost" type="button" data-studio="odswiez">Odśwież podgląd</button></div></div><iframe id="studioOperatPodglad" class="operat-podglad-ramka" title="Podgląd operatu" sandbox="allow-same-origin"></iframe></div>
    ${studioRozumowanieHtml(s.rozumowanie)}
    ${studioWeryfikacjaHtml(w, s)}
    <div class="raport-akcje">
      <button class="btn primary" type="button" data-studio="wynik">Przejdź do wyniku →</button>
      <button class="btn ghost" type="button" data-studio="whatsapp">Wyślij raport na WhatsApp</button>
    </div>
    ${studioZnakTekst() ? `<p class="raport-stopka">Do czasu zatwierdzenia każdy wydruk ma znak wodny „${STUDIO_ZNAK}". Za treść operatu odpowiada rzeczoznawca, który go podpisuje.</p>` : '<p class="raport-stopka">Za treść operatu odpowiada rzeczoznawca, który go podpisuje.</p>'}`;
  el.classList.remove('hidden');
  studioPodgladOperatu();
}

/** Pelny operat w ramce – ten sam dokument, ktory trafia do PDF. */
let studioPodgladCzas = null;
function studioPodgladOperatu(){
  clearTimeout(studioPodgladCzas);
  studioPodgladCzas = setTimeout(() => {
    const ramka = $('#studioOperatPodglad'); if (!ramka) return;
    try { calc = obliczProjekt(); ramka.srcdoc = zbudujRaport(); }
    catch (e){ ramka.srcdoc = `<html><body style="font:14px Arial;padding:24px;color:#8a3434">Nie udało się zbudować podglądu: ${escapeHTML(String(e.message || e))}</body></html>`; }
  }, 60);
}

/* 3.3: Księga z EKW — Ty przeglądasz, program przepisuje każdy wyświetlony dział. */
async function studioEkwOtworz(){
  if (!studioAPI('ekwOkno')) return;
  const w = window.OperoOpis?.czytaj(String($('#opisTekst')?.value || '')) || { fakty: [] };
  const kw = String(w.fakty.find(f => f.klucz === 'kw')?.wartosc || project.legal?.kwLocal || '').trim();
  const r = await window.operatAPI.ekwOkno({ kw }).catch(e => ({ ok: false, powod: cleanRemoteError(e) }));
  studioMowi(r?.ok ? `Otworzyłem przeglądarkę ksiąg${r.kw ? ` (numer ${r.kw} jest w schowku${/\//.test(r.kw) ? ' i w formularzu' : ''})` : ''}. Wyszukaj księgę i otwórz kolejno działy I-O, I-Sp, II, III i IV — każdy przepiszę sam.` : `Nie otworzyłem EKW: ${r?.powod || 'błąd'}`, r?.ok ? '' : 'uwaga');
}
function studioEkwPrzyjmij(d){
  const pole = $('#opisKwTekst'); if (!pole || !d?.tekst) return;
  const t = String(d.tekst).trim();
  if (String(pole.value).includes(t.slice(0, 200))) return;
  pole.value = (String(pole.value || '').trim() ? pole.value.trim() + '\n\n' : '') + t;
  $('#opisKwPole')?.classList.remove('hidden');
  pole.dispatchEvent(new Event('input', { bubbles: true }));
  const dzial = (/DZIA[ŁL]\s+(I-O|I-SP|II|III|IV)\b/i.exec(t) || [])[1];
  studioMowi(`Przepisałem z EKW${dzial ? ` dział ${dzial.toUpperCase()}` : ' stronę księgi'}. Otwórz kolejny dział albo zamknij okno.`);
  if (typeof wsadRysuj === 'function') try { wsadRysuj(); } catch {}
}

/* 3.2: Zbieracz rynku — stan w zakładce Baza rynku. */
async function zbieraczRysuj(){
  const el = $('#zbieraczStan'); if (!el || !studioAPI('zbieraczStan')) return;
  try {
    const z = await window.operatAPI.zbieraczStan();
    const wl = $('#zbieraczWl'); if (wl) wl.checked = z.wlaczony;
    const o = z.ostatnio, dt = x => x ? new Date(x).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    el.textContent = z.trwa ? 'Zbieram teraz…'
      : `W bazie: ${z.razem} transakcji. Obszary: ${z.obszary.length ? z.obszary.slice(0, 6).map(x => x.miasto || x.powiat || 'punkt').join(', ') + (z.obszary.length > 6 ? '…' : '') : 'jeszcze żadnych (pojawią się po pierwszym operacie)'}. `
        + (o ? `Ostatnio ${dt(o.kiedy)}: pobrano ${o.pobrane}, nowych ${o.dodane}${o.bledy?.length ? `; problemy: ${o.bledy.join('; ')}` : ''}.` : 'Jeszcze nie zbierał.');
  } catch (e){ el.textContent = cleanRemoteError(e); }
}

/* 3.2: zakładka Wynik — gotowy operat do sprawdzenia (Word / PDF) i werdykt zespołu. */
let wynikOperatCzas = null;
function wynikOperatRysuj(){
  clearTimeout(wynikOperatCzas);
  wynikOperatCzas = setTimeout(() => {
    const s = studioStan(), w = s.werdykt, el = $('#wynikWerdykt'), t = $('#wynikOperatTytul');
    const gotowy = s.przebieg?.stan === 'gotowe';
    if (t) t.textContent = studioAdres() ? `Operat: ${studioAdres()}` : 'Operat wygenerowany przez zespół agentów';
    if (el){
      el.className = 'wynik-werdykt' + (w ? (w.zatwierdzony ? ' ok' : ' uwaga') : '');
      el.textContent = w ? w.tekst : gotowy ? 'Zespół skończył pracę — sprawdź operat w Wordzie albo PDF.' : 'Uruchom zespół na ekranie „Nowy operat" — gotowy operat pojawi się tutaj.';
    }
    const ramka = $('#wynikPodglad'); if (!ramka) return;
    try { calc = obliczProjekt(); ramka.srcdoc = zbudujRaport(); }
    catch (e){ ramka.srcdoc = `<html><body style="font:14px Arial;padding:24px;color:#8a3434">Nie udało się zbudować operatu: ${escapeHTML(String(e.message || e))}</body></html>`; }
  }, 80);
}

function studioRozumowanieHtml(r){
  if (!r || !(r.decyzje || []).length) return '';
  const PEWNOSC = { wysoka: 'mocna', srednia: 'do uzasadnienia', niska: 'słaba' };
  const li = l => l.map(x => `<li>${escapeHTML(x)}</li>`).join('');
  const decyzja = (d, i) => `<details class="tok-decyzja" data-pewnosc="${d.pewnosc}"${d.pewnosc === 'niska' ? ' open' : ''}>
    <summary><i>${i + 1}</i><span><b>${escapeHTML(d.tytul)}</b><small>${escapeHTML(d.rozstrzygniecie)}</small></span><em>${PEWNOSC[d.pewnosc] || d.pewnosc}</em></summary>
    <div class="tok-tresc">
      <p class="tok-pytanie">${escapeHTML(d.pytanie)}</p>
      ${d.dane.length ? `<h6>Na czym się opieram</h6><ul>${li(d.dane)}</ul>` : ''}
      ${d.mozliwosci.length ? `<h6>Co rozważyłem</h6><ul class="tok-mozliwosci">${d.mozliwosci.map(m => `<li data-wybrana="${m.wybrana ? 1 : 0}"><b>${m.wybrana ? '✓' : '✕'} ${escapeHTML(m.co)}</b> — ${escapeHTML(m.dlaczego)}</li>`).join('')}</ul>` : ''}
      ${d.zastrzezenia.length ? `<h6>Zastrzeżenia — rozstrzygasz Ty</h6><ul class="tok-zastrzezenia">${li(d.zastrzezenia)}</ul>` : ''}
      ${d.zmieni.length ? `<h6>Co zmieniłoby tę decyzję</h6><ul>${li(d.zmieni)}</ul>` : ''}
      ${(d.podrecznik || []).length ? `<h6>Według Twojego podręcznika</h6><p class="tok-podrecznik">${d.podrecznik.map(escapeHTML).join(' · ')}</p>` : ''}
    </div></details>`;
  return `<div class="tok-karta" data-ocena="${r.podsumowanie.ocena}">
    <div class="wer-glowa"><span class="wer-znak">⚙</span><div><span class="eyebrow">TOK ROZUMOWANIA</span><h4>${escapeHTML(r.podsumowanie.tekst)}</h4>
      <p>Sześć decyzji, z których składa się operat. Przy każdej: dane, rozważone możliwości, zastrzeżenia i to, co by ją zmieniło.</p></div></div>
    ${r.decyzje.map(decyzja).join('')}
    ${(r.krytyka || []).length ? `<div class="tok-krytyka"><b>⚑ Agent Krytyk — do czego przyczepiłby się weryfikator</b><ul>${li(r.krytyka)}</ul></div>` : ''}
  </div>`;
}

function studioWeryfikacjaHtml(w, s){
  if (!w) return '';
  const W = window.OperoWeryfikator;
  const zrobione = new Set((s.zastosowane || []).map(z => z.id));
  const dzialy = (W?.DZIALY || []).map(d => ({ ...d, uwagi: w.uwagi.filter(u => u.dzial === d.id) })).filter(d => d.uwagi.length);
  const wiersz = u => {
    const mozna = !!u.poprawka || (u.zModelu && u.gdzie && u.polecenie);
    const juz = zrobione.has(u.id);
    return `<label class="wer-uwaga" data-waga="${u.waga}"${juz ? ' data-zrobione="1"' : ''}>
      ${mozna && !juz ? `<input type="checkbox" data-wer-id="${u.id}"${u.poprawka ? ' checked' : ''}>` : `<span class="wer-kropka">${juz ? '✓' : ''}</span>`}
      <span><b>${escapeHTML(u.tytul)}</b>${u.szczegol ? `<small>${escapeHTML(u.szczegol)}</small>` : ''}${u.poprawka && !juz ? `<em>Poprawka: ${escapeHTML(u.poprawka.opis)}</em>` : u.zModelu && mozna && !juz ? '<em>Poprawka: model przeredaguje to pole według uwagi</em>' : juz ? '<em>Wprowadzone</em>' : ''}</span>
      ${u.gdzie && !u.gdzie.includes('features.') ? `<button class="text-action" type="button" data-wer-gdzie="${escapeHTML(u.gdzie)}">Pokaż</button>` : ''}</label>`;
  };
  const doWyboru = w.uwagi.filter(u => (u.poprawka || (u.zModelu && u.gdzie && u.polecenie)) && !zrobione.has(u.id)).length;
  return `<div class="wer-karta" data-ocena="${w.podsumowanie.ocena}">
    <div class="wer-glowa"><span class="wer-znak">◆</span><div><span class="eyebrow">RZECZOZNAWCA-WERYFIKATOR</span><h4>${escapeHTML(w.podsumowanie.tekst)}</h4>
      <p>${w.opiniaModelu ? 'Kontrola reguł i lektura modelu.' : `Kontrola reguł${w.bladModelu ? ` — model nie przeczytał operatu (${escapeHTML(w.bladModelu)})` : ''}.`} Nic nie zostało zmienione — zaznacz poprawki, które akceptujesz.</p></div></div>
    ${dzialy.map(d => `<div class="wer-dzial"><h5>${escapeHTML(d.nazwa)} <i>${d.uwagi.length}</i></h5>${d.uwagi.map(wiersz).join('')}</div>`).join('') || '<p class="raport-pusto">Weryfikator nie ma uwag.</p>'}
    ${w.opiniaSurowa ? `<details class="wer-opinia"><summary>Opinia modelu (pełny tekst)</summary><div>${escapeHTML(w.opiniaSurowa).replace(/\n/g, '<br>')}</div></details>` : ''}
    <div class="wer-akcje">
      <button class="btn primary" type="button" data-studio="zastosuj"${doWyboru ? '' : ' disabled'}>Wprowadź zaznaczone poprawki</button>
      ${(s.zastosowane || []).length ? `<button class="btn ghost" type="button" data-studio="cofnij">Cofnij wprowadzone (${s.zastosowane.length})</button>` : ''}
      <button class="btn ghost" type="button" data-studio="ponownie">Sprawdź ponownie</button>
      <span id="werKomunikat" class="wer-komunikat" aria-live="polite"></span>
    </div></div>`;
}

/* ------------------------------------------------------------- agenci */

/** Czy w otwartym operacie jest juz cos, czego nie wolno po cichu zastapic. */
function studioProjektZajety(){
  const p = project.property || {};
  return !!(String(p.city || '').trim() || String(p.street || '').trim() || String(project.legal?.kwLocal || '').trim() || (project.market?.transactions || []).length || project.agenci?.przebieg);
}

const AGENCI_PRACA = {
  async zlecenie(k){
    const O = window.OperoOpis, A = window.OperoAgenci;
    const zrobione = [], braki = [];
    k.krok('czytam opis');
    const w = O.czytaj(k.opis);
    if (k.nowyModul) zrobione.push(`Rodzaj operatu: ${moduleInfo().title} (${moduleInfo().method}).${k.modulNiepewny ? ' Przyjąłem najbliższy rodzaj — widać go w nagłówku operatu.' : ''}`);
    k.krok('wpisuję dane podstawowe');
    const cel = freshProject(moduleCode()).valuation.purpose;
    const r = await autoSledz(async () => O.doProjektu(project, w, { celDomyslny: cel, dzis: new Date().toISOString().slice(0, 10) }), 'opis zlecenia');
    for (const x of (r.wynik?.wpisane || [])) zrobione.push(`${x.etykieta}: ${x.wartosc}`);
    // 3.1: zlecenie z formularza (jedyne dane podawane ręcznie) i autor z Ustawień.
    k.krok('wpisuję zlecenie i autora');
    const zl = A.zlecenieDoProjektu(project, studioZlecenieStart || studioZlecenieZPol());
    for (const x of zl.wpisane) zrobione.push(x.startsWith('Podstawa') ? 'Podstawa formalna ułożona ze zlecenia.' : x);
    try { if (!profilCache && typeof wczytajProfil === 'function') await wczytajProfil(); } catch {}
    const au = A.autorZProfilu(project, profilCache || {});
    if (au.wpisane.length) zrobione.push(`Autor z Ustawień: ${project.author.name || ''}${project.author.licenseNo ? `, nr upr. ${project.author.licenseNo}` : ''}.`);
    if (!String(project.client?.name || '').trim() && !String(project.formalBasis || '').trim()) braki.push('Brak zleceniodawcy — wpisz go w polu „Zlecenie" (to jedyne dane, których program nie znajdzie sam).');
    for (const x of (r.wynik?.pominiete || [])) braki.push(`${x.etykieta}: w opisie „${x.wartosc}", w operacie „${x.jest}" — zostawiłem to, co było w operacie.`);
    for (const f of w.fakty.filter(f => f.doPotwierdzenia)) braki.push(`${f.etykieta}: odczytałem „${f.pokaz}" z odmienionej formy — potwierdź nazwę.`);
    const plik = (project.files || []).length;
    if (plik) zrobione.push(`Dokumenty w załącznikach: ${plik}.`);
    // Adres i powierzchnię może jeszcze dać księga – braki sprawdza Kontroler na końcu.
    if (!String(project.property.city || '').trim() && !String($('#opisKwTekst')?.value || '').trim()) braki.push('Brak adresu (miejscowość i ulica) — od niego zależy praca agentów lokalizacji i rynku.');
    if (au.brak) braki.push('Brak danych autora — uzupełnij profil rzeczoznawcy w Ustawieniach (imię i nazwisko, nr uprawnień); program wpisuje je do każdego operatu sam.');
    return { zrobione, braki, pominiety: !zrobione.length && !braki.length };
  },

  async oglednik(k){
    const A = window.OperoAgenci, zrobione = [], braki = [];
    const zdjecia = (project.photos || []).filter(p => p.dataUrl && !['kw', 'dokument', 'mapa', 'legenda'].includes(p.rodzajDokumentu));
    const rzuty = zdjecia.filter(p => p.rodzajDokumentu === 'rzut'), wnetrza = zdjecia.filter(p => p.rodzajDokumentu !== 'rzut');
    k.krok('porządkuję zdjęcia i rzut');
    if (!zdjecia.length) return { braki: ['Nie ma zdjęć ani rzutu — opis lokalu i ocena standardu wymagają dokumentacji z oględzin.'] };
    zrobione.push(`Dokumentacja: ${wnetrza.length} ${A.odmien(wnetrza.length, 'zdjęcie', 'zdjęcia', 'zdjęć')}${rzuty.length ? `, ${rzuty.length} ${A.odmien(rzuty.length, 'rzut', 'rzuty', 'rzutów')}` : ''}.`);
    if (!rzuty.length) braki.push('Brak rzutu lokalu — dołącz go, jeśli masz (załącznik operatu).');
    if (!studioMozg?.gotowosc?.aktywny || !studioAPI('chmuraZdjecia')){
      braki.push('Model lokalny nie widzi zdjęć: standard wykończenia i stan techniczny oceń sam (albo opisz je w opisie zlecenia). Model w chmurze zrobi to ze zdjęć.');
      return { zrobione, braki };
    }
    k.krok('oglądam wnętrza i budynek');
    const wybrane = [...wnetrza.filter((_, i) => i % Math.max(1, Math.ceil(wnetrza.length / 10)) === 0).slice(0, 10), ...rzuty.slice(0, 2)].map(p => p.dataUrl);
    const polecenie = 'Jesteś rzeczoznawcą majątkowym na oględzinach. Na zdjęciach jest wyceniana nieruchomość (wnętrza, budynek, ewentualnie rzut). '
      + 'Opisz WYŁĄCZNIE to, co widać. Niczego nie zgaduj (np. materiałów niewidocznych, roku budowy, metrażu). Odpowiedz samym JSON w postaci: '
      + '{"standard":"Niekorzystna|Przeciętna|Korzystna","standardUzasadnienie":"1-2 zdania","oceny":{"stan":"Niekorzystna|Przeciętna|Korzystna","garaz":"…","ogrodek":"…"},"stanTechniczny":"zdanie","budynek":"2-3 zdania o bryle, elewacji, dachu, otoczeniu działki","lokal":"3-5 zdań o układzie i wykończeniu wnętrz","instalacje":"to, co widać (grzejniki, kocioł, wentylacja, oświetlenie)","wyposazenie":"zabudowy, kuchnia, łazienki",'
      + '"pola":{"building.type":"","building.storeys":"","building.roof":"","building.facade":"","building.condition":"","building.parking":"","local.kitchenType":"","local.bathrooms":"","local.floors":"","local.walls":"","local.windows":"","local.standardLevel":""},"uwagi":["rzeczy do sprawdzenia przy oględzinach"]}. Pole, którego nie widać na zdjęciach, zostaw puste.';
    const r = await window.operatAPI.chmuraZdjecia({ zdjecia: wybrane, polecenie }).catch(e => ({ ok: false, powod: cleanRemoteError(e) }));
    if (!r?.ok) return { zrobione, braki: [...braki, `Oględziny ze zdjęć nie wyszły: ${r?.powod || 'błąd'}.`], powtorz: true };
    let j = null; try { j = JSON.parse(String(r.text).replace(/^[^{]*/, '').replace(/[^}]*$/, '')); } catch {}
    if (!j) return { zrobione, braki: [...braki, 'Model opisał zdjęcia, ale nie w formacie, który program umie przepisać — zobacz opis lokalu.'] };
    k.krok('oceniam standard i stan');
    const wpisz = {};
    if (j.lokal) wpisz['local.description'] = String(j.lokal);
    if (j.budynek) wpisz['building.description'] = String(j.budynek);
    if (j.instalacje) wpisz['local.installations'] = String(j.instalacje);
    if (j.stanTechniczny) wpisz['local.technicalCondition'] = String(j.stanTechniczny);
    if (j.wyposazenie) wpisz['local.layout'] = String(j.wyposazenie);
    // Rubryki tabel opisu budynku i lokalu – tylko z listy dozwolonych i tylko to, co widać.
    const DOZWOLONE = ['building.type', 'building.storeys', 'building.roof', 'building.facade', 'building.condition', 'building.parking', 'building.lift', 'building.installations', 'building.surroundings',
      'local.kitchenType', 'local.bathrooms', 'local.floors', 'local.walls', 'local.windows', 'local.standardLevel', 'local.orientation'];
    for (const [sc, v] of Object.entries(j.pola && typeof j.pola === 'object' ? j.pola : {})) if (DOZWOLONE.includes(sc) && String(v || '').trim()) wpisz[sc] = String(v).slice(0, 400);
    const wpisane = [];
    await autoSledz(async () => { for (const [sc, t] of Object.entries(wpisz)) if (String(getPath(project, sc) || '').trim().length < 10){ setPath(project, sc, t); wpisane.push(sc); } }, 'oględziny ze zdjęć (model w chmurze)');
    if (wpisane.length) zrobione.push(`Opisałem ze zdjęć: ${wpisane.length} ${A.odmien(wpisane.length, 'rubrykę', 'rubryki', 'rubryk')} (opis lokalu, budynku, instalacje, stan).`);
    const OCENY = /^(Niekorzystna|Przeciętna|Korzystna)$/;
    const oceny = {}; for (const [kl, v] of Object.entries(j.oceny && typeof j.oceny === 'object' ? j.oceny : {})) if (OCENY.test(String(v))) oceny[kl] = String(v);
    if (OCENY.test(j.standard || '')){ studioStan().oglednik = { standard: j.standard, uzasadnienie: String(j.standardUzasadnienie || ''), oceny, stan: String(j.stanTechniczny || '') }; zrobione.push(`Standard wykończenia ze zdjęć: ${j.standard.toLowerCase()} — ${j.standardUzasadnienie || ''}`); }
    for (const u of (Array.isArray(j.uwagi) ? j.uwagi : []).slice(0, 5)) braki.push(`Do sprawdzenia na miejscu: ${u}`);
    return { zrobione, braki };
  },

  async kw(k){
    const A = window.OperoAgenci, zrobione = [], braki = [];
    const wklejone = ($('#opisKwTekst')?.value || '').trim();
    const sekcje = project.legal?.ekwImport?.sections || {};
    const saDzialy = Object.values(sekcje).some(x => String(x || '').trim());
    if (wklejone.length >= 20 || saDzialy){
      k.krok('czytam treść księgi');
      const pole = $('#szybkiKwTekst'); if (pole) pole.value = wklejone;
      if (studioStan().kwZeZrzutu && typeof szybkiZeZrzutu !== 'undefined') szybkiZeZrzutu = true;
      const r = typeof szybkiCzytajKw === 'function' ? szybkiCzytajKw() : null;
      if (studioStan().kwZeZrzutu) zrobione.push('Księgę odczytałem ze zrzutów ekranu — wartości oznaczyłem „ze zrzutu"; porównaj je z księgą.');
      if (pole) pole.value = '';
      if (r){
        if ((r.wpisane || []).length) zrobione.push(`Z księgi wpisałem: ${r.wpisane.join(', ')}.`);
        for (const x of (r.rozne || [])) braki.push(`Rozbieżność z księgą — ${x}`);
        if ((r.niepewne || []).length) braki.push(`${r.niepewne.length} ${A.odmien(r.niepewne.length, 'wartość', 'wartości', 'wartości')} z księgi wymaga potwierdzenia ręcznie — porównaj je z księgą w gotowym operacie (oznaczone „ze zrzutu").`);
        const p = $('#opisKwTekst'); if (p && wklejone) p.value = '';
        $('#opisKwPole')?.classList.add('hidden');
      } else if (wklejone.length >= 20) braki.push('Wklejony tekst nie wygląda na księgę wieczystą — skopiuj całą stronę działu z EKW razem z nagłówkiem.');
    }
    // 3.4: pola odczytane przez Claude z obrazów księgi uzupełniają to, czego nie przeczytał parser.
    const zWizji = studioStan().kwZWizji;
    if (zWizji && window.OperoWizja){
      const w = window.OperoWizja.ksiegaDoProjektu(project, zWizji);
      if (w.length) zrobione.push(`Claude odczytał z księgi i wpisał w puste pola: ${w.join(', ')} (oznaczone „ze zrzutu księgi — porównaj z księgą").`);
    }
    k.krok('sprawdzam cyfrę kontrolną');
    const nr = String(project.legal?.kwLocal || '').trim();
    if (nr){
      const c = nr.split('/');
      const spr = window.OperoPola?.sprawdzKw ? window.OperoPola.sprawdzKw({ kod: c[0], numer: c[1], kontrolna: c[2] }) : { ok: true };
      if (spr.ok) zrobione.push(`Numer księgi ${nr} — cyfra kontrolna zgodna.`); else braki.push(`Numer księgi ${nr} ma błędną cyfrę kontrolną — sprawdź go, zanim cokolwiek z niej przepiszesz.`);
    } else braki.push('Brak numeru księgi wieczystej.');
    k.krok('oceniam stan prawny');
    const ocena = A.ocenStanPrawny(project.legal);
    if (ocena.stan === 'brak') braki.push(nr ? 'Mam numer, ale nie mam treści księgi — wrzuć zrzuty/PDF księgi albo kliknij „⚖ Księga z EKW" i otwórz działy.' : 'Nie dostałem treści księgi — wrzuć zrzuty, PDF albo użyj „⚖ Księga z EKW".');
    else {
      (ocena.stan === 'nieokreslony' ? braki : zrobione).push(`Ocena stanu prawnego: ${ocena.tekst}`);
      for (const d of ocena.dobrze) zrobione.push(d);
      for (const u of ocena.uwagi) braki.push(u.tekst);
      // Notatka do operatu – tylko gdy rubryka jest pusta.
      if (!String(project.legal.kwNotes || '').trim() && (ocena.uwagi.length || ocena.dobrze.length)){
        await autoSledz(async () => { project.legal.kwNotes = [...ocena.dobrze, ...ocena.uwagi.map(u => u.tekst)].join(' '); }, 'ocena wpisów księgi');
        zrobione.push('Wpisałem notatkę o wpisach księgi do uwag stanu prawnego.');
      }
    }
    if (!String(project.valuation?.legalStateDate || '').trim() && nr) braki.push('Brak daty, na którą ustalono stan prawny (dzień badania księgi).');
    return { zrobione, braki };
  },

  async lokalizacja(k){
    const zrobione = [], braki = [];
    if (!String(project.property.city || '').trim() || !String(project.property.street || '').trim()) return { braki: ['Bez adresu nie ustalę działki, otoczenia ani planu.'] };
    k.krok('ustalam działkę, otoczenie i plan');
    const a = await autoSledz(async () => { const r = await automatZbierz(); k.krok('przygotowuję kod mapy'); try { await ensureMapsQR(true); } catch {} return r; }, 'rejestry i mapa');
    for (const x of (a.wynik?.wpisane || [])) zrobione.push(`Wpisałem: ${x}.`);
    for (const x of (a.wynik?.uwagi || [])) braki.push(x);
    if (project.location?.mapsQrDataUrl) zrobione.push('Kod QR do mapy przygotowany.');
    if (!String(project.planning?.zoneSymbol || '').trim() && !String(project.planning?.designation || '').trim()) braki.push('Przeznaczenie terenu: wpisz symbol i przeznaczenie z planu miejscowego albo informację o decyzji o warunkach zabudowy (brak planu) — tego program nie może przepisać z mapy.');
    const siec = (a.wynik?.uwagi || []).some(x => /nie odpowiada|połączeni|timeout|sieci|czasie/i.test(String(x)));
    return { zrobione, braki, powtorz: siec || !(a.wynik?.wpisane || []).length };
  },

  async geoportal(k){
    const A = window.OperoAgenci, zrobione = [], braki = [];
    if (!studioAPI('geoportalDzialka')) return { pominiety: true };
    k.krok('znajduję działkę');
    let id = String(project.egib?.plotId || project.legal?.commonProperty?.plotId || '').trim();
    if (!/^\d{6}_\d\.\d{4}\./.test(id) && String(project.property?.city || '').trim()){
      const r = await window.operatAPI.dzialkaPoAdresie({ miasto: project.property.city, ulica: project.property.street || '', numer: project.property.buildingNo || '' }).catch(() => null);
      const d = r?.dzialki?.[0];
      if (d?.id){ id = d.id; project.egib = project.egib || {}; if (!project.egib.plotId) project.egib.plotId = d.id; zrobione.push(`Działka z adresu (ULDK): ${d.id}.`); }
    }
    if (!/^\d{6}_\d\.\d{4}\./.test(id)) return { braki: ['Nie znam identyfikatora działki — podaj go albo wrzuć księgę (z identyfikatora lokalu program go odczyta).'], powtorz: false };
    k.krok('pobieram mapy i legendy');
    let r = await window.operatAPI.geoportalDzialka({ id }).catch(e => ({ ok: false, powod: cleanRemoteError(e) }));
    // 3.3: identyfikator z księgi bywa nieaktualny (podział, scalenie) — wtedy działka spod adresu.
    if (!r?.ok && /nie zna|brak wynik/i.test(String(r?.powod || '')) && String(project.property?.city || '').trim()){
      const a = await window.operatAPI.dzialkaPoAdresie({ miasto: project.property.city, ulica: project.property.street || '', numer: project.property.buildingNo || '' }).catch(() => null);
      const d = a?.dzialki?.[0];
      if (d?.id && d.id !== id){
        braki.push(`Identyfikator działki z księgi (${id}) nie istnieje już w ewidencji — przyjąłem działkę spod adresu: ${d.id}. Sprawdź, czy księga obejmuje tę działkę (np. po podziale).`);
        id = d.id; project.egib = project.egib || {}; project.egib.plotId = d.id;
        r = await window.operatAPI.geoportalDzialka({ id }).catch(e => ({ ok: false, powod: cleanRemoteError(e) }));
      }
    }
    if (!r?.ok) return { zrobione, braki: [`Geoportal nie odpowiedział: ${r?.powod || (r?.bledy || []).join('; ') || 'brak odpowiedzi'}. Załączniki z map dołóż ręcznie albo uruchom agenta ponownie.`], powtorz: true };
    const dz = r.dzialka || {};
    zrobione.push(`Działka ${dz.numer || ''}, obręb ${dz.obreb || ''}, gm. ${dz.gmina || ''}, pow. ${dz.powiat || ''} (${dz.id || id}).`);
    // Pola z ULDK — tylko puste.
    project.egib = project.egib || {};
    const wpisz = (sciezka, w, et) => {
      if (w == null || String(w).trim() === '') return;
      const [a, b] = sciezka.split('.'); project[a] = project[a] || {};
      if (String(project[a][b] || '').trim()) return;
      project[a][b] = w; zrobione.push(`${et}: ${w}`);
      project.autoWpisane = project.autoWpisane || {}; project.autoWpisane[sciezka] = { zrodlo: 'Geoportal (usługi GUGiK)', kiedy: r.kiedy };
    };
    wpisz('egib.plotNo', dz.numer, 'Numer działki'); wpisz('egib.district', dz.obreb, 'Obręb'); wpisz('egib.unit', dz.gmina, 'Jednostka ewidencyjna'); wpisz('egib.plotId', dz.id, 'Identyfikator działki');
    k.krok('czytam opis szczegółowy');
    const ETYKIETY = { 'egib.plotArea': 'Powierzchnia działki (ewidencja)', 'egib.notes': 'Ewidencja — uwagi', 'legal.kwCommon': 'KW nieruchomości wspólnej (z ewidencji)', 'planning.zoneSymbol': 'Symbol terenu w planie', 'planning.designation': 'Przeznaczenie w planie', 'planning.planName': 'Plan miejscowy', 'planning.resolution': 'Uchwała planu' };
    for (const inf of (r.info || [])){
      for (const [sc, w] of Object.entries(inf.pola || {})){ if (!['egib.plotId', 'egib.plotNo', 'egib.district', 'egib.unit'].includes(sc)) wpisz(sc, w, ETYKIETY[sc] || sc); }
      project.files = project.files || [];
      project.files.push({ name: `${inf.tytul}.txt`, size: inf.tekst.length, kind: 'geoportal-opis', tekst: inf.tekst, zrodlo: inf.zrodlo, kiedy: r.kiedy, opis: inf.tytul });
    }
    if ((r.info || []).length) zrobione.push(`Opis szczegółowy działki: ${(r.info || []).map(i => i.tytul.replace('Opis szczegółowy: ', '')).join(', ')} — dołączony i przeczytany.`);
    k.krok('dołączam załączniki');
    const orto = (r.mapy || []).find(m => m.id === 'orto');
    let dodane = 0;
    for (const m of (r.mapy || [])){
      if (m.id === 'orto' && (r.mapy || []).length > 1) continue; // orto jest tłem pozostałych
      if (m.id === 'mpzp' && (r.info || []).some(i => i.usluga === 'mpzp' && /brak serwisu/i.test(i.tekst))) continue; // pusta mapa
      const dataUrl = await studioZlozMape(orto && m.id !== 'orto' ? orto.dataUrl : null, m.dataUrl, r.obrys, r.rozmiar).catch(() => m.dataUrl);
      if (wsadDodajZdjecie({ dataUrl, name: `geoportal-${m.id}-${dz.id}.png`, size: dataUrl.length }, { kategoria: 'Załącznik', podpis: m.podpis + (orto && m.id !== 'orto' ? ' Podkład: ortofotomapa.' : ''), rodzajDokumentu: 'mapa' })) dodane++;
    }
    if (orto){
      const dataUrl = await studioZlozMape(orto.dataUrl, null, r.obrys, r.rozmiar).catch(() => orto.dataUrl);
      if (wsadDodajZdjecie({ dataUrl, name: `geoportal-orto-${dz.id}.png`, size: dataUrl.length }, { kategoria: 'Załącznik', podpis: orto.podpis, rodzajDokumentu: 'mapa' })) dodane++;
    }
    // 3.3: legendy jednej usługi składamy w jedną planszę (ikony są małe — osobno wyglądały jak szum).
    const legendyOk = (r.legendy || []).filter(l => !(l.usluga === 'mpzp' && (r.info || []).some(i => i.usluga === 'mpzp' && /brak serwisu/i.test(i.tekst))));
    for (const usl of [...new Set(legendyOk.map(l => l.usluga))]){
      const grupa = legendyOk.filter(l => l.usluga === usl);
      const tytul = (grupa[0].tytul.split(' — ')[0] || 'Legenda').trim();
      const dataUrl = await studioZlozLegende(tytul, grupa).catch(() => null);
      if (dataUrl && wsadDodajZdjecie({ dataUrl, name: `legenda-${usl}-${dz.id}.png`, size: dataUrl.length }, { kategoria: 'Załącznik', podpis: `${tytul} (warstwy: ${grupa.map(l => l.tytul.split(' — ')[1] || '').filter(Boolean).join(', ')}). Źródło: ${String(grupa[0].zrodlo || '').replace(/^https?:\/\//, '').split('/')[0]}.`, rodzajDokumentu: 'legenda' })) dodane++;
      for (const l of grupa) if (l.tekst){ project.files = project.files || []; project.files.push({ name: `${l.tytul}.txt`, size: l.tekst.length, kind: 'geoportal-legenda', tekst: l.tekst, zrodlo: l.zrodlo, kiedy: r.kiedy, opis: `${l.tytul} (odczyt OCR)`, includeInPDF: false }); }
    }
    if (dodane) zrobione.push(`Załączniki z geoportalu: ${dodane} (mapy z obrysem działki i legendy, z podanym źródłem i datą).`);
    // Widoczne okno geoportalu — agent „patrzy" na działkę jak człowiek i robi zrzut.
    if ($('#geoOkno')?.checked !== false && studioAPI('geoportalOkno')){
      k.krok('oglądam działkę w oknie geoportalu');
      const o = await window.operatAPI.geoportalOkno({ id: dz.id || id }).catch(e => ({ ok: false, powod: cleanRemoteError(e) }));
      if (o?.ok && wsadDodajZdjecie({ dataUrl: o.dataUrl, name: `geoportal-okno-${dz.id || id}.png`, size: o.dataUrl.length }, { kategoria: 'Załącznik', podpis: `Widok działki ${dz.numer || ''} w serwisie Geoportal.gov.pl (zrzut ekranu z ${String(o.kiedy || '').slice(0, 10).split('-').reverse().join('.')}).`, rodzajDokumentu: 'mapa' })) zrobione.push('Zrzut ekranu z geoportalu ustawionego na działce — dołączony.');
      else if (!o?.ok) braki.push(`Zrzut z okna geoportalu nie wyszedł (${o?.powod || 'błąd'}) — mapy z usług są już w załącznikach.`);
    }
    for (const b of (r.bledy || [])) braki.push(`Geoportal — ${b}.`);
    const bezSerwisu = (r.info || []).some(i => i.usluga === 'mpzp' && /brak serwisu/i.test(i.tekst));
    if (bezSerwisu) braki.push('Gmina nie udostępnia planów w krajowej integracji (KIMPZP) — sprawdź plan miejscowy w gminnym serwisie planistycznym (dla Gdańska: geoportal Gdańskiego Systemu Informacji Przestrzennej) albo wypis z planu.');
    else if (!String(project.planning?.zoneSymbol || '').trim() && (r.info || []).some(i => i.usluga === 'mpzp')) braki.push('Usługa planów odpowiedziała, ale bez symbolu terenu — przeczytaj opis szczegółowy w załącznikach i wpisz symbol.');
    if (!bezSerwisu && !(r.info || []).some(i => i.usluga === 'mpzp')) braki.push('Dla działki usługa planów nie zwróciła planu miejscowego — sprawdź, czy plan jest (albo decyzja WZ).');
    changed({ fullDynamic: true });
    return { zrobione, braki };
  },

  async rynek(k){
    const S = window.OperoSzukanie, A = window.OperoAgenci, zrobione = [], braki = [];
    if (!S) return { braki: ['Moduł szukania transakcji jest niedostępny.'] };
    if (!String(project.property.city || '').trim()) return { braki: ['Bez miejscowości nie wyszukam transakcji.'] };
    const przed = (project.market?.transactions || []).length;
    const cel = A.celTransakcji(moduleCode());
    const pole = (id) => document.querySelector(id);
    const start = { promien: Number(pole('#szukPromien')?.value) || 0, okres: Number(pole('#szukOkres')?.value) || 0, odchylka: Number(pole('#szukOdchylka')?.value) || 0 };
    const rundy = A.rundyRynku(start);
    let ostatnia = null;
    // Szukamy „za wszelką cenę", ale od najlepszego porównania: najpierw
    // najbliższe otoczenie i świeże transakcje, dopiero gdy ich za mało — szerzej.
    for (let i = 0; i < rundy.length; i++){
      const r = rundy[i];
      if (agenciPrzerwij) break;
      const ustaw = (id, v) => { const el = pole(id); if (el) el.value = String(v); };
      ustaw('#szukPromien', r.promien); ustaw('#szukOkres', r.okres); ustaw('#szukOdchylka', r.odchylka);
      k.krok(`runda ${i + 1}/${rundy.length}: ${r.opis} — ${r.promien} m, ${r.okres} mies., ±${r.odchylka}%`);
      const przedRunda = (project.market?.transactions || []).length;
      await autoSledz(async () => { szukOtworz(); szukZamknij(); await szukPrzejdz(); return true; }, `Rejestr Cen Nieruchomości i własna baza — runda ${i + 1}`);
      const jestTeraz = (project.market?.transactions || []).length;
      const etapy = (szukPrzebieg?.etapy || []).filter(e => e.automat !== false).map(e => `${e.skrot || e.nazwa || e.id}: ${e.stan === 'blad' || e.blad ? 'brak odpowiedzi' : (e.ile || 0)}`).join(', ');
      zrobione.push(`Runda ${i + 1} (${r.opis}, ${r.promien} m, ${r.okres} mies., ±${r.odchylka}%): +${jestTeraz - przedRunda}, razem ${jestTeraz}.${etapy ? ` Źródła — ${etapy}.` : ''}`);
      ostatnia = r;
      if (jestTeraz >= cel) break;
      // Rejestr nie odpowiada wcale — kolejne rundy nic nie dadzą.
      const rcn = (szukPrzebieg?.etapy || []).find(e => e.id === 'rcn-geoportal');
      if ((rcn?.stan === 'blad' || rcn?.blad) && !jestTeraz) break;
    }
    const jest = (project.market?.transactions || []).length, nowe = jest - przed;
    if (nowe > 0) zrobione.push(`Wstawiłem łącznie ${nowe} ${A.odmien(nowe, 'transakcję', 'transakcje', 'transakcji')} — każda z oznaczeniem źródła (akt / rejestr), do sprawdzenia w tabeli transakcji.`);
    if (jest && !nowe) zrobione.push(`W operacie jest ${jest} ${A.odmien(jest, 'transakcja', 'transakcje', 'transakcji')} — nowych nie znalazłem.`);
    if (ostatnia && jest){
      project.market = project.market || {};
      project.market.definicjaRynku = A.opisRynku(ostatnia, jest, project.property.city);
      project.narratives = project.narratives || {};
      if (!String(project.narratives.market || '').trim()){ project.narratives.market = project.market.definicjaRynku; zrobione.push('Definicję rynku lokalnego wpisałem z faktycznego zakresu szukania.'); }
    }
    // 3.2: agent decyduje sam — przy niedoborze dobiera najbliższe kryteriom pozycje z zapasu (z adnotacją).
    let jestPo = (project.market?.transactions || []).length;
    if (jestPo < cel){
      const zapas = (szukPrzebieg?.znalezione || []).filter(x => x.zZapasu && x.rodzajZrodla !== 'oferty' && !szukJuzWOperacie(x)).slice(0, cel - jestPo);
      const n = zapas.length ? szukWstawNajlepsze(zapas.map(x => ({ ...x, zZapasu: false, uwagiZrodla: `${x.uwagiZrodla || ''} Dobrana z zapasu kryteriów przez Agenta Rynku (niedobór transakcji).`.trim() }))) : 0;
      if (n){ zrobione.push(`Przy niedoborze dobrałem z zapasu kryteriów ${n} ${A.odmien(n, 'transakcję', 'transakcje', 'transakcji')} najbliższych kryteriom — oznaczone w tabeli.`); jestPo += n; }
    }
    if (!jestPo) braki.push('Nie znalazłem żadnej transakcji w żadnej rundzie (do 8 km, 10 lat). Wgraj wyciąg z RCN ze starostwa do „Bazy rynku" — program przeczyta XLSX/CSV.');
    else if (jestPo < cel) braki.push(`Po ${rundy.length} rundach mam ${jestPo} ${A.odmien(jestPo, 'transakcję', 'transakcje', 'transakcji')}, a metoda potrzebuje ok. ${cel}. Zamów wyciąg z RCN w starostwie albo dołóż transakcje z własnej bazy.`);
    return { zrobione, braki, powtorz: !jestPo };
  },

  async obliczenia(k){
    const A = window.OperoAgenci, zrobione = [], braki = [];
    const cechyJuz = (project.market?.features || []).reduce((x, f) => x + (Number(f.weight) || 0), 0) > 0;
    if (!cechyJuz && window.OperoCechy){
      k.krok('dobieram cechy rynkowe i wagi');
      await autoSledz(async () => {
        const C = window.OperoCechy, rodzaj = C.rodzaj(moduleCode(), { zabudowana: !!project.property?.builtUp, segment: !!project.property?.segmentType });
        const stary = window.confirm; window.confirm = () => true;
        try { cechyWstaw(C.sugeruj(rodzaj), rodzaj); } finally { window.confirm = stary; }
        const cechy = project.market.features || [];
        const suma = Math.round(cechy.reduce((x, f) => x + (Number(f.weight) || 0), 0) * 100);
        if (cechy.length && suma !== 100){ const naj = cechy.slice().sort((x, y) => (Number(y.weight) || 0) - (Number(x.weight) || 0))[0]; naj.weight = Math.round(((Number(naj.weight) || 0) + (100 - suma) / 100) * 100) / 100; }
        return true;
      }, 'sugerowany zestaw cech');
      project.autoWpisane = project.autoWpisane || {};
      project.autoWpisane['market.features'] = { zrodlo: 'sugerowany zestaw cech i wag', kiedy: new Date().toISOString(), ile: (project.market.features || []).length };
      const n = (project.market.features || []).length;
      zrobione.push(`Przyjąłem sugerowany zestaw ${n} ${A.odmien(n, 'cechy', 'cech', 'cech')} z wagami sumującymi się do 100%.`);
      const og = studioStan().oglednik, cs = (project.market.features || []).find(f => /standard/i.test(f.name));
      if (og && cs){ cs.rating = og.standard; cs.ratingNote = `Z oglądu zdjęć: ${og.uzasadnienie}`.trim(); zrobione.push(`Ocenę standardu wykończenia ustawiłem ze zdjęć: ${og.standard.toLowerCase()}.`); }
      // Inne oceny widoczne na zdjęciach: stan budynku, garaż, ogródek.
      const WZORY = { stan: /stan techniczny/i, garaz: /gara[żz]/i, ogrodek: /ogr[óo]d/i };
      for (const [kl, ocena] of Object.entries(og?.oceny || {})){
        const f = (project.market.features || []).find(x => WZORY[kl] && WZORY[kl].test(x.name));
        if (f){ f.rating = ocena; if (kl === 'stan' && og.stan) f.ratingNote = `Z oglądu zdjęć: ${og.stan}`; zrobione.push(`Ocena „${f.name}" ze zdjęć: ${ocena.toLowerCase()}.`); }
      }
      braki.push('Oceny cech wycenianej nieruchomości ustawiłem na „przeciętna" — ustaw je po oględzinach, bo od nich zależy wynik.');
    } else if (cechyJuz) zrobione.push('Cechy i wagi były już ustawione — nie zmieniałem ich.');
    // 3.3: macierz ocen — każda transakcja × każda cecha, z uzasadnieniem z danych źródła.
    if (window.OperoOcenyTransakcji && (project.market?.transactions || []).length){
      k.krok('oceniam cechy każdej transakcji');
      const pkt = (typeof szukPunktWyceny !== 'undefined' && szukPunktWyceny) ? { x: szukPunktWyceny.x, y: szukPunktWyceny.y } : null;
      const o = window.OperoOcenyTransakcji.uzupelnij(project, { punkt: pkt, powierzchnia: Number(project.property?.usableArea) || 0 });
      if (o.wpisane) zrobione.push(`Oceniłem cechy transakcji: ${o.wpisane} ${A.odmien(o.wpisane, 'ocena', 'oceny', 'ocen')} (${o.transakcji} × ${o.cech}), każda z uzasadnieniem z danych rejestru${o.zBraku ? `; ${o.zBraku} z braku danych w źródle przyjąłem jako przeciętne` : ''}.`);
      if (o.pominiete) braki.push(`${o.pominiete} ${A.odmien(o.pominiete, 'ocena czeka', 'oceny czekają', 'ocen czeka')} — skala dwustopniowa wymaga Twojej decyzji.`);
      if (o.zBraku) braki.push('Część ocen transakcji to „przeciętna" z braku danych w rejestrze — jeśli znasz te nieruchomości, popraw je.');
    }
    k.krok('liczę wartość');
    calc = obliczProjekt();
    const w = Number(calc?.valueRounded) || 0, j = Number(calc?.unitAfterRound) || 0;
    k.krok('sprawdzam rachunek');
    if (w > 0){
      zrobione.push(`Wartość: ${studioZl(w)}${j > 0 ? ` (${studioZl(j)}/m²)` : ''}.`);
      const pow = Number(project.property?.usableArea) || 0;
      if (pow > 0 && j > 0 && Math.abs(j * pow - w) > Math.max(Number(project.valuation?.roundTo) || 0, w * 0.01) * 1.01) braki.push('Wartość nie zgadza się z iloczynem ceny jednostkowej i powierzchni — sprawdź zaokrąglenie.');
      else if (pow > 0 && j > 0) zrobione.push('Rachunek sprawdzony: cena jednostkowa × powierzchnia zgadza się z wartością w granicach zaokrąglenia.');
    } else braki.push('Nie ma wyniku — brakuje transakcji, powierzchni albo wag.');
    return { zrobione, braki, powtorz: !(w > 0) };
  },

  async analityk(k){
    const R = window.OperoRozumowanie, A = window.OperoAgenci; if (!R) return { pominiety: true };
    k.krok('liczę statystykę cen');
    const st = R.statystyka(project.market?.transactions, project.valuation?.valuationDate);
    if (!st.n) return { braki: ['Nie ma transakcji z ceną — nie mam czego analizować.'] };
    const pl = (n, d) => Number(n).toLocaleString('pl-PL', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
    const zrobione = [
      `Zbiór: ${st.n} ${A.odmien(st.n, 'transakcja', 'transakcje', 'transakcji')}, ceny od ${pl(st.min)} do ${pl(st.max)} zł/m².`,
      `Średnia ${pl(st.srednia)} zł/m², mediana ${pl(st.mediana)} zł/m², zmienność ${pl(st.zmiennosc * 100, 1)}%.`,
    ];
    if (st.okresMies) zrobione.push(`Okres badania rynku: ${st.okresMies} ${A.odmien(st.okresMies, 'miesiąc', 'miesiące', 'miesięcy')}.`);
    k.krok('szukam cen odstających');
    const d = R.mysl(project, calc, {}).decyzje.find(x => x.id === 'rynek');
    if (!st.odstajace.length && st.n >= 6) zrobione.push('Nie ma cen odstających (reguła 1,5 rozstępu ćwiartkowego).');
    return { zrobione, braki: d ? d.zastrzezenia.slice() : [] };
  },

  async metodyk(k){
    const R = window.OperoRozumowanie, A = window.OperoAgenci; if (!R) return { pominiety: true };
    const zrobione = [], braki = [];
    k.krok('ustalam rodzaj wartości i rozważam metody');
    calc = obliczProjekt();
    if (studioWiedzaStan.ile){ k.krok('sprawdzam postępowanie w Twoim podręczniku'); const ile = await studioWiedzaPobierz(); if (ile) zrobione.push(`Postępowanie sprawdzone z podręcznikiem: ${[...new Set([...studioOdwolania('metoda'), ...studioOdwolania('cechy'), ...studioOdwolania('wynik')])].slice(0, 4).join('; ')}.`); }
    const w = studioRozumuj();
    for (const id of ['cel', 'metoda', 'wynik']){
      const d = w.decyzje.find(x => x.id === id); if (!d) continue;
      if (d.rozstrzygniecie) (d.brakDanych || d.pewnosc === 'niska' ? braki : zrobione).push(`${d.tytul}: ${d.rozstrzygniecie}`);
      if (id !== 'wynik' || !d.brakDanych) for (const z of d.zastrzezenia) braki.push(z);
    }
    const alt = (w.decyzje.find(x => x.id === 'metoda')?.mozliwosci || []).filter(m => !m.wybrana).length;
    if (alt) zrobione.push(`Rozważyłem ${alt} ${A.odmien(alt, 'inną metodę', 'inne metody', 'innych metod')} i zapisałem, dlaczego nie zostały przyjęte.`);
    k.krok('piszę uzasadnienia z danych');
    const teksty = R.uzasadnienia(w, project), wpisane = [];
    await autoSledz(async () => {
      for (const [sciezka, tekst] of Object.entries(teksty)){
        // Uzasadnienie podejscia ma w nowym operacie tekst domyslny – zostaje, dopoki ktos go nie usunie.
        if (String(getPath(project, sciezka) || '').trim().length >= 10) continue;
        setPath(project, sciezka, tekst); wpisane.push(sciezka);
      }
    }, 'tok rozumowania (z danych operatu)');
    const nazwy = { 'valuation.approachDescription': 'uzasadnienie podejścia i metody', 'market.marketDescription': 'charakterystyka rynku', 'narratives.result': 'uzasadnienie wyniku' };
    if (wpisane.length) zrobione.push(`Napisałem z liczb operatu: ${wpisane.map(x => nazwy[x] || x).join(', ')}.`);
    return { zrobione, braki };
  },

  async formalny(k){
    const A = window.OperoAgenci, zrobione = [], braki = [];
    const v = project.valuation || {};
    k.krok('sprawdzam daty');
    const daty = [['reportDate', 'data sporządzenia operatu'], ['valuationDate', 'data, na którą określono wartość'], ['priceLevelDate', 'data poziomu cen'], ['inspectionDate', 'data oględzin'], ['legalStateDate', 'data ustalenia stanu prawnego']];
    const brakDat = daty.filter(([p]) => !String(v[p] || '').trim()).map(([, n]) => n);
    if (brakDat.length) braki.push(`Brakuje dat: ${brakDat.join(', ')}.`); else zrobione.push('Komplet pięciu dat istotnych dla wyceny.');
    const dzis = new Date().toISOString().slice(0, 10);
    if (v.inspectionDate && v.reportDate && v.inspectionDate === v.reportDate && v.reportDate === dzis && project.autoWpisane) braki.push('Data oględzin jest dzisiejsza (ustawiona domyślnie) — wpisz dzień, w którym faktycznie oglądałeś nieruchomość.');
    if (v.inspectionDate && v.reportDate && v.inspectionDate > v.reportDate) braki.push('Data oględzin jest późniejsza niż data sporządzenia operatu.');
    k.krok('sprawdzam podstawy i źródła');
    const ile = (l) => (Array.isArray(l) ? l.filter(x => String(x || '').trim()).length : 0);
    const pb = ile(project.legalBases), zr = ile(project.sources), zal = ile(project.attachments);
    if (pb) zrobione.push(`Podstawy prawne: ${pb} ${A.odmien(pb, 'pozycja', 'pozycje', 'pozycji')}.`); else braki.push('Brak podstaw prawnych.');
    if (zr) zrobione.push(`Źródła danych: ${zr} ${A.odmien(zr, 'pozycja', 'pozycje', 'pozycji')}.`); else braki.push('Brak wykazu źródeł danych.');
    if ((project.market?.transactions || []).length && !(project.sources || []).some(x => /rejestr|RCN|cen|transakc/i.test(String(x)))) braki.push('W źródłach nie ma wskazania, skąd pochodzą ceny transakcyjne.');
    if (!String(project.formalBasis || '').trim()) braki.push('Brak podstawy formalnej (zlecenie albo umowa: z kim, kiedy, nr).');
    k.krok('sprawdzam załączniki i klauzule');
    if (zal) zrobione.push(`Załączniki: ${zal} ${A.odmien(zal, 'pozycja', 'pozycje', 'pozycji')} w wykazie.`); else braki.push('Brak wykazu załączników.');
    const plikow = (project.files || []).length, zdjec = (project.photos || []).length;
    if (zal && !plikow && !zdjec) braki.push('W wykazie są załączniki, ale do operatu nie dołączono żadnego pliku ani zdjęcia.');
    if (String(project.clauses || '').trim()) zrobione.push('Klauzule i zastrzeżenia są wpisane.'); else braki.push('Brak klauzul i zastrzeżeń (m.in. okres wykorzystania operatu, zakres odpowiedzialności, wykorzystanie zgodnie z celem).');
    if (!String(project.author?.name || '').trim() || !String(project.author?.licenseNo || '').trim()) braki.push('Brak autora albo numeru uprawnień zawodowych.');
    else zrobione.push(`Autor: ${project.author.name}, uprawnienia nr ${project.author.licenseNo}.`);
    return { zrobione, braki };
  },

  async krytyk(k){
    const R = window.OperoRozumowanie, A = window.OperoAgenci; if (!R) return { pominiety: true };
    k.krok('przechodzę łańcuch decyzji');
    calc = obliczProjekt();
    const w = studioRozumuj();
    k.krok('szukam sprzeczności');
    const zrobione = [`Przeszedłem ${w.decyzje.length} decyzji operatu: ${w.decyzje.map(d => d.tytul.toLowerCase()).join('; ')}.`];
    const mocne = w.decyzje.filter(d => d.pewnosc === 'wysoka').length;
    if (mocne) zrobione.push(`${mocne} ${A.odmien(mocne, 'decyzja ma', 'decyzje mają', 'decyzji ma')} pełne oparcie w danych.`);
    const braki = w.krytyka.slice();
    const slabe = w.decyzje.filter(d => d.pewnosc === 'niska');
    if (slabe.length) braki.push(`Najsłabsze ogniwa: ${slabe.map(d => d.tytul.toLowerCase()).join('; ')}.`);
    if (!braki.length) zrobione.push('Nie znalazłem sprzeczności między decyzjami.');
    return { zrobione, braki };
  },

  async redaktor(k){
    const A = window.OperoAgenci, zrobione = [], braki = [];
    if (studioWiedzaStan.ile && !Object.keys(studioWiedza).length){ k.krok('czytam podręcznik dla każdego rozdziału'); await studioWiedzaPobierz(); }
    if (studioWiedzaStan.ile) zrobione.push(`Każdy opis pisany z zasadami z Twojego podręcznika (${studioWiedzaStan.stron} stron) — bez przepisywania jego tekstu.`);
    const ile = (studioPamiec?.wzorce || []).length;
    if (ile && studioPamiec.uzywaj){ k.krok('dobieram wzorce z Twoich operatów'); zrobione.push(`Piszę w stylu Twoich operatów (${ile} we wzorcach).`); }
    k.krok('piszę opisy');
    calc = obliczProjekt();
    const o = await autoSledz(perNapiszWszystkie, studioMozg?.gotowosc?.aktywny ? 'model w chmurze z danych operatu' : 'PER z danych operatu');
    const r = o.wynik || {};
    const n = (r.napisane || []).length, sz = (r.szkice || []).length;
    if (n) zrobione.push(`Napisałem ${n} ${A.odmien(n, 'opis', 'opisy', 'opisów')}: ${r.napisane.slice(0, 8).join(', ')}${n > 8 ? '…' : ''}.`);
    if (sz) zrobione.push(`Złożyłem ${sz} ${A.odmien(sz, 'szkic', 'szkice', 'szkiców')} z danych (bez modelu): ${r.szkice.slice(0, 6).join(', ')}.`);
    if ((r.brakDanych || []).length) braki.push(`${r.brakDanych.length} ${A.odmien(r.brakDanych.length, 'opis czeka', 'opisy czekają', 'opisów czeka')} na dane: ${r.brakDanych.slice(0, 6).join(', ')}.`);
    if ((r.doDecyzji || []).length) braki.push(`Do Twojej decyzji (w tekście jest wartość spoza danych operatu): ${r.doDecyzji.join(', ')}.`);
    const padl = (r.bledy || []).length > 0;
    if (padl) braki.push('Model nie odpowiedział przy części pól — sprawdź w Ustawieniach, czy model jest wczytany, i uruchom zespół ponownie.');
    if (!n && !sz && !padl && !(r.brakDanych || []).length) zrobione.push('Wszystkie pola opisowe miały już tekst.');
    return { zrobione, braki, powtorz: padl || (r.brakDanych || []).length > 0 };
  },

  /* 3.2: Agent Korektor — wprowadza poprawki weryfikatora sam, bez pytania. */
  async korektor(k){
    const A = window.OperoAgenci, s = studioStan(), w = s.weryfikacja, zrobione = [], braki = [];
    if (!w) return { pominiety: true };
    const ids = w.uwagi.filter(u => u.poprawka || (u.zModelu && u.gdzie && u.polecenie)).map(u => u.id);
    if (!ids.length) return { zrobione: ['Weryfikator nie wskazał nic, co da się poprawić automatycznie.'] };
    k.krok(`wprowadzam ${ids.length} ${A.odmien(ids.length, 'poprawkę', 'poprawki', 'poprawek')}`);
    const r = await studioZastosujIds(ids, t => k.krok(t.slice(0, 80)));
    if (r.ile) zrobione.push(`Wprowadziłem ${r.ile} ${A.odmien(r.ile, 'poprawkę', 'poprawki', 'poprawek')}: ${r.zmiany.slice(0, 6).map(z => z.tytul).join('; ')}${r.zmiany.length > 6 ? '…' : ''}. Każdą możesz cofnąć w raporcie.`);
    if (r.pominiete) braki.push(`${r.pominiete} ${A.odmien(r.pominiete, 'poprawki', 'poprawek', 'poprawek')} nie wprowadziłem — model nie dał bezpiecznej wersji (nie wolno mu dodawać nowych liczb).`);
    changed();
    return { zrobione, braki };
  },

  /* 3.2: Kierownik zespołu — narada nadzoru: kto źle wykonał zadanie, wraca do pracy. */
  async kierownik(k){
    const A = window.OperoAgenci, s = studioStan(), zrobione = [], braki = [];
    const ODPOWIEDZIALNI = { tabele: ['rynek', 'analityk', 'obliczenia'], wagi: ['obliczenia', 'metodyk'], wynik: ['obliczenia', 'metodyk'], tekst: ['redaktor'], formalne: ['formalny', 'zlecenie'], liczby: ['redaktor'], wyglad: [] };
    const RUNDY = 3;
    let runda = 0, bledy = s.weryfikacja?.podsumowanie?.bledy || 0;
    while (runda < RUNDY && !agenciPrzerwij){
      runda++;
      k.krok(`narada ${runda}: przeglądam pracę zespołu`);
      const uw = (s.weryfikacja?.uwagi || []).filter(u => u.waga === 'blad');
      const doPracy = [...new Set(uw.flatMap(u => ODPOWIEDZIALNI[u.dzial] || []))];
      const zBrakami = Object.entries(project.agenci?.przebieg?.agenci || {}).filter(([id, a]) => a.stan === 'blad' && !['kierownik', 'korektor', 'rzeczoznawca', 'kontroler'].includes(id)).map(([id]) => id);
      const lista = [...new Set([...zBrakami, ...doPracy])].filter(id => AGENCI_PRACA[id] && id !== 'kierownik');
      if (!lista.length && !bledy){ zrobione.push(`Narada ${runda}: zespół nie ma błędów do poprawienia.`); break; }
      if (lista.length){
        zrobione.push(`Narada ${runda}: wracają do pracy — ${lista.map(x => A.agent(x)?.nazwa || x).join(', ')}.`);
        for (const id of lista){ if (agenciPrzerwij) break; k.krok(`nadzoruję: ${A.agent(id)?.krotko || id}`); await agenciWykonaj(id, k); }
      }
      k.krok(`narada ${runda}: ponowna weryfikacja`);
      await studioWeryfikuj({ zModelem: true, krok: k.krok });
      const ids = (s.weryfikacja?.uwagi || []).filter(u => u.poprawka || (u.zModelu && u.gdzie && u.polecenie)).map(u => u.id);
      if (ids.length){ const r = await studioZastosujIds(ids, t => k.krok(t.slice(0, 80))); if (r.ile) zrobione.push(`Narada ${runda}: Korektor wprowadził ${r.ile} ${A.odmien(r.ile, 'poprawkę', 'poprawki', 'poprawek')}.`); }
      const teraz = s.weryfikacja?.podsumowanie?.bledy || 0;
      if (!teraz){ zrobione.push(`Po naradzie ${runda} weryfikator nie ma błędów.`); bledy = 0; break; }
      if (teraz >= bledy && runda > 1){ bledy = teraz; break; } // dalsze rundy nic nie zmienią
      bledy = teraz;
    }
    const ps = s.weryfikacja?.podsumowanie || {};
    s.werdykt = { kiedy: new Date().toISOString(), rund: runda, bledy: ps.bledy || 0, uwagi: ps.uwagi || 0,
      zatwierdzony: !(ps.bledy || 0), tekst: !(ps.bledy || 0) ? 'Zespół nadzoru zatwierdza operat do Twojej weryfikacji.' : `Zostało ${ps.bledy} ${A.odmien(ps.bledy, 'błąd', 'błędy', 'błędów')}, których zespół nie może usunąć bez danych od Ciebie.` };
    zrobione.push(`Werdykt: ${s.werdykt.tekst}`);
    if (ps.bledy) braki.push(...(s.weryfikacja?.uwagi || []).filter(u => u.waga === 'blad').slice(0, 8).map(u => u.tytul));
    return { zrobione, braki };
  },

  async rzeczoznawca(k){
    const W = window.OperoWeryfikator, A = window.OperoAgenci, zrobione = [], braki = [];
    k.krok('audyt formalny');
    const w = await studioWeryfikuj({ zModelem: true, krok: k.krok });
    zrobione.push(`Przeszedłem ${w.punktow} ${A.odmien(w.punktow, 'punkt', 'punkty', 'punktów')} kontroli formalnej i przeczytałem ${w.pol} ${A.odmien(w.pol, 'pole', 'pola', 'pól')} opisowych.`);
    if (w.opiniaModelu) zrobione.push('Model przeczytał operat okiem weryfikatora.');
    const ps = w.podsumowanie;
    if (ps.bledy) braki.push(`${ps.bledy} ${A.odmien(ps.bledy, 'błąd', 'błędy', 'błędów')} do poprawienia przed podpisem.`);
    if (ps.uwagi) braki.push(`${ps.uwagi} ${A.odmien(ps.uwagi, 'uwaga', 'uwagi', 'uwag')} do Twojej decyzji.`);
    if (ps.doPoprawy) zrobione.push(`Przygotowałem ${ps.doPoprawy} ${A.odmien(ps.doPoprawy, 'gotową poprawkę', 'gotowe poprawki', 'gotowych poprawek')} — wprowadzi je Agent Korektor.`);
    if (!ps.bledy && !ps.uwagi) zrobione.push('Nie mam zastrzeżeń merytorycznych.');
    void W;
    return { zrobione, braki };
  },
};

/** Tok rozumowania: liczy lancuch decyzji i zapisuje go w operacie (do raportu). */
function studioRozumuj(){
  const R = window.OperoRozumowanie, A = window.OperoAgenci;
  const w = R.mysl(project, calc, { stanPrawny: A.ocenStanPrawny(project.legal), auto: project.autoWpisane || {} });
  const MAPA = { cel: 'przedmiot', przedmiot: 'prawny', rynek: 'rynek', metoda: 'metoda', cechy: 'cechy', wynik: 'wynik' };
  for (const d of w.decyzje){ const o = studioOdwolania(MAPA[d.id] || ''); if (o.length) d.podrecznik = o; }
  studioStan().rozumowanie = { kiedy: new Date().toISOString(), decyzje: w.decyzje, krytyka: w.krytyka, podsumowanie: w.podsumowanie };
  return w;
}

/** Kontrola koncowa. Niczego nie zmienia w operacie – zapisuje tylko liste uwag. */
async function studioWeryfikuj({ zModelem = false, krok = null } = {}){
  const W = window.OperoWeryfikator, s = studioStan();
  calc = obliczProjekt();
  const audyt = window.OperoAudyt ? window.OperoAudyt.audyt(project, calc) : null;
  if (krok) krok('zapis liczb, tabele, wagi i wygląd');
  const wynik = W.sprawdz(project, calc, audyt, { auto: project.autoWpisane || {}, znakWodny: studioZnakTekst() });
  let opinie = [], opiniaSurowa = '', bladModelu = '', opiniaModelu = false;
  const poprzednie = s.weryfikacja;
  if (zModelem && studioAPI('perNapisz')){
    if (krok) krok('lektura operatu przez model');
    try {
      const pol = W.polecenie(project, wynik);
      if (pol.etykiety.length){
        const r = await window.operatAPI.perNapisz({ prompt: pol.prompt, rozdzial: pol.rozdzial });
        const tekst = String(r?.text || '').trim();
        opiniaModelu = !!tekst;
        opinie = W.zOpinii(tekst, pol.etykiety);
        if (tekst && !opinie.length && !/^\s*BRAK\.?\s*$/i.test(tekst)) opiniaSurowa = tekst.slice(0, 4000);
      }
    } catch (e) { bladModelu = cleanRemoteError(e); }
  } else if (poprzednie){
    // Ponowna kontrola regul zachowuje uwagi modelu z poprzedniego czytania.
    opinie = (poprzednie.uwagi || []).filter(u => u.zModelu); opiniaSurowa = poprzednie.opiniaSurowa || ''; opiniaModelu = !!poprzednie.opiniaModelu; bladModelu = poprzednie.bladModelu || '';
  }
  s.weryfikacja = {
    kiedy: new Date().toISOString(), uwagi: [...wynik.uwagi, ...opinie], podsumowanie: wynik.podsumowanie,
    opiniaModelu, opiniaSurowa, bladModelu, punktow: (audyt?.pozycje || []).length, pol: W.teksty(project).length,
  };
  if (opinie.length){ s.weryfikacja.podsumowanie = { ...wynik.podsumowanie, uwagi: wynik.podsumowanie.uwagi + opinie.length, ocena: wynik.podsumowanie.bledy ? 'do-poprawy' : 'z-uwagami' }; }
  return s.weryfikacja;
}

async function studioPowiadom(rodzaj, dane){
  const WA = window.OperoWhatsApp; if (!WA || !studioWa?.gotowosc?.automat || !studioAPI('whatsappWyslij')) return null;
  if (rodzaj === 'agent' && !studioWa.ustawienia?.etapy) return null;
  try { return await window.operatAPI.whatsappWyslij(WA.wiadomosc(rodzaj, { adres: studioAdres(), ...dane })); }
  catch (e) { return { ok: false, powod: cleanRemoteError(e) }; }
}

function studioTekstRaportu(){
  const A = window.OperoAgenci, WA = window.OperoWhatsApp, s = studioStan(); if (!s.przebieg) return '';
  const r = A.raport(s.przebieg);
  return WA.wiadomosc('koniec', { adres: studioAdres(), wartosc: Number(calc?.valueRounded) || 0, jednostkowa: Number(calc?.unitAfterRound) || 0, ileZrobione: r.ileZrobione, ileBrakow: r.ileBrakow, czasTekst: r.czasTekst, poprawki: (s.weryfikacja?.uwagi || []).filter(u => u.poprawka).length, braki: r.braki.flatMap(g => g.pozycje) });
}

async function agenciWykonaj(id, kontekst){
  const A = window.OperoAgenci, p = project.agenci.przebieg;
  A.zacznij(p, id); studioRysuj();
  let wynik;
  try { wynik = await AGENCI_PRACA[id]({ ...kontekst, krok: (t) => { A.krok(p, id, t); studioRysuj(); } }); }
  catch (e) { console.error(e); wynik = { blad: cleanRemoteError(e) }; }
  A.zakoncz(p, id, wynik);
  studioRysuj();
  const x = p.agenci[id];
  await studioPowiadom('agent', { nazwa: A.agent(id).nazwa, stan: x.stan, ile: x.braki.length ? `${x.braki.length} do uzupełnienia` : '', postep: A.postep(p) });
  // Krotki oddech miedzy agentami: okno zdazy pokazac zmiane stanu.
  await new Promise(r => setTimeout(r, uiPrefs?.motion === 'off' ? 0 : 220));
  return x;
}

/** 3.4: mózg AI (Claude) jest warunkiem pracy agentów — jednorazowa zgoda na wysyłanie treści. */
async function studioZgodaMozg(){
  if (!studioAPI('chmuraStan') || !studioAPI('chmuraZapisz')) return true;
  if (!studioMozg) { try { studioMozg = await window.operatAPI.chmuraStan(); } catch {} }
  if (studioMozg?.gotowosc?.aktywny) return true;
  const u = studioMozg?.ustawienia || {};
  if ((u.dostawca || 'opero') !== 'opero' && (studioMozg?.gotowosc?.brak || []).some(b => /klucz|model|adres/.test(b))) {
    studioMowi(`Mózg AI nie jest gotowy — brakuje: ${studioMozg.gotowosc.brak.join(', ')}. Uzupełnij w Ustawieniach albo wybierz „Mózg OPERO”.`, 'pytanie'); return false;
  }
  if (!confirm('Agenci OPERO pracują modelem Claude (AI w chmurze): czytają zrzuty i PDF-y ksiąg, rozpoznają zdjęcia, piszą i sprawdzają operat.\n\nTreść dokumentów i operatu zostanie wysłana do modelu. Zgadzasz się?')) {
    studioMowi('Bez zgody na mózg AI agenci nie mogą czytać dokumentów ani pisać operatu.', 'pytanie'); return false;
  }
  try { studioMozg = await window.operatAPI.chmuraZapisz({ ustawienia: { ...u, wlaczony: true, zgoda: true, dostawca: u.dostawca || 'opero' } }); } catch (e) { studioMowi(cleanRemoteError(e), 'uwaga'); return false; }
  if (typeof mozgOdswiez === 'function') await mozgOdswiez();
  return !!studioMozg?.gotowosc?.aktywny;
}

async function agenciUruchom(){
  const O = window.OperoOpis, A = window.OperoAgenci;
  if (!O || !A || agenciTrwa) return null;
  if (!(await studioZgodaMozg())) return null;
  const opis = String($('#opisTekst')?.value || '').trim();
  studioZlecenieStart = studioZlecenieZPol();
  const kwTekst = String($('#opisKwTekst')?.value || '').trim();
  const w = O.czytaj(opis);
  const maAdres = !!(String(project.property?.city || '').trim() && String(project.property?.street || '').trim());
  const maKsiege = kwTekst.length >= 20 || Object.values(project.legal?.ekwImport?.sections || {}).some(x => String(x || '').trim());
  const maPliki = (project.photos || []).length + (project.files || []).length > 0;
  if (!w.wystarczy && !maAdres && !maKsiege && !maPliki){
    studioMowi('Wrzuć dokumenty (księgę, rzut, zdjęcia) albo napisz adres — od tego zespół zaczyna.', 'pytanie');
    $('#opisTekst')?.focus(); return null;
  }
  // Nowy operat czy dopisanie do otwartego?
  const mod = O.modul(w, opis);
  const fakt = k => String(w.fakty.find(f => f.klucz === k)?.wartosc || '').trim().toLowerCase();
  const innyAdres = maAdres && fakt('city') && fakt('street') && (fakt('city') !== String(project.property.city).trim().toLowerCase() || fakt('street') !== String(project.property.street).trim().toLowerCase());
  let nowyModul = false;
  if (studioProjektZajety() && innyAdres){
    if (!confirm(`Opis dotyczy innej nieruchomości niż otwarty operat (${studioAdres()}).\n\nZacząć nowy operat? Otwarty zostanie zapisany w Historii.`)) return null;
    await createProjectFromModule(mod?.modul || moduleCode()); nowyModul = true;
  } else if (!studioProjektZajety() && mod && mod.modul !== moduleCode()){
    await createProjectFromModule(mod.modul); nowyModul = true;
  } else if (!studioProjektZajety() && mod) nowyModul = true;
  if (nowyModul){ studioZlecenieDlaId = project.meta?.id || ''; studioOpisDlaId = project.meta?.id || ''; if ($('#opisTekst')) $('#opisTekst').value = opis; if ($('#opisKwTekst')) $('#opisKwTekst').value = kwTekst; switchTab('dashboard'); }

  agenciTrwa = true; agenciPrzerwij = false; studioMowi('');
  const dokladnosc = Number($('#opisDokladnosc')?.value) || 2;
  const s = studioStan();
  s.opis = opis; s.weryfikacja = null; s.zastosowane = []; s.reczny = false; s.rozumowanie = null; s.oglednik = null; studioWiedza = {}; await podrecznikOdswiez();
  const p = s.przebieg = A.nowy({ dokladnosc, mozg: studioMozg?.gotowosc?.aktywny ? 'chmura' : 'lokalny' });
  clearInterval(agenciZegar); agenciZegar = setInterval(studioCzasRysuj, 1000);
  studioRysuj();
  await studioPowiadom('start', { agentow: A.ZESPOL.length });
  const kontekst = { opis, nowyModul, modulNiepewny: !!(mod && !mod.pewny) };
  try {
    for (const id of ['zlecenie', 'oglednik', 'kw', 'lokalizacja', 'geoportal', 'rynek', 'analityk', 'obliczenia', 'metodyk', 'redaktor', 'formalny']){
      if (agenciPrzerwij) break;
      await agenciWykonaj(id, kontekst);
      changed();
    }
    // Kontroler: wraca do tego, co sie nie udalo, tyle razy, ile wynosi dokladnosc.
    if (!agenciPrzerwij){
      A.zacznij(p, 'kontroler'); studioRysuj();
      const zrobione = [], braki = [];
      const wartoscPrzed = Number(calc?.valueRounded) || 0;
      for (let nr = 2; nr <= p.dokladnosc && !agenciPrzerwij; nr++){
        const lista = A.doPowtorki(p);
        if (!lista.length) break;
        p.przebieg = nr;
        A.krok(p, 'kontroler', `przebieg ${nr}: wracam do — ${lista.map(x => A.agent(x).krotko).join(', ')}`); studioRysuj();
        for (const id of lista){ if (agenciPrzerwij) break; await agenciWykonaj(id, kontekst); }
        // Nowe dane moga zmienic rachunek i odblokowac opisy.
        if (lista.some(x => ['rynek', 'lokalizacja', 'kw'].includes(x)) && !agenciPrzerwij){
          await agenciWykonaj('analityk', kontekst);
          if (!lista.includes('obliczenia')) await agenciWykonaj('obliczenia', kontekst);
          await agenciWykonaj('metodyk', kontekst);
          if (!lista.includes('redaktor')) await agenciWykonaj('redaktor', kontekst);
        }
        zrobione.push(`Przebieg ${nr}: powtórzyłem pracę agentów — ${lista.map(x => A.agent(x).nazwa).join(', ')}.`);
      }
      calc = obliczProjekt();
      const wartoscPo = Number(calc?.valueRounded) || 0;
      if (p.przebieg === 1) zrobione.push(p.dokladnosc > 1 ? 'Przeszedłem wyniki agentów — nic nie wymagało powtórki.' : 'Jeden przebieg — bez powtórek (tak ustawiono dokładność).');
      if (wartoscPrzed > 0 && wartoscPo > 0 && wartoscPrzed !== wartoscPo) zrobione.push(`Po powtórce wartość zmieniła się z ${studioZl(wartoscPrzed)} na ${studioZl(wartoscPo)}.`);
      else if (wartoscPo > 0) zrobione.push(`Wynik stabilny: ${studioZl(wartoscPo)}.`);
      const zostalo = A.doPowtorki(p);
      // Dane podstawowe po pracy wszystkich agentów – to, czego naprawdę zabrakło.
      if (!String(project.property.city || '').trim() || !String(project.property.street || '').trim()) braki.push('Po pracy zespołu nadal brak adresu nieruchomości.');
      if (!(Number(project.property.usableArea) > 0) && !(Number(project.property.landArea) > 0)) braki.push('Po pracy zespołu nadal brak powierzchni — bez niej nie ma wartości.');
      else zrobione.push(`Dane podstawowe kompletne: ${studioAdres()}, ${String(Number(project.property.usableArea) || Number(project.property.landArea)).replace('.', ',')} m².`);
      const nieudane = Object.entries(p.agenci).filter(([id, a]) => a.stan === 'blad' && id !== 'kontroler').map(([id]) => A.agent(id).nazwa);
      if (nieudane.length) braki.push(`Mimo powtórek nie dokończyli pracy: ${nieudane.join(', ')}.`);
      void zostalo;
      A.zakoncz(p, 'kontroler', { zrobione, braki }); studioRysuj();
    }
    if (!agenciPrzerwij) await agenciWykonaj('krytyk', kontekst);
    if (!agenciPrzerwij) await agenciWykonaj('rzeczoznawca', kontekst);
    if (!agenciPrzerwij) await agenciWykonaj('korektor', kontekst);
    if (!agenciPrzerwij) await agenciWykonaj('kierownik', kontekst);
  } catch (e) { console.error(e); A.zapisz(p, 'kontroler', `Praca przerwana: ${cleanRemoteError(e)}`, 'blad'); }
  clearInterval(agenciZegar); agenciZegar = null;
  p.koniec = new Date().toISOString(); p.stan = agenciPrzerwij ? 'przerwane' : 'gotowe';
  for (const a of Object.values(p.agenci)) if (a.stan === 'pracuje'){ a.stan = 'czeka'; a.krok = ''; }
  agenciTrwa = false;
  calc = obliczProjekt(); changed(); renderAll();
  studioPodpis = ''; studioRysuj();
  const r = A.raport(p);
  if (p.stan === 'gotowe'){
    const wa = await studioPowiadom('koniec', { wartosc: Number(calc?.valueRounded) || 0, jednostkowa: Number(calc?.unitAfterRound) || 0, ileZrobione: r.ileZrobione, ileBrakow: r.ileBrakow, czasTekst: r.czasTekst, poprawki: (s.weryfikacja?.uwagi || []).filter(u => u.poprawka).length, braki: r.braki.flatMap(g => g.pozycje) });
    studioMowi(wa ? (wa.ok ? 'Raport wysłany na WhatsApp.' : `WhatsApp: ${wa.powod}`) : '', wa && !wa.ok ? 'uwaga' : '');
    if (typeof mowi === 'function') mowi(`Zespół skończył: ${r.ileZrobione} zrobione, ${r.ileBrakow} do uzupełnienia. Raport jest na ekranie Start.`, { rodzaj: 'odpowiedz', grupa: 'Zespół agentów', pasek: false });
    showStatus(`Zespół skończył: ${r.ileZrobione} pozycji zrobionych, ${r.ileBrakow} do uzupełnienia. Raport jest na ekranie Start.`, r.ileBrakow ? 'info' : 'success', 10000);
    if (typeof celebrate === 'function' && !r.ileBrakow) { try { celebrate(); } catch {} }
  } else showStatus('Zespół zatrzymany. To, co zostało wpisane, jest w operacie i w raporcie.', 'info', 8000);
  $('#agenciRaport')?.scrollIntoView({ behavior: uiPrefs?.motion === 'full' ? 'smooth' : 'auto', block: 'start' });
  return r;
}

/* ------------------------------------------------- poprawki po akceptacji */

function studioLiczbyZ(tekst){ return (String(tekst || '').match(/\d+(?:[.,]\d+)?/g) || []).map(x => x.replace(',', '.')); }

/** 3.2: rdzeń wprowadzania poprawek — używa go Agent Korektor (bez pytania) i przycisk ręczny. */
async function studioZastosujIds(ids, kom){
  const W = window.OperoWeryfikator, s = studioStan(), w = s.weryfikacja; if (!W || !w || !ids.length) return { ile: 0, pominiete: 0, zmiany: [] };
  kom = kom || (() => {});
  s.zastosowane = s.zastosowane || [];
  const przed = s.zastosowane.length;
  const zmiany = W.zastosuj(project, w, ids);
  s.zastosowane.push(...zmiany);
  let pominiete = 0;
  for (const u of w.uwagi.filter(x => x.zModelu && ids.includes(x.id) && x.gdzie && x.polecenie)){
    const bylo = String(getPath(project, u.gdzie) || '');
    if (bylo.trim().length < 10 || !studioAPI('perRedaguj')){ pominiete++; continue; }
    kom(`Model poprawia: ${u.tytul.slice(0, 60)}…`);
    try {
      const r = await window.operatAPI.perRedaguj({ text: bylo, task: `Popraw wskazaną usterkę, nie dodając żadnych nowych faktów, nazw ani liczb. Usterka: ${u.polecenie}` });
      const jest = String(r?.text || '').trim();
      const stare = new Set(studioLiczbyZ(bylo));
      if (!jest || jest === bylo || studioLiczbyZ(jest).some(x => !stare.has(x))){ pominiete++; continue; }
      setPath(project, u.gdzie, jest);
      s.zastosowane.push({ id: u.id, tytul: u.tytul, sciezka: u.gdzie, bylo, jest });
    } catch { pominiete++; }
  }
  calc = obliczProjekt();
  await studioWeryfikuj({ zModelem: false });
  const zrobione = new Set(s.zastosowane.map(z => z.id));
  s.weryfikacja.uwagi = s.weryfikacja.uwagi.filter(u => !(u.zModelu && zrobione.has(u.id)));
  if (s.przebieg) s.przebieg.poprawki = s.zastosowane.map(z => z.id);
  return { ile: s.zastosowane.length - przed, pominiete, zmiany: s.zastosowane.slice(przed) };
}

async function studioZastosuj(){
  const s = studioStan(); if (!s.weryfikacja) return;
  const ids = $$('#agenciRaport [data-wer-id]').filter(b => b.checked).map(b => b.dataset.werId);
  const kom = t => { const e = $('#werKomunikat'); if (e) e.textContent = t; };
  if (!ids.length){ kom('Zaznacz poprawki, które akceptujesz.'); return; }
  const guzik = document.querySelector('#agenciRaport [data-studio="zastosuj"]'); if (guzik) guzik.disabled = true;
  const r = await studioZastosujIds(ids, kom);
  changed(); renderAll(); studioPodpis = ''; studioRysuj();
  const ile = (s.zastosowane || []).length;
  kom(`Wprowadzone poprawki: ${ile}${r.pominiete ? `, ${r.pominiete} pominiętych (model nie dał bezpiecznej poprawki)` : ''}. Każdą możesz cofnąć.`);
}

async function studioCofnij(){
  const W = window.OperoWeryfikator, s = studioStan(); if (!W || !(s.zastosowane || []).length) return;
  const ile = W.cofnij(project, s.zastosowane);
  s.zastosowane = []; if (s.przebieg) s.przebieg.poprawki = [];
  calc = obliczProjekt();
  await studioWeryfikuj({ zModelem: false });
  changed(); renderAll(); studioPodpis = ''; studioRysuj();
  showStatus(`Cofnięto ${ile} ${ile === 1 ? 'zmianę' : 'zmian'} — operat wrócił do stanu sprzed poprawek.`, 'info', 7000);
}

async function studioWyslijWhatsApp(){
  const tekst = studioTekstRaportu(); if (!tekst) return;
  if (studioWa?.gotowosc?.automat && studioAPI('whatsappWyslij')){
    const r = await window.operatAPI.whatsappWyslij(tekst).catch(e => ({ ok: false, powod: cleanRemoteError(e) }));
    if (r?.ok){ showStatus('Raport wysłany na WhatsApp.', 'success', 6000); return; }
    showStatus(`Automatyczna wysyłka nie wyszła (${r?.powod || 'błąd'}) — otwieram WhatsApp z gotową wiadomością.`, 'info', 9000);
  }
  if (studioAPI('whatsappOtworz')){ try { await window.operatAPI.whatsappOtworz(tekst); showStatus('Otworzyłem WhatsApp z gotową wiadomością — naciśnij „Wyślij".', 'info', 7000); } catch (e) { showStatus(`Nie udało się otworzyć WhatsAppa: ${cleanRemoteError(e)}`, 'error', 8000); } }
}

/* ---------------------------------------------------------- ustawienia */

function studioPole(id){ return $(id); }

async function mozgOdswiez(){
  if (!studioAPI('chmuraStan')) return;
  try { studioMozg = await window.operatAPI.chmuraStan(); } catch { return; }
  const u = studioMozg.ustawienia, g = studioMozg.gotowosc;
  const stan = $('#mozgStan');
  if (stan) stan.textContent = g.aktywny ? (u.dostawca === 'opero' ? 'Mózg OPERO · Claude' : `Claude · ${g.model}`) : `wyłączony — brakuje: ${g.brak.join(', ') || 'włączenia'}`;
  const wlasny = u.dostawca !== 'opero';
  ['#mozgKluczPole', '#mozgModelPole', '#mozgModele', '#mozgUsunKlucz'].forEach(id => $(id)?.classList.toggle('hidden', !wlasny));
  if ($('#mozgDostawca')) $('#mozgDostawca').value = u.dostawca;
  if ($('#mozgBaza') && document.activeElement !== $('#mozgBaza')) $('#mozgBaza').value = u.dostawca === 'zgodny' ? u.baza : '';
  $('#mozgBazaPole')?.classList.toggle('hidden', u.dostawca !== 'zgodny');
  if ($('#mozgModel') && document.activeElement !== $('#mozgModel')) $('#mozgModel').value = u.model;
  if ($('#mozgZgoda')) $('#mozgZgoda').checked = u.zgoda;
  if ($('#mozgKlucz')) $('#mozgKlucz').placeholder = studioMozg.jestKlucz ? 'klucz jest zapisany — wpisz nowy, żeby go zmienić' : 'wklej klucz i naciśnij Zapisz';
  studioZnaczki();
}

function mozgZFormularza(){
  return { wlaczony: true, zgoda: !!$('#mozgZgoda')?.checked, dostawca: $('#mozgDostawca')?.value || 'opero', baza: $('#mozgBaza')?.value || '', model: $('#mozgModel')?.value || '' };
}

async function mozgZapisz({ cicho = false } = {}){
  if (!studioAPI('chmuraZapisz')) return false;
  const kom = $('#mozgKomunikat'), u = mozgZFormularza(), klucz = String($('#mozgKlucz')?.value || '').trim();
  if (!u.zgoda){ if (kom) kom.textContent = 'Zaznacz zgodę — bez niej agenci nie mogą czytać dokumentów ani pisać operatu.'; return false; }
  try {
    studioMozg = await window.operatAPI.chmuraZapisz({ ustawienia: u, klucz });
    if ($('#mozgKlucz')) $('#mozgKlucz').value = '';
    await mozgOdswiez();
    const g = studioMozg.gotowosc;
    if (kom && !cicho) kom.textContent = g.aktywny ? `Zapisane. Agenci pracują modelem Claude${u.dostawca === 'opero' ? ' (Mózg OPERO)' : ` (${g.model})`}.` : `Zapisane, ale mózg jeszcze nie pracuje — brakuje: ${g.brak.join(', ')}.`;
    return true;
  } catch (e) { if (kom) kom.textContent = cleanRemoteError(e); return false; }
}

async function mozgModele(){
  const kom = $('#mozgKomunikat'); if (!(await mozgZapisz({ cicho: true }))) return;
  if (kom) kom.textContent = 'Pobieram listę modeli…';
  const r = await window.operatAPI.chmuraModele().catch(e => ({ ok: false, powod: cleanRemoteError(e), modele: [] }));
  const lista = $('#mozgModeleLista');
  if (lista) lista.innerHTML = (r.modele || []).map(m => `<option value="${escapeHTML(m.id)}">${escapeHTML(m.nazwa)}</option>`).join('');
  if (kom) kom.textContent = r.ok ? `Dostawca udostępnia ${r.modele.length} modeli — wybierz jeden w polu „Model" i zapisz.` : r.powod;
}

async function mozgProbuj(){
  const kom = $('#mozgKomunikat'); if (!(await mozgZapisz({ cicho: true }))) return;
  if (!studioMozg?.gotowosc?.aktywny){ if (kom) kom.textContent = `Model w chmurze nie jest gotowy — brakuje: ${(studioMozg?.gotowosc?.brak || []).join(', ') || 'włączenia'}.`; return; }
  if (kom) kom.textContent = 'Sprawdzam połączenie…';
  const r = await window.operatAPI.chmuraProbuj().catch(e => ({ ok: false, powod: cleanRemoteError(e) }));
  if (kom) kom.textContent = r.ok ? `Połączenie działa. Model odpowiedział: „${r.tekst}".` : `Nie działa: ${r.powod}`;
}

async function waOdswiez(){
  if (!studioAPI('whatsappStan')) return;
  try { studioWa = await window.operatAPI.whatsappStan(); } catch { return; }
  const u = studioWa.ustawienia, g = studioWa.gotowosc, WA = window.OperoWhatsApp;
  const stan = $('#waStan');
  if (stan) stan.textContent = g.automat ? `automatycznie → ${WA.numerPokaz(u.odbiorca)}` : g.wlaczony ? `jednym kliknięciem (do automatu brakuje: ${g.brak.join(', ')})` : u.odbiorca ? `jednym kliknięciem → ${WA.numerPokaz(u.odbiorca)}` : 'jednym kliknięciem (bez zapisanego numeru)';
  const ustaw = (id, v) => { const e = $(id); if (e && document.activeElement !== e) e.value = v; };
  ustaw('#waOdbiorca', u.odbiorca ? WA.numerPokaz(u.odbiorca) : ''); ustaw('#waIdNumeru', u.idNumeru); ustaw('#waSzablon', u.szablon); ustaw('#waJezyk', u.jezyk);
  if ($('#waAutomat')) $('#waAutomat').checked = u.automat;
  if ($('#waEtapy')) $('#waEtapy').checked = u.etapy;
  if ($('#waToken')) $('#waToken').placeholder = studioWa.jestToken ? 'token jest zapisany — wpisz nowy, żeby go zmienić' : 'wklej token i naciśnij Zapisz';
  studioZnaczki();
}

async function waZapisz({ cicho = false } = {}){
  if (!studioAPI('whatsappZapisz')) return false;
  const kom = $('#waKomunikat'), WA = window.OperoWhatsApp;
  const numer = String($('#waOdbiorca')?.value || '').trim();
  if (numer && !WA.numer(numer)){ if (kom) kom.textContent = 'Ten numer nie wygląda na numer telefonu — wpisz 9 cyfr albo numer z kierunkowym.'; return false; }
  const u = { odbiorca: numer, idNumeru: $('#waIdNumeru')?.value || '', szablon: $('#waSzablon')?.value || '', jezyk: $('#waJezyk')?.value || 'pl', automat: !!$('#waAutomat')?.checked, etapy: !!$('#waEtapy')?.checked };
  try {
    studioWa = await window.operatAPI.whatsappZapisz({ ustawienia: u, token: String($('#waToken')?.value || '').trim() });
    if ($('#waToken')) $('#waToken').value = '';
    await waOdswiez();
    const g = studioWa.gotowosc;
    if (kom && !cicho) kom.textContent = g.automat ? 'Zapisane. Agenci wyślą wiadomość sami — na początku i po skończeniu operatu.' : g.wlaczony ? `Zapisane, ale automat jeszcze nie działa — brakuje: ${g.brak.join(', ')}. Do tego czasu wysyłasz jednym kliknięciem.` : 'Zapisane. Raport wyślesz jednym kliknięciem z ekranu Start.';
    if (g.wlaczony && !g.automat) $('#waWiecej')?.setAttribute('open', '');
    return true;
  } catch (e) { if (kom) kom.textContent = cleanRemoteError(e); return false; }
}

async function waProba(){
  const kom = $('#waKomunikat'), WA = window.OperoWhatsApp; if (!(await waZapisz({ cicho: true }))) return;
  const tekst = 'OPERO: wiadomość próbna. Powiadomienia o operatach będą przychodzić na ten numer.';
  if (studioWa?.gotowosc?.automat){
    if (kom) kom.textContent = 'Wysyłam…';
    const r = await window.operatAPI.whatsappWyslij(tekst).catch(e => ({ ok: false, powod: cleanRemoteError(e) }));
    if (kom) kom.textContent = r.ok ? `Wysłane na ${WA.numerPokaz(studioWa.ustawienia.odbiorca)}. Sprawdź telefon.` : `Nie wyszło: ${r.powod}`;
    return;
  }
  try { await window.operatAPI.whatsappOtworz(tekst); if (kom) kom.textContent = 'Otworzyłem WhatsApp z gotową wiadomością — naciśnij w nim „Wyślij".'; }
  catch (e) { if (kom) kom.textContent = cleanRemoteError(e); }
}

function pamiecRysuj(){
  const P = window.OperoPamiec; if (!P) return;
  const pod = P.podsumowanie(studioPamiec);
  const stan = $('#pamiecStan');
  if (stan) stan.textContent = pod.ile ? `${pod.ile} ${pod.ile === 1 ? 'operat' : pod.ile < 5 ? 'operaty' : 'operatów'} · ${pod.rozdzialy.length} ${pod.rozdzialy.length === 1 ? 'rodzaj rozdziału' : 'rodzajów rozdziałów'}` : 'pusto — agent pisze stylem domyślnym';
  const lista = $('#pamiecLista');
  if (lista) lista.innerHTML = (studioPamiec.wzorce || []).slice(0, 12).map(w => `<div class="pamiec-wzor"><div><b>${escapeHTML(w.nazwa)}</b><small>${Object.keys(w.sekcje).map(k => escapeHTML(P.ROZDZIALY.find(r => r.klucz === k)?.nazwa || k)).join(' · ')}</small></div><button class="text-action" type="button" data-pamiec-usun="${escapeHTML(w.id)}">Usuń</button></div>`).join('');
  if (lista && (studioPamiec.wzorce || []).length > 12) lista.insertAdjacentHTML('beforeend', `<p class="hint">…i ${studioPamiec.wzorce.length - 12} starszych. Agent dobiera wzór z całej pamięci.</p>`);
  if ($('#pamiecUzywaj')) $('#pamiecUzywaj').checked = studioPamiec.uzywaj !== false;
  if ($('#pamiecUczSie')) $('#pamiecUczSie').checked = studioPamiec.uczSie !== false;
  studioZnaczki();
}

async function pamiecZapisz(){
  if (studioAPI('pamiecZapisz')){ try { studioPamiec = await window.operatAPI.pamiecZapisz(studioPamiec); } catch (e) { const k = $('#pamiecKomunikat'); if (k) k.textContent = cleanRemoteError(e); } }
  pamiecRysuj();
}

async function pamiecDodajTeksty(pliki){
  const P = window.OperoPamiec, kom = $('#pamiecKomunikat'); if (!P) return;
  const dobre = [], zle = [];
  for (const pl of pliki){
    if (!pl.ok){ zle.push(`${pl.nazwa}: ${pl.powod}`); continue; }
    const r = P.zTekstu(pl.nazwa, pl.tekst, { rodzaj: moduleCode() });
    if (!r.ok){ zle.push(`${pl.nazwa}: ${r.powod}`); continue; }
    const d = P.dodaj(studioPamiec, r.wzorzec);
    if (!d.ok){ zle.push(`${pl.nazwa}: ${d.powod}`); break; }
    studioPamiec = d.stan; dobre.push(`${r.wzorzec.nazwa} (${Object.keys(r.wzorzec.sekcje).length} rozdz.)`);
  }
  if (dobre.length) await pamiecZapisz();
  if (kom) kom.textContent = [dobre.length ? `Zapamiętane: ${dobre.join(', ')}.` : '', zle.length ? `Nie wczytałem — ${zle.join('; ')}` : ''].filter(Boolean).join(' ') || 'Nic nie wybrano.';
}

async function pamiecWgrajFolder(){
  if (!studioAPI('pamiecWczytajFolder')) return;
  const kom = $('#pamiecKomunikat'), btn = $('#pamiecFolder');
  if (btn) btn.disabled = true;
  const stop = studioAPI('onPamiecPostep') ? window.operatAPI.onPamiecPostep(d => { if (kom) kom.textContent = `Czytam operaty… ${d.zrobione} z ${d.razem}`; }) : null;
  let r;
  try { r = await window.operatAPI.pamiecWczytajFolder({ rodzaj: '' }); } catch (e) { r = { canceled: false, blad: cleanRemoteError(e) }; }
  if (typeof stop === 'function') stop();
  if (btn) btn.disabled = false;
  if (r?.canceled) return;
  if (r?.blad){ if (kom) kom.textContent = r.blad; return; }
  if (r.stan) studioPamiec = r.stan;
  pamiecRysuj();
  if (!kom) return;
  if (!r.znaleziono){ kom.textContent = 'W tym folderze nie ma plików Word (.docx) ani tekstowych. Operaty w PDF trzeba najpierw zapisać jako Word albo wkleić jako tekst.'; return; }
  const odrz = r.odrzuconych || (r.odrzucone || []).length;
  const powody = {}; for (const o of (r.odrzucone || [])) { const k = String(o.powod).split(' — ')[0].slice(0, 70); powody[k] = (powody[k] || 0) + 1; }
  kom.textContent = `Znalazłem ${r.znaleziono} plików. Zapamiętane: ${r.dodane.length}.${odrz ? ` Pominięte: ${odrz} (${Object.entries(powody).slice(0, 3).map(([k, v]) => `${v}× ${k}`).join('; ')}).` : ''}`;
}

/** Operat zatwierdzony przez rzeczoznawce staje sie wzorcem stylu. */
async function studioUczSieZOperatu(){
  const P = window.OperoPamiec, W = window.OperoWeryfikator;
  if (!P || !W || studioPamiec?.uczSie === false) return null;
  const r = P.zProjektu(studioAdres() || 'Operat zatwierdzony', W.teksty(project).map(t => ({ sciezka: t.sciezka, tekst: t.tekst })), { rodzaj: moduleCode(), id: 'p' + String(project.meta?.id || '').slice(0, 30) });
  if (!r.ok) return null;
  // Ten sam operat zatwierdzony ponownie zastepuje swoj poprzedni wzorzec.
  studioPamiec = P.usun(studioPamiec, r.wzorzec.id);
  const d = P.dodaj(studioPamiec, r.wzorzec);
  if (!d.ok) return null;
  studioPamiec = d.stan; await pamiecZapisz();
  return r.wzorzec;
}

async function pamiecWgraj(){
  if (!studioAPI('pamiecWczytajPliki')) return;
  const r = await window.operatAPI.pamiecWczytajPliki().catch(e => ({ canceled: false, pliki: [{ nazwa: 'plik', ok: false, powod: cleanRemoteError(e) }] }));
  if (r?.canceled) return;
  await pamiecDodajTeksty(r.pliki || []);
}

/* --------------------------------------------------------------- start */

/* 3.1: składanie mapy jak na geoportalu — podkład, warstwa, obrys działki. */
function studioZlozMape(tlo, warstwa, obrys, rozmiar){
  return new Promise((ok, zle) => {
    const n = rozmiar || 1200, c = document.createElement('canvas'); c.width = n; c.height = n;
    const g = c.getContext('2d'); if (!g) return zle(new Error('brak canvas'));
    g.fillStyle = '#fff'; g.fillRect(0, 0, n, n);
    const wczytaj = (u) => new Promise(r => { if (!u) return r(null); const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = u; });
    Promise.all([wczytaj(tlo), wczytaj(warstwa)]).then(([a, b]) => {
      if (a) g.drawImage(a, 0, 0, n, n);
      if (b){ g.globalAlpha = a ? 0.85 : 1; g.drawImage(b, 0, 0, n, n); g.globalAlpha = 1; }
      for (const pier of (obrys || [])){
        if (!pier.length) continue;
        g.beginPath(); pier.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
        g.lineWidth = 7; g.strokeStyle = 'rgba(255,255,255,.85)'; g.stroke();
        g.lineWidth = 3.5; g.strokeStyle = '#e0261b'; g.stroke();
      }
      ok(c.toDataURL('image/jpeg', 0.88));
    }, zle);
  });
}

/* 3.3: plansza legendy — ikony warstw w naturalnej skali ×2 z podpisami. */
function studioZlozLegende(tytul, legendy){
  return new Promise((ok, zle) => {
    const wczytaj = (u) => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = u; });
    Promise.all(legendy.map(l => wczytaj(l.dataUrl))).then(obrazy => {
      const wiersze = legendy.map((l, i) => ({ img: obrazy[i], tekst: l.tytul.split(' — ')[1] || l.tytul })).filter(x => x.img);
      if (!wiersze.length) return zle(new Error('brak obrazów'));
      const skala = (img) => Math.min(3, Math.max(1, 64 / Math.max(img.naturalWidth, img.naturalHeight)));
      const W = 1000, pad = 28, glowa = 64;
      const wys = wiersze.map(w => Math.max(40, w.img.naturalHeight * skala(w.img)) + 18);
      const c = document.createElement('canvas'); c.width = W; c.height = glowa + wys.reduce((a, b) => a + b, 0) + pad;
      const g = c.getContext('2d'); if (!g) return zle(new Error('brak canvas'));
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#1d1d1f'; g.font = 'bold 26px Arial'; g.fillText(tytul, pad, 42);
      let y = glowa; g.imageSmoothingEnabled = false;
      wiersze.forEach((w, i) => {
        const k = skala(w.img), iw = w.img.naturalWidth * k, ih = w.img.naturalHeight * k;
        g.drawImage(w.img, pad, y + 4, iw, ih);
        g.fillStyle = '#333'; g.font = '20px Arial'; g.fillText(w.tekst, pad + Math.max(iw, 80) + 20, y + 4 + Math.min(ih, 40) / 2 + 7);
        y += wys[i];
      });
      ok(c.toDataURL('image/png'));
    }, zle);
  });
}

/* ---- 3.1: Zlecenie (jedyne dane wpisywane ręcznie) ---------------------- */
function studioZlecenieZPol(){
  const v = id => String($(id)?.value || '').trim();
  return { kto: v('#zlecKto'), nr: v('#zlecNr'), data: v('#zlecData'), cel: v('#zlecCel') };
}
let studioZlecenieDlaId = null, studioZlecenieStart = null;
function studioZlecenieRysuj(){
  const k = project?.client || {};
  const idP = project?.meta?.id || '';
  if (studioZlecenieDlaId !== null && studioZlecenieDlaId !== idP && studioProjektZajety()){
    for (const id of ['#zlecKto', '#zlecNr', '#zlecData', '#zlecCel']){ const el = $(id); if (el) el.value = ''; }
  }
  studioZlecenieDlaId = idP;
  const wstaw = (id, w) => { const el = $(id); if (el && !String(el.value || '').trim() && w) el.value = w; };
  wstaw('#zlecKto', k.name || k.company); wstaw('#zlecNr', k.contractNo); wstaw('#zlecData', /^\d{4}-\d{2}-\d{2}$/.test(k.contractDate || '') ? k.contractDate : '');
  wstaw('#zlecCel', k.purpose || '');
  const el = $('#zlecAutor'); if (!el) return;
  const a = project?.author || {}, p = (typeof profilCache !== 'undefined' && profilCache) || {};
  const imie = String(a.name || p.name || '').trim(), nr = String(a.licenseNo || p.licenseNo || '').trim();
  el.textContent = imie ? `Autor: ${imie}${nr ? ` · upr. nr ${nr}` : ''} (z Ustawień)` : 'Autor: uzupełnij profil w Ustawieniach';
  el.classList.toggle('brak', !imie);
}

function hookStudio(){
  if (!$('#studio')) return;
  $('#opisTekst')?.addEventListener('input', () => { clearTimeout(studioOpisCzas); studioOpisCzas = setTimeout(() => { studioFaktyRysuj(); studioMowi(''); }, 180); });
  $('#opisKwWklej')?.addEventListener('click', () => { const p = $('#opisKwPole'); p?.classList.toggle('hidden'); if (!p?.classList.contains('hidden')) $('#opisKwTekst')?.focus(); });
  $('#opisKwTekst')?.addEventListener('input', studioDokumentyStan);
  $('#opisKwZrzuty')?.addEventListener('click', async () => {
    if (typeof szybkiKwZeZrzutow !== 'function') return;
    studioMowi('Czytam zrzuty księgi…');
    const r = await szybkiKwZeZrzutow();
    studioMowi(r === null ? '' : r?.ok === false ? `Nie odczytałem zrzutów: ${r.powod}` : 'Zrzuty odczytane — Agent Ksiąg Wieczystych sprawdzi je przy starcie. Liczby ze zrzutów potwierdzasz ręcznie.', r?.ok === false ? 'uwaga' : '');
    studioDokumentyStan();
  });
  $('#opisZdjecia')?.addEventListener('click', () => $('#addPhotos')?.click());
  $('#opisPliki')?.addEventListener('click', () => $('#addFiles')?.click());
  $('#agenciStart')?.addEventListener('click', agenciUruchom);
  $('#zlecAutor')?.addEventListener('click', () => { if (typeof switchTab === 'function') switchTab('settings'); });
  setTimeout(() => { try { studioZlecenieRysuj(); } catch {} }, 0);
  $('#agenciStop')?.addEventListener('click', () => { agenciPrzerwij = true; studioMowi('Zatrzymuję po zakończeniu bieżącego agenta…'); });
  $('#wynikSciezka')?.addEventListener('click', async ev => {
    const b = ev.target.closest('.sciezka-krok'); if (!b) return;
    if (b.dataset.sciezkaTab){ switchTab(b.dataset.sciezkaTab); return; }
    const co = b.dataset.sciezkaAkcja;
    if (co === 'sprawdz'){ await studioWeryfikuj({ zModelem: false }); const s = studioStan(); if (!s.przebieg){ const A = window.OperoAgenci; s.przebieg = A.nowy({ dokladnosc: 1 }); A.zacznij(s.przebieg, 'rzeczoznawca'); A.zakoncz(s.przebieg, 'rzeczoznawca', { zrobione: ['Kontrola reguł uruchomiona z ekranu Wynik.'] }); for (const [id, a] of Object.entries(s.przebieg.agenci)) if (id !== 'rzeczoznawca') a.stan = 'pominiety'; s.przebieg.stan = 'gotowe'; s.przebieg.koniec = new Date().toISOString(); s.reczny = true; } changed(); studioPodpis = ''; switchTab('dashboard'); studioRysuj(); setTimeout(() => $('#agenciRaport')?.scrollIntoView({ block: 'start' }), 120); }
    else if (co === 'raport'){ switchTab('dashboard'); setTimeout(() => document.querySelector('#agenciRaport .wer-karta')?.scrollIntoView({ block: 'start' }), 120); }
    else if (co === 'etapy') $('#autoPrzegladKarta')?.scrollIntoView({ block: 'start' });
    else if (co === 'pdf') document.querySelector('.report-editor')?.scrollIntoView({ block: 'start' });
  });
  $('#studioUstawienia')?.addEventListener('click', () => { switchTab('settings'); setTimeout(() => $('#mozgKarta')?.scrollIntoView({ block: 'start' }), 80); });
  $('#agenciRaport')?.addEventListener('click', ev => {
    const b = ev.target.closest('[data-studio]'), etap = ev.target.closest('[data-studio-etap]'), gdzie = ev.target.closest('[data-wer-gdzie]');
    if (etap){ ev.preventDefault(); switchTab(etap.dataset.studioEtap); return; }
    if (gdzie){
      ev.preventDefault();
      const sciezka = gdzie.dataset.werGdzie, pole = document.querySelector(`[data-path="${sciezka}"]`);
      const tab = pole?.closest('.tab')?.id?.replace('tab-', '') || (typeof autoEtapPola === 'function' ? autoEtapPola(sciezka) : '') || (/^market\./.test(sciezka) ? 'market' : /^(author|property|valuation)\./.test(sciezka) ? 'project' : 'result');
      switchTab(tab); setTimeout(() => { pole?.scrollIntoView({ block: 'center' }); pole?.focus?.(); }, 120);
      return;
    }
    if (!b) return;
    const co = b.dataset.studio;
    if (co === 'etapy' || co === 'wynik'){ switchTab('result'); }
    else if (co === 'word'){ if (typeof eksportDocx === 'function') eksportDocx(); }
    else if (co === 'podglad'){ switchTab('result'); setTimeout(() => document.querySelector('.report-editor')?.scrollIntoView({ block: 'start' }), 120); }
    else if (co === 'whatsapp') studioWyslijWhatsApp();
    else if (co === 'zastosuj') studioZastosuj();
    else if (co === 'cofnij') studioCofnij();
    else if (co === 'pdf') exportPDF();
    else if (co === 'odswiez') studioPodgladOperatu();
    else if (co === 'ponownie') studioWeryfikuj({ zModelem: false }).then(() => { changed(); studioPodpis = ''; studioRysuj(); });
  });
  // Ustawienia agentow
  document.querySelectorAll('input[name="mozgTryb"]').forEach(r => r.addEventListener('change', () => $('#mozgChmura')?.classList.toggle('hidden', mozgZFormularza().wlaczony !== true)));
  $('#mozgDostawca')?.addEventListener('change', () => { const v = $('#mozgDostawca').value; $('#mozgBazaPole')?.classList.toggle('hidden', v !== 'zgodny'); ['#mozgKluczPole', '#mozgModelPole', '#mozgModele', '#mozgUsunKlucz'].forEach(id => $(id)?.classList.toggle('hidden', v === 'opero')); });
  $('#mozgZapisz')?.addEventListener('click', () => mozgZapisz());
  $('#mozgModele')?.addEventListener('click', mozgModele);
  $('#mozgProbuj')?.addEventListener('click', mozgProbuj);
  $('#mozgUsunKlucz')?.addEventListener('click', async () => { if (!studioAPI('chmuraZapisz')) return; studioMozg = await window.operatAPI.chmuraZapisz({ usunKlucz: true }); await mozgOdswiez(); const k = $('#mozgKomunikat'); if (k) k.textContent = 'Klucz usunięty. Agenci pracują na modelu lokalnym PER.'; });
  $('#waZapisz')?.addEventListener('click', () => waZapisz());
  $('#waProba')?.addEventListener('click', waProba);
  $('#waUsunToken')?.addEventListener('click', async () => { if (!studioAPI('whatsappZapisz')) return; studioWa = await window.operatAPI.whatsappZapisz({ usunToken: true }); await waOdswiez(); const k = $('#waKomunikat'); if (k) k.textContent = 'Token usunięty. Wysyłka działa jednym kliknięciem.'; });
  $('#pamiecDodaj')?.addEventListener('click', pamiecWgraj);
  $('#pamiecFolder')?.addEventListener('click', pamiecWgrajFolder);
  $('#pamiecUczSie')?.addEventListener('change', () => { studioPamiec.uczSie = !!$('#pamiecUczSie').checked; pamiecZapisz(); });
  $('#pamiecWklejBtn')?.addEventListener('click', () => $('#pamiecWklejPole')?.classList.toggle('hidden'));
  $('#pamiecWklejZapisz')?.addEventListener('click', async () => {
    const tekst = String($('#pamiecTekst')?.value || ''), nazwa = String($('#pamiecNazwa')?.value || '').trim() || 'Operat wklejony';
    await pamiecDodajTeksty([{ nazwa, ok: true, tekst }]);
    if ((studioPamiec.wzorce || []).some(w => w.nazwa === nazwa)){ $('#pamiecTekst').value = ''; $('#pamiecNazwa').value = ''; $('#pamiecWklejPole')?.classList.add('hidden'); }
  });
  $('#pamiecUzywaj')?.addEventListener('change', () => { studioPamiec.uzywaj = !!$('#pamiecUzywaj').checked; pamiecZapisz(); });
  $('#pamiecLista')?.addEventListener('click', ev => { const b = ev.target.closest('[data-pamiec-usun]'); if (!b || !window.OperoPamiec) return; studioPamiec = window.OperoPamiec.usun(studioPamiec, b.dataset.pamiecUsun); pamiecZapisz(); });
  // Historia odswieza sie przy kazdym wejsciu – zawsze pokazuje stan z dysku.
  document.querySelectorAll('.nav-btn[data-tab="history"]').forEach(b => b.addEventListener('click', () => { if (typeof loadHistory === 'function') loadHistory(); }));
  const ekranWynik = $('#tab-result');
  if (ekranWynik) new MutationObserver(() => { if (ekranWynik.classList.contains('active')){ wynikSciezkaRysuj(); wynikOperatRysuj(); } }).observe(ekranWynik, { attributes: true, attributeFilter: ['class'] });
  $('#studioNowyPusty')?.addEventListener('click', async () => {
    if (agenciTrwa) return;
    if (studioProjektZajety() && !confirm('Zacząć nowy, pusty operat? Obecny jest zapisany w Historii.')) return;
    await createProjectFromModule(moduleCode()); switchTab('dashboard');
    for (const id of ['#zlecKto', '#zlecNr', '#zlecData', '#zlecCel', '#opisTekst', '#opisKwTekst']){ const el = $(id); if (el) el.value = ''; }
    studioZlecenieDlaId = project.meta?.id || ''; studioRysuj(); if (typeof wsadRysuj === 'function') try { wsadRysuj(); } catch {}
    studioMowi('Nowy operat. Podaj zlecenie i wrzuć dokumenty.');
  });
  $('#wsadEkw')?.addEventListener('click', ev => { ev.stopPropagation(); studioEkwOtworz(); });
  window.operatAPI?.onEkwTekst?.(d => studioEkwPrzyjmij(d));
  window.operatAPI?.onEkwKoniec?.(d => studioMowi(d?.stron ? `Okno EKW zamknięte — przepisałem ${d.stron} ${window.OperoAgenci.odmien(d.stron, 'stronę', 'strony', 'stron')} księgi.` : 'Okno EKW zamknięte — nie wyświetliłeś żadnego działu.'));
  $('#zbieraczTeraz')?.addEventListener('click', async () => { const el = $('#zbieraczStan'); if (el) el.textContent = 'Zbieram…'; await window.operatAPI.zbieraczTeraz?.().catch(() => null); zbieraczRysuj(); if (typeof bazaOdswiez === 'function') try { await bazaOdswiez(); } catch {} });
  $('#zbieraczWl')?.addEventListener('change', async e => { await window.operatAPI.zbieraczUstaw?.({ wlaczony: e.target.checked }); zbieraczRysuj(); });
  window.operatAPI?.onZbieraczKoniec?.(() => zbieraczRysuj());
  const ekranBaza = $('#tab-baza');
  if (ekranBaza) new MutationObserver(() => { if (ekranBaza.classList.contains('active')) zbieraczRysuj(); }).observe(ekranBaza, { attributes: true, attributeFilter: ['class'] });
  $('#wynikWord')?.addEventListener('click', () => { if (typeof eksportDocx === 'function') eksportDocx(); });
  $('#wynikPdf')?.addEventListener('click', () => exportPDF());
  mozgOdswiez(); waOdswiez();
  podrecznikOdswiez();
  $('#wiedzaDodaj')?.addEventListener('click', () => { if (typeof wsadWybierz === 'function') wsadWybierz().then(podrecznikOdswiez); });
  $('#wiedzaLista')?.addEventListener('click', async ev => { const b = ev.target.closest('[data-wiedza-usun]'); if (!b || !studioAPI('podrecznikUsun')) return; await window.operatAPI.podrecznikUsun(b.dataset.wiedzaUsun); podrecznikOdswiez(); });
  if (studioAPI('pamiecOdczytaj')) window.operatAPI.pamiecOdczytaj().then(st => { studioPamiec = st || studioPamiec; pamiecRysuj(); }).catch(() => pamiecRysuj()); else pamiecRysuj();
  studioZnaczki(); studioRysuj();
}

document.addEventListener('DOMContentLoaded', hookStudio);
