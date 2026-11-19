'use strict';
/**
 * OPERO 1.14.0 — licencja bez serwera.
 *
 * Do 1.13.0 każde uruchomienie pytało serwer licencyjny, a program dawał sobie
 * 72 godziny offline. Dzień, w którym serwer sam się wstrzymał, pokazał, ile ta
 * zależność jest warta: rzeczoznawca z ważnym kluczem nie mógł wejść do własnego
 * programu, bo cudza baza poszła spać.
 *
 * Teraz klucz jest DOWODEM, a nie pytaniem. To krótki dokument podpisany kluczem
 * prywatnym OPERO (Ed25519); program nosi w sobie tylko klucz publiczny i sprawdza
 * podpis na miejscu. Nie da się go podrobić bez klucza prywatnego, a sprawdzenie
 * działa w lesie, w piwnicy i przy padniętym serwerze — bo żadnego serwera nie ma.
 *
 * Czego ten model NIE potrafi i trzeba o tym wiedzieć: raz wydanego klucza nie da
 * się zdalnie unieważnić. Klucz wydany na konkretne urządzenie działa tylko tam,
 * klucz bezterminowy — zawsze. Dlatego klucze wystawia się na czas oznaczony
 * i (dla klientów) z przypisaniem do urządzenia.
 *
 * Postać klucza:
 *   OPERO1.<dane>.<podpis>          (base64url, bez znaków wymagających cytowania)
 * Dane to JSON:
 *   { w, plan, nab, wyd, waz, urz, max, nr }
 *   w   — wersja formatu (1)
 *   plan— nazwa planu pokazywana w programie
 *   nab — komu wydano (e-mail albo nazwa)
 *   wyd — data wydania (ISO)
 *   waz — data ważności (ISO) albo null = bezterminowo
 *   urz — kod urządzenia (DEV-...) albo null = dowolny komputer
 *   max — ile urządzeń klucz obsługuje (informacyjnie, przy urz=null)
 *   nr  — numer klucza do rozmowy z klientem
 */
const crypto = require('node:crypto');

const PREFIKS = 'OPERO1';

/** Klucz publiczny OPERO (SPKI DER, base64). Prywatny nie istnieje w programie. */
const KLUCZ_PUBLICZNY = 'MCowBQYDK2VwAyEAdy3KCYRI6P4yorHBtiZdY2MB/yWMRfs6vKKFyywfGQE=';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function zB64url(txt) {
  const s = String(txt || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s + '='.repeat((4 - s.length % 4) % 4), 'base64');
}

/** Usuwa to, co wkleja się razem z kluczem: spacje, złamania wiersza, cudzysłowy. */
function oczysc(v) {
  return String(v || '').replace(/[\s"'`]+/g, '').trim();
}

function kluczPubliczny(base64 = KLUCZ_PUBLICZNY) {
  return crypto.createPublicKey({ key: Buffer.from(base64, 'base64'), format: 'der', type: 'spki' });
}

/** Składa klucz z danych i klucza prywatnego — używane TYLKO przez generator. */
function wydaj(dane, kluczPrywatnyPem) {
  const tresc = b64url(Buffer.from(JSON.stringify(dane), 'utf8'));
  const podpis = crypto.sign(null, Buffer.from(`${PREFIKS}.${tresc}`, 'utf8'), kluczPrywatnyPem);
  return `${PREFIKS}.${tresc}.${b64url(podpis)}`;
}

/**
 * Sprawdza klucz. Zwraca { ok, dane, powod, komunikat }.
 * Powód jest kodem do testów, komunikat — zdaniem dla rzeczoznawcy.
 */
function sprawdz(klucz, opcje = {}) {
  const teraz = Number(opcje.teraz) || Date.now();
  const kodUrzadzenia = String(opcje.kodUrzadzenia || '').trim().toUpperCase();
  const publiczny = opcje.kluczPubliczny || KLUCZ_PUBLICZNY;

  const t = oczysc(klucz);
  if (!t) return odmowa('pusty', 'Wpisz klucz licencyjny OPERO albo wczytaj go z pliku.');

  const cz = t.split('.');
  if (cz.length !== 3 || cz[0] !== PREFIKS) {
    return odmowa('nie_klucz', 'To nie wygląda na klucz OPERO. Klucz zaczyna się od „OPERO1.” i jest jednym długim ciągiem bez spacji — najprościej wczytać go z pliku.');
  }

  let podpisOk = false;
  try {
    podpisOk = crypto.verify(null, Buffer.from(`${PREFIKS}.${cz[1]}`, 'utf8'), kluczPubliczny(publiczny), zB64url(cz[2]));
  } catch { podpisOk = false; }
  if (!podpisOk) {
    return odmowa('podpis', 'Podpis klucza się nie zgadza. Klucz jest uszkodzony (np. skopiowany połowicznie) albo nie pochodzi od OPERO.');
  }

  let dane = null;
  try { dane = JSON.parse(zB64url(cz[1]).toString('utf8')); } catch { dane = null; }
  if (!dane || typeof dane !== 'object') return odmowa('tresc', 'Klucz ma prawidłowy podpis, ale nieczytelną treść. Poproś o nowy klucz.');
  if (Number(dane.w) !== 1) {
    return odmowa('wersja', 'Ten klucz pochodzi z nowszego wydania OPERO. Zaktualizuj program, żeby go odczytać.');
  }

  if (dane.waz) {
    const koniec = Date.parse(String(dane.waz));
    if (!Number.isFinite(koniec)) return odmowa('tresc', 'Klucz ma nieczytelną datę ważności. Poproś o nowy klucz.');
    if (teraz > koniec) {
      return odmowa('wygasl', `Licencja wygasła ${String(dane.waz).slice(0, 10)}. Potrzebny jest nowy klucz na kolejny okres.`, dane);
    }
  }

  if (dane.urz) {
    const przypisany = String(dane.urz).trim().toUpperCase();
    if (!kodUrzadzenia) return odmowa('urzadzenie', 'Nie udało się odczytać kodu tego komputera, a klucz jest do niego przypisany.', dane);
    if (przypisany !== kodUrzadzenia) {
      return odmowa('inne_urzadzenie', `Ten klucz wydano na urządzenie ${przypisany}, a ten komputer ma kod ${kodUrzadzenia}. Potrzebny jest klucz na to urządzenie.`, dane);
    }
  }

  return {
    ok: true, powod: 'ok', komunikat: '',
    dane: {
      plan: String(dane.plan || 'OPERO'),
      nabywca: String(dane.nab || ''),
      wydano: String(dane.wyd || ''),
      wazneDo: dane.waz ? String(dane.waz) : null,
      urzadzenie: dane.urz ? String(dane.urz) : null,
      maxUrzadzen: Math.max(1, Number(dane.max || 1)),
      numer: String(dane.nr || ''),
      bezterminowo: !dane.waz,
    },
  };
}

function odmowa(powod, komunikat, dane = null) {
  return { ok: false, powod, komunikat, dane: dane ? { plan: String(dane.plan || ''), wazneDo: dane.waz || null, urzadzenie: dane.urz || null } : null };
}

/** Ile dni zostało; dla klucza bezterminowego null. */
function dniDoKonca(wazneDo, teraz = Date.now()) {
  if (!wazneDo) return null;
  const koniec = Date.parse(String(wazneDo));
  if (!Number.isFinite(koniec)) return 0;
  return Math.max(0, Math.ceil((koniec - teraz) / 86400000));
}

/** Krótki numer klucza do pokazania w programie — nigdy całego klucza. */
function skrot(klucz) {
  const t = oczysc(klucz);
  return t.length > 12 ? `…${t.slice(-8)}` : t;
}

module.exports = { sprawdz, wydaj, dniDoKonca, skrot, oczysc, PREFIKS, KLUCZ_PUBLICZNY };
