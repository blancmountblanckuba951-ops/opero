'use strict';
/**
 * OPERO 3.5 — czytnik formatów tekstowych bez zewnętrznych programów.
 * ODT/ODS (OpenDocument), RTF, HTML, XML/GML, JSON, EML — do czystego tekstu,
 * który potem czyta Claude. Moduł jest czysty (bez Electrona), więc da się go testować.
 */

function encje(t){
  return String(t || '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

/** XML/HTML -> tekst z zachowaniem akapitów. */
function zXml(xml){
  return encje(String(xml || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<text:tab\/>/g, '\t').replace(/<text:line-break\/>/g, '\n').replace(/<text:s(?:\s+text:c="(\d+)")?\/>/g, (_, n) => ' '.repeat(Number(n) || 1))
    .replace(/<\/(text:p|text:h|p|div|h[1-6]|li|tr|table:table-row|br)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(table:table-cell|td|th)>/gi, '\t')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** RTF -> tekst (polskie znaki z \'xx w cp1250 i \uN). */
const CP1250 = { 0xa5: 'Ą', 0xb9: 'ą', 0xc6: 'Ć', 0xe6: 'ć', 0xca: 'Ę', 0xea: 'ę', 0xa3: 'Ł', 0xb3: 'ł', 0xd1: 'Ń', 0xf1: 'ń', 0xd3: 'Ó', 0xf3: 'ó', 0x8c: 'Ś', 0x9c: 'ś', 0x8f: 'Ź', 0x9f: 'ź', 0xaf: 'Ż', 0xbf: 'ż', 0x96: '–', 0x97: '—', 0x84: '„', 0x94: '”', 0x93: '“' };
function zRtf(rtf){
  let t = String(rtf || '');
  if (!/^\{\\rtf/.test(t)) return t;
  t = t.replace(/\{\\\*[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '')
    .replace(/\{\\(fonttbl|colortbl|stylesheet|info)[\s\S]*?\}\s*\}/g, '');
  t = t.replace(/\\u(-?\d+)(?:\\'[0-9a-f]{2}|[?])?/gi, (_, n) => { let c = Number(n); if (c < 0) c += 65536; return String.fromCharCode(c); })
    .replace(/\\'([0-9a-f]{2})/gi, (_, h) => { const c = parseInt(h, 16); return CP1250[c] || (c < 128 ? String.fromCharCode(c) : String.fromCharCode(c)); })
    .replace(/\\(par|line)\b ?/g, '\n').replace(/\\tab\b ?/g, '\t').replace(/\\cell\b ?/g, '\t').replace(/\\row\b ?/g, '\n')
    .replace(/\\[a-z]+-?\d* ?/gi, '').replace(/\\([{}\\])/g, '$1').replace(/[{}]/g, '');
  return t.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** E-mail (EML): nagłówki + treść tekstowa. Załączniki pomijamy. */
function zEml(eml){
  const t = String(eml || '').replace(/\r/g, '');
  const [glowa, ...reszta] = t.split('\n\n');
  const nag = k => (new RegExp(`^${k}:\\s*(.*)$`, 'im').exec(glowa) || [])[1] || '';
  let tresc = reszta.join('\n\n');
  const plain = /Content-Type:\s*text\/plain[\s\S]*?\n\n([\s\S]*?)(?:\n--|$)/i.exec(tresc);
  if (plain) tresc = plain[1];
  if (/quoted-printable/i.test(t)) tresc = tresc.replace(/=\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => '%' + h).replace(/(%[0-9A-F]{2})+/g, m => { try { return decodeURIComponent(m); } catch { return m; } });
  if (/<html/i.test(tresc)) tresc = zXml(tresc);
  return [`Od: ${nag('From')}`, `Temat: ${nag('Subject')}`, `Data: ${nag('Date')}`, '', tresc.trim()].join('\n');
}

const OBRAZY = /\.(png|jpe?g|jfif|webp|bmp|gif|avif|tiff?|heic|heif)$/i;
const OBRAZY_CHROMIUM = /\.(webp|gif|avif)$/i;            // nativeImage ich nie zna — dekoduje Chromium
const OBRAZY_BEZ_DEKODERA = /\.(tiff?|heic|heif)$/i;       // ani Electron, ani Chromium

function powodBezDekodera(nazwa){
  if (/\.(heic|heif)$/i.test(nazwa)) return 'zdjęcie HEIC z iPhone’a — Windows go nie otworzy bez dodatków. W iPhonie: Ustawienia → Aparat → Formaty → „Najbardziej zgodne” (zapisuje JPG) albo wyślij zdjęcie jako JPG';
  return 'plik TIFF — zapisz go jako PDF, PNG albo JPG (skaner zwykle ma taką opcję) i wrzuć ponownie';
}

module.exports = { zXml, zRtf, zEml, encje, OBRAZY, OBRAZY_CHROMIUM, OBRAZY_BEZ_DEKODERA, powodBezDekodera };
