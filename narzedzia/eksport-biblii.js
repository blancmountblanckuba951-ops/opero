#!/usr/bin/env node
'use strict';
/**
 * Wyjmuje Biblię OPERO z Supabase i zapisuje ją jako plik, który wchodzi do
 * instalatora. Uruchamia się RAZ przed wydaniem — potem program nie potrzebuje
 * już żadnego serwera.
 *
 * To jedyne miejsce w całym OPERO, które jeszcze wie o Supabase, i jest poza
 * programem: narzędzie autora, nie część tego, co dostaje rzeczoznawca.
 *
 * Użycie:
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node eksport-biblii.js --do ../build/app/zasoby/biblia.json
 *
 * Opcje:
 *   --do <plik>       gdzie zapisać (domyślnie ../build/app/zasoby/biblia.json)
 *   --wersja <kod>    kod snapshotu (domyślnie KB-2026.09.01-v1)
 *   --bez-egzaminu    pomiń bank 149 testów Agrafka (mniejszy plik)
 */
const fs = require('node:fs');
const path = require('node:path');

const arg = (n, d = null) => { const i = process.argv.indexOf('--' + n); if (i < 0) return d; const v = process.argv[i + 1]; return v && !v.startsWith('--') ? v : true; };

const URL_BAZY = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KLUCZ = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
if (!URL_BAZY || !KLUCZ) {
  console.error('\n  Brakuje SUPABASE_URL albo SUPABASE_SERVICE_ROLE_KEY w zmiennych środowiska.\n');
  process.exit(2);
}
const KOD = String(arg('wersja', 'KB-2026.09.01-v1'));
const CEL = path.resolve(String(arg('do', path.join(__dirname, '..', 'build', 'app', 'zasoby', 'biblia.json'))));
const BEZ_EGZAMINU = arg('bez-egzaminu') === true;

/** Jedno zapytanie do PostgREST. Strony po 1000 wierszy — domyślny limit Supabase. */
async function pobierz(tabela, kolumny, filtr = '') {
  const out = [];
  for (let od = 0; ; od += 1000) {
    const u = `${URL_BAZY}/rest/v1/${tabela}?select=${encodeURIComponent(kolumny)}${filtr}`;
    const r = await fetch(u, {
      headers: { apikey: KLUCZ, Authorization: `Bearer ${KLUCZ}`, Range: `${od}-${od + 999}`, 'Accept-Profile': 'public' },
    });
    if (!r.ok) throw new Error(`${tabela}: HTTP ${r.status} ${await r.text()}`);
    const d = await r.json();
    out.push(...d);
    if (d.length < 1000) break;
  }
  return out;
}

(async () => {
  const wersje = await pobierz('opero_knowledge_versions', 'id,code,name,status,legal_state_date,activated_at', `&code=eq.${encodeURIComponent(KOD)}`);
  const v = wersje[0];
  if (!v) throw new Error(`Nie znaleziono snapshotu Biblii o kodzie ${KOD}.`);
  const f = `&version_id=eq.${v.id}`;

  const [types, rules, links, topics, routes, sources, examCases] = await Promise.all([
    pobierz('opero_valuation_types', 'id,code,name,status'),
    pobierz('opero_knowledge_rules', 'id,valuation_type_id,source_id,category,rule_code,title,content,formula,source_page_from,source_page_to,confidence,priority', f),
    pobierz('opero_source_links', 'id,link_code,title,authority,data_type,url,access_type,geographic_scope,formats,can_prefill,how_to_use,cautions,checked_at', f),
    pobierz('opero_source_topics', 'valuation_type_id,topic_code,source_link_id,preferred_order,trust_tier,what_to_find,verification_steps,suitable_for,unsuitable_for,can_auto_prefill,requires_human_verification,metadata', f),
    pobierz('opero_question_routes', 'route_code,title,answer_policy,fallback_instruction,response_requirements', f),
    pobierz('opero_knowledge_sources', 'id,source_key,source_kind,title,original_filename,page_count,legal_state_date,source_url', f),
    BEZ_EGZAMINU ? Promise.resolve([]) : pobierz('opero_piorek_exam_cases', '*', `${f}&active=not.is.false`),
  ]);

  if (!rules.length) throw new Error('Snapshot nie ma ani jednej reguły — to nie wygląda na kompletną Biblię.');

  const snapshot = {
    ok: true,
    version: { code: v.code, name: v.name, status: v.status, legalStateDate: v.legal_state_date, activatedAt: v.activated_at, preview: v.status !== 'active' },
    types, rules, links, topics, routes, sources, examCases,
    generatedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(CEL), { recursive: true });
  fs.writeFileSync(CEL, JSON.stringify(snapshot), 'utf8');
  const kb = Math.round(fs.statSync(CEL).size / 1024);
  console.log('');
  console.log(`  snapshot      ${v.code} (${v.status})`);
  console.log(`  reguły        ${rules.length}`);
  console.log(`  książki       ${sources.length}`);
  console.log(`  źródła        ${links.length} linków, ${topics.length} tematów`);
  console.log(`  rodzaje       ${types.length}`);
  console.log(`  egzamin       ${examCases.length} testów`);
  console.log(`  zapisano      ${CEL} (${kb} kB)`);
  console.log('');
})().catch(e => { console.error('\n  BŁĄD:', e.message, '\n'); process.exit(1); });
