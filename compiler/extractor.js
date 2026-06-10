'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * Extract structured arrays from each .logic section.
 * All extractors return plain arrays of strings — no markdown, no bullets.
 */

// Match numbered list items: "1. text" or "1) text"
const NUMBERED = /^\s*\d+[.)]\s+(.+)/;

// Match bullet items: "- text" or "* text"
const BULLET   = /^\s*[-*]\s+(.+)/;

// Match yaml-style key: value under a known key
function extractYamlList(text, key) {
  const keyRegex = new RegExp(`${key}:\\s*\\n((?:[ \\t]*-[ \\t]*.+\\n?)*)`, 'i');
  const match = text.match(keyRegex);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map(l => l.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean);
}

function extractYamlInline(text, key) {
  const keyRegex = new RegExp(`^${key}:\\s*(.+)$`, 'im');
  const match = text.match(keyRegex);
  return match ? match[1].trim() : null;
}

function extractListItems(text) {
  if (!text) return [];
  return text
    .split('\n')
    .map(line => {
      const n = line.match(NUMBERED);
      if (n) return n[1].trim();
      const b = line.match(BULLET);
      if (b) return b[1].trim();
      return null;
    })
    .filter(Boolean);
}

// ── Dependency resolution ─────────────────────────────────────────────────────

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

function findProjectRoot(fromPath) {
  let dir = path.dirname(path.resolve(fromPath));
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.lsd')) ||
        fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.dirname(path.resolve(fromPath));
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

/**
 * Find a spec file by its ID string. Scans the specs directory.
 * Returns the file path or null if not found.
 */
function findSpecById(id, specsDir) {
  const { parse } = require('../linter/parser');
  for (const specFile of walkLogicFiles(specsDir)) {
    try {
      const parsed = parse(specFile);
      if (!parsed.parseError && parsed.meta && parsed.meta.id === id) {
        return specFile;
      }
    } catch (_) {}
  }
  return null;
}

/**
 * Extract the minimal contract fields from a required spec.
 * Used to build the DEPENDENCIES block in compiled payloads.
 */
function extractDependency(specFile) {
  const { parse } = require('../linter/parser');
  try {
    const parsed     = parse(specFile);
    if (parsed.parseError) return null;
    const boundaries = parsed.sections['TARGET_BOUNDARIES'] || '';
    return {
      id:              (parsed.meta && parsed.meta.id)     || '(no id)',
      domain:          (parsed.meta && parsed.meta.domain) || '(no domain)',
      authorized_files: extractYamlList(boundaries, 'authorized_files'),
      forbidden_files:  extractYamlList(boundaries, 'forbidden_files'),
      regression_fence: extractListItems(parsed.sections['REGRESSION_FENCE'] || ''),
    };
  } catch (_) {
    return null;
  }
}

/**
 * Resolve a list of required spec IDs into dependency contract objects.
 */
function resolveDependencies(requires, specsDir) {
  if (!requires || requires.length === 0) return [];
  const deps = [];
  for (const id of requires) {
    const specFile = findSpecById(id, specsDir);
    if (specFile) {
      const dep = extractDependency(specFile);
      if (dep) deps.push(dep);
    }
  }
  return deps;
}

// ── Core extract ──────────────────────────────────────────────────────────────

/**
 * Extract all structured data from parsed sections + meta.
 * Pass filePath to enable dependency resolution via the requires field.
 *
 * @param {object} parsed  — result of parse()
 * @param {string} [filePath] — path to the spec file; enables dependency resolution
 * @returns structured payload object
 */
function extract(parsed, filePath) {
  const { meta, sections } = parsed;
  const boundaries = sections['TARGET_BOUNDARIES'] || '';

  const requires = Array.isArray(meta.requires) ? meta.requires : [];

  // Resolve dependencies if we have a file path to work from
  let dependencies = [];
  if (filePath && requires.length > 0) {
    const projectRoot = findProjectRoot(filePath);
    const specsDir    = resolveSpecsDir(projectRoot);
    dependencies      = resolveDependencies(requires, specsDir);
  }

  return {
    // Front matter
    id:               meta.id      || 'UNKNOWN',
    version:          meta.version || '0.0.0',
    domain:           meta.domain  || 'unknown',
    requires,
    owner:            meta.owner   || null,
    validated_against: meta.validated_against ? String(meta.validated_against) : null,

    // Section 1 — TARGET_BOUNDARIES
    runtime:          extractYamlList(boundaries, 'runtime'),
    data_stores:      extractYamlList(boundaries, 'data_stores'),
    authorized_files: extractYamlList(boundaries, 'authorized_files'),
    forbidden_files:  extractYamlList(boundaries, 'forbidden_files'),

    // Section 2 — INTENT_HAPPY_PATH
    happy_path: extractListItems(sections['INTENT_HAPPY_PATH']),

    // Section 3 — EDGE_CRITICAL_UNHAPPY_PATH
    unhappy_path: extractListItems(sections['EDGE_CRITICAL_UNHAPPY_PATH']),

    // Section 4 — REGRESSION_FENCE
    regression_fence: extractListItems(sections['REGRESSION_FENCE']),

    // Section 5 — CONTEXT_DEBT_NOTE (kept as prose — agents need to read this)
    context_debt: (sections['CONTEXT_DEBT_NOTE'] || '').trim(),

    // Resolved dependency contracts
    dependencies,
  };
}

module.exports = { extract, extractYamlList, extractListItems };
