'use strict';

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

/**
 * Extract all structured data from parsed sections + meta.
 * Returns a clean payload object.
 */
function extract(parsed) {
  const { meta, sections } = parsed;
  const boundaries = sections['TARGET_BOUNDARIES'] || '';

  return {
    // Front matter
    id:               meta.id      || 'UNKNOWN',
    version:          meta.version || '0.0.0',
    domain:           meta.domain  || 'unknown',
    requires:         Array.isArray(meta.requires) ? meta.requires : [],
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
  };
}

module.exports = { extract, extractYamlList, extractListItems };
