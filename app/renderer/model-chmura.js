/* OPERO — model w chmurze (opcjonalny „mozg” agentow)
 *
 * Domyslnie agenci pisza i oceniaja modelem lokalnym PER – nic nie wychodzi
 * z komputera. Kto chce mocniejszego weryfikatora, wpisuje w Ustawieniach
 * WLASNY klucz do modelu w chmurze i swiadomie go wlacza. Wtedy tresc polecen
 * (fragmenty operatu: adres, opisy, dane z ksiegi) jest wysylana do dostawcy.
 *
 * Obslugiwane sa dwa formaty:
 *  - „anthropic”  – Messages API (naglowek x-api-key),
 *  - „zgodny”     – format chat/completions, ktory rozumie wiekszosc
 *                   dostawcow (naglowek Authorization: Bearer); adres
 *                   serwera podaje uzytkownik.
 * Nazwy modelu program nie zgaduje: pobiera liste z konta uzytkownika
 * (`zadanieListy`) albo przyjmuje wpisana recznie.
 *
 * Modul jest czysty: buduje zadania i czyta odpowiedzi, niczego nie wysyla.
 */
'use strict';

/** 3.4: Mózg OPERO — Claude przez serwer automatyzacji n8n autora programu.
 *  Klient nie potrzebuje własnego klucza: wpuszcza go ważna licencja OPERO. */
const CH_MOZG_OPERO = 'https://matio.app.n8n.cloud/webhook/opero-mozg';
const CH_DOSTAWCY = [
  { id: 'opero', nazwa: 'Mózg OPERO (Claude, bez własnego klucza)', baza: CH_MOZG_OPERO, stalaBaza: true, bezKlucza: true, strona: '' },
  { id: 'anthropic', nazwa: 'Anthropic (Claude)', baza: 'https://api.anthropic.com', stalaBaza: true, strona: 'https://console.anthropic.com/' },
  { id: 'zgodny', nazwa: 'Inny dostawca (format OpenAI)', baza: 'https://api.openai.com', stalaBaza: false, strona: '' },
];

function chDostawca(id){ return CH_DOSTAWCY.find(d => d.id === id) || null; }

/** Adres serwera: tylko https, bez danych logowania w adresie, bez sciezki /v1 na koncu. */
function chBaza(dostawca, adres){
  const d = chDostawca(dostawca); if (!d) return '';
  if (d.stalaBaza) return d.baza;
  let u; try { u = new URL(String(adres || d.baza).trim()); } catch { return ''; }
  if (u.protocol !== 'https:' || u.username || u.password) return '';
  return (u.origin + u.pathname).replace(/\/+$/, '').replace(/\/v1$/, '');
}

function chUstawieniaCzyste(u){
  const x = u && typeof u === 'object' ? u : {};
  const dostawca = chDostawca(x.dostawca) ? x.dostawca : 'opero';
  return {
    // 3.4: agenci pracują wyłącznie modelem w chmurze — domyślnie włączony (zgodę daje człowiek).
    wlaczony: x.wlaczony !== false, zgoda: x.zgoda === true, dostawca,
    baza: chBaza(dostawca, x.baza), model: String(x.model || '').trim().replace(/[^A-Za-z0-9._:\/\-]/g, '').slice(0, 120),
  };
}

/** Model w chmurze pracuje tylko wtedy, gdy WSZYSTKIE warunki sa spelnione. */
function chGotowosc(u, jestKlucz){
  const x = chUstawieniaCzyste(u), brak = [], d = chDostawca(x.dostawca) || {};
  if (!d.bezKlucza && !jestKlucz) brak.push('klucz');
  if (!d.bezKlucza && !x.model) brak.push('nazwa modelu');
  if (!x.baza) brak.push('adres serwera (https)');
  if (!x.zgoda) brak.push('zgoda na wysyłanie treści operatu');
  return { aktywny: x.wlaczony && !brak.length, wlaczony: x.wlaczony, brak, dostawca: x.dostawca, model: x.model };
}

function chNaglowki(dostawca, klucz){
  return dostawca === 'anthropic'
    ? { 'content-type': 'application/json', 'x-api-key': String(klucz), 'anthropic-version': '2023-06-01' }
    : { 'content-type': 'application/json', authorization: `Bearer ${klucz}` };
}

/** Zadanie napisania tekstu. `wiadomosci`: [{role:'system'|'user'|'assistant', content}] */
function chZadanie(u, klucz, wiadomosci, opcje){
  const x = chUstawieniaCzyste(u), o = opcje || {};
  if (x.dostawca === 'opero') return chZadanieOpero(wiadomosci, o);
  if (!x.baza || !x.model || !klucz) return null;
  // Tresc moze byc tekstem albo lista czesci: {type:'text', text} i {type:'image', dataUrl}.
  const czesci = (c, format) => {
    if (!Array.isArray(c)) return String(c || '');
    const out = [];
    for (const x of c){
      if (x && x.type === 'text' && x.text) out.push({ type: 'text', text: String(x.text) });
      else if (x && x.type === 'image'){
        const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(x.dataUrl || ''));
        if (!m) continue;
        out.push(format === 'anthropic' ? { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } } : { type: 'image_url', image_url: { url: x.dataUrl } });
      }
    }
    return out;
  };
  const lista = (wiadomosci || []).map(m => ({ role: m.role, content: m.role === 'system' ? String(m.content || '') : czesci(m.content, x.dostawca) })).filter(m => Array.isArray(m.content) ? m.content.length : m.content);
  const maks = Math.min(8000, Math.max(200, Number(o.maks) || 2500));
  if (x.dostawca === 'anthropic'){
    const system = lista.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const reszta = lista.filter(m => m.role !== 'system');
    if (!reszta.length) return null;
    const body = { model: x.model, max_tokens: maks, messages: reszta };
    if (system) body.system = system;
    return { url: `${x.baza}/v1/messages`, metoda: 'POST', naglowki: chNaglowki('anthropic', klucz), body };
  }
  if (!lista.some(m => m.role !== 'system')) return null;
  return { url: `${x.baza}/v1/chat/completions`, metoda: 'POST', naglowki: chNaglowki('zgodny', klucz), body: { model: x.model, messages: lista, max_tokens: maks } };
}

/** Mózg OPERO: { licencja, system, polecenie, obrazy[], maks } — licencję dokłada proces główny. */
function chZadanieOpero(wiadomosci, o){
  const lista = Array.isArray(wiadomosci) ? wiadomosci : [];
  const system = lista.filter(m => m.role === 'system').map(m => String(m.content || '')).join('\n\n');
  const teksty = [], obrazy = [];
  for (const m of lista.filter(m => m.role !== 'system')){
    if (Array.isArray(m.content)){
      for (const c of m.content){
        if (c?.type === 'text' && c.text) teksty.push(String(c.text));
        else if (c?.type === 'image' && /^data:image\/(jpeg|png|webp);base64,/.test(String(c.dataUrl || ''))) obrazy.push(c.dataUrl);
      }
    } else if (m.content) teksty.push((m.role === 'assistant' ? 'Twoja wcześniejsza odpowiedź: ' : '') + String(m.content));
  }
  const polecenie = teksty.join('\n\n').trim();
  if (!polecenie) return null;
  const maks = Math.min(8000, Math.max(200, Number(o.maks) || 2500));
  return { url: CH_MOZG_OPERO, metoda: 'POST', naglowki: { 'content-type': 'application/json' }, body: { system, polecenie, obrazy: obrazy.slice(0, 20), maks }, wymagaLicencji: true };
}

function chZadanieListy(u, klucz){
  const x = chUstawieniaCzyste(u);
  if (!x.baza || !klucz) return null;
  return { url: `${x.baza}/v1/models`, metoda: 'GET', naglowki: chNaglowki(x.dostawca, klucz) };
}

function chZListy(tekst){
  let j = null; try { j = JSON.parse(String(tekst || '')); } catch { return []; }
  return (Array.isArray(j?.data) ? j.data : []).map(m => ({ id: String(m?.id || ''), nazwa: String(m?.display_name || m?.id || '') })).filter(m => m.id).slice(0, 200);
}

function chKomunikatBledu(status, tekst){
  let j = null; try { j = JSON.parse(String(tekst || '')); } catch {}
  const opis = String(j?.error?.message || '').slice(0, 240);
  if (status === 401 || status === 403) return 'Klucz do modelu w chmurze został odrzucony. Sprawdź go w Ustawieniach.';
  if (status === 404) return `Dostawca nie zna tego modelu albo adresu.${opis ? ' ' + opis : ''} Pobierz listę modeli w Ustawieniach.`;
  if (status === 429) return 'Dostawca modelu ogranicza liczbę zapytań albo skończyły się środki na koncie. Spróbuj później.';
  if (status === 400) return `Dostawca odrzucił zapytanie.${opis ? ' ' + opis : ''}`;
  if (status >= 500) return 'Serwer dostawcy modelu ma awarię. Spróbuj później albo przełącz na model lokalny.';
  return `Model w chmurze odpowiedział kodem ${status}.${opis ? ' ' + opis : ''}`;
}

/** Tekst z odpowiedzi – w obu formatach. */
function chZOdpowiedzi(dostawca, status, tekst){
  if (dostawca === 'opero'){
    let j = null; try { j = JSON.parse(String(tekst || '')); } catch {}
    if (Array.isArray(j)) j = j[0];
    if (status === 401 || (j && j.ok === false)) return { ok: false, powod: `Mózg OPERO: ${j?.powod || 'odmowa dostępu (licencja)'}` };
    if (!(status >= 200 && status < 300)) return { ok: false, powod: `Mózg OPERO nie odpowiedział poprawnie (kod ${status}). Spróbuj za chwilę.` };
    const t = String(j?.text || '').trim().replace(/^```[a-z]*\n?|\n?```$/g, '').trim();
    return t ? { ok: true, text: t, uciety: false } : { ok: false, powod: 'Mózg OPERO nie zwrócił tekstu.' };
  }
  if (!(status >= 200 && status < 300)) return { ok: false, powod: chKomunikatBledu(status, tekst) };
  let j = null; try { j = JSON.parse(String(tekst || '')); } catch { return { ok: false, powod: 'Dostawca modelu zwrócił odpowiedź, której nie da się odczytać.' }; }
  let wynik = '';
  if (dostawca === 'anthropic') wynik = (Array.isArray(j?.content) ? j.content : []).filter(b => b?.type === 'text').map(b => String(b.text || '')).join('');
  else { const c = j?.choices?.[0]?.message?.content; wynik = Array.isArray(c) ? c.map(b => String(b?.text || '')).join('') : String(c || ''); }
  wynik = wynik.trim().replace(/^```[a-z]*\n?|\n?```$/g, '').trim();
  if (!wynik) return { ok: false, powod: 'Model w chmurze nie zwrócił tekstu.' };
  return { ok: true, text: wynik, uciety: j?.stop_reason === 'max_tokens' || j?.choices?.[0]?.finish_reason === 'length' };
}

const API_CHMURA = {
  MOZG_OPERO: CH_MOZG_OPERO, zadanieOpero: chZadanieOpero,
  DOSTAWCY: CH_DOSTAWCY, dostawca: chDostawca, baza: chBaza, ustawienia: chUstawieniaCzyste, gotowosc: chGotowosc,
  zadanie: chZadanie, zadanieListy: chZadanieListy, zListy: chZListy, zOdpowiedzi: chZOdpowiedzi, komunikatBledu: chKomunikatBledu,
};
if (typeof window !== 'undefined') window.OperoChmura = API_CHMURA;
if (typeof module !== 'undefined' && module.exports) module.exports = API_CHMURA;
