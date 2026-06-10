'use strict';

const fs   = require('fs');
const path = require('path');
const { lintDir } = require('../linter/index');

/**
 * forge coverage — gap report between registry services and existing specs.
 * Returns a structured coverage object and a formatted terminal report.
 * @param {string} projectRoot
 * @param {{ plain, json, threshold }} flags
 * @returns {{ ok, data, belowThreshold, error }}
 */
function coverage(projectRoot, flags = {}) {
  const lsdDir       = path.join(projectRoot, '.lsd');
  const configPath   = path.join(lsdDir, 'config.json');
  const registryPath = path.join(lsdDir, 'registry.json');

  if (!fs.existsSync(configPath)) {
    return { ok: false, error: 'LSD FORGE not initialised. Run: forge init' };
  }

  let config   = {};
  let registry = {};

  try { config   = JSON.parse(fs.readFileSync(configPath,   'utf8')); } catch (e) {
    return { ok: false, error: `Cannot read config.json: ${e.message}` };
  }
  try { registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')); } catch (_) {}

  const specsDir = path.join(projectRoot, config.specs_dir || 'specs');
  let lintResults = [];
  if (fs.existsSync(specsDir)) {
    try { lintResults = lintDir(specsDir, { recursive: true }); } catch (_) {}
  }

  const services = registry.services || {};
  const serviceKeys = Object.keys(services);

  // For each service, determine coverage status
  const specContents = lintResults.map(r => {
    try { return fs.readFileSync(r.filePath, 'utf8'); } catch (_) { return ''; }
  });

  const serviceReport = serviceKeys.map(key => {
    const svc = services[key];
    const coveredBy = lintResults
      .filter((_, i) => svc.config && specContents[i].includes(svc.config))
      .map(r => path.relative(projectRoot, r.filePath));

    return {
      key,
      type:       svc.type       || 'unknown',
      config:     svc.config     || null,
      authorized: svc.authorized !== false,
      covered:    coveredBy.length > 0,
      covered_by: coveredBy,
    };
  });

  const covered   = serviceReport.filter(s => s.covered).length;
  const uncovered = serviceReport.filter(s => !s.covered).length;
  const pct       = serviceKeys.length > 0
    ? Math.round((covered / serviceKeys.length) * 100)
    : 100;

  const threshold      = flags.threshold != null ? flags.threshold : 0;
  const belowThreshold = pct < threshold;

  // Spec health summary
  const passingSpecs = lintResults.filter(r => r.passed).length;
  const failingSpecs = lintResults.filter(r => !r.passed || r.parseError).length;

  const data = {
    project:          config.project_name || path.basename(projectRoot),
    coverage_pct:     pct,
    threshold,
    below_threshold:  belowThreshold,
    services: {
      total:    serviceKeys.length,
      covered,
      uncovered,
    },
    specs: {
      total:   lintResults.length,
      passing: passingSpecs,
      failing: failingSpecs,
    },
    report: serviceReport,
    gaps: serviceReport.filter(s => !s.covered),
  };

  return { ok: true, data, belowThreshold };
}

/**
 * Format coverage output for the terminal.
 */
function formatCoverage(data, flags = {}) {
  if (flags.json) return JSON.stringify(data, null, 2);

  const C = flags.plain ? {
    bold: '', reset: '', green: '', yellow: '', red: '', cyan: '', dim: '', magenta: '',
  } : {
    bold:    '\x1b[1m',
    reset:   '\x1b[0m',
    green:   '\x1b[32m',
    yellow:  '\x1b[33m',
    red:     '\x1b[31m',
    cyan:    '\x1b[36m',
    dim:     '\x1b[2m',
    magenta: '\x1b[35m',
  };

  const tick  = flags.plain ? '[ok]'   : `${C.green}✓${C.reset}`;
  const warn  = flags.plain ? '[warn]' : `${C.yellow}⚠${C.reset}`;
  const cross = flags.plain ? '[!]'    : `${C.red}✗${C.reset}`;

  const bar = coverageBar(data.coverage_pct, flags.plain, C);

  const lines = [];
  lines.push('');
  lines.push(`${C.bold}LSD FORGE — Spec Coverage${C.reset}  ${C.dim}${data.project}${C.reset}`);
  lines.push('');
  lines.push(`  ${bar}  ${C.bold}${data.coverage_pct}%${C.reset} of services specced`);

  if (data.threshold > 0) {
    const threshMark = data.below_threshold ? cross : tick;
    lines.push(`  ${threshMark}  Threshold: ${data.threshold}%  ${data.below_threshold ? C.red + 'BELOW' + C.reset : C.green + 'MET' + C.reset}`);
  }

  lines.push('');
  lines.push(`${C.bold}Services${C.reset}`);
  lines.push(`  Total      ${data.services.total}`);
  lines.push(`  ${tick}  Covered    ${data.services.covered}`);

  if (data.services.uncovered > 0) {
    lines.push(`  ${cross}  Uncovered  ${data.services.uncovered}`);
  } else {
    lines.push(`  ${tick}  Uncovered  0`);
  }

  lines.push('');
  lines.push(`${C.bold}Spec files${C.reset}`);
  lines.push(`  Total    ${data.specs.total}`);
  lines.push(`  ${tick}  Passing  ${data.specs.passing}`);
  if (data.specs.failing > 0) {
    lines.push(`  ${cross}  Failing  ${data.specs.failing}  ${C.dim}(run forge lint for details)${C.reset}`);
  }

  if (data.gaps.length > 0) {
    lines.push('');
    lines.push(`${C.bold}Coverage gaps${C.reset}  ${C.dim}(no spec references this service)${C.reset}`);
    for (const gap of data.gaps) {
      const authLabel = gap.authorized ? '' : `  ${C.dim}[unauthorised — spec may not be required]${C.reset}`;
      lines.push(`  ${cross}  ${C.cyan}${gap.key}${C.reset}  ${C.dim}${gap.type}  ${gap.config || 'no config path'}${C.reset}${authLabel}`);
    }
    lines.push('');
    lines.push(`  Next step: run the RSC-AR loop on each gap to author a .logic spec.`);
    lines.push(`  See ${C.cyan}.lsd/skills/rsc-ar.md${C.reset} for the authoring workflow.`);
  } else if (data.services.total > 0) {
    lines.push('');
    lines.push(`${tick}  ${C.bold}Full coverage${C.reset} — every service has at least one spec.`);
  } else {
    lines.push('');
    lines.push(`${warn}  Registry is empty. Run the onboarding discovery protocol first.`);
  }

  lines.push('');
  return lines.join('\n');
}

/** Render a simple ASCII coverage bar. */
function coverageBar(pct, plain, C) {
  const width  = 20;
  const filled = Math.round((pct / 100) * width);
  const empty  = width - filled;
  const bar    = '█'.repeat(filled) + '░'.repeat(empty);
  if (plain) return `[${bar}]`;
  const colour = pct >= 80 ? C.green : pct >= 50 ? C.yellow : C.red;
  return `${colour}[${bar}]${C.reset}`;
}

module.exports = { coverage, formatCoverage };
