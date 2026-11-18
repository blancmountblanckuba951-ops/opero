(function(){
'use strict';

function num(v, fallback = 0) {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}
function round(value, digits = 0) {
  const p = 10 ** digits;
  return Math.round((value + Number.EPSILON) * p) / p;
}
function mean(arr) {
  const a = arr.filter(Number.isFinite);
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dateValue(v){ const d=v?new Date(String(v).slice(0,10)+'T12:00:00Z'):null; return d&&!Number.isNaN(d.getTime())?d:null; }
function monthsBetweenDates(a,b){ const da=dateValue(a),db=dateValue(b); if(!da||!db)return 0; return (db.getTime()-da.getTime())/(365.2425/12*86400000); }
function pearson(xs,ys){ if(xs.length!==ys.length||xs.length<3)return 0; const xm=mean(xs),ym=mean(ys); let nume=0,dx=0,dy=0; for(let i=0;i<xs.length;i++){const a=xs[i]-xm,b=ys[i]-ym;nume+=a*b;dx+=a*a;dy+=b*b;} return dx&&dy?nume/Math.sqrt(dx*dy):0; }
function ratingScore(r,mode){ const maps={two:{'Niekorzystna':1,'Korzystna':2},three:{'Niekorzystna':1,'Przeciętna':2,'Korzystna':3},five:{'Bardzo niekorzystna':1,'Niekorzystna':2,'Przeciętna':3,'Korzystna':4,'Bardzo korzystna':5}}; const m=maps[mode]||maps.three; return m[String(r||'')]||0; }

function regressionTrend(transactions) {
  const rows = transactions.map(t => {
    const d = t.date ? new Date(String(t.date).slice(0,10) + 'T12:00:00Z') : null;
    return { date: d && !Number.isNaN(d.getTime()) ? d : null, y: num(t.priceUnit) };
  }).filter(r => r.date && r.y > 0);
  if (rows.length < 3) return { valid:false, count:rows.length, slope:0, intercept:0, r2:0, meanPrice:mean(rows.map(r=>r.y)), monthlyRate:0, annualRate:0 };
  rows.sort((a,b)=>a.date-b.date);
  const t0 = rows[0].date.getTime();
  const monthMs = 365.2425 / 12 * 86400000;
  const xs = rows.map(r => (r.date.getTime()-t0)/monthMs);
  const ys = rows.map(r => r.y);
  const xm = mean(xs), ym = mean(ys);
  let sxx=0, sxy=0;
  for(let i=0;i<xs.length;i++){ sxx += (xs[i]-xm)**2; sxy += (xs[i]-xm)*(ys[i]-ym); }
  const slope = sxx ? sxy/sxx : 0;
  const intercept = ym - slope*xm;
  let ssTot=0, ssRes=0;
  for(let i=0;i<xs.length;i++){ const fit=intercept+slope*xs[i]; ssTot+=(ys[i]-ym)**2; ssRes+=(ys[i]-fit)**2; }
  const r2 = ssTot ? 1-ssRes/ssTot : 0;
  const monthlyRate = ym ? slope/ym*100 : 0;
  return { valid:true, count:rows.length, slope, intercept, r2, meanPrice:ym, monthlyRate, annualRate:monthlyRate*12, firstDate:rows[0].date.toISOString().slice(0,10), lastDate:rows[rows.length-1].date.toISOString().slice(0,10) };
}

function calculate(project) {
  const valuationDate = project.valuation?.valuationDate || project.valuation?.priceLevelDate || '';
  const transactions = (project.market?.transactions || []).map((t, i) => {
    const explicitMonths=num(t.monthsToValuation); const derivedMonths=(dateValue(t.date)&&dateValue(valuationDate))?monthsBetweenDates(t.date,valuationDate):explicitMonths; const autoMonths=t.autoMonthsToValuation===true?derivedMonths:(explicitMonths>0?explicitMonths:derivedMonths);
    return {...t,id:Number(t.id||i+1),priceUnit:num(t.priceUnit),monthsToValuation:autoMonths,area:num(t.area),featureRatings:{...(t.featureRatings||{})}};
  });
  const byId = new Map(transactions.map(t => [t.id, t]));

  const trendPairs = (project.market?.trendPairs || []).map((p, i) => {
    const c1t = byId.get(Number(p.c1Id));
    const c2t = byId.get(Number(p.c2Id));
    const c1 = c1t ? c1t.priceUnit : num(p.c1);
    const c2 = c2t ? c2t.priceUnit : num(p.c2);
    const d1=dateValue(c1t?.date),d2=dateValue(c2t?.date);
    let months=num(p.months),valid=true,issue='';
    if(Number(p.c1Id)===Number(p.c2Id)){valid=false;issue='C₁ i C₂ wskazują tę samą transakcję';}
    if(d1&&d2){if(!(months>0))months=Math.abs(monthsBetweenDates(c2t.date,c1t.date));if(d1<=d2){valid=false;issue='C₁ powinno być transakcją bliższą dacie wyceny (późniejszą) niż C₂';}if(months<=0){valid=false;issue='odstęp czasu musi być większy od 0';}}
    else if(months<=0){valid=false;issue='brak prawidłowych dat transakcji do automatycznego ustalenia Δt';}
    if(!(c1>0&&c2>0)){valid=false;issue='obie transakcje muszą mieć dodatnią cenę jednostkową';}
    const rate = valid && c2 !== 0 && months !== 0 ? ((c1 - c2) / (c2 * months)) * 100 : 0;
    return { ...p, index:i+1,c1,c2,months,rate,valid,issue,date1:c1t?.date||'',date2:c2t?.date||'' };
  });
  const trendMode = project.market?.trendSourceMode || 'pairs';
  const pairTrend = mean(trendPairs.filter(p=>p.valid).map(p => p.rate));
  const regression = regressionTrend(transactions);
  const trendRaw = trendMode === 'manual' ? num(project.market?.manualTrendRate) : trendMode === 'none' ? 0 : trendMode === 'regression' ? regression.monthlyRate : pairTrend;
  const trendApplied = project.market?.trendPrecisionMode === 'raw'
    ? trendRaw
    : round(trendRaw, Number(project.market?.trendRoundDigits ?? 4));

  const correctedTransactions = transactions.map(t => ({
    ...t,
    correctedPrice: round(t.priceUnit * (100 + trendApplied * t.monthsToValuation) / 100, 2),
  }));
  const prices = correctedTransactions.map(t => t.correctedPrice).filter(x => x > 0);
  const cmin = prices.length ? Math.min(...prices) : 0;
  const cmax = prices.length ? Math.max(...prices) : 0;
  const cavg = mean(prices);
  const deltaC = cmax - cmin;
  const lower = cavg ? cmin / cavg : 0;
  const upper = cavg ? cmax / cavg : 0;
  const p = deltaC ? (cavg - cmin) / deltaC : 0;

  const featurePairDetails = [];
  const correctedById = new Map(correctedTransactions.map(t => [t.id, t]));
  const ratingMode = project.market?.ratingMode === 'excel3' ? 'three' : (project.market?.ratingMode || 'three');
  const weightMethod = project.market?.weightMethod || 'manual';
  const featureDrafts = (project.market?.features || []).map((f, fi) => {
    const pairResults = (f.pairs || []).map((pair, pi) => {
      const cwT = correctedById.get(Number(pair.cwId));
      const cmT = correctedById.get(Number(pair.cmId));
      const cw = cwT ? cwT.correctedPrice : num(pair.cw);
      const cm = cmT ? cmT.correctedPrice : num(pair.cm);
      const steps = Math.max(1, num(pair.steps, 1));
      const rawInfluence = deltaC ? ((cw - cm) / deltaC) / steps : 0;
      const r = { featureIndex:fi+1,pairIndex:pi+1,cwId:pair.cwId,cmId:pair.cmId,cw,cm,steps,rawInfluence };
      featurePairDetails.push(r); return r;
    });
    const pairSuggestedWeight = Math.max(0,mean(pairResults.map(x=>x.rawInfluence)));
    const xs=[],ys=[];
    const featureScaleMode=f.scaleMode||ratingMode;
    correctedTransactions.forEach(t=>{const score=ratingScore(t.featureRatings?.[f.id],featureScaleMode);if(score&&t.correctedPrice>0){xs.push(score);ys.push(t.correctedPrice);}});
    const correlation=pearson(xs,ys),correlationAbs=Math.abs(correlation);
    return {...f,scaleMode:featureScaleMode,pairResults,pairSuggestedWeight,correlation,correlationAbs,correlationCount:xs.length};
  });
  const corrSum=featureDrafts.reduce((s,f)=>s+f.correlationAbs,0);
  const features=featureDrafts.map(f=>{
    const correlationSuggestedWeight=corrSum?f.correlationAbs/corrSum:0;
    const suggestedWeight=weightMethod==='correlation'?correlationSuggestedWeight:weightMethod==='pairs'?f.pairSuggestedWeight:0;
    return {...f,weight:num(f.weight),correlationSuggestedWeight,suggestedWeight};
  });
  const weightSum = features.reduce((s, f) => s + f.weight, 0);
  const uiRows = features.map(f => {
    const uiMin = f.weight * lower;
    const uiMax = f.weight * upper;
    const uiAvg = uiMin + p * (uiMax - uiMin);
    const scaleMode=f.scaleMode||ratingMode;
    const defaultRating=scaleMode==='two'?'Niekorzystna':'Przeciętna';
    const rating = f.rating || defaultRating;
    let selected;
    if (scaleMode === 'five') {
      const map = {
        'Bardzo niekorzystna': 0,
        'Niekorzystna': 0.25,
        'Przeciętna': 0.5,
        'Korzystna': 0.75,
        'Bardzo korzystna': 1,
      };
      const q = map[rating] ?? 0.5;
      if (q <= 0.5) selected = uiMin + (uiAvg - uiMin) * (q / 0.5);
      else selected = uiAvg + (uiMax - uiAvg) * ((q - 0.5) / 0.5);
    } else if (scaleMode === 'two') {
      selected = /korzystna/i.test(String(rating)) && !/niekorzystna/i.test(String(rating)) ? uiMax : uiMin;
    } else {
      const norm = String(rating).toLowerCase();
      if (norm.startsWith('min') || norm.startsWith('niekorz')) selected = uiMin;
      else if (norm.startsWith('max') || norm.startsWith('mak') || norm.startsWith('korz')) selected = uiMax;
      else selected = uiAvg;
    }
    return { id:f.id, name: f.name, scaleMode, weight: f.weight, suggestedWeight: f.suggestedWeight, uiMin, uiAvg, uiMax, rating, selected };
  });

  const sumUi = uiRows.reduce((s, r) => s + r.selected, 0);
  const area = num(project.property?.usableArea);
  const methodCode = project.valuation?.methodCode || (project.module?.code==='developed_pairs'?'pairs':'kcm');
  const kcmUnitRaw = cavg * sumUi;
  const selectedForPairs = correctedTransactions.filter(t=>t.useForPair!==false && t.correctedPrice>0);
  const pairComparisons = selectedForPairs.map(t=>{
    const featureCorrections=features.map(f=>{
      const mode=f.scaleMode||ratingMode;
      const maxScore=mode==='five'?5:mode==='two'?2:3;
      const subjectScore=ratingScore(f.rating,mode), comparableScore=ratingScore(t.featureRatings?.[f.id],mode);
      const scoreDiff=(subjectScore&&comparableScore)?subjectScore-comparableScore:0;
      const correction=(subjectScore&&comparableScore&&deltaC)?deltaC*f.weight*(scoreDiff/Math.max(1,maxScore-1)):0;
      return {id:f.id,name:f.name,weight:f.weight,subjectRating:f.rating||'',comparableRating:t.featureRatings?.[f.id]||'',subjectScore,comparableScore,scoreDiff,correction:round(correction,2)};
    });
    const totalCorrection=featureCorrections.reduce((s,x)=>s+x.correction,0);
    return {...t,featureCorrections,totalCorrection:round(totalCorrection,2),adjustedPrice:round(t.correctedPrice+totalCorrection,2)};
  });
  const pairUnitRaw = mean(pairComparisons.map(x=>x.adjustedPrice).filter(x=>x>0));
  const unitRaw = methodCode==='pairs' ? pairUnitRaw : kcmUnitRaw;
  const valueRaw = area * unitRaw;
  const roundTo = Math.max(1, num(project.valuation?.roundTo, 1000));
  const valueRounded = Math.round(valueRaw / roundTo) * roundTo;
  const unitAfterRound = area ? valueRounded / area : 0;

  return {
    trendPairs,
    trendMode,
    pairTrend,
    regression,
    trendRaw,
    trendApplied,
    correctedTransactions,
    cmin, cmax, cavg, deltaC, lower, upper, p,
    featurePairDetails,
    features,
    weightMethod,
    weightSum,
    uiRows,
    sumUi,
    methodCode, pairComparisons, pairComparisonCount:pairComparisons.length, pairUnitRaw, kcmUnitRaw,
    area,
    unitRaw,
    valueRaw,
    roundTo,
    valueRounded,
    unitAfterRound,
  };
}

const ONES = ['', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć'];
const TEENS = ['dziesięć', 'jedenaście', 'dwanaście', 'trzynaście', 'czternaście', 'piętnaście', 'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście'];
const TENS = ['', '', 'dwadzieścia', 'trzydzieści', 'czterdzieści', 'pięćdziesiąt', 'sześćdziesiąt', 'siedemdziesiąt', 'osiemdziesiąt', 'dziewięćdziesiąt'];
const HUNDREDS = ['', 'sto', 'dwieście', 'trzysta', 'czterysta', 'pięćset', 'sześćset', 'siedemset', 'osiemset', 'dziewięćset'];
function triplet(n) {
  n = Math.floor(n);
  const h = Math.floor(n / 100), r = n % 100;
  const out = [];
  if (h) out.push(HUNDREDS[h]);
  if (r >= 10 && r < 20) out.push(TEENS[r - 10]);
  else {
    const t = Math.floor(r / 10), o = r % 10;
    if (t) out.push(TENS[t]);
    if (o) out.push(ONES[o]);
  }
  return out.join(' ');
}
function pluralForm(n, forms) {
  const n10 = n % 10, n100 = n % 100;
  if (n === 1) return forms[0];
  if (n10 >= 2 && n10 <= 4 && !(n100 >= 12 && n100 <= 14)) return forms[1];
  return forms[2];
}
function numberToPolishWords(value) {
  let n = Math.max(0, Math.floor(Math.abs(num(value))));
  if (n === 0) return 'zero';
  const groups = [
    { forms: ['', '', ''] },
    { forms: ['tysiąc', 'tysiące', 'tysięcy'] },
    { forms: ['milion', 'miliony', 'milionów'] },
    { forms: ['miliard', 'miliardy', 'miliardów'] },
  ];
  const parts = [];
  let gi = 0;
  while (n > 0 && gi < groups.length) {
    const g = n % 1000;
    if (g) {
      let words = triplet(g);
      if (gi > 0) {
        if (g === 1) words = groups[gi].forms[0];
        else words += ' ' + pluralForm(g, groups[gi].forms);
      }
      parts.unshift(words);
    }
    n = Math.floor(n / 1000);
    gi++;
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}


function calculateCost(project) {
  const c = project.costing || {};
  const labor = num(c.hours) * num(c.hourlyRate);
  const travel = num(c.travelKm) * num(c.costPerKm);
  const documents = num(c.documentsCost);
  const printing = num(c.printingCost);
  const tools = num(c.toolsCost ?? c.aiCost);
  const other = num(c.otherCost);
  const direct = documents + printing + tools + other;
  const totalCost = labor + travel + direct;
  const feeNet = num(c.clientFeeNet);
  const vatRate = num(c.vatRate);
  const vat = c.vatExempt ? 0 : feeNet * vatRate / 100;
  const feeGross = feeNet + vat;
  const profit = feeNet - totalCost;
  const margin = feeNet ? profit / feeNet * 100 : 0;
  return { labor, travel, documents, printing, tools, other, direct, totalCost, feeNet, vatRate, vat, feeGross, profit, margin };
}

const OperatCalcAPI = { calculate, calculateCost, regressionTrend, monthsBetweenDates, round, num, numberToPolishWords };
if (typeof module !== 'undefined' && module.exports) module.exports = OperatCalcAPI;
if (typeof window !== 'undefined') window.OperatCalc = OperatCalcAPI;

})();
