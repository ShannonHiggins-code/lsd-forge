'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * forge status — show registry health, spec baseline, and unspecced services.
 * @param {string} projectRoot
 * @param {{ plain, json }} flags
 * @returns {{ ok, data, error }}
 */
function status(projectRoot, flags = {}) {
  const lsdDir      = path.join(projectRoot, '.lsd');
  const configPath  = path.join(lsdDir, 'config.json');
  const registryPath = path.join(lsdDir, 'registry.json');

  if (!fs.existsSync(configPath)) {
    return { ok: false, error: 'LSD FORGE not initialised. Run: forge init' };
  }

  let config = {};
  let registry = {};

  try { config   = JSON.parse(fs.readFileSync(configPath,   'utf8')); } catch (e) {
    return { ok: false, error: `Cannot read config.json: ${e.message}` };
  }
  try { registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')); } catch (_) {}

  // ── Spec count ───────────────────────────────────────────────────────────────

  const specsDir = path.join(projectRoot, config.specs_dir || 'specs');
  let specFiles = [];
  if (fs.existsSync(specsDir)) {
    specFiles = walkLogic(specsDir);
  }

  // ── Registry health ──────────────────────────────────────────────────────────

  const discovered    = !!registry.discovered_at;
  const serviceCount  = Object.keys(registry.services || {}).length;
  const authorised    = Object.values(registry.services || {}).filter(s => s.authorized).length;
  const unauthorised  = serviceCount - authorised;
  const staleSpecs    = (registry.stale_specs || []);

  // Services with no spec file referencing their config path
  const unspecced = findUnspeededServices(registry.services || {}, specFiles, projectRoot);

  const data = {
    initialised:     true,
    project:         config.project_name || path.basename(projectRoot),
    version:         config.lsd_version  || 'unknown',
    discovered:      discovered,
    discovered_at:   registry.discovered_at || null,
    verify_command:  config.verify_command  || 'unknown',
    specs: {
      total:   specFiles.length,
      stale:   staleSpecs.length,
    },
    services: {
      total:       serviceCount,
      authorised,
      unauthorised,
      unspecced:   unspecced.length,
    },
    gaps: unspecced,
    posture_files: (config.posture || []).length,
  };

  return { ok: true, data };
}

/** Recursively collect .logic files under a directory. */
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
 * Find services in the registry that have no .logic spec referencing their config path.
 * A service is considered "specced" if any .logic file's raw text contains its config path.
 */
function findUnspeededServices(services, specFiles, projectRoot) {
  const specContents = specFiles.map(f => {
    try { return fs.readFileSync(f, 'utf8'); } catch (_) { return ''; }
  });

  return Object.entries(services)
    .filter(([, svc]) => {
      if (!svc.config) return false;
      return !specContents.some(content => content.includes(svc.config));
    })
    .map(([key, svc]) => ({ key, type: svc.type, config: svc.config, authorized: svc.authorized }));
}

/**
 * Format status output for the terminal.
 */
function formatStatus(data, flags = {}) {
  if (flags.json) return JSON.stringify(data, null, 2);

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
  lines.push(`${C.bold}LSD FORGE — Project Status${C.reset}`);
  lines.push(`${C.dim}${data.project}  v${data.version}${C.reset}`);
  lines.push('');

  // Discovery
  if (data.discovered) {
    const when = new Date(data.discovered_at).toLocaleDateString();
    lines.push(`${tick}  Registry discovered  ${C.dim}${when}${C.reset}`);
  } else {
    lines.push(`${warn}  Registry not yet discovered — run the onboarding skill`);
  }

  // Specs
  lines.push('');
  lines.push(`${C.bold}Specs${C.reset}`);
  lines.push(`  Total       ${data.specs.total}`);
  if (data.specs.stale > 0) {
    lines.push(`  ${warn}  Stale     ${data.specs.stale}  ${C.dim}(validated_against > 30 days)${C.reset}`);
  } else {
    lines.push(`  ${tick}  Stale     0`);
  }

  // Services
  lines.push('');
  lines.push(`${C.bold}Registry services${C.reset}`);
  lines.push(`  Total         ${data.services.total}`);
  lines.push(`  Authorised    ${data.services.authorised}`);
  lines.push(`  Unauthorised  ${data.services.unauthorised}`);

  if (data.services.unspecced > 0) {
    lines.push(`  ${warn}  Unspecced   ${data.services.unspecced}`);
    for (const gap of data.gaps) {
      const auth = gap.authorized ? '' : ` ${C.dim}[unauthorised]${C.reset}`;
      lines.push(`    ${cross}  ${gap.key}  ${C.dim}${gap.config}${C.reset}${auth}`);
    }
  } else if (data.services.total > 0) {
    lines.push(`  ${tick}  Unspecced   0`);
  }

  // Posture
  lines.push('');
  lines.push(`${C.bold}AI posture files${C.reset}  ${data.posture_files}`);
  lines.push(`${C.bold}Verify command${C.reset}    ${C.cyan}${data.verify_command}${C.reset}`);
  lines.push('');

  // Overall verdict
  const issues = (data.discovered ? 0 : 1) + data.specs.stale + data.services.unspecced;
  if (issues === 0 && data.services.total > 0) {
    lines.push(`${tick}  ${C.bold}All systems nominal${C.reset}`);
  } else if (!data.discovered) {
    lines.push(`${warn}  Run the onboarding discovery protocol to complete Phase 1`);
  } else if (data.services.unspecced > 0) {
    lines.push(`${warn}  Run ${C.cyan}forge coverage${C.reset} to see the full gap report`);
  }

  lines.push('');
  return lines.join('\n');
}

module.exports = { status, formatStatus };
