'use strict';

/**
 * Hard block: a file path cannot appear in both authorized_files and forbidden_files.
 */
function check(parsed) {
  const { sections } = parsed;
  const boundaries = sections['TARGET_BOUNDARIES'] || '';

  const authorized = extractPaths(boundaries, 'authorized_files');
  const forbidden  = extractPaths(boundaries, 'forbidden_files');

  if (authorized.length === 0 || forbidden.length === 0) return [];

  const overlapping = authorized.filter(a =>
    forbidden.some(f => normalise(a) === normalise(f))
  );

  return overlapping.map(path => ({
    rule: 'forbidden-overlap',
    severity: 'error',
    section: 'TARGET_BOUNDARIES',
    message: `"${path}" appears in both authorized_files and forbidden_files.`,
    fix: `Remove "${path}" from one of the two lists. If the file must be protected, keep it in forbidden_files only.`,
  }));
}

/**
 * Extract file paths listed under a given yaml-ish key in the section text.
 * Handles both yaml list format (- path) and inline format.
 */
function extractPaths(text, key) {
  const keyRegex = new RegExp(`${key}:\\s*\\n((?:\\s*-\\s*.+\\n?)*)`, 'i');
  const match = text.match(keyRegex);
  if (!match) return [];

  return match[1]
    .split('\n')
    .map(line => line.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean);
}

function normalise(p) {
  return p.replace(/\*\*/g, '*').toLowerCase();
}

module.exports = { check };
