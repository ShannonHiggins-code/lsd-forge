'use strict';

const fs   = require('fs');
const path = require('path');
const { parse } = require('../linter/parser');

// ── Stop words ────────────────────────────────────────────────────────────────

const STOP = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','up','about','into','through','during','before','after',
  'is','are','was','were','be','been','being','have','has','had','do',
  'does','did','will','would','could','should','may','might',
  'i','we','you','he','she','it','they','me','him','her','us','them',
  'my','your','his','its','our','their','this','that','these','those',
  'what','which','who','how','when','where','why','just','also','can',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function tokenize(text) {
  return [...new Set(
    text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 3 && !STOP.has(t))
  )];
}

function walkLogicFiles(dir) {
  const results = [];
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory())               results.push(...walkLogicFiles(full));
      else if (e.name.endsWith('.logic')) results.push(full);
    }
  } catch (_) {}
  return results;
}

function resolveSpecsDir(projectRoot) {
  const cfgPath = path.join(projectRoot, '.lsd', 'config.json');
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg.specs_dir) return path.join(projectRoot, cfg.specs_dir);
    } catch (_) {}
  }
  return path.join(projectRoot, 'specs');
}

function occurrences(text, token) {
  let n = 0, i = 0;
  while ((i = text.indexOf(token, i)) !== -1) { n++; i++; }
  return n;
}

// ── Scoring ───────────────────────────────────────────────────────────────────
// Weights reflect signal strength: domain >> boundaries > intent steps > edges

function scoreSpec(tokens, parsed) {
  if (parsed.parseError) return { score: 0, matchedOn: [] };

  const { meta, sections } = parsed;
  const domain    = (meta.domain || '').toLowerCase();
  const bounds    = (sections.TARGET_BOUNDARIES          || '').toLowerCase();
  const happy     = (sections.INTENT_HAPPY_PATH          || '').toLowerCase();
  const edge      = (sections.EDGE_CRITICAL_UNHAPPY_PATH || '').toLowerCase();
  const fence     = (sections.REGRESSION_FENCE           || '').toLowerCase();
  const debt      = (sections.CONTEXT_DEBT_NOTE          || '').toLowerCase();

  let score = 0;
  const matched = [];

  for (const token of tokens) {
    if (domain.includes(token))  { score += 12; matched.push(`domain`); }
    if (bounds.includes(token))  { score += 6;  matched.push(`boundaries`); }
    const ho = Math.min(occurrences(happy, token), 3);
    if (ho > 0)                  { score += ho * 4; matched.push(`intent`); }
    if (edge.includes(token))    { score += 2; }
    if (fence.includes(token) ||
        debt.includes(token))    { score += 1; }
  }

  return { score, matchedOn: [...new Set(matched)] };
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Search the spec library for specs related to a plain-language description.
 * No external dependencies — pure keyword scoring over spec content.
 *
 * @param {string} projectRoot
 * @param {string} description
 * @param {{ limit?: number }} opts
 * @returns {{ id, domain, specPath, score, matchedOn }[]}
 */
function search(projectRoot, description, opts = {}) {
  const limit  = opts.limit || 5;
  const tokens = tokenize(description);
  if (tokens.length === 0) return [];

  const specsDir  = resolveSpecsDir(projectRoot);
  const specFiles = walkLogicFiles(specsDir);
  const results   = [];

  for (const specFile of specFiles) {
    try {
      const parsed            = parse(specFile);
      const { score, matchedOn } = scoreSpec(tokens, parsed);
      if (score > 0) {
        results.push({
          id:       (parsed.meta && parsed.meta.id)     || '(no id)',
          domain:   (parsed.meta && parsed.meta.domain) || '(no domain)',
          specPath: specFile,
          score,
          matchedOn,
        });
      }
    } catch (_) {}
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ── Output ────────────────────────────────────────────────────────────────────

function bar(pct, plain) {
  if (plain) return `[${String(pct).padStart(3)}%]`;
  const f = Math.round(pct / 10);
  return `\x1b[32m${'█'.repeat(f)}\x1b[90m${'░'.repeat(10 - f)}\x1b[0m`;
}

function formatSearch(results, description, flags) {
  const plain = !!(flags && flags.plain);
  const C = plain
    ? { b:'', x:'', d:'' }
    : { b:'\x1b[1m', x:'\x1b[0m', d:'\x1b[2m' };

  if (results.length === 0) {
    return `No specs matched "${description}".`;
  }

  const maxScore = results[0].score;
  const lines    = [`${results.length} related spec${results.length !== 1 ? 's' : ''} for: ${C.b}${description}${C.x}\n`];

  for (const r of results) {
    const pct  = Math.round((r.score / maxScore) * 100);
    const rel  = path.relative(process.cwd(), r.specPath).replace(/\\/g, '/');
    const why  = r.matchedOn.length > 0
      ? `  ${C.d}matched on: ${r.matchedOn.join(', ')}${C.x}`
      : '';

    lines.push(
      `  ${bar(pct, plain)}  ${C.b}${r.id}${C.x}  ${C.d}${r.domain}${C.x}${why}\n` +
      `               ${rel}`
    );
  }

  return lines.join('\n');
}

module.exports = { search, formatSearch, tokenize };
