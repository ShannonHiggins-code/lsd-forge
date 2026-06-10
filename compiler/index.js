'use strict';

const path = require('path');
const { lintFile } = require('../linter/index');
const { parse }    = require('../linter/parser');
const { extract }  = require('./extractor');
const { render }   = require('./template');

/**
 * Compile a single .logic file into an agent payload.
 *
 * @param {string} filePath
 * @param {{ skipLint: boolean }} opts
 * @returns {{
 *   ok: boolean,
 *   filePath: string,
 *   payload: string|null,       — the text block to paste into an agent
 *   structured: object|null,    — the raw extracted data (for MCP router)
 *   lintErrors: Array,
 *   lintWarnings: Array,
 *   error: string|null
 * }}
 */
function compile(filePath, opts = {}) {
  // ── Step 1: Lint gate ─────────────────────────────────────────────────────
  if (!opts.skipLint) {
    const lintResult = lintFile(filePath);

    if (lintResult.parseError) {
      return {
        ok: false, filePath,
        payload: null, structured: null,
        lintErrors: [], lintWarnings: [],
        error: `Parse error: ${lintResult.parseError}`,
      };
    }

    if (lintResult.errors.length > 0) {
      return {
        ok: false, filePath,
        payload: null, structured: null,
        lintErrors:   lintResult.errors,
        lintWarnings: lintResult.warnings,
        error: `Spec has ${lintResult.errors.length} lint error(s). Fix them before compiling.`,
      };
    }

    // Warnings do not block compilation — they are passed through
    const parsed     = parse(filePath);
    const structured = extract(parsed, filePath);
    const payload    = render(structured);

    return {
      ok: true, filePath,
      payload, structured,
      lintErrors:   [],
      lintWarnings: lintResult.warnings,
      error: null,
    };
  }

  // ── skipLint path (testing / advanced use) ────────────────────────────────
  const parsed     = parse(filePath);
  const structured = extract(parsed, filePath);
  const payload    = render(structured);

  return {
    ok: true, filePath,
    payload, structured,
    lintErrors: [], lintWarnings: [],
    error: null,
  };
}

module.exports = { compile };
