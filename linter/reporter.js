'use strict';

const path = require('path');

// ANSI colour codes — only applied when plain=false
const CLR = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
  gray:   '\x1b[90m',
};

const ICONS = {
  pass:    '✓',
  error:   '✗',
  warning: '⚠',
  info:    '→',
};

function c(plain, colorCode, text) {
  return plain ? text : `${colorCode}${text}${CLR.reset}`;
}

/**
 * Format a single file result for terminal output.
 * @param {{ filePath, errors, warnings, passed }} result
 * @param {{ plain, verbose }} opts
 */
function formatFile(result, opts = {}) {
  const { plain = false } = opts;
  const lines = [];
  const shortPath = path.relative(process.cwd(), result.filePath);

  if (result.parseError) {
    lines.push(c(plain, CLR.red + CLR.bold, `${ICONS.error} ${shortPath}`));
    lines.push(c(plain, CLR.red, `  Parse error: ${result.parseError}`));
    return lines.join('\n');
  }

  const status = result.passed
    ? c(plain, CLR.green + CLR.bold, `${ICONS.pass} ${shortPath}`)
    : result.errors.length > 0
      ? c(plain, CLR.red + CLR.bold, `${ICONS.error} ${shortPath}`)
      : c(plain, CLR.yellow + CLR.bold, `${ICONS.warning} ${shortPath}`);

  lines.push(status);

  // Show spec id and domain from meta if available
  if (result.meta && result.meta.id) {
    const domain = result.meta.domain ? `  ${c(plain, CLR.gray, result.meta.domain)}` : '';
    lines.push(`  ${c(plain, CLR.dim, result.meta.id)}${domain}`);
  }

  for (const err of result.errors) {
    lines.push('');
    lines.push(`  ${c(plain, CLR.red, `${ICONS.error} [error]`)} ${c(plain, CLR.white, err.message)}`);
    lines.push(`  ${c(plain, CLR.gray, `  Rule:    ${err.rule}`)}`);
    lines.push(`  ${c(plain, CLR.gray, `  Section: ${err.section}`)}`);
    lines.push(`  ${c(plain, CLR.cyan, `  Fix:     ${err.fix}`)}`);
  }

  for (const warn of result.warnings) {
    lines.push('');
    lines.push(`  ${c(plain, CLR.yellow, `${ICONS.warning} [warning]`)} ${c(plain, CLR.white, warn.message)}`);
    lines.push(`  ${c(plain, CLR.gray, `  Rule:    ${warn.rule}`)}`);
    lines.push(`  ${c(plain, CLR.gray, `  Section: ${warn.section}`)}`);
    lines.push(`  ${c(plain, CLR.cyan, `  Fix:     ${warn.fix}`)}`);
  }

  if (result.passed && result.warnings.length === 0) {
    lines.push(`  ${c(plain, CLR.dim, 'All checks passed')}`);
  }

  return lines.join('\n');
}

/**
 * Format the summary line across all files.
 */
function formatSummary(results, opts = {}) {
  const { plain = false, strict = false } = opts;
  const total    = results.length;
  const errored  = results.filter(r => r.errors.length > 0 || r.parseError).length;
  const warned    = results.filter(r => r.warnings.length > 0 && r.errors.length === 0 && !r.parseError).length;
  const passed   = results.filter(r => r.passed && r.warnings.length === 0).length;

  const lines = [''];
  lines.push(c(plain, CLR.bold, '─'.repeat(50)));

  const parts = [];
  if (errored > 0)  parts.push(c(plain, CLR.red,    `${errored} error(s)`));
  if (warned > 0)   parts.push(c(plain, CLR.yellow,  `${warned} warning(s)`));
  if (passed > 0)   parts.push(c(plain, CLR.green,   `${passed} passed`));

  lines.push(`${total} spec(s) checked — ${parts.join(', ')}`);

  if (strict && warned > 0) {
    lines.push(c(plain, CLR.yellow, `${ICONS.warning} Strict mode: warnings treated as errors`));
  }

  if (errored === 0 && (!strict || warned === 0)) {
    lines.push(c(plain, CLR.green, `${ICONS.pass} Ready to compile`));
  } else {
    lines.push(c(plain, CLR.red, `${ICONS.error} Fix errors before compiling`));
  }

  return lines.join('\n');
}

/**
 * Format all results as JSON (for CI/CD pipelines).
 */
function formatJSON(results) {
  return JSON.stringify(
    results.map(r => ({
      file:     r.filePath,
      id:       r.meta?.id || null,
      domain:   r.meta?.domain || null,
      passed:   r.passed,
      errors:   r.errors,
      warnings: r.warnings,
      parseError: r.parseError || null,
    })),
    null, 2
  );
}

module.exports = { formatFile, formatSummary, formatJSON };
