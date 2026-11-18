(function(){
'use strict';
const { numberToPolishWords } = (typeof require === 'function') ? require('./calc') : window.OperatCalc;

const THEMES = {
  gold: { name:'Klasyczny złoty', accent:'#c99a2e', accent2:'#f5e9bf', ink:'#232323', muted:'#6e6656', border:'#77736a', font:'Georgia, "Times New Roman", serif' },
  navy: { name:'Granat profesjonalny', accent:'#173a63', accent2:'#dfe9f4', ink:'#17212b', muted:'#607080', border:'#7e8b98', font:'Cambria, Georgia, serif' },
  graphite: { name:'Grafit minimalistyczny', accent:'#343a40', accent2:'#eceff1', ink:'#202428', muted:'#666d73', border:'#90979d', font:'Arial, sans-serif' },
  forest: { name:'Zieleń ekspercka', accent:'#486b4a', accent2:'#e5eee4', ink:'#263328', muted:'#647064', border:'#879487', font:'Georgia, serif' },
};

function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function nl(v) { return esc(v).replace(/\n/g, '<br>'); }
function fmt(n, d=2) { return Number(n || 0).toLocaleString('pl-PL', { minimumFractionDigits:d, maximumFractionDigits:d }); }
function money(n, d=0) { return `${fmt(n,d)} zł`; }
function pct(n, d=2) { return `${fmt(Number(n||0)*100,d)}%`; }
function datePL(v) {
  if (!v) return '';
  const d = new Date(`${v}T12:00:00`);
  if (Number.isNaN(d.getTime())) return esc(v);
  return d.toLocaleDateString('pl-PL');
}
function val(v, placeholder='[DO UZUPEŁNIENIA]') { return v === 0 || v ? esc(v) : `<span class="missing">${placeholder}</span>`; }
function normText(v){ return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ł/g,'l'); }
function section(title, body, id='') { return `<section class="report-section" ${id?`id="${esc(id)}"`:''}><h1>${esc(title)}</h1>${body}</section>`; }
function sub(title, body) { return `<h2>${esc(title)}</h2>${body}`; }
function p(text) { return `<p>${nl(text || '[DO UZUPEŁNIENIA]')}</p>`; }
function table(headers, rows, cls='') {
  return `<table class="data-table ${cls}"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function kv(rows) { return table(['Pole','Dane'], rows.map(([a,b])=>[esc(a), b]), 'kv'); }
function photoBlock(photos, title, perPage=false) {
  if (!photos?.length) return '';
  return `<div class="photo-section">${title?`<h3>${esc(title)}</h3>`:''}<div class="photo-grid ${perPage?'two-per-page':''}">${photos.map((ph,i)=>`<figure><img src="${ph.dataUrl}" alt="${esc(ph.caption || ph.name || `Fotografia ${i+1}`)}"><figcaption>${esc(ph.caption || ph.name || `Fotografia ${i+1}`)}</figcaption></figure>`).join('')}</div></div>`;
}
function fileAttachmentsBlock(files) {
  if (!files?.length) return '';
  const visible = files.filter(f=>f.includeInPDF !== false);
  if (!visible.length) return '';
  const imageFiles = visible.filter(f=>String(f.mime||'').startsWith('image/') && f.previewDataUrl);
  const other = visible.filter(f=>!String(f.mime||'').startsWith('image/'));
  let out = '';
  if (other.length) {
    out += `<h3>Pliki źródłowe dołączone do projektu</h3><div class="file-list">${other.map(f=>`<div class="file-item"><b>${esc(f.name||'plik')}</b><span>${esc((f.extension||f.mime||'plik').toUpperCase())} · ${fmt((Number(f.size)||0)/1024/1024,2)} MB</span>${f.description?`<p>${esc(f.description)}</p>`:''}<small>Plik jest zapisany w projekcie OPERO. W raporcie PDF prezentowana jest jego metryka; fotografie i obrazy są wstawiane wizualnie.</small></div>`).join('')}</div>`;
  }
  if (imageFiles.length) {
    out += `<h3>Załączniki graficzne dodane jako pliki</h3><div class="photo-grid">${imageFiles.map((f,i)=>`<figure><img src="${f.previewDataUrl}" alt="${esc(f.name||`Załącznik ${i+1}`)}"><figcaption>${esc(f.description||f.name||`Załącznik ${i+1}`)}</figcaption></figure>`).join('')}</div>`;
  }
  return out;
}
function locationQrBlock(project) {
  const loc = project.location || {};
  if (loc.includeMapsQR === false || !loc.mapsQrDataUrl || !loc.mapsUrl) return '';
  return `<div class="maps-box"><div><h3>Kod QR lokalizacji Google Maps</h3><p>Zeskanowanie kodu otwiera lokalizację nieruchomości w Google Maps.</p><p class="small maps-url">${esc(loc.mapsUrl)}</p></div><img src="${loc.mapsQrDataUrl}" alt="Kod QR Google Maps"></div>`;
}
function costBlock(project) {
  if (!project.costing?.includeInPDF) return '';
  const c = (typeof window !== 'undefined' ? window.OperatCalc : require('./calc')).calculateCost(project);
  return section('17. KALKULACJA KOSZTU WYKONANIA OPERATU',
    `<div class="warn">Sekcja wewnętrzna / kosztowa. Włącz ją do wersji przekazywanej klientowi tylko świadomie.</div>`+
    kv([
      ['Praca rzeczoznawcy', `${fmt(project.costing?.hours,2)} h × ${money(project.costing?.hourlyRate,2)} = <b>${money(c.labor,2)}</b>`],
      ['Dojazd', `${fmt(project.costing?.travelKm,1)} km × ${money(project.costing?.costPerKm,2)} = <b>${money(c.travel,2)}</b>`],
      ['Dokumenty / dane', money(c.documents,2)], ['Druk / oprawa', money(c.printing,2)], ['Narzędzia zewnętrzne', money(c.tools,2)], ['Inne koszty', money(c.other,2)],
      ['Łączny koszt wykonania', `<b>${money(c.totalCost,2)}</b>`], ['Wynagrodzenie netto', money(c.feeNet,2)], ['Szacowany wynik na zleceniu', `<b>${money(c.profit,2)}</b> (${fmt(c.margin,1)}%)`]
    ])
  );
}

function coverPhoto(project) {
  const photos = project.photos || [];
  return photos.find(x=>x.cover)?.dataUrl || photos.find(x=>x.category==='Okładka')?.dataUrl || photos[0]?.dataUrl || '';
}
function theme(project) {
  const base = THEMES[project.appearance?.theme] || THEMES.gold;
  return { ...base, font: project.appearance?.fontFamily || base.font, accent: project.appearance?.accent || base.accent };
}

function buildCSS(project) {
  const t = theme(project);
  const headingStyle = project.appearance?.headingStyle || 'line';
  const a = project.appearance || {};
  const clamp = (v,min,max,def) => { const n=Number(v); return Number.isFinite(n)?Math.min(max,Math.max(min,n)):def; };
  const pageMargin = clamp(a.pageMarginMm, 10, 30, 15);
  const fontSize = clamp(a.bodyFontSize, 8, 13, 10.2);
  const lineHeight = clamp(a.lineHeight, 1.15, 1.8, 1.38);
  const photoColumns = Math.round(clamp(a.photoColumns,1,3,2));
  const tableDensity = ['compact','normal','comfortable'].includes(a.tableDensity)?a.tableDensity:'normal';
  const tdPad = tableDensity==='compact'?'1.1mm 1.2mm':tableDensity==='comfortable'?'2.5mm 2.6mm':'1.8mm 2mm';
  const coverStyle = ['classic','minimal','photo'].includes(a.coverStyle)?a.coverStyle:'classic';
  return `
  @page { size:A4; margin:${pageMargin+3}mm ${pageMargin}mm ${pageMargin+5}mm ${pageMargin}mm; }
  * { box-sizing:border-box; }
  html,body { margin:0; padding:0; color:${t.ink}; font-family:${t.font}; font-size:${fontSize}pt; line-height:${lineHeight}; }
  body { background:white; }
  .page-break { break-before:page; page-break-before:always; }
  .cover { min-height:252mm; border:1px solid ${t.border}; padding:12mm 12mm 9mm; display:flex; flex-direction:column; align-items:center; text-align:center; break-after:page; page-break-after:always; }
  .cover-rule { width:92%; border-top:2px solid ${t.accent}; margin:0 0 25mm; }
  .cover h1 { font-size:29pt; font-weight:500; letter-spacing:.6px; color:${t.accent}; margin:0; }
  .cover h2 { font-size:15pt; font-weight:500; color:${t.accent}; margin:4mm 0 10mm; }
  .cover img { width:58%; max-height:112mm; object-fit:cover; border:1px solid #bbb; box-shadow:0 2px 7px #999; margin:8mm 0; }
  .cover .placeholder { width:58%; height:105mm; border:1px dashed ${t.border}; display:flex; align-items:center; justify-content:center; color:${t.muted}; margin:8mm 0; }
  .cover-address { color:${t.accent}; font-weight:700; font-size:12pt; margin-top:3mm; text-transform:uppercase; }
  .cover-meta { margin-top:auto; width:100%; text-align:right; color:${t.muted}; font-size:9.5pt; }
  h1 { font-size:15.5pt; color:${t.accent}; margin:0 0 5mm; padding-bottom:2mm; ${headingStyle==='band'?`background:${t.accent};color:white;padding:2.5mm 3mm;` : headingStyle==='minimal'?'':`border-bottom:2px solid ${t.accent};`} break-after:avoid; }
  h2 { font-size:12.5pt; color:${t.accent}; margin:5mm 0 2.5mm; break-after:avoid; }
  h3 { font-size:11pt; color:${t.ink}; margin:4mm 0 2mm; break-after:avoid; }
  p { text-align:justify; margin:0 0 3mm; }
  ul { margin:1mm 0 4mm 5mm; }
  .report-section { break-before:auto; }
  .report-section + .report-section { margin-top:8mm; }
  .extract { break-after:page; page-break-after:always; }
  .extract-title { border:2px solid ${t.accent}; background:${t.accent2}; padding:3mm; text-align:center; font-style:italic; color:${t.muted}; font-size:15pt; }
  .data-table { border-collapse:collapse; width:100%; margin:3mm 0 5mm; font-size:8.7pt; break-inside:auto; }
  .data-table th { background:${t.accent}; color:white; font-weight:700; padding:2mm; border:1px solid #555; text-align:center; }
  .data-table td { padding:${tdPad}; border:1px solid #777; vertical-align:top; }
  .data-table tr { break-inside:avoid; }
  .data-table.kv td:first-child { width:34%; font-weight:700; background:${t.accent2}; }
  .highlight-value { font-size:17pt; font-weight:700; color:${t.accent}; text-align:center; }
  .missing { color:#a33; font-weight:700; }
  .calc-box { border:1px solid ${t.accent}; background:#faf9f5; padding:3mm 4mm; margin:3mm 0 5mm; break-inside:avoid; }
  .formula { font-family:"Cambria Math", Cambria, serif; font-size:11.5pt; font-weight:700; text-align:center; margin:3mm 0; }
  .toc-list { margin-top:4mm; }
  .toc-row { display:flex; align-items:flex-end; gap:2mm; margin:1.3mm 0; font-size:9.7pt; }
  .toc-row.level-2 { padding-left:8mm; font-size:9.1pt; }
  .toc-row.level-3 { padding-left:16mm; font-size:8.8pt; }
  .toc-title { white-space:nowrap; }
  .toc-dots { flex:1; border-bottom:1px dotted #999; transform:translateY(-1.3mm); }
  .toc-page { width:8mm; text-align:right; color:${t.muted}; }
  figure { margin:0; break-inside:avoid; }
  .photo-grid { display:grid; grid-template-columns:repeat(${photoColumns},minmax(0,1fr)); gap:5mm; margin:4mm 0; }
  .photo-grid figure { border:1px solid #ddd; padding:2mm; }
  .photo-grid img { width:100%; height:78mm; object-fit:contain; background:#f7f7f7; }
  figcaption { font-size:8pt; color:${t.muted}; margin-top:1.5mm; text-align:center; }
  .signature { margin-top:15mm; display:flex; justify-content:flex-end; }
  .signature div { width:70mm; text-align:center; border-top:1px solid #777; padding-top:2mm; font-size:8pt; }
  .small { font-size:8.5pt; color:${t.muted}; }
  .market-table { font-size:6.7pt; table-layout:auto; } .market-table th,.market-table td { padding:1.2mm 1mm; word-break:break-word; }
  .warn { background:#fff4d6; border-left:4px solid ${t.accent}; padding:3mm; margin:3mm 0; }
  .qa-banner { border:2px solid #a40000; background:#ffe7e7; color:#7d0000; padding:3mm 4mm; margin:0 0 5mm; font-family:Arial,sans-serif; font-size:11pt; font-weight:700; text-align:center; }
  .qa-banner small { display:block; font-size:8.5pt; font-weight:400; margin-top:1mm; }
  .maps-box { display:flex; align-items:center; gap:7mm; border:1px solid ${t.accent}; background:${t.accent2}; padding:4mm; margin:5mm 0; break-inside:avoid; }
  .maps-box > div { flex:1; } .maps-box img { width:38mm; height:38mm; object-fit:contain; background:white; border:1px solid #aaa; }
  .maps-url { word-break:break-all; }
  .file-list { display:grid; grid-template-columns:1fr 1fr; gap:3mm; margin:3mm 0 5mm; }
  .file-item { border:1px solid #aaa; padding:3mm; break-inside:avoid; } .file-item b { display:block; } .file-item span,.file-item small { display:block; color:${t.muted}; font-size:8pt; } .file-item p { margin:1.5mm 0; font-size:8.5pt; }
  `;
}

function buildHTML(project, calc) {
  const t = theme(project);
  const prop = project.property || {}, owner = project.legal || {}, b = project.building || {}, m = project.market || {};
  const narratives = project.narratives || {};
  const photos = project.photos || [];
  const buildingPhotos = photos.filter(x=>['Działka','Budynek','Otoczenie','Części wspólne'].includes(x.category));
  const localPhotos = photos.filter(x=>['Lokal','Wnętrze'].includes(x.category));
  const attachmentPhotos = photos.filter(x=>x.category==='Załącznik');
  const attachedFiles = project.files || [];
  const cover = coverPhoto(project);
  const isPairs=calc.methodCode==='pairs'||project.valuation?.methodCode==='pairs'||project.module?.code==='developed_pairs';
  const rights = prop.rightType || (isPairs?'prawo własności nieruchomości gruntowej zabudowanej':'prawo odrębnej własności lokalu mieszkalnego');
  const cooperativeNoKw = normText(rights).includes('spoldzielcze') && !String(owner.kwLocal||'').trim();
  const subjectLegalSentence = isPairs ? `Dla nieruchomości prowadzona jest księga wieczysta ${owner.kwLocal||'[DO UZUPEŁNIENIA]'}.` : (cooperativeNoKw ? `Dla prawa nie wskazano urządzonej księgi wieczystej; stan prawny opisano na podstawie dokumentów wskazanych w opracowaniu.` : `Dla lokalu prowadzona jest księga wieczysta ${owner.kwLocal||'[DO UZUPEŁNIENIA]'}.`);
  const scopeSharedSentence = isPairs ? '' : (cooperativeNoKw ? '' : ' oraz udziałem w nieruchomości wspólnej');
  const finalWords = numberToPolishWords(calc.valueRounded) + ' złotych';
  const address = [prop.street ? `ul. ${prop.street}`:'', prop.buildingNo, prop.localNo?`lokal ${prop.localNo}`:''].filter(Boolean).join(' ');
  const reportTitle = `Operat szacunkowy ${isPairs?'nieruchomości gruntowej zabudowanej':'nieruchomości lokalowej'} ${prop.district?prop.district+'; ':''}${address}`;
  const sourceList = (project.sources || []).map(x=>`<li>${esc(x)}</li>`).join('');
  const legalBases = (project.legalBases || []).map(x=>`<li>${esc(x)}</li>`).join('');

  const marketFeatures = m.features || [];
  const transactionFeatureHeaders = marketFeatures.map(f=>f.name||'Cecha');
  const transactionRows = calc.correctedTransactions.map(ti=>[
    ti.id, esc(ti.address), datePL(ti.date), fmt(ti.area,1), esc(ti.roomsFloor||''),
    ...marketFeatures.map(f=>esc(ti.featureRatings?.[f.id]||'[brak oceny]')),
    fmt(ti.priceUnit,0), fmt(ti.monthsToValuation,2), fmt(ti.correctedPrice,2)
  ]);
  const transactionHeaders=['Lp.','Adres','Data','Pow.',isPairs?'Opis / kond.':'Izby / kond.',...transactionFeatureHeaders,'Cₜ [zł/m²]','Δt [m-c]','Cₛ [zł/m²]'];
  const trendRows = calc.trendPairs.map(x=>[x.c1Id, fmt(x.c1,2), x.c2Id, fmt(x.c2,2), fmt(x.months,2), x.valid?`${fmt(x.rate,4)}%`:`BŁĄD: ${esc(x.issue||'')}`]);
  const trendSourceText = calc.trendMode === 'manual' ? `Trend miesięczny przyjęto ręcznie na podstawie analizy rzeczoznawcy: ${fmt(calc.trendApplied,4)}%.` : calc.trendMode === 'none' ? 'Nie zastosowano korekty czasowej; przyjęto trend 0,0000% miesięcznie.' : calc.trendMode === 'regression' ? `Trend wyznaczono regresją liniową cen jednostkowych względem czasu dla ${calc.regression?.count||0} transakcji. Nachylenie: ${fmt(calc.regression?.slope||0,4)} zł/m²/m-c, R² = ${fmt(calc.regression?.r2||0,4)}, trend względny = ${fmt(calc.trendApplied,4)}%/m-c (${fmt((calc.regression?.annualRate||0),2)}%/rok).` : `Trend miesięczny wyznaczono z prawidłowych par transakcji; średnia z par: ${fmt(calc.pairTrend,6)}%, do korekty zastosowano ${fmt(calc.trendApplied,4)}%.`;
  const featureById = new Map(marketFeatures.map(f=>[f.id,f]));
  const featureHeaders=['Lp.','Cecha rynkowa','Skala ocen i definicje poziomów','Waga'];
  const featureRows = calc.features.map((f,i)=>{const sm=f.scaleMode||m.ratingMode||'three';const levels=sm==='five'?[['Bardzo niekorzystna',f.scaleMin],['Niekorzystna',f.scaleLow],['Przeciętna',f.scaleAvg],['Korzystna',f.scaleHigh],['Bardzo korzystna',f.scaleMax]]:sm==='two'?[['Niekorzystna',f.scaleMin],['Korzystna',f.scaleMax]]:[['Niekorzystna',f.scaleMin],['Przeciętna',f.scaleAvg],['Korzystna',f.scaleMax]];return [i+1,esc(f.name),levels.map(([a,b])=>`<b>${esc(a)}:</b> ${esc(b||'')}`).join('<br>'),`${fmt(f.weight*100,2)}%`];});
  const uiRows = calc.uiRows.map((r,i)=>[i+1,esc(r.name),fmt(r.weight,4),fmt(r.uiMin,4),fmt(r.uiAvg,4),fmt(r.uiMax,4),esc(r.rating),fmt(r.selected,6)]);
  const weightMethodLabel={manual:'analiza rynku / wagi przyjęte przez rzeczoznawcę',pairs:'pary nieruchomości według zasady „pozostałe równe”',correlation:'analiza korelacji ocen cech z cenami jednostkowymi',other:'inny wiarygodny sposób'}[m.weightMethod]||'nie wskazano';
  const extremeFeatureTable=(t)=>table(['Cecha rynkowa','Ocena nieruchomości'],marketFeatures.map(f=>[esc(f.name),esc(t?.featureRatings?.[f.id]||'[DO UZUPEŁNIENIA]')]));
  const resultPosition=calc.unitRaw>calc.cavg*1.005?'powyżej':calc.unitRaw<calc.cavg*0.995?'poniżej':'w pobliżu';
  const favourable=calc.uiRows.filter(r=>/korzystna/i.test(r.rating)&&!/niekorzystna/i.test(r.rating)).map(r=>r.name);
  const unfavourable=calc.uiRows.filter(r=>/niekorzystna/i.test(r.rating)).map(r=>r.name);
  const defaultResultNarrative=isPairs?`Wartość rynkową ${rights} określono na kwotę ${money(calc.valueRounded,0)} (${finalWords}). W metodzie porównywania parami nieruchomość wycenianą porównano kolejno z ${calc.pairComparisonCount||0} wybranymi nieruchomościami podobnymi. Dla każdej cechy zastosowano korektę wynikającą z różnicy ocen w tej samej skali oraz przyjętej wagi cechy. Średnia skorygowanych cen jednostkowych z bezpośrednich porównań wyniosła ${fmt(calc.pairUnitRaw||0,2)} zł/m². Dobór nieruchomości, cech, skal i wag wymaga weryfikacji rzeczoznawcy.`:`Wartość rynkową ${rights} określono na kwotę ${money(calc.valueRounded,0)} (${finalWords}). Wartość jednostkowa przed końcowym zaokrągleniem wynosi ${fmt(calc.unitRaw,2)} zł/m² i znajduje się ${resultPosition} ceny średniej Cśr = ${fmt(calc.cavg,2)} zł/m², przy czym pozostaje w przedziale od Cmin = ${fmt(calc.cmin,2)} zł/m² do Cmax = ${fmt(calc.cmax,2)} zł/m².${favourable.length?` Do cech ocenionych korzystnie zaliczono: ${favourable.join(', ')}.`:''}${unfavourable.length?` Do cech ocenionych niekorzystnie zaliczono: ${unfavourable.join(', ')}.`:''} Wynik wynika z przyjętych i uzasadnionych wag cech, ocen nieruchomości oraz danych transakcyjnych wykorzystanych w obliczeniach.`;

  const extractRows = isPairs ? [
    ['Przedmiot i zakres wyceny', `${esc(rights)} - ${esc(address)}, ${esc(prop.city||'')}; działka nr ${esc(project.egib?.plotNo||'[DO UZUPEŁNIENIA]')}.`],
    ['Księga wieczysta nieruchomości', val(owner.kwLocal)],
    ['Numer działki', val(project.egib?.plotNo)],
    ['Powierzchnia działki', `${fmt(prop.landArea||project.egib?.plotArea,2)} m²`],
    ['Powierzchnia użytkowa budynku', `${fmt(prop.usableArea,2)} m²`],
    ['Rodzaj zabudowy', val(b.type)],
    ['Cel wyceny', val(project.valuation?.purpose)],
    ['Data poziomu cen i wyceny', datePL(project.valuation?.valuationDate)],
    ['Wartość rynkowa', `<div class="highlight-value">${money(calc.valueRounded,0)}</div>`],
    ['Wartość słownie', esc(finalWords)],
    ['Wartość jednostkowa', `${fmt(calc.unitAfterRound,2)} zł/m² powierzchni użytkowej budynku`],
  ] : [
    ['Przedmiot i zakres wyceny', `${esc(rights)} - ${esc(address)}, ${esc(prop.city||'')}${prop.basementArea?`, wraz z pomieszczeniem przynależnym`:''}.`],
    ['Księga wieczysta lokalu', cooperativeNoKw?'brak urządzonej księgi – stan prawny na podstawie dokumentów':val(owner.kwLocal)],
    ['Księga wieczysta nieruchomości wspólnej', cooperativeNoKw?'nie dotyczy / nie wskazano':val(owner.kwCommon)],
    ['Powierzchnia lokalu mieszkalnego', `${fmt(prop.usableArea,2)} m²`],
    ['Pomieszczenie przynależne', prop.basementArea ? `${esc(prop.basementName||'Piwnica')} - ${fmt(prop.basementArea,2)} m²` : 'brak / nie wskazano'],
    ['Powierzchnia ujawniona w KW', cooperativeNoKw?'nie dotyczy':(prop.kwArea ? `${fmt(prop.kwArea,2)} m²` : val(''))],
    ['Balkon / loggia', prop.balconyArea ? `${fmt(prop.balconyArea,2)} m²` : 'brak / nie wskazano'],
    ['Udział w nieruchomości wspólnej', cooperativeNoKw?'nie dotyczy / nie wskazano':val(owner.commonShare)],
    ['Cel wyceny', val(project.valuation?.purpose)],
    ['Data poziomu cen i wyceny', datePL(project.valuation?.valuationDate)],
    ['Wartość rynkowa', `<div class="highlight-value">${money(calc.valueRounded,0)}</div>`],
    ['Wartość słownie', esc(finalWords)],
    ['Wartość jednostkowa', `${fmt(calc.unitAfterRound,2)} zł/m² powierzchni użytkowej lokalu`],
  ];

  const legalToc = isPairs ? [[2,'5.1. Stan prawny nieruchomości'],[2,'5.2. Dział I-O – oznaczenie nieruchomości'],[2,'5.3. Dział I-Sp – prawa związane z własnością'],[2,'5.4. Dział II – własność'],[2,'5.5. Dział III – prawa, roszczenia i ograniczenia'],[2,'5.6. Dział IV – hipoteka'],[2,'5.7. Wnioski z analizy stanu prawnego']] : (cooperativeNoKw?[[2,'5.1. Stan prawny nieruchomości'],[2,'5.2. Dokumenty potwierdzające prawo'],[2,'5.3. Uprawniony i sposób przysługiwania prawa'],[2,'5.4. Wnioski z analizy stanu prawnego']]:[[2,'5.1. Stan prawny nieruchomości'],[2,'5.2. Dział I-O – oznaczenie nieruchomości'],[2,'5.3. Dział I-Sp – spis praw związanych z własnością'],[2,'5.4. Dział II – własność'],[2,'5.5. Dział III – prawa, roszczenia i ograniczenia'],[2,'5.6. Dział IV – hipoteka'],[2,'5.7. Wnioski z analizy stanu prawnego'],[2,'5.8. Księga nieruchomości wspólnej / gruntowej']]);

  const tocItems = [
    [1,'1. OKREŚLENIE PRZEDMIOTU I ZAKRESU WYCENY'],[2,'1.1. Przedmiot wyceny'],[2,'1.2. Zakres wyceny'],
    [1,'2. OKREŚLENIE CELU WYCENY'],
    [1,'3. PODSTAWY OPRACOWANIA OPERATU SZACUNKOWEGO'],[2,'3.1. Podstawa formalna'],[2,'3.2. Podstawy prawne'],[2,'3.3. Podstawy metodyczne'],[2,'3.4. Materiały źródłowe'],
    [1,'4. DATY ISTOTNE DLA WYCENY'],
    [1,'5. OPIS I OKREŚLENIE STANU PRZEDMIOTU WYCENY'],...legalToc,
    [1,'6. EWIDENCJA GRUNTÓW I BUDYNKÓW'],[1,'7. UWARUNKOWANIA PLANISTYCZNE I OCHRONNE'],[1,'8. LOKALIZACJA NIERUCHOMOŚCI I OTOCZENIE'],[1,'9. OPIS STANU TECHNICZNO-UŻYTKOWEGO BUDYNKU'],
    ...(isPairs?[[1,'10. GRUNT I ZAGOSPODAROWANIE DZIAŁKI'],[2,'10.1. Parametry działki'],[2,'10.2. Zagospodarowanie i zabudowa dodatkowa'],[2,'10.3. Funkcjonalność i standard wnętrz']]:[[1,'10. OPIS STANU TECHNICZNO-UŻYTKOWEGO LOKALU'],[2,'10.1. Układ, orientacja i powierzchnie'],[2,'10.2. Standard i stan techniczny'],[2,'10.3. Dokumentacja fotograficzna lokalu']]),
    [1,'11. ANALIZA RYNKU NIERUCHOMOŚCI'],[2,'11.1. Zakres i segment rynku'],[2,'11.2. Charakterystyka rynku lokalnego'],
    [1,'12. PROCEDURA I SPOSÓB SZACOWANIA'],[2,'12.1. Rodzaj wartości i wybór podejścia'],[2,isPairs?'12.2. Metoda porównywania parami':'12.2. Metoda korygowania ceny średniej'],[2,'12.3. Opis procedury szacowania'],
    [1,'13. OKREŚLENIE WARTOŚCI NIERUCHOMOŚCI'],[2,'13.1. Zestawienie transakcji i wpływ trendu czasowego'],[2,'13.2. Określenie cech rynkowych oraz ich wag i ocen'],[2,'13.3. Ocena wycenianej nieruchomości w aspekcie cech rynkowych'],[2,isPairs?'13.4. Bezpośrednie porównania parami':'13.4. Charakterystyka nieruchomości o cenie maksymalnej i minimalnej'],[2,'13.5. Oszacowanie wartości rynkowej wycenianej nieruchomości'],
    [1,'14. WYNIK KOŃCOWY WYCENY Z UZASADNIENIEM'],[1,'15. KLAUZULE I USTALENIA DODATKOWE'],[1,'16. ZAŁĄCZNIKI']
  ];
  if (project.costing?.includeInPDF) tocItems.push([1,'17. KALKULACJA KOSZTU WYKONANIA OPERATU']);

  const standardLegalBody =
    sub('5.1. Stan prawny nieruchomości', p(narratives.legal || `Stan prawny nieruchomości ustalono na podstawie aktualnej treści księgi wieczystej ${owner.kwLocal||'[DO UZUPEŁNIENIA]'}, zbadanej na datę ${project.valuation?.legalStateDate||'[DO UZUPEŁNIENIA]'}. Poniżej przedstawiono dane istotne dla identyfikacji prawa będącego przedmiotem wyceny.`))+
    sub('5.2. Dział I-O – oznaczenie nieruchomości', kv([['Miejscowość',val(prop.city)],['Ulica',val(prop.street)],['Numer budynku',val(prop.buildingNo)],['Numer lokalu',val(prop.localNo)],['Opis izb / pomieszczeń',val(owner.ioRooms)],['Kondygnacja',val(prop.floor)],['Powierzchnia ujawniona w KW',prop.kwArea?`${fmt(prop.kwArea,2)} m²`:val('')],['Księga nieruchomości wspólnej',val(owner.kwCommon)] ]))+
    sub('5.3. Dział I-Sp – spis praw związanych z własnością', kv([['Rodzaj prawa',val(owner.ispRightType)],['Wielkość udziału',val(owner.commonShare)],['Numer KW nieruchomości wspólnej',val(owner.kwCommon)] ]))+
    sub('5.4. Dział II – własność', kv([['Właściciel / uprawniony',val(owner.ownerNames)],['Rodzaj wspólności / sposób przysługiwania prawa',val(owner.ownershipType)],['Sąd / wydział',val(owner.court)],['Podstawa aktualnego wpisu',val(owner.currentEntryBasis)] ]))+
    sub('5.5. Dział III – prawa, roszczenia i ograniczenia', p(owner.sectionIII || '[DO UZUPEŁNIENIA]'))+
    sub('5.6. Dział IV – hipoteka', p(owner.sectionIV || '[DO UZUPEŁNIENIA]'))+
    sub('5.7. Wnioski z analizy stanu prawnego', p(owner.kwNotes || `Prawo będące przedmiotem wyceny: ${rights}. Uprawniony / właściciel: ${owner.ownerNames||'[DO UZUPEŁNIENIA]'}. Udział w nieruchomości wspólnej: ${owner.commonShare||'[DO UZUPEŁNIENIA]'}. ${prop.kwArea && prop.usableArea ? (Math.abs(Number(prop.kwArea)-Number(prop.usableArea)-Number(prop.basementArea||0)) < 0.02 ? `Powierzchnia ujawniona w KW (${fmt(prop.kwArea,2)} m²) jest zgodna z sumą powierzchni lokalu (${fmt(prop.usableArea,2)} m²) i wskazanego pomieszczenia przynależnego (${fmt(prop.basementArea||0,2)} m²).` : `UWAGA: powierzchnia ujawniona w KW (${fmt(prop.kwArea,2)} m²) nie odpowiada prostej sumie powierzchni lokalu (${fmt(prop.usableArea,2)} m²) i wskazanego pomieszczenia przynależnego (${fmt(prop.basementArea||0,2)} m²); rozbieżność wymaga wyjaśnienia w materiałach źródłowych.`) : ''} Wnioski wymagają porównania z pełną aktualną treścią księgi i materiałami źródłowymi.`))+
    sub('5.8. Księga nieruchomości wspólnej / gruntowej', (()=>{const cp=owner.commonProperty||{};return kv([['KW nieruchomości wspólnej',val(owner.kwCommon)],['Nr działki',val(cp.plotNo||project.egib?.plotNo)],['Id działki',val(cp.plotId||project.egib?.plotId)],['Powierzchnia gruntu',val(cp.area||project.egib?.plotArea)],['Sposób korzystania',val(cp.landUse)],['Id budynku',val(cp.buildingId||project.egib?.buildingId)],['Kondygnacje budynku',val(cp.buildingStoreys)],['Liczba lokali',val(cp.buildingUnits)]])+`<h3>Dział I-Sp księgi wspólnej</h3>${p(cp.sectionISP||'[DO UZUPEŁNIENIA]')}<h3>Dział II księgi wspólnej</h3>${p(cp.sectionII||'[DO UZUPEŁNIENIA]')}<h3>Dział III księgi wspólnej</h3>${p(cp.sectionIII||'[DO UZUPEŁNIENIA]')}<h3>Dział IV księgi wspólnej</h3>${p(cp.sectionIV||'[DO UZUPEŁNIENIA]')}`;})());
  const developedLegalBody =
    sub('5.1. Stan prawny nieruchomości', p(narratives.legal || `Stan prawny nieruchomości gruntowej zabudowanej ustalono na podstawie aktualnej treści księgi wieczystej ${owner.kwLocal||'[DO UZUPEŁNIENIA]'}, zbadanej na datę ${project.valuation?.legalStateDate||'[DO UZUPEŁNIENIA]'}.`))+
    sub('5.2. Dział I-O – oznaczenie nieruchomości', kv([['Księga wieczysta',val(owner.kwLocal)],['Miejscowość',val(prop.city)],['Ulica / nr',val([prop.street,prop.buildingNo].filter(Boolean).join(' '))],['Numer działki',val(project.egib?.plotNo)],['Identyfikator działki',val(project.egib?.plotId)],['Powierzchnia gruntu',prop.landArea?`${fmt(prop.landArea,2)} m²`:val(project.egib?.plotArea)],['Identyfikator budynku',val(project.egib?.buildingId)] ]))+
    sub('5.3. Dział I-Sp – prawa związane z własnością', p(owner.ispRightType || '[BRAK WPISÓW / DO UZUPEŁNIENIA]'))+
    sub('5.4. Dział II – własność', kv([['Właściciel / uprawniony',val(owner.ownerNames)],['Rodzaj wspólności / udział właścicielski',val(owner.ownershipType)],['Sąd / wydział',val(owner.court)],['Podstawa aktualnego wpisu',val(owner.currentEntryBasis)] ]))+
    sub('5.5. Dział III – prawa, roszczenia i ograniczenia', p(owner.sectionIII || '[DO UZUPEŁNIENIA]'))+
    sub('5.6. Dział IV – hipoteka', p(owner.sectionIV || '[DO UZUPEŁNIENIA]'))+
    sub('5.7. Wnioski z analizy stanu prawnego', p(owner.kwNotes || `Przedmiot wyceny stanowi ${rights}. Właściciel / uprawniony: ${owner.ownerNames||'[DO UZUPEŁNIENIA]'}. Dane działki i zabudowy wymagają zgodności z aktualną treścią KW, EGiB i dokumentami źródłowymi.`));
  const cooperativeLegalBody =
    sub('5.1. Stan prawny nieruchomości', p(narratives.legal || `Przedmiotem wyceny jest ${rights}. Dla prawa nie wskazano urządzonej księgi wieczystej. Stan prawny ustalono na datę ${project.valuation?.legalStateDate||'[DO UZUPEŁNIENIA]'} na podstawie dokumentów wskazanych w materiałach źródłowych.`))+
    sub('5.2. Dokumenty potwierdzające prawo', kv([['Dokument / podstawa prawa',val(owner.currentEntryBasis)],['Dodatkowe uwagi',val(owner.kwNotes)] ]))+
    sub('5.3. Uprawniony i sposób przysługiwania prawa', kv([['Uprawniony',val(owner.ownerNames)],['Sposób przysługiwania prawa / wspólność',val(owner.ownershipType)],['Rodzaj prawa',esc(rights)] ]))+
    sub('5.4. Wnioski z analizy stanu prawnego', p(owner.kwNotes || `Stan prawny przyjęto na podstawie wskazanych dokumentów. Brak urządzonej księgi wieczystej nie może być zastępowany domniemanymi wpisami działów I–IV; dokumenty źródłowe wymagają weryfikacji przez rzeczoznawcę.`));
  const legalSectionBody = isPairs ? developedLegalBody : (cooperativeNoKw ? cooperativeLegalBody : standardLegalBody);

  const body = `
  <div class="cover ${esc(project.appearance?.coverStyle||'classic')}">
    <div class="cover-rule"></div>
    <h1>OPERAT SZACUNKOWY</h1><h2>${isPairs?'NIERUCHOMOŚCI GRUNTOWEJ ZABUDOWANEJ':'NIERUCHOMOŚCI LOKALOWEJ'}</h2>
    ${cover?`<img src="${cover}" alt="Fotografia nieruchomości">`:`<div class="placeholder">Miejsce na fotografię okładkową</div>`}
    <div class="cover-address">${esc(prop.city||'')} ${prop.district?`- ${esc(prop.district)}`:''}<br>${esc(address)}</div>
    <div class="cover-meta">Autor opracowania: ${esc(project.author?.name||'[DO UZUPEŁNIENIA]')}<br>${esc(prop.city||'')}, ${datePL(project.valuation?.reportDate)}</div>
  </div>

  <section class="extract"><h1>WYCIĄG Z OPERATU SZACUNKOWEGO</h1><div class="extract-title">${esc(reportTitle)}</div>${kv(extractRows)}</section>
  ${project.appearance?.showToc===false?'':`<section class="toc page-break"><h1>SPIS TREŚCI</h1><div class="toc-list">${tocItems.map(([level,title])=>`<div class="toc-row level-${level}"><span class="toc-title">${esc(title)}</span><span class="toc-dots"></span><span class="toc-page"></span></div>`).join('')}</div><p class="small">Strony dokumentu są numerowane w stopce PDF. Spis treści zachowuje pełną numerację rozdziałów i podrozdziałów.</p></section>`}
  ${project.appearance?.showIndexes===false?'':`<section><h1>SPIS TABEL I RYSUNKÓW</h1><h2>Spis tabel</h2><ol><li>Zestawienie danych wyciągu z operatu.</li><li>Zestawienie transakcji porównawczych.</li><li>Cechy rynkowe, skale ocen i wagi.</li><li>Ocena nieruchomości wycenianej.</li><li>${isPairs?'Bezpośrednie porównania, korekty i wynik.':'Współczynniki korygujące Ui i wynik.'}</li></ol><h2>Spis rysunków i fotografii</h2><ol><li>Mapa / kod QR lokalizacji — jeżeli dołączono.</li><li>Dokumentacja fotograficzna budynku i otoczenia.</li>${isPairs?'':'<li>Dokumentacja fotograficzna lokalu.</li>'}<li>Załączniki graficzne — jeżeli dołączono.</li></ol></section>`}

  ${section('1. OKREŚLENIE PRZEDMIOTU I ZAKRESU WYCENY',
    sub('1.1. Przedmiot wyceny', p(narratives.subject || (isPairs?`Przedmiotem wyceny jest nieruchomość gruntowa zabudowana położona przy ul. ${prop.street||'[DO UZUPEŁNIENIA]'} ${prop.buildingNo||''} w ${prop.city||'[DO UZUPEŁNIENIA]'}, obejmująca działkę nr ${project.egib?.plotNo||'[DO UZUPEŁNIENIA]'} o powierzchni ${fmt(prop.landArea||project.egib?.plotArea,2)} m², zabudowaną ${b.type||'budynkiem'} o powierzchni użytkowej ${fmt(prop.usableArea,2)} m². ${subjectLegalSentence}`:`Przedmiotem wyceny jest nieruchomość lokalowa stanowiąca lokal mieszkalny nr ${prop.localNo||'[DO UZUPEŁNIENIA]'}, położony w budynku nr ${prop.buildingNo||'[DO UZUPEŁNIENIA]'} przy ul. ${prop.street||'[DO UZUPEŁNIENIA]'} w ${prop.city||'[DO UZUPEŁNIENIA]'}. ${subjectLegalSentence} Powierzchnia użytkowa lokalu wynosi ${fmt(prop.usableArea,2)} m².`)))+
    sub('1.2. Zakres wyceny', p(narratives.scope || (isPairs?`Zakres opracowania obejmuje określenie wartości rynkowej ${rights}, wraz z częściami składowymi gruntu uwzględnionymi w stanie nieruchomości.`:`Zakres opracowania obejmuje określenie wartości rynkowej ${rights}${prop.basementArea?` wraz z pomieszczeniem przynależnym ${prop.basementName||'piwnicą'}`:''}${scopeSharedSentence}.`))))}

  ${section('2. OKREŚLENIE CELU WYCENY', p(project.valuation?.purpose || '[DO UZUPEŁNIENIA]'))}

  ${section('3. PODSTAWY OPRACOWANIA OPERATU SZACUNKOWEGO',
    sub('3.1. Podstawa formalna', p(project.formalBasis || '[DO UZUPEŁNIENIA]'))+
    sub('3.2. Podstawy prawne', legalBases?`<ul>${legalBases}</ul>`:p('[DO UZUPEŁNIENIA]'))+
    sub('3.3. Podstawy metodyczne', p(project.methodicalBasis || (isPairs?'Podejście porównawcze - metoda porównywania parami.':'Podejście porównawcze - metoda korygowania ceny średniej.')))+
    sub('3.4. Materiały źródłowe', sourceList?`<ul>${sourceList}</ul>`:p('[DO UZUPEŁNIENIA]')))}

  ${section('4. DATY ISTOTNE DLA WYCENY', kv([
    ['Data sporządzenia opracowania', datePL(project.valuation?.reportDate)],
    ['Data, na którą określono wartość', datePL(project.valuation?.valuationDate)],
    ['Data poziomu cen', datePL(project.valuation?.priceLevelDate||project.valuation?.valuationDate)],
    ['Data badania / ustalenia stanu prawnego', val(project.valuation?.legalStateDate)],
    ['Data oględzin', datePL(project.valuation?.inspectionDate)],
  ]))}

  ${section('5. OPIS I OKREŚLENIE STANU PRZEDMIOTU WYCENY', legalSectionBody)}

  ${section('6. EWIDENCJA GRUNTÓW I BUDYNKÓW', kv([
    ['Jednostka ewidencyjna', val(project.egib?.unit)], ['Obręb ewidencyjny', val(project.egib?.district)], ['Numer działki', val(project.egib?.plotNo)], ['Identyfikator działki', val(project.egib?.plotId)], ['Powierzchnia działki', val(project.egib?.plotArea)], ['Identyfikator budynku', val(project.egib?.buildingId)]
  ]) + p(narratives.egib || project.egib?.notes || '[DO UZUPEŁNIENIA]'))}

  ${section('7. UWARUNKOWANIA PLANISTYCZNE I OCHRONNE',
    kv([['Numer planu',val(project.planning?.planNumber)],['Nazwa planu',val(project.planning?.planName)],['Uchwała / podstawa przyjęcia',val(project.planning?.resolution)],['Symbol terenu',val(project.planning?.zoneSymbol)],['Przeznaczenie',val(project.planning?.designation)],['Parametry / wskaźniki',val(project.planning?.parameters)],['Ochrona / ograniczenia',val(project.planning?.protections)],['Źródło',val(project.planning?.sourceUrl)]]) +
    p(narratives.planning || project.planning?.description || '[DO UZUPEŁNIENIA]'))}
  ${section('8. LOKALIZACJA NIERUCHOMOŚCI I OTOCZENIE',
    kv([['Komunikacja / transport',val(project.location?.transport)],['Usługi',val(project.location?.services)],['Zieleń / rekreacja',val(project.location?.recreation)],['Inne cechy otoczenia',val(project.location?.surroundings)]]) +
    p(narratives.location || project.location?.description || '[DO UZUPEŁNIENIA]') + locationQrBlock(project))}

  ${section('9. OPIS STANU TECHNICZNO-UŻYTKOWEGO BUDYNKU',
    p(narratives.building || b.description || '[DO UZUPEŁNIENIA]')+
    kv([['Rodzaj zabudowy',val(b.type)],['Rok budowy',val(b.year)],['Konstrukcja / technologia',val(b.construction)],['Liczba kondygnacji',val(b.storeys)],['Winda',val(b.lift)],['Stan techniczny',val(b.condition)],['Dach',val(b.roof)],['Elewacja',val(b.facade)],['Części wspólne',val(b.commonAreas)],['Parking',val(b.parking)],['Zarządca',val(b.manager)],['Otoczenie',val(b.surroundings)],['Instalacje',val(b.installations)]])+
    photoBlock(buildingPhotos,'Dokumentacja fotograficzna budynku i otoczenia'))}

  ${isPairs ? section('10. GRUNT I ZAGOSPODAROWANIE DZIAŁKI',
    sub('10.1. Parametry działki', kv([['Powierzchnia działki',`${fmt(prop.landArea||project.egib?.plotArea,2)} m²`],['Numer działki',val(project.egib?.plotNo)],['Identyfikator działki',val(project.egib?.plotId)],['Kształt / dostęp / uzbrojenie',val(prop.plotDescription)]]))+
    sub('10.2. Zagospodarowanie i zabudowa dodatkowa', p(prop.auxiliaryBuildings || 'Brak zabudowy dodatkowej / [DO UZUPEŁNIENIA].'))+
    sub('10.3. Funkcjonalność i standard wnętrz', kv([['Układ / funkcjonalność',val(project.local?.layout)],['Poziom standardu',val(project.local?.standardLevel)],['Stan techniczny wnętrz',val(project.local?.technicalCondition)],['Instalacje',val(project.local?.installations)]])+p(narratives.local || project.local?.description || '[DO UZUPEŁNIENIA]'))
  ) : section('10. OPIS STANU TECHNICZNO-UŻYTKOWEGO LOKALU',
    sub('10.1. Układ, orientacja i powierzchnie', kv([['Powierzchnia użytkowa',`${fmt(prop.usableArea,2)} m²`],['Liczba pokoi',val(prop.rooms)],['Kondygnacja / piętro',val(prop.floor)],['Układ pomieszczeń',val(project.local?.layout)],['Balkon / loggia',prop.balconyArea?`${fmt(prop.balconyArea,2)} m²`:'brak / nie wskazano'],['Pomieszczenie przynależne',prop.basementArea?`${esc(prop.basementName||'Piwnica')} ${fmt(prop.basementArea,2)} m²`:'brak / nie wskazano']]))+
    sub('10.2. Standard i stan techniczny',
      kv([['Kuchnia',val(project.local?.kitchenType)],['Łazienki / WC',val(project.local?.bathrooms)],['Orientacja',val(project.local?.orientation)],['Podłogi',val(project.local?.floors)],['Ściany / sufity',val(project.local?.walls)],['Stolarka okienna',val(project.local?.windows)],['Poziom standardu',val(project.local?.standardLevel)],['Stan techniczny',val(project.local?.technicalCondition)],['Instalacje',val(project.local?.installations)]]) +
      p(narratives.local || project.local?.description || '[DO UZUPEŁNIENIA]'))+
    sub('10.3. Dokumentacja fotograficzna lokalu', photoBlock(localPhotos,'',true) || p('Brak załączonych fotografii lokalu.'))
  )}

  ${section('11. ANALIZA RYNKU NIERUCHOMOŚCI',
    sub('11.1. Zakres i segment rynku', p(m.segmentDescription || (isPairs?'Rynek nieruchomości gruntowych zabudowanych podobnych do nieruchomości wycenianej, wyodrębniony według lokalizacji, funkcji, parametrów działki i zabudowy oraz stanu techniczno-użytkowego.':'Rynek wtórny lokali mieszkalnych podobnych do nieruchomości wycenianej, wyodrębniony według lokalizacji, funkcji, powierzchni i charakteru zabudowy.')))+
    sub('11.2. Charakterystyka rynku lokalnego', p(narratives.market || m.marketDescription || '[DO UZUPEŁNIENIA]')))}

  ${section('12. PROCEDURA I SPOSÓB SZACOWANIA',
    sub('12.1. Rodzaj wartości i wybór podejścia', p(project.valuation?.approachDescription || `Dla celu wskazanego w pkt 2 określono wartość rynkową ${rights}. Wyboru podejścia i metody dokonano z uwzględnieniem rodzaju i położenia nieruchomości, jej stanu, przeznaczenia oraz dostępności danych o cenach i cechach nieruchomości podobnych. W badanym segmencie dostępny jest zbiór transakcji pozwalający zastosować podejście porównawcze.`))+
    sub(isPairs?'12.2. Metoda porównywania parami':'12.2. Metoda korygowania ceny średniej', p(isPairs?`W metodzie porównywania parami nieruchomość będącą przedmiotem wyceny porównuje się kolejno z nieruchomościami podobnymi o znanych cenach, warunkach transakcji i cechach. Do bezpośrednich porównań wybiera się co najmniej trzy nieruchomości. Korekty cen transakcyjnych wynikają z różnic ocen cech rynkowych nieruchomości wycenianej i nieruchomości porównawczych w przyjętych skalach. OPERO prezentuje jawnie każdą korektę; ostateczny dobór danych i zasad korekt zatwierdza rzeczoznawca.`:`W metodzie korygowania ceny średniej podstawę wyceny stanowi zbiór co najmniej kilkunastu nieruchomości podobnych, dla których znane są ceny transakcyjne, warunki zawarcia transakcji oraz cechy mające wpływ na poziom cen. Ceny transakcyjne sprowadza się do poziomu cen z daty wyceny, jeżeli analiza rynku wskazuje na potrzebę korekty czasowej. Następnie oblicza się cenę średnią Cśr oraz ceny skrajne Cmin i Cmax. Wartość jednostkowa nieruchomości wycenianej powstaje przez skorygowanie Cśr sumą współczynników Ui odpowiadających ocenom poszczególnych cech rynkowych. Zakres sumy współczynników jest ograniczony relacjami Cmin/Cśr oraz Cmax/Cśr, co zapewnia powiązanie wyniku ze zbadanym przedziałem cenowym.`))+
    sub('12.3. Opis procedury szacowania', isPairs?`<p>W niniejszym operacie procedurę przeprowadzono w następującej kolejności:</p><ol class="procedure-list"><li>wyodrębniono właściwy rynek i zbiór nieruchomości podobnych;</li><li>zweryfikowano ceny, warunki transakcji i cechy nieruchomości podobnych;</li><li>zbadano zmianę poziomu cen w czasie i zaktualizowano ceny na datę wyceny, jeżeli było to zasadne;</li><li>wybrano co najmniej trzy nieruchomości do bezpośrednich porównań;</li><li>zdefiniowano cechy rynkowe, skale ocen i ich wpływ na zróżnicowanie cen;</li><li>oceniono nieruchomość wycenianą i każdą nieruchomość porównawczą w tych samych skalach;</li><li>dla każdej pary wyznaczono korekty wynikające z różnic ocen cech;</li><li>obliczono skorygowaną cenę jednostkową każdej nieruchomości porównawczej oraz średnią z wyników porównań;</li><li>wartość końcową obliczono jako iloczyn powierzchni przyjętej do wyceny i średniej skorygowanych cen jednostkowych.</li></ol><div class="formula">Kij = ΔC × wi × (Owyc − Opor) / (liczba przedziałów skali)<br>W = Pu × średnia(Cp po korektach)</div><p>OPERO stosuje jawny wariant rachunkowy oparty na równych przedziałach zdefiniowanej skali ocen. Jest to algorytm programu, a nie narzucony przepisem wzór. Rzeczoznawca zatwierdza zasadność przyjętej skali, wag, wielkości korekt i nieruchomości porównawczych. Obliczenia wykonywane są na wartościach o pełnej precyzji.</p>`:`<p>W niniejszym operacie procedurę przeprowadzono w następującej kolejności:</p><ol class="procedure-list"><li>wyodrębniono rynek lokalny oraz segment nieruchomości podobnych właściwy dla przedmiotu wyceny;</li><li>utworzono zbiór nieruchomości podobnych o znanych cenach, warunkach transakcji oraz ocenach cech przyjętych do analizy;</li><li>zbadano zmianę poziomu cen w czasie i przyjęto sposób aktualizacji cen na datę wyceny;</li><li>obliczono skorygowane ceny jednostkowe Cₛ dla transakcji przyjętych do analizy;</li><li>ustalono Cmin, Cśr i Cmax oraz rozpiętość cenową ΔC;</li><li>ustalono cechy rynkowe wpływające na zróżnicowanie cen i przypisano im wagi;</li><li>zdefiniowano skalę ocen każdej cechy i oceniono nieruchomość wycenianą;</li><li>scharakteryzowano nieruchomości o cenie minimalnej i maksymalnej, stanowiące punkty odniesienia dla przedziału cenowego;</li><li>obliczono dolną i górną granicę sumy współczynników korygujących oraz zakres Ui dla każdej cechy;</li><li>wyznaczono ΣUi właściwą dla ocen nieruchomości wycenianej;</li><li>obliczono wartość jednostkową i wartość rynkową jako iloczyn powierzchni, Cśr i ΣUi.</li></ol><div class="formula">W = Pu × Cśr × ΣUi</div><p>Obliczenia wykonywane są na wartościach o pełnej precyzji. Zaokrąglenia prezentacyjne w tabelach nie są wykorzystywane do ponownego liczenia wyniku końcowego.</p>`))}

  ${section('13. OKREŚLENIE WARTOŚCI NIERUCHOMOŚCI',
    sub('13.1. Zestawienie transakcji nieruchomości porównawczych oraz określenie wpływu trendu czasowego na ceny nieruchomości',
      p(`Do analizy przyjęto ${calc.correctedTransactions.length} transakcji spełniających kryteria badanego segmentu. Dla każdej transakcji punktem wyjścia jest cena jednostkowa Cₜ w dacie transakcji. Jeżeli zastosowano trend czasowy, cenę sprowadza się do poziomu cen z daty wyceny. Wartość Δt w tabeli transakcji oznacza okres od daty transakcji do daty wyceny, natomiast w tabeli par trendu — odstęp czasowy pomiędzy porównywanymi transakcjami.`)+
      (calc.trendMode==='regression' ? `<div class="calc-box"><b>Regresja liniowa:</b> C(t) = ${fmt(calc.regression?.intercept||0,4)} + ${fmt(calc.regression?.slope||0,4)} × t; R² = ${fmt(calc.regression?.r2||0,4)}. Trend względny przyjęty do aktualizacji: ${fmt(calc.trendApplied,4)}%/m-c. W OPERO trend względny w tym trybie stanowi iloraz miesięcznego nachylenia linii i średniej ceny jednostkowej w zbiorze.</div>` : `<div class="formula">vₜ = ((C₁ - C₂) / (C₂ × Δt)) × 100%</div>`)+
      (trendRows.length?table(['C₁ nr','C₁ [zł/m²]','C₂ nr','C₂ [zł/m²]','Δt [m-c]','vₜ [%/m-c]'], trendRows):'')+
      `<div class="calc-box">${esc(trendSourceText)}</div>`+
      `<div class="formula">Cₛ = Cₜ × (100 + vₜ × Δt) / 100</div>`+
      table(transactionHeaders,transactionRows,'market-table')+
      p(isPairs?`Po aktualizacji cen ustalono zakres cen w zbiorze: Cmin = ${fmt(calc.cmin,2)} zł/m², Cśr = ${fmt(calc.cavg,2)} zł/m² oraz Cmax = ${fmt(calc.cmax,2)} zł/m². Do bezpośredniego porównania wykorzystano ${calc.pairComparisonCount||0} nieruchomości.`:`Po aktualizacji cen ustalono Cmin = ${fmt(calc.cmin,2)} zł/m², Cśr = ${fmt(calc.cavg,2)} zł/m² oraz Cmax = ${fmt(calc.cmax,2)} zł/m². Wartości te stanowią warunki brzegowe dalszych obliczeń metodą korygowania ceny średniej.`))+
    sub('13.2. Określenie cech rynkowych oraz ich wag i ocen',
      p(`Cechy rynkowe przyjęto w taki sposób, aby odzwierciedlały czynniki istotnie różnicujące ceny w analizowanym segmencie. Dla każdej cechy zdefiniowano skalę ocen oraz wagę. Wagi odnoszą się do udziału danej cechy w zróżnicowaniu cen i łącznie powinny wynosić 1,00. Pary przypisane do cech mogą służyć jako materiał dowodowy do oceny wpływu cechy, lecz nie są tym samym co pary wykorzystywane do trendu czasowego.`)+      p(`Sposób ustalenia wag: ${weightMethodLabel}. ${m.weightJustification||'[DO UZUPEŁNIENIA — uzasadnienie sposobu ustalenia wag]'}`)+

      `<div class="calc-box">Cmin = <b>${fmt(calc.cmin,2)}</b> zł/m²; Cśr = <b>${fmt(calc.cavg,2)}</b> zł/m²; Cmax = <b>${fmt(calc.cmax,2)}</b> zł/m²; ΔC = <b>${fmt(calc.deltaC,2)}</b> zł/m².</div>`+
      table(featureHeaders,featureRows)+
      `<p>Suma przyjętych wag: <b>${fmt(calc.weightSum,4)}</b> (${fmt(calc.weightSum*100,2)}%).</p>`)+
    sub('13.3. Ocena wycenianej nieruchomości w aspekcie cech rynkowych',
      p(`Nieruchomość wycenianą oceniono w odniesieniu do tej samej skali, która została zdefiniowana dla badanego rynku. Ocena każdej cechy wymaga uzasadnienia na podstawie stanu nieruchomości, oględzin i danych porównawczych. Poniższa tabela przedstawia oceny nieruchomości wycenianej wykorzystane w dalszych obliczeniach.`)+
      table(['Lp.','Cecha','Ocena','Uzasadnienie'],calc.uiRows.map((r,i)=>[i+1,esc(r.name),esc(r.rating),esc((featureById.get(r.id)||marketFeatures.find(f=>f.name===r.name))?.ratingNote||'[DO UZUPEŁNIENIA]')])) )+
    (isPairs ?
      sub('13.4. Bezpośrednie porównania parami',
        p(`Do bezpośrednich porównań wybrano ${calc.pairComparisonCount||0} nieruchomości podobnych. Korekta dodatnia oznacza, że cecha nieruchomości wycenianej została oceniona korzystniej niż odpowiednia cecha nieruchomości porównawczej; korekta ujemna oznacza sytuację odwrotną.`)+
        table(['Nr','Nieruchomość podobna','Cena po trendzie [zł/m²]','Korekty cech','Σ korekt [zł/m²]','Cena po porównaniu [zł/m²]'],(calc.pairComparisons||[]).map(r=>[r.id,esc(r.address||''),fmt(r.correctedPrice,2),r.featureCorrections.map(c=>`${esc(c.name)}: ${esc(c.comparableRating||'—')} → ${esc(c.subjectRating||'—')} = ${c.correction>=0?'+':''}${fmt(c.correction,2)}`).join('<br>'),`${r.totalCorrection>=0?'+':''}${fmt(r.totalCorrection,2)}`,`<b>${fmt(r.adjustedPrice,2)}</b>`])) )+
      sub('13.5. Oszacowanie wartości rynkowej wycenianej nieruchomości',
        p(`Średnia skorygowanych cen jednostkowych z bezpośrednich porównań wynosi ${fmt(calc.pairUnitRaw||0,2)} zł/m². Wartość końcową obliczono przez przemnożenie tej wartości przez powierzchnię przyjętą do wyceny.`)+
        `<div class="formula">WN = ${fmt(calc.area,2)} m² × ${fmt(calc.pairUnitRaw||0,4)} zł/m² = ${money(calc.valueRaw,2)}</div><div class="highlight-value">WN = ${money(calc.valueRounded,0)}</div><p style="text-align:center">(słownie): ${esc(finalWords)}</p><p>Wynik zaprezentowano po zaokrągleniu do ${fmt(calc.roundTo,0)} zł. Wszystkie cząstkowe korekty pozostają widoczne w tabeli, aby umożliwić kontrolę toku obliczeń.</p>`)
      :
      sub('13.4. Charakterystyka nieruchomości o cenie maksymalnej i minimalnej',
        (()=>{const mx=calc.correctedTransactions.find(x=>x.correctedPrice===calc.cmax)||{}, mn=calc.correctedTransactions.find(x=>x.correctedPrice===calc.cmin)||{};return `<h3>NIERUCHOMOŚĆ O CENIE MAKSYMALNEJ – Cmax</h3>${kv([['Adres',val(mx.address)],['Data transakcji',datePL(mx.date)],['Powierzchnia',mx.area?`${fmt(mx.area,2)} m²`:val('')],['Cena jednostkowa przed aktualizacją',`${fmt(mx.priceUnit,2)} zł/m²`],['Cena jednostkowa po aktualizacji',`${fmt(calc.cmax,2)} zł/m²`]])}${extremeFeatureTable(mx)}${p(narratives.extremeMax || `Nieruchomość o cenie maksymalnej została wskazana na podstawie skorygowanej ceny jednostkowej. Jej znaczenie dla wyceny wynika z położenia w badanym przedziale cenowym oraz zweryfikowanych ocen cech rynkowych przedstawionych powyżej. [DO UZUPEŁNIENIA — dodatkowa charakterystyka, jeżeli wymaga jej dokumentacja źródłowa]`)}<h3>NIERUCHOMOŚĆ O CENIE MINIMALNEJ – Cmin</h3>${kv([['Adres',val(mn.address)],['Data transakcji',datePL(mn.date)],['Powierzchnia',mn.area?`${fmt(mn.area,2)} m²`:val('')],['Cena jednostkowa przed aktualizacją',`${fmt(mn.priceUnit,2)} zł/m²`],['Cena jednostkowa po aktualizacji',`${fmt(calc.cmin,2)} zł/m²`]])}${extremeFeatureTable(mn)}${p(narratives.extremeMin || `Nieruchomość o cenie minimalnej została wskazana na podstawie skorygowanej ceny jednostkowej. Jej znaczenie dla wyceny wynika z położenia w badanym przedziale cenowym oraz zweryfikowanych ocen cech rynkowych przedstawionych powyżej. [DO UZUPEŁNIENIA — dodatkowa charakterystyka, jeżeli wymaga jej dokumentacja źródłowa]`)}`;})())+
      sub('13.5. Oszacowanie wartości rynkowej wycenianej nieruchomości',
        p(`Na podstawie Cmin, Cśr i Cmax wyznaczono granice sumy współczynników korygujących. Następnie dla każdej cechy obliczono Ui min i Ui max proporcjonalnie do jej wagi. Położenie ceny średniej w przedziale Cmin–Cmax opisuje parametr P, na podstawie którego wyznaczono poziom średni Ui. Współczynnik właściwy dla nieruchomości wycenianej wynika z jej oceny w przyjętej skali.`)+
        `<div class="calc-box"><b>Cmin/Cśr = ${fmt(calc.lower,4)}</b> &nbsp;&nbsp; <b>Cmax/Cśr = ${fmt(calc.upper,4)}</b><br>Parametr P = (Cśr - Cmin)/(Cmax - Cmin) = <b>${fmt(calc.p,4)}</b></div>`+
        `<div class="formula">Ui min = waga × (Cmin/Cśr) &nbsp;&nbsp;&nbsp; Ui max = waga × (Cmax/Cśr)<br>Ui śr = Ui min + P × (Ui max - Ui min)</div>`+
        table(['Lp.','Cecha','Waga','min','śr','max','Ocena','Współczynnik'],uiRows)+
        `<div class="calc-box">ΣUi = <b>${fmt(calc.sumUi,8)}</b><br>Wartość jednostkowa przed końcowym zaokrągleniem = <b>${fmt(calc.unitRaw,4)} zł/m²</b></div>`+
        `<div class="formula">WN = ${fmt(calc.area,2)} m² × ${fmt(calc.cavg,4)} zł/m² × ${fmt(calc.sumUi,8)} = ${money(calc.valueRaw,2)}</div><div class="highlight-value">WN = ${money(calc.valueRounded,0)}</div><p style="text-align:center">(słownie): ${esc(finalWords)}</p><p>Obliczenie końcowe wykonano na wartościach niezaokrąglonych. Wynik zaprezentowano po zaokrągleniu do ${fmt(calc.roundTo,0)} zł, a wartość jednostkowa wynikająca z wartości końcowej wynosi ${fmt(calc.unitAfterRound,2)} zł/m².</p>`)))}

  ${section('14. WYNIK KOŃCOWY WYCENY Z UZASADNIENIEM', p(narratives.result || defaultResultNarrative) + `<div class="highlight-value">${money(calc.valueRounded,0)}</div>`)}
  ${section('15. KLAUZULE I USTALENIA DODATKOWE', p(project.clauses || '[DO UZUPEŁNIENIA]'))}
  ${section('16. ZAŁĄCZNIKI', `<ul>${(project.attachments||[]).map(x=>`<li>${esc(x)}</li>`).join('') || '<li>[DO UZUPEŁNIENIA]</li>'}</ul>${photoBlock(attachmentPhotos,'Materiały graficzne / załączniki')}${fileAttachmentsBlock(attachedFiles)}<div class="signature"><div>${esc(project.author?.name||'podpis rzeczoznawcy majątkowego')}</div></div>`)}
  ${costBlock(project)}
  `;

  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${esc(reportTitle)}</title><style>${buildCSS(project)}</style></head><body>${body}</body></html>`;
}

const OperatReportAPI = { buildHTML, buildCSS, THEMES };
if (typeof module !== 'undefined' && module.exports) module.exports = OperatReportAPI;
if (typeof window !== 'undefined') window.OperatReport = OperatReportAPI;

})();
