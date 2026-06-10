'use strict';

/**
 * Render a structured payload object into the agent context block.
 * This is what gets pasted into Cursor, Claude Code, or any AI agent.
 *
 * Design goals:
 *  - Zero markdown headers (agents waste tokens processing them)
 *  - Every constraint on its own line, prefixed with a sigil
 *  - Explicit MUST NOT lines — the single highest-value thing this tool provides
 *  - Compact but human-readable — a developer should be able to scan it
 */
function render(payload) {
  const lines = [];

  // ── Header ─────────────────────────────────────────────────────────────────
  lines.push(`[LOGICSPEC ${payload.id} v${payload.version}]`);
  lines.push(`DOMAIN: ${payload.domain}`);

  if (payload.requires.length > 0) {
    lines.push(`DEPENDS ON: ${payload.requires.join(', ')}`);
  }

  lines.push('');

  // ── Scope fence ────────────────────────────────────────────────────────────
  lines.push('── SCOPE ──────────────────────────────────────');

  if (payload.runtime.length > 0) {
    payload.runtime.forEach(r => lines.push(`RUNTIME      ${r}`));
  }

  if (payload.data_stores.length > 0) {
    payload.data_stores.forEach(d => lines.push(`DATA STORE   ${d}`));
  }

  if (payload.authorized_files.length > 0) {
    lines.push('');
    lines.push('You MAY read or modify:');
    payload.authorized_files.forEach(f => lines.push(`  + ${f}`));
  }

  if (payload.forbidden_files.length > 0) {
    lines.push('');
    lines.push('You MUST NOT touch under any circumstance:');
    payload.forbidden_files.forEach(f => lines.push(`  ✗ ${f}`));
  }

  lines.push('');

  // ── Happy path ─────────────────────────────────────────────────────────────
  lines.push('── REQUIRED BEHAVIOUR (happy path) ────────────');
  payload.happy_path.forEach((step, i) => {
    lines.push(`${String(i + 1).padStart(2, ' ')}. ${step}`);
  });

  lines.push('');

  // ── Unhappy path ───────────────────────────────────────────────────────────
  lines.push('── REQUIRED FAILURE HANDLING ───────────────────');
  if (payload.unhappy_path.length > 0) {
    payload.unhappy_path.forEach((step, i) => {
      lines.push(`${String(i + 1).padStart(2, ' ')}. ${step}`);
    });
  } else {
    lines.push('  (none specified — treat all failures as fatal errors)');
  }

  lines.push('');

  // ── Regression fence ───────────────────────────────────────────────────────
  if (payload.regression_fence.length > 0) {
    const meaningful = payload.regression_fence.filter(r =>
      !r.toLowerCase().includes('no dependencies') &&
      !r.toLowerCase().includes('no preservation') &&
      r.trim().length > 5
    );

    if (meaningful.length > 0) {
      lines.push('── MUST NOT BREAK (regression fence) ──────────');
      meaningful.forEach(rule => lines.push(`  ! ${rule}`));
      lines.push('');
    }
  }

  // ── Context debt ───────────────────────────────────────────────────────────
  if (payload.context_debt && payload.context_debt.length > 10) {
    lines.push('── ARCHITECTURAL CONTEXT ───────────────────────');
    // Wrap long prose into readable lines but keep it verbatim
    payload.context_debt
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .forEach(l => lines.push(`  ${l}`));
    lines.push('');
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  lines.push(`── END LOGICSPEC ${payload.id} ─────────────────`);

  return lines.join('\n');
}

module.exports = { render };
