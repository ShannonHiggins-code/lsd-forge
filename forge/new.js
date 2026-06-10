'use strict';

const fs   = require('fs');
const path = require('path');
const { lintFile }   = require('../linter/index');
const { formatFile } = require('../linter/reporter');

// ── ID generation ─────────────────────────────────────────────────────────────

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

function generateId(specsDir) {
  const year = new Date().getFullYear();
  let max    = 0;
  const pat  = new RegExp(`LS-${year}-(\\d{3})`);
  for (const f of walkLogicFiles(specsDir)) {
    const m = path.basename(f).match(pat);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `LS-${year}-${String(max + 1).padStart(3, '0')}`;
}

// ── File builder ──────────────────────────────────────────────────────────────

function slugify(str) {
  return str
    .replace(/\//g, '-')
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    .replace(/^-|-$/g, '');
}

function buildLogicFile(a) {
  const today  = new Date().toISOString().slice(0, 10);
  const happy  = a.happy_path_steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const edge   = a.edge_steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const auth   = a.authorized_files.length
    ? a.authorized_files.map(f => `  - ${f}`).join('\n')
    : '  - (none)';
  const forbid = a.forbidden_files.length
    ? a.forbidden_files.map(f => `  - ${f}`).join('\n')
    : '  - (none)';
  const fence  = a.regression_fence.length
    ? a.regression_fence.map(r => `- ${r}`).join('\n')
    : '- No specific regression fence declared.';
  const debt   = a.context_debt && a.context_debt.trim()
    ? a.context_debt.trim()
    : 'No context debt noted.';

  return [
    '---',
    `id: ${a.id}`,
    'version: 1.0.0',
    `domain: ${a.domain}`,
    'requires: []',
    `owner: ${a.owner}`,
    `validated_against: ${today}`,
    '---',
    '',
    '## 1. TARGET_BOUNDARIES',
    '',
    `runtime: ${a.runtime}`,
    `data_stores: ${a.data_stores}`,
    'authorized_files:',
    auth,
    'forbidden_files:',
    forbid,
    '',
    '## 2. INTENT_HAPPY_PATH',
    '',
    happy,
    '',
    '## 3. EDGE_CRITICAL_UNHAPPY_PATH',
    '',
    edge,
    '',
    '## 4. REGRESSION_FENCE',
    '',
    fence,
    '',
    '## 5. CONTEXT_DEBT_NOTE',
    '',
    debt,
    '',
  ].join('\n');
}

// ── Core ──────────────────────────────────────────────────────────────────────

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

function newSpec(projectRoot, answers) {
  const specsDir = resolveSpecsDir(projectRoot);
  const id       = answers.id || generateId(specsDir);
  const full     = { ...answers, id };
  const content  = buildLogicFile(full);

  const outPath = answers.output_path
    ? (path.isAbsolute(answers.output_path)
        ? answers.output_path
        : path.join(projectRoot, answers.output_path))
    : path.join(specsDir, `${id}-${slugify(answers.domain)}.logic`);

  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, content, 'utf8');
  } catch (err) {
    return { ok: false, error: `Could not write spec: ${err.message}`, filePath: outPath };
  }

  const lintResult = lintFile(outPath);
  const lintPassed = lintResult.passed && !lintResult.parseError;

  return { ok: lintPassed, id, filePath: outPath, lintResult, content };
}

// ── Output ────────────────────────────────────────────────────────────────────

function formatNew(result, flags) {
  const plain = !!(flags && flags.plain);
  const C = plain ? { g:'', y:'', r:'', x:'', b:'', d:'' } : {
    g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m',
    x: '\x1b[0m',  b: '\x1b[1m',  d: '\x1b[2m',
  };

  if (!result.ok && result.error) {
    return `${C.r}✗ Error: ${result.error}${C.x}`;
  }

  const badge = result.ok
    ? `${C.g}${C.b}✓ Spec created${C.x}`
    : `${C.y}${C.b}⚠ Spec created with lint issues${C.x}`;

  return [
    `${badge}  ${C.d}${result.filePath}${C.x}`,
    '',
    formatFile(result.lintResult, { plain }),
  ].join('\n');
}

module.exports = { newSpec, generateId, buildLogicFile, slugify, formatNew };
