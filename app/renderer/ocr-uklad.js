'use strict';
/* ============================================================================
   OPERO — TEKST ZE ZRZUTU EKRANU (rozpoznawanie pisma)
   ----------------------------------------------------------------------------
   Rzeczoznawca ma zrzut ekranu księgi wieczystej zamiast skopiowanego tekstu.
   Program czyta go silnikiem rozpoznawania pisma WBUDOWANYM W WINDOWS
   (Windows.Media.Ocr) — działa bez internetu, nic nie wysyła i niczego nie
   trzeba doinstalowywać poza polskim pakietem językowym systemu.

   Silnik oddaje SŁOWA z położeniem na obrazie. Ten moduł składa z nich
   z powrotem wiersze i komórki tabeli, tak żeby wynik wyglądał jak tekst
   skopiowany ze strony EKW — i dalej szedł tą samą drogą (ekw-tresc.js).

   DLACZEGO ZRZUT JEST GORSZY OD WKLEJONEGO TEKSTU — I CO Z TYM ROBIMY
   Rozpoznawanie pisma myli podobne znaki: 0 i O, 1 i I, 8 i B. W numerze
   księgi jedna taka pomyłka wskazuje INNĄ nieruchomość. Dlatego:
     * numer księgi sprawdzamy cyfrą kontrolną (robi to program, nie ten
       moduł) — błędnie odczytany numer nie wejdzie do operatu,
     * wszystko, co pochodzi ze zrzutu, program oznacza jako „ze zrzutu —
       porównaj z księgą".
   ========================================================================= */

function ocrMediana(liczby) {
  const a = liczby.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return 0;
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
}

/** Słowa z położeniem → wiersze (od góry) ze słowami od lewej. */
function ocrWiersze(slowa) {
  const s = (Array.isArray(slowa) ? slowa : [])
    .map(w => ({ t: String(w.t ?? '').trim(), x: Number(w.x), y: Number(w.y), w: Number(w.w), h: Number(w.h) }))
    .filter(w => w.t && [w.x, w.y, w.w, w.h].every(Number.isFinite) && w.h > 0);
  if (!s.length) return [];
  const h = ocrMediana(s.map(w => w.h)) || 12;
  s.sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
  const wiersze = [];
  for (const w of s) {
    const srodek = w.y + w.h / 2;
    const ost = wiersze[wiersze.length - 1];
    if (ost && Math.abs(srodek - ost.srodek) <= h * 0.6) {
      ost.slowa.push(w);
      ost.srodek = (ost.srodek * (ost.slowa.length - 1) + srodek) / ost.slowa.length;
    } else wiersze.push({ srodek, slowa: [w] });
  }
  for (const w of wiersze) w.slowa.sort((a, b) => a.x - b.x);
  return wiersze.map(w => ({ slowa: w.slowa, h }));
}

/**
 * Wiersze → tekst. Duży odstęp między słowami to granica komórki tabeli
 * (tabulator), mały — zwykła spacja. Próg zależy od wysokości pisma, więc
 * działa tak samo na zrzucie z laptopa i z monitora 4K.
 */
function ocrTekst(slowa, { progKomorki = 2.2 } = {}) {
  return ocrWiersze(slowa).map(({ slowa: ws, h }) => {
    let out = '';
    ws.forEach((w, i) => {
      if (i) out += (w.x - (ws[i - 1].x + ws[i - 1].w)) > h * progKomorki ? '\t' : ' ';
      out += w.t;
    });
    return out;
  }).join('\n');
}

/**
 * Typowe pomyłki rozpoznawania w NAGŁÓWKACH księgi. Poprawiamy tylko stałe
 * napisy urzędowe, których brzmienie jest znane — nigdy danych nieruchomości.
 */
function ocrNaprawEkw(tekst) {
  return String(tekst || '')
    .replace(/DZIA[ŁLt1I|]\s+[I1l|]\s*[-–—]\s*[O0]\b(?!\s*\t)/g, 'DZIAŁ I-O')
    .replace(/DZIA[ŁLt1I|]\s+[I1l|]\s*[-–—]\s*S[Pp]\b/g, 'DZIAŁ I-SP')
    .replace(/DZIA[ŁLt1I|]\s+[-–—]\s*S[Pp]\b/g, 'DZIAŁ I-SP')
    .replace(/DZIA[ŁLt1I|]\s+[I1l|]{3}\b/g, 'DZIAŁ III')
    .replace(/DZIA[ŁLt1I|]\s+[I1l|]{2}\b/g, 'DZIAŁ II')
    .replace(/DZIA[ŁLt1I|]\s+[I1l|]V\b/g, 'DZIAŁ IV')
    .replace(/(DZIAŁ (?:I-O|I-SP|II|III|IV))\s*[-–—~=]+\s*/g, '$1 - ')
    .replace(/W[ŁL]ASNO[ŚS][ĆC]/g, 'WŁASNOŚĆ')
    .replace(/NIERUCHOMO[ŚS]CI\b/g, 'NIERUCHOMOŚCI')
    .replace(/KSI[ĘE]GI\s+WIECZYSTEJ\s+NR/gi, 'KSIĘGI WIECZYSTEJ NR')
    // Typowe pomyłki pisma w etykietach EKW („rn" czytane zamiast „m" i odwrotnie).
    .replace(/\bNu(?:rn|m)er\b/g, 'Numer').replace(/\bnu(?:rn|m)er\b/g, 'numer')
    .replace(/\b[il]dentyfikator\b/g, 'Identyfikator').replace(/\bkondygnacja\b/g, 'Kondygnacja')
    .replace(/\b[il]p\.\s*1\.?(?=\s)/g, 'Lp. 1.')
    .replace(/f[łl]mię|[łl]mię(?= pierwsze)/g, 'Imię');
}

/**
 * Ramki tabeli EKW rozpoznawanie pisma czyta jako „|", „[", „]", „_".
 * Zdejmujemy je z brzegów słów, a słowa złożone wyłącznie z takich znaków
 * wyrzucamy. Pojedynczy myślnik zostaje — jest częścią „POKÓJ - 3".
 */
function ocrCzyscSlowa(slowa) {
  return (Array.isArray(slowa) ? slowa : []).map(w => {
    let t = String(w && w.t != null ? w.t : '').replace(/^[|\[\]{}_~^`]+/, '').replace(/[|\[\]{}_~^`]+$/, '').replace(/[|]/g, '');
    if (/^[=—_~.,:;'"«»]+$/.test(t)) t = '';
    return { ...w, t };
  }).filter(w => w.t);
}

/**
 * Jeden zrzut EKW → tekst. Program przysyła dwa odczyty tego samego obrazu:
 *  - `slowa`         – po wyczyszczeniu tła (szare tło → białe): czyta tabelę,
 *  - `slowaOryginal` – obraz bez zmian: czyta biały nagłówek na szarym pasku
 *                       (numer księgi, sąd, rodzaj nieruchomości).
 * Z odczytu oryginału bierzemy tylko nagłówek, i tylko gdy go brakuje.
 */
function ocrZrzutEkw(z) {
  if (!z) return '';
  let tekst = ocrNaprawEkw(ocrTekst(ocrCzyscSlowa(z.slowa)));
  if (!/KSIĘGI WIECZYSTEJ NR/i.test(tekst) && Array.isArray(z.slowaOryginal) && z.slowaOryginal.length) {
    const org = ocrNaprawEkw(ocrTekst(ocrCzyscSlowa(z.slowaOryginal))).split('\n');
    const naglowek = org.filter(l => /KSIĘGI WIECZYSTEJ NR|prowadzonej\s+przez|STANOWIĄCY\s+ODRĘBNĄ|SPÓŁDZIELCZE\s+WŁASNOŚCIOWE|NIERUCHOMOŚĆ\s+GRUNTOWA/i.test(l));
    if (naglowek.length) tekst = naglowek.join('\n') + '\n' + tekst;
  }
  return tekst;
}

/** Kilka zrzutów (kilka działów) → jeden tekst, w kolejności podania. */
function ocrZrzutyNaTekst(zrzuty) {
  return (Array.isArray(zrzuty) ? zrzuty : []).map(ocrZrzutEkw).filter(Boolean).join('\n');
}

const API_OCR = { wiersze: ocrWiersze, tekst: ocrTekst, naprawEkw: ocrNaprawEkw, zrzutyNaTekst: ocrZrzutyNaTekst, zrzutEkw: ocrZrzutEkw, czyscSlowa: ocrCzyscSlowa, mediana: ocrMediana };
if (typeof module !== 'undefined' && module.exports) module.exports = API_OCR;
if (typeof window !== 'undefined') window.OperoOcr = API_OCR;
