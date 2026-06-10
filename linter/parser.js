'use strict';

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const REQUIRED_SECTIONS = [
  'TARGET_BOUNDARIES',
  'INTENT_HAPPY_PATH',
  'EDGE_CRITICAL_UNHAPPY_PATH',
  'REGRESSION_FENCE',
  'CONTEXT_DEBT_NOTE',
];

/**
 * Parse a .logic file into a structured object.
 * @param {string} filePath
 * @returns {{ meta: object, sections: object, raw: string, filePath: string, parseError: string|null }}
 */
function parse(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { meta: {}, sections: {}, raw: '', filePath, parseError: `Cannot read file: ${err.message}` };
  }

  let meta = {};
  let body = raw;

  try {
    const parsed = matter(raw);
    meta = parsed.data || {};
    body = parsed.content || '';
  } catch (err) {
    return { meta: {}, sections: {}, raw, filePath, parseError: `Front matter parse error: ${err.message}` };
  }

  const sections = extractSections(body);

  return { meta, sections, raw, filePath, parseError: null };
}

/**
 * Extract named sections from the markdown body.
 * Sections are identified by ## headings containing the section keyword.
 */
function extractSections(body) {
  const result = {};

  // Match ## N. SECTION_NAME or ## SECTION_NAME headings
  const headingRegex = /^##\s+(?:\d+\.\s+)?([A-Z_]+(?:\/[A-Z_]+)*)/gm;
  const matches = [];
  let match;

  while ((match = headingRegex.exec(body)) !== null) {
    matches.push({ name: match[1], index: match.index, end: match.index + match[0].length });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].end;
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length;
    const content = body.slice(start, end).trim();
    result[matches[i].name] = content;
  }

  return result;
}

/**
 * Count numbered list items in a text block.
 */
function countNumberedSteps(text) {
  if (!text) return 0;
  const matches = text.match(/^\s*\d+\.\s+\S/gm);
  return matches ? matches.length : 0;
}

/**
 * Count bullet or numbered items in a text block.
 */
function countListItems(text) {
  if (!text) return 0;
  const matches = text.match(/^\s*[-*\d]+[.)]\s+\S/gm);
  return matches ? matches.length : 0;
}

module.exports = { parse, REQUIRED_SECTIONS, countNumberedSteps, countListItems };
