'use strict';
/** OPERO — Express: szybka wycena. Czysta logika. */
const path = require('path');
const R = path.join(__dirname, '..', 'build', 'app', 'renderer');
const W = require(path.join(R, 'szybka-wycena.js')), S = require(path.join(R, 'szukanie.js'));
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };
console.log('OPERO — Express: szybka wycena\n');

const k = S.kryteria({ miejscowosc: 'Gdańsk', dzielnica: 'Osowa', ulica: 'Siedleckiego', powierzchnia: 68, pokoje: 3, pietro: 2, dataWyceny: '2026-11-13', odchylkaPowPct: 25 });
const tr = (i, jedn, pow = 66 + (i % 5), ulica = 'Siedleckiego') => ({ adres: `ul. ${ulica} ${i}, Gdańsk`, miejscowosc: 'Gdańsk', dzielnica: 'Osowa', data: `2026-0${1 + (i % 9)}-15`, powierzchnia: pow, cena: Math.round(jedn * pow), jednostkowa: jedn, pokoje: 3, pietro: 2 });
const ceny = [9800, 10000, 10100, 10200, 10300, 10400, 10500, 10600, 10800];
const zbior = ceny.map((c, i) => tr(i + 1, c));

T('kwantyl: mediana i kwartyle z interpolacją', W.kwantyl([1, 2, 3, 4], 0.5) === 2.5 && W.kwantyl([1, 2, 3, 4, 5], 0.25) === 2 && W.kwantyl([7], 0.75) === 7 && W.kwantyl([], 0.5) === null);
const w = W.wycen(zbior, k, { stan: 'przecietny', dobierz: S.dopasuj });
T('z dziewięciu podobnych transakcji powstaje wycena', w.ok && w.ile === 9, [w.ok, w.ile, w.powod]);
T('stan przeciętny = mediana cen', w.jednostkowa === 10300 && w.mediana === 10300, [w.jednostkowa, w.mediana]);
T('wartość = cena za m² × powierzchnia, zaokrąglona do tysiąca', w.wartosc === Math.round(10300 * 68 / 1000) * 1000, w.wartosc);
T('przedział to dolny i górny kwartyl', w.q1 === 10100 && w.q3 === 10500 && w.od === Math.round(10100 * 68 / 1000) * 1000 && w.do === Math.round(10500 * 68 / 1000) * 1000, [w.q1, w.q3]);
T('wartość leży w przedziale', w.wartosc >= w.od && w.wartosc <= w.do);
T('do remontu = dolny kwartyl, wysoki standard = górny', W.wycen(zbior, k, { stan: 'remont', dobierz: S.dopasuj }).jednostkowa === 10100 && W.wycen(zbior, k, { stan: 'wysoki', dobierz: S.dopasuj }).jednostkowa === 10500);
T('stan dobry = między medianą a górnym kwartylem', W.wycen(zbior, k, { stan: 'dobry', dobierz: S.dopasuj }).jednostkowa === 10400);
T('nieznany stan liczy się jak przeciętny', W.wycen(zbior, k, { stan: 'cokolwiek', dobierz: S.dopasuj }).jednostkowa === 10300);
T('dużo transakcji i mały rozrzut = wysoka pewność', w.pewnosc === 'wysoka' && w.rozrzutPct < 15, [w.pewnosc, w.rozrzutPct]);
T('lista pokazuje najlepiej dopasowane, najwyżej sześć', w.transakcje.length === 6 && w.transakcje.every(t => t.jednostkowa > 0 && t.adres));
const malo = W.wycen(zbior.slice(0, 2), k, { dobierz: S.dopasuj });
T('przy dwóch transakcjach program NIE podaje wartości', malo.ok === false && /za mało/.test(malo.powod) && malo.wartosc === undefined, malo);
T('przy zerze transakcji mówi, że nic nie znalazł', /Nie znalazłem podobnych/.test(W.wycen([], k, { dobierz: S.dopasuj }).powod));
T('bez powierzchni nie liczy', W.wycen(zbior, { ...k, powierzchnia: 0 }, { dobierz: S.dopasuj }).ok === false);
const zOfertami = W.wycen([...zbior, { ...tr(50, 25000), rodzajZrodla: 'oferty' }], k, { dobierz: S.dopasuj });
T('ceny ofertowe nie wchodzą do szybkiej wyceny', zOfertami.q3 === 10500 && zOfertami.ile === 9, [zOfertami.q3, zOfertami.ile]);
const obce = W.wycen([...zbior, { adres: 'ul. Długa 1, Kraków', miejscowosc: 'Kraków', data: '2026-05-01', powierzchnia: 68, cena: 1360000, jednostkowa: 20000 }], k, { dobierz: S.dopasuj });
T('transakcja z innego miasta nie zmienia wyniku', obce.mediana === 10300 && obce.ile === 9, [obce.mediana, obce.ile]);
const rozrzucone = W.wycen([7000, 8500, 10000, 11500, 13000].map((c, i) => tr(i + 1, c)), k, { dobierz: S.dopasuj });
T('duży rozrzut cen obniża pewność', rozrzucone.ok && rozrzucone.pewnosc === 'niska', [rozrzucone.pewnosc, rozrzucone.rozrzutPct]);

const o1 = W.oferta(w, 700000), o2 = W.oferta(w, 800000), o3 = W.oferta(w, 600000);
T('oferta w przedziale rynku', o1.wPrzedziale === true && /mieści się/.test(o1.zdanie), o1);
T('oferta powyżej przedziału: o ile procent wyższa', o2.wPrzedziale === false && o2.pct > 0 && /wyższa/.test(o2.zdanie) && /14,3%/.test(o2.zdanie), o2);
T('oferta poniżej przedziału', o3.wPrzedziale === false && o3.pct < 0 && /niższa/.test(o3.zdanie));
T('bez ceny ofertowej nie ma porównania', W.oferta(w, 0) === null && W.oferta(malo, 700000) === null);
T('cztery stany lokalu, każdy z opisem skąd bierze cenę', W.STANY.length === 4 && W.STANY.every(s => s.id && s.nazwa && /kwartyl|median/.test(s.opis)));

console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);
