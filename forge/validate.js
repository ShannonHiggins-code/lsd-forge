'use strict';

const fs   = require('fs');
const path = require('path');
const { parse } = require('../linter/parser');

/**
 * forge validate — cross-spec collision detection.
 *
 * Checks all .logic specs in specs/ for contradictions:
 *   1. File overlap   — two specs both authorize the same file (possible conflict)
 *   2. Domain overlap — two specs share a domain with contradictory REGRESSION_FENCE rules
 *   3. Forbidden exposure — a file appears authorized in one spec and forbidden in another
 *
 * @param {string} projectRoot
 * @param {{ plain, json }} flags
 * @returns {{ ok, collisions, warnings, data, error }}
 */
function validate(projectRoot, flags = {}) {
  const lsdDir    = path.join(projectRoot, '.lsd');
  const configPath = path.join(lsdDir, 'config.json');

  if (!fs.existsSync(configPath)) {
    return { ok: false, error: 'LSD FORGE not initialised. Run: forge init' };
  }

  let config = {};
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {
    return { ok: false, error: `Cannot read config.json: ${e.message}` };
  }

  const specsDir = path.join(projectRoot, config.specs_dir || 'specs');
  if (!fs.existsSync(specsDir)) {
    return { ok: true, collisions: [], warnings: [], data: { specs_checked: 0 } };
  }

  const specFiles = walkLogic(specsDir);
  const parsed    = specFiles.map(f => ({ filePath: f, ...parse(f) }))
                             .filter(p => !p.parseError);

  const collisions = [];
  const warnings   = [];

  // ── Check 1: Forbidden exposure ──────────────────────────────────────────────
  // File appears in authorized_files of one spec AND forbidden_files of another
  const authorizedMap = buildFileMap(parsed, 'authorized_files');
  const forbiddenMap  = buildFileMap(parsed, 'forbidden_files');

  for (const [file, authSpecs] of Object.entries(authorizedMap)) {
    if (forbiddenMap[file]) {
      collisions.push({
        type:    'forbidden-exposure',
        severity: 'error',
        file,
        authorized_in: authSpecs.map(rel(projectRoot)),
        forbidden_in:  forbiddenMap[file].map(rel(projectRoot)),
        message: `"${file}" is authorized in ${authSpecs.length} spec(s) but forbidden in ${forbiddenMap[file].length} spec(s).`,
        fix:     'Decide which spec is authoritative. Remove the file from the conflicting list.',
      });
    }
  }

  // ── Check 2: Domain overlap ──────────────────────────────────────────────────
  // Two specs share the same domain — may indicate duplicate or conflicting coverage
  const domainMap = {};
  for (const p of parsed) {
    const domain = p.meta.domain;
    if (!domain) continue;
    if (!domainMap[domain]) domainMap[domain] = [];
    domainMap[domain].push(p.filePath);
  }

  for (const [domain, files] of Object.entries(domainMap)) {
    if (files.length > 1) {
      warnings.push({
        type:    'domain-overlap',
        severity: 'warning',
        domain,
        specs:   files.map(rel(projectRoot)),
        message: `Domain "${domain}" is claimed by ${files.length} specs.`,
        fix:     'Verify these specs cover distinct sub-flows. If they conflict, consolidate or split the domain path.',
      });
    }
  }

  // ── Check 3: Authorized file overlap between specs (warning) ─────────────────
  // Same file authorized in multiple specs — not an error but worth reviewing
  for (const [file, authSpecs] of Object.entries(authorizedMap)) {
    if (authSpecs.length > 1 && !forbiddenMap[file]) {
      warnings.push({
        type:    'shared-authorization',
        severity: 'warning',
        file,
        specs:   authSpecs.map(rel(projectRoot)),
        message: `"${file}" is authorized in ${authSpecs.length} specs simultaneously.`,
        fix:     'Ensure these specs do not produce contradictory mutations to this file.',
      });
    }
  }

  const data = {
    specs_checked: parsed.length,
    collisions:    collisions.length,
    warnings:      warnings.length,
  };

  return {
    ok:         collisions.length === 0,
    collisions,
    warnings,
    data,
  };
}

/** Walk a directory recursively and collect .logic files. */
function walkLogic(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkLogic(full));
    else if (entry.name.endsWith('.logic')) results.push(full);
  }
  return results;
}

/**
 * Build a map of { filePath → [specFilePath, ...] } from a YAML list field in
 * TARGET_BOUNDARIES (e.g. authorized_files or forbidden_files).
 */
function buildFileMap(parsedSpecs, fieldName) {
  const map = {};
  for (const p of parsedSpecs) {
    const boundaries = p.sections['TARGET_BOUNDARIES'] || '';
    const fileList = extractYamlList(boundaries, fieldName);
    for (const file of fileList) {
      if (!map[file]) map[file] = [];
      map[file].push(p.filePath);
    }
  }
  return map;
}

/**
 * Extract a YAML list value from a text block.
 * Handles both inline and block list styles:
 *   authorized_files: [a, b]
 *   authorized_files:
 *     - a
 *     - b
 */
function extractYamlList(text, key) {
  const items = [];

  // Block list style: key:\n  - item
  const blockRegex = new RegExp(`${key}:\\s*\\n((?:\\s+-\\s+.+\\n?)+)`, 'i');
  const blockMatch = text.match(blockRegex);
  if (blockMatch) {
    const lines = blockMatch[1].split('\n');
    for (const line of lines) {
      const m = line.match(/^\s+-\s+(.+)/);
      if (m) items.push(m[1].trim());
    }
    return items;
  }

  // Inline list style: key: [a, b, c]
  const inlineRegex = new RegExp(`${key}:\\s*\\[([^\\]]+)\\]`, 'i');
  const inlineMatch = text.match(inlineRegex);
  if (inlineMatch) {
    return inlineMatch[1].split(',').map(s => s.trim()).filter(Boolean);
  }

  return items;
}

/** Return a function that makes a path relative to projectRoot. */
function rel(projectRoot) {
  return f => path.relative(projectRoot, f);
}

/**
 * Format validate output for the terminal.
 */
function formatValidate(result, flags = {}) {
  if (flags.json) {
    return JSON.stringify({
      ok:         result.ok,
      data:       result.data,
      collisions: result.collisions,
      warnings:   result.warnings,
    }, null, 2);
  }

  const C = flags.plain ? {
    bold: '', reset: '', green: '', yellow: '', red: '', cyan: '', dim: '',
  } : {
    bold:   '\x1b[1m',
    reset:  '\x1b[0m',
    green:  '\x1b[32m',
    yellow: '\x1b[33m',
    red:    '\x1b[31m',
    cyan:   '\x1b[36m',
    dim:    '\x1b[2m',
  };

  const tick  = flags.plain ? '[ok]'   : `${C.green}✓${C.reset}`;
  const warn  = flags.plain ? '[warn]' : `${C.yellow}⚠${C.reset}`;
  const cross = flags.plain ? '[!]'    : `${C.red}✗${C.reset}`;

  const lines = [];
  lines.push('');
  lines.push(`${C.bold}LSD FORGE — Cross-Spec Validation${C.reset}`);
  lines.push(`${C.dim}${result.data.specs_checked} spec(s) checked${C.reset}`);
  lines.push('');

  if (result.collisions.length === 0 && result.warnings.length === 0) {
    lines.push(`${tick}  ${C.bold}No collisions detected${C.reset}`);
    lines.push('');
    return lines.join('\n');
  }

  if (result.collisions.length > 0) {
    lines.push(`${C.bold}Collisions (errors)${C.reset}  — must be resolved before compile`);
    for (const c of result.collisions) {
      lines.push('');
      lines.push(`  ${cross}  ${C.red}${c.type}${C.reset}  ${c.message}`);
      if (c.authorized_in) {
        lines.push(`       Authorised in : ${c.authorized_in.join(', ')}`);
        lines.push(`       Forbidden in  : ${c.forbidden_in.join(', ')}`);
      }
      lines.push(`       ${C.cyan}Fix: ${c.fix}${C.reset}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push(`${C.bold}Warnings${C.reset}  — review recommended`);
    for (const w of result.warnings) {
      lines.push('');
      lines.push(`  ${warn}  ${C.yellow}${w.type}${C.reset}  ${w.message}`);
      if (w.specs) {
        lines.push(`       Specs: ${w.specs.join(', ')}`);
      }
      lines.push(`       ${C.cyan}Fix: ${w.fix}${C.reset}`);
    }
  }

  lines.push('');
  lines.push(`──────────────────────────────────────────────────`);
  const errLabel  = result.collisions.length > 0
    ? `${C.red}${result.collisions.length} collision(s)${C.reset}`
    : `${C.green}0 collisions${C.reset}`;
  const warnLabel = result.warnings.length > 0
    ? `${C.yellow}${result.warnings.length} warning(s)${C.reset}`
    : `0 warnings`;
  lines.push(`${errLabel}  ${warnLabel}`);
  lines.push('');

  return lines.join('\n');
}

module.exports = { validate, formatValidate };
