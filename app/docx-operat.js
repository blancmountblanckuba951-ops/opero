'use strict';
/* ============================================================================
   OPERO — EKSPORT OPERATU DO .DOCX
   ----------------------------------------------------------------------------
   Po co to jest: PDF nadaje się do podpisu i do wysłania, ale nie do poprawek.
   Zamawiający odsyła uwagi w Wordzie, bank ma własny szablon, a weryfikator
   nanosi zmiany w tekście. Operat, którego nie da się otworzyć w edytorze,
   wypada z obiegu dokumentów u klienta.

   Skąd bierzemy treść: z TEGO SAMEGO html-a, z którego powstaje PDF. Drugi
   generator, składający dokument od nowa z danych projektu, prędzej czy później
   rozjechałby się z pierwszym — i rzeczoznawca podpisałby wersję Word różniącą
   się od wersji PDF, nie wiedząc o tym.

   Bez bibliotek. `.docx` to ZIP z plikami XML, a Node ma w sobie `zlib` i
   wszystko, czego potrzeba do policzenia CRC. Program klienta nie ściąga więc
   ani jednej paczki z internetu, żeby zapisać Worda.
   ========================================================================= */
const zlib = require('node:zlib');

/* ------------------------------------------------------------------- ZIP */

const TABLICA_CRC = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLICA_CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Data w formacie DOS — tego wymaga nagłówek ZIP-a. */
function dataDos(d = new Date()) {
  const czas = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const dzien = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { czas, dzien };
}

/**
 * Minimalny ZIP. Pierwszy plik ([Content_Types].xml) zapisujemy bez kompresji —
 * tego oczekują niektóre starsze czytniki pakietów OOXML.
 */
function zip(pliki) {
  const { czas, dzien } = dataDos();
  const kawalki = [];
  const katalog = [];
  let przesuniecie = 0;

  pliki.forEach((plik, i) => {
    const nazwa = Buffer.from(plik.nazwa, 'utf8');
    const dane = Buffer.isBuffer(plik.dane) ? plik.dane : Buffer.from(String(plik.dane), 'utf8');
    const bezKompresji = i === 0 || plik.bezKompresji;
    const spakowane = bezKompresji ? dane : zlib.deflateRawSync(dane, { level: 9 });
    const suma = crc32(dane);
    const metoda = bezKompresji ? 0 : 8;

    const naglowek = Buffer.alloc(30);
    naglowek.writeUInt32LE(0x04034b50, 0);
    naglowek.writeUInt16LE(20, 4);              // wersja potrzebna do rozpakowania
    naglowek.writeUInt16LE(0x0800, 6);          // nazwy w UTF-8
    naglowek.writeUInt16LE(metoda, 8);
    naglowek.writeUInt16LE(czas, 10);
    naglowek.writeUInt16LE(dzien, 12);
    naglowek.writeUInt32LE(suma, 14);
    naglowek.writeUInt32LE(spakowane.length, 18);
    naglowek.writeUInt32LE(dane.length, 22);
    naglowek.writeUInt16LE(nazwa.length, 26);
    naglowek.writeUInt16LE(0, 28);

    kawalki.push(naglowek, nazwa, spakowane);

    const wpis = Buffer.alloc(46);
    wpis.writeUInt32LE(0x02014b50, 0);
    wpis.writeUInt16LE(20, 4);
    wpis.writeUInt16LE(20, 6);
    wpis.writeUInt16LE(0x0800, 8);
    wpis.writeUInt16LE(metoda, 10);
    wpis.writeUInt16LE(czas, 12);
    wpis.writeUInt16LE(dzien, 14);
    wpis.writeUInt32LE(suma, 16);
    wpis.writeUInt32LE(spakowane.length, 20);
    wpis.writeUInt32LE(dane.length, 24);
    wpis.writeUInt16LE(nazwa.length, 28);
    wpis.writeUInt32LE(0, 38);                   // atrybuty zewnętrzne
    wpis.writeUInt32LE(przesuniecie, 42);
    katalog.push(Buffer.concat([wpis, nazwa]));

    przesuniecie += naglowek.length + nazwa.length + spakowane.length;
  });

  const spisTresci = Buffer.concat(katalog);
  const koniec = Buffer.alloc(22);
  koniec.writeUInt32LE(0x06054b50, 0);
  koniec.writeUInt16LE(pliki.length, 8);
  koniec.writeUInt16LE(pliki.length, 10);
  koniec.writeUInt32LE(spisTresci.length, 12);
  koniec.writeUInt32LE(przesuniecie, 16);

  return Buffer.concat([...kawalki, spisTresci, koniec]);
}

/* ------------------------------------------------------- czytanie html-a */

function odkoduj(tekst) {
  return String(tekst || '')
    .replace(/&nbsp;/g, ' ').replace(/&oacute;/g, 'ó')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function xml(tekst) {
  return String(tekst ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
    // Znaki sterujace sa w XML-u 1.0 zakazane - Word odmawia otwarcia pliku,
    // ktory je zawiera, bez slowa wyjasnienia.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/** Tekst bez znaczników, ze zwinięciem białych znaków. */
function czysty(html) {
  return odkoduj(String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Rozkład dokumentu na kawałki, które Word umie pokazać: nagłówki, akapity,
 * tabele, obrazy i listy. Czytamy WŁASNY html, więc nie potrzeba pełnego
 * parsera — potrzeba takiego, który nie zgubi treści, gdy generator raportu
 * zmieni klasę albo doda atrybut.
 */
function rozbijHtml(html) {
  const ciało = String(html || '').replace(/[\s\S]*?<body[^>]*>/i, '').replace(/<\/body>[\s\S]*/i, '');
  const bezSmieci = ciało
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const kawalki = [];
  const wzor = /<(h[1-4]|p|li|table|img)\b([^>]*)>([\s\S]*?)<\/\1>|<img\b([^>]*)\/?>/gi;
  let m;
  while ((m = wzor.exec(bezSmieci)) !== null) {
    const znacznik = (m[1] || 'img').toLowerCase();
    const atrybuty = m[2] || m[4] || '';
    const wnetrze = m[3] || '';

    if (znacznik === 'img') {
      const src = /src\s*=\s*"([^"]+)"/i.exec(atrybuty) || /src\s*=\s*'([^']+)'/i.exec(atrybuty);
      if (src) kawalki.push({ typ: 'obraz', src: src[1] });
      continue;
    }
    if (znacznik === 'table') { kawalki.push({ typ: 'tabela', wiersze: rozbijTabele(wnetrze) }); continue; }
    if (/^h[1-4]$/.test(znacznik)) {
      const tekst = czysty(wnetrze);
      if (tekst) kawalki.push({ typ: 'naglowek', poziom: Number(znacznik[1]), tekst });
      continue;
    }
    if (znacznik === 'li') {
      const tekst = czysty(wnetrze);
      if (tekst) kawalki.push({ typ: 'punkt', tekst });
      continue;
    }
    const tekst = czysty(wnetrze);
    if (tekst) kawalki.push({ typ: 'akapit', tekst });
    // Obrazy wewnatrz akapitu tez musza pojsc do dokumentu.
    const obrazy = wnetrze.match(/<img\b[^>]*>/gi) || [];
    for (const o of obrazy) {
      const src = /src\s*=\s*"([^"]+)"/i.exec(o) || /src\s*=\s*'([^']+)'/i.exec(o);
      if (src) kawalki.push({ typ: 'obraz', src: src[1] });
    }
  }
  return kawalki;
}

function rozbijTabele(html) {
  const wiersze = [];
  const wzorWiersza = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let w;
  while ((w = wzorWiersza.exec(html)) !== null) {
    const komorki = [];
    const wzorKomorki = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let k;
    while ((k = wzorKomorki.exec(w[1])) !== null) {
      komorki.push({ naglowek: k[1].toLowerCase() === 'th', tekst: czysty(k[3]) });
    }
    if (komorki.length) wiersze.push(komorki);
  }
  return wiersze;
}

/* ----------------------------------------------------------------- OOXML */

const SZEROKOSC_STRONY = 9638;   // A4 minus marginesy, w jednostkach DXA
const EMU_NA_PIKSEL = 9525;

function akapit(tekst, { styl = '', pogrubienie = false, wyrownanie = '' } = {}) {
  const wlasciwosci = [styl ? `<w:pStyle w:val="${styl}"/>` : '',
    wyrownanie ? `<w:jc w:val="${wyrownanie}"/>` : ''].join('');
  return `<w:p>${wlasciwosci ? `<w:pPr>${wlasciwosci}</w:pPr>` : ''}` +
    `<w:r>${pogrubienie ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(tekst)}</w:t></w:r></w:p>`;
}

function tabela(wiersze) {
  if (!wiersze.length) return '';
  const kolumn = Math.max(...wiersze.map(w => w.length));
  const szerokosc = Math.floor(SZEROKOSC_STRONY / kolumn);
  const siatka = Array.from({ length: kolumn }, () => `<w:gridCol w:w="${szerokosc}"/>`).join('');
  const krawedz = (n) => `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/>`;
  const tresc = wiersze.map(w => {
    const komorki = Array.from({ length: kolumn }, (_, i) => {
      const k = w[i] || { tekst: '', naglowek: false };
      const cien = k.naglowek ? '<w:shd w:val="clear" w:color="auto" w:fill="F4F1EA"/>' : '';
      return `<w:tc><w:tcPr><w:tcW w:w="${szerokosc}" w:type="dxa"/>${cien}</w:tcPr>` +
        `<w:p><w:pPr><w:pStyle w:val="Tabela"/></w:pPr><w:r>${k.naglowek ? '<w:rPr><w:b/></w:rPr>' : ''}` +
        `<w:t xml:space="preserve">${xml(k.tekst)}</w:t></w:r></w:p></w:tc>`;
    }).join('');
    return `<w:tr>${komorki}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${SZEROKOSC_STRONY}" w:type="dxa"/>` +
    `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(krawedz).join('')}</w:tblBorders>` +
    `</w:tblPr><w:tblGrid>${siatka}</w:tblGrid>${tresc}</w:tbl><w:p/>`;
}

function obraz(id, szerokoscPx, wysokoscPx) {
  const maks = 600;
  const skala = szerokoscPx > maks ? maks / szerokoscPx : 1;
  const cx = Math.round(szerokoscPx * skala * EMU_NA_PIKSEL);
  const cy = Math.round(wysokoscPx * skala * EMU_NA_PIKSEL);
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Obraz ${id}"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="Obraz ${id}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rId${100 + id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

/** Rozmiar obrazka z nagłówka pliku — bez tego Word rysuje go w złych proporcjach. */
function rozmiarObrazu(buf, rodzaj) {
  try {
    if (rodzaj === 'png' && buf.length > 24) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (rodzaj === 'jpeg' || rodzaj === 'jpg') {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xFF) { i++; continue; }
        const znacznik = buf[i + 1];
        const dlugosc = buf.readUInt16BE(i + 2);
        if (znacznik >= 0xC0 && znacznik <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(znacznik)) {
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        }
        i += 2 + dlugosc;
      }
    }
  } catch {}
  return { w: 600, h: 400 };
}

const STYLE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="21"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="160"/><w:jc w:val="left"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="A97700"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:jc w:val="left"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="25"/><w:color w:val="A97700"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/><w:jc w:val="left"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Tabela"><w:name w:val="Tabela OPERO"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr><w:rPr><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Punkt"><w:name w:val="Punkt OPERO"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/><w:ind w:left="340" w:hanging="200"/></w:pPr></w:style>
</w:styles>`;

/**
 * Złożenie pliku .docx z html-a raportu.
 * `opcje.tytul` trafia do właściwości dokumentu, `opcje.autor` do pola autora —
 * żeby w Wordzie było widać, czyj to operat, a nie „nieznany użytkownik".
 */
function zHtml(html, opcje = {}) {
  const kawalki = rozbijHtml(html);
  const media = [];
  const tresc = [];
  let idObrazu = 0;

  for (const k of kawalki) {
    if (k.typ === 'naglowek') {
      tresc.push(akapit(k.tekst, { styl: `Heading${Math.min(3, k.poziom)}` }));
    } else if (k.typ === 'akapit') {
      tresc.push(akapit(k.tekst));
    } else if (k.typ === 'punkt') {
      tresc.push(akapit(`• ${k.tekst}`, { styl: 'Punkt' }));
    } else if (k.typ === 'tabela') {
      tresc.push(tabela(k.wiersze));
    } else if (k.typ === 'obraz') {
      const dane = /^data:image\/([a-z+]+);base64,(.+)$/i.exec(String(k.src).trim());
      if (!dane) continue;
      const rodzaj = dane[1].toLowerCase() === 'jpg' ? 'jpeg' : dane[1].toLowerCase();
      if (!['png', 'jpeg', 'gif', 'bmp'].includes(rodzaj)) continue;
      const buf = Buffer.from(dane[2], 'base64');
      if (!buf.length) continue;
      idObrazu++;
      const nazwa = `obraz${idObrazu}.${rodzaj === 'jpeg' ? 'jpg' : rodzaj}`;
      media.push({ nazwa, rodzaj, buf, id: idObrazu });
      const r = rozmiarObrazu(buf, rodzaj);
      tresc.push(obraz(idObrazu, r.w, r.h));
    }
  }

  if (!tresc.length) throw new Error('W dokumencie nie ma treści do zapisania.');

  const relacjeObrazow = media.map(m =>
    `<Relationship Id="rId${100 + m.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.nazwa}"/>`).join('');
  const typyObrazow = [...new Set(media.map(m => m.rodzaj))].map(r =>
    `<Default Extension="${r === 'jpeg' ? 'jpg' : r}" ContentType="image/${r}"/>`).join('');

  const dokument = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
<w:body>${tresc.join('')}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>
</w:body></w:document>`;

  const teraz = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const wlasciwosci = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${xml(opcje.tytul || 'Operat szacunkowy')}</dc:title>
<dc:creator>${xml(opcje.autor || 'Rzeczoznawca majątkowy')}</dc:creator>
<cp:lastModifiedBy>${xml(opcje.autor || 'OPERO')}</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${teraz}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${teraz}</dcterms:modified>
</cp:coreProperties>`;

  const pliki = [
    { nazwa: '[Content_Types].xml', dane: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>${typyObrazow}
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>` },
    { nazwa: '_rels/.rels', dane: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>` },
    { nazwa: 'word/_rels/document.xml.rels', dane: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${relacjeObrazow}
</Relationships>` },
    { nazwa: 'word/document.xml', dane: dokument },
    { nazwa: 'word/styles.xml', dane: STYLE },
    { nazwa: 'docProps/core.xml', dane: wlasciwosci },
    ...media.map(m => ({ nazwa: `word/media/${m.nazwa}`, dane: m.buf, bezKompresji: true })),
  ];

  return { plik: zip(pliki), statystyka: { akapitow: tresc.length, obrazow: media.length } };
}

module.exports = { zHtml, zip, crc32, rozbijHtml, czysty, rozmiarObrazu };
