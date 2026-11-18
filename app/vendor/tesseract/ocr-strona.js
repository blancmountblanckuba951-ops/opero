/* OPERO — odczyt pisma Tesseractem (Apache-2.0) w ukrytym oknie programu.
   Wszystko lokalnie: silnik, model języka polskiego, obraz. Nic nie wychodzi do sieci. */
'use strict';
let operoWorker = null;
async function operoOcrWorker() {
  if (operoWorker) return operoWorker;
  const baza = new URL('./', location.href).href;
  operoWorker = await Tesseract.createWorker('pol', 1, {
    workerPath: baza + 'worker.min.js', corePath: baza + 'core/', langPath: baza + 'lang/',
    cacheMethod: 'none', gzip: true, workerBlobURL: false,
  });
  await operoWorker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
  return operoWorker;
}
/** dataUrl -> { ok, slowa:[{t,x,y,w,h}], szer, wys } */
window.operoOcr = async function (dataUrl) {
  const w = await operoOcrWorker();
  const { data } = await w.recognize(dataUrl, {}, { blocks: true });
  const slowa = [];
  for (const b of (data.blocks || [])) for (const p of (b.paragraphs || [])) for (const l of (p.lines || [])) for (const s of (l.words || [])) {
    const t = String(s.text || '').trim(); if (!t) continue;
    slowa.push({ t, x: s.bbox.x0, y: s.bbox.y0, w: s.bbox.x1 - s.bbox.x0, h: s.bbox.y1 - s.bbox.y0, c: Math.round(s.confidence) });
  }
  return { ok: true, slowa };
};
window.operoOcrGotowy = true;
