'use strict';

const fs   = require('fs');
const path = require('path');
const { parse } = require('./parser');

// Load all rules from the rules/ directory automatically
const RULES = fs
  .readdirSync(path.join(__dirname, 'rules'))
  .filter(f => f.endsWith('.js'))
  .sort()
  .map(f => require(path.join(__dirname, 'rules', f)));

/**
 * Lint a single .logic file.
 * @param {string} filePath
 * @returns {{ filePath, meta, errors, warnings, passed, parseError }}
 */
function lintFile(filePath) {
  const parsed = parse(filePath);

  if (parsed.parseError) {
    return {
      filePath,
      meta: {},
      errors:   [],
      warnings: [],
      passed:   false,
      parseError: parsed.parseError,
    };
  }

  const errors   = [];
  const warnings = [];

  for (const rule of RULES) {
    const findings = rule.check(parsed);
    for (const finding of findings) {
      if (finding.severity === 'error') {
        errors.push(finding);
      } else {
        warnings.push(finding);
      }
    }
  }

  return {
    filePath,
    meta:     parsed.meta,
    errors,
    warnings,
    passed:   errors.length === 0,
    parseError: null,
  };
}

/**
 * Lint all .logic files in a directory (non-recursive by default).
 * @param {string} dir
 * @param {{ recursive }} opts
 * @returns {Array}
 */
function lintDir(dir, opts = {}) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory not found: ${dir}`);
  }

  const files = fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.logic'))
    .map(f => path.join(dir, f));

  if (opts.recursive) {
    const subdirs = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => path.join(dir, e.name));

    for (const sub of subdirs) {
      files.push(...lintDir(sub, opts).map(r => r.filePath));
    }
  }

  return files.map(f => lintFile(f));
}

module.exports = { lintFile, lintDir };
