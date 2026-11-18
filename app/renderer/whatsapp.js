/* OPERO — powiadomienia WhatsApp
 *
 * Dwie drogi:
 *  1. „Jednym kliknieciem” – program sklada gotowa wiadomosc i otwiera
 *     WhatsApp (adres wa.me). Wysyla czlowiek. Dziala bez zadnego konta.
 *  2. Automatycznie – przez oficjalny interfejs WhatsApp Business (Meta
 *     Cloud API). Wymaga konta, numeru nadawcy i tokenu wpisanych
 *     w Ustawieniach. Program wysyla wtedy sam, takze gdy nikogo nie ma.
 *
 * Ograniczenie Meta, o ktorym trzeba wiedziec: zwykly tekst dochodzi tylko
 * wtedy, gdy odbiorca napisal do numeru firmowego w ciagu ostatnich 24 godzin.
 * Poza tym oknem dochodzi wylacznie zatwierdzony SZABLON wiadomosci – dlatego
 * w Ustawieniach jest pole na nazwe szablonu.
 *
 * Modul jest czysty: buduje adresy i tresci, niczego nie wysyla.
 */
'use strict';

const WA_WERSJA_DOMYSLNA = 'v23.0';

/** Numer w zapisie miedzynarodowym, same cyfry. Polski 9-cyfrowy dostaje 48. */
function waNumer(v){
  let n = String(v == null ? '' : v).replace(/[^\d+]/g, '');
  if (n.startsWith('+')) n = n.slice(1); else if (n.startsWith('00')) n = n.slice(2);
  n = n.replace(/\D/g, '');
  if (n.length === 9) n = '48' + n;
  return n.length >= 10 && n.length <= 15 ? n : '';
}

function waNumerPokaz(v){
  const n = waNumer(v); if (!n) return '';
  return n.startsWith('48') && n.length === 11 ? `+48 ${n.slice(2, 5)} ${n.slice(5, 8)} ${n.slice(8)}` : `+${n}`;
}

/** Adres „jednym kliknieciem”. Bez numeru WhatsApp pyta, do kogo wyslac. */
function waLink(numer, tekst){
  const n = waNumer(numer), t = encodeURIComponent(String(tekst || '').slice(0, 3500));
  return n ? `https://wa.me/${n}?text=${t}` : `https://wa.me/?text=${t}`;
}

function waUstawieniaCzyste(u){
  const x = u && typeof u === 'object' ? u : {};
  const wersja = /^v\d{1,2}\.\d$/.test(String(x.wersja || '')) ? String(x.wersja) : WA_WERSJA_DOMYSLNA;
  return {
    odbiorca: waNumer(x.odbiorca), idNumeru: String(x.idNumeru || '').replace(/\D/g, '').slice(0, 24),
    szablon: String(x.szablon || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 64),
    jezyk: /^[a-z]{2}(_[A-Z]{2})?$/.test(String(x.jezyk || '')) ? String(x.jezyk) : 'pl',
    wersja, automat: x.automat === true, etapy: x.etapy === true,
  };
}

/** Czy da sie wysylac automatycznie i – jesli nie – czego brakuje. */
function waGotowosc(u, jestToken){
  const x = waUstawieniaCzyste(u), brak = [];
  if (!x.odbiorca) brak.push('numer odbiorcy');
  if (!x.idNumeru) brak.push('identyfikator numeru nadawcy');
  if (!jestToken) brak.push('token dostępu');
  return { automat: x.automat && !brak.length, wlaczony: x.automat, brak, klik: true };
}

/** Zadanie HTTP do Meta. Token dokleja proces glowny – tu go nie ma. */
function waZadanie(u, tekst){
  const x = waUstawieniaCzyste(u);
  if (!x.odbiorca || !x.idNumeru) return null;
  const t = String(tekst || '').replace(/\s+\n/g, '\n').trim().slice(0, x.szablon ? 1000 : 4000);
  if (!t) return null;
  const body = x.szablon
    // Parametr szablonu nie moze zawierac znakow nowej linii ani tabulacji.
    ? { messaging_product: 'whatsapp', to: x.odbiorca, type: 'template', template: { name: x.szablon, language: { code: x.jezyk }, components: [{ type: 'body', parameters: [{ type: 'text', text: t.replace(/[\n\t]+/g, ' · ').replace(/ {4,}/g, '   ') }] }] } }
    : { messaging_product: 'whatsapp', recipient_type: 'individual', to: x.odbiorca, type: 'text', text: { preview_url: false, body: t } };
  return { url: `https://graph.facebook.com/${x.wersja}/${x.idNumeru}/messages`, metoda: 'POST', body, szablon: !!x.szablon };
}

function waZOdpowiedzi(status, tekst){
  let j = null; try { j = JSON.parse(String(tekst || '')); } catch {}
  if (status >= 200 && status < 300 && j?.messages?.[0]?.id) return { ok: true, id: String(j.messages[0].id) };
  const e = j?.error || {};
  const kod = Number(e.code) || 0;
  let powod = String(e.error_user_msg || e.message || '').slice(0, 300) || `Serwer odpowiedział kodem ${status}.`;
  if (status === 401 || kod === 190) powod = 'Token dostępu jest nieważny albo wygasł. Wygeneruj nowy w panelu Meta i wpisz go w Ustawieniach.';
  else if (kod === 131047) powod = 'Minęły 24 godziny od ostatniej wiadomości odbiorcy — zwykły tekst nie dojdzie. Wpisz w Ustawieniach nazwę zatwierdzonego szablonu.';
  else if (kod === 132001) powod = 'Szablon o tej nazwie i w tym języku nie istnieje albo nie jest zatwierdzony.';
  else if (kod === 131030) powod = 'Numer odbiorcy nie jest na liście dozwolonych (konto testowe). Dodaj go w panelu Meta.';
  else if (kod === 131026) powod = 'Wiadomość nie może być dostarczona — odbiorca nie ma WhatsAppa na tym numerze albo nie przyjął warunków.';
  else if (kod === 100) powod = `Meta odrzuciła zapytanie: ${powod}`;
  return { ok: false, kod, powod };
}

function waKwota(n){ const v = Math.round(Number(n) || 0); return v > 0 ? `${String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} zł` : ''; }

/**
 * Tresc powiadomienia. `rodzaj`: 'start' | 'agent' | 'koniec' | 'blad'.
 * W tresci NIE MA danych osobowych z ksiegi – tylko adres nieruchomosci,
 * postep i wynik.
 */
function waWiadomosc(rodzaj, d){
  const x = d || {};
  const co = String(x.adres || '').trim() || 'nowy operat';
  if (rodzaj === 'start') return `OPERO: zaczynam operat — ${co}. Pracuje zespół ${x.agentow || 8} agentów. Dam znać, gdy skończę.`;
  if (rodzaj === 'agent') return `OPERO · ${co}\n${x.nazwa || 'Agent'}: ${x.stan === 'gotowe' ? 'gotowe' : x.stan === 'blad' ? 'przerwał pracę' : 'skończył z uwagami'}${x.ile ? ` (${x.ile})` : ''}. Postęp ${x.postep || 0}%.`;
  if (rodzaj === 'blad') return `OPERO · ${co}\nPraca przerwana: ${String(x.powod || 'nieznany błąd').slice(0, 300)}. Otwórz program, żeby zdecydować, co dalej.`;
  const linie = [`OPERO: operat gotowy do weryfikacji — ${co}.`];
  if (x.wartosc) linie.push(`Wartość: ${waKwota(x.wartosc)}${x.jednostkowa ? ` (${waKwota(x.jednostkowa)}/m²)` : ''}.`);
  linie.push(`Zrobione: ${x.ileZrobione || 0} pozycji · do uzupełnienia: ${x.ileBrakow || 0}${x.poprawki ? ` · poprawki do akceptacji: ${x.poprawki}` : ''}.`);
  if (x.czasTekst) linie.push(`Czas pracy: ${x.czasTekst}.`);
  const braki = (x.braki || []).slice(0, 5);
  if (braki.length) linie.push('Czego zabrakło:\n' + braki.map(b => `• ${String(b).slice(0, 140)}`).join('\n'));
  linie.push('Otwórz OPERO → Start, żeby sprawdzić etapy i zatwierdzić.');
  return linie.join('\n');
}

const API_WA = {
  WERSJA: WA_WERSJA_DOMYSLNA, numer: waNumer, numerPokaz: waNumerPokaz, link: waLink, ustawienia: waUstawieniaCzyste,
  gotowosc: waGotowosc, zadanie: waZadanie, zOdpowiedzi: waZOdpowiedzi, wiadomosc: waWiadomosc, kwota: waKwota,
};
if (typeof window !== 'undefined') window.OperoWhatsApp = API_WA;
if (typeof module !== 'undefined' && module.exports) module.exports = API_WA;
