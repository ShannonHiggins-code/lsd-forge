'use strict';

const fs   = require('fs');
const path = require('path');
const { parse } = require('../linter/parser');

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function extractAuthorizedFiles(sections) {
  const boundaries = (sections && sections.TARGET_BOUNDARIES) || '';
  const authBlock  = boundaries.match(/authorized_files:([\s\S]*?)(?=forbidden_files:|$)/)?.[1] || '';
  return authBlock.split('\n')
    .map(l => l.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean);
}

function norm(p) { return p.replace(/\\/g, '/'); }

function fileMatchesAuth(stagedFile, authEntry) {
  const s = norm(stagedFile);
  const a = norm(authEntry).replace(/\/$/, '');

  // Wildcard — strip the glob segment and check the prefix
  if (a.includes('*')) {
    const base = a.split('*')[0].replace(/\/$/, '');
    return base.length > 0 && s.startsWith(base);
  }

  return s === a || s.startsWith(a + '/');
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Given a list of file paths, return every spec that authorizes any of them.
 * Results are grouped by spec (not by file) so one result = one spec to re-validate.
 *
 * @param {string}   projectRoot
 * @param {string[]} files  — relative or absolute paths
 * @returns {{ id, domain, specPath, matchedFiles }[]}
 */
function touched(projectRoot, files) {
  if (!files || files.length === 0) return [];

  const specsDir  = resolveSpecsDir(projectRoot);
  const specFiles = walkLogicFiles(specsDir);
  const results   = [];

  for (const specFile of specFiles) {
    try {
      const parsed = parse(specFile);
      if (parsed.parseError) continue;

      const id     = parsed.meta && parsed.meta.id     ? parsed.meta.id     : null;
      const domain = parsed.meta && parsed.meta.domain ? parsed.meta.domain : null;
      if (!id) continue;

      const authFiles    = extractAuthorizedFiles(parsed.sections);
      const matchedFiles = files.filter(f => authFiles.some(a => fileMatchesAuth(f, a)));

      if (matchedFiles.length > 0) {
        results.push({ id, domain, specPath: specFile, matchedFiles });
      }
    } catch (_) {}
  }

  return results;
}

// ── Output ────────────────────────────────────────────────────────────────────

function formatTouched(results, flags) {
  if (results.length === 0) return '';

  const plain = !!(flags && flags.plain);
  const C = plain
    ? { w:'', b:'', x:'', d:'' }
    : { w:'\x1b[33m', b:'\x1b[1m', x:'\x1b[0m', d:'\x1b[2m' };

  const lines = [];
  for (const { id, domain, specPath, matchedFiles } of results) {
    const rel = path.relative(process.cwd(), specPath).replace(/\\/g, '/');
    lines.push(
      `${C.w}⚠${C.x}  ${C.b}${id}${C.x}  ${C.d}${domain}${C.x}\n` +
      `   File${matchedFiles.length > 1 ? 's' : ''}:  ${matchedFiles.join(', ')}\n` +
      `   Spec:   ${rel}\n` +
      `   Action: forge lint ${rel}`
    );
  }

  lines.push(
    `\n${results.length} spec${results.length !== 1 ? 's' : ''} may need re-validation.` +
    (plain ? '' : ' Run \x1b[1mforge lint <spec>\x1b[0m to check.')
  );

  return lines.join('\n\n');
}

module.exports = { touched, formatTouched };
