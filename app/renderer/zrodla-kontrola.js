'use strict';
/* ============================================================================
   OPERO — KONTROLA ZRODEL: CZY PANSTWOWE USLUGI W OGOLE ODPOWIADAJA
   ----------------------------------------------------------------------------
   Program korzysta z czterech publicznych uslug. Zadna z nich nie nalezy do
   OPERO i zadna nie obiecuje dostepnosci: Geoportal bywa wylaczony na noc,
   dane.gov.pl potrafi odpowiadac minute, uslugi GUGiK miewaja przerwy
   techniczne. Rzeczoznawca ma prawo wiedziec, ktora z nich milczy i od kiedy
   — zamiast patrzec na kolko i zgadywac, czy to jego internet.

   DWA BLEDY, KTORE TEN MODUL NAPRAWIA

   1. Program mowil „Polaczenie z serwerem licencyjnym zostalo przerwane",
      kiedy nie odpowiadal GEOPORTAL. Komunikat pochodzil z jednej funkcji
      tlumaczacej bledy sieci, napisanej kiedys pod sprawdzanie klucza, przez
      ktora przechodzily potem WSZYSTKIE zapytania. Rzeczoznawca szukal winy
      w swojej licencji, a licencja nie ma z tym nic wspolnego: klucz jest
      sprawdzany na tym komputerze i program nie laczy sie z zadnym serwerem
      licencyjnym. Kazdy komunikat musi nazywac te usluge, ktora zawiodla.

   2. Pojedyncze zerwane polaczenie konczylo caly etap bledem. Sieci zrywaja
      sie co chwila; jedna ponowna proba po sekundzie zalatwia wiekszosc
      takich przypadkow i nikt o niej nie musi wiedziec.

   CZEGO TEN MODUL NIE ROBI

   Nie odpytuje niczego w tle i nie wysyla nigdzie danych operatu. Sprawdzenie
   rusza po nacisnieciu przycisku albo przy starcie szukania, a pyta o to samo,
   o co pyta zwykle zapytanie — tyle ze o najmniejsza mozliwa odpowiedz.
   ========================================================================= */

/**
 * Rejestr uslug. `nazwa` idzie do kazdego komunikatu o bledzie — to jest
 * cala poprawka z punktu 1.
 */
const ZK_ZRODLA = [
  {
    id: 'rcn', nazwa: 'Rejestr Cen Nieruchomości (Geoportal)', skrot: 'RCN',
    host: 'mapy.geoportal.gov.pl',
    rola: 'transakcje z aktów notarialnych',
    kontrola: 'https://mapy.geoportal.gov.pl/wss/service/rcn?service=WFS&request=GetCapabilities',
    limitMs: 12000,
    gdyMilczy: 'Rejestr Cen Nieruchomości bywa niedostępny przy pracach technicznych GUGiK. '
      + 'Transakcje możesz w tym czasie wziąć z wyciągu ze starostwa albo z własnej bazy.',
  },
  {
    id: 'uldk', nazwa: 'ULDK — identyfikacja działek (GUGiK)', skrot: 'ULDK',
    host: 'uldk.gugik.gov.pl',
    rola: 'numer i granice działki',
    kontrola: 'https://uldk.gugik.gov.pl/?request=GetParcelById&id=141201_1.0001.1/1',
    limitMs: 10000,
    gdyMilczy: 'Numer działki wpiszesz ręcznie z wypisu z ewidencji — program nie zatrzymuje się na tym.',
  },
  {
    id: 'uug', nazwa: 'Punkty adresowe (GUGiK)', skrot: 'Adresy',
    host: 'services.gugik.gov.pl',
    rola: 'podpowiedzi ulic i miejscowości',
    kontrola: 'https://services.gugik.gov.pl/uug/?request=GetAddress&address=Gda%C5%84sk',
    limitMs: 8000,
    gdyMilczy: 'Podpowiedzi adresów są udogodnieniem — adres zawsze można wpisać z ręki.',
  },
  {
    id: 'dane-gov', nazwa: 'dane.gov.pl — cenniki deweloperów', skrot: 'dane.gov.pl',
    host: 'api.dane.gov.pl',
    rola: 'ceny ofertowe rynku pierwotnego',
    kontrola: 'https://api.dane.gov.pl/1.4/datasets?per_page=1',
    limitMs: 12000,
    gdyMilczy: 'Cenniki deweloperów to ceny ofertowe — do zbioru porównawczego i tak nie wchodzą.',
  },
];

function zkZrodlo(id) { return ZK_ZRODLA.find(z => z.id === id) || null; }
function zkNazwa(id) { const z = zkZrodlo(id); return z ? z.nazwa : 'usługa zewnętrzna'; }

/**
 * Kody bledow sieci, ktore warto powtorzyc. Reszta (odmowa, zly adres,
 * blad certyfikatu) nie przejdzie i za drugim razem — powtarzanie takiej
 * proby tylko kaze czlowiekowi czekac dwa razy dluzej na te sama wiadomosc.
 */
const ZK_DO_POWTORZENIA = new Set([
  'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNABORTED',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET', 'ABORT_ERR',
]);

function zkKod(e) {
  return String(e?.cause?.code || e?.code || e?.name || '').toUpperCase();
}
function zkWartoPowtorzyc(e) {
  const kod = zkKod(e);
  if (ZK_DO_POWTORZENIA.has(kod)) return true;
  if (kod === 'ABORTERROR') return true;
  return false;
}

/**
 * Komunikat o bledzie, ktory NAZYWA usluge. Nigdy wiecej „serwer licencyjny"
 * przy Geoportalu.
 */
function zkKomunikat(e, idAlboNazwa = '') {
  const z = zkZrodlo(idAlboNazwa);
  const nazwa = z ? z.nazwa : (String(idAlboNazwa || '').trim() || 'usługa zewnętrzna');
  const kod = zkKod(e);
  const msg = String(e?.cause?.message || e?.message || '');
  const ogon = z && z.gdyMilczy ? ` ${z.gdyMilczy}` : '';
  if (kod === 'ENOTFOUND' || kod === 'EAI_AGAIN') {
    return `Brak połączenia z internetem — nie udało się odnaleźć adresu usługi ${nazwa}. Sprawdź sieć i spróbuj ponownie.`;
  }
  if (kod === 'ECONNREFUSED') return `Usługa ${nazwa} odrzuciła połączenie. Najczęściej to przerwa techniczna po jej stronie.${ogon}`;
  if (kod === 'ECONNRESET' || kod === 'EPIPE') return `Usługa ${nazwa} przerwała połączenie w trakcie odpowiedzi.${ogon}`;
  if (kod === 'ETIMEDOUT' || kod === 'UND_ERR_CONNECT_TIMEOUT' || kod === 'ABORT_ERR' || kod === 'ABORTERROR') {
    return `Usługa ${nazwa} nie odpowiedziała w wyznaczonym czasie.${ogon}`;
  }
  if (kod.startsWith('CERT_') || kod === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
    || kod === 'SELF_SIGNED_CERT_IN_CHAIN' || /certificate/i.test(msg)) {
    return `Nie udało się nawiązać bezpiecznego połączenia z usługą ${nazwa}. `
      + 'Najczęstsza przyczyna to program antywirusowy albo firmowa sieć podmieniająca certyfikaty SSL.';
  }
  if (/proxy/i.test(msg)) return `Połączenie z usługą ${nazwa} blokuje serwer proxy. Spróbuj z innej sieci albo poproś administratora o odblokowanie ${z ? z.host : 'tego adresu'}.`;
  return `Nie udało się połączyć z usługą ${nazwa}.${ogon}`;
}

/** Blad HTTP, czyli usluga odpowiedziala, tylko odmownie. */
function zkKomunikatHttp(status, idAlboNazwa = '') {
  const z = zkZrodlo(idAlboNazwa);
  const nazwa = z ? z.nazwa : (String(idAlboNazwa || '').trim() || 'usługa zewnętrzna');
  const s = Number(status) || 0;
  if (s === 404) return `Usługa ${nazwa} nie zna tego zapytania (404). Adres usługi mógł się zmienić.`;
  if (s === 429) return `Usługa ${nazwa} przyjęła dziś za dużo zapytań z tego komputera (429). Odczekaj chwilę.`;
  if (s >= 500) return `Usługa ${nazwa} zgłasza awarię po swojej stronie (błąd ${s}).${z && z.gdyMilczy ? ' ' + z.gdyMilczy : ''}`;
  return `Usługa ${nazwa} odpowiedziała błędem ${s}.`;
}

/* ------------------------------------------------------- stan uslug */

function zkPusty() {
  const stan = {};
  for (const z of ZK_ZRODLA) {
    stan[z.id] = { id: z.id, nazwa: z.nazwa, skrot: z.skrot, stan: 'nieznany',
      ms: 0, kiedy: '', powod: '', prob: 0 };
  }
  return stan;
}

/** Zapis wyniku jednej proby. `ms` to czas odpowiedzi — po nim widac zadyszke. */
function zkZapisz(stan, id, { ok, ms = 0, powod = '', prob = 1, kiedy = '' } = {}) {
  const s = stan || {};
  const z = zkZrodlo(id);
  const wpis = s[id] || { id, nazwa: z ? z.nazwa : id, skrot: z ? z.skrot : id };
  wpis.stan = ok ? (ms > 6000 ? 'wolno' : 'dziala') : 'milczy';
  wpis.ms = Math.max(0, Math.round(Number(ms) || 0));
  wpis.powod = ok ? '' : String(powod || '');
  wpis.prob = Math.max(1, Number(prob) || 1);
  wpis.kiedy = kiedy || new Date().toISOString();
  s[id] = wpis;
  return wpis;
}

function zkOpisWpisu(w) {
  if (!w || w.stan === 'nieznany') return 'jeszcze nie sprawdzane';
  if (w.stan === 'dziala') return `odpowiada (${(w.ms / 1000).toFixed(1).replace('.', ',')} s)`;
  if (w.stan === 'wolno') return `odpowiada, ale wolno (${(w.ms / 1000).toFixed(1).replace('.', ',')} s)`;
  return w.powod || 'nie odpowiada';
}

/**
 * Jedno zdanie o calosci. Rzeczoznawca ma wiedziec PRZED szukaniem, czy ma
 * sens czekac — a nie dowiadywac sie po trzydziestu sekundach.
 */
function zkPodsumowanie(stan) {
  const wpisy = ZK_ZRODLA.map(z => (stan || {})[z.id]).filter(Boolean);
  const dziala = wpisy.filter(w => w.stan === 'dziala').length;
  const wolno = wpisy.filter(w => w.stan === 'wolno').length;
  const milczy = wpisy.filter(w => w.stan === 'milczy');
  if (!wpisy.length) return { waga: 'info', tekst: 'Źródła nie były jeszcze sprawdzane.', milczy: 0 };
  if (!milczy.length) {
    return { waga: 'sukces', milczy: 0,
      tekst: `Wszystkie ${wpisy.length} źródła odpowiadają${wolno ? `, ${wolno} wolniej niż zwykle` : ''}.` };
  }
  if (milczy.length === wpisy.length) {
    return { waga: 'blad', milczy: milczy.length,
      tekst: 'Nie odpowiada żadne ze źródeł. Przy wszystkich naraz przyczyna leży zwykle po stronie '
        + 'Twojego połączenia albo zapory sieciowej, a nie tych usług.' };
  }
  return { waga: 'ostrzezenie', milczy: milczy.length,
    tekst: `Odpowiada ${dziala + wolno} z ${wpisy.length} źródeł. Milczy: ${milczy.map(w => w.skrot).join(', ')}.` };
}

const API_ZK = {
  ZRODLA: ZK_ZRODLA, zrodlo: zkZrodlo, nazwa: zkNazwa,
  kod: zkKod, wartoPowtorzyc: zkWartoPowtorzyc,
  komunikat: zkKomunikat, komunikatHttp: zkKomunikatHttp,
  pusty: zkPusty, zapisz: zkZapisz, opisWpisu: zkOpisWpisu, podsumowanie: zkPodsumowanie,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_ZK;
if (typeof window !== 'undefined') window.OperoZrodlaKontrola = API_ZK;
